import { describe, expect, it } from 'vitest';
import { resolveNumpadDir } from '../../src/combat/input/KeyboardSource';

describe('resolveNumpadDir left+right SOCD', () => {
  it('cancels left+right to 5', () => {
    expect(resolveNumpadDir(false, false, true, true)).toBe(5);
  });

  it('cancels left+right while down to 2', () => {
    expect(resolveNumpadDir(false, true, true, true)).toBe(2);
  });

  it('cancels left+right while up to 8', () => {
    expect(resolveNumpadDir(true, false, true, true)).toBe(8);
  });

  it('keeps a single horizontal', () => {
    expect(resolveNumpadDir(false, false, true, false)).toBe(4);
    expect(resolveNumpadDir(false, false, false, true)).toBe(6);
  });

  it('keeps diagonals when only one horizontal is held', () => {
    expect(resolveNumpadDir(false, true, true, false)).toBe(1);
    expect(resolveNumpadDir(false, true, false, true)).toBe(3);
    expect(resolveNumpadDir(true, false, true, false)).toBe(7);
    expect(resolveNumpadDir(true, false, false, true)).toBe(9);
  });
});
