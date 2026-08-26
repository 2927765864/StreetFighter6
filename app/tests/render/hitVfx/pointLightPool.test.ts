import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { HitVfxPointLightPool } from '../../../src/render/hitVfx/HitVfxPointLightPool';

describe('HitVfxPointLightPool', () => {
  it('pre-allocates lights and does not grow on acquire', () => {
    const scene = new THREE.Scene();
    const pool = new HitVfxPointLightPool(scene, 3);
    expect(pool.sceneLightCount()).toBe(3);
    const before = scene.children.length;
    const h0 = pool.acquire({
      color: 0xff0000,
      intensity: 2,
      intensityEnd: 0,
      distance: 3,
      decay: 2,
      position: { x: 0, y: 1, z: 0 },
      lifetimeSec: 0.2,
    });
    const h1 = pool.acquire({
      color: 0x00ff00,
      intensity: 2,
      intensityEnd: 0,
      distance: 3,
      decay: 2,
      position: { x: 1, y: 1, z: 0 },
      lifetimeSec: 0.2,
    });
    expect(h0).not.toBeNull();
    expect(h1).not.toBeNull();
    expect(scene.children.length).toBe(before);
    expect(pool.sceneLightCount()).toBe(3);
    pool.dispose();
  });

  it('releases and decays intensity over lifetime', () => {
    const scene = new THREE.Scene();
    const pool = new HitVfxPointLightPool(scene, 1);
    const h = pool.acquire({
      color: 0xffffff,
      intensity: 4,
      intensityEnd: 0,
      distance: 2,
      decay: 2,
      position: { x: 0, y: 0, z: 0 },
      lifetimeSec: 0.1,
    })!;
    expect(pool.update(h, 0.05)).toBe(true);
    pool.update(h, 0.1);
    // after life ends, slot freed
    const h2 = pool.acquire({
      color: 0xffffff,
      intensity: 1,
      intensityEnd: 0,
      distance: 1,
      decay: 2,
      position: { x: 0, y: 0, z: 0 },
      lifetimeSec: 0.1,
    });
    expect(h2).toBe(0);
    pool.dispose();
  });
});
