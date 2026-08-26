/**
 * Pre-allocated PointLight pool — avoid per-hit scene.add/remove
 * (WebGPU DynamicLighting / Discourse #74708; plan §12.1).
 */
import * as THREE from 'three/webgpu';

export type PointLightHandle = number;

type Slot = {
  light: THREE.PointLight;
  inUse: boolean;
  /** Remaining life seconds; owned by Runtime. */
  lifeLeft: number;
  lifeTotal: number;
  intensityStart: number;
  intensityEnd: number;
};

export class HitVfxPointLightPool {
  readonly lights: THREE.PointLight[] = [];
  private readonly slots: Slot[] = [];
  private readonly scene: THREE.Object3D;

  constructor(scene: THREE.Object3D, size: number) {
    this.scene = scene;
    const n = Math.max(1, Math.floor(size));
    for (let i = 0; i < n; i++) {
      const light = new THREE.PointLight(0xffb060, 0, 2.8, 2);
      light.visible = false;
      light.castShadow = false;
      scene.add(light);
      this.lights.push(light);
      this.slots.push({
        light,
        inUse: false,
        lifeLeft: 0,
        lifeTotal: 0,
        intensityStart: 0,
        intensityEnd: 0,
      });
    }
  }

  get size(): number {
    return this.slots.length;
  }

  /** Count of PointLight objects under scene from this pool (for tests). */
  sceneLightCount(): number {
    return this.lights.length;
  }

  acquire(args: {
    color: number;
    intensity: number;
    intensityEnd: number;
    distance: number;
    decay: number;
    position: THREE.Vector3Like;
    lifetimeSec: number;
  }): PointLightHandle | null {
    const idx = this.slots.findIndex((s) => !s.inUse);
    if (idx < 0) return null;
    const slot = this.slots[idx]!;
    slot.inUse = true;
    slot.lifeTotal = Math.max(1e-4, args.lifetimeSec);
    slot.lifeLeft = slot.lifeTotal;
    slot.intensityStart = args.intensity;
    slot.intensityEnd = args.intensityEnd;
    const L = slot.light;
    L.color.setHex(args.color >>> 0);
    L.intensity = args.intensity;
    L.distance = args.distance;
    L.decay = args.decay;
    L.position.set(args.position.x, args.position.y, args.position.z);
    L.visible = true;
    return idx;
  }

  update(handle: PointLightHandle, dt: number): boolean {
    const slot = this.slots[handle];
    if (!slot || !slot.inUse) return false;
    slot.lifeLeft -= dt;
    const t = 1 - Math.max(0, slot.lifeLeft) / slot.lifeTotal;
    const u = Math.min(1, Math.max(0, t));
    slot.light.intensity =
      slot.intensityStart * (1 - u) + slot.intensityEnd * u;
    if (slot.lifeLeft <= 0) {
      this.release(handle);
      return false;
    }
    return true;
  }

  release(handle: PointLightHandle): void {
    const slot = this.slots[handle];
    if (!slot || !slot.inUse) return;
    slot.inUse = false;
    slot.lifeLeft = 0;
    slot.light.intensity = 0;
    slot.light.visible = false;
  }

  releaseAll(): void {
    for (let i = 0; i < this.slots.length; i++) this.release(i);
  }

  /** Active light contribution at world position (for receiveSparkLight fake light). */
  sampleIntensityAt(pos: THREE.Vector3Like): number {
    let sum = 0;
    for (const slot of this.slots) {
      if (!slot.inUse || slot.light.intensity <= 0) continue;
      const L = slot.light;
      const dx = pos.x - L.position.x;
      const dy = pos.y - L.position.y;
      const dz = pos.z - L.position.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      const atten = L.intensity / (1 + L.decay * distSq);
      sum += atten;
    }
    return sum;
  }

  dispose(): void {
    this.releaseAll();
    for (const light of this.lights) {
      this.scene.remove(light);
      light.dispose();
    }
    this.lights.length = 0;
    this.slots.length = 0;
  }
}
