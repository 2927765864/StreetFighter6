import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createDefaultSimConfig } from '../../src/config/constants';
import {
  clampPantsDeltaSec,
  PANTS_GRAVITY_REF,
  pantsBreathWind,
  pantsExternalForceScale,
  pantsGravityAccel,
  pantsGravityScaleForJumpPhase,
  pantsHardnessAtDepth,
} from '../../src/render/pants/pantsPhysicsMath';
import { RyuPantsPhysics } from '../../src/render/pants/RyuPantsPhysics';
import {
  RYU_PANTS_COLLIDER_BONES,
  RYU_PANTS_MOVABLE_CHAINS,
  RYU_PANTS_RINGS,
} from '../../src/render/pants/ryuPantsBoneNames';
import {
  applyPantsRootMotion,
  applySystemTransform,
  clampPantsParticleSeparation,
  stepPantsSolver,
  writePantsBones,
} from '../../src/render/pants/spcr/pantsSpcrSolver';
import type { PantsParticle } from '../../src/render/pants/spcr/PantsSpcrTypes';

function buildSyntheticRyuPants(): THREE.Group {
  const root = new THREE.Group();
  const hip = new THREE.Bone();
  hip.name = RYU_PANTS_COLLIDER_BONES.hip;
  root.add(hip);

  const obi = new THREE.Bone();
  obi.name = RYU_PANTS_COLLIDER_BONES.obiRoot;
  hip.add(obi);

  function addLimb(
    side: 'L' | 'R',
    x: number,
  ): { thigh: THREE.Bone; knee: THREE.Bone; foot: THREE.Bone } {
    const thigh = new THREE.Bone();
    thigh.name =
      side === 'L'
        ? RYU_PANTS_COLLIDER_BONES.lThigh
        : RYU_PANTS_COLLIDER_BONES.rThigh;
    thigh.position.set(x, -0.2, 0);
    hip.add(thigh);

    const knee = new THREE.Bone();
    knee.name =
      side === 'L'
        ? RYU_PANTS_COLLIDER_BONES.lKnee
        : RYU_PANTS_COLLIDER_BONES.rKnee;
    knee.position.set(0, -0.35, 0);
    thigh.add(knee);

    const foot = new THREE.Bone();
    foot.name =
      side === 'L'
        ? RYU_PANTS_COLLIDER_BONES.lFoot
        : RYU_PANTS_COLLIDER_BONES.rFoot;
    foot.position.set(0, -0.35, 0.05);
    knee.add(foot);
    return { thigh, knee, foot };
  }

  const L = addLimb('L', 0.12);
  const R = addLimb('R', -0.12);

  const parents: Record<string, THREE.Object3D> = {
    L_PantsA_00: L.thigh,
    L_PantsA_01: L.thigh,
    L_PantsA_02: L.thigh,
    L_PantsThigh: L.thigh,
    L_PantsB_00: L.knee,
    L_PantsB_02: L.knee,
    L_PantsC_00: L.knee,
    L_PantsC_01: L.knee,
    L_PantsC_02: L.knee,
    R_PantsA_00: R.thigh,
    R_PantsA_01: R.thigh,
    R_PantsA_02: R.thigh,
    R_PantsThigh: R.thigh,
    R_PantsB_00: R.knee,
    R_PantsB_02: R.knee,
    R_PantsC_00: R.knee,
    R_PantsC_01: R.knee,
    R_PantsC_02: R.knee,
  };

  for (const chain of RYU_PANTS_MOVABLE_CHAINS) {
    const parent = parents[chain.id] ?? hip;
    const drive = new THREE.Bone();
    drive.name = chain.driveBone;
    drive.position.set(0.02, -0.04, 0.01);
    parent.add(drive);
    if (chain.aimBone) {
      const aim = new THREE.Bone();
      aim.name = chain.aimBone;
      aim.position.set(0, -0.03, 0);
      drive.add(aim);
    }
  }

  root.updateMatrixWorld(true);
  return root;
}

describe('pantsPhysicsMath', () => {
  it('clamps delta to max and applies timeScale', () => {
    expect(clampPantsDeltaSec(0.2, 0.05, 1)).toBeCloseTo(0.05);
    expect(clampPantsDeltaSec(0.02, 0.05, 1)).toBeCloseTo(0.02);
    expect(clampPantsDeltaSec(0.04, 0.05, 2)).toBeCloseTo(0.05);
    expect(clampPantsDeltaSec(-1, 0.05, 1)).toBe(0);
  });

  it('uses air gravity scale only in air jumpPhase', () => {
    expect(pantsGravityScaleForJumpPhase('air', 0.65)).toBe(0.65);
    expect(pantsGravityScaleForJumpPhase('none', 0.65)).toBe(1);
  });

  it('lerps hardness toward tip scale', () => {
    expect(pantsHardnessAtDepth(0.2, 0, 1, 0.55)).toBeCloseTo(0.2);
    expect(pantsHardnessAtDepth(0.2, 1, 1, 0.55)).toBeCloseTo(0.2 * 0.55);
  });

  it('breath wind is zero when amp is 0', () => {
    const w = pantsBreathWind(1, 0.35, 0, 1, 0, 0);
    expect(w.x).toBe(0);
    expect(w.y).toBe(0);
    expect(w.z).toBe(0);
  });

  it('maps panel gravity power 1 to earth-scale accel', () => {
    const g = pantsGravityAccel(0, -1, 0, 1, 'none', 0.65);
    expect(g.y).toBeCloseTo(-PANTS_GRAVITY_REF, 5);
    expect(pantsExternalForceScale(1 / 60)).toBeCloseTo(0.5 / 3600, 8);
  });
});

describe('ryuPantsBoneNames', () => {
  it('has 18 drive bones (weighted roots), not empty tips', () => {
    expect(RYU_PANTS_MOVABLE_CHAINS).toHaveLength(18);
    for (const c of RYU_PANTS_MOVABLE_CHAINS) {
      expect(c.driveBone.endsWith('_end')).toBe(false);
    }
    const thigh = RYU_PANTS_RINGS.find((r) => r.id === 'L_ThighRing');
    expect(thigh?.chainIds).toHaveLength(4);
  });
});

describe('pants config defaults', () => {
  it('ships soft-droop defaults', () => {
    const cfg = createDefaultSimConfig();
    expect(cfg.pantsPhysicsEnabled).toBe(true);
    expect(cfg.pantsHardness).toBe(0.12);
    expect(cfg.pantsGravityPower).toBe(1.0);
    expect(cfg.pantsBreathAmp).toBe(0.8);
    expect(cfg.pantsEnableHorizontal).toBe(true);
    expect(cfg.pantsUsePushIn).toBe(false);
    expect(cfg.pantsRootSlideLimit).toBe(0.35);
    expect(cfg.pantsRootRotateLimitDeg).toBe(35);
    expect(cfg.pantsMaxSeparation).toBe(0.55);
  });
});

describe('pants force integration', () => {
  it('high gravity + low hardness drops a free tip measurably', () => {
    const bone = new THREE.Bone();
    bone.position.set(0, 0, 0);
    const root = new THREE.Group();
    root.add(bone);
    root.updateMatrixWorld(true);

    const start = new THREE.Vector3(0, 1, 0);
    const particle: PantsParticle = {
      bone,
      chainId: 'L_PantsA_00',
      region: 'thigh',
      depth: 0,
      isFixed: false,
      boneAxis: new THREE.Vector3(0, -1, 0),
      initialLocalRotation: bone.quaternion.clone(),
      transformLocalQuat: bone.quaternion.clone(),
      positionCurrent: start.clone(),
      positionPrevious: start.clone(),
      transformPos: start.clone(),
      aimBone: null,
      bindLocalPos: null,
      bindLocalQuat: null,
    };

    const g = pantsGravityAccel(0, -1, 0, 2, 'none', 1);
    const baseParams = {
      resistance: 0.9,
      hardness: 0.02,
      hardnessTipScale: 1,
      gravity: new THREE.Vector3(g.x, g.y, g.z),
      wind: new THREE.Vector3(0, 0, 0),
      pointRadius: 0.01,
      iterations: 1,
      usePushIn: false,
      shrink: {
        structuralVertical: 1,
        structuralHorizontal: 1,
        shear: 1,
        bendingVertical: 1,
        bendingHorizontal: 1,
      },
      stretch: {
        structuralVertical: 1,
        structuralHorizontal: 1,
        shear: 1,
        bendingVertical: 1,
        bendingHorizontal: 1,
      },
    };
    for (let i = 0; i < 30; i++) {
      particle.transformPos.copy(start);
      particle.transformLocalQuat.copy(bone.quaternion);
      stepPantsSolver({
        particles: [particle],
        constraints: [],
        colliders: [],
        maxDepthByIndex: [0],
        dt: 1 / 60,
        params: baseParams,
        captureAnimTargets: false,
        writeBones: false,
      });
    }
    expect(particle.positionCurrent.y).toBeLessThan(start.y - 0.02);
  });

  it('does not drip forever across substeps when anim target is frozen', () => {
    const bone = new THREE.Bone();
    const root = new THREE.Group();
    root.add(bone);
    root.updateMatrixWorld(true);
    const start = new THREE.Vector3(0, 1, 0);
    const particle: PantsParticle = {
      bone,
      chainId: 'L_PantsA_00',
      region: 'thigh',
      depth: 0,
      isFixed: false,
      boneAxis: new THREE.Vector3(0, -1, 0),
      initialLocalRotation: bone.quaternion.clone(),
      transformLocalQuat: bone.quaternion.clone(),
      positionCurrent: start.clone(),
      positionPrevious: start.clone(),
      transformPos: start.clone(),
      aimBone: null,
      bindLocalPos: null,
      bindLocalQuat: null,
    };
    const g = pantsGravityAccel(0, -1, 0, 1.5, 'none', 1);
    const params = {
      resistance: 0.85,
      hardness: 0.08,
      hardnessTipScale: 1,
      gravity: new THREE.Vector3(g.x, g.y, g.z),
      wind: new THREE.Vector3(0, 0, 0),
      pointRadius: 0.01,
      iterations: 2,
      usePushIn: false,
      shrink: {
        structuralVertical: 1,
        structuralHorizontal: 1,
        shear: 1,
        bendingVertical: 1,
        bendingHorizontal: 1,
      },
      stretch: {
        structuralVertical: 1,
        structuralHorizontal: 1,
        shear: 1,
        bendingVertical: 1,
        bendingHorizontal: 1,
      },
    };
    // Simulate many frames with 2 substeps, anim target frozen each frame.
    for (let f = 0; f < 90; f++) {
      particle.transformPos.copy(start);
      particle.transformLocalQuat.copy(bone.quaternion);
      for (let s = 0; s < 2; s++) {
        stepPantsSolver({
          particles: [particle],
          constraints: [],
          colliders: [],
          maxDepthByIndex: [0],
          dt: 1 / 120,
          params,
          captureAnimTargets: false,
          writeBones: false,
        });
      }
      writePantsBones([particle]);
    }
    // Settled droop, not runaway (would be << 0 if dripping).
    expect(particle.positionCurrent.y).toBeLessThan(start.y);
    expect(particle.positionCurrent.y).toBeGreaterThan(start.y - 0.35);
  });
});

describe('pants root motion', () => {
  it('applySystemTransform rotates around pivot then slides', () => {
    const point = new THREE.Vector3(1, 0, 0);
    const pivot = new THREE.Vector3(0, 0, 0);
    const slide = new THREE.Vector3(0, 2, 0);
    const rot = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.PI / 2,
    );
    applySystemTransform(point, pivot, slide, rot);
    expect(point.x).toBeCloseTo(0, 5);
    expect(point.y).toBeCloseTo(2, 5);
    expect(point.z).toBeCloseTo(-1, 5);
  });

  it('under slide limit does not move free particles (anchors handle follow)', () => {
    const bone = new THREE.Bone();
    const particle: PantsParticle = {
      bone,
      chainId: 'L_PantsA_00',
      region: 'thigh',
      depth: 0,
      isFixed: false,
      boneAxis: new THREE.Vector3(0, -1, 0),
      initialLocalRotation: new THREE.Quaternion(),
      transformLocalQuat: new THREE.Quaternion(),
      positionCurrent: new THREE.Vector3(1, 0, 0),
      positionPrevious: new THREE.Vector3(1, 0, 0),
      transformPos: new THREE.Vector3(1.2, 0, 0),
      aimBone: null,
      bindLocalPos: null,
      bindLocalQuat: null,
    };
    const prevPos = new THREE.Vector3(0, 0, 0);
    const prevQuat = new THREE.Quaternion();
    const result = applyPantsRootMotion({
      particles: [particle],
      rootPos: new THREE.Vector3(0.1, 0, 0),
      rootQuat: new THREE.Quaternion(),
      prevRootPos: prevPos,
      prevRootQuat: prevQuat,
      hasPrev: true,
      slideLimit: 0.35,
      rotateLimitRad: THREE.MathUtils.degToRad(35),
    });
    expect(result).toBe('none');
    expect(particle.positionCurrent.x).toBeCloseTo(1, 5);
  });

  it('over slide limit warps free particles to anim targets', () => {
    const bone = new THREE.Bone();
    const particle: PantsParticle = {
      bone,
      chainId: 'L_PantsA_00',
      region: 'thigh',
      depth: 0,
      isFixed: false,
      boneAxis: new THREE.Vector3(0, -1, 0),
      initialLocalRotation: new THREE.Quaternion(),
      transformLocalQuat: new THREE.Quaternion(),
      positionCurrent: new THREE.Vector3(1, 0, 0),
      positionPrevious: new THREE.Vector3(1, 0, 0),
      transformPos: new THREE.Vector3(5, 0, 0),
      aimBone: null,
      bindLocalPos: null,
      bindLocalQuat: null,
    };
    const prevPos = new THREE.Vector3(0, 0, 0);
    const prevQuat = new THREE.Quaternion();
    const result = applyPantsRootMotion({
      particles: [particle],
      rootPos: new THREE.Vector3(1.0, 0, 0),
      rootQuat: new THREE.Quaternion(),
      prevRootPos: prevPos,
      prevRootQuat: prevQuat,
      hasPrev: true,
      slideLimit: 0.35,
      rotateLimitRad: THREE.MathUtils.degToRad(35),
    });
    expect(result).toBe('warp');
    expect(particle.positionCurrent.x).toBeCloseTo(5, 5);
    expect(particle.positionPrevious.x).toBeCloseTo(5, 5);
  });

  it('clampPantsParticleSeparation pulls outliers onto the max sphere', () => {
    const bone = new THREE.Bone();
    const particle: PantsParticle = {
      bone,
      chainId: 'L_PantsA_00',
      region: 'thigh',
      depth: 0,
      isFixed: false,
      boneAxis: new THREE.Vector3(0, -1, 0),
      initialLocalRotation: new THREE.Quaternion(),
      transformLocalQuat: new THREE.Quaternion(),
      positionCurrent: new THREE.Vector3(10, 0, 0),
      positionPrevious: new THREE.Vector3(10, 0, 0),
      transformPos: new THREE.Vector3(0, 0, 0),
      aimBone: null,
      bindLocalPos: null,
      bindLocalQuat: null,
    };
    const hit = clampPantsParticleSeparation([particle], 0.55);
    expect(hit).toBe(true);
    expect(particle.positionCurrent.length()).toBeCloseTo(0.55, 5);
  });
});

describe('RyuPantsPhysics', () => {
  it('binds anchor+free per chain and updates drive local position', () => {
    const root = buildSyntheticRyuPants();
    const phys = new RyuPantsPhysics();
    const bind = phys.bind(root);
    expect(bind.ok).toBe(true);
    if (!bind.ok) return;
    expect(bind.chainCount).toBe(18);
    expect(bind.particleCount).toBe(36);
    expect(bind.constraintCount).toBeGreaterThan(0);

    const drive = root.getObjectByName('L_PantsA_00_00')!;
    const beforePos = drive.position.clone();
    const cfg = createDefaultSimConfig();
    cfg.pantsHardness = 0.02;
    cfg.pantsGravityPower = 2;
    for (let i = 0; i < 40; i++) {
      root.position.x = Math.sin(i * 0.3) * 0.25;
      root.updateMatrixWorld(true);
      phys.update({ deltaSec: 1 / 60, cfg, jumpPhase: 'none' });
    }
    expect(drive.position.distanceTo(beforePos)).toBeGreaterThan(1e-5);
  });

  it('warps free particles across a large root translation', () => {
    const root = buildSyntheticRyuPants();
    const phys = new RyuPantsPhysics();
    expect(phys.bind(root).ok).toBe(true);
    const cfg = createDefaultSimConfig();
    cfg.pantsHardness = 0.12;
    cfg.pantsGravityPower = 1;
    cfg.pantsShowConstraints = false;

    // Settle one frame at origin.
    root.updateMatrixWorld(true);
    phys.update({ deltaSec: 1 / 60, cfg, jumpPhase: 'none' });

    const drive = root.getObjectByName('L_PantsA_00_00')!;
    const beforeWorld = new THREE.Vector3();
    drive.getWorldPosition(beforeWorld);

    root.position.x += 1.0;
    root.updateMatrixWorld(true);
    phys.update({ deltaSec: 1 / 60, cfg, jumpPhase: 'none' });

    const afterWorld = new THREE.Vector3();
    drive.getWorldPosition(afterWorld);
    // Over slideLimit → warp to anim targets (which moved with modelRoot).
    expect(afterWorld.x - beforeWorld.x).toBeGreaterThan(0.85);
  });

  it('survives rapid hip/thigh animation without fullscreen stretch', () => {
    const root = buildSyntheticRyuPants();
    const phys = new RyuPantsPhysics();
    expect(phys.bind(root).ok).toBe(true);
    const cfg = createDefaultSimConfig();
    cfg.pantsMaxSeparation = 0.55;

    const hip = root.getObjectByName(RYU_PANTS_COLLIDER_BONES.hip)!;
    const lThigh = root.getObjectByName(RYU_PANTS_COLLIDER_BONES.lThigh)!;
    const drive = root.getObjectByName('L_PantsA_00_00')!;

    for (let i = 0; i < 60; i++) {
      // Simulate crouch/jump hip bob + thigh swing; modelRoot stays put.
      hip.position.y = -0.05 + Math.sin(i * 0.8) * 0.2;
      lThigh.rotation.x = Math.sin(i * 1.1) * 0.9;
      root.updateMatrixWorld(true);
      phys.update({ deltaSec: 1 / 60, cfg, jumpPhase: i % 2 === 0 ? 'air' : 'none' });
    }

    const world = new THREE.Vector3();
    drive.getWorldPosition(world);
    const target = new THREE.Vector3();
    // bindLocal × parent world after last update (drive may be written).
    const parent = drive.parent!;
    parent.updateWorldMatrix(true, false);
    target.set(0.02, -0.04, 0.01).applyMatrix4(parent.matrixWorld);
    expect(world.distanceTo(target)).toBeLessThanOrEqual(cfg.pantsMaxSeparation + 0.02);
    // Must not be a stage-scale explode.
    expect(Math.abs(world.x)).toBeLessThan(3);
    expect(Math.abs(world.y)).toBeLessThan(3);
  });

  it('warps on facing scale flip', () => {
    const root = buildSyntheticRyuPants();
    const phys = new RyuPantsPhysics();
    expect(phys.bind(root).ok).toBe(true);
    const cfg = createDefaultSimConfig();

    root.updateMatrixWorld(true);
    phys.update({ deltaSec: 1 / 60, cfg, jumpPhase: 'none' });

    const drive = root.getObjectByName('L_PantsC_00_00')!;
    // Pull a free bone far away as if exploded, then flip facing.
    drive.position.set(20, 0, 0);
    root.scale.z = -1;
    root.updateMatrixWorld(true);
    phys.update({ deltaSec: 1 / 60, cfg, jumpPhase: 'none' });

    const world = new THREE.Vector3();
    drive.getWorldPosition(world);
    expect(Math.abs(world.x)).toBeLessThan(2);
  });

  it('does not drip forever when standing still with gravity', () => {
    const root = buildSyntheticRyuPants();
    const phys = new RyuPantsPhysics();
    expect(phys.bind(root).ok).toBe(true);
    const cfg = createDefaultSimConfig();
    cfg.pantsHardness = 0.12;
    cfg.pantsGravityPower = 1.5;

    const drive = root.getObjectByName('L_PantsC_00_00')!;
    let lastY = 0;
    drive.getWorldPosition(new THREE.Vector3());
    for (let i = 0; i < 120; i++) {
      root.updateMatrixWorld(true);
      phys.update({ deltaSec: 1 / 60, cfg, jumpPhase: 'none' });
    }
    const mid = new THREE.Vector3();
    drive.getWorldPosition(mid);
    lastY = mid.y;
    for (let i = 0; i < 120; i++) {
      root.updateMatrixWorld(true);
      phys.update({ deltaSec: 1 / 60, cfg, jumpPhase: 'none' });
    }
    const end = new THREE.Vector3();
    drive.getWorldPosition(end);
    // Settled: second window should not keep falling hard.
    expect(Math.abs(end.y - lastY)).toBeLessThan(0.05);
    expect(end.y).toBeGreaterThan(-2);
  });

  it('does not write bones when disabled', () => {
    const root = buildSyntheticRyuPants();
    const phys = new RyuPantsPhysics();
    expect(phys.bind(root).ok).toBe(true);
    const drive = root.getObjectByName('L_PantsC_00_00')!;
    drive.position.set(0.02, -0.04, 0.01);
    const cfg = createDefaultSimConfig();
    cfg.pantsPhysicsEnabled = false;
    const before = drive.position.clone();
    root.position.x = 0.5;
    root.updateMatrixWorld(true);
    phys.update({ deltaSec: 1 / 60, cfg, jumpPhase: 'air' });
    expect(drive.position.equals(before)).toBe(true);
  });
});
