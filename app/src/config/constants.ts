/** Defaults from docs/plans/ai-execution-plan-character-control-p0-v0.md */

import { buildFrontHeavyDashDx } from '../combat/loco/DashProfile';
import {
  createDefaultHitVfxRecipes,
  defaultHeightOffsets,
} from '../render/hitVfx/hitVfxDefaults';
import type {
  HitVfxElementPreset,
  HitVfxHeightOffset,
  HitVfxRecipe,
} from '../render/hitVfx/hitVfxTypes';
import {
  createDefaultWudaLayerPresets,
  type WudaLayerPreset,
} from '../render/wudaParticle/wudaLayerPreset';
import {
  createDefaultLights,
  type LightDesc,
} from './lightTypes';

export const LOGIC_FPS = 60;
export const LOGIC_DT = 1 / LOGIC_FPS;
export const MAX_FRAME_TIME_MS = 100;
export const MAX_LOGIC_STEPS_PER_RAF = 4;
export const WORLD_SCALE = 1;
export const STAGE_GROUND_Y = 0;
export const INPUT_BUFFER_FRAMES = 32;
export const DEFAULT_HP = 10000;
export const DRIVE_MAX = 6;
export const HITBOX_COLOR = 0xff3333;
export const HURTBOX_COLOR = 0x33ff66;
export const PUSHBOX_COLOR = 0xffcc33;

export const ACTION_BUFFER_STANDARD = 4;
export const ACTION_BUFFER_DASH = 7;
export const MOTION_STEP_GAP_MAX = 9;
export const DASH_DIR_HOLD_MAX = 8;
export const DASH_NEUTRAL_MAX = 8;
export const HITSTOP_ON_HIT = 8;
export const HITSTOP_ON_BLOCK = 8;

export type MutableSimConfig = {
  logicFps: number;
  maxLogicStepsPerRaf: number;
  maxFrameTimeMs: number;
  /**
   * When true (default), skip WebGPU present on rAF ticks with 0 logic steps so
   * display stays aligned with logicFps on high-refresh monitors (no 120Hz
   * camera/cloth vs 60Hz pose split). Pause / box-edit always present.
   */
  lockPresentToLogic: boolean;
  worldScale: number;
  modelScale: number;
  modelYOffset: number;
  cameraZ: number;
  cameraY: number;
  cameraLookY: number;
  cameraFov: number;
  cameraZoomEnabled: boolean;
  cameraZoomSepK: number;
  cameraZMax: number;
  cameraNdcPad: number;
  cameraLerp: number;
  /** World-unit X deadzone for delayed follow. 0 = none. */
  cameraFollowDeadzone: number;
  cameraNear: number;
  cameraFar: number;
  stageFitWidth: number;
  stageOriginX: number;
  stageOriginZ: number;
  showFallbackGround: boolean;
  showDebugGrid: boolean;
  showAxes: boolean;
  /** Authoritative light list (replaces flat lightKey* fields). */
  lights: LightDesc[];
  lightSelectedId: string;
  lightHelpersVisible: boolean;
  lightOrbitMode: boolean;
  /** PIP preview of fight camera while placing lights (CSS px, bottom-left origin). */
  lightOrbitPipX: number;
  lightOrbitPipY: number;
  lightOrbitPipWidth: number;
  lightOrbitPipHeight: number;
  lightMaxCount: number;
  lightUseDynamicLighting: boolean;
  shadowMapEnabled: boolean;
  shadowMapSize: number;
  shadowCameraExtent: number;
  shadowCameraNear: number;
  shadowCameraFar: number;
  shadowBias: number;
  shadowNormalBias: number;
  shadowRadius: number;
  fogColor: number;
  fogNear: number;
  fogFar: number;
  bgColor: number;
  timeScaleAnim: number;
  bufferFrames: number;
  showHitboxes: boolean;
  showHurtboxes: boolean;
  showPushboxes: boolean;
  /** When false, DebugDraw skips all p2 hit/hurt/push boxes (edit side = P1 only). */
  showOpponentBoxes: boolean;
  /** Tint hurt boxes by part (head/body/leg) in green family. */
  hurtPartColors: boolean;
  showBuffer: boolean;
  showCancelWindow: boolean;
  hitboxColor: number;
  hurtboxColor: number;
  pushboxColor: number;
  forceP2Guard: boolean;
  dummyGuardPolicy: 'block_all' | 'stand_block' | 'crouch_block' | 'none';
  dummyUnguardedStance: 'stand' | 'crouch';
  dummyWakeupStyle: 'normal' | 'back';
  enableHitPush: boolean;
  hitPushbackTotal: number;
  hitstunOverride: number;
  knockdownFramesOverride: number;
  knockdownDownHoldOverride: number;
  wakeupBackDxTotal: number;
  enablePushResolve: boolean;
  enableBlockPush: boolean;
  blockPushbackTotal: number;
  blockPushEasePower: number;
  blockstunOverride: number;
  damageScale: number;
  mmdkUnitScale: number;
  stageMinX: number;
  stageMaxX: number;
  actionBufferStandard: number;
  actionBufferDash: number;
  motionStepGapMax: number;
  dashDirHoldMax: number;
  dashNeutralMax: number;
  motionHistoryCapacity: number;
  hitstopFramesOnHit: number;
  hitstopFramesOnBlock: number;
  /**
   * Presentation playback rate during logic hitstop (0 = hard freeze, 1 = full).
   * Logic timelines stay frozen; scrub/free-run advance at this fraction.
   */
  hitstopAnimRate: number;
  enableCancel: boolean;
  /** Gameplay gate: special command usage (definitions stay loaded). */
  enableSpecials: boolean;
  /** Gameplay gate: throw command usage (definitions stay loaded). */
  enableThrows: boolean;
  enableActionBuffer: boolean;
  dashFrames: number;
  dashBackFrames: number;
  /** glb/map frames for dash residual (default map: 42 / 40). */
  dashAnimFrames: number;
  dashBackAnimFrames: number;
  dashSpeed: number;
  dashBackSpeed: number;
  /** Front-heavy curve exponent; higher = more front-loaded. */
  dashFrontHeavyPower: number;
  /** Per-frame |dx| (rebuilt from power × distance). */
  dashDxFwd: number[];
  dashDxBack: number[];
  prejumpFrames: number;
  airFrames: number;
  landingFrames: number;
  landingAnimFrames: number;
  /**
   * §3.13.7: land → crouch_to_stand dissolve start (no pending turn / → idle).
   * Fraction of landingAnimFrames. 0 = as land starts; 1 = full land.
   */
  neutralLandToRiseIdleRatio: number;
  /**
   * §3.13.7: land → crouch_to_stand dissolve start (pending turn path).
   * Fraction of landingAnimFrames. Independent of idle-path ratio.
   */
  neutralLandToRiseTurnRatio: number;
  /**
   * §3.13.7: crouch_to_stand → turn_std dissolve start (pending turn only).
   * Fraction of crouchToStandFrames. 0 = as rise starts; 1 = full rise.
   */
  neutralRiseToTurnDissolveRatio: number;
  walkSpeed: number;
  walkBackSpeed: number;
  walkFirstFrameScale: number;
  /**
   * When releasing walk during start (never loop), keep this tail fraction of
   * the end clip (logic + scrub). 1 = full end. From ryu_movement.json.
   */
  walkEarlyReleaseEndKeepRatio: number;
  /** §3.9.1.b walk dir press-edge presentation freeze (logic frames; 0=off). */
  walkInputFreezeFrames: number;
  jumpApex: number;
  jumpFwdDist: number;
  jumpBackDist: number;
  jumpNeutralDist: number;
  scrubFromLogic: boolean;
  scrubMode: 'uniform' | 'truncate';
  /**
   * Foot ground policy:
   * - `consensus` (default): trust authored idle/walk feet; one-shot Y snap on
   *   hard clip cut / land-from-air only; attack support-foot XZ if enabled.
   * - `legacy`: every-frame whole-body sole chase (old idle Y jitter).
   */
  plantMode: 'consensus' | 'legacy';
  footPlantEnabled: boolean;
  rootPoseLockAttack: boolean;
  applySelfMovement: boolean;
  selfMovementScale: number;
  showFootDebug: boolean;
  /** Wall-clock seconds for walk/idle role crossfade (0 = hard cut). §3.11 loco. */
  locoBlendSec: number;
  /**
   * Dual-advance blend into walk/idle (§3.11): attack residual, guard leave,
   * and hitstun reaction → idle/crouch/walk. Not during attack lock or into-hit.
   */
  residualToMoveBlendSec: number;
  /**
   * Attack residual → another attack (§3.11). Default 0 = hard cut (跟手).
   */
  residualToAttackBlendSec: number;
  /**
   * Attack residual → stand↔crouch transition clip (§3.11). Soft entry only.
   */
  residualToStanceBlendSec: number;
  /**
   * §3.11 old-layer during blend window:
   * - `dual` (default): old clip keeps advancing from switch time (方案一).
   * - `freeze`: pin old pose at switch frame (历史方案二，调试对比).
   */
  crossfadeAdvanceMode: 'dual' | 'freeze';
  /** Only used when plantMode=legacy (max |ΔY|/s). Consensus ignores continuous plant. */
  plantSlewPerSec: number;
  /** Stand → crouch transition logic frames (§3.7.2). */
  standToCrouchFrames: number;
  /** Crouch → stand transition logic frames (§3.7.2). */
  crouchToStandFrames: number;
  /** Character art: enable normal maps (textured glb). */
  artEnableNormalMap: boolean;
  /** Character art: normalScale uniform XY. */
  artNormalScale: number;
  /** Character art: flip normal Y (DirectX vs OpenGL). */
  artFlipNormalY: boolean;
  /** Character art: use roughnessMap when present. */
  artEnableRoughnessMap: boolean;
  /** Character art: base roughness when no map / blend. */
  artRoughness: number;
  /** Ryu headband spring bones (VRMC_springBone). */
  headbandPhysicsEnabled: boolean;
  headbandUseCenter: boolean;
  headbandStiffness: number;
  headbandDragForce: number;
  headbandGravityPower: number;
  headbandGravityDirX: number;
  headbandGravityDirY: number;
  headbandGravityDirZ: number;
  headbandHitRadius: number;
  headbandGravityAirScale: number;
  headbandBreathAmp: number;
  headbandBreathHz: number;
  headbandMaxDeltaSec: number;
  headbandColliderHeadRadius: number;
  headbandColliderNeckRadius: number;
  headbandColliderShoulderRadius: number;
  headbandColliderHeadYOffset: number;
  /** Shoulder sphere offset on bone local X (front/back), ±0.5. */
  headbandColliderShoulderXOffset: number;
  headbandShowColliders: boolean;
  headbandShowChainHelpers: boolean;
  headbandStiffnessTipScale: number;
  /** Ryu obi (belt) spring tails (VRMC_springBone); independent of headband. */
  beltPhysicsEnabled: boolean;
  beltUseCenter: boolean;
  beltStiffness: number;
  beltDragForce: number;
  beltGravityPower: number;
  beltGravityDirX: number;
  beltGravityDirY: number;
  beltGravityDirZ: number;
  beltHitRadius: number;
  beltGravityAirScale: number;
  beltMaxDeltaSec: number;
  beltColliderHipRadius: number;
  beltColliderThighRadius: number;
  beltColliderHipYOffset: number;
  beltColliderThighYOffset: number;
  beltColliderThighZOffset: number;
  beltShowColliders: boolean;
  beltShowChainHelpers: boolean;
  beltStiffnessTipScale: number;
  /** Ryu dougi pants bone-cloth (SPCR-style); independent of headband/belt. */
  pantsPhysicsEnabled: boolean;
  pantsSubSteps: number;
  pantsConstraintIterations: number;
  pantsResistance: number;
  pantsHardness: number;
  pantsHardnessTipScale: number;
  pantsGravityPower: number;
  pantsGravityDirX: number;
  pantsGravityDirY: number;
  pantsGravityDirZ: number;
  pantsGravityAirScale: number;
  pantsWindScale: number;
  pantsBreathAmp: number;
  pantsBreathHz: number;
  pantsBreathDirX: number;
  pantsBreathDirY: number;
  pantsBreathDirZ: number;
  pantsStructuralShrinkVertical: number;
  pantsStructuralStretchVertical: number;
  pantsStructuralShrinkHorizontal: number;
  pantsStructuralStretchHorizontal: number;
  pantsShearShrink: number;
  pantsShearStretch: number;
  pantsBendingShrinkVertical: number;
  pantsBendingStretchVertical: number;
  pantsBendingShrinkHorizontal: number;
  pantsBendingStretchHorizontal: number;
  pantsEnableHorizontal: boolean;
  pantsEnableShear: boolean;
  pantsEnableBending: boolean;
  pantsPointRadius: number;
  pantsMaxDeltaSec: number;
  /**
   * modelRoot translation (world units) above this → warp snap particles to anim.
   * Under limit: no root inherit (thigh anchors + hardness follow skeletal motion).
   */
  pantsRootSlideLimit: number;
  /** modelRoot rotation (degrees) above this → warp snap. */
  pantsRootRotateLimitDeg: number;
  /** Hard fuse: free particle max distance from anim target (blocks fullscreen stretch). */
  pantsMaxSeparation: number;
  pantsColliderThighRadius: number;
  pantsColliderThighTailScale: number;
  /** 0–1 along thigh bone; skips the hip-socket spherical cap. */
  pantsColliderThighHeadInset: number;
  pantsColliderCalfRadius: number;
  pantsColliderCalfTailScale: number;
  pantsColliderHipRadius: number;
  pantsColliderBeltRadius: number;
  pantsColliderHipYOffset: number;
  pantsColliderBeltYOffset: number;
  pantsUsePushIn: boolean;
  pantsShowColliders: boolean;
  pantsShowConstraints: boolean;
  /** Pants dual-channel health report (HUD + docs/reports/pants). */
  pantsHealthReportEnabled: boolean;
  pantsHealthHudEnabled: boolean;
  pantsHealthSnapshotIntervalSec: number;
  pantsHealthWarnRatio: number;
  pantsHealthHudMinIntervalMs: number;
  pantsHealthAutoShowConstraintsOnAbnormal: boolean;
  pantsHealthIncidentKeep: number;
  /** Max in-memory entries during one start→stop session. */
  pantsHealthSessionMaxEntries: number;
  /** Keep at most this many session files under docs/reports/pants/sessions/. */
  pantsHealthSessionKeep: number;
  pantsFeelNote: string;
  /** Hit VFX (docs/plans/ai-execution-plan-hit-vfx-v0.md). */
  hitVfxEnabled: boolean;
  hitVfxRecipes: HitVfxRecipe[];
  hitVfxElementPresets: HitVfxElementPreset[];
  hitVfxActiveRecipeOnHitId: string;
  hitVfxActiveRecipeOnBlockId: string;
  hitVfxSelectedRecipeId: string;
  hitVfxSelectedElementId: string;
  hitVfxSelectedGroupId: string;
  hitVfxPreviewActive: boolean;
  hitVfxPreviewDummyVisible: boolean;
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
  /** Preview trigger height / strength (panel). */
  hitVfxPreviewHeight: 'h' | 'm' | 'l';
  hitVfxPreviewStrength: 'L' | 'M' | 'H';
  hitVfxPreviewKind: 'onHit' | 'onBlock';
  /** When true, editor「重放」keeps re-triggering after each play finishes. */
  hitVfxPreviewLoop: boolean;
  /**
   * 武打粒子：方案 B 表面重心 / 方案 C 顶点 GPU 烘焙。
   * 全局底层：总开关 / 附着模式 / 覆盖范围。
   * 表现与脱落参数在 `wudaLayerPresets` 多层预设中（可叠层、分 P1/P2）。
   */
  wudaEnabled: boolean;
  /** `surfaceBary` = B；`vertexGpuBake` = C */
  wudaAttachMode: 'surfaceBary' | 'vertexGpuBake';
  /**
   * 涂层覆盖范围：`allMeshes` = 全部蒙皮网格按表面积（B）/顶点配额（C）全身均匀；
   * `largestMesh` = 仅最大顶点数网格（旧行为）。
   */
  wudaCoverMode: 'largestMesh' | 'allMeshes';
  /**
   * 全身覆盖时丢掉顶点数低于此值的碎网格（泪滴/装饰等）。
   * 0 = 不过滤。若全部被滤掉则回退为最大网格。仅最大网格模式忽略此值。
   */
  wudaCoverMeshMinVerts: number;
  /** 武打粒子叠层预设（每套归属 P1 或 P2；参数各自独立）。 */
  wudaLayerPresets: WudaLayerPreset[];
  /** 控制面板当前编辑的预设 id。 */
  wudaActiveLayerPresetId: string;
};

export function createDefaultSimConfig(): MutableSimConfig {
  // Defaults match SuperCombo Ryu until ryu_movement.json is loaded (Step 0).
  const dashFwdDist = 1.252;
  const dashFwdFrames = 19;
  const dashBackDist = 0.923;
  const dashBackFrames = 23;
  const dashFrontHeavyPower = 1.5;
  return {
    logicFps: LOGIC_FPS,
    maxLogicStepsPerRaf: MAX_LOGIC_STEPS_PER_RAF,
    maxFrameTimeMs: MAX_FRAME_TIME_MS,
    lockPresentToLogic: true,
    worldScale: WORLD_SCALE,
    modelScale: 0.9,
    modelYOffset: 0,
    cameraZ: 11,
    cameraY: 1.55,
    cameraLookY: 1.1,
    cameraFov: 40,
    cameraZoomEnabled: false,
    cameraZoomSepK: 0.35,
    cameraZMax: 16,
    cameraNdcPad: 0.08,
    cameraLerp: 0.12,
    cameraFollowDeadzone: 0.2,
    cameraNear: 0.05,
    cameraFar: 500,
    stageFitWidth: 18,
    stageOriginX: 0,
    stageOriginZ: 0,
    showFallbackGround: false,
    showDebugGrid: false,
    showAxes: false,
    // Training-stage look (unreviewed): migrated from flat key/fill/rim defaults.
    lights: createDefaultLights(),
    lightSelectedId: 'key',
    lightHelpersVisible: true,
    lightOrbitMode: false,
    lightOrbitPipX: 12,
    lightOrbitPipY: 12,
    lightOrbitPipWidth: 320,
    lightOrbitPipHeight: 180,
    lightMaxCount: 30,
    lightUseDynamicLighting: true,
    shadowMapEnabled: true,
    shadowMapSize: 2048,
    shadowCameraExtent: 20,
    shadowCameraNear: 0.5,
    shadowCameraFar: 80,
    shadowBias: -0.0001,
    shadowNormalBias: 0.02,
    shadowRadius: 2,
    fogColor: 0x1a2030,
    fogNear: 40,
    fogFar: 80,
    bgColor: 0x1a2030,
    timeScaleAnim: 1,
    bufferFrames: INPUT_BUFFER_FRAMES,
    showHitboxes: true,
    showHurtboxes: true,
    showPushboxes: true,
    showOpponentBoxes: true,
    hurtPartColors: true,
    showBuffer: false,
    showCancelWindow: true,
    hitboxColor: HITBOX_COLOR,
    hurtboxColor: HURTBOX_COLOR,
    pushboxColor: PUSHBOX_COLOR,
    forceP2Guard: true,
    dummyGuardPolicy: 'block_all',
    dummyUnguardedStance: 'stand',
    dummyWakeupStyle: 'normal',
    enableHitPush: true,
    hitPushbackTotal: 0,
    hitstunOverride: -1,
    knockdownFramesOverride: -1,
    knockdownDownHoldOverride: -1,
    wakeupBackDxTotal: 0.8,
    enablePushResolve: true,
    enableBlockPush: true,
    blockPushbackTotal: 0.22,
    blockPushEasePower: 3,
    blockstunOverride: -1,
    damageScale: 1,
    mmdkUnitScale: 1,
    stageMinX: -4.5,
    stageMaxX: 4.5,
    actionBufferStandard: ACTION_BUFFER_STANDARD,
    actionBufferDash: ACTION_BUFFER_DASH,
    motionStepGapMax: MOTION_STEP_GAP_MAX,
    dashDirHoldMax: DASH_DIR_HOLD_MAX,
    dashNeutralMax: DASH_NEUTRAL_MAX,
    motionHistoryCapacity: INPUT_BUFFER_FRAMES,
    hitstopFramesOnHit: HITSTOP_ON_HIT,
    hitstopFramesOnBlock: HITSTOP_ON_BLOCK,
    /** ~1 visual frame creep over a 13f heavy hitstop; snap-back is tiny. */
    hitstopAnimRate: 0.08,
    enableCancel: true,
    enableSpecials: false,
    enableThrows: false,
    enableActionBuffer: true,
    dashFrames: dashFwdFrames,
    dashBackFrames,
    dashAnimFrames: 42,
    dashBackAnimFrames: 40,
    dashSpeed: dashFwdDist / dashFwdFrames,
    dashBackSpeed: dashBackDist / dashBackFrames,
    dashFrontHeavyPower,
    dashDxFwd: buildFrontHeavyDashDx(
      dashFwdFrames,
      dashFwdDist,
      dashFrontHeavyPower,
    ),
    dashDxBack: buildFrontHeavyDashDx(
      dashBackFrames,
      dashBackDist,
      dashFrontHeavyPower,
    ),
    prejumpFrames: 4,
    airFrames: 38,
    landingFrames: 3,
    landingAnimFrames: 20,
    /** Land → rise (→idle path) dissolve start (§3.13.7). */
    neutralLandToRiseIdleRatio: 0.05,
    /** Land → rise (→turn path) dissolve start (§3.13.7). */
    neutralLandToRiseTurnRatio: 0.05,
    /** Rise → turn_std dissolve start; 1 = full crouch_to_stand first. */
    neutralRiseToTurnDissolveRatio: 1,
    walkSpeed: 0.047,
    walkBackSpeed: 0.032,
    walkFirstFrameScale: 0.25,
    walkEarlyReleaseEndKeepRatio: 0.35,
    walkInputFreezeFrames: 4,
    jumpApex: 2.115,
    jumpFwdDist: 1.9,
    jumpBackDist: 1.52,
    jumpNeutralDist: 0,
    scrubFromLogic: true,
    scrubMode: 'uniform',
    plantMode: 'consensus',
    footPlantEnabled: true,
    rootPoseLockAttack: true,
    applySelfMovement: true,
    selfMovementScale: 1,
    showFootDebug: false,
    locoBlendSec: 0.12,
    residualToMoveBlendSec: 0.1,
    residualToAttackBlendSec: 0,
    residualToStanceBlendSec: 0.1,
    crossfadeAdvanceMode: 'dual',
    plantSlewPerSec: 0.55,
    standToCrouchFrames: 60,
    crouchToStandFrames: 38,
    artEnableNormalMap: true,
    artNormalScale: 0.55,
    artFlipNormalY: false,
    artEnableRoughnessMap: true,
    artRoughness: 0.72,
    headbandPhysicsEnabled: true,
    headbandUseCenter: true,
    headbandStiffness: 1.35,
    headbandDragForce: 0.48,
    headbandGravityPower: 0.35,
    headbandGravityDirX: 0,
    headbandGravityDirY: -1,
    headbandGravityDirZ: 0,
    headbandHitRadius: 0.012,
    headbandGravityAirScale: 0.55,
    headbandBreathAmp: 0.012,
    headbandBreathHz: 0.35,
    headbandMaxDeltaSec: 0.05,
    headbandColliderHeadRadius: 0.09,
    headbandColliderNeckRadius: 0.06,
    headbandColliderShoulderRadius: 0.08,
    headbandColliderHeadYOffset: 0.02,
    headbandColliderShoulderXOffset: 0,
    headbandShowColliders: false,
    headbandShowChainHelpers: false,
    headbandStiffnessTipScale: 0.85,
    beltPhysicsEnabled: true,
    beltUseCenter: true,
    beltStiffness: 1.85,
    beltDragForce: 0.62,
    beltGravityPower: 0.28,
    beltGravityDirX: 0,
    beltGravityDirY: -1,
    beltGravityDirZ: 0,
    beltHitRadius: 0.014,
    beltGravityAirScale: 0.5,
    beltMaxDeltaSec: 0.05,
    beltColliderHipRadius: 0.1,
    beltColliderThighRadius: 0.085,
    beltColliderHipYOffset: 0,
    beltColliderThighYOffset: 0.05,
    beltColliderThighZOffset: 0,
    beltShowColliders: false,
    beltShowChainHelpers: false,
    beltStiffnessTipScale: 0.95,
    pantsPhysicsEnabled: true,
    pantsSubSteps: 2,
    pantsConstraintIterations: 4,
    pantsResistance: 0.82,
    /** Softer default so weighted drive bones can show droop/sway. */
    pantsHardness: 0.12,
    pantsHardnessTipScale: 0.55,
    /** 1 ≈ earth gravity (×9.8 m/s² inside solver). */
    pantsGravityPower: 1.0,
    pantsGravityDirX: 0,
    pantsGravityDirY: -1,
    pantsGravityDirZ: 0,
    pantsGravityAirScale: 0.65,
    pantsWindScale: 1.0,
    /** Peak idle wind accel (m/s²); was too small when treated as raw ×dt². */
    pantsBreathAmp: 0.8,
    pantsBreathHz: 0.35,
    pantsBreathDirX: 0.15,
    pantsBreathDirY: 0,
    pantsBreathDirZ: 0.05,
    pantsStructuralShrinkVertical: 1.0,
    pantsStructuralStretchVertical: 1.0,
    pantsStructuralShrinkHorizontal: 1.0,
    pantsStructuralStretchHorizontal: 1.0,
    pantsShearShrink: 1.0,
    pantsShearStretch: 1.0,
    pantsBendingShrinkVertical: 0.85,
    pantsBendingStretchVertical: 0.85,
    pantsBendingShrinkHorizontal: 0.85,
    pantsBendingStretchHorizontal: 0.85,
    pantsEnableHorizontal: true,
    pantsEnableShear: true,
    pantsEnableBending: true,
    pantsPointRadius: 0.012,
    pantsMaxDeltaSec: 0.05,
    pantsRootSlideLimit: 0.35,
    pantsRootRotateLimitDeg: 35,
    pantsMaxSeparation: 0.55,
    pantsColliderThighRadius: 0.07,
    pantsColliderThighTailScale: 0.85,
    pantsColliderThighHeadInset: 0.22,
    pantsColliderCalfRadius: 0.055,
    pantsColliderCalfTailScale: 0.75,
    pantsColliderHipRadius: 0.03,
    pantsColliderBeltRadius: 0.045,
    pantsColliderHipYOffset: 0.06,
    pantsColliderBeltYOffset: 0.04,
    pantsUsePushIn: false,
    pantsShowColliders: false,
    pantsShowConstraints: false,
    pantsHealthReportEnabled: true,
    pantsHealthHudEnabled: true,
    pantsHealthSnapshotIntervalSec: 2.5,
    pantsHealthWarnRatio: 0.55,
    pantsHealthHudMinIntervalMs: 150,
    pantsHealthAutoShowConstraintsOnAbnormal: true,
    pantsHealthIncidentKeep: 20,
    pantsHealthSessionMaxEntries: 1500,
    pantsHealthSessionKeep: 20,
    pantsFeelNote: '',
    hitVfxEnabled: true,
    hitVfxRecipes: createDefaultHitVfxRecipes(),
    hitVfxElementPresets: [],
    hitVfxActiveRecipeOnHitId: 'ungarded_default',
    hitVfxActiveRecipeOnBlockId: 'block_default',
    hitVfxSelectedRecipeId: 'ungarded_default',
    hitVfxSelectedElementId: 'spark',
    hitVfxSelectedGroupId: 'main',
    hitVfxPreviewActive: false,
    hitVfxPreviewDummyVisible: true,
    hitVfxTimeScale: 1,
    hitVfxPaused: false,
    hitVfxStepFrames: 0,
    hitVfxSeedLocked: true,
    hitVfxSeed: 1,
    hitVfxFollowHitstop: false,
    hitVfxHeightOffsets: defaultHeightOffsets(),
    hitVfxMaxConcurrent: 6,
    hitVfxSparkLightPoolSize: 4,
    hitVfxDebug: false,
    hitVfxPreviewHeight: 'm',
    hitVfxPreviewStrength: 'M',
    hitVfxPreviewKind: 'onHit',
    hitVfxPreviewLoop: false,
    wudaEnabled: false,
    wudaAttachMode: 'surfaceBary',
    wudaCoverMode: 'allMeshes',
    wudaCoverMeshMinVerts: 256,
    wudaLayerPresets: createDefaultWudaLayerPresets(),
    wudaActiveLayerPresetId: 'wuda_p1_default',
  };
}

export function applyConfigToMatchOpts(cfg: MutableSimConfig) {
  const power = cfg.dashFrontHeavyPower ?? 1.5;
  const dashDxFwd = buildFrontHeavyDashDx(
    cfg.dashFrames,
    cfg.dashSpeed * Math.max(1, cfg.dashFrames),
    power,
  );
  const dashDxBack = buildFrontHeavyDashDx(
    cfg.dashBackFrames,
    cfg.dashBackSpeed * Math.max(1, cfg.dashBackFrames),
    power,
  );
  cfg.dashDxFwd = dashDxFwd;
  cfg.dashDxBack = dashDxBack;
  return {
    actionBufferStandard: cfg.actionBufferStandard,
    actionBufferDash: cfg.actionBufferDash,
    motionStepGapMax: cfg.motionStepGapMax,
    dashDirHoldMax: cfg.dashDirHoldMax,
    dashNeutralMax: cfg.dashNeutralMax,
    motionHistoryCapacity: cfg.motionHistoryCapacity,
    hitstopFramesOnHit: cfg.hitstopFramesOnHit,
    hitstopFramesOnBlock: cfg.hitstopFramesOnBlock,
    enableCancel: cfg.enableCancel,
    enableSpecials: cfg.enableSpecials,
    enableThrows: cfg.enableThrows,
    enableActionBuffer: cfg.enableActionBuffer,
    dashFrames: cfg.dashFrames,
    dashBackFrames: cfg.dashBackFrames,
    dashAnimFrames: cfg.dashAnimFrames,
    dashBackAnimFrames: cfg.dashBackAnimFrames,
    dashSpeed: cfg.dashSpeed,
    dashBackSpeed: cfg.dashBackSpeed,
    dashDxFwd,
    dashDxBack,
    dashFrontHeavyPower: power,
    prejumpFrames: cfg.prejumpFrames,
    airFrames: cfg.airFrames,
    landingFrames: cfg.landingFrames,
    landingAnimFrames: cfg.landingAnimFrames,
    neutralLandToRiseIdleRatio: cfg.neutralLandToRiseIdleRatio,
    neutralLandToRiseTurnRatio: cfg.neutralLandToRiseTurnRatio,
    neutralRiseToTurnDissolveRatio: cfg.neutralRiseToTurnDissolveRatio,
    walkSpeed: cfg.walkSpeed,
    walkBackSpeed: cfg.walkBackSpeed,
    walkFirstFrameScale: cfg.walkFirstFrameScale,
    walkEarlyReleaseEndKeepRatio: cfg.walkEarlyReleaseEndKeepRatio,
    walkInputFreezeFrames: cfg.walkInputFreezeFrames,
    jumpApex: cfg.jumpApex,
    jumpFwdDist: cfg.jumpFwdDist,
    jumpBackDist: cfg.jumpBackDist,
    jumpNeutralDist: cfg.jumpNeutralDist,
    applySelfMovement: cfg.applySelfMovement,
    selfMovementScale: cfg.selfMovementScale * (cfg.mmdkUnitScale ?? 1),
    standToCrouchFrames: cfg.standToCrouchFrames,
    crouchToStandFrames: cfg.crouchToStandFrames,
    forceP2Guard: cfg.forceP2Guard,
    dummyGuardPolicy: cfg.dummyGuardPolicy,
    dummyUnguardedStance: cfg.dummyUnguardedStance,
    dummyWakeupStyle: cfg.dummyWakeupStyle,
    enableHitPush: cfg.enableHitPush,
    hitPushbackTotal: cfg.hitPushbackTotal,
    hitstunOverride: cfg.hitstunOverride,
    knockdownFramesOverride: cfg.knockdownFramesOverride,
    knockdownDownHoldOverride: cfg.knockdownDownHoldOverride,
    wakeupBackDxTotal: cfg.wakeupBackDxTotal,
    enablePushResolve: cfg.enablePushResolve,
    enableBlockPush: cfg.enableBlockPush,
    blockPushbackTotal: cfg.blockPushbackTotal,
    blockPushEasePower: cfg.blockPushEasePower,
    blockstunOverride: cfg.blockstunOverride,
    damageScale: cfg.damageScale,
    stageMinX: cfg.stageMinX,
    stageMaxX: cfg.stageMaxX,
  };
}

/** Push live GUI config into MatchSim.opts each time a control changes. */
export function syncMatchOpts(
  match: {
    opts: ReturnType<typeof applyConfigToMatchOpts>;
    history: { setCapacity: (n: number) => void };
    ensureDashDxTables?: () => void;
    dummy?: {
      setGuardPolicy: (p: MutableSimConfig['dummyGuardPolicy']) => void;
      setWakeupStyle?: (s: MutableSimConfig['dummyWakeupStyle']) => void;
      setUnguardedStance?: (s: MutableSimConfig['dummyUnguardedStance']) => void;
    };
  },
  cfg: MutableSimConfig,
): void {
  Object.assign(match.opts, applyConfigToMatchOpts(cfg));
  match.history.setCapacity(cfg.motionHistoryCapacity);
  match.ensureDashDxTables?.();
  match.dummy?.setUnguardedStance?.(cfg.dummyUnguardedStance);
  match.dummy?.setWakeupStyle?.(cfg.dummyWakeupStyle);
  match.dummy?.setGuardPolicy(cfg.dummyGuardPolicy);
}
