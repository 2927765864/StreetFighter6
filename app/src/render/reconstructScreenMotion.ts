import type * as THREE from 'three/webgpu';
import { Fn, If, Loop, abs, dot, float, int, length, max, min, smoothstep, vec2, vec4 } from 'three/tsl';
import type { ScreenMotionField } from './ScreenMotionField';

/** Gather moving foreground samples even when the destination is background. */
export function reconstructScreenMotion(
  field: ScreenMotionField,
  at: THREE.Node<'vec2'>,
  cameraUv: THREE.Node<'vec2'>,
  samples: THREE.Node<'float'>,
  objectsEnabled: THREE.Node<'float'>,
): THREE.Node<'vec4'> {
  return Fn(() => {
    const base = field.beauty.sample(at).rgb.toVar();
    const own = field.velocity.sample(at).toVar();
    If(objectsEnabled.lessThan(0.5), () => { own.assign(vec4(0)); });
    const ownSpeed = length(own.xy.mul(field.size));
    const nearby = field.neighbor.sample(at).xy;
    const motion = own.xy.toVar();
    If(ownSpeed.lessThan(0.75).and(objectsEnabled.greaterThan(0.5)), () => {
      motion.assign(nearby);
    });
    const arm = motion.add(cameraUv).toVar();
    const armPixels = length(arm.mul(field.size));
    arm.mulAssign(min(1, field.maxRadius.mul(2).div(max(armPixels, float(1e-6)))));
    const hasObject = length(motion.mul(field.size)).greaterThanEqual(0.75);
    const centerDepth = field.linearDepthAt(at).toVar();
    const centerFront = field.foreground.sample(at).x.lessThan(1);
    const centerLayer = centerFront.select(float(2), own.w).toVar();
    const sum = base.toVar();
    const count = float(1).toVar();
    If(length(arm.mul(field.size)).greaterThanEqual(0.25), () => {
      sum.assign(vec4(0).rgb);
      count.assign(0);
      Loop({ start: int(0), end: int(16), type: 'int', condition: '<' }, ({ i }) => {
        If(float(i).lessThan(samples), () => {
          const t = float(i).add(0.5).div(samples).sub(0.5);
          const sampleUv = at.add(arm.mul(t)).clamp(vec2(0), vec2(1));
          const incoming = field.velocity.sample(sampleUv);
          const color = field.beauty.sample(sampleUv).rgb;
          const keep = float(0).toVar();
          If(hasObject, () => {
            // A sample contributes only if its own trajectory reaches this
            // pixel. Borrowing a neighbor's vector never smears the background.
            const v = incoming.xy.mul(field.size);
            const delta = at.sub(sampleUv).add(cameraUv.mul(t)).mul(field.size);
            const v2 = max(dot(v, v), float(1e-5));
            const along = dot(delta, v).div(v2);
            const across = length(delta.sub(v.mul(along)));
            const coverage = float(1).sub(smoothstep(0.5, float(0.5).add(float(1).div(max(length(v), float(1)))), abs(along)))
              .mul(float(1).sub(smoothstep(1, 2.5, across)));
            const foregroundAllowed = incoming.w.greaterThanEqual(centerLayer)
              .and(incoming.w.greaterThan(0))
              .and(incoming.w.greaterThan(centerLayer).or(incoming.z.lessThanEqual(centerDepth.add(0.04))));
            If(foregroundAllowed.and(length(v).greaterThanEqual(0.75)), () => {
              keep.assign(coverage);
            });
            // On the moving surface itself, blend with the revealed background
            // to soften the edge inwards as well as extending it outwards.
            If(ownSpeed.greaterThanEqual(0.75).and(incoming.w.lessThan(0.5))
              .and(field.foreground.sample(sampleUv).x.greaterThanEqual(1))
              .and(field.linearDepthAt(sampleUv).greaterThan(centerDepth)), () => {
              keep.assign(1);
            });
          }).Else(() => {
            // Camera exposure sweeps visible image content across silhouettes.
            // Rejecting samples by depth kept the fighter outline artificially
            // sharp even when its measured pixel travel was large.
            keep.assign(1);
          });
          sum.addAssign(base.add(color.sub(base).mul(keep)));
          count.addAssign(1);
        });
      });
    });
    return vec4(sum.div(max(count, float(1))), 1);
  })();
}
