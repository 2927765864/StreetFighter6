import { describe, expect, it } from 'vitest';
import {
  distributePushback,
  resolveBlockOnHit,
  standPunchHitPushSlot,
  tryStandPunchHitPushSteps,
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
    expect(r.moveTime).toBe(9);
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

  it('ease-out is front-loaded (faster right after hitstop)', () => {
    const steps = distributePushback(0.34, 13, { moveTime: 13, easePower: 3 });
    expect(steps.length).toBe(13);
    expect(steps.reduce((a, b) => a + b, 0)).toBeCloseTo(0.34);
    expect(steps[0]!).toBeGreaterThan(0.34 / 13);
    expect(steps[0]!).toBeGreaterThan(steps[steps.length - 1]!);
  });

  it('uses MoveTime not stun when shorter', () => {
    const steps = distributePushback(0.3, 20, { moveTime: 8, easePower: 3 });
    expect(steps.length).toBe(8);
  });
});

const punchOpts = {
  standLpHitPushEasePower: 3,
  standLpHitPushMoveTime: -1,
  standLpHitPushTotal: -1,
  standMpHitPushEasePower: 5,
  standMpHitPushMoveTime: -1,
  standMpHitPushTotal: -1,
  standHpHitPushEasePower: 2,
  standHpHitPushMoveTime: 10,
  standHpHitPushTotal: 0.8,
};

describe('stand punch hit-push curves', () => {
  it('maps only 5LP / 5MP / 5HP', () => {
    expect(standPunchHitPushSlot('ryu_5lp')).toBe('lp');
    expect(standPunchHitPushSlot('ryu_5mp')).toBe('mp');
    expect(standPunchHitPushSlot('ryu_5hp')).toBe('hp');
    expect(standPunchHitPushSlot('ryu_2hp')).toBeNull();
    expect(standPunchHitPushSlot('ryu_5lk')).toBeNull();
  });

  it('rebuilds 5LP with its own ease; 2MK stays null', () => {
    const lp = tryStandPunchHitPushSteps('ryu_5lp', 0.27, 14, 14, punchOpts);
    expect(lp).not.toBeNull();
    expect(lp!.length).toBe(14);
    expect(lp!.reduce((a, b) => a + b, 0)).toBeCloseTo(0.27);
    expect(tryStandPunchHitPushSteps('ryu_2mk', 0.5, 16, 16, punchOpts)).toBeNull();
  });

  it('5HP uses per-move frame count and total override', () => {
    const hp = tryStandPunchHitPushSteps('ryu_5hp', 0.6, 27, 20, punchOpts);
    expect(hp!.length).toBe(10);
    expect(hp!.reduce((a, b) => a + b, 0)).toBeCloseTo(0.8);
  });

  it('higher ease power front-loads more than lower', () => {
    const steep = tryStandPunchHitPushSteps('ryu_5mp', 0.5, 22, 22, punchOpts)!;
    const mild = tryStandPunchHitPushSteps('ryu_5lp', 0.5, 22, 22, punchOpts)!;
    expect(steep[0]!).toBeGreaterThan(mild[0]!);
  });
});
