import { describe, expect, it } from 'vitest';
import { Fighter } from '../../src/combat/fighter/Fighter';
import type { MoveDefinition } from '../../src/combat/move/MoveDefinition';
import { fallbackStanceTable } from '../../src/data/loadStanceBoxes';
import { assembleWorldBoxes } from '../../src/combat/boxes/BoxAssembly';

const standAttack: MoveDefinition = {
  id: 'ryu_5lp',
  characterId: 'ryu',
  moveId: 'ryu_5lp',
  displayName: '5LP',
  frames: { startup: 2, active: 2, recovery: 2, total: 6 },
  advantage: { onHit: 0, onBlock: 0 },
  damage: 100,
  hitstun: 10,
  blockstun: 8,
  cancel: { specialCancel: false, targetCombo: [], windows: [] },
  boxes: {
    hurt: [
      {
        from: 0,
        to: 5,
        x: 0,
        y: 1.5,
        w: 0.5,
        h: 0.3,
        part: 'head',
        layer: 'base',
      },
      {
        from: 0,
        to: 5,
        x: 0,
        y: 1.0,
        w: 0.6,
        h: 0.7,
        part: 'body',
        layer: 'base',
      },
      {
        from: 0,
        to: 5,
        x: 0,
        y: 0.3,
        w: 0.6,
        h: 0.5,
        part: 'leg',
        layer: 'base',
      },
      {
        from: 2,
        to: 3,
        x: 0.7,
        y: 1.2,
        w: 0.4,
        h: 0.3,
        part: 'body',
        layer: 'extend',
      },
    ],
    hit: [{ from: 2, to: 3, x: 0.8, y: 1.3, w: 0.4, h: 0.35 }],
    push: [{ from: 0, to: 5, x: 0, y: 0.8, w: 0.5, h: 1.2 }],
  },
  clipId: 'ryu_5lp',
  facingRelative: true,
  review: { status: 'test', notes: '' },
};

const crouchAttack: MoveDefinition = {
  ...standAttack,
  id: 'ryu_2lp',
  moveId: 'ryu_2lp',
  clipId: 'ryu_2lp',
  stance: 'crouch',
};

describe('boxAssembly stance switches with posture / move', () => {
  it('crouch phase uses crouch stance (shorter than stand)', () => {
    const stance = fallbackStanceTable();
    const f = new Fighter('p1', 0, 1, 10000);
    f.setStanceTable(stance);
    f.setStanceConfig({ standToCrouchFrames: 4, crouchToStandFrames: 3 });
    f.applyPostureOrWalkIntent('crouch');
    // Finish stand_to_crouch (early frames are still stand-shaped MMDK segs)
    for (let i = 0; i < 4; i++) {
      f.advance({ airFrames: 38, landingFrames: 3, dashSpeed: 0 });
    }
    expect(f.stanceState.seg).toBe('none');
    expect(f.stanceState.logicalCrouch).toBe(true);
    f.phase = 'crouch';

    const standTop = Math.max(
      ...stance.stances.stand.hurt.map((b) => b.y + b.h / 2),
    );
    const crouchTop = Math.max(
      ...f.worldHurtBoxes().map((b) => b.y + b.h / 2),
    );
    expect(f.assembleBoxes().stanceId).toBe('crouch');
    expect(crouchTop).toBeLessThan(standTop - 0.15);
  });

  it('airborne / elevated uses compact air stance (not stand 3-stack)', () => {
    const stance = fallbackStanceTable();
    const f = new Fighter('p1', 0, 1, 10000);
    f.setStanceTable(stance);
    f.phase = 'airborne';
    f.y = 1.2;
    const a = f.assembleBoxes();
    expect(a.stanceId).toBe('air');
    expect(a.hurt.length).toBe(1);
    expect(a.hurt.length).toBeLessThan(stance.stances.stand.hurt.length);
    // boxes ride fighter.y (world)
    const minY = Math.min(...f.worldHurtBoxes().map((b) => b.y - b.h / 2));
    expect(minY).toBeGreaterThan(0.5);
  });

  it('prejump stays on stand boxes (still grounded)', () => {
    const stance = fallbackStanceTable();
    const f = new Fighter('p1', 0, 1, 10000);
    f.setStanceTable(stance);
    f.phase = 'prejump';
    f.y = 0;
    expect(f.assembleBoxes().stanceId).toBe('stand');
    expect(f.assembleBoxes().hurt.length).toBe(3);
  });

  it('attack replaces stance base and adds extend + hit', () => {
    const stance = fallbackStanceTable();
    const f = new Fighter('p1', 0, 1, 10000);
    f.setStanceTable(stance);
    f.startMove(standAttack);
    // frame 0
    const a0 = f.assembleBoxes();
    expect(a0.stanceId).toBe('stand');
    // base replaced: head center y = 1.5 (action), not fallback stand head 1.66
    const heads = a0.hurt.filter((b) => Math.abs(b.y - 1.5) < 0.05);
    expect(heads.length).toBeGreaterThanOrEqual(1);

    // advance to active frame 2
    f.advance({ airFrames: 38, landingFrames: 3, dashSpeed: 0 });
    f.advance({ airFrames: 38, landingFrames: 3, dashSpeed: 0 });
    expect(f.mover.moveFrame).toBe(2);
    const a2 = f.assembleBoxes();
    expect(a2.hit.length).toBeGreaterThan(0);
    // extend merged → more than 3 boxes
    expect(a2.hurt.length).toBeGreaterThanOrEqual(4);
  });

  it('crouch attack selects crouch stance family', () => {
    const stance = fallbackStanceTable();
    const assembled = assembleWorldBoxes(
      {
        x: 0,
        y: 0,
        facing: 1,
        phase: 'attack',
        hasActiveMove: true,
        getActionTimeline: () => ({ move: crouchAttack, frame: 0 }),
      },
      stance,
    );
    expect(assembled.stanceId).toBe('crouch');
  });
});
