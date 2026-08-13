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
