import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import {
  STAGE_ANISOTROPY,
  STAGE_ENV_MAP_INTENSITY,
  STAGE_ROUGHNESS_FLOOR,
  applyStageMaterialPolicy,
  stabilizeStageTexture,
} from '../../src/render/stageMaterialPolicy';

describe('stabilizeStageTexture', () => {
  it('enables trilinear mips and anisotropy', () => {
    const tex = new THREE.Texture();
    tex.anisotropy = 1;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    stabilizeStageTexture(tex);
    expect(tex.anisotropy).toBeGreaterThanOrEqual(STAGE_ANISOTROPY);
    expect(tex.generateMipmaps).toBe(true);
    expect(tex.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(tex.magFilter).toBe(THREE.LinearFilter);
  });
});

describe('applyStageMaterialPolicy', () => {
  it('raises wall roughness and leaves the center tape opaque', () => {
    const wallMat = new THREE.MeshStandardMaterial({
      roughness: 0.35,
      envMapIntensity: 1,
      map: new THREE.Texture(),
    });
    wallMat.normalScale.set(0.8, 0.8);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), wallMat);
    wall.name = 'SF6 Training Stage Floor and Walls';

    const lineMat = new THREE.MeshStandardMaterial({ roughness: 0.4 });
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.1), lineMat);
    line.name = 'SF6 Training Stage Lines';

    const root = new THREE.Group();
    root.add(wall, line);

    const r = applyStageMaterialPolicy(root);
    expect(r.meshes).toBe(2);
    expect(r.textures).toBe(1);
    expect(wallMat.roughness).toBeGreaterThanOrEqual(STAGE_ROUGHNESS_FLOOR);
    expect(wallMat.envMapIntensity).toBe(STAGE_ENV_MAP_INTENSITY);
    expect(Math.abs(wallMat.normalScale.x)).toBeLessThanOrEqual(0.25);
    expect(wallMat.map!.anisotropy).toBeGreaterThanOrEqual(STAGE_ANISOTROPY);
    expect(lineMat.roughness).toBe(0.4);
  });
});
