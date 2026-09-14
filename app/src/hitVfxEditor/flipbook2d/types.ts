export type FlipbookBlend = 'normal' | 'add' | 'screen' | 'steam';

export type FlipbookStrength = 'L' | 'M' | 'H';

export type FlipbookLayerId =
  | 'E1_core_flash'
  | 'E2_near_sparks'
  | 'E2b_hit_sparks'
  | 'E3_ring_smoke'
  | 'E4_wide_short_smoke'
  | 'E5_narrow_long_smoke'
  | 'E6_narrow_long_smoke_rtl'
  | 'E7_sweat_spray'
  | 'E7b_sweat_scatter'
  | 'E7c_sweat_chunks'
  | 'E8b1_arc_smoke'
  | 'E8b2_arc_smoke'
  | 'E8c1_right_spread_smoke'
  | 'E8c2_right_spread_smoke';

export type FlipbookLayer = {
  id: FlipbookLayerId;
  name: string;
  enabled: boolean;
  /** Higher draws on top (within the same over/behind pass). */
  z: number;
  /**
   * true = draw in the post-fighter overlay (covers characters).
   * false = draw before fighters (entire layer behind characters).
   */
  overCharacter: boolean;
  offsetX: number;
  offsetY: number;
  /** Authored Z rotation in degrees (billboard local). */
  rotation: number;
  /**
   * When true, each spawn adds a one-shot uniform offset in
   * [randomRotationMinDeg, randomRotationMaxDeg] on top of `rotation`.
   */
  randomRotation: boolean;
  /** Inclusive lower bound of random rotation offset (degrees). */
  randomRotationMinDeg: number;
  /** Inclusive upper bound of random rotation offset (degrees). */
  randomRotationMaxDeg: number;
  scale: number;
  opacity: number;
  /** RGB multiply. 1 = authored. */
  brightness: number;
  /** Add white (0–2). Raises mid-grey smoke off a bright stage. Non-steam. */
  lift: number;
  /** Steam: lift authored dark wisps (0–12). */
  liftDark: number;
  /** Steam: thicken / punch authored bright cores (0–2). */
  liftBright: number;
  /** 0 = keep authored edges; 1 = strip dark key fringe. */
  despill: number;
  /**
   * Steam multiply colour as `#rrggbb`. White = no hue.
   * Ignored by 普通 / 滤色 / 加法.
   */
  tint: string;
  /** Inclusive start on the shared timeline (0-based). */
  startFrame: number;
  /** How many timeline frames this layer occupies. */
  duration: number;
  blend: FlipbookBlend;
};

export type FlipbookRecipe = {
  id: string;
  name: string;
  /** Light / medium / heavy hit; same E1–E7 / E7-b layers, independently tuned. */
  strength: FlipbookStrength;
  fps: number;
  length: number;
  layers: FlipbookLayer[];
};

export type FlipbookRecipeBank = Record<FlipbookStrength, FlipbookRecipe>;

export function layerEndFrame(layer: FlipbookLayer): number {
  return layer.startFrame + Math.max(1, layer.duration) - 1;
}

/** Source sheet index, or null if this layer is not visible at playhead. */
export function sourceFrameAt(
  layer: FlipbookLayer,
  playhead: number,
  sourceCount: number,
): number | null {
  if (!layer.enabled) return null;
  const t = Math.floor(playhead);
  if (t < layer.startFrame) return null;
  const i = t - layer.startFrame;
  if (i < 0 || i >= Math.max(1, layer.duration)) return null;
  if (sourceCount <= 0) return null;
  if (i >= sourceCount) return null;
  return i;
}

/**
 * Earliest timeline frame where any enabled layer draws.
 * Combat spawn jumps here so contact matches post-process (skip empty lead-in).
 */
export function firstVisiblePlayhead(
  recipe: Pick<FlipbookRecipe, 'layers'>,
): number {
  let min = Infinity;
  for (const layer of recipe.layers) {
    if (!layer.enabled) continue;
    if (layer.startFrame < min) min = layer.startFrame;
  }
  return Number.isFinite(min) ? Math.max(0, Math.floor(min)) : 0;
}

export function sortedByZ(layers: FlipbookLayer[]): FlipbookLayer[] {
  return [...layers].sort((a, b) => a.z - b.z || a.id.localeCompare(b.id));
}
