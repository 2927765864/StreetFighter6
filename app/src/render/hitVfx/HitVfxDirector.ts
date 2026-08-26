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
};

function toVfxStrength(s: GuardStrength): HitVfxStrength {
  if (s === 'L' || s === 'M' || s === 'H') return s;
  return 'M';
}

export class HitVfxDirector {
  constructor(private readonly runtime: HitVfxRuntime) {}

  onMatchContact(ev: HitVfxMatchEvent): void {
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
    // Map crouch letters c/d → l for VFX sockets (plan height set is h/m/l).
    const height: HitVfxHeight =
      rawH === 'h' || rawH === 'm' || rawH === 'l'
        ? rawH
        : 'l';

    const args: HitVfxTriggerArgs = {
      kind: ev.kind,
      strength,
      height,
      x: ev.defenderX,
      facing: ev.defenderFacing,
    };
    this.runtime.trigger(args);
  }

  /** Preview-panel one-shot. */
  previewTrigger(args: HitVfxTriggerArgs): void {
    this.runtime.trigger(args);
  }
}
