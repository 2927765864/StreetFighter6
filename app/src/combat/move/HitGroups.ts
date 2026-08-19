import type { TimedBox } from './MoveDefinition';

export type HitGroupRange = {
  group: number;
  from: number;
  to: number;
};

function coveredFrames(boxes: TimedBox[]): number[] {
  const set = new Set<number>();
  for (const b of boxes) {
    const a = Math.min(b.from, b.to);
    const z = Math.max(b.from, b.to);
    for (let f = a; f <= z; f++) set.add(f);
  }
  return [...set].sort((x, y) => x - y);
}

function runsFromFrames(frames: number[]): Array<{ from: number; to: number }> {
  if (frames.length === 0) return [];
  const runs: Array<{ from: number; to: number }> = [];
  let from = frames[0]!;
  let prev = frames[0]!;
  for (let i = 1; i < frames.length; i++) {
    const f = frames[i]!;
    if (f === prev + 1) {
      prev = f;
      continue;
    }
    runs.push({ from, to: prev });
    from = f;
    prev = f;
  }
  runs.push({ from, to: prev });
  return runs;
}

/**
 * Hit groups = independent contacts. Each group can land once.
 * 1. Explicit `hitGroup` on boxes wins.
 * 2. Else disjoint time-runs of hit boxes (4HK: 9–14 then 19–22).
 * 3. If `hitCount` > run count (6HP one window, two hits), split covered
 *    frames evenly.
 */
export function hitGroupRanges(
  boxes: TimedBox[],
  hitCount: number,
  fallback?: { startup: number; active: number },
): HitGroupRange[] {
  const n = Number.isFinite(hitCount) && hitCount > 0 ? Math.floor(hitCount) : 1;
  const tagged = boxes.filter((b) => b.hitGroup != null && Number.isFinite(b.hitGroup));
  if (tagged.length > 0) {
    const by = new Map<number, { from: number; to: number }>();
    for (const b of tagged) {
      const g = Math.floor(Number(b.hitGroup));
      const a = Math.min(b.from, b.to);
      const z = Math.max(b.from, b.to);
      const cur = by.get(g);
      if (!cur) by.set(g, { from: a, to: z });
      else {
        cur.from = Math.min(cur.from, a);
        cur.to = Math.max(cur.to, z);
      }
    }
    return [...by.entries()]
      .sort((x, y) => x[0] - y[0])
      .map(([, r], i) => ({ group: i, from: r.from, to: r.to }));
  }

  let frames = coveredFrames(boxes);
  if (frames.length === 0 && fallback && fallback.active > 0) {
    const start = Math.max(0, fallback.startup - 1);
    const end = start + fallback.active - 1;
    for (let f = start; f <= end; f++) frames.push(f);
  }
  if (frames.length === 0) return [{ group: 0, from: 0, to: 0 }];

  const runs = runsFromFrames(frames);
  if (runs.length >= n) {
    return runs.map((r, i) => ({ group: i, from: r.from, to: r.to }));
  }

  const size = Math.max(1, Math.ceil(frames.length / n));
  const out: HitGroupRange[] = [];
  for (let i = 0; i < n; i++) {
    const chunk = frames.slice(i * size, (i + 1) * size);
    if (chunk.length === 0) break;
    out.push({ group: i, from: chunk[0]!, to: chunk[chunk.length - 1]! });
  }
  return out;
}

export function hitGroupAtFrame(ranges: HitGroupRange[], frame: number): number | null {
  let found: number | null = null;
  for (const r of ranges) {
    if (frame >= r.from && frame <= r.to) {
      if (found == null || r.group < found) found = r.group;
    }
  }
  return found;
}

export function lastHitGroupFrame(ranges: HitGroupRange[]): number {
  let m = 0;
  for (const r of ranges) if (r.to > m) m = r.to;
  return m;
}
