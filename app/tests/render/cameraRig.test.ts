import { describe, expect, it } from 'vitest';
import {
  CameraRig,
  HURT_HALF_WIDTH,
  camXLimits,
  computeFightCamera,
  computeStageLogicWalls,
  constrainFighterPair,
  deadzoneFollowX,
  fightCameraFrame,
  fittedBackZ,
  followAlpha,
  maxOriginSeparation,
  midXWorld,
  sepWorld,
  stageCamXLimits,
  stageFillBackZ,
  visibleHalfWidth,
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
  zMax: 16,
  stageWidth: 20,
  edgeMargin: 0.55,
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
      { ...base, zoomEnabled: true },
    ];
    for (const s of samples) {
      const p = computeFightCamera(s);
      expect(p.camX).toBe(p.lookX);
    }
  });

  it('hurt half-width default constant remains 0.35', () => {
    expect(HURT_HALF_WIDTH).toBe(0.35);
  });

  it('does not mutate input object', () => {
    const input = { ...base };
    computeFightCamera(input);
    expect(input.p1x).toBe(-1);
    expect(input.p2x).toBe(1);
  });
});

describe('margin-triggered zoom', () => {
  it('keeps zMin while pair fits with edgeMargin', () => {
    const frame = fightCameraFrame({
      ...base,
      zoomEnabled: true,
      cameraZ: 8,
      p1x: -0.5,
      p2x: 0.5,
    });
    expect(fittedBackZ(frame, true)).toBeCloseTo(8);
  });

  it('pulls back when span no longer fits at zMin', () => {
    const tight = {
      ...base,
      zoomEnabled: true,
      cameraZ: 4,
      zMax: 20,
      edgeMargin: 0.55,
      p1x: -3,
      p2x: 3,
      stageWidth: 40,
    };
    const p = computeFightCamera(tight);
    expect(p.camZ).toBeGreaterThan(4);
    expect(p.camZ).toBeLessThanOrEqual(20);
  });

  it('never exceeds stage-fill Z (frame cannot show past board)', () => {
    const stageWidth = 8;
    const fill = stageFillBackZ(
      stageWidth * 0.5,
      base.cameraFov,
      base.aspect,
    );
    const p = computeFightCamera({
      ...base,
      zoomEnabled: true,
      cameraZ: 2,
      zMax: 100,
      stageWidth,
      edgeMargin: 0.2,
      p1x: -3,
      p2x: 3,
    });
    expect(p.camZ).toBeLessThanOrEqual(fill + 1e-9);
    const halfW = visibleHalfWidth(p.camZ, base.cameraFov, base.aspect);
    expect(p.camX - halfW).toBeGreaterThanOrEqual(-stageWidth * 0.5 - 1e-6);
    expect(p.camX + halfW).toBeLessThanOrEqual(stageWidth * 0.5 + 1e-6);
  });
});

describe('stage frame clamp', () => {
  it('pins camX so absolute frame edges stay inside stage', () => {
    const input = {
      ...base,
      zoomEnabled: false,
      cameraZ: 5,
      stageWidth: 10,
      p1x: -3,
      p2x: -2,
    };
    const p = computeFightCamera(input);
    const halfW = visibleHalfWidth(p.camZ, input.cameraFov, input.aspect);
    expect(p.camX - halfW).toBeGreaterThanOrEqual(-5 - 1e-6);
    expect(p.camX + halfW).toBeLessThanOrEqual(5 + 1e-6);
  });

  it('allows one-sided corner (frame left edge on stage, right follows)', () => {
    const input = {
      ...base,
      zoomEnabled: false,
      cameraZ: 5,
      stageWidth: 12,
      p1x: -5.5,
      p2x: -4.5,
    };
    const p = computeFightCamera(input);
    const frame = fightCameraFrame(input);
    const stage = stageCamXLimits(p.camZ, frame);
    expect(p.camX).toBeGreaterThanOrEqual(stage.lo - 1e-9);
    expect(p.camX).toBeLessThanOrEqual(stage.hi + 1e-9);
  });
});

describe('constrainFighterPair', () => {
  it('does not drag an idle partner when the walker exceeds max sep', () => {
    const input = {
      ...base,
      stageWidth: 40,
      cameraZ: 4,
      zMax: 4,
      zoomEnabled: true,
      edgeMargin: 0.55,
      p1x: -1,
      p2x: 1,
    };
    const maxSep = maxOriginSeparation(input);
    const idle = 0;
    const walkerPrev = maxSep;
    const walkerTried = maxSep + 1.25;
    const out = constrainFighterPair(
      walkerTried,
      idle,
      walkerPrev,
      idle,
      { ...input, p1x: walkerTried, p2x: idle },
    );
    expect(out.p2x).toBeCloseTo(idle, 6);
    expect(out.p1x).toBeCloseTo(maxSep, 5);
    expect(Math.abs(out.p1x - out.p2x)).toBeLessThanOrEqual(maxSep + 1e-6);
  });

  it('stage-clamps without moving the other fighter', () => {
    const margin = 0.55;
    const input = {
      ...base,
      stageWidth: 9,
      edgeMargin: margin,
      cameraZ: 8,
      zMax: 16,
      zoomEnabled: true,
      p1x: 0,
      p2x: 0,
    };
    const out = constrainFighterPair(10, 0, 4, 0, input);
    expect(out.p2x).toBeCloseTo(0, 6);
    expect(out.p1x).toBeCloseTo(4.5 - margin, 5);
  });

  it('board-edge and screen soft-wall use the same edgeMargin', () => {
    const stageWidth = 9;
    const stageHalf = stageWidth * 0.5;
    const margin = 0.7;
    const stage = computeStageLogicWalls({ stageWidth, edgeMargin: margin });
    expect(stage.maxX).toBeCloseTo(stageHalf - margin, 6);

    const fillZ = stageFillBackZ(stageHalf, base.cameraFov, base.aspect);
    const input = {
      ...base,
      stageWidth,
      edgeMargin: margin,
      cameraZ: fillZ,
      zMax: fillZ,
      zoomEnabled: true,
      p1x: -stage.maxX,
      p2x: stage.maxX,
    };
    const maxSep = maxOriginSeparation(input);
    expect(maxSep).toBeCloseTo(stage.maxX - stage.minX, 5);

    const halfW = visibleHalfWidth(fillZ, base.cameraFov, base.aspect);
    expect(halfW).toBeCloseTo(stageHalf, 5);
    // Soft-wall origin limit from absolute edge == board origin limit.
    const softOriginMax = halfW - margin;
    expect(softOriginMax).toBeCloseTo(stage.maxX, 5);
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

  it('edge clamp pulls displayed X so fighters keep edgeMargin', () => {
    const tight = {
      ...base,
      cameraZ: 4,
      p1x: -0.4,
      p2x: 0.4,
      stageWidth: 40,
      edgeMargin: 0.2,
    };
    const jumped = { ...tight, p1x: 2.2, p2x: 3.2 };
    const rig = new CameraRig();
    rig.update(tight, { lerp: 0.08, dt: 1 / 60, deadzone: 0 });
    const shown = rig.update(jumped, { lerp: 0.08, dt: 1 / 60, deadzone: 0 });
    const frame = fightCameraFrame(jumped);
    const { lo, hi } = camXLimits(shown.camZ, frame);
    expect(shown.camX).toBeGreaterThanOrEqual(lo - 1e-9);
    expect(shown.camX).toBeLessThanOrEqual(hi + 1e-9);
    expect(shown.lookX).toBe(shown.camX);
    expect(shown.camX).toBeCloseTo(lo, 5);
  });
});
