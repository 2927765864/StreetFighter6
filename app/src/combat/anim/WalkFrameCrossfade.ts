/**
 * §3.11.0 walk idle/start/end frame-unit pose blend (designated).
 * Loop clips do not blend with other loop clips. New clip always from frame 0.
 */

export type WalkXfadeRole = 'idle' | 'start' | 'end';

export type WalkXfadeFrameTable = {
  defaultFrames: number;
  idleStart: number;
  startEnd: number;
  endStart: number;
  endIdle: number;
  idleEnd: number;
  startIdle: number;
};

export const DEFAULT_WALK_XFADE_FRAMES = 5;

export function defaultWalkXfadeFrameTable(
  partial?: Partial<WalkXfadeFrameTable>,
): WalkXfadeFrameTable {
  const d = partial?.defaultFrames ?? DEFAULT_WALK_XFADE_FRAMES;
  return {
    defaultFrames: d,
    idleStart: partial?.idleStart ?? d,
    startEnd: partial?.startEnd ?? d,
    endStart: partial?.endStart ?? d,
    endIdle: partial?.endIdle ?? d,
    idleEnd: partial?.idleEnd ?? d,
    startIdle: partial?.startIdle ?? d,
  };
}

function bindingParts(bindingKey: string): { id: string; role: string } {
  const raw = bindingKey.toLowerCase();
  const [idPart, rolePart] = raw.split('::');
  return { id: idPart ?? raw, role: rolePart ?? 'main' };
}

/** Idle / walk start / walk end only. Walk loop is out of this scheme. */
export function walkXfadeRole(
  bindingKey: string | null | undefined,
): WalkXfadeRole | null {
  if (!bindingKey) return null;
  const { id, role } = bindingParts(bindingKey);
  if (id === 'idle' && (role === 'main' || role === 'loop' || !role)) {
    return 'idle';
  }
  const walk =
    id === 'walk' || id === 'walk_fwd' || id === 'walk_back' || id.startsWith('walk_');
  if (!walk) return null;
  if (role === 'start') return 'start';
  if (role === 'end') return 'end';
  return null;
}

export function isWalkXfadeEdge(
  fromKey: string | null | undefined,
  toKey: string,
): boolean {
  const from = walkXfadeRole(fromKey);
  const to = walkXfadeRole(toKey);
  return from != null && to != null && fromKey !== toKey;
}

export function walkXfadeEdgeFrames(
  from: WalkXfadeRole,
  to: WalkXfadeRole,
  table: WalkXfadeFrameTable,
): number {
  if (from === 'idle' && to === 'start') return table.idleStart;
  if (from === 'start' && to === 'end') return table.startEnd;
  if (from === 'end' && to === 'start') return table.endStart;
  if (from === 'end' && to === 'idle') return table.endIdle;
  if (from === 'idle' && to === 'end') return table.idleEnd;
  if (from === 'start' && to === 'idle') return table.startIdle;
  return table.defaultFrames;
}

/**
 * One-shot remaining includes the current frame. Looping from-clips use the
 * requested N (idle has no "end"). 0 remaining → no blend.
 */
export function walkXfadeWindowFrames(
  requestedN: number,
  fromRemainingFrames: number,
  fromLoops: boolean,
): number {
  const n = Math.max(0, Math.floor(requestedN));
  if (n <= 0) return 0;
  if (fromLoops) return n;
  return Math.min(n, Math.max(0, Math.floor(fromRemainingFrames)));
}

export function remainingAuthoredFrames(
  timeSec: number,
  durationSec: number,
  fps = 60,
): number {
  const dur = Math.max(0, durationSec);
  if (dur <= 1e-8) return 0;
  const total = Math.max(1, Math.round(dur * fps));
  const cur = Math.min(
    total - 1,
    Math.max(0, Math.floor(timeSec * fps + 1e-6)),
  );
  return Math.max(0, total - cur);
}

/** Blend frame i=1..window → to-weight i/window (linear). i=0 → 0. */
export function linearFrameToWeight(
  framesElapsed: number,
  windowFrames: number,
): number {
  if (windowFrames <= 0) return 1;
  return Math.min(1, Math.max(0, framesElapsed / windowFrames));
}
