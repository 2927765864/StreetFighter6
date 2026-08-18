import type { HistoryEntry } from '../input/InputHistory';
import type { FighterPhase } from '../types';
import {
  detectDash,
  tryMatchCommand,
  type MotionMatchConfig,
} from './MotionMatcher';
import { CROUCH_DIRS, JUMP_DIRS, RYU_FEEDBACK_COMMANDS } from './ryuCommands';
import { INTENT_PRIORITY, type Intent, type NumpadDir } from '../types';
import type { CommandDef } from './CommandDef';

export type ResolveConfig = MotionMatchConfig & {
  dashDirHoldMax: number;
  dashNeutralMax: number;
};

export type ResolveContext = {
  /** P1 phase — gates airOnly vs ground attacks (consensus airborne rules). */
  phase: FighterPhase;
  /** Optional override command table (tests / debug). */
  commands?: readonly CommandDef[];
};

function commandAllowedInPhase(cmd: CommandDef, phase: FighterPhase): boolean {
  const attackLike = cmd.kind === 'normal' || cmd.kind === 'special';
  if (!attackLike) return true;
  if (cmd.airOnly) return phase === 'airborne';
  // Ground attacks: not while airborne (jump normals are airOnly)
  if (phase === 'airborne') return false;
  // Prejump: specials only (normals gated out here; specials stay)
  if (phase === 'prejump') return cmd.kind === 'special';
  return true;
}

/**
 * Collect candidates and pick highest priority (Andrea / consensus §1.5).
 * Specials checked before normals via priority numbers on CommandDef.
 */
export function resolveIntent(
  entries: readonly HistoryEntry[],
  now: number,
  cfg: ResolveConfig,
  ctx: ResolveContext = { phase: 'idle' },
): Intent {
  const candidates: Intent[] = [];
  const table = ctx.commands ?? RYU_FEEDBACK_COMMANDS;

  for (const cmd of table) {
    if (!commandAllowedInPhase(cmd, ctx.phase)) continue;
    const hit = tryMatchCommand(entries, cmd, cfg);
    if (hit) candidates.push(hit);
  }

  // Locomotion presentation only when already free on the ground.
  const groundFree =
    ctx.phase === 'idle' ||
    ctx.phase === 'walk' ||
    ctx.phase === 'crouch';

  // §2.3.1: detect jump/dash even in lock phases so action buffer can register.
  // Skip while already in prejump/dash (those moves own the phase).
  const detectJumpDash =
    ctx.phase !== 'prejump' && ctx.phase !== 'dash';

  if (detectJumpDash) {
    if (detectDash(entries, now, 6, cfg.dashDirHoldMax, cfg.dashNeutralMax)) {
      candidates.push({
        kind: 'dash_fwd',
        priority: INTENT_PRIORITY.dash,
        bufferClass: 'dash',
        commandId: 'dash_f',
      });
    }
    if (detectDash(entries, now, 4, cfg.dashDirHoldMax, cfg.dashNeutralMax)) {
      candidates.push({
        kind: 'dash_back',
        priority: INTENT_PRIORITY.dash,
        bufferClass: 'dash',
        commandId: 'dash_b',
      });
    }

    const last = entries[entries.length - 1];
    const rel: NumpadDir = last?.relDir ?? 5;

    // Hold-jump (§2.3.1): keeping 7/8/9 through air/land must rejump on canAct.
    // Edge-only detection dropped held-up through landing.
    if (
      (JUMP_DIRS as readonly number[]).includes(rel) &&
      (last?.pressed ?? 0) === 0
    ) {
      candidates.push({
        kind: 'jump',
        priority: INTENT_PRIORITY.jump,
        bufferClass: 'standard',
        commandId: 'jump',
      });
    }
  }

  if (candidates.length === 0) {
    const last = entries[entries.length - 1];
    const rel: NumpadDir = last?.relDir ?? 5;
    if (groundFree && (CROUCH_DIRS as readonly number[]).includes(rel)) {
      return {
        kind: 'crouch',
        priority: INTENT_PRIORITY.crouch,
        bufferClass: 'standard',
        commandId: 'crouch',
      };
    }
    if (groundFree && (rel === 4 || rel === 6)) {
      return {
        kind: 'walk',
        priority: INTENT_PRIORITY.walk,
        bufferClass: 'standard',
        commandId: rel === 6 ? 'walk_fwd' : 'walk_back',
      };
    }
    return {
      kind: 'none',
      priority: INTENT_PRIORITY.none,
      bufferClass: 'standard',
    };
  }

  candidates.sort((a, b) => b.priority - a.priority);
  return candidates[0]!;
}

export function pickHigher(a: Intent, b: Intent): Intent {
  return a.priority >= b.priority ? a : b;
}
