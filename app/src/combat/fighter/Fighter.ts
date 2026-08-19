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
  beginToStand,
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
  /**
   * Crouch was held during air / landing recovery (§3.13.6 early hold).
   * Consumed when leaving landing hardstun.
   */
  preLandCrouchHold = false;
  /**
   * §3.13.7 neutral land: dissolve land → crouch_to_stand after ratio hold.
   * Cleared on early crouch or when leave landing / open presentation.
   */
  neutralLandSnap = false;
  /** True once mid-land opened crouch_to_stand for this landing (§3.13.7). */
  private neutralLandRiseStarted = false;
  /**
   * Land → crouch_to_stand start ratio when not pending turn (§3.13.7 → idle).
   */
  neutralLandToRiseIdleRatio = 0.05;
  /**
   * Land → crouch_to_stand start ratio when pending turn (§3.13.7 → turn).
   */
  neutralLandToRiseTurnRatio = 0.05;
  /**
   * Crouch_to_stand → turn_std start ratio (pending turn only; §3.13.7).
   * Relative to crouchToStandFrames. Default 1 = full rise first.
   */
  neutralRiseToTurnDissolveRatio = 1;
  /** Frames elapsed in landing since enterLanding (for land→rise gate). */
  private landSnapAge = 0;
  /** Frames elapsed since crouch_to_stand opened (for rise→turn gate). */
  private landRiseAge = 0;
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

  /** Sample crouch hold while airborne / landing (§3.13.6 early). */
  notePreLandCrouchHold(): void {
    if (
      this.phase === 'airborne' ||
      this.phase === 'landing' ||
      this.phase === 'prejump' ||
      (this.phase === 'attack' && this.jumpPhase === 'air')
    ) {
      this.preLandCrouchHold = true;
    }
  }

  /** Snap mesh to logical facing (walk instant flip, start of turn clip, land-attack). */
  applyVisualFacing(): void {
    this.visualFacing = this.facing;
  }

  /** Instant crouch loop: no stand→crouch transition (§3.13.6). */
  private enterCrouchLoopInstant(opts: { flipVisual: boolean }): void {
    this.clearAnimTail();
    this.clearTurn();
    if (opts.flipVisual) this.applyVisualFacing();
    this.stanceState = clearStanceTo(true);
    this.phase = 'crouch';
    this.clipId = 'crouch';
    this.animRole = 'main';
  }

  /**
   * Early crouch at land hardstun end: skip land residual; crouch loop or crouch-turn.
   */
  private enterEarlyLandCrouch(): void {
    this.clearAnimTail();
    this.stanceState = clearStanceTo(true);
    this.phase = 'crouch';
    if (this.pendingTurnAfterLand) {
      this.beginTurnClip();
    } else {
      this.clipId = 'crouch';
      this.animRole = 'main';
    }
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

  private clamp01(n: number): number {
    return Math.min(1, Math.max(0, n));
  }

  /**
   * Hold land this many logic frames before land→crouch_to_stand dissolve.
   * Uses idle-path or turn-path ratio depending on pendingTurnAfterLand.
   */
  private landToRiseDelayFrames(): number {
    const ratio = this.clamp01(
      this.pendingTurnAfterLand
        ? this.neutralLandToRiseTurnRatio
        : this.neutralLandToRiseIdleRatio,
    );
    const landLen = Math.max(1, this.landAnimFrameCount);
    return Math.floor(landLen * ratio);
  }

  /**
   * Hold crouch_to_stand this many frames before rise→turn dissolve.
   * delay = floor(crouchToStandFrames * clamp(ratio, 0, 1)).
   */
  private riseToTurnDelayFrames(): number {
    const ratio = this.clamp01(this.neutralRiseToTurnDissolveRatio);
    const riseLen = Math.max(1, this.stanceCfg.crouchToStandFrames);
    return Math.floor(riseLen * ratio);
  }

  private applyNeutralLandRatioOpts(opts: {
    neutralLandToRiseIdleRatio?: number;
    neutralLandToRiseTurnRatio?: number;
    neutralRiseToTurnDissolveRatio?: number;
  }): void {
    if (
      opts.neutralLandToRiseIdleRatio != null &&
      Number.isFinite(opts.neutralLandToRiseIdleRatio)
    ) {
      this.neutralLandToRiseIdleRatio = this.clamp01(
        opts.neutralLandToRiseIdleRatio,
      );
    }
    if (
      opts.neutralLandToRiseTurnRatio != null &&
      Number.isFinite(opts.neutralLandToRiseTurnRatio)
    ) {
      this.neutralLandToRiseTurnRatio = this.clamp01(
        opts.neutralLandToRiseTurnRatio,
      );
    }
    if (
      opts.neutralRiseToTurnDissolveRatio != null &&
      Number.isFinite(opts.neutralRiseToTurnDissolveRatio)
    ) {
      this.neutralRiseToTurnDissolveRatio = this.clamp01(
        opts.neutralRiseToTurnDissolveRatio,
      );
    }
  }

  /** Present crouch_to_stand clip without leaving current phase. */
  private presentCrouchToStand(): void {
    this.clipId = 'crouch';
    this.animRole = 'crouch_to_stand';
  }

  /**
   * §3.13.7: open / advance crouch_to_stand.
   * Pending-turn path may finish early via neutralRiseToTurnDissolveRatio.
   * Returns true when rise segment is done (hand off to idle or turn).
   */
  private tickNeutralLandRisePresentation(): boolean {
    if (!this.neutralLandRiseStarted) {
      this.stanceState = beginToStand(this.stanceCfg);
      this.neutralLandRiseStarted = true;
      this.landRiseAge = 0;
      this.presentCrouchToStand();
      if (
        this.pendingTurnAfterLand &&
        this.landRiseAge >= this.riseToTurnDelayFrames()
      ) {
        return true;
      }
      return false;
    }

    if (
      this.pendingTurnAfterLand &&
      this.landRiseAge >= this.riseToTurnDelayFrames()
    ) {
      return true;
    }

    if (this.stanceState.seg === 'to_stand') {
      this.stanceState = tickStance(this.stanceState);
      if (this.stanceState.seg === 'to_stand') {
        this.presentCrouchToStand();
        this.landRiseAge += 1;
        return false;
      }
      return true;
    }
    return false;
  }

  /**
   * After crouch_to_stand: idle or stand-turn presentation only.
   * Keeps current phase unless opening stand-turn (must not use crouch turn).
   */
  private presentNeutralLandIdleOrTurn(): void {
    if (this.pendingTurnAfterLand || this.turning) {
      // Neutral land rise always hands off to stand-turn, not crouch-turn.
      this.stanceState = clearStanceTo(false);
      if (this.phase === 'crouch') this.phase = 'idle';
      if (!this.turning) this.beginTurnClip();
      return;
    }
    this.stanceState = clearStanceTo(false);
    this.clipId = 'idle';
    this.animRole = 'main';
    // Leave crouch phase after neutral rise; keep landing hardstun phase intact.
    if (this.phase === 'crouch') this.phase = 'idle';
  }

  /**
   * After hardstun: continue rise, or idle / stand-turn if rise already done.
   */
  private finishNeutralLandAfterHardstun(): void {
    this.clearAnimTail();
    this.neutralLandSnap = false;

    if (!this.neutralLandRiseStarted) {
      this.stanceState = beginToStand(this.stanceCfg);
      this.neutralLandRiseStarted = true;
      this.landRiseAge = 0;
      this.phase = 'crouch';
      this.presentCrouchToStand();
      if (
        this.pendingTurnAfterLand &&
        this.landRiseAge >= this.riseToTurnDelayFrames()
      ) {
        this.phase = 'idle';
        this.stanceState = clearStanceTo(false);
        if (!this.turning) this.beginTurnClip();
      }
      return;
    }

    if (this.stanceState.seg === 'to_stand') {
      // May early-exit to turn via rise→turn ratio.
      if (
        this.pendingTurnAfterLand &&
        this.landRiseAge >= this.riseToTurnDelayFrames()
      ) {
        this.phase = 'idle';
        this.stanceState = clearStanceTo(false);
        if (!this.turning) this.beginTurnClip();
        return;
      }
      this.phase = 'crouch';
      this.presentCrouchToStand();
      return;
    }

    this.phase = 'idle';
    if (this.pendingTurnAfterLand) {
      this.stanceState = clearStanceTo(false);
      if (!this.turning) this.beginTurnClip();
    } else if (this.turning) {
      this.phase =
        this.clipId === 'turn_crh' || this.stanceState.logicalCrouch
          ? 'crouch'
          : 'idle';
    } else {
      this.stanceState = clearStanceTo(false);
      this.clipId = 'idle';
      this.animRole = 'main';
    }
  }

  private beginLandAnimTail(crouchHeld = false): void {
    const earlyCrouch = this.preLandCrouchHold && crouchHeld;
    this.preLandCrouchHold = false;
    this.usedAirNormal = false;

    if (earlyCrouch) {
      this.neutralLandSnap = false;
      this.neutralLandRiseStarted = false;
      this.landRiseAge = 0;
      this.enterEarlyLandCrouch();
      return;
    }

    // §3.13.7: if dissolve delay still remaining after hardstun, brief land hold (canAct).
    // Continue the same 60Hz land timeline — do not rewind visualFrame to 0.
    const delay = this.landToRiseDelayFrames();
    const landFrame = Math.max(this.jumpFrame, this.landSnapAge);
    if (
      this.neutralLandSnap &&
      !this.neutralLandRiseStarted &&
      landFrame < delay &&
      !this.turning
    ) {
      this.phase = 'idle';
      this.stanceState = clearStanceTo(false);
      // visualFrame already advanced through hardstun; stop at delay
      this.animTail = {
        clipId: this.jumpClipId,
        visualFrame: landFrame,
        animFrameCount: delay,
        logicTotal: 0,
        stance: 'stand',
        animRole: 'land',
      };
      this.clipId = this.jumpClipId;
      this.animRole = 'land';
      this.neutralLandSnap = false;
      return;
    }

    this.finishNeutralLandAfterHardstun();
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
    neutralLandToRiseIdleRatio?: number;
    neutralLandToRiseTurnRatio?: number;
    neutralRiseToTurnDissolveRatio?: number;
    crouchHeld?: boolean;
  }): void {
    if (this.jumpPhase !== 'air') return;
    if (this.tickJumpArc(opts)) {
      this.enterLanding(opts.landingFrames, opts.landingAnimFrames, opts);
    }
  }

  private enterLanding(
    landingFrames: number,
    landingAnimFrames?: number,
    ratioOpts?: {
      neutralLandToRiseIdleRatio?: number;
      neutralLandToRiseTurnRatio?: number;
      neutralRiseToTurnDissolveRatio?: number;
    },
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
    if (ratioOpts) this.applyNeutralLandRatioOpts(ratioOpts);
    this.landSnapAge = 0;
    this.landRiseAge = 0;
    this.neutralLandRiseStarted = false;
    // §3.13.7: neutral unless crouch already held in air (early crouch path).
    this.neutralLandSnap = !this.preLandCrouchHold;
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
      const wasLand = this.animTail.animRole === 'land';
      this.clearAnimTail();
      // Post-hardstun land hold ended → open crouch_to_stand (§3.13.7), not idle/turn.
      if (
        wasLand &&
        !this.neutralLandRiseStarted &&
        (this.phase === 'idle' || this.phase === 'crouch') &&
        !this.turning
      ) {
        this.stanceState = beginToStand(this.stanceCfg);
        this.neutralLandRiseStarted = true;
        this.landRiseAge = 0;
        this.phase = 'crouch';
        this.presentCrouchToStand();
        if (
          this.pendingTurnAfterLand &&
          this.landRiseAge >= this.riseToTurnDelayFrames()
        ) {
          this.presentNeutralLandIdleOrTurn();
        }
        return;
      }
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
   * §3.13.6 late crouch after land: hard interrupt, flip, crouch loop.
   * Release crouch mid turn-clip: stop turn, open crouch_to_stand (§3.14.3 interrupt).
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

    // §3.13.6 delayed crouch: interrupt land residual / post-land turn / pending turn.
    // Keep crouch-turn if already in early-land crouch turn and still holding crouch.
    if (wantCrouch) {
      const landTail = this.animTail?.animRole === 'land';
      const midStandTurn =
        this.turning && this.clipId !== 'turn_crh' && !this.stanceState.logicalCrouch;
      const pendingLandTurn = this.pendingTurnAfterLand;
      if (landTail || midStandTurn || pendingLandTurn) {
        this.enterCrouchLoopInstant({ flipVisual: true });
        return;
      }
      // Holding crouch through crouch-turn: keep clip; do not open stance transition.
      if (this.turning && (this.clipId === 'turn_crh' || this.stanceState.logicalCrouch)) {
        this.stanceState = clearStanceTo(true);
        this.phase = 'crouch';
        return;
      }
    } else if (this.turning) {
      // Release down (or neutral) mid turn: stop turn immediately, then stand/crouch machine.
      // Avoids scrubbing turn_crh tail while crouch_to_stand is queued but not presented.
      this.clearTurn();
    }

    if (this.animTail) {
      if (!residualInterruptedByHeldPosture(this.animTail.stance, held)) {
        this.clearLoco();
        this.stanceState = clearStanceTo(wantCrouch);
        this.phase = wantCrouch ? 'crouch' : 'idle';
        this.clipId = this.animTail.clipId;
        this.animRole = this.animTail.animRole === 'land' ? 'land' : 'main';
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
    // §3.14.3.a3: land→dash snaps mesh after cross-up (same flip family as jump).
    this.clearTurn();
    this.applyVisualFacing();
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
    this.preLandCrouchHold = false;
    this.neutralLandSnap = false;
    this.neutralLandRiseStarted = false;
    this.landRiseAge = 0;
    this.clearLoco();
    // §3.14.3.a: land→rejump (incl. buffered) snaps mesh; do not keep pre-cross visualFacing.
    this.clearTurn();
    this.applyVisualFacing();
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

  /** After blockstun, rest clip (idle / crouch) — not guard loop. */
  holdGuardLoopClipId: string | null = null;

  applyBlockstun(
    frames: number,
    opts?: {
      crouching?: boolean;
      reactClipId?: string;
      holdLoopClipId?: string;
    },
  ): void {
    this.clearAnimTail();
    this.clearAttackResidual();
    const crouching = !!opts?.crouching;
    this.stanceState = clearStanceTo(crouching);
    this.phase = 'blockstun';
    this.stunTimer = frames;
    this.mover.move = null;
    this.clipId = opts?.reactClipId ?? (crouching ? 'grd_cl_st' : 'grd_ml_st');
    this.animRole = 'main';
    this.holdGuardLoopClipId = opts?.holdLoopClipId ?? 'idle';
    this.stateTimer = 0;
    this.airTimeRemain = 0;
    this.clearLoco();
    this.jumpPhase = 'none';
    this.usedAirNormal = false;
    this.clearTurn();
    this.applyVisualFacing();
    this.y = 0;
  }

  /** Mid-stun dummy stance for boxes; do not reset stun or swap rest clip. */
  syncGuardHold(crouching: boolean, _loopClipId?: string): void {
    this.stanceState = clearStanceTo(crouching);
  }

  /** After stun: rest guard pose (block_all returns to stand). */
  syncGuardIdleStance(crouching: boolean): void {
    this.stanceState = clearStanceTo(crouching);
    this.phase = crouching ? 'crouch' : 'idle';
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
    /** §3.13.7: land → rise (→idle path) dissolve start ratio. */
    neutralLandToRiseIdleRatio?: number;
    /** §3.13.7: land → rise (→turn path) dissolve start ratio. */
    neutralLandToRiseTurnRatio?: number;
    /** §3.13.7: rise → turn dissolve start ratio. */
    neutralRiseToTurnDissolveRatio?: number;
    /** Holding down this frame (for §3.13.6 early crouch on land exit). */
    crouchHeld?: boolean;
  }): void {
    if (this.phase === 'attack') {
      if (this.jumpPhase === 'air') {
        if (this.tickJumpArc(opts)) {
          this.enterLanding(opts.landingFrames, opts.landingAnimFrames, opts);
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
        this.stunTimer = 0;
        if (this.phase === 'blockstun' && this.holdGuardLoopClipId) {
          const rest = this.holdGuardLoopClipId;
          const crouchHold = rest === 'crouch' || rest.includes('crouch');
          this.stanceState = clearStanceTo(crouchHold);
          this.phase = crouchHold ? 'crouch' : 'idle';
          this.clipId = rest === 'block_stand_loop' || rest === 'block_crouch_loop' ? 'idle' : rest;
          this.animRole = 'main';
        } else {
          this.phase = 'idle';
          this.clipId = 'idle';
          this.animRole = 'main';
          this.holdGuardLoopClipId = null;
        }
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
        this.enterLanding(opts.landingFrames, opts.landingAnimFrames, opts);
      } else if (!this.animTail?.holdAir) {
        this.animRole = 'air';
        this.clipId = this.jumpClipId;
      }
      return;
    }
    if (this.phase === 'landing') {
      this.applyNeutralLandRatioOpts(opts);
      if (opts.landingAnimFrames != null && opts.landingAnimFrames > 0) {
        this.landAnimFrameCount = Math.floor(opts.landingAnimFrames);
      }
      // Crouch held mid-landing cancels neutral snap → stay on land until hardstun end.
      if (this.preLandCrouchHold) {
        this.neutralLandSnap = false;
        this.neutralLandRiseStarted = false;
        this.landRiseAge = 0;
      }
      this.jumpFrame += 1;
      this.stateTimer -= 1;
      this.y = 0;
      if (this.neutralLandSnap) {
        const delay = this.landToRiseDelayFrames();
        // landSnapAge: completed land-present frames; open crouch_to_stand when age >= delay
        if (this.landSnapAge >= delay) {
          const riseDone = this.tickNeutralLandRisePresentation();
          if (riseDone) {
            this.presentNeutralLandIdleOrTurn();
            this.neutralLandSnap = false;
          }
          if (this.turning) {
            this.turnFrame += 1;
            this.clipId =
              this.clipId === 'turn_crh' || this.stanceState.logicalCrouch
                ? 'turn_crh'
                : 'turn_std';
            this.animRole = 'main';
            if (this.turnFrame >= this.turnTotal) {
              this.clearTurn();
              this.stanceState = clearStanceTo(false);
              this.clipId = 'idle';
              this.animRole = 'main';
            }
          }
        } else {
          this.animRole = 'land';
          this.clipId = this.jumpClipId;
        }
        this.landSnapAge += 1;
      } else if (this.neutralLandRiseStarted && this.stanceState.seg === 'to_stand') {
        // Rise still scrubbing (snap cleared after early handoff path, or mid-hardstun).
        const riseDone = this.tickNeutralLandRisePresentation();
        if (riseDone) {
          this.presentNeutralLandIdleOrTurn();
        }
      } else if (this.turning) {
        this.turnFrame += 1;
        this.clipId =
          this.clipId === 'turn_crh' || this.stanceState.logicalCrouch
            ? 'turn_crh'
            : 'turn_std';
        this.animRole = 'main';
        if (this.turnFrame >= this.turnTotal) {
          this.clearTurn();
          this.stanceState = clearStanceTo(false);
          this.clipId = 'idle';
          this.animRole = 'main';
        }
      } else if (this.neutralLandRiseStarted) {
        // Rise already finished to idle/turn during hardstun — keep presentation.
      } else {
        this.animRole = 'land';
        this.clipId = this.jumpClipId;
      }
      if (this.stateTimer <= 0) {
        this.jumpPhase = 'none';
        this.beginLandAnimTail(opts.crouchHeld === true);
        this.jumpFrame = 0;
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
          // Re-sample hold at turn end: release-down during last frames may have
          // only queued to_stand; if still holding crouch, stay crouch loop.
          const holdCrouch = opts.crouchHeld === true;
          if (holdCrouch) {
            this.stanceState = clearStanceTo(true);
          } else if (
            this.stanceState.seg === 'none' &&
            (this.stanceState.logicalCrouch || this.phase === 'crouch')
          ) {
            this.stanceState = stepStanceHold(
              this.stanceState,
              false,
              this.stanceCfg,
            );
          }
          this.applyStancePresentation();
        }
      } else if (
        this.neutralLandRiseStarted &&
        this.stanceState.seg === 'to_stand'
      ) {
        this.applyNeutralLandRatioOpts(opts);
        const riseDone = this.tickNeutralLandRisePresentation();
        if (riseDone) {
          this.presentNeutralLandIdleOrTurn();
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
