import {
  createMulberry32,
  ephemeralSeed,
} from '../../render/hitVfx/mulberry32';
import type { FlipbookLayer } from './types';

export type LayerRotationFields = Pick<
  FlipbookLayer,
  'rotation' | 'randomRotation' | 'randomRotationMinDeg' | 'randomRotationMaxDeg'
>;

/** Normalize min/max so sampling always uses lo ≤ hi. */
export function normalizedRandomRotationRange(
  layer: Pick<FlipbookLayer, 'randomRotationMinDeg' | 'randomRotationMaxDeg'>,
): { min: number; max: number } {
  const a = Number(layer.randomRotationMinDeg) || 0;
  const b = Number(layer.randomRotationMaxDeg) || 0;
  return a <= b ? { min: a, max: b } : { min: b, max: a };
}

/** Fingerprint of random-rotation controls; changes → re-sample jitter. */
export function layerRandomRotationKey(layer: LayerRotationFields): string {
  if (!layer.randomRotation) return 'off';
  const { min, max } = normalizedRandomRotationRange(layer);
  return `on:${min}:${max}`;
}

/**
 * One-shot jitter for a spawn in [minDeg, maxDeg].
 * Combat uses ephemeralSeed; tests can pass rng.
 * Returns 0 when the switch is off or the range collapses to 0..0.
 */
export function sampleLayerRotationJitterDeg(
  layer: Pick<
    FlipbookLayer,
    'randomRotation' | 'randomRotationMinDeg' | 'randomRotationMaxDeg'
  >,
  rng: { range: (min: number, max: number) => number } = createMulberry32(
    ephemeralSeed(),
  ),
): number {
  if (!layer.randomRotation) return 0;
  const { min, max } = normalizedRandomRotationRange(layer);
  if (min === 0 && max === 0) return 0;
  return rng.range(min, max);
}

/** Final local Z rotation in radians = authored degrees + spawn jitter. */
export function layerRotationRad(
  layer: Pick<FlipbookLayer, 'rotation'>,
  jitterDeg: number,
): number {
  return (((Number(layer.rotation) || 0) + jitterDeg) * Math.PI) / 180;
}
