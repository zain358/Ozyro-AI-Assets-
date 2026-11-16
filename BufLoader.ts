import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshNormalMaterial,
  Object3D,
  Points,
  PointsMaterial,
  Sphere,
  Vector3,
} from 'three';

/**
 * Parser for Lusion's `.buf` binary geometry format, ported 1:1 from the
 * source bundle's BufItem._onLoad (mirror/_astro/hoisted.CRsATKbF.js;
 * see docs/engine-notes.md for the format spec).
 *
 * Layout: [uint32 LE headerLen][JSON header][attribute payloads in header order]
 */

interface PackedComponent {
  from: number;
  delta: number;
}

interface BufAttribute {
  id: string;
  needsPack: boolean;
  componentSize: number;
  storageType: keyof typeof STORAGE_TYPES;
  packedComponents?: PackedComponent[];
}

interface BufSceneNode {
  name: string;
  vertexIndex: number;
  vertexCount: number;
  faceIndex: number;
  faceCount: number;
  parentIndex: number;
  position?: number[];
  quaternion?: number[];
  scale?: number[];
  material?: unknown;
  data?: Record<string, unknown>;
}

export interface BufHeader {
  vertexCount: number;
  indexCount: number;
  attributes: BufAttribute[];
  meshType?: 'Mesh' | 'Points' | 'LineSegments';
  sceneData?: BufSceneNode[];
  boundingSphere?: { center: number[]; radius: number };
  boundingBox?: { min: number[]; max: number[] };
}

const STORAGE_TYPES = {
  Int8Array,
  Uint8Array,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
} as const;

type TypedArray = InstanceType<(typeof STORAGE_TYPES)[keyof typeof STORAGE_TYPES]>;
type TypedArrayCtor = new (buffer: ArrayBuffer, byteOffset: number, length: number) => TypedArray;

export function parseBuf(arrayBuffer: ArrayBuffer): BufferGeometry {
  const headerLen = new Uint32Array(arrayBuffer, 0, 1)[0];
  const header: BufHeader = JSON.parse(
    new TextDecoder().decode(new Uint8Array(arrayBuffer, 4, headerLen)),
  );

  const vertexCount = header.vertexCount;
  const indexCount = header.indexCount;
  let offset = 4 + headerLen;
  const geometry = new BufferGeometry();
  // Byte offsets of non-packed attributes into the file buffer, needed when
  // sceneData sub-geometries re-view the same ArrayBuffer.
  const rawOffsets: Record<string, number> = {};
  let hasNormal = false;

  for (const attr of header.attributes) {
    const count = attr.id === 'indices' ? indexCount : vertexCount;
    const itemSize = attr.componentSize;
    const Ctor = STORAGE_TYPES[attr.storageType] as TypedArrayCtor;
    const raw = new Ctor(arrayBuffer, offset, count * itemSize);
    const bytesPerElement = (Ctor as unknown as { BYTES_PER_ELEMENT: number }).BYTES_PER_ELEMENT;
    let array: TypedArray;

    if (attr.needsPack) {
      const packed = attr.packedComponents!;
      const componentCount = packed.length;
      const signed = attr.storageType.indexOf('Int') === 0;
      const range = 1 << (bytesPerElement * 8);
      const half = signed ? range * 0.5 : 0;
      const q = 1 / (range - 1);
      const unpacked = new Float32Array(count * itemSize);
      for (let v = 0, i = 0; v < count; v++) {
        for (let c = 0; c < componentCount; c++) {
          const pc = packed[c];
          unpacked[i] = (raw[i] + half) * q * pc.delta + pc.from;
          i++;
        }
      }
      array = unpacked;
    } else {
      rawOffsets[attr.id] = offset;
      array = raw;
    }

    if (attr.id === 'normal') hasNormal = true;
    if (attr.id === 'indices') {
      geometry.setIndex(new BufferAttribute(array, 1));
    } else {
      geometry.setAttribute(attr.id, new BufferAttribute(array, itemSize));
    }
    offset += count * itemSize * bytesPerElement;
  }

  if (header.boundingSphere) {
    geometry.boundingSphere = new Sphere(
      new Vector3().fromArray(header.boundingSphere.center),
      header.boundingSphere.radius,
    );
  }
  if (header.boundingBox) {
    geometry.boundingBox = new Box3(
      new Vector3().fromArray(header.boundingBox.min),
      new Vector3().fromArray(header.boundingBox.max),
    );
  }

  const meshType = header.meshType;
  if (header.sceneData) {
    buildSceneData(geometry, header.sceneData, meshType, rawOffsets, hasNormal);
  }
  geometry.userData.bufHeader = header;
  return geometry;
}

function buildSceneData(
  geometry: BufferGeometry,
  sceneData: BufSceneNode[],
  meshType: BufHeader['meshType'],
  rawOffsets: Record<string, number>,
  hasNormal: boolean,
): void {
  const root = new Object3D();
  const meshList: Object3D[] = [];
  const nodes: Object3D[] = [];
  const primitiveSize = meshType === 'Mesh' ? 3 : meshType === 'LineSegments' ? 2 : 1;

  for (let n = 0; n < sceneData.length; n++) {
    const node = sceneData[n];
    let obj: Object3D;
    if (!node.vertexCount) {
      obj = new Object3D();
    } else {
      const sub = new BufferGeometry();
      const index = geometry.index;
      if (index) {
        const src = index.array as TypedArray;
        const Ctor = src.constructor as TypedArrayCtor;
        const bpe = (Ctor as unknown as { BYTES_PER_ELEMENT: number }).BYTES_PER_ELEMENT;
        sub.setIndex(
          new BufferAttribute(
            new Ctor(
              src.buffer as ArrayBuffer,
              node.faceIndex * index.itemSize * bpe * primitiveSize + (rawOffsets.indices || 0),
              node.faceCount * index.itemSize * primitiveSize,
            ),
            index.itemSize,
          ),
        );
        const subIndex = sub.index!.array as TypedArray;
        for (let i = 0; i < subIndex.length; i++) subIndex[i] -= node.vertexIndex;
      }
      for (const name in geometry.attributes) {
        const attr = geometry.attributes[name];
        const src = attr.array as TypedArray;
        const Ctor = src.constructor as TypedArrayCtor;
        const bpe = (Ctor as unknown as { BYTES_PER_ELEMENT: number }).BYTES_PER_ELEMENT;
        sub.setAttribute(
          name,
          new BufferAttribute(
            new Ctor(
              src.buffer as ArrayBuffer,
              node.vertexIndex * attr.itemSize * bpe + (rawOffsets[name] || 0),
              node.vertexCount * attr.itemSize,
            ),
            attr.itemSize,
          ),
        );
      }
      if (meshType === 'Mesh') {
        obj = new Mesh(sub, new MeshNormalMaterial({ flatShading: !hasNormal }));
      } else if (meshType === 'LineSegments') {
        obj = new LineSegments(sub, new LineBasicMaterial());
      } else {
        obj = new Points(sub, new PointsMaterial({ sizeAttenuation: false, size: 2 }));
      }
      meshList.push(obj);
    }
    if (node.parentIndex > -1) nodes[node.parentIndex].add(obj);
    else root.add(obj);
    if (node.position) obj.position.fromArray(node.position);
    if (node.quaternion) obj.quaternion.fromArray(node.quaternion);
    if (node.scale) obj.scale.fromArray(node.scale);
    obj.name = node.name;
    obj.userData.material = node.material;
    for (const key in node.data) obj.userData[key] = node.data![key];
    nodes[n] = obj;
  }
  geometry.userData.meshList = meshList;
  geometry.userData.sceneObject = root;
}

export async function loadBuf(url: string): Promise<BufferGeometry> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return parseBuf(await res.arrayBuffer());
}