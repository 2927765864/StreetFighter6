import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MatchSim } from '../../src/combat/match/MatchSim';
import type { MoveDefinition } from '../../src/combat/move/MoveDefinition';
import { parseMoveDefinition } from '../../src/combat/move/MoveDefinition';
import { BTN_LP } from '../../src/combat/types';

function baseMove(
  over: Partial<MoveDefinition> & Pick<MoveDefinition, 'id' | 'guard'>,
): MoveDefinition {
  return {
    characterId: 'ryu',
    moveId: over.id,
    displayName: over.id,
    frames: { startup: 4, active: 3, recovery: 7, total: 14 },
    advantage: { onHit: 4, onBlock: -1 },
    damage: 300,
    hitstun: 14,
    blockstun: 13,
    cancel: { specialCancel: false, targetCombo: [], windows: [] },
    boxes: {
      hurt: [{ from: 0, to: 13, x: 0, y: 0.85, w: 0.7, h: 1.7 }],
      hit: [{ from: 3, to: 5, x: 1.2, y: 0.85, w: 2.5, h: 1.5 }],
      push: [{ from: 0, to: 13, x: 0, y: 0.7, w: 0.55, h: 1.4 }],
    },
    clipId: over.id,
    facingRelative: true,
    review: { status: 'placeholder', notes: '' },
    hitstopOnHit: 9,
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

const lp = baseMove({
  id: 'test_5lp',
  guard: 'high',
  hitstun: 14,
  hitAnim: 'h',
  hitAnimDir: 'st',
  guardStrength: 'L',
});
const mkLow = baseMove({
  id: 'test_2mk',
  guard: 'low',
  hitstun: 16,
  guardStrength: 'M',
});
const sweep = baseMove({
  id: 'test_2hk',
  guard: 'low',
  hitstun: 20,
  hitReaction: 'knockdown',
  knockdownFrames: 87,
  guardStrength: 'H',
});

describe('MatchSim ungarded hit', () => {
  it('none + 5LP => hitstun, hp unchanged', () => {
    const sim = new MatchSim(lp, undefined, { dummyGuardPolicy: 'none', hitstopFramesOnHit: 0 });
    const hp0 = sim.p2.hp;
    runUntilHit(sim);
    expect(sim.lastHitResult).toBe('hit');
    expect(sim.p2.phase).toBe('hitstun');
    expect(sim.p2.hp).toBe(hp0);
    expect(sim.p2.clipId).toBe('dmg_hl_st');
  });

  it('hitstun entry arms a short wuda detach pulse that ages per step', () => {
    const sim = new MatchSim(lp, undefined, {
      dummyGuardPolicy: 'none',
      hitstopFramesOnHit: 2,
    });
    runUntilHit(sim);
    expect(sim.p2.phase).toBe('hitstun');
    // applyHitstun sets 3; hit frame already completed so pulse is still active
    expect(sim.p2.hitstunDetachPulseFrames).toBeGreaterThan(0);
    const armed = sim.p2.hitstunDetachPulseFrames;
    sim.pendingInput = neutral();
    sim.step(); // hitstop step still ages the pulse
    expect(sim.p2.hitstunDetachPulseFrames).toBe(armed - 1);
    sim.pendingInput = neutral();
    sim.step();
    sim.pendingInput = neutral();
    sim.step();
    expect(sim.p2.hitstunDetachPulseFrames).toBe(0);
  });

  it('stand_block + low => hitstun not blockstun', () => {
    const sim = new MatchSim(mkLow, undefined, {
      dummyGuardPolicy: 'stand_block',
      hitstopFramesOnHit: 0,
    });
    runUntilHit(sim);
    expect(sim.lastHitResult).toBe('hit');
    expect(sim.p2.phase).toBe('hitstun');
    expect(sim.p2.clipId).toMatch(/^dmg_/);
  });

  it('none + knockdown 2HK => knockdown then idle; no extra hits while down', () => {
    const sim = new MatchSim(sweep, undefined, {
      dummyGuardPolicy: 'none',
      hitstopFramesOnHit: 0,
    });
    runUntilHit(sim);
    expect(sim.p2.phase).toBe('knockdown');
    const landed = sim.debugProbe.hitsLandedThisMove;
    sim.p1.mover.moveFrame = 4;
    sim.p1.phase = 'attack';
    sim.pendingInput = pressLp();
    sim.step();
    expect(sim.debugProbe.hitsLandedThisMove).toBe(landed);
    for (let i = 0; i < 130; i++) {
      sim.pendingInput = neutral();
      sim.step();
    }
    expect(sim.p2.phase).toBe('idle');
  });

  it('5MP JSON hit push moves P2 (not only 5LP)', () => {
    const raw = JSON.parse(
      readFileSync(resolve(__dirname, '../../public/data/moves/ryu_5mp.json'), 'utf8'),
    );
    raw.hitstopOnHit = 0;
    raw.frames = { startup: 4, active: 3, recovery: 7, total: 14 };
    raw.boxes = lp.boxes;
    const mv = parseMoveDefinition(raw);
    const sim = new MatchSim(mv, undefined, {
      dummyGuardPolicy: 'none',
      hitstopFramesOnHit: 0,
      enableHitPush: true,
      enablePushResolve: false,
    });
    const x0 = sim.p2.x;
    runUntilHit(sim);
    for (let i = 0; i < 30; i++) {
      sim.pendingInput = neutral();
      sim.step();
    }
    expect(sim.p2.x).not.toBeCloseTo(x0, 5);
  });
});
