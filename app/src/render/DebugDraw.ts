import * as THREE from 'three/webgpu';
import type { Box } from '../combat/boxes/Box2D';
import type { MatchSim } from '../combat/match/MatchSim';
import type { MutableSimConfig } from '../config/constants';

function boxToLine(box: Box, yBase: number, color: number, scale: number): THREE.LineSegments {
  const hx = (box.w * scale) / 2;
  const hy = (box.h * scale) / 2;
  const cx = box.x * scale;
  const cy = yBase + box.y * scale;
  const z = 0.05;
  const pts = new Float32Array([
    cx - hx, cy - hy, z, cx + hx, cy - hy, z,
    cx + hx, cy - hy, z, cx + hx, cy + hy, z,
    cx + hx, cy + hy, z, cx - hx, cy + hy, z,
    cx - hx, cy + hy, z, cx - hx, cy - hy, z,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  const mat = new THREE.LineBasicMaterial({ color });
  return new THREE.LineSegments(geo, mat);
}

export class DebugDraw {
  private group = new THREE.Group();

  constructor(scene: THREE.Scene) {
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
    if (cfg.showHurtboxes) {
      for (const b of match.p1.worldHurtBoxes()) {
        this.group.add(boxToLine(b, 0, cfg.hurtboxColor, s));
      }
      for (const b of match.p2.worldHurtBoxes(match.dummy.isCrouching())) {
        this.group.add(boxToLine(b, 0, cfg.hurtboxColor, s));
      }
    }
    if (cfg.showHitboxes) {
      for (const b of match.p1.worldHitBoxes()) {
        this.group.add(boxToLine(b, 0, cfg.hitboxColor, s));
      }
    }
  }
}
