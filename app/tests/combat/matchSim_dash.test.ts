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

  it('hold forward + double crouch tap does not dash', () => {
    const sim = new MatchSim(fixture, undefined, {
      dashDirHoldMax: 8,
      dashNeutralMax: 8,
      dashFrames: 15,
    });
    // Hold 6, tap crouch twice → 6,3,6,3,6 (forward never released)
    for (const relDir of [6, 3, 6, 3, 6] as const) {
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

  it('hold back + double crouch tap does not dash', () => {
    const sim = new MatchSim(fixture, undefined, {
      dashDirHoldMax: 8,
      dashNeutralMax: 8,
      dashFrames: 15,
    });
    for (const relDir of [4, 1, 4, 1, 4] as const) {
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

  it('66 completed during landing buffers and dashes on canAct (§2.3.1)', () => {
    const sim = new MatchSim(fixture, undefined, {
      dashDirHoldMax: 8,
      dashNeutralMax: 8,
      dashFrames: 15,
      enableActionBuffer: true,
      actionBufferDash: 7,
      landingFrames: 8,
    });
    sim.p1.phase = 'landing';
    sim.p1.jumpPhase = 'land';
    sim.p1.stateTimer = 8;
    sim.p1.jumpFrame = 0;
    sim.p1.y = 0;
    sim.p1.clipId = 'jump_n';
    sim.p1.animRole = 'land';

    for (const relDir of [6, 5, 6] as const) {
      expect(sim.p1.phase).toBe('landing');
      expect(sim.p1.canAct()).toBe(false);
      sim.pendingInput = {
        dir: relDir,
        relDir,
        buttons: 0,
        pressed: 0,
        released: 0,
      };
      sim.step();
    }
    let dashed = sim.p1.phase === 'dash';
    for (let i = 0; i < 10 && !dashed; i++) {
      sim.pendingInput = {
        dir: 5,
        relDir: 5,
        buttons: 0,
        pressed: 0,
        released: 0,
      };
      sim.step();
      dashed = sim.p1.phase === 'dash';
    }
    expect(dashed).toBe(true);
  });
});
