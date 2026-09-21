import { describe, expect, it, vi } from 'vitest';
import { Matrix4, PerspectiveCamera, Scene, Vector3, Vector4, WebGPUCoordinateSystem } from 'three';
import { CameraShakeMotion } from '../../src/render/CameraShakeMotion';
import { MotionBlurFx } from '../../src/render/MotionBlurFx';
import { createDefaultMotionBlurConfig } from '../../src/config/motionBlur';

function pose(opts: { followX?: number; shakeX?: number; shakeY?: number; shakeZ?: number; fovKick?: number } = {}) {
  const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 100);
  camera.coordinateSystem = WebGPUCoordinateSystem;
  camera.position.set(opts.followX ?? 0, 1.5, 8);
  camera.lookAt(opts.followX ?? 0, 1, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const view = camera.matrixWorldInverse.clone();
  const projection = camera.projectionMatrix.clone();
  camera.translateX(opts.shakeX ?? 0);
  camera.translateY(opts.shakeY ?? 0);
  camera.translateZ(opts.shakeZ ?? 0);
  camera.fov += opts.fovKick ?? 0;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return { camera, view, projection };
}

function advance(motion: CameraShakeMotion, p: ReturnType<typeof pose>) {
  motion.update(p.camera.matrixWorldInverse, p.camera.projectionMatrix, p.view, p.projection);
}

function velocity(motion: CameraShakeMotion, x: number, y: number, depth = 0.99) {
  const previous = new Vector4(x, y, depth, 1).applyMatrix4(motion.previousClipFromCurrent);
  return { x: x - previous.x / previous.w, y: y - previous.y / previous.w };
}

describe('camera shake motion', () => {
  it.each([{ shakeX: 0.2 }, { shakeY: 0.2 }, { shakeZ: 0.2 }])(
    'near geometry moves more than far geometry at the same screen pixel: %j', (kick) => {
      const motion = new CameraShakeMotion();
      advance(motion, pose());
      const current = pose(kick);
      advance(motion, current);
      const speedAtDistance = (distance: number) => {
        const depth = new Vector3(0, 0, -distance).applyMatrix4(current.camera.projectionMatrix).z;
        const v = velocity(motion, 0.6, 0.4, depth);
        return Math.hypot(v.x, v.y);
      };
      expect(speedAtDistance(4)).toBeGreaterThan(3.5 * speedAtDistance(16));
    },
  );

  it('pure FOV zoom does not artificially multiply blur by nearness', () => {
    const motion = new CameraShakeMotion();
    advance(motion, pose());
    advance(motion, pose({ fovKick: 2 }));
    expect(velocity(motion, 0.6, 0.4, 0.95).x).toBeCloseTo(velocity(motion, 0.6, 0.4, 0.999).x, 12);
  });

  it('measures motion between frames: returning to the neutral position still blurs', () => {
    const motion = new CameraShakeMotion();
    advance(motion, pose());
    advance(motion, pose({ shakeX: 0.31 }));
    const kick = velocity(motion, 0, 0).x;
    expect(kick).toBeLessThan(0);
    advance(motion, pose({ shakeX: 0 }));
    expect(motion.hasMotion).toBe(true);
    const recoil = velocity(motion, 0, 0).x;
    expect(recoil).toBeGreaterThan(0);
    expect(recoil).toBeCloseTo(-kick, 6);
  });

  it('a static displaced camera has no motion blur', () => {
    const motion = new CameraShakeMotion();
    const p = pose({ shakeX: 0.31, shakeY: 0.1, shakeZ: 0.2, fovKick: 1.5 });
    advance(motion, p);
    expect(motion.hasMotion).toBe(true);
    advance(motion, p);
    expect(motion.hasMotion).toBe(false);
    expect(velocity(motion, 0.7, -0.3).x).toBeCloseTo(0, 12);
  });

  it('excludes follow even while a constant local shake is present', () => {
    const motion = new CameraShakeMotion();
    advance(motion, pose({ shakeX: 0.2, fovKick: 1 }));
    advance(motion, pose({ followX: 3, shakeX: 0.2, fovKick: 1 }));
    expect(motion.hasMotion).toBe(false);
  });

  it.each([{ fovKick: 2 }, { shakeZ: 0.31 }])('includes radial zoom motion for %j', (kick) => {
    const motion = new CameraShakeMotion();
    advance(motion, pose());
    advance(motion, pose(kick));
    expect(motion.hasMotion).toBe(true);
    expect(velocity(motion, -0.6, 0).x).toBeGreaterThan(0);
    expect(velocity(motion, 0.6, 0).x).toBeLessThan(0);
    advance(motion, pose());
    expect(velocity(motion, -0.6, 0).x).toBeLessThan(0);
    expect(velocity(motion, 0.6, 0).x).toBeGreaterThan(0);
  });

  it('matches actual projections at both character and background depths', () => {
    const motion = new CameraShakeMotion();
    const previous = pose({ shakeX: -0.1, shakeY: 0.06, shakeZ: 0.2, fovKick: 1 });
    const current = pose({ shakeX: 0.03, shakeY: -0.01, shakeZ: -0.08, fovKick: -0.2 });
    advance(motion, previous);
    advance(motion, current);
    for (const [x, y, z] of [[-1, 0.2, 0.3], [1, 1.6, -0.4], [0, 1, -12], [4, 3, -30]]) {
      const a = new Vector3(x, y, z).project(previous.camera);
      const b = new Vector3(x, y, z).project(current.camera);
      const v = velocity(motion, b.x, b.y, b.z);
      expect(v.x).toBeCloseTo(b.x - a.x, 12);
      expect(v.y).toBeCloseTo(b.y - a.y, 12);
    }
  });

  it('reset discards an old shake when blur is disabled', () => {
    const motion = new CameraShakeMotion();
    advance(motion, pose({ shakeX: 0.3 }));
    motion.reset();
    advance(motion, pose({ followX: 4 }));
    expect(motion.hasMotion).toBe(false);
  });
});

describe('frame-step motion blur hold', () => {
  it('holds the last moving frame and remeasures the next step including a neutral crossing', () => {
    const fx = new MotionBlurFx();
    fx.applyParams(createDefaultMotionBlurConfig(), 720);
    const renderer = {
      getDrawingBufferSize: (out: { set: (x: number, y: number) => void }) => out.set(1280, 720),
      autoClear: true,
      render: vi.fn(),
    } as unknown as Parameters<MotionBlurFx['apply']>[0];
    const scene = new Scene();
    const uniforms = fx as unknown as {
      uPreviousShakeClip: { value: Matrix4 };
      uUseObjectVel: { value: number };
    };
    const apply = (p: ReturnType<typeof pose>, holdVelocity = false) => fx.apply(renderer, scene, p.camera, {
      holdVelocity, unshakenView: p.view, unshakenProjection: p.projection,
    });
    apply(pose());
    apply(pose({ shakeZ: 0.31 }));
    const kick = uniforms.uPreviousShakeClip.value.clone();
    apply(pose({ shakeZ: 0.31 }), true);
    apply(pose({ shakeZ: 0.31 }), true);
    expect(uniforms.uPreviousShakeClip.value.equals(kick)).toBe(true);
    apply(pose());
    const rebound = uniforms.uPreviousShakeClip.value.clone();
    expect(rebound.equals(new Matrix4())).toBe(false);
    expect(rebound.equals(kick)).toBe(false);
    apply(pose(), true);
    expect(uniforms.uPreviousShakeClip.value.equals(rebound)).toBe(true);
    expect(uniforms.uUseObjectVel.value).toBe(0);
    fx.dispose();
  });
});
