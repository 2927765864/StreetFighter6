import type { Object3D, Skeleton, SkinnedMesh } from 'three';

/**
 * Run after cloning/preparing a fighter, before its first render. Extracted
 * meshes often own identical palettes. Sharing them lets Three update/upload
 * each palette once per frame; mesh-local bind matrices remain untouched.
 * Never merge different bone orders, inverse binds, or different fighters.
 */
export function shareEquivalentSkeletons(root: Object3D): void {
  const candidates = new Map<Object3D, Skeleton[]>();
  root.traverse((object) => {
    const mesh = object as SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.skeleton?.bones.length) return;
    const skeleton = mesh.skeleton;
    const firstBone = skeleton.bones[0]!;
    const bucket = candidates.get(firstBone) ?? [];
    const shared = bucket.find((candidate) =>
      candidate === skeleton || (
        candidate.bones.length === skeleton.bones.length &&
        candidate.boneInverses.length === skeleton.boneInverses.length &&
        candidate.bones.every((bone, i) =>
          bone === skeleton.bones[i] &&
          candidate.boneInverses[i]!.equals(skeleton.boneInverses[i]!),
        )
      ),
    );
    if (shared) {
      mesh.skeleton = shared;
    } else {
      bucket.push(skeleton);
      candidates.set(firstBone, bucket);
    }
  });
}
