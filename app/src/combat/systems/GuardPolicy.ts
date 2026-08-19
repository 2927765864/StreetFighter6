/**
 * Guard level vs stance — consensus-block-guard-v0 + Capcom H/M/L.
 * H: block stand or crouch; M/midHigh: stand only; L: crouch only; throw: never.
 */

export type GuardLevel = 'high' | 'mid' | 'low' | 'midHigh' | 'throw';

export type DummyGuardPolicy = 'block_all' | 'stand_block' | 'crouch_block' | 'none';

export type GuardStrength = 'L' | 'M' | 'H';

/** Stand-block animation letter; not Capcom H/M/L. */
export type GuardAnimHeight = 'h' | 'm' | 'l';

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

export function parseGuardAnimLetter(
  raw: unknown,
): GuardAnimHeight | undefined {
  if (raw == null) return undefined;
  const a = String(raw).trim().toLowerCase();
  if (a === 'h' || a === 'high') return 'h';
  if (a === 'm' || a === 'mid') return 'm';
  if (a === 'l' || a === 'low') return 'l';
  return undefined;
}

/** Scalar `guardAnim` or per-hit list (`["h","m"]`). */
export function guardAnimForHit(
  guardAnim: GuardAnimHeight | GuardAnimHeight[] | string | string[] | null | undefined,
  hitGroup: number,
): GuardAnimHeight | undefined {
  if (guardAnim == null) return undefined;
  if (Array.isArray(guardAnim)) {
    if (guardAnim.length === 0) return undefined;
    const i = Math.max(0, Math.min(hitGroup, guardAnim.length - 1));
    return parseGuardAnimLetter(guardAnim[i]);
  }
  return parseGuardAnimLetter(guardAnim);
}

/**
 * GRD/DRD letter = *hit-height animation*, not Capcom block-property H/M/L.
 * Stand `guardAnim` (per hit) wins. Crouch stays C / D.
 */
export function guardToAnimHeight(
  level: GuardLevel,
  crouching: boolean,
  guardAnim?: GuardAnimHeight | string | null,
): 'h' | 'm' | 'l' | 'c' | 'd' {
  if (crouching) return level === 'low' ? 'd' : 'c';
  const a = parseGuardAnimLetter(guardAnim);
  if (a) return a;
  if (level === 'low') return 'l';
  return 'h';
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
  guardAnim?: GuardAnimHeight | string | null;
}): string {
  const strength = resolveGuardStrength(args).toLowerCase();
  const h = guardToAnimHeight(args.guard, args.crouching, args.guardAnim);
  return `grd_${h}${strength}_st`;
}

export function selectGuardLoopLogicId(crouching: boolean): string {
  return crouching ? 'block_crouch_loop' : 'block_stand_loop';
}
