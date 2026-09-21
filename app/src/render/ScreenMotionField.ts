import * as THREE from 'three/webgpu';
import {
  Fn, If, Loop, abs, dot, float, floor, int, length, max, min,
  screenUV, smoothstep, texture, uniform, vec2, vec4,
} from 'three/tsl';
import type { MotionBlurDepth } from './MotionBlurDepth';

function target(name: string): THREE.RenderTarget {
  const rt = new THREE.RenderTarget(1, 1, {
    type: THREE.HalfFloatType, minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter, depthBuffer: false,
  });
  rt.texture.name = name;
  return rt;
}

function quad(node: THREE.Node<'vec4'>, name: string): THREE.QuadMesh {
  const material = new THREE.NodeMaterial();
  material.name = name;
  material.fragmentNode = node;
  material.depthTest = material.depthWrite = false;
  material.toneMapped = false;
  return new THREE.QuadMesh(material);
}

/**
 * Geometry proposes a correspondence; unblurred image patches must confirm it.
 * Stable image regions, lighting flashes and occluded geometry cannot generate
 * blur just because their bones moved. History is never the blurred output.
 * A tile/neighbor field lets the reconstruction gather beyond the silhouette.
 */
export class ScreenMotionField {
  readonly resolved = target('VisibleScreenMotion');
  readonly tiles = target('ScreenMotionTiles');
  readonly neighbors = target('ScreenMotionNeighbors');
  readonly size = uniform(new THREE.Vector2(1, 1));
  readonly tileSize = uniform(16);
  readonly maxRadius = uniform(16);
  readonly inverseProjection = uniform(new THREE.Matrix4());
  readonly depthToNdc = uniform(new THREE.Vector2(1, 0));
  readonly previousClip = uniform(new THREE.Matrix4());
  readonly historyValid = uniform(0);
  private readonly frames = [new THREE.FramebufferTexture(1, 1), new THREE.FramebufferTexture(1, 1)];
  readonly beauty = texture(this.frames[0]!);
  readonly previous = texture(this.frames[1]!);
  readonly velocity = texture(this.resolved.texture);
  readonly neighbor = texture(this.neighbors.texture);
  readonly foreground;
  readonly depthAt;
  readonly linearDepthAt;
  private readonly resolveQuad: THREE.QuadMesh;
  private readonly tileQuad: THREE.QuadMesh;
  private readonly neighborQuad: THREE.QuadMesh;
  private readonly lastViewProjection = new THREE.Matrix4();
  private readonly viewProjection = new THREE.Matrix4();
  private hasFrame = false;

  constructor(rawVelocity: THREE.Texture, depth: MotionBlurDepth) {
    for (const frame of this.frames) {
      frame.minFilter = frame.magFilter = THREE.LinearFilter;
      frame.name = 'MotionBlurUnfilteredHistory';
    }
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
    const error = Fn(([a, b]: [THREE.Node<'vec3'>, THREE.Node<'vec3'>]) =>
      dot(abs(a.sub(b)), vec4(0.333333).xyz));

    this.resolveQuad = quad(Fn(() => {
      const at = screenUV;
      const packed = raw.sample(at);
      const layer = floor(packed.w.div(4));
      const scale = packed.w.sub(layer.mul(4));
      // Signed UV offsets retain subpixel precision in half-float buffers.
      const proposed = packed.xy;
      const result = vec4(0, 0, packed.z, layer).toVar();
      const visible = this.foreground.sample(at).x.lessThan(1).select(
        layer.equal(2), layer.greaterThan(0),
      );
      If(visible.and(this.historyValid.greaterThan(0.5))
        .and(length(proposed.mul(this.size)).greaterThan(0.75)), () => {
        const ndc = vec2(at.x.mul(2).sub(1), float(1).sub(at.y.mul(2)));
        const z = this.depthAt(at).mul(this.depthToNdc.x).add(this.depthToNdc.y);
        const clip = this.previousClip.mul(vec4(ndc, z, 1));
        const base = clip.xy.div(max(clip.w, float(1e-6)))
          .mul(vec2(0.5, -0.5)).add(0.5);
        const dx = vec2(1.5, 0).div(this.size);
        const dy = vec2(0, 1.5).div(this.size);
        const c0 = this.beauty.sample(at).rgb.toVar();
        const cx = this.beauty.sample(at.add(dx)).rgb.toVar();
        const cy = this.beauty.sample(at.add(dy)).rgb.toVar();
        const nx = this.beauty.sample(at.sub(dx)).rgb.toVar();
        const ny = this.beauty.sample(at.sub(dy)).rgb.toVar();
        const patchError = Fn(([p]: [THREE.Node<'vec2'>]) =>
          error(c0, this.previous.sample(p).rgb)
            .add(error(cx, this.previous.sample(p.add(dx)).rgb))
            .add(error(cy, this.previous.sample(p.add(dy)).rgb))
            .add(error(nx, this.previous.sample(p.sub(dx)).rgb))
            .add(error(ny, this.previous.sample(p.sub(dy)).rgb)).div(5));
        const stillError = patchError(base).toVar();
        const bestError = stillError.toVar();
        const best = vec2(0).toVar();
        // Search image correspondences along the proposed screen trajectory.
        // A zero-motion match always wins ties, including textureless regions.
        Loop({ start: int(1), end: int(4), type: 'int', condition: '<' }, ({ i }) => {
          const candidate = proposed.mul(float(i).mul(0.5));
          const previousUv = base.sub(candidate);
          const inside = previousUv.x.greaterThan(0).and(previousUv.x.lessThan(1))
            .and(previousUv.y.greaterThan(0)).and(previousUv.y.lessThan(1));
          const cost = patchError(previousUv);
          If(inside.and(cost.lessThan(bestError)), () => {
            bestError.assign(cost);
            best.assign(candidate);
          });
        });
        const confidence = smoothstep(0.008, 0.045, stillError)
          .mul(smoothstep(0.003, 0.025, stillError.sub(bestError)))
          .mul(float(1).sub(smoothstep(0.08, 0.25, bestError)));
        const motion = best.mul(scale).mul(confidence).toVar();
        const pixels = length(motion.mul(this.size));
        motion.mulAssign(min(1, this.maxRadius.mul(2).div(max(pixels, float(1e-6)))));
        If(pixels.lessThan(0.75), () => { motion.assign(vec2(0)); });
        result.xy.assign(motion);
      });
      If(visible.not(), () => { result.assign(vec4(0)); });
      return result;
    })(), 'ConfirmScreenMotion');

    const tileDimensions = this.size.div(this.tileSize).ceil();
    this.tileQuad = quad(Fn(() => {
      const start = floor(screenUV.mul(tileDimensions)).mul(this.tileSize).add(0.5);
      const winner = vec4(0).toVar();
      const speed = float(0).toVar();
      Loop({ start: int(0), end: int(this.tileSize), type: 'int', condition: '<' }, ({ i }) => {
        Loop({ start: int(0), end: int(this.tileSize), type: 'int', condition: '<' }, ({ i: j }) => {
          const p = start.add(vec2(i, j)).div(this.size);
          const v = this.velocity.sample(p).xy;
          const pixels = v.mul(this.size);
          const magnitude = dot(pixels, pixels);
          If(magnitude.greaterThan(speed), () => {
            speed.assign(magnitude);
            winner.assign(vec4(v, p));
          });
        });
      });
      return winner;
    })(), 'ScreenMotionTileMax');
    const tileTexture = texture(this.tiles.texture);
    this.neighborQuad = quad(Fn(() => {
      const winner = vec4(0).toVar();
      const speed = float(0).toVar();
      for (let y = -1; y <= 1; y++) {
        for (let x = -1; x <= 1; x++) {
          const candidate = tileTexture.sample(screenUV.add(vec2(x, y).div(tileDimensions)));
          const v = candidate.xy.mul(this.size);
          const magnitude = dot(v, v);
          If(magnitude.greaterThan(speed), () => {
            speed.assign(magnitude);
            winner.assign(candidate);
          });
        }
      }
      return winner;
    })(), 'ScreenMotionNeighborMax');
  }

  capture(renderer: THREE.WebGPURenderer, camera: THREE.Camera, hold: boolean): void {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    if (!size.equals(this.size.value)) {
      this.size.value.copy(size);
      this.resolved.setSize(size.x, size.y);
      for (const frame of this.frames) {
        frame.image.width = size.x;
        frame.image.height = size.y;
        frame.needsUpdate = true;
      }
      this.reset();
    }
    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.inverseProjection.value.copy(camera.projectionMatrixInverse);
    this.depthToNdc.value.set(camera.coordinateSystem === THREE.WebGPUCoordinateSystem ? 1 : 2,
      camera.coordinateSystem === THREE.WebGPUCoordinateSystem ? 0 : -1);
    const initializeHistory = !this.hasFrame;
    if (!hold) {
      if (this.hasFrame) {
        this.previous.value = this.beauty.value;
        this.beauty.value = this.frames[this.beauty.value === this.frames[0] ? 1 : 0]!;
        this.historyValid.value = 1;
        this.previousClip.value.copy(this.viewProjection).invert().premultiply(this.lastViewProjection);
      }
      this.lastViewProjection.copy(this.viewProjection);
      this.hasFrame = true;
    }
    renderer.copyFramebufferToTexture(this.beauty.value as THREE.FramebufferTexture);
    // Initialize both from the actual framebuffer before either is sampled.
    // Otherwise the unused history may be allocated with the canvas format
    // while the scene is rendered through Three's HDR output target.
    if (initializeHistory) {
      renderer.copyFramebufferToTexture(this.previous.value as THREE.FramebufferTexture);
    }
  }

  resolve(renderer: THREE.WebGPURenderer): void {
    // Each tile covers a maximum sample arm, so one neighbor ring is enough.
    this.tileSize.value = Math.max(4, Math.ceil(this.maxRadius.value));
    const w = Math.ceil(this.size.value.x / this.tileSize.value);
    const h = Math.ceil(this.size.value.y / this.tileSize.value);
    this.tiles.setSize(w, h);
    this.neighbors.setSize(w, h);
    const previousTarget = renderer.getRenderTarget();
    const autoClear = renderer.autoClear;
    try {
      renderer.autoClear = true;
      for (const [rt, q] of [
        [this.resolved, this.resolveQuad], [this.tiles, this.tileQuad],
        [this.neighbors, this.neighborQuad],
      ] as const) {
        renderer.setRenderTarget(rt);
        q.render(renderer);
      }
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.autoClear = autoClear;
    }
  }

  reset(): void {
    this.hasFrame = false;
    this.historyValid.value = 0;
    this.previousClip.value.identity();
  }

  dispose(): void {
    for (const rt of [this.resolved, this.tiles, this.neighbors]) rt.dispose();
    for (const q of [this.resolveQuad, this.tileQuad, this.neighborQuad]) {
      (q.material as THREE.Material).dispose();
    }
    for (const frame of this.frames) frame.dispose();
  }
}
