/**
 * Idle/crouch loops often author a duplicate end key (== first) for DCC looping.
 * Three.js LoopRepeat plays that end key then wraps to the first → one-frame hitch.
 * Shorten clip.duration to the second-to-last key time so wrap happens first.
 */

import type { AnimationClip, KeyframeTrack } from 'three';

const DEFAULT_SAMPLE_HZ = 60;
const QUAT_DOT_MIN = 0.9995;
const VEC_EPS = 1e-4;
/** Prefer tracks with at least this many keys when voting. */
const MIN_DENSE_KEYS = 8;

function valueSize(track: KeyframeTrack): number {
  const n = track.times.length;
  if (n <= 0) return 0;
  return Math.floor(track.values.length / n);
}

function firstLastSimilar(track: KeyframeTrack): boolean {
  const n = track.times.length;
  if (n < 2) return false;
  const stride = valueSize(track);
  if (stride <= 0) return false;
  const a0 = 0;
  const a1 = (n - 1) * stride;
  if (stride === 4) {
    // quaternion
    let dot = 0;
    for (let i = 0; i < 4; i++) {
      dot += track.values[a0 + i]! * track.values[a1 + i]!;
    }
    return Math.abs(dot) >= QUAT_DOT_MIN;
  }
  let distSq = 0;
  for (let i = 0; i < stride; i++) {
    const d = track.values[a0 + i]! - track.values[a1 + i]!;
    distSq += d * d;
  }
  return distSq <= VEC_EPS * VEC_EPS * stride;
}

function secondLastTime(track: KeyframeTrack): number | null {
  const n = track.times.length;
  if (n < 2) return null;
  return track.times[n - 2]!;
}

/**
 * If dense tracks agree the last key duplicates the first, set
 * `clip.duration` to the max second-to-last key time (keys kept).
 * @returns true when duration was changed
 */
export function trimLoopDuplicateEndDuration(
  clip: AnimationClip,
  sampleHz = DEFAULT_SAMPLE_HZ,
): boolean {
  const dense = clip.tracks.filter((t) => t.times.length >= MIN_DENSE_KEYS);
  const voters = dense.length > 0 ? dense : clip.tracks.filter((t) => t.times.length >= 2);
  if (voters.length === 0) return false;

  let similar = 0;
  let secondLastMax = 0;
  let secondLastCount = 0;
  for (const t of voters) {
    if (!firstLastSimilar(t)) continue;
    similar++;
    const t2 = secondLastTime(t);
    if (t2 != null && Number.isFinite(t2)) {
      secondLastMax = Math.max(secondLastMax, t2);
      secondLastCount++;
    }
  }

  // Require unanimous agreement among voters (avoids constant helper tracks
  // outvoting a single dense moving bone when fallback voters are mixed).
  if (similar === 0 || similar < voters.length) return false;
  if (secondLastCount === 0) return false;

  const frame = 1 / Math.max(1, sampleHz);
  // Second-last should land about one sample before current duration
  if (clip.duration - secondLastMax < frame * 0.25) {
    // already trimmed or no room
    if (Math.abs(clip.duration - secondLastMax) < 1e-6) return false;
  }
  if (secondLastMax <= 1e-8 || secondLastMax >= clip.duration - 1e-8) {
    // Fallback: shave one authored sample
    const next = Math.max(0, clip.duration - frame);
    if (next >= clip.duration - 1e-8) return false;
    clip.duration = next;
    return true;
  }

  if (secondLastMax >= clip.duration - 1e-6) return false;
  clip.duration = secondLastMax;
  return true;
}

/** Apply {@link trimLoopDuplicateEndDuration} to each clip; returns how many changed. */
export function trimLoopDuplicateEndDurations(
  clips: AnimationClip[],
  sampleHz = DEFAULT_SAMPLE_HZ,
): number {
  let n = 0;
  for (const c of clips) {
    if (trimLoopDuplicateEndDuration(c, sampleHz)) n++;
  }
  return n;
}
