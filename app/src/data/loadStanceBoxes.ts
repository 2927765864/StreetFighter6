import type { Box } from '../combat/boxes/Box2D';

export type StanceId = 'stand' | 'crouch' | 'air';

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

export type StanceBoxTable = {
  characterId: string;
  unitScale: number;
  stances: {
    stand: StanceEntry;
    crouch: StanceEntry;
    air?: StanceEntry;
  };
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
  return {
    characterId: String(o.characterId ?? 'ryu'),
    unitScale: asNum(o.unitScale, 0.01),
    stances: { stand, crouch, air },
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

/** Minimal fallback if JSON missing (debug only; not a completion path). */
export function fallbackStanceTable(): StanceBoxTable {
  // Approx MMDK bucket-08 + yFit→1.85 (matches model targetHeight)
  const standHurt: StanceBoxPart[] = [
    { part: 'head', x: 0, y: 1.66, w: 0.6, h: 0.38 },
    { part: 'body', x: 0, y: 1.07, w: 0.8, h: 0.94 },
    { part: 'leg', x: 0, y: 0.3, w: 0.8, h: 0.6 },
  ];
  const standPush: StancePushBox[] = [{ x: 0, y: 0.925, w: 0.7, h: 1.85 }];
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
        hurt: [
          { part: 'head', x: 0, y: 0.95, w: 0.55, h: 0.35 },
          { part: 'body', x: 0, y: 0.55, w: 0.75, h: 0.55 },
          { part: 'leg', x: 0, y: 0.18, w: 0.75, h: 0.36 },
        ],
        push: [{ x: 0, y: 0.5, w: 0.7, h: 1.0 }],
        sourceAction: 'fallback',
      },
      air: {
        hurt: standHurt.map((h) =>
          h.part === 'leg' ? { ...h, h: h.h * 0.7, y: h.y * 0.9 } : h,
        ),
        push: standPush,
        sourceAction: 'fallback',
        placeholder: true,
      },
    },
    review: { status: 'fallback', notes: 'stance JSON missing' },
  };
}
