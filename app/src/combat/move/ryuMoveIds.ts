import type { MoveDefinition } from './MoveDefinition';

/**
 * generated/ filenames use `ryu_j>lp`; command list + glb map use `ryu_jlp`.
 * @see docs/character-control/action-tables/ryu-command-list-classic.md
 * @see app/public/data/clips/ryu_logic_to_glb_map.json aliasIndex
 */
export const MOVE_ID_ALIASES: Record<string, string> = {
  'ryu_j>lp': 'ryu_jlp',
  'ryu_j>mp': 'ryu_jmp',
  'ryu_j>hp': 'ryu_jhp',
  'ryu_j>lk': 'ryu_jlk',
  'ryu_j>mk': 'ryu_jmk',
  'ryu_j>hk': 'ryu_jhk',
  'j>lp': 'ryu_jlp',
  'j>mp': 'ryu_jmp',
  'j>hp': 'ryu_jhp',
  'j>lk': 'ryu_jlk',
  'j>mk': 'ryu_jmk',
  'j>hk': 'ryu_jhk',
  ryu_22_p: 'ryu_denjin_charge',
  '22_p': 'ryu_denjin_charge',
};

/** clipId strings that should resolve via LogicGlbMap aliases */
const CLIP_ALIASES: Record<string, string> = {
  'j>lp': 'ryu_jlp',
  'j>mp': 'ryu_jmp',
  'j>hp': 'ryu_jhp',
  'j>lk': 'ryu_jlk',
  'j>mk': 'ryu_jmk',
  'j>hk': 'ryu_jhk',
  '5lp': 'ryu_5lp',
  '5mp': 'ryu_5mp',
  '5hp': 'ryu_5hp',
  '5lk': 'ryu_5lk',
  '5mk': 'ryu_5mk',
  '5hk': 'ryu_5hk',
  '2lp': 'ryu_2lp',
  '2mp': 'ryu_2mp',
  '2hp': 'ryu_2hp',
  '2lk': 'ryu_2lk',
  '2mk': 'ryu_2mk',
  '2hk': 'ryu_2hk',
  hadoken_lp: 'ryu_hadoken',
  hadoken_mp: 'ryu_hadoken',
  hadoken_hp: 'ryu_hadoken',
  shoryuken_lp: 'ryu_shoryuken',
  shoryuken_mp: 'ryu_shoryuken',
  shoryuken_hp: 'ryu_shoryuken',
  tatsu_lk: 'ryu_tatsu',
  tatsu_mk: 'ryu_tatsu',
  tatsu_hk: 'ryu_tatsu',
  blade_lk: 'ryu_blade',
  blade_mk: 'ryu_blade',
  blade_hk: 'ryu_blade',
  hashogeki_lp: 'ryu_hashogeki',
  hashogeki_mp: 'ryu_hashogeki',
  hashogeki_hp: 'ryu_hashogeki',
  // generated id ryu_22_p vs map ryu_denjin_charge
  ryu_22_p: 'ryu_denjin_charge',
  '22_p': 'ryu_denjin_charge',
};

export function canonicalizeId(id: string): string {
  return MOVE_ID_ALIASES[id] ?? id;
}

/**
 * Normalize move definition ids for command table + LogicGlbMap.
 */
export function canonicalizeMoveDefinition(m: MoveDefinition): MoveDefinition {
  const id = canonicalizeId(m.id);
  const moveId = canonicalizeId(m.moveId);
  let clipId = m.clipId;
  if (CLIP_ALIASES[clipId]) clipId = CLIP_ALIASES[clipId]!;
  else if (MOVE_ID_ALIASES[clipId]) clipId = MOVE_ID_ALIASES[clipId]!;
  // Family clip for strength variants / denjin file id
  if (CLIP_ALIASES[id]) clipId = CLIP_ALIASES[id]!;
  else if (CLIP_ALIASES[moveId]) clipId = CLIP_ALIASES[moveId]!;
  else if (clipId === m.clipId && id.startsWith('ryu_')) {
    clipId = CLIP_ALIASES[m.clipId] ?? clipId;
  }
  // Prefer moveId as clip when it is a map key (normals)
  if (
    !CLIP_ALIASES[m.clipId] &&
    !CLIP_ALIASES[id] &&
    (id.startsWith('ryu_5') ||
      id.startsWith('ryu_2') ||
      id.startsWith('ryu_j') ||
      id.startsWith('ryu_6') ||
      id.startsWith('ryu_4'))
  ) {
    clipId = id;
  }
  return {
    ...m,
    id,
    moveId,
    clipId: clipId || id,
  };
}

/**
 * Public URLs under app/public for feedback catalog.
 * All non-deferred should-wire moves: MMDK dual-source at /data/moves/ryu_*.json
 * (not generated placeholder boxes). Supers deferred — not listed.
 */
export const RYU_FEEDBACK_MOVE_URLS: string[] = [
  // Standing
  '/data/moves/ryu_5lp.json',
  '/data/moves/ryu_5mp.json',
  '/data/moves/ryu_5hp.json',
  '/data/moves/ryu_5lk.json',
  '/data/moves/ryu_5mk.json',
  '/data/moves/ryu_5hk.json',
  // Crouching
  '/data/moves/ryu_2lp.json',
  '/data/moves/ryu_2mp.json',
  '/data/moves/ryu_2hp.json',
  '/data/moves/ryu_2lk.json',
  '/data/moves/ryu_2mk.json',
  '/data/moves/ryu_2hk.json',
  // Jump
  '/data/moves/ryu_jlp.json',
  '/data/moves/ryu_jmp.json',
  '/data/moves/ryu_jhp.json',
  '/data/moves/ryu_jlk.json',
  '/data/moves/ryu_jmk.json',
  '/data/moves/ryu_jhk.json',
  // Unique
  '/data/moves/ryu_6mp.json',
  '/data/moves/ryu_6hp.json',
  '/data/moves/ryu_4hp.json',
  '/data/moves/ryu_4hk.json',
  '/data/moves/ryu_6hk.json',
  // Target combos
  '/data/moves/ryu_tc_hp_hk.json',
  '/data/moves/ryu_tc_fuwa.json',
  // Specials (MMDK convert)
  '/data/moves/ryu_hadoken_lp.json',
  '/data/moves/ryu_hadoken_mp.json',
  '/data/moves/ryu_hadoken_hp.json',
  '/data/moves/ryu_shoryuken_lp.json',
  '/data/moves/ryu_shoryuken_mp.json',
  '/data/moves/ryu_shoryuken_hp.json',
  '/data/moves/ryu_tatsu_lk.json',
  '/data/moves/ryu_tatsu_mk.json',
  '/data/moves/ryu_tatsu_hk.json',
  '/data/moves/ryu_air_tatsu_lk.json',
  '/data/moves/ryu_air_tatsu_mk.json',
  '/data/moves/ryu_air_tatsu_hk.json',
  '/data/moves/ryu_blade_lk.json',
  '/data/moves/ryu_blade_mk.json',
  '/data/moves/ryu_blade_hk.json',
  '/data/moves/ryu_hashogeki_lp.json',
  '/data/moves/ryu_hashogeki_mp.json',
  '/data/moves/ryu_hashogeki_hp.json',
  '/data/moves/ryu_denjin_charge.json',
  // Throws (presentation; consensus §3.8)
  '/data/moves/ryu_throw_fwd.json',
  '/data/moves/ryu_throw_back.json',
];

/**
 * Logic ids to prefer for anim preload (map keys).
 * Locomotion + families used by clipId remaps above.
 */
export const FEEDBACK_PRELOAD_LOGIC_IDS: string[] = [
  'idle',
  'walk_fwd',
  'walk_back',
  'crouch',
  'dash_fwd',
  'dash_back',
  'jump_n',
  'jump_f',
  'jump_b',
  'throw_fwd',
  'throw_back',
  'hitstun_light',
  'dmg_hl_st',
  'dmg_hm_st',
  'dmg_hh_st',
  'dmg_hh_lt',
  'dmg_hh_rt',
  'dmg_ml_st',
  'dmg_mm_st',
  'dmg_mm_lt',
  'dmg_mh_st',
  'dmg_ll_st',
  'dmg_lm_st',
  'dmg_cl_st',
  'dmg_cm_st',
  'dmg_ch_st',
  'dmg_dl_st',
  'dmg_dm_st',
  'kd_sweep',
  'kd_bound',
  'kd_down_loop',
  'kd_rise_normal',
  'kd_rise_back',
  'block_stand',
  'block_stand_start',
  'block_stand_loop',
  'block_crouch_start',
  'block_crouch_loop',
  'grd_hl_st',
  'grd_hm_st',
  'grd_hh_st',
  'grd_ml_st',
  'grd_mm_st',
  'grd_mh_st',
  'grd_ll_st',
  'grd_lm_st',
  'grd_lh_st',
  'grd_cl_st',
  'grd_cm_st',
  'grd_ch_st',
  'grd_dl_st',
  'grd_dm_st',
  'grd_dh_st',
  'ryu_5lp',
  'ryu_5mp',
  'ryu_5hp',
  'ryu_5lk',
  'ryu_5mk',
  'ryu_5hk',
  'ryu_2lp',
  'ryu_2mp',
  'ryu_2hp',
  'ryu_2lk',
  'ryu_2mk',
  'ryu_2hk',
  'ryu_jlp',
  'ryu_jmp',
  'ryu_jhp',
  'ryu_jlk',
  'ryu_jmk',
  'ryu_jhk',
  'ryu_6mp',
  'ryu_6hp',
  'ryu_4hp',
  'ryu_4hk',
  'ryu_6hk',
  'ryu_hadoken',
  'ryu_shoryuken',
  'ryu_tatsu',
  'ryu_blade',
  'ryu_hashogeki',
  'ryu_denjin_charge',
  'ryu_tc_hp_hk',
  'ryu_tc_fuwa',
  'ryu_air_tatsu_lk',
];
