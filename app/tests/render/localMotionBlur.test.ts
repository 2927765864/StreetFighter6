import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { LocalMotionBlurField } from '../../src/render/LocalMotionBlurField';
import { MotionBlurDepth } from '../../src/render/MotionBlurDepth';
import { MotionBlurFx } from '../../src/render/MotionBlurFx';
import { createDefaultMotionBlurConfig } from '../../src/config/motionBlur';

function fixture() {
  const size = new THREE.Vector2(1280, 720);
  const copies: THREE.Texture[] = [];
  const renderer = {
    getDrawingBufferSize: (out: THREE.Vector2) => out.copy(size),
    copyFramebufferToTexture: vi.fn((t: THREE.Texture) => copies.push(t)),
    autoClear: true, render: vi.fn(),
  } as unknown as THREE.WebGPURenderer;
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
  camera.position.z = 5;
  camera.updateMatrixWorld();
  return { size, copies, renderer, camera };
}

describe('local motion current-frame capture', () => {
  it('captures one unfiltered image without allocating or swapping image history', () => {
    const { renderer, camera, copies, size } = fixture();
    const depth = new MotionBlurDepth();
    const field = new LocalMotionBlurField(new THREE.Texture(), depth);
    expect(field.capture(renderer, camera)).toBe(true);
    const frame = field.beauty.value;
    expect(field.capture(renderer, camera)).toBe(false);
    expect(copies).toEqual([frame, frame]);
    size.set(1920, 1080);
    expect(field.capture(renderer, camera)).toBe(true);
    expect(field.resolved.width).toBe(1920);
    expect(field.beauty.value).toBe(frame);
    field.dispose(); depth.dispose();
  });

  it('invalidates held velocity on resize and after disabling', () => {
    const { renderer, camera, size } = fixture();
    const fx = new MotionBlurFx();
    const scene = new THREE.Scene();
    fx.applyParams(createDefaultMotionBlurConfig(), 720);
    fx.apply(renderer, scene, camera);
    const state = fx as unknown as { uUseObjectVel: { value: number }; hasPrev: boolean };
    state.uUseObjectVel.value = 1;
    size.set(1920, 1080);
    fx.apply(renderer, scene, camera, { holdVelocity: true });
    expect(state.uUseObjectVel.value).toBe(0);
    expect(renderer.render).not.toHaveBeenCalled();
    fx.resetCameraHistory();
    expect(state.hasPrev).toBe(false);
    fx.apply(renderer, scene, camera, { holdVelocity: true });
    expect(renderer.render).not.toHaveBeenCalled();
    fx.dispose();
  });

});
