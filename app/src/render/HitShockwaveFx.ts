/**
 * Screen-space hit shockwave: expanding ring that warps the framebuffer
 * (water-ripple style). Pure distortion — no visible ring glow.
 *
 * Wall-clock time (continues during hitstop). Multiple waves up to a cap.
 * WebGPU: after fight layers draw, a fullscreen quad copies the viewport
 * and samples it with warped UVs.
 */

import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec2,
  uniform,
  screenUV,
  viewportTexture,
  length,
  max,
  exp,
} from 'three/tsl';

export const HIT_SHOCKWAVE_MAX_SLOTS = 4;

export type HitShockwaveStrength = 'L' | 'M' | 'H';

export type HitShockwaveParams = {
  enabled: boolean;
  maxConcurrent: number;
  /** Soft ring width in aspect-corrected UV units. */
  thickness: number;
  durationL: number;
  durationM: number;
  durationH: number;
  /** Peak expansion radius in aspect-corrected UV (≈0.2–0.5 ≈ half–full body). */
  maxRadiusL: number;
  maxRadiusM: number;
  maxRadiusH: number;
  /** Peak radial UV warp (0.01–0.04 is visible but not wild). */
  amplitudeL: number;
  amplitudeM: number;
  amplitudeH: number;
};

type WaveSlot = {
  alive: boolean;
  age: number;
  duration: number;
  centerU: number;
  centerV: number;
  /** Fixed world anchor at contact; reprojected each frame for camera motion. */
  worldX: number;
  worldY: number;
  worldZ: number;
  maxRadius: number;
  amplitude: number;
};

const _ndc = new THREE.Vector3();
const _size = new THREE.Vector2();

export function createDefaultHitShockwaveParams(): HitShockwaveParams {
  return {
    enabled: true,
    maxConcurrent: 4,
    thickness: 0.035,
    durationL: 0.12,
    durationM: 0.16,
    durationH: 0.22,
    maxRadiusL: 0.22,
    maxRadiusM: 0.32,
    maxRadiusH: 0.42,
    amplitudeL: 0.012,
    amplitudeM: 0.02,
    amplitudeH: 0.032,
  };
}

/** Pull tunables from the live runtime config object. */
export function hitShockwaveParamsFromConfig(cfg: {
  hitShockwaveEnabled: boolean;
  hitShockwaveMaxConcurrent: number;
  hitShockwaveThickness: number;
  hitShockwaveDurationL: number;
  hitShockwaveDurationM: number;
  hitShockwaveDurationH: number;
  hitShockwaveMaxRadiusL: number;
  hitShockwaveMaxRadiusM: number;
  hitShockwaveMaxRadiusH: number;
  hitShockwaveAmplitudeL: number;
  hitShockwaveAmplitudeM: number;
  hitShockwaveAmplitudeH: number;
}): HitShockwaveParams {
  return {
    enabled: cfg.hitShockwaveEnabled,
    maxConcurrent: cfg.hitShockwaveMaxConcurrent,
    thickness: cfg.hitShockwaveThickness,
    durationL: cfg.hitShockwaveDurationL,
    durationM: cfg.hitShockwaveDurationM,
    durationH: cfg.hitShockwaveDurationH,
    maxRadiusL: cfg.hitShockwaveMaxRadiusL,
    maxRadiusM: cfg.hitShockwaveMaxRadiusM,
    maxRadiusH: cfg.hitShockwaveMaxRadiusH,
    amplitudeL: cfg.hitShockwaveAmplitudeL,
    amplitudeM: cfg.hitShockwaveAmplitudeM,
    amplitudeH: cfg.hitShockwaveAmplitudeH,
  };
}

export function resolveHitShockwaveStrengthParams(
  params: HitShockwaveParams,
  strength: HitShockwaveStrength,
): { duration: number; maxRadius: number; amplitude: number } {
  if (strength === 'L') {
    return {
      duration: params.durationL,
      maxRadius: params.maxRadiusL,
      amplitude: params.amplitudeL,
    };
  }
  if (strength === 'H') {
    return {
      duration: params.durationH,
      maxRadius: params.maxRadiusH,
      amplitude: params.amplitudeH,
    };
  }
  return {
    duration: params.durationM,
    maxRadius: params.maxRadiusM,
    amplitude: params.amplitudeM,
  };
}

/** Ease-out expansion + fade amplitude toward the end. */
export function shockwaveEnvelope(t01: number): {
  radiusT: number;
  ampT: number;
} {
  const t = Math.min(1, Math.max(0, t01));
  const radiusT = 1 - (1 - t) * (1 - t);
  const ampT = t < 0.15 ? t / 0.15 : 1 - ((t - 0.15) / 0.85) ** 1.4;
  return { radiusT, ampT: Math.max(0, ampT) };
}

/**
 * Map NDC (Three.js: y=+1 top) → screenUV used by WebGPU TSL.
 * WGSLNodeBuilder.isFlipY() is false, so fragCoord / screenUV have y=0 at the
 * **top** of the framebuffer (not the GL bottom-left convention).
 */
export function ndcToWebgpuScreenUV(
  ndcX: number,
  ndcY: number,
): { u: number; v: number } {
  return {
    u: ndcX * 0.5 + 0.5,
    v: 0.5 - ndcY * 0.5,
  };
}

export function worldToScreenUV(
  worldX: number,
  worldY: number,
  worldZ: number,
  camera: THREE.Camera,
): { u: number; v: number; inFront: boolean } {
  camera.updateMatrixWorld(true);
  _ndc.set(worldX, worldY, worldZ).project(camera);
  const { u, v } = ndcToWebgpuScreenUV(_ndc.x, _ndc.y);
  return {
    u,
    v,
    inFront: _ndc.z >= -1 && _ndc.z <= 1,
  };
}

export class HitShockwaveFx {
  private readonly slots: WaveSlot[] = [];
  /** xy = center UV, z = radius, w = amplitude (0 = dead). */
  private readonly waveData: Array<ReturnType<typeof uniform>>;
  private readonly uThickness = uniform(0.035);
  private readonly uAspect = uniform(1);
  private readonly material: THREE.NodeMaterial;
  private readonly quad: THREE.QuadMesh;
  private params: HitShockwaveParams = createDefaultHitShockwaveParams();

  constructor() {
    this.waveData = [];
    for (let i = 0; i < HIT_SHOCKWAVE_MAX_SLOTS; i += 1) {
      this.slots.push({
        alive: false,
        age: 0,
        duration: 0.16,
        centerU: 0.5,
        centerV: 0.5,
        worldX: 0,
        worldY: 0,
        worldZ: 0,
        maxRadius: 0.3,
        amplitude: 0,
      });
      this.waveData.push(uniform(new THREE.Vector4(0.5, 0.5, 0, 0)));
    }

    const w0 = this.waveData[0]!;
    const w1 = this.waveData[1]!;
    const w2 = this.waveData[2]!;
    const w3 = this.waveData[3]!;
    const uThickness = this.uThickness;
    const uAspect = this.uAspect;

    // Nested Fn: (uv, waveData) -> UV offset contribution.
    const waveOffset = Fn(([uv, data]: any[]) => {
      const center = data.xy;
      const radius = data.z;
      const amp = data.w;
      const delta = uv.sub(center).mul(vec2(uAspect, float(1)));
      const dist = length(delta);
      const x = dist.sub(radius).div(max(uThickness, float(1e-4)));
      const band = exp(x.mul(x).negate());
      const dir = delta.div(max(dist, float(1e-4)));
      return dir.mul(amp.mul(band)).div(vec2(uAspect, float(1)));
    });

    const colorNode = Fn(() => {
      const uv = screenUV.toVar();
      const off = vec2(0, 0).toVar();
      off.addAssign(waveOffset(uv, w0));
      off.addAssign(waveOffset(uv, w1));
      off.addAssign(waveOffset(uv, w2));
      off.addAssign(waveOffset(uv, w3));
      return viewportTexture(uv.add(off));
    })();

    this.material = new THREE.NodeMaterial();
    this.material.name = 'HitShockwaveFx';
    this.material.fragmentNode = colorNode;
    this.material.depthTest = false;
    this.material.depthWrite = false;
    this.material.transparent = false;

    this.quad = new THREE.QuadMesh(this.material);
    this.quad.name = 'HitShockwaveQuad';
  }

  applyParams(params: HitShockwaveParams): void {
    this.params = params;
    this.uThickness.value = Math.max(0.001, params.thickness);
  }

  getParams(): HitShockwaveParams {
    return this.params;
  }

  hasActive(): boolean {
    return this.slots.some((s) => s.alive);
  }

  clear(): void {
    for (const s of this.slots) {
      s.alive = false;
      s.amplitude = 0;
    }
    this.syncUniforms();
  }

  /**
   * Spawn from a fixed world hit point (attack fist/foot at contact). Still
   * plays when the point is off-screen or near the edge. Call only for real
   * hits (not blocks). Screen UV is reprojected each frame for camera motion.
   */
  triggerWorld(
    worldX: number,
    worldY: number,
    worldZ: number,
    camera: THREE.Camera,
    strength: HitShockwaveStrength,
  ): void {
    if (!this.params.enabled) return;
    const band = resolveHitShockwaveStrengthParams(this.params, strength);
    if (band.duration <= 0 || band.amplitude <= 0 || band.maxRadius <= 0) {
      return;
    }

    const slot = this.acquireSlot();
    const { u, v } = worldToScreenUV(worldX, worldY, worldZ, camera);
    slot.alive = true;
    slot.age = 0;
    slot.duration = band.duration;
    slot.worldX = worldX;
    slot.worldY = worldY;
    slot.worldZ = worldZ;
    slot.centerU = u;
    slot.centerV = v;
    slot.maxRadius = band.maxRadius;
    slot.amplitude = band.amplitude;
    this.syncUniforms();
  }

  /** Spawn at normalized screen UV (debug panel). */
  triggerScreen(
    u: number,
    v: number,
    strength: HitShockwaveStrength = 'M',
  ): void {
    if (!this.params.enabled) return;
    const band = resolveHitShockwaveStrengthParams(this.params, strength);
    if (band.duration <= 0 || band.amplitude <= 0 || band.maxRadius <= 0) {
      return;
    }

    const slot = this.acquireSlot();
    slot.alive = true;
    slot.age = 0;
    slot.duration = band.duration;
    slot.worldX = 0;
    slot.worldY = 0;
    slot.worldZ = 0;
    slot.centerU = u;
    slot.centerV = v;
    slot.maxRadius = band.maxRadius;
    slot.amplitude = band.amplitude;
    this.syncUniforms();
  }

  /** Wall-clock step — not frozen by hitstop. */
  step(dtSec: number, camera?: THREE.Camera | null): void {
    if (!this.params.enabled) {
      if (this.hasActive()) this.clear();
      return;
    }
    const dt = Math.max(0, dtSec);
    for (const s of this.slots) {
      if (!s.alive) continue;
      s.age += dt;
      if (s.age >= s.duration) {
        s.alive = false;
        s.amplitude = 0;
        continue;
      }
      if (camera) this.refreshSlotScreenCenter(s, camera);
    }
    this.syncUniforms();
  }

  /**
   * After the fight color buffer is fully drawn into the current viewport.
   * Reprojects fixed world centers with the camera used for that draw.
   */
  async apply(
    renderer: THREE.WebGPURenderer,
    camera?: THREE.Camera | null,
  ): Promise<void> {
    if (!this.params.enabled || !this.hasActive()) return;

    if (camera) {
      for (const s of this.slots) {
        if (s.alive) this.refreshSlotScreenCenter(s, camera);
      }
      this.syncUniforms();
    }

    renderer.getDrawingBufferSize(_size);
    this.uAspect.value = _size.x / Math.max(_size.y, 1);

    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    try {
      await renderer.render(this.quad, this.quad.camera);
    } finally {
      renderer.autoClear = prevAutoClear;
    }
  }

  dispose(): void {
    this.clear();
    this.material.dispose();
  }

  private acquireSlot(): WaveSlot {
    const cap = Math.min(
      HIT_SHOCKWAVE_MAX_SLOTS,
      Math.max(1, Math.floor(this.params.maxConcurrent)),
    );

    for (let i = cap; i < HIT_SHOCKWAVE_MAX_SLOTS; i += 1) {
      this.slots[i]!.alive = false;
      this.slots[i]!.amplitude = 0;
    }

    let slot = this.slots.find((s, i) => i < cap && !s.alive);
    if (!slot) {
      slot = this.slots[0]!;
      for (let i = 1; i < cap; i += 1) {
        const s = this.slots[i]!;
        if (s.age > slot.age) slot = s;
      }
    }
    return slot;
  }

  private refreshSlotScreenCenter(s: WaveSlot, camera: THREE.Camera): void {
    const { u, v } = worldToScreenUV(s.worldX, s.worldY, s.worldZ, camera);
    s.centerU = u;
    s.centerV = v;
  }

  private syncUniforms(): void {
    for (let i = 0; i < HIT_SHOCKWAVE_MAX_SLOTS; i += 1) {
      const s = this.slots[i]!;
      const data = this.waveData[i]!.value as THREE.Vector4;
      if (!s.alive) {
        data.set(0.5, 0.5, 0, 0);
        continue;
      }
      const t01 = s.duration > 0 ? s.age / s.duration : 1;
      const { radiusT, ampT } = shockwaveEnvelope(t01);
      data.set(
        s.centerU,
        s.centerV,
        s.maxRadius * radiusT,
        s.amplitude * ampT,
      );
    }
  }
}
