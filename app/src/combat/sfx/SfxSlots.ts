/**
 * Slot-id helpers for four-layer combat SFX (manifest keys from sfx-lab).
 */
import {
  resolveGuardStrength,
  type GuardStrength,
} from '../systems/GuardPolicy';

export type SfxLimb = 'punch' | 'kick';
export type SfxStrength = 'l' | 'm' | 'h';

export type CombatSfxEvent =
  | {
      kind: 'swing';
      moveId: string;
      guardStrength?: string | null;
      hitstopOnHit?: number;
    }
  | {
      kind: 'hit' | 'block';
      moveId: string;
      guardStrength?: string | null;
      hitstopOnHit?: number;
      hitstopOnBlock?: number;
    }
  | { kind: 'dash'; forward: boolean }
  | { kind: 'footstep'; side: 'left' | 'right' }
  | { kind: 'jump' }
  | { kind: 'jump_cloth' }
  | { kind: 'land' }
  | { kind: 'body_fall' }
  | { kind: 'wakeup' };

export function strengthToSlot(s: GuardStrength): SfxStrength {
  return s.toLowerCase() as SfxStrength;
}

/** Prefer HIT_DT guardStrength; else hitstop band; else button letter on moveId. */
export function resolveSfxStrength(args: {
  moveId?: string;
  guardStrength?: string | null;
  hitstopOnHit?: number;
  hitstopOnBlock?: number;
}): SfxStrength {
  const fromFlags = resolveGuardStrength({
    guardStrength: args.guardStrength,
    hitstopOnBlock: args.hitstopOnBlock ?? args.hitstopOnHit,
  });
  if (args.guardStrength != null && String(args.guardStrength).trim() !== '') {
    return strengthToSlot(fromFlags);
  }
  const fromId = strengthFromMoveId(args.moveId ?? '');
  if (fromId) return fromId;
  return strengthToSlot(fromFlags);
}

export function strengthFromMoveId(moveId: string): SfxStrength | null {
  const s = moveId.toLowerCase();
  if (/(?:^|[_0-9j>])(?:lp|lk)(?:_|$)/.test(s) || /(?:lp|lk)$/.test(s)) {
    return 'l';
  }
  if (/(?:^|[_0-9j>])(?:mp|mk)(?:_|$)/.test(s) || /(?:mp|mk)$/.test(s)) {
    return 'm';
  }
  if (/(?:^|[_0-9j>])(?:hp|hk)(?:_|$)/.test(s) || /(?:hp|hk)$/.test(s)) {
    return 'h';
  }
  return null;
}

/** Punch vs kick from move id / special family. Default punch. */
export function classifyMoveLimb(moveId: string): SfxLimb {
  const s = moveId.toLowerCase();
  if (/tatsu|blade/.test(s)) return 'kick';
  // Normals / jump normals: …5lk, …jhk, …2mk, trailing button letter.
  if (/(?:^|[_0-9j>])(?:lk|mk|hk)(?:_|$)/.test(s) || /(?:lk|mk|hk)$/.test(s)) {
    return 'kick';
  }
  if (/(?:^|[_0-9j>])(?:lp|mp|hp)(?:_|$)/.test(s) || /(?:lp|mp|hp)$/.test(s)) {
    return 'punch';
  }
  if (/hado|shoryu|hashogeki|denjin/.test(s)) return 'punch';
  return 'punch';
}

export function contactHitSlot(limb: SfxLimb, strength: SfxStrength): string {
  return `contact/hit_${limb}_${strength}`;
}

export function contactBlockSlot(strength: SfxStrength): string {
  return `contact/block_${strength}`;
}

export function swingSlot(limb: SfxLimb, strength: SfxStrength): string {
  return `swing/${limb}_${strength}`;
}

export function slotIdForCombatEvent(ev: CombatSfxEvent): string | null {
  switch (ev.kind) {
    case 'swing': {
      const limb = classifyMoveLimb(ev.moveId);
      const st = resolveSfxStrength(ev);
      return swingSlot(limb, st);
    }
    case 'hit': {
      const limb = classifyMoveLimb(ev.moveId);
      const st = resolveSfxStrength(ev);
      return contactHitSlot(limb, st);
    }
    case 'block': {
      const st = resolveSfxStrength(ev);
      return contactBlockSlot(st);
    }
    case 'dash':
      return ev.forward ? 'loco/dash_fwd' : 'loco/dash_back';
    case 'footstep':
      return ev.side === 'right' ? 'loco/footstep_right' : 'loco/footstep_left';
    case 'jump':
      return 'loco/jump';
    case 'jump_cloth':
      return 'loco/jump_cloth';
    case 'land':
      return 'loco/land';
    case 'body_fall':
      return 'knockdown/body_fall';
    case 'wakeup':
      return 'knockdown/wakeup';
    default:
      return null;
  }
}
