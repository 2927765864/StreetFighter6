import { describe, expect, it, vi } from 'vitest';
import { MotionBlurDepth } from '../../src/render/MotionBlurDepth';

describe('motion blur layer depth snapshots', () => {
  it('copies independent depth snapshots at drawing-buffer resolution, including resize', () => {
    const depth = new MotionBlurDepth();
    let width = 1920;
    let height = 1080;
    const renderer = {
      getDrawingBufferSize: (out: { set: (w: number, h: number) => void }) => out.set(width, height),
      copyFramebufferToTexture: vi.fn(),
    } as unknown as Parameters<MotionBlurDepth['capture']>[0];
    depth.capture(renderer, 'background');
    depth.capture(renderer, 'foreground');
    expect(renderer.copyFramebufferToTexture).toHaveBeenNthCalledWith(1, depth.background);
    expect(renderer.copyFramebufferToTexture).toHaveBeenNthCalledWith(2, depth.foreground);
    expect(depth.foreground).not.toBe(depth.background);
    expect(depth.background.image.width).toBe(1920);
    expect(depth.foreground.image.height).toBe(1080);
    width = 1280;
    height = 720;
    depth.capture(renderer, 'background');
    depth.capture(renderer, 'foreground');
    expect(depth.background.image.width).toBe(1280);
    expect(depth.foreground.image.height).toBe(720);
    const disposeBack = vi.spyOn(depth.background, 'dispose');
    const disposeFront = vi.spyOn(depth.foreground, 'dispose');
    depth.dispose();
    expect(disposeBack).toHaveBeenCalledOnce();
    expect(disposeFront).toHaveBeenCalledOnce();
  });
});
