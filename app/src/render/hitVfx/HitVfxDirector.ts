import {
  resolveGuardStrength,
  type GuardStrength,
} from '../../combat/systems/GuardPolicy';
import { hitToAnimHeight } from '../../combat/systems/HitPolicy';
import type { HitVfxRuntime } from './HitVfxRuntime';
import type {
  HitVfxHeight,
  HitVfxStrength,
  HitVfxTriggerArgs,
} from './hitVfxTypes';

export type HitVfxMatchEvent = {
  kind: 'onHit' | 'onBlock';
  /** Defender world X. */
  defenderX: number;
  defenderFacing: number;
  defenderCrouching: boolean;
  /** Move hit level / guard level string from pending hit. */
  guardLevel: string;
  hitstopOnHit?: number;
  hitstopOnBlock?: number;
  guardStrength?: string | null;
  hitAnim?: string | null;
  guardAnim?: string | null;
  /** Attacker move id (punch vs kick). */
  moveId?: string;
  /** 0-based contact index for target combos. */
  hitGroup?: number;
  attackerFacing?: number;
};

function toVfxStrength(s: GuardStrength): HitVfxStrength {
  if (s === 'L' || s === 'M' || s === 'H') return s;
  return 'M';
}

export function matchEventToTriggerArgs(
  ev: HitVfxMatchEvent,
): HitVfxTriggerArgs {
  const strength = toVfxStrength(
    resolveGuardStrength({
      guardStrength: ev.guardStrength,
      hitstopOnBlock:
        ev.kind === 'onBlock' ? ev.hitstopOnBlock : ev.hitstopOnHit,
    }),
  );

  const rawH = hitToAnimHeight(
    ev.guardLevel as 'high' | 'mid' | 'low',
    ev.defenderCrouching,
    ev.kind === 'onHit' ? ev.hitAnim : ev.guardAnim,
  );
  const height: HitVfxHeight =
    rawH === 'h' || rawH === 'm' || rawH === 'l' ? rawH : 'l';

  return {
    kind: ev.kind,
    strength,
    height,
    x: ev.defenderX,
    facing: ev.defenderFacing,
  };
}

export class HitVfxDirector {
  constructor(private readonly runtime: HitVfxRuntime) {}

  onMatchContact(ev: HitVfxMatchEvent): void {
    this.runtime.trigger(matchEventToTriggerArgs(ev));
  }

  /** Preview-panel one-shot. */
  previewTrigger(args: HitVfxTriggerArgs): void {
    this.runtime.trigger(args);
  }
}
