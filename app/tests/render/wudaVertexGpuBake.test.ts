import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createDefaultSimConfig } from '../../src/config/constants';
import { mergeConfig } from '../../src/config/store';
import {
  bakeWudaVertexSamples,
  bakeWudaVertexSamplesAcrossMeshes,
  extractVertexSkinAttrs,
} from '../../src/render/wudaParticle/WudaVertexIndexBake';
import { WudaVertexGpuBaker } from '../../src/render/wudaParticle/WudaVertexGpuBaker';
import {
  findAllSkinnedMeshes,
  resolveWudaCoverMeshes,
} from '../../src/render/wudaParticle/evalSkinnedSurface';

function makeSkinnedPlane(): THREE.SkinnedMesh {
  const geo = new THREE.PlaneGeometry(2, 2, 1, 1);
  const n = geo.getAttribute('position').count;
  const skinIndex = new Float32Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    skinIndex[i * 4] = 0;
    skinWeight[i * 4] = 1;
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));

  const bones = [new THREE.Bone()];
  bones[0]!.position.set(0, 0, 0);
  const skeleton = new THREE.Skeleton(bones);
  const mesh = new THREE.SkinnedMesh(
    geo,
    new THREE.MeshBasicMaterial(),
  );
  mesh.add(bones[0]!);
  mesh.bind(skeleton);
  mesh.updateMatrixWorld(true);
  skeleton.update();
  return mesh;
}

describe('wuda C CONFIG', () => {
  it('includes scheme-C keys and defaults to surfaceBary', () => {
    const cfg = createDefaultSimConfig();
    expect(cfg.wudaAttachMode).toBe('surfaceBary');
    expect(cfg.wudaCoverMode).toBe('allMeshes');
    expect(cfg.wudaVertexStride).toBe(1);
    expect(cfg.wudaBakeAwaitReadback).toBe(true);
    expect(cfg.wudaShowBakeStats).toBe(false);
  });

  it('mergeConfig accepts only valid wudaAttachMode / wudaCoverMode', () => {
    const base = {
      ...createDefaultSimConfig(),
      __version: 0,
      expandedSections: {} as never,
    };
    const ok = mergeConfig(base, { wudaAttachMode: 'vertexGpuBake' });
    expect(ok.wudaAttachMode).toBe('vertexGpuBake');
    const bad = mergeConfig(base, { wudaAttachMode: 'nope' });
    expect(bad.wudaAttachMode).toBe('surfaceBary');
    const cover = mergeConfig(base, { wudaCoverMode: 'largestMesh' });
    expect(cover.wudaCoverMode).toBe('largestMesh');
    const coverBad = mergeConfig(base, { wudaCoverMode: 'nope' });
    expect(coverBad.wudaCoverMode).toBe('allMeshes');
  });
});

describe('bakeWudaVertexSamples', () => {
  it('is seed-stable and respects stride', () => {
    const geo = new THREE.PlaneGeometry(2, 2, 4, 4);
    const n = geo.getAttribute('position').count;
    const skinIndex = new Float32Array(n * 4);
    const skinWeight = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      skinIndex[i * 4] = 0;
      skinWeight[i * 4] = 1;
    }
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));

    const a = bakeWudaVertexSamples(geo, 16, 7, 2);
    const b = bakeWudaVertexSamples(geo, 16, 7, 2);
    expect(a.samples.length).toBe(16);
    expect(b.samples.length).toBe(16);
    for (let i = 0; i < 16; i++) {
      expect(a.samples[i]!.vertexIndex).toBe(b.samples[i]!.vertexIndex);
    }
    // First samples from stride walk should be even indices while available
    expect(a.samples[0]!.vertexIndex % 2).toBe(0);
    expect(a.samples[1]!.vertexIndex % 2).toBe(0);
  });

  it('across meshes tags meshIndex and covers both', () => {
    const a = makeSkinnedPlane();
    const b = makeSkinnedPlane();
    const baked = bakeWudaVertexSamplesAcrossMeshes(
      [a.geometry, b.geometry],
      32,
      3,
      1,
    );
    expect(baked.samples.length).toBe(32);
    const used = new Set(baked.samples.map((s) => s.meshIndex ?? -1));
    expect(used.has(0)).toBe(true);
    expect(used.has(1)).toBe(true);
    a.geometry.dispose();
    (a.material as THREE.Material).dispose();
    a.skeleton.dispose();
    b.geometry.dispose();
    (b.material as THREE.Material).dispose();
    b.skeleton.dispose();
  });

  it('resolveWudaCoverMeshes allMeshes returns every skinned mesh', () => {
    const root = new THREE.Group();
    const a = makeSkinnedPlane();
    const b = makeSkinnedPlane();
    a.name = 'body';
    b.name = 'head';
    root.add(a, b);
    expect(findAllSkinnedMeshes(root).length).toBe(2);
    expect(resolveWudaCoverMeshes(root, 'allMeshes').length).toBe(2);
    expect(resolveWudaCoverMeshes(root, 'largestMesh').length).toBe(1);
    a.geometry.dispose();
    (a.material as THREE.Material).dispose();
    a.skeleton.dispose();
    b.geometry.dispose();
    (b.material as THREE.Material).dispose();
    b.skeleton.dispose();
  });

  it('skips origin helper verts', () => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 2, 2, 2,
    ]);
    const skinIndex = new Float32Array(5 * 4);
    const skinWeight = new Float32Array(5 * 4);
    for (let i = 0; i < 5; i++) {
      skinIndex[i * 4] = 0;
      skinWeight[i * 4] = i === 0 ? 0 : 1;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
    const baked = bakeWudaVertexSamples(geo, 4, 1, 1);
    expect(baked.samples.every((s) => s.vertexIndex !== 0)).toBe(true);
    geo.dispose();
  });

  it('extractVertexSkinAttrs packs N verts', () => {
    const mesh = makeSkinnedPlane();
    const baked = bakeWudaVertexSamples(mesh.geometry, 4, 1, 1);
    const attrs = extractVertexSkinAttrs(mesh.geometry, baked.samples);
    expect(attrs).not.toBeNull();
    expect(attrs!.positions.length).toBe(4 * 3);
    expect(attrs!.skinIndex.length).toBe(4 * 4);
    expect(attrs!.skinWeight.length).toBe(4 * 4);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });
});

describe('WudaVertexGpuBaker CPU gold standard', () => {
  it('bakeCpuWorld matches applyBoneTransform + matrixWorld', () => {
    const mesh = makeSkinnedPlane();
    mesh.position.set(1, 2, 3);
    mesh.updateMatrixWorld(true);
    mesh.skeleton.update();

    const baked = bakeWudaVertexSamples(mesh.geometry, 4, 3, 1);
    const baker = new WudaVertexGpuBaker();
    expect(baker.build(mesh, baked.samples)).toBe(true);
    expect(baker.gpuBatchCount).toBe(1);
    expect(baker.hasGpu).toBe(true);

    const out = new Float32Array(4 * 3);
    baker.bakeCpuWorld(out);

    const expected = new THREE.Vector3();
    const pos = mesh.geometry.getAttribute('position');
    for (let i = 0; i < 4; i++) {
      const vi = baked.samples[i]!.vertexIndex;
      expected.fromBufferAttribute(pos, vi);
      mesh.applyBoneTransform(vi, expected);
      expected.applyMatrix4(mesh.matrixWorld);
      expect(out[i * 3]).toBeCloseTo(expected.x, 5);
      expect(out[i * 3 + 1]).toBeCloseTo(expected.y, 5);
      expect(out[i * 3 + 2]).toBeCloseTo(expected.z, 5);
    }

    baker.dispose();
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    mesh.skeleton.dispose();
  });

  it('multi-mesh bakeCpuWorld respects meshIndex + per-mesh matrixWorld', () => {
    const a = makeSkinnedPlane();
    const b = makeSkinnedPlane();
    a.position.set(0, 0, 0);
    b.position.set(5, 1, -2);
    a.updateMatrixWorld(true);
    b.updateMatrixWorld(true);
    a.skeleton.update();
    b.skeleton.update();

    const baked = bakeWudaVertexSamplesAcrossMeshes(
      [a.geometry, b.geometry],
      16,
      5,
      1,
    );
    const baker = new WudaVertexGpuBaker();
    expect(baker.buildFromMeshes([a, b], baked.samples)).toBe(true);
    expect(baker.gpuBatchCount).toBe(2);
    expect(baker.hasGpu).toBe(true);

    const out = new Float32Array(baked.samples.length * 3);
    baker.bakeCpuWorld(out);

    const expected = new THREE.Vector3();
    const meshes = [a, b];
    for (let i = 0; i < baked.samples.length; i++) {
      const sample = baked.samples[i]!;
      const mesh = meshes[sample.meshIndex ?? 0]!;
      const pos = mesh.geometry.getAttribute('position');
      expected.fromBufferAttribute(pos, sample.vertexIndex);
      mesh.applyBoneTransform(sample.vertexIndex, expected);
      expected.applyMatrix4(mesh.matrixWorld);
      expect(out[i * 3]).toBeCloseTo(expected.x, 5);
      expect(out[i * 3 + 1]).toBeCloseTo(expected.y, 5);
      expect(out[i * 3 + 2]).toBeCloseTo(expected.z, 5);
    }

    const skelA = a.skeleton;
    baker.dispose();
    expect(skelA.bones.length).toBeGreaterThan(0);
    a.geometry.dispose();
    (a.material as THREE.Material).dispose();
    a.skeleton.dispose();
    b.geometry.dispose();
    (b.material as THREE.Material).dispose();
    b.skeleton.dispose();
  });

  it('gpuWorldLooksDegenerate detects origin pile and accepts healthy span', () => {
    const mesh = makeSkinnedPlane();
    mesh.position.set(0, 0, 0);
    mesh.updateMatrixWorld(true);
    const baked = bakeWudaVertexSamples(mesh.geometry, 4, 1, 1);
    const baker = new WudaVertexGpuBaker();
    baker.build(mesh, baked.samples);

    const piled = new Float32Array(4 * 3); // all near mesh origin
    expect(baker.gpuWorldLooksDegenerate(piled)).toBe(true);

    const healthy = new Float32Array([
      0, -1, 0, 0, 0, 0, 0, 0.5, 0, 0, 1.2, 0,
    ]);
    expect(baker.gpuWorldLooksDegenerate(healthy)).toBe(false);

    baker.markGpuDegraded();
    expect(baker.hasGpu).toBe(false);
    expect(baker.isGpuDegraded).toBe(true);

    baker.dispose();
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    mesh.skeleton.dispose();
  });

  it('gpuSamePoseAcceptable uses p95/max dual gate', () => {
    expect(
      WudaVertexGpuBaker.gpuSamePoseAcceptable({
        max: 0.146,
        p95: 0.04,
        mean: 0.02,
        count: 48,
      }),
    ).toBe(true);
    expect(
      WudaVertexGpuBaker.gpuSamePoseAcceptable({
        max: 0.146,
        p95: 0.09,
        mean: 0.05,
        count: 48,
      }),
    ).toBe(false);
    expect(
      WudaVertexGpuBaker.gpuSamePoseAcceptable({
        max: 0.3,
        p95: 0.04,
        mean: 0.02,
        count: 48,
      }),
    ).toBe(false);
  });

  it('commitWorldFrom + maxWorldError agree with CPU gold', () => {
    const mesh = makeSkinnedPlane();
    mesh.position.set(0, 1, 0);
    mesh.updateMatrixWorld(true);
    mesh.skeleton.update();
    const baked = bakeWudaVertexSamples(mesh.geometry, 4, 2, 1);
    const baker = new WudaVertexGpuBaker();
    baker.build(mesh, baked.samples);

    const gold = new Float32Array(4 * 3);
    baker.bakeCpuWorld(gold);
    expect(baker.maxWorldError(gold, gold, 4)).toBeLessThan(1e-5);
    expect(baker.maxWorldErrorVsCpu(gold, 4)).toBeLessThan(1e-5);

    const bad = new Float32Array(gold);
    bad[1] += 1; // lift first sample 1m
    expect(baker.maxWorldError(bad, gold, 4)).toBeGreaterThan(0.5);

    baker.commitWorldFrom(gold, 'gpu');
    expect(baker.lastBakePath).toBe('gpu');
    expect(baker.hasBakedFrame).toBe(true);
    expect(baker.getCurrWorld()[0]).toBeCloseTo(gold[0]!, 5);

    baker.dispose();
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    mesh.skeleton.dispose();
  });
});
