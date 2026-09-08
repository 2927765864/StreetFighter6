import { describe, expect, it } from 'vitest';
import { sourceFrameAt, type FlipbookLayer } from '../../src/hitVfxEditor/flipbook2d/types';

const layer = (over: Partial<FlipbookLayer> = {}): FlipbookLayer => ({
  id: 'E1_core_flash',
  name: 'E1',
  enabled: true,
  z: 0,
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  opacity: 1,
  brightness: 1,
  lift: 0,
  despill: 0.35,
  startFrame: 1,
  duration: 10,
  blend: 'add',
  ...over,
});

describe('sourceFrameAt', () => {
  it('hides before start and after duration', () => {
    const l = layer();
    expect(sourceFrameAt(l, 0, 10)).toBeNull();
    expect(sourceFrameAt(l, 1, 10)).toBe(0);
    expect(sourceFrameAt(l, 10, 10)).toBe(9);
    expect(sourceFrameAt(l, 11, 10)).toBeNull();
  });

  it('respects enabled and source length', () => {
    expect(sourceFrameAt(layer({ enabled: false }), 2, 10)).toBeNull();
    expect(sourceFrameAt(layer({ duration: 14 }), 12, 10)).toBeNull();
    expect(sourceFrameAt(layer({ duration: 14 }), 10, 14)).toBe(9);
  });
});
