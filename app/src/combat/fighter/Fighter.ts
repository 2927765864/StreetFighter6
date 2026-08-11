import { faceBox, type Box } from '../boxes/Box2D';
import type { MoveDefinition } from '../move/MoveDefinition';
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

const STAND_HURT: Box = { x: 0, y: 0.85, w: 0.7, h: 1.7 };
const CROUCH_HURT: Box = { x: 0, y: 0.5, w: 0.75, h: 1.0 };

export class Fighter {
  phase: FighterPhase = 'idle';
  x: number;
  y = 0;
  facing: Facing;
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
  /** Logic id for jump clips: jump_n | jump_f | jump_b */
  jumpClipId: 'jump_n' | 'jump_f' | 'jump_b' = 'jump_n';
  walkState: WalkState = initialWalkState();
  /**
   * Remaining airborne frames when an air attack interrupts freefall.
   * Restored when the attack ends so we do not snap to ground idle mid-air.
   */
  airTimeRemain = 0;
  /** Last selfMovement dx applied (debug). */
  lastSelfDx = 0;
  /**
   * After logic total ends: keep attack clip on a 60Hz visual timeline until
   * animFrameCount or player interrupts (consensus §3.7.1).
   */
  animTail: {
    clipId: string;
    /** Current visual frame on full anim timeline (0-based). */
    visualFrame: number;
    animFrameCount: number;
    logicTotal: number;
    /** Posture family of the finished move (compatibility vs hold). */
    stance: MoveStance;
  } | null = null;
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
    this.hp = hp;
  }

  canAct(): boolean {
    return (
      this.phase === 'idle' ||
      this.phase === 'walk' ||
      this.phase === 'crouch'
    );
  }

  /** Jump normals while freefalling (not prejump/landing). */
  canAirAct(): boolean {
    return this.phase === 'airborne';
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

  /** True while presentation is finishing attack clip after logic total. */
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

  private beginAnimTail(move: MoveDefinition): void {
    const logicTotal = Math.max(1, move.frames.total);
    const animN = Math.max(
      logicTotal,
      move.animFrameCount != null && move.animFrameCount > 0
        ? Math.floor(move.animFrameCount)
        : logicTotal,
    );
    const moveStance = inferMoveStance(move);
    const crouch = moveStance === 'crouch';
    if (animN <= logicTotal) {
      this.animTail = null;
      this.stanceState = clearStanceTo(crouch);
      this.applyStancePresentation();
      return;
    }
    this.animTail = {
      clipId: move.clipId,
      visualFrame: logicTotal,
      animFrameCount: animN,
      logicTotal,
      stance: moveStance,
    };
    this.clipId = move.clipId;
    this.animRole = 'main';
    this.stanceState = clearStanceTo(crouch);
    this.phase = crouch ? 'crouch' : 'idle';
  }

  /** Advance residual one logic tick; clear when done → stance idle clip. */
  private tickAnimTail(): void {
    if (!this.animTail) return;
    this.animTail.visualFrame += 1;
    if (this.animTail.visualFrame >= this.animTail.animFrameCount) {
      const st = this.animTail.stance;
      this.clearAnimTail();
      if (this.phase === 'idle' || this.phase === 'crouch') {
        const crouch = st === 'crouch' || this.phase === 'crouch';
        this.stanceState = clearStanceTo(crouch);
        this.applyStancePresentation();
      }
    } else {
      this.clipId = this.animTail.clipId;
      this.animRole = 'main';
    }
  }

  /**
   * Posture / walk while canAct (§3.7.1 residual + §3.7.2 stance transition).
   */
  applyPostureOrWalkIntent(intent: 'none' | 'crouch' | 'walk'): void {
    if (!this.canAct()) return;

    if (intent === 'walk') {
      this.clearAnimTail();
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
    if (this.phase === 'airborne') {
      this.airTimeRemain = Math.max(0, this.stateTimer);
    } else if (this.phase !== 'attack') {
      this.airTimeRemain = 0;
    }
    this.clearAnimTail();
    this.stanceState = clearStanceTo(false);
    this.phase = 'attack';
    this.mover.start(move);
    this.clipId = move.clipId;
    this.animRole = 'main';
    this.stateTimer = 0;
    this.clearLoco();
    this.jumpPhase = 'none';
    this.lastSelfDx = 0;
  }

  startDash(fwd: boolean, frames: number): void {
    this.clearAnimTail();
    this.stanceState = clearStanceTo(false);
    this.phase = 'dash';
    this.stateTimer = frames;
    this.dashDir = (fwd ? this.facing : ((-this.facing) as Facing));
    this.mover.move = null;
    this.clipId = fwd ? 'dash_fwd' : 'dash_back';
    this.animRole = 'main';
    this.airTimeRemain = 0;
    this.clearLoco();
    this.jumpPhase = 'none';
  }

  /**
   * @param relDir facing-relative numpad at jump press (7/8/9)
   */
  startJump(prejumpFrames: number, relDir: NumpadDir = 8): void {
    this.clearAnimTail();
    this.stanceState = clearStanceTo(false);
    this.phase = 'prejump';
    this.stateTimer = prejumpFrames;
    this.jumpFrame = 0;
    this.jumpPhase = 'prejump';
    this.mover.move = null;
    this.airTimeRemain = 0;
    this.clearLoco();
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
  }

  applyHitstun(frames: number, damage: number): void {
    this.clearAnimTail();
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
    this.y = 0;
  }

  applyBlockstun(frames: number): void {
    this.clearAnimTail();
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
    this.y = 0;
  }

  /**
   * Advance one logic frame (skipped during hitstop by MatchSim).
   * Attack selfMovement applied at start of frame using current moveFrame, then advance.
   */
  advance(opts: {
    airFrames: number;
    landingFrames: number;
    dashSpeed: number;
    applySelfMovement?: boolean;
    selfMovementScale?: number;
    jumpApex?: number;
    jumpFwdDist?: number;
    jumpBackDist?: number;
    jumpNeutralDist?: number;
  }): void {
    if (this.phase === 'attack') {
      const move = this.mover.move;
      if (move && opts.applySelfMovement !== false) {
        const scale = opts.selfMovementScale ?? 1;
        const dx = (move.selfMovement?.[this.mover.moveFrame] ?? 0) * scale;
        this.lastSelfDx = dx;
        this.x += this.facing * dx;
      } else {
        this.lastSelfDx = 0;
      }
      const finished = this.mover.advance();
      if (finished) {
        if (this.airTimeRemain > 0) {
          this.clearAnimTail();
          this.phase = 'airborne';
          this.stateTimer = this.airTimeRemain;
          this.clipId = this.jumpClipId;
          this.animRole = 'air';
          this.jumpPhase = 'air';
          this.airTimeRemain = 0;
        } else {
          // Logic canAct; presentation may continue residual (§3.7.1)
          this.phase = 'idle';
          this.y = 0;
          if (move) this.beginAnimTail(move);
          else {
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
      this.x += this.dashDir * opts.dashSpeed;
      this.stateTimer -= 1;
      this.jumpFrame = Math.max(0, (opts as { dashFrames?: number }).dashFrames
        ? 0
        : this.jumpFrame);
      // dash local frame for scrub: use remaining inverted in view
      if (this.stateTimer <= 0) {
        this.phase = 'idle';
        this.clipId = 'idle';
        this.animRole = 'main';
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
      this.x += this.facing * this.jumpHorizSign * (dist / airTotal);

      this.jumpFrame += 1;
      this.stateTimer -= 1;
      this.animRole = 'air';
      this.clipId = this.jumpClipId;
      if (this.stateTimer <= 0) {
        this.phase = 'landing';
        this.stateTimer = opts.landingFrames;
        this.jumpPhase = 'land';
        this.jumpFrame = 0;
        this.animRole = 'land';
        this.y = 0;
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
        this.phase = 'idle';
        this.clipId = 'idle';
        this.animRole = 'main';
        this.jumpPhase = 'none';
        this.jumpFrame = 0;
      }
      return;
    }

    // Idle / crouch: residual first, else tick stance transition
    if (this.phase === 'idle' || this.phase === 'crouch') {
      if (this.animTail) {
        this.tickAnimTail();
      } else if (this.stanceState.seg !== 'none') {
        this.stanceState = tickStance(this.stanceState);
        this.applyStancePresentation();
      }
    }
  }

  worldHurtBoxes(crouch = false): Box[] {
    if (this.phase === 'attack') {
      return this.mover
        .currentHurtBoxesLocal()
        .map((b) => faceBox(b, this.x, this.y, this.facing));
    }
    const local = crouch ? CROUCH_HURT : STAND_HURT;
    return [faceBox(local, this.x, this.y, this.facing)];
  }

  worldHitBoxes(): Box[] {
    if (this.phase !== 'attack' || !this.mover.isHitActive()) return [];
    return this.mover
      .currentHitBoxesLocal()
      .map((b) => faceBox(b, this.x, this.y, this.facing));
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
      this.clearAnimTail();
      this.stanceState = clearStanceTo(false);
      this.phase = 'walk';
      this.clipId = ws.clipId;
      this.animRole = ws.animRole;
    }
  }
}
