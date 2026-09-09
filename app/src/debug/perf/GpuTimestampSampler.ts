import type * as THREE from 'three/webgpu';
import { TimestampQuery } from 'three/webgpu';

export type GpuTimingResult = {
  gpuRenderMs: number | null;
  gpuComputeMs: number | null;
  warnings: string[];
};

/**
 * Resolves WebGPU timestamps after all renders of a present.
 * Requires renderer constructed with trackTimestamp: true.
 */
export class GpuTimestampSampler {
  private renderRing: number[] = [];
  private computeRing: number[] = [];
  private avgWindow = 30;
  private unavailable = false;

  setAverageWindow(n: number): void {
    this.avgWindow = Math.max(1, Math.floor(n));
    while (this.renderRing.length > this.avgWindow) this.renderRing.shift();
    while (this.computeRing.length > this.avgWindow) this.computeRing.shift();
  }

  async sampleAfterPresent(
    renderer: THREE.WebGPURenderer,
    enabled: boolean,
  ): Promise<GpuTimingResult> {
    const warnings: string[] = [];
    if (!enabled) {
      return { gpuRenderMs: null, gpuComputeMs: null, warnings };
    }
    if (this.unavailable) {
      warnings.push('timestamp-query-unavailable');
      return { gpuRenderMs: null, gpuComputeMs: null, warnings };
    }

    try {
      const hasFeature =
        typeof renderer.hasFeature === 'function'
          ? renderer.hasFeature('timestamp-query')
          : true;
      if (hasFeature !== true) {
        this.unavailable = true;
        warnings.push('timestamp-query-unavailable');
        return { gpuRenderMs: null, gpuComputeMs: null, warnings };
      }

      await renderer.resolveTimestampsAsync(TimestampQuery.RENDER);
      await renderer.resolveTimestampsAsync(TimestampQuery.COMPUTE);

      const rawR = Number(renderer.info.render.timestamp);
      const rawC = Number(renderer.info.compute.timestamp);
      if (Number.isFinite(rawR) && rawR > 0) {
        this.renderRing.push(rawR);
        while (this.renderRing.length > this.avgWindow) this.renderRing.shift();
      }
      if (Number.isFinite(rawC) && rawC > 0) {
        this.computeRing.push(rawC);
        while (this.computeRing.length > this.avgWindow) this.computeRing.shift();
      }

      return {
        gpuRenderMs: avg(this.renderRing),
        gpuComputeMs: avg(this.computeRing),
        warnings,
      };
    } catch (e) {
      this.unavailable = true;
      warnings.push('timestamp-query-unavailable');
      warnings.push(String(e));
      return { gpuRenderMs: null, gpuComputeMs: null, warnings };
    }
  }
}

function avg(xs: number[]): number | null {
  if (xs.length === 0) return null;
  let s = 0;
  for (const v of xs) s += v;
  return s / xs.length;
}
