/**
 * Apply offline-prepared Ryu PNGs onto an existing skinned mesh (mesh_only / FBX).
 * Prefer this over Blender re-exported textured glb — re-export corrupts glove skinning.
 *
 * @see docs/character-art-consensus-v0.md
 * @see tools/character_art/prepare_ryu_textures.py
 */
import * as THREE from 'three/webgpu';
import { isUsableTexture } from './materialUtils';

export const RYU_PREPARED_TEX_BASE = '/private-runtime/ryu/textures/prepared';

type PackId =
  | 'head'
  | 'body'
  | 'eye'
  | 'hair'
  | 'clothb'
  | 'headband'
  | 'belt'
  | 'belt_sign'
  | 'hide';

type PackFiles = {
  color?: string;
  bump?: string;
  rough?: string;
  normalScale?: number;
  roughness?: number;
  alphaTest?: number;
  doubleSide?: boolean;
  /** solid color if no color map */
  solid?: number;
};

const PACK: Record<Exclude<PackId, 'hide'>, PackFiles> = {
  head: {
    color: 'head_color.png',
    bump: 'head_bump.png',
    rough: 'head_rough.png',
    normalScale: 0.45,
    roughness: 0.68,
  },
  body: {
    color: 'body_color.png',
    bump: 'body_bump.png',
    rough: 'body_rough.png',
    normalScale: 0.5,
    roughness: 0.68,
  },
  eye: {
    color: 'eye_color.png',
    roughness: 0.22,
  },
  hair: {
    color: 'hair_color_final.png',
    roughness: 0.6,
    alphaTest: 0.35,
    doubleSide: true,
  },
  clothb: {
    color: 'clothb_color_final.png',
    bump: 'clothb_bump.png',
    rough: 'clothb_rough.png',
    normalScale: 0.28,
    roughness: 0.78,
    alphaTest: 0.12,
    doubleSide: true,
  },
  headband: {
    color: 'headband_color_final.png',
    normalScale: 0.22,
    roughness: 0.8,
    alphaTest: 0.12,
    doubleSide: true,
  },
  belt: {
    color: 'belt_color_final.png',
    roughness: 0.85,
  },
  belt_sign: {
    color: 'belt_sign_color_final.png',
    roughness: 0.7,
  },
};

/** Match mesh/material name → pack (cape meshes → hide). */
export function pickRyuArtPack(meshName: string, matName: string): PackId {
  const n = `${meshName} ${matName}`.toLowerCase();
  if (
    n.includes('costume00') ||
    n.includes('threads') ||
    (n.includes('ring') && !n.includes('string')) ||
    n.includes('eyetear') ||
    n.includes('eye_tear') ||
    n.includes('eyeshadow') ||
    n.includes('mouth00') ||
    n.includes('icosphere')
  ) {
    return 'hide';
  }
  if (n.includes('headband') || n.includes('head_band')) return 'headband';
  if (n.includes('obisign') || n.includes('obi_sign')) return 'belt_sign';
  if (n.includes('obi')) return 'belt';
  if (n.includes('mouth') || n.includes('head00') || (n.includes('head') && !n.includes('hair'))) {
    return 'head';
  }
  if (n.includes('body00') || (n.includes('body') && !n.includes('costume'))) return 'body';
  if (n.includes('eye00') || (n.includes('eye') && !n.includes('brow') && !n.includes('lash'))) {
    return 'eye';
  }
  if (n.includes('hair') || n.includes('beard') || n.includes('brow') || n.includes('lash')) {
    return 'hair';
  }
  if (
    n.includes('dougi') ||
    n.includes('waraji') ||
    n.includes('costume03') ||
    n.includes('costume01') ||
    n.includes('glove') ||
    n.includes('pants')
  ) {
    return 'clothb';
  }
  return 'body';
}

async function loadTex(
  loader: THREE.TextureLoader,
  file: string,
  colorSpace: THREE.ColorSpace,
): Promise<THREE.Texture | null> {
  const url = `${RYU_PREPARED_TEX_BASE}/${file}`;
  try {
    const tex = await loader.loadAsync(url);
    if (!isUsableTexture(tex)) return null;
    tex.colorSpace = colorSpace;
    tex.flipY = false; // glTF-style UV; prepared PNG applied like glTF maps
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  } catch (e) {
    console.warn(`[ryu-art] failed load ${url}`, e);
    return null;
  }
}

/**
 * Replace materials on `root` with prepared maps. Hides cape/open-gi meshes.
 * Safe to call before bakeRyuMeshTemplate / sanitize (sanitize will preserve maps).
 */
export async function applyPreparedRyuArtMaterials(
  root: THREE.Object3D,
): Promise<{ applied: number; hidden: number }> {
  const loader = new THREE.TextureLoader();
  const cache = new Map<string, THREE.Texture | null>();

  async function get(file: string | undefined, cs: THREE.ColorSpace): Promise<THREE.Texture | null> {
    if (!file) return null;
    const key = `${cs}:${file}`;
    if (cache.has(key)) return cache.get(key) ?? null;
    const t = await loadTex(loader, file, cs);
    cache.set(key, t);
    return t;
  }

  // Preload unique files
  const files = new Set<string>();
  for (const p of Object.values(PACK)) {
    if (p.color) files.add(p.color);
    if (p.bump) files.add(p.bump);
    if (p.rough) files.add(p.rough);
  }
  await Promise.all(
    [...files].map(async (f) => {
      const isColor = f.includes('color') || f.includes('albd');
      await get(f, isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace);
    }),
  );

  let applied = 0;
  let hidden = 0;

  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;

    const matList = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const mat0 = matList[0];
    const matName = mat0?.name ?? '';
    const packId = pickRyuArtPack(mesh.name, matName);

    if (packId === 'hide') {
      mesh.visible = false;
      hidden++;
      return;
    }

    const pack = PACK[packId];
    const colorKey = pack.color
      ? `${THREE.SRGBColorSpace}:${pack.color}`
      : '';
    const bumpKey = pack.bump ? `${THREE.NoColorSpace}:${pack.bump}` : '';
    const roughKey = pack.rough ? `${THREE.NoColorSpace}:${pack.rough}` : '';

    const map = colorKey ? cache.get(colorKey) ?? null : null;
    const normalMap = bumpKey ? cache.get(bumpKey) ?? null : null;
    const roughnessMap = roughKey ? cache.get(roughKey) ?? null : null;

    const std = new THREE.MeshStandardMaterial({
      name: `${matName || mesh.name}_prepared`,
      color: 0xffffff,
      map: map && isUsableTexture(map) ? map : null,
      normalMap: normalMap && isUsableTexture(normalMap) ? normalMap : null,
      roughnessMap: roughnessMap && isUsableTexture(roughnessMap) ? roughnessMap : null,
      metalness: 0,
      roughness: pack.roughness ?? 0.72,
      side: pack.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
      transparent: Boolean(pack.alphaTest),
      opacity: 1,
      alphaTest: pack.alphaTest ?? 0,
      depthWrite: !pack.alphaTest,
      envMapIntensity: 0.35,
    });
    if (std.normalMap) {
      const ns = pack.normalScale ?? 0.4;
      std.normalScale.set(ns, ns);
    }
    if (packId === 'eye' && std.map) {
      std.emissive = new THREE.Color(0x221c18);
      std.emissiveIntensity = 0.18;
    }

    // dispose old materials (not textures we share)
    for (const m of matList) m.dispose();
    mesh.material = std;
    mesh.frustumCulled = false;
    applied++;
  });

  console.info(
    `[ryu-art] applyPrepared maps applied=${applied} hidden=${hidden} texCache=${cache.size}`,
  );
  // Mark so sanitize skips interim albedo remapping
  root.userData.ryuPreparedArt = true;
  return { applied, hidden };
}
