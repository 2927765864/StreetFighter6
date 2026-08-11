import { describe, expect, it } from 'vitest';
import { MovePlayer } from '../../src/combat/move/MovePlayer';
import type { MoveDefinition } from '../../src/combat/move/MoveDefinition';

const fixture: MoveDefinition = {
  id: 'test_5lp',
  characterId: 'ryu',
  moveId: '5LP',
  displayName: 'test',
  frames: { startup: 4, active: 2, recovery: 7, total: 13 },
  advantage: { onHit: 0, onBlock: 0 },
  damage: 100,
  hitstun: 10,
  blockstun: 8,
  cancel: {
    specialCancel: true,
    targetCombo: [],
    notes: '',
    windows: [{ fromFrame: 3, toFrame: 10, into: 'special' }],
  },
  boxes: {
    hurt: [{ from: 0, to: 12, x: 0, y: 0.85, w: 0.7, h: 1.7 }],
    hit: [{ from: 3, to: 4, x: 0.4, y: 1.1, w: 0.5, h: 0.3 }],
  },
  clipId: '5lp',
  facingRelative: true,
  review: { status: 'placeholder', notes: '' },
};

describe('MovePlayer frame indexing', () => {
  it('active on frames 3,4 for startup=4 active=2', () => {
    const p = new MovePlayer();
    p.start(fixture);
    const activeFrames: number[] = [];
    // moveFrame starts 0 before any advance — check then advance total times
    for (let f = 0; f < fixture.frames.total; f++) {
      if (p.isHitActive()) activeFrames.push(p.moveFrame);
      p.advance();
    }
    expect(activeFrames).toEqual([3, 4]);
  });
});
