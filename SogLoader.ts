import { GLSL3, UnsignedByteType, UnsignedIntType, Vector3 } from 'three';
import { RGBAFormat, RGBAIntegerFormat } from 'three';
import type { RawShaderMaterial, Texture } from 'three';
import { fboHelper } from './core/fboHelper';
import { sogCombineFrag, sogCombineShNFrag } from './glsl';

export interface SogMeta {
  count?: number;
  vertex_count?: number;
  means: { mins: number[]; maxs: number[] };
  scales: { codebook: number[] };
  sh0: { codebook: number[] };
  shN?: { codebook: number[]; bands: number };
}

export interface SogContent {
  meta: SogMeta;
  centers: Float32Array;
  splatTexture: Texture;
  sh0Texture: Texture;
  shNTexture?: Texture;
}

let sogCombineMaterial: RawShaderMaterial | null = null;
let sogCombineSHMaterial: RawShaderMaterial | null = null;

const unlog = (n: number): number => Math.sign(n) * (Math.exp(Math.abs(n)) - 1);

interface ParsedZip {
  meta: Uint8Array | null;
  files: Record<string, Uint8Array>;
}

// Source SogItem.parseUncompressedZip (pretty 29932-29971).
function parseUncompressedZip(buffer: ArrayBuffer): ParsedZip {
  const view = new DataView(buffer);
  const byteLength = buffer.byteLength;
  const result: ParsedZip = { meta: null, files: {} };
  const decoder = new TextDecoder();
  let eocd = -1;
  const scanLimit = Math.min(byteLength - 22, 65535);
  for (let i = 0; i < scanLimit; i++) {
    const offset = byteLength - 22 - i;
    if (view.getUint32(offset, true) === 101010256) {
      eocd = offset;
      break;
    }
  }
  if (eocd === -1) throw new Error('Invalid ZIP: No EOCD found');
  const entryCount = view.getUint16(eocd + 8, true);
  let cursor = view.getUint32(eocd + 16, true);
  for (let i = 0; i < entryCount && view.getUint32(cursor, true) === 33639248; i++) {
    const method = view.getUint16(cursor + 10, true);
    const size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const nameBytes = new Uint8Array(buffer, cursor + 46, nameLength);
    let name = decoder.decode(nameBytes);
    if (method === 0) {
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const data = new Uint8Array(buffer, dataOffset, size);
      if (name === 'meta.json' || name === 'info.json') {
        result.meta = data;
      } else {
        name = name.substring(0, name.lastIndexOf('.'));
        result.files[name] = data;
      }
    } else {
      console.warn(`Skipping ${name}: Compressed (Method ${method})`);
    }
    cursor += 46 + nameLength + commentLength + extraLength;
  }
  return result;
}

async function toImageBitmap(data: Uint8Array): Promise<ImageBitmap> {
  const blob = new Blob([data as BlobPart]);
  return await createImageBitmap(blob, {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
}

export async function parseSog(buffer: ArrayBuffer): Promise<SogContent> {
  const zip = parseUncompressedZip(buffer);
  const meta = JSON.parse(new TextDecoder().decode(zip.meta!)) as SogMeta;
  if (!sogCombineMaterial) {
    sogCombineMaterial = fboHelper.createRawShaderMaterial({
      uniforms: {
        u_meansLTexture: { value: null },
        u_meansUTexture: { value: null },
        u_quatsTexture: { value: null },
        u_scalesTexture: { value: null },
        u_sh0Texture: { value: null },
        u_scalesCodebook: { value: null },
        u_sh0Codebook: { value: null },
        u_splatCount: { value: 0 },
        u_meansMin: { value: new Vector3() },
        u_meansMax: { value: new Vector3() },
        u_shNLabelsTexture: { value: null },
      },
      vertexShaderPrefix: fboHelper.vertexPrefix,
      fragmentShaderPrefix: fboHelper.precisionPrefix2,
      fragmentShader: sogCombineFrag,
      glslVersion: GLSL3,
    });
  }
  if (!sogCombineSHMaterial) {
    sogCombineSHMaterial = fboHelper.createRawShaderMaterial({
      uniforms: {
        u_shNCentroidsTexture: { value: null },
        u_shNCodebook: { value: null },
      },
      vertexShaderPrefix: fboHelper.vertexPrefix,
      fragmentShaderPrefix: fboHelper.precisionPrefix2,
      fragmentShader: sogCombineShNFrag,
      glslVersion: GLSL3,
    });
  }
  const count = (meta.count || meta.vertex_count)!;
  const names = Object.keys(zip.files);
  const bitmaps = await Promise.all(names.map((name) => toImageBitmap(zip.files[name])));
  const images = bitmaps.reduce<Record<string, ImageBitmap>>((acc, bitmap, i) => {
    acc[names[i]] = bitmap;
    return acc;
  }, {});
  const u = sogCombineMaterial.uniforms;
  const width = images.means_l.width;
  const height = images.means_l.height;
  u.u_meansLTexture.value = fboHelper.createDataTexture(images.means_l, width, height, false, true);
  u.u_meansUTexture.value = fboHelper.createDataTexture(images.means_u, width, height, false, true);
  u.u_quatsTexture.value = fboHelper.createDataTexture(images.quats, width, height, false, true);
  u.u_scalesTexture.value = fboHelper.createDataTexture(images.scales, width, height, false, true);
  u.u_sh0Texture.value = fboHelper.createDataTexture(images.sh0, width, height, false, true);
  u.u_scalesCodebook.value = meta.scales.codebook;
  u.u_sh0Codebook.value = meta.sh0.codebook;
  u.u_splatCount.value = count;
  const combineRT = fboHelper.createRenderTarget(width, height, true, false, 0, 2);
  combineRT.textures[0].type = UnsignedIntType;
  combineRT.textures[0].format = RGBAIntegerFormat;
  combineRT.textures[0].internalFormat = 'RGBA32UI';
  combineRT.textures[1].type = UnsignedByteType;
  combineRT.textures[1].format = RGBAFormat;
  combineRT.textures[1].internalFormat = 'RGBA8';
  let shNTexture: Texture | undefined;
  if (meta.shN) {
    u.u_shNLabelsTexture.value = fboHelper.createDataTexture(
      images.shN_labels,
      width,
      height,
      false,
      true,
    );
    const shNWidth = images.shN_centroids.width;
    const shNHeight = images.shN_centroids.height;
    sogCombineSHMaterial.uniforms.u_shNCentroidsTexture.value = fboHelper.createDataTexture(
      images.shN_centroids,
      shNWidth,
      shNHeight,
      false,
      true,
    );
    sogCombineSHMaterial.uniforms.u_shNCodebook.value = meta.shN.codebook;
    const shNRT = fboHelper.createRenderTarget(shNWidth, shNHeight, true, false);
    fboHelper.render(sogCombineSHMaterial, shNRT);
    (u.u_shNLabelsTexture.value as Texture).dispose();
    (sogCombineSHMaterial.uniforms.u_shNCentroidsTexture.value as Texture).dispose();
    shNTexture = shNRT.texture;
  }
  fboHelper.render(sogCombineMaterial, combineRT);
  (u.u_meansLTexture.value as Texture).dispose();
  (u.u_meansUTexture.value as Texture).dispose();
  (u.u_quatsTexture.value as Texture).dispose();
  (u.u_scalesTexture.value as Texture).dispose();
  (u.u_sh0Texture.value as Texture).dispose();
  if (meta.shN) (u.u_shNLabelsTexture.value as Texture).dispose();
  let pixels: Uint32Array | null = new Uint32Array(width * height * 4);
  fboHelper.renderer.readRenderTargetPixels(combineRT, 0, 0, width, height, pixels);
  const centers = new Float32Array(count * 3);
  const maxs = meta.means.maxs;
  const mins = meta.means.mins;
  for (let i = 0, c = 0, p = 0; i < count; i++, c += 3, p += 4) {
    const lo = pixels[p];
    const hi = pixels[p + 1];
    const x16 = (((hi >> 24) & 255) << 8) | ((lo >> 24) & 255);
    const y16 = (((hi >> 16) & 255) << 8) | ((lo >> 16) & 255);
    const z16 = (((hi >> 8) & 255) << 8) | ((lo >> 8) & 255);
    const nx = x16 / 65535;
    const ny = y16 / 65535;
    const nz = z16 / 65535;
    centers[c + 0] = unlog(mins[0] + nx * (maxs[0] - mins[0]));
    centers[c + 1] = unlog(mins[1] + ny * (maxs[1] - mins[1]));
    centers[c + 2] = unlog(mins[2] + nz * (maxs[2] - mins[2]));
  }
  pixels = null;
  return {
    meta,
    centers,
    splatTexture: combineRT.textures[0],
    sh0Texture: combineRT.textures[1],
    shNTexture,
  };
}