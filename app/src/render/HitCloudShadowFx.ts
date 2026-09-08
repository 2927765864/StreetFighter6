/**
 * Screen-space hit cloud shadow: dark radial spokes with light noise breakup.
 * Mid-pass after fighters, before 2D hit VFX — multiply/mix darken only.
 *
 * Peak at spawn, then radius + intensity ease-out together (wall-clock).
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
  min,
  exp,
  abs,
  cos,
  sin,
  atan,
  mix,
  clamp,
  step,
} from 'three/tsl';
import { snoise } from 'three/addons/tsl/math/curlNoise.js';
import { worldToScreenUV } from './HitShockwaveFx';

export const HIT_CLOUD_SHADOW_MAX_SLOTS = 4;
/** Hard unroll cap for discrete spokes in the TSL pass (panel max is 16). */
export const HIT_CLOUD_SHADOW_MAX_SPOKES = 16;

const TAU = Math.PI * 2;

export type HitCloudShadowStrength = 'L' | 'M' | 'H';

export type HitCloudShadowParams = {
  enabled: boolean;
  maxConcurrent: number;
  /** Number of dark radial spokes. */
  spokeCount: number;
  /** 0 = thin/sharp, 1 = wide/soft lobes. */
  spokeWidth: number;
  /**
   * 0 = equal gaps between adjacent spokes;
   * 1 = each spoke angle jittered independently → uneven gaps.
   */
  spokeSpacingNoise: number;
  /** Radial falloff power (higher = tighter disk). */
  hardness: number;
  /** 0..1 edge/organic breakup via snoise. */
  noiseAmount: number;
  /** Shadow tint hex (multiply target), e.g. 0x1a2030. */
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

type ShadowSlot = {
  alive: boolean;
  age: number;
  duration: number;
  centerU: number;
  centerV: number;
  worldX: number;
  worldY: number;
  worldZ: number;
  screenPinned: boolean;
  maxRadius: number;
  intensity: number;
  /** Baked spoke center angles (radians). Inactive entries = -1000. */
  spokeAngles: number[];
};

const _size = new THREE.Vector2();

/** Deterministic hash → roughly [-1, 1]. Must stay discontinuous in spokeIndex. */
export function spokeJitterHash(spokeIndex: number, seed: number): number {
  // Two-mix hash so nearby seeds / indices don't stay correlated (unlike snoise).
  let n = Math.sin(spokeIndex * 127.1 + seed * 311.7) * 43758.5453;
  n = n - Math.floor(n);
  n = Math.sin((n + spokeIndex) * 269.5 + seed * 97.3) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

/**
 * Discrete spoke center angles in radians.
 * When spacingNoise=0 → equal gaps; when >0 → uneven adjacent gaps.
 */
export function jitteredSpokeAngles(
  count: number,
  spacingNoise: number,
  seed: number,
): number[] {
  const n = Math.max(
    1,
    Math.min(HIT_CLOUD_SHADOW_MAX_SPOKES, Math.floor(count)),
  );
  const gap = TAU / n;
  const amp = Math.min(1, Math.max(0, spacingNoise)) * gap * 0.95;
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push(i * gap + spokeJitterHash(i, seed) * amp);
  }
  return out;
}

/** Adjacent gaps (including wrap-around). Equal when spacingNoise=0. */
export function spokeAdjacentGaps(angles: number[]): number[] {
  if (angles.length === 0) return [];
  const sorted = [...angles].map((a) => ((a % TAU) + TAU) % TAU).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const a = sorted[i]!;
    const b = sorted[(i + 1) % sorted.length]!;
    gaps.push(i + 1 === sorted.length ? b + TAU - a : b - a);
  }
  return gaps;
}

export function createDefaultHitCloudShadowParams(): HitCloudShadowParams {
  return {
    enabled: true,
    maxConcurrent: 4,
    spokeCount: 6,
    spokeWidth: 0.45,
    spokeSpacingNoise: 0.65,
    hardness: 2.0,
    noiseAmount: 0.35,
    color: 0x1a2030,
    durationL: 0.1,
    durationM: 0.14,
    durationH: 0.2,
    maxRadiusL: 0.1,
    maxRadiusM: 0.14,
    maxRadiusH: 0.2,
    intensityL: 0.45,
    intensityM: 0.6,
    intensityH: 0.75,
  };
}

export function hitCloudShadowParamsFromConfig(cfg: {
  hitCloudShadowEnabled: boolean;
  hitCloudShadowMaxConcurrent: number;
  hitCloudShadowSpokeCount: number;
  hitCloudShadowSpokeWidth: number;
  hitCloudShadowSpokeSpacingNoise: number;
  hitCloudShadowHardness: number;
  hitCloudShadowNoiseAmount: number;
  hitCloudShadowColor: number;
  hitCloudShadowDurationL: number;
  hitCloudShadowDurationM: number;
  hitCloudShadowDurationH: number;
  hitCloudShadowMaxRadiusL: number;
  hitCloudShadowMaxRadiusM: number;
  hitCloudShadowMaxRadiusH: number;
  hitCloudShadowIntensityL: number;
  hitCloudShadowIntensityM: number;
  hitCloudShadowIntensityH: number;
}): HitCloudShadowParams {
  return {
    enabled: cfg.hitCloudShadowEnabled,
    maxConcurrent: cfg.hitCloudShadowMaxConcurrent,
    spokeCount: cfg.hitCloudShadowSpokeCount,
    spokeWidth: cfg.hitCloudShadowSpokeWidth,
    spokeSpacingNoise: cfg.hitCloudShadowSpokeSpacingNoise,
    hardness: cfg.hitCloudShadowHardness,
    noiseAmount: cfg.hitCloudShadowNoiseAmount,
    color: cfg.hitCloudShadowColor,
    durationL: cfg.hitCloudShadowDurationL,
    durationM: cfg.hitCloudShadowDurationM,
    durationH: cfg.hitCloudShadowDurationH,
    maxRadiusL: cfg.hitCloudShadowMaxRadiusL,
    maxRadiusM: cfg.hitCloudShadowMaxRadiusM,
    maxRadiusH: cfg.hitCloudShadowMaxRadiusH,
    intensityL: cfg.hitCloudShadowIntensityL,
    intensityM: cfg.hitCloudShadowIntensityM,
    intensityH: cfg.hitCloudShadowIntensityH,
  };
}

export function resolveHitCloudShadowStrengthParams(
  params: HitCloudShadowParams,
  strength: HitCloudShadowStrength,
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

/** Peak at t=0; ease-out shrink + fade. */
export function cloudShadowEnvelope(t01: number): {
  radiusT: number;
  intensityT: number;
} {
  const t = Math.min(1, Math.max(0, t01));
  const remain = 1 - t;
  const ease = remain * remain;
  return { radiusT: ease, intensityT: ease };
}

export class HitCloudShadowFx {
  private readonly slots: ShadowSlot[] = [];
  /** xy = center UV, z = radius, w = intensity (0 = dead). */
  private readonly shadowData: Array<ReturnType<typeof uniform>>;
  /**
   * Per slot: 4×Vector4 = 16 baked spoke angles (CPU hash).
   * Inactive angle = -1000 so the shader can gate with step.
   */
  private readonly anglePacks: Array<
    [
      ReturnType<typeof uniform>,
      ReturnType<typeof uniform>,
      ReturnType<typeof uniform>,
      ReturnType<typeof uniform>,
    ]
  >;
  private readonly uSpokeCount = uniform(6);
  private readonly uSpokeWidth = uniform(0.45);
  private readonly uHardness = uniform(2);
  private readonly uNoiseAmount = uniform(0.35);
  private readonly uAspect = uniform(1);
  private readonly uColor = uniform(new THREE.Vector3(0.102, 0.125, 0.188));
  private readonly material: THREE.NodeMaterial;
  private readonly quad: THREE.QuadMesh;
  private params: HitCloudShadowParams = createDefaultHitCloudShadowParams();

  constructor() {
    this.shadowData = [];
    this.anglePacks = [];
    for (let i = 0; i < HIT_CLOUD_SHADOW_MAX_SLOTS; i += 1) {
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
        maxRadius: 0.14,
        intensity: 0,
        spokeAngles: Array.from(
          { length: HIT_CLOUD_SHADOW_MAX_SPOKES },
          () => -1000,
        ),
      });
      this.shadowData.push(uniform(new THREE.Vector4(0.5, 0.5, 0, 0)));
      this.anglePacks.push([
        uniform(new THREE.Vector4(-1000, -1000, -1000, -1000)),
        uniform(new THREE.Vector4(-1000, -1000, -1000, -1000)),
        uniform(new THREE.Vector4(-1000, -1000, -1000, -1000)),
        uniform(new THREE.Vector4(-1000, -1000, -1000, -1000)),
      ]);
    }

    const s0 = this.shadowData[0]!;
    const s1 = this.shadowData[1]!;
    const s2 = this.shadowData[2]!;
    const s3 = this.shadowData[3]!;
    const a0 = this.anglePacks[0]!;
    const a1 = this.anglePacks[1]!;
    const a2 = this.anglePacks[2]!;
    const a3 = this.anglePacks[3]!;
    const uSpokeCount = this.uSpokeCount;
    const uSpokeWidth = this.uSpokeWidth;
    const uHardness = this.uHardness;
    const uNoiseAmount = this.uNoiseAmount;
    const uAspect = this.uAspect;
    const uColor = this.uColor;

    const angleAt = (
      packs: [
        ReturnType<typeof uniform>,
        ReturnType<typeof uniform>,
        ReturnType<typeof uniform>,
        ReturnType<typeof uniform>,
      ],
      index: number,
    ) => {
      const pack = packs[(index / 4) | 0]!;
      const c = index & 3;
      if (c === 0) return pack.x;
      if (c === 1) return pack.y;
      if (c === 2) return pack.z;
      return pack.w;
    };

    /** Capture packs in closure — TSL Fn args cannot reliably pass JS arrays. */
    const makeSpokeMask = (
      data: ReturnType<typeof uniform>,
      packs: [
        ReturnType<typeof uniform>,
        ReturnType<typeof uniform>,
        ReturnType<typeof uniform>,
        ReturnType<typeof uniform>,
      ],
    ) =>
      Fn(([uv]: any[]) => {
        const center = data.xy;
        const radius = data.z;
        const intensity = data.w;
        const delta = uv.sub(center).mul(vec2(uAspect, float(1)));
        const dist = length(delta);
        const r = max(radius, float(1e-4));
        const x = dist.div(r);
        const radial = exp(x.mul(x).mul(uHardness).negate());

        const angle = atan(delta.y, delta.x);
        const count = max(uSpokeCount, float(1));
        const widthT = clamp(uSpokeWidth, float(0), float(1));
        const gap = float(TAU).div(count);
        const halfWidth = gap.mul(mix(float(0.1), float(0.4), widthT));

        const spokeSum = float(0).toVar();
        for (let i = 0; i < HIT_CLOUD_SHADOW_MAX_SPOKES; i += 1) {
          const spokeAng = angleAt(packs, i);
          const gate = step(float(-100), spokeAng);
          const diff = angle.sub(spokeAng);
          const angDist = abs(atan(sin(diff), cos(diff)));
          const tAng = angDist.div(max(halfWidth, float(1e-4)));
          const lobe = exp(tAng.mul(tAng).negate());
          spokeSum.addAssign(lobe.mul(gate));
        }
        const spokes = min(spokeSum, float(1));

        const n = snoise(vec3(delta.mul(float(7)), data.x.add(data.y)));
        const n01 = n.mul(float(0.5)).add(float(0.5));
        const noiseMod = float(1).sub(
          clamp(uNoiseAmount, float(0), float(1)).mul(n01),
        );

        return radial.mul(spokes).mul(noiseMod).mul(intensity);
      });

    const mask0 = makeSpokeMask(s0, a0);
    const mask1 = makeSpokeMask(s1, a1);
    const mask2 = makeSpokeMask(s2, a2);
    const mask3 = makeSpokeMask(s3, a3);

    const colorNode = Fn(() => {
      const uv = screenUV.toVar();
      const base = viewportTexture(uv).toVar();
      const w = float(0).toVar();
      w.addAssign(mask0(uv));
      w.addAssign(mask1(uv));
      w.addAssign(mask2(uv));
      w.addAssign(mask3(uv));
      const weight = min(w, float(1));
      const shadowed = base.mul(vec3(uColor));
      return mix(base, shadowed, weight);
    })();

    this.material = new THREE.NodeMaterial();
    this.material.name = 'HitCloudShadowFx';
    this.material.fragmentNode = colorNode;
    this.material.depthTest = false;
    this.material.depthWrite = false;
    this.material.transparent = false;

    this.quad = new THREE.QuadMesh(this.material);
    this.quad.name = 'HitCloudShadowQuad';
  }

  applyParams(params: HitCloudShadowParams): void {
    this.params = params;
    this.uSpokeCount.value = Math.max(1, params.spokeCount);
    this.uSpokeWidth.value = Math.min(1, Math.max(0, params.spokeWidth));
    this.uHardness.value = Math.max(0.1, params.hardness);
    this.uNoiseAmount.value = Math.min(1, Math.max(0, params.noiseAmount));
    const c = new THREE.Color(params.color >>> 0);
    (this.uColor.value as THREE.Vector3).set(c.r, c.g, c.b);
  }

  getParams(): HitCloudShadowParams {
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

  triggerWorld(
    worldX: number,
    worldY: number,
    worldZ: number,
    camera: THREE.Camera,
    strength: HitCloudShadowStrength,
  ): void {
    if (!this.params.enabled) return;
    const band = resolveHitCloudShadowStrengthParams(this.params, strength);
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
    this.bakeSpokeAngles(slot);
    this.syncUniforms();
  }

  triggerScreen(
    u: number,
    v: number,
    strength: HitCloudShadowStrength = 'M',
  ): void {
    if (!this.params.enabled) return;
    const band = resolveHitCloudShadowStrengthParams(this.params, strength);
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
    this.bakeSpokeAngles(slot);
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
   * Mid-pass: call after fighters are in the color buffer, before hitVfxScene.
   */
  async apply(
    renderer: THREE.WebGPURenderer,
    camera?: THREE.Camera | null,
  ): Promise<void> {
    if (!this.params.enabled || !this.hasActive()) return;

    if (camera) {
      for (const s of this.slots) {
        if (s.alive && !s.screenPinned) this.refreshSlotScreenCenter(s, camera);
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

  private acquireSlot(): ShadowSlot {
    const cap = Math.min(
      HIT_CLOUD_SHADOW_MAX_SLOTS,
      Math.max(1, Math.floor(this.params.maxConcurrent)),
    );

    for (let i = cap; i < HIT_CLOUD_SHADOW_MAX_SLOTS; i += 1) {
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

  private refreshSlotScreenCenter(s: ShadowSlot, camera: THREE.Camera): void {
    const { u, v } = worldToScreenUV(s.worldX, s.worldY, s.worldZ, camera);
    s.centerU = u;
    s.centerV = v;
  }

  /** CPU-bake uneven spoke angles for this hit (new seed every trigger). */
  private bakeSpokeAngles(slot: ShadowSlot): void {
    const seed = Math.random() * 1_000_000;
    const baseRot = Math.random() * TAU;
    const angles = jitteredSpokeAngles(
      this.params.spokeCount,
      this.params.spokeSpacingNoise,
      seed,
    );
    for (let i = 0; i < HIT_CLOUD_SHADOW_MAX_SPOKES; i += 1) {
      slot.spokeAngles[i] =
        i < angles.length ? angles[i]! + baseRot : -1000;
    }
  }

  private syncUniforms(): void {
    for (let i = 0; i < HIT_CLOUD_SHADOW_MAX_SLOTS; i += 1) {
      const s = this.slots[i]!;
      const data = this.shadowData[i]!.value as THREE.Vector4;
      const packs = this.anglePacks[i]!;
      if (!s.alive) {
        data.set(0.5, 0.5, 0, 0);
        for (const p of packs) {
          (p.value as THREE.Vector4).set(-1000, -1000, -1000, -1000);
        }
        continue;
      }
      const t01 = s.duration > 0 ? s.age / s.duration : 1;
      const { radiusT, intensityT } = cloudShadowEnvelope(t01);
      data.set(
        s.centerU,
        s.centerV,
        s.maxRadius * radiusT,
        s.intensity * intensityT,
      );
      for (let p = 0; p < 4; p += 1) {
        const base = p * 4;
        (packs[p]!.value as THREE.Vector4).set(
          s.spokeAngles[base] ?? -1000,
          s.spokeAngles[base + 1] ?? -1000,
          s.spokeAngles[base + 2] ?? -1000,
          s.spokeAngles[base + 3] ?? -1000,
        );
      }
    }
  }
}
