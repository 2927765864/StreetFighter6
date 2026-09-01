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

/** Pick SkinnedMesh with most vertices (plan Step 7). */
export function findLargestSkinnedMesh(
  root: THREE.Object3D,
): THREE.SkinnedMesh | null {
  let best: THREE.SkinnedMesh | null = null;
  let bestCount = -1;
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (!sm.isSkinnedMesh || !sm.skeleton || !sm.geometry) return;
    const pos = sm.geometry.getAttribute('position');
    const n = pos?.count ?? 0;
    if (n > bestCount) {
      bestCount = n;
      best = sm;
    }
  });
  return best;
}
