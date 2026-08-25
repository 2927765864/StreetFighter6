import { describe, expect, it } from 'vitest';
import {
  blendStopFlagsForFreezeSnap,
  walkFreezeSnapLayer,
} from '../../src/combat/loco/walkFreezeSnap';

describe('walkFreezeSnap helpers', () => {
  it('picks from while blend to-weight is still low', () => {
    expect(walkFreezeSnapLayer(0)).toBe('from');
    expect(walkFreezeSnapLayer(0.49)).toBe('from');
    expect(walkFreezeSnapLayer(0.5)).toBe('to');
    expect(walkFreezeSnapLayer(1)).toBe('to');
  });

  it('never stops the snap layer when clearing a blend', () => {
    expect(blendStopFlagsForFreezeSnap('from')).toEqual({
      stopFrom: false,
      stopTo: true,
    });
    expect(blendStopFlagsForFreezeSnap('to')).toEqual({
      stopFrom: true,
      stopTo: false,
    });
  });
});
