import { aabbOverlap, type Box } from './Box2D';

export function hitOverlapsHurt(hit: Box, hurt: Box): boolean {
  return aabbOverlap(hit, hurt);
}

/** Any hit box vs any hurt box. */
export function anyHitOverlapsHurt(hits: Box[], hurts: Box[]): boolean {
  for (const h of hits) {
    for (const u of hurts) {
      if (aabbOverlap(h, u)) return true;
    }
  }
  return false;
}
