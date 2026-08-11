import type { Box } from '../boxes/Box2D';
import type { MoveDefinition, TimedBox } from './MoveDefinition';

/**
 * Frame indexing (ADR-003):
 * moveFrame is 0-based.
 * hitActive when: moveFrame >= (startup - 1) && moveFrame < (startup - 1 + active)
 */
export class MovePlayer {
  move: MoveDefinition | null = null;
  moveFrame = 0;
  hasHitThisMove = false;

  get active(): boolean {
    return this.move !== null;
  }

  get total(): number {
    return this.move?.frames.total ?? 0;
  }

  get moveId(): string | null {
    return this.move?.moveId ?? null;
  }

  start(move: MoveDefinition): void {
    this.move = move;
    this.moveFrame = 0;
    this.hasHitThisMove = false;
  }

  /** Advance one logic frame. Returns true if move finished this step. */
  advance(): boolean {
    if (!this.move) return false;
    this.moveFrame += 1;
    if (this.moveFrame >= this.move.frames.total) {
      this.move = null;
      this.moveFrame = 0;
      this.hasHitThisMove = false;
      return true;
    }
    return false;
  }

  isHitActive(): boolean {
    if (!this.move) return false;
    const { startup, active } = this.move.frames;
    const start = startup - 1;
    return this.moveFrame >= start && this.moveFrame < start + active;
  }

  /**
   * Cancel window query — token in window.into split by |.
   * Does NOT invent full-move cancel if windows empty (consensus §3.5).
   */
  inCancelWindow(token: string): boolean {
    if (!this.move) return false;
    const windows = this.move.cancel.windows;
    if (!windows.length) return false;
    const f = this.moveFrame;
    const t = token.toLowerCase();
    for (const w of windows) {
      if (f < w.fromFrame || f > w.toFrame) continue;
      const parts = w.into.toLowerCase().split('|').map((s) => s.trim());
      if (parts.includes(t)) return true;
    }
    return false;
  }

  private boxesAt(list: TimedBox[]): Box[] {
    if (!this.move) return [];
    const f = this.moveFrame;
    return list
      .filter((b) => f >= b.from && f <= b.to)
      .map(({ x, y, w, h }) => ({ x, y, w, h }));
  }

  currentHitBoxesLocal(): Box[] {
    if (!this.move) return [];
    if (this.move.boxes.hit.length > 0) {
      return this.boxesAt(this.move.boxes.hit);
    }
    if (!this.isHitActive()) return [];
    return [{ x: 0.35, y: 1.1, w: 0.55, h: 0.35 }];
  }

  currentHurtBoxesLocal(): Box[] {
    if (!this.move) {
      return [{ x: 0, y: 0.85, w: 0.7, h: 1.7 }];
    }
    const boxes = this.boxesAt(this.move.boxes.hurt);
    if (boxes.length > 0) return boxes;
    return [{ x: 0, y: 0.85, w: 0.7, h: 1.7 }];
  }

  cancelSummary(): string {
    if (!this.move) return '—';
    const c = this.move.cancel;
    const inSp = this.inCancelWindow('special');
    const w0 = c.windows[0];
    const win = w0 ? `${w0.fromFrame}-${w0.toFrame}` : 'none';
    return `special=${c.specialCancel} in=${inSp ? 1 : 0} win=${win}`;
  }
}
