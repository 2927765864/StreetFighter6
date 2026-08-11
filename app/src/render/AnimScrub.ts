/**
 * Map logic localFrame → AnimationClip time (seconds).
 * @see consensus-design-v0.md §3.7 / §3.7.1
 * @see docs/plans/ai-execution-plan-anim-loco-feet-displace-v0.md Step 3
 */

export type ScrubMode = 'uniform' | 'truncate';

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
