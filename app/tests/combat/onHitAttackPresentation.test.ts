import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Fighter } from '../../src/combat/fighter/Fighter';
import { MatchSim } from '../../src/combat/match/MatchSim';
import type { MoveDefinition } from '../../src/combat/move/MoveDefinition';
import {
  buildHitAnimSequence,
  buildSwingAnimSequence,
  parseMoveDefinition,
  swingMainFrame,
} from '../../src/combat/move/MoveDefinition';
import { BTN_LP } from '../../src/combat/types';
import { LogicGlbMap } from '../../src/data/logicGlbMap';
import { resolveAnimSequenceFrame as resolveSeq } from '../../src/render/AnimScrub';

function load(name: string) {
  const p = resolve(__dirname, '../../public/data/moves', name);
  return parseMoveDefinition(JSON.parse(readFileSync(p, 'utf8')));
}

function loadMap() {
  const p = resolve(
    __dirname,
    '../../public/data/clips/ryu_logic_to_glb_map.json',
  );
  return LogicGlbMap.fromJson(JSON.parse(readFileSync(p, 'utf8')));
}

function probeMove(
  over: Partial<MoveDefinition> & Pick<MoveDefinition, 'id'>,
): MoveDefinition {
  return {
    characterId: 'ryu',
    moveId: over.id,
    displayName: over.id,
    frames: { startup: 7, active: 4, recovery: 25, total: 35 },
    advantage: { onHit: 1, onBlock: -13 },
    damage: 800,
    hitstun: 22,
    blockstun: 16,
    cancel: { specialCancel: false, targetCombo: [], windows: [] },
    boxes: {
      hurt: [{ from: 0, to: 34, x: 0, y: 0.85, w: 0.7, h: 1.7 }],
      hit: [{ from: 6, to: 9, x: 1.2, y: 0.85, w: 2.5, h: 1.5 }],
      push: [{ from: 0, to: 34, x: 0, y: 0.7, w: 0.55, h: 1.4 }],
    },
    clipId: over.id,
    facingRelative: true,
    review: { status: 'placeholder', notes: '' },
    hitstopOnHit: 0,
    hitstopOnBlock: 0,
    guard: 'high',
    guardStrength: 'H',
    hitAnim: 'h',
    animRole: 'main',
    animRoleOnHit: 'on_hit',
    animFrameCount: 82,
    animFrameCountOnHit: 100,
    ...over,
  };
}

function pressLp() {
  return {
    dir: 5 as const,
    relDir: 5 as const,
    buttons: BTN_LP,
    pressed: BTN_LP,
    released: 0,
  };
}
function neutral() {
  return {
    dir: 5 as const,
    relDir: 5 as const,
    buttons: 0,
    pressed: 0,
    released: 0,
  };
}

function runUntilHitOrEnd(sim: MatchSim, max = 50): void {
  sim.pendingInput = pressLp();
  sim.step();
  for (let i = 0; i < max; i++) {
    sim.pendingInput = neutral();
    sim.step();
    if (sim.lastHitResult === 'block' || sim.lastHitResult === 'hit') return;
    if (sim.p1.phase !== 'attack' && sim.p1.animTail == null) return;
  }
}

describe('SWING-branch attack presentation (4HP / 2HP)', () => {
  it('map exposes on_hit ATK_*_H and main whiff clips', () => {
    const map = loadMap();
    expect(map.pathForRole('ryu_4hp', 'on_hit')).toContain('ATK_4HP_H');
    expect(map.pathForRole('ryu_4hp', 'main')).toContain('ATK_4HP');
    expect(map.pathForRole('ryu_2hp', 'on_hit')).toContain('ATK_2HP_H');
    expect(map.pathForRole('ryu_2hp', 'main')).toContain('ATK_2HP');
    expect(map.primaryPath('dmg_hu_up_h')).toContain('DMG_HU_UP_H');
  });

  it('swing sequence: startup on_hit, then whiff main at MainFrame', () => {
    const mv = load('ryu_4hp.json');
    const mainFrame = swingMainFrame(mv);
    expect(mainFrame).toBe(6); // startup 7 → first active index 6
    const swing = buildSwingAnimSequence(mv)!;
    expect(resolveSeq(0, swing)?.role).toBe('on_hit');
    expect(resolveSeq(mainFrame - 1, swing)?.role).toBe('on_hit');
    expect(resolveSeq(mainFrame, swing)?.role).toBe('main');
    expect(resolveSeq(mainFrame, swing)?.motionFrame).toBe(0);
    expect(resolveSeq(mainFrame + 10, swing)?.role).toBe('main');
    expect(resolveSeq(mainFrame + 10, swing)?.motionFrame).toBe(10);
  });

  it('hit sequence stays on_hit for full hit clip', () => {
    const mv = load('ryu_4hp.json');
    const hit = buildHitAnimSequence(mv)!;
    expect(resolveSeq(0, hit)?.role).toBe('on_hit');
    expect(resolveSeq(50, hit)?.role).toBe('on_hit');
    expect(resolveSeq(99, hit)?.role).toBe('on_hit');
  });

  it('startMove begins on hit-clip startup (not whiff)', () => {
    const mv = load('ryu_4hp.json');
    const f = new Fighter('p1', 0, 1, 10000);
    f.startMove(mv);
    expect(f.animRole).toBe('on_hit');
    expect(f.attackAnimSequence?.[0]?.role).toBe('on_hit');
    expect(f.attackAnimSequence?.[1]?.role).toBe('main');
    const atActive = resolveSeq(swingMainFrame(mv), f.attackAnimSequence);
    expect(atActive?.role).toBe('main');
  });

  it('applyOnHitAttackPresentation locks hit-clip recovery', () => {
    const mv = load('ryu_4hp.json');
    const f = new Fighter('p1', 0, 1, 10000);
    f.startMove(mv);
    // Simulate reaching active on swing path
    f.mover.moveFrame = swingMainFrame(mv);
    expect(resolveSeq(f.mover.moveFrame, f.attackAnimSequence)?.role).toBe(
      'main',
    );
    f.applyOnHitAttackPresentation(mv);
    expect(f.animRole).toBe('on_hit');
    expect(resolveSeq(f.mover.moveFrame, f.attackAnimSequence)?.role).toBe(
      'on_hit',
    );
    expect(f.attackAnimFrameCountOverride).toBe(100);
  });

  it('MatchSim hit: defender dmg_hu_up_h; attacker on hit-clip', () => {
    const mv = probeMove({
      id: 'ryu_5lp',
      hitReactClipId: 'dmg_hu_up_h',
      forcesStand: true,
      frames: { startup: 4, active: 3, recovery: 7, total: 14 },
      boxes: {
        hurt: [{ from: 0, to: 13, x: 0, y: 0.85, w: 0.7, h: 1.7 }],
        hit: [{ from: 3, to: 5, x: 1.2, y: 0.85, w: 2.5, h: 1.5 }],
        push: [{ from: 0, to: 13, x: 0, y: 0.7, w: 0.55, h: 1.4 }],
      },
      animFrameCount: 40,
      animFrameCountOnHit: 60,
    });
    const sim = new MatchSim(mv, undefined, {
      dummyGuardPolicy: 'none',
      dummyUnguardedStance: 'crouch',
      hitstopFramesOnHit: 0,
    });
    runUntilHitOrEnd(sim);
    expect(sim.lastHitResult).toBe('hit');
    expect(sim.p1.animRole).toBe('on_hit');
    expect(sim.p2.clipId).toBe('dmg_hu_up_h');
  });

  it('MatchSim whiff: never switches to hit-lock; swing path stays armed', () => {
    const mv = probeMove({
      id: 'ryu_5lp',
      frames: { startup: 4, active: 3, recovery: 7, total: 14 },
      boxes: {
        hurt: [{ from: 0, to: 13, x: 0, y: 0.85, w: 0.7, h: 1.7 }],
        hit: [{ from: 3, to: 5, x: 0.2, y: 0.85, w: 0.1, h: 0.2 }],
        push: [{ from: 0, to: 13, x: 0, y: 0.7, w: 0.55, h: 1.4 }],
      },
      animFrameCount: 40,
      animFrameCountOnHit: 60,
    });
    const sim = new MatchSim(mv, undefined, {
      dummyGuardPolicy: 'none',
      hitstopFramesOnHit: 0,
    });
    runUntilHitOrEnd(sim);
    expect(sim.lastHitResult).not.toBe('hit');
    // Whiff must keep the two-segment swing sequence (startup on_hit → main),
    // not the single-segment hit-lock sequence.
    const seq = sim.p1.attackAnimSequence ?? sim.p1.animTail?.animSequence;
    expect(seq?.length).toBe(2);
    expect(seq?.[0]?.role).toBe('on_hit');
    expect(seq?.[1]?.role).toBe('main');
    const mf = swingMainFrame(mv);
    expect(resolveSeq(mf, seq)?.role).toBe('main');
    expect(resolveSeq(0, seq)?.role).toBe('on_hit');
  });

  it('real ryu_4hp / ryu_2hp JSON carry SWING wiring fields', () => {
    const m4 = load('ryu_4hp.json');
    expect(m4.animRoleOnHit).toBe('on_hit');
    expect(m4.hitReactClipId).toBe('dmg_hu_up_h');
    expect(m4.forcesStand).toBe(true);
    expect(buildSwingAnimSequence(m4)).not.toBeNull();

    const m2 = load('ryu_2hp.json');
    expect(m2.animRoleOnHit).toBe('on_hit');
    expect(m2.hitReactClipId).toBe('dmg_mh_up');
    expect(m2.forcesStand).toBe(true);
    expect(buildSwingAnimSequence(m2)).not.toBeNull();
  });

  it('map exposes dmg_mh_up for 2HP', () => {
    const map = loadMap();
    expect(map.primaryPath('dmg_mh_up')).toContain('DMG_MH_UP');
  });
});
