/**
 * In-memory pants health session recording (start → stop → one file).
 * Key-change events + sparse snapshots to avoid log bloat.
 */
import type {
  PantsHealthSnapshot,
  PantsHealthStatus,
} from '../render/pants/pantsHealthTypes';
import { worsePantsHealthStatus } from '../render/pants/pantsHealthTypes';

export type PantsSessionEntryKind = 'start' | 'snapshot' | 'event' | 'stop';

export type PantsSessionEntry = {
  tRelSec: number;
  kind: PantsSessionEntryKind;
  message: string;
  /** Compact per-fighter lines for the report. */
  detail?: string;
};

export type PantsSessionRecorderState = {
  recording: boolean;
  startedAtMs: number;
  entries: PantsSessionEntry[];
  prevCombined: PantsHealthStatus | null;
  prevByFighter: Map<
    string,
    {
      status: PantsHealthStatus;
      lastEvent: string;
      warp: number;
      clamp: number;
    }
  >;
  peakMaxSeparation: number;
  lastSparseMs: number;
};

export function createPantsSessionState(): PantsSessionRecorderState {
  return {
    recording: false,
    startedAtMs: 0,
    entries: [],
    prevCombined: null,
    prevByFighter: new Map(),
    peakMaxSeparation: 0,
    lastSparseMs: 0,
  };
}

function combinedStatus(snaps: PantsHealthSnapshot[]): PantsHealthStatus {
  let s: PantsHealthStatus = snaps[0]?.status ?? 'disabled';
  for (const x of snaps) s = worsePantsHealthStatus(s, x.status);
  return s;
}

function peakSep(snaps: PantsHealthSnapshot[]): number {
  let m = 0;
  for (const s of snaps) if (s.maxSeparation > m) m = s.maxSeparation;
  return m;
}

function detailLines(snaps: PantsHealthSnapshot[]): string {
  return snaps
    .map(
      (s) =>
        `${s.fighterId}:${s.status} sep=${s.maxSeparation.toFixed(3)} ` +
        `warp=${s.warpCountSession} clamp=${s.clampCountSession}` +
        (s.lastEvent ? ` evt=${s.lastEvent}` : ''),
    )
    .join(' | ');
}

function pushCapped(
  state: PantsSessionRecorderState,
  entry: PantsSessionEntry,
  maxEntries: number,
): void {
  state.entries.push(entry);
  const max = Math.max(50, Math.floor(maxEntries));
  if (state.entries.length <= max) return;
  const drop = state.entries.length - max;
  // Keep the start marker when present; drop oldest body entries.
  if (state.entries[0]?.kind === 'start') {
    state.entries.splice(1, drop);
  } else {
    state.entries.splice(0, drop);
  }
}

export function startPantsSession(
  state: PantsSessionRecorderState,
  snaps: PantsHealthSnapshot[],
  nowMs: number,
): void {
  state.recording = true;
  state.startedAtMs = nowMs;
  state.entries = [];
  state.prevCombined = snaps.length ? combinedStatus(snaps) : null;
  state.prevByFighter = new Map();
  for (const s of snaps) {
    state.prevByFighter.set(s.fighterId, {
      status: s.status,
      lastEvent: s.lastEvent,
      warp: s.warpCountSession,
      clamp: s.clampCountSession,
    });
  }
  state.peakMaxSeparation = peakSep(snaps);
  state.lastSparseMs = nowMs;
  pushCapped(
    state,
    {
      tRelSec: 0,
      kind: 'start',
      message: '开始记录',
      detail: snaps.length ? detailLines(snaps) : '（尚无快照）',
    },
    10_000,
  );
}

/**
 * While recording: append key-change events and sparse snapshots.
 * Returns messages added this tick (for HUD flash optional).
 */
export function tickPantsSession(
  state: PantsSessionRecorderState,
  snaps: PantsHealthSnapshot[],
  opts: {
    nowMs: number;
    sparseIntervalSec: number;
    maxEntries: number;
  },
): string[] {
  if (!state.recording || snaps.length === 0) return [];
  const tRel = (opts.nowMs - state.startedAtMs) / 1000;
  const added: string[] = [];
  const combined = combinedStatus(snaps);
  const peak = peakSep(snaps);

  if (state.prevCombined !== null && combined !== state.prevCombined) {
    const msg = `状态 ${state.prevCombined} → ${combined}`;
    pushCapped(
      state,
      { tRelSec: tRel, kind: 'event', message: msg, detail: detailLines(snaps) },
      opts.maxEntries,
    );
    added.push(msg);
  }
  state.prevCombined = combined;

  for (const s of snaps) {
    const prev = state.prevByFighter.get(s.fighterId);
    if (!prev) {
      state.prevByFighter.set(s.fighterId, {
        status: s.status,
        lastEvent: s.lastEvent,
        warp: s.warpCountSession,
        clamp: s.clampCountSession,
      });
      continue;
    }
    if (s.lastEvent && s.lastEvent !== prev.lastEvent) {
      const msg = `${s.fighterId} 事件 ${s.lastEvent}`;
      pushCapped(
        state,
        { tRelSec: tRel, kind: 'event', message: msg, detail: detailLines(snaps) },
        opts.maxEntries,
      );
      added.push(msg);
    }
    if (s.warpCountSession > prev.warp) {
      const msg = `${s.fighterId} 熔断 +${s.warpCountSession - prev.warp}`;
      pushCapped(
        state,
        { tRelSec: tRel, kind: 'event', message: msg, detail: detailLines(snaps) },
        opts.maxEntries,
      );
      added.push(msg);
    }
    if (s.clampCountSession > prev.clamp) {
      const msg = `${s.fighterId} 夹紧 +${s.clampCountSession - prev.clamp}`;
      pushCapped(
        state,
        { tRelSec: tRel, kind: 'event', message: msg, detail: detailLines(snaps) },
        opts.maxEntries,
      );
      added.push(msg);
    }
    state.prevByFighter.set(s.fighterId, {
      status: s.status,
      lastEvent: s.lastEvent,
      warp: s.warpCountSession,
      clamp: s.clampCountSession,
    });
  }

  if (peak > state.peakMaxSeparation + 1e-4) {
    const msg = `最大偏离创新高 ${peak.toFixed(3)}`;
    state.peakMaxSeparation = peak;
    pushCapped(
      state,
      { tRelSec: tRel, kind: 'event', message: msg, detail: detailLines(snaps) },
      opts.maxEntries,
    );
    added.push(msg);
  }

  const sparseMs = Math.max(0.25, opts.sparseIntervalSec) * 1000;
  if (opts.nowMs - state.lastSparseMs >= sparseMs) {
    state.lastSparseMs = opts.nowMs;
    const msg = `稀疏快照 sep=${peak.toFixed(3)} status=${combined}`;
    pushCapped(
      state,
      { tRelSec: tRel, kind: 'snapshot', message: msg, detail: detailLines(snaps) },
      opts.maxEntries,
    );
    added.push(msg);
  }

  return added;
}

export function stopPantsSession(
  state: PantsSessionRecorderState,
  snaps: PantsHealthSnapshot[],
  nowMs: number,
  maxEntries: number,
): { durationSec: number; entries: PantsSessionEntry[] } | null {
  if (!state.recording) return null;
  const tRel = (nowMs - state.startedAtMs) / 1000;
  pushCapped(
    state,
    {
      tRelSec: tRel,
      kind: 'stop',
      message: '停止记录',
      detail: snaps.length ? detailLines(snaps) : undefined,
    },
    maxEntries,
  );
  const entries = state.entries.slice();
  const durationSec = tRel;
  state.recording = false;
  state.entries = [];
  state.prevCombined = null;
  state.prevByFighter.clear();
  state.peakMaxSeparation = 0;
  state.lastSparseMs = 0;
  state.startedAtMs = 0;
  return { durationSec, entries };
}

export function formatPantsSessionMarkdown(args: {
  startedAtIso: string;
  stoppedAtIso: string;
  durationSec: number;
  entries: PantsSessionEntry[];
  note?: string;
}): string {
  const lines: string[] = [
    `# 裤子监测会话`,
    '',
    `> AI 阅读提示：这是一次「开始～停止」会话。优先看 **event** 行与 status 变化；snapshot 为稀疏采样。`,
    '',
    `| 项 | 值 |`,
    `|----|----|`,
    `| 开始 | ${args.startedAtIso} |`,
    `| 结束 | ${args.stoppedAtIso} |`,
    `| 时长（秒） | ${args.durationSec.toFixed(2)} |`,
    `| 条目数 | ${args.entries.length} |`,
    '',
  ];
  if (args.note?.trim()) {
    lines.push(`备注：${args.note.trim()}`, '');
  }
  lines.push(`## 时间线`, '');
  for (const e of args.entries) {
    lines.push(
      `- \`t=${e.tRelSec.toFixed(2)}s\` **${e.kind}** ${e.message}` +
        (e.detail ? ` — \`${e.detail}\`` : ''),
    );
  }
  lines.push('');
  return lines.join('\n');
}
