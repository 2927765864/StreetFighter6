import {
  aabbOverlap,
  overlapDepthX,
  type Box,
} from '../boxes/Box2D';

export type PushBody = {
  x: number;
  airborne?: boolean;
  worldPushBoxes(): Box[];
};

export type StageBounds = {
  minX: number;
  maxX: number;
};

export type PushResolveResult = {
  /** Max horizontal overlap before separation this step. */
  maxOverlapX: number;
  separated: boolean;
};

const EPS = 1e-6;

/**
 * Horizontal pushbox separation (consensus §4.2/4.4).
 * Equal split; if a body is clamped to stage edge, remaining overlap goes to the other.
 * @see docs/plans/ai-execution-plan-boxes-push-block-displace-v0.md §7
 */
export function resolvePush(
  a: PushBody,
  b: PushBody,
  stage: StageBounds,
  opts?: { enabled?: boolean },
): PushResolveResult {
  if (opts?.enabled === false) {
    return { maxOverlapX: 0, separated: false };
  }

  let maxOverlapX = 0;
  const boxesA = a.worldPushBoxes();
  const boxesB = b.worldPushBoxes();

  for (const ba of boxesA) {
    for (const bb of boxesB) {
      if (!aabbOverlap(ba, bb)) continue;
      const ox = overlapDepthX(ba, bb);
      if (ox <= EPS) continue;
      maxOverlapX = Math.max(maxOverlapX, ox);

      // Direction: push B away from A (by centers); fallback +1
      let dir = Math.sign(b.x - a.x);
      if (dir === 0) dir = 1;

      const half = ox / 2;
      a.x -= dir * half;
      b.x += dir * half;
    }
  }

  clampX(a, stage);
  clampX(b, stage);

  // Corner second pass: if still overlapping and one is on wall, shove the free body
  for (const ba of a.worldPushBoxes()) {
    for (const bb of b.worldPushBoxes()) {
      if (!aabbOverlap(ba, bb)) continue;
      const ox = overlapDepthX(ba, bb);
      if (ox <= EPS) continue;
      maxOverlapX = Math.max(maxOverlapX, ox);
      let dir = Math.sign(b.x - a.x);
      if (dir === 0) dir = 1;

      const aAtMin = Math.abs(a.x - stage.minX) < EPS;
      const aAtMax = Math.abs(a.x - stage.maxX) < EPS;
      const bAtMin = Math.abs(b.x - stage.minX) < EPS;
      const bAtMax = Math.abs(b.x - stage.maxX) < EPS;

      if ((aAtMin || aAtMax) && !(bAtMin || bAtMax)) {
        b.x += dir * ox;
      } else if ((bAtMin || bAtMax) && !(aAtMin || aAtMax)) {
        a.x -= dir * ox;
      } else {
        a.x -= dir * (ox / 2);
        b.x += dir * (ox / 2);
      }
      clampX(a, stage);
      clampX(b, stage);
    }
  }

  return { maxOverlapX, separated: maxOverlapX > EPS };
}

function clampX(body: PushBody, stage: StageBounds): void {
  if (body.x < stage.minX) body.x = stage.minX;
  if (body.x > stage.maxX) body.x = stage.maxX;
}

/** Cumulative Place positions → per-frame dx (MMDK PlaceKey). */
export function placeCumToDx(placeCum: number[]): number[] {
  if (!placeCum.length) return [];
  const dx: number[] = new Array(placeCum.length);
  dx[0] = placeCum[0] ?? 0;
  for (let i = 1; i < placeCum.length; i++) {
    dx[i] = (placeCum[i] ?? 0) - (placeCum[i - 1] ?? 0);
  }
  return dx;
}
