/**
 * Skinned surface point: applyBoneTransform per corner + barycentric blend,
 * then matrixWorld. Never use bare localToWorld on bind verts
 * (Discourse: localToWorld ignores skeleton).
 */
import * as THREE from 'three';
import type { WudaSurfaceSample } from './wudaTypes';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();
const _pc = new THREE.Vector3();

export function evalSkinnedSurfacePoint(
  mesh: THREE.SkinnedMesh,
  sample: WudaSurfaceSample,
  out: THREE.Vector3,
): THREE.Vector3 {
  const geo = mesh.geometry;
  const position = geo.getAttribute('position');
  _pa.fromBufferAttribute(position, sample.i0);
  _pb.fromBufferAttribute(position, sample.i1);
  _pc.fromBufferAttribute(position, sample.i2);

  mesh.applyBoneTransform(sample.i0, _a.copy(_pa));
  mesh.applyBoneTransform(sample.i1, _b.copy(_pb));
  mesh.applyBoneTransform(sample.i2, _c.copy(_pc));

  out
    .set(0, 0, 0)
    .addScaledVector(_a, sample.u)
    .addScaledVector(_b, sample.v)
    .addScaledVector(_c, sample.w)
    .applyMatrix4(mesh.matrixWorld);
  return out;
}

/** Position attribute vertex count (0 if missing). */
export function skinnedMeshVertexCount(mesh: THREE.SkinnedMesh): number {
  return mesh.geometry.getAttribute('position')?.count ?? 0;
}

/** All skinned meshes with usable position attributes (stable traverse order). */
export function findAllSkinnedMeshes(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const out: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (!sm.isSkinnedMesh || !sm.skeleton || !sm.geometry) return;
    const pos = sm.geometry.getAttribute('position');
    if (!pos || pos.count <= 0) return;
    out.push(sm);
  });
  return out;
}

/** Pick SkinnedMesh with most vertices (plan Step 7). */
export function findLargestSkinnedMesh(
  root: THREE.Object3D,
): THREE.SkinnedMesh | null {
  const all = findAllSkinnedMeshes(root);
  let best: THREE.SkinnedMesh | null = null;
  let bestCount = -1;
  for (const sm of all) {
    const n = skinnedMeshVertexCount(sm);
    if (n > bestCount) {
      bestCount = n;
      best = sm;
    }
  }
  return best;
}

export type WudaCoverResolveOpts = {
  /**
   * Drop cover meshes with fewer than this many vertices (allMeshes only).
   * 0 = no filter. If everything would be dropped, keep the single largest mesh.
   */
  minVerts?: number;
};

/**
 * Keep meshes with vertexCount >= minVerts. Never returns empty when `meshes`
 * was non-empty — falls back to the largest mesh.
 */
export function filterSkinnedMeshesByMinVerts(
  meshes: readonly THREE.SkinnedMesh[],
  minVerts: number,
): THREE.SkinnedMesh[] {
  if (meshes.length === 0) return [];
  const min = Math.max(0, Math.floor(minVerts));
  if (min <= 0) return meshes.slice();
  const kept = meshes.filter((m) => skinnedMeshVertexCount(m) >= min);
  if (kept.length > 0) return kept;
  let best = meshes[0]!;
  let bestCount = skinnedMeshVertexCount(best);
  for (let i = 1; i < meshes.length; i++) {
    const m = meshes[i]!;
    const n = skinnedMeshVertexCount(m);
    if (n > bestCount) {
      best = m;
      bestCount = n;
    }
  }
  return [best];
}

/**
 * Resolve coat cover meshes from a model root.
 * `allMeshes` = every SkinnedMesh (optional minVerts filter);
 * `largestMesh` = one mesh (minVerts ignored).
 */
export function resolveWudaCoverMeshes(
  root: THREE.Object3D,
  mode: 'largestMesh' | 'allMeshes',
  opts?: WudaCoverResolveOpts | null,
): THREE.SkinnedMesh[] {
  if (mode === 'allMeshes') {
    const all = findAllSkinnedMeshes(root);
    if (all.length > 0) {
      return filterSkinnedMeshesByMinVerts(all, opts?.minVerts ?? 0);
    }
  }
  const largest = findLargestSkinnedMesh(root);
  return largest ? [largest] : [];
}
