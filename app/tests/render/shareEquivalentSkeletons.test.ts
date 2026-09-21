import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { shareEquivalentSkeletons } from '../../src/render/shareEquivalentSkeletons';

function mesh(bones: THREE.Bone[], inverses = bones.map(() => new THREE.Matrix4())) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([1, 2, 3], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 1, 0, 0], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([0.4, 0.6, 0, 0], 4));
  const result = new THREE.SkinnedMesh(geometry);
  result.bind(new THREE.Skeleton(bones, inverses), new THREE.Matrix4());
  return result;
}

describe('shareEquivalentSkeletons', () => {
  it('preserves deformed vertices and per-mesh bind matrices across animated poses', () => {
    const root = new THREE.Group();
    const hip = new THREE.Bone();
    const hand = new THREE.Bone();
    hip.add(hand);
    root.add(hip);
    const a = mesh([hip, hand]);
    const b = mesh([hip, hand]);
    b.bindMatrix.makeTranslation(0.5, 0, 0);
    b.bindMatrixInverse.copy(b.bindMatrix).invert();
    root.add(a, b);
    const previous = b.skeleton;
    const bind = b.bindMatrix.clone();
    shareEquivalentSkeletons(root);
    expect(a.skeleton).toBe(b.skeleton);
    expect(b.bindMatrix).toEqual(bind);
    for (const angle of [0, 0.2, -0.8, 1.6]) {
      hip.position.set(2, 1, 0);
      hand.rotation.z = angle;
      root.updateMatrixWorld(true);
      previous.update();
      a.skeleton.update();
      expect(b.skeleton.boneMatrices).toEqual(previous.boneMatrices);
      const sharedPosition = b.getVertexPosition(0, new THREE.Vector3());
      b.skeleton = previous;
      expect(b.getVertexPosition(0, new THREE.Vector3())).toEqual(sharedPosition);
      b.skeleton = a.skeleton;
    }
  });

  it('keeps different inverse binds, bone orders and independent fighters separate', () => {
    const root = new THREE.Group();
    const bones = [new THREE.Bone(), new THREE.Bone()];
    const a = mesh(bones);
    const inverse = mesh(bones, [new THREE.Matrix4().makeTranslation(1, 0, 0), new THREE.Matrix4()]);
    const reordered = mesh([...bones].reverse());
    const independent = mesh([new THREE.Bone(), new THREE.Bone()]);
    root.add(a, inverse, reordered, independent);
    shareEquivalentSkeletons(root);
    expect(new Set([a, inverse, reordered, independent].map(m => m.skeleton)).size).toBe(4);
  });
});
