import type * as THREE from 'three/webgpu';
import type { PerfRenderSample } from './perfTypes';

/** Call once before all renders of a present. */
export function armRenderInfoForPresent(renderer: THREE.WebGPURenderer): void {
  renderer.info.autoReset = false;
  renderer.info.reset();
}

export function sampleRenderInfo(
  renderer: THREE.WebGPURenderer,
): PerfRenderSample {
  const { render, memory } = renderer.info;
  return {
    drawCalls: render.drawCalls,
    triangles: render.triangles,
    frameCalls: render.frameCalls,
    geometries: memory.geometries,
    textures: memory.textures,
    memoryTotal: memory.total ?? 0,
  };
}
