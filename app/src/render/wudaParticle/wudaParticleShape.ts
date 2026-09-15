/**
 * Cheap per-particle ellipse + free-size helpers for wuda InstancedMesh.
 * Shape variation rides the existing instance matrix (no extra buffers/draws).
 */

export type WudaGraphicKind = 'disc' | 'ring';

export type WudaEllipseShape = {
  /** Applied as scaleX = size * aspect, scaleY = size / aspect. */
  aspect: number;
  /** Radians, spin around the billboard normal (camera forward). */
  spin: number;
};

export function normalizeWudaGraphicKind(v: unknown): WudaGraphicKind {
  return v === 'ring' ? 'ring' : 'disc';
}

/**
 * Billboard squash perpendicular to the projected flight direction.
 * compress 0 → circle; 0.55 → oval ring flattened across the track
 * (major axis along flight, minor axis across it).
 * aspect > 1 makes scaleY (local, after spin) the minor axis.
 */
export function flightCompressAspect(compress: number): number {
  const c = compress > 0 ? (compress < 0.9 ? compress : 0.9) : 0;
  return 1 / Math.max(0.12, 1 - c);
}

/**
 * Spin so local +X aligns with velocity projected onto the camera plane.
 * Compressing Y then flattens the ring perpendicular to the flight track.
 */
export function billboardFlightSpin(
  velX: number,
  velY: number,
  velZ: number,
  camRightX: number,
  camRightY: number,
  camRightZ: number,
  camUpX: number,
  camUpY: number,
  camUpZ: number,
): number {
  const vx = velX * camRightX + velY * camRightY + velZ * camRightZ;
  const vy = velX * camUpX + velY * camUpY + velZ * camUpZ;
  if (vx * vx + vy * vy < 1e-10) return 0;
  return Math.atan2(vy, vx);
}

export function resolveWudaFlightRingShape(
  velX: number,
  velY: number,
  velZ: number,
  camRightX: number,
  camRightY: number,
  camRightZ: number,
  camUpX: number,
  camUpY: number,
  camUpZ: number,
  compress: number,
): WudaEllipseShape {
  return {
    aspect: flightCompressAspect(compress),
    spin: billboardFlightSpin(
      velX,
      velY,
      velZ,
      camRightX,
      camRightY,
      camRightZ,
      camUpX,
      camUpY,
      camUpZ,
    ),
  };
}

/** Deterministic 0..1 hash from index + salt (no allocation). */
export function wudaHash01(index: number, salt: number): number {
  let x = Math.imul(index ^ salt, 2654435761) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 2246822507) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 3266489917) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/**
 * Map two unit randoms into a mild ellipse + full spin.
 * aspectJitter 0 → circle; ~0.35 → noticeable irregular ellipses.
 */
export function resolveWudaEllipseShape(
  uAspect: number,
  uSpin: number,
  aspectJitter: number,
): WudaEllipseShape {
  const j = aspectJitter > 0 ? (aspectJitter < 0.85 ? aspectJitter : 0.85) : 0;
  const t = (uAspect > 0 ? (uAspect < 1 ? uAspect : 1) : 0) * 2 - 1;
  const aspect = Math.max(0.2, 1 + t * j);
  const spin = (uSpin > 0 ? (uSpin < 1 ? uSpin : 1) : 0) * Math.PI * 2;
  return { aspect, spin };
}

export function resolveWudaEllipseShapeFromIndex(
  index: number,
  seed: number,
  aspectJitter: number,
): WudaEllipseShape {
  return resolveWudaEllipseShape(
    wudaHash01(index, seed ^ 0x9e3779b9),
    wudaHash01(index, seed ^ 0x85ebca6b),
    aspectJitter,
  );
}

/** Uniform sample in [min, max] (order-insensitive). */
export function sampleWudaFreeSize(
  u: number,
  sizeMin: number,
  sizeMax: number,
): number {
  const a = sizeMin > 0 ? sizeMin : 0;
  const b = sizeMax > 0 ? sizeMax : 0;
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  const t = u > 0 ? (u < 1 ? u : 1) : 0;
  return lo + (hi - lo) * t;
}

/** Life fade used by coat free flight (keeps prior visual curve). */
export function wudaFreeSizeOverLife(baseSize: number, lifeT: number): number {
  const t = lifeT > 0 ? (lifeT < 1 ? lifeT : 1) : 0;
  return baseSize * (0.35 + 0.65 * t);
}
