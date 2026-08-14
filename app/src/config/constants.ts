/** Defaults from docs/plans/ai-execution-plan-character-control-p0-v0.md */

import { buildFrontHeavyDashDx } from '../combat/loco/DashProfile';

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
  worldScale: number;
  modelScale: number;
  modelYOffset: number;
  cameraZ: number;
  cameraY: number;
  timeScaleAnim: number;
  bufferFrames: number;
  showHitboxes: boolean;
  showHurtboxes: boolean;
  showPushboxes: boolean;
  /** Tint hurt boxes by part (head/body/leg) in green family. */
  hurtPartColors: boolean;
  showBuffer: boolean;
  showCancelWindow: boolean;
  hitboxColor: number;
  hurtboxColor: number;
  pushboxColor: number;
  forceP2Guard: boolean;
  enablePushResolve: boolean;
  enableBlockPush: boolean;
  blockPushbackTotal: number;
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
  walkSpeed: number;
  walkBackSpeed: number;
  walkFirstFrameScale: number;
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
   * Attack residual (or attack clip) → walk/idle dual-advance blend (§3.11).
   * Must not apply during attack lock (callers pass 0 there).
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
    worldScale: WORLD_SCALE,
    modelScale: 0.9,
    modelYOffset: 0,
    cameraZ: 6,
    cameraY: 1.2,
    timeScaleAnim: 1,
    bufferFrames: INPUT_BUFFER_FRAMES,
    showHitboxes: true,
    showHurtboxes: true,
    showPushboxes: true,
    hurtPartColors: true,
    showBuffer: false,
    showCancelWindow: true,
    hitboxColor: HITBOX_COLOR,
    hurtboxColor: HURTBOX_COLOR,
    pushboxColor: PUSHBOX_COLOR,
    forceP2Guard: true,
    enablePushResolve: true,
    enableBlockPush: true,
    blockPushbackTotal: 0.22,
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
    walkSpeed: 0.047,
    walkBackSpeed: 0.032,
    walkFirstFrameScale: 0.25,
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
    walkSpeed: cfg.walkSpeed,
    walkBackSpeed: cfg.walkBackSpeed,
    walkFirstFrameScale: cfg.walkFirstFrameScale,
    jumpApex: cfg.jumpApex,
    jumpFwdDist: cfg.jumpFwdDist,
    jumpBackDist: cfg.jumpBackDist,
    jumpNeutralDist: cfg.jumpNeutralDist,
    applySelfMovement: cfg.applySelfMovement,
    selfMovementScale: cfg.selfMovementScale * (cfg.mmdkUnitScale ?? 1),
    standToCrouchFrames: cfg.standToCrouchFrames,
    crouchToStandFrames: cfg.crouchToStandFrames,
    forceP2Guard: cfg.forceP2Guard,
    enablePushResolve: cfg.enablePushResolve,
    enableBlockPush: cfg.enableBlockPush,
    blockPushbackTotal: cfg.blockPushbackTotal,
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
  },
  cfg: MutableSimConfig,
): void {
  Object.assign(match.opts, applyConfigToMatchOpts(cfg));
  match.history.setCapacity(cfg.motionHistoryCapacity);
  match.ensureDashDxTables?.();
}
