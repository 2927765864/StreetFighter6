/**
 * Pure helpers for §3.9.1.b walk-input freeze snapshot selection.
 * Keeps FighterView free of untestable "which blend layer to pin" rules.
 */

/** Which pose-blend layer is the visible freeze snapshot. */
export function walkFreezeSnapLayer(toWeight: number): 'from' | 'to' {
  return toWeight >= 0.5 ? 'to' : 'from';
}

/**
 * When ending a pose blend for freeze capture, never stop the snap layer
 * (stopping it caused rapid F/B T-pose: scrub without play).
 */
export function blendStopFlagsForFreezeSnap(layer: 'from' | 'to'): {
  stopFrom: boolean;
  stopTo: boolean;
} {
  return {
    stopFrom: layer !== 'from',
    stopTo: layer !== 'to',
  };
}
