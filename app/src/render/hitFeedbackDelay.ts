/**
 * Presentation-only delay for hit juice (VFX / screen shake / composites).
 * Contact frame shows the defender hit-react pose first; juice fires after N
 * presents that included a logic step. Combat / SFX stay on the contact frame.
 */

export type DeferredHitFeedback<T> = {
  payload: T;
  /** Remaining presents-with-logic to skip before this payload is ready. */
  skipPresents: number;
};

export function normalizeHitFeedbackDelayFrames(raw: unknown): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
  return Math.max(0, Math.min(8, Math.floor(n)));
}

export function enqueueDeferredHitFeedback<T>(
  queue: DeferredHitFeedback<T>[],
  payload: T,
  delayFrames: number,
): void {
  queue.push({
    payload,
    skipPresents: normalizeHitFeedbackDelayFrames(delayFrames),
  });
}

/**
 * Age one present that included logic. Returns payloads ready to fire now.
 * Items with skipPresents>0 decrement and stay queued; 0 fires immediately.
 */
export function ageDeferredHitFeedback<T>(
  queue: DeferredHitFeedback<T>[],
): T[] {
  const ready: T[] = [];
  let write = 0;
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i]!;
    if (item.skipPresents > 0) {
      item.skipPresents -= 1;
      queue[write++] = item;
      continue;
    }
    ready.push(item.payload);
  }
  queue.length = write;
  return ready;
}
