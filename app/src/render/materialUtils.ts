import * as THREE from 'three/webgpu';

/** Max texture edge after load — SF6 interim glb ships multiple 4K maps (~293MB). */
const MAX_TEX_SIZE = 1024;

/** Humanoid submesh AABB gate (meters in asset bind units, pre-normalize). */
const OUTLIER_MAX_EXTENT = 4;
const OUTLIER_MAX_CENTER = 6;

/**
 * SF6 / Blender ports often use KHR_materials_specular + anisotropy + ior,
 * and mis-slot Capcom packed maps (atos/nrrc/cmask) as baseColor.
 * Rebuild as MeshStandardMaterial with remapped albedo when possible.
 */
export function sanitizeObjectMaterials(root: THREE.Object3D): void {
  const albedoByKey = collectAlbedoTextures(root);

  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;

    mesh.frustumCulled = false;
    // Do NOT force visible=true — pruneOutlierMeshes relies on remove, but be safe
    mesh.castShadow = false;
    mesh.receiveShadow = true;

    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = list.map((mat) => sanitizeOne(mat, mesh.name, albedoByKey));
    mesh.material = Array.isArray(mesh.material) ? next : next[0]!;
  });
}

/** Harvest every texture whose name looks like albedo, keyed by part hints. */
function collectAlbedoTextures(root: THREE.Object3D): Map<string, THREE.Texture> {
  const map = new Map<string, THREE.Texture>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      const m = mat as THREE.MeshStandardMaterial;
      for (const tex of [m.map, m.emissiveMap, m.alphaMap, m.normalMap, m.roughnessMap]) {
        if (!tex) continue;
        const label = textureName(tex);
        if (!label.includes('albd') && !label.includes('diffuse')) continue;
        // index under several keys
        for (const key of texturePartKeys(label)) {
          if (!map.has(key)) map.set(key, tex);
        }
        if (!map.has('__any_albd')) map.set('__any_albd', tex);
      }
    }
  });
  // Also walk all textures on objects via material userData isn't needed —
  // GLTF puts maps on materials. Scan images attached to any texture property.
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      const any = mat as unknown as Record<string, unknown>;
      for (const v of Object.values(any)) {
        if (v && typeof v === 'object' && (v as THREE.Texture).isTexture) {
          const tex = v as THREE.Texture;
          const label = textureName(tex);
          if (!label.includes('albd') && !label.includes('diffuse')) continue;
          for (const key of texturePartKeys(label)) {
            if (!map.has(key)) map.set(key, tex);
          }
        }
      }
    }
  });
  console.info(`[mat] albedo catalog keys: ${[...map.keys()].join(', ') || '(none)'}`);
  return map;
}

function texturePartKeys(label: string): string[] {
  const keys: string[] = [];
  if (label.includes('hair')) keys.push('hair');
  if (label.includes('head') || label.includes('face')) keys.push('head');
  if (label.includes('body') || label.includes('skin')) keys.push('body');
  if (label.includes('clotha') || label.includes('costume')) keys.push('clotha');
  if (label.includes('clothb')) keys.push('clothb');
  if (label.includes('eye') && !label.includes('brow')) keys.push('eye');
  return keys;
}

function pickAlbedo(
  meshName: string,
  matName: string,
  catalog: Map<string, THREE.Texture>,
): THREE.Texture | null {
  const n = `${meshName} ${matName}`.toLowerCase();
  const order: string[] = [];
  if (n.includes('hair') || n.includes('beard') || n.includes('brow') || n.includes('lash')) {
    order.push('hair');
  } else if (n.includes('head') || n.includes('mouth')) {
    order.push('head');
  } else if (n.includes('body') || n.includes('skin')) {
    order.push('body', 'head');
  } else if (n.includes('waraji') || n.includes('pants') || n.includes('dougi') || n.includes('obi') || n.includes('sarashi') || n.includes('glove')) {
    order.push('clothb', 'clotha');
  } else if (n.includes('cloth') || n.includes('costume') || n.includes('headband') || n.includes('ring')) {
    order.push('clotha', 'clothb');
  } else if (n.includes('eye')) {
    order.push('eye', 'head');
  } else {
    order.push('clotha', 'clothb', 'head');
  }
  for (const k of order) {
    const t = catalog.get(k);
    if (t) return t;
  }
  return null;
}

function textureName(tex: THREE.Texture | null | undefined): string {
  if (!tex) return '';
  const img = tex.image as { src?: string; name?: string } | undefined;
  return (
    (tex.name || '') +
    ' ' +
    (img?.name || '') +
    ' ' +
    (typeof img?.src === 'string' ? img.src : '')
  ).toLowerCase();
}

function isDataMapName(name: string): boolean {
  if (!name) return false;
  if (name.includes('albd')) return false;
  return (
    name.includes('atos') ||
    name.includes('nrrc') ||
    name.includes('cmask') ||
    name.includes('dmask') ||
    name.includes('_msk') ||
    name.includes('facialblend') ||
    name.includes('dm_msk')
  );
}

function fallbackColor(meshName: string, matName: string): THREE.Color {
  const n = `${meshName} ${matName}`.toLowerCase();
  if (n.includes('hair') || n.includes('beard') || n.includes('brow') || n.includes('lash')) {
    return new THREE.Color(0x2a2420);
  }
  if (n.includes('eye') && !n.includes('brow') && !n.includes('lash') && !n.includes('shadow')) {
    return new THREE.Color(0xf5f5f5);
  }
  if (n.includes('body') || n.includes('head') || n.includes('mouth') || n.includes('skin')) {
    return new THREE.Color(0xc68642);
  }
  if (n.includes('waraji') || n.includes('glove') || n.includes('ring')) {
    return new THREE.Color(0x3d2b1f);
  }
  if (n.includes('obi') || n.includes('sign') || n.includes('belt')) {
    return new THREE.Color(0x1a1a1a);
  }
  // dougi — slightly warm off-white
  return new THREE.Color(0xf2efe6);
}

function prepareTexture(
  tex: THREE.Texture | null | undefined,
  colorSpace: THREE.ColorSpace,
): THREE.Texture | null {
  if (!tex) return null;
  tex.colorSpace = colorSpace;
  tex.needsUpdate = true;
  downscaleTexture(tex, MAX_TEX_SIZE);
  return tex;
}

function downscaleTexture(tex: THREE.Texture, maxSize: number): void {
  const img = tex.image as
    | HTMLImageElement
    | ImageBitmap
    | HTMLCanvasElement
    | { width: number; height: number }
    | undefined;
  if (!img || !('width' in img) || !('height' in img)) return;
  const w = img.width;
  const h = img.height;
  if (!w || !h || (w <= maxSize && h <= maxSize)) return;

  if (
    !(img instanceof HTMLImageElement) &&
    !(typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) &&
    !(img instanceof HTMLCanvasElement)
  ) {
    return;
  }

  const scale = maxSize / Math.max(w, h);
  const nw = Math.max(1, Math.round(w * scale));
  const nh = Math.max(1, Math.round(h * scale));
  try {
    const canvas = document.createElement('canvas');
    canvas.width = nw;
    canvas.height = nh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img as CanvasImageSource, 0, 0, nw, nh);
    tex.image = canvas;
    tex.needsUpdate = true;
  } catch {
    // keep original
  }
}

function sanitizeOne(
  mat: THREE.Material,
  meshName: string,
  albedoCatalog: Map<string, THREE.Texture>,
): THREE.Material {
  const anyMat = mat as THREE.MeshStandardMaterial & {
    map?: THREE.Texture | null;
    normalMap?: THREE.Texture | null;
    color?: THREE.Color;
    opacity?: number;
    transparent?: boolean;
    metalness?: number;
    roughness?: number;
  };

  let map = anyMat.map ?? null;
  const mapLabel = textureName(map);
  if (map && isDataMapName(mapLabel)) {
    const remapped = pickAlbedo(meshName, mat.name || '', albedoCatalog);
    if (remapped) {
      console.info(
        `[mat] ${meshName}/${mat.name}: remap data-map → albedo "${textureName(remapped).trim()}"`,
      );
      map = remapped;
    } else {
      console.info(
        `[mat] ${meshName}/${mat.name}: drop data-map "${mapLabel.trim()}" → solid`,
      );
      map = null;
    }
  }

  // If still no map, try catalog for this part
  if (!map) {
    map = pickAlbedo(meshName, mat.name || '', albedoCatalog);
  }

  let normalMap = anyMat.normalMap ?? null;
  const nLabel = textureName(normalMap);
  if (normalMap && (nLabel.includes('nrrc') || nLabel.includes('dmask') || nLabel.includes('msk'))) {
    normalMap = null;
  }

  const color =
    map != null
      ? new THREE.Color(0xffffff)
      : fallbackColor(meshName, mat.name || '');

  map = prepareTexture(map, THREE.SRGBColorSpace);
  normalMap = prepareTexture(normalMap, THREE.NoColorSpace);

  let transparent = Boolean(anyMat.transparent || (mat.opacity ?? 1) < 0.99);
  let opacity = typeof mat.opacity === 'number' ? mat.opacity : 1;
  const n = `${meshName} ${mat.name}`.toLowerCase();
  const isHair = n.includes('hair') || n.includes('lash') || n.includes('beard');
  if (isHair) {
    transparent = true;
    opacity = Math.max(opacity, 0.9);
  }
  if (opacity < 0.05) {
    opacity = 1;
    transparent = false;
  }

  const metalness = 0.05;
  const roughness = isHair ? 0.55 : 0.72;

  const out = new THREE.MeshStandardMaterial({
    name: mat.name ? `${mat.name}_safe` : 'sanitized',
    color,
    map,
    normalMap,
    metalness,
    roughness,
    roughnessMap: null,
    metalnessMap: null,
    emissive: new THREE.Color(0x000000),
    emissiveMap: null,
    alphaMap: null,
    transparent,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: !transparent,
    vertexColors: false,
    alphaTest: transparent && isHair ? 0.2 : 0,
    envMapIntensity: 0.3,
  });
  // Tiny emissive so dark maps never go pure black
  out.emissive = color.clone().multiplyScalar(map ? 0.02 : 0.06);
  out.needsUpdate = true;

  mat.dispose();
  return out;
}

/** World-space AABB after matrix update; returns null if empty. */
export function worldBox(root: THREE.Object3D): THREE.Box3 | null {
  const box = robustWorldBox(root);
  if (box.isEmpty()) return null;
  const size = box.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.x) || size.lengthSq() < 1e-12) return null;
  return box;
}

/** True if scale is uniform and near `target` (default FBX UnitScaleFactor 0.01). */
function isUniformNear(scale: THREE.Vector3, target: number, eps = 1.5e-3): boolean {
  return (
    Math.abs(scale.x - target) < eps &&
    Math.abs(scale.y - target) < eps &&
    Math.abs(scale.z - target) < eps
  );
}

/**
 * SF6 / RE Mesh → Blender → glTF often has:
 *  - Armature node scale 0.01 (FBX cm→m)
 *  - Root bone bind scale 0.01 (applied again by skeleton.pose())
 * Together the fighter is ~1–2 cm tall and normalize clamps to unitScale=20 → still ~0 size.
 */
export function looksLikeReExtractedModel(root: THREE.Object3D): boolean {
  let hit = false;
  root.traverse((o) => {
    if (hit) return;
    if (/esf_|esf\d|esf001/i.test(o.name)) hit = true;
    const bone = o as THREE.Bone;
    if (bone.isBone && (o.name === 'C_Hip' || o.name === 'C_Head' || o.name === 'C_Spine1')) {
      hit = true;
    }
  });
  return hit;
}

/** Reset FBX unit scales (0.01) on nodes and bones. Call again after skeleton.pose(). */
export function resetFbxUnitScales(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    if (isUniformNear(o.scale, 0.01)) {
      o.scale.setScalar(1);
      n++;
    }
  });
  return n;
}

/**
 * Local-space position keys beyond this (meters) are treated as toxic / wrong unit.
 * Healthy SF6 RE glbs (C_Hip idle ~0.9–1.0, crouch ~0.62) stay well under this.
 */
export const RE_POS_TOXIC_ABS = 3;

/** After ×0.01, still toxic → drop the track. */
const RE_POS_TOXIC_AFTER_SCALE = 3;

function trackAbsMax(values: ArrayLike<number>): number {
  let m = 0;
  for (let i = 0; i < values.length; i++) {
    const a = Math.abs(values[i]!);
    if (a > m) m = a;
  }
  return m;
}

/**
 * Decide fate of one position track:
 * - keep as-is if absMax ≤ RE_POS_TOXIC_ABS
 * - if looks like FBX cm (large abs), scale ×0.01 and keep when safe
 * - else drop
 *
 * Critical: do NOT blanket-strip all positions. Idle bob + crouch hip drop live
 * on C_Hip.position; stripping them causes feet through floor and mesh stretch.
 */
export function sanitizeRePositionTrack(
  track: THREE.KeyframeTrack,
): { keep: boolean; scaled: boolean; track: THREE.KeyframeTrack } {
  const absMax = trackAbsMax(track.values);
  if (absMax <= RE_POS_TOXIC_ABS) {
    return { keep: true, scaled: false, track };
  }
  // FBX UnitScaleFactor 0.01: values often tens–hundreds in "cm-like" space
  if (absMax >= 5 && absMax < 500) {
    const scaled = track.clone();
    for (let i = 0; i < scaled.values.length; i++) {
      scaled.values[i]! *= 0.01;
    }
    if (trackAbsMax(scaled.values) <= RE_POS_TOXIC_AFTER_SCALE) {
      return { keep: true, scaled: true, track: scaled };
    }
  }
  return { keep: false, scaled: false, track };
}

/**
 * Noesis/Blender FBX clips for RE fighters need cleanup:
 *
 * 1. Bone `.position`: keep healthy keys (hip Y bob / crouch drop). Only drop or
 *    unit-scale tracks that exceed {@link RE_POS_TOXIC_ABS}. Never strip all pos —
 *    that freezes hips at bind height and breaks idle/crouch.
 * 2. Armature `.scale` authored as 0.01 → rewrite keys to 1.
 * 3. Armature `.quaternion` 90° X from Blender → drop (bone quats already Y-up).
 */
export function sanitizeReAnimationClips(
  clips: THREE.AnimationClip[],
): THREE.AnimationClip[] {
  return clips.map((clip) => {
    const next = clip.clone();
    const before = next.tracks.length;
    let droppedPos = 0;
    let keptPos = 0;
    let scaledPos = 0;
    let droppedArmQuat = 0;
    let fixedScale = 0;
    const out: THREE.KeyframeTrack[] = [];
    for (const track of next.tracks) {
      if (track.name.endsWith('.position')) {
        const r = sanitizeRePositionTrack(track);
        if (!r.keep) {
          droppedPos++;
          continue;
        }
        if (r.scaled) scaledPos++;
        keptPos++;
        out.push(r.track);
        continue;
      }
      // Blender FBX "Y up" on the Armature fights bone quats → character on its side
      if (
        /Armature\.quaternion$/i.test(track.name) ||
        /_Armature\.quaternion$/i.test(track.name)
      ) {
        droppedArmQuat++;
        continue;
      }
      if (track.name.endsWith('.scale')) {
        const v = track.values;
        let allUnit = true;
        let anyTiny = false;
        for (let i = 0; i < v.length; i++) {
          const x = v[i]!;
          if (Math.abs(x - 1) > 1e-3) allUnit = false;
          if (Math.abs(x - 0.01) < 1.5e-3) anyTiny = true;
        }
        if (anyTiny && !allUnit) {
          for (let i = 0; i < v.length; i++) v[i] = 1;
          fixedScale++;
        }
      }
      out.push(track);
    }
    next.tracks = out;
    if (
      droppedPos > 0 ||
      scaledPos > 0 ||
      fixedScale > 0 ||
      droppedArmQuat > 0
    ) {
      console.info(
        `[re-anim] "${next.name}": keepPos=${keptPos} dropPos=${droppedPos} ` +
          `scalePos01=${scaledPos} fixScale01=${fixedScale} ` +
          `dropArmQuat=${droppedArmQuat} (tracks ${before}→${next.tracks.length})`,
      );
    }
    return next;
  });
}

/** Identity rotation + unit scale on Armature nulls left over from FBX export. */
export function resetReArmatureTransform(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    if (!/armature/i.test(o.name)) return;
    if (!isUniformNear(o.scale, 1, 1e-3)) {
      o.scale.setScalar(1);
      n++;
    }
    // Drop Blender "apply Y-up" on the armature; bone quats already Y-up
    if (Math.abs(o.quaternion.x) > 0.1 || Math.abs(o.quaternion.y) > 0.1 || Math.abs(o.quaternion.z) > 0.1) {
      o.quaternion.identity();
      n++;
    }
  });
  return n;
}

export type PrepareReExtractedOptions = {
  /**
   * When true (default), reset FBX scales and skeleton.pose() on `model`.
   * Set false when only sanitizing clips for an already-installed live fighter
   * (ensureLogicClip) — pose() would flash bind pose every async load.
   */
  poseModel?: boolean;
};

/**
 * Prepare RE-extracted fighter hierarchy for runtime:
 * fix unit scales, optional bind pose, sanitize position curves (keep healthy hip Y).
 * Safe no-op for Soldier/Xbot/etc.
 */
export function prepareReExtractedFighter(
  model: THREE.Object3D,
  animations: THREE.AnimationClip[],
  opts?: PrepareReExtractedOptions,
): { animations: THREE.AnimationClip[]; applied: boolean; unitScalesFixed: number } {
  if (!looksLikeReExtractedModel(model) && animations.length === 0) {
    return { animations, applied: false, unitScalesFixed: 0 };
  }
  // Also treat as RE if any clip position track is extreme
  const hasToxicPos = animations.some((clip) =>
    clip.tracks.some((t) => {
      if (!t.name.endsWith('.position')) return false;
      for (let i = 0; i < t.values.length; i++) {
        if (Math.abs(t.values[i]!) > RE_POS_TOXIC_ABS) return true;
      }
      return false;
    }),
  );
  const isRe = looksLikeReExtractedModel(model) || hasToxicPos;
  if (!isRe) return { animations, applied: false, unitScalesFixed: 0 };

  const poseModel = opts?.poseModel !== false;
  let unitScalesFixed = 0;

  if (poseModel) {
    unitScalesFixed = resetFbxUnitScales(model);
    unitScalesFixed += resetReArmatureTransform(model);

    model.traverse((o) => {
      const sm = o as THREE.SkinnedMesh;
      if (sm.isSkinnedMesh && sm.skeleton) {
        sm.skeleton.pose();
      }
    });
    // pose() re-applies Root bone bind scale 0.01
    unitScalesFixed += resetFbxUnitScales(model);
    unitScalesFixed += resetReArmatureTransform(model);

    model.traverse((o) => {
      const sm = o as THREE.SkinnedMesh;
      if (sm.isSkinnedMesh && sm.skeleton) sm.skeleton.update();
    });
    model.updateMatrixWorld(true);
  }

  const cleaned = sanitizeReAnimationClips(animations);
  console.info(
    `[re-extract] prepared model unitScalesFixed=${unitScalesFixed} ` +
      `poseModel=${poseModel ? 1 : 0} clips=${cleaned.length}`,
  );
  return { animations: cleaned, applied: true, unitScalesFixed };
}

/**
 * Detach meshes with absurd local bounds (Eye Tear at z≈-163).
 * Returns number of meshes removed.
 */
export function pruneOutlierMeshes(
  root: THREE.Object3D,
  maxExtent = OUTLIER_MAX_EXTENT,
  maxCenter = OUTLIER_MAX_CENTER,
): number {
  const doomed: THREE.Mesh[] = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    if (!bb || bb.isEmpty()) return;
    const size = bb.getSize(new THREE.Vector3());
    const center = bb.getCenter(new THREE.Vector3());
    const extent = Math.max(size.x, size.y, size.z);
    const far = Math.max(Math.abs(center.x), Math.abs(center.y), Math.abs(center.z));
    if (extent > maxExtent || far > maxCenter) {
      console.warn(
        `[prune] remove outlier "${mesh.name}" extent=${extent.toFixed(2)} ` +
          `centerFar=${far.toFixed(2)} center=(${center.x.toFixed(2)},${center.y.toFixed(2)},${center.z.toFixed(2)})`,
      );
      doomed.push(mesh);
    }
  });

  for (const mesh of doomed) {
    mesh.parent?.remove(mesh);
    // do not dispose shared materials/geo still referenced by template clones
  }
  return doomed.length;
}

/**
 * Optional bake — prefer keeping skin for procedural/clip animation.
 * Bind-pose static conversion for emergency use only.
 */
export function bakeSkinnedMeshesToStatic(root: THREE.Object3D): number {
  const skinned: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh && sm.visible) skinned.push(sm);
  });

  let baked = 0;
  for (const sm of skinned) {
    try {
      const geometry = sm.geometry.clone();
      geometry.deleteAttribute('skinIndex');
      geometry.deleteAttribute('skinWeight');
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();

      const bb = geometry.boundingBox;
      if (bb) {
        const size = bb.getSize(new THREE.Vector3());
        const center = bb.getCenter(new THREE.Vector3());
        const extent = Math.max(size.x, size.y, size.z);
        const far = Math.max(Math.abs(center.x), Math.abs(center.y), Math.abs(center.z));
        if (extent > OUTLIER_MAX_EXTENT || far > OUTLIER_MAX_CENTER) {
          sm.parent?.remove(sm);
          continue;
        }
      }

      const mesh = new THREE.Mesh(geometry, sm.material);
      mesh.name = sm.name || 'baked';
      mesh.frustumCulled = false;
      mesh.visible = true;
      mesh.position.copy(sm.position);
      mesh.quaternion.copy(sm.quaternion);
      mesh.scale.copy(sm.scale);

      const parent = sm.parent;
      if (parent) {
        parent.add(mesh);
        parent.remove(sm);
      }
      baked++;
    } catch (e) {
      console.warn(`[bake] failed for ${sm.name}`, e);
    }
  }

  const leftovers: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh) leftovers.push(sm);
  });
  for (const sm of leftovers) sm.parent?.remove(sm);

  if (baked > 0) console.info(`[bake] converted ${baked} SkinnedMesh → static Mesh`);
  return baked;
}

/**
 * Scale so height ≈ targetHeight, feet on y=0, center XZ.
 */
export function normalizeModelToHeight(
  model: THREE.Object3D,
  targetHeight = 1.85,
): { unitScale: number; box: THREE.Box3 } {
  model.updateMatrixWorld(true);

  model.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh && sm.skeleton) {
      sm.skeleton.update();
      sm.computeBoundingBox?.();
    }
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) {
      mesh.geometry.computeBoundingBox();
      mesh.geometry.computeBoundingSphere();
    }
  });

  let box = robustWorldBox(model);
  let size = box.getSize(new THREE.Vector3());
  let h = size.y;

  const bodyH = measurePreferredHeight(model);
  if (bodyH != null && bodyH > 0.2) {
    h = bodyH;
    console.info(`[normalize] using preferred mesh height=${h.toFixed(3)}`);
  }

  if (!Number.isFinite(h) || h < 1e-4) {
    console.warn('[normalize] empty/tiny bounds, force unitScale=1');
    h = 1.85;
  }

  // RE/FBX extracts can need ~100× after a single leftover UnitScaleFactor;
  // keep a high ceiling so we never leave a cm-tall fighter at unitScale=20.
  const unitScale = THREE.MathUtils.clamp(targetHeight / h, 0.05, 500);
  model.scale.multiplyScalar(unitScale);
  model.updateMatrixWorld(true);

  // Refresh skinned bounds after scale
  model.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh && sm.skeleton) sm.skeleton.update();
  });

  box = robustWorldBox(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x += -center.x;
  model.position.z += -center.z;
  model.position.y += -box.min.y;
  model.updateMatrixWorld(true);

  box = robustWorldBox(model);
  size = box.getSize(new THREE.Vector3());
  console.info(
    `[normalize] unitScale=${unitScale.toFixed(5)} size=(${size.x.toFixed(2)},${size.y.toFixed(2)},${size.z.toFixed(2)}) y=[${box.min.y.toFixed(2)},${box.max.y.toFixed(2)}]`,
  );
  return { unitScale, box };
}

function measurePreferredHeight(root: THREE.Object3D): number | null {
  const prefer = [/body/i, /cloth/i, /dougi/i, /head/i, /waraji/i, /costume/i];
  const heights: number[] = [];
  root.updateMatrixWorld(true);
  const _box = new THREE.Box3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible || !mesh.geometry) return;
    if (!prefer.some((re) => re.test(mesh.name))) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    if (!mesh.geometry.boundingBox) return;
    _box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
    const s = _box.getSize(new THREE.Vector3());
    if (s.y > 0.05 && s.y < 10) heights.push(s.y);
  });
  if (heights.length === 0) return null;
  return Math.max(...heights);
}

/** AABB from visible non-outlier meshes only (prefers skinned computeBoundingBox). */
export function robustWorldBox(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  let any = false;
  const _box = new THREE.Box3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible || !mesh.geometry) return;

    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh && sm.skeleton) {
      sm.skeleton.update();
      sm.computeBoundingBox();
      if (sm.boundingBox && !sm.boundingBox.isEmpty()) {
        _box.copy(sm.boundingBox).applyMatrix4(sm.matrixWorld);
      } else {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        if (!mesh.geometry.boundingBox) return;
        _box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
      }
    } else {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      if (!mesh.geometry.boundingBox) return;
      _box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
    }

    if (_box.isEmpty()) return;
    const s = _box.getSize(new THREE.Vector3());
    const c = _box.getCenter(new THREE.Vector3());
    if (!Number.isFinite(s.x) || s.length() < 1e-8) return;
    if (Math.max(s.x, s.y, s.z) > 50) return;
    if (Math.max(Math.abs(c.x), Math.abs(c.y), Math.abs(c.z)) > 100) return;
    if (!any) {
      box.copy(_box);
      any = true;
    } else {
      box.union(_box);
    }
  });
  if (!any) {
    box.set(new THREE.Vector3(-0.3, 0, -0.3), new THREE.Vector3(0.3, 1.85, 0.3));
  }
  return box;
}
