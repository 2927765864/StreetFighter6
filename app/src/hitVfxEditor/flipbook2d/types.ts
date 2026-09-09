export type FlipbookBlend = 'normal' | 'add' | 'screen';

export type FlipbookStrength = 'L' | 'M' | 'H';

export type FlipbookLayerId =
  | 'E1_core_flash'
  | 'E2_near_sparks'
  | 'E3_ring_smoke'
  | 'E4_wide_short_smoke'
  | 'E5_narrow_long_smoke'
  | 'E6_narrow_long_smoke_rtl';

export type FlipbookLayer = {
  id: FlipbookLayerId;
  name: string;
  enabled: boolean;
  /** Higher draws on top. */
  z: number;
  offsetX: number;
  offsetY: number;
  scale: number;
  opacity: number;
  /** RGB multiply. 1 = authored. */
  brightness: number;
  /** Add white (0–2). Raises mid-grey smoke off a bright stage. */
  lift: number;
  /** 0 = keep authored edges; 1 = strip dark key fringe. */
  despill: number;
  /** Inclusive start on the shared timeline (0-based). */
  startFrame: number;
  /** How many timeline frames this layer occupies. */
  duration: number;
  blend: FlipbookBlend;
};

export type FlipbookRecipe = {
  id: string;
  name: string;
  /** Light / medium / heavy hit; same E1–E6 layers, independently tuned. */
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

export function sortedByZ(layers: FlipbookLayer[]): FlipbookLayer[] {
  return [...layers].sort((a, b) => a.z - b.z || a.id.localeCompare(b.id));
}
