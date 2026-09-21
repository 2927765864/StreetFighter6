import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultCmosShakeConfig, mergeCmosShakeConfig } from '../../src/config/cmosShake';
import { CONFIG } from '../../src/config/store';
import { CmosScreenShake } from '../../src/motion/CmosScreenShake';
import {
  SpringDamper1D,
  springHalfCycleFrames,
} from '../../src/motion/SpringDamper1D';
import { ScreenShakeFx } from '../../src/render/ScreenShakeFx';
import { PerspectiveCamera } from 'three';

const backup = CONFIG.cmosShake;
afterEach(() => { CONFIG.cmosShake = backup; });

function configure(wn = 90, zeta = 0.46): void {
  CONFIG.cmosShake = {
    ...createDefaultCmosShakeConfig(),
    intensity: 1,
    fovAngularFreq: wn,
    fovDampingRatio: zeta,
    posAngularFreq: wn,
    posDampingRatio: zeta,
  };
}

function extremaFrames(samples: number[]): number[] {
  const frames = [0];
  for (let i = 1; i < samples.length - 1; i++) {
    if ((samples[i] - samples[i - 1]) * (samples[i + 1] - samples[i]) < 0) {
      frames.push(i);
    }
  }
  return frames;
}

describe('frame-aligned camera shake', () => {
  it('enables frame locking for old archives and persists an explicit opt-out', () => {
    const base = createDefaultCmosShakeConfig();
    expect(mergeCmosShakeConfig(base, { posAngularFreq: 90 }).frameLocked).toBe(true);
    const saved = JSON.parse(JSON.stringify({ ...base, frameLocked: false }));
    expect(mergeCmosShakeConfig(base, saved).frameLocked).toBe(false);
  });

  it.each([
    [90, 0.46, 2],
    [60, 0.46, 4],
    [40, 0.5, 5],
    [18, 0.55, 13],
    [120, 0.2, 2],
    [90, 0, 2],
  ])('ωn=%s ζ=%s has exactly %s frames per trip, including the first', (wn, zeta, frames) => {
    configure(wn, zeta);
    CONFIG.cmosShake.maxDtSec = 0.01; // Time caps must not shorten a locked frame.
    const fx = new ScreenShakeFx();
    const camera = new PerspectiveCamera(40);
    fx.impulse({ impulsePosDeg: 0.8, impulsePosM: 0.31, posTiltDeg: 12, posAzimuthDeg: 90 });
    const fovs: number[] = [];
    const zs: number[] = [];
    // Irregular present times must not skip samples, even after a long frame.
    const dts = [1 / 120, 1 / 60, 0.042, 0.008, 0.2];
    for (let frame = 0; frame <= frames * 4 + 1; frame++) {
      fx.step(dts[frame % dts.length]);
      camera.fov = 40;
      camera.position.set(0, 0, 0);
      camera.updateMatrixWorld();
      fx.applyToCamera(camera);
      fovs.push(camera.fov - 40);
      zs.push(camera.position.z);
      // Repaints while paused must not consume a shake frame.
      const x = fx.model.fov.x;
      fx.step(0);
      expect(fx.model.fov.x).toBe(x);
    }
    expect(fovs[0]).toBeCloseTo(0.8, 12);
    expect(zs[0]).toBeCloseTo(0.31 * Math.cos(12 * Math.PI / 180), 12);
    const expected = [0, frames, 2 * frames, 3 * frames, 4 * frames];
    expect(extremaFrames(fovs)).toEqual(expected);
    expect(extremaFrames(zs)).toEqual(expected);
    for (let trip = 1; trip <= 4; trip++) {
      if (zeta > 0) expect(Math.abs(fovs[trip * frames])).toBeLessThan(Math.abs(fovs[(trip - 1) * frames]));
      else expect(Math.abs(fovs[trip * frames])).toBeCloseTo(0.8, 12);
    }
  });

  it('quantizes game speed before stepping, rather than multiplying the frame dt', () => {
    configure(90, 0.46);
    CONFIG.cmosShake.useGameSpeed = true;
    const fx = new ScreenShakeFx();
    fx.impulse({ impulsePosDeg: 0.5 });
    const samples: number[] = [];
    for (let i = 0; i <= 21; i++) {
      fx.step(1 / 60, 0.5);
      samples.push(fx.model.fov.x);
    }
    expect(extremaFrames(samples)).toEqual([0, 5, 10, 15, 20]);
  });

  it('preserves impulse velocity, stacking and independent channels', () => {
    configure();
    const model = new CmosScreenShake();
    model.impulse({ impulsePosDeg: 0.5, impulseVelDeg: -5 });
    model.step(1 / 60);
    expect(model.fov.v).toBe(-5);
    model.step(1 / 60);
    const before = model.fov.x;
    const velocity = model.fov.v;
    model.impulse({ impulseVelDeg: 2, impulsePosM: 0.2 });
    expect(model.fov.v).toBe(velocity + 2);
    model.step(1 / 60);
    expect(model.fov.x).not.toBe(before);
    expect(model.posZ.x).toBeCloseTo(0.2);
    model.hardReset();
    model.impulse({ impulseVelDeg: 5 });
    model.step(1 / 60);
    expect(model.fov.x).toBeGreaterThan(0);
  });

  it('shows a paused kick once and advances immediately on the next single-step', () => {
    configure();
    const model = new CmosScreenShake();
    model.impulse({ impulsePosDeg: 0.5 });
    model.step(0);
    expect(model.getOutput().fov).toBe(0.5);
    model.step(1 / 60);
    expect(model.fov.x).toBeLessThan(0.5);
    model.step(1 / 60);
    expect(model.fov.x).toBeLessThan(0);
    expect(model.fov.v).toBeCloseTo(0, 12);
  });

  it('retains time-based playback when frame locking is disabled', () => {
    configure();
    CONFIG.cmosShake.frameLocked = false;
    const a = new CmosScreenShake();
    const b = new CmosScreenShake();
    a.impulse({ impulsePosDeg: 0.5 });
    b.impulse({ impulsePosDeg: 0.5 });
    a.step(1 / 30);
    b.step(1 / 60);
    b.step(1 / 60);
    expect(a.fov.x).toBeCloseTo(b.fov.x, 12);
    expect(a.fov.v).toBeCloseTo(b.fov.v, 12);
  });

  it.each([1, 1.5])('does not invent oscillations for damping ratio %s', (zeta) => {
    configure(120, zeta);
    expect(springHalfCycleFrames(120, zeta)).toBeNull();
    const model = new CmosScreenShake();
    model.impulse({ impulsePosDeg: 0.5 });
    let previous = 0.5;
    for (let i = 0; i < 60; i++) {
      model.step(1 / 60);
      expect(model.fov.x).toBeGreaterThanOrEqual(0);
      expect(model.fov.x).toBeLessThanOrEqual(previous);
      previous = model.fov.x;
    }
    expect(model.isSettled()).toBe(true);
  });
});

describe('analytic spring', () => {
  it.each([0, 0.46, 0.999999, 1, 1.000001, 1.5, 10])('is independent of time subdivision at ζ=%s', (zeta) => {
    const params = { mass: 1, angularFreq: 90, dampingRatio: zeta };
    const a = new SpringDamper1D();
    const b = new SpringDamper1D();
    a.reset(0.31, -5);
    b.reset(0.31, -5);
    a.step(0.05, 0.1, params, 0.05, 1);
    for (let i = 0; i < 10; i++) b.step(0.005, 0.1, params, 0.05, 4);
    expect(a.x).toBeCloseTo(b.x, 10);
    expect(a.v).toBeCloseTo(b.v, 9);
  });

  it('returns to its initial endpoint after an undamped full period', () => {
    const s = new SpringDamper1D();
    s.reset(0.31, 0);
    s.step(2 * Math.PI / 90, 0, { mass: 1, angularFreq: 90, dampingRatio: 0 }, 1, 1);
    expect(s.x).toBeCloseTo(0.31, 12);
    expect(s.v).toBeCloseTo(0, 12);
  });
});
