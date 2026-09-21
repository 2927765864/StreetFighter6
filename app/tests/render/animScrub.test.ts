import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  accumulateHitstopPresentOffsetSec,
  accumulateHitstopPresentOffsetSecFromCurve,
  applyHitstopExitEaseLeadSec,
  clampHitstopAnimRate,
  freeRunAnimDtSec,
  freeRunAnimDtSecWithHitstop,
  freeRunAnimDtSecWithHitstopCurve,
  hitstopPresentDtSec,
  hitstopPresentDtSecFromCurve,
  logicFrameToClipTime,
  remapLogicToClipTime,
  remapLogicToMotionFrame,
  shouldClearHitstopPresentOffset,
  visualFrameToClipTime,
} from '../../src/render/AnimScrub';
import {
  createDefaultHitstopAnimRateCurve,
  hitstopExitEaseRate,
  hitstopProgress01,
  normalizeHitstopAnimRateCurve,
  resolveHitstopExitAnimRate,
  sampleHitstopAnimRateCurve,
} from '../../src/render/hitstopAnimRateCurve';
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

describe('hitstop presentation slow', () => {
  it('clamps hitstopAnimRate to [0, 1]', () => {
    expect(clampHitstopAnimRate(undefined)).toBe(0);
    expect(clampHitstopAnimRate(-1)).toBe(0);
    expect(clampHitstopAnimRate(0.08)).toBeCloseTo(0.08, 5);
    expect(clampHitstopAnimRate(2)).toBe(1);
  });

  it('hitstopPresentDtSec is free-run × rate (inherits 0.1s cap)', () => {
    expect(hitstopPresentDtSec(1, 0)).toBe(0);
    expect(hitstopPresentDtSec(1, 0.08)).toBeCloseTo((1 / 60) * 0.08, 5);
    // 13/60 > 0.1 cap inside freeRunAnimDtSec → 0.1 * 0.08
    expect(hitstopPresentDtSec(13, 0.08)).toBeCloseTo(0.1 * 0.08, 5);
  });

  it('freeRunAnimDtSecWithHitstop splits normal vs hitstop ticks', () => {
    // 2 normal + 3 hitstop @ 0.08
    const dt = freeRunAnimDtSecWithHitstop(5, 3, 0.08);
    expect(dt).toBeCloseTo(2 / 60 + (3 / 60) * 0.08, 5);
  });

  it('rate 0 freezes hitstop portion; rate 1 matches full free-run', () => {
    expect(freeRunAnimDtSecWithHitstop(4, 4, 0)).toBe(0);
    expect(freeRunAnimDtSecWithHitstop(4, 4, 1)).toBeCloseTo(4 / 60, 5);
    expect(freeRunAnimDtSecWithHitstop(4, 0, 0.08)).toBeCloseTo(4 / 60, 5);
  });

  it('accumulateHitstopPresentOffsetSec grows in hitstop and keeps after', () => {
    let lead = 0;
    lead = accumulateHitstopPresentOffsetSec(lead, 1, 0.08);
    lead = accumulateHitstopPresentOffsetSec(lead, 1, 0.08);
    expect(lead).toBeCloseTo((2 / 60) * 0.08, 5);
    // Leaving hitstop (0 ticks) must not snap lead back to 0.
    lead = accumulateHitstopPresentOffsetSec(lead, 0, 0.08);
    expect(lead).toBeCloseTo((2 / 60) * 0.08, 5);
  });

  it('flat curve × scale matches constant hitstopAnimRate', () => {
    const flat = createDefaultHitstopAnimRateCurve();
    const scale = 0.08;
    // 8f hitstop, consume all 8 ticks → timerAfter 0
    expect(
      hitstopPresentDtSecFromCurve(8, 8, 0, flat, scale),
    ).toBeCloseTo(hitstopPresentDtSec(8, scale), 5);
    expect(
      freeRunAnimDtSecWithHitstopCurve(8, 8, 8, 0, flat, scale),
    ).toBeCloseTo(freeRunAnimDtSecWithHitstop(8, 8, scale), 5);
  });

  it('ramp curve samples mid progress higher than start', () => {
    const ramp = normalizeHitstopAnimRateCurve([
      { t: 0, v: 0 },
      { t: 1, v: 1 },
    ]);
    expect(sampleHitstopAnimRateCurve(ramp, 0)).toBeCloseTo(0, 5);
    expect(sampleHitstopAnimRateCurve(ramp, 0.5)).toBeCloseTo(0.5, 5);
    expect(sampleHitstopAnimRateCurve(ramp, 1)).toBeCloseTo(1, 5);
    expect(hitstopProgress01(8, 8)).toBeCloseTo(0, 5);
    expect(hitstopProgress01(8, 1)).toBeCloseTo(7 / 8, 5);

    // First frozen frame only (timerBefore=8 → after=7): rate≈0
    expect(hitstopPresentDtSecFromCurve(1, 8, 7, ramp, 1)).toBeCloseTo(0, 5);
    // Last frozen frame (timerBefore=1 → after=0): rate≈7/8
    expect(hitstopPresentDtSecFromCurve(1, 8, 0, ramp, 1)).toBeCloseTo(
      (1 / 60) * (7 / 8),
      5,
    );
  });

  it('accumulate from curve keeps lead after hitstop ends', () => {
    const flat = createDefaultHitstopAnimRateCurve();
    let lead = 0;
    lead = accumulateHitstopPresentOffsetSecFromCurve(
      lead,
      1,
      8,
      7,
      flat,
      0.08,
    );
    lead = accumulateHitstopPresentOffsetSecFromCurve(
      lead,
      1,
      8,
      6,
      flat,
      0.08,
    );
    expect(lead).toBeCloseTo((2 / 60) * 0.08, 5);
    lead = accumulateHitstopPresentOffsetSecFromCurve(
      lead,
      0,
      8,
      0,
      flat,
      0.08,
    );
    expect(lead).toBeCloseTo((2 / 60) * 0.08, 5);
  });

  it('normalizeHitstopAnimRateCurve sorts, clamps, pads', () => {
    const pts = normalizeHitstopAnimRateCurve([
      { t: 1.5, v: 2 },
      { t: -0.2, v: 0.25 },
      { t: 0.5, v: 0.5 },
    ]);
    expect(pts[0]!.t).toBe(0);
    expect(pts[0]!.v).toBeCloseTo(0.25, 5);
    expect(pts.some((p) => p.t === 0.5 && p.v === 0.5)).toBe(true);
    expect(pts[pts.length - 1]!.t).toBe(1);
    expect(pts[pts.length - 1]!.v).toBe(1);
  });

  it('exit ease rate is midpoint of exit hitstop rate and 1', () => {
    expect(hitstopExitEaseRate(0)).toBeCloseTo(0.5, 5);
    expect(hitstopExitEaseRate(0.08)).toBeCloseTo((0.08 + 1) / 2, 5);
    expect(hitstopExitEaseRate(1)).toBeCloseTo(1, 5);
  });

  it('one exit-ease free-run step uses midpoint rate', () => {
    const flat = createDefaultHitstopAnimRateCurve();
    const scale = 0.08;
    const exitRate = resolveHitstopExitAnimRate(
      8,
      flat,
      scale,
      clampHitstopAnimRate,
    );
    expect(exitRate).toBeCloseTo(0.08, 5);
    const mid = hitstopExitEaseRate(exitRate);
    // 0 hitstop ticks + 1 normal with ease pending
    expect(
      freeRunAnimDtSecWithHitstopCurve(1, 0, 8, 0, flat, scale, 1, true),
    ).toBeCloseTo((1 / 60) * mid, 5);
    // Without pending: full speed
    expect(
      freeRunAnimDtSecWithHitstopCurve(1, 0, 8, 0, flat, scale, 1, false),
    ).toBeCloseTo(1 / 60, 5);
  });

  it('exit-ease lead shrink makes scrub net advance at midpoint', () => {
    const flat = createDefaultHitstopAnimRateCurve();
    const scale = 0.08;
    const mid = hitstopExitEaseRate(0.08);
    const lead = 0.05;
    const next = applyHitstopExitEaseLeadSec(lead, true, 8, flat, scale);
    // Logic +1/60, lead shrink (1-mid)/60 → net visual +(mid)/60
    const net = 1 / 60 + (next - lead);
    expect(net).toBeCloseTo(mid / 60, 5);
  });

  it('shouldClearHitstopPresentOffset: soft/restart/clip change vs same-clip hard', () => {
    expect(
      shouldClearHitstopPresentOffset({
        softBlend: true,
        prevCanon: 'ryu_5hp',
        nextCanon: 'idle',
      }),
    ).toBe(true);
    expect(
      shouldClearHitstopPresentOffset({
        softBlend: false,
        prevCanon: 'ryu_5hp',
        nextCanon: 'idle',
      }),
    ).toBe(true);
    expect(
      shouldClearHitstopPresentOffset({
        softBlend: false,
        prevCanon: 'ryu_tatsu',
        nextCanon: 'ryu_tatsu',
      }),
    ).toBe(false);
    expect(
      shouldClearHitstopPresentOffset({
        softBlend: false,
        prevCanon: 'hitstun_light',
        nextCanon: 'hitstun_light',
        forceRestart: true,
      }),
    ).toBe(true);
    // Same-move mash: view passes forceRestart after startMove bumps seq.
    expect(
      shouldClearHitstopPresentOffset({
        softBlend: false,
        prevCanon: 'ryu_5lp',
        nextCanon: 'ryu_5lp',
        forceRestart: true,
      }),
    ).toBe(true);
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

