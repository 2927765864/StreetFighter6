/**
 * Box convention (ADR-002): x,y = center; w,h = full width/height.
 * facingRelative local boxes: world x = originX + facing * local.x
 */
export type Box = { x: number; y: number; w: number; h: number };

export function aabbOverlap(a: Box, b: Box): boolean {
  return (
    Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h
  );
}

/** Horizontal overlap depth (>0 if overlapping on X). */
export function overlapDepthX(a: Box, b: Box): number {
  const left = Math.max(a.x - a.w / 2, b.x - b.w / 2);
  const right = Math.min(a.x + a.w / 2, b.x + b.w / 2);
  return right - left;
}

/** Vertical overlap depth (>0 if overlapping on Y). */
export function overlapDepthY(a: Box, b: Box): number {
  const bottom = Math.max(a.y - a.h / 2, b.y - b.h / 2);
  const top = Math.min(a.y + a.h / 2, b.y + b.h / 2);
  return top - bottom;
}

export function faceBox(
  local: Box,
  originX: number,
  originY: number,
  facing: 1 | -1,
): Box {
  return {
    x: originX + facing * local.x,
    y: originY + local.y,
    w: local.w,
    h: local.h,
  };
}
