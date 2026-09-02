/**
 * Scheme C: bake particle slots as source-mesh vertex indices (not triangle barycentrics).
 * docs/plans/ai-execution-plan-wuda-particle-scheme-c-vertex-gpu-bake-v0.md Step 2
 * Skinner Model analogy: keep vertices + skin weights only (keijiro/Skinner).
 */
import * as THREE from 'three';
import { createMulberry32 } from '../hitVfx/mulberry32';

export type WudaVertexSample = {
  vertexIndex: number;
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
