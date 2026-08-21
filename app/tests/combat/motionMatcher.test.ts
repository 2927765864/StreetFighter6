import { describe, expect, it } from 'vitest';
import {
  collapseDirs,
  detectDash,
  matchMotion,
  tryMatchCommand,
} from '../../src/combat/command/MotionMatcher';
import { RYU_P0_COMMANDS } from '../../src/combat/command/ryuCommands';
import type { HistoryEntry } from '../../src/combat/input/InputHistory';
import { BTN_LP } from '../../src/combat/types';

function hist(dirs: number[], pressFrame = -1): HistoryEntry[] {
  return dirs.map((d, i) => ({
    relDir: d as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
    buttons: pressFrame === i + 1 ? BTN_LP : 0,
    pressed: pressFrame === i + 1 ? BTN_LP : 0,
    logicFrame: i + 1,
  }));
}

describe('MotionMatcher', () => {
  it('collapses consecutive dirs', () => {
    const c = collapseDirs(hist([2, 2, 3, 6]));
    expect(c.map((x) => x.dir)).toEqual([2, 3, 6]);
  });

  it('matches 236 motion', () => {
    const c = collapseDirs(hist([5, 2, 3, 6]));
    const m = matchMotion(c, [{ dirs: [2] }, { dirs: [3] }, { dirs: [6] }], 9);
    expect(m.ok).toBe(true);
  });

  it('fails when gap > max', () => {
    const entries: HistoryEntry[] = [
      { relDir: 2, buttons: 0, pressed: 0, logicFrame: 1 },
      { relDir: 3, buttons: 0, pressed: 0, logicFrame: 12 },
      { relDir: 6, buttons: 0, pressed: 0, logicFrame: 13 },
    ];
    const c = collapseDirs(entries);
    const m = matchMotion(c, [{ dirs: [2] }, { dirs: [3] }, { dirs: [6] }], 9);
    expect(m.ok).toBe(false);
  });

  it('236+LP matches hado command', () => {
    const entries = hist([5, 2, 3, 6], 4);
    const hado = RYU_P0_COMMANDS.find((c) => c.id === 'hado_lp')!;
    const intent = tryMatchCommand(entries, hado, { motionStepGapMax: 9 });
    expect(intent?.kind).toBe('special');
    expect(intent?.moveId).toBe('ryu_hadoken_lp');
  });

  it('allows junk dir in motion (2636)', () => {
    const entries = hist([2, 6, 3, 6], 4);
    const hado = RYU_P0_COMMANDS.find((c) => c.id === 'hado_lp')!;
    // 2,6,3,6 — matching 2 then 3 then 6 from end works
    const intent = tryMatchCommand(entries, hado, { motionStepGapMax: 9 });
    expect(intent?.kind).toBe('special');
  });
});

describe('detectDash', () => {
  it('accepts 6-5-6 forward dash', () => {
    const entries = hist([6, 5, 6]);
    expect(detectDash(entries, 3, 6, 8, 8)).toBe(true);
  });

  it('accepts 4-5-4 back dash', () => {
    const entries = hist([4, 5, 4]);
    expect(detectDash(entries, 3, 4, 8, 8)).toBe(true);
  });

  it('rejects forward dash when opposite 4 appears between taps', () => {
    const entries = hist([6, 4, 6]);
    expect(detectDash(entries, 3, 6, 8, 8)).toBe(false);
  });

  it('rejects back dash when opposite 6 appears between taps', () => {
    const entries = hist([4, 6, 4]);
    expect(detectDash(entries, 3, 4, 8, 8)).toBe(false);
  });

  it('rejects rapid left/right alternating as either dash', () => {
    const entries = hist([6, 4, 6, 4, 6]);
    const now = 5;
    expect(detectDash(entries, now, 6, 8, 8)).toBe(false);
    expect(detectDash(entries, now, 4, 8, 8)).toBe(false);
  });

  it('still accepts dash when only neutral sits between taps', () => {
    const entries = hist([6, 5, 5, 5, 6]);
    expect(detectDash(entries, 5, 6, 8, 8)).toBe(true);
  });

  it('rejects hold-forward + double crouch taps (6-3-6-3-6 is not 66)', () => {
    // Hold 6, tap 2 twice → 6↔3↔6; forward never released.
    const entries = hist([6, 3, 6, 3, 6]);
    expect(detectDash(entries, 5, 6, 8, 8)).toBe(false);
  });

  it('rejects hold-back + double crouch taps (4-1-4-1-4 is not 44)', () => {
    const entries = hist([4, 1, 4, 1, 4]);
    expect(detectDash(entries, 5, 4, 8, 8)).toBe(false);
  });

  it('rejects hold-forward + single crouch release as second tap (6-3-6)', () => {
    const entries = hist([6, 3, 6]);
    expect(detectDash(entries, 3, 6, 8, 8)).toBe(false);
  });

  it('rejects hold-forward + up-diagonal wobble (6-9-6)', () => {
    const entries = hist([6, 9, 6]);
    expect(detectDash(entries, 3, 6, 8, 8)).toBe(false);
  });

  it('still accepts dash after releasing forward into crouch then retapping (6-2-6)', () => {
    const entries = hist([6, 2, 6]);
    expect(detectDash(entries, 3, 6, 8, 8)).toBe(true);
  });

  it('rejects forward dash when opposite diagonal appears between taps', () => {
    const entries = hist([6, 1, 6]);
    expect(detectDash(entries, 3, 6, 8, 8)).toBe(false);
  });
});
