import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three/webgpu';
import {
  applyFighterMeshLod,
  compactGeometryVertices,
  ensureFighterMeshLodReady,
  isFaceOrHairMeshName,
  normalizeFighterMeshLod,
  triangleCount,
} from '../../src/render/fighterMeshLod';

describe('normalizeFighterMeshLod', () => {
  it('defaults unknown values to high', () => {
    expect(normalizeFighterMeshLod('high')).toBe('high');
    expect(normalizeFighterMeshLod('medium')).toBe('medium');
    expect(normalizeFighterMeshLod('low')).toBe('low');
    expect(normalizeFighterMeshLod('ultra')).toBe('high');
    expect(normalizeFighterMeshLod(undefined)).toBe('high');
  });
});

describe('isFaceOrHairMeshName', () => {
  it('treats head/hair/eyes as face-tier', () => {
    expect(isFaceOrHairMeshName('esf_Head00')).toBe(true);
    expect(isFaceOrHairMeshName('Group_Hair02')).toBe(true);
    expect(isFaceOrHairMeshName('esf_Body00')).toBe(false);
    expect(isFaceOrHairMeshName('esf_DougiPants')).toBe(false);
  });
});

describe('applyFighterMeshLod', () => {
  beforeAll(async () => {
    await ensureFighterMeshLodReady();
  });

  it('high leaves authored triangles unchanged', () => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24));
    mesh.name = 'esf_Body00';
    const before = triangleCount(mesh.geometry);
    const root = new THREE.Group();
    root.add(mesh);
    const stats = applyFighterMeshLod(root, 'high');
    expect(stats.trianglesAfter).toBe(before);
    expect(triangleCount(mesh.geometry)).toBe(before);
  });

  it('medium and low reduce a dense body mesh', () => {
    const make = () => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32));
      m.name = 'esf_Body00';
      const g = new THREE.Group();
      g.add(m);
      return { g, m };
    };
    const a = make();
    const authored = triangleCount(a.m.geometry);
    const mid = applyFighterMeshLod(a.g, 'medium');
    const b = make();
    const low = applyFighterMeshLod(b.g, 'low');
    expect(mid.trianglesAfter).toBeLessThan(authored);
    expect(low.trianglesAfter).toBeLessThan(mid.trianglesAfter);
  });
});

describe('compactGeometryVertices', () => {
  it('drops unused verts and remaps skin indices', () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 9, 9, 9]),
        3,
      ),
    );
    geo.setAttribute(
      'skinIndex',
      new THREE.BufferAttribute(new Uint16Array([1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 9, 0, 0, 0]), 4),
    );
    compactGeometryVertices(geo, new Uint32Array([0, 1, 2]));
    expect(geo.getAttribute('position').count).toBe(3);
    expect(geo.getIndex()!.count).toBe(3);
    expect(geo.getAttribute('skinIndex').getX(0)).toBe(1);
    expect(geo.getAttribute('skinIndex').getX(2)).toBe(3);
  });
});
