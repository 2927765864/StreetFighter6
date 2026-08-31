import * as THREE from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';
import type { LightRig } from '../../LightRig';
import type {
  VolumeSmokeLightingMode,
  VolumeSmokeParams,
  VolumeSmokeToneMapping,
} from '../hitVfxTypes';

const TONE_MAP: Record<VolumeSmokeToneMapping, THREE.ToneMapping> = {
  None: THREE.NoToneMapping,
  Linear: THREE.LinearToneMapping,
  Reinhard: THREE.ReinhardToneMapping,
  Cineon: THREE.CineonToneMapping,
  ACESFilmic: THREE.ACESFilmicToneMapping,
  AgX: THREE.AgXToneMapping,
  Neutral: THREE.NeutralToneMapping,
};

const KEY_LIGHT_POS = new THREE.Vector3(-4, 8, 4);

/**
 * Dual lighting bridge for volume smoke in the hit-VFX overlay scene.
 *
 * VolumeNodeMaterial's VolumetricLightingModel multiplies custom scattering by
 * collected analytic Point/Spot lights. With no such lights the smoke is black.
 * These helpers live only in the overlay scene, so they never illuminate the
 * fight stage / fighters during the main passes.
 *
 * - original: Spot/Point key + optional host tone mapping
 * - project: proxy PointLight at LightRig-derived `uKeyLightPos`
 */
export class VolumeSmokeLighting {
  private readonly scene: THREE.Scene;
  private readonly renderer: WebGPURenderer;
  private lightRig: LightRig | null = null;
  private readonly mutateHostToneMapping: boolean;

  private spotKeyLight: THREE.SpotLight;
  private pointKeyLight: THREE.PointLight;
  private keyLight: THREE.Light;
  private debugFloor: THREE.Mesh;
  private fillLight: THREE.AmbientLight;

  private hostToneMapping: THREE.ToneMapping | null = null;
  private hostExposure: number | null = null;
  private appliedOriginalTone = false;
  private lastMode: VolumeSmokeLightingMode | null = null;

  readonly keyLightWorldPos = new THREE.Vector3().copy(KEY_LIGHT_POS);

  constructor(args: {
    scene: THREE.Scene;
    renderer: WebGPURenderer;
    lightRig?: LightRig | null;
    /**
     * When true, original mode rewrites renderer toneMapping/exposure.
     * Default false: shared hosts must not flash the whole frame when smoke spawns.
     */
    mutateHostToneMapping?: boolean;
  }) {
    this.scene = args.scene;
    this.renderer = args.renderer;
    this.lightRig = args.lightRig ?? null;
    this.mutateHostToneMapping = !!args.mutateHostToneMapping;

    this.spotKeyLight = new THREE.SpotLight(0xffffff, 800);
    this.spotKeyLight.position.copy(KEY_LIGHT_POS);
    this.spotKeyLight.angle = Math.PI / 5;
    this.spotKeyLight.penumbra = 1;
    this.spotKeyLight.castShadow = false;
    this.spotKeyLight.target.position.set(0, 0, 0);
    this.spotKeyLight.visible = false;
    this.scene.add(this.spotKeyLight);
    this.scene.add(this.spotKeyLight.target);

    // Finite distance required: VolumetricLightingModel ignores lights with
    // `distance === undefined` (directionals). `0` means no cutoff in three.js.
    this.pointKeyLight = new THREE.PointLight(0xffffff, 800, 0, 2);
    this.pointKeyLight.position.copy(KEY_LIGHT_POS);
    this.pointKeyLight.castShadow = false;
    this.pointKeyLight.visible = false;
    this.scene.add(this.pointKeyLight);

    this.fillLight = new THREE.AmbientLight(0x404050, 0);
    this.fillLight.visible = false;
    this.scene.add(this.fillLight);

    this.debugFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0x111115, roughness: 0.85 }),
    );
    this.debugFloor.rotation.x = -Math.PI / 2;
    this.debugFloor.receiveShadow = true;
    this.debugFloor.visible = false;
    this.debugFloor.renderOrder = -1;
    this.scene.add(this.debugFloor);

    this.keyLight = this.spotKeyLight;
  }

  setLightRig(rig: LightRig | null): void {
    this.lightRig = rig;
  }

  /**
   * Apply lighting for the active volume-smoke params (usually the last spawned
   * or first enabled element in the recipe).
   */
  apply(params: VolumeSmokeParams | null): void {
    if (!params) {
      this.teardownOriginal();
      this.spotKeyLight.visible = false;
      this.pointKeyLight.visible = false;
      this.fillLight.visible = false;
      this.debugFloor.visible = false;
      this.lastMode = null;
      return;
    }

    if (params.lightingMode === 'original') {
      this.applyOriginal(params);
    } else {
      this.applyProject(params);
    }
    this.lastMode = params.lightingMode;
  }

  /** World-space key light position for uKeyLightPos sync. */
  syncKeyLightPos(): THREE.Vector3 {
    if (this.lastMode === 'project') {
      this.resolveProjectKeyPos(this.keyLightWorldPos);
      // Keep the proxy PointLight in sync so VolumetricLightingModel matches.
      this.pointKeyLight.position.copy(this.keyLightWorldPos);
    } else {
      this.keyLightWorldPos.copy(this.keyLight.position);
    }
    return this.keyLightWorldPos;
  }

  private applyOriginal(params: VolumeSmokeParams): void {
    if (this.mutateHostToneMapping) {
      if (!this.appliedOriginalTone) {
        this.hostToneMapping = this.renderer.toneMapping;
        this.hostExposure = this.renderer.toneMappingExposure;
        this.appliedOriginalTone = true;
      }
      this.renderer.toneMapping =
        TONE_MAP[params.toneMapping] ?? THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = params.exposure;
    }

    const global = !!params.globalLight;
    this.spotKeyLight.visible = !global;
    this.pointKeyLight.visible = global;
    this.spotKeyLight.intensity = params.keyLightIntensity;
    this.pointKeyLight.intensity = params.keyLightIntensity;
    this.keyLight = global ? this.pointKeyLight : this.spotKeyLight;

    this.fillLight.intensity = 0.35;
    this.fillLight.visible = true;
    this.debugFloor.visible = !!params.showFloor;
  }

  private applyProject(params: VolumeSmokeParams): void {
    this.teardownOriginal();
    // Overlay scene has no LightRig lights — keep a proxy PointLight so
    // VolumeNodeMaterial is not multiplied by an empty light list.
    this.resolveProjectKeyPos(this.keyLightWorldPos);
    this.spotKeyLight.visible = false;
    this.pointKeyLight.visible = true;
    this.pointKeyLight.position.copy(this.keyLightWorldPos);
    this.pointKeyLight.intensity = Math.max(1, params.keyLightIntensity || 800);
    this.keyLight = this.pointKeyLight;
    this.fillLight.visible = false;
    this.debugFloor.visible = !!params.showFloor;
  }

  private teardownOriginal(): void {
    if (this.appliedOriginalTone) {
      if (this.hostToneMapping != null) {
        this.renderer.toneMapping = this.hostToneMapping;
      }
      if (this.hostExposure != null) {
        this.renderer.toneMappingExposure = this.hostExposure;
      }
      this.appliedOriginalTone = false;
      this.hostToneMapping = null;
      this.hostExposure = null;
    }
  }

  private resolveProjectKeyPos(out: THREE.Vector3): void {
    const rig = this.lightRig;
    if (!rig) {
      out.copy(KEY_LIGHT_POS);
      return;
    }

    let bestPoint: THREE.Light | null = null;
    let bestPointIntensity = -1;
    let bestDir: THREE.DirectionalLight | null = null;
    let bestDirIntensity = -1;

    for (const rt of rig.runtimes.values()) {
      if (!rt.light.visible) continue;
      if (rt.type === 'point' || rt.type === 'spot') {
        const intensity = (rt.light as THREE.PointLight).intensity;
        if (intensity > bestPointIntensity) {
          bestPointIntensity = intensity;
          bestPoint = rt.light;
        }
      } else if (rt.type === 'directional') {
        const intensity = (rt.light as THREE.DirectionalLight).intensity;
        if (intensity > bestDirIntensity) {
          bestDirIntensity = intensity;
          bestDir = rt.light as THREE.DirectionalLight;
        }
      }
    }

    if (bestPoint) {
      bestPoint.getWorldPosition(out);
      return;
    }
    if (bestDir) {
      bestDir.getWorldPosition(out);
      // Push along light direction so shadow ray has a clear source.
      const target = new THREE.Vector3();
      bestDir.target.getWorldPosition(target);
      const dir = out.clone().sub(target).normalize();
      if (dir.lengthSq() < 1e-8) dir.set(-0.4, 0.8, 0.4).normalize();
      out.copy(dir.multiplyScalar(12));
      return;
    }
    out.copy(KEY_LIGHT_POS);
  }

  dispose(): void {
    this.teardownOriginal();
    this.scene.remove(this.spotKeyLight);
    this.scene.remove(this.spotKeyLight.target);
    this.scene.remove(this.pointKeyLight);
    this.scene.remove(this.fillLight);
    this.scene.remove(this.debugFloor);
    this.debugFloor.geometry.dispose();
    (this.debugFloor.material as THREE.Material).dispose();
    this.spotKeyLight.dispose();
    this.pointKeyLight.dispose();
  }
}
