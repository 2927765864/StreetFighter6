import { describe, expect, it } from 'vitest';
import { Fighter } from '../../src/combat/fighter/Fighter';
import type { MoveDefinition } from '../../src/combat/move/MoveDefinition';
import { parseMoveDefinition } from '../../src/combat/move/MoveDefinition';

const residualMove: MoveDefinition = {
  id: 'test_res',
  characterId: 'ryu',
  moveId: '5LP',
  displayName: 'res',
  frames: { startup: 2, active: 1, recovery: 1, total: 4 },
  advantage: { onHit: 0, onBlock: 0 },
  damage: 0,
  hitstun: 0,
  blockstun: 4,
  cancel: { specialCancel: false, targetCombo: [], windows: [] },
  boxes: {
    hurt: [{ from: 0, to: 9, x: 0, y: 0.85, w: 0.7, h: 1.7 }],
    hit: [{ from: 1, to: 1, x: 0.5, y: 1, w: 0.4, h: 0.3 }],
    push: [{ from: 0, to: 9, x: 0, y: 0.7, w: 0.55, h: 1.4 }],
  },
  selfMovement: [0, 0, 0, 0, 0.05, 0.05, 0, 0, 0, 0],
  timelineFrames: 10,
  clipId: '5lp',
  facingRelative: true,
  review: { status: 'placeholder', notes: '' },
};

describe('attack residual Place §3.12', () => {
  it('continues Place after total while standing', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.startMove(residualMove);
    // advance through logic total (4 frames of advance after start)
    for (let i = 0; i < 4; i++) {
      f.applyAttackPlaceDisplacement(1);
      f.advance({
        airFrames: 38,
        landingFrames: 3,
        dashSpeed: 0,
      });
    }
    expect(f.canAct()).toBe(true);
    expect(f.attackResidual).not.toBeNull();
    const x0 = f.x;
    f.applyAttackResidualDisplacement(1);
    expect(f.x).toBeCloseTo(x0 + 0.05);
    f.tickAttackResidual();
    f.applyAttackResidualDisplacement(1);
    expect(f.x).toBeCloseTo(x0 + 0.1);
  });

  it('walk clears residual Place', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.startMove(residualMove);
    for (let i = 0; i < 4; i++) {
      f.advance({ airFrames: 38, landingFrames: 3, dashSpeed: 0 });
    }
    expect(f.attackResidual).not.toBeNull();
    f.applyPostureOrWalkIntent('walk');
    expect(f.attackResidual).toBeNull();
  });

  it('new move clears residual', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.startMove(residualMove);
    for (let i = 0; i < 4; i++) {
      f.advance({ airFrames: 38, landingFrames: 3, dashSpeed: 0 });
    }
    f.startMove(residualMove);
    expect(f.attackResidual).toBeNull();
    expect(f.phase).toBe('attack');
  });
});

describe('parseMoveDefinition push/timeline', () => {
  it('parses push boxes and timelineFrames', () => {
    const m = parseMoveDefinition({
      id: 'ryu_5lp',
      frames: { startup: 4, active: 3, recovery: 7, total: 13 },
      boxes: {
        hurt: [{ from: 0, to: 12, x: 0, y: 0.85, w: 0.7, h: 1.7 }],
        hit: [{ from: 3, to: 5, x: 0.5, y: 1, w: 0.4, h: 0.3 }],
        push: [{ from: 0, to: 20, x: 0, y: 0.7, w: 0.55, h: 1.4 }],
      },
      selfMovement: new Array(21).fill(0),
    });
    expect(m.boxes.push?.length).toBe(1);
    expect(m.timelineFrames).toBeGreaterThanOrEqual(21);
  });
});
