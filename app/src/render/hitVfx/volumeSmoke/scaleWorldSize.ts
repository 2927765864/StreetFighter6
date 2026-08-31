import type { VolumeSmokeParams } from '../hitVfxTypes';

/**
 * Self-similar world-meter scale for volumeSmoke under strengthScale.sizeMul.
 * Scales absolute sizes only; ratio-based seed shape and fluid look params stay put.
 * Never mutates `params` — returns a shallow clone with scaled fields.
 */
export function scaleVolumeSmokeWorldSizes(
  params: VolumeSmokeParams,
  sizeMul: number,
): VolumeSmokeParams {
  const mul =
    typeof sizeMul === 'number' && Number.isFinite(sizeMul)
      ? Math.max(0, sizeMul)
      : 1;
  if (mul === 1) {
    return { ...params };
  }
  return {
    ...params,
    volumeSize: params.volumeSize * mul,
    unrestrictedVolumeSize: params.unrestrictedVolumeSize * mul,
    hitRadius: params.hitRadius * mul,
    spawnHeight: params.spawnHeight * mul,
  };
}
