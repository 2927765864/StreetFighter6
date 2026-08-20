import { describe, expect, it } from 'vitest';
import { MatchSim } from '../../src/combat/match/MatchSim';
import { MoveCatalog } from '../../src/combat/move/MoveCatalog';
import type { MoveDefinition } from '../../src/combat/move/MoveDefinition';
import { BTN_LP } from '../../src/combat/types';

function lpMove(id: string, clip: string, extraInto = 'self'): MoveDefinition {
  return {
    id,
    characterId: 'ryu',
    moveId: id,
    displayName: id,
    frames: { startup: 4, active: 3, recovery: 7, total: 14 },
    advantage: { onHit: 4, onBlock: -1 },
    damage: 300,
    hitstun: 14,
    blockstun: 9,
    cancel: {
      specialCancel: true,
      targetCombo: [],
      windows: [
        { fromFrame: 3, toFrame: 12, into: `special|super|di|dr|${extraInto}` },
      ],
    },
    boxes: {
      hurt: [{ from: 0, to: 13, x: 0, y: 0.85, w: 0.7, h: 1.7 }],
      hit: [{ from: 3, to: 5, x: 1.2, y: 0.85, w: 2.5, h: 1.5 }],
      push: [{ from: 0, to: 13, x: 0, y: 0.7, w: 0.55, h: 1.4 }],
    },
    clipId: clip,
    facingRelative: true,
    review: { status: 'placeholder', notes: '' },
  };
}

const standLp = lpMove('ryu_5lp', '5lp');
const crouchLp = lpMove('ryu_2lp', '2lp');

function pressLp(relDir: 5 | 2 = 5) {
  return {
    dir: relDir,
    relDir,
    buttons: BTN_LP,
    pressed: BTN_LP,
    released: 0,
  };
}

function hold(relDir: 5 | 2 = 5) {
  return {
    dir: relDir,
    relDir,
    buttons: 0,
    pressed: 0,
    released: 0,
  };
}

const simOpts = {
  enableCancel: true,
  forceP2Guard: false,
  dummyGuardPolicy: 'none' as const,
  hitstopFramesOnHit: 0,
  hitstopFramesOnBlock: 0,
};

describe('LP self-cancel', () => {
  it('5LP mash restarts 5LP after a hit in the cancel window', () => {
    const sim = new MatchSim(standLp, undefined, simOpts);
    sim.dummy.setMode('stand');
    sim.pendingInput = pressLp(5);
    sim.step();
    expect(sim.p1.mover.moveId).toBe('ryu_5lp');

    for (let i = 0; i < 4; i++) {
      sim.pendingInput = hold(5);
      sim.step();
    }
    expect(sim.p1.mover.hasHitThisMove).toBe(true);
    expect(sim.p1.mover.inCancelWindow('self')).toBe(true);
    const frameBefore = sim.p1.mover.moveFrame;

    sim.pendingInput = pressLp(5);
    sim.step();
    expect(sim.p1.mover.moveId).toBe('ryu_5lp');
    expect(sim.p1.mover.moveFrame).toBe(0);
    expect(frameBefore).toBeGreaterThan(0);
  });

  it('2LP mash restarts 2LP after a hit in the cancel window', () => {
    const catalog = MoveCatalog.fromMoves([standLp, crouchLp]);
    const sim = new MatchSim(standLp, catalog, simOpts);
    sim.dummy.setMode('stand');
    sim.pendingInput = pressLp(2);
    sim.step();
    expect(sim.p1.mover.moveId).toBe('ryu_2lp');

    for (let i = 0; i < 4; i++) {
      sim.pendingInput = hold(2);
      sim.step();
    }
    expect(sim.p1.mover.hasHitThisMove).toBe(true);
    expect(sim.p1.mover.inCancelWindow('self')).toBe(true);

    sim.pendingInput = pressLp(2);
    sim.step();
    expect(sim.p1.mover.moveId).toBe('ryu_2lp');
    expect(sim.p1.mover.moveFrame).toBe(0);
  });

  it('self-cancels on whiff', () => {
    const sim = new MatchSim(standLp, undefined, simOpts);
    sim.p2.x = 8;
    sim.pendingInput = pressLp(5);
    sim.step();
    for (let i = 0; i < 4; i++) {
      sim.pendingInput = hold(5);
      sim.step();
    }
    expect(sim.p1.mover.hasHitThisMove).toBe(false);
    expect(sim.p1.mover.inCancelWindow('self')).toBe(true);

    sim.pendingInput = pressLp(5);
    sim.step();
    expect(sim.p1.mover.moveId).toBe('ryu_5lp');
    expect(sim.p1.mover.moveFrame).toBe(0);
  });

  it('5LP does not cancel into 2LP (self only)', () => {
    const catalog = MoveCatalog.fromMoves([standLp, crouchLp]);
    const sim = new MatchSim(standLp, catalog, simOpts);
    sim.dummy.setMode('stand');
    sim.pendingInput = pressLp(5);
    sim.step();
    for (let i = 0; i < 4; i++) {
      sim.pendingInput = hold(5);
      sim.step();
    }
    expect(sim.p1.mover.moveId).toBe('ryu_5lp');

    sim.pendingInput = pressLp(2);
    sim.step();
    expect(sim.p1.mover.moveId).toBe('ryu_5lp');
    expect(sim.p1.mover.moveFrame).toBeGreaterThan(0);
  });
});
