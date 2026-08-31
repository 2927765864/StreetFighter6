// @ts-nocheck
import * as THREE from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';
import { HitSmokeVolume } from './HitSmokeVolume';
import { buildSpawnVariation } from './spawnSeed';

/**
 * Object pool of HitSmokeVolume instances for rapid hit bursts.
 */
export class HitSmokePool {
  renderer: WebGPURenderer;
  scene: THREE.Object3D;
  poolSize: number;
  volumes: HitSmokeVolume[];
  private _tmpNormal = new THREE.Vector3();
  private _tmpDirOS = new THREE.Vector3();
  private _quat = new THREE.Quaternion();
  private _invQuat = new THREE.Quaternion();

  constructor(
    renderer: WebGPURenderer,
    scene: THREE.Object3D,
    options: { poolSize?: number; params?: Record<string, unknown> } = {},
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.poolSize = options.poolSize ?? 4;
    this.volumes = [];

    for (let i = 0; i < this.poolSize; i++) {
      const volume = new HitSmokeVolume(renderer, options);
      this.scene.add(volume.mesh);
      this.volumes.push(volume);
    }
  }

  async init(): Promise<void> {
    for (const volume of this.volumes) {
      await volume.initCurl();
    }
  }

  spawn(
    worldPos: THREE.Vector3,
    worldNormalHit: THREE.Vector3,
    splatParams: Record<string, unknown> = {},
  ): HitSmokeVolume {
    let volume = this.volumes.find((v) => !v.active);

    if (!volume) {
      volume = this.volumes.reduce((oldest, v) =>
        v.age > oldest.age ? v : oldest,
      );
      volume.resetImmediate();
    }

    // Per-instance domain — never resize sibling volumes in the pool.
    if (splatParams.unrestricted != null) {
      volume.setUnrestricted(!!splatParams.unrestricted);
    }
    if (splatParams.volumeSize != null) {
      volume.setVolumeSize(splatParams.volumeSize as number);
    }
    if (splatParams.hitRadius != null) {
      volume.params.hitRadius = splatParams.hitRadius as number;
      volume.syncHitRadiusUVW();
    }

    volume.mesh.position.copy(worldPos);
    volume.mesh.updateMatrixWorld(true);

    this._tmpNormal.copy(worldNormalHit).normalize();
    volume.mesh.getWorldQuaternion(this._quat);
    this._invQuat.copy(this._quat).invert();
    this._tmpDirOS
      .copy(this._tmpNormal)
      .applyQuaternion(this._invQuat)
      .normalize();

    if (splatParams.seedShape != null) volume.params.seedShape = splatParams.seedShape;
    if (splatParams.shapeThickness != null)
      volume.params.shapeThickness = splatParams.shapeThickness;
    if (splatParams.ringRadiusRatio != null)
      volume.params.ringRadiusRatio = splatParams.ringRadiusRatio;
    if (splatParams.ringWidth != null) volume.params.ringWidth = splatParams.ringWidth;
    if (splatParams.columnHeight != null)
      volume.params.columnHeight = splatParams.columnHeight;
    if (splatParams.seedRotation != null)
      volume.params.seedRotation = splatParams.seedRotation;
    if (splatParams.seedOffset != null)
      volume.params.seedOffset = splatParams.seedOffset;
    if (splatParams.impulseRadial != null)
      volume.params.impulseRadial = splatParams.impulseRadial;
    if (splatParams.impulseSwirl != null)
      volume.params.impulseSwirl = splatParams.impulseSwirl;
    if (splatParams.impulseSubsteps != null)
      volume.params.impulseSubsteps = splatParams.impulseSubsteps;
    if (splatParams.impulseScaleWithBox != null)
      volume.params.impulseScaleWithBox = splatParams.impulseScaleWithBox;
    if (splatParams.impulse != null) volume.params.hitImpulse = splatParams.impulse;

    const variation =
      splatParams.variation ??
      (splatParams.spawnSeed != null
        ? buildSpawnVariation(
            splatParams.spawnSeed as number,
            splatParams.spawnVariationAmount as number | undefined,
          )
        : null);

    volume.armSplat({
      impulse: splatParams.impulse,
      density: splatParams.density,
      temperature: splatParams.temperature,
      radius: splatParams.radius,
      dirOS: this._tmpDirOS,
      centerUVW:
        (splatParams.centerUVW as THREE.Vector3 | undefined) ??
        new THREE.Vector3(0.5, 0.5, 0.5),
      variation,
    });

    return volume;
  }

  /** Step every active volume with the same params (legacy / single-smoke). */
  update(realDelta: number, simParams: Record<string, unknown>): void {
    for (const volume of this.volumes) {
      if (!volume.active) continue;
      volume.stepSimulation(realDelta, simParams);
    }
  }

  /** Step one volume with its own params (multi volumeSmoke isolation). */
  updateVolume(
    volume: HitSmokeVolume,
    realDelta: number,
    simParams: Record<string, unknown>,
  ): void {
    if (!volume.active) return;
    volume.stepSimulation(realDelta, simParams);
  }

  async rebuild(
    poolSize: number,
    gridOptions: { params?: Record<string, unknown> } = {},
  ): Promise<void> {
    for (const volume of this.volumes) {
      this.scene.remove(volume.mesh);
      volume.dispose?.();
    }

    this.poolSize = poolSize;
    this.volumes = [];

    for (let i = 0; i < this.poolSize; i++) {
      const volume = new HitSmokeVolume(this.renderer, gridOptions);
      this.scene.add(volume.mesh);
      this.volumes.push(volume);
    }

    await this.init();
  }

  setVolumeSize(size: number): void {
    for (const volume of this.volumes) {
      volume.setVolumeSize(size);
    }
  }

  setHitRadiusWorld(radiusWorld: number): void {
    for (const volume of this.volumes) {
      volume.params.hitRadius = radiusWorld;
      volume.syncHitRadiusUVW();
    }
  }

  setUnrestricted(unrestricted: boolean): void {
    for (const volume of this.volumes) {
      volume.setUnrestricted(unrestricted);
    }
  }

  resetAll(): void {
    for (const volume of this.volumes) {
      if (volume.active) volume.resetImmediate();
    }
  }

  syncKeyLightPos(pos: THREE.Vector3): void {
    for (const volume of this.volumes) {
      volume.uKeyLightPos.value.copy(pos);
    }
  }

  dispose(): void {
    for (const volume of this.volumes) {
      this.scene.remove(volume.mesh);
      volume.dispose?.();
    }
    this.volumes = [];
  }
}
