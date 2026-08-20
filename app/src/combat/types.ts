export type Facing = 1 | -1;

export type FighterPhase =
  | 'idle'
  | 'walk'
  | 'crouch'
  | 'attack'
  | 'hitstun'
  | 'blockstun'
  | 'knockdown'
  | 'dash'
  | 'prejump'
  | 'airborne'
  | 'landing';

/** Walk segment (consensus §3.8). */
export type LocoPhase = 'none' | 'start' | 'loop' | 'end';

/** Jump segment (consensus §3.8). */
export type JumpPhase = 'none' | 'prejump' | 'air' | 'land';

export type DummyMode = 'stand' | 'crouch' | 'stand_block' | 'crouch_block';

/** Training dummy guard policy (consensus-block-guard-v0). `none` = not guarding. */
export type DummyGuardPolicy = 'block_all' | 'stand_block' | 'crouch_block' | 'none';

export type DummyWakeupStyle = 'normal' | 'back';

export type DummyUnguardedStance = 'stand' | 'crouch';

export type KnockdownPhase = 'none' | 'sweep' | 'bound' | 'down' | 'rise';

export type HitResult = 'whiff' | 'hit' | 'block' | 'none';

export type NumpadDir = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type InputSample = {
  /** World-space direction from keys (before facing mirror). */
  dir: NumpadDir;
  /** Facing-relative direction; filled by MatchSim when facing known. */
  relDir: NumpadDir;
  /** Held button bitmask. */
  buttons: number;
  /** Just-down bitmask this logic frame. */
  pressed: number;
  /** Just-up bitmask this logic frame. */
  released: number;
};

export type IntentKind =
  | 'none'
  | 'walk'
  | 'crouch'
  | 'jump'
  | 'dash_fwd'
  | 'dash_back'
  | 'normal'
  | 'special'
  | 'throw'
  | 'drive';

export type Intent = {
  kind: IntentKind;
  moveId?: string;
  priority: number;
  bufferClass: 'standard' | 'dash';
  commandId?: string;
  /** Jump normals — only executable while airborne. */
  airOnly?: boolean;
};

export const BTN_LP = 1 << 0;
export const BTN_MP = 1 << 1;
export const BTN_HP = 1 << 2;
export const BTN_LK = 1 << 3;
export const BTN_MK = 1 << 4;
export const BTN_HK = 1 << 5;

/**
 * Priority table from consensus-design-v0 §1.5 + unique band.
 * Andrea: higher priority checked / wins on same frame.
 * unique (50) sits below throw(80)/drive(60), above normal(40).
 */
export const INTENT_PRIORITY = {
  special: 100,
  throw: 80,
  drive: 60,
  unique: 50,
  normal: 40,
  dash: 20,
  jump: 10,
  walk: 0,
  crouch: 0,
  none: -1,
} as const;
