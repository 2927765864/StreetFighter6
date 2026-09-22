import type * as THREE from 'three/webgpu';
import { Fn, If, Loop, abs, dot, float, int, length, max, min, smoothstep, vec2, vec4 } from 'three/tsl';
import type { LocalMotionBlurField } from './LocalMotionBlurField';

/** Blur lab mode 2: short object-only motion, eight neighbors, depth-aware taps. */
export function reconstructLocalMotion(
  field: LocalMotionBlurField,
  at: THREE.Node<'vec2'>,
  cameraUv: THREE.Node<'vec2'>,
  samples: THREE.Node<'float'>,
  objectsEnabled: THREE.Node<'float'>,
): THREE.Node<'vec4'> {
  return Fn(() => {
    const base = field.beauty.sample(at).rgb.toVar();
    const own = field.velocity.sample(at).toVar();
    If(objectsEnabled.lessThan(0.5), () => { own.assign(vec4(0)); });
    const centerDepth = field.linearDepthAt(at).toVar();
    const centerLayer = field.foreground.sample(at).x.lessThan(1).select(float(2), float(1));
    const motion = own.xy.toVar();
    const best = dot(motion.mul(field.size), motion.mul(field.size)).toVar();
    If(objectsEnabled.greaterThan(0.5), () => {
      for (let j = 0; j < 8; j++) {
        const angle = j * Math.PI / 4;
        const q = at.add(vec2(Math.cos(angle), Math.sin(angle))
          .mul(field.neighborRadius).div(field.size)).clamp(vec2(0), vec2(1));
        const n = field.velocity.sample(q);
        const speed = dot(n.xy.mul(field.size), n.xy.mul(field.size));
        If(speed.greaterThan(best).and(n.w.greaterThanEqual(centerLayer))
          .and(n.w.greaterThan(centerLayer).or(n.z.lessThan(centerDepth.add(0.5)))), () => {
          motion.assign(n.xy);
          best.assign(speed);
        });
      }
    });
    const arm = motion.add(cameraUv).toVar();
    const pixels = length(arm.mul(field.size));
    arm.mulAssign(min(1, field.maxRadius.mul(2).div(max(pixels, float(1e-6)))));
    const sum = base.mul(field.centerWeight).toVar();
    const weight = field.centerWeight.toVar();
    If(pixels.greaterThan(0.001), () => {
      Loop({ start: int(0), end: int(32), type: 'int', condition: '<' }, ({ i }) => {
        If(float(i).lessThan(samples), () => {
          const f = float(i).add(0.5).div(samples).sub(0.5);
          const q = at.add(arm.mul(f));
          const inside = q.x.greaterThanEqual(0).and(q.x.lessThanEqual(1))
            .and(q.y.greaterThanEqual(0)).and(q.y.lessThanEqual(1));
          If(inside, () => {
            const m = field.velocity.sample(q);
            const w = float(1).sub(abs(f).mul(0.8)).toVar();
            const otherSurface = m.w.notEqual(own.w);
            const sampleDepth = field.linearDepthAt(q);
            const sampleLayer = field.foreground.sample(q).x.lessThan(1).select(float(2), float(1));
            const nearer = sampleLayer.greaterThan(centerLayer)
              .or(sampleLayer.equal(centerLayer).and(sampleDepth.lessThan(centerDepth.sub(0.2))));
            // Static foreground remains sharp; never spread a back fighter over
            // the intentionally front-most 2.5D display layer.
            If(otherSurface.and(nearer), () => {
              w.mulAssign(smoothstep(0.1, 3, length(m.xy.mul(field.size))));
            });
            If(otherSurface.and(sampleDepth.greaterThan(centerDepth.add(0.2))), () => {
              w.mulAssign(0.5);
            });
            // A borrowed direction affects only pixels touched by a fighter.
            If(length(own.xy).lessThan(1e-8).and(length(m.xy).lessThan(1e-8))
              .and(length(cameraUv).lessThan(1e-8)), () => { w.assign(0); });
            sum.addAssign(field.beauty.sample(q).rgb.mul(w));
            weight.addAssign(w);
          });
        });
      });
    });
    return vec4(sum.div(max(weight, float(1e-6))), 1);
  })();
}
