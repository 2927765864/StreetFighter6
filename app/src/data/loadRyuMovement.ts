/**
 * Local movement table (consensus §3.10 / §6.7).
 * Source of truth: app/public/data/systems/ryu_movement.json
 */

import { buildFrontHeavyDashDx } from '../combat/loco/DashProfile';

export type WalkClipFrames = {
  start: number;
  loop: number;
  end: number;
};

export type RyuMovementTable = {
  characterId: string;
  retrieved: string;
  sources: { id: string; url: string; notes?: string }[];
  units: { logicSpace: string; frameHz: number };
  walk: {
    forwardSpeed: number;
    backSpeed: number;
    firstFrameSpeedScale: number;
    /**
     * Tail fraction of walk end when releasing during start (never loop).
     * Default 0.35 if omitted.
     */
    earlyReleaseEndKeepRatio?: number;
    /**
     * Presentation freeze on 4/6 press edge (§3.9.1.b). Default 4 if omitted.
     * 0 = off.
     */
    inputFreezeFrames?: number;
    notes?: string;
    clipLogicFrames: {
      walk_fwd: WalkClipFrames;
      walk_back: WalkClipFrames;
    };
  };
  dash: {
    forward: { frames: number; distance: number };
    back: { frames: number; distance: number };
    /** front_heavy | uniform (legacy) */
    profile?: string;
    frontHeavyPower?: number;
    approx?: string;
    notes?: string;
  };
  jump: {
    prejumpFrames: number;
    airFrames: number;
    landingFrames: number;
    apexHeight: number;
    forwardDistance: number;
    backDistance: number;
    neutralDistance: number;
    approx?: string;
  };
  stance?: {
    standToCrouchFrames: number;
    crouchToStandFrames: number;
    notes?: string;
  };
};

export const RYU_MOVEMENT_URL = '/data/systems/ryu_movement.json';

function finite(n: unknown, label: string): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new Error(`ryu_movement invalid number: ${label}`);
  }
  return n;
}

/** Parse + validate; throws if wiki-shaped numbers missing. */
export function parseRyuMovement(raw: unknown): RyuMovementTable {
  const o = raw as RyuMovementTable;
  if (!o || o.characterId !== 'ryu') {
    throw new Error('ryu_movement: characterId must be ryu');
  }
  finite(o.walk?.forwardSpeed, 'walk.forwardSpeed');
  finite(o.walk?.backSpeed, 'walk.backSpeed');
  finite(o.walk?.firstFrameSpeedScale, 'walk.firstFrameSpeedScale');
  if (
    o.walk?.earlyReleaseEndKeepRatio !== undefined &&
    o.walk?.earlyReleaseEndKeepRatio !== null
  ) {
    const r = finite(
      o.walk.earlyReleaseEndKeepRatio,
      'walk.earlyReleaseEndKeepRatio',
    );
    if (r <= 0 || r > 1) {
      throw new Error(
        'ryu_movement: walk.earlyReleaseEndKeepRatio must be in (0, 1]',
      );
    }
  }
  if (
    o.walk?.inputFreezeFrames !== undefined &&
    o.walk?.inputFreezeFrames !== null
  ) {
    const f = finite(o.walk.inputFreezeFrames, 'walk.inputFreezeFrames');
    if (f < 0 || f > 60) {
      throw new Error(
        'ryu_movement: walk.inputFreezeFrames must be in [0, 60]',
      );
    }
  }
  finite(o.walk?.clipLogicFrames?.walk_fwd?.start, 'walk_fwd.start');
  finite(o.walk?.clipLogicFrames?.walk_fwd?.loop, 'walk_fwd.loop');
  finite(o.walk?.clipLogicFrames?.walk_fwd?.end, 'walk_fwd.end');
  finite(o.walk?.clipLogicFrames?.walk_back?.start, 'walk_back.start');
  finite(o.walk?.clipLogicFrames?.walk_back?.loop, 'walk_back.loop');
  finite(o.walk?.clipLogicFrames?.walk_back?.end, 'walk_back.end');
  finite(o.dash?.forward?.frames, 'dash.forward.frames');
  finite(o.dash?.forward?.distance, 'dash.forward.distance');
  finite(o.dash?.back?.frames, 'dash.back.frames');
  finite(o.dash?.back?.distance, 'dash.back.distance');
  finite(o.jump?.prejumpFrames, 'jump.prejumpFrames');
  finite(o.jump?.airFrames, 'jump.airFrames');
  finite(o.jump?.landingFrames, 'jump.landingFrames');
  finite(o.jump?.apexHeight, 'jump.apexHeight');
  finite(o.jump?.forwardDistance, 'jump.forwardDistance');
  finite(o.jump?.backDistance, 'jump.backDistance');
  if (o.stance) {
    finite(o.stance.standToCrouchFrames, 'stance.standToCrouchFrames');
    finite(o.stance.crouchToStandFrames, 'stance.crouchToStandFrames');
  }
  return o;
}

/** Average |dx| per frame (for GUI / fallback). */
export function dashSpeedFromTable(
  dash: { frames: number; distance: number },
): number {
  const f = Math.max(1, dash.frames);
  return dash.distance / f;
}

export function dashFrontHeavyPower(t: RyuMovementTable): number {
  const p = t.dash.frontHeavyPower;
  return typeof p === 'number' && Number.isFinite(p) && p > 0 ? p : 1.5;
}

/** Per-frame |dx| tables; sum equals published distance. */
export function dashDxFromTable(t: RyuMovementTable): {
  dashDxFwd: number[];
  dashDxBack: number[];
} {
  const power = dashFrontHeavyPower(t);
  const profile = (t.dash.profile ?? 'front_heavy').toLowerCase();
  if (profile === 'uniform') {
    const uf = dashSpeedFromTable(t.dash.forward);
    const ub = dashSpeedFromTable(t.dash.back);
    return {
      dashDxFwd: Array.from({ length: t.dash.forward.frames }, () => uf),
      dashDxBack: Array.from({ length: t.dash.back.frames }, () => ub),
    };
  }
  return {
    dashDxFwd: buildFrontHeavyDashDx(
      t.dash.forward.frames,
      t.dash.forward.distance,
      power,
    ),
    dashDxBack: buildFrontHeavyDashDx(
      t.dash.back.frames,
      t.dash.back.distance,
      power,
    ),
  };
}

export async function fetchRyuMovement(
  url = RYU_MOVEMENT_URL,
): Promise<RyuMovementTable> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed ${url}: ${res.status}`);
  return parseRyuMovement(await res.json());
}

/** Apply table into MutableSimConfig-compatible partial. */
export function movementToSimDefaults(t: RyuMovementTable) {
  const { dashDxFwd, dashDxBack } = dashDxFromTable(t);
  const keep = t.walk.earlyReleaseEndKeepRatio;
  const freeze = t.walk.inputFreezeFrames;
  return {
    walkSpeed: t.walk.forwardSpeed,
    walkBackSpeed: t.walk.backSpeed,
    walkFirstFrameScale: t.walk.firstFrameSpeedScale,
    walkEarlyReleaseEndKeepRatio:
      typeof keep === 'number' && Number.isFinite(keep) && keep > 0 && keep <= 1
        ? keep
        : 0.35,
    walkInputFreezeFrames:
      typeof freeze === 'number' && Number.isFinite(freeze) && freeze >= 0
        ? Math.floor(freeze)
        : 4,
    dashFrames: t.dash.forward.frames,
    dashBackFrames: t.dash.back.frames,
    dashAnimFrames: 42,
    dashBackAnimFrames: 40,
    dashSpeed: dashSpeedFromTable(t.dash.forward),
    dashBackSpeed: dashSpeedFromTable(t.dash.back),
    dashFrontHeavyPower: dashFrontHeavyPower(t),
    dashDxFwd,
    dashDxBack,
    prejumpFrames: t.jump.prejumpFrames,
    airFrames: t.jump.airFrames,
    landingFrames: t.jump.landingFrames,
    jumpApex: t.jump.apexHeight,
    jumpFwdDist: t.jump.forwardDistance,
    jumpBackDist: t.jump.backDistance,
    jumpNeutralDist: t.jump.neutralDistance,
    standToCrouchFrames: t.stance?.standToCrouchFrames ?? 60,
    crouchToStandFrames: t.stance?.crouchToStandFrames ?? 38,
  };
}
