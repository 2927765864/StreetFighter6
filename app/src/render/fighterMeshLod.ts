/**
 * Display-mesh LOD for skinned fighters. High = authored mesh (no change).
 * Medium / low rebuild indices with meshopt then compact unused verts so
 * skinning cost actually drops. Face/hair use a milder ratio (UV seams).
 */
import * as THREE from 'three/webgpu';
import { MeshoptSimplifier } from 'meshoptimizer';

export type FighterMeshLod = 'high' | 'medium' | 'low';

export const FIGHTER_MESH_LOD_IDS: readonly FighterMeshLod[] = [
  'high',
  'medium',
  'low',
];

/** Target index ratio vs authored mesh. Face/hair keep more. */
export const FIGHTER_MESH_LOD_TABLE: Record<
  FighterMeshLod,
  { body: number; face: number; error: number }
> = {
  high: { body: 1, face: 1, error: 0 },
  medium: { body: 0.4, face: 0.7, error: 0.015 },
  low: { body: 0.18, face: 0.42, error: 0.04 },
};

const MIN_TRIS = 96;

export function normalizeFighterMeshLod(v: unknown): FighterMeshLod {
  return v === 'medium' || v === 'low' || v === 'high' ? v : 'high';
}

export function isFaceOrHairMeshName(name: string): boolean {
  const n = name.toLowerCase();
  return /head|hair|eye|mouth|brow|face|lash/.test(n);
}

export async function ensureFighterMeshLodReady(): Promise<void> {
  if (!MeshoptSimplifier.supported) return;
  await MeshoptSimplifier.ready;
}

export type FighterMeshLodStats = {
  lod: FighterMeshLod;
  meshes: number;
  trianglesBefore: number;
  trianglesAfter: number;
};

export function applyFighterMeshLod(
  root: THREE.Object3D,
  lod: FighterMeshLod,
): FighterMeshLodStats {
  const level = normalizeFighterMeshLod(lod);
  const spec = FIGHTER_MESH_LOD_TABLE[level];
  let meshes = 0;
  let trianglesBefore = 0;
  let trianglesAfter = 0;

  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (mesh.visible === false) return;
    const before = triangleCount(mesh.geometry);
    trianglesBefore += before;
    meshes += 1;
    if (level === 'high' || spec.body >= 1) {
      trianglesAfter += before;
      return;
    }
    const ratio = isFaceOrHairMeshName(mesh.name) ? spec.face : spec.body;
    const after = simplifyMeshGeometry(mesh.geometry, ratio, spec.error);
    trianglesAfter += after;
  });

  return { lod: level, meshes, trianglesBefore, trianglesAfter };
}

export function triangleCount(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex();
  if (index) return index.count / 3;
  const pos = geometry.getAttribute('position');
  return pos ? pos.count / 3 : 0;
}

function simplifyMeshGeometry(
  geometry: THREE.BufferGeometry,
  ratio: number,
  targetError: number,
): number {
  const before = triangleCount(geometry);
  if (
    !MeshoptSimplifier.supported ||
    ratio >= 0.999 ||
    before < MIN_TRIS
  ) {
    return before;
  }

  const posAttr = geometry.getAttribute('position');
  if (!posAttr || posAttr.itemSize !== 3) return before;

  let index = geometry.getIndex();
  if (!index) {
    const generated: number[] = [];
    for (let i = 0; i < posAttr.count; i++) generated.push(i);
    geometry.setIndex(generated);
    index = geometry.getIndex();
  }
  if (!index) return before;

  const srcIndex = new Uint32Array(index.array as ArrayLike<number>);
  const positions = new Float32Array(posAttr.count * 3);
  for (let i = 0; i < posAttr.count; i++) {
    positions[i * 3] = posAttr.getX(i);
    positions[i * 3 + 1] = posAttr.getY(i);
    positions[i * 3 + 2] = posAttr.getZ(i);
  }

  const target = Math.max(
    MIN_TRIS * 3,
    Math.floor((srcIndex.length * ratio) / 3) * 3,
  );
  if (target >= srcIndex.length) return before;

  const uv = geometry.getAttribute('uv');
  let next: Uint32Array;
  try {
    if (uv && uv.itemSize >= 2) {
      const attribs = new Float32Array(posAttr.count * 2);
      for (let i = 0; i < posAttr.count; i++) {
        attribs[i * 2] = uv.getX(i);
        attribs[i * 2 + 1] = uv.getY(i);
      }
      const [simplified] = MeshoptSimplifier.simplifyWithAttributes(
        srcIndex,
        positions,
        3,
        attribs,
        2,
        [0.8, 0.8],
        null,
        target,
        targetError,
        ['LockBorder'],
      );
      next = simplified;
    } else {
      const [simplified] = MeshoptSimplifier.simplify(
        srcIndex,
        positions,
        3,
        target,
        targetError,
        ['LockBorder'],
      );
      next = simplified;
    }
  } catch {
    return before;
  }

  if (!next || next.length < 3 || next.length >= srcIndex.length * 0.97) {
    return before;
  }

  compactGeometryVertices(geometry, next);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return triangleCount(geometry);
}

/** Drop unused verts after index simplify so skinning vertex count falls. */
export function compactGeometryVertices(
  geometry: THREE.BufferGeometry,
  newIndex: Uint32Array,
): void {
  const pos = geometry.getAttribute('position');
  if (!pos) return;
  const vertCount = pos.count;
  const oldToNew = new Int32Array(vertCount).fill(-1);
  let used = 0;
  for (let i = 0; i < newIndex.length; i++) {
    const src = newIndex[i]!;
    if (oldToNew[src] < 0) oldToNew[src] = used++;
  }
  const mapped = used < 65536 ? new Uint16Array(newIndex.length) : new Uint32Array(newIndex.length);
  for (let i = 0; i < newIndex.length; i++) {
    mapped[i] = oldToNew[newIndex[i]!]!;
  }

  for (const name of Object.keys(geometry.attributes)) {
    const attr = geometry.getAttribute(name);
    if (!attr || (attr as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) {
      continue;
    }
    const ba = attr as THREE.BufferAttribute;
    const item = ba.itemSize;
    const srcArr = ba.array;
    const Ctor = srcArr.constructor as new (n: number) => typeof srcArr;
    const dst = new Ctor(used * item);
    for (let src = 0; src < vertCount; src++) {
      const dstI = oldToNew[src];
      if (dstI < 0) continue;
      const s0 = src * item;
      const d0 = dstI * item;
      for (let k = 0; k < item; k++) dst[d0 + k] = srcArr[s0 + k]!;
    }
    geometry.setAttribute(
      name,
      new THREE.BufferAttribute(dst, item, ba.normalized),
    );
  }
  geometry.setIndex(new THREE.BufferAttribute(mapped, 1));
}
