/**
 * Follow lights only illuminate the followed fighter (not scene / other).
 *
 * WebGPU path: classic MeshStandardMaterial is converted via NodeLibrary.fromMaterial
 * into a *cached* MeshStandardNodeMaterial. Setting `lightsNode` on the classic
 * material often does NOT reliably update that cache for every mesh — skin may
 * look lit while cloth/shoes stay on the default scene lights only.
 *
 * Fix: promote fighter (and stage) materials to real MeshStandardNodeMaterial
 * instances and set lightsNode / lights=true on those objects directly.
 *
 * Character policy:
 * - Body / clothes / shoes / gloves / belt / head / eyes → global + follow lights
 * - Hair / beard / brow / lash → global lights only
 *
 * @see examples/webgpu_lights_selective.html (lights() + material.lightsNode)
 */
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { lights, shadow } from 'three/tsl';
import type { LightDesc } from '../config/lightTypes';
import type { LightRig } from './LightRig';
import type * as THREE_NS from 'three/webgpu';
import * as THREE from 'three/webgpu';

const SHADOW_ONLY_AO_MARK = 'shadowOnlyAo';

export type SelectiveLightBuckets = {
  global: THREE_NS.Light[];
  p1: THREE_NS.Light[];
  p2: THREE_NS.Light[];
};

function pushUnique(
  list: THREE_NS.Light[],
  seen: Set<number>,
  light: THREE_NS.Light,
): void {
  if (seen.has(light.id)) return;
  seen.add(light.id);
  list.push(light);
}

export function bucketLightsByFollow(
  lightDescs: LightDesc[],
  rig: LightRig,
): SelectiveLightBuckets {
  const global: THREE_NS.Light[] = [];
  const p1: THREE_NS.Light[] = [];
  const p2: THREE_NS.Light[] = [];
  const seenG = new Set<number>();
  const seen1 = new Set<number>();
  const seen2 = new Set<number>();
  const seenDescIds = new Set<string>();
  for (const desc of lightDescs) {
    if (!desc.enabled) continue;
    if (seenDescIds.has(desc.id)) continue;
    seenDescIds.add(desc.id);
    // Shadow-only: generate maps + aoNode, never illuminate.
    if (desc.shadowOnly) continue;
    const rt = rig.runtimes.get(desc.id);
    if (!rt) continue;
    if (desc.follow === 'p1') pushUnique(p1, seen1, rt.light);
    else if (desc.follow === 'p2') pushUnique(p2, seen2, rt.light);
    else pushUnique(global, seenG, rt.light);
  }
  return { global, p1, p2 };
}

/** Enabled directional lights marked shadowOnly (with live Three lights). */
export function collectShadowOnlyLights(
  lightDescs: LightDesc[],
  rig: LightRig,
): THREE_NS.Light[] {
  const out: THREE_NS.Light[] = [];
  const seen = new Set<number>();
  const seenDesc = new Set<string>();
  for (const desc of lightDescs) {
    if (!desc.enabled || !desc.shadowOnly || desc.type !== 'directional') continue;
    if (seenDesc.has(desc.id)) continue;
    seenDesc.add(desc.id);
    const rt = rig.runtimes.get(desc.id);
    if (!rt) continue;
    pushUnique(out, seen, rt.light);
  }
  return out;
}

/**
 * Build product of TSL shadow() nodes for shadow-only lights.
 * Returns null when there are none (clear our aoNode).
 */
export function buildShadowOnlyAoNode(
  shadowOnlyLights: THREE_NS.Light[],
): ShadowAoNode | null {
  if (shadowOnlyLights.length === 0) return null;
  let node: ShadowAoNode | null = null;
  for (const light of shadowOnlyLights) {
    const s = shadow(light) as unknown as ShadowAoNode;
    node = node == null ? s : node.mul(s);
  }
  return node;
}

function applyShadowOnlyAoToMaterials(
  mats: Array<MeshStandardNodeMaterial | AnyStd | THREE_NS.Material>,
  ao: ShadowAoNode | null,
): void {
  for (const m of mats) {
    if (!m) continue;
    const any = m as AnyStd;
    if (!any.userData) continue;
    if (ao) {
      any.aoNode = ao;
      any.userData[SHADOW_ONLY_AO_MARK] = true;
      any.needsUpdate = true;
    } else if (any.userData[SHADOW_ONLY_AO_MARK]) {
      any.aoNode = null;
      delete any.userData[SHADOW_ONLY_AO_MARK];
      any.needsUpdate = true;
    }
  }
}

/** Hair cards: exclude from character-only follow lights (still get global). */
export function isHairLightingMesh(mesh: THREE_NS.Mesh): boolean {
  const mat = mesh.material;
  const matName = Array.isArray(mat)
    ? mat.map((m) => m.name || '').join(' ')
    : (mat as THREE_NS.Material | undefined)?.name || '';
  const n = `${mesh.name} ${matName}`.toLowerCase();
  return (
    n.includes('hair') ||
    n.includes('beard') ||
    n.includes('brow') ||
    n.includes('lash') ||
    n.includes('eyebrow') ||
    n.includes('eyelash')
  );
}

type AnyStd = THREE_NS.MeshStandardMaterial & {
  isMeshStandardMaterial?: boolean;
  isMeshStandardNodeMaterial?: boolean;
  isMeshPhysicalMaterial?: boolean;
  lightsNode?: ReturnType<typeof lights> | null;
  lights?: boolean;
  aoNode?: unknown;
  needsUpdate?: boolean;
  userData: Record<string, unknown>;
  envMapIntensity?: number;
  normalScale?: THREE_NS.Vector2;
  emissive?: THREE_NS.Color;
  emissiveIntensity?: number;
  emissiveMap?: THREE_NS.Texture | null;
  metalnessMap?: THREE_NS.Texture | null;
  clone: () => THREE_NS.Material;
};

type ShadowAoNode = {
  mul: (other: unknown) => ShadowAoNode;
};

/** Copy PBR fields onto a MeshStandardNodeMaterial. */
function copyStandardProps(src: AnyStd, dst: MeshStandardNodeMaterial): void {
  if (src.color) dst.color.copy(src.color);
  dst.map = src.map ?? null;
  dst.normalMap = src.normalMap ?? null;
  dst.roughnessMap = src.roughnessMap ?? null;
  dst.metalnessMap = src.metalnessMap ?? null;
  dst.metalness = src.metalness ?? 0;
  dst.roughness = src.roughness ?? 0.7;
  if (src.normalScale) dst.normalScale.copy(src.normalScale);
  dst.transparent = Boolean(src.transparent);
  dst.opacity = src.opacity ?? 1;
  dst.alphaTest = src.alphaTest ?? 0;
  dst.side = src.side ?? THREE.FrontSide;
  dst.depthWrite = src.depthWrite !== false;
  dst.depthTest = src.depthTest !== false;
  if (typeof src.envMapIntensity === 'number') {
    dst.envMapIntensity = src.envMapIntensity;
  }
  if (src.emissive) dst.emissive.copy(src.emissive);
  if (typeof src.emissiveIntensity === 'number') {
    dst.emissiveIntensity = src.emissiveIntensity;
  }
  dst.emissiveMap = src.emissiveMap ?? null;
  dst.name = src.name || dst.name;
  dst.userData = { ...src.userData };
  dst.flatShading = Boolean(src.flatShading);
  dst.vertexColors = Boolean(src.vertexColors);
  dst.fog = src.fog !== false;
}

/**
 * Ensure mesh uses MeshStandardNodeMaterial owned by this root, with lights enabled.
 * Returns the node materials on the mesh (array).
 */
export function ensureNodeStandardMaterials(
  mesh: THREE_NS.Mesh,
  ownerUuid: string,
): MeshStandardNodeMaterial[] {
  const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const out: MeshStandardNodeMaterial[] = [];
  let changed = false;
  const next = list.map((mat) => {
    if (!mat) return mat;
    const src = mat as AnyStd;
    if (src.isMeshStandardNodeMaterial && src.userData.selectiveOwner === ownerUuid) {
      src.lights = true;
      out.push(src as unknown as MeshStandardNodeMaterial);
      return src;
    }
    // Convert classic standard / physical / already-node (wrong owner) → owned node mat.
    const dst = new MeshStandardNodeMaterial();
    if (
      src.isMeshStandardMaterial ||
      src.isMeshPhysicalMaterial ||
      src.isMeshStandardNodeMaterial ||
      src.type === 'MeshStandardMaterial' ||
      src.type === 'MeshPhysicalMaterial' ||
      src.type === 'MeshStandardNodeMaterial'
    ) {
      copyStandardProps(src, dst);
    } else {
      // Fallback: keep name, white lit surface
      dst.name = src.name || 'lit_fallback';
      dst.color.setHex(0xcccccc);
      dst.roughness = 0.75;
      dst.metalness = 0;
      dst.userData = { ...src.userData };
    }
    dst.userData.selectiveOwner = ownerUuid;
    dst.lights = true;
    dst.needsUpdate = true;
    out.push(dst);
    changed = true;
    // Dispose previous if we replaced a unique clone (not shared scene mat)
    if (src.userData.selectiveOwner && src.dispose) {
      try {
        src.dispose();
      } catch {
        /* ignore */
      }
    }
    return dst;
  });
  if (changed) {
    mesh.material = Array.isArray(mesh.material) ? (next as THREE_NS.Material[]) : next[0]!;
  }
  return out;
}

function assignLightsToRoot(
  root: THREE_NS.Object3D | null | undefined,
  bodyLights: ReturnType<typeof lights>,
  hairLights: ReturnType<typeof lights>,
  opts: { fighter: boolean; shadowAo: ShadowAoNode | null },
): void {
  if (!root) return;
  const owner = root.uuid;
  root.traverse((o) => {
    const mesh = o as THREE_NS.Mesh;
    if (!mesh.isMesh || !mesh.material) return;

    if (opts.fighter) {
      const nodeMats = ensureNodeStandardMaterials(mesh, owner);
      const hair = isHairLightingMesh(mesh);
      const node = hair ? hairLights : bodyLights;
      for (const m of nodeMats) {
        m.lights = true;
        m.lightsNode = node;
        m.needsUpdate = true;
      }
      applyShadowOnlyAoToMaterials(nodeMats, opts.shadowAo);
      return;
    }

    // Stage / ground: global lights only; upgrade if standard-like.
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const upgraded: THREE_NS.Material[] = [];
    const aoTargets: THREE_NS.Material[] = [];
    let anyUp = false;
    for (const mat of list) {
      if (!mat) continue;
      const src = mat as AnyStd;
      if (src.isMeshStandardNodeMaterial) {
        src.lights = true;
        src.lightsNode = bodyLights;
        src.needsUpdate = true;
        upgraded.push(src);
        aoTargets.push(src);
        continue;
      }
      if (
        src.isMeshStandardMaterial ||
        src.isMeshPhysicalMaterial ||
        src.type === 'MeshStandardMaterial'
      ) {
        const dst = new MeshStandardNodeMaterial();
        copyStandardProps(src, dst);
        dst.lights = true;
        dst.lightsNode = bodyLights;
        dst.needsUpdate = true;
        upgraded.push(dst);
        aoTargets.push(dst);
        anyUp = true;
        continue;
      }
      // Unlit helpers (basic): leave alone
      upgraded.push(mat);
    }
    if (anyUp) {
      mesh.material = Array.isArray(mesh.material) ? upgraded : upgraded[0]!;
    }
    applyShadowOnlyAoToMaterials(aoTargets, opts.shadowAo);
  });
}

/**
 * Bind selective light lists to stage vs P1 vs P2 materials.
 * Call after light create/sync and after fighter/stage mesh (re)load.
 */
export function applySelectiveLightNodes(
  lightDescs: LightDesc[],
  rig: LightRig,
  roots: {
    stage?: THREE_NS.Object3D | null;
    ground?: THREE_NS.Object3D | null;
    p1: THREE_NS.Object3D;
    p2: THREE_NS.Object3D;
  },
): void {
  const b = bucketLightsByFollow(lightDescs, rig);
  const globalNode = lights([...b.global]);
  const p1BodyNode = lights([...b.global, ...b.p1]);
  const p2BodyNode = lights([...b.global, ...b.p2]);
  const shadowAo = buildShadowOnlyAoNode(collectShadowOnlyLights(lightDescs, rig));

  // Stage/ground: only global (no character-follow lights)
  assignLightsToRoot(roots.stage, globalNode, globalNode, {
    fighter: false,
    shadowAo,
  });
  assignLightsToRoot(roots.ground, globalNode, globalNode, {
    fighter: false,
    shadowAo,
  });
  // Fighters: body/clothes/shoes get follow; hair global only
  assignLightsToRoot(roots.p1, p1BodyNode, globalNode, {
    fighter: true,
    shadowAo,
  });
  assignLightsToRoot(roots.p2, p2BodyNode, globalNode, {
    fighter: true,
    shadowAo,
  });
}
