import {
  guardAnimForHit,
  parseGuardAnimLetter,
  resolveGuardStrength,
  type GuardAnimHeight,
  type GuardLevel,
  type GuardStrength,
} from './GuardPolicy';

/** Disk-backed DMG react clips (ST + used LT). */
export const DMG_LOGIC_IDS = new Set([
  'dmg_hl_st',
  'dmg_hm_st',
  'dmg_hh_st',
  'dmg_ml_st',
  'dmg_mm_st',
  'dmg_mh_st',
  'dmg_ll_st',
  'dmg_lm_st',
  'dmg_cl_st',
  'dmg_cm_st',
  'dmg_ch_st',
  'dmg_dl_st',
  'dmg_dm_st',
  'dmg_mm_lt',
  'dmg_hm_lt',
  'dmg_mh_lt',
  'dmg_lm_lt',
  'dmg_hh_lt',
  'dmg_hh_rt',
]);

export const HIT_FALLBACK_LOGIC_ID = 'dmg_hl_st';

export type HitAnimDir = 'st' | 'lt' | 'rt';

/**
 * Stand unguarded height: hitAnim only (not guardAnim).
 * Crouch: same C/D as guard (stance), not punch/kick letter.
 */
export function hitToAnimHeight(
  level: GuardLevel,
  crouching: boolean,
  hitAnim?: GuardAnimHeight | string | null,
): 'h' | 'm' | 'l' | 'c' | 'd' {
  if (crouching) return level === 'low' ? 'd' : 'c';
  const a = parseGuardAnimLetter(hitAnim);
  if (a) return a;
  if (level === 'low') return 'l';
  // No default h: missing hitAnim on official-H would make all standing kicks head-reel.
  return 'm';
}

export function selectHitReactLogicId(args: {
  crouching: boolean;
  guard: GuardLevel;
  hitstopOnHit?: number;
  guardStrength?: GuardStrength | string | null;
  hitAnim?: GuardAnimHeight | string | null;
  hitAnimDir?: HitAnimDir | string | null;
}): { logicId: string; fallback: boolean } {
  const strength = resolveGuardStrength({
    guardStrength: args.guardStrength,
    hitstopOnBlock: args.hitstopOnHit,
  }).toLowerCase();
  const h = hitToAnimHeight(args.guard, args.crouching, args.hitAnim);
  const dirRaw = String(args.hitAnimDir ?? 'st').trim().toLowerCase();
  const dir: HitAnimDir = dirRaw === 'lt' || dirRaw === 'rt' ? dirRaw : 'st';
  const wanted = `dmg_${h}${strength}_${dir}`;
  if (DMG_LOGIC_IDS.has(wanted)) return { logicId: wanted, fallback: false };
  const asSt = `dmg_${h}${strength}_st`;
  if (dir !== 'st' && DMG_LOGIC_IDS.has(asSt)) return { logicId: asSt, fallback: true };
  const softer = strength === 'h' ? 'm' : 'l';
  const alt = `dmg_${h}${softer}_st`;
  if (DMG_LOGIC_IDS.has(alt)) return { logicId: alt, fallback: true };
  return { logicId: HIT_FALLBACK_LOGIC_ID, fallback: true };
}

/** Per-hit hitAnim list, same indexing as guardAnimForHit. */
export function hitAnimForHit(
  hitAnim: GuardAnimHeight | GuardAnimHeight[] | string | string[] | null | undefined,
  hitGroup: number,
): GuardAnimHeight | undefined {
  return guardAnimForHit(hitAnim, hitGroup);
}

export function isHitClipFallback(id: string): boolean {
  return id === HIT_FALLBACK_LOGIC_ID;
}
