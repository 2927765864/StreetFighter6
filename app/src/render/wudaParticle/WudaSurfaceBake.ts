/**
 * Area-weighted surface bake with triangle index + barycentric.
 * Algorithm mirrors three.js MeshSurfaceSampler (r185):
 * https://github.com/mrdoob/three.js/blob/r185/examples/jsm/math/MeshSurfaceSampler.js
 * Extended to export {i0,i1,i2,u,v,w} for skinned tracking
 * (PaulDemeulenaere/vfx-uniform-mesh-sampling pattern).
 */
import * as THREE from 'three';
import { createMulberry32 } from '../hitVfx/mulberry32';
import type { WudaSurfaceSample } from './wudaTypes';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

function triangleArea(
  pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  i0: number,
  i1: number,
  i2: number,
): number {
  _a.fromBufferAttribute(pos, i0);
  _b.fromBufferAttribute(pos, i1);
  _c.fromBufferAttribute(pos, i2);
  _b.sub(_a);
  _c.sub(_a);
  return _b.cross(_c).length() * 0.5;
}

function binarySearch(dist: Float32Array, x: number): number {
  let start = 0;
  let end = dist.length - 1;
  let index = -1;
  while (start <= end) {
    const mid = Math.ceil((start + end) / 2);
    if (mid === 0 || (dist[mid - 1]! <= x && dist[mid]! > x)) {
      index = mid;
      break;
    }
    if (x < dist[mid]!) end = mid - 1;
    else start = mid + 1;
  }
  return index < 0 ? 0 : index;
}

export type WudaBakeResult = {
  samples: WudaSurfaceSample[];
  faceCount: number;
  totalArea: number;
};

/**
 * Bake N surface samples on bind-pose geometry.
 * Uses mulberry32(seed) — same seed → same sequence.
 */
export function bakeWudaSurfaceSamples(
  geometry: THREE.BufferGeometry,
  count: number,
  seed: number,
): WudaBakeResult {
  const position = geometry.getAttribute('position');
  if (!position || count <= 0) {
    return { samples: [], faceCount: 0, totalArea: 0 };
  }

  const indexAttr = geometry.index;
  const totalFaces = indexAttr
    ? Math.floor(indexAttr.count / 3)
    : Math.floor(position.count / 3);
  if (totalFaces <= 0) {
    return { samples: [], faceCount: 0, totalArea: 0 };
  }

  const faceWeights = new Float32Array(totalFaces);
  let cumulativeTotal = 0;
  const distribution = new Float32Array(totalFaces);

  for (let f = 0; f < totalFaces; f++) {
    let i0 = f * 3;
    let i1 = f * 3 + 1;
    let i2 = f * 3 + 2;
    if (indexAttr) {
      i0 = indexAttr.getX(i0);
      i1 = indexAttr.getX(i1);
      i2 = indexAttr.getX(i2);
    }
    const area = triangleArea(position, i0, i1, i2);
    faceWeights[f] = area;
    cumulativeTotal += area;
    distribution[f] = cumulativeTotal;
  }

  if (cumulativeTotal <= 0) {
    return { samples: [], faceCount: totalFaces, totalArea: 0 };
  }

  const rng = createMulberry32(seed >>> 0);
  const samples: WudaSurfaceSample[] = [];

  for (let n = 0; n < count; n++) {
    const faceIndex = binarySearch(distribution, rng.next() * cumulativeTotal);
    let u = rng.next();
    let v = rng.next();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const w = 1 - (u + v);

    let i0 = faceIndex * 3;
    let i1 = faceIndex * 3 + 1;
    let i2 = faceIndex * 3 + 2;
    if (indexAttr) {
      i0 = indexAttr.getX(i0);
      i1 = indexAttr.getX(i1);
      i2 = indexAttr.getX(i2);
    }

    samples.push({ i0, i1, i2, u, v, w });
  }

  return { samples, faceCount: totalFaces, totalArea: cumulativeTotal };
}

/** Interpolate bind-pose position from sample (for tests). */
export function interpolateBindPosition(
  geometry: THREE.BufferGeometry,
  sample: WudaSurfaceSample,
  out: THREE.Vector3,
): THREE.Vector3 {
  const position = geometry.getAttribute('position');
  _a.fromBufferAttribute(position, sample.i0);
  _b.fromBufferAttribute(position, sample.i1);
  _c.fromBufferAttribute(position, sample.i2);
  return out
    .set(0, 0, 0)
    .addScaledVector(_a, sample.u)
    .addScaledVector(_b, sample.v)
    .addScaledVector(_c, sample.w);
}
