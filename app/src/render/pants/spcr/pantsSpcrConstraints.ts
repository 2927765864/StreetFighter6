/**
 * Build SPCR-style structural / shear / bending constraints.
 * Constraint kinds: SPARK-inc/SPCRJointDynamics README + Controller.cs (MIT).
 */
import type { PantsChainId } from '../ryuPantsBoneNames';
import type { PantsConstraint, PantsParticle } from './PantsSpcrTypes';

export type ChainIndexMap = Map<
  PantsChainId,
  { indices: number[]; maxDepth: number }
>;

function restLen(particles: PantsParticle[], a: number, b: number): number {
  return particles[a]!.positionCurrent.distanceTo(particles[b]!.positionCurrent);
}

function addUnique(
  list: PantsConstraint[],
  seen: Set<string>,
  kind: PantsConstraint['kind'],
  a: number,
  b: number,
  particles: PantsParticle[],
): void {
  if (a === b) return;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const key = `${kind}:${lo}:${hi}`;
  if (seen.has(key)) return;
  seen.add(key);
  list.push({
    kind,
    indexA: a,
    indexB: b,
    restLength: restLen(particles, a, b),
  });
}

export function buildPantsConstraints(args: {
  particles: PantsParticle[];
  chainMap: ChainIndexMap;
  rings: readonly { id: string; chainIds: readonly PantsChainId[] }[];
  enableHorizontal: boolean;
  enableShear: boolean;
  enableBending: boolean;
}): PantsConstraint[] {
  const { particles, chainMap, rings } = args;
  const out: PantsConstraint[] = [];
  const seen = new Set<string>();

  for (const [, entry] of chainMap) {
    const { indices } = entry;
    for (let i = 0; i < indices.length - 1; i++) {
      addUnique(out, seen, 'structuralVertical', indices[i]!, indices[i + 1]!, particles);
    }
    if (args.enableBending) {
      for (let i = 0; i < indices.length - 2; i++) {
        addUnique(
          out,
          seen,
          'bendingVertical',
          indices[i]!,
          indices[i + 2]!,
          particles,
        );
      }
    }
  }

  if (args.enableHorizontal || args.enableShear || args.enableBending) {
    for (const ring of rings) {
      const chains = ring.chainIds
        .map((id) => chainMap.get(id))
        .filter((c): c is NonNullable<typeof c> => !!c);
      if (chains.length < 2) continue;
      const maxDepth = Math.min(...chains.map((c) => c.maxDepth));
      for (let d = 0; d <= maxDepth; d++) {
        const ringIdx: number[] = [];
        for (const c of chains) {
          if (d < c.indices.length) {
            const idx = c.indices[d]!;
            // Skip fixed anchors (often share a parent origin → zero-length links).
            if (!particles[idx]!.isFixed) ringIdx.push(idx);
          }
        }
        const n = ringIdx.length;
        if (n < 2) continue;
        for (let i = 0; i < n; i++) {
          const a = ringIdx[i]!;
          const b = ringIdx[(i + 1) % n]!;
          if (args.enableHorizontal) {
            addUnique(out, seen, 'structuralHorizontal', a, b, particles);
          }
          if (args.enableBending && n >= 3) {
            const c = ringIdx[(i + 2) % n]!;
            addUnique(out, seen, 'bendingHorizontal', a, c, particles);
          }
        }
        if (args.enableShear && d < maxDepth) {
          for (let i = 0; i < n; i++) {
            const a = ringIdx[i]!;
            const nextChain = chains[(i + 1) % chains.length]!;
            if (d + 1 < nextChain.indices.length) {
              addUnique(
                out,
                seen,
                'shear',
                a,
                nextChain.indices[d + 1]!,
                particles,
              );
            }
            const prevChain = chains[(i - 1 + chains.length) % chains.length]!;
            if (d + 1 < prevChain.indices.length) {
              addUnique(
                out,
                seen,
                'shear',
                a,
                prevChain.indices[d + 1]!,
                particles,
              );
            }
          }
        }
      }
    }
  }

  return out;
}

export function projectConstraint(
  particles: PantsParticle[],
  c: PantsConstraint,
  shrink: number,
  stretch: number,
): void {
  const pa = particles[c.indexA]!;
  const pb = particles[c.indexB]!;
  const dx = pb.positionCurrent.x - pa.positionCurrent.x;
  const dy = pb.positionCurrent.y - pa.positionCurrent.y;
  const dz = pb.positionCurrent.z - pa.positionCurrent.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist < 1e-8) return;
  const rest = c.restLength;
  let scale = 1;
  if (dist > rest) {
    scale = stretch;
  } else if (dist < rest) {
    scale = shrink;
  }
  if (scale <= 0) return;
  const diff = (dist - rest) / dist;
  const corr = diff * 0.5 * scale;
  const wa = pa.isFixed ? 0 : 1;
  const wb = pb.isFixed ? 0 : 1;
  const wsum = wa + wb;
  if (wsum <= 0) return;
  const ca = (corr * wa) / wsum;
  const cb = (corr * wb) / wsum;
  if (wa > 0) {
    pa.positionCurrent.x += dx * ca;
    pa.positionCurrent.y += dy * ca;
    pa.positionCurrent.z += dz * ca;
  }
  if (wb > 0) {
    pb.positionCurrent.x -= dx * cb;
    pb.positionCurrent.y -= dy * cb;
    pb.positionCurrent.z -= dz * cb;
  }
}
