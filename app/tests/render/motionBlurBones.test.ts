import { describe, expect, it } from 'vitest';
import { copyMotionBlurBones, MOTION_BLUR_MAX_BONES } from '../../src/render/motionBlurBones';

describe('motion blur complete skeletal poses', () => {
  it('covers every joint in the shipping fighter, including the last joint', () => {
    // Verified on Ryu's runtime and textured GLBs. Keep the regression fixture
    // independent of large art assets, which are not committed to the repository.
    const count = 679;
    expect(count).toBeGreaterThan(384);
    expect(count).toBeLessThanOrEqual(MOTION_BLUR_MAX_BONES);
    const pose = Float32Array.from({ length: count * 16 }, (_, i) => i / 32);
    const dest = new Float32Array(MOTION_BLUR_MAX_BONES * 16);
    copyMotionBlurBones(dest, pose);
    expect(dest.subarray(0, pose.length)).toEqual(pose);
  });

  it('clears a previous larger pose when switching to a smaller fighter', () => {
    const dest = new Float32Array(MOTION_BLUR_MAX_BONES * 16).fill(7);
    copyMotionBlurBones(dest, new Float32Array(16));
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    expect(Array.from(dest.slice(16, 32))).toEqual(identity);
    expect(Array.from(dest.slice(-16))).toEqual(identity);
    copyMotionBlurBones(dest, null);
    expect(Array.from(dest.slice(0, 16))).toEqual(identity);
  });

  it('does not silently truncate an unsupported pose', () => {
    expect(() => copyMotionBlurBones(new Float32Array(16), new Float32Array(32))).toThrow(RangeError);
  });
});
