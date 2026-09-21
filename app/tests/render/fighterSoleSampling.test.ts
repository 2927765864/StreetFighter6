import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { FighterView } from '../../src/render/FighterView';

function setup(names: string[]) {
  const view = new FighterView(new THREE.Scene(), 0xffffff);
  const model = new THREE.Group();
  const bones = names.map(name => {
    const bone = new THREE.Bone();
    bone.name = name;
    model.add(bone);
    return bone;
  });
  const internal = view as unknown as {
    modelRoot: THREE.Object3D;
    measureContactSoleY(): number | null;
  };
  internal.modelRoot = model;
  view.root.add(model);
  return { view, model, bones, sample: () => internal.measureContactSoleY() };
}

describe('fighter sole sampling', () => {
  it('keeps toe priority and follows current ancestor transforms without querying unrelated bones', () => {
    const { view, model, bones, sample } = setup(['L_Footindex2', 'R_Footpinky2', 'L_Foot', 'C_Hip']);
    bones[0]!.position.y = 0.2;
    bones[1]!.position.y = 0.3;
    bones[2]!.position.y = -1; // toes still own contact when available
    const irrelevant = vi.spyOn(bones[3]!, 'getWorldPosition');
    expect(sample()).toBeCloseTo(0.2);
    // Cached references must observe new poses and root motion without a render.
    view.root.position.y = 2;
    view.root.scale.set(2, 2, -2);
    model.position.y = 0.1;
    bones[1]!.position.y = -0.05;
    expect(sample()).toBeCloseTo(2.1);
    expect(irrelevant).not.toHaveBeenCalled();
  });

  it('uses the lower ankle on rigs without toe contact bones', () => {
    const { bones, sample } = setup(['LeftFoot', 'RightFoot', 'Spine']);
    bones[0]!.position.y = 0.4;
    bones[1]!.position.y = 0.25;
    expect(sample()).toBeCloseTo(0.25);
    bones[0]!.position.y = 0.1;
    expect(sample()).toBeCloseTo(0.1);
  });
});
