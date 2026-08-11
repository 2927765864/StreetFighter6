import { describe, expect, it } from 'vitest';
import { resolveIntent } from '../../src/combat/command/IntentResolver';
import { tryMatchCommand } from '../../src/combat/command/MotionMatcher';
import { RYU_FEEDBACK_COMMANDS } from '../../src/combat/command/ryuCommands';
import type { HistoryEntry } from '../../src/combat/input/InputHistory';
import {
  BTN_HK,
  BTN_HP,
  BTN_LK,
  BTN_LP,
  BTN_MK,
  BTN_MP,
} from '../../src/combat/types';
import { canonicalizeMoveDefinition } from '../../src/combat/move/ryuMoveIds';
import { parseMoveDefinition } from '../../src/combat/move/MoveDefinition';
import { MoveCatalog } from '../../src/combat/move/MoveCatalog';
import { MatchSim } from '../../src/combat/match/MatchSim';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const cfg = {
  motionStepGapMax: 9,
  dashDirHoldMax: 8,
  dashNeutralMax: 8,
};

function entry(
  relDir: number,
  pressed: number,
  logicFrame: number,
  buttons = pressed,
): HistoryEntry {
  return {
    relDir: relDir as HistoryEntry['relDir'],
    buttons,
    pressed,
    logicFrame,
  };
}

function histDirs(
  dirs: number[],
  pressFrame: number,
  btn: number,
): HistoryEntry[] {
  return dirs.map((d, i) => {
    const fr = i + 1;
    const p = fr === pressFrame ? btn : 0;
    return entry(d, p, fr, p);
  });
}

describe('RYU_FEEDBACK_COMMANDS', () => {
  it('has stand + crouch + air + unique + specials', () => {
    const ids = new Set(RYU_FEEDBACK_COMMANDS.map((c) => c.id));
    expect(ids.has('n_5lp')).toBe(true);
    expect(ids.has('n_2hk')).toBe(true);
    expect(ids.has('n_jlp')).toBe(true);
    expect(ids.has('u_6mp')).toBe(true);
    expect(ids.has('hado_mp')).toBe(true);
    expect(ids.has('shoryu_lp')).toBe(true);
    expect(ids.has('tatsu_lk')).toBe(true);
  });

  it('neutral LP → ryu_5lp', () => {
    const entries = [entry(5, BTN_LP, 1)];
    const intent = resolveIntent(entries, 1, cfg, { phase: 'idle' });
    expect(intent.moveId).toBe('ryu_5lp');
    expect(intent.kind).toBe('normal');
  });

  it('crouch LP → ryu_2lp not 5lp', () => {
    const entries = [entry(2, BTN_LP, 1)];
    const intent = resolveIntent(entries, 1, cfg, { phase: 'idle' });
    expect(intent.moveId).toBe('ryu_2lp');
  });

  it('each stand button maps to correct move', () => {
    const map: [number, string][] = [
      [BTN_LP, 'ryu_5lp'],
      [BTN_MP, 'ryu_5mp'],
      [BTN_HP, 'ryu_5hp'],
      [BTN_LK, 'ryu_5lk'],
      [BTN_MK, 'ryu_5mk'],
      [BTN_HK, 'ryu_5hk'],
    ];
    for (const [btn, mid] of map) {
      const intent = resolveIntent([entry(5, btn, 1)], 1, cfg, { phase: 'idle' });
      expect(intent.moveId).toBe(mid);
    }
  });

  it('236+LP → hadoken over 5lp', () => {
    const entries = histDirs([5, 2, 3, 6], 4, BTN_LP);
    const intent = resolveIntent(entries, 4, cfg, { phase: 'idle' });
    expect(intent.kind).toBe('special');
    expect(intent.moveId).toBe('ryu_hadoken_lp');
  });

  it('6+MP → unique ryu_6mp over 5mp', () => {
    const intent = resolveIntent([entry(6, BTN_MP, 1)], 1, cfg, {
      phase: 'idle',
    });
    expect(intent.moveId).toBe('ryu_6mp');
    expect(intent.priority).toBeGreaterThan(40);
  });

  it('airborne LP → ryu_jlp; ground airOnly skipped', () => {
    const air = resolveIntent([entry(5, BTN_LP, 1)], 1, cfg, {
      phase: 'airborne',
    });
    expect(air.moveId).toBe('ryu_jlp');
    expect(air.airOnly).toBe(true);

    const ground = tryMatchCommand(
      [entry(5, BTN_LP, 1)],
      RYU_FEEDBACK_COMMANDS.find((c) => c.id === 'n_jlp')!,
      cfg,
    );
    // matcher allows; resolver phase gate blocks
    expect(ground?.moveId).toBe('ryu_jlp');
    const idle = resolveIntent([entry(5, BTN_LP, 1)], 1, cfg, { phase: 'idle' });
    expect(idle.moveId).toBe('ryu_5lp');
  });

  it('623+LP → shoryuken', () => {
    const entries = histDirs([5, 6, 2, 3], 4, BTN_LP);
    const intent = resolveIntent(entries, 4, cfg, { phase: 'idle' });
    expect(intent.moveId).toBe('ryu_shoryuken_lp');
  });

  it('canonicalize jump ids', () => {
    const raw = {
      id: 'ryu_j>lp',
      characterId: 'ryu',
      moveId: 'ryu_j>lp',
      displayName: 'j.LP',
      frames: { startup: 4, active: 3, recovery: 0, total: 7 },
      advantage: { onHit: 0, onBlock: 0 },
      damage: 100,
      boxes: {
        hurt: [{ from: 0, to: 7, x: 0, y: 1, w: 0.5, h: 1 }],
        hit: [{ from: 3, to: 5, x: 0.4, y: 1, w: 0.5, h: 0.4 }],
      },
      clipId: 'j>lp',
      cancel: { specialCancel: false, targetCombo: [], windows: [] },
      facingRelative: true,
      review: { status: 'placeholder', notes: '' },
    };
    const m = canonicalizeMoveDefinition(parseMoveDefinition(raw));
    expect(m.id).toBe('ryu_jlp');
    expect(m.moveId).toBe('ryu_jlp');
    expect(m.clipId).toBe('ryu_jlp');
  });
});

describe('MatchSim catalog miss', () => {
  it('does not fallback to 5lp when move missing', () => {
    const path = resolve(
      __dirname,
      '../../public/data/moves/generated/ryu_5lp.json',
    );
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    const move = parseMoveDefinition(raw);
    const catalog = MoveCatalog.fromMoves([move]);
    const sim = new MatchSim(move, catalog);
    sim.pendingInput = {
      dir: 5,
      relDir: 5,
      buttons: BTN_MP,
      pressed: BTN_MP,
      released: 0,
    };
    sim.step();
    // 5mp not in catalog → execute fails; still idle or no attack
    expect(sim.p1.phase).not.toBe('attack');
    expect(sim.debugProbe.lastMoveMiss).toBe('ryu_5mp');
  });

  it('executes 5mp when catalog has it', () => {
    const dir = resolve(__dirname, '../../public/data/moves/generated');
    const lp = parseMoveDefinition(
      JSON.parse(readFileSync(`${dir}/ryu_5lp.json`, 'utf8')),
    );
    const mp = parseMoveDefinition(
      JSON.parse(readFileSync(`${dir}/ryu_5mp.json`, 'utf8')),
    );
    const catalog = MoveCatalog.fromMoves([lp, mp]);
    const sim = new MatchSim(lp, catalog);
    sim.pendingInput = {
      dir: 5,
      relDir: 5,
      buttons: BTN_MP,
      pressed: BTN_MP,
      released: 0,
    };
    sim.step();
    expect(sim.p1.phase).toBe('attack');
    expect(sim.p1.mover.move?.moveId).toBe('ryu_5mp');
  });
});
