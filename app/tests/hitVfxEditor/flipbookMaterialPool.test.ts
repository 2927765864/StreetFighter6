import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { CONFIG } from '../../src/config/store';
import { Flipbook2DCombat } from '../../src/hitVfxEditor/flipbook2d/Flipbook2DCombat';

describe('flipbook material pooling', () => {
  it('reuses warmed materials between impacts without sharing live shots', () => {
    // No browser images are needed to verify material ownership/lifetime.
    const prototype = Flipbook2DCombat.prototype as unknown as {
      warmTextures(): Promise<void>;
      applyFrame(): void;
    };
    vi.spyOn(prototype, 'warmTextures').mockResolvedValue();
    vi.spyOn(prototype, 'applyFrame').mockImplementation(() => {});
    const enabled = CONFIG.hitVfxEnabled;
    CONFIG.hitVfxEnabled = true;
    try {
      const scene = new THREE.Scene();
      const runtime = new Flipbook2DCombat(scene, new THREE.PerspectiveCamera());
      const materials = () => {
        const result: THREE.MeshBasicMaterial[] = [];
        scene.traverse(object => {
          const mesh = object as THREE.Mesh;
          if (mesh.isMesh) result.push(mesh.material as THREE.MeshBasicMaterial);
        });
        return result;
      };
      const trigger = () => runtime.trigger({ kind: 'onHit', strength: 'M', height: 'm', x: 0, facing: -1 });
      trigger();
      const first = materials();
      expect(first.length).toBeGreaterThan(0);
      const warmed = new THREE.Texture();
      first.forEach(material => { material.map = warmed; });
      const versions = new Map(first.map(material => [material, material.version]));
      runtime.clear();
      expect(materials()).toHaveLength(0);
      trigger();
      const second = materials();
      const reused = second.filter(material => versions.has(material));
      expect(reused.length).toBeGreaterThan(0);
      for (const material of reused) {
        expect(material.map).toBe(warmed);
        expect(material.version).toBe(versions.get(material));
      }
      trigger();
      const concurrent = materials();
      expect(new Set(concurrent).size).toBe(concurrent.length);
      runtime.clear();
    } finally {
      CONFIG.hitVfxEnabled = enabled;
      vi.restoreAllMocks();
    }
  });
});
