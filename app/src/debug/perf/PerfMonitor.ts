import type * as THREE from 'three/webgpu';
import { readJsHeapMb } from './perfMath';
import { GpuTimestampSampler } from './GpuTimestampSampler';
import { PerfOverlay, type PerfOverlayConfig } from './PerfOverlay';
import { PerfSpans } from './PerfSpans';
import { PresentMeter } from './PresentMeter';
import {
  armRenderInfoForPresent,
  sampleRenderInfo,
} from './RenderInfoSampler';
import type {
  PerfOverlayPosition,
  PerfSegmentId,
  PerfSnapshot,
} from './perfTypes';

export type PerfMonitorCfg = {
  perfOverlayEnabled: boolean;
  perfOverlayPosition: PerfOverlayPosition;
  perfOverlayOpacity: number;
  perfRefreshMs: number;
  perfHistoryLength: number;
  perfTargetFps: number;
  perfWarnFps: number;
  perfBadFps: number;
  perfShowGraphs: boolean;
  perfShowSegments: boolean;
  perfShowRenderInfo: boolean;
  perfShowJsHeap: boolean;
  perfGpuTimingEnabled: boolean;
  perfGpuSampleAverage: number;
  perfPauseOverlayWhenHidden: boolean;
  perfExportRingBufferSec: number;
};

/** Facade: spans + present meter + overlay + optional GPU + export ring. */
export class PerfMonitor {
  readonly spans = new PerfSpans();
  private readonly meter = new PresentMeter();
  private readonly overlay = new PerfOverlay();
  private readonly gpu = new GpuTimestampSampler();
  private ring: PerfSnapshot[] = [];
  private lastSnap: PerfSnapshot | null = null;
  private presentStartMs = 0;

  applyCfg(cfg: PerfMonitorCfg): void {
    this.meter.setHistoryLength(cfg.perfHistoryLength);
    this.gpu.setAverageWindow(cfg.perfGpuSampleAverage);
  }

  beginPresent(nowMs = performance.now()): void {
    this.presentStartMs = nowMs;
  }

  armRenderer(renderer: THREE.WebGPURenderer): void {
    armRenderInfoForPresent(renderer);
  }

  begin(id: PerfSegmentId, nowMs?: number): void {
    this.spans.begin(id, nowMs);
  }

  end(id: PerfSegmentId, nowMs?: number): void {
    this.spans.end(id, nowMs);
  }

  /**
   * Sync finalize for setAnimationLoop (must not await).
   * GPU timestamps resolve in background and patch the overlay when ready.
   */
  finalizePresent(opts: {
    renderer: THREE.WebGPURenderer;
    nowMs: number;
    logicSteps: number;
    cfg: PerfMonitorCfg;
  }): PerfSnapshot {
    const { renderer, nowMs, logicSteps, cfg } = opts;
    this.applyCfg(cfg);

    const frameMs = Math.max(0, nowMs - this.presentStartMs);
    const segments = this.spans.flush();
    const renderInfo = sampleRenderInfo(renderer);
    const meter = this.meter.tick(
      nowMs,
      frameMs,
      logicSteps,
      cfg.perfRefreshMs,
    );
    const heap = cfg.perfShowJsHeap
      ? readJsHeapMb()
      : { usedMb: null, totalMb: null };

    const snap: PerfSnapshot = {
      schemaVersion: 1,
      takenAtMs: nowMs,
      presentFps: meter.presentFps,
      logicHz: meter.logicHz,
      frameMs: meter.frameMs,
      frameMsMin: meter.frameMsMin,
      frameMsMax: meter.frameMsMax,
      frameMsAvg: meter.frameMsAvg,
      segmentsMs: segments,
      render: renderInfo,
      gpuRenderMs: this.lastSnap?.gpuRenderMs ?? null,
      gpuComputeMs: this.lastSnap?.gpuComputeMs ?? null,
      jsHeapUsedMb: heap.usedMb,
      jsHeapTotalMb: heap.totalMb,
      presented: true,
      logicStepsThisPresent: logicSteps,
      warnings: [],
    };

    this.lastSnap = snap;
    this.pushRing(snap, cfg.perfExportRingBufferSec);
    this.overlay.update(snap, toOverlayCfg(cfg), {
      frameMsHistory: meter.frameMsHistory,
      fpsHistory: meter.fpsHistory,
    });

    if (cfg.perfGpuTimingEnabled) {
      void this.gpu.sampleAfterPresent(renderer, true).then((gpu) => {
        if (!this.lastSnap) return;
        this.lastSnap = {
          ...this.lastSnap,
          gpuRenderMs: gpu.gpuRenderMs,
          gpuComputeMs: gpu.gpuComputeMs,
          warnings: gpu.warnings,
        };
        const m = this.meter.sample(this.lastSnap.frameMs);
        this.overlay.update(this.lastSnap, toOverlayCfg(cfg), {
          frameMsHistory: m.frameMsHistory,
          fpsHistory: m.fpsHistory,
        });
      });
    }

    return snap;
  }

  /** Update visibility without a new present (e.g. toggle). */
  refreshOverlay(cfg: PerfMonitorCfg): void {
    this.applyCfg(cfg);
    if (!cfg.perfOverlayEnabled) {
      this.overlay.hide();
      return;
    }
    if (this.lastSnap) {
      const meter = this.meter.sample(this.lastSnap.frameMs);
      this.overlay.update(this.lastSnap, toOverlayCfg(cfg), {
        frameMsHistory: meter.frameMsHistory,
        fpsHistory: meter.fpsHistory,
      });
    }
  }

  exportSnapshot(): string {
    return JSON.stringify(this.lastSnap ?? { schemaVersion: 1, empty: true }, null, 2);
  }

  exportRingBuffer(): string {
    return JSON.stringify(
      { schemaVersion: 1, count: this.ring.length, samples: this.ring },
      null,
      2,
    );
  }

  dispose(): void {
    this.overlay.dispose();
  }

  private pushRing(snap: PerfSnapshot, sec: number): void {
    this.ring.push(snap);
    const cutoff = snap.takenAtMs - Math.max(1, sec) * 1000;
    while (this.ring.length > 0 && this.ring[0]!.takenAtMs < cutoff) {
      this.ring.shift();
    }
  }
}

function toOverlayCfg(cfg: PerfMonitorCfg): PerfOverlayConfig {
  return {
    enabled: cfg.perfOverlayEnabled,
    position: cfg.perfOverlayPosition,
    opacity: cfg.perfOverlayOpacity,
    showGraphs: cfg.perfShowGraphs,
    showSegments: cfg.perfShowSegments,
    showRenderInfo: cfg.perfShowRenderInfo,
    showJsHeap: cfg.perfShowJsHeap,
    targetFps: cfg.perfTargetFps,
    warnFps: cfg.perfWarnFps,
    badFps: cfg.perfBadFps,
    pauseHidden: cfg.perfPauseOverlayWhenHidden,
  };
}
