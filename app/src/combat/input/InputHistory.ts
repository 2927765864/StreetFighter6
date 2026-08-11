import type { InputSample, NumpadDir } from '../types';

export type HistoryEntry = {
  relDir: NumpadDir;
  buttons: number;
  pressed: number;
  logicFrame: number;
};

/**
 * Layer B storage: per-logic-frame input history (motion matching).
 * Replaces bare InputBuffer ring; keeps formatDirs for HUD.
 */
export class InputHistory {
  private buf: HistoryEntry[] = [];

  constructor(public capacity = 32) {}

  push(sample: InputSample, logicFrame: number): void {
    this.buf.push({
      relDir: sample.relDir,
      buttons: sample.buttons,
      pressed: sample.pressed,
      logicFrame,
    });
    while (this.buf.length > this.capacity) this.buf.shift();
  }

  latest(): HistoryEntry | null {
    return this.buf.length ? this.buf[this.buf.length - 1]! : null;
  }

  entries(): readonly HistoryEntry[] {
    return this.buf;
  }

  formatDirs(): string {
    return this.buf.map((s) => s.relDir).join('');
  }

  setCapacity(n: number): void {
    this.capacity = Math.max(1, n);
    while (this.buf.length > this.capacity) this.buf.shift();
  }

  clear(): void {
    this.buf = [];
  }
}

/** @deprecated alias — prefer InputHistory */
export { InputHistory as InputBuffer };
