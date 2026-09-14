/**
 * Decide presentation dt for one present tick.
 *
 * Normal play uses wall-clock `presentAccum` (time since last present).
 * Paused / frame-step mode must not leak wall time into cloth, VFX, or camera:
 * - frozen hold → 0
 * - queued logic steps → authored n/60 (same contract as AnimScrub free-run
 *   and a stable 60Hz single-step present; ignores experimental logicFps)
 */
export function resolvePresentDt(opts: {
  paused: boolean;
  logicSteps: number;
  presentAccum: number;
}): number {
  if (opts.paused) {
    const steps = Math.max(0, opts.logicSteps | 0);
    return steps > 0 ? steps / 60 : 0;
  }
  return Math.max(0, opts.presentAccum);
}
