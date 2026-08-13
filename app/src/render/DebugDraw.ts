import * as THREE from 'three/webgpu';
import type { Box } from '../combat/boxes/Box2D';
import type { MatchSim } from '../combat/match/MatchSim';
import type { MutableSimConfig } from '../config/constants';

function boxToLine(box: Box, yBase: number, color: number, scale: number): THREE.LineSegments {
  const hx = (box.w * scale) / 2;
  const hy = (box.h * scale) / 2;
  const cx = box.x * scale;
  const cy = yBase + box.y * scale;
  // Draw slightly in front of character plane; depthTest off so mesh/terrain never hide lines
  const z = 0.12;
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

  update(match: MatchSim, cfg: MutableSimConfig): void {
    while (this.group.children.length) {
      const c = this.group.children[0]!;
      this.group.remove(c);
      (c as THREE.LineSegments).geometry?.dispose();
      ((c as THREE.LineSegments).material as THREE.Material)?.dispose?.();
    }
    const s = cfg.worldScale;
    const partColors = cfg.hurtPartColors !== false;
    if (cfg.showHurtboxes) {
      // Auto stance: crouch/air from fighter phase + y (do not hardcode stand)
      const p1h = match.p1.worldHurtBoxes();
      p1h.forEach((b, i) => {
        this.group.add(
          boxToLine(b, 0, hurtColorForIndex(cfg.hurtboxColor, i, partColors), s),
        );
      });
      const p2h = match.p2.worldHurtBoxes(
        match.dummy.isCrouching() || match.p2.isHurtCrouching(),
      );
      p2h.forEach((b, i) => {
        this.group.add(
          boxToLine(b, 0, hurtColorForIndex(cfg.hurtboxColor, i, partColors), s),
        );
      });
    }
    if (cfg.showHitboxes) {
      for (const b of match.p1.worldHitBoxes()) {
        this.group.add(boxToLine(b, 0, cfg.hitboxColor, s));
      }
    }
    if (cfg.showPushboxes) {
      const pushColor = cfg.pushboxColor ?? 0xffcc33;
      for (const b of match.p1.worldPushBoxes()) {
        this.group.add(boxToLine(b, 0, pushColor, s));
      }
      for (const b of match.p2.worldPushBoxes(
        match.dummy.isCrouching() || match.p2.isHurtCrouching(),
      )) {
        this.group.add(boxToLine(b, 0, pushColor, s));
      }
    }
  }
}
