import type { Box } from '../boxes/Box2D';

export type TimedBox = Box & {
  from: number;
  to: number; // inclusive
  part?: 'head' | 'body' | 'leg' | 'extend' | 'unknown';
  /** base = full head+body+leg segment; extend = temporary deform */
  layer?: 'base' | 'extend';
  rectId?: number;
};

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
    /** Body thickness; push resolve. Consensus §4.2 */
    push?: TimedBox[];
  };
  clipId: string;
  facingRelative: boolean;
  review: { status: string; notes: string };
  sources?: { name: string; url: string; retrieved: string }[];
  /** Per-logic-frame self X delta (facing-forward +). Consensus §3.10 */
  selfMovement?: number[];
  /** Optional vertical Place component. */
  selfMovementY?: number[];
  /**
   * Action timeline length for boxes / Place (may exceed frames.total).
   * Consensus §3.12 — not the same as canAct total.
   */
  timelineFrames?: number;
  /** Hitstop on block (optional; MatchSim opts fallback). */
  hitstopOnBlock?: number;
  hitstopOnHit?: number;
  /** Per-frame defender pushback on block (logical units). */
  blockPushback?: number[];
  /** Total block pushback if array omitted. */
  blockPushbackTotal?: number;
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
  mmdk?: { actionId?: number; actionName?: string; fabFrame?: number };
};

/** Max frame index covered by timed boxes / movement curves. */
export function inferTimelineFrames(m: {
  frames: { total: number };
  boxes: { hurt?: { to: number }[]; hit?: { to: number }[]; push?: { to: number }[] };
  selfMovement?: number[];
  selfMovementY?: number[];
  timelineFrames?: number;
  animFrameCount?: number;
}): number {
  if (m.timelineFrames != null && Number.isFinite(m.timelineFrames)) {
    return Math.max(1, Math.floor(m.timelineFrames));
  }
  let maxTo = m.frames.total;
  for (const list of [m.boxes.hurt, m.boxes.hit, m.boxes.push]) {
    if (!list) continue;
    for (const b of list) {
      if (typeof b.to === 'number' && b.to + 1 > maxTo) maxTo = b.to + 1;
    }
  }
  if (m.selfMovement && m.selfMovement.length > maxTo) maxTo = m.selfMovement.length;
  if (m.selfMovementY && m.selfMovementY.length > maxTo) maxTo = m.selfMovementY.length;
  return Math.max(1, maxTo);
}

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
    push?: TimedBox[];
  };

  let selfMovement: number[] | undefined;
  if (Array.isArray(o.selfMovement)) {
    selfMovement = (o.selfMovement as unknown[]).map((v) => asNum(v, 0));
  }
  let selfMovementY: number[] | undefined;
  if (Array.isArray(o.selfMovementY)) {
    selfMovementY = (o.selfMovementY as unknown[]).map((v) => asNum(v, 0));
  }

  let blockPushback: number[] | undefined;
  if (Array.isArray(o.blockPushback)) {
    blockPushback = (o.blockPushback as unknown[]).map((v) => asNum(v, 0));
  }
  let blockPushbackTotal: number | undefined;
  if (o.blockPushbackTotal != null && Number.isFinite(Number(o.blockPushbackTotal))) {
    blockPushbackTotal = Number(o.blockPushbackTotal);
  }

  let hitstopOnBlock: number | undefined;
  if (o.hitstopOnBlock != null && Number.isFinite(Number(o.hitstopOnBlock))) {
    hitstopOnBlock = Math.max(0, Math.floor(Number(o.hitstopOnBlock)));
  }
  let hitstopOnHit: number | undefined;
  if (o.hitstopOnHit != null && Number.isFinite(Number(o.hitstopOnHit))) {
    hitstopOnHit = Math.max(0, Math.floor(Number(o.hitstopOnHit)));
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

  const mapTimed = (list: unknown): TimedBox[] => {
    if (!Array.isArray(list)) return [];
    return list.map((raw) => {
      const b = raw as Record<string, unknown>;
      const partRaw = b.part;
      const part =
        partRaw === 'head' ||
        partRaw === 'body' ||
        partRaw === 'leg' ||
        partRaw === 'extend' ||
        partRaw === 'unknown'
          ? partRaw
          : undefined;
      const layer =
        b.layer === 'base' || b.layer === 'extend' ? b.layer : undefined;
      return {
        x: asNum(b.x, 0),
        y: asNum(b.y, 0),
        w: asNum(b.w, 0),
        h: asNum(b.h, 0),
        from: asNum(b.from, 0),
        to: asNum(b.to, 0),
        part,
        layer,
        rectId:
          b.rectId != null && Number.isFinite(Number(b.rectId))
            ? Number(b.rectId)
            : undefined,
      };
    });
  };
  const hurt = mapTimed(boxes.hurt);
  const hit = mapTimed(boxes.hit);
  const push = mapTimed(boxes.push);

  let timelineFrames: number | undefined;
  if (o.timelineFrames != null && Number.isFinite(Number(o.timelineFrames))) {
    timelineFrames = Math.max(1, Math.floor(Number(o.timelineFrames)));
  } else {
    timelineFrames = inferTimelineFrames({
      frames: { total },
      boxes: { hurt, hit, push },
      selfMovement,
      selfMovementY,
      animFrameCount,
    });
  }

  let mmdk: MoveDefinition['mmdk'];
  if (o.mmdk && typeof o.mmdk === 'object') {
    const mm = o.mmdk as Record<string, unknown>;
    mmdk = {
      actionId:
        mm.actionId != null && Number.isFinite(Number(mm.actionId))
          ? Number(mm.actionId)
          : undefined,
      actionName: mm.actionName != null ? String(mm.actionName) : undefined,
      fabFrame:
        mm.fabFrame != null && Number.isFinite(Number(mm.fabFrame))
          ? Number(mm.fabFrame)
          : undefined,
    };
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
      hurt,
      hit,
      push,
    },
    clipId: String(o.clipId ?? o.moveId ?? o.id ?? 'idle'),
    facingRelative: o.facingRelative !== false,
    review: (o.review as MoveDefinition['review']) ?? {
      status: 'placeholder',
      notes: '',
    },
    sources: o.sources as MoveDefinition['sources'],
    selfMovement,
    selfMovementY,
    timelineFrames,
    hitstopOnBlock,
    hitstopOnHit,
    blockPushback,
    blockPushbackTotal,
    plant,
    animFrameCount,
    glbPath,
    stance,
    mmdk,
  };
}

export function cloneMove(m: MoveDefinition): MoveDefinition {
  return structuredClone(m);
}
