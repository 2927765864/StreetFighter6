import { describe, expect, it } from 'vitest';
import {
  initialWalkStartCommitState,
  normalizeWalkStartCommitHoldFrames,
  stepWalkStartCommit,
} from '../../src/combat/loco/WalkStartCommit';

describe('WalkStartCommit', () => {
  it('normalizes hold frames to 0..20', () => {
    expect(normalizeWalkStartCommitHoldFrames(2)).toBe(2);
    expect(normalizeWalkStartCommitHoldFrames(0)).toBe(0);
    expect(normalizeWalkStartCommitHoldFrames(99)).toBe(20);
    expect(normalizeWalkStartCommitHoldFrames(Number.NaN)).toBe(2);
  });

  it('default N=2: press frame does not commit; second hold commits', () => {
    let s = initialWalkStartCommitState();
    s = stepWalkStartCommit(s, {
      locoPhase: 'start',
      holdingWalk: true,
      enteredStart: true,
      commitHoldFrames: 2,
    });
    expect(s.holdFrames).toBe(1);
    expect(s.committed).toBe(false);

    s = stepWalkStartCommit(s, {
      locoPhase: 'start',
      holdingWalk: true,
      enteredStart: false,
      commitHoldFrames: 2,
    });
    expect(s.holdFrames).toBe(2);
    expect(s.committed).toBe(true);
  });

  it('tap: enter start then leave to end never commits', () => {
    let s = initialWalkStartCommitState();
    s = stepWalkStartCommit(s, {
      locoPhase: 'start',
      holdingWalk: true,
      enteredStart: true,
      commitHoldFrames: 2,
    });
    expect(s.committed).toBe(false);
    s = stepWalkStartCommit(s, {
      locoPhase: 'end',
      holdingWalk: false,
      enteredStart: false,
      commitHoldFrames: 2,
    });
    expect(s.holdFrames).toBe(0);
    expect(s.committed).toBe(false);
  });

  it('N=0 disables the scheme: commit on the press frame', () => {
    const s = stepWalkStartCommit(initialWalkStartCommitState(), {
      locoPhase: 'start',
      holdingWalk: true,
      enteredStart: true,
      commitHoldFrames: 0,
    });
    expect(s.committed).toBe(true);
    expect(s.holdFrames).toBe(1);
  });

  it('N=1 commits on the press frame (legacy)', () => {
    const s = stepWalkStartCommit(initialWalkStartCommitState(), {
      locoPhase: 'start',
      holdingWalk: true,
      enteredStart: true,
      commitHoldFrames: 1,
    });
    expect(s.committed).toBe(true);
    expect(s.holdFrames).toBe(1);
  });

  it('re-enter start from end resets hold', () => {
    let s = stepWalkStartCommit(initialWalkStartCommitState(), {
      locoPhase: 'start',
      holdingWalk: true,
      enteredStart: true,
      commitHoldFrames: 2,
    });
    s = stepWalkStartCommit(s, {
      locoPhase: 'end',
      holdingWalk: false,
      enteredStart: false,
      commitHoldFrames: 2,
    });
    s = stepWalkStartCommit(s, {
      locoPhase: 'start',
      holdingWalk: true,
      enteredStart: true,
      commitHoldFrames: 2,
    });
    expect(s.holdFrames).toBe(1);
    expect(s.committed).toBe(false);
  });
});
