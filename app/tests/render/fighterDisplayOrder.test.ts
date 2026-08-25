import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { Fighter } from '../../src/combat/fighter/Fighter';
import type { MoveDefinition } from '../../src/combat/move/MoveDefinition';
import {
  enableFighterDisplayLayersOnLight,
  LAYER_FIGHTER_BACK,
  LAYER_FIGHTER_FRONT,
  LAYER_SCENE,
  pickDisplayFrontId,
} from '../../src/render/fighterDisplayOrder';

function stubMove(id = 'ryu_5lp'): MoveDefinition {
  return {
    id,
    characterId: 'ryu',
    moveId: id,
    displayName: id,
    frames: { startup: 3, active: 3, recovery: 6, total: 12 },
    advantage: { onHit: 0, onBlock: 0 },
    damage: 200,
    hitstun: 10,
    blockstun: 8,
    cancel: { specialCancel: false, targetCombo: [], windows: [] },
    boxes: {
      hurt: [{ from: 0, to: 11, x: 0, y: 0.5, w: 0.7, h: 1.0 }],
      hit: [{ from: 3, to: 5, x: 0.4, y: 0.4, w: 0.5, h: 0.4 }],
    },
    clipId: '5lp',
    facingRelative: true,
    review: { status: 'test', notes: '' },
  };
}

describe('pickDisplayFrontId', () => {
  it('defaults to p1 when both never attacked', () => {
    expect(pickDisplayFrontId(0, 0)).toBe('p1');
  });

  it('puts the higher attack-accept seq in front', () => {
    expect(pickDisplayFrontId(1, 2)).toBe('p2');
    expect(pickDisplayFrontId(3, 2)).toBe('p1');
  });

  it('ties go to p1', () => {
    expect(pickDisplayFrontId(4, 4)).toBe('p1');
  });
});

describe('enableFighterDisplayLayersOnLight', () => {
  it('pins light + shadow camera to scene and both fighter layers', () => {
    const light = new THREE.DirectionalLight();
    light.castShadow = true;
    // Default is only layer 0 — ShadowNode would then copy the main camera mask.
    expect(light.shadow.camera.layers.mask & ~1).toBe(0);

    enableFighterDisplayLayersOnLight(light);

    for (const host of [light, light.shadow.camera]) {
      expect(host.layers.isEnabled(LAYER_SCENE)).toBe(true);
      expect(host.layers.isEnabled(LAYER_FIGHTER_BACK)).toBe(true);
      expect(host.layers.isEnabled(LAYER_FIGHTER_FRONT)).toBe(true);
    }
    // Non-default mask → ShadowNode will NOT replace with pass-1 camera mask.
    expect(light.shadow.camera.layers.mask & ~1).not.toBe(0);
  });
});

describe('Fighter.lastAttackAcceptSeq', () => {
  it('stamps on startMove and ignores dash/jump', () => {
    const p1 = new Fighter('p1', -1, 1, 100);
    const p2 = new Fighter('p2', 1, -1, 100);
    expect(p1.lastAttackAcceptSeq).toBe(0);
    expect(p2.lastAttackAcceptSeq).toBe(0);
    expect(
      pickDisplayFrontId(p1.lastAttackAcceptSeq, p2.lastAttackAcceptSeq),
    ).toBe('p1');

    p2.startMove(stubMove());
    expect(p2.lastAttackAcceptSeq).toBeGreaterThan(0);
    expect(
      pickDisplayFrontId(p1.lastAttackAcceptSeq, p2.lastAttackAcceptSeq),
    ).toBe('p2');

    const beforeDash = p1.lastAttackAcceptSeq;
    p1.startDash(true, 19);
    expect(p1.lastAttackAcceptSeq).toBe(beforeDash);

    p1.startMove(stubMove('ryu_5mp'));
    expect(p1.lastAttackAcceptSeq).toBeGreaterThan(p2.lastAttackAcceptSeq);
    expect(
      pickDisplayFrontId(p1.lastAttackAcceptSeq, p2.lastAttackAcceptSeq),
    ).toBe('p1');

    const beforeJump = p2.lastAttackAcceptSeq;
    p2.startJump(3, 8, 3);
    expect(p2.lastAttackAcceptSeq).toBe(beforeJump);
  });
});
