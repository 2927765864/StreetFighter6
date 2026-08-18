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

describe('MatchSim dash', () => {
  it('double-tap forward enters dash', () => {
    const sim = new MatchSim(fixture, undefined, {
      dashDirHoldMax: 8,
      dashNeutralMax: 8,
      dashFrames: 15,
    });
    // 6, 5, 6
    sim.pendingInput = {
      dir: 6,
      relDir: 6,
      buttons: 0,
      pressed: 0,
      released: 0,
    };
    sim.step();
    sim.pendingInput = {
      dir: 5,
      relDir: 5,
      buttons: 0,
      pressed: 0,
      released: 0,
    };
    sim.step();
    sim.pendingInput = {
      dir: 6,
      relDir: 6,
      buttons: 0,
      pressed: 0,
      released: 0,
    };
    sim.step();
    expect(sim.p1.phase).toBe('dash');
  });

  it('opposite direction between taps does not dash', () => {
    const sim = new MatchSim(fixture, undefined, {
      dashDirHoldMax: 8,
      dashNeutralMax: 8,
      dashFrames: 15,
    });
    // 6, 4, 6 — opposite interrupt
    for (const relDir of [6, 4, 6] as const) {
      sim.pendingInput = {
        dir: relDir,
        relDir,
        buttons: 0,
        pressed: 0,
        released: 0,
      };
      sim.step();
    }
    expect(sim.p1.phase).not.toBe('dash');
  });
});
