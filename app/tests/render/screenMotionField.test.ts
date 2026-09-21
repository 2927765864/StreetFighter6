import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { ScreenMotionField } from '../../src/render/ScreenMotionField';
import { MotionBlurDepth } from '../../src/render/MotionBlurDepth';

function fixture() {
  const field = new ScreenMotionField(new THREE.Texture(), new MotionBlurDepth());
  const size = new THREE.Vector2(1280, 720);
  const copies: THREE.Texture[] = [];
  const renderer = {
    getDrawingBufferSize: (out: THREE.Vector2) => out.copy(size),
    copyFramebufferToTexture: vi.fn((texture: THREE.Texture) => copies.push(texture)),
  } as unknown as THREE.WebGPURenderer;
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
  camera.position.z = 5;
  camera.updateMatrixWorld();
  return { field, size, copies, renderer, camera };
}

describe('unfiltered image history for visible motion', () => {
  it('initializes both history textures before sampling and compares consecutive original frames', () => {
    const { field, copies, renderer, camera } = fixture();
    field.capture(renderer, camera, false);
    expect(copies).toHaveLength(2);
    expect(new Set(copies).size).toBe(2);
    expect(field.historyValid.value).toBe(0);
    const first = field.beauty.value;
    field.capture(renderer, camera, false);
    expect(field.previous.value).toBe(first);
    expect(field.beauty.value).not.toBe(first);
    expect(field.historyValid.value).toBe(1);
    expect(copies).toHaveLength(3);
    field.dispose();
  });

  it('holds the matching pair during frame-step pause, then advances exactly once', () => {
    const { field, renderer, camera } = fixture();
    field.capture(renderer, camera, false);
    field.capture(renderer, camera, false);
    const current = field.beauty.value;
    const previous = field.previous.value;
    for (let i = 0; i < 4; i++) field.capture(renderer, camera, true);
    expect(field.beauty.value).toBe(current);
    expect(field.previous.value).toBe(previous);
    field.capture(renderer, camera, false);
    expect(field.previous.value).toBe(current);
    field.dispose();
  });

  it('invalidates stale comparisons after resize or disabling the effect', () => {
    const { field, size, renderer, camera } = fixture();
    field.capture(renderer, camera, false);
    field.capture(renderer, camera, false);
    size.set(1920, 1080);
    field.capture(renderer, camera, false);
    expect(field.historyValid.value).toBe(0);
    expect(field.resolved.width).toBe(1920);
    field.capture(renderer, camera, false);
    field.reset();
    field.capture(renderer, camera, false);
    expect(field.historyValid.value).toBe(0);
    field.dispose();
  });

  it('reprojects camera movement so a fixed world point has no apparent object displacement', () => {
    const { field, renderer, camera } = fixture();
    const worldPoint = new THREE.Vector3(0.4, 0.2, 0);
    const oldNdc = worldPoint.clone().project(camera);
    field.capture(renderer, camera, false);
    camera.position.x += 0.2;
    camera.fov = 55;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    field.capture(renderer, camera, false);
    const current = worldPoint.clone().project(camera);
    const previous = new THREE.Vector4(current.x, current.y, current.z, 1)
      .applyMatrix4(field.previousClip.value);
    expect(previous.x / previous.w).toBeCloseTo(oldNdc.x, 6);
    expect(previous.y / previous.w).toBeCloseTo(oldNdc.y, 6);
    field.dispose();
  });
});
