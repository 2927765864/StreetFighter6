import { describe, expect, it } from 'vitest';
import {
  buildFrontHeavyDashDx,
  frontHeavyWeights,
  sumDx,
} from '../../src/combat/loco/DashProfile';
import { Fighter } from '../../src/combat/fighter/Fighter';

describe('dash front-heavy profile', () => {
  it('weights decrease over the dash (前重后轻)', () => {
    const w = frontHeavyWeights(19, 1.5);
    expect(w[0]!).toBeGreaterThan(w[9]!);
    expect(w[9]!).toBeGreaterThan(w[18]!);
  });

  it('dx sums to published distance', () => {
    const dx = buildFrontHeavyDashDx(19, 1.252, 1.5);
    expect(dx.length).toBe(19);
    expect(sumDx(dx)).toBeCloseTo(1.252, 10);
    expect(dx[0]!).toBeGreaterThan(dx[dx.length - 1]!);
  });

  it('back dash 23f sums to 0.923', () => {
    const dx = buildFrontHeavyDashDx(23, 0.923, 1.5);
    expect(dx.length).toBe(23);
    expect(sumDx(dx)).toBeCloseTo(0.923, 10);
  });

  it('fighter applies profile: total distance matches, early frames larger', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    const dx = buildFrontHeavyDashDx(19, 1.252, 1.5);
    f.startDash(true, 19, 42);
    const x0 = f.x;
    const early: number[] = [];
    const late: number[] = [];
    for (let i = 0; i < 19; i++) {
      const before = f.x;
      f.advance({
        airFrames: 38,
        landingFrames: 3,
        dashSpeed: 1.252 / 19,
        dashDx: dx,
      });
      const step = f.x - before;
      if (i < 5) early.push(step);
      if (i >= 14) late.push(step);
    }
    expect(f.x - x0).toBeCloseTo(1.252, 8);
    const earlyAvg = early.reduce((a, b) => a + b, 0) / early.length;
    const lateAvg = late.reduce((a, b) => a + b, 0) / late.length;
    expect(earlyAvg).toBeGreaterThan(lateAvg);
    expect(f.canAct()).toBe(true);
  });
});
