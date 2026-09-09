import * as THREE from 'three/webgpu';
import { CONFIG } from '../../config/store';
import type { HitVfxTriggerArgs } from '../../render/hitVfx/hitVfxTypes';
import { worldPosFromTrigger } from '../../render/hitVfx/HitVfxRuntime';
import { FLIPBOOK_SHEETS } from './catalog';
import { loadImage } from './imageCache';
import { loadFlipbookBank, loadFlipbookRecipe } from './persist';
import { threeBlendParams, tintFromLayer } from './layerLook';
import { flipbookWorldSize, prepImage } from './texturePrep';
import {
  sourceFrameAt,
  type FlipbookLayer,
  type FlipbookRecipe,
  type FlipbookRecipeBank,
  type FlipbookStrength,
} from './types';

type LayerBillboard = {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  layer: FlipbookLayer;
  lookApplied: boolean;
};

type Shot = {
  root: THREE.Group;
  spin: THREE.Group;
  layers: LayerBillboard[];
  recipe: FlipbookRecipe;
  playhead: number;
  age: number;
  facing: number;
  impulse: THREE.Vector3;
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
 * Mirror the whole shot from defender facing.
 * Authored sheets assume attack from the left (defender facing -1 → scale +1).
 * When the defender faces +X (hit from the right), flip with scale.x = -1.
 * Editor preview uses facing -1 so it stays unmirrored like the canvas.
 *
 * Mesh planes (not Sprite): parent scale.x = -1 correctly mirrors both UVs
 * and layer offsetX.
 */
export function flipbookFacingScaleX(facing: number): number {
  return facing > 0 ? -1 : 1;
}

const _layerOff = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camUp = new THREE.Vector3();

/**
 * Billboard Z spin so authored +X follows `dir` on the camera plane.
 * `facingScaleX` is flipbookFacingScaleX (parent scale.x); see tests.
 */
export function flipbookSpinRad(
  dir: THREE.Vector3,
  camRight: THREE.Vector3,
  camUp: THREE.Vector3,
  facingScaleX: number,
): number {
  // Billboard plane only: camera-forward is unused (same as fixed-Z impulse).
  const x = dir.dot(camRight);
  const y = dir.dot(camUp);
  if (x * x + y * y < 1e-10) return 0;
  const sx = facingScaleX < 0 ? -1 : 1;
  return Math.atan2(y, x * sx);
}

export function layerLocalOffset(
  layer: Pick<FlipbookLayer, 'offsetX' | 'offsetY' | 'z'>,
  size: number,
  out: THREE.Vector3 = _layerOff,
): THREE.Vector3 {
  const ox = (layer.offsetX / 384) * size;
  const oy = -(layer.offsetY / 384) * size;
  return out.set(ox, oy, layer.z * 0.002);
}

/** L/M/H share E1–E6 ids; rebuild when the strength (or layer set) changes. */
export function editorShotNeedsRebuild(
  shot: { recipe: FlipbookRecipe; layers: { layer: { id: string } }[] },
  recipe: FlipbookRecipe,
): boolean {
  if (shot.recipe.strength !== recipe.strength) return true;
  if (shot.recipe.id !== recipe.id) return true;
  if (shot.layers.length !== recipe.layers.length) return true;
  const have = shot.layers.map((l) => l.layer.id).join(',');
  const want = recipe.layers.map((l) => l.id).join(',');
  return have !== want;
}

/** Point billboards at the live recipe layers so inspector edits hit this shot. */
export function bindShotLayers(
  items: { layer: FlipbookLayer; lookApplied: boolean }[],
  recipe: FlipbookRecipe,
): void {
  const byId = new Map(recipe.layers.map((l) => [l.id, l] as const));
  for (const item of items) {
    const next = byId.get(item.layer.id);
    if (next && next !== item.layer) {
      item.layer = next;
      item.lookApplied = false;
    }
  }
}

export class Flipbook2DCombat {
  private readonly scene: THREE.Object3D;
  private camera: THREE.Camera;
  private recipe: FlipbookRecipe;
  private bank: FlipbookRecipeBank;
  private shots: Shot[] = [];
  private editorShot: Shot | null = null;
  private readonly pool: THREE.Group;

  constructor(scene: THREE.Object3D, camera: THREE.Camera) {
    this.scene = scene;
    this.camera = camera;
    this.bank = loadFlipbookBank();
    this.recipe = this.bank.M;
    this.pool = new THREE.Group();
    this.pool.name = 'Flipbook2DCombat';
    this.scene.add(this.pool);
    void this.warmTextures();
  }

  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  reloadRecipe(): void {
    this.bank = loadFlipbookBank();
    this.recipe = this.bank.M;
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
    this.bank[recipe.strength] = recipe;
    this.pool.visible = true;
    const world = worldPosFromTrigger(
      args,
      CONFIG.hitVfxHeightOffsets,
      CONFIG.modelYOffset,
    );
    if (!this.editorShot || editorShotNeedsRebuild(this.editorShot, recipe)) {
      if (this.editorShot) this.disposeShot(this.editorShot);
      this.editorShot = this.spawnShot(world, args);
    } else {
      bindShotLayers(this.editorShot.layers, recipe);
      this.editorShot.recipe = recipe;
      this.editorShot.root.position.copy(world);
      this.editorShot.root.scale.set(flipbookFacingScaleX(args.facing), 1, 1);
      this.writeImpulse(this.editorShot, args);
    }
    this.editorShot.playhead = playhead;
    this.editorShot.age = playhead;
    this.editorShot.facing = args.facing;
    this.billboardShot(this.editorShot);
    this.applyFrame(this.editorShot, true);
  }

  /** Spawn at contact world position; stays fixed while the sheet plays. */
  trigger(args: HitVfxTriggerArgs): void {
    if (!CONFIG.hitVfxEnabled) return;
    this.bank = loadFlipbookBank();
    const strength = (args.strength as FlipbookStrength) || 'M';
    this.recipe = this.bank[strength] ?? loadFlipbookRecipe(strength);
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
    const shot = this.spawnShot(world, args);
    this.shots.push(shot);
    this.billboardShot(shot);
    this.applyFrame(shot);
  }

  /** True when combat/editor flipbook meshes should be drawn this frame. */
  hasDrawable(): boolean {
    return this.shots.length > 0 || this.editorShot != null;
  }

  tick(dt: number, inHitstop: boolean): void {
    if (CONFIG.hitVfxPlayMode !== 'flipbook2d') {
      if (this.shots.length) this.clear();
      return;
    }
    const freeze = CONFIG.hitVfxFollowHitstop && inHitstop;
    if (!CONFIG.hitVfxPaused && !freeze) {
      for (let i = this.shots.length - 1; i >= 0; i -= 1) {
        const s = this.shots[i]!;
        const fps = Math.max(1, s.recipe.fps);
        s.age += dt * fps * (CONFIG.hitVfxTimeScale || 1);
        s.playhead = Math.floor(s.age);
        if (s.playhead > s.recipe.length - 1) {
          this.disposeShot(s);
          this.shots.splice(i, 1);
        }
      }
    }
    for (const s of this.shots) {
      this.billboardShot(s);
      this.applyFrame(s);
    }
    this.pool.visible = this.hasDrawable();
  }

  private spawnShot(world: THREE.Vector3, args: HitVfxTriggerArgs): Shot {
    const root = new THREE.Group();
    const spin = new THREE.Group();
    spin.name = 'Flipbook2DSpin';
    root.add(spin);
    root.position.copy(world);
    root.scale.set(flipbookFacingScaleX(args.facing), 1, 1);
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
      spin.add(mesh);
      layers.push({ mesh, material: mat, layer, lookApplied: true });
    }
    this.pool.add(root);
    const shot: Shot = {
      root,
      spin,
      layers,
      recipe: this.recipe,
      playhead: 0,
      age: 0,
      facing: args.facing,
      impulse: new THREE.Vector3(),
    };
    this.writeImpulse(shot, args);
    return shot;
  }

  private writeImpulse(shot: Shot, args: HitVfxTriggerArgs): void {
    const imp = args.impulse;
    if (imp && (imp[0] !== 0 || imp[1] !== 0 || imp[2] !== 0)) {
      shot.impulse.set(imp[0], imp[1], imp[2]);
    } else {
      shot.impulse.set(0, 0, 0);
    }
  }

  private billboardShot(shot: Shot): void {
    shot.root.quaternion.copy(this.camera.quaternion);
    this.camera.updateMatrixWorld();
    _camRight.setFromMatrixColumn(this.camera.matrixWorld, 0);
    _camUp.setFromMatrixColumn(this.camera.matrixWorld, 1);
    shot.spin.rotation.z = flipbookSpinRad(
      shot.impulse,
      _camRight,
      _camUp,
      flipbookFacingScaleX(shot.facing),
    );
  }

  private applyFrame(shot: Shot, forceLook = false): void {
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
      item.mesh.position.copy(layerLocalOffset(item.layer, size, _layerOff));
      item.mesh.renderOrder = 20 + item.layer.z;
      if (item.material.map !== tex) item.material.map = tex;
      if (forceLook || !item.lookApplied) {
        applyMaterialLook(item.material, item.layer);
        item.lookApplied = true;
      }
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
