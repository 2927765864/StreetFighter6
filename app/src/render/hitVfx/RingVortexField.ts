/**
 * Punch smoke-ring velocity field via helix-noise.
 *
 * Real API (helix-noise@1.11.3):
 * - createRing({ center, axis, radius, core, circulation, advect })
 * - create({ helicity, coherence, decay, seed, amplitude, modes, ... })
 * - compose(...fields)
 * - field.bakePotential3D(n) → { data: Float32Array, size, channels: 4 }
 *
 * Plume EmissionShape "ring" births in the **XZ plane** (axis = local +Y).
 * Therefore helix rings use axis [0,1,0] to match.
 *
 * Do NOT use bake3D(velocity) as the GPU sample source — sample the potential
 * and finite-difference curl in the shader (helix-noise README).
 */
import * as THREE from 'three';
import { compose, create, createRing, type FlowField } from 'helix-noise';

export type RingVortexFieldParams = {
  ringRadius: number;
  tubeRadius: number;
  /** Mapped to createRing circulation Γ. */
  vortexStrength: number;
  /** Mapped to spectral noise create().amplitude. */
  curlAmplitude: number;
  /** Mapped to create().kmax ≈ 3 + curlFrequency. */
  curlFrequency?: number;
  /** Mapped to create().churn. */
  curlSpeed?: number;
  helixHelicity: number;
  helixCoherence: number;
  helixDecay: number;
  potentialGrid: 16 | 32 | 48;
  seed: number;
};

export type RingVortexBake = {
  /** RGB = vector potential A; A channel unused (kept for RGBA). */
  texture: THREE.Data3DTexture;
  /** Half-extent of the local sampling box (same on X/Y/Z). */
  halfExtent: number;
  grid: number;
  field: FlowField;
};

/** Local punch axis for Plume ring birth (XZ ring → +Y). */
export const PLUME_RING_AXIS = new THREE.Vector3(0, 1, 0);

export function ringHalfExtent(ringRadius: number, tubeRadius: number): number {
  return Math.max(0.05, ringRadius + 4 * Math.max(tubeRadius, 0.01));
}

export function createPunchRingField(
  params: RingVortexFieldParams,
): FlowField {
  const core = Math.min(
    Math.max(params.tubeRadius, 0.005),
    params.ringRadius * 0.95,
  );
  const ring = createRing({
    center: [0, 0, 0],
    axis: [0, 1, 0],
    radius: Math.max(params.ringRadius, 0.02),
    core,
    circulation: params.vortexStrength,
    advect: false,
  });
  const noiseAmp = Math.max(0, params.curlAmplitude) * 0.25;
  if (noiseAmp < 1e-6) return ring;
  const noise = create({
    seed: params.seed >>> 0,
    helicity: params.helixHelicity,
    coherence: params.helixCoherence,
    decay: params.helixDecay,
    amplitude: noiseAmp,
    modes: 32,
    churn: params.curlSpeed ?? 0.35,
    kmax: 3 + Math.max(0.5, params.curlFrequency ?? 1.8),
  });
  return compose(ring, noise);
}

export function bakePunchRingPotential(
  params: RingVortexFieldParams,
): RingVortexBake {
  const field = createPunchRingField(params);
  const grid = params.potentialGrid;
  const baked = field.bakePotential3D(grid);
  const texture = new THREE.Data3DTexture(
    baked.data,
    baked.size,
    baked.size,
    baked.size,
  );
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.FloatType;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.wrapR = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return {
    texture,
    halfExtent: ringHalfExtent(params.ringRadius, params.tubeRadius),
    grid,
    field,
  };
}

/**
 * CPU finite-difference curl of a potential bake (for tests).
 * data layout: RGBA float, rgb = A.
 */
export function meanAbsDivergenceFromPotentialBake(
  data: Float32Array,
  size: number,
  sampleCount: number,
  seed: number,
): number {
  const rng = mulberry(seed);
  let sum = 0;
  const h = 1 / size;
  for (let n = 0; n < sampleCount; n++) {
    const i = 1 + Math.floor(rng() * (size - 2));
    const j = 1 + Math.floor(rng() * (size - 2));
    const k = 1 + Math.floor(rng() * (size - 2));
    const divx =
      (curlAt(data, size, i + 1, j, k, h)[0] -
        curlAt(data, size, i - 1, j, k, h)[0]) /
      (2 * h);
    const divy =
      (curlAt(data, size, i, j + 1, k, h)[1] -
        curlAt(data, size, i, j - 1, k, h)[1]) /
      (2 * h);
    const divz =
      (curlAt(data, size, i, j, k + 1, h)[2] -
        curlAt(data, size, i, j, k - 1, h)[2]) /
      (2 * h);
    sum += Math.abs(divx + divy + divz);
  }
  return sum / sampleCount;
}

export function meanAbsDivergenceFromVelocityBake(
  data: Float32Array,
  size: number,
  sampleCount: number,
  seed: number,
): number {
  const rng = mulberry(seed);
  let sum = 0;
  const h = 1 / size;
  for (let n = 0; n < sampleCount; n++) {
    const i = 1 + Math.floor(rng() * (size - 2));
    const j = 1 + Math.floor(rng() * (size - 2));
    const k = 1 + Math.floor(rng() * (size - 2));
    const divx =
      (comp(data, size, i + 1, j, k, 0) - comp(data, size, i - 1, j, k, 0)) /
      (2 * h);
    const divy =
      (comp(data, size, i, j + 1, k, 1) - comp(data, size, i, j - 1, k, 1)) /
      (2 * h);
    const divz =
      (comp(data, size, i, j, k + 1, 2) - comp(data, size, i, j, k - 1, 2)) /
      (2 * h);
    sum += Math.abs(divx + divy + divz);
  }
  return sum / sampleCount;
}

function curlAt(
  data: Float32Array,
  size: number,
  i: number,
  j: number,
  k: number,
  h: number,
): [number, number, number] {
  const dAz_dy =
    (Az(data, size, i, j + 1, k) - Az(data, size, i, j - 1, k)) / (2 * h);
  const dAy_dz =
    (Ay(data, size, i, j, k + 1) - Ay(data, size, i, j, k - 1)) / (2 * h);
  const dAx_dz =
    (Ax(data, size, i, j, k + 1) - Ax(data, size, i, j, k - 1)) / (2 * h);
  const dAz_dx =
    (Az(data, size, i + 1, j, k) - Az(data, size, i - 1, j, k)) / (2 * h);
  const dAy_dx =
    (Ay(data, size, i + 1, j, k) - Ay(data, size, i - 1, j, k)) / (2 * h);
  const dAx_dy =
    (Ax(data, size, i, j + 1, k) - Ax(data, size, i, j - 1, k)) / (2 * h);
  return [dAz_dy - dAy_dz, dAx_dz - dAz_dx, dAy_dx - dAx_dy];
}

function Ax(d: Float32Array, n: number, i: number, j: number, k: number) {
  return comp(d, n, i, j, k, 0);
}
function Ay(d: Float32Array, n: number, i: number, j: number, k: number) {
  return comp(d, n, i, j, k, 1);
}
function Az(d: Float32Array, n: number, i: number, j: number, k: number) {
  return comp(d, n, i, j, k, 2);
}
function comp(
  d: Float32Array,
  n: number,
  i: number,
  j: number,
  k: number,
  c: number,
) {
  const ii = Math.min(n - 1, Math.max(0, i));
  const jj = Math.min(n - 1, Math.max(0, j));
  const kk = Math.min(n - 1, Math.max(0, k));
  return d[((kk * n + jj) * n + ii) * 4 + c]!;
}

function mulberry(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
