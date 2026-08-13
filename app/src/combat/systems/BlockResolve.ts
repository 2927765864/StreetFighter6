import type { MoveDefinition } from '../move/MoveDefinition';

export type BlockApply = {
  blockstun: number;
  hitstop: number;
  /** Total logical X push on defender (positive = away from attacker facing). */
  pushbackTotal: number;
  /** Damage to apply (0 typical for pure guard path). */
  damage: number;
};

/**
 * Build block outcome for P2 true-guard path (consensus §4.6).
 * Source priority: move fields → opts fallbacks.
 */
export function resolveBlockOnHit(
  move: MoveDefinition,
  opts: {
    hitstopFramesOnBlock: number;
    blockstunOverride: number;
    blockPushbackTotal: number;
    damageScale: number;
  },
): BlockApply {
  const blockstun =
    opts.blockstunOverride >= 0
      ? opts.blockstunOverride
      : Math.max(0, move.blockstun);

  const hitstop =
    move.hitstopOnBlock != null && Number.isFinite(move.hitstopOnBlock)
      ? Math.max(0, move.hitstopOnBlock)
      : Math.max(0, opts.hitstopFramesOnBlock);

  let pushbackTotal = opts.blockPushbackTotal;
  if (move.blockPushbackTotal != null && Number.isFinite(move.blockPushbackTotal)) {
    pushbackTotal = move.blockPushbackTotal;
  } else if (move.blockPushback && move.blockPushback.length > 0) {
    pushbackTotal = move.blockPushback.reduce((s, v) => s + v, 0);
  }

  const damage =
    opts.damageScale <= 0 ? 0 : Math.floor(move.damage * opts.damageScale);

  return { blockstun, hitstop, pushbackTotal, damage };
}

/**
 * Spread total pushback over stun frames (front-loaded linear decay).
 * Returns per-frame |dx| length = max(1, stunFrames).
 */
export function distributePushback(
  total: number,
  stunFrames: number,
): number[] {
  const n = Math.max(1, Math.floor(stunFrames));
  if (!Number.isFinite(total) || total === 0) return new Array(n).fill(0);
  // Equal split — simple and debuggable; GUI tunes total
  const step = total / n;
  return new Array(n).fill(step);
}
