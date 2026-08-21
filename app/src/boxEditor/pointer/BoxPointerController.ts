import * as THREE from 'three/webgpu';
import type { Box } from '../../combat/boxes/Box2D';
import { faceBox } from '../../combat/boxes/Box2D';
import type { TimedBox } from '../../combat/move/MoveDefinition';
import {
  worldToLocal,
  type BoxesBundle,
} from '../document/BoxEditorDocument';
import type { BoxKind, BoxSelection } from '../document/commands';

export type PointerHit =
  | { mode: 'select'; kind: BoxKind; index: number }
  | {
      mode: 'resize';
      kind: BoxKind;
      index: number;
      edge: 'l' | 'r' | 't' | 'b';
    };

export type PointerCallbacks = {
  onSelect: (sel: BoxSelection | null) => void;
  onGeomLive: (
    kind: BoxKind,
    index: number,
    geom: { x: number; y: number; w: number; h: number },
  ) => void;
  onGeomCommit: (
    kind: BoxKind,
    index: number,
    before: { x: number; y: number; w: number; h: number },
    after: { x: number; y: number; w: number; h: number },
  ) => void;
  getBoxes: () => BoxesBundle;
  getSelection: () => BoxSelection | null;
  getPlayhead: () => number;
  getFacing: () => 1 | -1;
  getOrigin: () => { x: number; y: number };
  getWorldScale: () => number;
  getMinSize: () => number;
  showKind: (kind: BoxKind) => boolean;
};

type DragState = {
  hit: PointerHit;
  startLocal: { x: number; y: number };
  startBox: TimedBox;
};

/**
 * Canvas pointer: NDC from getBoundingClientRect, XY plane raycast, AABB hit-test.
 */
export class BoxPointerController {
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private hitPoint = new THREE.Vector3();
  private drag: DragState | null = null;
  private edgePx = 8;

  constructor(
    private canvas: HTMLCanvasElement,
    private camera: THREE.Camera,
    private cb: PointerCallbacks,
  ) {
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointercancel', this.onUp);
  }

  private clientToWorld(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    this.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const ok = this.raycaster.ray.intersectPlane(this.plane, this.hitPoint);
    if (!ok) return null;
    const s = this.cb.getWorldScale();
    return { x: this.hitPoint.x / s, y: this.hitPoint.y / s };
  }

  private activeEntries(): { kind: BoxKind; index: number; box: TimedBox }[] {
    const boxes = this.cb.getBoxes();
    const f = Math.floor(this.cb.getPlayhead());
    const out: { kind: BoxKind; index: number; box: TimedBox }[] = [];
    const push = (kind: BoxKind, list: TimedBox[]) => {
      if (!this.cb.showKind(kind)) return;
      list.forEach((box, index) => {
        if (f >= box.from && f <= box.to) out.push({ kind, index, box });
      });
    };
    push('push', boxes.push);
    push('hurt', boxes.hurt);
    push('hit', boxes.hit);
    return out;
  }

  private edgeHandles(worldBox: Box): { edge: 'l' | 'r' | 't' | 'b'; x: number; y: number }[] {
    const hx = worldBox.w / 2;
    const hy = worldBox.h / 2;
    return [
      { edge: 't', x: worldBox.x, y: worldBox.y + hy },
      { edge: 'b', x: worldBox.x, y: worldBox.y - hy },
      { edge: 'l', x: worldBox.x - hx, y: worldBox.y },
      { edge: 'r', x: worldBox.x + hx, y: worldBox.y },
    ];
  }

  private handleRadius(rect: DOMRect): number {
    return Math.max(0.045, this.screenEdgeWorldTol(rect) * 2.2);
  }

  private pick(
    world: { x: number; y: number },
    _clientX: number,
    _clientY: number,
  ): PointerHit | null {
    const facing = this.cb.getFacing();
    const origin = this.cb.getOrigin();
    const rect = this.canvas.getBoundingClientRect();
    const r = this.handleRadius(rect);
    const sel = this.cb.getSelection();
    const entries = this.activeEntries();

    if (sel) {
      const selected = entries.find((e) => e.kind === sel.kind && e.index === sel.index);
      if (selected) {
        const wb = faceBox(selected.box, origin.x, origin.y, facing);
        for (const h of this.edgeHandles(wb)) {
          const dx = world.x - h.x;
          const dy = world.y - h.y;
          if (dx * dx + dy * dy <= r * r) {
            return {
              mode: 'resize',
              kind: selected.kind,
              index: selected.index,
              edge: h.edge,
            };
          }
        }
      }
    }

    const ranked = [...entries].sort(
      (a, b) => a.box.w * a.box.h - b.box.w * b.box.h,
    );
    for (const e of ranked) {
      const worldBox = faceBox(e.box, origin.x, origin.y, facing);
      const halfW = worldBox.w / 2;
      const halfH = worldBox.h / 2;
      const left = worldBox.x - halfW;
      const right = worldBox.x + halfW;
      const bottom = worldBox.y - halfH;
      const top = worldBox.y + halfH;
      if (
        world.x < left ||
        world.x > right ||
        world.y < bottom ||
        world.y > top
      ) {
        continue;
      }
      return { mode: 'select', kind: e.kind, index: e.index };
    }
    return null;
  }

  private screenEdgeWorldTol(rect: DOMRect): number {
    // Rough: NDC delta for edgePx mapped at plane z=0 near character (~cameraZ)
    const cam = this.camera as THREE.PerspectiveCamera;
    const dist = Math.abs(cam.position.z) || 11;
    const vFov = (cam.fov * Math.PI) / 180;
    const worldH = 2 * Math.tan(vFov / 2) * dist;
    const worldPerPx = worldH / Math.max(1, rect.height);
    return Math.max(0.02, this.edgePx * worldPerPx) / this.cb.getWorldScale();
  }

  private onDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    const world = this.clientToWorld(e.clientX, e.clientY);
    if (!world) return;
    const hit = this.pick(world, e.clientX, e.clientY);
    if (!hit) {
      this.cb.onSelect(null);
      return;
    }
    const boxes = this.cb.getBoxes();
    const box = boxes[hit.kind][hit.index];
    if (!box) return;
    const sel = this.cb.getSelection();
    const already =
      sel?.kind === hit.kind && sel.index === hit.index;
    this.cb.onSelect({ kind: hit.kind, index: hit.index });
    // Resize only after the box is already selected; interior never moves.
    if (hit.mode !== 'resize' || !already) {
      this.updateCursor(hit.mode === 'resize' && already ? hit : { mode: 'select', kind: hit.kind, index: hit.index });
      return;
    }
    this.drag = {
      hit,
      startLocal: { x: world.x, y: world.y },
      startBox: { ...box },
    };
    this.canvas.setPointerCapture(e.pointerId);
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.drag) {
      const world = this.clientToWorld(e.clientX, e.clientY);
      if (!world) {
        this.canvas.style.cursor = '';
        return;
      }
      this.updateCursor(this.pick(world, e.clientX, e.clientY));
      return;
    }
    const world = this.clientToWorld(e.clientX, e.clientY);
    if (!world) return;
    if (this.drag.hit.mode !== 'resize') return;
    const facing = this.cb.getFacing();
    const origin = this.cb.getOrigin();
    const min = this.cb.getMinSize();
    const start = this.drag.startBox;
    const startWorld = faceBox(start, origin.x, origin.y, facing);
    const dx = world.x - this.drag.startLocal.x;
    const dy = world.y - this.drag.startLocal.y;

    let nextWorld: Box;
    {
      let left = startWorld.x - startWorld.w / 2;
      let right = startWorld.x + startWorld.w / 2;
      let bottom = startWorld.y - startWorld.h / 2;
      let top = startWorld.y + startWorld.h / 2;
      const edge = this.drag.hit.edge;
      if (edge === 'l') left = Math.min(right - min, startWorld.x - startWorld.w / 2 + dx);
      if (edge === 'r') right = Math.max(left + min, startWorld.x + startWorld.w / 2 + dx);
      if (edge === 'b') bottom = Math.min(top - min, startWorld.y - startWorld.h / 2 + dy);
      if (edge === 't') top = Math.max(bottom + min, startWorld.y + startWorld.h / 2 + dy);
      nextWorld = {
        x: (left + right) / 2,
        y: (bottom + top) / 2,
        w: Math.max(min, right - left),
        h: Math.max(min, top - bottom),
      };
    }
    const local = worldToLocal(nextWorld, origin.x, origin.y, facing);
    this.cb.onGeomLive(this.drag.hit.kind, this.drag.hit.index, local);
  };

  private onUp = (e: PointerEvent): void => {
    if (!this.drag) return;
    const { hit, startBox } = this.drag;
    const cur = this.cb.getBoxes()[hit.kind][hit.index];
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.drag = null;
    this.canvas.style.cursor = '';
    if (!cur) return;
    if (
      cur.x !== startBox.x ||
      cur.y !== startBox.y ||
      cur.w !== startBox.w ||
      cur.h !== startBox.h
    ) {
      this.cb.onGeomCommit(
        hit.kind,
        hit.index,
        { x: startBox.x, y: startBox.y, w: startBox.w, h: startBox.h },
        { x: cur.x, y: cur.y, w: cur.w, h: cur.h },
      );
    }
  };

  private updateCursor(hit: PointerHit | null): void {
    if (!hit) {
      this.canvas.style.cursor = '';
      return;
    }
    if (hit.mode !== 'resize') {
      this.canvas.style.cursor = 'pointer';
      return;
    }
    const sel = this.cb.getSelection();
    const canResize = sel?.kind === hit.kind && sel.index === hit.index;
    if (!canResize) {
      this.canvas.style.cursor = 'pointer';
      return;
    }
    this.canvas.style.cursor =
      hit.edge === 'l' || hit.edge === 'r' ? 'ew-resize' : 'ns-resize';
  }
}
