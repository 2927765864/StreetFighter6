/**
 * Pure CRUD helpers for hit-VFX recipes / groups / elements / presets.
 * Plan: docs/plans/ai-execution-plan-hit-vfx-editor-ui-v0.md PR-B
 */
import {
  CREATABLE_ELEMENT_TYPES,
  defaultSparkLightEmbed,
  defaultStrengthScale,
  defaultVolumeSmokeParams,
  type HitVfxElement,
  type HitVfxElementPreset,
  type HitVfxGroup,
  type HitVfxRecipe,
  type HitVfxRecipeKind,
} from '../render/hitVfx/hitVfxTypes';

export function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6)}`;
}

export function createEmptyRecipe(kind: HitVfxRecipeKind): HitVfxRecipe {
  const groupId = 'main';
  return {
    id: newId(kind === 'onHit' ? 'recipe_hit' : 'recipe_block'),
    name: kind === 'onHit' ? '新建未格挡配方' : '新建格挡配方',
    kind,
    groups: [{ id: groupId, name: '主组', enabled: true }],
    elements: [],
    strengthScale: defaultStrengthScale(),
  };
}

export function duplicateRecipe(recipe: HitVfxRecipe): HitVfxRecipe {
  const groupMap = new Map<string, string>();
  const groups: HitVfxGroup[] = recipe.groups.map((g) => {
    const nid = newId('grp');
    groupMap.set(g.id, nid);
    return { ...g, id: nid };
  });
  const elements = recipe.elements.map((el) => ({
    ...structuredClone(el),
    id: newId(el.type),
    groupId: groupMap.get(el.groupId) ?? groups[0]?.id ?? 'main',
  }));
  return {
    ...structuredClone(recipe),
    id: newId(recipe.kind === 'onHit' ? 'recipe_hit' : 'recipe_block'),
    name: `${recipe.name} 副本`,
    groups,
    elements,
  };
}

export function deleteRecipe(
  list: HitVfxRecipe[],
  id: string,
): { ok: true; list: HitVfxRecipe[] } | { ok: false; error: string } {
  if (list.length <= 1) {
    return { ok: false, error: '至少保留一套配方' };
  }
  if (!list.some((r) => r.id === id)) {
    return { ok: false, error: '配方不存在' };
  }
  return { ok: true, list: list.filter((r) => r.id !== id) };
}

export function createGroup(recipe: HitVfxRecipe, name = '新分组'): HitVfxGroup {
  const g: HitVfxGroup = {
    id: newId('grp'),
    name,
    enabled: true,
  };
  recipe.groups.push(g);
  return g;
}

export function renameGroup(
  recipe: HitVfxRecipe,
  groupId: string,
  name: string,
): boolean {
  const g = recipe.groups.find((x) => x.id === groupId);
  if (!g) return false;
  g.name = name.trim() || g.name;
  return true;
}

export function setGroupEnabled(
  recipe: HitVfxRecipe,
  groupId: string,
  enabled: boolean,
): boolean {
  const g = recipe.groups.find((x) => x.id === groupId);
  if (!g) return false;
  g.enabled = enabled;
  return true;
}

export function deleteGroup(
  recipe: HitVfxRecipe,
  groupId: string,
): { ok: true } | { ok: false; error: string } {
  if (recipe.groups.length <= 1) {
    return { ok: false, error: '至少保留一个分组' };
  }
  if (!recipe.groups.some((g) => g.id === groupId)) {
    return { ok: false, error: '分组不存在' };
  }
  recipe.groups = recipe.groups.filter((g) => g.id !== groupId);
  recipe.elements = recipe.elements.filter((e) => e.groupId !== groupId);
  return { ok: true };
}

export function moveElementToGroup(
  recipe: HitVfxRecipe,
  elementId: string,
  groupId: string,
): boolean {
  if (!recipe.groups.some((g) => g.id === groupId)) return false;
  const el = recipe.elements.find((e) => e.id === elementId);
  if (!el) return false;
  el.groupId = groupId;
  return true;
}

export type CreatableHitVfxElementType =
  (typeof CREATABLE_ELEMENT_TYPES)[number];

export function createDefaultElement(
  type: CreatableHitVfxElementType,
  groupId: string,
): HitVfxElement {
  const id = newId(type);
  const base = {
    id,
    enabled: true,
    groupId,
    startDelaySec: 0,
  };
  if (type === 'spark') {
    return {
      ...base,
      name: '打击火花',
      type: 'spark',
      receiveSparkLight: false,
      params: {
        count: 28,
        lifetimeSec: [0.08, 0.18],
        speed: [2.5, 6],
        size: [0.03, 0.08],
        colorStart: 0xffe0a0,
        colorEnd: 0xff6020,
        brightness: 1.4,
        coneAngleRad: 0.7,
        drag: 0.15,
        gravityY: 0,
        blend: 'additive',
        light: defaultSparkLightEmbed(),
      },
    };
  }
  if (type === 'sparkDebris') {
    return {
      ...base,
      name: '附带小粒子',
      type: 'sparkDebris',
      receiveSparkLight: true,
      params: {
        count: 16,
        lifetimeSec: [0.12, 0.28],
        speed: [1.2, 3.5],
        size: [0.02, 0.05],
        color: 0xffcc88,
        gravityY: -2,
        drag: 0.25,
        coneAngleRad: 0.9,
        blend: 'additive',
      },
    };
  }
  if (type === 'volumeSmoke') {
    return {
      ...base,
      name: '体素烟',
      type: 'volumeSmoke',
      receiveSparkLight: false,
      params: defaultVolumeSmokeParams(),
    };
  }
  return {
    ...base,
    name: '汗水飞溅',
    type: 'sweat',
    receiveSparkLight: true,
    params: {
      count: 8,
      lifetimeSec: [0.25, 0.55],
      speed: [1.0, 2.8],
      size: [0.015, 0.035],
      color: 0xd0e8ff,
      gravityY: 9.8,
      drag: 0.08,
      coneAngleRad: 0.85,
      blend: 'alpha',
      collideGround: false,
    },
  };
}

export function createElement(
  recipe: HitVfxRecipe,
  type: CreatableHitVfxElementType,
  groupId: string,
): HitVfxElement | null {
  if (!CREATABLE_ELEMENT_TYPES.includes(type)) return null;
  if (!recipe.groups.some((g) => g.id === groupId)) return null;
  const el = createDefaultElement(type, groupId);
  recipe.elements.push(el);
  return el;
}

export function duplicateElement(
  recipe: HitVfxRecipe,
  elementId: string,
): HitVfxElement | null {
  const src = recipe.elements.find((e) => e.id === elementId);
  if (!src || src.type === 'sparkLight') return null;
  const copy = {
    ...structuredClone(src),
    id: newId(src.type),
    name: `${src.name} 副本`,
  } as HitVfxElement;
  recipe.elements.push(copy);
  return copy;
}

export function deleteElement(recipe: HitVfxRecipe, elementId: string): boolean {
  const before = recipe.elements.length;
  recipe.elements = recipe.elements.filter((e) => e.id !== elementId);
  return recipe.elements.length < before;
}

export function renameElement(
  recipe: HitVfxRecipe,
  elementId: string,
  name: string,
): boolean {
  const el = recipe.elements.find((e) => e.id === elementId);
  if (!el) return false;
  el.name = name.trim() || el.name;
  return true;
}

export function elementFromPreset(
  recipe: HitVfxRecipe,
  preset: HitVfxElementPreset,
  groupId: string,
): HitVfxElement | null {
  if (!recipe.groups.some((g) => g.id === groupId)) return null;
  const t = preset.template;
  const el = {
    id: newId(t.type),
    name: t.name,
    type: t.type,
    enabled: t.enabled,
    groupId,
    startDelaySec: t.startDelaySec,
    receiveSparkLight: t.receiveSparkLight,
    params: structuredClone(t.params),
  } as HitVfxElement;
  recipe.elements.push(el);
  return el;
}

export function saveElementAsPreset(
  element: HitVfxElement,
  name: string,
  presets: HitVfxElementPreset[],
): HitVfxElementPreset | null {
  if (!CREATABLE_ELEMENT_TYPES.includes(element.type as CreatableHitVfxElementType)) {
    return null;
  }
  const creatable = element as Extract<
    HitVfxElement,
    { type: CreatableHitVfxElementType }
  >;
  const preset: HitVfxElementPreset = {
    id: newId('preset'),
    name: name.trim() || creatable.name,
    template: {
      name: creatable.name,
      type: creatable.type,
      enabled: creatable.enabled,
      startDelaySec: creatable.startDelaySec,
      receiveSparkLight: creatable.receiveSparkLight,
      params: structuredClone(creatable.params),
    },
  };
  presets.push(preset);
  return preset;
}

export function treeVisibleElements(recipe: HitVfxRecipe): HitVfxElement[] {
  return recipe.elements.filter((e) => e.type !== 'sparkLight');
}
