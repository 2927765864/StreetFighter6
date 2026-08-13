import { faceBox, type Box } from './Box2D';
import type { TimedBox, MoveDefinition } from '../move/MoveDefinition';
import type {
  StanceBoxTable,
  StanceId,
  StanceTransitionRole,
  StanceTimedBox,
} from '../../data/loadStanceBoxes';
import type { FighterPhase, Facing } from '../types';

export type ActionTimeline = {
  move: MoveDefinition;
  frame: number;
};

export type StanceTransitionSample = {
  role: StanceTransitionRole;
  /** Logic frame within the transition segment (0-based). */
  frame: number;
};

export type FighterBoxState = {
  x: number;
  y: number;
  facing: Facing;
  phase: FighterPhase;
  /** True while logic attack lock still holds mover.move. */
  hasActiveMove: boolean;
  /** From StanceController — true while crouch-held or crouch transition. */
  logicalCrouch?: boolean;
  /**
   * Explicit crouch override (dummy / tests). When undefined, derived from
   * phase / logicalCrouch / current move stance.
   */
  crouchOverride?: boolean;
  /**
   * Active stand↔crouch transition sample. When set and the stance table has
   * matching timed boxes, those replace the static stance green/push base.
   */
  stanceTransition?: StanceTransitionSample | null;
  getActionTimeline(): ActionTimeline | null;
};

export function filterTimedBoxes(list: TimedBox[] | undefined, frame: number): TimedBox[] {
  if (!list?.length) return [];
  return list.filter((b) => frame >= b.from && frame <= b.to);
}

/** Filter stance transition timed boxes; if multiple segments cover frame, keep latest `from`. */
export function filterStanceTimedBoxes(
  list: StanceTimedBox[] | undefined,
  frame: number,
): StanceTimedBox[] {
  if (!list?.length) return [];
  const hit = list.filter((b) => frame >= b.from && frame <= b.to);
  if (hit.length <= 1) return hit;
  const maxFrom = Math.max(...hit.map((b) => b.from));
  return hit.filter((b) => b.from === maxFrom);
}

/**
 * Infer stance family for box assembly from fighter state + optional move.
 * Crouch/jump/air attacks must change the stance-green base (consensus §4.3–4.4).
 */
export function resolveStanceId(f: {
  y: number;
  phase: FighterPhase;
  logicalCrouch?: boolean;
  crouchOverride?: boolean;
  moveStance?: StanceId | null;
  airThreshold?: number;
}): StanceId {
  const airTh = f.airThreshold ?? 0.01;
  const moveSt = f.moveStance ?? null;

  // Air: freefall / elevated / air move. Prejump is still grounded (stand).
  if (
    f.phase === 'airborne' ||
    f.y > airTh ||
    moveSt === 'air'
  ) {
    return 'air';
  }

  if (f.crouchOverride === true) return 'crouch';
  if (f.crouchOverride === false && moveSt !== 'crouch') {
    // explicit stand override (rare)
  }

  if (
    f.phase === 'crouch' ||
    f.logicalCrouch === true ||
    moveSt === 'crouch'
  ) {
    return 'crouch';
  }

  return 'stand';
}

function inferMoveStanceFromTimeline(
  tl: ActionTimeline | null,
): StanceId | null {
  if (!tl?.move) return null;
  const m = tl.move;
  if (m.stance === 'stand' || m.stance === 'crouch' || m.stance === 'air') {
    return m.stance;
  }
  const raw = `${m.moveId ?? ''} ${m.id ?? ''}`.toLowerCase();
  if (
    /\bj[.\-_]?[lmh]?[pk]/.test(raw) ||
    /_j[_\-]?/.test(raw) ||
    /(?:^|_)8[lmh][pk]/.test(raw) ||
    raw.includes('air_tatsu')
  ) {
    return 'air';
  }
  if (
    /(?:^|_)2[lmh][pk](?:_|$)/.test(raw) ||
    /(?:^|_)2[lmh][pk]$/.test(raw) ||
    raw.includes('crouch')
  ) {
    return 'crouch';
  }
  return 'stand';
}

/**
 * Two-layer box assembly (consensus §4.3 / plan §2.4).
 *
 * Stance: stand / crouch / air from phase + posture + move family + y.
 * Transition: when stanceTransition is set and table has timed segments,
 *             those replace static stance hurt/push for that frame.
 * Hurt: if action has layer:base on this frame → replace stance with action base;
 *       layer:extend always merges on top (arm/leg stretch).
 * Hit: only while phase==attack, active move, frame < total, table covers frame.
 * Push: action push replaces stance when table covers frame.
 */
export function assembleWorldBoxes(
  f: FighterBoxState,
  stanceTable: StanceBoxTable | null | undefined,
  crouch = false,
): { hit: Box[]; hurt: Box[]; push: Box[]; stanceId: StanceId } {
  const tl = f.getActionTimeline();
  const moveStance = inferMoveStanceFromTimeline(tl);
  const stanceId = resolveStanceId({
    y: f.y,
    phase: f.phase,
    logicalCrouch: f.logicalCrouch,
    crouchOverride: f.crouchOverride ?? (crouch ? true : undefined),
    moveStance,
  });

  const base =
    stanceTable?.stances[stanceId] ??
    stanceTable?.stances.stand ??
    null;

  let hurtLocal: (Box & { part?: string; layer?: string })[] = base
    ? base.hurt.map((b) => ({ ...b, layer: 'stance' as const }))
    : stanceId === 'crouch'
      ? [{ x: 0, y: 0.5, w: 0.75, h: 1.0, part: 'body', layer: 'stance' }]
      : [{ x: 0, y: 0.85, w: 0.7, h: 1.7, part: 'body', layer: 'stance' }];

  let pushLocal: Box[] = base?.push?.length
    ? base.push.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }))
    : stanceId === 'crouch'
      ? [{ x: 0, y: 0.45, w: 0.6, h: 0.9 }]
      : [{ x: 0, y: 0.7, w: 0.55, h: 1.4 }];

  // Stand↔crouch transition timed base (MMDK BAS_STD_CRH / BAS_CRH_STD)
  const trSample = f.stanceTransition;
  if (trSample && stanceTable?.transitions) {
    const tr = stanceTable.transitions[trSample.role];
    if (tr) {
      const frame = Math.max(0, trSample.frame | 0);
      const th = filterStanceTimedBoxes(tr.hurt, frame);
      if (th.length > 0) {
        hurtLocal = th.map((b) => ({
          x: b.x,
          y: b.y,
          w: b.w,
          h: b.h,
          part: b.part,
          layer: b.layer ?? 'base',
        }));
      }
      const tp = filterStanceTimedBoxes(tr.push, frame);
      if (tp.length > 0) {
        pushLocal = tp.map((b) => ({
          x: b.x,
          y: b.y,
          w: b.w,
          h: b.h,
        }));
      }
    }
  }

  let hitLocal: Box[] = [];

  if (tl) {
    const { move, frame } = tl;
    // Hit gate (plan §2.3): red never residuals past logic total
    if (
      f.phase === 'attack' &&
      f.hasActiveMove &&
      frame < move.frames.total
    ) {
      hitLocal = filterTimedBoxes(move.boxes.hit, frame).map((b) => ({
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
      }));
    }

    const ah = filterTimedBoxes(move.boxes.hurt, frame);
    if (ah.length) {
      const actionBase = ah.filter((b) => b.layer === 'base');
      const actionExtend = ah.filter((b) => b.layer !== 'base');
      // §4.3: when action table provides full body base, replace stance greens
      if (actionBase.length > 0) {
        hurtLocal = actionBase.map((b) => ({
          x: b.x,
          y: b.y,
          w: b.w,
          h: b.h,
          part: b.part,
          layer: 'base',
        }));
      }
      // Temporary deform (fist/leg stretch) always stacks
      if (actionExtend.length > 0) {
        hurtLocal = [
          ...hurtLocal,
          ...actionExtend.map((b) => ({
            x: b.x,
            y: b.y,
            w: b.w,
            h: b.h,
            part: b.part,
            layer: b.layer ?? 'extend',
          })),
        ];
      }
      // Untagged hurt (no layer): treat as replace-all for that frame if no base
      if (actionBase.length === 0 && actionExtend.length === 0) {
        // all untagged
        const untagged = ah.filter((b) => b.layer == null);
        if (untagged.length === ah.length) {
          hurtLocal = ah.map((b) => ({
            x: b.x,
            y: b.y,
            w: b.w,
            h: b.h,
            part: b.part,
          }));
        }
      }
    }

    const ap = filterTimedBoxes(move.boxes.push ?? [], frame);
    if (ap.length) {
      pushLocal = ap.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
    }
  }

  return {
    stanceId,
    hit: hitLocal.map((b) => faceBox(b, f.x, f.y, f.facing)),
    hurt: hurtLocal.map((b) => faceBox(b, f.x, f.y, f.facing)),
    push: pushLocal.map((b) => faceBox(b, f.x, f.y, f.facing)),
  };
}
