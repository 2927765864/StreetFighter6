import { describe, expect, it } from 'vitest';
import { resolvePush, placeCumToDx } from '../../src/combat/systems/PushResolve';
import type { Box } from '../../src/combat/boxes/Box2D';

function body(x: number, push: Box) {
  return {
    x,
    worldPushBoxes(this: { x: number }) {
      return [{ x: this.x + push.x, y: push.y, w: push.w, h: push.h }];
    },
  };
}

describe('resolvePush', () => {
  it('separates overlapping push boxes equally', () => {
    const a = body(-0.2, { x: 0, y: 0.7, w: 0.6, h: 1.4 });
    const b = body(0.2, { x: 0, y: 0.7, w: 0.6, h: 1.4 });
    const r = resolvePush(a, b, { minX: -5, maxX: 5 });
    expect(r.separated).toBe(true);
    expect(a.x).toBeLessThan(-0.2);
    expect(b.x).toBeGreaterThan(0.2);
    // No longer overlapping after resolve
    const r2 = resolvePush(a, b, { minX: -5, maxX: 5 });
    expect(r2.maxOverlapX).toBeLessThanOrEqual(1e-5);
  });

  it('corner: wall-bound body forces free body out', () => {
    const a = body(-5, { x: 0, y: 0.7, w: 0.8, h: 1.4 });
    const b = body(-4.7, { x: 0, y: 0.7, w: 0.8, h: 1.4 });
    resolvePush(a, b, { minX: -5, maxX: 5 });
    expect(a.x).toBeCloseTo(-5, 5);
    expect(b.x).toBeGreaterThan(-4.7);
  });

  it('disabled leaves positions', () => {
    const a = body(0, { x: 0, y: 0.7, w: 1, h: 1 });
    const b = body(0.1, { x: 0, y: 0.7, w: 1, h: 1 });
    resolvePush(a, b, { minX: -5, maxX: 5 }, { enabled: false });
    expect(a.x).toBe(0);
    expect(b.x).toBe(0.1);
  });
});

describe('placeCumToDx', () => {
  it('diffs cumulative Place positions', () => {
    expect(placeCumToDx([0, 0.1, 0.25, 0.25])).toEqual([0, 0.1, 0.15, 0]);
  });
});
