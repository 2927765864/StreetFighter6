import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { sanitizeObjectMaterials } from './materialUtils';

export class StageView {
  root = new THREE.Group();
  loaded = false;

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
  }

  async load(url: string, targetWidth = 16): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const model = gltf.scene;

    sanitizeObjectMaterials(model);
    model.updateMatrixWorld(true);

    let box = new THREE.Box3().setFromObject(model);
    let size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;

    const width = Math.max(size.x, size.z, 0.001);
    let scale = targetWidth / width;
    // Guard absurd scales
    scale = THREE.MathUtils.clamp(scale, 0.0001, 1000);
    model.scale.setScalar(scale);
    model.updateMatrixWorld(true);

    // Re-ground after scale
    box = new THREE.Box3().setFromObject(model);
    model.position.y -= box.min.y;
    model.updateMatrixWorld(true);

    box = new THREE.Box3().setFromObject(model);
    size = box.getSize(new THREE.Vector3());
    console.info(
      `[StageView] scale=${scale.toFixed(5)} size=(${size.x.toFixed(2)},${size.y.toFixed(2)},${size.z.toFixed(2)})`,
    );

    this.root.clear();
    this.root.add(model);
    this.loaded = true;
  }
}
