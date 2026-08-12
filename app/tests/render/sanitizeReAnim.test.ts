import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyReCentimeterToMeterIfNeeded,
  maxLocalMeshExtent,
  RE_POS_TOXIC_ABS,
  resetFbxUnitScales,
  sanitizeReAnimationClips,
  sanitizeRePositionTrack,
  stripFbxSceneClutter,
  unifySkinnedMeshSkeletons,
} from '../../src/render/materialUtils';

function vecTrack(
  name: string,
  times: number[],
  values: number[],
): THREE.VectorKeyframeTrack {
  return new THREE.VectorKeyframeTrack(name, times, values);
}

describe('sanitizeRePositionTrack', () => {
  it('keeps healthy hip bob (idle-like meters)', () => {
    const t = vecTrack('C_Hip.position', [0, 1], [0, 0.91, 0, 0.02, 1.01, 0]);
    const r = sanitizeRePositionTrack(t);
    expect(r.keep).toBe(true);
    expect(r.scaled).toBe(false);
    expect(r.track.values[1]).toBeCloseTo(0.91);
  });

  it('keeps crouch hip drop below stand bind', () => {
    const t = vecTrack('C_Hip.position', [0, 1], [0, 0.63, 0, 0, 0.66, 0]);
    const r = sanitizeRePositionTrack(t);
    expect(r.keep).toBe(true);
    expect(trackAbsMax(r.track.values)).toBeLessThan(RE_POS_TOXIC_ABS);
  });

  it('scales FBX-cm-like toxic tracks by 0.01', () => {
    const t = vecTrack('C_Hip.position', [0, 1], [0, -90, 0, 0, -105, 0]);
    const r = sanitizeRePositionTrack(t);
    expect(r.keep).toBe(true);
    expect(r.scaled).toBe(true);
    expect(r.track.values[1]).toBeCloseTo(-0.9);
    expect(r.track.values[4]).toBeCloseTo(-1.05);
  });

  it('drops unrecoverable huge positions', () => {
    const t = vecTrack('C_Hip.position', [0], [0, 1e6, 0]);
    const r = sanitizeRePositionTrack(t);
    expect(r.keep).toBe(false);
  });
});

describe('sanitizeReAnimationClips', () => {
  it('does not strip all position tracks (hip Y preserved)', () => {
    const clip = new THREE.AnimationClip('idle', 1, [
      vecTrack('C_Hip.position', [0, 1], [0, 0.95, 0, 0, 1.0, 0]),
      new THREE.QuaternionKeyframeTrack(
        'C_Hip.quaternion',
        [0],
        [0, 0, 0, 1],
      ),
      vecTrack('L_Foot.position', [0], [0, -0.405, 0]),
    ]);
    const [out] = sanitizeReAnimationClips([clip]);
    const pos = out!.tracks.filter((t) => t.name.endsWith('.position'));
    expect(pos.length).toBe(2);
    const hip = pos.find((t) => t.name.includes('C_Hip'))!;
    expect(hip.values[1]).toBeCloseTo(0.95);
    expect(hip.values[4]).toBeCloseTo(1.0);
  });

  it('drops Armature quaternion tracks', () => {
    const clip = new THREE.AnimationClip('x', 1, [
      new THREE.QuaternionKeyframeTrack(
        'Armature.quaternion',
        [0],
        [0.7, 0, 0, 0.7],
      ),
      new THREE.QuaternionKeyframeTrack('C_Hip.quaternion', [0], [0, 0, 0, 1]),
    ]);
    const [out] = sanitizeReAnimationClips([clip]);
    expect(out!.tracks.some((t) => /Armature\.quaternion/i.test(t.name))).toBe(
      false,
    );
    expect(out!.tracks.some((t) => t.name.includes('C_Hip'))).toBe(true);
  });
});

function trackAbsMax(values: ArrayLike<number>): number {
  let m = 0;
  for (let i = 0; i < values.length; i++) {
    m = Math.max(m, Math.abs(values[i]!));
  }
  return m;
}

describe('resetFbxUnitScales', () => {
  it('resets Blender FBX scale 100 and classic 0.01', () => {
    const root = new THREE.Group();
    const a = new THREE.Object3D();
    a.name = 'Armature';
    a.scale.setScalar(100);
    const b = new THREE.Bone();
    b.name = 'Root';
    b.scale.setScalar(0.01);
    root.add(a);
    a.add(b);
    const n = resetFbxUnitScales(root);
    expect(n).toBe(2);
    expect(a.scale.x).toBeCloseTo(1);
    expect(b.scale.x).toBeCloseTo(1);
  });
});

describe('stripFbxSceneClutter', () => {
  it('removes lights, cameras, and non-skinned helper meshes', () => {
    const root = new THREE.Group();
    const body = new THREE.SkinnedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    );
    body.name = 'esf_Body';
    const helper = new THREE.Mesh(
      new THREE.SphereGeometry(50),
      new THREE.MeshBasicMaterial(),
    );
    helper.name = '棱角球';
    const light = new THREE.PointLight();
    light.name = 'Light';
    const cam = new THREE.PerspectiveCamera();
    cam.name = 'Camera';
    root.add(body, helper, light, cam);
    const n = stripFbxSceneClutter(root);
    expect(n).toBe(3);
    expect(root.children.map((c) => c.name)).toEqual(['esf_Body']);
  });
});

describe('applyReCentimeterToMeterIfNeeded', () => {
  it('bakes cm local extents into geometry in place (not root.scale)', () => {
    const root = new THREE.Group();
    // ~160 unit tall "cm" body at origin
    const body = new THREE.Mesh(new THREE.BoxGeometry(40, 160, 30));
    body.name = 'esf_Body00';
    root.add(body);
    expect(maxLocalMeshExtent(root)).toBeGreaterThan(20);

    expect(applyReCentimeterToMeterIfNeeded(root)).toBe(true);
    expect(root.userData.reMeterBaked).toBe(true);
    expect(root.scale.x).toBeCloseTo(1);
    // geometry now in meters
    body.geometry.computeBoundingBox();
    const h = body.geometry.boundingBox!.getSize(new THREE.Vector3()).y;
    expect(h).toBeCloseTo(1.6, 1);

    // idempotent
    expect(applyReCentimeterToMeterIfNeeded(root)).toBe(true);
    body.geometry.computeBoundingBox();
    const h2 = body.geometry.boundingBox!.getSize(new THREE.Vector3()).y;
    expect(h2).toBeCloseTo(1.6, 1);
  });

  it('does not scale already-meter meshes', () => {
    const root = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.7, 0.3));
    body.name = 'esf_Body00';
    root.add(body);
    expect(applyReCentimeterToMeterIfNeeded(root)).toBe(false);
    expect(root.userData.reMeterBaked).toBeFalsy();
  });
});

describe('unifySkinnedMeshSkeletons', () => {
  it('rebinds secondary meshes onto primary armature bones by name', () => {
    const root = new THREE.Group();
    const hipA = new THREE.Bone();
    hipA.name = 'C_Hip';
    hipA.position.set(0, 1, 0);
    const hipB = new THREE.Bone();
    hipB.name = 'C_Hip';
    hipB.position.set(0, 1, 0);
    root.add(hipA, hipB);

    const geo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const mat = new THREE.MeshBasicMaterial();
    const body = new THREE.SkinnedMesh(geo, mat);
    body.name = 'body';
    body.add(hipA);
    body.bind(new THREE.Skeleton([hipA]));

    const cloth = new THREE.SkinnedMesh(geo.clone(), mat.clone());
    cloth.name = 'cloth';
    cloth.add(hipB);
    cloth.bind(new THREE.Skeleton([hipB]));

    root.add(body, cloth);
    expect(body.skeleton.bones[0]).not.toBe(cloth.skeleton.bones[0]);

    const n = unifySkinnedMeshSkeletons(root);
    expect(n).toBe(1);
    expect(cloth.skeleton.bones[0]).toBe(body.skeleton.bones[0]);
    // idempotent
    expect(unifySkinnedMeshSkeletons(root)).toBe(0);
  });
});
