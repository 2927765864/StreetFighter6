import { describe, expect, it } from 'vitest';
import { FrameClock } from '../../src/combat/frameClock';

describe('FrameClock', () => {
  it('advances ~60 logic frames with 60 wall steps of 1/60s', () => {
    const c = new FrameClock(1 / 60, 8, 0.1);
    let stepsTotal = 0;
    for (let i = 0; i < 60; i++) {
      stepsTotal += c.tick(1 / 60);
    }
    expect(c.logicFrame).toBe(60);
    expect(stepsTotal).toBe(60);
  });

  it('caps steps on large wallDt (spiral of death guard)', () => {
    const c = new FrameClock(1 / 60, 4, 1.0);
    const steps = c.tick(1.0);
    expect(steps).toBeLessThanOrEqual(4);
    expect(c.logicFrame).toBe(steps);
  });
});
