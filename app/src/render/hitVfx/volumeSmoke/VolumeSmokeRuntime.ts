// Bridges typed recipe params to the @ts-nocheck HitSmokeVolume TSL port.
// @ts-nocheck
import * as THREE from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';
import type { LightRig } from '../../LightRig';
import type { HitVfxRecipe, VolumeSmokeParams } from '../hitVfxTypes';
import { HitSmokePool } from './HitSmokePool';
import { VolumeSmokeLighting } from './VolumeSmokeLighting';
import {
  rebuildSeedShapeGizmo,
  seedShapeGizmoKind,
} from './seedShapeGizmo';
import { buildSpawnVariation, randomUint32 } from './spawnSeed';

export type VolumeSmokeSpawnRequest = {
  params: VolumeSmokeParams;
  worldPos: THREE.Vector3;
  worldNormal: THREE.Vector3;
  /** Absolute start delay from trigger time. */
  startDelaySec: number;
  lifetimeMul: number;
  spawnSeed: number;
  /** Recipe element id — used to keep editor seed gizmo on the selection. */
  elementId?: string;
};

type PendingSpawn = VolumeSmokeSpawnRequest & { fireAt: number };

type ActiveTrack = {
  params: VolumeSmokeParams;
  deathAt: number;
  elementId?: string;
  lifetimeMul: number;
  /** Baked smokeLifespan * lifetimeMul — kept per instance so siblings don't share life. */
  effectiveLifespan: number;
  volume: import('./HitSmokeVolume').HitSmokeVolume;
};

function simParamsFrom(p: VolumeSmokeParams): Record<string, unknown> {
  return {
    simulate: p.simulate,
    simSpeed: p.simSpeed,
    pressureIterations: p.pressureIterations,
    fixedSubstepsHz: p.fixedSubstepsHz,
    smokeLifespan: p.smokeLifespan,
    tempLifespan: p.tempLifespan,
    buoyancy: p.buoyancy,
    weight: p.weight,
    turbulence: p.turbulence,
    turbulenceDecay: p.turbulenceDecay,
    turbFrequency: p.turbFrequency,
    turbulenceBias: p.turbulenceBias,
    turbulenceDir: p.turbulenceDir,
    velDamping: p.velDamping,
    hitRadius: p.hitRadius,
    seedShape: p.seedShape,
    shapeThickness: p.shapeThickness,
    ringRadiusRatio: p.ringRadiusRatio,
    ringWidth: p.ringWidth,
    columnHeight: p.columnHeight,
    seedRotation: p.seedRotation,
    hitImpulse: p.hitImpulse,
    impulseRadial: p.impulseRadial,
    impulseSwirl: p.impulseSwirl,
    impulseSubsteps: p.impulseSubsteps,
    impulseScaleWithBox: p.impulseScaleWithBox,
    velDisplayWarp: p.velDisplayWarp,
    densityStop: p.densityStop,
    endCondition: p.endCondition,
    fadeOutSec: p.fadeOutSec,
    fadeCurve: p.fadeCurve,
    unrestricted: p.unrestricted,
    volumeSize: p.volumeSize,
    unrestrictedVolumeSize: p.unrestrictedVolumeSize,
    shadowAbsorption: p.shadowAbsorption,
    shadowAmbient: p.shadowAmbient,
    powderStrength: p.powderStrength,
    multiScattering: p.multiScattering,
    phaseAsymmetry: p.phaseAsymmetry,
    smokeColor: p.smokeColor,
    densityGain: p.densityGain,
    raymarchSteps: p.raymarchSteps,
  };
}

/**
 * Whether a spawn/apply may refresh the shared editor seed gizmo.
 * - `focusId === undefined` — unbound (match): any element
 * - `focusId === null` — editor selection is not volumeSmoke: nobody
 * - `focusId === string` — only that element
 */
export function volumeSmokeOwnsEditorGizmo(
  focusId: string | null | undefined,
  elementId?: string,
): boolean {
  if (focusId === undefined) return true;
  if (focusId === null) return false;
  return elementId === focusId;
}

/**
 * Parallel (non-plume) runtime for volumeSmoke elements.
 */
export class VolumeSmokeRuntime {
  private readonly renderer: WebGPURenderer;
  private readonly scene: THREE.Scene;
  private pool: HitSmokePool | null = null;
  private readonly lighting: VolumeSmokeLighting;
  private initPromise: Promise<void> | null = null;
  private ready = false;
  private clockSec = 0;
  private pending: PendingSpawn[] = [];
  private activeTracks: ActiveTrack[] = [];
  private desiredPoolSize = 2;
  private rebuildToken = 0;
  private warnedPipeline = false;
  private activeParams: VolumeSmokeParams | null = null;
  /**
   * Editor gizmo ownership:
   * - `undefined` — unbound (match / non-editor): last spawn may refresh gizmos
   * - `null` — editor focus is not a volumeSmoke: hide gizmos, ignore spawns
   * - `string` — only that element’s spawn / applyEditorParams may refresh gizmos
   */
  private editorGizmoElementId: string | null | undefined = undefined;
  private gizmos: {
    turbArrow: THREE.ArrowHelper;
    seedGroup: THREE.Group;
    seedKind: string;
    previewOrigin: THREE.Vector3;
    previewNormal: THREE.Vector3;
  } | null = null;

  constructor(args: {
    renderer: WebGPURenderer;
    scene: THREE.Scene;
    lightRig?: LightRig | null;
  }) {
    this.renderer = args.renderer;
    this.scene = args.scene;
    this.lighting = new VolumeSmokeLighting({
      scene: args.scene,
      renderer: args.renderer,
      lightRig: args.lightRig,
    });
  }

  setLightRig(rig: LightRig | null): void {
    this.lighting.setLightRig(rig);
  }

  /**
   * Bind seed/turbulence gizmos to one recipe element (editor), or unbind.
   * Pass `undefined` to leave match-style “last spawn wins” behavior.
   */
  setEditorGizmoElementId(elementId: string | null | undefined): void {
    this.editorGizmoElementId = elementId;
    if (elementId === null) this.hideEditorGizmos();
  }

  getEditorGizmoElementId(): string | null | undefined {
    return this.editorGizmoElementId;
  }

  /**
   * Ensure pool has at least `poolSize` slots. Grows only — never shrinks an
   * existing ready pool (avoids wiping concurrent smokes mid-flight).
   */
  async ensureReady(poolSize = 2): Promise<void> {
    const size = Math.max(1, Math.min(8, Math.round(poolSize)));
    this.desiredPoolSize = Math.max(this.desiredPoolSize, size);
    const want = this.desiredPoolSize;

    if (this.pool && this.pool.poolSize >= want && this.ready) return;

    // Init already in flight for a large enough pool — just wait.
    if (
      this.pool &&
      this.pool.poolSize >= want &&
      this.initPromise &&
      !this.ready
    ) {
      await this.initPromise;
      return;
    }

    const token = ++this.rebuildToken;

    try {
      if (!this.pool) {
        this.ready = false;
        this.pool = new HitSmokePool(this.renderer, this.scene, {
          poolSize: want,
        });
        this.initPromise = this.pool.init().then(() => {
          if (token !== this.rebuildToken) return;
          this.ready = true;
        });
        await this.initPromise;
        return;
      }

      if (want > this.pool.poolSize) {
        this.ready = false;
        this.activeTracks = [];
        this.initPromise = this.pool.rebuild(want).then(() => {
          if (token !== this.rebuildToken) return;
          this.ready = true;
        });
        await this.initPromise;
        return;
      }

      if (this.initPromise) await this.initPromise;
    } catch (err) {
      console.error('[volumeSmoke] pool init failed', err);
      this.ready = false;
    }
  }

  /**
   * Slots needed for a recipe trigger: enough for every enabled volumeSmoke
   * firing together, and at least each element's configured poolSize.
   */
  static maxPoolSizeFromRecipe(recipe: HitVfxRecipe | null | undefined): number {
    if (!recipe) return 2;
    let maxParam = 1;
    let concurrent = 0;
    for (const el of recipe.elements) {
      if (el.type !== 'volumeSmoke' || !el.enabled) continue;
      const groupOk = recipe.groups.find((g) => g.id === el.groupId)?.enabled !== false;
      if (!groupOk) continue;
      concurrent += 1;
      maxParam = Math.max(maxParam, el.params.poolSize);
    }
    return Math.max(2, maxParam, concurrent);
  }

  schedule(req: VolumeSmokeSpawnRequest): void {
    const inFlight =
      this.pending.length +
      this.activeTracks.length +
      1;
    void this.ensureReady(
      Math.max(req.params.poolSize, inFlight, this.desiredPoolSize),
    );
    if (req.startDelaySec <= 0) {
      this.spawnNow(req);
      return;
    }
    this.pending.push({ ...req, fireAt: this.clockSec + req.startDelaySec });
  }

  private spawnNow(req: VolumeSmokeSpawnRequest): void {
    if (!this.pool || !this.ready) {
      // Queue until pool ready.
      this.pending.push({ ...req, fireAt: this.clockSec });
      return;
    }

    const p = req.params;
    if (p.useRenderPipeline && !this.warnedPipeline) {
      console.warn(
        '[volumeSmoke] useRenderPipeline is kept for parity but the host scene uses direct render.',
      );
      this.warnedPipeline = true;
    }

    let seed = req.spawnSeed >>> 0;
    if (p.randomizeSeed) {
      seed = randomUint32();
      p.spawnSeed = seed;
    }
    const variation = buildSpawnVariation(seed);

    const pos = req.worldPos.clone();
    pos.y += p.spawnHeight;

    const boxSize = p.unrestricted ? p.unrestrictedVolumeSize : p.volumeSize;

    // Drop tracks whose volume is about to be stolen by the pool.
    const freeSlots = this.pool.volumes.filter((v) => !v.active).length;
    if (freeSlots === 0 && this.pool.volumes.length > 0) {
      const oldest = this.pool.volumes.reduce((a, b) =>
        a.age > b.age ? a : b,
      );
      this.activeTracks = this.activeTracks.filter((t) => t.volume !== oldest);
    }

    const volume = this.pool.spawn(pos, req.worldNormal, {
      unrestricted: p.unrestricted,
      volumeSize: boxSize,
      hitRadius: p.hitRadius,
      impulse: p.hitImpulse,
      density: p.hitDensity,
      temperature: p.hitTemperature,
      radius: p.hitRadius,
      seedShape: p.seedShape,
      shapeThickness: p.shapeThickness,
      ringRadiusRatio: p.ringRadiusRatio,
      ringWidth: p.ringWidth,
      columnHeight: p.columnHeight,
      seedRotation: p.seedRotation,
      impulseRadial: p.impulseRadial,
      impulseSwirl: p.impulseSwirl,
      impulseSubsteps: p.impulseSubsteps,
      impulseScaleWithBox: p.impulseScaleWithBox,
      spawnSeed: seed,
      variation,
    });

    const life = Math.max(0.05, p.smokeLifespan * req.lifetimeMul);
    const fadeOutSec = Math.max(0, p.fadeOutSec ?? 0.3);
    // Lifespan mode: maxLife triggers fade. Density mode: disable age trigger.
    volume.maxLife =
      p.endCondition === 'density' ? Number.POSITIVE_INFINITY : life;
    if (p.stepsDecayEnable) {
      volume.volumetricMaterial.steps = p.raymarchSteps;
    }

    this.activeParams = p;
    // Scene lighting is shared; prefer the editor-focused element when set.
    if (this.shouldSyncGizmoFor(req.elementId) || this.editorGizmoElementId === undefined) {
      this.lighting.apply(p);
    }
    const keyPos = this.lighting.syncKeyLightPos();
    volume.uKeyLightPos.value.copy(keyPos);

    // Track budget includes fade so loop-replay / getActiveCount stay honest.
    const trackHorizon =
      p.endCondition === 'density'
        ? Math.max(life * 4, 6) + fadeOutSec
        : life + fadeOutSec;

    this.activeTracks.push({
      params: p,
      deathAt: this.clockSec + trackHorizon + 0.05,
      elementId: req.elementId,
      lifetimeMul: req.lifetimeMul,
      effectiveLifespan: life,
      volume,
    });
    // Multi volumeSmoke in one recipe: only the editor-focused element may
    // own the shared seed-shape gizmo. Without this, later spawns steal it.
    if (this.shouldSyncGizmoFor(req.elementId)) {
      this.ensureGizmos();
      if (this.gizmos) {
        this.gizmos.previewOrigin.copy(pos);
        this.gizmos.previewNormal.copy(req.worldNormal).normalize();
      }
      this.syncGizmos(p);
    }
  }

  /**
   * Editor live path: push params into the matching element's running volume(s)
   * + refresh seed gizmo — never rewrite sibling volumeSmoke instances.
   */
  applyEditorParams(
    params: VolumeSmokeParams,
    previewOrigin?: THREE.Vector3,
    previewNormal?: THREE.Vector3,
    elementId?: string,
  ): void {
    if (elementId !== undefined) {
      this.editorGizmoElementId = elementId;
    }
    this.activeParams = params;
    this.lighting.apply(params);
    if (this.pool && this.ready) {
      const boxSize = params.unrestricted
        ? params.unrestrictedVolumeSize
        : params.volumeSize;
      const sim = simParamsFrom(params);
      const keyPos = this.lighting.syncKeyLightPos();
      for (const track of this.activeTracks) {
        if (
          elementId != null &&
          track.elementId != null &&
          track.elementId !== elementId
        ) {
          continue;
        }
        if (!track.volume.active) continue;
        track.params = params;
        track.effectiveLifespan = Math.max(
          0.05,
          params.smokeLifespan * track.lifetimeMul,
        );
        track.volume.maxLife =
          params.endCondition === 'density'
            ? Number.POSITIVE_INFINITY
            : track.effectiveLifespan;
        track.volume.setUnrestricted(params.unrestricted);
        track.volume.setVolumeSize(boxSize);
        track.volume.params.hitRadius = params.hitRadius;
        track.volume.syncHitRadiusUVW();
        const simForTrack = {
          ...sim,
          smokeLifespan: track.effectiveLifespan,
        };
        this.pool.updateVolume(track.volume, 0, simForTrack);
        track.volume.uKeyLightPos.value.copy(keyPos);
      }
    }
    this.ensureGizmos();
    if (this.gizmos) {
      if (previewOrigin) this.gizmos.previewOrigin.copy(previewOrigin);
      if (previewNormal) {
        this.gizmos.previewNormal.copy(previewNormal).normalize();
      }
    }
    this.syncGizmos(params);
  }

  tick(dt: number): void {
    this.clockSec += dt;

    if (this.pending.length > 0) {
      const due: PendingSpawn[] = [];
      const keep: PendingSpawn[] = [];
      for (const item of this.pending) {
        if (item.fireAt <= this.clockSec) due.push(item);
        else keep.push(item);
      }
      this.pending = keep;
      for (const item of due) this.spawnNow(item);
    }

    if (this.pool && this.ready) {
      for (const track of this.activeTracks) {
        if (!track.volume.active) continue;
        const sim = {
          ...simParamsFrom(track.params),
          smokeLifespan: track.effectiveLifespan,
        };
        this.pool.updateVolume(track.volume, dt, sim);

        if (track.params.stepsDecayEnable) {
          const t = Math.min(
            1,
            track.volume.age / Math.max(1e-4, track.volume.maxLife),
          );
          const steps = Math.max(
            4,
            Math.round(track.params.raymarchSteps * (1 - t * 0.6)),
          );
          track.volume.volumetricMaterial.steps = steps;
        }
      }
    }

    for (let i = this.activeTracks.length - 1; i >= 0; i--) {
      const track = this.activeTracks[i]!;
      if (this.clockSec >= track.deathAt || !track.volume.active) {
        this.activeTracks.splice(i, 1);
      }
    }

    if (this.activeTracks.length > 0) {
      // Prefer editor-focused track for shared scene lighting; else last spawn.
      const focused =
        this.editorGizmoElementId != null
          ? this.activeTracks.find(
              (t) => t.elementId === this.editorGizmoElementId,
            )
          : undefined;
      const lightingTrack =
        focused ?? this.activeTracks[this.activeTracks.length - 1]!;
      this.activeParams = lightingTrack.params;
      this.lighting.apply(this.activeParams);
    }

    if (this.pool && this.ready) {
      const keyPos = this.lighting.syncKeyLightPos();
      for (const track of this.activeTracks) {
        if (!track.volume.active) continue;
        track.volume.uKeyLightPos.value.copy(keyPos);
      }
    }
  }

  clear(): void {
    this.pending = [];
    this.activeTracks = [];
    this.pool?.resetAll();
  }

  getActiveCount(): number {
    return this.activeTracks.length + this.pending.length;
  }

  private shouldSyncGizmoFor(elementId?: string): boolean {
    return volumeSmokeOwnsEditorGizmo(this.editorGizmoElementId, elementId);
  }

  private hideEditorGizmos(): void {
    if (!this.gizmos) return;
    this.gizmos.turbArrow.visible = false;
    this.gizmos.seedGroup.visible = false;
    this.gizmos.seedKind = '';
  }

  private ensureGizmos(): void {
    if (this.gizmos) return;
    const turbArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 1, 0),
      0.8,
      0x44ffaa,
      0.15,
      0.1,
    );
    turbArrow.visible = false;
    const seedGroup = new THREE.Group();
    seedGroup.visible = false;
    this.scene.add(turbArrow);
    this.scene.add(seedGroup);
    this.gizmos = {
      turbArrow,
      seedGroup,
      seedKind: '',
      previewOrigin: new THREE.Vector3(0, 1, 0),
      previewNormal: new THREE.Vector3(0, 1, 0),
    };
  }

  private syncGizmos(p: VolumeSmokeParams): void {
    this.ensureGizmos();
    if (!this.gizmos) return;

    const { turbArrow, seedGroup, previewOrigin, previewNormal } = this.gizmos;
    const origin = previewOrigin.clone();
    origin.y += p.spawnHeight;

    turbArrow.position.copy(origin);
    const dir = new THREE.Vector3(
      p.turbulenceDir.x,
      p.turbulenceDir.y,
      p.turbulenceDir.z,
    );
    if (dir.lengthSq() < 1e-8) dir.set(0, 1, 0);
    else dir.normalize();
    turbArrow.setDirection(dir);
    turbArrow.visible = !!p.showTurbulenceDir;

    if (!p.showSeedShape) {
      seedGroup.visible = false;
      this.gizmos.seedKind = '';
      return;
    }
    const kind = seedShapeGizmoKind(p);
    // Always rebuild so shape / radius / rotation edits show immediately.
    this.gizmos.seedKind = rebuildSeedShapeGizmo(
      seedGroup,
      p,
      origin,
      previewNormal,
    );
    void kind;
  }

  dispose(): void {
    this.clear();
    this.lighting.dispose();
    this.pool?.dispose();
    this.pool = null;
    this.ready = false;
    if (this.gizmos) {
      this.scene.remove(this.gizmos.turbArrow);
      this.scene.remove(this.gizmos.seedGroup);
      this.gizmos.turbArrow.line.geometry.dispose();
      (this.gizmos.turbArrow.line.material as THREE.Material).dispose();
      this.gizmos.turbArrow.cone.geometry.dispose();
      (this.gizmos.turbArrow.cone.material as THREE.Material).dispose();
      while (this.gizmos.seedGroup.children.length) {
        const c = this.gizmos.seedGroup.children.pop()!;
        if ((c as THREE.Mesh).geometry) (c as THREE.Mesh).geometry.dispose();
        const mat = (c as THREE.Mesh).material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else (mat as THREE.Material | undefined)?.dispose?.();
      }
      this.gizmos = null;
    }
  }
}
