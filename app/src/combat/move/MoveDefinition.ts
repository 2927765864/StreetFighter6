import type { Box } from '../boxes/Box2D';

/** Half-open action→motion windows (Capcom MotionKey style). */
export type AnimRemapSegment = {
  logicFrom: number;
  logicTo: number;
  motionFrom: number;
  motionTo: number;
};

/**
 * Multi-clip attack timeline (e.g. Tatsumaki start→loop×N→end).
 * Each segment selects a LogicGlbMap role and remaps into that clip.
 */
export type AnimSequenceSegment = AnimRemapSegment & {
  role: string;
};

export type TimedBox = Box & {
  from: number;
  to: number; // inclusive
  part?: 'head' | 'body' | 'leg' | 'extend' | 'unknown';
  /** base = full head+body+leg segment; extend = temporary deform */
  layer?: 'base' | 'extend';
  rectId?: number;
  /** Optional explicit multi-hit index (0-based). */
  hitGroup?: number;
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
  /** Independent contacts this move can land (4HK/6HP = 2). */
  hitCount?: number;
  hitstun: number;
  blockstun: number;
  /**
   * Official Capcom H/M/L: high = both, mid/midHigh = stand only, low = crouch only.
   */
  guard?: 'high' | 'mid' | 'low' | 'midHigh' | 'throw';
  /** HIT_DT _IsStrength / HitmarkStrength → L/M/H 格挡反应轻重。 */
  guardStrength?: 'L' | 'M' | 'H';
  /**
   * Stand-block *animation* height (GRD/DRD letter). Independent of `guard`
   * (Capcom H/M/L). h = 上段, m = 中段, l = 下段. Crouch still uses C/D.
   */
  /** Stand-block anim height; array = per hit group (6MP m then l). */
  guardAnim?: 'h' | 'm' | 'l' | Array<'h' | 'm' | 'l'>;
  /**
   * Ungarded hit *body* height (DMG letter). Independent of guardAnim.
   * 5HP guardAnim=m (block chest) but hitAnim=h (head reel).
   */
  hitAnim?: 'h' | 'm' | 'l' | Array<'h' | 'm' | 'l'>;
  /** DMG suffix st/lt/rt. Default st. 5MP = lt. */
  hitAnimDir?: 'st' | 'lt' | 'rt';
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
  /**
   * LogicGlbMap clip role (default `main`). E.g. hashogeki light/heavy use
   * `variant_l` while medium keeps `main`.
   */
  animRole?: string;
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
  /** HIT_DT MoveTime: frames to finish block MoveDest (not a speed). */
  blockPushMoveTime?: number;
  /** HIT_DT hit-side MoveDest.x × scale. */
  hitPushbackTotal?: number;
  hitPushMoveTime?: number;
  /** Per-frame defender push on hit (logical units). */
  hitPushback?: number[];
  /** stun (default) or grounded knockdown. */
  hitReaction?: 'stun' | 'knockdown';
  /** Contact→canAct frames for knockdown (not hitstun). */
  knockdownFrames?: number;
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
   * Optional Capcom-style action→motion remap (half-open windows).
   * When set, attack/residual scrub samples the shared clip via these segments
   * instead of identity logicFrame→motionFrame.
   */
  animRemap?: AnimRemapSegment[];
  /**
   * Optional multi-clip sequence. When set, takes precedence over `animRemap`
   * and drives `animRole` per logic frame (start/loop/end, etc.).
   */
  animSequence?: AnimSequenceSegment[];
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
  /** Explicit null = no table recovery (jump attacks §3.13.3). */
  const recoveryExplicitNull = framesIn.recovery === null;
  let recovery =
    framesIn.recovery === null || framesIn.recovery === undefined
      ? NaN
      : asNum(framesIn.recovery, NaN);
  let total =
    framesIn.total === null || framesIn.total === undefined
      ? NaN
      : asNum(framesIn.total, NaN);

  if (recoveryExplicitNull) {
    // Jump / until-landing: do not rewrite table total to startup+active.
    recovery = 0;
    if (!Number.isFinite(total)) {
      total = startup + active;
    }
  } else {
    if (!Number.isFinite(recovery) && Number.isFinite(total)) {
      recovery = Math.max(0, total - startup - active);
    }
    if (!Number.isFinite(total)) {
      total = startup + active + (Number.isFinite(recovery) ? recovery : 0);
    }
    if (!Number.isFinite(recovery)) {
      recovery = Math.max(0, total - startup - active);
    }
    // Ground moves: total matches sum
    total = startup + active + recovery;
  }

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
  let blockPushMoveTime: number | undefined;
  if (o.blockPushMoveTime != null && Number.isFinite(Number(o.blockPushMoveTime))) {
    blockPushMoveTime = Math.max(1, Math.floor(Number(o.blockPushMoveTime)));
  }
  let hitPushbackTotal: number | undefined;
  if (o.hitPushbackTotal != null && Number.isFinite(Number(o.hitPushbackTotal))) {
    hitPushbackTotal = Number(o.hitPushbackTotal);
  }
  let hitPushMoveTime: number | undefined;
  if (o.hitPushMoveTime != null && Number.isFinite(Number(o.hitPushMoveTime))) {
    hitPushMoveTime = Math.max(1, Math.floor(Number(o.hitPushMoveTime)));
  }
  let hitPushback: number[] | undefined;
  if (Array.isArray(o.hitPushback)) {
    hitPushback = (o.hitPushback as unknown[]).map((v) => asNum(v, 0));
  }
  const hitReaction: MoveDefinition['hitReaction'] =
    String(o.hitReaction ?? '').toLowerCase() === 'knockdown' ? 'knockdown' : 'stun';
  let knockdownFrames: number | undefined;
  if (o.knockdownFrames != null && Number.isFinite(Number(o.knockdownFrames))) {
    knockdownFrames = Math.max(0, Math.floor(Number(o.knockdownFrames)));
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
        hitGroup:
          b.hitGroup != null && Number.isFinite(Number(b.hitGroup))
            ? Math.floor(Number(b.hitGroup))
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

  let guard: MoveDefinition['guard'] = 'high';
  const gRaw = o.guard != null ? String(o.guard).trim().toLowerCase() : '';
  if (gRaw === 'high' || gRaw === 'h') guard = 'high';
  else if (gRaw === 'mid' || gRaw === 'm') guard = 'mid';
  else if (gRaw === 'low' || gRaw === 'l') guard = 'low';
  else if (gRaw === 'midhigh' || gRaw === 'mid_high') guard = 'midHigh';
  else if (gRaw === 'throw' || gRaw === 't') guard = 'throw';

  let guardStrength: MoveDefinition['guardStrength'];
  const gs = o.guardStrength != null ? String(o.guardStrength).trim().toUpperCase() : '';
  if (gs === 'L' || gs === 'M' || gs === 'H') guardStrength = gs;

  let guardAnim: MoveDefinition['guardAnim'];
  const parseLetter = (v: unknown): 'h' | 'm' | 'l' | undefined => {
    const a = String(v ?? '').trim().toLowerCase();
    if (a === 'h' || a === 'high') return 'h';
    if (a === 'm' || a === 'mid') return 'm';
    if (a === 'l' || a === 'low') return 'l';
    return undefined;
  };
  if (Array.isArray(o.guardAnim)) {
    const list = (o.guardAnim as unknown[]).map(parseLetter).filter(
      (x): x is 'h' | 'm' | 'l' => x != null,
    );
    if (list.length) guardAnim = list;
  } else {
    const one = parseLetter(o.guardAnim);
    if (one) guardAnim = one;
  }

  let hitAnim: MoveDefinition['hitAnim'];
  if (Array.isArray(o.hitAnim)) {
    const list = (o.hitAnim as unknown[]).map(parseLetter).filter(
      (x): x is 'h' | 'm' | 'l' => x != null,
    );
    if (list.length) hitAnim = list;
  } else {
    const one = parseLetter(o.hitAnim);
    if (one) hitAnim = one;
  }
  let hitAnimDir: MoveDefinition['hitAnimDir'];
  const hd = String(o.hitAnimDir ?? '').trim().toLowerCase();
  if (hd === 'st' || hd === 'lt' || hd === 'rt') hitAnimDir = hd;

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

  let animRole: string | undefined;
  if (o.animRole != null && String(o.animRole).trim()) {
    animRole = String(o.animRole).trim();
  }

  let animRemap: AnimRemapSegment[] | undefined;
  if (Array.isArray(o.animRemap)) {
    const parsed: AnimRemapSegment[] = [];
    for (const raw of o.animRemap as unknown[]) {
      if (!raw || typeof raw !== 'object') continue;
      const s = raw as Record<string, unknown>;
      const logicFrom = asNum(s.logicFrom, NaN);
      const logicTo = asNum(s.logicTo, NaN);
      const motionFrom = asNum(s.motionFrom, NaN);
      const motionTo = asNum(s.motionTo, NaN);
      if (
        !Number.isFinite(logicFrom) ||
        !Number.isFinite(logicTo) ||
        !Number.isFinite(motionFrom) ||
        !Number.isFinite(motionTo) ||
        logicTo <= logicFrom
      ) {
        continue;
      }
      parsed.push({ logicFrom, logicTo, motionFrom, motionTo });
    }
    if (parsed.length) animRemap = parsed;
  }

  let animSequence: AnimSequenceSegment[] | undefined;
  if (Array.isArray(o.animSequence)) {
    const parsed: AnimSequenceSegment[] = [];
    for (const raw of o.animSequence as unknown[]) {
      if (!raw || typeof raw !== 'object') continue;
      const s = raw as Record<string, unknown>;
      const role = String(s.role ?? '').trim();
      const logicFrom = asNum(s.logicFrom, NaN);
      const logicTo = asNum(s.logicTo, NaN);
      const motionFrom = asNum(s.motionFrom, NaN);
      const motionTo = asNum(s.motionTo, NaN);
      if (
        !role ||
        !Number.isFinite(logicFrom) ||
        !Number.isFinite(logicTo) ||
        !Number.isFinite(motionFrom) ||
        !Number.isFinite(motionTo) ||
        logicTo <= logicFrom
      ) {
        continue;
      }
      parsed.push({ role, logicFrom, logicTo, motionFrom, motionTo });
    }
    if (parsed.length) animSequence = parsed;
  }

  return {
    id: String(o.id),
    characterId: String(o.characterId ?? 'ryu'),
    moveId: String(o.moveId ?? o.id),
    displayName: String(o.displayName ?? o.moveId ?? o.id),
    frames: { startup, active, recovery, total },
    advantage: { onHit, onBlock },
    damage: asNum(o.damage, 0),
    hitCount:
      o.hitCount != null && Number.isFinite(Number(o.hitCount))
        ? Math.max(1, Math.floor(Number(o.hitCount)))
        : 1,
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
    animRole,
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
    blockPushMoveTime,
    hitPushbackTotal,
    hitPushMoveTime,
    hitPushback,
    hitReaction,
    knockdownFrames,
    plant,
    animFrameCount,
    glbPath,
    animRemap,
    animSequence,
    stance,
    mmdk,
    guard,
    guardStrength,
    guardAnim,
    hitAnim,
    hitAnimDir,
  };
}

export function cloneMove(m: MoveDefinition): MoveDefinition {
  return structuredClone(m);
}

/**
 * Fill animFrameCount / glbPath from logic→glb map when move table omitted them.
 * Needed so attack residual can scrub past logic total (§3.7.1 / §3.13.5).
 */
export function enrichMoveAnimFromMap(
  move: MoveDefinition,
  lookup: {
    primaryPath(id: string): string | null;
    frameCountForRole(id: string, role: string): number | null;
  },
): MoveDefinition {
  const ids = [move.moveId, move.id, move.clipId].filter(Boolean);
  let animFrameCount = move.animFrameCount;
  let glbPath = move.glbPath;
  if (animFrameCount == null || animFrameCount <= 0) {
    for (const id of ids) {
      const n = lookup.frameCountForRole(id, 'main');
      if (n != null && n > 0) {
        animFrameCount = n;
        break;
      }
    }
  }
  if (!glbPath) {
    for (const id of ids) {
      const p = lookup.primaryPath(id);
      if (p) {
        glbPath = p;
        break;
      }
    }
  }
  if (
    (animFrameCount == null || animFrameCount <= 0) &&
    glbPath
  ) {
    const m = /_f(\d+)(?:\.|$)/i.exec(glbPath);
    if (m) animFrameCount = Math.max(1, parseInt(m[1]!, 10));
  }
  if (
    animFrameCount === move.animFrameCount &&
    glbPath === move.glbPath
  ) {
    return move;
  }
  return { ...move, animFrameCount, glbPath };
}
