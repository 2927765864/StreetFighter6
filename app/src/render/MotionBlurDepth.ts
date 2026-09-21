import { DepthTexture, Vector2 } from 'three';
import type { FramebufferTexture, WebGPURenderer } from 'three/webgpu';

export type MotionBlurDepthLayer = 'background' | 'foreground';

/**
 * Keep depth before the 2.5D display clears it. Background includes the stage
 * and back fighter; foreground contains the priority fighter, with 1 elsewhere.
 * The shader selects foreground wherever it drew, otherwise background. Taking
 * min(depth) would violate the intentional foreground display priority.
 */
export class MotionBlurDepth {
  readonly background = new DepthTexture(1, 1);
  readonly foreground = new DepthTexture(1, 1);
  private readonly size = new Vector2();

  constructor() {
    this.background.name = 'MotionBlurBackgroundDepth';
    this.foreground.name = 'MotionBlurForegroundDepth';
  }

  capture(renderer: WebGPURenderer, layer: MotionBlurDepthLayer): void {
    renderer.getDrawingBufferSize(this.size);
    const target = this[layer];
    if (target.image.width !== this.size.x || target.image.height !== this.size.y) {
      target.image.width = this.size.x;
      target.image.height = this.size.y;
      target.needsUpdate = true;
    }
    // Three's own ViewportDepthTextureNode uses this API with DepthTexture;
    // the @types signature still only lists FramebufferTexture.
    renderer.copyFramebufferToTexture(target as unknown as FramebufferTexture);
  }

  dispose(): void {
    this.background.dispose();
    this.foreground.dispose();
  }
}
