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
  it('captures both visible depth layers before depth clears and overlays overwrite them', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const events: string[] = [];
    const front = new THREE.Scene();
    const renderer = {
      autoClear: true, autoClearColor: true, autoClearDepth: true,
      clearDepth: () => { events.push('clear'); },
      render: (s: THREE.Object3D) => {
        events.push(s === front ? 'vfx' : `geometry:${camera.layers.mask}`);
      },
    };
    renderFightDisplayLayers({
      renderer, scene, camera,
      hitVfxBehindScene: new THREE.Scene(), hitVfxScene: front,
      autoClearFirst: true, behindVfx: false, frontVfx: true,
      captureDepth: (layer) => { events.push(`capture:${layer}`); },
      cloudShadow: { hasActive: () => true, apply: () => { events.push('cloud'); } },
    });
    expect(events).toEqual([
      `geometry:${1 << LAYER_SCENE}`, `geometry:${1 << LAYER_FIGHTER_BACK}`,
      'capture:background', 'clear', `geometry:${1 << LAYER_FIGHTER_FRONT}`,
      'capture:foreground', 'cloud', 'clear', 'vfx',
    ]);
  });

  it('issues three scene renders when overlays are idle (stage, back, front)', () => {
    const scene = new THREE.Scene();
    const behind = new THREE.Scene();
    const front = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const updateMatrices = vi.spyOn(scene, 'updateMatrixWorld');
    const rendered: THREE.Object3D[] = [];
    const renderer = {
      autoClear: true,
      autoClearColor: true,
      autoClearDepth: true,
      clearDepth: vi.fn(),
      render: vi.fn((s: THREE.Object3D) => {
        if (s.matrixWorldAutoUpdate) s.updateMatrixWorld();
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
    expect(updateMatrices).toHaveBeenCalledTimes(1);
    expect(scene.matrixWorldAutoUpdate).toBe(true);
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

  it('restores scene and renderer state if a fighter pass fails', () => {
    const scene = new THREE.Scene();
    const background = new THREE.Color('red');
    scene.background = background;
    scene.matrixWorldAutoUpdate = false;
    const camera = new THREE.PerspectiveCamera();
    const mask = camera.layers.mask;
    let calls = 0;
    const renderer = {
      autoClear: true, autoClearColor: true, autoClearDepth: true,
      clearDepth: vi.fn(),
      render: () => { if (++calls === 2) throw new Error('render failed'); },
    };
    expect(() => renderFightDisplayLayers({
      renderer, scene, camera,
      hitVfxBehindScene: new THREE.Scene(), hitVfxScene: new THREE.Scene(),
      autoClearFirst: true, behindVfx: false, frontVfx: false,
      cloudShadow: { hasActive: () => false, apply: vi.fn() },
    })).toThrow('render failed');
    expect(scene.background).toBe(background);
    expect(scene.matrixWorldAutoUpdate).toBe(false);
    expect(camera.layers.mask).toBe(mask);
    expect(renderer.autoClear).toBe(true);
    expect(renderer.autoClearColor).toBe(true);
    expect(renderer.autoClearDepth).toBe(true);
  });
});
