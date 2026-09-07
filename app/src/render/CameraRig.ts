/**
 * Side-view fight camera.
 * - One logic-unit edge margin from absolute screen/board edge → fighter origin.
 * - Zoom stays at zMin until that margin would be violated, then pulls back to zMax
 *   (never past the Z that would show beyond stage edges).
 * - Stage width clamps the *frame* (frustum at look plane), not merely camX.
 * - Pair span is capped without sliding a shared wall (no idle-partner drag).
 */

export const HURT_HALF_WIDTH = 0.35;
export const LOGIC_BODY_HEIGHT = 1.85;
/** `cameraLerp` is the fraction of remaining error closed per this interval. */
export const FOLLOW_DT_REF = 1 / 60;
export const MAX_FOLLOW_DT = 0.1;

export type FightCameraInput = {
  p1x: number;
  p2x: number;
  worldScale: number;
  cameraY: number;
  cameraZ: number;
  cameraLookY: number;
  cameraFov: number;
  aspect: number;
  zoomEnabled: boolean;
  zMax: number;
  /**
   * Full stage width in logic units (symmetric about 0).
   * Absolute camera frame edges cannot cross ±width/2.
   */
  stageWidth: number;
  /**
   * Logic distance from absolute screen/board edge to fighter origin.
   * Same value for board-edge and screen soft-wall.
   */
  edgeMargin: number;
};

export type FightCameraPose = {
  camX: number;
  camY: number;
  camZ: number;
  lookX: number;
  lookY: number;
  lookZ: number;
};

export type FightCameraFrame = {
  minE: number;
  maxE: number;
  mid: number;
  /** World-unit margin from absolute frame edge to origin. */
  edgeMarginW: number;
  fov: number;
  aspect: number;
  zMin: number;
  zMax: number;
  /** Preferred Z before fit-to-span / stage fill. */
  backZBase: number;
  /** World half-width of stage (±stageWidth/2 * worldScale). */
  stageHalfW: number;
};

export type CameraFollowOpts = {
  /** Fraction of remaining error closed per 1/60s. 0 or >=1 = snap. */
  lerp: number;
  /** Presentation dt in seconds (wall clock). */
  dt: number;
  /** World-unit X deadzone. 0 = none. */
  deadzone: number;
};

export type LogicWalls = {
  minX: number;
  maxX: number;
};

export function midXWorld(p1x: number, p2x: number, worldScale: number): number {
  return ((p1x + p2x) * 0.5) * worldScale;
}

export function sepWorld(p1x: number, p2x: number, worldScale: number): number {
  return Math.abs(p1x - p2x) * worldScale;
}

/** Visible half-width at look plane z=0 for a +Z camera looking −Z. */
export function visibleHalfWidth(
  backZ: number,
  fovDeg: number,
  aspect: number,
): number {
  const fovRad = (fovDeg * Math.PI) / 180;
  return Math.max(1e-6, backZ * Math.tan(fovRad / 2) * Math.max(aspect, 1e-6));
}

/** Max back-Z whose frustum half-width equals `stageHalfW` (no past-stage pixels). */
export function stageFillBackZ(
  stageHalfW: number,
  fovDeg: number,
  aspect: number,
): number {
  const fovRad = (fovDeg * Math.PI) / 180;
  const denom = Math.tan(fovRad / 2) * Math.max(aspect, 1e-6);
  return Math.max(0.1, stageHalfW / Math.max(denom, 1e-6));
}

export function fightCameraFrame(input: FightCameraInput): FightCameraFrame {
  const ws = input.worldScale;
  const mid = midXWorld(input.p1x, input.p2x, ws);
  const stageHalfW = Math.max(0, input.stageWidth * 0.5) * ws;
  const fillZ = stageFillBackZ(stageHalfW, input.cameraFov, input.aspect);
  const zMin = Math.min(Math.max(0.1, input.cameraZ), fillZ);
  const zMax = Math.min(Math.max(zMin, input.zMax), fillZ);
  const edgeMarginW = Math.max(0, input.edgeMargin) * ws;
  // Fit / walls are measured from fighter origins to absolute frame edges.
  const origins = [input.p1x * ws, input.p2x * ws];
  return {
    minE: Math.min(...origins),
    maxE: Math.max(...origins),
    mid,
    edgeMarginW,
    fov: input.cameraFov,
    aspect: Math.max(input.aspect, 1e-6),
    zMin,
    zMax,
    backZBase: zMin,
    stageHalfW,
  };
}

/** Z needed so both origins stay ≥ edgeMargin inside absolute frame edges. */
export function neededBackZ(frame: FightCameraFrame): number {
  const neededHalf = (frame.maxE - frame.minE) * 0.5 + frame.edgeMarginW;
  const fovRad = (frame.fov * Math.PI) / 180;
  const tanHalf = Math.tan(fovRad / 2);
  return neededHalf / Math.max(tanHalf * frame.aspect, 1e-6);
}

/**
 * Margin-triggered zoom: stay at zMin while the pair fits with edgeMargin;
 * pull back only as far as needed, capped by zMax (and stage fill).
 */
export function fittedBackZ(frame: FightCameraFrame, zoomEnabled: boolean): number {
  if (!zoomEnabled) return frame.backZBase;
  const need = neededBackZ(frame);
  return need > frame.backZBase
    ? Math.min(frame.zMax, need)
    : frame.backZBase;
}

/** camX range so both origins stay inside absolute edges inset by edgeMargin. */
export function camXLimits(
  backZ: number,
  frame: FightCameraFrame,
): { lo: number; hi: number } {
  const halfW = visibleHalfWidth(backZ, frame.fov, frame.aspect);
  const inner = halfW - frame.edgeMarginW;
  return {
    lo: frame.maxE - inner,
    hi: frame.minE + inner,
  };
}

/** camX range so the absolute frame edges stay inside ±stageHalfW. */
export function stageCamXLimits(
  backZ: number,
  frame: FightCameraFrame,
): { lo: number; hi: number } {
  const halfW = visibleHalfWidth(backZ, frame.fov, frame.aspect);
  return {
    lo: -frame.stageHalfW + halfW,
    hi: frame.stageHalfW - halfW,
  };
}

export function clampCamX(
  camX: number,
  backZ: number,
  frame: FightCameraFrame,
): number {
  const stage = stageCamXLimits(backZ, frame);
  if (stage.lo > stage.hi) {
    return 0;
  }
  const fighter = camXLimits(backZ, frame);
  const lo = Math.max(fighter.lo, stage.lo);
  const hi = Math.min(fighter.hi, stage.hi);
  if (lo <= hi) return Math.min(hi, Math.max(lo, camX));
  return Math.min(stage.hi, Math.max(stage.lo, frame.mid));
}

export function computeFightCamera(input: FightCameraInput): FightCameraPose {
  const frame = fightCameraFrame(input);
  const backZ = fittedBackZ(frame, input.zoomEnabled);
  const camX = clampCamX(frame.mid, backZ, frame);
  return {
    camX,
    camY: input.cameraY,
    camZ: backZ,
    lookX: camX,
    lookY: input.cameraLookY,
    lookZ: 0,
  };
}

/**
 * Stage origin walls: same absolute-edge − edgeMargin rule as screen soft walls.
 */
export function computeStageLogicWalls(input: {
  stageWidth: number;
  edgeMargin: number;
}): LogicWalls {
  const margin = Math.max(0, input.edgeMargin);
  const stageHalf = Math.max(0, input.stageWidth * 0.5);
  return {
    minX: -stageHalf + margin,
    maxX: stageHalf - margin,
  };
}

/**
 * Max origin separation at zMax with edgeMargin (also capped by stage walls).
 */
export function maxOriginSeparation(input: FightCameraInput): number {
  const ws = Math.max(1e-6, input.worldScale);
  const margin = Math.max(0, input.edgeMargin);
  const frame = fightCameraFrame(input);
  const halfW = visibleHalfWidth(frame.zMax, frame.fov, frame.aspect);
  const camSep = 2 * (halfW / ws - margin);
  const stage = computeStageLogicWalls(input);
  const stageSep = Math.max(0, stage.maxX - stage.minX);
  return Math.max(0, Math.min(camSep, stageSep));
}

/**
 * After displacement: stage-clamp both, then if the pair is wider than the
 * camera can show at zMax, pull back only the fighter who moved more.
 */
export function constrainFighterPair(
  p1x: number,
  p2x: number,
  prevP1x: number,
  prevP2x: number,
  input: FightCameraInput,
): { p1x: number; p2x: number } {
  const stage = computeStageLogicWalls(input);
  const clamp = (x: number) => Math.min(stage.maxX, Math.max(stage.minX, x));
  let a = clamp(p1x);
  let b = clamp(p2x);

  const maxSep = maxOriginSeparation({ ...input, p1x: a, p2x: b });
  const sep = Math.abs(a - b);
  if (sep > maxSep + 1e-9) {
    const d1 = Math.abs(a - prevP1x);
    const d2 = Math.abs(b - prevP2x);
    if (d1 > d2 + 1e-9) {
      a = b + Math.sign(a - b || 1) * maxSep;
    } else if (d2 > d1 + 1e-9) {
      b = a + Math.sign(b - a || 1) * maxSep;
    } else {
      const mid = (a + b) * 0.5;
      const half = maxSep * 0.5;
      if (a <= b) {
        a = mid - half;
        b = mid + half;
      } else {
        b = mid - half;
        a = mid + half;
      }
    }
    a = clamp(a);
    b = clamp(b);
    const sep2 = Math.abs(a - b);
    if (sep2 > maxSep + 1e-9) {
      const mid = (a + b) * 0.5;
      const half = maxSep * 0.5;
      if (a <= b) {
        a = clamp(mid - half);
        b = clamp(mid + half);
      } else {
        b = clamp(mid - half);
        a = clamp(mid + half);
      }
    }
  }

  return { p1x: a, p2x: b };
}

/** @deprecated Prefer computeStageLogicWalls / constrainFighterPair. */
export function computeFighterLogicWalls(input: FightCameraInput): LogicWalls {
  return computeStageLogicWalls(input);
}

export function followAlpha(lerp: number, dt: number): number {
  const u = Math.min(1, Math.max(0, lerp));
  if (u <= 0 || u >= 1) return 1;
  const t = Math.min(MAX_FOLLOW_DT, Math.max(0, dt));
  if (t <= 0) return 0;
  return 1 - (1 - u) ** (t / FOLLOW_DT_REF);
}

/** Keep shown X inside the deadzone shell around target; else chase the rim. */
export function deadzoneFollowX(
  shownX: number,
  targetX: number,
  deadzone: number,
): number {
  const dz = Math.max(0, deadzone);
  if (dz <= 0) return targetX;
  const lo = targetX - dz;
  const hi = targetX + dz;
  if (shownX < lo) return lo;
  if (shownX > hi) return hi;
  return shownX;
}

/** Pull displayed X (and Z if needed) so origins keep edgeMargin + stage. */
export function constrainDisplayedPose(
  shown: FightCameraPose,
  input: FightCameraInput,
): FightCameraPose {
  const frame = fightCameraFrame(input);
  const camZ = Math.max(shown.camZ, fittedBackZ(frame, input.zoomEnabled));
  const camX = clampCamX(shown.camX, camZ, frame);
  return {
    camX,
    camY: input.cameraY,
    camZ,
    lookX: camX,
    lookY: input.cameraLookY,
    lookZ: 0,
  };
}

export function lerpPose(
  from: FightCameraPose,
  to: FightCameraPose,
  t: number,
): FightCameraPose {
  const u = Math.min(1, Math.max(0, t));
  const mix = (a: number, b: number) => a + (b - a) * u;
  return {
    camX: mix(from.camX, to.camX),
    camY: mix(from.camY, to.camY),
    camZ: mix(from.camZ, to.camZ),
    lookX: mix(from.lookX, to.lookX),
    lookY: mix(from.lookY, to.lookY),
    lookZ: mix(from.lookZ, to.lookZ),
  };
}

export function applyFightCamera(
  camera: {
    position: { set: (x: number, y: number, z: number) => void };
    up: { set: (x: number, y: number, z: number) => void };
    lookAt: (x: number, y: number, z: number) => void;
    fov: number;
    near: number;
    far: number;
    aspect: number;
    updateProjectionMatrix: () => void;
    updateMatrixWorld: (force?: boolean) => void;
  },
  pose: FightCameraPose,
  opts: { fov: number; near: number; far: number; aspect: number },
): void {
  camera.fov = opts.fov;
  camera.near = opts.near;
  camera.far = opts.far;
  camera.aspect = opts.aspect;
  camera.updateProjectionMatrix();
  camera.position.set(pose.camX, pose.camY, pose.camZ);
  camera.up.set(0, 1, 0);
  camera.lookAt(pose.lookX, pose.lookY, pose.lookZ);
  camera.updateMatrixWorld(true);
}

export class CameraRig {
  private last: FightCameraPose | null = null;

  update(input: FightCameraInput, opts: CameraFollowOpts): FightCameraPose {
    const target = computeFightCamera(input);
    const alpha = followAlpha(opts.lerp, opts.dt);
    if (!this.last || alpha >= 1) {
      this.last = target;
      return target;
    }

    const desiredX = deadzoneFollowX(this.last.camX, target.camX, opts.deadzone);
    const desired: FightCameraPose = {
      camX: desiredX,
      camY: target.camY,
      camZ: target.camZ,
      lookX: desiredX,
      lookY: target.lookY,
      lookZ: 0,
    };
    const mixed = lerpPose(this.last, desired, alpha);
    mixed.lookX = mixed.camX;
    this.last = constrainDisplayedPose(mixed, input);
    return this.last;
  }
}
