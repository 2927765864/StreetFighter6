import { describe, expect, it } from 'vitest';
import {
  initialStanceState,
  stanceClip,
  stepStanceHold,
  tickStance,
} from '../../src/combat/loco/StanceController';
import { Fighter } from '../../src/combat/fighter/Fighter';
import type { MoveDefinition } from '../../src/combat/move/MoveDefinition';

const cfg = {
  standToCrouchFrames: 4,
  crouchToStandFrames: 3,
};

describe('StanceController', () => {
  it('stand + want crouch → to_crouch then crouch idle', () => {
    let s = initialStanceState(false);
    s = stepStanceHold(s, true, cfg);
    expect(s.seg).toBe('to_crouch');
    expect(stanceClip(s).animRole).toBe('stand_to_crouch');
    for (let i = 0; i < 4; i++) s = tickStance(s);
    expect(s.seg).toBe('none');
    expect(s.logicalCrouch).toBe(true);
    expect(stanceClip(s)).toEqual({ clipId: 'crouch', animRole: 'main' });
  });

  it('crouch + want stand → to_stand then stand idle', () => {
    let s = initialStanceState(true);
    s = stepStanceHold(s, false, cfg);
    expect(s.seg).toBe('to_stand');
    expect(stanceClip(s).animRole).toBe('crouch_to_stand');
    for (let i = 0; i < 3; i++) s = tickStance(s);
    expect(s.logicalCrouch).toBe(false);
    expect(stanceClip(s).clipId).toBe('idle');
  });

  it('reverse mid to_crouch restarts to_stand', () => {
    let s = stepStanceHold(initialStanceState(false), true, cfg);
    s = tickStance(s);
    s = stepStanceHold(s, false, cfg);
    expect(s.seg).toBe('to_stand');
    expect(s.frame).toBe(0);
  });
});

const standLp = (): MoveDefinition => ({
  id: 'ryu_5lp',
  characterId: 'ryu',
  moveId: 'ryu_5lp',
  displayName: '5LP',
  frames: { startup: 4, active: 3, recovery: 6, total: 13 },
  advantage: { onHit: 0, onBlock: 0 },
  damage: 300,
  hitstun: 10,
  blockstun: 8,
  cancel: { specialCancel: true, targetCombo: [], windows: [] },
  boxes: {
    hurt: [{ from: 0, to: 12, x: 0, y: 0.85, w: 0.7, h: 1.7 }],
    hit: [{ from: 3, to: 5, x: 0.5, y: 1, w: 0.5, h: 0.4 }],
  },
  clipId: '5lp',
  facingRelative: true,
  review: { status: 'test', notes: '' },
  animFrameCount: 20,
});

const adv = {
  airFrames: 38,
  landingFrames: 3,
  dashSpeed: 0.05,
};

describe('Fighter stance after attack', () => {
  it('5LP then hold crouch enters stand_to_crouch not crouch main', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.setStanceConfig(cfg);
    f.startMove(standLp());
    for (let i = 0; i < 13; i++) f.advance(adv);
    // residual may be active
    f.applyPostureOrWalkIntent('crouch');
    expect(f.hasAnimTail).toBe(false);
    expect(f.inStanceTransition).toBe(true);
    expect(f.animRole).toBe('stand_to_crouch');
    expect(f.clipId).toBe('crouch');
    expect(f.phase).toBe('crouch');
  });

  it('idle stand → crouch uses transition', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.setStanceConfig(cfg);
    f.applyPostureOrWalkIntent('crouch');
    expect(f.animRole).toBe('stand_to_crouch');
    for (let i = 0; i < 4; i++) f.advance(adv);
    expect(f.inStanceTransition).toBe(false);
    expect(f.animRole).toBe('main');
    expect(f.clipId).toBe('crouch');
  });

  it('crouch residual hold does not start stand_to_crouch', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.setStanceConfig(cfg);
    f.startMove({
      ...standLp(),
      id: 'ryu_2lk',
      moveId: 'ryu_2lk',
      clipId: '2lk',
      frames: { startup: 5, active: 2, recovery: 9, total: 16 },
      animFrameCount: 24,
    });
    for (let i = 0; i < 16; i++) f.advance(adv);
    f.applyPostureOrWalkIntent('crouch');
    expect(f.hasAnimTail).toBe(true);
    expect(f.inStanceTransition).toBe(false);
    expect(f.clipId).toBe('2lk');
  });

  it('walk then crouch leaves walk and starts stand_to_crouch (no freeze)', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.setStanceConfig(cfg);
    f.phase = 'walk';
    f.clipId = 'walk_fwd';
    f.animRole = 'loop';
    f.locoPhase = 'loop';
    f.locoFrame = 10;
    f.applyPostureOrWalkIntent('crouch');
    expect(f.phase).not.toBe('walk');
    expect(f.locoPhase).toBe('none');
    expect(f.inStanceTransition).toBe(true);
    expect(f.animRole).toBe('stand_to_crouch');
    expect(f.clipId).toBe('crouch');
    expect(f.phase).toBe('crouch');
  });
});

