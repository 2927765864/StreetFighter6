/**
 * Optional detach splash via three-plume (plan Step 9 / wudaAlsoPlumeBurst).
 * Does NOT replace coat stick/detach — only an extra burst at detach points.
 * Reuses plumeApi (same package as HitVfxRuntime).
 */
import * as THREE from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';
import {
  createDefaultSimConfig,
  type MutableSimConfig,
} from '../../config/constants';
import { Manager, system, type SystemDef } from '../hitVfx/plumeApi';
import { hexToRgb01 } from './wudaBodyRegions';

const PREFAB_ID = 'wuda_detach_burst';
/** Cap plume systems spawned from one coat update (many particles may detach). */
const MAX_BURSTS_PER_FLUSH = 8;

export type WudaPlumeBurstOpts = {
  renderer: WebGPURenderer;
  scene: THREE.Object3D;
  camera: THREE.Camera;
};

type QueuedDetach = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
};

const _pos = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _yUp = new THREE.Vector3(0, 1, 0);

function buildDetachBurstDef(seed: number, cfg: MutableSimConfig): SystemDef {
  const life = Math.max(0.15, Math.min(1.2, cfg.wudaFreeLifetime * 0.85));
  const count = 10;
  const sizeMin = Math.max(0.008, cfg.wudaFreeSize * 0.9);
  const sizeMax = Math.max(sizeMin, cfg.wudaFreeSize * 2.2);
  const speedMin = 0.6;
  const speedMax = Math.max(speedMin + 0.2, Math.min(4, cfg.wudaSpeedLimit * 0.35));
  const g = -Math.abs(cfg.wudaGravityPower);
  const freeRgb = hexToRgb01(cfg.wudaFreeColor);
  const c0: [number, number, number] = [freeRgb.r, freeRgb.g, freeRgb.b];
  const c1: [number, number, number] = [
    Math.min(1, freeRgb.r * 1.15),
    Math.min(1, freeRgb.g * 1.15),
    Math.min(1, freeRgb.b * 1.1),
  ];
  const blending = cfg.wudaBlendAdditive ? 'additive' : 'alpha';

  return system(`wuda_detach_${seed}`)
    .duration(life + 0.15)
    .emitter('splash', (e) =>
      e
        .capacity(Math.max(count * 2, 16))
        .duration(life + 0.1)
        .seed(seed >>> 0)
        .spawnBurst({ time: 0, count })
        .lifetime({ min: life * 0.45, max: life })
        .position({ shape: { kind: 'sphere', radius: 0.025, thickness: 1 } })
        .velocity({
          shape: { kind: 'cone', angle: 0.55 },
          speed: { min: speedMin, max: speedMax },
        })
        .size({ min: sizeMin, max: sizeMax })
        .color({ min: c0, max: c1 }, { alpha: Math.max(0.2, cfg.wudaFreeOpacity) })
        .integrate()
        .lifetimeTick()
        .drag(Math.max(0.2, cfg.wudaDrag * 0.85))
        .gravity([0, g, 0])
        .sizeOverLife([
          [0, 1],
          [0.6, 0.7],
          [1, 0.2],
        ])
        .alphaOverLife([
          [0, 1],
          [0.65, 0.55],
          [1, 0],
        ])
        .renderSprite({ blending, depthWrite: false }),
    )
    .build();
}

/**
 * Shared plume helper for both fighters. Queue detach events from the coat,
 * flush into capped spawns, tick with the match present clock.
 */
export class WudaPlumeBurst {
  private readonly manager: Manager;
  private readonly queue: QueuedDetach[] = [];
  private cfgRef: MutableSimConfig | null = null;
  private seedCounter = 0;

  constructor(opts: WudaPlumeBurstOpts) {
    this.manager = new Manager({
      renderer: opts.renderer,
      scene: opts.scene,
      camera: opts.camera,
      maxActive: 16,
      maxPoolPer: 8,
    });
    // Factory so each pooled System gets its own modules (HitVfxRuntime pattern).
    this.manager.register(PREFAB_ID, () => {
      const seed = (this.seedCounter++ * 0x9e3779b9) >>> 0;
      const cfg = this.cfgRef ?? createDefaultSimConfig();
      return buildDetachBurstDef(seed, cfg);
    });
  }

  setCamera(camera: THREE.Camera): void {
    this.manager.camera = camera;
  }

  /** Record a coat detach (world pos + free velocity). */
  queueDetach(pos: THREE.Vector3, vel: THREE.Vector3): void {
    this.queue.push({
      x: pos.x,
      y: pos.y,
      z: pos.z,
      vx: vel.x,
      vy: vel.y,
      vz: vel.z,
    });
  }

  /**
   * Spawn queued bursts (capped). Call at end of coat update when
   * cfg.wudaAlsoPlumeBurst is true.
   */
  flush(cfg: MutableSimConfig): void {
    if (!cfg.wudaAlsoPlumeBurst) {
      this.queue.length = 0;
      return;
    }
    this.cfgRef = cfg;
    let spawned = 0;
    while (this.queue.length > 0 && spawned < MAX_BURSTS_PER_FLUSH) {
      const ev = this.queue.shift()!;
      _pos.set(ev.x, ev.y, ev.z);
      _axis.set(ev.vx, ev.vy, ev.vz);
      if (_axis.lengthSq() < 1e-6) {
        _axis.set(0, 1, 0);
      } else {
        _axis.normalize();
      }
      // Local +Y = emission cone axis (same as HitVfxRuntime punch align).
      _quat.setFromUnitVectors(_yUp, _axis);
      this.manager.spawn(PREFAB_ID, {
        position: _pos,
        quaternion: _quat,
      });
      spawned++;
    }
    // Drop remainder this frame to avoid backlog spikes.
    this.queue.length = 0;
  }

  tick(deltaSec: number, camera?: THREE.Camera): void {
    const dt = Math.max(0, deltaSec);
    if (dt <= 0) return;
    this.manager.tick(dt, camera ?? this.manager.camera);
  }

  dispose(): void {
    this.queue.length = 0;
    this.manager.dispose();
  }
}
