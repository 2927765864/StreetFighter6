import { describe, expect, it } from 'vitest';
import {
  NumberKeyframeTrack,
  QuaternionKeyframeTrack,
  AnimationClip,
} from 'three';
import { trimLoopDuplicateEndDuration } from '../../src/render/loopClipTrim';

/** 10 samples @60Hz so the track counts as "dense" (≥8 keys). */
function makeLoopClip(duplicateEnd: boolean): AnimationClip {
  const unique = 9; // indices 0..8
  const n = duplicateEnd ? unique + 1 : unique;
  const times: number[] = [];
  const quats: number[] = [];
  for (let i = 0; i < n; i++) {
    times.push(i / 60);
    if (duplicateEnd && i === n - 1) {
      quats.push(quats[0]!, quats[1]!, quats[2]!, quats[3]!);
    } else {
      const a = i * 0.1;
      quats.push(0, Math.sin(a / 2), 0, Math.cos(a / 2));
    }
  }
  const track = new QuaternionKeyframeTrack('C_Hip.quaternion', times, quats);
  return new AnimationClip('idle_loop', times[times.length - 1]!, [track]);
}

describe('trimLoopDuplicateEndDuration', () => {
  it('shortens duration when last key duplicates first', () => {
    const clip = makeLoopClip(true);
    const before = clip.duration;
    expect(before).toBeCloseTo(9 / 60, 5);
    const changed = trimLoopDuplicateEndDuration(clip);
    expect(changed).toBe(true);
    expect(clip.duration).toBeCloseTo(8 / 60, 5);
    expect(clip.duration).toBeLessThan(before);
    expect(clip.tracks[0]!.times.length).toBe(10);
  });

  it('leaves non-loop (distinct end) clips unchanged', () => {
    const clip = makeLoopClip(false);
    const before = clip.duration;
    const changed = trimLoopDuplicateEndDuration(clip);
    expect(changed).toBe(false);
    expect(clip.duration).toBe(before);
  });

  it('is idempotent after a successful trim', () => {
    const clip = makeLoopClip(true);
    expect(trimLoopDuplicateEndDuration(clip)).toBe(true);
    const mid = clip.duration;
    expect(trimLoopDuplicateEndDuration(clip)).toBe(false);
    expect(clip.duration).toBe(mid);
  });

  it('does not trim when dense moving track disagrees with constant helper', () => {
    const times: number[] = [];
    const hipVals: number[] = [];
    for (let i = 0; i < 10; i++) {
      times.push(i / 60);
      const a = i * 0.2;
      hipVals.push(0, Math.sin(a / 2), 0, Math.cos(a / 2));
    }
    const hip = new QuaternionKeyframeTrack('C_Hip.quaternion', times, hipVals);
    const helper = new NumberKeyframeTrack(
      'Helper.position',
      [0, 9 / 60],
      [0, 0, 0, 0, 0, 0],
    );
    const clip = new AnimationClip('atk', 9 / 60, [hip, helper]);
    expect(trimLoopDuplicateEndDuration(clip)).toBe(false);
  });
});
