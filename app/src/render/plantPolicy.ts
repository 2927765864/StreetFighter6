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
 * Grounded phases where authored clips may briefly push distal soles below
 * y=0 (special recovery, DMG/GRD react, KD sweep/down/rise, loco).
 *
 * Knockdown is included for **lift-only** clamp: ASHIBARAI / DN_UT / DN_STD
 * toe bones dip slightly below y=0 (rise mid ~-2cm). Bidirectional plantFeet
 * remains forbidden on KD (raised soles mid-sweep would bury the torso).
 *
 * Excludes landing (one-shot land snap owns Y — a reset-style clamp would
 * undo a pull-down snap when land soles sit high).
 */
const GROUNDED_SOLE_FLOOR_CLAMP_PHASES = new Set([
  'idle',
  'walk',
  'crouch',
  'dash',
  'attack',
  'hitstun',
  'blockstun',
  'knockdown',
]);

/**
 * Lift-only sole floor clamp for grounded presentation.
 *
 * Logic Place already floor-clamps Y, but presentation does not chase soles
 * every frame under plantMode=consensus (§3.9). Without a lift-only heal:
 *   - special recovery (e.g. Tatsumaki END) dips toes below the stage;
 *   - hitstun/blockstun scrub can pierce after a hard cut;
 *   - leaving an active clamp (attack) into hitstun used to reset modelRoot Y
 *     and undo the same-frame hard-cut plant → instant foot-ground clip;
 *   - 2HK knockdown: enter-KD cleared offset and skipped clamp for the whole
 *     sweep→bound→down→rise chain, so feet stayed buried until idle;
 *   - headband/belt/pants spring bones can leave idle/walk soles slightly low.
 *
 * Lift-only: never pulls down, so heel-rise / spinning-kick / mid-sweep raised
 * contact feet stay up. Skip while Place Y has the body hopping (fighter.y > 0),
 * in air, or landing (one-shot snap).
 *
 * `headbandPhysicsEnabled` is kept for call-site compat; clamp no longer
 * depends on it — grounded react/loco/KD need the same heal either way.
 */
export function shouldFloorClampAttackSole(opts: {
  phase: string;
  jumpPhase: string;
  logicY: number;
  hasAnimTail: boolean;
  holdAirTail?: boolean;
  headbandPhysicsEnabled?: boolean;
}): boolean {
  if (opts.jumpPhase !== 'none') return false;
  if (opts.logicY > 1e-4) return false;
  if (GROUNDED_SOLE_FLOOR_CLAMP_PHASES.has(opts.phase)) return true;
  // Residual tail on a phase we do not list (defensive); never air-held tails.
  if (
    opts.hasAnimTail &&
    !opts.holdAirTail &&
    (opts.phase === 'idle' || opts.phase === 'crouch')
  ) {
    return true;
  }
  return false;
}
