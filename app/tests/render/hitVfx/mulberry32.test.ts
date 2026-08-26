import { describe, expect, it } from 'vitest';
import { createMulberry32 } from '../../../src/render/hitVfx/mulberry32';

describe('mulberry32', () => {
  it('same seed yields identical sequence', () => {
    const a = createMulberry32(1);
    const b = createMulberry32(1);
    const seqA = [a.float(), a.float(), a.float(), a.range(0, 10), a.int(0, 5)];
    const seqB = [b.float(), b.float(), b.float(), b.range(0, 10), b.int(0, 5)];
    expect(seqA).toEqual(seqB);
  });

  it('different seeds diverge', () => {
    const a = createMulberry32(1);
    const b = createMulberry32(2);
    expect(a.float()).not.toBe(b.float());
  });
});
