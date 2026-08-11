import { describe, expect, it } from 'vitest';
import { MovePlayer } from '../../src/combat/move/MovePlayer';
import type { MoveDefinition } from '../../src/combat/move/MoveDefinition';

const move: MoveDefinition = {
  id: 't',
  characterId: 'ryu',
  moveId: '5LP',
  displayName: 't',
  frames: { startup: 4, active: 3, recovery: 7, total: 14 },
  advantage: { onHit: 0, onBlock: 0 },
  damage: 1,
  hitstun: 1,
  blockstun: 1,
  cancel: {
    specialCancel: true,
    targetCombo: [],
    windows: [{ fromFrame: 3, toFrame: 12, into: 'special|super' }],
  },
  boxes: { hurt: [], hit: [] },
  clipId: '5lp',
  facingRelative: true,
  review: { status: 'placeholder', notes: '' },
};

describe('cancel windows', () => {
  it('in window on frames 3-12', () => {
    const p = new MovePlayer();
    p.start(move);
    p.moveFrame = 3;
    expect(p.inCancelWindow('special')).toBe(true);
    p.moveFrame = 12;
    expect(p.inCancelWindow('special')).toBe(true);
    p.moveFrame = 2;
    expect(p.inCancelWindow('special')).toBe(false);
    p.moveFrame = 13;
    expect(p.inCancelWindow('special')).toBe(false);
  });

  it('empty windows never open full cancel', () => {
    const p = new MovePlayer();
    p.start({ ...move, cancel: { ...move.cancel, windows: [] } });
    p.moveFrame = 5;
    expect(p.inCancelWindow('special')).toBe(false);
  });
});
