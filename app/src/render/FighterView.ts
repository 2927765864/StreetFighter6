import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { Fighter } from '../combat/fighter/Fighter';
import type { MutableSimConfig } from '../config/constants';
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
import { logicFrameToClipTime, type ScrubMode } from './AnimScrub';
import {
  bakeSkinnedMeshesToStatic,
  normalizeModelToHeight,
  prepareReExtractedFighter,
  pruneOutlierMeshes,
  resetFbxUnitScales,
  resetReArmatureTransform,
  sanitizeObjectMaterials,
  worldBox,
} from './materialUtils';

/**
 * Skinned fighter view.
 * Combat path: mesh-only glb + AnimationClips from private/assets/ryu/anims
 * via LogicGlbMap (no dependency on ryu_c1 merged test clips).
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
  private lastPlantClip = '';
  private plantWorldXZ: { x: number; z: number } | null = null;
  private footDebug: THREE.Mesh | null = null;
  private attackHipsLockLocal: THREE.Vector3 | null = null;
  private placeholder: THREE.Mesh;
  private procedural = new ProceduralRyuAnim();
  private useProcedural = false;
  /**
   * When true, ignore logic clipId and only advance the preview mixer
   * (used by the animation test panel).
   */
  private previewMode = false;
  private previewClipName = '';
  private previewStatus = 'idle';
  /** Clips bound before the first anim-test rebind (restored on exit). */
  private stashedClips: THREE.AnimationClip[] | null = null;
  private stashedUseProcedural = false;
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
        const prepared = prepareReExtractedFighter(this.modelRoot!, [clip]);
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
   * After quat-only RE clips, leg rotations bob feet through the floor because
   * hip position tracks were stripped. Snap so the lowest foot sits on root Y=0.
   * Consensus §3.9: do NOT call every frame on idle (causes jitter).
   */
  private plantFeetOnGround(): void {
    if (!this.modelRoot) return;
    this.modelRoot.updateMatrixWorld(true);

    let minY = Infinity;
    const footRe =
      /^(L_|R_)?(Foot|ToeBase|Footthumb|Footindex|Footmiddle|Footring|Footpinky)(_|$)/i;
    this.modelRoot.traverse((o) => {
      const bone = o as THREE.Bone;
      if (!bone.isBone) return;
      if (!footRe.test(bone.name) && bone.name !== 'L_Foot' && bone.name !== 'R_Foot') {
        return;
      }
      const p = new THREE.Vector3();
      bone.getWorldPosition(p);
      if (p.y < minY) minY = p.y;
    });

    if (!Number.isFinite(minY)) {
      const box = worldBox(this.modelRoot);
      if (!box) return;
      minY = box.min.y;
    }

    const rootWorld = new THREE.Vector3();
    this.root.getWorldPosition(rootWorld);
    const deltaWorld = rootWorld.y - minY;
    if (!Number.isFinite(deltaWorld) || Math.abs(deltaWorld) < 1e-5) return;
    const sy = this.root.scale.y || 1;
    this.modelRoot.position.y += deltaWorld / sy;
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
    bindingKey: string,
  ): void {
    if (cfg.plantMode === 'legacy') {
      this.plantFeetOnGround();
      return;
    }
    // consensus: idle/walk no per-frame plant; once on clip change
    const idleLike =
      fighter.phase === 'idle' ||
      fighter.phase === 'walk' ||
      fighter.phase === 'crouch';
    if (idleLike) {
      if (this.lastPlantClip !== bindingKey) {
        this.plantFeetOnGround();
        this.lastPlantClip = bindingKey;
      }
      return;
    }
    this.lastPlantClip = bindingKey;
    this.applyFootPlant(fighter, cfg);
  }

  /** Scrub a paused action to an absolute clip time and apply bindings. */
  private scrubActionTo(action: THREE.AnimationAction, timeSec: number): void {
    if (!this.mixer) return;
    const clip = action.getClip();
    const t = THREE.MathUtils.clamp(timeSec, 0, Math.max(0, clip.duration - 1e-4));
    // CRITICAL: do NOT use mixer.setTime() while paused — effectiveTimeScale=0 so
    // action.time never advances (attack stuck on frame 0).
    action.enabled = true;
    action.paused = true;
    action.time = t;
    action.setEffectiveWeight(1);
    this.mixer.update(0);
  }

  /**
   * Switch to logic clip + role. Does not thrash if binding unchanged.
   */
  playBest(clipId: string, role = 'main'): void {
    if (this.previewMode) return;

    if (this.animsMode) {
      const canon = this.logicMap?.canonical(clipId) ?? clipId;
      const key = this.bindingKey(canon, role);
      if (this.currentBinding === key && this.resolveLogicAction(clipId, role)) {
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
        this.mixer?.stopAllAction();
        action.reset();
        const freeLoop =
          (canon === 'idle' || canon === 'crouch') && role === 'main';
        action.setLoop(freeLoop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        action.clampWhenFinished = !freeLoop;
        action.paused = false;
        action.enabled = true;
        action.setEffectiveWeight(1);
        action.play();
        this.currentClip = canon;
        this.currentBinding = bind;
        this.attackHipsLockLocal = null;
        this.plantWorldXZ = null;
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
   */
  exitPreviewMode(): void {
    this.previewMode = false;
    this.previewClipName = '';
    this.previewStatus = 'idle';
    this.currentClip = '';

    if (this.stashedClips && this.modelRoot) {
      this.rebindClips(this.stashedClips, this.stashedUseProcedural);
      this.stashedClips = null;
    }

    if (this.useProcedural) {
      this.procedural.setMode('idle');
      this.currentClip = 'idle';
      return;
    }
    this.playBest('idle');
  }

  private stashClipsIfNeeded(): void {
    if (this.stashedClips != null) return;
    const clips: THREE.AnimationClip[] = [];
    for (const action of this.actions.values()) {
      clips.push(action.getClip());
    }
    this.stashedClips = clips;
    this.stashedUseProcedural = this.useProcedural;
  }

  private rebindClips(
    animations: THREE.AnimationClip[],
    useProcedural: boolean,
  ): void {
    if (!this.modelRoot) return;
    this.mixer?.stopAllAction();
    this.actions.clear();
    this.clipNames = animations.map((c) => c.name);
    this.profile =
      animations.length === 0 ? 'ryu' : detectProfile(this.clipNames);
    this.clipMap = mapForProfile(this.profile);
    this.mixer = new THREE.AnimationMixer(this.modelRoot);
    for (const clip of animations) {
      this.actions.set(clip.name, this.mixer.clipAction(clip));
    }
    this.useProcedural = useProcedural && animations.length === 0;
    if (this.useProcedural) {
      this.procedural.bind(this.modelRoot);
    }
    this.currentClip = '';
  }

  /**
   * Load a single-action (or multi-clip) glb and loop the first / named clip
   * on the current skeleton. If no model is installed yet, installs the glb mesh.
   *
   * Prefer clip-only rebinding when a skinned model is already loaded so we do
   * not re-download multi-MB meshes more than once per session for mesh assets
   * that share the same RE rig as the boot character.
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
      // Full mesh swap — original boot clips are gone; stash nothing useful
      this.stashedClips = null;
      this.installModel(gltf.scene, animations, {
        targetHeight: opts?.targetHeight ?? 1.85,
      });
      // installModel already plays idle via playBest; override with preview loop
    } else {
      this.stashClipsIfNeeded();
      // Re-sanitize tracks for RE exports, bind onto existing skeleton
      const prepared = prepareReExtractedFighter(this.modelRoot!, animations);
      animations = prepared.animations;
      this.rebindClips(animations, false);
    }

    const preferred =
      opts?.clipName && this.actions.has(opts.clipName)
        ? opts.clipName
        : this.clipNames[0]!;
    this.previewMode = true;
    this.playPreviewLoop(preferred);
    const action = this.actions.get(preferred);
    const duration = action?.getClip().duration ?? 0;
    this.previewStatus = `playing ${preferred} (${duration.toFixed(2)}s loop)`;
    console.info(
      `[FighterView] preview clip="${preferred}" duration=${duration.toFixed(3)}s ` +
        `clips=${this.clipNames.join('|')} url=${url}`,
    );
    return {
      clipName: preferred,
      duration,
      clipCount: this.clipNames.length,
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
    this.root.scale.set(s, s, fighter.facing * s);
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
    const bindKey = `${fighter.clipId}::${role}`;

    if (this.previewMode) {
      if (this.mixer) this.mixer.update(animDt);
      if (cfg.plantMode === 'legacy') this.plantFeetOnGround();
      return;
    }

    if (this.useProcedural) {
      if (fighter.phase === 'attack' && fighter.mover.move) {
        this.playBest(fighter.clipId, role);
        const total = Math.max(1, fighter.mover.total);
        this.procedural.setAttackProgress(fighter.mover.moveFrame / total);
        this.procedural.update(0, true);
      } else {
        this.playBest(fighter.clipId, role);
        this.procedural.update(animDt, false);
      }
      this.maybePlantAfterPose(fighter, cfg, bindKey);
      return;
    }

    const scrubTo = (
      action: THREE.AnimationAction,
      logicFrame: number,
      logicTotal: number,
    ) => {
      if (!cfg.scrubFromLogic) {
        action.paused = false;
        this.mixer?.update(animDt);
        return;
      }
      const clip = action.getClip();
      const t = logicFrameToClipTime(
        logicFrame,
        logicTotal,
        clip.duration,
        scrubMode,
      );
      this.scrubActionTo(action, t);
    };

    // Attack / throw presentation: logic scrub
    if (fighter.phase === 'attack' && fighter.mover.move) {
      this.playBest(fighter.clipId, role);
      const action = this.resolveAction(fighter.clipId, role);
      if (action && this.mixer) {
        scrubTo(action, fighter.mover.moveFrame, fighter.mover.total);
        this.applyRootPoseLock(cfg, true);
      }
      this.maybePlantAfterPose(fighter, cfg, bindKey);
      return;
    }
    this.attackHipsLockLocal = null;

    // Walk: scrub by locoFrame within segment (not free-run)
    if (fighter.phase === 'walk') {
      this.playBest(fighter.clipId, role);
      const action = this.resolveAction(fighter.clipId, role);
      if (action && this.mixer) {
        const mapTotal =
          this.logicMap?.frameCountForRole(fighter.clipId, role) ?? 60;
        scrubTo(action, fighter.locoFrame, mapTotal);
      }
      this.maybePlantAfterPose(fighter, cfg, bindKey);
      return;
    }

    // Jump phases: scrub by jumpFrame
    if (
      fighter.phase === 'prejump' ||
      fighter.phase === 'airborne' ||
      fighter.phase === 'landing'
    ) {
      this.playBest(fighter.clipId, role);
      const action = this.resolveAction(fighter.clipId, role);
      if (action && this.mixer) {
        const mapTotal =
          this.logicMap?.frameCountForRole(fighter.clipId, role) ??
          (fighter.phase === 'prejump'
            ? cfg.prejumpFrames
            : fighter.phase === 'landing'
              ? cfg.landingFrames
              : cfg.airFrames);
        scrubTo(action, fighter.jumpFrame, mapTotal);
      }
      this.maybePlantAfterPose(fighter, cfg, bindKey);
      return;
    }

    // Dash: scrub by elapsed
    if (fighter.phase === 'dash') {
      this.playBest(fighter.clipId, 'main');
      const action = this.resolveAction(fighter.clipId, 'main');
      if (action && this.mixer) {
        const total =
          fighter.clipId === 'dash_back' ? cfg.dashBackFrames : cfg.dashFrames;
        const elapsed = Math.max(0, total - fighter.stateTimer);
        scrubTo(action, elapsed, total);
      }
      this.maybePlantAfterPose(fighter, cfg, bindKey);
      return;
    }

    // Hitstun / blockstun: scrub if we have timer as reverse total
    if (fighter.phase === 'hitstun' || fighter.phase === 'blockstun') {
      this.playBest(fighter.clipId, 'main');
      const action = this.resolveAction(fighter.clipId, 'main');
      if (action && this.mixer) {
        // Stun clips: free-run (no fixed total stored on fighter)
        action.paused = false;
        action.setEffectiveWeight(1);
        this.mixer.update(animDt);
      }
      this.maybePlantAfterPose(fighter, cfg, bindKey);
      return;
    }

    // Idle / crouch: free-run wall clock (consensus §3.7)
    this.playBest(fighter.clipId, role === 'main' ? 'main' : role);
    if (this.mixer) {
      const action = this.resolveAction(fighter.clipId, 'main');
      if (action) {
        action.paused = false;
        action.setEffectiveWeight(1);
      }
      this.mixer.update(animDt);
    }
    this.maybePlantAfterPose(fighter, cfg, bindKey);
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  get profileName(): ClipProfile {
    return this.profile;
  }
}
