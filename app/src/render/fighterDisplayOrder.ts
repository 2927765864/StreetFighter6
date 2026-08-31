/**
 * Side-view fighter draw priority: whoever last successfully started an
 * attack (`Fighter.startMove`) stays in front until the other does.
 * Equal seq (including both 0 at boot) → p1, matching the old fixed bias.
 */
export function pickDisplayFrontId(
  p1AttackAcceptSeq: number,
  p2AttackAcceptSeq: number,
): 'p1' | 'p2' {
  return p1AttackAcceptSeq >= p2AttackAcceptSeq ? 'p1' : 'p2';
}

/**
 * Both fighters share the same world Z. True occlusion priority is done in
 * the render loop (scene+back pass, clearDepth, front-only pass) via layers.
 * Hit VFX use a separate overlay scene rendered after both fighter passes.
 */
export const FIGHTER_DISPLAY_Z = 0;

/** @deprecated Use FIGHTER_DISPLAY_Z. */
export const FIGHTER_DISPLAY_Z_FRONT = FIGHTER_DISPLAY_Z;
/** @deprecated Use FIGHTER_DISPLAY_Z. */
export const FIGHTER_DISPLAY_Z_BACK = FIGHTER_DISPLAY_Z;

/**
 * three.js Layers (not inherited — every mesh under a fighter is set).
 * Camera pass 1: SCENE | BACK. Pass 2 (after clearDepth): FRONT only.
 * Hit VFX: separate overlay scene after pass 2 (see main.ts).
 */
export const LAYER_SCENE = 0;
export const LAYER_FIGHTER_BACK = 1;
export const LAYER_FIGHTER_FRONT = 2;

/** Stable draw order within a pass (optional; layers own inter-fighter priority). */
export const FIGHTER_RENDER_ORDER_BACK = 10;
export const FIGHTER_RENDER_ORDER_FRONT = 20;

type LayerHost = { layers: { enable: (n: number) => void } };

/**
 * Enable scene + both fighter layers on a light (and its shadow camera).
 *
 * Three.js ShadowNode: if `shadow.camera` only has the default layer 0, it
 * copies the *main* camera mask for that shadow pass. Our pass-1 camera is
 * SCENE|BACK only, so the front fighter would be omitted from the shadow map
 * and its shadow would vanish on the stage. Pinning shadow.camera to all
 * display layers keeps both fighters casting regardless of the color pass.
 */
export function enableFighterDisplayLayersOnLight(
  light: LayerHost & {
    shadow?: { camera?: LayerHost } | null;
  },
): void {
  enableFighterDisplayLayers(light);
  const shadowCam = light.shadow?.camera;
  if (shadowCam) enableFighterDisplayLayers(shadowCam);
}

export function enableFighterDisplayLayers(target: LayerHost): void {
  target.layers.enable(LAYER_SCENE);
  target.layers.enable(LAYER_FIGHTER_BACK);
  target.layers.enable(LAYER_FIGHTER_FRONT);
}
