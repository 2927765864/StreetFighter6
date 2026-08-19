/**
 * Guard level vs stance — consensus-block-guard-v0 + Capcom H/M/L.
 * H: block stand or crouch; M/midHigh: stand only; L: crouch only; throw: never.
 */

export type GuardLevel = 'high' | 'mid' | 'low' | 'midHigh' | 'throw';

export type DummyGuardPolicy = 'block_all' | 'stand_block' | 'crouch_block' | 'none';

export type GuardStrength = 'L' | 'M' | 'H';

export function normalizeGuard(g: string | undefined | null): GuardLevel {
  if (g == null) return 'high';
  const s = String(g).trim().toLowerCase();
  if (s === 'h' || s === 'high') return 'high';
  if (s === 'm' || s === 'mid') return 'mid';
  if (s === 'l' || s === 'low') return 'low';
  if (s === 'midhigh' || s === 'mid_high' || s === 'overhead') return 'midHigh';
  if (s === 't' || s === 'throw') return 'throw';
  return 'high';
}

/** Official: H both; M/midHigh stand only; L crouch only; throw never. */
export function canGuard(level: GuardLevel, crouching: boolean): boolean {
  if (level === 'throw') return false;
  if (level === 'high') return true;
  if (level === 'mid' || level === 'midHigh') return !crouching;
  if (level === 'low') return crouching;
  return false;
}

export function stanceForBlockAll(
  level: GuardLevel,
  currentlyCrouching: boolean,
): 'stand' | 'crouch' {
  if (level === 'low') return 'crouch';
  if (level === 'mid' || level === 'midHigh') return 'stand';
  if (level === 'throw') return currentlyCrouching ? 'crouch' : 'stand';
  // H is blockable both ways; rest pose for block_all is stand.
  return 'stand';
}

/** Fallback only when HIT_DT strength flags missing. */
export function hitstopToStrength(hitstopOnBlock: number | undefined): GuardStrength {
  const n = hitstopOnBlock != null && Number.isFinite(hitstopOnBlock) ? hitstopOnBlock : 9;
  if (n >= 13) return 'H';
  if (n >= 10) return 'M';
  return 'L';
}

/** Prefer move.guardStrength (HIT_DT L/M/H); else hitstop band. */
export function resolveGuardStrength(args: {
  guardStrength?: GuardStrength | string | null;
  hitstopOnBlock?: number;
}): GuardStrength {
  const s = args.guardStrength != null ? String(args.guardStrength).trim().toUpperCase() : '';
  if (s === 'L' || s === 'M' || s === 'H') return s;
  return hitstopToStrength(args.hitstopOnBlock);
}

/**
 * GRD letter = *animation* height, not Capcom frame-data H/M/L.
 * Official H (both) = 中段 → M / crouch C
 * Official M (overhead) = 上段 → H
 * Official L = 下段 → L stand / D crouch
 */
export function guardToAnimHeight(
  level: GuardLevel,
  crouching: boolean,
): 'h' | 'm' | 'l' | 'c' | 'd' {
  if (level === 'low') return crouching ? 'd' : 'l';
  if (level === 'mid' || level === 'midHigh') return 'h';
  return crouching ? 'c' : 'm';
}

/** @deprecated use guardToAnimHeight */
export function guardToStandHeight(level: GuardLevel): 'h' | 'm' | 'l' {
  const h = guardToAnimHeight(level, false);
  return h === 'h' || h === 'm' || h === 'l' ? h : 'm';
}

/**
 * Logic ids registered in ryu_logic_to_glb_map (grd_*_st).
 */
export function selectGuardReactLogicId(args: {
  crouching: boolean;
  guard: GuardLevel;
  hitstopOnBlock?: number;
  guardStrength?: GuardStrength | string | null;
}): string {
  const strength = resolveGuardStrength(args).toLowerCase();
  const h = guardToAnimHeight(args.guard, args.crouching);
  return `grd_${h}${strength}_st`;
}

export function selectGuardLoopLogicId(crouching: boolean): string {
  return crouching ? 'block_crouch_loop' : 'block_stand_loop';
}
