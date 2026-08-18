import * as THREE from 'three/webgpu';

/** Max texture edge after load — SF6 interim glb ships multiple 4K maps (~293MB). */
const MAX_TEX_SIZE = 1024;

/**
 * External Ryu albedo pack — NOT embedded in esf001_TPose.fbx.
 * Source on disk:
 *   private/interim/characters/SF6 Ryu Model/SF6 Ryu textures/*_albdout.png
 * Served by Vite middleware as /private-interim/...
 *
 * The TPose FBX only has media *names* (esf_Body00, …) with no image bytes
 * and no real RelativeFilename paths, so FBXLoader cannot load textures from it.
 */
const RYU_ALBEDO_BASE =
  '/private-interim/characters/SF6 Ryu Model/SF6 Ryu textures';

const RYU_ALBEDO_FILES: Record<string, string> = {
  head: 'esf001_000_00_head_albdout.png',
  body: 'esf001_000_01_body_albdout.png',
  hair: 'esf001_000_02_hair_albdout.png',
  clotha: 'esf001_001_01_clotha_albdout.png',
  clothb: 'esf001_001_01_clothb_albdout.png',
  eye: 'esf001_000_00_eye_albdout.png',
};

let ryuAlbedoCatalog: Map<string, THREE.Texture> | null = null;
let ryuAlbedoLoad: Promise<Map<string, THREE.Texture>> | null = null;

/** Preload external Ryu albedo maps for mesh without embedded textures. */
export async function ensureRyuFallbackAlbedoCatalog(): Promise<
  Map<string, THREE.Texture>
> {
  if (ryuAlbedoCatalog) return ryuAlbedoCatalog;
  if (!ryuAlbedoLoad) {
    ryuAlbedoLoad = (async () => {
      const map = new Map<string, THREE.Texture>();
      const loader = new THREE.TextureLoader();
      const entries = Object.entries(RYU_ALBEDO_FILES);
      await Promise.all(
        entries.map(async ([key, file]) => {
          // Spaces in path must be encoded for fetch
          const url = encodeURI(`${RYU_ALBEDO_BASE}/${file}`);
          try {
            const tex = await loader.loadAsync(url);
            if (!isUsableTexture(tex)) {
              console.warn(`[mat] albedo unusable after load ${url}`);
              return;
            }
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.wrapS = THREE.ClampToEdgeWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;
            // TextureLoader default flipY=true matches most PNG packs in Three
            tex.flipY = true;
            tex.name = `ryu_albd_${key}`;
            tex.needsUpdate = true;
            downscaleTexture(tex, MAX_TEX_SIZE);
            if (!isUsableTexture(tex)) {
              console.warn(`[mat] albedo unusable after downscale ${url}`);
              return;
            }
            map.set(key, tex);
          } catch (e) {
            console.warn(`[mat] failed to load Ryu albedo ${url}`, e);
          }
        }),
      );
      const any =
        map.get('clotha') ?? map.get('body') ?? map.get('head') ?? null;
      if (any) map.set('__any_albd', any);
      console.info(
        `[mat] Ryu external albedos loaded: ${[...map.keys()].join(', ') || '(NONE — check /private-interim and restart vite)'}`,
      );
      ryuAlbedoCatalog = map;
      return map;
    })();
  }
  return ryuAlbedoLoad;
}

export function getRyuFallbackAlbedoCatalog(): Map<string, THREE.Texture> {
  return ryuAlbedoCatalog ?? new Map();
}

/** Humanoid submesh AABB gate (meters in asset bind units, pre-normalize). */
const OUTLIER_MAX_EXTENT = 4;
const OUTLIER_MAX_CENTER = 6;

/**
 * SF6 / Blender ports often use KHR_materials_specular + anisotropy + ior,
 * and mis-slot Capcom packed maps (atos/nrrc/cmask) as baseColor.
 * Rebuild as MeshStandardMaterial with remapped albedo when possible.
 */
export function countEmbeddedColorMaps(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of list) {
      const m = mat as THREE.MeshStandardMaterial;
      if (m.map && isUsableTexture(m.map)) n++;
    }
  });
  return n;
}

/** True when glb already carries prepared color maps (skip FBX albedo fallback). */
export function isPreparedTexturedModel(root: THREE.Object3D): boolean {
  if (root.userData?.ryuPreparedArt) return true;
  let hits = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of list) {
      const m = mat as THREE.MeshStandardMaterial;
      const label = textureName(m.map).toLowerCase();
      if (
        label.includes('color_final') ||
        label.includes('headband') ||
        label.includes('head_color') ||
        label.includes('body_color') ||
        label.includes('clotha') ||
        label.includes('clothb') ||
        label.includes('prepared') ||
        label.includes('belt_color')
      ) {
        hits++;
      }
    }
  });
  return hits >= 2 || countEmbeddedColorMaps(root) >= 8;
}

export function sanitizeObjectMaterials(root: THREE.Object3D): void {
  const prepared = isPreparedTexturedModel(root);
  const albedoByKey = collectAlbedoTextures(root);
  // FBX path needs external albedos; prepared textured glb must NOT be remapped.
  if (!prepared) {
    for (const [k, tex] of getRyuFallbackAlbedoCatalog()) {
      albedoByKey.set(k, tex);
    }
  }

  let withMap = 0;
  let solid = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;

    mesh.frustumCulled = false;
    // Do NOT force visible=true — pruneOutlierMeshes relies on remove, but be safe
    // Shadows: plan lighting-system-v0 §S4 — fighters must cast for key dir light.
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Hide face shells + open-gi/cape (no clothing system — consensus: no cape).
    const mn = mesh.name.toLowerCase();
    if (
      mn.includes('eyetear') ||
      mn.includes('eye_tear') ||
      mn.includes('eyeshadow') ||
      mn.includes('mouth00') ||
      (mn.includes('mouth') && !mn.includes('head')) ||
      mn.includes('costume00') ||
      mn.includes('threads') ||
      (mn.includes('ring') && !mn.includes('string')) ||
      mn.includes('icosphere')
    ) {
      mesh.visible = false;
    }

    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = list.map((mat) =>
      sanitizeOne(mat, mesh.name, albedoByKey, prepared),
    );
    mesh.material = Array.isArray(mesh.material) ? next : next[0]!;
    const m0 = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const std = m0 as THREE.MeshStandardMaterial;
    if (std?.map) withMap++;
    else solid++;
  });
  console.info(
    `[mat] sanitize done maps=${withMap} solid=${solid} catalog=${albedoByKey.size} preparedTextured=${prepared ? 1 : 0}`,
  );
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
  // HeadBand must win before bare "head" (name is esf_HeadBand).
  if (n.includes('headband') || n.includes('head_band')) {
    order.push('clotha', 'clothb');
  } else if (
    n.includes('hair') ||
    n.includes('beard') ||
    n.includes('brow') ||
    n.includes('lash')
  ) {
    order.push('hair');
  } else if (n.includes('mouth')) {
    order.push('head');
  } else if (n.includes('head') || n.includes('face')) {
    order.push('head');
  } else if (n.includes('body') || n.includes('skin')) {
    order.push('body', 'head');
  } else if (
    n.includes('waraji') ||
    n.includes('pants') ||
    n.includes('dougi') ||
    n.includes('obi') ||
    n.includes('sarashi') ||
    n.includes('glove')
  ) {
    order.push('clothb', 'clotha');
  } else if (
    n.includes('cloth') ||
    n.includes('costume') ||
    n.includes('ring') ||
    n.includes('thread')
  ) {
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

/** FBX missing-media stand-ins (data:image/… 1×1) must not be used as albedo. */
function isPlaceholderTexture(tex: THREE.Texture): boolean {
  const label = textureName(tex);
  if (label.includes('data:image') || label.includes('data:application')) {
    return true;
  }
  const img = tex.image as { width?: number; height?: number } | undefined;
  if (img && img.width === 1 && img.height === 1) return true;
  return false;
}

/**
 * WebGPU Textures.updateTexture reads `image.complete` — null image throws and
 * blacks the canvas. Only pass fully-decoded bitmaps/canvases through.
 */
export function isUsableTexture(
  tex: THREE.Texture | null | undefined,
): tex is THREE.Texture {
  if (!tex) return false;
  const img = tex.image as
    | HTMLImageElement
    | ImageBitmap
    | HTMLCanvasElement
    | { width?: number; height?: number; complete?: boolean }
    | null
    | undefined;
  if (img == null) return false;
  if (typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement) {
    return img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
  }
  if (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) {
    return img.width > 0 && img.height > 0;
  }
  if (typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement) {
    return img.width > 0 && img.height > 0;
  }
  const w = (img as { width?: number }).width ?? 0;
  const h = (img as { height?: number }).height ?? 0;
  return w > 0 && h > 0;
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

/**
 * Capcom RE albedos are often *neutral* (gray hair, undyed cloth). In-engine
 * dyes come from cmask + costume params. Without that shader, multiply a part
 * tint so MeshStandardMaterial looks like SF6 Ryu C1 defaults.
 *
 * When `hasMap`, body/head stay white (albedo already has skin/face color);
 * hair/headband/belt still need a strong tint.
 */
function partColorTint(
  meshName: string,
  matName: string,
  hasMap: boolean,
): THREE.Color {
  const n = `${meshName} ${matName}`.toLowerCase();

  // --- always tint these (albedos are gray / undyed) ---
  if (
    n.includes('hair') ||
    n.includes('beard') ||
    n.includes('brow') ||
    n.includes('lash')
  ) {
    // RE hair_albd is light gray; darken toward black/brown
    return new THREE.Color(0x1a1410);
  }
  if (n.includes('headband') || n.includes('head_band')) {
    // Classic Ryu red hachimaki (cmask dye slot, not in albedo)
    return new THREE.Color(0xc41e1e);
  }
  if (n.includes('obisign') || n.includes('obi_sign')) {
    return new THREE.Color(0x141414);
  }
  if (n.includes('obi') && !n.includes('sign')) {
    // black belt
    return new THREE.Color(hasMap ? 0x2a2a2a : 0x1a1a1a);
  }
  if (n.includes('waraji')) {
    return new THREE.Color(hasMap ? 0xb07a45 : 0x3d2b1f);
  }
  if (n.includes('eyeshadow') || n.includes('eyetear')) {
    return new THREE.Color(0x2a2220);
  }
  if (
    n.includes('eye') &&
    !n.includes('brow') &&
    !n.includes('lash') &&
    !n.includes('shadow')
  ) {
    return new THREE.Color(0xffffff);
  }

  // --- solid fallbacks when no map ---
  if (!hasMap) {
    if (
      n.includes('body') ||
      n.includes('head') ||
      n.includes('mouth') ||
      n.includes('skin') ||
      n.includes('face')
    ) {
      return new THREE.Color(0xc68642);
    }
    if (n.includes('glove') || n.includes('ring')) {
      return new THREE.Color(0x3d2b1f);
    }
    if (n.includes('sign') || n.includes('belt')) {
      return new THREE.Color(0x1a1a1a);
    }
    // dougi / wraps
    return new THREE.Color(0xf2efe6);
  }

  // textured skin / cloth / gloves: albedo carries detail
  if (
    n.includes('body') ||
    n.includes('head') ||
    n.includes('mouth') ||
    n.includes('skin') ||
    n.includes('face')
  ) {
    return new THREE.Color(0xffffff);
  }
  // gloves / hand wraps / pants / costume — keep fabric albedo
  return new THREE.Color(0xffffff);
}

function prepareTexture(
  tex: THREE.Texture | null | undefined,
  colorSpace: THREE.ColorSpace,
): THREE.Texture | null {
  if (!isUsableTexture(tex)) return null;
  if (isPlaceholderTexture(tex)) return null;
  tex.colorSpace = colorSpace;
  tex.needsUpdate = true;
  downscaleTexture(tex, MAX_TEX_SIZE);
  // downscale must not leave a broken image
  if (!isUsableTexture(tex)) return null;
  return tex;
}

function downscaleTexture(tex: THREE.Texture, maxSize: number): void {
  if (!isUsableTexture(tex)) return;
  const img = tex.image as
    | HTMLImageElement
    | ImageBitmap
    | HTMLCanvasElement
    | { width: number; height: number };
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
  preparedTextured = false,
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
  // Drop broken / stub maps — null image kills WebGPU (image.complete)
  if (map && (!isUsableTexture(map) || isPlaceholderTexture(map))) {
    map = null;
  }
  if (map && isDataMapName(mapLabel) && !preparedTextured) {
    const remapped = pickAlbedo(meshName, mat.name || '', albedoCatalog);
    if (remapped && isUsableTexture(remapped)) {
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

  // If still no map, try catalog for this part (FBX only)
  if (!map && !preparedTextured) {
    const picked = pickAlbedo(meshName, mat.name || '', albedoCatalog);
    map = isUsableTexture(picked) ? picked : null;
  }
  if (map && !isUsableTexture(map)) map = null;

  let normalMap = anyMat.normalMap ?? null;
  const nLabel = textureName(normalMap);
  // Drop raw RE packed nrrc / masks only — keep converted *_bump and glTF normals.
  // @see docs/plans/ai-execution-plan-character-art-textures-v1.md B2
  const isRawPackedNormal =
    nLabel.includes('nrrc') && !nLabel.includes('bump');
  if (
    !isUsableTexture(normalMap) ||
    (normalMap != null && isPlaceholderTexture(normalMap)) ||
    isRawPackedNormal ||
    nLabel.includes('dmask') ||
    (nLabel.includes('msk') && !nLabel.includes('bump'))
  ) {
    normalMap = null;
  }

  let roughnessMap = (anyMat as { roughnessMap?: THREE.Texture | null })
    .roughnessMap ?? null;
  const rLabel = textureName(roughnessMap);
  if (
    !isUsableTexture(roughnessMap) ||
    (roughnessMap != null && isPlaceholderTexture(roughnessMap)) ||
    rLabel.includes('nrrc')
  ) {
    roughnessMap = null;
  }

  map = prepareTexture(map, THREE.SRGBColorSpace);
  normalMap = prepareTexture(normalMap, THREE.NoColorSpace);
  roughnessMap = prepareTexture(roughnessMap, THREE.NoColorSpace);

  const matLabel = mat.name || '';
  const n = `${meshName} ${matLabel}`.toLowerCase();
  const isEye =
    (n.includes('eye') &&
      !n.includes('brow') &&
      !n.includes('lash') &&
      !n.includes('shadow') &&
      !n.includes('tear')) ||
    n.includes('eye00');
  // Flat/constant eye normals force sideways lighting → green/black iris.
  if (isEye) {
    normalMap = null;
    roughnessMap = null;
  }

  // Textured glb already has offline dye; keep white multiply unless map missing.
  const color =
    map != null
      ? new THREE.Color(0xffffff)
      : partColorTint(meshName, matLabel, false);

  let transparent = Boolean(anyMat.transparent || (mat.opacity ?? 1) < 0.99);
  let opacity = typeof mat.opacity === 'number' ? mat.opacity : 1;
  const isHair =
    n.includes('hair') || n.includes('lash') || n.includes('beard');
  const isHeadband = n.includes('headband') || n.includes('head_band');
  const isCloth =
    n.includes('costume') ||
    n.includes('cloth') ||
    n.includes('dougi') ||
    n.includes('obi') ||
    n.includes('waraji') ||
    n.includes('thread') ||
    n.includes('glove');
  // Cloth/hair: atlas often has empty black UVs — need alpha test cutout
  if (isHair || isCloth || isHeadband) {
    transparent = true;
    opacity = 1;
  }
  if (opacity < 0.05) {
    opacity = 1;
    transparent = false;
  }

  // Hair cards: no normal (solid gray islands). Cloth: keep soft normals from glb.
  if (isHair) {
    normalMap = null;
    roughnessMap = null;
  }

  const metalness = 0.0;
  let roughness = 0.75;
  if (isHair) roughness = 0.62;
  else if (isHeadband) roughness = 0.82;
  else if (isEye) roughness = 0.22;
  else if (isCloth) roughness = 0.78;
  else if (n.includes('body') || n.includes('head') || n.includes('skin')) {
    roughness = 0.68;
  }
  if (roughnessMap) roughness = 0.75;

  const out = new THREE.MeshStandardMaterial({
    name: mat.name ? `${mat.name}_safe` : 'sanitized',
    color,
    map,
    normalMap,
    metalness,
    roughness,
    roughnessMap: isHair ? null : roughnessMap,
    metalnessMap: null,
    emissive: new THREE.Color(0x000000),
    emissiveMap: null,
    alphaMap: null,
    transparent,
    opacity,
    side: isHair || isHeadband || isCloth ? THREE.DoubleSide : THREE.FrontSide,
    depthWrite: !(isHair && transparent),
    vertexColors: false,
    // Cut empty atlas texels (black) and hair cards
    alphaTest: isCloth || isHeadband ? 0.12 : isHair ? 0.35 : 0,
    envMapIntensity: 0.35,
  });
  if (normalMap) {
    // Soft defaults; debug panel artNormalScale can raise
    const ns = isCloth || isHeadband ? 0.3 : 0.45;
    out.normalScale = new THREE.Vector2(ns, ns);
  }
  if (isEye && map) {
    out.emissive = new THREE.Color(0x221c18);
    out.emissiveIntensity = 0.2;
  } else {
    out.emissive = color.clone().multiplyScalar(map ? 0.01 : 0.05);
  }
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

/**
 * Reset FBX unit scales on nodes and bones. Call again after skeleton.pose().
 * - 0.01: classic RE/Noesis UnitScaleFactor (cm embedded as scale)
 * - 100: Blender FBX export often stamps 100 on every mesh/armature/light
 *
 * Skips `root` itself (no intentional unit factor is stored there anymore).
 */
export function resetFbxUnitScales(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    if (o === root) return;
    if (isUniformNear(o.scale, 0.01)) {
      o.scale.setScalar(1);
      n++;
      return;
    }
    // Blender binary FBX: scale is often exactly 100 (or 99.999…)
    if (isUniformNear(o.scale, 100, 0.5)) {
      o.scale.setScalar(1);
      n++;
    }
  });
  return n;
}

/**
 * Max local (geometry-space) extent across meshes. RE TPose body is ~160 "cm";
 * meter glbs are ~1–2. Used for cm→m detection.
 */
export function maxLocalMeshExtent(root: THREE.Object3D): number {
  let maxE = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    if (!bb || bb.isEmpty()) return;
    const s = bb.getSize(new THREE.Vector3());
    maxE = Math.max(maxE, s.x, s.y, s.z);
  });
  return maxE;
}

/**
 * Some RE FBX (e.g. esf001_TPose) store vertices + bone locals in centimeters
 * while node scale is 1. Scaling only `root.scale *= 0.01` makes the bind pose
 * look OK, but combat clips (meters on C_Hip.position) explode the skin:
 * bind inverse expects hip ~105 while tracks set hip ~0.95.
 *
 * Bake ×0.01 into geometry + **all** node positions and rebind skeletons so
 * anim tracks and bind pose share meter space. Idempotent via
 * `userData.reMeterBaked`.
 *
 * **Call once on the loaded template before cloning P1/P2** (see
 * {@link bakeRyuMeshTemplate}). Baking each clone separately breaks the second
 * fighter.
 */
export function applyReCentimeterToMeterIfNeeded(root: THREE.Object3D): boolean {
  if (root.userData?.reMeterBaked) return true;

  const maxLocal = maxLocalMeshExtent(root);
  // Local body ~1.5–2m (glb) vs ~80–200cm (TPose FBX). Threshold 20 separates them.
  if (!(maxLocal >= 20 && maxLocal <= 500)) return false;

  const s = 0.01;
  /** Scale each unique BufferGeometry once (meshes often share geo). */
  const scaledGeo = new Set<string>();
  /** Scale each Bone/Object once (multi-mesh FBX duplicates bone objects). */
  const scaledNode = new Set<string>();

  root.traverse((o) => {
    if (o === root) return;
    if (!scaledNode.has(o.uuid)) {
      scaledNode.add(o.uuid);
      o.position.multiplyScalar(s);
      // Keep matrix in sync when loaders left matrix stale vs position
      o.updateMatrix();
    }

    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const id = mesh.geometry.uuid;
    if (scaledGeo.has(id)) return;
    scaledGeo.add(id);
    // In-place: call {@link bakeRyuMeshTemplate} once on the loaded scene
    // *before* SkeletonUtils.clone for P1/P2. Per-clone bake corrupts the
    // second fighter (pose/boneInverses interact badly across clones).
    mesh.geometry.scale(s, s, s);
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  });

  const seenSkel = new Set<THREE.Skeleton>();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (!sm.isSkinnedMesh || !sm.skeleton) return;

    if (!seenSkel.has(sm.skeleton)) {
      seenSkel.add(sm.skeleton);
      for (const bone of sm.skeleton.bones) {
        bone.updateMatrix();
      }
      sm.skeleton.calculateInverses();
    }
    // Rebind so boneInverses match scaled bind pose
    sm.bind(sm.skeleton, sm.bindMatrix);
  });

  root.scale.set(1, 1, 1);
  root.userData.reMeterBaked = true;
  delete root.userData.reMeterScale;
  root.updateMatrixWorld(true);

  console.info(
    `[re-extract] cm→m baked geo+positions (maxLocal was ${maxLocal.toFixed(2)}) ` +
      `nodes=${scaledNode.size} skeletons=${seenSkel.size}`,
  );
  return true;
}

/**
 * FBXLoader often builds **one Skeleton per SkinnedMesh**, each with its own
 * Bone objects (same names, different UUIDs). AnimationMixer tracks resolve
 * `C_Hip.position` to a single node — only one mesh deforms; the rest stay at
 * bind or partially follow a broken parent chain → visible explosion.
 *
 * Rebind every mesh so skin indices still match order, but bone *objects* are
 * the primary armature's bones (by name). Safe no-op when already shared.
 *
 * Call **after** cm→m bake / pose, **before** SkeletonUtils.clone.
 */
export function unifySkinnedMeshSkeletons(root: THREE.Object3D): number {
  if (root.userData?.reSkeletonsUnified) return 0;

  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh && sm.skeleton?.bones?.length) meshes.push(sm);
  });
  if (meshes.length < 2) {
    root.userData.reSkeletonsUnified = true;
    return 0;
  }

  // Prefer the fullest body rig (most bones); ties → first.
  let primary = meshes[0]!;
  for (const m of meshes) {
    if (m.skeleton.bones.length > primary.skeleton.bones.length) primary = m;
  }

  const byName = new Map<string, THREE.Bone>();
  for (const b of primary.skeleton.bones) {
    if (!byName.has(b.name)) byName.set(b.name, b);
  }

  let rebound = 0;
  for (const mesh of meshes) {
    if (mesh === primary) continue;
    const srcBones = mesh.skeleton.bones;
    const ordered: THREE.Bone[] = [];
    const inverses: THREE.Matrix4[] = [];
    let mapped = 0;
    for (let i = 0; i < srcBones.length; i++) {
      const src = srcBones[i]!;
      const shared = byName.get(src.name);
      if (shared) {
        ordered.push(shared);
        const pi = primary.skeleton.bones.indexOf(shared);
        inverses.push(
          (pi >= 0
            ? primary.skeleton.boneInverses[pi]
            : mesh.skeleton.boneInverses[i]
          )!.clone(),
        );
        mapped++;
      } else {
        // Mesh-only helper bone (rare): keep private bone + inverse
        ordered.push(src);
        inverses.push(mesh.skeleton.boneInverses[i]!.clone());
      }
    }
    // Only rebind when we actually point at primary bones
    if (mapped === 0) continue;
    const alreadyShared = srcBones.every((b, i) => b === ordered[i]);
    if (alreadyShared) continue;
    mesh.bind(new THREE.Skeleton(ordered, inverses), mesh.bindMatrix);
    rebound++;
  }

  root.userData.reSkeletonsUnified = true;
  if (rebound > 0) {
    console.info(
      `[re-extract] unified skeletons: primaryBones=${primary.skeleton.bones.length} ` +
        `meshes=${meshes.length} rebound=${rebound}`,
    );
  }
  return rebound;
}

/**
 * One-shot template prepare for Ryu FBX/glb: clutter strip, unit fix, cm→m bake,
 * skeleton unify. Run on the scene returned by the mesh loader **before**
 * installFromTemplate clones for P1/P2.
 */
export function bakeRyuMeshTemplate(root: THREE.Object3D): void {
  if (root.userData?.ryuTemplateBaked) return;
  const prepared = prepareReExtractedFighter(root, []);
  // FBX multi-mesh: share one armature so mixer tracks drive every SkinnedMesh
  unifySkinnedMeshSkeletons(root);
  // Assign external albedos on the template so SkeletonUtils.clone shares
  // textured materials (FBX itself has no image embeds).
  sanitizeObjectMaterials(root);
  root.userData.ryuTemplateBaked = true;
  // Only mark meter-baked when prepare actually did (or mesh already meters)
  if (prepared.applied || root.userData?.reMeterBaked) {
    root.userData.reMeterBaked = true;
  } else if (maxLocalMeshExtent(root) < 20) {
    // Already meter-scale glb
    root.userData.reMeterBaked = true;
  }
  console.info(
    `[re-extract] mesh template baked (clone-safe for P1/P2) reExtract=${prepared.applied ? 1 : 0} ` +
      `reMeterBaked=${root.userData.reMeterBaked ? 1 : 0}`,
  );
}

/**
 * Drop Blender/FBX scene clutter that inflates world bounds:
 * lights, cameras, non-skinned helper meshes (e.g. leftover 棱角球 / icosphere).
 * Keeps SkinnedMesh + Armature/bones only.
 */
export function stripFbxSceneClutter(root: THREE.Object3D): number {
  const doomed: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o === root) return;
    const any = o as THREE.Object3D & {
      isLight?: boolean;
      isCamera?: boolean;
    };
    if (any.isLight || any.isCamera) {
      doomed.push(o);
      return;
    }
    const mesh = o as THREE.Mesh;
    const skinned = o as THREE.SkinnedMesh;
    if (mesh.isMesh && !skinned.isSkinnedMesh) {
      doomed.push(o);
    }
  });
  // Remove deepest-first so parent walks stay valid
  doomed.sort((a, b) => {
    let da = 0;
    let db = 0;
    for (let p = a.parent; p; p = p.parent) da++;
    for (let p = b.parent; p; p = p.parent) db++;
    return db - da;
  });
  const names: string[] = [];
  for (const o of doomed) {
    names.push(o.name || o.type);
    o.parent?.remove(o);
  }
  if (names.length > 0) {
    console.info(
      `[re-extract] stripped ${names.length} FBX clutter: ${names.slice(0, 12).join(', ')}` +
        (names.length > 12 ? '…' : ''),
    );
  }
  return doomed.length;
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
/**
 * Drop tracks whose node name is not under `root` (e.g. Mantle_Folds after cape mesh
 * removal). Prevents ~1000 PropertyBinding warnings and broken mixer binds.
 */
export function filterClipTracksToHierarchy(
  clip: THREE.AnimationClip,
  root: THREE.Object3D,
): THREE.AnimationClip {
  const names = new Set<string>();
  root.traverse((o) => {
    if (o.name) names.add(o.name);
  });
  // Also collect skeleton bone names from SkinnedMesh
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh && sm.skeleton) {
      for (const b of sm.skeleton.bones) {
        if (b.name) names.add(b.name);
      }
    }
  });

  const before = clip.tracks.length;
  const kept = clip.tracks.filter((t) => {
    // "BoneName.quaternion" or "path/BoneName.position"
    const node = t.name.split('.')[0] ?? '';
    const base = node.includes('/') ? node.slice(node.lastIndexOf('/') + 1) : node;
    return names.has(base) || names.has(node);
  });
  if (kept.length === before) return clip;
  const next = clip.clone();
  next.tracks = kept.map((t) => t.clone());
  next.name = clip.name;
  // One line per clip, not per missing track
  console.info(
    `[re-anim] "${clip.name}": drop unbound tracks ${before}→${kept.length} (cape/sim bones etc.)`,
  );
  return next;
}

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

  // Blender FBX often includes lights/cameras + helper meshes (棱角球) that
  // make isReasonableFighter fail (height > 4 or depth spikes).
  stripFbxSceneClutter(model);

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

    // esf001_TPose-style: vertices + bone locals in cm, node scale already 1
    if (applyReCentimeterToMeterIfNeeded(model)) {
      unitScalesFixed += 1;
      model.traverse((o) => {
        const sm = o as THREE.SkinnedMesh;
        if (sm.isSkinnedMesh && sm.skeleton) sm.skeleton.update();
      });
    }

    // After units are stable, collapse per-mesh FBX skeletons onto one armature
    unifySkinnedMeshSkeletons(model);
  }

  const cleaned = sanitizeReAnimationClips(animations);
  console.info(
    `[re-extract] prepared model unitScalesFixed=${unitScalesFixed} ` +
      `poseModel=${poseModel ? 1 : 0} clips=${cleaned.length}`,
  );
  return { animations: cleaned, applied: true, unitScalesFixed };
}

/**
 * Detach meshes with absurd **world** bounds (e.g. Eye Tear floating far away).
 * Uses world AABB so cm-space geometry is safe after root ×0.01 (see
 * {@link applyReCentimeterToMeterIfNeeded}); local-only checks would delete
 * the whole TPose body (extent ~160 "cm").
 *
 * Safety: if the rule would remove ≥ half of skinned meshes, abort (unit-scale
 * still wrong) rather than leaving an empty fighter.
 * Returns number of meshes removed.
 */
export function pruneOutlierMeshes(
  root: THREE.Object3D,
  maxExtent = OUTLIER_MAX_EXTENT,
  maxCenter = OUTLIER_MAX_CENTER,
): number {
  // Ensure intentional cm→m root scale survived pose/reset.
  applyReCentimeterToMeterIfNeeded(root);

  const doomed: THREE.Mesh[] = [];
  let skinnedTotal = 0;
  root.updateMatrixWorld(true);
  const worldBb = new THREE.Box3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh) skinnedTotal++;

    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    if (!bb || bb.isEmpty()) return;
    worldBb.copy(bb).applyMatrix4(mesh.matrixWorld);
    if (worldBb.isEmpty()) return;
    const size = worldBb.getSize(new THREE.Vector3());
    const center = worldBb.getCenter(new THREE.Vector3());
    const extent = Math.max(size.x, size.y, size.z);
    const far = Math.max(Math.abs(center.x), Math.abs(center.y), Math.abs(center.z));
    if (extent > maxExtent || far > maxCenter) {
      doomed.push(mesh);
    }
  });

  const doomedSkinned = doomed.filter((m) => (m as THREE.SkinnedMesh).isSkinnedMesh)
    .length;
  if (skinnedTotal > 0 && doomedSkinned >= Math.max(1, Math.ceil(skinnedTotal * 0.5))) {
    console.warn(
      `[prune] aborted: would remove ${doomedSkinned}/${skinnedTotal} skinned ` +
        `(unit scale still wrong?). Keep meshes; check reMeterScale.`,
    );
    return 0;
  }

  for (const mesh of doomed) {
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    if (bb) {
      worldBb.copy(bb).applyMatrix4(mesh.matrixWorld);
      worldBb.getSize(size);
      worldBb.getCenter(center);
    }
    const extent = Math.max(size.x, size.y, size.z);
    const far = Math.max(Math.abs(center.x), Math.abs(center.y), Math.abs(center.z));
    console.warn(
      `[prune] remove outlier "${mesh.name}" extent=${extent.toFixed(2)} ` +
        `centerFar=${far.toFixed(2)} center=(${center.x.toFixed(2)},${center.y.toFixed(2)},${center.z.toFixed(2)})`,
    );
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
