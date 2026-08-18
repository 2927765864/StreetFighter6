/**
 * List-driven light rig — docs/plans/ai-execution-plan-lighting-system-v0.md §S2
 */
import type { MutableSimConfig } from '../config/constants';
import {
  enforceLightRules,
  type LightDesc,
  type LightType,
} from '../config/lightTypes';
import type * as THREE_NS from 'three/webgpu';

type ThreeMod = typeof THREE_NS;

export type LightRuntime = {
  descId: string;
  type: LightType;
  light: THREE_NS.Light;
  helper: THREE_NS.Object3D | null;
};

export type LightRig = {
  group: THREE_NS.Group;
  helperGroup: THREE_NS.Group;
  runtimes: Map<string, LightRuntime>;
};

function disposeHelper(helper: THREE_NS.Object3D | null): void {
  if (!helper) return;
  helper.traverse((o) => {
    const mesh = o as THREE_NS.Mesh;
    if (mesh.geometry) mesh.geometry.dispose?.();
    const mat = mesh.material as THREE_NS.Material | THREE_NS.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose?.());
    else mat?.dispose?.();
  });
}

function disposeLightObject(light: THREE_NS.Light): void {
  const any = light as THREE_NS.Light & { dispose?: () => void };
  any.dispose?.();
}

function applyShadowCamera(
  light: THREE_NS.DirectionalLight,
  cfg: MutableSimConfig,
): void {
  const size = Math.max(256, Math.min(4096, Math.round(cfg.shadowMapSize)));
  light.shadow.mapSize.set(size, size);
  light.shadow.camera.near = cfg.shadowCameraNear;
  light.shadow.camera.far = cfg.shadowCameraFar;
  const e = cfg.shadowCameraExtent;
  light.shadow.camera.left = -e;
  light.shadow.camera.right = e;
  light.shadow.camera.top = e;
  light.shadow.camera.bottom = -e;
  light.shadow.bias = cfg.shadowBias;
  light.shadow.normalBias = cfg.shadowNormalBias;
  light.shadow.radius = cfg.shadowRadius;
  light.shadow.camera.updateProjectionMatrix();
}

function createLightObject(
  THREE: ThreeMod,
  desc: LightDesc,
): THREE_NS.Light {
  switch (desc.type) {
    case 'ambient':
      return new THREE.AmbientLight(desc.color, desc.intensity);
    case 'hemisphere':
      return new THREE.HemisphereLight(
        desc.color,
        desc.groundColor ?? 0x444444,
        desc.intensity,
      );
    case 'directional':
      return new THREE.DirectionalLight(desc.color, desc.intensity);
    case 'point':
      return new THREE.PointLight(
        desc.color,
        desc.intensity,
        desc.distance ?? 0,
        desc.decay ?? 2,
      );
    case 'spot':
      return new THREE.SpotLight(
        desc.color,
        desc.intensity,
        desc.distance ?? 0,
        desc.angle ?? Math.PI / 6,
        desc.penumbra ?? 0.2,
        desc.decay ?? 2,
      );
  }
}

function createHelper(
  THREE: ThreeMod,
  desc: LightDesc,
  light: THREE_NS.Light,
): THREE_NS.Object3D | null {
  switch (desc.type) {
    case 'directional':
      return new THREE.DirectionalLightHelper(
        light as THREE_NS.DirectionalLight,
        2,
      );
    case 'point':
      return new THREE.PointLightHelper(light as THREE_NS.PointLight, 0.5);
    case 'spot':
      return new THREE.SpotLightHelper(light as THREE_NS.SpotLight);
    case 'hemisphere':
      return new THREE.HemisphereLightHelper(
        light as THREE_NS.HemisphereLight,
        2,
      );
    case 'ambient':
      return null;
  }
}

function writeDescToLight(
  light: THREE_NS.Light,
  desc: LightDesc,
  cfg: MutableSimConfig,
): void {
  light.visible = desc.enabled;
  light.intensity = desc.enabled ? desc.intensity : 0;
  light.color.setHex(desc.color);
  light.userData.lightId = desc.id;

  if (desc.type === 'ambient') return;

  if (desc.type === 'hemisphere') {
    const hemi = light as THREE_NS.HemisphereLight;
    hemi.groundColor.setHex(desc.groundColor ?? 0x444444);
    return;
  }

  light.position.set(desc.position.x, desc.position.y, desc.position.z);

  if (desc.type === 'directional') {
    const dir = light as THREE_NS.DirectionalLight;
    dir.target.position.set(desc.target.x, desc.target.y, desc.target.z);
    dir.target.updateMatrixWorld();
    // Follow lights only hit one fighter — no stage shadow (selective lightsNode).
    const followChar = desc.follow === 'p1' || desc.follow === 'p2';
    const wantShadow =
      desc.enabled &&
      desc.castShadow &&
      cfg.shadowMapEnabled &&
      !followChar;
    dir.castShadow = wantShadow;
    if (wantShadow) applyShadowCamera(dir, cfg);
    return;
  }

  if (desc.type === 'point') {
    const p = light as THREE_NS.PointLight;
    p.distance = desc.distance ?? 0;
    p.decay = desc.decay ?? 2;
    p.castShadow = false;
    return;
  }

  if (desc.type === 'spot') {
    const s = light as THREE_NS.SpotLight;
    s.target.position.set(desc.target.x, desc.target.y, desc.target.z);
    s.target.updateMatrixWorld();
    s.distance = desc.distance ?? 0;
    s.decay = desc.decay ?? 2;
    s.angle = desc.angle ?? Math.PI / 6;
    s.penumbra = desc.penumbra ?? 0.2;
    s.castShadow = false;
  }
}

export function createLightRig(
  THREE: ThreeMod,
  scene: THREE_NS.Scene,
): LightRig {
  const group = new THREE.Group();
  group.name = 'LightRig';
  const helperGroup = new THREE.Group();
  helperGroup.name = 'LightHelpers';
  scene.add(group);
  scene.add(helperGroup);
  return { group, helperGroup, runtimes: new Map() };
}

function removeRuntime(
  rig: LightRig,
  rt: LightRuntime,
): void {
  rig.group.remove(rt.light);
  const withTarget = rt.light as THREE_NS.DirectionalLight | THREE_NS.SpotLight;
  if (
    (rt.type === 'directional' || rt.type === 'spot') &&
    withTarget.target?.parent === rig.group
  ) {
    rig.group.remove(withTarget.target);
  }
  if (rt.helper) {
    rig.helperGroup.remove(rt.helper);
    disposeHelper(rt.helper);
  }
  disposeLightObject(rt.light);
  rig.runtimes.delete(rt.descId);
}

export function syncLightsFromConfig(
  THREE: ThreeMod,
  scene: THREE_NS.Scene,
  rig: LightRig,
  cfg: MutableSimConfig,
): void {
  void scene;
  const lights = enforceLightRules(
    cfg.lights.map((l) => ({
      ...l,
      position: { ...l.position },
      target: { ...l.target },
    })),
    cfg.lightMaxCount,
  );
  // Write exclusive shadow rules back so panel matches runtime.
  cfg.lights = lights;

  const desired = new Set(lights.map((l) => l.id));
  for (const [id, rt] of [...rig.runtimes.entries()]) {
    if (!desired.has(id)) removeRuntime(rig, rt);
  }

  for (const desc of lights) {
    let rt = rig.runtimes.get(desc.id);
    if (rt && rt.type !== desc.type) {
      removeRuntime(rig, rt);
      rt = undefined;
    }
    if (!rt) {
      const light = createLightObject(THREE, desc);
      rig.group.add(light);
      if (desc.type === 'directional' || desc.type === 'spot') {
        const withTarget = light as THREE_NS.DirectionalLight | THREE_NS.SpotLight;
        rig.group.add(withTarget.target);
      }
      const helper = createHelper(THREE, desc, light);
      if (helper) {
        helper.visible = cfg.lightHelpersVisible;
        rig.helperGroup.add(helper);
      }
      rt = { descId: desc.id, type: desc.type, light, helper };
      rig.runtimes.set(desc.id, rt);
    }
    writeDescToLight(rt.light, desc, cfg);
    if (rt.helper) {
      rt.helper.visible = cfg.lightHelpersVisible;
    }
  }

  rig.helperGroup.visible = cfg.lightHelpersVisible;
}

export function applyEnvironment(
  THREE: ThreeMod,
  scene: THREE_NS.Scene,
  cfg: MutableSimConfig,
): void {
  scene.background = new THREE.Color(cfg.bgColor);
  if (scene.fog && (scene.fog as THREE_NS.Fog).isFog) {
    const fog = scene.fog as THREE_NS.Fog;
    fog.color.setHex(cfg.fogColor);
    fog.near = cfg.fogNear;
    fog.far = cfg.fogFar;
  }
}

export function updateLightHelpers(rig: LightRig): void {
  for (const rt of rig.runtimes.values()) {
    const h = rt.helper as { update?: () => void } | null;
    h?.update?.();
  }
}

/** Push position/target from cfg into existing directional runtimes (no rebuild). */
export function applyLightTransformsFromConfig(
  rig: LightRig,
  cfg: MutableSimConfig,
): void {
  for (const desc of cfg.lights) {
    if (desc.type !== 'directional' && desc.type !== 'spot' && desc.type !== 'point') {
      continue;
    }
    const rt = rig.runtimes.get(desc.id);
    if (!rt) continue;
    if (desc.type === 'point') {
      rt.light.position.set(desc.position.x, desc.position.y, desc.position.z);
      continue;
    }
    rt.light.position.set(desc.position.x, desc.position.y, desc.position.z);
    if (desc.type === 'directional' || desc.type === 'spot') {
      const withTarget = rt.light as THREE_NS.DirectionalLight | THREE_NS.SpotLight;
      withTarget.target.position.set(desc.target.x, desc.target.y, desc.target.z);
      withTarget.target.updateMatrixWorld();
    }
  }
}

export function getLightById(
  rig: LightRig,
  id: string,
): THREE_NS.Light | null {
  return rig.runtimes.get(id)?.light ?? null;
}

export function disposeLightRig(
  scene: THREE_NS.Scene,
  rig: LightRig,
): void {
  for (const rt of [...rig.runtimes.values()]) {
    // THREE unused — dispose via group
    if (rt.helper) {
      rig.helperGroup.remove(rt.helper);
      disposeHelper(rt.helper);
    }
    disposeLightObject(rt.light);
  }
  rig.runtimes.clear();
  scene.remove(rig.group);
  scene.remove(rig.helperGroup);
}

/** @deprecated use syncLightsFromConfig + applyEnvironment */
export function applyLightConfig(
  THREE: ThreeMod,
  scene: THREE_NS.Scene,
  rig: LightRig,
  cfg: MutableSimConfig,
): void {
  syncLightsFromConfig(THREE, scene, rig, cfg);
  applyEnvironment(THREE, scene, cfg);
}
