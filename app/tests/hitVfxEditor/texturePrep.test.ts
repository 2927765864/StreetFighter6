import { describe, expect, it } from 'vitest';
import { parseBlend } from '../../src/hitVfxEditor/flipbook2d/layerLook';
import {
  flipbookWorldSize,
  processImageData,
} from '../../src/hitVfxEditor/flipbook2d/texturePrep';

describe('processImageData', () => {
  it('with despill=0 only premuls, keeps grey smoke', () => {
    const data = new Uint8ClampedArray([150, 150, 150, 255]);
    processImageData(data, 0);
    expect(data[0]).toBe(150);
    expect(data[3]).toBe(255);
  });

  it('with despill=1 clears near-black opaque pixels', () => {
    const data = new Uint8ClampedArray([8, 8, 8, 255]);
    processImageData(data, 1);
    expect(data[3]!).toBeLessThan(40);
  });
});

describe('parseBlend', () => {
  it('accepts screen/add/normal', () => {
    expect(parseBlend('screen')).toBe('screen');
    expect(parseBlend('add')).toBe('add');
    expect(parseBlend('nope')).toBe('normal');
  });
});

describe('flipbookWorldSize', () => {
  it('maps legacy pixel sizes into world units', () => {
    expect(flipbookWorldSize(360)).toBeCloseTo(1.8, 5);
  });
});
