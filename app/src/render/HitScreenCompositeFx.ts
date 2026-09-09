/**
 * One fullscreen pass: shockwave UV warp + additive glow.
 * Both effects used viewportTexture separately (2 framebuffer copies).
 */
import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec2,
  vec3,
  uniform,
  screenUV,
  viewportTexture,
  length,
  max,
  exp,
} from 'three/tsl';
import type { HitGlowFx } from './HitGlowFx';
import type { HitShockwaveFx } from './HitShockwaveFx';

const _size = new THREE.Vector2();

export class HitScreenCompositeFx {
  private readonly shock: HitShockwaveFx;
  private readonly glow: HitGlowFx;
  private readonly uAspect = uniform(1);
  private readonly material: THREE.NodeMaterial;
  private readonly quad: THREE.QuadMesh;

  constructor(shock: HitShockwaveFx, glow: HitGlowFx) {
    this.shock = shock;
    this.glow = glow;

    const w0 = shock.waveData[0]!;
    const w1 = shock.waveData[1]!;
    const w2 = shock.waveData[2]!;
    const w3 = shock.waveData[3]!;
    const g0 = glow.glowData[0]!;
    const g1 = glow.glowData[1]!;
    const g2 = glow.glowData[2]!;
    const g3 = glow.glowData[3]!;
    const uThickness = shock.uThickness;
    const uHardness = glow.uHardness;
    const uColor = glow.uColor;
    const uAspect = this.uAspect;

    const waveOffset = Fn(([uv, data]: any[]) => {
      const center = data.xy;
      const radius = data.z;
      const amp = data.w;
      const delta = uv.sub(center).mul(vec2(uAspect, float(1)));
      const dist = length(delta);
      const x = dist.sub(radius).div(max(uThickness, float(1e-4)));
      const band = exp(x.mul(x).negate());
      const dir = delta.div(max(dist, float(1e-4)));
      return dir.mul(amp.mul(band)).div(vec2(uAspect, float(1)));
    });

    const softDisk = Fn(([uv, data]: any[]) => {
      const center = data.xy;
      const radius = data.z;
      const intensity = data.w;
      const delta = uv.sub(center).mul(vec2(uAspect, float(1)));
      const dist = length(delta);
      const r = max(radius, float(1e-4));
      const t = dist.div(r);
      const falloff = exp(t.mul(t).mul(uHardness).negate());
      return falloff.mul(intensity);
    });

    const colorNode = Fn(() => {
      const uv = screenUV.toVar();
      const off = vec2(0, 0).toVar();
      off.addAssign(waveOffset(uv, w0));
      off.addAssign(waveOffset(uv, w1));
      off.addAssign(waveOffset(uv, w2));
      off.addAssign(waveOffset(uv, w3));
      const base = viewportTexture(uv.add(off)).toVar();
      const w = float(0).toVar();
      w.addAssign(softDisk(uv, g0));
      w.addAssign(softDisk(uv, g1));
      w.addAssign(softDisk(uv, g2));
      w.addAssign(softDisk(uv, g3));
      return base.add(vec3(uColor).mul(w));
    })();

    this.material = new THREE.NodeMaterial();
    this.material.name = 'HitScreenCompositeFx';
    this.material.fragmentNode = colorNode;
    this.material.depthTest = false;
    this.material.depthWrite = false;
    this.material.transparent = false;
    this.quad = new THREE.QuadMesh(this.material);
    this.quad.name = 'HitScreenCompositeQuad';
  }

  apply(
    renderer: THREE.WebGPURenderer,
    camera?: THREE.Camera | null,
  ): void {
    const shockOn = this.shock.hasActive();
    const glowOn = this.glow.hasActive();
    if (!shockOn && !glowOn) return;

    if (camera) {
      this.shock.prepareForDraw(camera);
      this.glow.prepareForDraw(camera);
    }

    renderer.getDrawingBufferSize(_size);
    this.uAspect.value = _size.x / Math.max(_size.y, 1);

    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    try {
      renderer.render(this.quad, this.quad.camera);
    } finally {
      renderer.autoClear = prevAutoClear;
    }
  }

  dispose(): void {
    this.material.dispose();
  }
}
