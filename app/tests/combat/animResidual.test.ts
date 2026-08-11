import { describe, expect, it } from 'vitest';
import {
  heldPostureFromRelDir,
  inferMoveStance,
  residualInterruptedByHeldPosture,
} from '../../src/combat/anim/AnimResidual';
import { Fighter } from '../../src/combat/fighter/Fighter';
import type { MoveDefinition } from '../../src/combat/move/MoveDefinition';

const move = (
  over: Partial<MoveDefinition> & { moveId: string },
): MoveDefinition => ({
  id: over.id ?? over.moveId,
  characterId: 'ryu',
  moveId: over.moveId,
  displayName: over.moveId,
  frames: over.frames ?? { startup: 5, active: 2, recovery: 9, total: 16 },
  advantage: { onHit: 0, onBlock: 0 },
  damage: 200,
  hitstun: 10,
  blockstun: 8,
  cancel: { specialCancel: false, targetCombo: [], windows: [] },
  boxes: {
    hurt: [{ from: 0, to: 15, x: 0, y: 0.5, w: 0.7, h: 1.0 }],
    hit: [{ from: 4, to: 5, x: 0.4, y: 0.4, w: 0.5, h: 0.4 }],
  },
  clipId: over.clipId ?? over.moveId,
  facingRelative: true,
  review: { status: 'test', notes: '' },
  animFrameCount: over.animFrameCount ?? 40,
  stance: over.stance,
});

const adv = {
  airFrames: 38,
  landingFrames: 3,
  dashSpeed: 0.05,
};

describe('inferMoveStance', () => {
  it('detects crouch from 2lk id', () => {
    expect(inferMoveStance({ id: 'ryu_2lk', moveId: 'ryu_2lk' })).toBe(
      'crouch',
    );
  });
  it('detects stand from 5lk', () => {
    expect(inferMoveStance({ id: 'ryu_5lk', moveId: 'ryu_5lk' })).toBe(
      'stand',
    );
  });
  it('respects explicit stance', () => {
    expect(
      inferMoveStance({ id: 'x', moveId: 'ryu_5lk', stance: 'crouch' }),
    ).toBe('crouch');
  });
});

describe('residualInterruptedByHeldPosture', () => {
  it('crouch residual + hold crouch = keep', () => {
    expect(residualInterruptedByHeldPosture('crouch', 'crouch')).toBe(false);
  });
  it('crouch residual + stand hold = interrupt', () => {
    expect(residualInterruptedByHeldPosture('crouch', 'stand')).toBe(true);
  });
  it('stand residual + crouch hold = interrupt', () => {
    expect(residualInterruptedByHeldPosture('stand', 'crouch')).toBe(true);
  });
});

describe('heldPostureFromRelDir', () => {
  it('maps 1/2/3 to crouch', () => {
    expect(heldPostureFromRelDir(2)).toBe('crouch');
    expect(heldPostureFromRelDir(1)).toBe('crouch');
    expect(heldPostureFromRelDir(5)).toBe('stand');
    expect(heldPostureFromRelDir(6)).toBe('stand');
  });
});

describe('Fighter residual + posture', () => {
  it('2LK: hold crouch does not clear residual', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.startMove(move({ moveId: 'ryu_2lk', clipId: '2lk' }));
    for (let i = 0; i < 16; i++) f.advance(adv);
    expect(f.hasAnimTail).toBe(true);
    f.applyPostureOrWalkIntent('crouch');
    expect(f.hasAnimTail).toBe(true);
    expect(f.phase).toBe('crouch');
    expect(f.clipId).toBe('2lk');
    // advance while holding crouch still ticks residual
    f.advance(adv);
    expect(f.hasAnimTail).toBe(true);
    expect(f.clipId).toBe('2lk');
  });

  it('2LK: release crouch interrupts residual → crouch_to_stand', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.setStanceConfig({ standToCrouchFrames: 4, crouchToStandFrames: 3 });
    f.startMove(move({ moveId: 'ryu_2lk', clipId: '2lk' }));
    for (let i = 0; i < 16; i++) f.advance(adv);
    f.applyPostureOrWalkIntent('crouch');
    expect(f.hasAnimTail).toBe(true);
    f.applyPostureOrWalkIntent('none');
    expect(f.hasAnimTail).toBe(false);
    expect(f.inStanceTransition).toBe(true);
    expect(f.animRole).toBe('crouch_to_stand');
    expect(f.clipId).toBe('crouch');
  });

  it('5LK: hold crouch interrupts stand residual → stand_to_crouch', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.setStanceConfig({ standToCrouchFrames: 4, crouchToStandFrames: 3 });
    f.startMove(
      move({
        moveId: 'ryu_5lk',
        clipId: '5lk',
        frames: { startup: 5, active: 3, recovery: 10, total: 18 },
        animFrameCount: 48,
      }),
    );
    for (let i = 0; i < 18; i++) f.advance(adv);
    expect(f.hasAnimTail).toBe(true);
    f.applyPostureOrWalkIntent('crouch');
    expect(f.hasAnimTail).toBe(false);
    expect(f.inStanceTransition).toBe(true);
    expect(f.animRole).toBe('stand_to_crouch');
    expect(f.phase).toBe('crouch');
    expect(f.clipId).toBe('crouch');
  });

  it('walk always interrupts residual', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.startMove(move({ moveId: 'ryu_2lk', clipId: '2lk' }));
    for (let i = 0; i < 16; i++) f.advance(adv);
    f.applyPostureOrWalkIntent('walk');
    expect(f.hasAnimTail).toBe(false);
    expect(f.phase).toBe('walk');
  });

  it('2LK residual ends on crouch idle when holding crouch', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.startMove(
      move({ moveId: 'ryu_2lk', clipId: '2lk', animFrameCount: 20 }),
    );
    for (let i = 0; i < 16; i++) f.advance(adv);
    f.applyPostureOrWalkIntent('crouch');
    // residual frames 16..19
    for (let i = 0; i < 4; i++) {
      f.applyPostureOrWalkIntent('crouch');
      f.advance(adv);
    }
    expect(f.hasAnimTail).toBe(false);
    expect(f.phase).toBe('crouch');
    expect(f.clipId).toBe('crouch');
  });
});
