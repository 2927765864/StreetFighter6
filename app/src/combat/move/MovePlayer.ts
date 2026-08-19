import type { Box } from '../boxes/Box2D';
import type { MoveDefinition, TimedBox } from './MoveDefinition';
import { inferTimelineFrames } from './MoveDefinition';
import {
  hitGroupAtFrame,
  hitGroupRanges,
  lastHitGroupFrame,
  type HitGroupRange,
} from './HitGroups';

/**
 * Frame indexing (ADR-003):
 * moveFrame is 0-based.
 * hitActive when: moveFrame >= (startup - 1) && moveFrame < (startup - 1 + active)
 *
 * Logic total (canAct) vs timeline (boxes/Place residual): consensus §3.12.
 * advance() still ends the locked attack at frames.total; residual is owned by Fighter.
 */
export class MovePlayer {
  move: MoveDefinition | null = null;
  moveFrame = 0;
  landedHitGroups = new Set<number>();
  private groupCache: HitGroupRange[] | null = null;

  get hasHitThisMove(): boolean {
    return this.landedHitGroups.size > 0;
  }

  get active(): boolean {
    return this.move !== null;
  }

  get total(): number {
    return this.move?.frames.total ?? 0;
  }

  get timelineFrames(): number {
    if (!this.move) return 0;
    return inferTimelineFrames(this.move);
  }

  get moveId(): string | null {
    return this.move?.moveId ?? null;
  }

  start(move: MoveDefinition): void {
    this.move = move;
    this.moveFrame = 0;
    this.landedHitGroups = new Set();
    this.groupCache = null;
  }

  hitGroups(): HitGroupRange[] {
    if (!this.move) return [];
    if (!this.groupCache) {
      this.groupCache = hitGroupRanges(this.move.boxes.hit, this.move.hitCount ?? 1, {
        startup: this.move.frames.startup,
        active: this.move.frames.active,
      });
    }
    return this.groupCache;
  }

  unresolvedHitGroupAtCurrentFrame(): number | null {
    const g = hitGroupAtFrame(this.hitGroups(), this.moveFrame);
    if (g == null || this.landedHitGroups.has(g)) return null;
    return g;
  }

  markHitGroupLanded(group: number): void {
    this.landedHitGroups.add(group);
  }

  allHitWindowsPassed(): boolean {
    if (!this.move) return true;
    return this.moveFrame > lastHitGroupFrame(this.hitGroups());
  }

  /** Advance one logic frame. Returns true if logic total finished this step. */
  advance(): boolean {
    if (!this.move) return false;
    this.moveFrame += 1;
    if (this.moveFrame >= this.move.frames.total) {
      this.move = null;
      this.moveFrame = 0;
      this.landedHitGroups = new Set();
      this.groupCache = null;
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

  private boxesAt(list: TimedBox[], frame: number): Box[] {
    return list
      .filter((b) => frame >= b.from && frame <= b.to)
      .map(({ x, y, w, h }) => ({ x, y, w, h }));
  }

  currentHitBoxesLocal(): Box[] {
    if (!this.move) return [];
    if (this.move.boxes.hit.length > 0) {
      return this.boxesAt(this.move.boxes.hit, this.moveFrame);
    }
    if (!this.isHitActive()) return [];
    return [{ x: 0.35, y: 1.1, w: 0.55, h: 0.35 }];
  }

  currentHurtBoxesLocal(): Box[] {
    if (!this.move) {
      return [{ x: 0, y: 0.85, w: 0.7, h: 1.7 }];
    }
    const boxes = this.boxesAt(this.move.boxes.hurt, this.moveFrame);
    if (boxes.length > 0) return boxes;
    return [{ x: 0, y: 0.85, w: 0.7, h: 1.7 }];
  }

  currentPushBoxesLocal(): Box[] {
    if (!this.move) {
      return [{ x: 0, y: 0.7, w: 0.55, h: 1.4 }];
    }
    const boxes = this.boxesAt(this.move.boxes.push ?? [], this.moveFrame);
    if (boxes.length > 0) return boxes;
    return [{ x: 0, y: 0.7, w: 0.55, h: 1.4 }];
  }

  /** Sample boxes for an arbitrary local frame (attack residual timeline). */
  static boxesAtFrame(
    move: MoveDefinition,
    frame: number,
    kind: 'hit' | 'hurt' | 'push',
  ): Box[] {
    const list =
      kind === 'hit'
        ? move.boxes.hit
        : kind === 'hurt'
          ? move.boxes.hurt
          : (move.boxes.push ?? []);
    const out = list
      .filter((b) => frame >= b.from && frame <= b.to)
      .map(({ x, y, w, h }) => ({ x, y, w, h }));
    if (out.length > 0) return out;
    if (kind === 'hurt') return [{ x: 0, y: 0.85, w: 0.7, h: 1.7 }];
    if (kind === 'push') return [{ x: 0, y: 0.7, w: 0.55, h: 1.4 }];
    return [];
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
