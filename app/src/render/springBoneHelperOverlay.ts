/**
 * Make VRM spring-bone debug helpers draw on top of the character.
 *
 * @pixiv/three-vrm-springbone helpers already set depthTest/depthWrite false,
 * but they stay in the opaque pass (transparent=false). Later opaque character
 * meshes still overwrite them. Also default frustumCulled + tiny line geometry
 * bounds can make helpers vanish at some camera angles.
 *
 * Same overlay policy as DebugDraw hitboxes: transparent pass + high renderOrder
 * + frustumCulled false.
 *
 * @see discourse.threejs.org — frustum-culled objects disappearing at odd angles
 * @see DebugDraw.ts — depthTest false + transparent + renderOrder overlay
 */
import type * as THREE from 'three';

/** Above DebugDraw boxes (999–1000) so spring helpers stay readable while tuning. */
export const SPRING_HELPER_RENDER_ORDER = 2000;

export function applySpringBoneHelperOverlay(root: THREE.Object3D): void {
  root.frustumCulled = false;
  root.renderOrder = SPRING_HELPER_RENDER_ORDER;
  root.traverse((obj) => {
    obj.frustumCulled = false;
    obj.renderOrder = SPRING_HELPER_RENDER_ORDER;
    const mesh = obj as THREE.Mesh;
    const mat = mesh.material;
    if (!mat) return;
    const mats = Array.isArray(mat) ? mat : [mat];
    for (const m of mats) {
      if (!m) continue;
      m.depthTest = false;
      m.depthWrite = false;
      // Force transparent pass so opaque character cannot overpaint helpers.
      m.transparent = true;
      if (!(typeof m.opacity === 'number' && m.opacity < 1)) {
        m.opacity = 1;
      }
      m.needsUpdate = true;
    }
    const geo = mesh.geometry as THREE.BufferGeometry | undefined;
    if (geo && typeof geo.computeBoundingSphere === 'function') {
      geo.computeBoundingSphere();
    }
  });
}
