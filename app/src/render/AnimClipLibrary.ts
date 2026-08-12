import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepareReExtractedFighter } from './materialUtils';

/**
 * Shared cache: anims-relative path → prepared AnimationClip.
 * One network load per path; clips are cloned per FighterView bind.
 */
export class AnimClipLibrary {
  private cache = new Map<string, THREE.AnimationClip>();
  private inflight = new Map<string, Promise<THREE.AnimationClip>>();
  private loader = new GLTFLoader();

  /**
   * @param url absolute-from-origin, e.g. /private-assets/ryu/anims/...
   * @param cacheKey stable key (anims-relative path)
   */
  async loadClip(url: string, cacheKey: string): Promise<THREE.AnimationClip> {
    const hit = this.cache.get(cacheKey);
    if (hit) return hit;

    let p = this.inflight.get(cacheKey);
    if (!p) {
      p = this.fetchAndPrepare(url, cacheKey);
      this.inflight.set(cacheKey, p);
    }
    try {
      return await p;
    } finally {
      this.inflight.delete(cacheKey);
    }
  }

  private async fetchAndPrepare(
    url: string,
    cacheKey: string,
  ): Promise<THREE.AnimationClip> {
    const gltf = await this.loader.loadAsync(url);
    if (!gltf.animations.length) {
      throw new Error(`No AnimationClips in ${url}`);
    }
    // Clip-only sanitize: do not skeleton.pose() the anim-glb hierarchy
    // (tracks are bound onto the boot fighter mesh, not this scene).
    let animations = gltf.animations.slice();
    const prepared = prepareReExtractedFighter(gltf.scene, animations, {
      poseModel: false,
    });
    animations = prepared.animations;
    const clip = animations[0]!.clone();
    // Name = cache key so multiple clips stay unique on one mixer
    clip.name = cacheKey;
    this.cache.set(cacheKey, clip);
    return clip;
  }

  /** Clone for binding onto a specific skeleton/mixer (safe concurrent use). */
  cloneCached(cacheKey: string): THREE.AnimationClip | null {
    const c = this.cache.get(cacheKey);
    return c ? c.clone() : null;
  }

  has(cacheKey: string): boolean {
    return this.cache.has(cacheKey);
  }
}
