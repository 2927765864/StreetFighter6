import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  freeRunAnimDtSec,
  logicFrameToClipTime,
  remapLogicToClipTime,
  remapLogicToMotionFrame,
  visualFrameToClipTime,
} from '../../src/render/AnimScrub';
import { parseMoveDefinition } from '../../src/combat/move/MoveDefinition';

describe('logicFrameToClipTime', () => {
  it('uniform maps 0 and last frame into duration', () => {
    const d = 1.0;
    expect(logicFrameToClipTime(0, 10, d, 'uniform')).toBe(0);
    const last = logicFrameToClipTime(9, 10, d, 'uniform');
    expect(last).toBeGreaterThan(0.8);
    expect(last).toBeLessThan(d);
  });

  it('truncate uses 60Hz sample index', () => {
    const d = 1.0; // 60 samples
    expect(logicFrameToClipTime(0, 13, d, 'truncate')).toBe(0);
    expect(logicFrameToClipTime(30, 13, d, 'truncate')).toBeCloseTo(12 / 60, 5);
  });
});

describe('visualFrameToClipTime §3.7.1', () => {
  it('maps 5LK-style timeline: logic 18 then residual toward 48', () => {
    const d = 48 / 60; // 0.8s
    expect(visualFrameToClipTime(0, d)).toBe(0);
    expect(visualFrameToClipTime(17, d)).toBeCloseTo(17 / 60, 5);
    expect(visualFrameToClipTime(18, d)).toBeCloseTo(18 / 60, 5);
    expect(visualFrameToClipTime(47, d)).toBeCloseTo(47 / 60, 5);
  });
});

describe('freeRunAnimDtSec', () => {
  it('advances one authored 60Hz sample per logic step', () => {
    expect(freeRunAnimDtSec(1)).toBeCloseTo(1 / 60, 5);
    expect(freeRunAnimDtSec(2)).toBeCloseTo(2 / 60, 5);
  });

  it('freezes when no logic steps (pause / waiting for accumulator)', () => {
    expect(freeRunAnimDtSec(0)).toBe(0);
  });

  it('halves wall-clock idle speed when logicFps experiment is 30', () => {
    // ~60 display Hz, logic 30 → average 0.5 steps/rAF → half free-run rate
    expect(freeRunAnimDtSec(0.5)).toBeCloseTo(0.5 / 60, 5);
    // one logic step every other display frame at 30Hz logic:
    expect(freeRunAnimDtSec(1) + freeRunAnimDtSec(0)).toBeCloseTo(1 / 60, 5);
  });

  it('respects timeScaleAnim and caps like blendWallDt', () => {
    expect(freeRunAnimDtSec(1, 2)).toBeCloseTo(2 / 60, 5);
    expect(freeRunAnimDtSec(120)).toBeCloseTo(0.1, 5);
  });
});

/** Light High Blade Kick MotionKey windows from MMDK. */
const BLADE_LK_REMAP = [
  { logicFrom: 0, logicTo: 3, motionFrom: 8, motionTo: 13 },
  { logicFrom: 3, logicTo: 13, motionFrom: 13, motionTo: 28 },
  { logicFrom: 13, logicTo: 20, motionFrom: 28, motionTo: 37 },
  { logicFrom: 20, logicTo: 79, motionFrom: 37, motionTo: 98 },
];

describe('remapLogicToMotionFrame (blade LK)', () => {
  it('skips early windup and accelerates startup', () => {
    expect(remapLogicToMotionFrame(0, BLADE_LK_REMAP)).toBeCloseTo(8, 5);
    // mid of first segment: logic 1.5 → motion 8+2.5
    expect(remapLogicToMotionFrame(1.5, BLADE_LK_REMAP)).toBeCloseTo(10.5, 5);
    // start of second segment
    expect(remapLogicToMotionFrame(3, BLADE_LK_REMAP)).toBeCloseTo(13, 5);
    // active-ish: logic 13 → motion 28
    expect(remapLogicToMotionFrame(13, BLADE_LK_REMAP)).toBeCloseTo(28, 5);
  });

  it('clamps past last segment to motion end', () => {
    expect(remapLogicToMotionFrame(79, BLADE_LK_REMAP)).toBeCloseTo(98, 5);
    expect(remapLogicToMotionFrame(200, BLADE_LK_REMAP)).toBeCloseTo(98, 5);
  });

  it('falls back to identity without segments', () => {
    expect(remapLogicToMotionFrame(12, null)).toBe(12);
    expect(remapLogicToMotionFrame(12, [])).toBe(12);
  });
});

describe('remapLogicToClipTime', () => {
  it('converts remapped motion frame at 60Hz into clip seconds', () => {
    const d = 98 / 60;
    expect(remapLogicToClipTime(0, BLADE_LK_REMAP, d)).toBeCloseTo(8 / 60, 5);
    expect(remapLogicToClipTime(13, BLADE_LK_REMAP, d)).toBeCloseTo(28 / 60, 5);
  });
});

describe('blade override animRemap parse', () => {
  it('loads LK/MK/HK remap tables from overrides', () => {
    for (const id of ['ryu_blade_lk', 'ryu_blade_mk', 'ryu_blade_hk'] as const) {
      const raw = JSON.parse(
        readFileSync(
          resolve(__dirname, `../../public/data/overrides/moves/${id}.json`),
          'utf8',
        ),
      );
      const m = parseMoveDefinition(raw);
      expect(m.animRemap?.length).toBeGreaterThan(0);
      expect(m.clipId).toBe('ryu_blade');
      expect(m.animFrameCount).toBe(m.mmdk?.fabFrame);
    }
  });
});

