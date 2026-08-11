import { DEFAULT_HP, DRIVE_MAX } from '../../config/constants';
import { hitOverlapsHurt } from '../boxes/Collision';
import type { MoveDefinition } from '../move/MoveDefinition';
import { cloneMove } from '../move/MoveDefinition';
import { MoveCatalog } from '../move/MoveCatalog';
import { Fighter } from '../fighter/Fighter';
import { InputHistory } from '../input/InputHistory';
import { ActionBuffer } from '../input/ActionBuffer';
import { toFacingRelative } from '../input/facing';
import { resolveIntent } from '../command/IntentResolver';
import { DriveStub } from '../systems/DriveStub';
import type { HitResult, InputSample, Intent } from '../types';
import { DummyController } from './DummyController';
import { stepWalk } from '../loco/WalkController';
import type { RyuMovementTable } from '../../data/loadRyuMovement';
import { parseRyuMovement } from '../../data/loadRyuMovement';

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
  applySelfMovement: boolean;
  selfMovementScale: number;
  standToCrouchFrames: number;
  crouchToStandFrames: number;
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
  enableActionBuffer: true,
  dashFrames: 19,
  dashBackFrames: 23,
  dashSpeed: 1.252 / 19,
  dashBackSpeed: 0.923 / 23,
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
  applySelfMovement: true,
  selfMovementScale: 1,
  standToCrouchFrames: 60,
  crouchToStandFrames: 38,
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
    catalogCount: 0,
    lastMoveMiss: '',
    lastExecuteOk: false,
    logCommandsToConsole: false,
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
    this.move5lp = cloneMove(move5lp);
    this.catalog = catalog ?? MoveCatalog.fromMoves([this.move5lp]);
    if (!this.catalog.has(this.move5lp.id)) {
      this.catalog.register(this.move5lp);
    }
    this.history = new InputHistory(this.opts.motionHistoryCapacity);
    this.p1 = new Fighter('p1', -1.2, 1, DEFAULT_HP);
    this.p2 = new Fighter('p2', 1.2, -1, DEFAULT_HP);
    this.debugProbe.catalogCount = this.catalog.size;
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
    this.lastHitResult = 'none';
    this.logicFrame = 0;
    this.hitstopTimer = 0;
    this.actionBuffer.clear();
    this.history.clear();
    this.drive.setBars(DRIVE_MAX);
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

  private canExecute(intent: Intent): boolean {
    if (intent.kind === 'none' || intent.kind === 'walk' || intent.kind === 'crouch') {
      return this.p1.canAct();
    }
    if (intent.kind === 'special') {
      return (
        this.p1.canAct() || this.p1.canSpecialCancel(this.opts.enableCancel)
      );
    }
    if (intent.kind === 'normal' || intent.kind === 'throw') {
      // Jump normals: airborne only (plan S5 / consensus airborne)
      if (intent.airOnly) return this.p1.canAirAct();
      return this.p1.canAct();
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
      this.p1.startDash(true, this.opts.dashFrames);
      this.actionBuffer.clear();
      this.skipP1Advance = true;
      return true;
    }
    if (intent.kind === 'dash_back') {
      this.p1.startDash(false, this.opts.dashBackFrames);
      this.actionBuffer.clear();
      this.skipP1Advance = true;
      return true;
    }
    if (intent.kind === 'jump') {
      const last = this.history.latest();
      const rel = last?.relDir ?? 8;
      this.p1.startJump(this.opts.prejumpFrames, rel);
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

  step(): void {
    this.logicFrame += 1;
    this.skipP1Advance = false;

    // Face first so relDir is correct for motion matching (CritPoints facing).
    if (this.p1.x <= this.p2.x) {
      this.p1.facing = 1;
      this.p2.facing = -1;
    } else {
      this.p1.facing = -1;
      this.p2.facing = 1;
    }

    const input = { ...this.pendingInput };
    input.relDir = toFacingRelative(input.dir, this.p1.facing);
    this.pendingInput = input;
    this.history.push(input, this.logicFrame);

    const resolveCfg = {
      motionStepGapMax: this.opts.motionStepGapMax,
      dashDirHoldMax: this.opts.dashDirHoldMax,
      dashNeutralMax: this.opts.dashNeutralMax,
    };

    let intent = resolveIntent(this.history.entries(), this.logicFrame, resolveCfg, {
      phase: this.p1.phase,
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
    if (this.p1.canAct() && this.p1.phase !== 'attack') {
      this.p1.setStanceConfig({
        standToCrouchFrames: this.opts.standToCrouchFrames,
        crouchToStandFrames: this.opts.crouchToStandFrames,
      });
      if (intent.kind === 'crouch') {
        this.p1.applyPostureOrWalkIntent('crouch');
      } else if (intent.kind === 'walk') {
        this.p1.applyPostureOrWalkIntent('walk');
        this.stepWalkLocomotion(true);
      } else if (intent.kind === 'none') {
        // Finish walk end segment if needed
        if (
          this.p1.locoPhase === 'start' ||
          this.p1.locoPhase === 'loop' ||
          this.p1.locoPhase === 'end'
        ) {
          this.stepWalkLocomotion(false);
        } else {
          this.p1.applyPostureOrWalkIntent('none');
        }
      }
    }

    // Hitstop: still accept input above; skip combat frame advance
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= 1;
      return;
    }

    // Collision (throws: presentation only — no grab resolve this slice)
    if (
      this.p1.phase === 'attack' &&
      this.p1.mover.isHitActive() &&
      !this.p1.mover.hasHitThisMove &&
      this.p1.mover.move?.clipId !== 'throw_fwd' &&
      this.p1.mover.move?.clipId !== 'throw_back'
    ) {
      const hits = this.p1.worldHitBoxes();
      const hurts = this.p2.worldHurtBoxes(this.dummy.isCrouching());
      let overlapped = false;
      for (const h of hits) {
        for (const u of hurts) {
          if (hitOverlapsHurt(h, u)) {
            overlapped = true;
            break;
          }
        }
        if (overlapped) break;
      }
      if (overlapped) {
        this.p1.mover.hasHitThisMove = true;
        const mv = this.p1.mover.move ?? this.move5lp;
        if (this.dummy.isBlocking()) {
          this.p2.applyBlockstun(mv.blockstun);
          this.lastHitResult = 'block';
          this.hitstopTimer = this.opts.hitstopFramesOnBlock;
        } else {
          this.p2.applyHitstun(mv.hitstun, mv.damage);
          this.lastHitResult = 'hit';
          this.hitstopTimer = this.opts.hitstopFramesOnHit;
        }
      }
    }

    this.markWhiffIfNeeded();

    const dashSpeed =
      this.p1.phase === 'dash' && this.p1.clipId === 'dash_back'
        ? this.opts.dashBackSpeed
        : this.opts.dashSpeed;
    const adv = {
      airFrames: this.opts.airFrames,
      landingFrames: this.opts.landingFrames,
      dashSpeed,
      applySelfMovement: this.opts.applySelfMovement,
      selfMovementScale: this.opts.selfMovementScale,
      jumpApex: this.opts.jumpApex,
      jumpFwdDist: this.opts.jumpFwdDist,
      jumpBackDist: this.opts.jumpBackDist,
      jumpNeutralDist: this.opts.jumpNeutralDist,
    };
    if (!this.skipP1Advance) {
      this.p1.advance(adv);
    }
    this.p2.advance(adv);
    this.debugProbe.p1SelfDx = this.p1.lastSelfDx;
  }

  markWhiffIfNeeded(): void {
    if (
      this.p1.phase === 'attack' &&
      !this.p1.mover.isHitActive() &&
      !this.p1.mover.hasHitThisMove &&
      this.p1.mover.moveFrame > 0 &&
      this.p1.mover.move
    ) {
      const { startup, active } = this.p1.mover.move.frames;
      if (this.p1.mover.moveFrame >= startup - 1 + active) {
        this.lastHitResult = 'whiff';
      }
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
