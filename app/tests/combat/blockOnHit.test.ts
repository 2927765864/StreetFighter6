import { describe, expect, it } from 'vitest';
import {
  distributePushback,
  resolveBlockOnHit,
} from '../../src/combat/systems/BlockResolve';
import type { MoveDefinition } from '../../src/combat/move/MoveDefinition';

const move: MoveDefinition = {
  id: 't',
  characterId: 'ryu',
  moveId: '5LP',
  displayName: 't',
  frames: { startup: 4, active: 3, recovery: 7, total: 13 },
  advantage: { onHit: 4, onBlock: -1 },
  damage: 300,
  hitstun: 14,
  blockstun: 9,
  hitstopOnBlock: 6,
  blockPushbackTotal: 0.4,
  cancel: { specialCancel: false, targetCombo: [], windows: [] },
  boxes: { hurt: [], hit: [], push: [] },
  clipId: 'x',
  facingRelative: true,
  review: { status: 'placeholder', notes: '' },
};

describe('resolveBlockOnHit', () => {
  it('prefers move hitstop and blockstun', () => {
    const r = resolveBlockOnHit(move, {
      hitstopFramesOnBlock: 8,
      blockstunOverride: -1,
      blockPushbackTotal: 0.1,
      damageScale: 0,
    });
    expect(r.blockstun).toBe(9);
    expect(r.hitstop).toBe(6);
    expect(r.pushbackTotal).toBe(0.4);
    expect(r.damage).toBe(0);
  });

  it('override blockstun', () => {
    const r = resolveBlockOnHit(move, {
      hitstopFramesOnBlock: 8,
      blockstunOverride: 12,
      blockPushbackTotal: 0.1,
      damageScale: 0,
    });
    expect(r.blockstun).toBe(12);
  });
});

describe('distributePushback', () => {
  it('sums to total', () => {
    const steps = distributePushback(0.3, 6);
    expect(steps.length).toBe(6);
    expect(steps.reduce((a, b) => a + b, 0)).toBeCloseTo(0.3);
  });
});
