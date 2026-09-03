/**
 * Coalesce per-mesh skeleton.update() when SkinnedMeshes share bone objects
 * (common after unifySkinnedMeshSkeletons). Each mesh still owns its Skeleton /
 * boneMatrices buffer — we update the fullest rig once and copy by bone ref
 * (order-independent), so mismatched bone index layouts still collapse.
 */
import type { Bone, Skeleton, SkinnedMesh } from 'three';

export type WudaSkeletonSyncStats = {
  meshCount: number;
  /** Distinct THREE.Skeleton instances seen. */
  skeletonObjects: number;
  /** Actual skeleton.update() calls this sync. */
  updates: number;
  /** Secondary boneMatrices filled from a primary update. */
  copies: number;
  /** How many meshes were covered by the primary+copy path. */
  groups: number;
};

/**
 * Copy src.boneMatrices into dst by matching Bone object identity (not index).
 * Returns false if any dst bone is missing from src (caller should update dst).
 */
export function copyBoneMatricesByBoneRef(
  dst: Skeleton,
  src: Skeleton,
): boolean {
  const srcBones = src.bones;
  const dstBones = dst.bones;
  if (!src.boneMatrices || !dst.boneMatrices) return false;
  if (dstBones.length === 0) return false;

  const srcIndex = new Map<Bone, number>();
  for (let i = 0; i < srcBones.length; i++) {
    srcIndex.set(srcBones[i]!, i);
  }

  const srcMats = src.boneMatrices;
  const dstMats = dst.boneMatrices;
  for (let i = 0; i < dstBones.length; i++) {
    const j = srcIndex.get(dstBones[i]!);
    if (j === undefined) return false;
    dstMats.set(srcMats.subarray(j * 16, j * 16 + 16), i * 16);
  }
  return true;
}

/**
 * Refresh boneMatrices for every mesh. Prefer one update on the fullest
 * skeleton, then copy into others that only reference a subset of those bones.
 */
export function syncSkinnedMeshBoneMatrices(
  meshes: readonly SkinnedMesh[],
): WudaSkeletonSyncStats {
  const withSk = meshes.filter(
    (m) => m?.skeleton?.bones?.length && m.skeleton.boneMatrices,
  );
  const skeletonSet = new Set<Skeleton>();
  for (const m of withSk) skeletonSet.add(m.skeleton);

  if (withSk.length === 0) {
    return {
      meshCount: 0,
      skeletonObjects: 0,
      updates: 0,
      copies: 0,
      groups: 0,
    };
  }

  // Fullest bone list first — usually the body / primary unify target.
  const ordered = withSk.slice().sort(
    (a, b) => b.skeleton.bones.length - a.skeleton.bones.length,
  );

  let updates = 0;
  let copies = 0;
  let covered = 0;
  const done = new Set<Skeleton>();

  for (let i = 0; i < ordered.length; i++) {
    const primary = ordered[i]!;
    const primarySk = primary.skeleton;
    if (done.has(primarySk)) continue;

    primarySk.update();
    updates++;
    done.add(primarySk);
    covered++;

    for (let j = i + 1; j < ordered.length; j++) {
      const other = ordered[j]!;
      const otherSk = other.skeleton;
      if (done.has(otherSk)) continue;
      if (otherSk === primarySk) {
        covered++;
        continue;
      }
      if (copyBoneMatricesByBoneRef(otherSk, primarySk)) {
        done.add(otherSk);
        copies++;
        covered++;
      }
    }
  }

  // Any leftover (disjoint helper rigs): update individually.
  for (const m of withSk) {
    if (done.has(m.skeleton)) continue;
    m.skeleton.update();
    updates++;
    done.add(m.skeleton);
    covered++;
  }

  return {
    meshCount: withSk.length,
    skeletonObjects: skeletonSet.size,
    updates,
    copies,
    groups: covered,
  };
}
