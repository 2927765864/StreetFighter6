import { describe, expect, it } from 'vitest';
import {
  initialWalkInputFreezeState,
  stepWalkInputFreeze,
  walkDirFromRel,
} from '../../src/combat/loco/WalkInputFreeze';

describe('WalkInputFreeze', () => {
  it('walkDirFromRel maps 6/4 only', () => {
    expect(walkDirFromRel(6)).toBe('fwd');
    expect(walkDirFromRel(4)).toBe('back');
    expect(walkDirFromRel(5)).toBe(null);
    expect(walkDirFromRel(8)).toBe(null);
  });

  it('press edge arms freeze for N frames then justEnded + forceStartFrom0', () => {
    let s = initialWalkInputFreezeState();
    s = stepWalkInputFreeze(s, {
      walkDir: 'fwd',
      freezeFrames: 4,
      cancel: false,
    });
    expect(s.active).toBe(true);
    expect(s.captureSnap).toBe(true);
    expect(s.remain).toBe(4);
    expect(s.prevDir).toBe('fwd');

    // hold: no reset, countdown
    for (let i = 0; i < 3; i++) {
      s = stepWalkInputFreeze(s, {
        walkDir: 'fwd',
        freezeFrames: 4,
        cancel: false,
      });
      expect(s.captureSnap).toBe(false);
      expect(s.active).toBe(true);
    }
    s = stepWalkInputFreeze(s, {
      walkDir: 'fwd',
      freezeFrames: 4,
      cancel: false,
    });
    expect(s.active).toBe(false);
    expect(s.justEnded).toBe(true);
    expect(s.forceStartFrom0).toBe(true);
  });

  it('hold does not reset; opposite edge resets and recaptures', () => {
    let s = initialWalkInputFreezeState();
    s = stepWalkInputFreeze(s, {
      walkDir: 'fwd',
      freezeFrames: 4,
      cancel: false,
    });
    s = stepWalkInputFreeze(s, {
      walkDir: 'fwd',
      freezeFrames: 4,
      cancel: false,
    });
    expect(s.remain).toBe(3);

    s = stepWalkInputFreeze(s, {
      walkDir: 'back',
      freezeFrames: 4,
      cancel: false,
    });
    expect(s.captureSnap).toBe(true);
    expect(s.remain).toBe(4);
    expect(s.active).toBe(true);
    expect(s.prevDir).toBe('back');
  });

  it('release during freeze → justEnded without forceStartFrom0', () => {
    let s = initialWalkInputFreezeState();
    s = stepWalkInputFreeze(s, {
      walkDir: 'fwd',
      freezeFrames: 2,
      cancel: false,
    });
    s = stepWalkInputFreeze(s, {
      walkDir: null,
      freezeFrames: 2,
      cancel: false,
    });
    // remain was 2, then hold null: not edge, countdown 1 — still active
    expect(s.active).toBe(true);
    s = stepWalkInputFreeze(s, {
      walkDir: null,
      freezeFrames: 2,
      cancel: false,
    });
    expect(s.active).toBe(false);
    expect(s.justEnded).toBe(true);
    expect(s.forceStartFrom0).toBe(false);
  });

  it('cancel clears freeze (dash / attack)', () => {
    let s = initialWalkInputFreezeState();
    s = stepWalkInputFreeze(s, {
      walkDir: 'fwd',
      freezeFrames: 4,
      cancel: false,
    });
    expect(s.active).toBe(true);
    s = stepWalkInputFreeze(s, {
      walkDir: 'fwd',
      freezeFrames: 4,
      cancel: true,
    });
    expect(s.active).toBe(false);
    expect(s.remain).toBe(0);
    expect(s.justEnded).toBe(false);
    expect(s.prevDir).toBe('fwd');
  });

  it('freezeFrames 0 never arms', () => {
    let s = initialWalkInputFreezeState();
    s = stepWalkInputFreeze(s, {
      walkDir: 'fwd',
      freezeFrames: 0,
      cancel: false,
    });
    expect(s.active).toBe(false);
    expect(s.captureSnap).toBe(false);
    expect(s.prevDir).toBe('fwd');
  });
});
