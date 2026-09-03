import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  copyBoneMatricesByBoneRef,
  syncSkinnedMeshBoneMatrices,
} from '../../src/render/wudaParticle/wudaSkeletonSync';

function makeSkinned(
  bones: THREE.Bone[],
  inverses?: THREE.Matrix4[],
): THREE.SkinnedMesh {
  const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
  const n = geo.getAttribute('position').count;
  const skinIndex = new Float32Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    skinIndex[i * 4] = 0;
    skinWeight[i * 4] = 1;
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
  const inv =
    inverses ??
    bones.map(() => {
      const m = new THREE.Matrix4();
      m.identity();
      return m;
    });
  mesh.bind(new THREE.Skeleton(bones, inv));
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe('copyBoneMatricesByBoneRef', () => {
  it('copies matrices when bone order differs', () => {
    const root = new THREE.Bone();
    root.name = 'root';
    const child = new THREE.Bone();
    child.name = 'child';
    root.add(child);

    const full = makeSkinned([root, child]);
    const reordered = makeSkinned([child, root]); // flipped index order

    root.position.set(0, 3, 0);
    root.updateMatrixWorld(true);
    full.skeleton.update();

    expect(copyBoneMatricesByBoneRef(reordered.skeleton, full.skeleton)).toBe(
      true,
    );

    // reordered index 0 is child → must match full's child matrix (index 1)
    const dst = reordered.skeleton.boneMatrices!;
    const src = full.skeleton.boneMatrices!;
    expect(dst.subarray(0, 16)).toEqual(src.subarray(16, 32));
    expect(dst.subarray(16, 32)).toEqual(src.subarray(0, 16));
  });
});

describe('syncSkinnedMeshBoneMatrices', () => {
  it('updates once and copies when skeletons share bones (same order)', () => {
    const root = new THREE.Bone();
    root.name = 'root';
    root.position.set(0, 1, 0);
    const child = new THREE.Bone();
    child.name = 'child';
    child.position.set(0, 1, 0);
    root.add(child);

    const bones = [root, child];
    const a = makeSkinned(bones);
    const b = makeSkinned(bones);

    expect(a.skeleton).not.toBe(b.skeleton);

    root.position.set(0, 2, 0);
    root.updateMatrixWorld(true);

    const stats = syncSkinnedMeshBoneMatrices([a, b]);
    expect(stats.meshCount).toBe(2);
    expect(stats.skeletonObjects).toBe(2);
    expect(stats.updates).toBe(1);
    expect(stats.copies).toBe(1);

    expect(a.skeleton.boneMatrices).toEqual(b.skeleton.boneMatrices);
  });

  it('still one update when secondary bone order is flipped (unify-like)', () => {
    const root = new THREE.Bone();
    root.name = 'root';
    const child = new THREE.Bone();
    child.name = 'child';
    root.add(child);

    const body = makeSkinned([root, child]);
    const part = makeSkinned([child, root]);

    root.position.set(1, 0, 0);
    root.updateMatrixWorld(true);

    const stats = syncSkinnedMeshBoneMatrices([body, part]);
    expect(stats.updates).toBe(1);
    expect(stats.copies).toBe(1);
  });

  it('updates separately when bone sets are disjoint', () => {
    const boneA = new THREE.Bone();
    boneA.name = 'a';
    const boneB = new THREE.Bone();
    boneB.name = 'b';
    const m0 = makeSkinned([boneA]);
    const m1 = makeSkinned([boneB]);

    const stats = syncSkinnedMeshBoneMatrices([m0, m1]);
    expect(stats.updates).toBe(2);
    expect(stats.copies).toBe(0);
  });

  it('updates once when meshes already share one Skeleton instance', () => {
    const bone = new THREE.Bone();
    bone.name = 'shared';
    const m0 = makeSkinned([bone]);
    const m1 = makeSkinned([bone]);
    m1.bind(m0.skeleton, m1.bindMatrix);

    const stats = syncSkinnedMeshBoneMatrices([m0, m1]);
    expect(stats.skeletonObjects).toBe(1);
    expect(stats.updates).toBe(1);
    expect(stats.copies).toBe(0);
  });
});
