import type { VolumeSmokeParams } from '../hitVfxTypes';

/**
 * Deep-enough clone for volumeSmoke params so per-instance tracks never share
 * nested objects (seedRotation / seedOffset / turbulenceDir / expandedSections)
 * with the recipe author or with sibling instances.
 */
export function cloneVolumeSmokeParams(
  params: VolumeSmokeParams,
): VolumeSmokeParams {
  return {
    ...params,
    seedRotation: { ...params.seedRotation },
    seedOffset: { ...(params.seedOffset ?? { x: 0, y: 0, z: 0 }) },
    turbulenceDir: { ...params.turbulenceDir },
    expandedSections: { ...params.expandedSections },
  };
}

/**
 * Self-similar world-meter scale for volumeSmoke under strengthScale.sizeMul.
 * Scales absolute sizes only; ratio-based seed shape and fluid look params stay put.
 * Never mutates `params` — returns an isolated clone with scaled fields.
 */
export function scaleVolumeSmokeWorldSizes(
  params: VolumeSmokeParams,
  sizeMul: number,
): VolumeSmokeParams {
  const mul =
    typeof sizeMul === 'number' && Number.isFinite(sizeMul)
      ? Math.max(0, sizeMul)
      : 1;
  const out = cloneVolumeSmokeParams(params);
  if (mul === 1) return out;
  out.volumeSize = params.volumeSize * mul;
  out.unrestrictedVolumeSize = params.unrestrictedVolumeSize * mul;
  out.hitRadius = params.hitRadius * mul;
  out.spawnHeight = params.spawnHeight * mul;
  return out;
}

/**
 * Whether an editor live-apply should rewrite this track.
 * - `undefined` — unbound (match): update every track
 * - `null` / `''` — no volumeSmoke focus: update none
 * - `string` — only the matching element (missing track ids never match)
 */
export function volumeSmokeTrackMatchesEditorFocus(
  focusId: string | null | undefined,
  trackElementId: string | null | undefined,
): boolean {
  if (focusId === undefined) return true;
  if (focusId == null || focusId === '') return false;
  return trackElementId === focusId;
}
