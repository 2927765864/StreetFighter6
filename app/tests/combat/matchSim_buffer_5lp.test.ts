import { describe, expect, it } from 'vitest';
import { MatchSim } from '../../src/combat/match/MatchSim';
import type { MoveDefinition } from '../../src/combat/move/MoveDefinition';
import { BTN_LP } from '../../src/combat/types';

const fixture: MoveDefinition = {
  id: 'ryu_5lp',
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
    windows: [{ fromFrame: 3, toFrame: 12, into: 'special' }],
  },
  boxes: {
    hurt: [{ from: 0, to: 13, x: 0, y: 0.85, w: 0.7, h: 1.7 }],
    hit: [{ from: 3, to: 5, x: 0.1, y: 0.85, w: 0.2, h: 0.3 }],
  },
  clipId: '5lp',
  facingRelative: true,
  review: { status: 'placeholder', notes: '' },
};

const N = {
  dir: 5 as const,
  relDir: 5 as const,
  buttons: 0,
  pressed: 0,
  released: 0,
};

describe('MatchSim action buffer 5LP', () => {
  it('buffers LP in recovery and fires on canAct', () => {
    const sim = new MatchSim(fixture, undefined, {
      enableActionBuffer: true,
      actionBufferStandard: 4,
      hitstopFramesOnHit: 0,
      hitstopFramesOnBlock: 0,
    });
    sim.pendingInput = {
      dir: 5,
      relDir: 5,
      buttons: BTN_LP,
      pressed: BTN_LP,
      released: 0,
    };
    sim.step();
    expect(sim.p1.phase).toBe('attack');

    // Run until near end of move without finishing
    for (let i = 0; i < 12; i++) {
      sim.pendingInput = N;
      sim.step();
    }
    expect(sim.p1.phase).toBe('attack');

    // Buffer LP during recovery (still attack)
    sim.pendingInput = {
      dir: 5,
      relDir: 5,
      buttons: BTN_LP,
      pressed: BTN_LP,
      released: 0,
    };
    sim.step();
    expect(sim.actionBuffer.peek()).not.toBeNull();

    // Finish recovery
    for (let i = 0; i < 10; i++) {
      sim.pendingInput = N;
      sim.step();
      if (sim.p1.phase === 'attack' && sim.p1.mover.moveFrame === 0) {
        // new attack started
        break;
      }
      if (sim.p1.phase === 'idle') {
        // buffer should fire same or next frame
      }
    }
    // Eventually a second attack should have started from buffer
    let sawSecond = false;
    for (let i = 0; i < 5; i++) {
      if (sim.p1.phase === 'attack') sawSecond = true;
      sim.pendingInput = N;
      sim.step();
    }
    expect(sawSecond || sim.p1.phase === 'attack').toBe(true);
  });
});
