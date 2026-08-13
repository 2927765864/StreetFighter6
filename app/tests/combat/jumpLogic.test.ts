import { describe, expect, it } from 'vitest';
import { MatchSim } from '../../src/combat/match/MatchSim';
import { MoveCatalog } from '../../src/combat/move/MoveCatalog';
import type { MoveDefinition } from '../../src/combat/move/MoveDefinition';
import { BTN_LP } from '../../src/combat/types';
import { resolveIntent } from '../../src/combat/command/IntentResolver';

const lp: MoveDefinition = {
  id: 'ryu_5lp',
  characterId: 'ryu',
  moveId: '5LP',
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
  review: { status: 'placeholder', notes: '' },
};

const jlp: MoveDefinition = {
  ...lp,
  id: 'ryu_jlp',
  moveId: 'ryu_jlp',
  displayName: 'j.LP',
  // §3.13.3: jump total = startup+active; recovery is until landing (state), not table
  frames: { startup: 4, active: 10, recovery: 0, total: 14 },
  clipId: 'ryu_jlp',
  animFrameCount: 47,
  stance: 'air',
};

const jhk: MoveDefinition = {
  ...lp,
  id: 'ryu_jhk',
  moveId: 'ryu_jhk',
  displayName: 'j.HK',
  frames: { startup: 12, active: 8, recovery: 0, total: 19 },
  clipId: 'ryu_jhk',
  animFrameCount: 82,
  stance: 'air',
};

const hado: MoveDefinition = {
  ...lp,
  id: 'ryu_hadoken_lp',
  moveId: 'ryu_hadoken_lp',
  displayName: 'Hadoken',
  frames: { startup: 16, active: 1, recovery: 30, total: 47 },
  clipId: 'hadoken_lp',
};

const N = {
  dir: 5 as const,
  relDir: 5 as const,
  buttons: 0,
  pressed: 0,
  released: 0,
};

function sim(
  extra: MoveDefinition[] = [],
  opts: { enableSpecials?: boolean } = {},
) {
  return new MatchSim(
    lp,
    MoveCatalog.fromMoves([lp, jlp, jhk, hado, ...extra]),
    {
      forceP2Guard: true,
      enableActionBuffer: false,
      enableSpecials: opts.enableSpecials ?? false,
    },
  );
}

function jumpNeutral(s: MatchSim) {
  s.pendingInput = {
    dir: 8,
    relDir: 8,
    buttons: 0,
    pressed: 0,
    released: 0,
  };
  s.step();
  expect(s.p1.phase).toBe('prejump');
}

function toAirborne(s: MatchSim) {
  jumpNeutral(s);
  for (let i = 0; i < 4; i++) {
    s.pendingInput = N;
    s.step();
  }
  expect(s.p1.phase).toBe('airborne');
}

describe('jump §3.13', () => {
  it('air attack keeps flying (y changes)', () => {
    const s = sim();
    toAirborne(s);
    const y0 = s.p1.y;
    s.pendingInput = {
      dir: 5,
      relDir: 5,
      buttons: BTN_LP,
      pressed: BTN_LP,
      released: 0,
    };
    s.step();
    expect(s.p1.phase).toBe('attack');
    expect(s.p1.usedAirNormal).toBe(true);
    expect(s.p1.jumpPhase).toBe('air');
    const y1 = s.p1.y;
    s.pendingInput = N;
    s.step();
    s.step();
    expect(s.p1.y).not.toBe(y1);
    expect(s.p1.y).not.toBe(y0);
    expect(s.p1.phase === 'attack' || s.p1.phase === 'airborne').toBe(true);
  });

  it('one air normal per jump', () => {
    const s = sim();
    toAirborne(s);
    s.pendingInput = {
      dir: 5,
      relDir: 5,
      buttons: BTN_LP,
      pressed: BTN_LP,
      released: 0,
    };
    s.step();
    const clip = s.p1.clipId;
    for (let i = 0; i < 20; i++) {
      s.pendingInput = {
        dir: 5,
        relDir: 5,
        buttons: BTN_LP,
        pressed: BTN_LP,
        released: 0,
      };
      s.step();
    }
    expect(s.p1.usedAirNormal).toBe(true);
    expect(s.p1.canAirAct()).toBe(false);
    expect(s.p1.clipId === clip || s.p1.jumpPhase === 'air').toBe(true);
    expect(s.p1.mover.move?.id === 'ryu_jlp' || s.p1.phase !== 'attack').toBe(
      true,
    );
  });

  it('empty landing frames 2–3 can start ground attack', () => {
    const s = sim();
    toAirborne(s);
    for (let i = 0; i < 38; i++) {
      s.pendingInput = N;
      s.step();
    }
    expect(s.p1.phase).toBe('landing');
    expect(s.p1.canLandingAttack()).toBe(false);
    s.pendingInput = N;
    s.step();
    expect(s.p1.canLandingAttack()).toBe(true);
    s.pendingInput = {
      dir: 5,
      relDir: 5,
      buttons: BTN_LP,
      pressed: BTN_LP,
      released: 0,
    };
    s.step();
    expect(s.p1.phase).toBe('attack');
    expect(s.p1.mover.move?.id).toBe('ryu_5lp');
  });

  it('after air normal, landing cannot attack', () => {
    const s = sim();
    toAirborne(s);
    s.pendingInput = {
      dir: 5,
      relDir: 5,
      buttons: BTN_LP,
      pressed: BTN_LP,
      released: 0,
    };
    s.step();
    let guard = 0;
    while (s.p1.phase !== 'landing' && guard < 50) {
      s.pendingInput = N;
      s.step();
      guard += 1;
    }
    expect(s.p1.phase).toBe('landing');
    expect(s.p1.usedAirNormal).toBe(true);
    s.pendingInput = N;
    s.step();
    expect(s.p1.canLandingAttack()).toBe(false);
    s.pendingInput = {
      dir: 5,
      relDir: 5,
      buttons: BTN_LP,
      pressed: BTN_LP,
      released: 0,
    };
    s.step();
    expect(s.p1.phase).toBe('landing');
  });

  it('prejump can special-cancel into hadoken', () => {
    const s = sim([], { enableSpecials: true });
    jumpNeutral(s);
    s.pendingInput = {
      dir: 2,
      relDir: 2,
      buttons: 0,
      pressed: 0,
      released: 0,
    };
    s.step();
    s.pendingInput = {
      dir: 3,
      relDir: 3,
      buttons: 0,
      pressed: 0,
      released: 0,
    };
    s.step();
    s.pendingInput = {
      dir: 6,
      relDir: 6,
      buttons: BTN_LP,
      pressed: BTN_LP,
      released: 0,
    };
    s.step();
    expect(s.p1.phase).toBe('attack');
    expect(s.p1.mover.move?.id).toBe('ryu_hadoken_lp');
    expect(s.p1.y).toBe(0);
  });

  it('air attack end keeps attack residual, not jump air clip', () => {
    const s = sim();
    toAirborne(s);
    s.pendingInput = {
      dir: 5,
      relDir: 5,
      buttons: BTN_LP,
      pressed: BTN_LP,
      released: 0,
    };
    s.step();
    for (let i = 0; i < jlp.frames.total; i++) {
      s.pendingInput = N;
      s.step();
    }
    expect(s.p1.phase).toBe('airborne');
    expect(s.p1.usedAirNormal).toBe(true);
    expect(s.p1.clipId).toBe('ryu_jlp');
    expect(s.p1.hasAnimTail).toBe(true);
    expect(s.p1.animTail?.holdAir).toBe(true);
    expect(s.p1.animRole).not.toBe('air');
    // Residual starts at total and advances toward animFrameCount (§3.13.5)
    expect(s.p1.animTail?.logicTotal).toBe(jlp.frames.total);
    expect(s.p1.animTail?.animFrameCount).toBe(47);
    expect(s.p1.animTail!.visualFrame).toBeGreaterThanOrEqual(jlp.frames.total);
    const vf0 = s.p1.animTail!.visualFrame;
    s.pendingInput = N;
    s.step();
    s.step();
    s.step();
    expect(s.p1.animTail!.visualFrame).toBe(vf0 + 3);
    expect(s.p1.clipId).toBe('ryu_jlp');
  });

  it('j.HK residual scrubs past logic total toward 82 frames', () => {
    const s = sim();
    // Attack early in the arc so residual has air time left (38f air total).
    toAirborne(s);
    s.p1.startMove(jhk);
    expect(s.p1.phase).toBe('attack');
    for (let i = 0; i < jhk.frames.total; i++) {
      s.pendingInput = N;
      s.step();
    }
    expect(s.p1.phase).toBe('airborne');
    expect(s.p1.animTail?.holdAir).toBe(true);
    expect(s.p1.animTail?.animFrameCount).toBe(82);
    expect(s.p1.animTail!.visualFrame).toBe(jhk.frames.total);
    // 19 logic + 10 residual still well before land (~38 air samples)
    for (let i = 0; i < 10; i++) {
      s.pendingInput = N;
      s.step();
      expect(s.p1.phase).toBe('airborne');
      expect(s.p1.hasAnimTail).toBe(true);
    }
    expect(s.p1.animTail!.visualFrame).toBe(jhk.frames.total + 10);
    expect(s.p1.clipId).toBe('ryu_jhk');
    expect(s.p1.animRole).not.toBe('air');
  });

  it('landing uses land role (not jump main/start)', () => {
    const s = sim();
    toAirborne(s);
    for (let i = 0; i < 38; i++) {
      s.pendingInput = N;
      s.step();
    }
    expect(s.p1.phase).toBe('landing');
    expect(s.p1.clipId).toBe('jump_n');
    expect(s.p1.animRole).toBe('land');
    expect(s.p1.jumpPhase).toBe('land');
    for (let i = 0; i < 3; i++) {
      s.pendingInput = N;
      s.step();
    }
    expect(s.p1.phase).toBe('idle');
    expect(s.p1.animTail?.animRole).toBe('land');
    expect(s.p1.clipId).toBe('jump_n');
    expect(s.p1.animRole).toBe('land');
  });

  it('neutral prejump retargets to forward jump', () => {
    const s = sim();
    jumpNeutral(s);
    expect(s.p1.jumpClipId).toBe('jump_n');
    s.pendingInput = {
      dir: 9,
      relDir: 9,
      buttons: 0,
      pressed: 0,
      released: 0,
    };
    s.step();
    expect(s.p1.jumpClipId).toBe('jump_f');
    expect(s.p1.jumpHorizSign).toBe(1);
  });

  it('resolver: prejump specials ok, ground normals blocked', () => {
    const cfg = {
      motionStepGapMax: 9,
      dashDirHoldMax: 8,
      dashNeutralMax: 8,
    };
    const idleLp = resolveIntent(
      [
        {
          relDir: 5,
          buttons: BTN_LP,
          pressed: BTN_LP,
          logicFrame: 1,
        },
      ],
      1,
      cfg,
      { phase: 'prejump' },
    );
    expect(idleLp.kind).not.toBe('normal');
  });
});
