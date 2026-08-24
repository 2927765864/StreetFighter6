import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  clampHeadbandDeltaSec,
  headbandGravityScaleForJumpPhase,
  headbandStiffnessAtJoint,
} from '../../src/render/headband/headbandPhysicsMath';
import { RyuHeadbandPhysics } from '../../src/render/headband/RyuHeadbandPhysics';
import {
  RYU_HEADBAND_HEAD,
  RYU_HEADBAND_L_SHOULDER,
  RYU_HEADBAND_LEFT_CHAIN,
  RYU_HEADBAND_NECK,
  RYU_HEADBAND_R_SHOULDER,
  RYU_HEADBAND_RIGHT_CHAIN,
} from '../../src/render/headband/ryuHeadbandBoneNames';
import { createDefaultSimConfig } from '../../src/config/constants';

function buildSyntheticRyuHead(): THREE.Group {
  const root = new THREE.Group();
  const head = new THREE.Bone();
  head.name = RYU_HEADBAND_HEAD;
  root.add(head);
  for (const name of [
    RYU_HEADBAND_NECK,
    RYU_HEADBAND_L_SHOULDER,
    RYU_HEADBAND_R_SHOULDER,
  ]) {
    const b = new THREE.Bone();
    b.name = name;
    head.add(b);
  }
  for (const chain of [RYU_HEADBAND_LEFT_CHAIN, RYU_HEADBAND_RIGHT_CHAIN]) {
    let parent: THREE.Object3D = head;
    for (const name of chain) {
      const b = new THREE.Bone();
      b.name = name;
      b.position.set(0, -0.04, -0.02);
      parent.add(b);
      parent = b;
    }
  }
  root.updateMatrixWorld(true);
  return root;
}

describe('headbandPhysicsMath', () => {
  it('clamps delta to max and applies timeScale', () => {
    expect(clampHeadbandDeltaSec(0.2, 0.05, 1)).toBeCloseTo(0.05);
    expect(clampHeadbandDeltaSec(0.02, 0.05, 1)).toBeCloseTo(0.02);
    expect(clampHeadbandDeltaSec(0.04, 0.05, 2)).toBeCloseTo(0.05);
    expect(clampHeadbandDeltaSec(-1, 0.05, 1)).toBe(0);
  });

  it('uses air gravity scale only in air jumpPhase', () => {
    expect(headbandGravityScaleForJumpPhase('air', 0.55)).toBe(0.55);
    expect(headbandGravityScaleForJumpPhase('none', 0.55)).toBe(1);
    expect(headbandGravityScaleForJumpPhase('land', 0.55)).toBe(1);
    expect(headbandGravityScaleForJumpPhase('prejump', 0.55)).toBe(1);
  });

  it('lerps stiffness toward tip scale', () => {
    expect(headbandStiffnessAtJoint(1.0, 0, 9, 0.85)).toBeCloseTo(1.0);
    expect(headbandStiffnessAtJoint(1.0, 8, 9, 0.85)).toBeCloseTo(0.85);
    expect(headbandStiffnessAtJoint(2.0, 4, 9, 0.5)).toBeCloseTo(1.5);
  });
});

describe('ryuHeadbandBoneNames', () => {
  it('has symmetric 10-node chains ending in _end', () => {
    expect(RYU_HEADBAND_LEFT_CHAIN).toHaveLength(10);
    expect(RYU_HEADBAND_RIGHT_CHAIN).toHaveLength(10);
    expect(RYU_HEADBAND_LEFT_CHAIN[0]).toBe('L_Hairband_00_01');
    expect(RYU_HEADBAND_LEFT_CHAIN.at(-1)).toBe('L_Hairband_00_end');
    expect(RYU_HEADBAND_RIGHT_CHAIN[0]).toBe('R_Hairband_00_01');
    expect(RYU_HEADBAND_RIGHT_CHAIN.at(-1)).toBe('R_Hairband_00_end');
  });
});

describe('headband config defaults', () => {
  it('ships hard-biased defaults from execution plan', () => {
    const cfg = createDefaultSimConfig();
    expect(cfg.headbandPhysicsEnabled).toBe(true);
    expect(cfg.headbandUseCenter).toBe(true);
    expect(cfg.headbandStiffness).toBe(1.35);
    expect(cfg.headbandDragForce).toBe(0.48);
    expect(cfg.headbandMaxDeltaSec).toBe(0.05);
    expect(cfg.headbandGravityAirScale).toBe(0.55);
    expect(cfg.headbandColliderShoulderXOffset).toBe(0);
  });
});

describe('RyuHeadbandPhysics', () => {
  it('binds dual chains and updates without hitstop gate', () => {
    const root = buildSyntheticRyuHead();
    const phys = new RyuHeadbandPhysics();
    const bind = phys.bind(root);
    expect(bind.ok).toBe(true);
    if (!bind.ok) return;
    expect(bind.leftJoints).toBe(9);
    expect(bind.rightJoints).toBe(9);

    const tip = root.getObjectByName('L_Hairband_00_05')!;
    const before = tip.quaternion.clone();
    const cfg = createDefaultSimConfig();
    for (let i = 0; i < 40; i++) {
      root.position.x = Math.sin(i * 0.3) * 0.25;
      root.updateMatrixWorld(true);
      // Simulates hitstop: still update with wall dt
      phys.update({ deltaSec: 1 / 60, cfg, jumpPhase: 'none' });
    }
    expect(tip.quaternion.equals(before)).toBe(false);

    cfg.headbandPhysicsEnabled = false;
    const mid = tip.quaternion.clone();
    phys.update({ deltaSec: 1 / 60, cfg, jumpPhase: 'air' });
    expect(tip.quaternion.equals(mid)).toBe(true);

    phys.dispose();
    expect(phys.isBound).toBe(false);
  });

  it('fails clearly when Hairband bones are missing', () => {
    const root = new THREE.Group();
    const head = new THREE.Bone();
    head.name = RYU_HEADBAND_HEAD;
    root.add(head);
    const phys = new RyuHeadbandPhysics();
    const bind = phys.bind(root);
    expect(bind.ok).toBe(false);
    if (!bind.ok) {
      expect(bind.reason).toContain('BLOCKED');
    }
  });
});
