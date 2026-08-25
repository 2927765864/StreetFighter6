import { DEFAULT_HP, DRIVE_MAX } from '../../config/constants';
import { anyHitOverlapsHurt } from '../boxes/Collision';
import type { MoveDefinition } from '../move/MoveDefinition';
import { cloneMove } from '../move/MoveDefinition';
import { MoveCatalog } from '../move/MoveCatalog';
import { Fighter } from '../fighter/Fighter';
import { InputHistory } from '../input/InputHistory';
import { ActionBuffer } from '../input/ActionBuffer';
import { tryCommitLogicalFacing, toFacingRelative } from '../input/facing';
import { heldPostureFromRelDir } from '../anim/AnimResidual';
import { resolveIntent } from '../command/IntentResolver';
import { RYU_FEEDBACK_COMMANDS } from '../command/ryuCommands';
import type { CommandDef } from '../command/CommandDef';
import { DriveStub } from '../systems/DriveStub';
import type {
  DummyGuardPolicy,
  DummyUnguardedStance,
  DummyWakeupStyle,
  Facing,
  HitResult,
  InputSample,
  Intent,
} from '../types';
import { DummyController } from './DummyController';
import { stepWalk } from '../loco/WalkController';
import type { RyuMovementTable } from '../../data/loadRyuMovement';
import { parseRyuMovement } from '../../data/loadRyuMovement';
import { buildFrontHeavyDashDx } from '../loco/DashProfile';
import { resolvePush } from '../systems/PushResolve';
import {
  distributePushback,
  resolveBlockOnHit,
} from '../systems/BlockResolve';
import {
  canGuard,
  normalizeGuard,
  guardAnimForHit,
  selectGuardReactLogicId,
  stanceForBlockAll,
} from '../systems/GuardPolicy';
import { hitAnimForHit, selectHitReactLogicId } from '../systems/HitPolicy';
import { resolveHitOnHit } from '../systems/HitResolve';
import type { StanceBoxTable } from '../../data/loadStanceBoxes';

export type MatchSimOptions = {
  actionBufferStandard: number;
  actionBufferDash: number;
  motionStepGapMax: number;
  dashDirHoldMax: number;
  dashNeutralMax: number;
  motionHistoryCapacity: number;
  hitstopFramesOnHit: number;
  hitstopFramesOnBlock: number;
  enableCancel: boolean;
  /** When false, special command inputs never resolve/execute (data stays loaded). */
  enableSpecials: boolean;
  /** When false, throw command inputs never resolve/execute (data stays loaded). */
  enableThrows: boolean;
  enableActionBuffer: boolean;
  dashFrames: number;
  dashBackFrames: number;
  /** Presentation residual length (map/glb); default 42/40. */
  dashAnimFrames: number;
  dashBackAnimFrames: number;
  /** Average |dx| (GUI); per-frame tables preferred. */
  dashSpeed: number;
  dashBackSpeed: number;
  /** Front-heavy per-frame |dx|; sum ≈ distance. */
  dashDxFwd: number[];
  dashDxBack: number[];
  dashFrontHeavyPower: number;
  prejumpFrames: number;
  airFrames: number;
  landingFrames: number;
  /** Land clip visual length (map/glb); base length for §3.13.7 dissolve ratio. */
  landingAnimFrames: number;
  /** §3.13.7: land → crouch_to_stand start ratio (→ idle path). */
  neutralLandToRiseIdleRatio: number;
  /** §3.13.7: land → crouch_to_stand start ratio (→ turn path). */
  neutralLandToRiseTurnRatio: number;
  /** §3.13.7: crouch_to_stand → turn_std start ratio (pending turn only). */
  neutralRiseToTurnDissolveRatio: number;
  walkSpeed: number;
  walkBackSpeed: number;
  walkFirstFrameScale: number;
  jumpApex: number;
  jumpFwdDist: number;
  jumpBackDist: number;
  jumpNeutralDist: number;
  applySelfMovement: boolean;
  selfMovementScale: number;
  standToCrouchFrames: number;
  crouchToStandFrames: number;
  /**
   * @deprecated Prefer dummyGuardPolicy. false → none; true → block_all if policy omitted.
   */
  forceP2Guard: boolean;
  dummyGuardPolicy: DummyGuardPolicy;
  dummyUnguardedStance: DummyUnguardedStance;
  dummyWakeupStyle: DummyWakeupStyle;
  enableHitPush: boolean;
  hitPushbackTotal: number;
  hitstunOverride: number;
  knockdownFramesOverride: number;
  knockdownDownHoldOverride: number;
  wakeupBackDxTotal: number;
  enablePushResolve: boolean;
  enableBlockPush: boolean;
  blockPushbackTotal: number;
  /** Ease-out power for block push (3 = cubic). Substitute for missing CurveTgtID table. */
  blockPushEasePower: number;
  /** -1 = use move.blockstun */
  blockstunOverride: number;
  /** 0 = no chip on block path; 1 = full damage on hit path */
  damageScale: number;
  stageMinX: number;
  stageMaxX: number;
};

const DEFAULT_OPTS: MatchSimOptions = {
  actionBufferStandard: 4,
  actionBufferDash: 7,
  motionStepGapMax: 9,
  dashDirHoldMax: 8,
  dashNeutralMax: 8,
  motionHistoryCapacity: 32,
  hitstopFramesOnHit: 8,
  hitstopFramesOnBlock: 8,
  enableCancel: true,
  enableSpecials: false,
  enableThrows: false,
  enableActionBuffer: true,
  dashFrames: 19,
  dashBackFrames: 23,
  dashAnimFrames: 42,
  dashBackAnimFrames: 40,
  dashSpeed: 1.252 / 19,
  dashBackSpeed: 0.923 / 23,
  // Filled in constructor if empty — see ensureDashDx
  dashDxFwd: [],
  dashDxBack: [],
  dashFrontHeavyPower: 1.5,
  prejumpFrames: 4,
  airFrames: 38,
  landingFrames: 3,
  landingAnimFrames: 20,
  neutralLandToRiseIdleRatio: 0.05,
  neutralLandToRiseTurnRatio: 0.05,
  neutralRiseToTurnDissolveRatio: 1,
  walkSpeed: 0.047,
  walkBackSpeed: 0.032,
  walkFirstFrameScale: 0.25,
  jumpApex: 2.115,
  jumpFwdDist: 1.9,
  jumpBackDist: 1.52,
  jumpNeutralDist: 0,
  applySelfMovement: true,
  selfMovementScale: 1,
  standToCrouchFrames: 60,
  crouchToStandFrames: 38,
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
  stageMinX: -4.5,
  stageMaxX: 4.5,
};

export type MatchSnapshot = {
  logicFrame: number;
  p1Phase: string;
  p2Phase: string;
  p1MoveId: string | null;
  p1MoveFrame: number;
  p1Total: number;
  activeHit: boolean;
  cancelWindow: string;
  p1Hp: number;
  p2Hp: number;
  driveBars: number;
  dummyMode: string;
  lastHitResult: HitResult;
  bufferDirs: string;
  hitstopTimer: number;
  actionBuffer: string;
  lastIntent: string;
  relDir: number;
  pressed: number;
};

export class MatchSim {
  p1: Fighter;
  p2: Fighter;
  dummy = new DummyController();
  drive = new DriveStub(DRIVE_MAX, DRIVE_MAX);
  history: InputHistory;
  actionBuffer = new ActionBuffer();
  catalog: MoveCatalog;
  /** @deprecated use catalog; kept for GUI 5LP edits */
  move5lp: MoveDefinition;
  lastHitResult: HitResult = 'none';
  logicFrame = 0;
  hitstopTimer = 0;
  lastIntent: Intent = {
    kind: 'none',
    priority: -1,
    bufferClass: 'standard',
  };
  opts: MatchSimOptions;

  /** Optional walk clip frame counts from ryu_movement.json */
  movementTable: RyuMovementTable | null = null;

  /** Stance head/body/leg table (two-layer assembly). */
  stanceTable: StanceBoxTable | null = null;

  /** Live probe for lil-gui / HUD (plan: 指令反馈 panel). */
  debugProbe = {
    lastIntentKind: 'none',
    lastIntentMoveId: '',
    lastCommandId: '',
    p1Phase: 'idle',
    p1ClipId: 'idle',
    p1AnimRole: 'main',
    p1LocoPhase: 'none',
    p1JumpPhase: 'none',
    p1SelfDx: 0,
    p1BlockPushDx: 0,
    p2BlockPushDx: 0,
    pushOverlapX: 0,
    p1TimelineFrame: 0,
    p1Total: 0,
    p1CanAct: true,
    p1HasAttackResidual: false,
    p1ActionTimelineActive: false,
    p1ActionTimelineFrame: 0,
    p1StanceId: 'stand',
    p1HurtCount: 0,
    p1HitCount: 0,
    hitsLandedThisMove: 0,
    hitstopTimer: 0,
    lastHitResult: 'none',
    forceP2Guard: true,
    dummyGuardPolicy: 'block_all' as DummyGuardPolicy,
    lastGuardLevel: '',
    lastGuardOk: false,
    p2Phase: 'idle',
    p2StunTimer: 0,
    p2ClipId: 'idle',
    p2Crouching: false,
    guardClipFallback: false,
    hitClipFallback: false,
    lastHitReaction: '',
    lastHitClipId: '',
    p2KdPhase: 'none',
    dummyWakeupStyle: 'normal' as DummyWakeupStyle,
    moveHitstun: 0,
    moveKnockdownFrames: 0,
    catalogCount: 0,
    lastMoveMiss: '',
    lastExecuteOk: false,
    logCommandsToConsole: false,
    reviewStatus: '',
    /** Latest successful attack starter for display layer (p1 default). */
    frontFighterId: 'p1' as 'p1' | 'p2',
  };

  pendingInput: InputSample = {
    dir: 5,
    relDir: 5,
    buttons: 0,
    pressed: 0,
    released: 0,
  };

  constructor(move5lp: MoveDefinition, catalog?: MoveCatalog, opts?: Partial<MatchSimOptions>) {
    this.opts = { ...DEFAULT_OPTS, ...opts };
    this.ensureDashDxTables();
    this.move5lp = cloneMove(move5lp);
    this.catalog = catalog ?? MoveCatalog.fromMoves([this.move5lp]);
    if (!this.catalog.has(this.move5lp.id)) {
      this.catalog.register(this.move5lp);
    }
    this.history = new InputHistory(this.opts.motionHistoryCapacity);
    this.p1 = new Fighter('p1', -1.2, 1, DEFAULT_HP);
    this.p2 = new Fighter('p2', 1.2, -1, DEFAULT_HP);
    this.p1.setStanceConfig({
      standToCrouchFrames: this.opts.standToCrouchFrames,
      crouchToStandFrames: this.opts.crouchToStandFrames,
    });
    if (opts?.dummyGuardPolicy != null) {
      this.opts.dummyGuardPolicy = opts.dummyGuardPolicy;
    } else if (opts?.forceP2Guard === false) {
      this.opts.dummyGuardPolicy = 'none';
    } else {
      this.opts.dummyGuardPolicy = 'block_all';
    }
    this.dummy.setUnguardedStance(this.opts.dummyUnguardedStance);
    this.dummy.setWakeupStyle(this.opts.dummyWakeupStyle);
    this.dummy.setGuardPolicy(this.opts.dummyGuardPolicy);
    this.debugProbe.catalogCount = this.catalog.size;
    this.debugProbe.forceP2Guard = this.opts.forceP2Guard;
    this.debugProbe.dummyGuardPolicy = this.dummy.guardPolicy;
  }

  /** Rebuild front-heavy |dx| tables from frames × avg speed (= distance). */
  ensureDashDxTables(): void {
    const p = this.opts.dashFrontHeavyPower ?? 1.5;
    const nf = Math.max(1, this.opts.dashFrames);
    const nb = Math.max(1, this.opts.dashBackFrames);
    this.opts.dashDxFwd = buildFrontHeavyDashDx(
      nf,
      this.opts.dashSpeed * nf,
      p,
    );
    this.opts.dashDxBack = buildFrontHeavyDashDx(
      nb,
      this.opts.dashBackSpeed * nb,
      p,
    );
  }

  get walkSpeed(): number {
    return this.opts.walkSpeed;
  }
  set walkSpeed(v: number) {
    this.opts.walkSpeed = v;
  }

  /** Compat for DebugGui buffer capacity */
  get buffer(): InputHistory {
    return this.history;
  }

  reset(): void {
    this.p1 = new Fighter('p1', -1.2, 1, DEFAULT_HP);
    this.p2 = new Fighter('p2', 1.2, -1, DEFAULT_HP);
    this.applyStanceTableToFighters();
    this.p1.setStanceConfig({
      standToCrouchFrames: this.opts.standToCrouchFrames,
      crouchToStandFrames: this.opts.crouchToStandFrames,
    });
    this.lastHitResult = 'none';
    this.logicFrame = 0;
    this.hitstopTimer = 0;
    this.actionBuffer.clear();
    this.history.clear();
    this.drive.setBars(DRIVE_MAX);
    this.lastIntent = {
      kind: 'none',
      priority: -1,
      bufferClass: 'standard',
    };
    this.pendingInput = {
      dir: 5,
      relDir: 5,
      buttons: 0,
      pressed: 0,
      released: 0,
    };
    this.debugProbe.lastIntentKind = 'none';
    this.debugProbe.lastIntentMoveId = '';
    this.debugProbe.lastCommandId = '';
    this.debugProbe.lastHitResult = 'none';
    this.debugProbe.hitstopTimer = 0;
    this.debugProbe.p1Phase = 'idle';
    this.debugProbe.p1ClipId = 'idle';
    this.debugProbe.p1AnimRole = 'main';
    this.debugProbe.p1LocoPhase = 'none';
    this.debugProbe.p1JumpPhase = 'none';
    this.debugProbe.p1SelfDx = 0;
    this.debugProbe.p1BlockPushDx = 0;
    this.debugProbe.p2BlockPushDx = 0;
    this.debugProbe.pushOverlapX = 0;
  }

  setStanceTable(table: StanceBoxTable | null): void {
    this.stanceTable = table;
    this.applyStanceTableToFighters();
  }

  private applyStanceTableToFighters(): void {
    this.p1.setStanceTable(this.stanceTable);
    this.p2.setStanceTable(this.stanceTable);
  }

  applyMoveEdit(
    partial: Partial<MoveDefinition['frames']> & {
      damage?: number;
      hitstun?: number;
      blockstun?: number;
      hitBox?: { x: number; y: number; w: number; h: number };
      hurtBox?: { x: number; y: number; w: number; h: number };
    },
  ): void {
    if (partial.startup !== undefined) this.move5lp.frames.startup = partial.startup;
    if (partial.active !== undefined) this.move5lp.frames.active = partial.active;
    if (partial.recovery !== undefined) this.move5lp.frames.recovery = partial.recovery;
    this.move5lp.frames.total =
      this.move5lp.frames.startup +
      this.move5lp.frames.active +
      this.move5lp.frames.recovery;
    if (partial.damage !== undefined) this.move5lp.damage = partial.damage;
    if (partial.hitstun !== undefined) this.move5lp.hitstun = partial.hitstun;
    if (partial.blockstun !== undefined) this.move5lp.blockstun = partial.blockstun;
    if (partial.hitBox && this.move5lp.boxes.hit[0]) {
      Object.assign(this.move5lp.boxes.hit[0], partial.hitBox);
    }
    if (partial.hurtBox && this.move5lp.boxes.hurt[0]) {
      Object.assign(this.move5lp.boxes.hurt[0], partial.hurtBox);
    }
    this.catalog.register(this.move5lp);
  }

  private ttlFor(intent: Intent): number {
    return intent.bufferClass === 'dash'
      ? this.opts.actionBufferDash
      : this.opts.actionBufferStandard;
  }

  /** Command rows allowed for input resolution (usage gate only). */
  private activeCommands(): readonly CommandDef[] {
    if (this.opts.enableSpecials && this.opts.enableThrows) {
      return RYU_FEEDBACK_COMMANDS;
    }
    return RYU_FEEDBACK_COMMANDS.filter((c) => {
      if (c.kind === 'special' && !this.opts.enableSpecials) return false;
      if (c.kind === 'throw' && !this.opts.enableThrows) return false;
      return true;
    });
  }

  private canExecute(intent: Intent): boolean {
    if (intent.kind === 'none' || intent.kind === 'walk' || intent.kind === 'crouch') {
      return this.p1.canAct();
    }
    if (intent.kind === 'special') {
      if (!this.opts.enableSpecials) return false;
      return (
        this.p1.canAct() ||
        this.p1.canSpecialCancel(this.opts.enableCancel) ||
        this.p1.canPrejumpSpecial() ||
        this.p1.canLandingAttack()
      );
    }
    if (intent.kind === 'throw') {
      if (!this.opts.enableThrows) return false;
      return this.p1.canAct() || this.p1.canLandingAttack();
    }
    if (intent.kind === 'normal') {
      if (intent.airOnly) return this.p1.canAirAct();
      return (
        this.p1.canAct() ||
        this.p1.canLandingAttack() ||
        this.p1.canSelfCancel(this.opts.enableCancel, intent.moveId)
      );
    }
    if (intent.kind === 'dash_fwd' || intent.kind === 'dash_back') {
      return this.p1.canAct();
    }
    if (intent.kind === 'jump') {
      return this.p1.canAct();
    }
    return false;
  }

  /** Inject local movement table (must be parseRyuMovement result). */
  setMovementTable(table: RyuMovementTable | unknown): void {
    this.movementTable =
      table && typeof table === 'object' && 'walk' in (table as object)
        ? parseRyuMovement(table)
        : null;
  }

  /** Set when a move/dash/jump starts this logic frame — skip advance once (ADR-003 frame 0). */
  private skipP1Advance = false;

  private executeIntent(intent: Intent): boolean {
    if (intent.kind === 'special' && !this.opts.enableSpecials) return false;
    if (intent.kind === 'throw' && !this.opts.enableThrows) return false;
    if (
      intent.kind === 'special' ||
      intent.kind === 'normal' ||
      intent.kind === 'throw'
    ) {
      const id = intent.moveId;
      if (!id) return false;
      // Prefer live move5lp for 5lp GUI frame edits only
      let move: ReturnType<typeof cloneMove> | undefined;
      if (
        id === 'ryu_5lp' ||
        id === '5LP' ||
        id === this.move5lp.id ||
        id === this.move5lp.moveId
      ) {
        move = cloneMove(this.move5lp);
      } else {
        move = this.catalog.get(id);
      }
      // Never silent-fallback to 5LP (false feedback) — plan V7
      if (!move) {
        this.debugProbe.lastMoveMiss = id;
        console.warn('[MatchSim] move not in catalog:', id);
        this.debugProbe.lastExecuteOk = false;
        return false;
      }
      this.p1.startMove(move);
      this.debugProbe.hitsLandedThisMove = 0;
      this.actionBuffer.clear();
      this.skipP1Advance = true;
      this.debugProbe.lastMoveMiss = '';
      this.debugProbe.lastExecuteOk = true;
      if (this.debugProbe.logCommandsToConsole) {
        console.info('[MatchSim] execute', intent.commandId, id, 'clip', move.clipId);
      }
      return true;
    }
    if (intent.kind === 'dash_fwd') {
      this.p1.startDash(
        true,
        this.opts.dashFrames,
        this.opts.dashAnimFrames,
      );
      this.actionBuffer.clear();
      this.skipP1Advance = true;
      return true;
    }
    if (intent.kind === 'dash_back') {
      this.p1.startDash(
        false,
        this.opts.dashBackFrames,
        this.opts.dashBackAnimFrames,
      );
      this.actionBuffer.clear();
      this.skipP1Advance = true;
      return true;
    }
    if (intent.kind === 'jump') {
      const last = this.history.latest();
      const rel = last?.relDir ?? 8;
      this.p1.startJump(
        this.opts.prejumpFrames,
        rel,
        this.opts.landingAnimFrames,
      );
      this.actionBuffer.clear();
      this.skipP1Advance = true;
      return true;
    }
    if (intent.kind === 'crouch') {
      this.p1.setIdleWalk('crouch');
      return true;
    }
    if (intent.kind === 'walk') {
      this.stepWalkLocomotion(true);
      return true;
    }
    return false;
  }

  /**
   * Walk start/loop/end via WalkController + movement table speeds.
   * @param holdingWalk when false, still advance end phase if active
   */
  private stepWalkLocomotion(holdingWalk: boolean): void {
    const last = this.history.latest();
    const rel = last?.relDir ?? 5;
    const holdFwd = holdingWalk && rel === 6;
    const holdBack = holdingWalk && rel === 4;
    const clips = this.movementTable?.walk.clipLogicFrames ?? {
      walk_fwd: { start: 19, loop: 114, end: 47 },
      walk_back: { start: 15, loop: 118, end: 47 },
    };
    const { state, dxFacing } = stepWalk(this.p1.walkState, {
      holdFwd,
      holdBack,
      clips,
      forwardSpeed: this.opts.walkSpeed,
      backSpeed: this.opts.walkBackSpeed,
      firstFrameSpeedScale: this.opts.walkFirstFrameScale,
    });
    this.p1.x += this.p1.facing * dxFacing;
    this.p1.applyWalkState(state);
  }

  private commitLogicalFacing(): void {
    const face = tryCommitLogicalFacing(
      this.p1,
      this.p2,
      this.p1.worldPushBoxes(),
      this.p2.worldPushBoxes(),
    );
    if (face.aChanged) this.p1.onLogicalTurn();
    if (face.bChanged) this.p2.onLogicalTurn();
  }

  step(): void {
    this.logicFrame += 1;
    this.skipP1Advance = false;

    // Commands use logical facing from last frame / already-separated boxes.
    this.commitLogicalFacing();

    const input = { ...this.pendingInput };
    input.relDir = toFacingRelative(input.dir, this.p1.facing);
    this.pendingInput = input;
    this.history.push(input, this.logicFrame);

    const resolveCfg = {
      motionStepGapMax: this.opts.motionStepGapMax,
      dashDirHoldMax: this.opts.dashDirHoldMax,
      dashNeutralMax: this.opts.dashNeutralMax,
    };

    if (this.p1.phase === 'prejump') {
      const rel = input.relDir;
      this.p1.retargetJump(rel);
    }

    let intent = resolveIntent(this.history.entries(), this.logicFrame, resolveCfg, {
      phase: this.p1.phase,
      commands: this.activeCommands(),
    });
    this.lastIntent = intent;
    this.debugProbe.lastIntentKind = intent.kind;
    this.debugProbe.lastIntentMoveId = intent.moveId ?? '';
    this.debugProbe.lastCommandId = intent.commandId ?? '';
    this.debugProbe.p1Phase = this.p1.phase;
    this.debugProbe.p1ClipId = this.p1.clipId;
    this.debugProbe.p1AnimRole = this.p1.animRole;
    this.debugProbe.p1LocoPhase = this.p1.locoPhase;
    this.debugProbe.p1JumpPhase = this.p1.jumpPhase;
    this.debugProbe.catalogCount = this.catalog.size;

    // Movement intents every frame when free; attack intents on edges / buffer
    const isLocomotion =
      intent.kind === 'walk' || intent.kind === 'crouch' || intent.kind === 'none';

    if (!isLocomotion) {
      if (this.canExecute(intent)) {
        this.executeIntent(intent);
      } else if (this.opts.enableActionBuffer) {
        this.actionBuffer.set(intent, this.logicFrame, this.ttlFor(intent));
      }
    }

    // Consume action buffer when possible
    if (this.opts.enableActionBuffer) {
      const peek = this.actionBuffer.peek();
      if (peek && this.canExecute(peek.intent)) {
        const taken = this.actionBuffer.takeIfValid(this.logicFrame);
        if (taken) this.executeIntent(taken);
      } else if (peek && this.logicFrame > peek.expiresAtLogicFrame) {
        this.actionBuffer.clear();
      }
    }

    // Locomotion when can act and not attacking this frame
    // Residual §3.7.1 + stance transition §3.7.2
    // Walk locomotion dx applied here only when NOT in hitstop (below).
    let pendingWalk = false;
    if (this.p1.canAct() && this.p1.phase !== 'attack') {
      this.p1.setStanceConfig({
        standToCrouchFrames: this.opts.standToCrouchFrames,
        crouchToStandFrames: this.opts.crouchToStandFrames,
      });
      if (intent.kind === 'crouch') {
        this.p1.applyPostureOrWalkIntent('crouch');
      } else if (intent.kind === 'walk') {
        this.p1.applyPostureOrWalkIntent('walk');
        pendingWalk = true;
      } else if (intent.kind === 'none') {
        if (
          this.p1.locoPhase === 'start' ||
          this.p1.locoPhase === 'loop' ||
          this.p1.locoPhase === 'end'
        ) {
          pendingWalk = true; // finish end segment without hold
        } else {
          this.p1.applyPostureOrWalkIntent('none');
        }
      }
    }

    // Hitstop: still accept input above; skip combat frame advance / displace
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= 1;
      this.syncDebugProbe();
      return;
    }

    // --- §4.4 order: displace → push → hit → advance ---

    // 4a. Walk displacement (after residual cleared by applyPostureOrWalkIntent)
    if (pendingWalk) {
      const holding = intent.kind === 'walk';
      this.stepWalkLocomotion(holding);
    }

    // 4b. Attack Place (locked) + residual Place + block push
    if (this.opts.applySelfMovement) {
      const scale = this.opts.selfMovementScale;
      if (
        this.p1.phase === 'attack' &&
        !this.skipP1Advance &&
        this.p1.jumpPhase !== 'air'
      ) {
        this.p1.applyAttackPlaceDisplacement(scale);
      } else if (this.p1.attackResidual) {
        this.p1.applyAttackResidualDisplacement(scale);
      }
      if (this.p2.phase === 'attack') {
        this.p2.applyAttackPlaceDisplacement(scale);
      } else if (this.p2.attackResidual) {
        this.p2.applyAttackResidualDisplacement(scale);
      }
    }
    if (this.opts.enableBlockPush || this.opts.enableHitPush) {
      this.p1.applyBlockPushDisplacement();
      this.p2.applyBlockPushDisplacement();
    }

    // 5. Push resolve
    const pushRes = resolvePush(this.p1, this.p2, {
      minX: this.opts.stageMinX,
      maxX: this.opts.stageMaxX,
    }, { enabled: this.opts.enablePushResolve });
    this.debugProbe.pushOverlapX = pushRes.maxOverlapX;

    this.commitLogicalFacing();

    // 6. Hit ∩ Hurt (throws: presentation only). Multi-hit: one unlanded group / frame.
    if (
      this.p1.phase === 'attack' &&
      this.p1.mover.move?.clipId !== 'throw_fwd' &&
      this.p1.mover.move?.clipId !== 'throw_back' &&
      this.p2.phase !== 'knockdown'
    ) {
      const pendingGroup = this.p1.mover.unresolvedHitGroupAtCurrentFrame();
      const hits = this.p1.worldHitBoxes();
      const hurts = this.p2.worldHurtBoxes(
        this.dummy.isCrouching() || this.p2.isHurtCrouching(),
      );
      if (
        pendingGroup != null &&
        hits.length > 0 &&
        anyHitOverlapsHurt(hits, hurts)
      ) {
        this.p1.mover.markHitGroupLanded(pendingGroup);
        this.debugProbe.hitsLandedThisMove = this.p1.mover.landedHitGroups.size;
        const mv = this.p1.mover.move ?? this.move5lp;
        const level = normalizeGuard(mv.guard);
        this.debugProbe.lastGuardLevel =
          level === 'midHigh' ? 'M' : level === 'throw' ? 'T' : level === 'high' ? 'H' : level === 'low' ? 'L' : 'M';
        if (this.dummy.guardPolicy === 'block_all') {
          const want = stanceForBlockAll(level, this.dummy.isCrouching());
          this.dummy.applyBlockAllStance(want);
        } else if (this.opts.dummyGuardPolicy === 'stand_block') {
          this.dummy.setGuardPolicy('stand_block');
        } else if (this.opts.dummyGuardPolicy === 'crouch_block') {
          this.dummy.setGuardPolicy('crouch_block');
        }
        const crouching = this.dummy.isCrouching();
        const trying = this.dummy.isBlocking();
        const ok = trying && canGuard(level, crouching);
        this.debugProbe.lastGuardOk = ok;
        this.debugProbe.p2Crouching = crouching;
        if (ok) {
          const br = resolveBlockOnHit(mv, {
            hitstopFramesOnBlock: this.opts.hitstopFramesOnBlock,
            blockstunOverride: this.opts.blockstunOverride,
            blockPushbackTotal: this.opts.blockPushbackTotal,
            damageScale: 0,
          });
          const reactClipId = selectGuardReactLogicId({
            crouching,
            guard: level,
            hitstopOnBlock: mv.hitstopOnBlock,
            guardStrength: mv.guardStrength,
            guardAnim: guardAnimForHit(mv.guardAnim, pendingGroup),
          });
          this.debugProbe.guardClipFallback =
            reactClipId === 'block_stand' || reactClipId === 'block_crouch_loop';
          this.p2.applyBlockstun(br.blockstun, {
            crouching,
            reactClipId,
            // Rest is idle (not guard loop). crouch_block dummy still stands idle between hits.
            holdLoopClipId: 'idle',
          });
          if (this.opts.enableBlockPush && br.pushbackTotal !== 0) {
            let away: Facing = this.p1.facing;
            if (this.p2.x < this.p1.x) away = -1;
            else if (this.p2.x > this.p1.x) away = 1;
            const steps =
              mv.blockPushback && mv.blockPushback.length > 0
                ? mv.blockPushback.slice()
                : distributePushback(br.pushbackTotal, br.blockstun, {
                    moveTime: br.moveTime,
                    easePower: this.opts.blockPushEasePower,
                  });
            this.p2.queueBlockPush(steps, away);
          }
          this.lastHitResult = 'block';
          this.hitstopTimer = br.hitstop;
        } else {
          const hr = resolveHitOnHit(mv, {
            hitstopFramesOnHit: this.opts.hitstopFramesOnHit,
            hitstunOverride: this.opts.hitstunOverride,
            hitPushbackTotal: this.opts.hitPushbackTotal,
            knockdownFramesOverride: this.opts.knockdownFramesOverride,
          });
          const hitSel = selectHitReactLogicId({
            crouching,
            guard: level,
            hitstopOnHit: mv.hitstopOnHit,
            guardStrength: mv.guardStrength,
            hitAnim: hitAnimForHit(mv.hitAnim, pendingGroup),
            hitAnimDir: mv.hitAnimDir,
          });
          const reactClipId = hitSel.logicId;
          this.debugProbe.hitClipFallback = hitSel.fallback;
          this.debugProbe.lastHitClipId = reactClipId;
          this.debugProbe.lastHitReaction = hr.hitReaction;
          this.debugProbe.moveHitstun = hr.hitstun;
          this.debugProbe.moveKnockdownFrames = hr.knockdownFrames;
          this.p2.holdGuardLoopClipId = null;
          if (hr.hitReaction === 'knockdown') {
            this.p2.applyKnockdown(hr.knockdownFrames, {
              sweepClipId: 'kd_sweep',
              boundClipId: 'kd_bound',
              downClipId: 'kd_down_loop',
              riseClipId:
                this.dummy.wakeupStyle === 'back' ? 'kd_rise_back' : 'kd_rise_normal',
              backDx:
                this.dummy.wakeupStyle === 'back' ? this.opts.wakeupBackDxTotal : 0,
              downHoldOverride: this.opts.knockdownDownHoldOverride,
            });
          } else {
            this.p2.applyHitstun(hr.hitstun, hr.damage, { reactClipId });
          }
          if (this.opts.enableHitPush && hr.pushbackTotal !== 0) {
            let away: Facing = this.p1.facing;
            if (this.p2.x < this.p1.x) away = -1;
            else if (this.p2.x > this.p1.x) away = 1;
            const steps =
              mv.hitPushback && mv.hitPushback.length > 0
                ? mv.hitPushback.slice()
                : distributePushback(hr.pushbackTotal, hr.hitstun, {
                    moveTime: hr.moveTime,
                    easePower: this.opts.blockPushEasePower,
                  });
            if (hr.hitReaction === 'knockdown') {
              this.p2.addBlockPushFront(steps, away);
            } else {
              this.p2.queueBlockPush(steps, away);
            }
          }
          this.lastHitResult = 'hit';
          this.hitstopTimer = hr.hitstop;
        }
      }
    }

    this.markWhiffIfNeeded();

    // 7. Advance timelines (no Place here)
    const crouchHeld = heldPostureFromRelDir(input.relDir) === 'crouch';
    // §3.13.6: sample early crouch while air / landing hardstun
    if (crouchHeld) {
      this.p1.notePreLandCrouchHold();
    }
    const dashBack = this.p1.clipId === 'dash_back';
    const dashSpeed = dashBack ? this.opts.dashBackSpeed : this.opts.dashSpeed;
    const dashDx = dashBack ? this.opts.dashDxBack : this.opts.dashDxFwd;
    const adv = {
      airFrames: this.opts.airFrames,
      landingFrames: this.opts.landingFrames,
      dashSpeed,
      dashDx,
      applySelfMovement: this.opts.applySelfMovement,
      selfMovementScale: this.opts.selfMovementScale,
      jumpApex: this.opts.jumpApex,
      jumpFwdDist: this.opts.jumpFwdDist,
      jumpBackDist: this.opts.jumpBackDist,
      jumpNeutralDist: this.opts.jumpNeutralDist,
      landingAnimFrames: this.opts.landingAnimFrames,
      neutralLandToRiseIdleRatio: this.opts.neutralLandToRiseIdleRatio,
      neutralLandToRiseTurnRatio: this.opts.neutralLandToRiseTurnRatio,
      neutralRiseToTurnDissolveRatio: this.opts.neutralRiseToTurnDissolveRatio,
      crouchHeld,
    };
    if (!this.skipP1Advance) {
      this.p1.advance(adv);
    } else if (this.p1.jumpPhase === 'air') {
      this.p1.continueJumpArc(adv);
    }
    this.p2.advance(adv);
    this.syncP2GuardPresentation();
    // Residual Place frame tick after advance (same sample used this frame)
    if (this.p1.attackResidual) this.p1.tickAttackResidual();
    if (this.p2.attackResidual) this.p2.tickAttackResidual();

    this.syncDebugProbe();
  }

  private syncDebugProbe(): void {
    this.debugProbe.p1SelfDx = this.p1.lastSelfDx;
    this.debugProbe.p1BlockPushDx = this.p1.lastBlockPushDx;
    this.debugProbe.p2BlockPushDx = this.p2.lastBlockPushDx;
    this.debugProbe.p1Phase = this.p1.phase;
    this.debugProbe.p1ClipId = this.p1.clipId;
    this.debugProbe.p1AnimRole = this.p1.animRole;
    this.debugProbe.p1LocoPhase = this.p1.locoPhase;
    this.debugProbe.p1JumpPhase = this.p1.jumpPhase;
    this.debugProbe.p1Total = this.p1.mover.total;
    this.debugProbe.p1CanAct = this.p1.canAct();
    this.debugProbe.p1HasAttackResidual = this.p1.attackResidual != null;
    const tl = this.p1.getActionTimeline();
    this.debugProbe.p1ActionTimelineActive = tl != null;
    this.debugProbe.p1ActionTimelineFrame = tl?.frame ?? 0;
    this.debugProbe.p1TimelineFrame =
      this.p1.phase === 'attack' && this.p1.mover.move
        ? this.p1.mover.moveFrame
        : (this.p1.attackResidual?.frame ?? 0);
    const assembled = this.p1.assembleBoxes();
    this.debugProbe.p1StanceId = assembled.stanceId;
    this.debugProbe.p1HurtCount = assembled.hurt.length;
    this.debugProbe.p1HitCount = assembled.hit.length;
    const mid = this.p1.mover.move;
    this.debugProbe.reviewStatus = mid?.review?.status ?? '';
    this.debugProbe.hitstopTimer = this.hitstopTimer;
    this.debugProbe.lastHitResult = this.lastHitResult;
    this.debugProbe.forceP2Guard = this.opts.forceP2Guard;
    this.debugProbe.dummyGuardPolicy = this.dummy.guardPolicy;
    this.debugProbe.p2Phase = this.p2.phase;
    this.debugProbe.p2StunTimer = this.p2.stunTimer;
    this.debugProbe.p2ClipId = this.p2.clipId;
    this.debugProbe.p2KdPhase = this.p2.kdPhase;
    this.debugProbe.dummyWakeupStyle = this.dummy.wakeupStyle;
    this.debugProbe.p2Crouching = this.dummy.isCrouching() || this.p2.isHurtCrouching();
    this.debugProbe.frontFighterId =
      this.p1.lastAttackAcceptSeq >= this.p2.lastAttackAcceptSeq ? 'p1' : 'p2';
    this.debugProbe.catalogCount = this.catalog.size;
  }

  private syncP2GuardPresentation(): void {
    if (this.p2.phase === 'knockdown') return;
    if (this.p2.phase === 'blockstun') {
      const wantCrouch = this.dummy.isCrouching();
      if (wantCrouch !== this.p2.isHurtCrouching()) {
        this.p2.syncGuardHold(wantCrouch);
      }
      return;
    }
    if (this.dummy.guardPolicy === 'block_all' && this.p2.canAct()) {
      this.dummy.applyBlockAllStance('stand');
    }
    if (this.p2.canAct()) {
      this.p2.holdGuardLoopClipId = 'idle';
      this.p2.syncGuardIdleStance(false);
      if (
        this.p2.clipId.startsWith('block_') ||
        this.p2.clipId.startsWith('grd_')
      ) {
        this.p2.clipId = 'idle';
        this.p2.animRole = 'main';
      }
    }
  }

  markWhiffIfNeeded(): void {
    if (
      this.p1.phase === 'attack' &&
      !this.p1.mover.hasHitThisMove &&
      this.p1.mover.moveFrame > 0 &&
      this.p1.mover.move &&
      this.p1.mover.allHitWindowsPassed()
    ) {
      this.lastHitResult = 'whiff';
    }
  }

  snapshot(): MatchSnapshot {
    return {
      logicFrame: this.logicFrame,
      p1Phase: this.p1.phase,
      p2Phase: this.p2.phase,
      p1MoveId: this.p1.mover.moveId,
      p1MoveFrame: this.p1.mover.moveFrame,
      p1Total: this.p1.mover.total,
      activeHit: this.p1.mover.isHitActive(),
      cancelWindow: this.p1.mover.cancelSummary(),
      p1Hp: this.p1.hp,
      p2Hp: this.p2.hp,
      driveBars: this.drive.currentBars,
      dummyMode: this.dummy.mode,
      lastHitResult: this.lastHitResult,
      bufferDirs: this.history.formatDirs(),
      hitstopTimer: this.hitstopTimer,
      actionBuffer: this.actionBuffer.summary(this.logicFrame),
      lastIntent: `${this.lastIntent.kind}:${this.lastIntent.moveId ?? this.lastIntent.commandId ?? ''}`,
      relDir: this.pendingInput.relDir,
      pressed: this.pendingInput.pressed,
    };
  }
}
