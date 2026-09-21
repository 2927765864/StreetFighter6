import { Matrix4 } from 'three';

/**
 * Screen-space motion between successive shake poses, excluding camera follow.
 * Reapply the previous camera-local shake to THIS frame's unshaken camera, then
 * compare projections. The resulting 4x4 transform reprojects each pixel's
 * actual clip-space depth, including FOV and translation at any world depth.
 */
export class CameraShakeMotion {
  readonly previousClipFromCurrent = new Matrix4();
  hasMotion = false;
  private readonly previousLocalView = new Matrix4();
  private readonly previousProjectionDelta = new Matrix4();
  private readonly inverseBase = new Matrix4();
  private readonly currentVP = new Matrix4();
  private readonly previousVP = new Matrix4();

  reset(): void {
    this.previousLocalView.identity();
    this.previousProjectionDelta.identity();
    this.previousClipFromCurrent.identity();
    this.hasMotion = false;
  }

  /** Call only on advancing frames; paused redraws keep the previous result. */
  update(
    view: Matrix4,
    projection: Matrix4,
    unshakenView: Matrix4,
    unshakenProjection: Matrix4,
  ): void {
    this.currentVP.multiplyMatrices(projection, view);
    this.previousVP.copy(this.previousProjectionDelta)
      .multiply(unshakenProjection)
      .multiply(this.previousLocalView)
      .multiply(unshakenView);
    this.previousClipFromCurrent.identity();
    if (Math.abs(this.currentVP.determinant()) > 1e-12) {
      this.previousClipFromCurrent.copy(this.previousVP)
        .multiply(this.currentVP.invert());
    }
    this.hasMotion = this.previousClipFromCurrent.elements.some((value, index) =>
      Math.abs(value - (index % 5 === 0 ? 1 : 0)) > 1e-7,
    );

    this.inverseBase.copy(unshakenView).invert();
    this.previousLocalView.multiplyMatrices(view, this.inverseBase);
    this.inverseBase.copy(unshakenProjection).invert();
    this.previousProjectionDelta.multiplyMatrices(projection, this.inverseBase);
  }
}
