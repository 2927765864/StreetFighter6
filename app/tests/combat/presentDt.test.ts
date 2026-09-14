import { describe, expect, it } from 'vitest';
import { resolvePresentDt } from '../../src/combat/presentDt';
import { freeRunAnimDtSec } from '../../src/render/AnimScrub';

describe('resolvePresentDt', () => {
  it('uses wall presentAccum when not paused', () => {
    expect(
      resolvePresentDt({ paused: false, logicSteps: 0, presentAccum: 0.02 }),
    ).toBe(0.02);
    expect(
      resolvePresentDt({ paused: false, logicSteps: 2, presentAccum: 1 / 60 }),
    ).toBeCloseTo(1 / 60);
  });

  it('freezes to 0 when paused with no logic steps (no wall leak)', () => {
    expect(
      resolvePresentDt({ paused: true, logicSteps: 0, presentAccum: 1.5 }),
    ).toBe(0);
  });

  it('uses authored n/60 when paused with queued steps', () => {
    expect(
      resolvePresentDt({ paused: true, logicSteps: 1, presentAccum: 0.5 }),
    ).toBeCloseTo(1 / 60);
    expect(
      resolvePresentDt({ paused: true, logicSteps: 3, presentAccum: 9 }),
    ).toBeCloseTo(3 / 60);
  });

  it('matches 60 continuous single-steps to one second of free-run', () => {
    let sum = 0;
    for (let i = 0; i < 60; i++) {
      sum += resolvePresentDt({
        paused: true,
        logicSteps: 1,
        presentAccum: 99,
      });
    }
    expect(sum).toBeCloseTo(1);
    // freeRunAnimDtSec caps a single call at 0.1s; per-step contract is uncapped 1/60.
    expect(sum).toBeCloseTo(60 * freeRunAnimDtSec(1, 1));
  });
});
