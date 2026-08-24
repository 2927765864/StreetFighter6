import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  SPRING_HELPER_RENDER_ORDER,
  applySpringBoneHelperOverlay,
} from '../../src/render/springBoneHelperOverlay';

describe('applySpringBoneHelperOverlay', () => {
  it('forces transparent overlay pass, high renderOrder, no frustum cull', () => {
    const root = new THREE.Group();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0]), 3),
    );
    const mat = new THREE.LineBasicMaterial({
      depthTest: true,
      depthWrite: true,
      transparent: false,
    });
    const line = new THREE.LineSegments(geo, mat);
    line.frustumCulled = true;
    line.renderOrder = 0;
    root.add(line);

    applySpringBoneHelperOverlay(root);

    expect(root.frustumCulled).toBe(false);
    expect(root.renderOrder).toBe(SPRING_HELPER_RENDER_ORDER);
    expect(line.frustumCulled).toBe(false);
    expect(line.renderOrder).toBe(SPRING_HELPER_RENDER_ORDER);
    expect(mat.depthTest).toBe(false);
    expect(mat.depthWrite).toBe(false);
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBe(1);
    expect(geo.boundingSphere).not.toBeNull();
  });
});
