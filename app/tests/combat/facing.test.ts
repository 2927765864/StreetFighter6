import { describe, expect, it } from 'vitest';
import { toFacingRelative } from '../../src/combat/input/facing';

describe('toFacingRelative', () => {
  it('identity when facing right', () => {
    expect(toFacingRelative(6, 1)).toBe(6);
    expect(toFacingRelative(4, 1)).toBe(4);
    expect(toFacingRelative(2, 1)).toBe(2);
  });

  it('mirrors L/R when facing left', () => {
    expect(toFacingRelative(6, -1)).toBe(4);
    expect(toFacingRelative(4, -1)).toBe(6);
    expect(toFacingRelative(1, -1)).toBe(3);
    expect(toFacingRelative(3, -1)).toBe(1);
    expect(toFacingRelative(7, -1)).toBe(9);
    expect(toFacingRelative(9, -1)).toBe(7);
    expect(toFacingRelative(2, -1)).toBe(2);
    expect(toFacingRelative(5, -1)).toBe(5);
    expect(toFacingRelative(8, -1)).toBe(8);
  });

});
