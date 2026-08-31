import * as THREE from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';
import type { LightRig } from '../LightRig';
import { createMulberry32, ephemeralSeed } from './mulberry32';
import {
  compileRecipeToSystemDef,
  estimateInstanceLifetimeSec,
  findSparkLight,
} from './HitVfxPlumeCompiler';
import { HitVfxPointLightPool } from './HitVfxPointLightPool';
import { Manager, type System } from './plumeApi';
import type {
  HitVfxHeight,
  HitVfxHeightOffset,
  HitVfxRecipe,
  HitVfxRecipeKind,
  HitVfxStrength,
  HitVfxTriggerArgs,
} from './hitVfxTypes';
import { VolumeSmokeRuntime } from './volumeSmoke/VolumeSmokeRuntime';

export type HitVfxRuntimeConfigSlice = {
  hitVfxEnabled: boolean;
  hitVfxRecipes: HitVfxRecipe[];
  hitVfxActiveRecipeOnHitId: string;
  hitVfxActiveRecipeOnBlockId: string;
  hitVfxTimeScale: number;
  hitVfxPaused: boolean;
  hitVfxStepFrames: number;
  hitVfxSeedLocked: boolean;
  hitVfxSeed: number;
  hitVfxFollowHitstop: boolean;
  hitVfxHeightOffsets: HitVfxHeightOffset;
  hitVfxMaxConcurrent: number;
  hitVfxSparkLightPoolSize: number;
  hitVfxDebug: boolean;
  modelYOffset: number;
  /**
   * Editor-only: when present, volume-smoke seed gizmos stay bound to this
   * element id (`null` = selection is not a volumeSmoke → hide gizmos).
   * Omit in match so gizmos stay unbound (last spawn wins).
   */
  hitVfxEditorGizmoElementId?: string | null;
};

type ActiveInstance = {
  prefabId: string;
  system: System | null;
  lightHandle: number | null;
  deathAt: number;
};

export class HitVfxRuntime {
  private manager: Manager | null = null;
  private lightPool: HitVfxPointLightPool | null = null;
  private readonly scene: THREE.Object3D;
  private readonly renderer: WebGPURenderer;
  private camera: THREE.Camera;
  private cfg: HitVfxRuntimeConfigSlice;
  private recipesById = new Map<string, HitVfxRecipe>();
  private registeredPrefabIds = new Set<string>();
  private active: ActiveInstance[] = [];
  private clockSec = 0;
  private hitstopActive = false;
  private debugMarker: THREE.Mesh | null = null;
  private rebuildToken = 0;
  private volumeSmoke: VolumeSmokeRuntime | null = null;
  private lightRig: LightRig | null = null;

  constructor(args: {
    renderer: WebGPURenderer;
    scene: THREE.Object3D;
    camera: THREE.Camera;
    config: HitVfxRuntimeConfigSlice;
    lightRig?: LightRig | null;
  }) {
    this.renderer = args.renderer;
    this.scene = args.scene;
    this.camera = args.camera;
    this.cfg = args.config;
    this.lightRig = args.lightRig ?? null;
    this.volumeSmoke = new VolumeSmokeRuntime({
      renderer: args.renderer,
      scene: args.scene as THREE.Scene,
      lightRig: this.lightRig,
    });
    this.applyConfig(args.config);
  }

  setLightRig(rig: LightRig | null): void {
    this.lightRig = rig;
    this.volumeSmoke?.setLightRig(rig);
  }

  applyConfig(config: HitVfxRuntimeConfigSlice): void {
    this.cfg = config;
    this.recipesById.clear();
    for (const r of config.hitVfxRecipes) {
      this.recipesById.set(r.id, r);
    }
    if ('hitVfxEditorGizmoElementId' in config) {
      this.volumeSmoke?.setEditorGizmoElementId(
        config.hitVfxEditorGizmoElementId ?? null,
      );
    } else {
      this.volumeSmoke?.setEditorGizmoElementId(undefined);
    }
    if (!this.lightPool) {
      this.lightPool = new HitVfxPointLightPool(
        this.scene,
        config.hitVfxSparkLightPoolSize,
      );
    } else if (this.lightPool.size !== config.hitVfxSparkLightPoolSize) {
      this.lightPool.dispose();
      this.lightPool = new HitVfxPointLightPool(
        this.scene,
        config.hitVfxSparkLightPoolSize,
      );
    }
    if (!this.manager) {
      this.manager = new Manager({
        renderer: this.renderer,
        scene: this.scene,
        camera: this.camera,
        maxActive: Math.max(4, config.hitVfxMaxConcurrent),
      });
    } else {
      this.manager.maxActive = Math.max(4, config.hitVfxMaxConcurrent);
    }
    if (config.hitVfxDebug && !this.debugMarker) {
      const g = new THREE.SphereGeometry(0.04, 8, 8);
      const m = new THREE.MeshBasicMaterial({ color: 0xffff00 });
      this.debugMarker = new THREE.Mesh(g, m);
      this.debugMarker.visible = false;
      this.scene.add(this.debugMarker);
    }
    if (!config.hitVfxDebug && this.debugMarker) {
      this.scene.remove(this.debugMarker);
      this.debugMarker.geometry.dispose();
      (this.debugMarker.material as THREE.Material).dispose();
      this.debugMarker = null;
    }
  }

  setHitstopActive(active: boolean): void {
    this.hitstopActive = active;
  }

  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
    if (this.manager) this.manager.camera = camera;
  }

  /** Drop registered prefabs (call after recipe edit). */
  invalidatePrefabs(): void {
    if (this.manager) {
      this.manager.clear();
      for (const id of this.registeredPrefabIds) {
        this.manager.unregister(id);
      }
      this.registeredPrefabIds.clear();
    }
    this.active = [];
    this.lightPool?.releaseAll();
    this.volumeSmoke?.clear();
    this.rebuildToken++;
  }

  trigger(args: HitVfxTriggerArgs): void {
    if (!this.cfg.hitVfxEnabled || !this.manager || !this.lightPool) return;
    const recipeId =
      args.kind === 'onBlock'
        ? this.cfg.hitVfxActiveRecipeOnBlockId
        : this.cfg.hitVfxActiveRecipeOnHitId;
    const recipe = this.recipesById.get(recipeId);
    if (!recipe) return;

    const seed = this.cfg.hitVfxSeedLocked
      ? this.cfg.hitVfxSeed >>> 0
      : ephemeralSeed();
    const rng = createMulberry32(seed);

    const off = this.cfg.hitVfxHeightOffsets[args.height] ??
      this.cfg.hitVfxHeightOffsets.m;
    const worldPos = new THREE.Vector3(
      args.x,
      this.cfg.modelYOffset + off.y,
      off.z * (args.facing >= 0 ? 1 : -1),
    );

    if (this.debugMarker) {
      this.debugMarker.position.copy(worldPos);
      this.debugMarker.visible = true;
    }

    while (this.active.length >= this.cfg.hitVfxMaxConcurrent) {
      this.retireOldest();
    }

    const punchAxis =
      args.axis != null
        ? new THREE.Vector3(args.axis[0], args.axis[1], args.axis[2]).normalize()
        : new THREE.Vector3(-args.facing, 0, 0).normalize();

    // Volume smoke path (parallel to plume).
    const groupOk = (groupId: string) =>
      recipe.groups.find((g) => g.id === groupId)?.enabled !== false;
    const scale = recipe.strengthScale[args.strength];
    const volumeEls = recipe.elements.filter(
      (
        el,
      ): el is Extract<(typeof recipe.elements)[number], { type: 'volumeSmoke' }> =>
        el.type === 'volumeSmoke' && el.enabled && groupOk(el.groupId),
    );
    const hasVolumeSmoke = volumeEls.length > 0;
    if (hasVolumeSmoke) {
      // Size the shared pool for concurrent elements up front (once).
      void this.volumeSmoke?.ensureReady(
        VolumeSmokeRuntime.maxPoolSizeFromRecipe(recipe),
      );
    }
    for (const el of volumeEls) {
      const spawnSeed = el.params.randomizeSeed
        ? ephemeralSeed()
        : this.cfg.hitVfxSeedLocked
          ? seed
          : el.params.spawnSeed >>> 0;
      this.volumeSmoke?.schedule({
        params: el.params,
        worldPos: worldPos.clone(),
        worldNormal: punchAxis.clone(),
        startDelaySec: el.startDelaySec,
        lifetimeMul: scale.lifetimeMul,
        sizeMul: scale.sizeMul,
        spawnSeed,
        elementId: el.id,
      });
    }

    const sparkLight = findSparkLight(recipe);
    let vfxLightBoost = 0;
    let lightHandle: number | null = null;
    if (sparkLight) {
      const intensity =
        sparkLight.params.intensity *
        recipe.strengthScale[args.strength].lightIntensityMul;
      if (sparkLight.params.castOnCharacter) {
        lightHandle = this.lightPool.acquire({
          color: sparkLight.params.color,
          intensity,
          intensityEnd: sparkLight.params.intensityEnd,
          distance: sparkLight.params.distance,
          decay: sparkLight.params.decay,
          position: worldPos,
          lifetimeSec: sparkLight.params.lifetimeSec,
        });
      }
      if (sparkLight.params.castOnVfxElements) {
        vfxLightBoost = intensity * 0.08;
      }
    }

    const prefabId = `hv_${recipe.id}_${args.strength}_${seed}_${this.rebuildToken}_${this.clockSec.toFixed(3)}`;
    const def = compileRecipeToSystemDef({
      recipe,
      strength: args.strength,
      seed,
      rng,
      vfxLightBoost,
    });
    const life = estimateInstanceLifetimeSec(recipe, args.strength);

    // Only particle emitters — empty system if all particle elements disabled
    if (def.emitters.length === 0) {
      this.active.push({
        prefabId,
        system: null,
        lightHandle,
        deathAt: this.clockSec + life,
      });
      if (!hasVolumeSmoke && lightHandle == null) {
        // nothing else
      }
      return;
    }

    this.manager.register(prefabId, () => def);
    this.registeredPrefabIds.add(prefabId);
    // Plume ring births in XZ (local +Y axis). Align +Y with punch axis.
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      punchAxis.lengthSq() > 1e-8 ? punchAxis : new THREE.Vector3(0, 1, 0),
    );
    const sys = this.manager.spawn(prefabId, {
      position: worldPos,
      quaternion: quat,
    });
    this.active.push({
      prefabId,
      system: sys,
      lightHandle,
      deathAt: this.clockSec + life,
    });
  }

  /**
   * Preview / match tick.
   * @param renderDt seconds (usually RAF dt)
   * @param logicHitstop whether match hitstop timer > 0
   * @param consumeStep mutate callback to clear stepFrames in CONFIG
   */
  tick(
    renderDt: number,
    logicHitstop: boolean,
    consumeStep?: () => number,
  ): void {
    if (!this.manager) return;
    this.hitstopActive = logicHitstop;

    let vfxDt = 0;
    if (this.cfg.hitVfxPaused) {
      const steps = consumeStep?.() ?? 0;
      if (steps > 0) vfxDt = (1 / 60) * this.cfg.hitVfxTimeScale * steps;
    } else {
      vfxDt = Math.max(0, renderDt) * this.cfg.hitVfxTimeScale;
      if (this.cfg.hitVfxFollowHitstop && this.hitstopActive) vfxDt = 0;
      const steps = consumeStep?.() ?? 0;
      if (steps > 0) vfxDt += (1 / 60) * this.cfg.hitVfxTimeScale * steps;
    }

    this.clockSec += vfxDt;
    this.manager.tick(vfxDt, this.camera);
    this.volumeSmoke?.tick(vfxDt);

    if (this.lightPool) {
      for (let i = 0; i < this.lightPool.size; i++) {
        this.lightPool.update(i, vfxDt);
      }
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const inst = this.active[i]!;
      const dead =
        this.clockSec >= inst.deathAt ||
        (inst.system != null && !inst.system.isAlive());
      if (dead) {
        if (inst.lightHandle != null) this.lightPool?.release(inst.lightHandle);
        if (this.manager.has(inst.prefabId)) {
          // leave pool; unregister only on invalidate
        }
        this.active.splice(i, 1);
      }
    }
  }

  private retireOldest(): void {
    const inst = this.active.shift();
    if (!inst) return;
    if (inst.lightHandle != null) this.lightPool?.release(inst.lightHandle);
    if (inst.system) inst.system.hardStop();
  }

  getLightPool(): HitVfxPointLightPool | null {
    return this.lightPool;
  }

  /** Number of still-living preview / match instances. */
  getActiveCount(): number {
    return this.active.length + (this.volumeSmoke?.getActiveCount() ?? 0);
  }

  getVolumeSmokeRuntime(): VolumeSmokeRuntime | null {
    return this.volumeSmoke;
  }

  /**
   * Live-push volumeSmoke params in the editor (gizmo + running sim uniforms).
   * Does not clear / respawn; pair with a debounced preview trigger for splat shape.
   */
  applyVolumeSmokeEditorParams(
    params: import('./hitVfxTypes').VolumeSmokeParams,
    preview?: {
      x: number;
      height: HitVfxHeight;
      facing: number;
      axis?: [number, number, number];
      elementId?: string;
      /** Preview strength band; used with recipe lookup when sizeMul omitted. */
      strength?: HitVfxStrength;
      /** Explicit sizeMul from editor selected recipe (preferred). */
      sizeMul?: number;
    },
  ): void {
    if (!this.volumeSmoke) return;
    let origin: THREE.Vector3 | undefined;
    let normal: THREE.Vector3 | undefined;
    const strength = preview?.strength ?? 'M';
    if (preview) {
      origin = worldPosFromTrigger(
        {
          kind: 'onHit',
          strength,
          height: preview.height,
          x: preview.x,
          facing: preview.facing,
          axis: preview.axis,
        },
        this.cfg.hitVfxHeightOffsets,
        this.cfg.modelYOffset,
      );
      normal =
        preview.axis != null
          ? new THREE.Vector3(
              preview.axis[0],
              preview.axis[1],
              preview.axis[2],
            ).normalize()
          : new THREE.Vector3(-preview.facing, 0, 0).normalize();
    }
    let sizeMul = preview?.sizeMul;
    if (sizeMul == null) {
      const recipeId = this.cfg.hitVfxActiveRecipeOnHitId;
      const recipe = this.recipesById.get(recipeId);
      sizeMul = recipe?.strengthScale[strength]?.sizeMul ?? 1;
    }
    this.volumeSmoke.applyEditorParams(
      params,
      origin,
      normal,
      preview?.elementId,
      sizeMul,
    );
  }

  /**
   * Editor soft-replay: clear + re-schedule only one volumeSmoke element so
   * sibling instances in the same group keep their own authored params/life.
   */
  replayVolumeSmokeElement(
    elementId: string,
    args: {
      kind: HitVfxRecipeKind;
      strength: HitVfxStrength;
      height: HitVfxHeight;
      x: number;
      facing: number;
      axis?: [number, number, number];
    },
  ): void {
    if (!this.volumeSmoke || !this.cfg.hitVfxEnabled) return;
    const recipeId =
      args.kind === 'onBlock'
        ? this.cfg.hitVfxActiveRecipeOnBlockId
        : this.cfg.hitVfxActiveRecipeOnHitId;
    const recipe = this.recipesById.get(recipeId);
    if (!recipe) return;
    const el = recipe.elements.find(
      (e) =>
        e.id === elementId &&
        e.type === 'volumeSmoke' &&
        e.enabled &&
        recipe.groups.find((g) => g.id === e.groupId)?.enabled !== false,
    );
    if (!el || el.type !== 'volumeSmoke') return;

    this.volumeSmoke.clearElement(elementId);

    const off = this.cfg.hitVfxHeightOffsets[args.height] ??
      this.cfg.hitVfxHeightOffsets.m;
    const worldPos = new THREE.Vector3(
      args.x,
      this.cfg.modelYOffset + off.y,
      off.z * (args.facing >= 0 ? 1 : -1),
    );
    const punchAxis =
      args.axis != null
        ? new THREE.Vector3(args.axis[0], args.axis[1], args.axis[2]).normalize()
        : new THREE.Vector3(-args.facing, 0, 0).normalize();
    const scale = recipe.strengthScale[args.strength];
    const seed = this.cfg.hitVfxSeedLocked
      ? this.cfg.hitVfxSeed >>> 0
      : ephemeralSeed();
    const spawnSeed = el.params.randomizeSeed
      ? ephemeralSeed()
      : this.cfg.hitVfxSeedLocked
        ? seed
        : el.params.spawnSeed >>> 0;

    void this.volumeSmoke.ensureReady(
      VolumeSmokeRuntime.maxPoolSizeFromRecipe(recipe),
    );
    this.volumeSmoke.schedule({
      params: el.params,
      worldPos,
      worldNormal: punchAxis,
      startDelaySec: el.startDelaySec,
      lifetimeMul: scale.lifetimeMul,
      sizeMul: scale.sizeMul,
      spawnSeed,
      elementId: el.id,
    });
  }

  dispose(): void {
    this.invalidatePrefabs();
    this.manager?.dispose();
    this.manager = null;
    this.lightPool?.dispose();
    this.lightPool = null;
    this.volumeSmoke?.dispose();
    this.volumeSmoke = null;
    if (this.debugMarker) {
      this.scene.remove(this.debugMarker);
      this.debugMarker.geometry.dispose();
      (this.debugMarker.material as THREE.Material).dispose();
      this.debugMarker = null;
    }
  }
}

export function worldPosFromTrigger(
  args: HitVfxTriggerArgs,
  heightOffsets: HitVfxHeightOffset,
  modelYOffset: number,
): THREE.Vector3 {
  const off = heightOffsets[args.height as HitVfxHeight] ?? heightOffsets.m;
  return new THREE.Vector3(
    args.x,
    modelYOffset + off.y,
    off.z * (args.facing >= 0 ? 1 : -1),
  );
}
