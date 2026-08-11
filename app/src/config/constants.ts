/** Defaults from docs/plans/ai-execution-plan-character-control-p0-v0.md */

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
  showBuffer: boolean;
  showCancelWindow: boolean;
  hitboxColor: number;
  hurtboxColor: number;
  actionBufferStandard: number;
  actionBufferDash: number;
  motionStepGapMax: number;
  dashDirHoldMax: number;
  dashNeutralMax: number;
  motionHistoryCapacity: number;
  hitstopFramesOnHit: number;
  hitstopFramesOnBlock: number;
  enableCancel: boolean;
  enableActionBuffer: boolean;
  dashFrames: number;
  dashBackFrames: number;
  dashSpeed: number;
  dashBackSpeed: number;
  prejumpFrames: number;
  airFrames: number;
  landingFrames: number;
  walkSpeed: number;
  walkBackSpeed: number;
  walkFirstFrameScale: number;
  jumpApex: number;
  jumpFwdDist: number;
  jumpBackDist: number;
  jumpNeutralDist: number;
  scrubFromLogic: boolean;
  scrubMode: 'uniform' | 'truncate';
  plantMode: 'consensus' | 'legacy';
  footPlantEnabled: boolean;
  rootPoseLockAttack: boolean;
  applySelfMovement: boolean;
  selfMovementScale: number;
  showFootDebug: boolean;
};

export function createDefaultSimConfig(): MutableSimConfig {
  // Defaults match SuperCombo Ryu until ryu_movement.json is loaded (Step 0).
  const dashFwdDist = 1.252;
  const dashFwdFrames = 19;
  const dashBackDist = 0.923;
  const dashBackFrames = 23;
  return {
    logicFps: LOGIC_FPS,
    maxLogicStepsPerRaf: MAX_LOGIC_STEPS_PER_RAF,
    maxFrameTimeMs: MAX_FRAME_TIME_MS,
    worldScale: WORLD_SCALE,
    modelScale: 1,
    modelYOffset: 0,
    cameraZ: 6,
    cameraY: 1.2,
    timeScaleAnim: 1,
    bufferFrames: INPUT_BUFFER_FRAMES,
    showHitboxes: true,
    showHurtboxes: true,
    showBuffer: false,
    showCancelWindow: true,
    hitboxColor: HITBOX_COLOR,
    hurtboxColor: HURTBOX_COLOR,
    actionBufferStandard: ACTION_BUFFER_STANDARD,
    actionBufferDash: ACTION_BUFFER_DASH,
    motionStepGapMax: MOTION_STEP_GAP_MAX,
    dashDirHoldMax: DASH_DIR_HOLD_MAX,
    dashNeutralMax: DASH_NEUTRAL_MAX,
    motionHistoryCapacity: INPUT_BUFFER_FRAMES,
    hitstopFramesOnHit: HITSTOP_ON_HIT,
    hitstopFramesOnBlock: HITSTOP_ON_BLOCK,
    enableCancel: true,
    enableActionBuffer: true,
    dashFrames: dashFwdFrames,
    dashBackFrames,
    dashSpeed: dashFwdDist / dashFwdFrames,
    dashBackSpeed: dashBackDist / dashBackFrames,
    prejumpFrames: 4,
    airFrames: 38,
    landingFrames: 3,
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
  };
}

export function applyConfigToMatchOpts(cfg: MutableSimConfig) {
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
    enableActionBuffer: cfg.enableActionBuffer,
    dashFrames: cfg.dashFrames,
    dashBackFrames: cfg.dashBackFrames,
    dashSpeed: cfg.dashSpeed,
    dashBackSpeed: cfg.dashBackSpeed,
    prejumpFrames: cfg.prejumpFrames,
    airFrames: cfg.airFrames,
    landingFrames: cfg.landingFrames,
    walkSpeed: cfg.walkSpeed,
    walkBackSpeed: cfg.walkBackSpeed,
    walkFirstFrameScale: cfg.walkFirstFrameScale,
    jumpApex: cfg.jumpApex,
    jumpFwdDist: cfg.jumpFwdDist,
    jumpBackDist: cfg.jumpBackDist,
    jumpNeutralDist: cfg.jumpNeutralDist,
    applySelfMovement: cfg.applySelfMovement,
    selfMovementScale: cfg.selfMovementScale,
  };
}

/** Push live GUI config into MatchSim.opts each time a control changes. */
export function syncMatchOpts(
  match: {
    opts: ReturnType<typeof applyConfigToMatchOpts>;
    history: { setCapacity: (n: number) => void };
  },
  cfg: MutableSimConfig,
): void {
  Object.assign(match.opts, applyConfigToMatchOpts(cfg));
  match.history.setCapacity(cfg.motionHistoryCapacity);
}
