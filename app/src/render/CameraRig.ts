/**
 * Side-view fight camera. Formulas from
 * docs/plans/ai-execution-plan-scene-camera-lighting-v0.md §5.
 * Does not mutate fighter logic positions.
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
  zoomSepK: number;
  zMax: number;
  ndcPad: number;
  /** Stance hurt half-extent in logic units. Default 0.35 (full w 0.7). */
  hurtHalfWidth?: number;
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
  pad: number;
  fov: number;
  aspect: number;
  zMin: number;
  zMax: number;
  /** Zoom formula only; fit-to-span may still push Z out. */
  backZBase: number;
};

export type CameraFollowOpts = {
  /** Fraction of remaining error closed per 1/60s. 0 or >=1 = snap. */
  lerp: number;
  /** Presentation dt in seconds (wall clock). */
  dt: number;
  /** World-unit X deadzone. 0 = none. */
  deadzone: number;
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

export function fightCameraFrame(input: FightCameraInput): FightCameraFrame {
  const ws = input.worldScale;
  const halfHurt = (input.hurtHalfWidth ?? HURT_HALF_WIDTH) * ws;
  const mid = midXWorld(input.p1x, input.p2x, ws);
  const sep = sepWorld(input.p1x, input.p2x, ws);
  const zMin = Math.max(0.1, input.cameraZ);
  const zMax = Math.max(zMin, input.zMax);
  const backZBase = input.zoomEnabled
    ? Math.min(zMax, Math.max(zMin, zMin + input.zoomSepK * sep))
    : zMin;
  const edges = [
    input.p1x * ws - halfHurt,
    input.p1x * ws + halfHurt,
    input.p2x * ws - halfHurt,
    input.p2x * ws + halfHurt,
  ];
  return {
    minE: Math.min(...edges),
    maxE: Math.max(...edges),
    mid,
    pad: Math.min(0.49, Math.max(0, input.ndcPad)),
    fov: input.cameraFov,
    aspect: Math.max(input.aspect, 1e-6),
    zMin,
    zMax,
    backZBase,
  };
}

export function neededBackZ(frame: FightCameraFrame): number {
  const fitFactor = 2 * (1 - frame.pad);
  const fovRad = (frame.fov * Math.PI) / 180;
  const tanHalf = Math.tan(fovRad / 2);
  const neededHalf = (frame.maxE - frame.minE) / Math.max(fitFactor, 1e-6);
  return neededHalf / Math.max(tanHalf * frame.aspect, 1e-6);
}

export function fittedBackZ(frame: FightCameraFrame): number {
  const need = neededBackZ(frame);
  return need > frame.backZBase ? Math.min(frame.zMax, need) : frame.backZBase;
}

export function camXLimits(
  backZ: number,
  frame: FightCameraFrame,
): { lo: number; hi: number } {
  const halfW = visibleHalfWidth(backZ, frame.fov, frame.aspect);
  return {
    lo: frame.maxE - (1 - frame.pad) * halfW,
    hi: frame.minE - (-1 + frame.pad) * halfW,
  };
}

export function clampCamX(
  camX: number,
  backZ: number,
  frame: FightCameraFrame,
): number {
  const { lo, hi } = camXLimits(backZ, frame);
  if (lo <= hi) return Math.min(hi, Math.max(lo, camX));
  return (frame.minE + frame.maxE) * 0.5;
}

export function computeFightCamera(input: FightCameraInput): FightCameraPose {
  const frame = fightCameraFrame(input);
  const backZ = fittedBackZ(frame);
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

/** Pull displayed X (and Z if needed) so both hurt spans stay inside ndcPad. */
export function constrainDisplayedPose(
  shown: FightCameraPose,
  input: FightCameraInput,
): FightCameraPose {
  const frame = fightCameraFrame(input);
  const camZ = Math.max(shown.camZ, fittedBackZ(frame));
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
