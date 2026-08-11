import { describe, expect, it } from 'vitest';
import { MatchSim } from '../../src/combat/match/MatchSim';
import type { MoveDefinition } from '../../src/combat/move/MoveDefinition';

const fixture: MoveDefinition = {
  id: 'ryu_5lp',
  characterId: 'ryu',
  moveId: '5LP',
  displayName: 't',
  frames: { startup: 4, active: 3, recovery: 7, total: 14 },
  advantage: { onHit: 0, onBlock: 0 },
  damage: 1,
  hitstun: 1,
  blockstun: 1,
  cancel: { specialCancel: false, targetCombo: [], windows: [] },
  boxes: { hurt: [], hit: [] },
  clipId: '5lp',
  facingRelative: true,
  review: { status: 'placeholder', notes: '' },
};

describe('jump horizontal displacement', () => {
  it('forward jump covers ~jumpFwdDist over air frames', () => {
    const sim = new MatchSim(fixture, undefined, {
      prejumpFrames: 4,
      airFrames: 38,
      landingFrames: 3,
      jumpFwdDist: 1.9,
      jumpBackDist: 1.52,
      jumpApex: 2.115,
    });
    const x0 = sim.p1.x;
    // press up-forward relative
    sim.pendingInput = {
      dir: 9,
      relDir: 9,
      buttons: 0,
      pressed: 0,
      released: 0,
    };
    sim.step();
    expect(sim.p1.phase).toBe('prejump');
    expect(sim.p1.jumpClipId).toBe('jump_f');
    for (let i = 0; i < 4; i++) {
      sim.pendingInput = {
        dir: 5,
        relDir: 5,
        buttons: 0,
        pressed: 0,
        released: 0,
      };
      sim.step();
    }
    expect(sim.p1.phase).toBe('airborne');
    for (let i = 0; i < 38; i++) {
      sim.pendingInput = {
        dir: 5,
        relDir: 5,
        buttons: 0,
        pressed: 0,
        released: 0,
      };
      sim.step();
    }
    expect(sim.p1.phase).toBe('landing');
    const dx = sim.p1.x - x0;
    // facing +1, forward jump +1.9
    expect(dx).toBeGreaterThan(1.9 * 0.95);
    expect(dx).toBeLessThan(1.9 * 1.05);
  });
});
