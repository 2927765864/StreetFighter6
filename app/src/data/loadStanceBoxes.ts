import type { Box } from '../combat/boxes/Box2D';

export type StanceId = 'stand' | 'crouch' | 'air';

/** Anim role keys for stand ↔ crouch transitions (matches StanceController). */
export type StanceTransitionRole = 'stand_to_crouch' | 'crouch_to_stand';

export type StanceBoxPart = Box & {
  part: 'head' | 'body' | 'leg';
  rectId?: number;
};

export type StancePushBox = Box & {
  rectId?: number;
  fromBody?: boolean;
};

export type StanceEntry = {
  hurt: StanceBoxPart[];
  push: StancePushBox[];
  sourceAction: string;
  placeholder?: boolean;
  notes?: string;
};

/** Timed hurt/push during stand↔crouch transition (ADR-002 local). */
export type StanceTimedBox = Box & {
  from: number;
  to: number; // inclusive
  part?: 'head' | 'body' | 'leg';
  layer?: 'base' | 'extend';
  rectId?: number;
  fromBody?: boolean;
};

export type StanceTransitionEntry = {
  sourceAction: string;
  /** Exclusive end / logic segment length (matches glb frameCount). */
  totalFrames: number;
  hurt: StanceTimedBox[];
  push: StanceTimedBox[];
  notes?: string;
};

export type StanceBoxTable = {
  characterId: string;
  unitScale: number;
  stances: {
    stand: StanceEntry;
    crouch: StanceEntry;
    air?: StanceEntry;
  };
  /** Optional MMDK-sourced transition timelines. */
  transitions?: Partial<Record<StanceTransitionRole, StanceTransitionEntry>>;
  review: { status: string; notes: string };
};

function asNum(v: unknown, d = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

function parsePart(raw: unknown): StanceBoxPart | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const part = o.part;
  if (part !== 'head' && part !== 'body' && part !== 'leg') return null;
  return {
    part,
    x: asNum(o.x),
    y: asNum(o.y),
    w: asNum(o.w),
    h: asNum(o.h),
    rectId: o.rectId != null ? asNum(o.rectId) : undefined,
  };
}

function parsePush(raw: unknown): StancePushBox | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  return {
    x: asNum(o.x),
    y: asNum(o.y),
    w: asNum(o.w),
    h: asNum(o.h),
    rectId: o.rectId != null ? asNum(o.rectId) : undefined,
    fromBody: o.fromBody === true,
  };
}

function parseEntry(raw: unknown, fallbackSource: string): StanceEntry {
  const o = (raw ?? {}) as Record<string, unknown>;
  const hurt = Array.isArray(o.hurt)
    ? (o.hurt.map(parsePart).filter(Boolean) as StanceBoxPart[])
    : [];
  const push = Array.isArray(o.push)
    ? (o.push.map(parsePush).filter(Boolean) as StancePushBox[])
    : [];
  return {
    hurt,
    push,
    sourceAction: o.sourceAction != null ? String(o.sourceAction) : fallbackSource,
    placeholder: o.placeholder === true,
    notes: o.notes != null ? String(o.notes) : undefined,
  };
}

function parseTimedBox(raw: unknown): StanceTimedBox | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const from = asNum(o.from, 0);
  const to = asNum(o.to, from);
  const part = o.part;
  const out: StanceTimedBox = {
    from,
    to: to < from ? from : to,
    x: asNum(o.x),
    y: asNum(o.y),
    w: asNum(o.w),
    h: asNum(o.h),
  };
  if (part === 'head' || part === 'body' || part === 'leg') out.part = part;
  if (o.layer === 'base' || o.layer === 'extend') out.layer = o.layer;
  if (o.rectId != null) out.rectId = asNum(o.rectId);
  if (o.fromBody === true) out.fromBody = true;
  return out;
}

function parseTransition(
  raw: unknown,
  fallbackSource: string,
): StanceTransitionEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const hurt = Array.isArray(o.hurt)
    ? (o.hurt.map(parseTimedBox).filter(Boolean) as StanceTimedBox[])
    : [];
  const push = Array.isArray(o.push)
    ? (o.push.map(parseTimedBox).filter(Boolean) as StanceTimedBox[])
    : [];
  if (!hurt.length) return null;
  const maxTo = hurt.reduce((m, b) => Math.max(m, b.to), 0);
  return {
    sourceAction:
      o.sourceAction != null ? String(o.sourceAction) : fallbackSource,
    totalFrames: Math.max(1, asNum(o.totalFrames, maxTo + 1)),
    hurt,
    push,
    notes: o.notes != null ? String(o.notes) : undefined,
  };
}

export function parseStanceBoxTable(raw: unknown): StanceBoxTable {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid StanceBoxTable JSON');
  }
  const o = raw as Record<string, unknown>;
  const st = (o.stances ?? {}) as Record<string, unknown>;
  const stand = parseEntry(st.stand, 'unknown');
  const crouch = parseEntry(st.crouch, 'unknown');
  const air = st.air ? parseEntry(st.air, 'unknown') : undefined;
  const review = (o.review ?? {}) as Record<string, unknown>;

  const transitions: StanceBoxTable['transitions'] = {};
  const trRaw = (o.transitions ?? {}) as Record<string, unknown>;
  const stc = parseTransition(trRaw.stand_to_crouch, 'BAS_STD_CRH');
  const cts = parseTransition(trRaw.crouch_to_stand, 'BAS_CRH_STD');
  if (stc) transitions.stand_to_crouch = stc;
  if (cts) transitions.crouch_to_stand = cts;

  return {
    characterId: String(o.characterId ?? 'ryu'),
    unitScale: asNum(o.unitScale, 0.01),
    stances: { stand, crouch, air },
    transitions:
      Object.keys(transitions).length > 0 ? transitions : undefined,
    review: {
      status: String(review.status ?? 'unknown'),
      notes: String(review.notes ?? ''),
    },
  };
}

export async function fetchStanceBoxTable(
  url = '/data/systems/ryu_stance_boxes.json',
): Promise<StanceBoxTable> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed ${url}: ${res.status}`);
  return parseStanceBoxTable(await res.json());
}

function timedStackFromStatic(
  hurt: StanceBoxPart[],
  push: StancePushBox[],
  from: number,
  to: number,
): { hurt: StanceTimedBox[]; push: StanceTimedBox[] } {
  return {
    hurt: hurt.map((b) => ({
      from,
      to,
      part: b.part,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      rectId: b.rectId,
      layer: 'base' as const,
    })),
    push: push.map((b) => ({
      from,
      to,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      rectId: b.rectId,
      fromBody: b.fromBody,
    })),
  };
}

/** Minimal fallback if JSON missing (debug only; not a completion path). */
export function fallbackStanceTable(): StanceBoxTable {
  // Approx MMDK bucket-08 + yFit→1.85 (matches model targetHeight)
  const standHurt: StanceBoxPart[] = [
    { part: 'head', x: 0, y: 1.66, w: 0.8, h: 0.38 },
    { part: 'body', x: 0, y: 1.07, w: 0.8, h: 0.94 },
    { part: 'leg', x: 0, y: 0.3, w: 0.8, h: 0.6 },
  ];
  // Under-head push (top ≈ head bottom ~1.47), not full 1.85 stack
  const standPush: StancePushBox[] = [{ x: 0, y: 0.736, w: 0.7, h: 1.471 }];
  const crouchHurt: StanceBoxPart[] = [
    { part: 'head', x: 0, y: 0.95, w: 0.55, h: 0.35 },
    { part: 'body', x: 0, y: 0.55, w: 0.75, h: 0.55 },
    { part: 'leg', x: 0, y: 0.18, w: 0.75, h: 0.36 },
  ];
  const crouchPush: StancePushBox[] = [{ x: 0, y: 0.5, w: 0.7, h: 1.0 }];

  // Mirror MMDK 2-segment pattern: ~4f source posture, then destination.
  const stcEarly = timedStackFromStatic(standHurt, standPush, 0, 3);
  const stcLate = timedStackFromStatic(crouchHurt, crouchPush, 4, 59);
  const ctsEarly = timedStackFromStatic(crouchHurt, crouchPush, 0, 3);
  const ctsLate = timedStackFromStatic(standHurt, standPush, 4, 37);

  return {
    characterId: 'ryu',
    unitScale: 0.01,
    stances: {
      stand: {
        hurt: standHurt,
        push: standPush,
        sourceAction: 'fallback',
      },
      crouch: {
        hurt: crouchHurt,
        push: crouchPush,
        sourceAction: 'fallback',
      },
      air: {
        // MMDK BAS_JUMP_N_AIR: compact BodyList only (not stand head/body/leg)
        hurt: [{ part: 'body', x: 0, y: 1.393, w: 0.8, h: 1.337 }],
        push: [{ x: 0, y: 1.393, w: 0.7, h: 1.337, fromBody: true }],
        sourceAction: 'BAS_JUMP_N_AIR',
      },
    },
    transitions: {
      stand_to_crouch: {
        sourceAction: 'fallback_BAS_STD_CRH',
        totalFrames: 60,
        hurt: [...stcEarly.hurt, ...stcLate.hurt],
        push: [...stcEarly.push, ...stcLate.push],
        notes: 'fallback 2-segment',
      },
      crouch_to_stand: {
        sourceAction: 'fallback_BAS_CRH_STD',
        totalFrames: 38,
        hurt: [...ctsEarly.hurt, ...ctsLate.hurt],
        push: [...ctsEarly.push, ...ctsLate.push],
        notes: 'fallback 2-segment',
      },
    },
    review: { status: 'fallback', notes: 'stance JSON missing' },
  };
}
