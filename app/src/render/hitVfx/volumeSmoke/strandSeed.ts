/**
 * Strand (缕烟) seed layout for volume smoke.
 * Same spawnSeed + params → same strand set. Pure CPU; GPU only samples the result.
 */
import { mulberry32 } from './spawnSeed';
import type { VolumeSmokeSeedShape } from '../hitVfxTypes';

/** Hard cap for GPU strand buffer / editor count. */
export const MAX_STRANDS = 48;

export type Vec3 = { x: number; y: number; z: number };

/** 0 = uniform, 1 = cone (tip at t=0), 2 = spindle (thick mid). Baked into radii. */
export type StrandProfileId = 0 | 1 | 2;

export type StrandDesc = {
  p0: Vec3;
  p1: Vec3;
  p2: Vec3;
  r0: number;
  rMid: number;
  r1: number;
  profile: StrandProfileId;
};

export type StrandSeedParams = {
  strandMode: boolean;
  strandCount: number;
  strandLength: number;
  strandThickness: number;
  strandSpacing: number;
  strandTwistDeg: number;
  strandAngleJitterDeg: number;
  strandBend: number;
  strandEdgeSoftness: number;
  strandGapFill: number;
  strandRandomAmount: number;
  seedShape: VolumeSmokeSeedShape;
  shapeThickness: number;
  ringRadiusRatio: number;
  ringWidth: number;
  arcAngle: number;
  arrowAngle: number;
  arrowLength: number;
  columnHeight: number;
};

export type BuildStrandSetArgs = {
  params: StrandSeedParams;
  spawnSeed: number;
  centerUVW: Vec3;
  hitRadiusUVW: number;
  /** Local +Y axis in UVW (unit). */
  axis: Vec3;
  /** Local +X (tangent) in UVW (unit). */
  tangent: Vec3;
};

const STRAND_SEED_XOR = 0x51a7d01;

function v3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function add(a: Vec3, b: Vec3): Vec3 {
  return v3(a.x + b.x, a.y + b.y, a.z + b.z);
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return v3(a.x - b.x, a.y - b.y, a.z - b.z);
}

function scale(a: Vec3, s: number): Vec3 {
  return v3(a.x * s, a.y * s, a.z * s);
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return v3(
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x,
  );
}

function len(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

function norm(a: Vec3): Vec3 {
  const L = len(a);
  if (L < 1e-8) return v3(0, 1, 0);
  return scale(a, 1 / L);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Local extents in hitRadius units — must match seedShapeGizmo
 * (createSeedShapeGeometry uses these × hitRadius, with no extra caps).
 */
export function shapeLocalExtents(p: {
  shapeThickness?: number;
  ringRadiusRatio?: number;
  ringWidth?: number;
  columnHeight?: number;
  arrowLength?: number;
}): {
  thick: number;
  ringPeak: number;
  ringTube: number;
  columnHalf: number;
  arrowLen: number;
} {
  return {
    thick: Math.max(p.shapeThickness ?? 0.28, 0.01),
    ringPeak: Math.max(p.ringRadiusRatio ?? 0.65, 0.01),
    ringTube: Math.max(p.ringWidth ?? 0.22, 0.01),
    columnHalf: Math.max(p.columnHeight ?? 1.4, 0.05),
    arrowLen: Math.max(p.arrowLength ?? 1, 0.05),
  };
}

/** Rotate `v` around unit axis `ax` by radians. */
function rotateAround(v: Vec3, ax: Vec3, rad: number): Vec3 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const parallel = scale(ax, dot(v, ax));
  const lateral = sub(v, parallel);
  const third = cross(ax, lateral);
  return add(parallel, add(scale(lateral, c), scale(third, s)));
}

export function bezierPoint(p0: Vec3, p1: Vec3, p2: Vec3, t: number): Vec3 {
  const u = 1 - t;
  return add(
    add(scale(p0, u * u), scale(p1, 2 * u * t)),
    scale(p2, t * t),
  );
}

function pickProfile(rng: () => number): StrandProfileId {
  const u = rng();
  if (u < 0.34) return 0;
  if (u < 0.67) return 1;
  return 2;
}

function radiiForProfile(
  baseR: number,
  profile: StrandProfileId,
  rng: () => number,
): { r0: number; rMid: number; r1: number } {
  const jitter = 0.12;
  const j = () => 1 + (rng() * 2 - 1) * jitter;
  if (profile === 0) {
    const r = baseR * j();
    return { r0: r, rMid: r * (0.95 + rng() * 0.1), r1: r * j() };
  }
  if (profile === 1) {
    // Tip at t=0
    const tip = baseR * (0.12 + rng() * 0.12) * j();
    const fat = baseR * (1.05 + rng() * 0.2) * j();
    return { r0: tip, rMid: (tip + fat) * 0.55, r1: fat };
  }
  // Spindle
  const end = baseR * (0.2 + rng() * 0.2) * j();
  const mid = baseR * (1.1 + rng() * 0.25) * j();
  return { r0: end, rMid: mid, r1: end * (0.85 + rng() * 0.3) };
}

function resolveCount(base: number, randAmt: number, rng: () => number): number {
  const wobble = randAmt > 0 ? (rng() * 2 - 1) * 0.2 * randAmt : 0;
  return clamp(Math.round(base * (1 + wobble)), 1, MAX_STRANDS);
}

type Frame = { axis: Vec3; tangent: Vec3; bitangent: Vec3 };

function makeFrame(axisIn: Vec3, tangentIn: Vec3): Frame {
  const axis = norm(axisIn);
  let tangent = norm(tangentIn);
  // Re-orthogonalize
  tangent = norm(sub(tangent, scale(axis, dot(tangent, axis))));
  if (len(tangent) < 1e-4) {
    const helper =
      Math.abs(axis.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0);
    tangent = norm(cross(helper, axis));
  }
  // +Z matches the seed gizmo: tangent × axis (X × Y). Shader uses the same.
  const bitangent = norm(cross(tangent, axis));
  return { axis, tangent, bitangent };
}

function localToUvw(center: Vec3, axis: Vec3, tangent: Vec3, bitangent: Vec3, local: Vec3, r: number): Vec3 {
  return add(
    center,
    add(
      scale(tangent, local.x * r),
      add(scale(axis, local.y * r), scale(bitangent, local.z * r)),
    ),
  );
}

/**
 * How far out (local hitRadius units) midpoints should reach.
 * Always near the shell so few strands still span the shape; spacing only nudges.
 */
function fillRadiusFromSpacing(strandSpacing: number): number {
  return clamp(0.9 + (Math.max(0.02, strandSpacing) - 0.22) * 0.2, 0.75, 0.98);
}

/**
 * Pack `count` points into a disk of radius `fillR`.
 * Vogel sunflower: outermost near `fillR`; low count → large gaps, still spans the disk.
 */
function packDiskFill(
  count: number,
  fillR: number,
): Array<{ u: number; v: number }> {
  const out: Array<{ u: number; v: number }> = [];
  if (count <= 0) return out;
  if (count === 1) return [{ u: 0, v: 0 }];
  if (count === 2) {
    return [
      { u: -fillR, v: 0 },
      { u: fillR, v: 0 },
    ];
  }
  if (count === 3) {
    for (let i = 0; i < 3; i++) {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
      out.push({ u: Math.cos(ang) * fillR, v: Math.sin(ang) * fillR });
    }
    return out;
  }
  // Vogel / sunflower — radius grows so the last point sits on fillR.
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const rad = fillR * Math.sqrt((i + 0.5) / count);
    const ang = i * golden;
    out.push({ u: Math.cos(ang) * rad, v: Math.sin(ang) * rad });
  }
  return out;
}

type VolumeSlot = { u: number; v: number; along: number };

/**
 * Pack midpoints through a cylinder volume: cross-section disk × along-axis layers.
 * Always spans full height and near-full radius when count ≥ 2.
 */
function packCylinderFill(
  count: number,
  fillR: number,
  alongHalf: number,
): VolumeSlot[] {
  if (count <= 0) return [];
  if (count === 1) return [{ u: 0, v: 0, along: 0 }];

  const height = Math.max(1e-4, alongHalf * 2);
  const diameter = Math.max(1e-4, fillR * 2);
  const aspect = height / diameter;
  let nLayers = Math.max(
    1,
    Math.min(
      count,
      Math.round(Math.cbrt(count) * Math.sqrt(Math.max(aspect, 0.35))),
    ),
  );
  if (count >= 2 && alongHalf > 0.04) nLayers = Math.max(2, nLayers);
  if (count >= 5 && alongHalf > 0.12) nLayers = Math.max(3, nLayers);
  if (count >= 10 && alongHalf > 0.2) nLayers = Math.max(4, nLayers);
  nLayers = Math.min(nLayers, count);

  const slots: VolumeSlot[] = [];
  let remaining = count;
  for (let layer = 0; layer < nLayers; layer++) {
    const nThis =
      layer === nLayers - 1
        ? remaining
        : Math.max(1, Math.round(remaining / (nLayers - layer)));
    remaining -= nThis;
    const along =
      nLayers === 1 ? 0 : -alongHalf + (layer / (nLayers - 1)) * (alongHalf * 2);
    const disk = packDiskFill(nThis, fillR);
    for (const d of disk) {
      slots.push({ u: d.u, v: d.v, along });
    }
  }
  return slots.slice(0, count);
}

type ArmSlot = { s: number; y: number; w: number };

/**
 * Pack slots inside one arrow-arm box: along length × thickness × width.
 * Always spans nearly the full arm length when count ≥ 1.
 */
function packArmFill(
  count: number,
  armLen: number,
  halfY: number,
  halfW: number,
  fill: number,
): ArmSlot[] {
  if (count <= 0) return [];
  const s0 = armLen * 0.1;
  const s1 = armLen * 0.9;
  const yH = halfY * fill;
  const wH = halfW * fill;
  if (count === 1) return [{ s: (s0 + s1) * 0.5, y: 0, w: 0 }];

  const spanS = Math.max(1e-4, s1 - s0);
  const spanY = Math.max(1e-4, yH * 2);
  const spanW = Math.max(1e-4, wH * 2);
  const vol = spanS * spanY * spanW;
  // Prefer spanning length first (arms are long thin boxes).
  let nAlong = Math.max(
    1,
    Math.min(count, Math.round(Math.cbrt(count * (spanS * spanS) / Math.max(vol, 1e-8)))),
  );
  if (count >= 2) nAlong = Math.max(2, nAlong);
  nAlong = Math.min(nAlong, count);

  // Along-first so both tip and tip-far end of the arm are used.
  const slots: ArmSlot[] = [];
  let remaining = count;
  for (let ia = 0; ia < nAlong; ia++) {
    const nThis =
      ia === nAlong - 1
        ? remaining
        : Math.max(1, Math.round(remaining / (nAlong - ia)));
    remaining -= nThis;
    const s =
      nAlong === 1 ? (s0 + s1) * 0.5 : s0 + (ia / (nAlong - 1)) * (s1 - s0);
    const disk = packDiskFill(nThis, 1);
    for (const d of disk) {
      slots.push({ s, y: d.v * yH, w: d.u * wH });
    }
  }
  return slots.slice(0, count);
}

function makeBentStrand(opts: {
  mid: Vec3;
  dir: Vec3;
  halfLen: number;
  bend: number;
  bendDir: Vec3;
  baseR: number;
  profile: StrandProfileId;
  rng: () => number;
  randAmt: number;
}): StrandDesc {
  const dir = norm(opts.dir);
  const half =
    opts.halfLen * (1 + (opts.rng() * 2 - 1) * 0.18 * opts.randAmt);
  const p0 = add(opts.mid, scale(dir, -half));
  const p2 = add(opts.mid, scale(dir, half));
  // Keep default bend rope-like: old (0.55..1.05)*half made a single strand
  // look like a cup/C even at count=1. Strong bend still available via UI.
  const bendAmp = opts.bend * half * (0.18 + opts.rng() * 0.22);
  const side = norm(
    add(
      opts.bendDir,
      scale(cross(dir, opts.bendDir), (opts.rng() * 2 - 1) * 0.4),
    ),
  );
  const p1 = add(opts.mid, scale(side, bendAmp * (opts.rng() < 0.5 ? 1 : -1)));
  const thick =
    opts.baseR * (1 + (opts.rng() * 2 - 1) * 0.22 * opts.randAmt);
  const { r0, rMid, r1 } = radiiForProfile(Math.max(1e-5, thick), opts.profile, opts.rng);
  return { p0, p1, p2, r0, rMid, r1, profile: opts.profile };
}

/**
 * Parallel ropes. `alongLocal` = strand direction in shape-local space.
 * `alongHalf` > 0 spreads midpoints along that axis (column / thick sphere);
 * `alongHalf` ≈ 0 keeps them in one cross-section (disk).
 */
function buildParallelBundle(
  args: BuildStrandSetArgs,
  frame: Frame,
  count: number,
  rng: () => number,
  alongLocal: Vec3,
  opts: { alongHalf?: number; radialFill?: number } = {},
): StrandDesc[] {
  const p = args.params;
  const r = Math.max(1e-5, args.hitRadiusUVW);
  const fillR = opts.radialFill ?? fillRadiusFromSpacing(p.strandSpacing);
  const alongHalf = Math.max(0, opts.alongHalf ?? 0);
  const slots =
    alongHalf > 1e-4
      ? packCylinderFill(count, fillR, alongHalf)
      : packDiskFill(count, fillR).map((d) => ({ ...d, along: 0 }));

  const twist = (p.strandTwistDeg * Math.PI) / 180;
  const jitterAmp = (p.strandAngleJitterDeg * Math.PI) / 180;
  const strands: StrandDesc[] = [];
  // Honor strandLength only — do not floor to layerGap (that made the slider
  // look broken: all ropes shared the same cover length).
  const paramHalf = 0.5 * clamp(p.strandLength, 0.02, 2.5);
  const along = norm(alongLocal);
  const helper =
    Math.abs(along.y) < 0.85 ? v3(0, 1, 0) : v3(1, 0, 0);
  const crossA = norm(cross(along, helper));
  const crossB = norm(cross(along, crossA));

  for (let i = 0; i < count; i++) {
    const off = slots[i] ?? { u: 0, v: 0, along: 0 };
    const jitterU = (rng() * 2 - 1) * 0.04 * p.strandRandomAmount * fillR;
    const jitterV = (rng() * 2 - 1) * 0.04 * p.strandRandomAmount * fillR;
    const jitterA =
      alongHalf > 0
        ? (rng() * 2 - 1) * 0.04 * p.strandRandomAmount * alongHalf
        : 0;
    let alongPos = off.along + jitterA;
    let halfLocal = paramHalf;
    if (alongHalf > 1e-4) {
      halfLocal = Math.min(paramHalf, alongHalf * 0.98);
      // Pull mid inward instead of collapsing end-layer length to ~0.
      const overflow = Math.abs(alongPos) + halfLocal - alongHalf;
      if (overflow > 0) {
        const s = alongPos < 0 ? -1 : 1;
        alongPos = s * Math.max(0, alongHalf - halfLocal);
      }
    }
    const localMid = add(
      add(scale(crossA, off.u + jitterU), scale(crossB, off.v + jitterV)),
      scale(along, alongPos),
    );

    let dirLocal = along;
    const twistI = twist + (rng() * 2 - 1) * jitterAmp * p.strandRandomAmount;
    const perp = norm(cross(along, v3(0.2, 0.7, 0.1)));
    dirLocal = rotateAround(dirLocal, perp, twistI * 0.35);
    dirLocal = rotateAround(dirLocal, along, twistI);

    const mid = localToUvw(
      args.centerUVW,
      frame.axis,
      frame.tangent,
      frame.bitangent,
      localMid,
      r,
    );
    const dirW = add(
      add(scale(frame.tangent, dirLocal.x), scale(frame.axis, dirLocal.y)),
      scale(frame.bitangent, dirLocal.z),
    );
    const bendDir = norm(
      cross(dirW, add(frame.bitangent, scale(frame.tangent, rng() - 0.5))),
    );
    strands.push(
      makeBentStrand({
        mid,
        dir: dirW,
        halfLen: halfLocal * r,
        bend: p.strandBend,
        bendDir,
        baseR: Math.max(1e-5, p.strandThickness * r),
        profile: pickProfile(rng),
        rng,
        randAmt: p.strandRandomAmount,
      }),
    );
  }
  return strands;
}

type TorusSlot = { ang: number; rhoOff: number; yOff: number };

/**
 * Pack slots along an arc/ring tube: angle span × tube cross-section (radial × thickness).
 * Few strands → large angular gaps, but still reach both ends of the arc.
 */
function packTorusFill(
  count: number,
  angleStart: number,
  angleEnd: number,
  tubeHalfR: number,
  tubeHalfY: number,
  fill: number,
): TorusSlot[] {
  if (count <= 0) return [];
  const span = angleEnd - angleStart;
  const a0 = angleStart + span * 0.06;
  const a1 = angleEnd - span * 0.06;
  const useSpan = Math.max(1e-4, a1 - a0);
  const rH = tubeHalfR * fill;
  const yH = tubeHalfY * fill;

  if (count === 1) {
    return [{ ang: (a0 + a1) * 0.5, rhoOff: 0, yOff: 0 }];
  }

  // Prefer spanning the long arc direction first.
  const arcLen = useSpan; // radians as “length” weight
  const cross = Math.max(1e-4, (rH * 2) * (yH * 2));
  let nAlong = Math.max(
    1,
    Math.min(
      count,
      Math.round(Math.cbrt(count * (arcLen * arcLen) / Math.max(cross, 1e-8))),
    ),
  );
  if (count >= 2) nAlong = Math.max(2, nAlong);
  const minAlong = Math.min(count, Math.max(2, Math.round(useSpan / 0.45)));
  nAlong = Math.max(nAlong, minAlong);
  nAlong = Math.min(nAlong, count);

  // Along-first: every angular station is used, then pack tube cross-section.
  const slots: TorusSlot[] = [];
  let remaining = count;
  for (let ia = 0; ia < nAlong; ia++) {
    const nThis =
      ia === nAlong - 1
        ? remaining
        : Math.max(1, Math.round(remaining / (nAlong - ia)));
    remaining -= nThis;
    const ang =
      nAlong === 1 ? (a0 + a1) * 0.5 : a0 + (ia / (nAlong - 1)) * (a1 - a0);
    const disk = packDiskFill(nThis, 1);
    for (const d of disk) {
      slots.push({ ang, rhoOff: d.u * rH, yOff: d.v * yH });
    }
  }
  return slots.slice(0, count);
}

function torusLocal(rho: number, y: number, ang: number): Vec3 {
  return v3(rho * Math.cos(ang), y, rho * Math.sin(ang));
}

/**
 * Quadratic that stays on the torus (not a straight chord through the hole).
 * Control point uses the standard circular-arc fit: ρ / cos(δ).
 */
function makeArcTubeStrand(opts: {
  rho: number;
  y: number;
  midAng: number;
  halfAng: number;
  bend: number;
  rng: () => number;
  randAmt: number;
  baseR: number;
  profile: StrandProfileId;
  frame: Frame;
  center: Vec3;
  r: number;
}): StrandDesc {
  const δ = clamp(opts.halfAng, 0.012, 0.55);
  const a0 = opts.midAng - δ;
  const a1 = opts.midAng + δ;
  const p0l = torusLocal(opts.rho, opts.y, a0);
  const p2l = torusLocal(opts.rho, opts.y, a1);
  const c = Math.cos(δ);
  const p1rho = c > 0.2 ? opts.rho / c : opts.rho * 1.35;
  const yJ =
    opts.y +
    (opts.rng() * 2 - 1) * 0.08 * opts.randAmt * Math.max(0.02, Math.abs(opts.y) + 0.05);
  const p1l = torusLocal(
    p1rho * (1 + (opts.rng() * 2 - 1) * 0.04 * opts.randAmt),
    yJ,
    opts.midAng,
  );
  // Extra out-of-plane bulge (axis) — small, keeps the rope in the tube.
  p1l.y += (opts.rng() * 2 - 1) * opts.bend * δ * opts.rho * 0.25;
  const toUvw = (local: Vec3) =>
    localToUvw(
      opts.center,
      opts.frame.axis,
      opts.frame.tangent,
      opts.frame.bitangent,
      local,
      opts.r,
    );
  const { r0, rMid, r1 } = radiiForProfile(
    Math.max(1e-5, opts.baseR),
    opts.profile,
    opts.rng,
  );
  return {
    p0: toUvw(p0l),
    p1: toUvw(p1l),
    p2: toUvw(p2l),
    r0,
    rMid,
    r1,
    profile: opts.profile,
  };
}

/**
 * Ring / arc: ropes follow the torus tube (gizmo). Slots span the full angle
 * and pack the tube cross-section so few strands still cover the shape.
 * Each rope is a *curved* tube segment — never a chord through the arc's hole.
 */
function buildRingLike(
  args: BuildStrandSetArgs,
  frame: Frame,
  count: number,
  rng: () => number,
  angleStart: number,
  angleEnd: number,
): StrandDesc[] {
  const p = args.params;
  const r = Math.max(1e-5, args.hitRadiusUVW);
  const ext = shapeLocalExtents(p);
  const ringPeak = ext.ringPeak;
  const tubeHalfR = ext.ringTube;
  const tubeHalfY = ext.thick;
  const fill = fillRadiusFromSpacing(p.strandSpacing);
  const twist = (p.strandTwistDeg * Math.PI) / 180;
  const ropeFrac = clamp(p.strandLength, 0.02, 1.25);
  const strands: StrandDesc[] = [];

  const slots = packTorusFill(
    count,
    angleStart + twist * 0.05,
    angleEnd + twist * 0.05,
    tubeHalfR,
    tubeHalfY,
    fill,
  );
  const span = Math.max(1e-4, angleEnd - angleStart);

  for (let i = 0; i < count; i++) {
    const sl = slots[i] ?? {
      ang: (angleStart + angleEnd) * 0.5,
      rhoOff: 0,
      yOff: 0,
    };
    const rho = Math.max(0.05, ringPeak + sl.rhoOff);
    const roomLo = sl.ang - angleStart;
    const roomHi = angleEnd - sl.ang;
    // Arc half-angle from strandLength only (fraction of shape span).
    const layoutHalf = 0.5 * ropeFrac * span;
    const halfAng = clamp(
      Math.min(layoutHalf, Math.min(roomLo, roomHi) * 0.9, 0.5),
      0.012,
      0.5,
    );
    strands.push(
      makeArcTubeStrand({
        rho,
        y: sl.yOff,
        midAng: sl.ang,
        halfAng,
        bend: p.strandBend,
        rng,
        randAmt: p.strandRandomAmount,
        baseR: Math.max(1e-5, p.strandThickness * r),
        profile: pickProfile(rng),
        frame,
        center: args.centerUVW,
        r,
      }),
    );
  }
  return strands;
}

/**
 * Fill both ">" arms like the gizmo boxes:
 * tip at origin, dir = (-cos(half), 0, ±sin(half)) in gizmo local XYZ.
 * Slots span arm length × thickness × width so few strands still cover the arms.
 */
function buildArrowStrands(
  args: BuildStrandSetArgs,
  frame: Frame,
  count: number,
  rng: () => number,
): StrandDesc[] {
  const p = args.params;
  const r = Math.max(1e-5, args.hitRadiusUVW);
  const halfOpen = clamp(p.arrowAngle, 5, 179) * 0.5 * (Math.PI / 180);
  const ext = shapeLocalExtents(p);
  const armLen = ext.arrowLen;
  const c = Math.cos(halfOpen);
  const s = Math.sin(halfOpen);
  const armDirs = [v3(-c, 0, s), v3(-c, 0, -s)];
  const halfY = ext.thick;
  const halfW = ext.ringTube;
  const fill = fillRadiusFromSpacing(p.strandSpacing);
  const jitterAmp = (p.strandAngleJitterDeg * Math.PI) / 180;
  const twist = (p.strandTwistDeg * Math.PI) / 180;
  const ropeFrac = clamp(p.strandLength, 0.02, 1.25);
  const strands: StrandDesc[] = [];

  const nU = Math.ceil(count / 2);
  const nL = count - nU;
  const perArm = [nU, nL];

  for (let a = 0; a < 2; a++) {
    const n = perArm[a]!;
    if (n <= 0) continue;
    const dirU = armDirs[a]!;
    const perp = v3(-dirU.z, 0, dirU.x);
    const slots = packArmFill(n, armLen, halfY, halfW, fill);
    for (let i = 0; i < n; i++) {
      const sl = slots[i] ?? { s: armLen * 0.5, y: 0, w: 0 };
      const localMid = add(
        add(scale(dirU, sl.s), v3(0, sl.y, 0)),
        scale(perp, sl.w),
      );
      const twisted = rotateAround(localMid, dirU, twist * 0.15);
      const mid = localToUvw(
        args.centerUVW,
        frame.axis,
        frame.tangent,
        frame.bitangent,
        twisted,
        r,
      );
      let dirLocal = dirU;
      dirLocal = rotateAround(
        dirLocal,
        v3(0, 1, 0),
        (rng() * 2 - 1) * jitterAmp * p.strandRandomAmount * 0.35,
      );
      const dirW = add(
        add(scale(frame.tangent, dirLocal.x), scale(frame.axis, dirLocal.y)),
        scale(frame.bitangent, dirLocal.z),
      );
      const paramHalf = 0.5 * ropeFrac * armLen;
      const roomTip = sl.s;
      const roomEnd = armLen - sl.s;
      const half =
        Math.min(paramHalf, Math.max(1e-4, Math.min(roomTip, roomEnd) * 0.95)) *
        r;
      strands.push(
        makeBentStrand({
          mid,
          dir: dirW,
          halfLen: half,
          bend: p.strandBend * 0.4,
          bendDir: frame.axis,
          baseR: Math.max(1e-5, p.strandThickness * r),
          profile: pickProfile(rng),
          rng,
          randAmt: p.strandRandomAmount,
        }),
      );
    }
  }
  return strands;
}

/**
 * Build strand descriptors in UVW. Empty when strandMode is off.
 */
export function buildStrandSet(args: BuildStrandSetArgs): StrandDesc[] {
  const p = args.params;
  if (!p.strandMode) return [];

  const rng = mulberry32((args.spawnSeed ^ STRAND_SEED_XOR) >>> 0);
  // Warm a few draws so amount=0 still stable path when we skip wobble
  const count = resolveCount(p.strandCount, p.strandRandomAmount, rng);
  const frame = makeFrame(args.axis, args.tangent);
  const shape = p.seedShape || 'sphere';

  if (shape === 'ring') {
    return buildRingLike(args, frame, count, rng, -Math.PI, Math.PI);
  }
  if (shape === 'arc') {
    const half = clamp(p.arcAngle, 1, 360) * 0.5 * (Math.PI / 180);
    return buildRingLike(args, frame, count, rng, -half, half);
  }
  if (shape === 'arrow') {
    return buildArrowStrands(args, frame, count, rng);
  }
  if (shape === 'disk') {
    // Strands run in-plane (+X); midpoints span disk diameter (+Z) and thin thickness (+Y).
    return buildDiskBundle(args, frame, count, rng);
  }
  if (shape === 'column') {
    const h = shapeLocalExtents(p).columnHalf;
    const fillR = fillRadiusFromSpacing(p.strandSpacing);
    // Spread midpoints through the full column height, not a single mid-plane slice.
    return buildParallelBundle(args, frame, count, rng, v3(0, 1, 0), {
      radialFill: fillR,
      alongHalf: h * 0.88,
    });
  }
  // sphere: fill a ball-ish volume — radial disk + some along-axis layers
  {
    const fillR = fillRadiusFromSpacing(p.strandSpacing);
    return buildParallelBundle(args, frame, count, rng, v3(0, 1, 0), {
      radialFill: fillR,
      alongHalf: fillR * 0.75,
    });
  }
}

/** Disk: strands run in-plane (+X); mids span diameter (+Z) and thickness (+Y). */
function buildDiskBundle(
  args: BuildStrandSetArgs,
  frame: Frame,
  count: number,
  rng: () => number,
): StrandDesc[] {
  const p = args.params;
  const fillR = fillRadiusFromSpacing(p.strandSpacing);
  const thickHalf = clamp(p.shapeThickness, 0.05, 1) * 0.5;
  const r = Math.max(1e-5, args.hitRadiusUVW);
  const twist = (p.strandTwistDeg * Math.PI) / 180;
  const jitterAmp = (p.strandAngleJitterDeg * Math.PI) / 180;
  const halfLen = 0.5 * clamp(p.strandLength, 0.02, 2.5);
  const strands: StrandDesc[] = [];

  let nThick = 1;
  if (count >= 4 && thickHalf > 0.06) nThick = 2;
  if (count >= 8 && thickHalf > 0.1) nThick = Math.min(3, count);
  let remaining = count;
  for (let layer = 0; layer < nThick; layer++) {
    const nThis =
      layer === nThick - 1
        ? remaining
        : Math.max(1, Math.round(remaining / (nThick - layer)));
    remaining -= nThis;
    const y =
      nThick === 1 ? 0 : -thickHalf + (layer / (nThick - 1)) * (thickHalf * 2);
    for (let i = 0; i < nThis; i++) {
      const t = nThis === 1 ? 0.5 : i / (nThis - 1);
      const z = -fillR + t * (fillR * 2);
      const xJ = (rng() * 2 - 1) * 0.06 * p.strandRandomAmount * fillR;
      const local = v3(xJ, y, z);
      let dirLocal = v3(1, 0, 0);
      const twistI = twist + (rng() * 2 - 1) * jitterAmp * p.strandRandomAmount;
      dirLocal = rotateAround(dirLocal, v3(0, 1, 0), twistI);

      const mid = localToUvw(
        args.centerUVW,
        frame.axis,
        frame.tangent,
        frame.bitangent,
        local,
        r,
      );
      const dirW = add(
        add(scale(frame.tangent, dirLocal.x), scale(frame.axis, dirLocal.y)),
        scale(frame.bitangent, dirLocal.z),
      );
      strands.push(
        makeBentStrand({
          mid,
          dir: dirW,
          halfLen: halfLen * r,
          bend: p.strandBend,
          bendDir: frame.axis,
          baseR: Math.max(1e-5, p.strandThickness * r),
          profile: pickProfile(rng),
          rng,
          randAmt: p.strandRandomAmount,
        }),
      );
    }
  }
  return strands;
}

/** Sample polyline points for editor preview (local or UVW — whatever was built). */
export function sampleStrandPolyline(
  s: StrandDesc,
  segments = 7,
): Vec3[] {
  const pts: Vec3[] = [];
  const n = Math.max(2, segments);
  for (let i = 0; i <= n; i++) {
    pts.push(bezierPoint(s.p0, s.p1, s.p2, i / n));
  }
  return pts;
}

/**
 * Numerical epsilon only — artistic radii stay as authored.
 * Grid survival is handled in the shader by a sharp ~1-voxel cover ribbon
 * (see `strandTubeWeight`), not by fattening r0/rMid/r1.
 */
export function minStrandRadiusUVW(gridSize = 48): number {
  return (1 / Math.max(8, gridSize)) * 0.02;
}

/** Outer radius of the sharp cover ribbon (~0.68 voxel). */
export function minStrandCoverRadiusUVW(gridSize = 48): number {
  return (1 / Math.max(8, gridSize)) * 0.68;
}

/** @deprecated Use minStrandCoverRadiusUVW — kept for call-site compatibility. */
export function minStrandSeedKernelUVW(gridSize = 48): number {
  return minStrandCoverRadiusUVW(gridSize);
}

/** Raise strand tube radii to a tiny numerical floor (mutates in place). */
export function enforceMinStrandRadii(
  strands: StrandDesc[],
  minR: number,
): StrandDesc[] {
  const floor = Math.max(1e-5, minR);
  for (const s of strands) {
    s.r0 = Math.max(s.r0, floor);
    s.rMid = Math.max(s.rMid, floor);
    s.r1 = Math.max(s.r1, floor);
  }
  return strands;
}

/**
 * CPU mirror of the GPU tube kernel: artistic Gaussian + sharp cover ribbon.
 * Cover only engages when rArt is sub-voxel, so thin ratios stay ~1 voxel
 * (grid minimum) instead of a soft fat Gaussian, and thick ratios stay exact.
 */
export function strandTubeWeight(
  dist: number,
  rArt: number,
  gridSize = 48,
): number {
  const texel = 1 / Math.max(8, gridSize);
  const r = Math.max(1e-5, rArt * 1.05);
  const artistic = Math.exp((-dist * dist) / (r * r));
  // smoothstep(0.68*texel, 0.12*texel, d)
  const cHi = texel * 0.68;
  const cLo = texel * 0.12;
  let cover = 0;
  if (dist <= cLo) cover = 1;
  else if (dist < cHi) {
    const t = (cHi - dist) / Math.max(1e-8, cHi - cLo);
    cover = t * t * (3 - 2 * t);
  }
  // Fade cover in only when artistic kernel is too narrow to hit the lattice.
  const need =
    1 -
    smoothstepCompat(texel * 0.35, texel * 0.7, rArt);
  return Math.max(artistic, cover * need);
}

function smoothstepCompat(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / Math.max(1e-8, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Density scale for thin ropes. Cover ribbon already guarantees voxel hits;
 * boost is milder than when we relied on a fat softRad floor.
 */
export function strandDensMulForThickness(
  strandThickness: number,
  hitRadiusUVW: number,
  gridSize = 48,
  baseMul = 1.35,
): number {
  const texel = 1 / Math.max(8, gridSize);
  const requested = Math.max(
    1e-6,
    strandThickness * Math.max(1e-6, hitRadiusUVW),
  );
  const refR = texel * 0.5;
  const boost = Math.min(3.5, Math.max(1, refR / requested));
  return baseMul * boost;
}

/** Pack strands into Float32Array of length MAX_STRANDS * 16 (4 vec4). */
export function packStrandsToBuffer(
  strands: StrandDesc[],
  out?: Float32Array,
): Float32Array {
  const buf = out ?? new Float32Array(MAX_STRANDS * 16);
  buf.fill(0);
  const n = Math.min(strands.length, MAX_STRANDS);
  for (let i = 0; i < n; i++) {
    const s = strands[i]!;
    const o = i * 16;
    buf[o + 0] = s.p0.x;
    buf[o + 1] = s.p0.y;
    buf[o + 2] = s.p0.z;
    buf[o + 3] = s.r0;
    buf[o + 4] = s.p1.x;
    buf[o + 5] = s.p1.y;
    buf[o + 6] = s.p1.z;
    buf[o + 7] = s.rMid;
    buf[o + 8] = s.p2.x;
    buf[o + 9] = s.p2.y;
    buf[o + 10] = s.p2.z;
    buf[o + 11] = s.r1;
    buf[o + 12] = s.profile;
    buf[o + 13] = 0;
    buf[o + 14] = 0;
    buf[o + 15] = 0;
  }
  return buf;
}
