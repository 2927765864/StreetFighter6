import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  beltGravityScaleForJumpPhase,
  beltStiffnessAtJoint,
  clampBeltDeltaSec,
} from '../../src/render/belt/beltPhysicsMath';
import { RyuBeltPhysics } from '../../src/render/belt/RyuBeltPhysics';
import {
  RYU_BELT_HIP,
  RYU_BELT_L_THIGH,
  RYU_BELT_LEFT_CHAIN,
  RYU_BELT_OBI_ROOT,
  RYU_BELT_R_THIGH,
  RYU_BELT_RIGHT_CHAIN,
} from '../../src/render/belt/ryuBeltBoneNames';
import { createDefaultSimConfig } from '../../src/config/constants';

function buildSyntheticRyuBelt(): THREE.Group {
  const root = new THREE.Group();
  const hip = new THREE.Bone();
  hip.name = RYU_BELT_HIP;
  root.add(hip);

  const obiRoot = new THREE.Bone();
  obiRoot.name = RYU_BELT_OBI_ROOT;
  hip.add(obiRoot);

  for (const name of [RYU_BELT_L_THIGH, RYU_BELT_R_THIGH]) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(name === RYU_BELT_L_THIGH ? 0.1 : -0.1, -0.2, 0);
    hip.add(b);
  }

  for (const chain of [RYU_BELT_LEFT_CHAIN, RYU_BELT_RIGHT_CHAIN]) {
    let parent: THREE.Object3D = obiRoot;
    for (const name of chain) {
      const b = new THREE.Bone();
      b.name = name;
      b.position.set(0, -0.05, 0.02);
      parent.add(b);
      parent = b;
    }
  }
  root.updateMatrixWorld(true);
  return root;
}

describe('beltPhysicsMath', () => {
  it('clamps delta to max and applies timeScale', () => {
    expect(clampBeltDeltaSec(0.2, 0.05, 1)).toBeCloseTo(0.05);
    expect(clampBeltDeltaSec(0.02, 0.05, 1)).toBeCloseTo(0.02);
    expect(clampBeltDeltaSec(0.04, 0.05, 2)).toBeCloseTo(0.05);
    expect(clampBeltDeltaSec(-1, 0.05, 1)).toBe(0);
  });

  it('uses air gravity scale only in air jumpPhase', () => {
    expect(beltGravityScaleForJumpPhase('air', 0.5)).toBe(0.5);
    expect(beltGravityScaleForJumpPhase('none', 0.5)).toBe(1);
    expect(beltGravityScaleForJumpPhase('land', 0.5)).toBe(1);
  });

  it('lerps stiffness toward tip scale', () => {
    expect(beltStiffnessAtJoint(1.0, 0, 5, 0.95)).toBeCloseTo(1.0);
    expect(beltStiffnessAtJoint(1.0, 4, 5, 0.95)).toBeCloseTo(0.95);
  });
});

describe('ryuBeltBoneNames', () => {
  it('has asymmetric Obi chains ending in _end and excludes ObiRoot from chains', () => {
    expect(RYU_BELT_LEFT_CHAIN).toHaveLength(6);
    expect(RYU_BELT_RIGHT_CHAIN).toHaveLength(5);
    expect(RYU_BELT_LEFT_CHAIN[0]).toBe('L_Obi_00_00');
    expect(RYU_BELT_LEFT_CHAIN.at(-1)).toBe('L_Obi_00_end');
    expect(RYU_BELT_RIGHT_CHAIN[0]).toBe('R_Obi_00_00');
    expect(RYU_BELT_RIGHT_CHAIN.at(-1)).toBe('R_Obi_00_end');
    expect(RYU_BELT_LEFT_CHAIN).not.toContain(RYU_BELT_OBI_ROOT);
    expect(RYU_BELT_RIGHT_CHAIN).not.toContain(RYU_BELT_OBI_ROOT);
  });
});

describe('belt config defaults', () => {
  it('ships harder/shorter defaults than headband per execution plan', () => {
    const cfg = createDefaultSimConfig();
    expect(cfg.beltPhysicsEnabled).toBe(true);
    expect(cfg.beltUseCenter).toBe(true);
    expect(cfg.beltStiffness).toBe(1.85);
    expect(cfg.beltDragForce).toBe(0.62);
    expect(cfg.beltGravityPower).toBe(0.28);
    expect(cfg.beltMaxDeltaSec).toBe(0.05);
    expect(cfg.beltGravityAirScale).toBe(0.5);
    expect(cfg.beltStiffnessTipScale).toBe(0.95);
    expect(cfg.beltColliderHipRadius).toBe(0.1);
    expect(cfg.beltColliderThighRadius).toBe(0.085);
    expect(cfg.beltStiffness).toBeGreaterThan(cfg.headbandStiffness);
    expect(cfg.beltDragForce).toBeGreaterThan(cfg.headbandDragForce);
    expect(cfg.beltGravityPower).toBeLessThan(cfg.headbandGravityPower);
    expect(cfg).not.toHaveProperty('beltBreathAmp');
    expect(cfg).not.toHaveProperty('beltBreathHz');
  });
});

describe('RyuBeltPhysics', () => {
  it('binds dual tails and updates without hitstop gate', () => {
    const root = buildSyntheticRyuBelt();
    const phys = new RyuBeltPhysics();
    const bind = phys.bind(root);
    expect(bind.ok).toBe(true);
    if (!bind.ok) return;
    expect(bind.leftJoints).toBe(5);
    expect(bind.rightJoints).toBe(4);

    const tip = root.getObjectByName('L_Obi_00_02')!;
    const before = tip.quaternion.clone();
    const cfg = createDefaultSimConfig();
    for (let i = 0; i < 40; i++) {
      root.position.x = Math.sin(i * 0.3) * 0.25;
      root.updateMatrixWorld(true);
      phys.update({ deltaSec: 1 / 60, cfg, jumpPhase: 'none' });
    }
    expect(tip.quaternion.equals(before)).toBe(false);

    cfg.beltPhysicsEnabled = false;
    const mid = tip.quaternion.clone();
    phys.update({ deltaSec: 1 / 60, cfg, jumpPhase: 'air' });
    expect(tip.quaternion.equals(mid)).toBe(true);

    phys.dispose();
    expect(phys.isBound).toBe(false);
  });

  it('fails bind when Obi chain bone is missing', () => {
    const root = new THREE.Group();
    const hip = new THREE.Bone();
    hip.name = RYU_BELT_HIP;
    root.add(hip);
    const phys = new RyuBeltPhysics();
    const bind = phys.bind(root);
    expect(bind.ok).toBe(false);
    if (bind.ok) return;
    expect(bind.reason).toMatch(/BLOCKED/);
  });
});
