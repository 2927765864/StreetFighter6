/**
 * Fixed-step accumulator (Gaffer on Games — Fix Your Timestep!).
 * Spiral-of-death caps: maxFrameTime + maxSteps.
 */
export class FrameClock {
  accumulator = 0;
  logicFrame = 0;

  constructor(
    public dt = 1 / 60,
    public maxSteps = 4,
    /** seconds */
    public maxFrameTime = 0.1,
  ) {}

  /** wallDt in seconds; returns how many logic steps to run this rAF */
  tick(wallDt: number): number {
    const clamped = Math.min(wallDt, this.maxFrameTime);
    this.accumulator += clamped;
    let steps = 0;
    while (this.accumulator >= this.dt && steps < this.maxSteps) {
      this.accumulator -= this.dt;
      this.logicFrame += 1;
      steps += 1;
    }
    return steps;
  }

  get alpha(): number {
    return this.dt > 0 ? this.accumulator / this.dt : 0;
  }

  reconfigure(logicFps: number, maxSteps: number, maxFrameTimeMs: number): void {
    this.dt = 1 / logicFps;
    this.maxSteps = maxSteps;
    this.maxFrameTime = maxFrameTimeMs / 1000;
  }
}
