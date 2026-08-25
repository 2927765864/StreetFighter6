/**
 * Sample pants cloth health from SPCR particles/constraints.
 * Magica Cloth Monitor semantics: compare sim pose vs base/anim pose.
 */
import type { PantsConstraint, PantsParticle } from './spcr/PantsSpcrTypes';
import type {
  PantsHealthParamsSlice,
  PantsHealthSnapshot,
  PantsHealthStatus,
} from './pantsHealthTypes';

export function classifyPantsHealth(args: {
  enabled: boolean;
  bound: boolean;
  maxSeparation: number;
  abnormalThreshold: number;
  warnRatio: number;
}): PantsHealthStatus {
  if (!args.enabled || !args.bound) return 'disabled';
  const abnormal = Math.max(0, args.abnormalThreshold);
  const warn = abnormal * Math.max(0, Math.min(1, args.warnRatio));
  if (args.maxSeparation >= abnormal - 1e-9) return 'abnormal';
  if (args.maxSeparation >= warn - 1e-9) return 'warn';
  return 'ok';
}

export function samplePantsHealth(args: {
  enabled: boolean;
  bound: boolean;
  fighterId: PantsHealthSnapshot['fighterId'];
  particles: readonly PantsParticle[];
  constraints: readonly PantsConstraint[];
  warnRatio: number;
  abnormalThreshold: number;
  warpCountSession: number;
  clampCountSession: number;
  lastEvent: string;
  params: PantsHealthParamsSlice;
  nowMs?: number;
}): PantsHealthSnapshot {
  let free = 0;
  let fixed = 0;
  let sumSep = 0;
  let maxSep = 0;
  for (const p of args.particles) {
    if (p.isFixed) {
      fixed++;
      continue;
    }
    free++;
    const d = p.positionCurrent.distanceTo(p.transformPos);
    sumSep += d;
    if (d > maxSep) maxSep = d;
  }
  const meanSep = free > 0 ? sumSep / free : 0;

  let maxConstraintError = 0;
  for (const c of args.constraints) {
    if (
      c.kind !== 'structuralHorizontal' &&
      c.kind !== 'structuralVertical'
    ) {
      continue;
    }
    const a = args.particles[c.indexA];
    const b = args.particles[c.indexB];
    if (!a || !b) continue;
    const len = a.positionCurrent.distanceTo(b.positionCurrent);
    const err = Math.abs(len - c.restLength);
    if (err > maxConstraintError) maxConstraintError = err;
  }

  const warnThreshold =
    Math.max(0, args.abnormalThreshold) *
    Math.max(0, Math.min(1, args.warnRatio));
  const status = classifyPantsHealth({
    enabled: args.enabled,
    bound: args.bound,
    maxSeparation: maxSep,
    abnormalThreshold: args.abnormalThreshold,
    warnRatio: args.warnRatio,
  });

  const takenAtIso = new Date(args.nowMs ?? Date.now()).toISOString();
  return {
    schemaVersion: 1,
    fighterId: args.fighterId,
    takenAtIso,
    status,
    maxSeparation: maxSep,
    meanSeparation: meanSep,
    freeParticleCount: free,
    fixedParticleCount: fixed,
    maxConstraintError,
    warpCountSession: args.warpCountSession,
    clampCountSession: args.clampCountSession,
    lastEvent: args.lastEvent,
    warnThreshold,
    abnormalThreshold: Math.max(0, args.abnormalThreshold),
    params: { ...args.params },
  };
}

export function formatPantsHealthMarkdown(
  title: string,
  snaps: PantsHealthSnapshot | PantsHealthSnapshot[],
  extraNote?: string,
): string {
  const list = Array.isArray(snaps) ? snaps : [snaps];
  const lines: string[] = [
    `# ${title}`,
    '',
    `> AI 阅读提示：优先看 **status** 与 **maxSeparation**；abnormal ≈ 裤子曾或正在全屏拉伸风险。`,
    '',
    `生成时间：${list[0]?.takenAtIso ?? new Date().toISOString()}`,
    '',
  ];
  if (extraNote && extraNote.trim()) {
    lines.push(`备注：${extraNote.trim()}`, '');
  }
  for (const s of list) {
    lines.push(
      `## ${s.fighterId}`,
      '',
      `| 项 | 值 |`,
      `|----|----|`,
      `| status | **${s.status}** |`,
      `| maxSeparation | ${s.maxSeparation.toFixed(4)} |`,
      `| meanSeparation | ${s.meanSeparation.toFixed(4)} |`,
      `| warnThreshold | ${s.warnThreshold.toFixed(4)} |`,
      `| abnormalThreshold | ${s.abnormalThreshold.toFixed(4)} |`,
      `| maxConstraintError | ${s.maxConstraintError.toFixed(4)} |`,
      `| free / fixed | ${s.freeParticleCount} / ${s.fixedParticleCount} |`,
      `| warpCountSession | ${s.warpCountSession} |`,
      `| clampCountSession | ${s.clampCountSession} |`,
      `| lastEvent | ${s.lastEvent || '—'} |`,
      '',
      `### params`,
      '',
      `| 字段 | 值 |`,
      `|------|----|`,
      `| pantsHardness | ${s.params.pantsHardness} |`,
      `| pantsGravityPower | ${s.params.pantsGravityPower} |`,
      `| pantsResistance | ${s.params.pantsResistance} |`,
      `| pantsMaxSeparation | ${s.params.pantsMaxSeparation} |`,
      `| pantsRootSlideLimit | ${s.params.pantsRootSlideLimit} |`,
      `| pantsRootRotateLimitDeg | ${s.params.pantsRootRotateLimitDeg} |`,
      '',
    );
  }
  return lines.join('\n');
}

/** Rising edge into abnormal (for incident files). */
export function pantsHealthAbnormalRisingEdge(
  prev: PantsHealthStatus | null,
  next: PantsHealthStatus,
): boolean {
  return next === 'abnormal' && prev !== 'abnormal';
}
