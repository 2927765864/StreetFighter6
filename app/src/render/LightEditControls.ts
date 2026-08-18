/**
 * TransformControls for lights — plan §S5
 *
 * Bugfix: gizmo drag must write local position/target back into CONFIG.lights
 * and must not rely on lightSelectedId alone (can desync). Avoid full light
 * resync mid-drag (it re-applies desc→light and fights TransformControls).
 */
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { MutableSimConfig } from '../config/constants';
import {
  captureLightFollowOffsets,
  isLightFollowing,
  type FighterFollowOrigin,
  type LightDesc,
} from '../config/lightTypes';
import type { LightRig } from './LightRig';
import type * as THREE_NS from 'three/webgpu';

type ThreeMod = typeof THREE_NS;

export type LightEditControls = {
  transform: TransformControls;
  setMode: (mode: 'position' | 'target') => void;
  attachSelected: () => void;
  detach: () => void;
  dispose: () => void;
};

function resolveAttached(
  rig: LightRig,
  cfg: MutableSimConfig,
  obj: THREE_NS.Object3D,
): { desc: LightDesc; kind: 'position' | 'target' } | null {
  for (const [id, rt] of rig.runtimes) {
    if (rt.light === obj) {
      const desc = cfg.lights.find((l) => l.id === id);
      return desc ? { desc, kind: 'position' } : null;
    }
    if (rt.type === 'directional' || rt.type === 'spot') {
      const withTarget = rt.light as THREE_NS.DirectionalLight | THREE_NS.SpotLight;
      if (withTarget.target === obj) {
        const desc = cfg.lights.find((l) => l.id === id);
        return desc ? { desc, kind: 'target' } : null;
      }
    }
  }
  // Fallback: selected id + mode from userData
  const byData = obj.userData.lightId as string | undefined;
  const id = byData ?? cfg.lightSelectedId;
  const desc = cfg.lights.find((l) => l.id === id);
  if (!desc) return null;
  const kind =
    obj.userData.isLightTarget || byData
      ? obj.userData.isLightTarget
        ? 'target'
        : 'position'
      : 'position';
  return { desc, kind };
}

export function createLightEditControls(
  THREE: ThreeMod,
  scene: THREE_NS.Scene,
  camera: THREE_NS.Camera,
  domElement: HTMLElement,
  rig: LightRig,
  cfg: MutableSimConfig,
  opts: {
    onDraggingChanged?: (dragging: boolean) => void;
    /** Called after CONFIG.lights position/target was written from gizmo. */
    onLightsChanged?: (info: {
      lightId: string;
      kind: 'position' | 'target';
      dragging: boolean;
    }) => void;
    /** World follow origin (logic X + hips/logic Y) for world→local writeback. */
    getFighterFollowOrigin?: (who: 'p1' | 'p2') => FighterFollowOrigin;
  } = {},
): LightEditControls {
  void THREE;
  const transform = new TransformControls(camera, domElement);
  transform.setMode('translate');
  scene.add(transform.getHelper());

  let mode: 'position' | 'target' = 'position';
  let dragging = false;

  const writeBack = () => {
    const obj = transform.object as THREE_NS.Object3D | undefined;
    if (!obj) return;

    const resolved = resolveAttached(rig, cfg, obj);
    if (!resolved) return;
    const { desc, kind } = resolved;

    // TransformControls writes world position (LightRig group @ origin).
    const editKind: 'position' | 'target' =
      kind === 'target' || mode === 'target' ? 'target' : 'position';
    if (editKind === 'target') {
      desc.target.x = obj.position.x;
      desc.target.y = obj.position.y;
      desc.target.z = obj.position.z;
    } else {
      desc.position.x = obj.position.x;
      desc.position.y = obj.position.y;
      desc.position.z = obj.position.z;
    }

    // Follow lights store character-local offsets — convert only the edited part.
    if (isLightFollowing(desc) && opts.getFighterFollowOrigin) {
      const who = desc.follow as 'p1' | 'p2';
      captureLightFollowOffsets(desc, opts.getFighterFollowOrigin(who), editKind);
    }

    opts.onLightsChanged?.({
      lightId: desc.id,
      kind: editKind,
      dragging,
    });
  };

  // objectChange: after each transform step; change: also fires on prop updates.
  transform.addEventListener('objectChange', writeBack);
  transform.addEventListener('dragging-changed', (event) => {
    dragging = Boolean((event as unknown as { value?: boolean }).value);
    opts.onDraggingChanged?.(dragging);
    if (!dragging) {
      // Final commit when pointer up.
      writeBack();
    }
  });

  const attachSelected = () => {
    transform.detach();
    if (!cfg.lightHelpersVisible) return;
    const id = cfg.lightSelectedId;
    const rt = rig.runtimes.get(id);
    if (!rt) return;
    const desc = cfg.lights.find((l) => l.id === id);
    if (!desc || !desc.enabled) return;
    if (desc.type === 'ambient' || desc.type === 'hemisphere') return;

    rt.light.userData.lightId = id;
    rt.light.userData.isLightTarget = false;

    if (mode === 'target' && (desc.type === 'directional' || desc.type === 'spot')) {
      const withTarget = rt.light as THREE_NS.DirectionalLight | THREE_NS.SpotLight;
      withTarget.target.userData.lightId = id;
      withTarget.target.userData.isLightTarget = true;
      transform.attach(withTarget.target);
      return;
    }
    transform.attach(rt.light);
  };

  const detach = () => {
    transform.detach();
  };

  const setMode = (m: 'position' | 'target') => {
    mode = m;
    attachSelected();
  };

  const dispose = () => {
    transform.detach();
    scene.remove(transform.getHelper());
    transform.dispose();
  };

  return {
    transform,
    setMode,
    attachSelected,
    detach,
    dispose,
  };
}
