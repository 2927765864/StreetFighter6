import * as THREE from 'three/webgpu';
import { CONFIG } from '../../config/store';
import type { HitVfxTriggerArgs } from '../../render/hitVfx/hitVfxTypes';
import { worldPosFromTrigger } from '../../render/hitVfx/HitVfxRuntime';
import { FLIPBOOK_SHEETS } from './catalog';
import { loadImage } from './imageCache';
import { loadFlipbookRecipe } from './persist';
import { threeBlendParams, tintFromLayer } from './layerLook';
import { flipbookWorldSize, prepImage } from './texturePrep';
import {
  sourceFrameAt,
  type FlipbookLayer,
  type FlipbookRecipe,
} from './types';

type LayerBillboard = {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  layer: FlipbookLayer;
};

type Shot = {
  root: THREE.Group;
  layers: LayerBillboard[];
  playhead: number;
  age: number;
};

const texCache = new Map<string, THREE.Texture>();
/** Shared unit quad; scale per mesh. Faces +Z so camera-quat parents billboard correctly. */
const planeGeo = new THREE.PlaneGeometry(1, 1);

function cacheKey(url: string, despill: number): string {
  return `${url}|d=${despill.toFixed(2)}`;
}

async function textureFor(
  url: string,
  despill: number,
): Promise<THREE.Texture> {
  const key = cacheKey(url, despill);
  const hit = texCache.get(key);
  if (hit) return hit;
  const img = await loadImage(url);
  const canvas = prepImage(img, despill);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.premultiplyAlpha = true;
  tex.needsUpdate = true;
  texCache.set(key, tex);
  return tex;
}

function applyMaterialLook(
  mat: THREE.MeshBasicMaterial,
  layer: FlipbookLayer,
): void {
  const blend = threeBlendParams(layer.blend, THREE);
  mat.blending = blend.blending as THREE.Blending;
  if (blend.blendSrc != null) mat.blendSrc = blend.blendSrc as THREE.BlendingDstFactor;
  if (blend.blendDst != null) mat.blendDst = blend.blendDst as THREE.BlendingDstFactor;
  if (blend.blendEquation != null) {
    mat.blendEquation = blend.blendEquation as THREE.BlendingEquation;
  }
  const tint = tintFromLayer(layer);
  mat.color.setRGB(tint.r, tint.g, tint.b);
  mat.opacity = layer.opacity;
  mat.premultipliedAlpha = true;
  mat.transparent = true;
  mat.depthTest = false;
  mat.depthWrite = false;
  mat.toneMapped = true;
  // Parent scale.x = -1 mirrors the shot; double-side keeps the flipped plane visible.
  mat.side = THREE.DoubleSide;
  mat.needsUpdate = true;
}

/**
 * Keep authored orientation (same as the 2D editor). Sheets are drawn as
 * authored; do not mirror by attacker facing — that made combat look
 * horizontally reversed vs the editor timeline.
 *
 * Layers still use Mesh planes (not Sprite): WebGPU SpriteNodeMaterial takes
 * scale from matrix column lengths, so parent scale.x = -1 would flip offsets
 * without flipping UVs.
 */
export function flipbookFacingScaleX(_facing: number): number {
  return 1;
}

export function layerLocalOffset(
  layer: Pick<FlipbookLayer, 'offsetX' | 'offsetY' | 'z'>,
  size: number,
): THREE.Vector3 {
  const ox = (layer.offsetX / 384) * size;
  const oy = -(layer.offsetY / 384) * size;
  return new THREE.Vector3(ox, oy, layer.z * 0.002);
}

export class Flipbook2DCombat {
  private readonly scene: THREE.Object3D;
  private camera: THREE.Camera;
  private recipe: FlipbookRecipe;
  private shots: Shot[] = [];
  private editorShot: Shot | null = null;
  private readonly pool: THREE.Group;

  constructor(scene: THREE.Object3D, camera: THREE.Camera) {
    this.scene = scene;
    this.camera = camera;
    this.recipe = loadFlipbookRecipe();
    this.pool = new THREE.Group();
    this.pool.name = 'Flipbook2DCombat';
    this.scene.add(this.pool);
    void this.warmTextures();
  }

  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  reloadRecipe(): void {
    this.recipe = loadFlipbookRecipe();
  }

  clear(): void {
    for (const s of this.shots) this.disposeShot(s);
    this.shots = [];
    this.clearEditor();
    this.pool.visible = false;
  }

  clearEditor(): void {
    if (this.editorShot) {
      this.disposeShot(this.editorShot);
      this.editorShot = null;
    }
  }

  /**
   * Persistent scrub preview for the VFX editor (same world meshes as combat).
   * Does not consume hitVfxPlayMode — the editor always wants this while 2D is open.
   */
  syncEditor(
    recipe: FlipbookRecipe,
    playhead: number,
    args: HitVfxTriggerArgs,
  ): void {
    this.recipe = recipe;
    this.pool.visible = true;
    const world = worldPosFromTrigger(
      args,
      CONFIG.hitVfxHeightOffsets,
      CONFIG.modelYOffset,
    );
    const ids = recipe.layers.map((l) => l.id).join(',');
    const have =
      this.editorShot?.layers.map((l) => l.layer.id).join(',') ?? '';
    if (!this.editorShot || have !== ids) {
      if (this.editorShot) this.disposeShot(this.editorShot);
      this.editorShot = this.spawnShot(world, args.facing);
    } else {
      this.editorShot.root.position.copy(world);
      this.editorShot.root.scale.set(flipbookFacingScaleX(args.facing), 1, 1);
    }
    this.editorShot.playhead = playhead;
    this.editorShot.age = playhead;
    this.editorShot.root.quaternion.copy(this.camera.quaternion);
    this.applyFrame(this.editorShot);
  }

  /** Spawn at contact world position; stays fixed while the sheet plays. */
  trigger(args: HitVfxTriggerArgs): void {
    if (!CONFIG.hitVfxEnabled) return;
    this.recipe = loadFlipbookRecipe();
    this.pool.visible = true;
    const world = worldPosFromTrigger(
      args,
      CONFIG.hitVfxHeightOffsets,
      CONFIG.modelYOffset,
    );
    while (this.shots.length >= Math.max(1, CONFIG.hitVfxMaxConcurrent)) {
      const old = this.shots.shift();
      if (old) this.disposeShot(old);
    }
    const shot = this.spawnShot(world, args.facing);
    this.shots.push(shot);
    this.applyFrame(shot);
  }

  tick(dt: number, inHitstop: boolean): void {
    if (CONFIG.hitVfxPlayMode !== 'flipbook2d') {
      if (this.shots.length) this.clear();
      return;
    }
    this.pool.visible = true;
    const freeze = CONFIG.hitVfxFollowHitstop && inHitstop;
    const fps = Math.max(1, this.recipe.fps);
    if (!CONFIG.hitVfxPaused && !freeze) {
      const step = dt * fps * (CONFIG.hitVfxTimeScale || 1);
      for (const s of this.shots) {
        s.age += step;
        s.playhead = Math.floor(s.age);
      }
      const keep: Shot[] = [];
      for (const s of this.shots) {
        if (s.playhead <= this.recipe.length - 1) keep.push(s);
        else this.disposeShot(s);
      }
      this.shots = keep;
    }
    for (const s of this.shots) {
      s.root.quaternion.copy(this.camera.quaternion);
      this.applyFrame(s);
    }
  }

  private spawnShot(world: THREE.Vector3, facing: number): Shot {
    const root = new THREE.Group();
    root.position.copy(world);
    root.scale.set(flipbookFacingScaleX(facing), 1, 1);
    const layers: LayerBillboard[] = [];
    const size = flipbookWorldSize(CONFIG.hitVfxFlipbookSize);
    for (const layer of this.recipe.layers) {
      const mat = new THREE.MeshBasicMaterial();
      applyMaterialLook(mat, layer);
      const mesh = new THREE.Mesh(planeGeo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 20 + layer.z;
      mesh.visible = false;
      mesh.position.copy(layerLocalOffset(layer, size));
      root.add(mesh);
      layers.push({ mesh, material: mat, layer });
    }
    this.pool.add(root);
    return { root, layers, playhead: 0, age: 0 };
  }

  private applyFrame(shot: Shot): void {
    const size = flipbookWorldSize(CONFIG.hitVfxFlipbookSize);
    for (const item of shot.layers) {
      const urls = FLIPBOOK_SHEETS[item.layer.id] ?? [];
      const idx = sourceFrameAt(item.layer, shot.playhead, urls.length);
      if (idx == null) {
        item.mesh.visible = false;
        continue;
      }
      const url = urls[idx];
      if (!url) {
        item.mesh.visible = false;
        continue;
      }
      const tex = texCache.get(cacheKey(url, item.layer.despill));
      if (!tex) {
        void textureFor(url, item.layer.despill).then(() => this.applyFrame(shot));
        item.mesh.visible = false;
        continue;
      }
      const img = tex.image as { width?: number; height?: number };
      const w = img.width ?? 256;
      const h = img.height ?? 256;
      const maxSide = Math.max(w, h) || 1;
      const s = size * item.layer.scale;
      item.mesh.scale.set((w / maxSide) * s, (h / maxSide) * s, 1);
      item.mesh.position.copy(layerLocalOffset(item.layer, size));
      item.mesh.renderOrder = 20 + item.layer.z;
      item.material.map = tex;
      applyMaterialLook(item.material, item.layer);
      item.mesh.visible = item.layer.enabled;
    }
  }

  private disposeShot(shot: Shot): void {
    this.pool.remove(shot.root);
    for (const item of shot.layers) {
      item.material.map = null;
      item.material.dispose();
    }
  }

  private async warmTextures(): Promise<void> {
    const jobs: Promise<unknown>[] = [];
    for (const layer of this.recipe.layers) {
      for (const url of FLIPBOOK_SHEETS[layer.id] ?? []) {
        jobs.push(textureFor(url, layer.despill).catch(() => undefined));
      }
    }
    await Promise.all(jobs);
  }
}
