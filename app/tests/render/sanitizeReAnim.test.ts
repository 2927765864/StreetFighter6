import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  RE_POS_TOXIC_ABS,
  sanitizeReAnimationClips,
  sanitizeRePositionTrack,
} from '../../src/render/materialUtils';

function vecTrack(
  name: string,
  times: number[],
  values: number[],
): THREE.VectorKeyframeTrack {
  return new THREE.VectorKeyframeTrack(name, times, values);
}

describe('sanitizeRePositionTrack', () => {
  it('keeps healthy hip bob (idle-like meters)', () => {
    const t = vecTrack('C_Hip.position', [0, 1], [0, 0.91, 0, 0.02, 1.01, 0]);
    const r = sanitizeRePositionTrack(t);
    expect(r.keep).toBe(true);
    expect(r.scaled).toBe(false);
    expect(r.track.values[1]).toBeCloseTo(0.91);
  });

  it('keeps crouch hip drop below stand bind', () => {
    const t = vecTrack('C_Hip.position', [0, 1], [0, 0.63, 0, 0, 0.66, 0]);
    const r = sanitizeRePositionTrack(t);
    expect(r.keep).toBe(true);
    expect(trackAbsMax(r.track.values)).toBeLessThan(RE_POS_TOXIC_ABS);
  });

  it('scales FBX-cm-like toxic tracks by 0.01', () => {
    const t = vecTrack('C_Hip.position', [0, 1], [0, -90, 0, 0, -105, 0]);
    const r = sanitizeRePositionTrack(t);
    expect(r.keep).toBe(true);
    expect(r.scaled).toBe(true);
    expect(r.track.values[1]).toBeCloseTo(-0.9);
    expect(r.track.values[4]).toBeCloseTo(-1.05);
  });

  it('drops unrecoverable huge positions', () => {
    const t = vecTrack('C_Hip.position', [0], [0, 1e6, 0]);
    const r = sanitizeRePositionTrack(t);
    expect(r.keep).toBe(false);
  });
});

describe('sanitizeReAnimationClips', () => {
  it('does not strip all position tracks (hip Y preserved)', () => {
    const clip = new THREE.AnimationClip('idle', 1, [
      vecTrack('C_Hip.position', [0, 1], [0, 0.95, 0, 0, 1.0, 0]),
      new THREE.QuaternionKeyframeTrack(
        'C_Hip.quaternion',
        [0],
        [0, 0, 0, 1],
      ),
      vecTrack('L_Foot.position', [0], [0, -0.405, 0]),
    ]);
    const [out] = sanitizeReAnimationClips([clip]);
    const pos = out!.tracks.filter((t) => t.name.endsWith('.position'));
    expect(pos.length).toBe(2);
    const hip = pos.find((t) => t.name.includes('C_Hip'))!;
    expect(hip.values[1]).toBeCloseTo(0.95);
    expect(hip.values[4]).toBeCloseTo(1.0);
  });

  it('drops Armature quaternion tracks', () => {
    const clip = new THREE.AnimationClip('x', 1, [
      new THREE.QuaternionKeyframeTrack(
        'Armature.quaternion',
        [0],
        [0.7, 0, 0, 0.7],
      ),
      new THREE.QuaternionKeyframeTrack('C_Hip.quaternion', [0], [0, 0, 0, 1]),
    ]);
    const [out] = sanitizeReAnimationClips([clip]);
    expect(out!.tracks.some((t) => /Armature\.quaternion/i.test(t.name))).toBe(
      false,
    );
    expect(out!.tracks.some((t) => t.name.includes('C_Hip'))).toBe(true);
  });
});

function trackAbsMax(values: ArrayLike<number>): number {
  let m = 0;
  for (let i = 0; i < values.length; i++) {
    m = Math.max(m, Math.abs(values[i]!));
  }
  return m;
}
