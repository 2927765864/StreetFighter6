import { describe, expect, it } from 'vitest';
import { Fighter } from '../../src/combat/fighter/Fighter';
import type { MoveDefinition } from '../../src/combat/move/MoveDefinition';
import { fallbackStanceTable } from '../../src/data/loadStanceBoxes';

const move: MoveDefinition = {
  id: 'test_walk',
  characterId: 'ryu',
  moveId: '5LP',
  displayName: 'w',
  frames: { startup: 2, active: 1, recovery: 1, total: 4 },
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
        x: 0.9,
        y: 1,
        w: 0.4,
        h: 0.4,
        layer: 'extend',
        part: 'body',
      },
    ],
    hit: [{ from: 1, to: 1, x: 0.5, y: 1, w: 0.3, h: 0.3 }],
    push: [{ from: 0, to: 20, x: 0, y: 0.7, w: 0.55, h: 1.4 }],
  },
  selfMovement: new Array(21).fill(0),
  timelineFrames: 21,
  clipId: '5lp',
  facingRelative: true,
  review: { status: 'test', notes: '' },
};

describe('boxAssembly walk clears action layer', () => {
  it('after walk only stance hurt remains', () => {
    const stance = fallbackStanceTable();
    const f = new Fighter('p1', 0, 1, 10000);
    f.setStanceTable(stance);
    f.startMove(move);
    for (let i = 0; i < 4; i++) {
      f.advance({ airFrames: 38, landingFrames: 3, dashSpeed: 0 });
    }
    expect(f.attackResidual).not.toBeNull();
    const withAction = f.worldHurtBoxes(false).length;
    expect(withAction).toBeGreaterThan(stance.stances.stand.hurt.length);

    f.applyPostureOrWalkIntent('walk');
    expect(f.attackResidual).toBeNull();
    expect(f.getActionTimeline()).toBeNull();
    expect(f.worldHurtBoxes(false).length).toBe(stance.stances.stand.hurt.length);
    expect(f.worldHitBoxes().length).toBe(0);
  });
});
