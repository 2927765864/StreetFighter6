import type {
  VolumeSmokeImpulseDirSource,
  VolumeSmokeImpulseMode,
  VolumeSmokeParams,
} from '../hitVfxTypes';

export type ImpulseDirVec = { x: number; y: number; z: number };

/**
 * Resolve object-local impulse axis + effective radial blend for armSplat.
 * Seed / shape orientation still uses the hit normal separately.
 */
export function resolveVolumeSmokeImpulse(opts: {
  mode: VolumeSmokeImpulseMode;
  dirSource: VolumeSmokeImpulseDirSource;
  impulseDir: ImpulseDirVec;
  hitDirOS: ImpulseDirVec;
  impulseRadial: number;
}): { dirOS: ImpulseDirVec; radial: number } {
  const { mode, dirSource, impulseDir, hitDirOS, impulseRadial } = opts;
  if (mode === 'scatter') {
    return { dirOS: normalizeOrUp(impulseDir), radial: 1 };
  }
  const dir =
    dirSource === 'custom' ? normalizeOrUp(impulseDir) : normalizeOrUp(hitDirOS);
  const radial =
    typeof impulseRadial === 'number' && Number.isFinite(impulseRadial)
      ? Math.max(0, Math.min(1, impulseRadial))
      : 0;
  return { dirOS: dir, radial };
}

export function resolveVolumeSmokeImpulseFromParams(
  params: Pick<
    VolumeSmokeParams,
    | 'impulseMode'
    | 'impulseDirSource'
    | 'impulseDir'
    | 'impulseRadial'
  >,
  hitDirOS: ImpulseDirVec,
): { dirOS: ImpulseDirVec; radial: number } {
  return resolveVolumeSmokeImpulse({
    mode: params.impulseMode,
    dirSource: params.impulseDirSource,
    impulseDir: params.impulseDir,
    hitDirOS,
    impulseRadial: params.impulseRadial,
  });
}

function normalizeOrUp(v: ImpulseDirVec): ImpulseDirVec {
  const len = Math.hypot(v.x || 0, v.y || 0, v.z || 0);
  if (len < 1e-8) return { x: 0, y: 1, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}
