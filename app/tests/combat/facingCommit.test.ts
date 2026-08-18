import { describe, expect, it } from 'vitest';
import { Fighter } from '../../src/combat/fighter/Fighter';
import {
  pushBoxesOverlapX,
  tryCommitLogicalFacing,
} from '../../src/combat/input/facing';
import { fallbackStanceTable } from '../../src/data/loadStanceBoxes';

describe('logical facing §3.14', () => {
  it('does not commit while push boxes overlap on X', () => {
    const a = { x: 0, facing: 1 as const };
    const b = { x: 0.2, facing: -1 as const };
    const ba = [{ x: 0, y: 0.9, w: 0.8, h: 1.8 }];
    const bb = [{ x: 0.2, y: 0.9, w: 0.8, h: 1.8 }];
    expect(pushBoxesOverlapX(ba, bb)).toBe(true);
    const r = tryCommitLogicalFacing(a, b, ba, bb);
    expect(r.committed).toBe(false);
    expect(a.facing).toBe(1);
  });

  it('commits after X ranges fully separate', () => {
    const a = { x: 0, facing: 1 as const };
    const b = { x: 1.2, facing: -1 as const };
    const ba = [{ x: 0, y: 0.9, w: 0.6, h: 1.8 }];
    const bb = [{ x: 1.2, y: 0.9, w: 0.6, h: 1.8 }];
    expect(pushBoxesOverlapX(ba, bb)).toBe(false);
    const r = tryCommitLogicalFacing(a, b, ba, bb);
    expect(r.committed).toBe(false);
    expect(a.facing).toBe(1);

    a.x = 2.0;
    ba[0]!.x = 2.0;
    const r2 = tryCommitLogicalFacing(a, b, ba, bb);
    expect(r2.aChanged).toBe(true);
    expect(a.facing).toBe(-1);
    expect(b.facing).toBe(1);
  });

  it('idle logical turn starts stand turn clip', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.setStanceTable(fallbackStanceTable());
    f.phase = 'idle';
    f.onLogicalTurn();
    expect(f.turning).toBe(true);
    expect(f.clipId).toBe('turn_std');
  });

  it('walk logical turn does not play clip', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.phase = 'walk';
    f.onLogicalTurn();
    expect(f.turning).toBe(false);
  });

  it('airborne logical turn does not flip mesh', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.phase = 'airborne';
    f.y = 1;
    f.facing = -1;
    f.visualFacing = 1;
    f.onLogicalTurn();
    expect(f.turning).toBe(false);
    expect(f.visualFacing).toBe(1);
    expect(f.pendingTurnAfterLand).toBe(true);
  });

  it('landing queues turn after land clip', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.phase = 'landing';
    f.onLogicalTurn();
    expect(f.turning).toBe(false);
    expect(f.pendingTurnAfterLand).toBe(true);
  });

  it('attack clears pending turn', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.phase = 'landing';
    f.onLogicalTurn();
    f.startMove({
      id: 'ryu_5lp',
      characterId: 'ryu',
      moveId: 'ryu_5lp',
      displayName: '5LP',
      frames: { startup: 4, active: 3, recovery: 7, total: 14 },
      advantage: { onHit: 0, onBlock: 0 },
      damage: 1,
      hitstun: 1,
      blockstun: 1,
      cancel: { specialCancel: false, targetCombo: [], windows: [] },
      boxes: { hurt: [], hit: [] },
      clipId: '5lp',
      facingRelative: true,
      review: { status: 't', notes: '' },
    });
    expect(f.pendingTurnAfterLand).toBe(false);
    expect(f.turning).toBe(false);
  });

  it('land→rejump snaps visual facing after airborne logical turn (§3.14.3.a)', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.phase = 'airborne';
    f.y = 1;
    f.facing = -1;
    f.visualFacing = 1;
    f.onLogicalTurn();
    expect(f.pendingTurnAfterLand).toBe(true);
    expect(f.visualFacing).toBe(1);

    f.y = 0;
    f.phase = 'landing';
    f.startJump(4, 8);
    expect(f.phase).toBe('prejump');
    expect(f.pendingTurnAfterLand).toBe(false);
    expect(f.turning).toBe(false);
    expect(f.visualFacing).toBe(f.facing);
    expect(f.visualFacing).toBe(-1);
  });

  it('mid turn-clip jump snaps visual facing', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.setStanceTable(fallbackStanceTable());
    f.phase = 'idle';
    f.facing = -1;
    f.visualFacing = 1;
    f.beginTurnClip();
    expect(f.turning).toBe(true);
    expect(f.visualFacing).toBe(-1);

    f.visualFacing = 1;
    f.startJump(4, 9);
    expect(f.turning).toBe(false);
    expect(f.visualFacing).toBe(-1);
    expect(f.jumpClipId).toBe('jump_f');
  });

  it('land→dash snaps visual facing after airborne logical turn (§3.14.3.a3)', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.phase = 'airborne';
    f.y = 1;
    f.facing = -1;
    f.visualFacing = 1;
    f.onLogicalTurn();
    expect(f.pendingTurnAfterLand).toBe(true);

    f.y = 0;
    f.phase = 'landing';
    f.startDash(true, 19, 42);
    expect(f.phase).toBe('dash');
    expect(f.pendingTurnAfterLand).toBe(false);
    expect(f.visualFacing).toBe(-1);
    expect(f.visualFacing).toBe(f.facing);
  });
});
