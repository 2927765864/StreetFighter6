/**
 * Training-stage color passes. Idle present is 3 scene renders:
 *   1) LAYER_SCENE (stage / env)
 *   2) BACK fighter (same world Z as front)
 *   3) clearDepth, FRONT fighter (2.5D priority, no Z offset)
 * Optional: behind-flipbook, cloud-shadow quad, front hit-VFX overlay.
 */
import type * as THREE from 'three/webgpu';
import {
  LAYER_FIGHTER_BACK,
  LAYER_FIGHTER_FRONT,
  LAYER_SCENE,
} from './fighterDisplayOrder';

export type FightDisplayPassId =
  | 'stage'
  | 'behindVfx'
  | 'fighters'
  | 'cloudShadow'
  | 'frontVfx';

export function planFightDisplayPasses(opts: {
  behindVfx: boolean;
  cloudShadow: boolean;
  frontVfx: boolean;
}): FightDisplayPassId[] {
  const passes: FightDisplayPassId[] = ['stage'];
  if (opts.behindVfx) passes.push('behindVfx');
  passes.push('fighters'); // back + clearDepth + front (same world Z)
  if (opts.cloudShadow) passes.push('cloudShadow');
  if (opts.frontVfx) passes.push('frontVfx');
  return passes;
}

export type FightDisplayRenderer = {
  autoClear: boolean;
  autoClearColor: boolean;
  autoClearDepth: boolean;
  clearDepth: () => void;
  render: (scene: THREE.Object3D, camera: THREE.Camera) => unknown;
};

export type FightDisplayCloudShadow = {
  hasActive: () => boolean;
  apply: (renderer: FightDisplayRenderer, camera: THREE.Camera) => void;
};

export function renderFightDisplayLayers(opts: {
  renderer: FightDisplayRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  hitVfxBehindScene: THREE.Scene;
  hitVfxScene: THREE.Scene;
  autoClearFirst: boolean;
  behindVfx: boolean;
  frontVfx: boolean;
  cloudShadow: FightDisplayCloudShadow;
}): void {
  const {
    renderer,
    scene,
    camera: cam,
    hitVfxBehindScene,
    hitVfxScene,
    autoClearFirst,
    behindVfx,
    frontVfx,
    cloudShadow,
  } = opts;

  cam.layers.set(LAYER_SCENE);
  renderer.autoClear = autoClearFirst;
  renderer.render(scene, cam);

  const prevBackground = scene.background;
  const prevAutoClear = renderer.autoClear;
  const prevAutoClearColor = renderer.autoClearColor;
  const prevAutoClearDepth = renderer.autoClearDepth;
  scene.background = null;
  renderer.autoClear = false;
  renderer.autoClearColor = false;
  renderer.autoClearDepth = false;

  if (behindVfx) {
    cam.layers.set(LAYER_SCENE);
    renderer.render(hitVfxBehindScene, cam);
  }

  cam.layers.set(LAYER_FIGHTER_BACK);
  renderer.render(scene, cam);

  renderer.clearDepth();
  cam.layers.set(LAYER_FIGHTER_FRONT);
  renderer.render(scene, cam);

  if (cloudShadow.hasActive()) {
    cloudShadow.apply(renderer, cam);
  }

  if (frontVfx) {
    renderer.clearDepth();
    cam.layers.set(LAYER_SCENE);
    renderer.render(hitVfxScene, cam);
  }

  scene.background = prevBackground;
  renderer.autoClear = prevAutoClear;
  renderer.autoClearColor = prevAutoClearColor;
  renderer.autoClearDepth = prevAutoClearDepth;

  cam.layers.set(LAYER_SCENE);
  cam.layers.enable(LAYER_FIGHTER_BACK);
  cam.layers.enable(LAYER_FIGHTER_FRONT);
  renderer.autoClear = true;
}
