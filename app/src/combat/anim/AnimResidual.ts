/**
 * Attack animation residual interrupt rules (consensus §3.7.1).
 * Interrupt = new commitment or stance incompatibility — NOT raw "any input".
 */

import type { MoveDefinition } from '../move/MoveDefinition';

export type MoveStance = 'stand' | 'crouch' | 'air';

/** Ground posture the player is holding via direction (no discrete action). */
export type HeldPosture = 'stand' | 'crouch';

/**
 * Infer stance from explicit field or moveId conventions.
 * 2LP/2LK/… → crouch; j./8* → air; else stand.
 */
export function inferMoveStance(move: Pick<MoveDefinition, 'id' | 'moveId' | 'stance'>): MoveStance {
  if (move.stance === 'stand' || move.stance === 'crouch' || move.stance === 'air') {
    return move.stance;
  }
  const raw = `${move.moveId ?? ''} ${move.id ?? ''}`.toLowerCase();
  // air: jump normals / j.xx
  if (
    /\bj[.\-_]?[lmh]?[pk]/.test(raw) ||
    /_j[_\-]?/.test(raw) ||
    /(?:^|_)8[lmh][pk]/.test(raw) ||
    raw.includes('jump_')
  ) {
    return 'air';
  }
  // crouch normals: 2LP, ryu_2lk, crouch, …
  if (
    /(?:^|_)2[lmh][pk](?:_|$)/.test(raw) ||
    /(?:^|_)2[lmh][pk]$/.test(raw) ||
    raw.includes('crouch') ||
    raw.includes('_crh') ||
    raw.includes('cr.')
  ) {
    return 'crouch';
  }
  return 'stand';
}

/**
 * @returns true if residual should be cleared for this held posture.
 * Compatible hold (2LK tail + hold crouch) → false.
 * Stance change (2LK tail + release to stand) → true.
 */
export function residualInterruptedByHeldPosture(
  residualStance: MoveStance,
  held: HeldPosture,
): boolean {
  if (residualStance === 'air') {
    // Ground residual only for now; air tails treated as stand-incompatible on ground
    return held === 'crouch' ? true : false;
  }
  return residualStance !== held;
}

/** Discrete actions always interrupt residual. */
export function residualInterruptedByNewAction(
  kind: 'walk' | 'attack' | 'jump' | 'dash' | 'hit' | 'other',
): boolean {
  return (
    kind === 'walk' ||
    kind === 'attack' ||
    kind === 'jump' ||
    kind === 'dash' ||
    kind === 'hit' ||
    kind === 'other'
  );
}

/**
 * Resolve held posture from facing-relative numpad.
 * 1/2/3 → crouch; else stand (includes 4/5/6/7/8/9 — walk/jump handled elsewhere).
 */
export function heldPostureFromRelDir(relDir: number): HeldPosture {
  if (relDir === 1 || relDir === 2 || relDir === 3) return 'crouch';
  return 'stand';
}
