import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  flipbookFacingScaleX,
  flipbookSpinRad,
  layerLocalOffset,
} from '../../src/hitVfxEditor/flipbook2d/Flipbook2DCombat';
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

describe('flipbook facing / layer offset', () => {
  it('mirrors when defender faces +X (hit from the right)', () => {
    // Defender on the right (facing -1): authored left→right sheet.
    expect(flipbookFacingScaleX(-1)).toBe(1);
    // Defender on the left (facing +1): mirror for right→left attack.
    expect(flipbookFacingScaleX(1)).toBe(-1);
    expect(flipbookFacingScaleX(0)).toBe(1);
  });

  it('maps authored CSS-pixel offsets into local billboard space', () => {
    const p = layerLocalOffset({ offsetX: 192, offsetY: 96, z: 3 }, 1.8);
    expect(p.x).toBeCloseTo(0.9, 5);
    expect(p.y).toBeCloseTo(-0.45, 5);
    expect(p.z).toBeCloseTo(0.006, 5);
  });
});

describe('flipbookSpinRad (punch impulse on camera plane)', () => {
  const right = new THREE.Vector3(1, 0, 0);
  const up = new THREE.Vector3(0, 1, 0);

  it('is 0 for horizontal punch matching authored +X / mirrored −X', () => {
    expect(
      flipbookSpinRad(new THREE.Vector3(1, 0, 0), right, up, 1),
    ).toBeCloseTo(0, 5);
    expect(
      flipbookSpinRad(new THREE.Vector3(-1, 0, 0), right, up, -1),
    ).toBeCloseTo(0, 5);
  });

  it('tilts up for an uppercut from the left (unmirrored)', () => {
    const rad = flipbookSpinRad(new THREE.Vector3(1, 1, 0), right, up, 1);
    expect(rad).toBeCloseTo(Math.PI / 4, 5);
  });

  it('tilts the mirrored sheet so leftward+up punch stays 45°', () => {
    const rad = flipbookSpinRad(new THREE.Vector3(-1, 1, 0), right, up, -1);
    expect(rad).toBeCloseTo(Math.PI / 4, 5);
  });

  it('ignores camera-forward (depth) and near-zero dirs', () => {
    expect(
      flipbookSpinRad(new THREE.Vector3(0, 0, 4), right, up, 1),
    ).toBe(0);
    expect(
      flipbookSpinRad(new THREE.Vector3(0, 0, 0), right, up, 1),
    ).toBe(0);
  });
});
