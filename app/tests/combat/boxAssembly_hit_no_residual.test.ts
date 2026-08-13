import { describe, expect, it } from 'vitest';
import { Fighter } from '../../src/combat/fighter/Fighter';
import type { MoveDefinition } from '../../src/combat/move/MoveDefinition';
import { fallbackStanceTable } from '../../src/data/loadStanceBoxes';

const move: MoveDefinition = {
  id: 'test_hit',
  characterId: 'ryu',
  moveId: '5LP',
  displayName: 'test',
  frames: { startup: 2, active: 2, recovery: 2, total: 6 },
  advantage: { onHit: 0, onBlock: 0 },
  damage: 100,
  hitstun: 10,
  blockstun: 8,
  cancel: { specialCancel: false, targetCombo: [], windows: [] },
  boxes: {
    hurt: [{ from: 0, to: 12, x: 0, y: 0.85, w: 0.7, h: 1.7, layer: 'base', part: 'body' }],
    hit: [{ from: 2, to: 3, x: 0.5, y: 1, w: 0.4, h: 0.3 }],
    push: [{ from: 0, to: 12, x: 0, y: 0.7, w: 0.55, h: 1.4 }],
  },
  selfMovement: new Array(13).fill(0),
  timelineFrames: 13,
  clipId: '5lp',
  facingRelative: true,
  review: { status: 'test', notes: '' },
};

describe('boxAssembly hit no residual', () => {
  it('hit empty after logic total (even if hit.to wrong)', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.setStanceTable(fallbackStanceTable());
    f.startMove(move);
    // While active: frame 2–3 should have hit
    for (let i = 0; i < 2; i++) {
      f.advance({ airFrames: 38, landingFrames: 3, dashSpeed: 0 });
    }
    expect(f.phase).toBe('attack');
    expect(f.mover.moveFrame).toBe(2);
    expect(f.worldHitBoxes().length).toBeGreaterThan(0);

    // Finish logic total
    for (let i = 0; i < 10; i++) {
      f.advance({ airFrames: 38, landingFrames: 3, dashSpeed: 0 });
      if (f.canAct()) break;
    }
    expect(f.canAct()).toBe(true);
    // Residual timeline may still be active for hurt, but hit must be empty
    expect(f.worldHitBoxes().length).toBe(0);
  });
});
