import { describe, expect, it } from 'vitest';
import {
  CameraRig,
  HURT_HALF_WIDTH,
  camXLimits,
  computeFightCamera,
  deadzoneFollowX,
  fightCameraFrame,
  followAlpha,
  midXWorld,
  sepWorld,
} from '../../src/render/CameraRig';

const base = {
  p1x: -1,
  p2x: 1,
  worldScale: 1,
  cameraY: 1.4,
  cameraZ: 8,
  cameraLookY: 1,
  cameraFov: 40,
  aspect: 16 / 9,
  zoomEnabled: false,
  zoomSepK: 0.35,
  zMax: 16,
  ndcPad: 0.08,
};

describe('computeFightCamera', () => {
  it('midpoint is average logic x times worldScale', () => {
    expect(midXWorld(-1, 1, 1)).toBe(0);
    expect(midXWorld(-1, 1, 2)).toBe(0);
    expect(midXWorld(0, 2, 2)).toBe(2);
  });

  it('sep scales with worldScale', () => {
    expect(sepWorld(-1, 1, 1)).toBe(2);
    expect(sepWorld(-1, 1, 2)).toBe(4);
  });

  it('worldScale=1 mid at 0 for symmetric pair', () => {
    const p = computeFightCamera(base);
    expect(p.camX).toBeCloseTo(0);
    expect(p.lookX).toBe(p.camX);
  });

  it('worldScale=2 doubles world mid', () => {
    const p = computeFightCamera({ ...base, p1x: 0, p2x: 2, worldScale: 2 });
    expect(midXWorld(0, 2, 2)).toBe(2);
    expect(p.lookX).toBe(p.camX);
  });

  it('zoom off keeps camZ === cameraZ when pair fits', () => {
    const p = computeFightCamera({ ...base, zoomEnabled: false, cameraZ: 8 });
    expect(p.camZ).toBeCloseTo(8);
  });

  it('always camX === lookX (no yaw)', () => {
    const samples = [
      base,
      { ...base, p1x: -4.5, p2x: -3.5 },
      { ...base, p1x: 3, p2x: 4.5, worldScale: 2 },
      { ...base, zoomEnabled: true, zoomSepK: 1 },
    ];
    for (const s of samples) {
      const p = computeFightCamera(s);
      expect(p.camX).toBe(p.lookX);
    }
  });

  it('hurt half-width default is 0.35', () => {
    expect(HURT_HALF_WIDTH).toBe(0.35);
  });

  it('does not mutate input object', () => {
    const input = { ...base };
    computeFightCamera(input);
    expect(input.p1x).toBe(-1);
    expect(input.p2x).toBe(1);
  });
});

describe('followAlpha', () => {
  it('lerp 0 or 1 snaps', () => {
    expect(followAlpha(0, 1 / 60)).toBe(1);
    expect(followAlpha(1, 1 / 60)).toBe(1);
  });

  it('dt=0 holds', () => {
    expect(followAlpha(0.12, 0)).toBe(0);
  });

  it('one 60Hz step equals two 120Hz steps', () => {
    const a60 = followAlpha(0.12, 1 / 60);
    const a120 = followAlpha(0.12, 1 / 120);
    const remain60 = 1 - a60;
    const remain120 = (1 - a120) * (1 - a120);
    expect(remain120).toBeCloseTo(remain60, 10);
  });
});

describe('deadzoneFollowX', () => {
  it('inside deadzone keeps shown', () => {
    expect(deadzoneFollowX(0, 0.1, 0.2)).toBe(0);
  });

  it('outside chases the rim not the target', () => {
    expect(deadzoneFollowX(0, 0.5, 0.2)).toBeCloseTo(0.3);
    expect(deadzoneFollowX(0, -0.5, 0.2)).toBeCloseTo(-0.3);
  });
});

describe('CameraRig.update', () => {
  const snap = { lerp: 0, dt: 1 / 60, deadzone: 0 };
  const follow = { lerp: 0.12, dt: 1 / 60, deadzone: 0 };

  it('lerp=0 snaps to target', () => {
    const rig = new CameraRig();
    const a = rig.update(base, snap);
    expect(a.camX).toBeCloseTo(0);
    const b = rig.update({ ...base, p1x: 1, p2x: 3 }, snap);
    expect(b.camX).toBeCloseTo(computeFightCamera({ ...base, p1x: 1, p2x: 3 }).camX);
    expect(b.lookX).toBe(b.camX);
  });

  it('lerp>0 first step moves toward target but does not arrive', () => {
    const rig = new CameraRig();
    rig.update(base, follow);
    const jumped = { ...base, p1x: 1, p2x: 3 };
    const target = computeFightCamera(jumped);
    const shown = rig.update(jumped, follow);
    expect(shown.camX).toBeGreaterThan(0);
    expect(shown.camX).toBeLessThan(target.camX);
    expect(shown.lookX).toBe(shown.camX);
  });

  it('same lerp covers the same distance at 60Hz and 120Hz', () => {
    const jumped = { ...base, p1x: 1, p2x: 3 };
    const rig60 = new CameraRig();
    rig60.update(base, { lerp: 0.12, dt: 1 / 60, deadzone: 0 });
    const at60 = rig60.update(jumped, { lerp: 0.12, dt: 1 / 60, deadzone: 0 });

    const rig120 = new CameraRig();
    rig120.update(base, { lerp: 0.12, dt: 1 / 120, deadzone: 0 });
    rig120.update(jumped, { lerp: 0.12, dt: 1 / 120, deadzone: 0 });
    const at120 = rig120.update(jumped, { lerp: 0.12, dt: 1 / 120, deadzone: 0 });

    expect(at120.camX).toBeCloseTo(at60.camX, 8);
  });

  it('deadzone ignores a small mid-X move', () => {
    const rig = new CameraRig();
    const opts = { lerp: 0.12, dt: 1 / 60, deadzone: 0.25 };
    const first = rig.update(base, opts);
    expect(first.camX).toBeCloseTo(0);
    const shown = rig.update({ ...base, p1x: -0.9, p2x: 1.1 }, opts);
    expect(shown.camX).toBeCloseTo(0);
  });

  it('edge clamp pulls displayed X so fighters stay in pad', () => {
    const tight = { ...base, cameraZ: 4, p1x: -0.4, p2x: 0.4 };
    const jumped = { ...tight, p1x: 2.2, p2x: 3.2 };
    const rig = new CameraRig();
    rig.update(tight, { lerp: 0.08, dt: 1 / 60, deadzone: 0 });
    const shown = rig.update(jumped, { lerp: 0.08, dt: 1 / 60, deadzone: 0 });
    const frame = fightCameraFrame(jumped);
    const { lo, hi } = camXLimits(shown.camZ, frame);
    expect(shown.camX).toBeGreaterThanOrEqual(lo - 1e-9);
    expect(shown.camX).toBeLessThanOrEqual(hi + 1e-9);
    expect(shown.lookX).toBe(shown.camX);
    // Unconstrained follow would still be near 0; clamp must have jumped.
    expect(shown.camX).toBeCloseTo(lo, 5);
  });
});
