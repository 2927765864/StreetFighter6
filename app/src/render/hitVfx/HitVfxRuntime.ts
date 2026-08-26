import * as THREE from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';
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
  HitVfxTriggerArgs,
} from './hitVfxTypes';

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

  constructor(args: {
    renderer: WebGPURenderer;
    scene: THREE.Object3D;
    camera: THREE.Camera;
    config: HitVfxRuntimeConfigSlice;
  }) {
    this.renderer = args.renderer;
    this.scene = args.scene;
    this.camera = args.camera;
    this.cfg = args.config;
    this.applyConfig(args.config);
  }

  applyConfig(config: HitVfxRuntimeConfigSlice): void {
    this.cfg = config;
    this.recipesById.clear();
    for (const r of config.hitVfxRecipes) {
      this.recipesById.set(r.id, r);
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
    if (!this.manager) return;
    this.manager.clear();
    for (const id of this.registeredPrefabIds) {
      this.manager.unregister(id);
    }
    this.registeredPrefabIds.clear();
    this.active = [];
    this.lightPool?.releaseAll();
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
    // Only particle emitters — empty system if all particle elements disabled
    if (def.emitters.length === 0) {
      const life = estimateInstanceLifetimeSec(recipe, args.strength);
      this.active.push({
        prefabId,
        system: null,
        lightHandle,
        deathAt: this.clockSec + life,
      });
      return;
    }

    this.manager.register(prefabId, () => def);
    this.registeredPrefabIds.add(prefabId);
    // Plume ring births in XZ (local +Y axis). Align +Y with punch axis.
    const punchAxis =
      args.axis != null
        ? new THREE.Vector3(args.axis[0], args.axis[1], args.axis[2]).normalize()
        : new THREE.Vector3(-args.facing, 0, 0).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      punchAxis.lengthSq() > 1e-8 ? punchAxis : new THREE.Vector3(0, 1, 0),
    );
    const sys = this.manager.spawn(prefabId, {
      position: worldPos,
      quaternion: quat,
    });
    const life = estimateInstanceLifetimeSec(recipe, args.strength);
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
    return this.active.length;
  }

  dispose(): void {
    this.invalidatePrefabs();
    this.manager?.dispose();
    this.manager = null;
    this.lightPool?.dispose();
    this.lightPool = null;
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
