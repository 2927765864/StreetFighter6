import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  allocateRegionCounts,
  classifyBoneName,
  normalizeRegionWeights,
} from '../../src/render/wudaParticle/wudaBodyRegions';
import { bakeWudaSurfaceSamplesForMeshes } from '../../src/render/wudaParticle/WudaSurfaceBake';

function skinnedTri(
  boneName: string,
  offset: THREE.Vector3,
): THREE.SkinnedMesh {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array([
    offset.x,
    offset.y,
    offset.z,
    offset.x + 1,
    offset.y,
    offset.z,
    offset.x,
    offset.y + 1,
    offset.z,
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex([0, 1, 2]);
  const skinIndex = new Float32Array(3 * 4);
  const skinWeight = new Float32Array(3 * 4);
  for (let i = 0; i < 3; i++) {
    skinIndex[i * 4] = 0;
    skinWeight[i * 4] = 1;
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));

  const bone = new THREE.Bone();
  bone.name = boneName;
  const skeleton = new THREE.Skeleton([bone]);
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
  mesh.add(bone);
  mesh.bind(skeleton);
  mesh.name = boneName;
  return mesh;
}

describe('wudaBodyRegions', () => {
  it('classifies Ryu-like bone names', () => {
    expect(classifyBoneName('C_Head')).toBe('head');
    expect(classifyBoneName('C_Neck')).toBe('head');
    expect(classifyBoneName('L_Hairband_00_03')).toBe('head');
    expect(classifyBoneName('C_Spine1')).toBe('torso');
    expect(classifyBoneName('C_Hip')).toBe('torso');
    expect(classifyBoneName('C_ObiRoot_00_00')).toBe('torso');
    expect(classifyBoneName('L_UpperArm')).toBe('limbRoot');
    expect(classifyBoneName('R_Thigh')).toBe('limbRoot');
    expect(classifyBoneName('L_Shoulder')).toBe('limbRoot');
    expect(classifyBoneName('L_ForeArm')).toBe('limbTip');
    expect(classifyBoneName('R_Hand')).toBe('limbTip');
    expect(classifyBoneName('L_Knee')).toBe('limbTip');
    expect(classifyBoneName('R_Shin_1')).toBe('limbTip');
    expect(classifyBoneName('L_Foot')).toBe('limbTip');
  });

  it('allocates by relative weights with largest remainder', () => {
    const counts = allocateRegionCounts(100, {
      head: 0.1,
      torso: 0.4,
      limbRoot: 0.25,
      limbTip: 0.25,
    });
    expect(counts.head + counts.torso + counts.limbRoot + counts.limbTip).toBe(
      100,
    );
    expect(counts.head).toBe(10);
    expect(counts.torso).toBe(40);
    expect(counts.limbRoot).toBe(25);
    expect(counts.limbTip).toBe(25);
  });

  it('redistributes empty regions', () => {
    const counts = allocateRegionCounts(
      10,
      { head: 0.5, torso: 0.5, limbRoot: 0, limbTip: 0 },
      { head: 0, torso: 10, limbRoot: 0, limbTip: 0 },
    );
    expect(counts.head).toBe(0);
    expect(counts.torso).toBe(10);
  });

  it('normalizeRegionWeights falls back to defaults on zeros', () => {
    const n = normalizeRegionWeights({
      head: 0,
      torso: 0,
      limbRoot: 0,
      limbTip: 0,
    });
    expect(n.torso).toBeGreaterThan(0);
  });

  it('surface bake respects region quotas on labeled meshes', () => {
    const head = skinnedTri('C_Head', new THREE.Vector3(0, 2, 0));
    const torso = skinnedTri('C_Spine1', new THREE.Vector3(0, 1, 0));
    const root = skinnedTri('L_UpperArm', new THREE.Vector3(-1, 1, 0));
    const tip = skinnedTri('L_ForeArm', new THREE.Vector3(-2, 1, 0));
    const baked = bakeWudaSurfaceSamplesForMeshes([head, torso, root, tip], 100, 1, {
      regionWeights: {
        head: 0.1,
        torso: 0.4,
        limbRoot: 0.25,
        limbTip: 0.25,
      },
    });
    expect(baked.samples.length).toBe(100);
    expect(baked.regionCounts).toEqual({
      head: 10,
      torso: 40,
      limbRoot: 25,
      limbTip: 25,
    });
    // meshIndex should match region quotas approximately
    const byMesh = [0, 0, 0, 0];
    for (const s of baked.samples) {
      byMesh[s.meshIndex ?? 0]!++;
    }
    expect(byMesh[0]).toBe(10);
    expect(byMesh[1]).toBe(40);
    expect(byMesh[2]).toBe(25);
    expect(byMesh[3]).toBe(25);

    for (const m of [head, torso, root, tip]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      m.skeleton.dispose();
    }
  });
});
