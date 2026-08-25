import { describe, expect, it } from 'vitest';
import {
  createPantsSessionState,
  formatPantsSessionMarkdown,
  startPantsSession,
  stopPantsSession,
  tickPantsSession,
} from '../../src/debug/pantsHealthSession';
import type { PantsHealthSnapshot } from '../../src/render/pants/pantsHealthTypes';

function snap(
  partial: Partial<PantsHealthSnapshot> & {
    status: PantsHealthSnapshot['status'];
    maxSeparation: number;
  },
): PantsHealthSnapshot {
  return {
    schemaVersion: 1,
    fighterId: 'p1',
    takenAtIso: new Date().toISOString(),
    meanSeparation: partial.maxSeparation,
    freeParticleCount: 1,
    fixedParticleCount: 0,
    maxConstraintError: 0,
    warpCountSession: 0,
    clampCountSession: 0,
    lastEvent: '',
    warnThreshold: 0.3,
    abnormalThreshold: 0.55,
    params: {
      pantsHardness: 0.12,
      pantsGravityPower: 1,
      pantsResistance: 0.82,
      pantsMaxSeparation: 0.55,
      pantsRootSlideLimit: 0.35,
      pantsRootRotateLimitDeg: 35,
    },
    ...partial,
  };
}

describe('pantsHealthSession', () => {
  it('records status changes and sparse snapshots between start and stop', () => {
    const state = createPantsSessionState();
    const t0 = 1000;
    startPantsSession(state, [snap({ status: 'ok', maxSeparation: 0.05 })], t0);
    expect(state.recording).toBe(true);
    expect(state.entries[0]?.kind).toBe('start');

    tickPantsSession(state, [snap({ status: 'ok', maxSeparation: 0.05 })], {
      nowMs: t0 + 100,
      sparseIntervalSec: 2.5,
      maxEntries: 1500,
    });
    // No status change, no sparse yet.
    expect(state.entries.filter((e) => e.kind === 'event')).toHaveLength(0);

    tickPantsSession(
      state,
      [snap({ status: 'abnormal', maxSeparation: 0.6, lastEvent: 'root-warp', warpCountSession: 1 })],
      { nowMs: t0 + 200, sparseIntervalSec: 2.5, maxEntries: 1500 },
    );
    expect(state.entries.some((e) => e.message.includes('状态'))).toBe(true);
    expect(state.entries.some((e) => e.message.includes('熔断'))).toBe(true);

    tickPantsSession(state, [snap({ status: 'ok', maxSeparation: 0.1 })], {
      nowMs: t0 + 3000,
      sparseIntervalSec: 2.5,
      maxEntries: 1500,
    });
    expect(state.entries.some((e) => e.kind === 'snapshot')).toBe(true);

    const stopped = stopPantsSession(
      state,
      [snap({ status: 'ok', maxSeparation: 0.08 })],
      t0 + 3500,
      1500,
    );
    expect(stopped).not.toBeNull();
    expect(stopped!.durationSec).toBeCloseTo(3.5, 2);
    expect(stopped!.entries.at(-1)?.kind).toBe('stop');
    expect(state.recording).toBe(false);

    const md = formatPantsSessionMarkdown({
      startedAtIso: 't0',
      stoppedAtIso: 't1',
      durationSec: stopped!.durationSec,
      entries: stopped!.entries,
      note: '测蹲跳',
    });
    expect(md).toContain('时间线');
    expect(md).toContain('测蹲跳');
  });
});
