/**
 * Shared training-scene lighting refresh used by main fight view and hit-VFX editor.
 * Both pages drive the same CONFIG.lights / fog / selective lightsNode path —
 * no duplicated light lists.
 */
import type { MutableSimConfig } from '../config/constants';
import type * as THREE_NS from 'three/webgpu';
import {
  applyEnvironment,
  syncLightsFromConfig,
  type FighterFollowOrigins,
  type LightRig,
} from './LightRig';
import {
  applySelectiveLightNodes,
  type SelectiveLightExtras,
} from './LightSelective';

export type TrainingLightingRoots = {
  stage?: THREE_NS.Object3D | null;
  ground?: THREE_NS.Object3D | null;
  p1: THREE_NS.Object3D;
  p2: THREE_NS.Object3D;
};

export type RefreshTrainingLightingArgs = {
  THREE: typeof THREE_NS;
  renderer: { shadowMap: { enabled: boolean } };
  scene: THREE_NS.Scene;
  rig: LightRig;
  cfg: MutableSimConfig;
  origins: FighterFollowOrigins;
  roots: TrainingLightingRoots;
  /** Optional extras (e.g. hit-VFX spark pool on p1). Not a copy of CONFIG.lights. */
  extra?: SelectiveLightExtras;
  /** After syncLightsFromConfig, before environment / selective bind. */
  afterSyncLights?: () => void;
  /** After each selective bind (including the rAF retry). */
  afterSelectiveBind?: () => void;
};

/**
 * Apply live CONFIG lighting to a scene: shadow flag → LightRig sync → env →
 * selective lightsNode (with a next-frame rebind for WebGPU DynamicLighting).
 */
export function refreshTrainingLighting(
  args: RefreshTrainingLightingArgs,
): void {
  const {
    THREE,
    renderer,
    scene,
    rig,
    cfg,
    origins,
    roots,
    extra,
    afterSyncLights,
    afterSelectiveBind,
  } = args;

  renderer.shadowMap.enabled = cfg.shadowMapEnabled;
  syncLightsFromConfig(THREE, scene, rig, cfg, origins);
  afterSyncLights?.();
  applyEnvironment(THREE, scene, cfg);

  const bind = (): void => {
    applySelectiveLightNodes(cfg.lights, rig, roots, extra);
    afterSelectiveBind?.();
  };
  bind();
  // WebGPU + DynamicLighting can miss brand-new lights if lightsNode is rebuilt
  // in the same turn as scene.add(light).
  requestAnimationFrame(bind);
}
