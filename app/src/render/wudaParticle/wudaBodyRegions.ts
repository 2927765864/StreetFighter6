/**
 * Body-region classification for full-body wuda coat quotas.
 * Bone-name rules tuned for SF6 Ryu (C_/L_/R_ skeleton).
 */

export const WUDA_BODY_REGIONS = [
  'head',
  'torso',
  'limbRoot',
  'limbTip',
] as const;

export type WudaBodyRegion = (typeof WUDA_BODY_REGIONS)[number];

export type WudaRegionWeights = Record<WudaBodyRegion, number>;

export const DEFAULT_WUDA_REGION_WEIGHTS: WudaRegionWeights = {
  head: 0.1,
  torso: 0.4,
  limbRoot: 0.25,
  limbTip: 0.25,
};

/** Classify a skeleton bone name into one of four coat regions. */
export function classifyBoneName(name: string): WudaBodyRegion {
  const n = name || '';

  // Distal limbs first — "ForeArm" must not match head rule substring "Ear".
  if (
    /ForeArm|Elbow|Hand|Wrist|Index|Middle|Ring|Pinky|Thumb|Knee|Shin|Calf|Ankle|Foot|Toe|Metatarsal|PantsB|PantsC|PantsShin|Innerfoot|Outerfoot/i.test(
      n,
    )
  ) {
    return 'limbTip';
  }

  // Proximal limbs: upper arms/shoulders + thighs ("四肢根部").
  if (
    /UpperArm|Shoulder|Biceps|Deltoid|Arm_rot|Thigh|Hamstring|PantsA|PantsThigh|Scapula|Hip_HJ|(^|_)L_Hip|(^|_)R_Hip/i.test(
      n,
    )
  ) {
    return 'limbRoot';
  }

  // Head / face / hair. Use token-ish Ear to avoid ForeArm false positive.
  if (
    /Head|Neck|Hair|Face|Jaw|Chin|Nose|Eye|Mouth|Lip|Tongue|Cheek|Temple|Frontalis|Orbicularis|AdamApple|Hairband|hyoid|Procerus|Eyesack|in_lip|out_lip|inside_lip|orbicularis|(^|_)Ear($|_)/i.test(
      n,
    )
  ) {
    return 'head';
  }

  // Torso / waist / belt.
  if (
    /Spine|Abs|Chest|Lung|C_Hip|Obi|Weist|Waist|Pelvis|Eri_|Root|Costume|Body/i.test(
      n,
    )
  ) {
    return 'torso';
  }

  return 'torso';
}

/** Optional mesh-name hint when skin weights are missing / degenerate. */
export function classifyMeshName(name: string): WudaBodyRegion | null {
  const n = name || '';
  if (/Head|Hair|Eye|Mouth|HeadBand|Face/i.test(n)) return 'head';
  if (/Waraji|Shoe|Foot|Glove|Hand/i.test(n)) return 'limbTip';
  if (/Pants|Sleeve|Arm/i.test(n)) return null; // mixed — rely on bones
  if (/Obi|Body|Costume|Cloth|Dougi(?!Pants)/i.test(n)) return 'torso';
  return null;
}

/**
 * Largest-remainder allocation of `count` slots from relative weights.
 * Regions with `available[r] === 0` get 0 and their weight is redistributed.
 */
export function allocateRegionCounts(
  count: number,
  weights: WudaRegionWeights,
  available?: Partial<Record<WudaBodyRegion, number>>,
): WudaRegionWeights {
  const out: WudaRegionWeights = {
    head: 0,
    torso: 0,
    limbRoot: 0,
    limbTip: 0,
  };
  if (count <= 0) return out;

  const usable = WUDA_BODY_REGIONS.filter((r) => {
    const avail = available?.[r];
    if (avail !== undefined && avail <= 0) return false;
    return (weights[r] ?? 0) > 0;
  });
  if (usable.length === 0) {
    // Fall back: dump everything into torso (or first available).
    const fallback =
      WUDA_BODY_REGIONS.find((r) => (available?.[r] ?? 1) > 0) ?? 'torso';
    out[fallback] = count;
    return out;
  }

  let wSum = 0;
  for (const r of usable) wSum += Math.max(0, weights[r] ?? 0);
  if (wSum <= 0) {
    const even = 1 / usable.length;
    for (const r of usable) wSum += even;
  }

  type Entry = { region: WudaBodyRegion; exact: number; n: number };
  const entries: Entry[] = usable.map((r) => {
    const w = Math.max(0, weights[r] ?? 0) / wSum;
    const exact = w * count;
    return { region: r, exact, n: Math.floor(exact) };
  });
  let assigned = entries.reduce((a, e) => a + e.n, 0);
  const rem = [...entries].sort(
    (a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)),
  );
  for (let i = 0; assigned < count && i < rem.length; i++) {
    rem[i]!.n++;
    assigned++;
  }
  for (const e of entries) out[e.region] = e.n;

  // Cap by availability and redistribute leftovers.
  if (available) {
    let leftover = 0;
    for (const r of WUDA_BODY_REGIONS) {
      const cap = available[r];
      if (cap === undefined) continue;
      if (out[r] > cap) {
        leftover += out[r] - cap;
        out[r] = cap;
      }
    }
    if (leftover > 0) {
      const receivers = WUDA_BODY_REGIONS.filter((r) => {
        const cap = available[r];
        if (cap === undefined) return out[r] > 0 || (weights[r] ?? 0) > 0;
        return out[r] < cap;
      });
      let i = 0;
      while (leftover > 0 && receivers.length > 0) {
        const r = receivers[i % receivers.length]!;
        const cap = available[r];
        if (cap === undefined || out[r] < cap) {
          out[r]++;
          leftover--;
        }
        i++;
        if (i > count * 4) break;
      }
      if (leftover > 0) out.torso += leftover;
    }
  }

  return out;
}

export function normalizeRegionWeights(
  weights: Partial<WudaRegionWeights>,
): WudaRegionWeights {
  const raw: WudaRegionWeights = {
    head: Math.max(0, weights.head ?? 0),
    torso: Math.max(0, weights.torso ?? 0),
    limbRoot: Math.max(0, weights.limbRoot ?? 0),
    limbTip: Math.max(0, weights.limbTip ?? 0),
  };
  const sum = raw.head + raw.torso + raw.limbRoot + raw.limbTip;
  if (sum <= 0) return { ...DEFAULT_WUDA_REGION_WEIGHTS };
  return {
    head: raw.head / sum,
    torso: raw.torso / sum,
    limbRoot: raw.limbRoot / sum,
    limbTip: raw.limbTip / sum,
  };
}
