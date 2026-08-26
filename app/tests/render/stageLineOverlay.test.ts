import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import {
  dropCameraFacingWallTris,
  isCameraFacingWallTri,
  isStageLineOverlayName,
  prepareStageLineOverlay,
} from '../../src/render/stageLineOverlay';

describe('isStageLineOverlayName', () => {
  it('matches the training-stage lines mesh', () => {
    expect(isStageLineOverlayName('SF6 Training Stage Lines')).toBe(true);
    expect(isStageLineOverlayName('LOD_1_Group_0_Sub_2__lambert2_mesh0001')).toBe(
      true,
    );
    expect(
      isStageLineOverlayName('SF6 Training Stage Floor and Walls'),
    ).toBe(false);
  });
});

describe('isCameraFacingWallTri', () => {
  it('flags the +Z wall tape (normal −Z, centroid z>gate)', () => {
    const a = { x: -0.05, y: 0, z: 10 };
    const b = { x: 0.05, y: 12, z: 10 };
    const c = { x: 0.05, y: 0, z: 10 };
    expect(isCameraFacingWallTri(a, b, c, 1)).toBe(true);
  });

  it('keeps the −Z back-wall tape', () => {
    const a = { x: -0.05, y: 0, z: -10 };
    const b = { x: 0.05, y: 12, z: -10 };
    const c = { x: 0.05, y: 0, z: -10 };
    expect(isCameraFacingWallTri(a, b, c, 1)).toBe(false);
  });

  it('keeps the floor center tape', () => {
    const a = { x: -0.05, y: 0.002, z: 0 };
    const b = { x: 0.05, y: 0.002, z: 0 };
    const c = { x: 0.05, y: 0.002, z: 8 };
    expect(isCameraFacingWallTri(a, b, c, 1)).toBe(false);
  });
});

describe('dropCameraFacingWallTris', () => {
  it('removes only the camera-facing wall quad', () => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array([
      // +Z wall (drop) — winding matches glTF (normal −Z)
      -0.05, 0, 10, 0.05, 12, 10, 0.05, 0, 10,
      // floor (keep)
      -0.05, 0.002, 0, 0.05, 0.002, 0, 0.05, 0.002, 8,
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const left = dropCameraFacingWallTris(geo, 1);
    expect(left).toBe(1);
    expect(geo.getIndex()!.count).toBe(3);
  });
});

describe('prepareStageLineOverlay', () => {
  it('converts BLEND line mesh to alpha-test and strips +Z wall', () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([-0.05, 0, 10, 0.05, 12, 10, 0.05, 0, 10]),
        3,
      ),
    );
    const mat = new THREE.MeshStandardMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'SF6 Training Stage Lines';
    mesh.castShadow = true;
    const group = new THREE.Group();
    group.add(mesh);

    expect(prepareStageLineOverlay(group)).toBe(1);
    expect(mat.transparent).toBe(false);
    expect(mat.alphaTest).toBeGreaterThan(0);
    expect(mat.depthWrite).toBe(true);
    expect(mesh.castShadow).toBe(false);
    expect(geo.getIndex()!.count).toBe(0);
  });
});
