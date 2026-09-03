/**
 * Per-instance color + alpha for wuda coat InstancedMesh (WebGPU).
 *
 * Opacity must live in alpha — baking it into RGB only works with additive
 * blending. Under NormalBlending it turns particles black/opaque instead of
 * transparent (opacity 0 → pure black quads; free life fade → fade-to-black).
 */
import * as THREE from 'three/webgpu';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { instancedDynamicBufferAttribute } from 'three/tsl';
import type { MutableSimConfig } from '../../config/constants';

export type WudaInstanceAppearance = {
  material: MeshBasicNodeMaterial;
  opacityAttr: THREE.InstancedBufferAttribute;
};

export function createWudaInstanceAppearance(
  geometry: THREE.BufferGeometry,
  instanceCap: number,
  additive: boolean,
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
  // Per-instance alpha (material.opacity stays 1).
  material.opacityNode = instancedDynamicBufferAttribute(opacityAttr, 'float');
  return { material, opacityAttr };
}

/** Resolve display RGB without baking opacity into the color. */
export function resolveWudaInstanceColor(
  out: THREE.Color,
  cfg: MutableSimConfig,
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
