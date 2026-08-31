import * as THREE from 'three/webgpu';

/** Default cube grid (lighter than official 100×100×200 fire). */
export const GRID = 48;
export const CELL_COUNT = GRID * GRID * GRID;
/** Jacobi iterations — must stay even (official volume_fire comment). */
export const PRESSURE_ITERATIONS = 6;
export const VOLUME_WORLD_SIZE = new THREE.Vector3(3, 3, 3);

/**
 * HalfFloat Storage3DTexture — copy settings from webgpu_volume_fire.html createStorage3D.
 * Do not mutate wrap/filter after first GPU use (three.js #31886).
 */
export function createStorage3D(
  name: string,
  sx = GRID,
  sy = GRID,
  sz = GRID,
): THREE.Storage3DTexture {
  const texture = new THREE.Storage3DTexture(sx, sy, sz);
  texture.name = name;
  texture.format = THREE.RGBAFormat;
  // discourse #85272 — 8-bit storage destroys fluid math
  texture.type = THREE.HalfFloatType;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.wrapR = THREE.ClampToEdgeWrapping;
  return texture;
}
