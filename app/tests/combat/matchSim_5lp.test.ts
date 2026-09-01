import { describe, expect, it } from 'vitest';
import { MatchSim } from '../../src/combat/match/MatchSim';
import type { MoveDefinition } from '../../src/combat/move/MoveDefinition';
import { BTN_LP } from '../../src/combat/types';

const fixture: MoveDefinition = {
  id: 'test_5lp',
  characterId: 'ryu',
  moveId: '5LP',
  displayName: 'test',
  frames: { startup: 4, active: 3, recovery: 7, total: 14 },
  advantage: { onHit: 4, onBlock: -1 },
  damage: 300,
  hitstun: 14,
  blockstun: 9,
  cancel: {
    specialCancel: true,
    targetCombo: [],
    notes: '',
    windows: [{ fromFrame: 3, toFrame: 12, into: 'special|super|di|dr' }],
  },
  boxes: {
    hurt: [{ from: 0, to: 13, x: 0, y: 0.85, w: 0.7, h: 1.7 }],
    hit: [{ from: 3, to: 5, x: 1.2, y: 0.85, w: 2.5, h: 1.5 }],
    push: [{ from: 0, to: 13, x: 0, y: 0.7, w: 0.55, h: 1.4 }],
  },
  clipId: '5lp',
  facingRelative: true,
  review: { status: 'placeholder', notes: '' },
};

function pressLp() {
  return {
    dir: 5 as const,
    relDir: 5 as const,
    buttons: BTN_LP,
    pressed: BTN_LP,
    released: 0,
  };
}

function neutral() {
  return {
    dir: 5 as const,
    relDir: 5 as const,
    buttons: 0,
    pressed: 0,
    released: 0,
  };
}

describe('MatchSim 5LP', () => {
  it('LP leads to hitstun when dummy is not blocking', () => {
    const sim = new MatchSim(fixture, undefined, {
      forceP2Guard: false,
      dummyGuardPolicy: 'none',
    });
    sim.dummy.setMode('stand');
    const hp0 = sim.p2.hp;
    sim.pendingInput = pressLp();
    sim.step();
    expect(sim.p1.phase).toBe('attack');

    for (let i = 0; i < 30; i++) {
      sim.pendingInput = neutral();
      sim.step();
      if (sim.p2.phase === 'hitstun') break;
    }
    expect(sim.p2.phase).toBe('hitstun');
    expect(sim.p2.hp).toBe(hp0);
    expect(sim.lastHitResult).toBe('hit');
  });

  it('default block_all yields blockstun + hitstop + pushback queue', () => {
    const sim = new MatchSim(fixture, undefined, {
      dummyGuardPolicy: 'block_all',
      blockPushbackTotal: 0.3,
      hitstopFramesOnBlock: 4,
    });
    const hp0 = sim.p2.hp;
    const x0 = sim.p2.x;
    sim.pendingInput = pressLp();
    sim.step();
    for (let i = 0; i < 30; i++) {
      sim.pendingInput = neutral();
      sim.step();
      if (sim.p2.phase === 'blockstun') break;
    }
    expect(sim.p2.phase).toBe('blockstun');
    expect(sim.p2.hp).toBe(hp0);
    expect(sim.lastHitResult).toBe('block');
    expect(sim.hitstopTimer).toBeGreaterThan(0);
    // Presentation hit-slow: each frozen logic step increments present ticks.
    sim.hitstopPresentTicks = 0;
    const timerBefore = sim.hitstopTimer;
    sim.pendingInput = neutral();
    sim.step();
    expect(sim.hitstopPresentTicks).toBe(1);
    expect(sim.hitstopTimer).toBe(timerBefore - 1);
    // After hitstop, defender should be pushed away from p1 (p2 starts at +x)
    for (let i = 0; i < 20; i++) {
      sim.pendingInput = neutral();
      sim.step();
    }
    expect(sim.p2.x).toBeGreaterThan(x0);
  });
});
