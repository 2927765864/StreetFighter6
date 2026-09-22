import { describe, expect, it } from 'vitest';
import {
  ageDeferredHitFeedback,
  enqueueDeferredHitFeedback,
  normalizeHitFeedbackDelayFrames,
  type DeferredHitFeedback,
} from '../../src/render/hitFeedbackDelay';

describe('hitFeedbackDelay', () => {
  it('normalizes delay to integer 0..8', () => {
    expect(normalizeHitFeedbackDelayFrames(-1)).toBe(0);
    expect(normalizeHitFeedbackDelayFrames(1.9)).toBe(1);
    expect(normalizeHitFeedbackDelayFrames(99)).toBe(8);
    expect(normalizeHitFeedbackDelayFrames('x')).toBe(0);
  });

  it('delay 0 fires on the enqueue present', () => {
    const q: DeferredHitFeedback<string>[] = [];
    enqueueDeferredHitFeedback(q, 'a', 0);
    expect(ageDeferredHitFeedback(q)).toEqual(['a']);
    expect(q).toEqual([]);
  });

  it('delay 1: contact present holds, next present fires', () => {
    const q: DeferredHitFeedback<string>[] = [];
    enqueueDeferredHitFeedback(q, 'juice', 1);
    expect(ageDeferredHitFeedback(q)).toEqual([]);
    expect(q).toHaveLength(1);
    expect(q[0]!.skipPresents).toBe(0);
    expect(ageDeferredHitFeedback(q)).toEqual(['juice']);
    expect(q).toEqual([]);
  });

  it('delay 2 skips two presents then fires', () => {
    const q: DeferredHitFeedback<string>[] = [];
    enqueueDeferredHitFeedback(q, 'juice', 2);
    expect(ageDeferredHitFeedback(q)).toEqual([]);
    expect(ageDeferredHitFeedback(q)).toEqual([]);
    expect(ageDeferredHitFeedback(q)).toEqual(['juice']);
  });

  it('preserves FIFO across mixed delays', () => {
    const q: DeferredHitFeedback<string>[] = [];
    enqueueDeferredHitFeedback(q, 'first', 1);
    enqueueDeferredHitFeedback(q, 'second', 0);
    expect(ageDeferredHitFeedback(q)).toEqual(['second']);
    expect(ageDeferredHitFeedback(q)).toEqual(['first']);
  });
});
