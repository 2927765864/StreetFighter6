import type { Box } from '../boxes/Box2D';

export type TimedBox = Box & { from: number; to: number };

export type CancelWindow = {
  fromFrame: number;
  toFrame: number;
  into: string;
};

export type PlantWindow = {
  foot: 'L' | 'R';
  fromFrame: number;
  toFrame: number;
};

export type MoveDefinition = {
  id: string;
  characterId: string;
  moveId: string;
  displayName: string;
  frames: {
    startup: number;
    active: number;
    recovery: number;
    total: number;
  };
  advantage: { onHit: number; onBlock: number };
  damage: number;
  hitstun: number;
  blockstun: number;
  cancel: {
    specialCancel: boolean;
    superOnly?: boolean;
    targetCombo: string[];
    notes?: string;
    raw?: string;
    windows: CancelWindow[];
  };
  boxes: {
    hurt: TimedBox[];
    hit: TimedBox[];
  };
  clipId: string;
  facingRelative: boolean;
  review: { status: string; notes: string };
  sources?: { name: string; url: string; retrieved: string }[];
  /** Per-logic-frame self X delta (facing-forward +). Consensus §3.10 */
  selfMovement?: number[];
  /** Support-foot plant window (attack only). Consensus §3.9 */
  plant?: PlantWindow;
  /**
   * Full presentation length @60Hz (glb samples). If > frames.total, residual
   * tail plays after logic ends (consensus §3.7.1). Optional; may be filled
   * from glbPath `_fN` or map frameCount.
   */
  animFrameCount?: number;
  /** Optional anims-relative path (for tooling / frameCount parse). */
  glbPath?: string;
  /**
   * Posture family for residual compatibility (consensus §3.7.1).
   * If omitted, inferred from moveId (2* crouch, j./8* air, else stand).
   */
  stance?: 'stand' | 'crouch' | 'air';
};

function asNum(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/**
 * Parse runtime move JSON. Normalizes recovery/total and cancel.windows.
 * @see schema-move-table.md / plan Step 6
 */
export function parseMoveDefinition(raw: unknown): MoveDefinition {
  const o = raw as Record<string, unknown>;
  if (!o?.id || !o.frames || !o.boxes) {
    throw new Error('Invalid MoveDefinition JSON');
  }
  const framesIn = o.frames as Record<string, unknown>;
  let startup = asNum(framesIn.startup, 0);
  let active = asNum(framesIn.active, 0);
  let recovery =
    framesIn.recovery === null || framesIn.recovery === undefined
      ? NaN
      : asNum(framesIn.recovery, NaN);
  let total =
    framesIn.total === null || framesIn.total === undefined
      ? NaN
      : asNum(framesIn.total, NaN);

  if (!Number.isFinite(recovery) && Number.isFinite(total)) {
    recovery = Math.max(0, total - startup - active);
  }
  if (!Number.isFinite(total)) {
    total = startup + active + (Number.isFinite(recovery) ? recovery : 0);
  }
  if (!Number.isFinite(recovery)) {
    recovery = Math.max(0, total - startup - active);
  }
  // Ensure total matches sum
  total = startup + active + recovery;

  const cancelIn = (o.cancel ?? {}) as Record<string, unknown>;
  const windowsRaw = cancelIn.windows;
  const windows: CancelWindow[] = Array.isArray(windowsRaw)
    ? (windowsRaw as CancelWindow[]).map((w) => ({
        fromFrame: asNum(w.fromFrame, 0),
        toFrame: asNum(w.toFrame, 0),
        into: String(w.into ?? ''),
      }))
    : [];

  const adv = (o.advantage ?? {}) as Record<string, unknown>;
  const onHit = asNum(adv.onHit, 0);
  const onBlock = asNum(adv.onBlock, 0);

  let hitstun = asNum(o.hitstun, NaN);
  let blockstun = asNum(o.blockstun, NaN);
  if (!Number.isFinite(hitstun)) {
    hitstun = Math.max(0, onHit + recovery); // placeholder
  }
  if (!Number.isFinite(blockstun)) {
    blockstun = Math.max(0, -onBlock + 5); // placeholder
  }

  const boxes = o.boxes as {
    hurt?: TimedBox[];
    hit?: TimedBox[];
  };

  let selfMovement: number[] | undefined;
  if (Array.isArray(o.selfMovement)) {
    selfMovement = (o.selfMovement as unknown[]).map((v) => asNum(v, 0));
  }

  let plant: PlantWindow | undefined;
  if (o.plant && typeof o.plant === 'object') {
    const p = o.plant as Record<string, unknown>;
    const foot = p.foot === 'R' ? 'R' : p.foot === 'L' ? 'L' : null;
    if (foot) {
      plant = {
        foot,
        fromFrame: asNum(p.fromFrame, 0),
        toFrame: asNum(p.toFrame, 0),
      };
    }
  }

  const glbPath =
    o.glbPath != null && String(o.glbPath).length > 0
      ? String(o.glbPath)
      : undefined;

  let animFrameCount: number | undefined;
  if (o.animFrameCount != null && Number.isFinite(Number(o.animFrameCount))) {
    animFrameCount = Math.max(1, Math.floor(Number(o.animFrameCount)));
  } else if (glbPath) {
    const m = /_f(\d+)(?:\.|$)/i.exec(glbPath);
    if (m) animFrameCount = Math.max(1, parseInt(m[1]!, 10));
  }

  let stance: MoveDefinition['stance'];
  if (o.stance === 'stand' || o.stance === 'crouch' || o.stance === 'air') {
    stance = o.stance;
  }

  return {
    id: String(o.id),
    characterId: String(o.characterId ?? 'ryu'),
    moveId: String(o.moveId ?? o.id),
    displayName: String(o.displayName ?? o.moveId ?? o.id),
    frames: { startup, active, recovery, total },
    advantage: { onHit, onBlock },
    damage: asNum(o.damage, 0),
    hitstun,
    blockstun,
    cancel: {
      specialCancel: Boolean(cancelIn.specialCancel),
      superOnly: Boolean(cancelIn.superOnly),
      targetCombo: Array.isArray(cancelIn.targetCombo)
        ? (cancelIn.targetCombo as string[])
        : [],
      notes: cancelIn.notes != null ? String(cancelIn.notes) : undefined,
      raw: cancelIn.raw != null ? String(cancelIn.raw) : undefined,
      windows,
    },
    boxes: {
      hurt: Array.isArray(boxes.hurt) ? boxes.hurt : [],
      hit: Array.isArray(boxes.hit) ? boxes.hit : [],
    },
    clipId: String(o.clipId ?? o.moveId ?? o.id ?? 'idle'),
    facingRelative: o.facingRelative !== false,
    review: (o.review as MoveDefinition['review']) ?? {
      status: 'placeholder',
      notes: '',
    },
    sources: o.sources as MoveDefinition['sources'],
    selfMovement,
    plant,
    animFrameCount,
    glbPath,
    stance,
  };
}

export function cloneMove(m: MoveDefinition): MoveDefinition {
  return structuredClone(m);
}
