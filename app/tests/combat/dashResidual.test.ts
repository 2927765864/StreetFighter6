import { describe, expect, it } from 'vitest';
import { Fighter } from '../../src/combat/fighter/Fighter';
import {
  defaultCrossfadeDurations,
  resolveCrossfadeSec,
} from '../../src/combat/anim/AnimCrossfade';

const adv = {
  airFrames: 38,
  landingFrames: 3,
  dashSpeed: 0.05,
};

describe('dash residual §3.7.1', () => {
  it('after logic 19f: canAct with dash residual, not hard idle', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.startDash(true, 19, 42);
    for (let i = 0; i < 19; i++) f.advance(adv);
    expect(f.phase).toBe('idle');
    expect(f.canAct()).toBe(true);
    expect(f.hasAnimTail).toBe(true);
    expect(f.clipId).toBe('dash_fwd');
    expect(f.animTail!.visualFrame).toBe(19);
    expect(f.animTail!.animFrameCount).toBe(42);
  });

  it('no input plays residual to animFrameCount then idle', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.startDash(true, 19, 22);
    for (let i = 0; i < 19; i++) f.advance(adv);
    expect(f.hasAnimTail).toBe(true);
    for (let i = 0; i < 3; i++) f.advance(adv);
    expect(f.hasAnimTail).toBe(false);
    expect(f.clipId).toBe('idle');
  });

  it('walk interrupts dash residual', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.startDash(false, 23, 40);
    for (let i = 0; i < 23; i++) f.advance(adv);
    expect(f.clipId).toBe('dash_back');
    f.setIdleWalk('walk');
    expect(f.hasAnimTail).toBe(false);
    expect(f.phase).toBe('walk');
  });

  it('new attack interrupts dash residual', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.startDash(true, 19, 42);
    for (let i = 0; i < 19; i++) f.advance(adv);
    f.startMove({
      id: 't',
      characterId: 'ryu',
      moveId: '5lp',
      displayName: 't',
      frames: { startup: 4, active: 2, recovery: 8, total: 14 },
      advantage: { onHit: 0, onBlock: 0 },
      damage: 1,
      hitstun: 1,
      blockstun: 1,
      cancel: { specialCancel: false, targetCombo: [], windows: [] },
      boxes: { hurt: [], hit: [] },
      clipId: '5lp',
      facingRelative: true,
      review: { status: 'test', notes: '' },
      animFrameCount: 30,
    });
    expect(f.hasAnimTail).toBe(false);
    expect(f.phase).toBe('attack');
    expect(f.clipId).toBe('5lp');
  });

  it('animFrameCount <= logic means no residual', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.startDash(true, 19, 19);
    for (let i = 0; i < 19; i++) f.advance(adv);
    expect(f.hasAnimTail).toBe(false);
    expect(f.clipId).toBe('idle');
  });

  it('dash residual → idle uses residualToMove crossfade policy', () => {
    const d = defaultCrossfadeDurations({ residualToMoveSec: 0.1 });
    expect(resolveCrossfadeSec('dash_fwd::main', 'idle::main', d)).toBe(0.1);
    expect(resolveCrossfadeSec('dash_back::main', 'walk_fwd::start', d)).toBe(
      0.1,
    );
    expect(resolveCrossfadeSec('idle::main', 'dash_fwd::main', d)).toBe(0);
  });
});
