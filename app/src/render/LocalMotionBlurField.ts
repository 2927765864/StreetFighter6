import * as THREE from 'three/webgpu';
import {
  Fn, If, abs, float, floor, length, max, min, screenUV, texture, uniform, vec2, vec4,
} from 'three/tsl';
import type { MotionBlurDepth } from './MotionBlurDepth';

/** Current-frame geometry velocity, projected with one camera for both poses. */
export class LocalMotionBlurField {
  readonly size = uniform(new THREE.Vector2(1, 1));
  readonly maxRadius = uniform(18);
  readonly moveScale = uniform(0.8);
  readonly attackScale = uniform(0.8);
  readonly exposureScale = uniform(0.65);
  readonly minSpeed = uniform(0.5);
  readonly neighborRadius = uniform(13);
  readonly centerWeight = uniform(0.75);
  readonly inverseProjection = uniform(new THREE.Matrix4());
  readonly depthToNdc = uniform(new THREE.Vector2(1, 0));
  private readonly frame = new THREE.FramebufferTexture(1, 1);
  readonly beauty = texture(this.frame);
  readonly resolved = new THREE.RenderTarget(1, 1, {
    type: THREE.HalfFloatType, minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter, depthBuffer: false,
  });
  readonly velocity = texture(this.resolved.texture);
  readonly foreground;
  readonly depthAt;
  readonly linearDepthAt;
  private readonly resolveQuad: THREE.QuadMesh;

  constructor(rawVelocity: THREE.Texture, depth: MotionBlurDepth) {
    this.frame.minFilter = this.frame.magFilter = THREE.LinearFilter;
    this.frame.name = 'LocalBlurCurrentColor';
    this.resolved.texture.name = 'LocalBlurObjectMotion';
    const raw = texture(rawVelocity);
    const background = texture(depth.background);
    this.foreground = texture(depth.foreground);
    this.depthAt = Fn(([at]: [THREE.Node<'vec2'>]) => {
      const front = this.foreground.sample(at).x;
      return front.lessThan(1).select(front, background.sample(at).x);
    });
    this.linearDepthAt = Fn(([at]: [THREE.Node<'vec2'>]) => {
      const ndc = vec2(at.x.mul(2).sub(1), float(1).sub(at.y.mul(2)));
      const z = this.depthAt(at).mul(this.depthToNdc.x).add(this.depthToNdc.y);
      const view = this.inverseProjection.mul(vec4(ndc, z, 1));
      return abs(view.z.div(view.w));
    });
    const material = new THREE.NodeMaterial();
    material.name = 'LocalBlurResolveGeometry';
    material.depthTest = material.depthWrite = material.toneMapped = false;
    material.fragmentNode = Fn(() => {
      const at = screenUV;
      const packed = raw.sample(at);
      const layer = floor(packed.w.div(4));
      const kind = packed.w.sub(layer.mul(4));
      // Store the motion category, not its strength, so paused tuning is live.
      const scale = kind.greaterThan(1.5).select(this.attackScale, this.moveScale);
      const visible = this.foreground.sample(at).x.lessThan(1).select(
        layer.equal(2), layer.greaterThan(0),
      ).and(packed.z.lessThanEqual(this.linearDepthAt(at).add(0.04)));
      const result = vec4(0).toVar();
      If(visible, () => {
        const motion = packed.xy.mul(scale).mul(this.exposureScale).toVar();
        const pixels = length(motion.mul(this.size));
        motion.mulAssign(min(1, this.maxRadius.mul(2).div(max(pixels, float(1e-6)))));
        If(pixels.lessThan(this.minSpeed), () => { motion.assign(vec2(0)); });
        result.assign(vec4(motion, packed.z, layer));
      });
      return result;
    })();
    this.resolveQuad = new THREE.QuadMesh(material);
  }

  /** Copy only the unfiltered current image; no image-matching history. */
  capture(renderer: THREE.WebGPURenderer, camera: THREE.Camera): boolean {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const resized = !size.equals(this.size.value);
    if (resized) {
      this.size.value.copy(size);
      this.resolved.setSize(size.x, size.y);
      this.frame.image.width = size.x;
      this.frame.image.height = size.y;
      this.frame.needsUpdate = true;
    }
    this.inverseProjection.value.copy(camera.projectionMatrixInverse);
    this.depthToNdc.value.set(camera.coordinateSystem === THREE.WebGPUCoordinateSystem ? 1 : 2,
      camera.coordinateSystem === THREE.WebGPUCoordinateSystem ? 0 : -1);
    renderer.copyFramebufferToTexture(this.frame);
    return resized;
  }

  resolve(renderer: THREE.WebGPURenderer): void {
    const previousTarget = renderer.getRenderTarget();
    const autoClear = renderer.autoClear;
    try {
      renderer.autoClear = true;
      renderer.setRenderTarget(this.resolved);
      this.resolveQuad.render(renderer);
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.autoClear = autoClear;
    }
  }

  dispose(): void {
    this.resolved.dispose();
    (this.resolveQuad.material as THREE.Material).dispose();
    this.frame.dispose();
  }
}
