import type { HistoryEntry } from '../input/InputHistory';
import type { CommandDef } from './CommandDef';
import type { Intent, NumpadDir } from '../types';

export type MotionMatchConfig = {
  motionStepGapMax: number;
};

/**
 * Collapse consecutive identical dirs (CritPoints: don't count held dir as multi steps).
 */
export function collapseDirs(
  entries: readonly HistoryEntry[],
): { dir: NumpadDir; logicFrame: number }[] {
  const out: { dir: NumpadDir; logicFrame: number }[] = [];
  for (const e of entries) {
    const last = out[out.length - 1];
    if (!last || last.dir !== e.relDir) {
      out.push({ dir: e.relDir, logicFrame: e.logicFrame });
    }
  }
  return out;
}

/**
 * Match motion steps newest-first with max gap between consecutive steps.
 * Intermediate junk directions allowed (Andrea leniency).
 */
export function matchMotion(
  collapsed: { dir: NumpadDir; logicFrame: number }[],
  motion: CommandDef['motion'],
  gapMax: number,
): { ok: boolean; completedAtFrame: number } {
  if (motion.length === 0) {
    const last = collapsed[collapsed.length - 1];
    return { ok: true, completedAtFrame: last?.logicFrame ?? 0 };
  }

  let searchFrom = collapsed.length - 1;
  let lastMatchedFrame: number | null = null;
  let completedAtFrame = 0;

  for (let step = motion.length - 1; step >= 0; step--) {
    const want = motion[step]!.dirs;
    let found = -1;
    for (let i = searchFrom; i >= 0; i--) {
      if (want.includes(collapsed[i]!.dir)) {
        found = i;
        break;
      }
    }
    if (found < 0) return { ok: false, completedAtFrame: 0 };

    const fr = collapsed[found]!.logicFrame;
    if (lastMatchedFrame !== null) {
      // lastMatchedFrame is newer; fr is older
      if (lastMatchedFrame - fr > gapMax) {
        return { ok: false, completedAtFrame: 0 };
      }
    } else {
      completedAtFrame = fr;
    }
    lastMatchedFrame = fr;
    searchFrom = found - 1;
  }

  return { ok: true, completedAtFrame };
}

function dirGateOk(cmd: CommandDef, relDir: NumpadDir): boolean {
  if (cmd.requireDirs && cmd.requireDirs.length > 0) {
    if (!cmd.requireDirs.includes(relDir)) return false;
  }
  if (cmd.forbidDirs && cmd.forbidDirs.length > 0) {
    if (cmd.forbidDirs.includes(relDir)) return false;
  }
  return true;
}

/**
 * Match one CommandDef against history.
 * Button-only normals use last-frame pressed edge + dir gates (replaces n_5lp hardcode).
 */
export function tryMatchCommand(
  entries: readonly HistoryEntry[],
  cmd: CommandDef,
  cfg: MotionMatchConfig,
): Intent | null {
  const collapsed = collapseDirs(entries);
  const gap = cfg.motionStepGapMax;
  const buttonGap = cmd.buttonGapMax ?? gap;

  let gateDir: NumpadDir = 5;

  if (cmd.motion.length > 0) {
    const m = matchMotion(collapsed, cmd.motion, gap);
    if (!m.ok) return null;
    if (cmd.buttonMask !== 0) {
      let buttonOk = false;
      let buttonDir: NumpadDir = 5;
      for (const e of entries) {
        if (e.logicFrame < m.completedAtFrame) continue;
        if (e.logicFrame - m.completedAtFrame > buttonGap) continue;
        if ((e.pressed & cmd.buttonMask) === cmd.buttonMask) {
          buttonOk = true;
          buttonDir = e.relDir;
          break;
        }
      }
      if (!buttonOk) return null;
      gateDir = buttonDir;
    } else {
      const last = entries[entries.length - 1];
      gateDir = last?.relDir ?? 5;
    }
  } else if (cmd.buttonMask !== 0) {
    const last = entries[entries.length - 1];
    if (!last || (last.pressed & cmd.buttonMask) !== cmd.buttonMask) {
      return null;
    }
    gateDir = last.relDir;
  } else {
    return null;
  }

  if (!dirGateOk(cmd, gateDir)) return null;

  return {
    kind: cmd.kind,
    moveId: cmd.moveId,
    priority: cmd.priority,
    bufferClass: cmd.bufferClass,
    commandId: cmd.id,
    airOnly: cmd.airOnly === true,
  };
}

/** True if dir still holds the same horizontal as dash target (4=back / 6=forward). */
function sharesDashHorizontal(d: NumpadDir, target: 4 | 6): boolean {
  if (target === 6) return d === 3 || d === 6 || d === 9;
  return d === 1 || d === 4 || d === 7;
}

/** True if dir holds the opposite horizontal of dash target. */
function isOppositeHorizontal(d: NumpadDir, target: 4 | 6): boolean {
  if (target === 6) return d === 1 || d === 4 || d === 7;
  return d === 3 || d === 6 || d === 9;
}

/**
 * Dash double-tap edge: second enter into dir (6 or 4) within window.
 * Plan: dual-edge on 6 / 4; fire on frame of second enter.
 *
 * "Enter" means leaving the target horizontal axis then pressing pure 6/4 again.
 * Holding 6 and tapping crouch (6→3→6) must NOT count — forward was never released.
 * Opposite horizontal (incl. diagonals 1/7 or 3/9) between the two taps cancels.
 */
export function detectDash(
  entries: readonly HistoryEntry[],
  now: number,
  dir: 4 | 6,
  dirHoldMax: number,
  neutralMax: number,
): boolean {
  const window = dirHoldMax + neutralMax;
  const enters: number[] = [];
  let prev: NumpadDir | null = null;
  for (const e of entries) {
    // Only count a fresh tap if the stick left that horizontal first (not 6↔3/9).
    if (
      e.relDir === dir &&
      (prev === null || !sharesDashHorizontal(prev, dir))
    ) {
      enters.push(e.logicFrame);
    }
    prev = e.relDir;
  }
  if (enters.length < 2) return false;
  const a = enters[enters.length - 2]!;
  const b = enters[enters.length - 1]!;
  if (b - a < 1 || b - a > window) return false;
  if (now - b > 0) return false;
  for (const e of entries) {
    if (e.logicFrame <= a || e.logicFrame >= b) continue;
    if (isOppositeHorizontal(e.relDir, dir)) return false;
  }
  return true;
}
