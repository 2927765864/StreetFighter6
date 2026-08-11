import { describe, expect, it } from 'vitest';
import { Fighter } from '../../src/combat/fighter/Fighter';
import type { MoveDefinition } from '../../src/combat/move/MoveDefinition';
import { parseMoveDefinition } from '../../src/combat/move/MoveDefinition';

const baseMove = (over: Partial<MoveDefinition> = {}): MoveDefinition => ({
  id: 'test_5lk',
  characterId: 'ryu',
  moveId: 'ryu_5lk',
  displayName: 'test 5lk',
  frames: { startup: 5, active: 3, recovery: 10, total: 18 },
  advantage: { onHit: 2, onBlock: -4 },
  damage: 300,
  hitstun: 16,
  blockstun: 10,
  cancel: {
    specialCancel: true,
    targetCombo: [],
    windows: [],
  },
  boxes: {
    hurt: [{ from: 0, to: 17, x: 0, y: 0.85, w: 0.7, h: 1.7 }],
    hit: [{ from: 4, to: 6, x: 0.5, y: 1.1, w: 0.5, h: 0.4 }],
  },
  clipId: '5lk',
  facingRelative: true,
  review: { status: 'test', notes: '' },
  animFrameCount: 48,
  ...over,
});

const adv = {
  airFrames: 38,
  landingFrames: 3,
  dashSpeed: 0.05,
};

describe('anim residual tail §3.7.1', () => {
  it('after logic total: canAct idle with residual clip, not hard idle yet', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.startMove(baseMove());
    for (let i = 0; i < 18; i++) f.advance(adv);
    expect(f.phase).toBe('idle');
    expect(f.canAct()).toBe(true);
    expect(f.hasAnimTail).toBe(true);
    expect(f.clipId).toBe('5lk');
    expect(f.animTail!.visualFrame).toBe(18);
    expect(f.mover.move).toBeNull();
  });

  it('no input plays residual to animFrameCount then idle clip', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.startMove(baseMove({ animFrameCount: 22 }));
    for (let i = 0; i < 18; i++) f.advance(adv);
    expect(f.hasAnimTail).toBe(true);
    // residual frames 18..21 → 4 more ticks
    for (let i = 0; i < 4; i++) f.advance(adv);
    expect(f.hasAnimTail).toBe(false);
    expect(f.clipId).toBe('idle');
  });

  it('walk interrupts residual', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.startMove(baseMove());
    for (let i = 0; i < 18; i++) f.advance(adv);
    expect(f.hasAnimTail).toBe(true);
    f.setIdleWalk('walk');
    expect(f.hasAnimTail).toBe(false);
    expect(f.phase).toBe('walk');
  });

  it('new move interrupts residual', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.startMove(baseMove());
    for (let i = 0; i < 18; i++) f.advance(adv);
    f.startMove(baseMove({ id: 'b', clipId: '5lp', animFrameCount: 39 }));
    expect(f.hasAnimTail).toBe(false);
    expect(f.phase).toBe('attack');
    expect(f.clipId).toBe('5lp');
  });

  it('animFrameCount <= total means no residual', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.startMove(baseMove({ animFrameCount: 18 }));
    for (let i = 0; i < 18; i++) f.advance(adv);
    expect(f.hasAnimTail).toBe(false);
    expect(f.clipId).toBe('idle');
  });

  it('parseMoveDefinition reads _fN from glbPath', () => {
    const m = parseMoveDefinition({
      id: 'ryu_5lk',
      characterId: 'ryu',
      frames: { startup: 5, active: 3, recovery: 10, total: 18 },
      boxes: { hurt: [], hit: [] },
      glbPath: 'attack/esf001v00_attack_03/glb/000_esf001_ATK_5LK_id0000_f48.glb',
      clipId: '5lk',
    });
    expect(m.animFrameCount).toBe(48);
    expect(m.frames.total).toBe(18);
  });
});
