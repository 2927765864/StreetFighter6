/** End-of-life trigger for volume smoke (mutually exclusive). */
export type VolumeSmokeEndCondition = 'lifespan' | 'density';

/** Opacity fade curve while shutting down a volume smoke. */
export type VolumeSmokeFadeCurve =
  | 'linear'
  | 'easeOut'
  | 'easeIn'
  | 'smoothstep';

export const VOLUME_SMOKE_END_CONDITIONS: VolumeSmokeEndCondition[] = [
  'lifespan',
  'density',
];

export const VOLUME_SMOKE_FADE_CURVES: VolumeSmokeFadeCurve[] = [
  'linear',
  'easeOut',
  'easeIn',
  'smoothstep',
];

/**
 * Map fade progress t∈[0,1] through the selected curve.
 * Returns opacity multiplier (1 = fully visible, 0 = gone).
 */
export function volumeSmokeFadeMul(
  t: number,
  curve: VolumeSmokeFadeCurve = 'easeOut',
): number {
  const x = Math.min(1, Math.max(0, t));
  let e: number;
  switch (curve) {
    case 'linear':
      e = x;
      break;
    case 'easeIn':
      e = x * x;
      break;
    case 'smoothstep':
      e = x * x * (3 - 2 * x);
      break;
    case 'easeOut':
    default:
      e = 1 - (1 - x) * (1 - x);
      break;
  }
  return 1 - e;
}

/** Grace period before density-stop may fire (avoid empty-field false trigger). */
export const DENSITY_STOP_GRACE_SEC = 0.08;

/**
 * Whether the end condition has been met (before fade starts).
 * `peakDensity` is only required for density mode.
 */
export function volumeSmokeShouldBeginFade(args: {
  endCondition: VolumeSmokeEndCondition;
  age: number;
  maxLife: number;
  densityStop: number;
  peakDensity: number;
  densitySampleReady: boolean;
}): boolean {
  if (args.endCondition === 'density') {
    if (!args.densitySampleReady) return false;
    if (args.age < DENSITY_STOP_GRACE_SEC) return false;
    return args.peakDensity <= args.densityStop;
  }
  return args.age >= args.maxLife;
}
