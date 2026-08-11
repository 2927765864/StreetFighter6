/**
 * Map logic localFrame → AnimationClip time (seconds).
 * @see consensus-design-v0.md §3.7
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
    const sampleCount = Math.max(1, Math.round(dur * 60));
    const sample = Math.min(f, sampleCount - 1);
    return Math.min(sample / 60, Math.max(0, dur - 1e-4));
  }

  // uniform (default)
  const u = f / total;
  const t = u * dur;
  return Math.min(Math.max(0, t), Math.max(0, dur - 1e-4));
}
