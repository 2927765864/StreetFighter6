/**
 * Per-instance color + alpha for wuda coat InstancedMesh (WebGPU).
 *
 * Opacity must live in alpha — baking it into RGB only works with additive
 * blending. Under NormalBlending it turns particles black/opaque instead of
 * transparent (opacity 0 → pure black quads; free life fade → fade-to-black).
 *
 * Soft irregular disc: UV radial mask in opacityNode (few ALU ops, no texture,
 * same 2-triangle plane). Ellipse stretch/spin comes from instance matrix.
 */
import * as THREE from 'three/webgpu';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  atan,
  float,
  fract,
  instanceIndex,
  instancedDynamicBufferAttribute,
  length,
  mul,
  sin,
  smoothstep,
  uv,
} from 'three/tsl';
import type { WudaCoatCfgShim } from './wudaLayerPreset';
import type { WudaGraphicKind } from './wudaParticleShape';
import { normalizeWudaGraphicKind } from './wudaParticleShape';

export type WudaInstanceAppearance = {
  material: MeshBasicNodeMaterial;
  opacityAttr: THREE.InstancedBufferAttribute;
};

function wudaSoftMask(kind: WudaGraphicKind) {
  const coord = uv().sub(0.5).mul(2);
  const ang = atan(coord.y, coord.x);
  const h = fract(sin(float(instanceIndex).mul(127.1)).mul(43758.5453));
  const warp = float(1)
    .add(sin(ang.mul(3).add(h.mul(6.2831853))).mul(0.12))
    .add(sin(ang.mul(5).add(h.mul(4.1))).mul(0.06));
  const r = length(coord).div(warp);
  if (kind === 'ring') {
    const outer = smoothstep(1.0, 0.78, r);
    const inner = smoothstep(0.36, 0.56, r);
    return outer.mul(inner);
  }
  return smoothstep(1.0, 0.45, r);
}

export function applyWudaGraphicKind(
  material: MeshBasicNodeMaterial,
  opacityAttr: THREE.InstancedBufferAttribute,
  kind: WudaGraphicKind,
): void {
  const instanceOpacity = instancedDynamicBufferAttribute(opacityAttr, 'float');
  material.opacityNode = mul(
    instanceOpacity as ReturnType<typeof float>,
    wudaSoftMask(normalizeWudaGraphicKind(kind)),
  );
}

export function createWudaInstanceAppearance(
  geometry: THREE.BufferGeometry,
  instanceCap: number,
  additive: boolean,
  graphicKind: WudaGraphicKind = 'disc',
): WudaInstanceAppearance {
  const opacityArray = new Float32Array(instanceCap);
  opacityArray.fill(1);
  const opacityAttr = new THREE.InstancedBufferAttribute(opacityArray, 1);
  opacityAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('instanceOpacity', opacityAttr);

  const material = new MeshBasicNodeMaterial({
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
  });

  applyWudaGraphicKind(material, opacityAttr, graphicKind);
  return { material, opacityAttr };
}

/** Resolve display RGB without baking opacity into the color. */
export function resolveWudaInstanceColor(
  out: THREE.Color,
  cfg: WudaCoatCfgShim,
  stuck: boolean,
  size: number,
): void {
  if (cfg.wudaShowDebug && stuck) {
    out.setRGB(0.2, 0.85, 0.3);
  } else if (cfg.wudaShowDebug && !stuck && size > 0) {
    out.setRGB(0.95, 0.35, 0.15);
  } else if (stuck) {
    out.setHex(cfg.wudaStuckColor & 0xffffff);
  } else {
    out.setHex(cfg.wudaFreeColor & 0xffffff);
  }
}

export function setWudaInstanceOpacity(
  opacityAttr: THREE.InstancedBufferAttribute,
  index: number,
  opacity: number,
): void {
  const op = opacity > 0 ? (opacity < 1 ? opacity : 1) : 0;
  opacityAttr.setX(index, op);
}
