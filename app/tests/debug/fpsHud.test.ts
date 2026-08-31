import { describe, expect, it } from 'vitest';
import { computeIntegerFps, FPS_HUD_REFRESH_MS } from '../../src/debug/FpsHud';

describe('computeIntegerFps', () => {
  it('reports integer 60 for 30 frames in 500ms', () => {
    expect(FPS_HUD_REFRESH_MS).toBe(500);
    expect(computeIntegerFps(30, 500)).toBe(60);
  });

  it('has no fractional component', () => {
    const fps = computeIntegerFps(31, 500);
    expect(Number.isInteger(fps)).toBe(true);
    expect(String(fps)).not.toMatch(/\./);
  });

  it('returns 0 for empty/invalid windows', () => {
    expect(computeIntegerFps(0, 500)).toBe(0);
    expect(computeIntegerFps(10, 0)).toBe(0);
  });
});
