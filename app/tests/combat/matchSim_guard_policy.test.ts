import { describe, expect, it } from 'vitest';
import { MatchSim } from '../../src/combat/match/MatchSim';
import type { MoveDefinition } from '../../src/combat/move/MoveDefinition';
import { BTN_LP } from '../../src/combat/types';

function baseMove(over: Partial<MoveDefinition> & Pick<MoveDefinition, 'id' | 'guard' | 'blockstun'>): MoveDefinition {
  return {
    characterId: 'ryu',
    moveId: over.id,
    displayName: over.id,
    frames: { startup: 4, active: 3, recovery: 7, total: 14 },
    advantage: { onHit: 4, onBlock: -1 },
    damage: 300,
    hitstun: 14,
    cancel: { specialCancel: false, targetCombo: [], windows: [] },
    boxes: {
      hurt: [{ from: 0, to: 13, x: 0, y: 0.85, w: 0.7, h: 1.7 }],
      hit: [{ from: 3, to: 5, x: 1.2, y: 0.85, w: 2.5, h: 1.5 }],
      push: [{ from: 0, to: 13, x: 0, y: 0.7, w: 0.55, h: 1.4 }],
    },
    clipId: over.id,
    facingRelative: true,
    review: { status: 'placeholder', notes: '' },
    hitstopOnBlock: 9,
    ...over,
  };
}

function pressLp() {
  return { dir: 5 as const, relDir: 5 as const, buttons: BTN_LP, pressed: BTN_LP, released: 0 };
}
function neutral() {
  return { dir: 5 as const, relDir: 5 as const, buttons: 0, pressed: 0, released: 0 };
}

function runUntilHit(sim: MatchSim): void {
  sim.pendingInput = pressLp();
  sim.step();
  for (let i = 0; i < 40; i++) {
    sim.pendingInput = neutral();
    sim.step();
    if (sim.lastHitResult === 'block' || sim.lastHitResult === 'hit') return;
  }
}

const lpHigh = baseMove({ id: 'test_5lp', guard: 'high', blockstun: 13, hitstopOnBlock: 9 });
const lkLow = baseMove({
  id: 'test_2lk', guard: 'low', blockstun: 13, hitstopOnBlock: 9, guardStrength: 'L',
});
const mkLow = baseMove({
  id: 'test_2mk', guard: 'low', blockstun: 20, hitstopOnBlock: 9, guardStrength: 'M',
});
const hkLow = baseMove({
  id: 'test_2hk', guard: 'low', blockstun: 22, hitstopOnBlock: 13, guardStrength: 'H',
});
const ohMid = baseMove({ id: 'test_6mp', guard: 'mid', blockstun: 25, hitstopOnBlock: 10 });

describe('MatchSim dummy guard policy', () => {
  it('rest pose is idle until a hit is blocked', () => {
    const sim = new MatchSim(lpHigh, undefined, { dummyGuardPolicy: 'block_all' });
    sim.pendingInput = neutral();
    sim.step();
    expect(sim.p2.clipId).toBe('idle');
    expect(sim.p2.phase).toBe('idle');
  });

  it('5LP high + stand_block => block, stun 13, no chip', () => {
    const sim = new MatchSim(lpHigh, undefined, { dummyGuardPolicy: 'stand_block' });
    const hp0 = sim.p2.hp;
    runUntilHit(sim);
    expect(sim.lastHitResult).toBe('block');
    expect(sim.p2.phase).toBe('blockstun');
    expect(sim.p2.stunTimer).toBeGreaterThan(0);
    expect(sim.p2.hp).toBe(hp0);
    expect(sim.p2.clipId).toBe('grd_hl_st');
  });

  it('2MK low + stand_block => hit', () => {
    const sim = new MatchSim(mkLow, undefined, { dummyGuardPolicy: 'stand_block' });
    runUntilHit(sim);
    expect(sim.lastHitResult).toBe('hit');
    expect(sim.p2.phase).toBe('hitstun');
  });

  it('2MK low + crouch_block => block', () => {
    const sim = new MatchSim(mkLow, undefined, { dummyGuardPolicy: 'crouch_block' });
    runUntilHit(sim);
    expect(sim.lastHitResult).toBe('block');
    expect(sim.p2.clipId).toBe('grd_dm_st');
  });

  it('2LK/2MK/2HK crouch block use DL/DM/DH clips', () => {
    for (const [mv, clip] of [
      [lkLow, 'grd_dl_st'],
      [mkLow, 'grd_dm_st'],
      [hkLow, 'grd_dh_st'],
    ] as const) {
      const sim = new MatchSim(mv, undefined, { dummyGuardPolicy: 'crouch_block' });
      runUntilHit(sim);
      expect(sim.p2.clipId).toBe(clip);
    }
  });

  it('6MP mid + crouch_block => hit', () => {
    const sim = new MatchSim(ohMid, undefined, { dummyGuardPolicy: 'crouch_block' });
    runUntilHit(sim);
    expect(sim.lastHitResult).toBe('hit');
  });

  it('6MP mid + stand_block => block', () => {
    const sim = new MatchSim(ohMid, undefined, { dummyGuardPolicy: 'stand_block' });
    runUntilHit(sim);
    expect(sim.lastHitResult).toBe('block');
    expect(sim.p2.clipId).toBe('grd_hm_st');
  });

  it('block_all + 2MK crouches and blocks', () => {
    const sim = new MatchSim(mkLow, undefined, { dummyGuardPolicy: 'block_all' });
    runUntilHit(sim);
    expect(sim.dummy.isCrouching()).toBe(true);
    expect(sim.lastHitResult).toBe('block');
  });

  it('block_all returns to stand guard after low blockstun', () => {
    const sim = new MatchSim(mkLow, undefined, {
      dummyGuardPolicy: 'block_all',
      blockstunOverride: 4,
    });
    runUntilHit(sim);
    expect(sim.dummy.isCrouching()).toBe(true);
    for (let i = 0; i < 40; i++) {
      sim.pendingInput = neutral();
      sim.step();
      if (sim.p2.canAct()) break;
    }
    expect(sim.p2.canAct()).toBe(true);
    expect(sim.dummy.isCrouching()).toBe(false);
    expect(sim.p2.clipId).toBe('idle');
    expect(sim.p2.isHurtCrouching()).toBe(false);
  });

  it('hitstop does not tick stunTimer', () => {
    const sim = new MatchSim(lpHigh, undefined, {
      dummyGuardPolicy: 'stand_block',
      hitstopFramesOnBlock: 4,
    });
    runUntilHit(sim);
    expect(sim.p2.phase).toBe('blockstun');
    const stun = sim.p2.stunTimer;
    expect(sim.hitstopTimer).toBeGreaterThan(0);
    sim.pendingInput = neutral();
    sim.step();
    expect(sim.p2.stunTimer).toBe(stun);
  });

  it('after stun returns to idle, not guard loop', () => {
    const sim = new MatchSim(lpHigh, undefined, {
      dummyGuardPolicy: 'stand_block',
      blockstunOverride: 3,
    });
    runUntilHit(sim);
    expect(sim.p2.clipId.startsWith('grd_')).toBe(true);
    for (let i = 0; i < 40; i++) {
      sim.pendingInput = neutral();
      sim.step();
      if (sim.p2.canAct()) break;
    }
    expect(sim.p2.canAct()).toBe(true);
    expect(sim.p2.clipId).toBe('idle');
  });

  it('mid-stun policy change does not reset stunTimer', () => {
    const sim = new MatchSim(lpHigh, undefined, { dummyGuardPolicy: 'stand_block' });
    runUntilHit(sim);
    while (sim.hitstopTimer > 0) {
      sim.pendingInput = neutral();
      sim.step();
    }
    expect(sim.p2.phase).toBe('blockstun');
    const stun = sim.p2.stunTimer;
    sim.dummy.setGuardPolicy('crouch_block');
    sim.pendingInput = neutral();
    sim.step();
    expect(sim.p2.phase).toBe('blockstun');
    expect(sim.p2.stunTimer).toBe(stun - 1);
    expect(sim.p2.isHurtCrouching()).toBe(true);
  });
});
