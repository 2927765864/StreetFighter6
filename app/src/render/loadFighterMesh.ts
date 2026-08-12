import * as THREE from 'three/webgpu';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export type LoadedFighterMesh = {
  scene: THREE.Object3D;
  /** Embedded tracks (boot discards them; combat uses anims backend). */
  embeddedAnimCount: number;
  format: 'fbx' | 'gltf';
};

function isFbxUrl(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  return path.toLowerCase().endsWith('.fbx');
}

/**
 * RE FBX media slots are bare names (esf_Body00) with no image file on disk.
 * Do not fetch them — a failed/empty Texture.image crashes WebGPU
 * (`image.complete` on null). Maps are stripped after load; real albedos come
 * from ensureRyuFallbackAlbedoCatalog() + sanitizeObjectMaterials().
 */
function createFbxLoadingManager(): THREE.LoadingManager {
  const manager = new THREE.LoadingManager();
  let blocked = 0;
  manager.setURLModifier((requestUrl) => {
    const path = requestUrl.split('?')[0] ?? requestUrl;
    const hasImageExt = /\.(png|jpe?g|webp|tga|dds|bmp|gif)(\?|$)/i.test(path);
    if (hasImageExt) return requestUrl;
    // bare media id next to the fbx — not a real file
    if (
      /esf_[A-Za-z0-9_]+$/i.test(path) ||
      /\/esf_[^/.]+$/i.test(path) ||
      !/\.[a-z0-9]+$/i.test(path.split('/').pop() ?? '')
    ) {
      blocked++;
      // Valid 1×1 PNG so TextureLoader never leaves image=null (WebGPU crash).
      // These maps are stripped immediately after parse.
      return (
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
      );
    }
    return requestUrl;
  });
  manager.onLoad = () => {
    if (blocked > 0) {
      console.info(
        `[fbx-tex] stubbed ${blocked} missing media slots (stripped after load)`,
      );
    }
  };
  manager.onError = () => {
    /* missing media — expected */
  };
  return manager;
}

/** Remove every map slot on materials so no null/stub texture reaches WebGPU. */
function stripAllMaterialMaps(root: THREE.Object3D): number {
  const slots = [
    'map',
    'normalMap',
    'roughnessMap',
    'metalnessMap',
    'aoMap',
    'emissiveMap',
    'alphaMap',
    'bumpMap',
    'displacementMap',
    'envMap',
    'lightMap',
    'specularMap',
  ] as const;
  let n = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of list) {
      const any = mat as unknown as Record<string, unknown>;
      for (const key of slots) {
        if (any[key]) {
          any[key] = null;
          n++;
        }
      }
      (mat as THREE.Material).needsUpdate = true;
    }
  });
  return n;
}

/** Collapse Three's per-vertex ">4 skinning weights" spam into one summary line. */
async function withSuppressedFbxWeightWarnings<T>(
  fn: () => Promise<T>,
): Promise<T> {
  const orig = console.warn;
  let weightWarns = 0;
  console.warn = (...args: unknown[]) => {
    const msg = String(args[0] ?? '');
    if (msg.includes('more than 4 skinning weights')) {
      weightWarns++;
      return;
    }
    orig.apply(console, args as []);
  };
  try {
    return await fn();
  } finally {
    console.warn = orig;
    if (weightWarns > 0) {
      // Three.js skinning is hard-capped at 4 influences/vertex (WebGL/WebGPU).
      // RE/SF6 meshes often author 5–8; extras are dropped — small deformation
      // differences only, unrelated to albedo/textures.
      console.warn(
        `[fbx] ${weightWarns} vertices had >4 skin weights (extras dropped by FBXLoader; not a texture issue)`,
      );
    }
  }
}

/**
 * Load a skinned fighter mesh from .fbx or .glb/.gltf.
 * Combat animation clips stay on AnimClipLibrary (separate glbs).
 */
export async function loadFighterMeshFromUrl(
  url: string,
): Promise<LoadedFighterMesh> {
  if (isFbxUrl(url)) {
    const loader = new FBXLoader(createFbxLoadingManager());
    // RE FBX often has >4 influences; Three drops extras and spams console.
    const group = await withSuppressedFbxWeightWarnings(() =>
      loader.loadAsync(url),
    );
    const stripped = stripAllMaterialMaps(group);
    if (stripped > 0) {
      console.info(`[fbx-tex] stripped ${stripped} map slots (no embedded images)`);
    }
    // FBXLoader attaches `animations` on the root Group (not on Object3D typings).
    const anims =
      (group as THREE.Group & { animations?: THREE.AnimationClip[] })
        .animations ?? [];
    return {
      scene: group,
      embeddedAnimCount: anims.length,
      format: 'fbx',
    };
  }

  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  return {
    scene: gltf.scene,
    embeddedAnimCount: gltf.animations.length,
    format: 'gltf',
  };
}
