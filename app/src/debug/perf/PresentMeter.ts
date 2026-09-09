import { computeIntegerFps } from './perfMath';

export type PresentMeterSample = {
  presentFps: number;
  logicHz: number;
  frameMs: number;
  frameMsMin: number;
  frameMsMax: number;
  frameMsAvg: number;
  /** Ring buffer copies for graphs (oldest → newest). */
  frameMsHistory: number[];
  fpsHistory: number[];
};

/**
 * Present-rate meter: only call {@link tick} when a frame is actually drawn.
 */
export class PresentMeter {
  private frames = 0;
  private logicSteps = 0;
  private windowStartMs = Number.NaN;
  private presentFps = 0;
  private logicHz = 0;
  private frameMsRing: number[] = [];
  private fpsRing: number[] = [];
  private historyLength = 120;

  setHistoryLength(n: number): void {
    this.historyLength = Math.max(2, Math.floor(n));
    while (this.frameMsRing.length > this.historyLength) this.frameMsRing.shift();
    while (this.fpsRing.length > this.historyLength) this.fpsRing.shift();
  }

  /**
   * @param frameMs wall time of this present (logic+sync+vfx+render)
   * @param logicStepsThisPresent logic ticks consumed since last present
   * @param refreshMs text/FPS window length
   */
  tick(
    nowMs: number,
    frameMs: number,
    logicStepsThisPresent: number,
    refreshMs: number,
  ): PresentMeterSample {
    if (!Number.isFinite(this.windowStartMs)) this.windowStartMs = nowMs;

    this.frames += 1;
    this.logicSteps += Math.max(0, logicStepsThisPresent);

    this.pushRing(this.frameMsRing, Math.max(0, frameMs));

    const elapsed = nowMs - this.windowStartMs;
    if (elapsed >= Math.max(50, refreshMs)) {
      this.presentFps = computeIntegerFps(this.frames, elapsed);
      this.logicHz = computeIntegerFps(this.logicSteps, elapsed);
      this.pushRing(this.fpsRing, this.presentFps);
      this.windowStartMs = nowMs;
      this.frames = 0;
      this.logicSteps = 0;
    }

    return this.sample(frameMs);
  }

  sample(frameMs = 0): PresentMeterSample {
    const hist = this.frameMsRing;
    let min = frameMs;
    let max = frameMs;
    let sum = 0;
    if (hist.length > 0) {
      min = hist[0]!;
      max = hist[0]!;
      for (const v of hist) {
        if (v < min) min = v;
        if (v > max) max = v;
        sum += v;
      }
    }
    return {
      presentFps: this.presentFps,
      logicHz: this.logicHz,
      frameMs,
      frameMsMin: min,
      frameMsMax: max,
      frameMsAvg: hist.length > 0 ? sum / hist.length : frameMs,
      frameMsHistory: this.frameMsRing.slice(),
      fpsHistory: this.fpsRing.slice(),
    };
  }

  private pushRing(ring: number[], v: number): void {
    ring.push(v);
    while (ring.length > this.historyLength) ring.shift();
  }
}
