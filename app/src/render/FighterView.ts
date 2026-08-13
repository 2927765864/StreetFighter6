import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { Fighter } from '../combat/fighter/Fighter';
import {
  STAGE_GROUND_Y,
  type MutableSimConfig,
} from '../config/constants';
import type { LogicGlbMap } from '../data/logicGlbMap';
import {
  detectProfile,
  mapForProfile,
  resolveClipName,
  type ClipNameMap,
  type ClipProfile,
} from './clipMaps';
import { AnimClipLibrary } from './AnimClipLibrary';
import { ProceduralRyuAnim } from './ProceduralRyuAnim';
import {
  logicFrameToClipTime,
  visualFrameToClipTime,
  type ScrubMode,
} from './AnimScrub';
import {
  bakeSkinnedMeshesToStatic,
  normalizeModelToHeight,
  prepareReExtractedFighter,
  pruneOutlierMeshes,
  resetFbxUnitScales,
  resetReArmatureTransform,
  applyReCentimeterToMeterIfNeeded,
  sanitizeObjectMaterials,
  worldBox,
} from './materialUtils';
import {
  defaultCrossfadeDurations,
  resolveCrossfadeSec,
  type CrossfadeDurations,
} from '../combat/anim/AnimCrossfade';
import {
  isJumpLandBinding,
  shouldResetGroundOffset,
  shouldSnapSoleOnLand,
} from './plantPolicy';

/** In-flight freeze-old + blend-to-new (§3.11 presentation crossfade). */
type PoseBlend = {
  from: THREE.AnimationAction;
  to: THREE.AnimationAction;
  fromKey: string;
  toKey: string;
  duration: number;
  elapsed: number;
  /** Frozen scrub time on `from` for the blend window. */
  fromTimeSec: number;
  /** If true, `to` free-runs with wall clock after weight settles. */
  toFreeRun: boolean;
};

const HARD_CUT: CrossfadeDurations = {
  locoSec: 0,
  residualToMoveSec: 0,
  residualToStanceSec: 0,
  residualToAttackSec: 0,
};

/**
 * Skinned fighter view.
 * Combat path: esf001_TPose.fbx (target) or glb fallback + AnimationClips from
 * private/assets/ryu/anims via LogicGlbMap.
 */
export class FighterView {
  root = new THREE.Group();
  private modelRoot: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private clipNames: string[] = [];
  private profile: ClipProfile = 'generic';
  private clipMap: ClipNameMap = mapForProfile('generic');
  private currentClip = '';
  /** logicId::role binding key */
  private currentBinding = '';
  private loaded = false;
  private plantWorldXZ: { x: number; z: number } | null = null;
  private footDebug: THREE.Mesh | null = null;
  private attackHipsLockLocal: THREE.Vector3 | null = null;
  /** Last fighter.phase seen by plant policy (one-shot snaps on land). */
  private lastPlantPolicyPhase: string | null = null;
  /** Snap after attack→land dissolve finishes (do not snap from air-attack pose). */
  private pendingLandPlant = false;
  /** modelRoot.y after install sole align; land reset returns here. */
  private modelGroundRestY = 0;
  private placeholder: THREE.Mesh;
  private procedural = new ProceduralRyuAnim();
  private useProcedural = false;
  /** Freeze-old presentation crossfade (§3.11; walk + residual→move, etc.). */
  private poseBlend: PoseBlend | null = null;
  /**
   * When true, ignore logic clipId and only advance the preview mixer
   * (used by the animation test panel).
   */
  private previewMode = false;
  private previewClipName = '';
  private previewStatus = 'idle';
  /**
   * Preview-only action key in `actions` / mixer. Combat `logicActions` stay
   * on the same mixer and are restored by stopping this action on exit.
   */
  private previewActionKey: string | null = null;
  modelUnitScale = 1;
  /** Debug: last world AABB size after sync */
  lastWorldSize = new THREE.Vector3();

  /** Anims table backend (combat). */
  private logicMap: LogicGlbMap | null = null;
  private clipLibrary: AnimClipLibrary | null = null;
  private animsMode = false;
  /** logic moveId → bound action */
  private logicActions = new Map<string, THREE.AnimationAction>();
  private logicLoadInflight = new Map<string, Promise<boolean>>();
  private lastLogicFailLog = '';

  constructor(scene: THREE.Scene, tint: number) {
    const geo = new THREE.CapsuleGeometry(0.28, 1.0, 4, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: tint,
      roughness: 0.6,
      metalness: 0.1,
    });
    this.placeholder = new THREE.Mesh(geo, mat);
    this.placeholder.position.y = 0.9;
    this.placeholder.name = 'placeholder';
    this.root.add(this.placeholder);
    scene.add(this.root);
  }

  async loadGltf(
    url: string,
    opts?: { unitScale?: number; targetHeight?: number; forceBakeSkin?: boolean },
  ): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    this.installModel(gltf.scene, gltf.animations, opts);
  }

  installFromTemplate(
    templateScene: THREE.Object3D,
    animations: THREE.AnimationClip[],
    opts?: { unitScale?: number; targetHeight?: number; forceBakeSkin?: boolean },
  ): void {
    // Clone full hierarchy + skins (required for second fighter)
    const cloned = cloneSkeleton(templateScene);
    this.installModel(cloned, animations, opts);
  }

  private installModel(
    model: THREE.Object3D,
    animations: THREE.AnimationClip[],
    opts?: { unitScale?: number; targetHeight?: number; forceBakeSkin?: boolean },
  ): void {
    if (this.placeholder.parent) {
      this.root.remove(this.placeholder);
      this.placeholder.geometry.dispose();
      (this.placeholder.material as THREE.Material).dispose();
    }
    if (this.modelRoot) {
      this.root.remove(this.modelRoot);
      this.modelRoot = null;
    }

    // 0) RE / Noesis / Blender extracts: fix FBX 0.01 unit scales + toxic pos tracks
    const prepared = prepareReExtractedFighter(model, animations);
    animations = prepared.animations;

    // 1) Skeleton to bind pose (do NOT re-bind — clone already bound)
    model.updateMatrixWorld(true);
    model.traverse((o) => {
      const sm = o as THREE.SkinnedMesh;
      if (sm.isSkinnedMesh) {
        sm.frustumCulled = false;
        if (sm.skeleton) {
          // prepareReExtractedFighter already posed RE models; still pose others
          if (!prepared.applied) {
            sm.skeleton.pose();
          }
          sm.skeleton.update();
        }
      }
    });
    // pose() can re-introduce Root bone scale 0.01 on RE assets
    if (prepared.applied) {
      resetFbxUnitScales(model);
      resetReArmatureTransform(model);
      // cm→m lives on root.userData.reMeterScale — re-assert after bone resets
      applyReCentimeterToMeterIfNeeded(model);
      model.traverse((o) => {
        const sm = o as THREE.SkinnedMesh;
        if (sm.isSkinnedMesh && sm.skeleton) sm.skeleton.update();
      });
    }

    // 2) Materials (WebGPU-safe + albedo remap)
    sanitizeObjectMaterials(model);

    // 3) REMOVE absurd submeshes (Eye Tear etc.)
    let pruned = pruneOutlierMeshes(model);

    // 4) Keep skin by default so procedural / clips can drive bones.
    //    forceBakeSkin only for emergency static display.
    let baked = 0;
    if (opts?.forceBakeSkin) {
      baked = bakeSkinnedMeshesToStatic(model);
      pruned += pruneOutlierMeshes(model);
    }

    this.actions.clear();
    this.clipNames = animations.map((c) => c.name);
    this.profile =
      animations.length === 0 ? 'ryu' : detectProfile(this.clipNames);
    this.clipMap = mapForProfile(this.profile);

    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of animations) {
      this.actions.set(clip.name, this.mixer.clipAction(clip));
    }

    // No-clip Ryu → procedural bone driver (needs live SkinnedMesh)
    this.useProcedural =
      baked === 0 && (this.profile === 'ryu' || animations.length === 0);
    if (this.useProcedural) {
      this.procedural.bind(model);
      if (!this.procedural.hasBones) {
        console.warn('[FighterView] procedural bound but 0 bones — idle will be frozen');
      }
    }

    // RE bind pose is often Z-up / inverted; apply idle frame 0 *before* normalize
    // so height + feet use the fighting stance AABBs.
    this.loaded = true;
    this.currentClip = '';
    this.playBest('idle');
    if (this.mixer && !this.useProcedural) {
      this.mixer.update(0);
      // Anim may re-apply Armature scale/quat; force unit transform for RE
      if (prepared.applied) {
        resetFbxUnitScales(model);
        resetReArmatureTransform(model);
      }
      model.updateMatrixWorld(true);
      model.traverse((o) => {
        const sm = o as THREE.SkinnedMesh;
        if (sm.isSkinnedMesh && sm.skeleton) sm.skeleton.update();
      });
    }

    // 5) Normalize scale + feet on ground (after stance pose for RE)
    if (opts?.unitScale != null) {
      model.scale.setScalar(opts.unitScale);
      model.updateMatrixWorld(true);
      const box = worldBox(model) ?? new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.x -= center.x;
      model.position.z -= center.z;
      model.position.y -= box.min.y;
      this.modelUnitScale = opts.unitScale;
    } else {
      const { unitScale } = normalizeModelToHeight(
        model,
        opts?.targetHeight ?? 1.85,
      );
      this.modelUnitScale = unitScale;
    }

    this.modelRoot = model;
    this.root.add(model);
    // One-shot sole align after stance pose (not per-frame; trust idle clip after this).
    this.plantFeetOnGround();
    this.modelGroundRestY = this.modelRoot.position.y;
    this.lastPlantPolicyPhase = 'idle';

    console.info(
      `[FighterView] install pruned=${pruned} baked=${baked} procedural=${this.useProcedural} ` +
        `profile=${this.profile} clips=${animations.length}` +
        (prepared.applied ? ' reExtract=1' : ''),
    );

    const wb = worldBox(this.root);
    if (wb) {
      const s = wb.getSize(new THREE.Vector3());
      this.lastWorldSize.copy(s);
      console.info(
        `[FighterView] OK profile=${this.profile} procedural=${this.useProcedural} ` +
          `worldSize=(${s.x.toFixed(2)},${s.y.toFixed(2)},${s.z.toFixed(2)})`,
      );
    } else {
      console.warn('[FighterView] world bounds empty after install — model may be collapsed');
    }
  }

  /**
   * Enable private/assets/ryu/anims playback via logic→glb map.
   * Call after mesh install; disables procedural / merged-c1 clip names.
   */
  setAnimsBackend(map: LogicGlbMap, library: AnimClipLibrary): void {
    this.logicMap = map;
    this.clipLibrary = library;
    this.animsMode = true;
    this.useProcedural = false;
    this.profile = 'ryu_sf6';
  }

  get usesAnimsBackend(): boolean {
    return this.animsMode;
  }

  /**
   * Preload logic clips so first frames are not empty.
   * Multi-role entries load every role (start/loop/end, prejump/air/land).
   */
  async preloadLogicClips(logicIds: readonly string[]): Promise<void> {
    const jobs: Promise<boolean>[] = [];
    for (const id of logicIds) {
      const roles =
        this.logicMap?.listRoles(id)?.length
          ? this.logicMap.listRoles(id)
          : ['main'];
      for (const role of roles) {
        jobs.push(this.ensureLogicClip(id, role));
      }
      // always try primary/main as fallback
      jobs.push(this.ensureLogicClip(id, 'main'));
    }
    await Promise.all(jobs);
  }

  private bindingKey(canon: string, role: string): string {
    return `${canon}::${role}`;
  }

  /**
   * Load + bind one anims glb clip for a logic id + role.
   */
  async ensureLogicClip(
    clipOrMoveId: string,
    role = 'main',
  ): Promise<boolean> {
    if (!this.animsMode || !this.logicMap || !this.clipLibrary || !this.modelRoot) {
      return false;
    }
    const canon = this.logicMap.canonical(clipOrMoveId) ?? clipOrMoveId;
    const key = this.bindingKey(canon, role);
    if (this.logicActions.has(key)) return true;
    // fallback: already have main under canon-only legacy key
    if (role === 'main' && this.logicActions.has(canon)) return true;

    const inflight = this.logicLoadInflight.get(key);
    if (inflight) return inflight;

    const task = (async () => {
      let path =
        this.logicMap!.pathForRole(canon, role) ??
        (role === 'main' ? this.logicMap!.primaryPath(canon) : null);
      // if role missing, try main/primary
      if (!path && role !== 'main') {
        path =
          this.logicMap!.pathForRole(canon, 'main') ??
          this.logicMap!.primaryPath(canon);
      }
      const url = path ? this.logicMap!.urlForAnimsRelPath(path) : null;
      if (!path || !url) {
        if (this.lastLogicFailLog !== key) {
          console.warn(
            `[FighterView] no anims path for logic id "${clipOrMoveId}" role=${role}`,
          );
          this.lastLogicFailLog = key;
        }
        return false;
      }
      try {
        const template = await this.clipLibrary!.loadClip(url, path);
        let clip = template.clone();
        clip.name = key;
        // Clip-only sanitize: never skeleton.pose() on the live fighter.
        const prepared = prepareReExtractedFighter(this.modelRoot!, [clip], {
          poseModel: false,
        });
        clip = prepared.animations[0] ?? clip;
        clip.name = key;

        if (!this.mixer) {
          this.mixer = new THREE.AnimationMixer(this.modelRoot!);
        }
        const action = this.mixer.clipAction(clip);
        this.logicActions.set(key, action);
        this.actions.set(key, action);
        if (!this.clipNames.includes(key)) this.clipNames.push(key);
        return true;
      } catch (err) {
        console.warn(`[FighterView] failed to load anims clip ${key}`, url, err);
        return false;
      } finally {
        this.logicLoadInflight.delete(key);
      }
    })();

    this.logicLoadInflight.set(key, task);
    return task;
  }

  private resolveLogicAction(
    clipId: string,
    role = 'main',
  ): THREE.AnimationAction | null {
    if (!this.logicMap) return null;
    const canon = this.logicMap.canonical(clipId) ?? clipId;
    const key = this.bindingKey(canon, role);
    return (
      this.logicActions.get(key) ??
      this.logicActions.get(this.bindingKey(canon, 'main')) ??
      this.logicActions.get(canon) ??
      null
    );
  }

  private resolveAction(
    clipId: string,
    role = 'main',
  ): THREE.AnimationAction | null {
    if (!this.mixer || this.useProcedural) return null;
    if (this.animsMode) {
      return this.resolveLogicAction(clipId, role);
    }
    const candidates =
      this.clipMap[clipId] ?? this.clipMap.idle ?? ['Idle', 'idle'];
    const name = resolveClipName(this.actions.keys(), candidates);
    if (!name || name.startsWith('__proc_')) return null;
    return this.actions.get(name) ?? null;
  }

  /**
   * Lowest sole contact height in world Y.
   * RE rig: ankle `L_Foot`/`R_Foot` sit above the sandal; distal toe bones sit
   * nearer the sole. Used only for rare full snaps (install / hard cut / land),
   * never to chase the idle breathing loop every frame.
   */
  private measureContactSoleY(): number | null {
    if (!this.modelRoot) return null;
    this.modelRoot.updateMatrixWorld(true);

    let toeMin = Infinity;
    let ankleMin = Infinity;
    const p = new THREE.Vector3();
    this.modelRoot.traverse((o) => {
      const bone = o as THREE.Bone;
      if (!bone.isBone) return;
      const n = bone.name;
      bone.getWorldPosition(p);
      // Distal toe chain ends (Footpinky2, Footindex2, …) ≈ sole
      if (/Foot(pinky|ring|middle|index|thumb)2$/i.test(n) || /ToeBase$/i.test(n)) {
        if (p.y < toeMin) toeMin = p.y;
        return;
      }
      if (
        /^(L_|R_)?Foot$/i.test(n) ||
        n === 'LeftFoot' ||
        n === 'RightFoot'
      ) {
        if (p.y < ankleMin) ankleMin = p.y;
      }
    });

    if (Number.isFinite(toeMin)) return toeMin;
    if (Number.isFinite(ankleMin)) return ankleMin;

    const box = worldBox(this.modelRoot);
    return box ? box.min.y : null;
  }

  /**
   * One-shot: translate modelRoot so sole contact sits on STAGE_GROUND_Y.
   * Trust authored idle/walk foot motion after this — do not call every frame
   * on grounded loops (that turns heel rise into whole-body Y jitter).
   * @param maxAbsDeltaWorld cap |ΔY| this call (slew); omit for full snap.
   */
  /** Undo accumulated sole-snap Y (needed before snapping from a land clip). */
  private resetModelGroundOffset(): void {
    if (!this.modelRoot) return;
    this.modelRoot.position.y = this.modelGroundRestY;
  }

  private plantFeetOnGround(maxAbsDeltaWorld?: number): void {
    if (!this.modelRoot) return;
    const soleY = this.measureContactSoleY();
    if (soleY == null || !Number.isFinite(soleY)) return;

    // Small sink so sandal mesh (below toe joints) kisses the ground plane.
    const soleBias = 0.012;
    let deltaWorld = STAGE_GROUND_Y - soleY + soleBias;
    if (Math.abs(deltaWorld) < 1e-4) return;
    // Guard against airborne / bad pose spikes
    if (Math.abs(deltaWorld) > 0.35) return;
    if (maxAbsDeltaWorld != null && Number.isFinite(maxAbsDeltaWorld)) {
      deltaWorld = THREE.MathUtils.clamp(
        deltaWorld,
        -maxAbsDeltaWorld,
        maxAbsDeltaWorld,
      );
    }
    const sy = this.root.scale.y || 1;
    this.modelRoot.position.y += deltaWorld / sy;
  }

  private isAirborneLogicPhase(phase: string): boolean {
    return phase === 'prejump' || phase === 'airborne';
  }

  private findFootBone(side: 'L' | 'R'): THREE.Bone | null {
    if (!this.modelRoot) return null;
    const names =
      side === 'L'
        ? ['L_Foot', 'LeftFoot', 'Foot_L', 'l_foot']
        : ['R_Foot', 'RightFoot', 'Foot_R', 'r_foot'];
    let found: THREE.Bone | null = null;
    this.modelRoot.traverse((o) => {
      const b = o as THREE.Bone;
      if (!b.isBone || found) return;
      if (names.some((n) => b.name === n || b.name.endsWith(n))) found = b;
      if (
        !found &&
        ((side === 'L' && /L_?Foot/i.test(b.name)) ||
          (side === 'R' && /R_?Foot/i.test(b.name)))
      ) {
        found = b;
      }
    });
    return found;
  }

  private findHipsBone(): THREE.Bone | null {
    if (!this.modelRoot) return null;
    let found: THREE.Bone | null = null;
    this.modelRoot.traverse((o) => {
      const b = o as THREE.Bone;
      if (!b.isBone || found) return;
      if (/hips|pelvis|root/i.test(b.name) && !/toe|foot/i.test(b.name)) {
        found = b;
      }
    });
    return found;
  }

  /** Attack support-foot lock (world XZ). Consensus §3.9 */
  private applyFootPlant(
    fighter: Fighter,
    cfg: MutableSimConfig,
  ): void {
    if (!cfg.footPlantEnabled || fighter.phase !== 'attack' || !fighter.mover.move) {
      this.plantWorldXZ = null;
      return;
    }
    const plant = fighter.mover.move.plant;
    if (!plant) {
      this.plantWorldXZ = null;
      return;
    }
    const f = fighter.mover.moveFrame;
    if (f < plant.fromFrame || f > plant.toFrame) {
      this.plantWorldXZ = null;
      return;
    }
    const bone = this.findFootBone(plant.foot);
    if (!bone) return;
    this.modelRoot?.updateMatrixWorld(true);
    if (!this.plantWorldXZ) {
      const p = new THREE.Vector3();
      bone.getWorldPosition(p);
      this.plantWorldXZ = { x: p.x, z: p.z };
    }
    const parent = bone.parent;
    if (!parent) return;
    parent.updateMatrixWorld(true);
    const target = new THREE.Vector3(
      this.plantWorldXZ.x,
      bone.getWorldPosition(new THREE.Vector3()).y,
      this.plantWorldXZ.z,
    );
    const local = parent.worldToLocal(target.clone());
    bone.position.x = local.x;
    bone.position.z = local.z;
    bone.updateMatrix();
    if (cfg.showFootDebug) {
      if (!this.footDebug) {
        this.footDebug = new THREE.Mesh(
          new THREE.SphereGeometry(0.04, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xff00ff }),
        );
        this.root.parent?.add(this.footDebug);
      }
      this.footDebug.position.set(
        this.plantWorldXZ.x,
        0.05,
        this.plantWorldXZ.z,
      );
      this.footDebug.visible = true;
    } else if (this.footDebug) {
      this.footDebug.visible = false;
    }
  }

  /** Zero horizontal hips drift during attack (logic owns x). */
  private applyRootPoseLock(cfg: MutableSimConfig, isAttack: boolean): void {
    if (!cfg.rootPoseLockAttack || !isAttack) {
      this.attackHipsLockLocal = null;
      return;
    }
    const hips = this.findHipsBone();
    if (!hips) return;
    if (!this.attackHipsLockLocal) {
      this.attackHipsLockLocal = hips.position.clone();
    } else {
      hips.position.x = this.attackHipsLockLocal.x;
      hips.position.z = this.attackHipsLockLocal.z;
    }
  }

  private maybePlantAfterPose(
    fighter: Fighter,
    cfg: MutableSimConfig,
    wallDtSec = 1 / 60,
  ): void {
    // A/B: old per-frame whole-body chase (will reintroduce idle Y jitter).
    if (cfg.plantMode === 'legacy') {
      const slew =
        (cfg.plantSlewPerSec ?? 0.55) * Math.min(Math.max(wallDtSec, 0), 0.1);
      this.plantFeetOnGround(Math.max(slew, 0.002));
      this.lastPlantPolicyPhase = fighter.phase;
      return;
    }

    // Trust authored clips on the ground (§3.9): no per-frame sole chase on
    // idle/walk/crouch/dash. Ball plant + heel rise stay in the animation.
    // One-shot vertical snap only when returning from air (landing, or any
    // grounded phase entered from prejump/airborne). Hard clip cuts still snap
    // in switchToLogicAction. Attack uses support-foot XZ window only.
    const phase = fighter.phase;
    const prev = this.lastPlantPolicyPhase;
    const grounded =
      phase === 'idle' ||
      phase === 'walk' ||
      phase === 'crouch' ||
      phase === 'dash' ||
      phase === 'landing' ||
      phase === 'hitstun' ||
      phase === 'blockstun';
    const fromAir =
      prev != null &&
      this.isAirborneLogicPhase(prev) &&
      !this.isAirborneLogicPhase(phase);
    const enterLanding = phase === 'landing' && prev !== 'landing';
    const blendingFromNonLand =
      this.poseBlend != null && !isJumpLandBinding(this.poseBlend.fromKey);
    if (shouldResetGroundOffset({ fromAir, enterLanding })) {
      this.resetModelGroundOffset();
      this.pendingLandPlant = true;
    }
    const snapNow = shouldSnapSoleOnLand({
      phase,
      animRole: fighter.animRole || 'main',
      fromAir,
      enterLanding,
      blendingFromNonLand,
    });
    if (this.pendingLandPlant && !blendingFromNonLand && fighter.animRole === 'land') {
      this.plantFeetOnGround();
      this.pendingLandPlant = false;
    } else if (grounded && snapNow) {
      this.plantFeetOnGround();
      this.pendingLandPlant = false;
    }
    this.lastPlantPolicyPhase = phase;

    if (phase === 'attack') {
      this.applyFootPlant(fighter, cfg);
    } else {
      this.plantWorldXZ = null;
    }
  }

  /**
   * Scrub a paused action to an absolute clip time.
   * @param weight effective weight (blend); default 1
   * @param updateMixer when false, caller must mixer.update(0) after multi-scrub
   */
  private scrubActionTo(
    action: THREE.AnimationAction,
    timeSec: number,
    weight = 1,
    updateMixer = true,
  ): void {
    if (!this.mixer) return;
    const clip = action.getClip();
    const t = THREE.MathUtils.clamp(timeSec, 0, Math.max(0, clip.duration - 1e-4));
    // CRITICAL: do NOT use mixer.setTime() while paused — effectiveTimeScale=0 so
    // action.time never advances (attack stuck on frame 0).
    action.enabled = true;
    action.paused = true;
    action.time = t;
    action.setEffectiveWeight(weight);
    if (updateMixer) this.mixer.update(0);
  }

  private clearPoseBlend(stopFrom = true): void {
    if (!this.poseBlend) return;
    if (stopFrom) {
      this.poseBlend.from.stop();
      this.poseBlend.from.setEffectiveWeight(0);
    }
    this.poseBlend = null;
  }

  /**
   * Start freeze-old + blend-to-new (§3.11). Freezes `from`; `to` is
   * scrubbed/free-run by the sync path.
   */
  private beginPoseBlend(
    from: THREE.AnimationAction,
    to: THREE.AnimationAction,
    fromKey: string,
    toKey: string,
    toFreeRun: boolean,
    blendSec: number,
  ): void {
    if (!this.mixer || blendSec <= 1e-4) {
      this.clearPoseBlend(true);
      this.mixer?.stopAllAction();
      to.reset();
      to.setLoop(
        toFreeRun ? THREE.LoopRepeat : THREE.LoopOnce,
        Infinity,
      );
      to.clampWhenFinished = !toFreeRun;
      to.paused = !toFreeRun;
      to.enabled = true;
      to.setEffectiveWeight(1);
      to.play();
      this.mixer?.update(0);
      return;
    }

    // Drop any prior blend's from-clip
    if (this.poseBlend && this.poseBlend.from !== from) {
      this.poseBlend.from.stop();
      this.poseBlend.from.setEffectiveWeight(0);
    }

    const fromTime = from.time;
    from.enabled = true;
    from.paused = true;
    from.setEffectiveWeight(1);

    to.reset();
    to.setLoop(toFreeRun ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    to.clampWhenFinished = !toFreeRun;
    to.enabled = true;
    to.paused = true;
    to.setEffectiveWeight(0);
    to.time = 0;
    to.play();

    this.poseBlend = {
      from,
      to,
      fromKey,
      toKey,
      duration: blendSec,
      elapsed: 0,
      fromTimeSec: fromTime,
      toFreeRun,
    };
    this.mixer.update(0);
  }

  /**
   * Advance pose-blend weights; freeze from; prepare `to` weight.
   * Returns weight on `to` in [0,1]. When finished, clears blend and returns 1.
   */
  private stepPoseBlend(wallDtSec: number): number {
    const b = this.poseBlend;
    if (!b || !this.mixer) return 1;

    b.elapsed += Math.min(Math.max(wallDtSec, 0), 0.1);
    const u = Math.min(1, b.elapsed / Math.max(1e-4, b.duration));
    // smoothstep
    const w = u * u * (3 - 2 * u);

    this.scrubActionTo(b.from, b.fromTimeSec, 1 - w, false);

    if (u >= 1) {
      b.from.stop();
      b.from.setEffectiveWeight(0);
      b.to.setEffectiveWeight(1);
      if (b.toFreeRun) {
        b.to.paused = false;
        b.to.setLoop(THREE.LoopRepeat, Infinity);
      }
      this.poseBlend = null;
      this.mixer.update(0);
      return 1;
    }
    return w;
  }

  private isFreeRunLogic(canon: string, role: string): boolean {
    return (canon === 'idle' || canon === 'crouch') && role === 'main';
  }

  /**
   * Switch to a loaded logic action (sync).
   * Soft-blends per §3.11 resolveCrossfadeSec (freeze-old).
   */
  private switchToLogicAction(
    canon: string,
    role: string,
    action: THREE.AnimationAction,
    durations: CrossfadeDurations,
  ): void {
    const bind = this.bindingKey(canon, role);
    if (this.currentBinding === bind) return;

    const prevKey = this.currentBinding;
    const prev =
      prevKey && this.logicActions.has(prevKey)
        ? this.logicActions.get(prevKey)!
        : null;
    const freeRun = this.isFreeRunLogic(canon, role);
    const blendSec = resolveCrossfadeSec(prevKey, bind, durations);
    const soft = prev != null && blendSec > 1e-4;

    if (soft && prev) {
      this.beginPoseBlend(prev, action, prevKey, bind, freeRun, blendSec);
      if (isJumpLandBinding(bind)) {
        this.resetModelGroundOffset();
        this.pendingLandPlant = true;
      }
    } else {
      this.clearPoseBlend(true);
      this.mixer?.stopAllAction();
      action.reset();
      action.setLoop(freeRun ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      action.clampWhenFinished = !freeRun;
      action.paused = false;
      action.enabled = true;
      action.setEffectiveWeight(1);
      action.play();
      this.mixer?.update(0);
      // Hard cut: land snaps after land pose; other cuts keep old one-shot
      if (isJumpLandBinding(bind)) {
        this.resetModelGroundOffset();
        this.plantFeetOnGround();
        this.pendingLandPlant = false;
      } else {
        this.plantFeetOnGround();
      }
    }

    this.currentClip = canon;
    this.currentBinding = bind;
    this.attackHipsLockLocal = null;
    this.plantWorldXZ = null;
  }

  /**
   * Switch to logic clip + role. Does not thrash if binding unchanged.
   * @param durations §3.11 crossfade table (or HARD_CUT / all zeros)
   */
  playBest(
    clipId: string,
    role = 'main',
    durations: CrossfadeDurations | number = HARD_CUT,
  ): void {
    if (this.previewMode) return;

    const d: CrossfadeDurations =
      typeof durations === 'number'
        ? defaultCrossfadeDurations({
            locoSec: durations,
            residualToMoveSec: durations,
            residualToStanceSec: durations,
            residualToAttackSec: 0,
          })
        : durations;

    if (this.animsMode) {
      const canon = this.logicMap?.canonical(clipId) ?? clipId;
      const key = this.bindingKey(canon, role);
      if (this.currentBinding === key && this.resolveLogicAction(clipId, role)) {
        return;
      }
      const ready = this.resolveLogicAction(clipId, role);
      if (ready) {
        this.switchToLogicAction(canon, role, ready, d);
        return;
      }
      void this.ensureLogicClip(clipId, role).then((ok) => {
        if (!ok || this.previewMode) return;
        const action = this.resolveLogicAction(clipId, role);
        if (!action) return;
        const bind = this.bindingKey(
          this.logicMap?.canonical(clipId) ?? clipId,
          role,
        );
        if (this.currentBinding === bind) return;
        // Async first bind: hard cut (preload should make this rare for walk)
        this.switchToLogicAction(canon, role, action, HARD_CUT);
      });
      return;
    }

    if (this.useProcedural) {
      if (this.currentClip === clipId) return;
      this.procedural.setMode(clipId);
      this.currentClip = clipId;
      return;
    }

    if (this.currentClip === clipId) return;
    const action = this.resolveAction(clipId, role);
    if (!action) return;
    this.mixer?.stopAllAction();
    action.reset();
    const once =
      clipId === '5lp' ||
      clipId === 'ryu_5lp' ||
      clipId === 'hit' ||
      clipId === 'hitstun_light' ||
      clipId === 'attack_l' ||
      clipId === 'attack_light';
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = true;
    action.paused = false;
    action.play();
    this.currentClip = clipId;
    this.currentBinding = clipId;
  }

  /** List animation clip names currently bound to the mixer. */
  get boundClipNames(): string[] {
    return [...this.clipNames];
  }

  get isPreviewMode(): boolean {
    return this.previewMode;
  }

  get previewInfo(): { enabled: boolean; clip: string; status: string } {
    return {
      enabled: this.previewMode,
      clip: this.previewClipName,
      status: this.previewStatus,
    };
  }

  /**
   * Exit animation test mode and resume logic-driven clips (idle fallback).
   * Does not recreate the mixer — combat `logicActions` stay valid.
   */
  exitPreviewMode(): void {
    this.previewMode = false;
    this.previewClipName = '';
    this.previewStatus = 'idle';
    this.currentClip = '';
    this.currentBinding = '';
    this.clearPoseBlend(true);

    if (this.previewActionKey && this.mixer) {
      const prev = this.actions.get(this.previewActionKey);
      if (prev) {
        prev.stop();
        prev.setEffectiveWeight(0);
        this.actions.delete(this.previewActionKey);
      }
      this.previewActionKey = null;
    }
    this.mixer?.stopAllAction();

    if (this.useProcedural) {
      this.procedural.setMode('idle');
      this.currentClip = 'idle';
      return;
    }
    // Re-enable anims path if mesh reinstall cleared backend flags
    this.playBest('idle');
  }

  /**
   * Load a single-action (or multi-clip) glb and loop the first / named clip
   * on the current skeleton. If no model is installed yet, installs the glb mesh.
   *
   * Default path is **clip-only** on the boot mesh (same as combat): do not
   * skeleton.pose() or recreate the mixer — that invalidates logicActions and
   * can corrupt a live bind. Prefer mesh-only boot + anim GLB tracks that share
   * rest pose (see ryu_c1_mesh_only vs esf001_TPose).
   */
  async loadAndLoopClipFromUrl(
    url: string,
    opts?: { clipName?: string; reinstallMesh?: boolean; targetHeight?: number },
  ): Promise<{ clipName: string; duration: number; clipCount: number }> {
    this.previewStatus = `loading ${url}`;
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    let animations = gltf.animations.slice();
    if (animations.length === 0) {
      this.previewStatus = 'error: no AnimationClips in glb';
      throw new Error(`No AnimationClips in ${url}`);
    }

    const reinstall =
      opts?.reinstallMesh === true || !this.modelRoot || !this.loaded;

    if (reinstall) {
      // Full mesh swap — combat bindings are gone; anims backend must re-preload
      this.logicActions.clear();
      this.logicLoadInflight.clear();
      this.previewActionKey = null;
      this.installModel(gltf.scene, animations, {
        targetHeight: opts?.targetHeight ?? 1.85,
      });
      // installModel already plays idle via playBest; override with preview loop
      const preferred =
        opts?.clipName && this.actions.has(opts.clipName)
          ? opts.clipName
          : this.clipNames[0]!;
      this.previewMode = true;
      this.previewActionKey = preferred;
      this.playPreviewLoop(preferred);
      const action = this.actions.get(preferred);
      const duration = action?.getClip().duration ?? 0;
      this.previewStatus = `playing ${preferred} (${duration.toFixed(2)}s loop)`;
      console.info(
        `[FighterView] preview(reinstall) clip="${preferred}" duration=${duration.toFixed(3)}s url=${url}`,
      );
      return {
        clipName: preferred,
        duration,
        clipCount: this.clipNames.length,
      };
    }

    // Clip-only: sanitize tracks, keep live skeleton + combat mixer intact.
    const prepared = prepareReExtractedFighter(this.modelRoot!, animations, {
      poseModel: false,
    });
    animations = prepared.animations;

    let clip =
      (opts?.clipName
        ? animations.find((c) => c.name === opts.clipName)
        : undefined) ?? animations[0]!;
    clip = clip.clone();
    const previewKey = `__preview__${clip.name || 'clip'}`;
    clip.name = previewKey;

    // Drop previous preview action if any
    if (this.previewActionKey && this.actions.has(this.previewActionKey)) {
      const old = this.actions.get(this.previewActionKey)!;
      old.stop();
      this.actions.delete(this.previewActionKey);
    }

    if (!this.mixer) {
      this.mixer = new THREE.AnimationMixer(this.modelRoot!);
    }
    this.clearPoseBlend(true);
    this.mixer.stopAllAction();

    const action = this.mixer.clipAction(clip);
    this.actions.set(previewKey, action);
    this.previewActionKey = previewKey;
    if (!this.clipNames.includes(previewKey)) this.clipNames.push(previewKey);

    this.previewMode = true;
    this.playPreviewLoop(previewKey);
    const duration = action.getClip().duration ?? 0;
    this.previewStatus = `playing ${clip.name} (${duration.toFixed(2)}s loop)`;
    console.info(
      `[FighterView] preview clip="${previewKey}" duration=${duration.toFixed(3)}s ` +
        `tracks=${clip.tracks.length} url=${url}`,
    );
    return {
      clipName: previewKey,
      duration,
      clipCount: animations.length,
    };
  }

  private playPreviewLoop(clipName: string): void {
    const action = this.actions.get(clipName);
    if (!action || !this.mixer) {
      this.previewStatus = `error: missing action ${clipName}`;
      return;
    }
    this.mixer.stopAllAction();
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.paused = false;
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.play();
    this.currentClip = clipName;
    this.previewClipName = clipName;
    this.previewMode = true;
  }

  /**
   * Sync pose from logic fighter.
   * @param wallDtSec wall-clock delta from rAF (seconds). Used for free-running
   *   loops (idle/walk). Must NOT use fixed 1/60 per rAF — on 120Hz displays
   *   that doubles playback speed. Attack clips still scrub by logic frames.
   */
  syncFromLogic(
    fighter: Fighter,
    cfg: MutableSimConfig,
    wallDtSec = 1 / 60,
  ): void {
    const s = cfg.worldScale * cfg.modelScale;
    this.root.scale.set(s, s, fighter.visualFacing * s);
    this.root.position.set(
      fighter.x * cfg.worldScale,
      cfg.modelYOffset + fighter.y * cfg.worldScale,
      fighter.id === 'p1' ? 0.05 : -0.05,
    );
    this.root.rotation.y = Math.PI / 2;

    const animDt =
      Math.min(Math.max(wallDtSec, 0), 0.1) * (cfg.timeScaleAnim || 1);
    const scrubMode = (cfg.scrubMode ?? 'uniform') as ScrubMode;
    const role = fighter.animRole || 'main';

    if (this.previewMode) {
      if (this.mixer) this.mixer.update(animDt);
      if (cfg.plantMode === 'legacy') this.plantFeetOnGround();
      return;
    }

    const fadePolicy = defaultCrossfadeDurations({
      locoSec: cfg.locoBlendSec ?? 0.12,
      residualToMoveSec: cfg.residualToMoveBlendSec ?? 0.1,
      residualToStanceSec: cfg.residualToStanceBlendSec ?? 0.1,
      residualToAttackSec: cfg.residualToAttackBlendSec ?? 0,
    });

    if (this.useProcedural) {
      if (fighter.phase === 'attack' && fighter.mover.move) {
        this.clearPoseBlend(true);
        this.playBest(fighter.clipId, role, HARD_CUT);
        const total = Math.max(1, fighter.mover.total);
        this.procedural.setAttackProgress(fighter.mover.moveFrame / total);
        this.procedural.update(0, true);
      } else {
        this.playBest(fighter.clipId, role, fadePolicy);
        this.procedural.update(animDt, false);
      }
      this.maybePlantAfterPose(fighter, cfg, wallDtSec);
      return;
    }

    const scrubTo = (
      action: THREE.AnimationAction,
      logicFrame: number,
      logicTotal: number,
      weight = 1,
      updateMixer = true,
    ) => {
      if (!cfg.scrubFromLogic) {
        action.paused = false;
        action.setEffectiveWeight(weight);
        if (updateMixer) this.mixer?.update(animDt);
        return;
      }
      const clip = action.getClip();
      const t = logicFrameToClipTime(
        logicFrame,
        logicTotal,
        clip.duration,
        scrubMode,
      );
      this.scrubActionTo(action, t, weight, updateMixer);
    };

    // Attack locked segment: no crossfade (不侵占逻辑动画 §3.11); 60Hz prefix
    if (fighter.phase === 'attack' && fighter.mover.move) {
      this.clearPoseBlend(true);
      this.playBest(fighter.clipId, role, HARD_CUT);
      const action = this.resolveAction(fighter.clipId, role);
      if (action && this.mixer) {
        const vf = fighter.mover.moveFrame;
        const t = visualFrameToClipTime(vf, action.getClip().duration);
        this.scrubActionTo(action, t);
        this.applyRootPoseLock(cfg, true);
      }
      this.maybePlantAfterPose(fighter, cfg, wallDtSec);
      return;
    }
    this.attackHipsLockLocal = null;

    // Attack / land residual tail — §3.7.1 / §3.13.5
    // Role must come from the tail (land residual is `land`, not main/START).
    if (
      fighter.animTail &&
      (fighter.phase === 'idle' ||
        fighter.phase === 'crouch' ||
        (fighter.phase === 'airborne' && fighter.animTail.holdAir))
    ) {
      const tailClip = fighter.animTail.clipId;
      const tailRole = fighter.animTail.animRole || 'main';
      const leaveFade =
        fighter.phase === 'airborne' ? fadePolicy : HARD_CUT;
      this.playBest(tailClip, tailRole, leaveFade);
      const action = this.resolveAction(tailClip, tailRole);
      if (action && this.mixer) {
        const t = visualFrameToClipTime(
          fighter.animTail.visualFrame,
          action.getClip().duration,
        );
        if (this.poseBlend && this.poseBlend.to === action) {
          const w = this.stepPoseBlend(wallDtSec);
          this.scrubActionTo(action, t, w, true);
        } else {
          this.scrubActionTo(action, t);
        }
      }
      this.maybePlantAfterPose(fighter, cfg, wallDtSec);
      return;
    }

    // Stance transition scrub (§3.7.2 必接片). Residual→stance may freeze-old (§3.11).
    if (
      fighter.inStanceTransition &&
      (fighter.phase === 'idle' || fighter.phase === 'crouch')
    ) {
      const stRole = fighter.animRole || 'main';
      this.playBest(fighter.clipId, stRole, fadePolicy);
      const action = this.resolveAction(fighter.clipId, stRole);
      if (action && this.mixer) {
        const t = visualFrameToClipTime(
          fighter.stanceState.frame,
          action.getClip().duration,
        );
        if (this.poseBlend && this.poseBlend.to === action) {
          const w = this.stepPoseBlend(wallDtSec);
          this.scrubActionTo(action, t, w, true);
        } else {
          this.scrubActionTo(action, t);
        }
      }
      this.maybePlantAfterPose(fighter, cfg, wallDtSec);
      return;
    }

    // Walk: scrub by locoFrame; §3.11 freeze-old (loco + residual→move)
    if (fighter.phase === 'walk') {
      this.playBest(fighter.clipId, role, fadePolicy);
      const action = this.resolveAction(fighter.clipId, role);
      if (action && this.mixer) {
        const mapTotal =
          this.logicMap?.frameCountForRole(fighter.clipId, role) ?? 60;
        if (this.poseBlend && this.poseBlend.to === action) {
          const w = this.stepPoseBlend(wallDtSec);
          scrubTo(action, fighter.locoFrame, mapTotal, w, true);
        } else {
          scrubTo(action, fighter.locoFrame, mapTotal);
        }
      }
      this.maybePlantAfterPose(fighter, cfg, wallDtSec);
      return;
    }

    // Jump: prejump/air hard-cut; land may dissolve from attack residual (§3.13.5)
    if (
      fighter.phase === 'prejump' ||
      fighter.phase === 'airborne' ||
      fighter.phase === 'landing'
    ) {
      const jumpFade =
        fighter.phase === 'landing' && role === 'land' ? fadePolicy : HARD_CUT;
      this.playBest(fighter.clipId, role, jumpFade);
      const action = this.resolveAction(fighter.clipId, role);
      if (action && this.mixer) {
        const landVisual =
          cfg.landingAnimFrames > cfg.landingFrames
            ? cfg.landingAnimFrames
            : cfg.landingFrames;
        const mapTotal =
          this.logicMap?.frameCountForRole(fighter.clipId, role) ??
          (fighter.phase === 'prejump'
            ? cfg.prejumpFrames
            : fighter.phase === 'landing'
              ? landVisual
              : cfg.airFrames);
        if (this.poseBlend && this.poseBlend.to === action) {
          const w = this.stepPoseBlend(wallDtSec);
          scrubTo(action, fighter.jumpFrame, mapTotal, w, true);
        } else {
          scrubTo(action, fighter.jumpFrame, mapTotal);
        }
      }
      this.maybePlantAfterPose(fighter, cfg, wallDtSec);
      return;
    }

    // Dash lock: 60Hz prefix scrub (same timeline as residual §3.7.1)
    if (fighter.phase === 'dash') {
      this.clearPoseBlend(true);
      this.playBest(fighter.clipId, 'main', HARD_CUT);
      const action = this.resolveAction(fighter.clipId, 'main');
      if (action && this.mixer) {
        const total =
          fighter.clipId === 'dash_back' ? cfg.dashBackFrames : cfg.dashFrames;
        const elapsed = Math.max(0, total - fighter.stateTimer);
        const t = visualFrameToClipTime(
          elapsed,
          action.getClip().duration,
        );
        this.scrubActionTo(action, t);
      }
      this.maybePlantAfterPose(fighter, cfg, wallDtSec);
      return;
    }

    // Hitstun / blockstun — usually no sol (§3.11)
    if (fighter.phase === 'hitstun' || fighter.phase === 'blockstun') {
      this.clearPoseBlend(true);
      this.playBest(fighter.clipId, 'main', HARD_CUT);
      const action = this.resolveAction(fighter.clipId, 'main');
      if (action && this.mixer) {
        action.paused = false;
        action.setEffectiveWeight(1);
        this.mixer.update(animDt);
      }
      this.maybePlantAfterPose(fighter, cfg, wallDtSec);
      return;
    }

    // Turn clip: scrub by logic turnFrame (§3.14)
    if (fighter.turning) {
      this.playBest(fighter.clipId, 'main', fadePolicy);
      const action = this.resolveAction(fighter.clipId, 'main');
      if (action && this.mixer) {
        const total = Math.max(1, fighter.turnTotal);
        if (this.poseBlend && this.poseBlend.to === action) {
          const w = this.stepPoseBlend(wallDtSec);
          scrubTo(action, fighter.turnFrame, total, w, true);
        } else {
          scrubTo(action, fighter.turnFrame, total);
        }
      }
      this.maybePlantAfterPose(fighter, cfg, wallDtSec);
      return;
    }

    // Idle / crouch: free-run; soft-blend from walk end or residual→idle (§3.11)
    this.playBest(
      fighter.clipId,
      role === 'main' ? 'main' : role,
      fadePolicy,
    );
    if (this.mixer) {
      const action = this.resolveAction(fighter.clipId, 'main');
      if (action) {
        if (this.poseBlend && this.poseBlend.to === action) {
          const w = this.stepPoseBlend(wallDtSec);
          if (this.poseBlend) {
            // Still blending: hold idle at start pose while previous freezes
            this.scrubActionTo(action, 0, w, true);
          } else {
            action.paused = false;
            action.setEffectiveWeight(1);
            this.mixer.update(animDt);
          }
        } else {
          action.paused = false;
          action.setEffectiveWeight(1);
          this.mixer.update(animDt);
        }
      }
    }
    this.maybePlantAfterPose(fighter, cfg, wallDtSec);
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  get profileName(): ClipProfile {
    return this.profile;
  }
}
