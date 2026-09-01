/** Surface sample baked in bind pose (triangle + barycentric). */
export type WudaSurfaceSample = {
  i0: number;
  i1: number;
  i2: number;
  /** Barycentric weights for vertices i0, i1, i2 (u+v+w ≈ 1). */
  u: number;
  v: number;
  w: number;
};

export type WudaParticleState = 'stuck' | 'free';

export type WudaCoatStats = {
  stuck: number;
  free: number;
  dead: number;
};
