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
 * Filenames match generated/ from 4rays pipeline (including `j>`).
 */
export const RYU_FEEDBACK_MOVE_URLS: string[] = [
  // Standing
  '/data/moves/generated/ryu_5lp.json',
  '/data/moves/generated/ryu_5mp.json',
  '/data/moves/generated/ryu_5hp.json',
  '/data/moves/generated/ryu_5lk.json',
  '/data/moves/generated/ryu_5mk.json',
  '/data/moves/generated/ryu_5hk.json',
  // Crouching
  '/data/moves/generated/ryu_2lp.json',
  '/data/moves/generated/ryu_2mp.json',
  '/data/moves/generated/ryu_2hp.json',
  '/data/moves/generated/ryu_2lk.json',
  '/data/moves/generated/ryu_2mk.json',
  '/data/moves/generated/ryu_2hk.json',
  // Jump (encode > for URL safety)
  '/data/moves/generated/' + encodeURIComponent('ryu_j>lp') + '.json',
  '/data/moves/generated/' + encodeURIComponent('ryu_j>mp') + '.json',
  '/data/moves/generated/' + encodeURIComponent('ryu_j>hp') + '.json',
  '/data/moves/generated/' + encodeURIComponent('ryu_j>lk') + '.json',
  '/data/moves/generated/' + encodeURIComponent('ryu_j>mk') + '.json',
  '/data/moves/generated/' + encodeURIComponent('ryu_j>hk') + '.json',
  // Unique
  '/data/moves/generated/ryu_6mp.json',
  '/data/moves/generated/ryu_6hp.json',
  '/data/moves/generated/ryu_4hp.json',
  '/data/moves/generated/ryu_4hk.json',
  '/data/moves/generated/ryu_6hk.json',
  // Specials
  '/data/moves/generated/ryu_hadoken_lp.json',
  '/data/moves/generated/ryu_hadoken_mp.json',
  '/data/moves/generated/ryu_hadoken_hp.json',
  '/data/moves/generated/ryu_shoryuken_lp.json',
  '/data/moves/generated/ryu_shoryuken_mp.json',
  '/data/moves/generated/ryu_shoryuken_hp.json',
  '/data/moves/generated/ryu_tatsu_lk.json',
  '/data/moves/generated/ryu_tatsu_mk.json',
  '/data/moves/generated/ryu_tatsu_hk.json',
  '/data/moves/generated/ryu_blade_lk.json',
  '/data/moves/generated/ryu_blade_mk.json',
  '/data/moves/generated/ryu_blade_hk.json',
  '/data/moves/generated/ryu_hashogeki_lp.json',
  '/data/moves/generated/ryu_hashogeki_mp.json',
  '/data/moves/generated/ryu_hashogeki_hp.json',
  '/data/moves/generated/ryu_22_p.json',
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
  'block_stand',
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
];
