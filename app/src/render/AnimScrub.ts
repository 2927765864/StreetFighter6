/**
 * Map logic localFrame → AnimationClip time (seconds).
 * @see consensus-design-v0.md §3.7 / §3.7.1
 * @see docs/plans/ai-execution-plan-anim-loco-feet-displace-v0.md Step 3
 */

import type {
  AnimRemapSegment,
  AnimSequenceSegment,
} from '../combat/move/MoveDefinition';

export type { AnimRemapSegment, AnimSequenceSegment };
export type ScrubMode = 'uniform' | 'truncate';

export type ResolvedAnimSequenceFrame = {
  role: string;
  motionFrame: number;
  segment: AnimSequenceSegment;
};

/**
 * @param logicFrame 0-based local frame within segment
 * @param logicTotal segment length in frames (>=1)
 * @param clipDurationSec AnimationClip.duration
 * @param mode uniform = stretch whole clip into logicTotal; truncate = 60Hz samples
 */
export function logicFrameToClipTime(
  logicFrame: number,
  logicTotal: number,
  clipDurationSec: number,
  mode: ScrubMode = 'uniform',
): number {
  const total = Math.max(1, Math.floor(logicTotal));
  const f = Math.max(0, Math.min(Math.floor(logicFrame), total - 1));
  const dur = Math.max(0, clipDurationSec);
  if (dur <= 1e-8) return 0;

  if (mode === 'truncate') {
    return visualFrameToClipTime(f, dur);
  }

  // uniform (default) — stretch whole clip into logicTotal
  const u = f / total;
  const t = u * dur;
  return Math.min(Math.max(0, t), Math.max(0, dur - 1e-4));
}

/**
 * Consensus §3.7.1: attack locked + residual share one 60Hz timeline on the clip.
 * visualFrame 0 → t≈0; frame N → N/60s (clamped to duration).
 */
export function visualFrameToClipTime(
  visualFrame: number,
  clipDurationSec: number,
): number {
  const dur = Math.max(0, clipDurationSec);
  if (dur <= 1e-8) return 0;
  const f = Math.max(0, Math.floor(visualFrame));
  return Math.min(f / 60, Math.max(0, dur - 1e-4));
}

/**
 * Free-run loops (idle / crouch / guard loop): one authored 60Hz sample per logic step.
 * Matches {@link visualFrameToClipTime} so lowering experimental `logicFps` slows
 * free-run the same way as scrubbed clips. Cap matches blendWallDt.
 */
export function freeRunAnimDtSec(
  logicSteps: number,
  timeScaleAnim = 1,
): number {
  const steps = Math.max(0, logicSteps);
  const dt = Math.min(steps / 60, 0.1);
  return dt * (timeScaleAnim || 1);
}

/** Clamp presentation hitstop rate to [0, 1]. 0 = hard freeze. */
export function clampHitstopAnimRate(
  rate: number | null | undefined,
): number {
  if (rate == null || !Number.isFinite(rate)) return 0;
  return Math.min(1, Math.max(0, rate));
}

/**
 * Presentation-only dt while logic is in hit freeze.
 * `hitstopPresentTicks` = MatchSim steps that early-returned on hitstop.
 */
export function hitstopPresentDtSec(
  hitstopPresentTicks: number,
  hitstopAnimRate: number,
  timeScaleAnim = 1,
): number {
  const rate = clampHitstopAnimRate(hitstopAnimRate);
  if (rate <= 0) return 0;
  return freeRunAnimDtSec(hitstopPresentTicks, timeScaleAnim) * rate;
}

/**
 * Free-run mixer dt when some of this present's logic steps were hitstop.
 * Non-hitstop steps advance at full authored rate; hitstop steps at
 * {@link hitstopAnimRate}.
 */
export function freeRunAnimDtSecWithHitstop(
  logicSteps: number,
  hitstopPresentTicks: number,
  hitstopAnimRate: number,
  timeScaleAnim = 1,
): number {
  const steps = Math.max(0, logicSteps);
  const hs = Math.min(Math.max(0, hitstopPresentTicks), steps);
  const normal = steps - hs;
  return (
    freeRunAnimDtSec(normal, timeScaleAnim) +
    hitstopPresentDtSec(hs, hitstopAnimRate, timeScaleAnim)
  );
}

/**
 * Map an action-timeline frame through animRemap segments to a motion frame.
 * Empty / invalid tables fall back to the logic frame itself.
 */
export function remapLogicToMotionFrame(
  logicFrame: number,
  segments: readonly AnimRemapSegment[] | null | undefined,
): number {
  const f = Math.max(0, logicFrame);
  if (!segments || segments.length === 0) return f;

  const segs = segments.filter(
    (s) =>
      Number.isFinite(s.logicFrom) &&
      Number.isFinite(s.logicTo) &&
      Number.isFinite(s.motionFrom) &&
      Number.isFinite(s.motionTo) &&
      s.logicTo > s.logicFrom,
  );
  if (segs.length === 0) return f;

  for (const s of segs) {
    if (f >= s.logicFrom && f < s.logicTo) {
      const u = (f - s.logicFrom) / (s.logicTo - s.logicFrom);
      return s.motionFrom + u * (s.motionTo - s.motionFrom);
    }
  }

  const last = segs[segs.length - 1]!;
  if (f >= last.logicTo) return last.motionTo;
  // Before first segment
  return segs[0]!.motionFrom;
}

/**
 * Action frame → clip seconds via animRemap (60Hz motion samples).
 * No table → same as visualFrameToClipTime.
 */
export function remapLogicToClipTime(
  logicFrame: number,
  segments: readonly AnimRemapSegment[] | null | undefined,
  clipDurationSec: number,
): number {
  if (!segments || segments.length === 0) {
    return visualFrameToClipTime(logicFrame, clipDurationSec);
  }
  const motion = remapLogicToMotionFrame(logicFrame, segments);
  return visualFrameToClipTime(motion, clipDurationSec);
}

/**
 * Resolve multi-clip sequence at a logic frame (Tatsumaki start/loop/end).
 */
export function resolveAnimSequenceFrame(
  logicFrame: number,
  sequence: readonly AnimSequenceSegment[] | null | undefined,
): ResolvedAnimSequenceFrame | null {
  if (!sequence || sequence.length === 0) return null;
  const f = Math.max(0, logicFrame);
  const segs = sequence.filter(
    (s) =>
      typeof s.role === 'string' &&
      s.role.length > 0 &&
      Number.isFinite(s.logicFrom) &&
      Number.isFinite(s.logicTo) &&
      Number.isFinite(s.motionFrom) &&
      Number.isFinite(s.motionTo) &&
      s.logicTo > s.logicFrom,
  );
  if (segs.length === 0) return null;

  let seg = segs[0]!;
  for (const s of segs) {
    if (f >= s.logicFrom && f < s.logicTo) {
      seg = s;
      break;
    }
    if (f >= s.logicTo) seg = s;
  }
  if (f < segs[0]!.logicFrom) seg = segs[0]!;
  if (f >= segs[segs.length - 1]!.logicTo) seg = segs[segs.length - 1]!;

  const span = seg.logicTo - seg.logicFrom;
  const u =
    f <= seg.logicFrom
      ? 0
      : f >= seg.logicTo
        ? 1
        : (f - seg.logicFrom) / span;
  const motionFrame = seg.motionFrom + u * (seg.motionTo - seg.motionFrom);
  return { role: seg.role, motionFrame, segment: seg };
}

/** Prefer map/filename count; else derive from clip duration @60Hz. */
export function resolveAnimFrameCount(
  explicit: number | null | undefined,
  clipDurationSec: number,
  logicTotal: number,
): number {
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0) {
    return Math.max(1, Math.floor(explicit));
  }
  const fromDur = Math.max(1, Math.round(Math.max(0, clipDurationSec) * 60));
  return Math.max(fromDur, Math.max(1, logicTotal));
}
