/**
 * Clipboard for recipes / elements with ID remapping (tldraw-style).
 * Prefer in-memory clipboard; also write text/plain JSON as fallback.
 */
import type { HitVfxElement, HitVfxRecipe } from '../render/hitVfx/hitVfxTypes';
import { duplicateRecipe, newId } from './hitVfxRecipeOps';

export type ClipboardPayload =
  | { v: 1; kind: 'recipe'; recipe: HitVfxRecipe }
  | { v: 1; kind: 'element'; element: HitVfxElement };

let memoryClipboard: ClipboardPayload | null = null;

function regenElementIds(el: HitVfxElement): HitVfxElement {
  return {
    ...structuredClone(el),
    id: newId(el.type),
  };
}

export function copyRecipe(recipe: HitVfxRecipe): void {
  memoryClipboard = { v: 1, kind: 'recipe', recipe: structuredClone(recipe) };
  void writeText(JSON.stringify(memoryClipboard));
}

export function copyElement(element: HitVfxElement): void {
  if (element.type === 'sparkLight') return;
  memoryClipboard = {
    v: 1,
    kind: 'element',
    element: structuredClone(element),
  };
  void writeText(JSON.stringify(memoryClipboard));
}

async function writeText(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }
  } catch {
    /* ignore — memory clipboard still works */
  }
}

async function readText(): Promise<string | null> {
  try {
    if (navigator.clipboard?.readText) {
      return await navigator.clipboard.readText();
    }
  } catch {
    /* ignore */
  }
  return null;
}

function parsePayload(raw: string): ClipboardPayload | null {
  try {
    const o = JSON.parse(raw) as ClipboardPayload;
    if (!o || o.v !== 1) return null;
    if (o.kind === 'recipe' && o.recipe && typeof o.recipe === 'object') {
      return o;
    }
    if (o.kind === 'element' && o.element && typeof o.element === 'object') {
      return o;
    }
  } catch {
    return null;
  }
  return null;
}

export async function readClipboard(): Promise<ClipboardPayload | null> {
  if (memoryClipboard) return structuredClone(memoryClipboard);
  const text = await readText();
  if (!text) return null;
  return parsePayload(text);
}

/** Paste recipe → new recipe with remapped ids. */
export function materializePastedRecipe(payload: ClipboardPayload): HitVfxRecipe | null {
  if (payload.kind !== 'recipe') return null;
  return duplicateRecipe(payload.recipe);
}

/** Paste element → clone with new id (caller sets groupId). */
export function materializePastedElement(
  payload: ClipboardPayload,
): HitVfxElement | null {
  if (payload.kind !== 'element') return null;
  if (payload.element.type === 'sparkLight') return null;
  return regenElementIds(payload.element);
}

export function peekMemoryClipboard(): ClipboardPayload | null {
  return memoryClipboard ? structuredClone(memoryClipboard) : null;
}
