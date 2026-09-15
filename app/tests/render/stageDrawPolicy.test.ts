import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import {
  applyStageDrawPolicy,
  countGeometryTriangles,
  countObjectTriangles,
} from '../../src/render/stageDrawPolicy';

describe('countGeometryTriangles', () => {
  it('uses index count when present', () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(9), 3),
    );
    g.setIndex([0, 1, 2]);
    expect(countGeometryTriangles(g)).toBe(1);
  });
});

describe('applyStageDrawPolicy', () => {
  it('receives shadows but never casts, and skips hidden meshes in the count', () => {
    const root = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    floor.castShadow = true;
    const hidden = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    hidden.visible = false;
    hidden.castShadow = true;
    root.add(floor, hidden);

    const r = applyStageDrawPolicy(root);
    expect(floor.receiveShadow).toBe(true);
    expect(floor.castShadow).toBe(false);
    expect(hidden.castShadow).toBe(false);
    expect(r.meshes).toBe(2);
    expect(r.triangles).toBe(countObjectTriangles(root));
    expect(r.triangles).toBe(countGeometryTriangles(floor.geometry));
  });
});
