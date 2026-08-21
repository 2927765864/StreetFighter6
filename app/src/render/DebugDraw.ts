import * as THREE from 'three/webgpu';
import type { Box } from '../combat/boxes/Box2D';
import type { MatchSim } from '../combat/match/MatchSim';
import type { MutableSimConfig } from '../config/constants';

const BOX_Z = 0.12;
const HANDLE_Z = 0.14;

function unlit(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide,
  });
}

/** Axis-aligned filled rect in the fight plane (WebGPU linewidth is ~1px). */
function planeRect(
  cx: number,
  cy: number,
  w: number,
  h: number,
  z: number,
  color: number,
): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(Math.max(1e-4, w), Math.max(1e-4, h));
  const mesh = new THREE.Mesh(geo, unlit(color));
  mesh.position.set(cx, cy, z);
  mesh.renderOrder = 1000;
  mesh.frustumCulled = false;
  return mesh;
}

function boxToLine(box: Box, yBase: number, color: number, scale: number): THREE.LineSegments {
  const hx = (box.w * scale) / 2;
  const hy = (box.h * scale) / 2;
  const cx = box.x * scale;
  const cy = yBase + box.y * scale;
  const z = BOX_Z;
  const pts = new Float32Array([
    cx - hx, cy - hy, z, cx + hx, cy - hy, z,
    cx + hx, cy - hy, z, cx + hx, cy + hy, z,
    cx + hx, cy + hy, z, cx - hx, cy + hy, z,
    cx - hx, cy + hy, z, cx - hx, cy - hy, z,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  const mat = new THREE.LineBasicMaterial({
    color,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 1,
  });
  const line = new THREE.LineSegments(geo, mat);
  line.renderOrder = 999;
  line.frustumCulled = false;
  return line;
}

/** Same rectangle, thicker band on the original edges (not an outer halo). */
function addThickBox(
  group: THREE.Group,
  box: Box,
  yBase: number,
  color: number,
  scale: number,
  band = 0.028,
): void {
  const hx = (box.w * scale) / 2;
  const hy = (box.h * scale) / 2;
  const cx = box.x * scale;
  const cy = yBase + box.y * scale;
  const t = Math.max(0.012, band);
  const z = BOX_Z;
  group.add(planeRect(cx, cy + hy, box.w * scale, t, z, color));
  group.add(planeRect(cx, cy - hy, box.w * scale, t, z, color));
  group.add(planeRect(cx - hx, cy, t, box.h * scale, z, color));
  group.add(planeRect(cx + hx, cy, t, box.h * scale, z, color));
}

function addEdgeHandles(
  group: THREE.Group,
  box: Box,
  yBase: number,
  color: number,
  scale: number,
  size = 0.07,
): void {
  const hx = (box.w * scale) / 2;
  const hy = (box.h * scale) / 2;
  const cx = box.x * scale;
  const cy = yBase + box.y * scale;
  const s = size;
  group.add(planeRect(cx, cy + hy, s, s, HANDLE_Z, color));
  group.add(planeRect(cx, cy - hy, s, s, HANDLE_Z, color));
  group.add(planeRect(cx - hx, cy, s, s, HANDLE_Z, color));
  group.add(planeRect(cx + hx, cy, s, s, HANDLE_Z, color));
}

function brighten(color: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 255) * 0.35 + 255 * 0.65));
  const g = Math.min(255, Math.round(((color >> 8) & 255) * 0.35 + 255 * 0.65));
  const b = Math.min(255, Math.round((color & 255) * 0.35 + 255 * 0.65));
  return (r << 16) | (g << 8) | b;
}

function boxesMatch(a: Box, b: Box, eps = 0.02): boolean {
  return (
    Math.abs(a.x - b.x) < eps &&
    Math.abs(a.y - b.y) < eps &&
    Math.abs(a.w - b.w) < eps &&
    Math.abs(a.h - b.h) < eps
  );
}

function disposeObject(c: THREE.Object3D): void {
  const mesh = c as THREE.Mesh;
  mesh.geometry?.dispose?.();
  const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
  if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
  else mat?.dispose?.();
}

/** Slight green-family variance so head/body/leg are countable. */
function hurtColorForIndex(base: number, i: number, partColors: boolean): number {
  if (!partColors) return base;
  // Cycle head / body / leg tints within green
  const tints = [0x66ff99, 0x33ff66, 0x22cc55, 0x88ffaa];
  return tints[i % tints.length] ?? base;
}

export class DebugDraw {
  private group = new THREE.Group();

  constructor(scene: THREE.Scene) {
    // Always on top of stage / fighters for training visibility
    this.group.renderOrder = 999;
    scene.add(this.group);
  }

  update(
    match: MatchSim,
    cfg: MutableSimConfig,
    highlight?: Box | null,
  ): void {
    while (this.group.children.length) {
      const c = this.group.children[0]!;
      this.group.remove(c);
      disposeObject(c);
    }
    const s = cfg.worldScale;
    const partColors = cfg.hurtPartColors !== false;
    const drawP2 = cfg.showOpponentBoxes !== false;
    const drawOne = (b: Box, color: number) => {
      const selected = !!(highlight && boxesMatch(b, highlight));
      if (selected) {
        const lit = brighten(color);
        addThickBox(this.group, b, 0, lit, s);
        addEdgeHandles(this.group, b, 0, 0xffffff, s);
      } else {
        this.group.add(boxToLine(b, 0, color, s));
      }
    };
    if (cfg.showHurtboxes) {
      // Auto stance: crouch/air from fighter phase + y (do not hardcode stand)
      const p1h = match.p1.worldHurtBoxes();
      p1h.forEach((b, i) => {
        drawOne(b, hurtColorForIndex(cfg.hurtboxColor, i, partColors));
      });
      if (drawP2) {
        const p2h = match.p2.worldHurtBoxes(
          match.dummy.isCrouching() || match.p2.isHurtCrouching(),
        );
        p2h.forEach((b, i) => {
          drawOne(b, hurtColorForIndex(cfg.hurtboxColor, i, partColors));
        });
      }
    }
    if (cfg.showHitboxes) {
      for (const b of match.p1.worldHitBoxes()) {
        drawOne(b, cfg.hitboxColor);
      }
      if (drawP2) {
        for (const b of match.p2.worldHitBoxes()) {
          drawOne(b, cfg.hitboxColor);
        }
      }
    }
    if (cfg.showPushboxes) {
      const pushColor = cfg.pushboxColor ?? 0xffcc33;
      for (const b of match.p1.worldPushBoxes()) {
        drawOne(b, pushColor);
      }
      if (drawP2) {
        for (const b of match.p2.worldPushBoxes(
          match.dummy.isCrouching() || match.p2.isHurtCrouching(),
        )) {
          drawOne(b, pushColor);
        }
      }
    }
  }
}
