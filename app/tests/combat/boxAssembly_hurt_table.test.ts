import { describe, expect, it } from 'vitest';
import { assembleWorldBoxes } from '../../src/combat/boxes/BoxAssembly';
import type { MoveDefinition } from '../../src/combat/move/MoveDefinition';
import { fallbackStanceTable } from '../../src/data/loadStanceBoxes';
import type { FighterPhase } from '../../src/combat/types';

const move: MoveDefinition = {
  id: 'test_hurt',
  characterId: 'ryu',
  moveId: 'X',
  displayName: 'x',
  frames: { startup: 1, active: 1, recovery: 1, total: 3 },
  advantage: { onHit: 0, onBlock: 0 },
  damage: 0,
  hitstun: 0,
  blockstun: 0,
  cancel: { specialCancel: false, targetCombo: [], windows: [] },
  boxes: {
    hurt: [
      {
        from: 0,
        to: 20,
        x: 0.8,
        y: 1,
        w: 0.3,
        h: 0.3,
        layer: 'extend',
        part: 'extend',
      },
    ],
    hit: [],
    push: [],
  },
  clipId: 'x',
  facingRelative: true,
  review: { status: 'test', notes: '' },
};

function fakeFighter(frame: number, phase: FighterPhase = 'idle') {
  return {
    x: 0,
    y: 0,
    facing: 1 as const,
    phase,
    hasActiveMove: phase === 'attack',
    getActionTimeline: () => ({ move, frame }),
  };
}

describe('boxAssembly hurt table window', () => {
  it('action hurt at frame 20 present; frame 21 gone', () => {
    const stance = fallbackStanceTable();
    const at20 = assembleWorldBoxes(fakeFighter(20), stance, false);
    // stance (≥3) + extend
    expect(at20.hurt.length).toBeGreaterThanOrEqual(4);
    const at21 = assembleWorldBoxes(fakeFighter(21), stance, false);
    // only stance
    expect(at21.hurt.length).toBe(stance.stances.stand.hurt.length);
  });
});
