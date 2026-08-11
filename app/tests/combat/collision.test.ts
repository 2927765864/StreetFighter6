import { describe, expect, it } from 'vitest';
import { aabbOverlap, faceBox } from '../../src/combat/boxes/Box2D';

describe('Box2D', () => {
  it('detects overlap', () => {
    expect(aabbOverlap({ x: 0, y: 0, w: 2, h: 2 }, { x: 1, y: 0, w: 2, h: 2 })).toBe(
      true,
    );
  });

  it('detects separation', () => {
    expect(aabbOverlap({ x: 0, y: 0, w: 1, h: 1 }, { x: 5, y: 0, w: 1, h: 1 })).toBe(
      false,
    );
  });

  it('flips local hit box with facing -1', () => {
    const w = faceBox({ x: 0.5, y: 1, w: 0.4, h: 0.3 }, 0, 0, -1);
    expect(w.x).toBeCloseTo(-0.5);
    const e = faceBox({ x: 0.5, y: 1, w: 0.4, h: 0.3 }, 0, 0, 1);
    expect(e.x).toBeCloseTo(0.5);
  });
});
