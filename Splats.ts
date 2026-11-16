import {
  AddEquation,
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  DataTexture,
  GLSL3,
  Matrix4,
  Mesh,
  NearestFilter,
  Object3D,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RedIntegerFormat,
  SrcAlphaFactor,
  UnsignedIntType,
  Vector2,
  Vector3,
  ZeroFactor,
} from 'three';
import type { Camera, IUniform, RawShaderMaterial, Texture, WebGLRenderer } from 'three';
import { fboHelper } from './core/fboHelper';
import { loader } from './core/Loader';
import { properties } from './core/properties';
import { splatsFrag, splatsVert } from './glsl';
import type { SogContent } from './SogLoader';

function WorkerWrapper(options?: { name?: string }): Worker {
  return new Worker('/_astro/SplatsWorker-DSMxtdkh.js', { name: options?.name });
}

const _v0 = new Vector3();

interface SplatsOptions {
  preload?: boolean;
  onLoad?: (splats: Splats) => void;
  extraUniforms?: Record<string, IUniform>;
}

export class Splats extends Object3D {
  mesh: (Mesh & { needsClipping?: boolean }) | null = null;
  focal = new Vector2();
  viewport = new Vector2();
  centers: Float32Array | null = null;
  indexData!: Uint32Array;
  indexTexture!: DataTexture;
  splatTextureSize = new Vector2();
  splatCount = 0;
  splatTexturePixelCount = 0;
  prevSortCamLocalZ = 1e4;
  prevSortCamDir = new Vector3(0, 0, 1);
  opacity = 1;
  uniforms: Record<string, IUniform> = {
    splatIndexTexture: { value: null },
    splatTexture: { value: null },
    splatTextureSize: { value: this.splatTextureSize },
    sh0Texture: { value: null },
    cameraParams: { value: new Vector2() },
    projectionMatrix: { value: new Matrix4() },
    modelViewMatrix: { value: new Matrix4() },
    focal: { value: this.focal },
    viewport: { value: this.viewport },
    means_mins: { value: new Vector3() },
    means_maxs: { value: new Vector3() },
    scales_mins: { value: 0 },
    scales_maxs: { value: 0 },
    sh0_mins: { value: 0 },
    sh0_maxs: { value: 0 },
    shNTexture: { value: null },
    shN_mins: { value: 0 },
    shN_maxs: { value: 0 },
    opacity: { value: 1 },
    colorMultiplier: { value: 1 },
  };
  worker: Worker | null = null;
  sortBuffer: Uint32Array | null = null;
  validCount = 0;
  isSorting = false;
  colorMultiplier = 1;
  isReady = false;
  private options: SplatsOptions;

  constructor(url: string, options: SplatsOptions = {}) {
    super();
    this.options = options;
    if (options.preload === false) {
      loader.load(url, { autoMobile: true, onLoad: (content) => this._onModelLoad(content as SogContent) });
    } else {
      loader.add(url, { autoMobile: true, onLoad: (content) => this._onModelLoad(content as SogContent) });
    }
  }

  private _onWorkerMessage(e: MessageEvent): void {
    const { type, indices, validCount } = e.data as {
      type: string;
      indices: Uint32Array;
      validCount: number;
    };
    if (type === 'SORT_DONE') {
      this.sortBuffer = indices;
      (this.indexTexture.image.data as Uint32Array).set(indices);
      this.indexTexture.needsUpdate = true;
      this.mesh!.geometry.setDrawRange(0, validCount * 6);
      this.mesh!.visible = validCount > 0;
      this.isSorting = false;
    }
  }

  private _onModelLoad(content: SogContent): void {
    this.centers = content.centers;
    const count = (this.splatCount = content.meta.count || content.meta.vertex_count || 0);
    const width = (content.splatTexture as Texture & { image: { width: number } }).image.width;
    const height = (content.splatTexture as Texture & { image: { height: number } }).image.height;
    const pixelCount = (this.splatTexturePixelCount = width * height);
    const geometry = new BufferGeometry();
    const index = new Uint32Array(count * 6);
    for (let i = 0; i < count; i++) {
      const v = i * 4;
      const o = i * 6;
      index[o + 0] = v + 0;
      index[o + 1] = v + 3;
      index[o + 2] = v + 1;
      index[o + 3] = v + 0;
      index[o + 4] = v + 2;
      index[o + 5] = v + 3;
    }
    geometry.setIndex(new BufferAttribute(index, 1));
    this.uniforms.splatTexture.value = content.splatTexture;
    (this.uniforms.splatTextureSize.value as Vector2).set(width, height);
    this.uniforms.sh0Texture.value = content.sh0Texture;
    (this.uniforms.means_mins.value as Vector3).fromArray(content.meta.means.mins);
    (this.uniforms.means_maxs.value as Vector3).fromArray(content.meta.means.maxs);
    this.uniforms.scales_mins.value = content.meta.scales.codebook[0];
    this.uniforms.scales_maxs.value = content.meta.scales.codebook[255];
    this.uniforms.sh0_mins.value = content.meta.sh0.codebook[0];
    this.uniforms.sh0_maxs.value = content.meta.sh0.codebook[255];
    this.indexData = new Uint32Array(pixelCount);
    for (let i = 0; i < count; i++) this.indexData[i] = i;
    const indexTexture = (this.indexTexture = new DataTexture(this.indexData, width, height));
    indexTexture.format = RedIntegerFormat;
    indexTexture.type = UnsignedIntType;
    indexTexture.internalFormat = 'R32UI';
    indexTexture.minFilter = NearestFilter;
    indexTexture.magFilter = NearestFilter;
    indexTexture.needsUpdate = true;
    this.uniforms.splatIndexTexture.value = indexTexture;
    const defines: Record<string, unknown> = {};
    const extraUniforms = this.options.extraUniforms || {};
    this.mesh = new Mesh(
      geometry,
      fboHelper.createRawShaderMaterial({
        uniforms: Object.assign({}, this.uniforms, extraUniforms),
        vertexShaderPrefix: fboHelper.vertexPrefix,
        fragmentShaderPrefix: fboHelper.fragmentPrefix,
        vertexShader: splatsVert,
        fragmentShader: splatsFrag,
        blending: CustomBlending,
        blendEquation: AddEquation,
        blendSrc: SrcAlphaFactor,
        blendDst: OneMinusSrcAlphaFactor,
        blendEquationAlpha: AddEquation,
        blendDstAlpha: OneFactor,
        blendSrcAlpha: ZeroFactor,
        depthTest: false,
        depthWrite: false,
        glslVersion: GLSL3,
        defines,
      }),
    );
    if (content.meta.shN) {
      this.uniforms.shNTexture.value = content.shNTexture;
      this.uniforms.shN_mins.value = content.meta.shN.codebook[0];
      this.uniforms.shN_maxs.value = content.meta.shN.codebook[255];
      ((this.mesh.material as RawShaderMaterial).defines as Record<string, unknown>).SH_COEFFS = [
        3, 8, 15,
      ][content.meta.shN.bands - 1];
    }
    this.mesh.frustumCulled = false;
    this.add(this.mesh);
    this.mesh.onBeforeRender = this.__onBeforeRender.bind(this) as Mesh['onBeforeRender'];
    this.sortBuffer = new Uint32Array(count);
    this.options.onLoad?.(this);
    this.worker = WorkerWrapper();
    this.worker.onmessage = (e: MessageEvent) => {
      const { type } = e.data as { type: string };
      if (type === 'READY') {
        this.isSorting = false;
        this.isReady = true;
        this.worker!.onmessage = this._onWorkerMessage.bind(this);
      }
    };
    this.worker.postMessage({
      type: 'INIT',
      payload: { splatCount: count, positions: this.centers },
    });
  }

  private __onBeforeRender(renderer: WebGLRenderer, _scene: unknown, camera: Camera): void {
    const width = renderer.domElement.width;
    const height = renderer.domElement.height;
    const focalX = ((camera as Camera & { projectionMatrix: Matrix4 }).projectionMatrix.elements[0] * width) / 2;
    const focalY = ((camera as Camera & { projectionMatrix: Matrix4 }).projectionMatrix.elements[5] * height) / 2;
    const cam = camera as Camera & { near: number; far: number };
    (this.uniforms.cameraParams.value as Vector2).set(cam.near, cam.far);
    (this.uniforms.projectionMatrix.value as Matrix4).copy(cam.projectionMatrix);
    this.focal.set(focalX, focalY);
    this.viewport.set(width, height);
  }

  update(_dt: number): void {
    if (!this.mesh) return;
    this.mesh.visible = this.isReady && this.opacity > 0;
    if (this.visible && this.mesh.visible && this.opacity && !this.isSorting && this.sortBuffer && this.isReady) {
      this.uniforms.opacity.value = this.opacity;
      this.uniforms.colorMultiplier.value = this.colorMultiplier;
      this.mesh.modelViewMatrix.multiplyMatrices(
        properties.camera.matrixWorldInverse,
        this.mesh.matrixWorld,
      );
      const e = this.mesh.modelViewMatrix.elements;
      const viewDir = [e[2], e[6], e[10]];
      const translationZ = e[14];
      _v0.fromArray(viewDir).normalize();
      if (
        _v0.dot(this.prevSortCamDir) < 0.99999
        || Math.abs(translationZ - this.prevSortCamLocalZ) > 1e-5
      ) {
        this.prevSortCamDir.copy(_v0);
        this.prevSortCamLocalZ = translationZ;
        this.isSorting = true;
        this.worker!.postMessage(
          {
            type: 'SORT',
            payload: {
              viewDir,
              translationZ,
              nearPlane: properties.camera.near,
              maxDepth: properties.camera.far,
              sortBuffer: this.sortBuffer.buffer,
            },
          },
          [this.sortBuffer.buffer],
        );
      }
    }
  }
}