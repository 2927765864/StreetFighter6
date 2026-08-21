import { describe, expect, it } from 'vitest';
import { MatchSim } from '../../src/combat/match/MatchSim';
import {
  applyEditMove,
  applyEditStance,
  poseEditFighters,
} from '../../src/boxEditor/BoxEditorSceneSync';
import type { MoveDefinition } from '../../src/combat/move/MoveDefinition';

function miniMove(): MoveDefinition {
  return {
    id: 'ryu_5lp',
    characterId: 'ryu',
    moveId: 'ryu_5lp',
    displayName: '5LP',
    frames: { startup: 4, active: 3, recovery: 7, total: 13 },
    advantage: { onHit: 4, onBlock: -1 },
    damage: 300,
    hitstun: 10,
    blockstun: 8,
    cancel: { specialCancel: true, targetCombo: [], windows: [] },
    boxes: {
      hurt: [{ from: 0, to: 12, x: 0, y: 1, w: 0.8, h: 1.5 }],
      hit: [{ from: 3, to: 6, x: 0.94, y: 1.58, w: 0.5, h: 0.34 }],
      push: [{ from: 0, to: 12, x: 0, y: 0.9, w: 0.6, h: 1.6 }],
    },
    clipId: '5lp',
    facingRelative: true,
    review: { status: 'test', notes: '' },
  };
}

describe('BoxEditorSceneSync', () => {
  function sim(): MatchSim {
    return new MatchSim(miniMove());
  }

  it('poses P1/P2 opposite facing at training corners', () => {
    const match = sim();
    poseEditFighters(match);
    expect(match.p1.x).toBeCloseTo(-1.2);
    expect(match.p2.x).toBeCloseTo(1.2);
    expect(match.p1.facing).toBe(1);
    expect(match.p2.facing).toBe(-1);
    expect(match.p1.visualFacing).toBe(1);
    expect(match.p2.visualFacing).toBe(-1);
  });

  it('applyEditMove syncs both to same moveFrame', () => {
    const match = sim();
    applyEditMove(match, miniMove(), 4);
    expect(match.p1.phase).toBe('attack');
    expect(match.p2.phase).toBe('attack');
    expect(match.p1.mover.moveFrame).toBe(4);
    expect(match.p2.mover.moveFrame).toBe(4);
    expect(match.p1.facing).toBe(1);
    expect(match.p2.facing).toBe(-1);
  });

  it('applyEditStance sets idle/crouch both sides', () => {
    const match = sim();
    applyEditStance(match, 'crouch');
    expect(match.p1.phase).toBe('crouch');
    expect(match.p2.phase).toBe('crouch');
    expect(match.p1.clipId).toBe('crouch');
    expect(match.p2.facing).toBe(-1);
  });
});
