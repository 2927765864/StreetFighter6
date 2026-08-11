import { aabbOverlap, type Box } from './Box2D';

export function hitOverlapsHurt(hit: Box, hurt: Box): boolean {
  return aabbOverlap(hit, hurt);
}
