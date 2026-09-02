/**
 * Area-weighted surface bake with triangle index + barycentric.
 * Algorithm mirrors three.js MeshSurfaceSampler (r185):
 * https://github.com/mrdoob/three.js/blob/r185/examples/jsm/math/MeshSurfaceSampler.js
 * Extended to export {i0,i1,i2,u,v,w} for skinned tracking
 * (PaulDemeulenaere/vfx-uniform-mesh-sampling pattern).
 *
 * Full-body mode can further split quotas across head / torso / limbRoot / limbTip.
 */
import * as THREE from 'three';
import { createMulberry32 } from '../hitVfx/mulberry32';
import type { WudaSurfaceSample } from './wudaTypes';
import {
  allocateRegionCounts,
  classifyBoneName,
  classifyMeshName,
  normalizeRegionWeights,
  WUDA_BODY_REGIONS,
  type WudaBodyRegion,
  type WudaRegionWeights,
} from './wudaBodyRegions';

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
  /** Populated when region split is used. */
  regionCounts?: WudaRegionWeights;
};

type FaceEntry = {
  meshIndex: number;
  i0: number;
  i1: number;
  i2: number;
  area: number;
  region: WudaBodyRegion;
};

export type WudaBakeRegionOpts = {
  /** Relative quotas; normalized internally. */
  regionWeights: WudaRegionWeights;
};

function dominantBoneRegion(
  mesh: THREE.SkinnedMesh,
  vertIndex: number,
  meshFallback: WudaBodyRegion,
): WudaBodyRegion {
  const skinIndex = mesh.geometry.getAttribute('skinIndex');
  const skinWeight = mesh.geometry.getAttribute('skinWeight');
  const bones = mesh.skeleton?.bones;
  if (!skinIndex || !skinWeight || !bones || bones.length === 0) {
    return meshFallback;
  }
  let bestW = -1;
  let bestRegion = meshFallback;
  for (let k = 0; k < 4; k++) {
    const w = skinWeight.getComponent(vertIndex, k);
    if (w <= bestW) continue;
    const bi = Math.floor(skinIndex.getComponent(vertIndex, k));
    const bone = bones[bi];
    if (!bone) continue;
    bestW = w;
    bestRegion = classifyBoneName(bone.name);
  }
  return bestW > 0.01 ? bestRegion : meshFallback;
}

function classifyFaceRegion(
  mesh: THREE.SkinnedMesh,
  i0: number,
  i1: number,
  i2: number,
): WudaBodyRegion {
  const meshFallback =
    classifyMeshName(mesh.name) ??
    classifyMeshName(mesh.parent?.name ?? '') ??
    'torso';
  const votes: Record<WudaBodyRegion, number> = {
    head: 0,
    torso: 0,
    limbRoot: 0,
    limbTip: 0,
  };
  for (const vi of [i0, i1, i2]) {
    votes[dominantBoneRegion(mesh, vi, meshFallback)]++;
  }
  let best: WudaBodyRegion = meshFallback;
  let bestN = -1;
  for (const r of WUDA_BODY_REGIONS) {
    if (votes[r] > bestN) {
      bestN = votes[r];
      best = r;
    }
  }
  return best;
}

/** Bind-pose surface area of one geometry (sum of triangle areas). */
export function geometrySurfaceArea(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute('position');
  if (!position) return 0;
  const indexAttr = geometry.index;
  const totalFaces = indexAttr
    ? Math.floor(indexAttr.count / 3)
    : Math.floor(position.count / 3);
  let total = 0;
  for (let f = 0; f < totalFaces; f++) {
    let i0 = f * 3;
    let i1 = f * 3 + 1;
    let i2 = f * 3 + 2;
    if (indexAttr) {
      i0 = indexAttr.getX(i0);
      i1 = indexAttr.getX(i1);
      i2 = indexAttr.getX(i2);
    }
    total += triangleArea(position, i0, i1, i2);
  }
  return total;
}

function collectFacesFromGeometries(
  geometries: THREE.BufferGeometry[],
): { faces: FaceEntry[]; totalArea: number } {
  const faces: FaceEntry[] = [];
  let totalArea = 0;
  for (let meshIndex = 0; meshIndex < geometries.length; meshIndex++) {
    const geometry = geometries[meshIndex]!;
    const position = geometry.getAttribute('position');
    if (!position) continue;
    const indexAttr = geometry.index;
    const totalFaces = indexAttr
      ? Math.floor(indexAttr.count / 3)
      : Math.floor(position.count / 3);
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
      if (area <= 0) continue;
      totalArea += area;
      faces.push({
        meshIndex,
        i0,
        i1,
        i2,
        area,
        region: 'torso',
      });
    }
  }
  return { faces, totalArea };
}

function collectFacesFromMeshes(meshes: THREE.SkinnedMesh[]): {
  faces: FaceEntry[];
  totalArea: number;
} {
  const faces: FaceEntry[] = [];
  let totalArea = 0;
  for (let meshIndex = 0; meshIndex < meshes.length; meshIndex++) {
    const mesh = meshes[meshIndex]!;
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    if (!position) continue;
    const indexAttr = geometry.index;
    const totalFaces = indexAttr
      ? Math.floor(indexAttr.count / 3)
      : Math.floor(position.count / 3);
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
      if (area <= 0) continue;
      totalArea += area;
      faces.push({
        meshIndex,
        i0,
        i1,
        i2,
        area,
        region: classifyFaceRegion(mesh, i0, i1, i2),
      });
    }
  }
  return { faces, totalArea };
}

function sampleFromFaceBucket(
  faces: FaceEntry[],
  count: number,
  seed: number,
): WudaSurfaceSample[] {
  if (faces.length === 0 || count <= 0) return [];
  const cum = new Float32Array(faces.length);
  let total = 0;
  for (let i = 0; i < faces.length; i++) {
    total += faces[i]!.area;
    cum[i] = total;
  }
  if (total <= 0) return [];
  const rng = createMulberry32(seed >>> 0);
  const samples: WudaSurfaceSample[] = [];
  for (let n = 0; n < count; n++) {
    const faceIndex = binarySearch(cum, rng.next() * total);
    const face = faces[faceIndex]!;
    let u = rng.next();
    let v = rng.next();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const w = 1 - (u + v);
    samples.push({
      meshIndex: face.meshIndex,
      i0: face.i0,
      i1: face.i1,
      i2: face.i2,
      u,
      v,
      w,
    });
  }
  return samples;
}

/**
 * Bake N surface samples on bind-pose geometry.
 * Uses mulberry32(seed) — same seed → same sequence.
 */
export function bakeWudaSurfaceSamples(
  geometry: THREE.BufferGeometry,
  count: number,
  seed: number,
): WudaBakeResult {
  const { faces, totalArea } = collectFacesFromGeometries([geometry]);
  if (totalArea <= 0) {
    return { samples: [], faceCount: 0, totalArea: 0 };
  }
  const samples = sampleFromFaceBucket(faces, count, seed);
  return { samples, faceCount: faces.length, totalArea };
}

/**
 * Area-weighted samples across multiple meshes (full-body uniform coat).
 * Each sample carries `meshIndex` into the geometries / meshes array.
 */
export function bakeWudaSurfaceSamplesAcrossMeshes(
  geometries: THREE.BufferGeometry[],
  count: number,
  seed: number,
): WudaBakeResult {
  if (geometries.length === 0 || count <= 0) {
    return { samples: [], faceCount: 0, totalArea: 0 };
  }
  if (geometries.length === 1) {
    return bakeWudaSurfaceSamples(geometries[0]!, count, seed);
  }
  const { faces, totalArea } = collectFacesFromGeometries(geometries);
  if (totalArea <= 0) {
    return { samples: [], faceCount: faces.length, totalArea: 0 };
  }
  const samples = sampleFromFaceBucket(faces, count, seed);
  return { samples, faceCount: faces.length, totalArea };
}

/**
 * Full-body bake from live SkinnedMeshes.
 * When `regionWeights` is set, quotas are split across head/torso/limbRoot/limbTip,
 * then area-weighted inside each region.
 */
export function bakeWudaSurfaceSamplesForMeshes(
  meshes: THREE.SkinnedMesh[],
  count: number,
  seed: number,
  regionOpts?: WudaBakeRegionOpts | null,
): WudaBakeResult {
  if (meshes.length === 0 || count <= 0) {
    return { samples: [], faceCount: 0, totalArea: 0 };
  }

  if (!regionOpts) {
    return bakeWudaSurfaceSamplesAcrossMeshes(
      meshes.map((m) => m.geometry),
      count,
      seed,
    );
  }

  const { faces, totalArea } = collectFacesFromMeshes(meshes);
  if (totalArea <= 0 || faces.length === 0) {
    return { samples: [], faceCount: 0, totalArea: 0 };
  }

  const buckets: Record<WudaBodyRegion, FaceEntry[]> = {
    head: [],
    torso: [],
    limbRoot: [],
    limbTip: [],
  };
  const availableArea: Partial<Record<WudaBodyRegion, number>> = {};
  for (const f of faces) {
    buckets[f.region].push(f);
    availableArea[f.region] = (availableArea[f.region] ?? 0) + f.area;
  }

  const weights = normalizeRegionWeights(regionOpts.regionWeights);
  // Cap = count means "enabled"; 0 means empty region (weight redistributed).
  const available = {
    head: (availableArea.head ?? 0) > 0 ? count : 0,
    torso: (availableArea.torso ?? 0) > 0 ? count : 0,
    limbRoot: (availableArea.limbRoot ?? 0) > 0 ? count : 0,
    limbTip: (availableArea.limbTip ?? 0) > 0 ? count : 0,
  };
  const regionCounts = allocateRegionCounts(count, weights, available);

  const samples: WudaSurfaceSample[] = [];
  let regionSeed = seed >>> 0;
  for (const r of WUDA_BODY_REGIONS) {
    const n = regionCounts[r];
    if (n <= 0) continue;
    const bucket = buckets[r];
    if (bucket.length === 0) continue;
    samples.push(...sampleFromFaceBucket(bucket, n, regionSeed));
    regionSeed = (regionSeed + 0x9e3779b9) >>> 0;
  }

  // Fill any shortfall (empty buckets / rounding) from all faces.
  if (samples.length < count) {
    samples.push(
      ...sampleFromFaceBucket(faces, count - samples.length, regionSeed),
    );
  }

  return {
    samples: samples.slice(0, count),
    faceCount: faces.length,
    totalArea,
    regionCounts,
  };
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
