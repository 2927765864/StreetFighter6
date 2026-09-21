import type * as THREE from 'three/webgpu';
import { Fn, If, Loop, abs, dot, float, int, length, max, vec2, vec4 } from 'three/tsl';
import type { ScreenMotionField } from './ScreenMotionField';

/**
 * Confirm shake travel against consecutive unblurred images. Projection gives
 * a search direction; the image correspondence selects the visible distance.
 * Compensate normal camera follow and object motion before comparing shake,
 * so neither a tracking camera nor a moving limb counts twice as camera blur.
 */
export function confirmCameraScreenMotion(
  field: ScreenMotionField,
  at: THREE.Node<'vec2'>,
  proposed: THREE.Node<'vec2'>,
  objectUv: THREE.Node<'vec2'>,
): THREE.Node<'vec2'> {
  return Fn(() => {
    const result = proposed.toVar();
    If(field.historyValid.greaterThan(0.5)
      .and(length(proposed.mul(field.size)).greaterThanEqual(0.25)), () => {
      const ndc = vec2(at.x.mul(2).sub(1), float(1).sub(at.y.mul(2)));
      const z = field.depthAt(at).mul(field.depthToNdc.x).add(field.depthToNdc.y);
      const previousClip = field.previousClip.mul(vec4(ndc, z, 1));
      const previousUv = previousClip.xy.div(max(previousClip.w, float(1e-6)))
        .mul(vec2(0.5, -0.5)).add(0.5);
      const withoutShake = previousUv.sub(objectUv).add(proposed);
      const dx = vec2(1, 0).div(field.size);
      const dy = vec2(0, 1).div(field.size);
      const c = field.beauty.sample(at).rgb.toVar();
      const cx = field.beauty.sample(at.add(dx)).rgb.toVar();
      const cy = field.beauty.sample(at.add(dy)).rgb.toVar();
      const error = Fn(([p]: [THREE.Node<'vec2'>]) =>
        dot(abs(c.sub(field.previous.sample(p).rgb))
          .add(abs(cx.sub(field.previous.sample(p.add(dx)).rgb)))
          .add(abs(cy.sub(field.previous.sample(p.add(dy)).rgb))), vec4(1 / 9).xyz));
      const bestError = error(withoutShake.sub(proposed)).toVar();
      // A textureless patch cannot identify movement. Keep the geometric
      // correspondence unless the images provide stronger evidence, rather
      // than punching sharp holes in otherwise continuous surface motion.
      Loop({ start: int(0), end: int(4), type: 'int', condition: '<' }, ({ i }) => {
        const scale = float(i).mul(0.5);
        const candidate = proposed.mul(scale);
        const p = withoutShake.sub(candidate);
        const inside = p.x.greaterThan(0).and(p.x.lessThan(1))
          .and(p.y.greaterThan(0)).and(p.y.lessThan(1));
        const cost = error(p).add(abs(scale.sub(1)).mul(0.01));
        If(inside.and(cost.lessThan(bestError.sub(0.0001))), () => {
          bestError.assign(cost);
          result.assign(candidate);
        });
      });
    });
    return result;
  })();
}
