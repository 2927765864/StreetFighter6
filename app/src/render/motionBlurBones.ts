/** Two independent 64 KiB bindings, within WebGPU's standard per-buffer limit.
 * Ryu uses 679 bones; the old 384-entry buffers truncated pants/body/foot joints.
 */
export const MOTION_BLUR_MAX_BONES = 1024;

/** Copy an entire pose. Unused joints must not retain another fighter's pose. */
export function copyMotionBlurBones(dest: Float32Array, src: Float32Array | null): void {
  const n = src?.length ?? 0;
  if (n > dest.length || n % 16 !== 0 || dest.length % 16 !== 0) {
    throw new RangeError('Motion blur bone buffer cannot hold the complete skeleton');
  }
  if (src) dest.set(src);
  dest.fill(0, n);
  for (let offset = n; offset < dest.length; offset += 16) {
    dest[offset] = dest[offset + 5] = dest[offset + 10] = dest[offset + 15] = 1;
  }
}
