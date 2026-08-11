/**
 * Exact logic clipId → animation clip name(s) per asset profile.
 * Prefer first match; do not use fuzzy "Idle" early (that made Walk always Idle).
 */
export type ClipProfile =
  | 'soldier'
  | 'xbot'
  | 'ual'
  | 'ryu'
  | 'ryu_sf6'
  | 'generic';

/** Ordered candidates per logic clipId */
export type ClipNameMap = Record<string, string[]>;

export const SOLDIER_CLIPS: ClipNameMap = {
  idle: ['Idle'],
  walk: ['Walk'],
  crouch: ['Idle'],
  '5lp': ['Walk'], // Soldier has no punch; Walk scrub used as visible attack motion
  attack_l: ['Walk'],
  hit: ['TPose', 'Idle'],
  block: ['Idle'],
  tpose: ['TPose'],
};

export const XBOT_CLIPS: ClipNameMap = {
  idle: ['idle'],
  walk: ['walk'],
  crouch: ['sneak_pose', 'idle'],
  '5lp': ['run', 'walk'], // no punch on Xbot; run scrub = visible attack
  attack_l: ['run', 'walk'],
  hit: ['sad_pose', 'idle'],
  block: ['idle'],
};

/** Quaternius UAL Standard — for optional animation library overlay / retarget later */
export const UAL_CLIPS: ClipNameMap = {
  idle: ['Idle_Loop'],
  walk: ['Walk_Loop'],
  crouch: ['Crouch_Idle_Loop'],
  '5lp': ['Punch_Jab'],
  attack_l: ['Punch_Jab'],
  attack_m: ['Punch_Cross'],
  hit: ['Hit_Chest'],
  hit_head: ['Hit_Head'],
  block: ['Sword_Idle', 'Idle_Loop'],
  death: ['Death01'],
  tpose: ['A_TPose'],
};

/** Ryu No-rig: no baked clips — use procedural driver ids */
export const RYU_CLIPS: ClipNameMap = {
  idle: ['__proc_idle'],
  walk: ['__proc_walk'],
  crouch: ['__proc_crouch'],
  '5lp': ['__proc_5lp'],
  attack_l: ['__proc_5lp'],
  hit: ['__proc_hit'],
  block: ['__proc_block'],
};

/**
 * Extracted SF6 Ryu glb (`public/models/ryu/ryu_c1.glb`) clips from Noesis/Blender.
 * Missing clips fall back to idle until more FBX are merged.
 */
export const RYU_SF6_CLIPS: ClipNameMap = {
  idle: ['idle'],
  walk: ['idle'],
  crouch: ['idle'],
  '5lp': ['attack_light'],
  attack_l: ['attack_light'],
  attack_light: ['attack_light'],
  hit: ['idle'],
  block: ['idle'],
};

export function detectProfile(clipNames: string[]): ClipProfile {
  if (clipNames.length === 0) return 'ryu';
  const set = new Set(clipNames.map((n) => n.toLowerCase()));
  // SF6 extract: idle + attack_light from Noesis pipeline
  if (set.has('idle') && set.has('attack_light')) return 'ryu_sf6';
  if (set.has('idle') && (set.has('attack_light') || set.has('attack_2'))) {
    return 'ryu_sf6';
  }
  // Soldier: Idle/Walk/Run/TPose (capitalized Mixamo-style)
  if (set.has('tpose') && set.has('idle') && set.has('walk')) return 'soldier';
  // Xbot: lowercase + agree
  if (set.has('agree') && set.has('idle') && set.has('walk')) return 'xbot';
  if (set.has('punch_jab') || set.has('idle_loop')) return 'ual';
  // Single idle from extract
  if (set.has('idle') && set.has('attack_light') === false && clipNames.length <= 4) {
    if ([...set].some((n) => n.includes('attack'))) return 'ryu_sf6';
  }
  return 'generic';
}

export function mapForProfile(profile: ClipProfile): ClipNameMap {
  switch (profile) {
    case 'soldier':
      return SOLDIER_CLIPS;
    case 'xbot':
      return XBOT_CLIPS;
    case 'ual':
      return UAL_CLIPS;
    case 'ryu':
      return RYU_CLIPS;
    case 'ryu_sf6':
      return RYU_SF6_CLIPS;
    default:
      return {
        idle: ['Idle', 'idle', 'Idle_Loop'],
        walk: ['Walk', 'walk', 'Walk_Loop', 'Run', 'run'],
        crouch: ['Crouch_Idle_Loop', 'sneak_pose', 'Idle', 'idle'],
        '5lp': ['attack_light', 'Punch_Jab', 'punch', 'Run', 'run', 'Walk', 'walk'],
        attack_l: ['attack_light', 'Punch_Jab', 'punch', 'Run', 'run'],
        hit: ['Hit_Chest', 'sad_pose', 'Death', 'Idle', 'idle'],
        block: ['Sword_Idle', 'Idle', 'idle'],
      };
  }
}

/**
 * Resolve action name: exact match first through candidate list, never
 * short-circuit by scanning all clips against a late Idle candidate first.
 */
export function resolveClipName(
  available: Iterable<string>,
  candidates: string[],
): string | null {
  const list = [...available];
  const lowerMap = new Map(list.map((n) => [n.toLowerCase(), n]));
  for (const c of candidates) {
    if (c.startsWith('__proc_')) return c;
    const exact = lowerMap.get(c.toLowerCase());
    if (exact) return exact;
  }
  for (const c of candidates) {
    if (c.startsWith('__proc_')) continue;
    const cl = c.toLowerCase();
    for (const n of list) {
      if (n.toLowerCase() === cl) return n;
      // only allow includes for longer candidate tokens (avoid "i" style)
      if (cl.length >= 4 && n.toLowerCase().includes(cl)) return n;
    }
  }
  return null;
}
