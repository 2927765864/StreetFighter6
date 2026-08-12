import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MatchSim } from '../../src/combat/match/MatchSim';
import { MoveCatalog } from '../../src/combat/move/MoveCatalog';
import {
  parseMoveDefinition,
  type MoveDefinition,
} from '../../src/combat/move/MoveDefinition';
import { BTN_LP } from '../../src/combat/types';

const lp: MoveDefinition = {
  id: 'ryu_5lp',
  characterId: 'ryu',
  moveId: '5LP',
  displayName: '5LP',
  frames: { startup: 4, active: 3, recovery: 7, total: 14 },
  advantage: { onHit: 4, onBlock: -1 },
  damage: 300,
  hitstun: 14,
  blockstun: 9,
  cancel: {
    specialCancel: true,
    targetCombo: [],
    windows: [{ fromFrame: 3, toFrame: 12, into: 'special|super|di|dr' }],
  },
  boxes: {
    hurt: [{ from: 0, to: 13, x: 0, y: 0.85, w: 0.7, h: 1.7 }],
    hit: [{ from: 3, to: 5, x: 0.1, y: 1, w: 0.2, h: 0.2 }],
  },
  clipId: '5lp',
  facingRelative: true,
  review: { status: 'placeholder', notes: '' },
};

const hado: MoveDefinition = {
  id: 'ryu_hadoken_lp',
  characterId: 'ryu',
  moveId: 'ryu_hadoken_lp',
  displayName: 'Hadoken',
  frames: { startup: 16, active: 1, recovery: 30, total: 47 },
  advantage: { onHit: 1, onBlock: -5 },
  damage: 600,
  hitstun: 20,
  blockstun: 14,
  cancel: { specialCancel: false, targetCombo: [], windows: [] },
  boxes: {
    hurt: [{ from: 0, to: 46, x: 0, y: 0.85, w: 0.7, h: 1.7 }],
    hit: [{ from: 15, to: 15, x: 0.9, y: 1.15, w: 0.7, h: 0.4 }],
  },
  clipId: 'hadoken_lp',
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

describe('Hadoken frame data', () => {
  it('LP/MP/HP use Capcom total 47, not startup+1', () => {
    const dir = resolve(__dirname, '../../public/data/moves/generated');
    const expectTotal = (
      file: string,
      startup: number,
      recovery: number,
    ) => {
      const m = parseMoveDefinition(
        JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')),
      );
      expect(m.frames.startup).toBe(startup);
      expect(m.frames.active).toBe(1);
      expect(m.frames.recovery).toBe(recovery);
      expect(m.frames.total).toBe(47);
      expect(m.frames.total).toBe(
        m.frames.startup + m.frames.active + m.frames.recovery,
      );
    };
    expectTotal('ryu_hadoken_lp.json', 16, 30);
    expectTotal('ryu_hadoken_mp.json', 14, 32);
    expectTotal('ryu_hadoken_hp.json', 12, 34);

    const runtime = parseMoveDefinition(
      JSON.parse(
        readFileSync(
          resolve(__dirname, '../../public/data/moves/ryu_hadoken_lp.json'),
          'utf8',
        ),
      ),
    );
    expect(runtime.frames).toMatchObject({
      startup: 16,
      active: 1,
      recovery: 30,
      total: 47,
    });
  });
});

describe('MatchSim cancel to hadoken', () => {
  it('cancels 5LP into 236P inside cancel window', () => {
    const catalog = MoveCatalog.fromMoves([lp, hado]);
    const sim = new MatchSim(lp, catalog, {
      enableCancel: true,
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
    expect(sim.p1.mover.moveId).toBe('5LP');

    // Advance into cancel window (frame 3+)
    for (let i = 0; i < 3; i++) {
      sim.pendingInput = N;
      sim.step();
    }
    expect(sim.p1.mover.inCancelWindow('special')).toBe(true);

    // 236 + LP
    for (const d of [2, 3, 6] as const) {
      sim.pendingInput = {
        dir: d,
        relDir: d,
        buttons: d === 6 ? BTN_LP : 0,
        pressed: d === 6 ? BTN_LP : 0,
        released: 0,
      };
      sim.step();
    }

    expect(sim.p1.mover.moveId).toBe('ryu_hadoken_lp');
    expect(sim.p1.phase).toBe('attack');
  });
});
