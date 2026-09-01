import { describe, expect, it } from 'vitest';
import {
  DRAG_SCRUB_DEFAULT_STEP,
  resolveDragScrubStep,
} from '../../src/debug/dragScrub';

describe('resolveDragScrubStep', () => {
  it('defaults step=any / empty / invalid to 0.01', () => {
    expect(DRAG_SCRUB_DEFAULT_STEP).toBe(0.01);
    expect(resolveDragScrubStep('any')).toBe(0.01);
    expect(resolveDragScrubStep('')).toBe(0.01);
    expect(resolveDragScrubStep('nope')).toBe(0.01);
    expect(resolveDragScrubStep('-1')).toBe(0.01);
    expect(resolveDragScrubStep('0')).toBe(0.01);
  });

  it('keeps explicit positive steps', () => {
    expect(resolveDragScrubStep('1')).toBe(1);
    expect(resolveDragScrubStep('0.01')).toBe(0.01);
    expect(resolveDragScrubStep('0.05')).toBe(0.05);
    expect(resolveDragScrubStep('2')).toBe(2);
  });
});
