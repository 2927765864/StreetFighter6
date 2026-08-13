import type { Box } from '../boxes/Box2D';
import {
  assembleWorldBoxes,
  type ActionTimeline,
} from '../boxes/BoxAssembly';
import type { MoveDefinition } from '../move/MoveDefinition';
import { inferTimelineFrames } from '../move/MoveDefinition';
import { MovePlayer } from '../move/MovePlayer';
import type {
  Facing,
  FighterPhase,
  JumpPhase,
  LocoPhase,
  NumpadDir,
} from '../types';
import {
  initialWalkState,
  type WalkState,
} from '../loco/WalkController';
import {
  clearStanceTo,
  DEFAULT_STANCE_FRAMES,
  initialStanceState,
  stanceClip,
  stepStanceHold,
  tickStance,
  type StanceFrameConfig,
  type StanceState,
} from '../loco/StanceController';
import {
  inferMoveStance,
  residualInterruptedByHeldPosture,
  type MoveStance,
} from '../anim/AnimResidual';
import type { StanceBoxTable } from '../../data/loadStanceBoxes';

/**
 * Post-total action timeline for Place / Hurt / Push (consensus §3.12).
 * Alias of action timeline residual (plan §2.3 / §6 migration note).
 */
export type AttackResidual = {
  move: MoveDefinition;
  /** Current sample frame on action timeline (starts at logic total). */
  frame: number;
  until: number;
};

export class Fighter {
  phase: FighterPhase = 'idle';
  x: number;
  y = 0;
  facing: Facing;
  /** Mesh / box flip. May lag logical `facing` until land (§3.14.2). */
  visualFacing: Facing;
  hp: number;
  stunTimer = 0;
  /** dash / prejump / air / landing timers */
  stateTimer = 0;
  dashDir: Facing = 1;
  readonly mover = new MovePlayer();
  clipId = 'idle';
  /** Presentation role for multi-clip maps (start/loop/end/prejump/air/land). */
  animRole = 'main';
  locoPhase: LocoPhase = 'none';
  locoFrame = 0;
  jumpPhase: JumpPhase = 'none';
  jumpFrame = 0;
  /** -1 back, 0 neutral, +1 forward (facing-relative). */
  jumpHorizSign: -1 | 0 | 1 = 0;
  /** World +X/−X locked at jump start; not remultiplied by live facing. */
  jumpWorldDir: -1 | 0 | 1 = 0;
  /** Logic id for jump clips: jump_n | jump_f | jump_b */
  jumpClipId: 'jump_n' | 'jump_f' | 'jump_b' = 'jump_n';
  walkState: WalkState = initialWalkState();
  /**
   * Remaining airborne frames when an air attack interrupts freefall.
   * Jump clock no longer pauses (§3.13); kept as debug/legacy mirror of stateTimer.
   */
  airTimeRemain = 0;
  /** True after any air attack this jump — blocks a second air normal (§3.13.3). */
  usedAirNormal = false;
  /** Playing TRN_STD / TRN_CRH after a logical turn (§3.14). */
  turning = false;
  turnFrame = 0;
  turnTotal = 70;
  /** Commit happened during landing — play turn after land clip if no attack. */
  pendingTurnAfterLand = false;
  /** Logic landing length (for residual tail). */
  private landLogicFrames = 3;
  /** glb/map frames for land residual; ≤ logic → no tail. */
  private landAnimFrameCount = 3;
  /** Last selfMovement dx applied (debug). */
  lastSelfDx = 0;
  /** Last block-push channel dx (debug). */
  lastBlockPushDx = 0;
  /**
   * After logic total ends: keep attack/dash clip on a 60Hz visual timeline until
   * animFrameCount or player interrupts (consensus §3.7.1, incl. dash residual).
   */
  animTail: {
    clipId: string;
    /** Current visual frame on full anim timeline (0-based). */
    visualFrame: number;
    animFrameCount: number;
    logicTotal: number;
    /** Posture family of the finished move (compatibility vs hold). */
    stance: MoveStance;
    /** Presentation role (land residual must stay `land`, not main). */
    animRole: string;
    /** Air-attack tail: keep flying; do not flip phase to idle. */
    holdAir?: boolean;
  } | null = null;
  /**
   * Attack Place + action-layer boxes after canAct (not dash).
   * Cleared by walk / new attack / dash / jump (§3.12 / plan clearActionTimeline).
   */
  attackResidual: AttackResidual | null = null;
  /**
   * Runtime stance box table (two-layer assembly). Set by MatchSim / boot.
   * When null, assembly uses single-body fallback with review warning path.
   */
  stanceTable: StanceBoxTable | null = null;
  /** Debug: force-clear action layer boxes without killing animTail. */
  debugClearActionBoxes = false;
  /** Queued per-frame |dx| for block pushback (applied along pushDir). */
  blockPushQueue: number[] = [];
  /** World X sign for remaining block push (defender moved this way). */
  blockPushDir: Facing = 1;
  /** Logic dash length for residual (set in startDash). */
  private dashLogicFrames = 0;
  /** glb/map frame count for dash residual; 0 = use logic only. */
  private dashAnimFrameCount = 0;
  /** Stand↔crouch transition machine (§3.7.2). */
  stanceState: StanceState = initialStanceState(false);
  stanceCfg: StanceFrameConfig = { ...DEFAULT_STANCE_FRAMES };

  constructor(
    public readonly id: string,
    x: number,
    facing: Facing,
    hp: number,
  ) {
    this.x = x;
    this.facing = facing;
    this.visualFacing = facing;
    this.hp = hp;
  }

  canAct(): boolean {
    return (
      this.phase === 'idle' ||
      this.phase === 'walk' ||
      this.phase === 'crouch'
    );
  }

  /** Jump normals while freefalling (not prejump/landing); one per jump. */
  canAirAct(): boolean {
    return this.phase === 'airborne' && !this.usedAirNormal;
  }

  /** Empty-jump landing frames 2–3: ground attacks / specials only (§3.13.4). */
  canLandingAttack(): boolean {
    return (
      this.phase === 'landing' &&
      !this.usedAirNormal &&
      this.jumpFrame >= 1
    );
  }

  canPrejumpSpecial(): boolean {
    return this.phase === 'prejump';
  }

  /** True while in the jump arc (freefall or air attack). */
  get airborne(): boolean {
    return (
      this.phase === 'airborne' ||
      (this.phase === 'attack' && this.jumpPhase === 'air') ||
      this.y > 0.05
    );
  }

  clearTurn(): void {
    this.turning = false;
    this.turnFrame = 0;
    this.pendingTurnAfterLand = false;
  }

  /** Snap mesh to logical facing (walk instant flip, start of turn clip, land-attack). */
  applyVisualFacing(): void {
    this.visualFacing = this.facing;
  }

  /**
   * Logical facing just changed (§3.14). Mesh stays until land if still airborne.
   */
  onLogicalTurn(): void {
    if (this.phase === 'walk') {
      this.clearTurn();
      this.applyVisualFacing();
      return;
    }
    if (
      this.phase === 'attack' ||
      this.phase === 'dash' ||
      this.phase === 'hitstun' ||
      this.phase === 'blockstun'
    ) {
      this.clearTurn();
      if (!this.airborne) this.applyVisualFacing();
      return;
    }
    if (this.airborne) {
      this.turning = false;
      this.turnFrame = 0;
      this.pendingTurnAfterLand = true;
      return;
    }
    if (this.phase === 'landing') {
      this.turning = false;
      this.turnFrame = 0;
      this.pendingTurnAfterLand = true;
      return;
    }
    this.beginTurnClip();
  }

  beginTurnClip(): void {
    const crouch =
      this.phase === 'crouch' || this.stanceState.logicalCrouch === true;
    this.turning = true;
    this.turnFrame = 0;
    this.turnTotal = crouch ? 65 : 70;
    this.pendingTurnAfterLand = false;
    this.applyVisualFacing();
    this.clipId = crouch ? 'turn_crh' : 'turn_std';
    this.animRole = 'main';
  }

  canSpecialCancel(enableCancel: boolean): boolean {
    if (!enableCancel) return false;
    if (this.phase !== 'attack' || !this.mover.move) return false;
    if (!this.mover.move.cancel.specialCancel) return false;
    return this.mover.inCancelWindow('special');
  }

  clearLoco(): void {
    this.walkState = initialWalkState();
    this.locoPhase = 'none';
    this.locoFrame = 0;
  }

  clearAnimTail(): void {
    this.animTail = null;
  }

  /** Clear attack Place residual + residual boxes (§3.12 walk/new action). */
  clearAttackResidual(): void {
    this.attackResidual = null;
  }

  /** Plan alias: clear action box/Place timeline (not animTail). */
  clearActionTimeline(): void {
    this.clearAttackResidual();
  }

  setStanceTable(table: StanceBoxTable | null): void {
    this.stanceTable = table;
  }

  /**
   * Action timeline pointer for box/Place sampling.
   * attack lock → moveFrame; post-total residual → residual.frame.
   */
  getActionTimeline(): ActionTimeline | null {
    if (this.debugClearActionBoxes) return null;
    if (this.phase === 'attack' && this.mover.move) {
      return { move: this.mover.move, frame: this.mover.moveFrame };
    }
    if (this.attackResidual) {
      return {
        move: this.attackResidual.move,
        frame: this.attackResidual.frame,
      };
    }
    return null;
  }

  get actionTimelineActive(): boolean {
    return this.getActionTimeline() != null;
  }

  clearBlockPush(): void {
    this.blockPushQueue = [];
    this.lastBlockPushDx = 0;
  }

  /**
   * Start residual attack timeline after logic total.
   * frame begins at total (first residual sample index).
   */
  beginAttackResidual(move: MoveDefinition, logicTotal: number): void {
    const until = inferTimelineFrames(move);
    if (until <= logicTotal) {
      this.attackResidual = null;
      return;
    }
    this.attackResidual = {
      move,
      frame: logicTotal,
      until,
    };
  }

  queueBlockPush(steps: number[], awayDir: Facing): void {
    this.blockPushQueue = steps.slice();
    this.blockPushDir = awayDir;
  }

  /**
   * Apply attack Place at current locked moveFrame (before advance).
   * Does not advance the frame counter.
   */
  applyAttackPlaceDisplacement(scale = 1): number {
    this.lastSelfDx = 0;
    if (this.phase !== 'attack' || !this.mover.move) return 0;
    const move = this.mover.move;
    const dx = (move.selfMovement?.[this.mover.moveFrame] ?? 0) * scale;
    const dy = (move.selfMovementY?.[this.mover.moveFrame] ?? 0) * scale;
    this.x += this.facing * dx;
    this.y += dy;
    this.lastSelfDx = dx;
    return dx;
  }

  /**
   * Residual Place after total (§3.12). Not used for dash residual.
   */
  applyAttackResidualDisplacement(scale = 1): number {
    this.lastSelfDx = 0;
    const r = this.attackResidual;
    if (!r) return 0;
    const dx = (r.move.selfMovement?.[r.frame] ?? 0) * scale;
    const dy = (r.move.selfMovementY?.[r.frame] ?? 0) * scale;
    this.x += this.facing * dx;
    this.y += dy;
    this.lastSelfDx = dx;
    return dx;
  }

  /** Advance residual timeline frame after displacement + collision for the frame. */
  tickAttackResidual(): void {
    const r = this.attackResidual;
    if (!r) return;
    r.frame += 1;
    if (r.frame >= r.until) {
      this.attackResidual = null;
    }
  }

  /** One frame of block push channel (hitstop already skipped by MatchSim). */
  applyBlockPushDisplacement(): number {
    this.lastBlockPushDx = 0;
    if (this.blockPushQueue.length === 0) return 0;
    const step = this.blockPushQueue.shift() ?? 0;
    const dx = this.blockPushDir * step;
    this.x += dx;
    this.lastBlockPushDx = dx;
    return dx;
  }

  setStanceConfig(cfg: Partial<StanceFrameConfig>): void {
    if (cfg.standToCrouchFrames != null) {
      this.stanceCfg.standToCrouchFrames = Math.max(1, cfg.standToCrouchFrames);
    }
    if (cfg.crouchToStandFrames != null) {
      this.stanceCfg.crouchToStandFrames = Math.max(1, cfg.crouchToStandFrames);
    }
  }

  clearStanceTransition(logicalCrouch?: boolean): void {
    this.stanceState = clearStanceTo(
      logicalCrouch ?? this.stanceState.logicalCrouch,
    );
  }

  /** True while stand_to_crouch / crouch_to_stand is scrubbing. */
  get inStanceTransition(): boolean {
    return this.stanceState.seg !== 'none';
  }

  /** True while presentation is finishing attack/dash clip after logic total. */
  get hasAnimTail(): boolean {
    return this.animTail != null;
  }

  private applyStancePresentation(): void {
    if (this.animTail) return;
    if (
      this.phase === 'walk' ||
      this.phase === 'attack' ||
      this.phase === 'dash' ||
      this.phase === 'prejump' ||
      this.phase === 'airborne' ||
      this.phase === 'landing' ||
      this.phase === 'hitstun' ||
      this.phase === 'blockstun'
    ) {
      return;
    }
    const c = stanceClip(this.stanceState);
    this.clipId = c.clipId;
    this.animRole = c.animRole;
    this.phase = this.stanceState.logicalCrouch ? 'crouch' : 'idle';
  }

  /**
   * Visual frame for attack scrub: moveFrame while locked; tail visualFrame after.
   * Consensus §3.7.1 shared 60Hz timeline.
   */
  attackVisualFrame(): number | null {
    if (this.phase === 'attack' && this.mover.move) {
      return this.mover.moveFrame;
    }
    if (this.animTail) return this.animTail.visualFrame;
    return null;
  }

  /**
   * Shared residual start for attack / dash (§3.7.1).
   * visualFrame starts at logicTotal (first residual sample).
   */
  private beginClipAnimTail(
    clipId: string,
    logicTotal: number,
    animFrameCount: number | null | undefined,
    stance: MoveStance,
    animRole: string = 'main',
  ): void {
    const total = Math.max(1, Math.floor(logicTotal));
    const animN = Math.max(
      total,
      animFrameCount != null && animFrameCount > 0
        ? Math.floor(animFrameCount)
        : total,
    );
    const crouch = stance === 'crouch';
    if (animN <= total) {
      this.animTail = null;
      this.stanceState = clearStanceTo(crouch);
      this.applyStancePresentation();
      return;
    }
    this.animTail = {
      clipId,
      visualFrame: total,
      animFrameCount: animN,
      logicTotal: total,
      stance,
      animRole,
    };
    this.clipId = clipId;
    this.animRole = animRole;
    this.stanceState = clearStanceTo(crouch);
    this.phase = crouch ? 'crouch' : 'idle';
  }

  /**
   * Air-attack residual: stay airborne, keep attack clip (§3.13.5).
   * Starts immediately at logic total (no table recovery wait); scrubs
   * total…animFrameCount−1. Missing animFrameCount → freeze last logic frame.
   */
  private beginAirAttackAnimTail(move: MoveDefinition): void {
    const total = Math.max(1, Math.floor(move.frames.total));
    let animN = total;
    if (move.animFrameCount != null && move.animFrameCount > 0) {
      animN = Math.max(total, Math.floor(move.animFrameCount));
    } else if (move.glbPath) {
      const m = /_f(\d+)(?:\.|$)/i.exec(move.glbPath);
      if (m) animN = Math.max(total, parseInt(m[1]!, 10));
    }
    this.animTail = {
      clipId: move.clipId,
      // First residual sample = first frame after locked segment
      visualFrame: total,
      animFrameCount: animN,
      logicTotal: total,
      stance: inferMoveStance(move),
      animRole: 'main',
      holdAir: true,
    };
    this.clipId = move.clipId;
    this.animRole = 'main';
  }

  private beginAnimTail(move: MoveDefinition): void {
    this.beginClipAnimTail(
      move.clipId,
      move.frames.total,
      move.animFrameCount,
      inferMoveStance(move),
    );
  }

  private beginDashAnimTail(): void {
    const logic = Math.max(1, this.dashLogicFrames);
    const anim =
      this.dashAnimFrameCount > 0 ? this.dashAnimFrameCount : logic;
    this.beginClipAnimTail(this.clipId, logic, anim, 'stand');
  }

  private beginLandAnimTail(): void {
    const logic = Math.max(1, this.landLogicFrames);
    this.beginClipAnimTail(
      this.jumpClipId,
      logic,
      this.landAnimFrameCount,
      'stand',
      'land',
    );
    if (!this.animTail) {
      this.phase = 'idle';
      if (this.pendingTurnAfterLand) {
        this.beginTurnClip();
      } else {
        this.clipId = 'idle';
        this.animRole = 'main';
      }
    }
    this.usedAirNormal = false;
  }

  /**
   * Advance one air-arc sample. Returns true if this sample lands.
   */
  tickJumpArc(opts: {
    airFrames: number;
    jumpApex?: number;
    jumpFwdDist?: number;
    jumpBackDist?: number;
    jumpNeutralDist?: number;
  }): boolean {
    const airTotal = Math.max(1, opts.airFrames);
    const i = this.jumpFrame;
    const t = (i + 0.5) / airTotal;
    const apex = opts.jumpApex ?? 2.115;
    this.y = 4 * apex * t * (1 - t);
    const dist =
      this.jumpHorizSign === 1
        ? (opts.jumpFwdDist ?? 1.9)
        : this.jumpHorizSign === -1
          ? (opts.jumpBackDist ?? 1.52)
          : (opts.jumpNeutralDist ?? 0);
    this.x += this.jumpWorldDir * (dist / airTotal);
    this.jumpFrame += 1;
    this.stateTimer -= 1;
    this.airTimeRemain = Math.max(0, this.stateTimer);
    return this.stateTimer <= 0;
  }

  /** Skip-advance frame still consumes jump clock during air attack. */
  continueJumpArc(opts: {
    airFrames: number;
    landingFrames: number;
    jumpApex?: number;
    jumpFwdDist?: number;
    jumpBackDist?: number;
    jumpNeutralDist?: number;
    landingAnimFrames?: number;
  }): void {
    if (this.jumpPhase !== 'air') return;
    if (this.tickJumpArc(opts)) {
      this.enterLanding(opts.landingFrames, opts.landingAnimFrames);
    }
  }

  private enterLanding(
    landingFrames: number,
    landingAnimFrames?: number,
  ): void {
    this.mover.move = null;
    this.clearAttackResidual();
    this.clearAnimTail();
    this.phase = 'landing';
    this.landLogicFrames = Math.max(1, landingFrames);
    this.stateTimer = this.landLogicFrames;
    this.jumpPhase = 'land';
    this.jumpFrame = 0;
    this.animRole = 'land';
    this.clipId = this.jumpClipId;
    this.y = 0;
    if (landingAnimFrames != null && landingAnimFrames > 0) {
      this.landAnimFrameCount = Math.floor(landingAnimFrames);
    }
  }

  /** Advance residual one logic tick; clear when done → stance idle clip. */
  private tickAnimTail(): void {
    if (!this.animTail) return;
    this.animTail.visualFrame += 1;
    if (this.animTail.visualFrame >= this.animTail.animFrameCount) {
      if (this.animTail.holdAir && this.jumpPhase === 'air') {
        this.animTail.visualFrame = this.animTail.animFrameCount - 1;
        this.clipId = this.animTail.clipId;
        this.animRole = this.animTail.animRole;
        return;
      }
      const st = this.animTail.stance;
      this.clearAnimTail();
      if (this.pendingTurnAfterLand && (this.phase === 'idle' || this.phase === 'crouch')) {
        this.beginTurnClip();
      } else if (this.phase === 'idle' || this.phase === 'crouch') {
        const crouch = st === 'crouch' || this.phase === 'crouch';
        this.stanceState = clearStanceTo(crouch);
        this.applyStancePresentation();
      }
    } else {
      this.clipId = this.animTail.clipId;
      this.animRole = this.animTail.animRole;
    }
  }

  /**
   * Posture / walk while canAct (§3.7.1 residual + §3.7.2 stance transition).
   */
  applyPostureOrWalkIntent(intent: 'none' | 'crouch' | 'walk'): void {
    if (!this.canAct()) return;

    if (intent === 'walk') {
      // §3.12 / plan: walk clears action timeline + residual Place
      this.clearActionTimeline();
      this.clearAnimTail();
      this.clearTurn();
      this.applyVisualFacing();
      this.stanceState = clearStanceTo(false);
      this.phase = 'walk';
      return;
    }

    const wantCrouch = intent === 'crouch';
    const held = wantCrouch ? 'crouch' : 'stand';

    // Leave walk before stance presentation. applyStancePresentation() no-ops
    // while phase===walk, which froze clip/role after mid-walk crouch.
    if (this.phase === 'walk') {
      this.clearLoco();
      this.phase = this.stanceState.logicalCrouch ? 'crouch' : 'idle';
    }

    if (this.animTail) {
      if (!residualInterruptedByHeldPosture(this.animTail.stance, held)) {
        this.clearLoco();
        this.stanceState = clearStanceTo(wantCrouch);
        this.phase = wantCrouch ? 'crouch' : 'idle';
        this.clipId = this.animTail.clipId;
        this.animRole = 'main';
        return;
      }
      // Stance conflict: drop residual, then open transition
      this.clearAnimTail();
    }

    this.clearLoco();
    this.stanceState = stepStanceHold(
      this.stanceState,
      wantCrouch,
      this.stanceCfg,
    );
    this.applyStancePresentation();
  }

  startMove(move: MoveDefinition): void {
    const onJumpArc =
      this.jumpPhase === 'air' &&
      (this.phase === 'airborne' || this.phase === 'attack');
    if (onJumpArc) {
      this.usedAirNormal = true;
      this.airTimeRemain = Math.max(0, this.stateTimer);
    } else {
      this.airTimeRemain = 0;
      this.jumpPhase = 'none';
    }
    this.clearAnimTail();
    this.clearAttackResidual();
    this.clearBlockPush();
    this.stanceState = clearStanceTo(false);
    this.phase = 'attack';
    this.mover.start(move);
    this.clipId = move.clipId;
    this.animRole = 'main';
    if (!onJumpArc) {
      this.stateTimer = 0;
    }
    this.clearLoco();
    this.clearTurn();
    if (!onJumpArc) this.applyVisualFacing();
    this.lastSelfDx = 0;
  }

  /**
   * @param frames logic dash length (19/23) — displacement & canAct gate
   * @param animFrameCount glb/map frames for residual; omit/≤frames → no residual
   */
  startDash(fwd: boolean, frames: number, animFrameCount?: number): void {
    this.clearAnimTail();
    this.clearAttackResidual();
    this.clearBlockPush();
    this.stanceState = clearStanceTo(false);
    this.phase = 'dash';
    const logic = Math.max(1, Math.floor(frames));
    this.stateTimer = logic;
    this.dashLogicFrames = logic;
    this.dashAnimFrameCount =
      animFrameCount != null && animFrameCount > 0
        ? Math.floor(animFrameCount)
        : logic;
    this.dashDir = (fwd ? this.facing : ((-this.facing) as Facing));
    this.mover.move = null;
    this.clipId = fwd ? 'dash_fwd' : 'dash_back';
    this.animRole = 'main';
    this.airTimeRemain = 0;
    this.clearLoco();
    this.jumpPhase = 'none';
    this.usedAirNormal = false;
    this.clearTurn();
  }

  /**
   * Neutral prejump → diagonal until first airborne frame (§3.13.1).
   * Diagonal cannot convert back to neutral.
   */
  retargetJump(relDir: NumpadDir): boolean {
    if (this.phase !== 'prejump' || this.jumpClipId !== 'jump_n') return false;
    if (relDir === 9 || relDir === 3) {
      this.jumpHorizSign = 1;
      this.jumpClipId = 'jump_f';
    } else if (relDir === 7 || relDir === 1) {
      this.jumpHorizSign = -1;
      this.jumpClipId = 'jump_b';
    } else {
      return false;
    }
    this.clipId = this.jumpClipId;
    this.animRole = 'prejump';
    this.lockJumpWorldDir();
    return true;
  }

  private lockJumpWorldDir(): void {
    if (this.jumpHorizSign === 0) {
      this.jumpWorldDir = 0;
    } else {
      this.jumpWorldDir = (this.facing * this.jumpHorizSign) as -1 | 1;
    }
  }

  /**
   * @param relDir facing-relative numpad at jump press (7/8/9)
   */
  startJump(
    prejumpFrames: number,
    relDir: NumpadDir = 8,
    landAnimFrames?: number,
  ): void {
    this.clearAnimTail();
    this.clearAttackResidual();
    this.clearBlockPush();
    this.stanceState = clearStanceTo(false);
    this.phase = 'prejump';
    this.stateTimer = prejumpFrames;
    this.jumpFrame = 0;
    this.jumpPhase = 'prejump';
    this.mover.move = null;
    this.airTimeRemain = 0;
    this.usedAirNormal = false;
    this.clearLoco();
    this.clearTurn();
    if (relDir === 9 || relDir === 3) {
      this.jumpHorizSign = 1;
      this.jumpClipId = 'jump_f';
    } else if (relDir === 7 || relDir === 1) {
      this.jumpHorizSign = -1;
      this.jumpClipId = 'jump_b';
    } else {
      this.jumpHorizSign = 0;
      this.jumpClipId = 'jump_n';
    }
    this.clipId = this.jumpClipId;
    this.animRole = 'prejump';
    this.y = 0;
    this.lockJumpWorldDir();
    if (landAnimFrames != null && landAnimFrames > 0) {
      this.landAnimFrameCount = Math.floor(landAnimFrames);
    }
  }

  applyHitstun(frames: number, damage: number): void {
    this.clearAnimTail();
    this.clearAttackResidual();
    this.clearBlockPush();
    this.stanceState = clearStanceTo(false);
    this.phase = 'hitstun';
    this.stunTimer = frames;
    this.hp = Math.max(0, this.hp - damage);
    this.mover.move = null;
    this.clipId = 'hitstun_light';
    this.animRole = 'main';
    this.stateTimer = 0;
    this.airTimeRemain = 0;
    this.clearLoco();
    this.jumpPhase = 'none';
    this.usedAirNormal = false;
    this.clearTurn();
    this.applyVisualFacing();
    this.y = 0;
  }

  applyBlockstun(frames: number): void {
    this.clearAnimTail();
    this.clearAttackResidual();
    // block push queue is set by MatchSim after this call
    this.stanceState = clearStanceTo(false);
    this.phase = 'blockstun';
    this.stunTimer = frames;
    this.mover.move = null;
    this.clipId = 'block_stand';
    this.animRole = 'main';
    this.stateTimer = 0;
    this.airTimeRemain = 0;
    this.clearLoco();
    this.jumpPhase = 'none';
    this.usedAirNormal = false;
    this.clearTurn();
    this.applyVisualFacing();
    this.y = 0;
  }

  /**
   * Advance one logic frame (skipped during hitstop by MatchSim).
   * Attack Place displacement is applied by MatchSim before push/hit
   * (consensus §4.4 order) — not here.
   */
  advance(opts: {
    airFrames: number;
    landingFrames: number;
    /** Fallback average step if dashDx missing. */
    dashSpeed: number;
    /** Per-frame |dx| for current dash (front-heavy profile). */
    dashDx?: number[];
    applySelfMovement?: boolean;
    selfMovementScale?: number;
    jumpApex?: number;
    jumpFwdDist?: number;
    jumpBackDist?: number;
    jumpNeutralDist?: number;
    landingAnimFrames?: number;
  }): void {
    if (this.phase === 'attack') {
      if (this.jumpPhase === 'air') {
        if (this.tickJumpArc(opts)) {
          this.enterLanding(opts.landingFrames, opts.landingAnimFrames);
          return;
        }
      }
      const move = this.mover.move;
      const finished = this.mover.advance();
      if (finished) {
        if (this.jumpPhase === 'air' && this.stateTimer > 0) {
          this.clearAttackResidual();
          this.phase = 'airborne';
          this.airTimeRemain = this.stateTimer;
          if (move) {
            this.beginAirAttackAnimTail(move);
          } else {
            this.clipId = this.jumpClipId;
            this.animRole = 'air';
          }
        } else {
          this.phase = 'idle';
          this.y = 0;
          if (move) {
            this.beginAnimTail(move);
            this.beginAttackResidual(move, move.frames.total);
          } else {
            this.clipId = 'idle';
            this.animRole = 'main';
          }
        }
      }
      return;
    }
    if (this.phase === 'hitstun' || this.phase === 'blockstun') {
      this.stunTimer -= 1;
      if (this.stunTimer <= 0) {
        this.phase = 'idle';
        this.clipId = 'idle';
        this.animRole = 'main';
        this.stunTimer = 0;
      }
      return;
    }
    if (this.phase === 'dash') {
      // Frame index 0..N-1 while stateTimer counts N..1 (A=B movement window)
      const total = Math.max(1, this.dashLogicFrames);
      const fi = Math.min(
        total - 1,
        Math.max(0, total - this.stateTimer),
      );
      const table = opts.dashDx;
      const step =
        table && table.length > 0
          ? (table[fi] ?? table[table.length - 1] ?? opts.dashSpeed)
          : opts.dashSpeed;
      this.x += this.dashDir * step;
      this.lastSelfDx = this.dashDir * step;
      this.stateTimer -= 1;
      this.jumpFrame = 0;
      // Logic dash ends: canAct + stop displacement; optional anim residual
      if (this.stateTimer <= 0) {
        this.phase = 'idle';
        this.y = 0;
        this.beginDashAnimTail();
      }
      return;
    }
    if (this.phase === 'prejump') {
      this.jumpFrame += 1;
      this.stateTimer -= 1;
      this.animRole = 'prejump';
      this.clipId = this.jumpClipId;
      this.y = 0;
      if (this.stateTimer <= 0) {
        this.phase = 'airborne';
        this.stateTimer = opts.airFrames;
        this.jumpPhase = 'air';
        this.jumpFrame = 0;
        this.animRole = 'air';
      }
      return;
    }
    if (this.phase === 'airborne') {
      if (this.animTail?.holdAir) {
        this.tickAnimTail();
      }
      if (this.tickJumpArc(opts)) {
        this.enterLanding(opts.landingFrames, opts.landingAnimFrames);
      } else if (!this.animTail?.holdAir) {
        this.animRole = 'air';
        this.clipId = this.jumpClipId;
      }
      return;
    }
    if (this.phase === 'landing') {
      this.jumpFrame += 1;
      this.stateTimer -= 1;
      this.y = 0;
      this.animRole = 'land';
      this.clipId = this.jumpClipId;
      if (this.stateTimer <= 0) {
        this.jumpPhase = 'none';
        this.jumpFrame = 0;
        this.beginLandAnimTail();
      }
      return;
    }

    // Idle / crouch: residual first, else turn clip, else stance transition
    if (this.phase === 'idle' || this.phase === 'crouch') {
      if (this.animTail) {
        this.tickAnimTail();
      } else if (this.turning) {
        this.turnFrame += 1;
        this.clipId =
          this.phase === 'crouch' || this.stanceState.logicalCrouch
            ? 'turn_crh'
            : 'turn_std';
        this.animRole = 'main';
        if (this.turnFrame >= this.turnTotal) {
          this.clearTurn();
          this.applyStancePresentation();
        }
      } else if (this.stanceState.seg !== 'none') {
        this.stanceState = tickStance(this.stanceState);
        this.applyStancePresentation();
      }
    }
  }

  /**
   * Whether hurt/push should use crouch stance base.
   * Derived from phase + stance machine (callers should not need to pass flags).
   */
  isHurtCrouching(): boolean {
    return (
      this.phase === 'crouch' ||
      this.stanceState.logicalCrouch === true
    );
  }

  /** World-space boxes via two-layer assembly (plan §2.4). */
  worldHurtBoxes(crouch?: boolean): Box[] {
    return assembleWorldBoxes(
      this.boxState(crouch),
      this.stanceTable,
      crouch ?? this.isHurtCrouching(),
    ).hurt;
  }

  worldHitBoxes(): Box[] {
    return assembleWorldBoxes(this.boxState(), this.stanceTable).hit;
  }

  worldPushBoxes(crouch?: boolean): Box[] {
    return assembleWorldBoxes(
      this.boxState(crouch),
      this.stanceTable,
      crouch ?? this.isHurtCrouching(),
    ).push;
  }

  /** Debug / GUI: full assembly snapshot. */
  assembleBoxes(crouch?: boolean) {
    return assembleWorldBoxes(
      this.boxState(crouch),
      this.stanceTable,
      crouch ?? this.isHurtCrouching(),
    );
  }

  private boxState(crouchOverride?: boolean) {
    const seg = this.stanceState.seg;
    const stanceTransition =
      seg === 'to_crouch'
        ? {
            role: 'stand_to_crouch' as const,
            frame: this.stanceState.frame,
          }
        : seg === 'to_stand'
          ? {
              role: 'crouch_to_stand' as const,
              frame: this.stanceState.frame,
            }
          : null;
    return {
      x: this.x,
      y: this.y,
      facing: this.visualFacing,
      phase: this.phase,
      hasActiveMove: this.mover.move != null,
      logicalCrouch: this.stanceState.logicalCrouch,
      crouchOverride:
        crouchOverride === undefined ? undefined : crouchOverride,
      stanceTransition,
      getActionTimeline: () => this.getActionTimeline(),
    };
  }

  setIdleWalk(clip: 'idle' | 'walk' | 'crouch'): void {
    if (!this.canAct()) return;
    this.applyPostureOrWalkIntent(
      clip === 'walk' ? 'walk' : clip === 'crouch' ? 'crouch' : 'none',
    );
  }

  /** Sync public loco fields from walkState after WalkController step. */
  applyWalkState(ws: WalkState): void {
    this.walkState = ws;
    this.locoPhase = ws.locoPhase;
    this.locoFrame = ws.locoFrame;
    if (ws.locoPhase === 'none') {
      // Walk ended — posture re-applied next frame via MatchSim intent
      this.stanceState = clearStanceTo(false);
      this.phase = 'idle';
      this.clearAnimTail();
      this.applyStancePresentation();
    } else {
      this.clearAttackResidual();
      this.clearAnimTail();
      this.stanceState = clearStanceTo(false);
      this.phase = 'walk';
      this.clipId = ws.clipId;
      this.animRole = ws.animRole;
    }
  }
}
