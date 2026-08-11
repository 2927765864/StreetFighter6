/**
 * Local movement table (consensus §3.10 / §6.7).
 * Source of truth: app/public/data/systems/ryu_movement.json
 */

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
    clipLogicFrames: {
      walk_fwd: WalkClipFrames;
      walk_back: WalkClipFrames;
    };
  };
  dash: {
    forward: { frames: number; distance: number };
    back: { frames: number; distance: number };
    approx?: string;
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
  return o;
}

/** dashSpeed = distance / frames (uniform approx, plan Step 0). */
export function dashSpeedFromTable(
  dash: { frames: number; distance: number },
): number {
  const f = Math.max(1, dash.frames);
  return dash.distance / f;
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
  return {
    walkSpeed: t.walk.forwardSpeed,
    walkBackSpeed: t.walk.backSpeed,
    walkFirstFrameScale: t.walk.firstFrameSpeedScale,
    dashFrames: t.dash.forward.frames,
    dashBackFrames: t.dash.back.frames,
    dashSpeed: dashSpeedFromTable(t.dash.forward),
    dashBackSpeed: dashSpeedFromTable(t.dash.back),
    prejumpFrames: t.jump.prejumpFrames,
    airFrames: t.jump.airFrames,
    landingFrames: t.jump.landingFrames,
    jumpApex: t.jump.apexHeight,
    jumpFwdDist: t.jump.forwardDistance,
    jumpBackDist: t.jump.backDistance,
    jumpNeutralDist: t.jump.neutralDistance,
  };
}
