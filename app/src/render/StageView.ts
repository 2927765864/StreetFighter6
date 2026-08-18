import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { sanitizeObjectMaterials } from './materialUtils';

export type StageLayout = {
  targetWidth: number;
  originX: number;
  originZ: number;
};

export class StageView {
  root = new THREE.Group();
  loaded = false;
  lastPreScale: {
    min: [number, number, number];
    max: [number, number, number];
    size: [number, number, number];
  } | null = null;
  private model: THREE.Object3D | null = null;

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
  }

  async load(url: string, targetWidth = 16): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const model = gltf.scene;

    sanitizeObjectMaterials(model);
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.receiveShadow = true;
      mesh.castShadow = true;
    });
    model.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    this.lastPreScale = {
      min: [box.min.x, box.min.y, box.min.z],
      max: [box.max.x, box.max.y, box.max.z],
      size: [size.x, size.y, size.z],
    };
    console.info(
      '[StageView] pre-scale AABB',
      JSON.stringify(this.lastPreScale),
    );

    this.model = model;
    this.root.clear();
    this.root.add(model);
    this.loaded = true;
    this.applyLayout({ targetWidth, originX: 0, originZ: 0 });
  }

  applyLayout(layout: StageLayout): void {
    const model = this.model;
    if (!model) return;

    model.position.set(0, 0, 0);
    model.scale.setScalar(1);
    model.updateMatrixWorld(true);

    let box = new THREE.Box3().setFromObject(model);
    let size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;

    const width = Math.max(size.x, size.z, 0.001);
    let scale = 1;
    if (layout.targetWidth > 0) {
      scale = THREE.MathUtils.clamp(layout.targetWidth / width, 0.0001, 1000);
    }
    model.scale.setScalar(scale);
    model.updateMatrixWorld(true);

    box = new THREE.Box3().setFromObject(model);
    model.position.y -= box.min.y;
    model.position.x += layout.originX;
    model.position.z += layout.originZ;
    model.updateMatrixWorld(true);

    box = new THREE.Box3().setFromObject(model);
    size = box.getSize(new THREE.Vector3());
    console.info(
      `[StageView] scale=${scale.toFixed(5)} size=(${size.x.toFixed(2)},${size.y.toFixed(2)},${size.z.toFixed(2)}) origin=(${layout.originX},${layout.originZ})`,
    );
  }
}
