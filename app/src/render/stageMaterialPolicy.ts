/**
 * Stage-only sampling / specular policy.
 * Fighter sanitizer is built for skinned meshes; walls need mip + anisotropy
 * and a roughness floor so grout / tape / highlights do not shimmer under
 * sub-pixel camera follow.
 */
import * as THREE from 'three/webgpu';
import { isStageLineOverlayName } from './stageLineOverlay';

/** WebGPU/GL typical cap; Three clamps to the device max. */
export const STAGE_ANISOTROPY = 16;
/** Kill tight marble specular lobes that crawl on camera lerp. */
export const STAGE_ROUGHNESS_FLOOR = 0.82;
export const STAGE_ENV_MAP_INTENSITY = 0.12;

const TEX_KEYS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'bumpMap',
  'alphaMap',
] as const;

export function stabilizeStageTexture(tex: THREE.Texture): void {
  tex.anisotropy = Math.max(tex.anisotropy, STAGE_ANISOTROPY);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
}

function isTexture(v: unknown): v is THREE.Texture {
  return !!v && typeof v === 'object' && 'isTexture' in v && (v as THREE.Texture).isTexture;
}

function stabilizeMaterialMaps(mat: THREE.Material): void {
  const rec = mat as unknown as Record<string, unknown>;
  for (const key of TEX_KEYS) {
    const tex = rec[key];
    if (isTexture(tex)) stabilizeStageTexture(tex);
  }
}

function softenStagePbr(mat: THREE.Material): void {
  const m = mat as THREE.MeshStandardMaterial;
  if (!('roughness' in m)) return;
  if (typeof m.roughness === 'number') {
    m.roughness = Math.max(m.roughness, STAGE_ROUGHNESS_FLOOR);
  }
  if ('envMapIntensity' in m) {
    m.envMapIntensity = STAGE_ENV_MAP_INTENSITY;
  }
  if (m.normalScale) {
    const s = Math.min(Math.abs(m.normalScale.x), 0.25);
    m.normalScale.set(s, s);
  }
  m.needsUpdate = true;
}

/** Filter + roughness floor on floor/walls; skip the center tape mesh. */
export function applyStageMaterialPolicy(root: THREE.Object3D): {
  meshes: number;
  textures: number;
} {
  const seen = new Set<THREE.Texture>();
  let meshes = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    meshes += 1;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const line = isStageLineOverlayName(mesh.name);
    for (const mat of list) {
      stabilizeMaterialMaps(mat);
      const rec = mat as unknown as Record<string, unknown>;
      for (const key of TEX_KEYS) {
        const tex = rec[key];
        if (isTexture(tex)) seen.add(tex);
      }
      if (!line) softenStagePbr(mat);
    }
  });
  return { meshes, textures: seen.size };
}
