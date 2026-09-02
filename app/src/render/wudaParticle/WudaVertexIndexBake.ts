/**
 * Scheme C: bake particle slots as source-mesh vertex indices (not triangle barycentrics).
 * docs/plans/ai-execution-plan-wuda-particle-scheme-c-vertex-gpu-bake-v0.md Step 2
 * Skinner Model analogy: keep vertices + skin weights only (keijiro/Skinner).
 */
import * as THREE from 'three';
import { createMulberry32 } from '../hitVfx/mulberry32';
import {
  allocateRegionCounts,
  classifyBoneName,
  classifyMeshName,
  normalizeRegionWeights,
  WUDA_BODY_REGIONS,
  type WudaBodyRegion,
  type WudaRegionWeights,
} from './wudaBodyRegions';

export type WudaVertexSample = {
  vertexIndex: number;
  /** Index into the bound SkinnedMesh list (0 for single-mesh). */
  meshIndex?: number;
};

export type WudaVertexBakeResult = {
  samples: WudaVertexSample[];
  sourceVertexCount: number;
};

/**
 * Build N vertex samples with stride, then fill remaining slots via mulberry32(seed).
 * Same seed+stride+count+geometry → same sequence.
 */
function isUsableVertex(
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  skinWeight: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  i: number,
): boolean {
  const px = position.getX(i);
  const py = position.getY(i);
  const pz = position.getZ(i);
  if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) {
    return false;
  }
  // Skip origin/helper verts (common in FBX) — they pile at the character root (feet).
  if (px * px + py * py + pz * pz < 1e-8) return false;
  const w =
    Math.abs(skinWeight.getX(i)) +
    Math.abs(skinWeight.getY(i)) +
    Math.abs(skinWeight.getZ(i)) +
    Math.abs(skinWeight.getW(i));
  return w > 0.01;
}

export function bakeWudaVertexSamples(
  geometry: THREE.BufferGeometry,
  count: number,
  seed: number,
  stride: number,
): WudaVertexBakeResult {
  const position = geometry.getAttribute('position');
  const skinIndex = geometry.getAttribute('skinIndex');
  const skinWeight = geometry.getAttribute('skinWeight');
  if (!position || !skinIndex || !skinWeight || count <= 0) {
    return { samples: [], sourceVertexCount: position?.count ?? 0 };
  }

  const sourceVertexCount = position.count;
  if (sourceVertexCount <= 0) {
    return { samples: [], sourceVertexCount: 0 };
  }

  const usable: number[] = [];
  for (let i = 0; i < sourceVertexCount; i++) {
    if (isUsableVertex(position, skinWeight, i)) usable.push(i);
  }
  const pool = usable.length > 0 ? usable : [...Array(sourceVertexCount).keys()];

  const step = Math.max(1, Math.floor(stride));
  const samples: WudaVertexSample[] = [];
  const used = new Set<number>();

  for (let k = 0; k < pool.length && samples.length < count; k += step) {
    const idx = pool[k]!;
    samples.push({ vertexIndex: idx });
    used.add(idx);
  }

  if (samples.length < count) {
    const rng = createMulberry32(seed >>> 0);
    let guard = 0;
    const guardMax = count * 32 + pool.length * 4;
    while (samples.length < count && guard++ < guardMax) {
      const idx = pool[Math.floor(rng.next() * pool.length) % pool.length]!;
      if (used.has(idx) && used.size < pool.length) continue;
      samples.push({ vertexIndex: idx });
      used.add(idx);
    }
    while (samples.length < count) {
      samples.push({ vertexIndex: pool[0]! });
    }
  }

  return { samples, sourceVertexCount };
}

/**
 * Full-body vertex emitters: allocate slots across meshes proportional to usable
 * vertex counts (approximation of surface coverage when meshes differ in density).
 */
export function bakeWudaVertexSamplesAcrossMeshes(
  geometries: THREE.BufferGeometry[],
  count: number,
  seed: number,
  stride: number,
): WudaVertexBakeResult {
  if (geometries.length === 0 || count <= 0) {
    return { samples: [], sourceVertexCount: 0 };
  }
  if (geometries.length === 1) {
    const one = bakeWudaVertexSamples(geometries[0]!, count, seed, stride);
    return {
      samples: one.samples.map((s) => ({ ...s, meshIndex: 0 })),
      sourceVertexCount: one.sourceVertexCount,
    };
  }

  const pools: { meshIndex: number; pool: number[] }[] = [];
  let sourceVertexCount = 0;
  for (let meshIndex = 0; meshIndex < geometries.length; meshIndex++) {
    const geometry = geometries[meshIndex]!;
    const position = geometry.getAttribute('position');
    const skinWeight = geometry.getAttribute('skinWeight');
    const skinIndex = geometry.getAttribute('skinIndex');
    if (!position || !skinWeight || !skinIndex) continue;
    sourceVertexCount += position.count;
    const usable: number[] = [];
    for (let i = 0; i < position.count; i++) {
      if (isUsableVertex(position, skinWeight, i)) usable.push(i);
    }
    const pool =
      usable.length > 0 ? usable : [...Array(position.count).keys()];
    if (pool.length > 0) pools.push({ meshIndex, pool });
  }
  if (pools.length === 0) return { samples: [], sourceVertexCount };

  const totalPool = pools.reduce((acc, p) => acc + p.pool.length, 0);
  const samples: WudaVertexSample[] = [];
  const step = Math.max(1, Math.floor(stride));
  const rng = createMulberry32(seed >>> 0);

  // Proportional quotas (largest remainder), then stride-fill per mesh.
  const quotas = pools.map((p) => ({
    meshIndex: p.meshIndex,
    pool: p.pool,
    exact: (p.pool.length / totalPool) * count,
    n: 0,
  }));
  let assigned = 0;
  for (const q of quotas) {
    q.n = Math.floor(q.exact);
    assigned += q.n;
  }
  const rem = [...quotas].sort(
    (a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)),
  );
  for (let i = 0; assigned < count && i < rem.length; i++) {
    rem[i]!.n++;
    assigned++;
  }

  for (const q of quotas) {
    if (q.n <= 0) continue;
    let taken = 0;
    const used = new Set<number>();
    for (
      let k = 0;
      k < q.pool.length && samples.length < count && taken < q.n;
      k += step
    ) {
      const idx = q.pool[k]!;
      samples.push({ meshIndex: q.meshIndex, vertexIndex: idx });
      used.add(idx);
      taken++;
    }
    let guard = 0;
    while (
      taken < q.n &&
      samples.length < count &&
      guard++ < q.n * 32 + q.pool.length
    ) {
      const idx =
        q.pool[Math.floor(rng.next() * q.pool.length) % q.pool.length]!;
      // Prefer unused verts while the pool still has free indices.
      if (used.has(idx) && used.size < q.pool.length) continue;
      samples.push({ meshIndex: q.meshIndex, vertexIndex: idx });
      used.add(idx);
      taken++;
    }
  }

  while (samples.length < count) {
    const p = pools[Math.floor(rng.next() * pools.length) % pools.length]!;
    const idx = p.pool[Math.floor(rng.next() * p.pool.length) % p.pool.length]!;
    samples.push({ meshIndex: p.meshIndex, vertexIndex: idx });
  }

  return { samples: samples.slice(0, count), sourceVertexCount };
}

function classifyVertexRegion(
  mesh: THREE.SkinnedMesh,
  vertIndex: number,
): WudaBodyRegion {
  const meshFallback =
    classifyMeshName(mesh.name) ??
    classifyMeshName(mesh.parent?.name ?? '') ??
    'torso';
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

function fillFromPool(
  samples: WudaVertexSample[],
  meshIndex: number,
  pool: number[],
  need: number,
  stride: number,
  rng: { next: () => number },
  count: number,
): void {
  if (need <= 0 || pool.length === 0) return;
  const step = Math.max(1, Math.floor(stride));
  let taken = 0;
  const used = new Set<number>();
  for (
    let k = 0;
    k < pool.length && samples.length < count && taken < need;
    k += step
  ) {
    const idx = pool[k]!;
    samples.push({ meshIndex, vertexIndex: idx });
    used.add(idx);
    taken++;
  }
  let guard = 0;
  while (
    taken < need &&
    samples.length < count &&
    guard++ < need * 32 + pool.length
  ) {
    const idx = pool[Math.floor(rng.next() * pool.length) % pool.length]!;
    if (used.has(idx) && used.size < pool.length) continue;
    samples.push({ meshIndex, vertexIndex: idx });
    used.add(idx);
    taken++;
  }
}

/**
 * Full-body vertex bake from live meshes with optional 4-region quotas.
 */
export function bakeWudaVertexSamplesForMeshes(
  meshes: THREE.SkinnedMesh[],
  count: number,
  seed: number,
  stride: number,
  regionWeights?: WudaRegionWeights | null,
): WudaVertexBakeResult & { regionCounts?: WudaRegionWeights } {
  if (meshes.length === 0 || count <= 0) {
    return { samples: [], sourceVertexCount: 0 };
  }
  if (!regionWeights) {
    return bakeWudaVertexSamplesAcrossMeshes(
      meshes.map((m) => m.geometry),
      count,
      seed,
      stride,
    );
  }

  type VertRef = { meshIndex: number; vertexIndex: number };
  const buckets: Record<WudaBodyRegion, VertRef[]> = {
    head: [],
    torso: [],
    limbRoot: [],
    limbTip: [],
  };
  let sourceVertexCount = 0;

  for (let meshIndex = 0; meshIndex < meshes.length; meshIndex++) {
    const mesh = meshes[meshIndex]!;
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    const skinWeight = geometry.getAttribute('skinWeight');
    const skinIndex = geometry.getAttribute('skinIndex');
    if (!position || !skinWeight || !skinIndex) continue;
    sourceVertexCount += position.count;
    for (let i = 0; i < position.count; i++) {
      if (!isUsableVertex(position, skinWeight, i)) continue;
      const region = classifyVertexRegion(mesh, i);
      buckets[region].push({ meshIndex, vertexIndex: i });
    }
  }

  const weights = normalizeRegionWeights(regionWeights);
  const available = {
    head: buckets.head.length > 0 ? count : 0,
    torso: buckets.torso.length > 0 ? count : 0,
    limbRoot: buckets.limbRoot.length > 0 ? count : 0,
    limbTip: buckets.limbTip.length > 0 ? count : 0,
  };
  const regionCounts = allocateRegionCounts(count, weights, available);
  const rng = createMulberry32(seed >>> 0);
  const samples: WudaVertexSample[] = [];

  for (const r of WUDA_BODY_REGIONS) {
    const need = regionCounts[r];
    if (need <= 0) continue;
    const bucket = buckets[r];
    if (bucket.length === 0) continue;
    // Group by mesh so fillFromPool stays simple.
    const byMesh = new Map<number, number[]>();
    for (const v of bucket) {
      let list = byMesh.get(v.meshIndex);
      if (!list) {
        list = [];
        byMesh.set(v.meshIndex, list);
      }
      list.push(v.vertexIndex);
    }
    // Allocate this region's need across its meshes by pool size.
    const meshPools = [...byMesh.entries()].map(([meshIndex, pool]) => ({
      meshIndex,
      pool,
      exact: (pool.length / bucket.length) * need,
      n: 0,
    }));
    let assigned = 0;
    for (const q of meshPools) {
      q.n = Math.floor(q.exact);
      assigned += q.n;
    }
    const rem = [...meshPools].sort(
      (a, b) =>
        b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)),
    );
    for (let i = 0; assigned < need && i < rem.length; i++) {
      rem[i]!.n++;
      assigned++;
    }
    for (const q of meshPools) {
      fillFromPool(samples, q.meshIndex, q.pool, q.n, stride, rng, count);
    }
  }

  if (samples.length < count) {
    const all: VertRef[] = [];
    for (const r of WUDA_BODY_REGIONS) all.push(...buckets[r]);
    const byMesh = new Map<number, number[]>();
    for (const v of all) {
      let list = byMesh.get(v.meshIndex);
      if (!list) {
        list = [];
        byMesh.set(v.meshIndex, list);
      }
      list.push(v.vertexIndex);
    }
    for (const [meshIndex, pool] of byMesh) {
      if (samples.length >= count) break;
      fillFromPool(
        samples,
        meshIndex,
        pool,
        count - samples.length,
        stride,
        rng,
        count,
      );
    }
  }

  return {
    samples: samples.slice(0, count),
    sourceVertexCount,
    regionCounts,
  };
}

/** Copy bind-pose attributes for the sample list into compact arrays. */
export function extractVertexSkinAttrs(
  geometry: THREE.BufferGeometry,
  samples: WudaVertexSample[],
): {
  positions: Float32Array;
  skinIndex: Float32Array;
  skinWeight: Float32Array;
} | null {
  const position = geometry.getAttribute('position');
  const skinIndex = geometry.getAttribute('skinIndex');
  const skinWeight = geometry.getAttribute('skinWeight');
  if (!position || !skinIndex || !skinWeight) return null;

  const n = samples.length;
  const positions = new Float32Array(n * 3);
  const skinIndexOut = new Float32Array(n * 4);
  const skinWeightOut = new Float32Array(n * 4);

  for (let i = 0; i < n; i++) {
    const vi = samples[i]!.vertexIndex;
    positions[i * 3] = position.getX(vi);
    positions[i * 3 + 1] = position.getY(vi);
    positions[i * 3 + 2] = position.getZ(vi);
    skinIndexOut[i * 4] = skinIndex.getX(vi);
    skinIndexOut[i * 4 + 1] = skinIndex.getY(vi);
    skinIndexOut[i * 4 + 2] = skinIndex.getZ(vi);
    skinIndexOut[i * 4 + 3] = skinIndex.getW(vi);
    skinWeightOut[i * 4] = skinWeight.getX(vi);
    skinWeightOut[i * 4 + 1] = skinWeight.getY(vi);
    skinWeightOut[i * 4 + 2] = skinWeight.getZ(vi);
    skinWeightOut[i * 4 + 3] = skinWeight.getW(vi);
  }

  return {
    positions,
    skinIndex: skinIndexOut,
    skinWeight: skinWeightOut,
  };
}
