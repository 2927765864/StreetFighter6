import { describe, expect, it } from 'vitest';
import {
  parseBlend,
  parseTint,
  threeBlendParams,
  tintFromLayer,
} from '../../src/hitVfxEditor/flipbook2d/layerLook';
import {
  flipbookWorldSize,
  prepLookForBlend,
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

  it('steam is white PMA fog; density from luma×alpha', () => {
    const dark = new Uint8ClampedArray([40, 40, 40, 200]);
    processImageData(dark, 0, 'steam');
    const dens = Math.round(255 * (40 / 255) * (200 / 255));
    expect(dark[0]).toBe(dens);
    expect(dark[3]).toBe(dens);
  });

  it('steam never writes dark RGB: channels equal alpha', () => {
    const p = new Uint8ClampedArray([30, 30, 30, 180]);
    processImageData(p, 0, 'steam', { dark: 4, bright: 1 });
    expect(p[0]).toBe(p[1]);
    expect(p[0]).toBe(p[2]);
    expect(p[0]).toBe(p[3]);
  });

  it('steam liftDark=12 can match core density', () => {
    const dark = new Uint8ClampedArray([20, 20, 20, 255]);
    const bright = new Uint8ClampedArray([230, 230, 230, 255]);
    processImageData(dark, 0, 'steam', { dark: 12, bright: 0 });
    processImageData(bright, 0, 'steam', { dark: 12, bright: 0 });
    expect(dark[0]!).toBeGreaterThanOrEqual(bright[0]! - 12);
  });

  it('steam liftDark 12 is stronger than 2 on faint wisps', () => {
    const mk = () => new Uint8ClampedArray([220, 220, 220, 40]);
    const a0 = mk();
    const a2 = mk();
    const a12 = mk();
    processImageData(a0, 0, 'steam', { dark: 0, bright: 0 });
    processImageData(a2, 0, 'steam', { dark: 2, bright: 0 });
    processImageData(a12, 0, 'steam', { dark: 12, bright: 0 });
    expect(a2[0]!).toBeGreaterThan(a0[0]!);
    expect(a12[0]!).toBeGreaterThan(a2[0]!);
    expect(a12[0]).toBe(a12[3]);
  });

  it('steam liftBright raises cores more than shadows', () => {
    const dark = new Uint8ClampedArray([30, 30, 30, 255]);
    const bright = new Uint8ClampedArray([180, 180, 180, 255]);
    const dark0 = new Uint8ClampedArray(dark);
    const bright0 = new Uint8ClampedArray(bright);
    processImageData(dark0, 0, 'steam', { dark: 0, bright: 0 });
    processImageData(bright0, 0, 'steam', { dark: 0, bright: 0 });
    processImageData(dark, 0, 'steam', { dark: 0, bright: 2 });
    processImageData(bright, 0, 'steam', { dark: 0, bright: 2 });
    expect(bright[0]! - bright0[0]!).toBeGreaterThan(dark[0]! - dark0[0]!);
  });
});

describe('parseBlend', () => {
  it('accepts screen/add/normal', () => {
    expect(parseBlend('screen')).toBe('screen');
    expect(parseBlend('steam')).toBe('steam');
    expect(parseBlend('add')).toBe('add');
    expect(parseBlend('nope')).toBe('normal');
  });
});

describe('threeBlendParams screen vs steam', () => {
  const THREE = {
    NormalBlending: 1,
    AdditiveBlending: 2,
    CustomBlending: 3,
    AddEquation: 100,
    OneFactor: 201,
    OneMinusSrcColorFactor: 202,
    OneMinusSrcAlphaFactor: 203,
    OneMinusDstColorFactor: 204,
  };

  it('screen is original dest-color 滤色', () => {
    const p = threeBlendParams('screen', THREE);
    expect(p.blending).toBe(THREE.CustomBlending);
    expect(p.blendSrc).toBe(THREE.OneMinusDstColorFactor);
    expect(p.blendDst).toBe(THREE.OneFactor);
  });

  it('steam is lifted-grey over', () => {
    const p = threeBlendParams('steam', THREE);
    expect(p.blending).toBe(THREE.NormalBlending);
    expect(p.toneMapped).toBe(false);
    expect(prepLookForBlend('steam')).toBe('steam');
    expect(prepLookForBlend('screen')).toBe('premul');
  });
});

describe('steam tint', () => {
  it('parses hex and multiplies only in steam blend', () => {
    expect(parseTint('#ABC')).toBe('#aabbcc');
    expect(parseTint('nope')).toBe('#ffffff');
    const steam = tintFromLayer({
      blend: 'steam',
      brightness: 1,
      lift: 0,
      tint: '#ffcc99',
    } as never);
    expect(steam.r).toBeCloseTo(1);
    expect(steam.g).toBeCloseTo(0xcc / 255);
    expect(steam.b).toBeCloseTo(0x99 / 255);
    const screen = tintFromLayer({
      blend: 'screen',
      brightness: 1.2,
      lift: 0,
      tint: '#ff0000',
    } as never);
    expect(screen.r).toBeCloseTo(1.2);
    expect(screen.g).toBeCloseTo(1.2);
  });
});

describe('flipbookWorldSize', () => {
  it('maps legacy pixel sizes into world units', () => {
    expect(flipbookWorldSize(360)).toBeCloseTo(1.8, 5);
  });
});
