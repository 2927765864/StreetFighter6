import {
  BTN_HK,
  BTN_HP,
  BTN_LK,
  BTN_LP,
  BTN_MK,
  BTN_MP,
  INTENT_PRIORITY,
  type NumpadDir,
} from '../types';
import type { CommandDef } from './CommandDef';

/** Crouch dirs (numpad). */
export const CROUCH_DIRS: NumpadDir[] = [1, 2, 3];
export const JUMP_DIRS = [7, 8, 9] as const;

const P = INTENT_PRIORITY;

function normalStand(
  id: string,
  moveId: string,
  buttonMask: number,
): CommandDef {
  return {
    id,
    moveId,
    kind: 'normal',
    priority: P.normal,
    bufferClass: 'standard',
    motion: [],
    buttonMask,
    forbidDirs: CROUCH_DIRS,
  };
}

function normalCrouch(
  id: string,
  moveId: string,
  buttonMask: number,
): CommandDef {
  return {
    id,
    moveId,
    kind: 'normal',
    priority: P.normal,
    bufferClass: 'standard',
    motion: [],
    buttonMask,
    requireDirs: CROUCH_DIRS,
  };
}

function normalAir(id: string, moveId: string, buttonMask: number): CommandDef {
  return {
    id,
    moveId,
    kind: 'normal',
    priority: P.normal,
    bufferClass: 'standard',
    motion: [],
    buttonMask,
    airOnly: true,
  };
}

function unique(
  id: string,
  moveId: string,
  buttonMask: number,
  requireDirs: NumpadDir[],
): CommandDef {
  return {
    id,
    moveId,
    kind: 'normal',
    priority: P.unique,
    bufferClass: 'standard',
    motion: [],
    buttonMask,
    requireDirs,
  };
}

function special(
  id: string,
  moveId: string,
  buttonMask: number,
  motion: CommandDef['motion'],
): CommandDef {
  return {
    id,
    moveId,
    kind: 'special',
    priority: P.special,
    bufferClass: 'standard',
    motion,
    buttonMask,
  };
}

/** 236 = quarter-circle forward (CritPoints / Capcom). */
const MOTION_236: CommandDef['motion'] = [
  { dirs: [2] },
  { dirs: [3] },
  { dirs: [6] },
];
/** 623 = dragon punch. */
const MOTION_623: CommandDef['motion'] = [
  { dirs: [6] },
  { dirs: [2] },
  { dirs: [3] },
];
/** 214 = quarter-circle back. */
const MOTION_214: CommandDef['motion'] = [
  { dirs: [2] },
  { dirs: [1] },
  { dirs: [4] },
];
/** 22 = down-down (Denjin Charge). */
const MOTION_22: CommandDef['motion'] = [{ dirs: [2] }, { dirs: [2] }];

/**
 * Full feedback command table for Classic Ryu.
 * moveIds: docs/character-control/action-tables/ryu-command-list-classic.md
 * Inputs: 4rays/sf6-move-data notation + Capcom Classic.
 *
 * Priority: special 100 > unique 50 > normal 40 (consensus §1.5 + Andrea).
 */
export const RYU_FEEDBACK_COMMANDS: CommandDef[] = [
  // --- Specials (higher priority; listed first for stable ties) ---
  special('hado_lp', 'ryu_hadoken_lp', BTN_LP, MOTION_236),
  special('hado_mp', 'ryu_hadoken_mp', BTN_MP, MOTION_236),
  special('hado_hp', 'ryu_hadoken_hp', BTN_HP, MOTION_236),
  special('shoryu_lp', 'ryu_shoryuken_lp', BTN_LP, MOTION_623),
  special('shoryu_mp', 'ryu_shoryuken_mp', BTN_MP, MOTION_623),
  special('shoryu_hp', 'ryu_shoryuken_hp', BTN_HP, MOTION_623),
  special('tatsu_lk', 'ryu_tatsu_lk', BTN_LK, MOTION_214),
  special('tatsu_mk', 'ryu_tatsu_mk', BTN_MK, MOTION_214),
  special('tatsu_hk', 'ryu_tatsu_hk', BTN_HK, MOTION_214),
  special('blade_lk', 'ryu_blade_lk', BTN_LK, MOTION_236),
  special('blade_mk', 'ryu_blade_mk', BTN_MK, MOTION_236),
  special('blade_hk', 'ryu_blade_hk', BTN_HK, MOTION_236),
  special('hasho_lp', 'ryu_hashogeki_lp', BTN_LP, MOTION_214),
  special('hasho_mp', 'ryu_hashogeki_mp', BTN_MP, MOTION_214),
  special('hasho_hp', 'ryu_hashogeki_hp', BTN_HP, MOTION_214),
  special('denjin_lp', 'ryu_22_p', BTN_LP, MOTION_22),

  // --- Unique (command normals) ---
  unique('u_6mp', 'ryu_6mp', BTN_MP, [6]),
  unique('u_6hp', 'ryu_6hp', BTN_HP, [6]),
  unique('u_4hp', 'ryu_4hp', BTN_HP, [4]),
  unique('u_4hk', 'ryu_4hk', BTN_HK, [4]),
  unique('u_6hk', 'ryu_6hk', BTN_HK, [6]),

  // --- Standing normals (forbid crouch) ---
  normalStand('n_5lp', 'ryu_5lp', BTN_LP),
  normalStand('n_5mp', 'ryu_5mp', BTN_MP),
  normalStand('n_5hp', 'ryu_5hp', BTN_HP),
  normalStand('n_5lk', 'ryu_5lk', BTN_LK),
  normalStand('n_5mk', 'ryu_5mk', BTN_MK),
  normalStand('n_5hk', 'ryu_5hk', BTN_HK),

  // --- Crouching normals ---
  normalCrouch('n_2lp', 'ryu_2lp', BTN_LP),
  normalCrouch('n_2mp', 'ryu_2mp', BTN_MP),
  normalCrouch('n_2hp', 'ryu_2hp', BTN_HP),
  normalCrouch('n_2lk', 'ryu_2lk', BTN_LK),
  normalCrouch('n_2mk', 'ryu_2mk', BTN_MK),
  normalCrouch('n_2hk', 'ryu_2hk', BTN_HK),

  // --- Jump normals (airOnly; phase gate in IntentResolver) ---
  normalAir('n_jlp', 'ryu_jlp', BTN_LP),
  normalAir('n_jmp', 'ryu_jmp', BTN_MP),
  normalAir('n_jhp', 'ryu_jhp', BTN_HP),
  normalAir('n_jlk', 'ryu_jlk', BTN_LK),
  normalAir('n_jmk', 'ryu_jmk', BTN_MK),
  normalAir('n_jhk', 'ryu_jhk', BTN_HK),

  // --- Throws (presentation only; consensus §3.8) ---
  {
    id: 'throw_back',
    moveId: 'ryu_throw_back',
    kind: 'throw',
    priority: P.throw,
    bufferClass: 'standard',
    motion: [],
    buttonMask: BTN_LP | BTN_LK,
    requireDirs: [4],
  },
  {
    id: 'throw_fwd',
    moveId: 'ryu_throw_fwd',
    kind: 'throw',
    priority: P.throw,
    bufferClass: 'standard',
    motion: [],
    buttonMask: BTN_LP | BTN_LK,
    forbidDirs: [4],
  },
];

/** @deprecated alias — use RYU_FEEDBACK_COMMANDS */
export const RYU_P0_COMMANDS = RYU_FEEDBACK_COMMANDS;
