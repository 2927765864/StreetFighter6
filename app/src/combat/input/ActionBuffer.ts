import type { Intent } from '../types';

export type BufferedIntent = {
  intent: Intent;
  expiresAtLogicFrame: number;
};

/**
 * Layer A: single-slot action buffer (highest priority wins).
 * @see SuperCombo SF6 4f/7f; drkitt/godot-input-buffer semantics
 */
export class ActionBuffer {
  private slot: BufferedIntent | null = null;

  set(intent: Intent, now: number, ttlFrames: number): void {
    if (intent.kind === 'none') return;
    const expiresAtLogicFrame = now + Math.max(0, ttlFrames);
    if (!this.slot || intent.priority >= this.slot.intent.priority) {
      this.slot = { intent, expiresAtLogicFrame };
    }
  }

  peek(): BufferedIntent | null {
    return this.slot;
  }

  /** Drop expired; return intent if still valid (caller decides execute). */
  takeIfValid(now: number): Intent | null {
    if (!this.slot) return null;
    if (now > this.slot.expiresAtLogicFrame) {
      this.slot = null;
      return null;
    }
    const intent = this.slot.intent;
    this.slot = null;
    return intent;
  }

  /** Remaining frames until expiry (0 if empty/expired). */
  remaining(now: number): number {
    if (!this.slot) return 0;
    return Math.max(0, this.slot.expiresAtLogicFrame - now);
  }

  clear(): void {
    this.slot = null;
  }

  summary(now: number): string {
    if (!this.slot) return '—';
    const left = this.slot.expiresAtLogicFrame - now;
    if (left < 0) return 'expired';
    const id = this.slot.intent.moveId ?? this.slot.intent.kind;
    return `${id} t-${left}`;
  }
}
