/** Surface sample baked in bind pose (triangle + barycentric). */
export type WudaSurfaceSample = {
  i0: number;
  i1: number;
  i2: number;
  /** Barycentric weights for vertices i0, i1, i2 (u+v+w ≈ 1). */
  u: number;
  v: number;
  w: number;
  /**
   * Index into the bound SkinnedMesh list (0 when single-mesh / largestMesh).
   * Used by allMeshes cover mode.
   */
  meshIndex?: number;
};

export type WudaParticleState = 'stuck' | 'free';

export type WudaCoatStats = {
  stuck: number;
  free: number;
  dead: number;
  /** Bound cover meshes (1 for largestMesh, many for allMeshes). */
  meshCount?: number;
  /** Actual skeleton.update() calls after coalescing. */
  skeletonUpdates?: number;
  /** Secondary boneMatrices copies from a primary update. */
  skeletonCopies?: number;
  /** Coat update wall time this frame (ms). */
  coatMs?: number;
};
