import { describe, expect, it } from 'vitest';
import { faceBox } from '../../src/combat/boxes/Box2D';
import { worldToLocal } from '../../src/boxEditor/document/BoxEditorDocument';

describe('faceBox inverse (ADR-002)', () => {
  it('round-trips facing +1', () => {
    const local = { x: 0.94, y: 1.58, w: 0.5, h: 0.34 };
    const world = faceBox(local, 0, 0, 1);
    const back = worldToLocal(world, 0, 0, 1);
    expect(back.x).toBeCloseTo(local.x);
    expect(back.y).toBeCloseTo(local.y);
  });

  it('round-trips facing -1', () => {
    const local = { x: 0.94, y: 1.58, w: 0.5, h: 0.34 };
    const world = faceBox(local, 1, 0.2, -1);
    const back = worldToLocal(world, 1, 0.2, -1);
    expect(back.x).toBeCloseTo(local.x);
    expect(back.y).toBeCloseTo(local.y);
    expect(world.x).toBeCloseTo(1 - 0.94);
  });
});
