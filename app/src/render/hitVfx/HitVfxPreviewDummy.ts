/**
 * Lit capsule/box for spark light verification (consensus: must have littee).
 */
import * as THREE from 'three/webgpu';

export class HitVfxPreviewDummy {
  readonly root: THREE.Group;
  private readonly mesh: THREE.Mesh;
  private visible = false;

  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'HitVfxPreviewDummy';
    const geo = new THREE.CapsuleGeometry(0.28, 1.2, 6, 12);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x8a9098,
      roughness: 0.55,
      metalness: 0.05,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.position.y = 0.88;
    this.root.add(this.mesh);
    this.root.visible = false;
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.root.visible = v;
  }

  isVisible(): boolean {
    return this.visible;
  }

  setPosition(x: number, y: number, z: number): void {
    this.root.position.set(x, y, z);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
