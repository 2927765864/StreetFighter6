import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import {
  planFightDisplayPasses,
  renderFightDisplayLayers,
} from '../../src/render/fightDisplayPasses';
import {
  LAYER_FIGHTER_BACK,
  LAYER_FIGHTER_FRONT,
  LAYER_SCENE,
} from '../../src/render/fighterDisplayOrder';

describe('planFightDisplayPasses', () => {
  it('idle present is stage + fighters (back/front split, no overlay)', () => {
    expect(
      planFightDisplayPasses({
        behindVfx: false,
        cloudShadow: false,
        frontVfx: false,
      }),
    ).toEqual(['stage', 'fighters']);
  });

  it('skips cloud shadow and screen-adjacent vfx when idle flags are false', () => {
    expect(
      planFightDisplayPasses({
        behindVfx: true,
        cloudShadow: false,
        frontVfx: true,
      }),
    ).toEqual(['stage', 'behindVfx', 'fighters', 'frontVfx']);
  });
});

describe('renderFightDisplayLayers', () => {
  it('issues three scene renders when overlays are idle (stage, back, front)', () => {
    const scene = new THREE.Scene();
    const behind = new THREE.Scene();
    const front = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const rendered: THREE.Object3D[] = [];
    const renderer = {
      autoClear: true,
      autoClearColor: true,
      autoClearDepth: true,
      clearDepth: vi.fn(),
      render: vi.fn((s: THREE.Object3D) => {
        rendered.push(s);
      }),
    };
    const cloudApply = vi.fn();

    renderFightDisplayLayers({
      renderer,
      scene,
      camera,
      hitVfxBehindScene: behind,
      hitVfxScene: front,
      autoClearFirst: true,
      behindVfx: false,
      frontVfx: false,
      cloudShadow: { hasActive: () => false, apply: cloudApply },
    });

    expect(rendered).toEqual([scene, scene, scene]);
    expect(renderer.clearDepth).toHaveBeenCalledTimes(1);
    expect(cloudApply).not.toHaveBeenCalled();
    expect(camera.layers.isEnabled(LAYER_SCENE)).toBe(true);
    expect(camera.layers.isEnabled(LAYER_FIGHTER_BACK)).toBe(true);
    expect(camera.layers.isEnabled(LAYER_FIGHTER_FRONT)).toBe(true);
  });

  it('does not render cloud or front vfx scenes when those flags are off', () => {
    const scene = new THREE.Scene();
    const behind = new THREE.Scene();
    const vfx = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const rendered: THREE.Object3D[] = [];
    const renderer = {
      autoClear: true,
      autoClearColor: true,
      autoClearDepth: true,
      clearDepth: vi.fn(),
      render: vi.fn((s: THREE.Object3D) => {
        rendered.push(s);
      }),
    };

    renderFightDisplayLayers({
      renderer,
      scene,
      camera,
      hitVfxBehindScene: behind,
      hitVfxScene: vfx,
      autoClearFirst: true,
      behindVfx: false,
      frontVfx: true,
      cloudShadow: { hasActive: () => true, apply: vi.fn() },
    });

    expect(rendered).toEqual([scene, scene, scene, vfx]);
  });
});
