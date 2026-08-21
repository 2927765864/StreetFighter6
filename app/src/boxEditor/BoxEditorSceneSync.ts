import type { MatchSim } from '../combat/match/MatchSim';
import {
  cloneMove,
  inferTimelineFrames,
  type MoveDefinition,
  type TimedBox,
} from '../combat/move/MoveDefinition';
import type { Fighter } from '../combat/fighter/Fighter';
import type { StanceBoxTable } from '../data/loadStanceBoxes';

/** MatchSim.reset training corners: P1 left facing right, P2 right facing left. */
export function poseEditFighters(match: MatchSim): void {
  match.p1.x = -1.2;
  match.p1.y = 0;
  match.p1.facing = 1;
  match.p1.applyVisualFacing();

  match.p2.x = 1.2;
  match.p2.y = 0;
  match.p2.facing = -1;
  match.p2.applyVisualFacing();
}

function clampMoveFrame(def: MoveDefinition, frame: number): number {
  const len = Math.max(1, inferTimelineFrames(def));
  return Math.max(0, Math.min(Math.floor(frame), len - 1));
}

/**
 * Both fighters play the same move at the same logic frame; facing stays opposite.
 * Does not call advance().
 */
export function applyEditMove(
  match: MatchSim,
  def: MoveDefinition,
  frame: number,
): void {
  poseEditFighters(match);
  const f = clampMoveFrame(def, frame);
  const m1 = cloneMove(def);
  const m2 = cloneMove(def);
  match.p1.startMove(m1);
  match.p2.startMove(m2);
  match.p1.mover.moveFrame = f;
  match.p2.mover.moveFrame = f;
}

function forceIdleOrCrouch(f: Fighter, stance: 'stand' | 'crouch'): void {
  f.clearAnimTail();
  f.clearAttackResidual();
  f.mover.move = null;
  f.clearLoco();
  f.clearTurn();
  f.y = 0;
  f.stunTimer = 0;
  f.stateTimer = 0;
  f.jumpPhase = 'none';
  f.airTimeRemain = 0;
  f.usedAirNormal = false;
  f.clearStanceTransition(stance === 'crouch');
  f.phase = stance === 'crouch' ? 'crouch' : 'idle';
  f.clipId = stance === 'crouch' ? 'crouch' : 'idle';
  f.animRole = 'main';
  f.applyVisualFacing();
}

/** Clear attack; present idle or crouch on both with opposite facing. */
export function applyEditStance(
  match: MatchSim,
  stance: 'stand' | 'crouch',
): void {
  poseEditFighters(match);
  forceIdleOrCrouch(match.p1, stance);
  forceIdleOrCrouch(match.p2, stance);
}

export type EditBoxesBundle = {
  hit: TimedBox[];
  hurt: TimedBox[];
  push: TimedBox[];
};

/** Patch active move boxes on both fighters so world*Boxes reflects the document. */
export function patchFighterMoveBoxes(
  match: MatchSim,
  boxes: EditBoxesBundle,
): void {
  const apply = (move: MoveDefinition | null | undefined) => {
    if (!move) return;
    move.boxes = {
      hit: structuredClone(boxes.hit),
      hurt: structuredClone(boxes.hurt),
      push: structuredClone(boxes.push),
    };
  };
  apply(match.p1.mover.move);
  apply(match.p2.mover.move);
}

/** Patch stance table on both fighters (stance edit mode). */
export function patchFighterStanceBoxes(
  match: MatchSim,
  table: StanceBoxTable,
): void {
  match.setStanceTable(structuredClone(table));
}
