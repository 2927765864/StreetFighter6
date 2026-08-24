/**
 * When to one-shot vertical sole snap after a jump (§3.9 / landing clip).
 * Never snap from an outgoing air-attack pose — those soles sit high and
 * the correction drives the whole body into the floor.
 */

export function isJumpLandBinding(bindingKey: string | null | undefined): boolean {
  if (!bindingKey) return false;
  const raw = bindingKey.toLowerCase();
  return raw.startsWith('jump') && raw.endsWith('::land');
}

export function shouldSnapSoleOnLand(opts: {
  phase: string;
  animRole: string;
  fromAir: boolean;
  enterLanding: boolean;
  /** Freeze-old still mixing a non-land clip (e.g. j.HP residual). */
  blendingFromNonLand: boolean;
}): boolean {
  if (!opts.fromAir && !opts.enterLanding) return false;
  if (opts.blendingFromNonLand) return false;
  if (opts.animRole !== 'land') return false;
  return (
    opts.phase === 'landing' ||
    opts.phase === 'idle' ||
    opts.phase === 'crouch'
  );
}

/** Reset accumulated modelRoot Y before measuring a land pose. */
export function shouldResetGroundOffset(opts: {
  fromAir: boolean;
  enterLanding: boolean;
}): boolean {
  return opts.fromAir || opts.enterLanding;
}

/**
 * Lift-only sole floor clamp during grounded attack / attack animTail.
 * Some recovery clips (e.g. Tatsumaki END) dip distal toes below y=0 for a
 * few frames; logic Place already floor-clamps Y, but presentation does not
 * chase soles on attack — without this, feet clip through the stage.
 * Skip while Place Y has the body hopping (fighter.y > 0).
 */
export function shouldFloorClampAttackSole(opts: {
  phase: string;
  jumpPhase: string;
  logicY: number;
  hasAnimTail: boolean;
  holdAirTail?: boolean;
}): boolean {
  if (opts.jumpPhase !== 'none') return false;
  if (opts.logicY > 1e-4) return false;
  if (opts.phase === 'attack') return true;
  if (
    opts.hasAnimTail &&
    !opts.holdAirTail &&
    (opts.phase === 'idle' || opts.phase === 'crouch')
  ) {
    return true;
  }
  return false;
}
