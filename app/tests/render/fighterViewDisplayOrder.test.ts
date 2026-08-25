import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { Fighter } from '../../src/combat/fighter/Fighter';
import { CONFIG } from '../../src/config/store';
import { FighterView } from '../../src/render/FighterView';
import {
  FIGHTER_DISPLAY_Z,
  LAYER_FIGHTER_BACK,
  LAYER_FIGHTER_FRONT,
  pickDisplayFrontId,
} from '../../src/render/fighterDisplayOrder';
import type { MoveDefinition } from '../../src/combat/move/MoveDefinition';

const move = (): MoveDefinition => ({
  id: 'ryu_5lp',
  characterId: 'ryu',
  moveId: 'ryu_5lp',
  displayName: '5lp',
  frames: { startup: 3, active: 3, recovery: 6, total: 12 },
  advantage: { onHit: 0, onBlock: 0 },
  damage: 200,
  hitstun: 10,
  blockstun: 8,
  cancel: { specialCancel: false, targetCombo: [], windows: [] },
  boxes: { hurt: [], hit: [] },
  clipId: '5lp',
  facingRelative: true,
  review: { status: 'test', notes: '' },
});

describe('FighterView displayFront layers', () => {
  it('puts both fighters at the same Z and assigns front/back layers', () => {
    const scene = new THREE.Scene();
    const p1 = new Fighter('p1', -1.2, 1, 100);
    const p2 = new Fighter('p2', 1.2, -1, 100);
    const v1 = new FighterView(scene, 0x111111);
    const v2 = new FighterView(scene, 0x222222);
    const cfg = CONFIG;

    const sync = () => {
      const p1Front =
        pickDisplayFrontId(p1.lastAttackAcceptSeq, p2.lastAttackAcceptSeq) ===
        'p1';
      v1.syncFromLogic(p1, cfg, 1 / 60, 1, { displayFront: p1Front });
      v2.syncFromLogic(p2, cfg, 1 / 60, 1, { displayFront: !p1Front });
    };

    sync();
    expect(v1.root.position.z).toBe(FIGHTER_DISPLAY_Z);
    expect(v2.root.position.z).toBe(FIGHTER_DISPLAY_Z);
    expect(v1.isDisplayFront()).toBe(true);
    expect(v2.isDisplayFront()).toBe(false);
    expect(v1.displayLayer()).toBe(LAYER_FIGHTER_FRONT);
    expect(v2.displayLayer()).toBe(LAYER_FIGHTER_BACK);
    expect(v1.root.layers.isEnabled(LAYER_FIGHTER_FRONT)).toBe(true);
    expect(v2.root.layers.isEnabled(LAYER_FIGHTER_BACK)).toBe(true);

    p2.startMove(move());
    sync();
    expect(v2.isDisplayFront()).toBe(true);
    expect(v1.isDisplayFront()).toBe(false);
    expect(v2.displayLayer()).toBe(LAYER_FIGHTER_FRONT);
    expect(v1.displayLayer()).toBe(LAYER_FIGHTER_BACK);

    p1.startMove(move());
    sync();
    expect(v1.isDisplayFront()).toBe(true);
    expect(v2.isDisplayFront()).toBe(false);
  });
});
