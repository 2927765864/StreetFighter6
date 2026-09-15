/**
 * Shared InstancedMesh write for live coats and clip playback.
 * Capture happens here so recorded samples match what was actually drawn.
 */
import * as THREE from 'three/webgpu';
import type { WudaCoatCfgShim } from './wudaLayerPreset';
import {
  resolveWudaInstanceColor,
  setWudaInstanceOpacity,
} from './wudaInstanceAppearance';
import {
  resolveWudaEllipseShapeFromIndex,
  resolveWudaFlightRingShape,
  type WudaEllipseShape,
} from './wudaParticleShape';

export type WudaDrawSample = {
  index: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  aspect: number;
  spin: number;
  opacity: number;
  stuck: boolean;
  cr: number;
  cg: number;
  cb: number;
};

export type WudaWriteScratch = {
  dummy: THREE.Object3D;
  color: THREE.Color;
  scale: THREE.Vector3;
  quat: THREE.Quaternion;
  spinQuat: THREE.Quaternion;
  camQuat: THREE.Quaternion;
  camRight: THREE.Vector3;
  camUp: THREE.Vector3;
  zAxis: THREE.Vector3;
  unitShape: WudaEllipseShape;
};

export function createWudaWriteScratch(): WudaWriteScratch {
  return {
    dummy: new THREE.Object3D(),
    color: new THREE.Color(),
    scale: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    spinQuat: new THREE.Quaternion(),
    camQuat: new THREE.Quaternion(),
    camRight: new THREE.Vector3(),
    camUp: new THREE.Vector3(),
    zAxis: new THREE.Vector3(0, 0, 1),
    unitShape: { aspect: 1, spin: 0 },
  };
}

export function syncWudaWriteCamera(
  scratch: WudaWriteScratch,
  camera: THREE.Camera | null,
): void {
  if (camera) camera.getWorldQuaternion(scratch.camQuat);
  else scratch.camQuat.identity();
  scratch.camRight.set(1, 0, 0).applyQuaternion(scratch.camQuat);
  scratch.camUp.set(0, 1, 0).applyQuaternion(scratch.camQuat);
}

export type WudaWriteTarget = {
  instanced: THREE.InstancedMesh;
  opacityAttr: THREE.InstancedBufferAttribute;
  scratch: WudaWriteScratch;
  capture: WudaDrawSample[] | null;
};

export function writeWudaInstance(
  target: WudaWriteTarget,
  index: number,
  pos: THREE.Vector3,
  size: number,
  cfg: WudaCoatCfgShim,
  stuck: boolean,
  opacityOverride?: number,
  shape?: WudaEllipseShape,
  vel?: THREE.Vector3,
): void {
  const { instanced, opacityAttr, scratch } = target;
  const base = Math.max(0, size);
  const ellipse =
    cfg.wudaGraphicKind === 'ring' && vel && vel.lengthSq() > 1e-8
      ? resolveWudaFlightRingShape(
          vel.x,
          vel.y,
          vel.z,
          scratch.camRight.x,
          scratch.camRight.y,
          scratch.camRight.z,
          scratch.camUp.x,
          scratch.camUp.y,
          scratch.camUp.z,
          cfg.wudaFlightCompress,
        )
      : (shape ??
        (base > 0
          ? resolveWudaEllipseShapeFromIndex(
              index,
              cfg.wudaSeed,
              cfg.wudaEllipseAspectJitter,
            )
          : scratch.unitShape));
  const aspect = ellipse.aspect > 0.05 ? ellipse.aspect : 1;
  scratch.scale.set(base * aspect, base / aspect, base > 0 ? 1 : 0);
  scratch.quat.copy(scratch.camQuat);
  if (ellipse.spin !== 0) {
    scratch.spinQuat.setFromAxisAngle(scratch.zAxis, ellipse.spin);
    scratch.quat.multiply(scratch.spinQuat);
  }
  scratch.dummy.position.copy(pos);
  scratch.dummy.quaternion.copy(scratch.quat);
  scratch.dummy.scale.copy(scratch.scale);
  scratch.dummy.updateMatrix();
  instanced.setMatrixAt(index, scratch.dummy.matrix);

  const op =
    base <= 0
      ? 0
      : (opacityOverride ??
        (stuck ? cfg.wudaStuckOpacity : cfg.wudaFreeOpacity));
  resolveWudaInstanceColor(scratch.color, cfg, stuck, base);
  instanced.setColorAt(index, scratch.color);
  setWudaInstanceOpacity(opacityAttr, index, op);

  if (target.capture && (base > 0 || op > 0)) {
    target.capture.push({
      index,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      vx: vel?.x ?? 0,
      vy: vel?.y ?? 0,
      vz: vel?.z ?? 0,
      size: base,
      aspect,
      spin: ellipse.spin,
      opacity: op,
      stuck,
      cr: scratch.color.r,
      cg: scratch.color.g,
      cb: scratch.color.b,
    });
  }
}
