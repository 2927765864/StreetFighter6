/**
 * Screen-space hit glow: soft radial bloom ball at the hit point.
 * Additive over the framebuffer — does not light geometry.
 *
 * Peak at spawn, then radius + intensity ease-out together (wall-clock).
 * Multiple glows up to a cap. WebGPU fullscreen QuadMesh samples
 * viewportTexture and adds the glow contribution.
 */

import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec2,
  vec3,
  uniform,
  screenUV,
  viewportTexture,
  length,
  max,
  exp,
} from 'three/tsl';
import { worldToScreenUV } from './HitShockwaveFx';

export const HIT_GLOW_MAX_SLOTS = 4;

export type HitGlowStrength = 'L' | 'M' | 'H';

export type HitGlowParams = {
  enabled: boolean;
  maxConcurrent: number;
  /** Soft-disk falloff power (higher = tighter core). */
  hardness: number;
  /** RGB hex, e.g. 0xffb060. */
  color: number;
  durationL: number;
  durationM: number;
  durationH: number;
  maxRadiusL: number;
  maxRadiusM: number;
  maxRadiusH: number;
  intensityL: number;
  intensityM: number;
  intensityH: number;
};

type GlowSlot = {
  alive: boolean;
  age: number;
  duration: number;
  centerU: number;
  centerV: number;
  worldX: number;
  worldY: number;
  worldZ: number;
  /** Screen UV when spawned via triggerScreen (no world reproject). */
  screenPinned: boolean;
  maxRadius: number;
  intensity: number;
};

const _size = new THREE.Vector2();

export function createDefaultHitGlowParams(): HitGlowParams {
  return {
    enabled: true,
    maxConcurrent: 4,
    hardness: 2.5,
    color: 0xffb060,
    durationL: 0.1,
    durationM: 0.14,
    durationH: 0.2,
    maxRadiusL: 0.06,
    maxRadiusM: 0.09,
    maxRadiusH: 0.13,
    intensityL: 0.85,
    intensityM: 1.1,
    intensityH: 1.4,
  };
}

export function hitGlowParamsFromConfig(cfg: {
  hitGlowEnabled: boolean;
  hitGlowMaxConcurrent: number;
  hitGlowHardness: number;
  hitGlowColor: number;
  hitGlowDurationL: number;
  hitGlowDurationM: number;
  hitGlowDurationH: number;
  hitGlowMaxRadiusL: number;
  hitGlowMaxRadiusM: number;
  hitGlowMaxRadiusH: number;
  hitGlowIntensityL: number;
  hitGlowIntensityM: number;
  hitGlowIntensityH: number;
}): HitGlowParams {
  return {
    enabled: cfg.hitGlowEnabled,
    maxConcurrent: cfg.hitGlowMaxConcurrent,
    hardness: cfg.hitGlowHardness,
    color: cfg.hitGlowColor,
    durationL: cfg.hitGlowDurationL,
    durationM: cfg.hitGlowDurationM,
    durationH: cfg.hitGlowDurationH,
    maxRadiusL: cfg.hitGlowMaxRadiusL,
    maxRadiusM: cfg.hitGlowMaxRadiusM,
    maxRadiusH: cfg.hitGlowMaxRadiusH,
    intensityL: cfg.hitGlowIntensityL,
    intensityM: cfg.hitGlowIntensityM,
    intensityH: cfg.hitGlowIntensityH,
  };
}

export function resolveHitGlowStrengthParams(
  params: HitGlowParams,
  strength: HitGlowStrength,
): { duration: number; maxRadius: number; intensity: number } {
  if (strength === 'L') {
    return {
      duration: params.durationL,
      maxRadius: params.maxRadiusL,
      intensity: params.intensityL,
    };
  }
  if (strength === 'H') {
    return {
      duration: params.durationH,
      maxRadius: params.maxRadiusH,
      intensity: params.intensityH,
    };
  }
  return {
    duration: params.durationM,
    maxRadius: params.maxRadiusM,
    intensity: params.intensityM,
  };
}

/**
 * Peak at t=0: radiusT=1, intensityT=1.
 * Ease-out shrink + fade: (1-t)^2 for both.
 */
export function glowEnvelope(t01: number): {
  radiusT: number;
  intensityT: number;
} {
  const t = Math.min(1, Math.max(0, t01));
  const remain = 1 - t;
  const ease = remain * remain;
  return { radiusT: ease, intensityT: ease };
}

const _color = new THREE.Color();

export class HitGlowFx {
  private readonly slots: GlowSlot[] = [];
  /** xy = center UV, z = radius, w = intensity (0 = dead). */
  readonly glowData: Array<ReturnType<typeof uniform>>;
  readonly uHardness = uniform(2.5);
  private readonly uAspect = uniform(1);
  readonly uColor = uniform(new THREE.Vector3(1, 0.69, 0.376));
  private readonly material: THREE.NodeMaterial;
  private readonly quad: THREE.QuadMesh;
  private params: HitGlowParams = createDefaultHitGlowParams();

  constructor() {
    this.glowData = [];
    for (let i = 0; i < HIT_GLOW_MAX_SLOTS; i += 1) {
      this.slots.push({
        alive: false,
        age: 0,
        duration: 0.14,
        centerU: 0.5,
        centerV: 0.5,
        worldX: 0,
        worldY: 0,
        worldZ: 0,
        screenPinned: false,
        maxRadius: 0.09,
        intensity: 0,
      });
      this.glowData.push(uniform(new THREE.Vector4(0.5, 0.5, 0, 0)));
    }

    const g0 = this.glowData[0]!;
    const g1 = this.glowData[1]!;
    const g2 = this.glowData[2]!;
    const g3 = this.glowData[3]!;
    const uHardness = this.uHardness;
    const uAspect = this.uAspect;
    const uColor = this.uColor;

    const softDisk = Fn(([uv, data]: any[]) => {
      const center = data.xy;
      const radius = data.z;
      const intensity = data.w;
      const delta = uv.sub(center).mul(vec2(uAspect, float(1)));
      const dist = length(delta);
      const r = max(radius, float(1e-4));
      const x = dist.div(r);
      const falloff = exp(x.mul(x).mul(uHardness).negate());
      return falloff.mul(intensity);
    });

    const colorNode = Fn(() => {
      const uv = screenUV.toVar();
      const base = viewportTexture(uv).toVar();
      const w = float(0).toVar();
      w.addAssign(softDisk(uv, g0));
      w.addAssign(softDisk(uv, g1));
      w.addAssign(softDisk(uv, g2));
      w.addAssign(softDisk(uv, g3));
      const glow = vec3(uColor).mul(w);
      return base.add(glow);
    })();

    this.material = new THREE.NodeMaterial();
    this.material.name = 'HitGlowFx';
    this.material.fragmentNode = colorNode;
    this.material.depthTest = false;
    this.material.depthWrite = false;
    this.material.transparent = false;

    this.quad = new THREE.QuadMesh(this.material);
    this.quad.name = 'HitGlowQuad';
  }

  applyParams(params: HitGlowParams): void {
    this.params = params;
    this.uHardness.value = Math.max(0.1, params.hardness);
    _color.setHex(params.color >>> 0);
    (this.uColor.value as THREE.Vector3).set(_color.r, _color.g, _color.b);
  }

  getParams(): HitGlowParams {
    return this.params;
  }

  hasActive(): boolean {
    return this.slots.some((s) => s.alive);
  }

  clear(): void {
    for (const s of this.slots) {
      s.alive = false;
      s.intensity = 0;
    }
    this.syncUniforms();
  }

  /**
   * Spawn from a fixed world hit point. Screen UV is reprojected each frame.
   * Call only for real hits (not blocks).
   */
  triggerWorld(
    worldX: number,
    worldY: number,
    worldZ: number,
    camera: THREE.Camera,
    strength: HitGlowStrength,
  ): void {
    if (!this.params.enabled) return;
    const band = resolveHitGlowStrengthParams(this.params, strength);
    if (band.duration <= 0 || band.intensity <= 0 || band.maxRadius <= 0) {
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
    slot.screenPinned = false;
    slot.centerU = u;
    slot.centerV = v;
    slot.maxRadius = band.maxRadius;
    slot.intensity = band.intensity;
    this.syncUniforms();
  }

  /** Spawn at normalized screen UV (debug panel). */
  triggerScreen(
    u: number,
    v: number,
    strength: HitGlowStrength = 'M',
  ): void {
    if (!this.params.enabled) return;
    const band = resolveHitGlowStrengthParams(this.params, strength);
    if (band.duration <= 0 || band.intensity <= 0 || band.maxRadius <= 0) {
      return;
    }

    const slot = this.acquireSlot();
    slot.alive = true;
    slot.age = 0;
    slot.duration = band.duration;
    slot.worldX = 0;
    slot.worldY = 0;
    slot.worldZ = 0;
    slot.screenPinned = true;
    slot.centerU = u;
    slot.centerV = v;
    slot.maxRadius = band.maxRadius;
    slot.intensity = band.intensity;
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
        s.intensity = 0;
        continue;
      }
      if (camera && !s.screenPinned) this.refreshSlotScreenCenter(s, camera);
    }
    this.syncUniforms();
  }

  /**
   * After the fight color buffer (and optional shockwave) are drawn.
   * Reprojects fixed world centers with the camera used for that draw.
   */
  prepareForDraw(camera?: THREE.Camera | null): void {
    if (!camera) return;
    for (const s of this.slots) {
      if (s.alive && !s.screenPinned) this.refreshSlotScreenCenter(s, camera);
    }
    this.syncUniforms();
  }

  apply(
    renderer: THREE.WebGPURenderer,
    camera?: THREE.Camera | null,
  ): void {
    if (!this.params.enabled || !this.hasActive()) return;

    this.prepareForDraw(camera);

    renderer.getDrawingBufferSize(_size);
    this.uAspect.value = _size.x / Math.max(_size.y, 1);

    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    try {
      // Sync after renderer.init() (three r185; setAnimationLoop must not await).
      renderer.render(this.quad, this.quad.camera);
    } finally {
      renderer.autoClear = prevAutoClear;
    }
  }

  dispose(): void {
    this.clear();
    this.material.dispose();
  }

  private acquireSlot(): GlowSlot {
    const cap = Math.min(
      HIT_GLOW_MAX_SLOTS,
      Math.max(1, Math.floor(this.params.maxConcurrent)),
    );

    for (let i = cap; i < HIT_GLOW_MAX_SLOTS; i += 1) {
      this.slots[i]!.alive = false;
      this.slots[i]!.intensity = 0;
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

  private refreshSlotScreenCenter(s: GlowSlot, camera: THREE.Camera): void {
    const { u, v } = worldToScreenUV(s.worldX, s.worldY, s.worldZ, camera);
    s.centerU = u;
    s.centerV = v;
  }

  private syncUniforms(): void {
    for (let i = 0; i < HIT_GLOW_MAX_SLOTS; i += 1) {
      const s = this.slots[i]!;
      const data = this.glowData[i]!.value as THREE.Vector4;
      if (!s.alive) {
        data.set(0.5, 0.5, 0, 0);
        continue;
      }
      const t01 = s.duration > 0 ? s.age / s.duration : 1;
      const { radiusT, intensityT } = glowEnvelope(t01);
      data.set(
        s.centerU,
        s.centerV,
        s.maxRadius * radiusT,
        s.intensity * intensityT,
      );
    }
  }
}
