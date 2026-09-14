import type { FlipbookLayerId } from './types';

/** Static URLs under public/ so Habby ZIP includes every frame (no Vite glob). */
export const FLIPBOOK_PUBLIC_BASE = '/vfx/hit_ref_v1';

/** Keep in sync with app/public/vfx/hit_ref_v1/manifest.json (package:habby verifies). */
const LAYER_FRAME_COUNTS: Record<FlipbookLayerId, number> = {
  E1_core_flash: 10,
  E2_near_sparks: 10,
  E2b_hit_sparks: 12,
  E3_ring_smoke: 14,
  E4_wide_short_smoke: 14,
  E5_narrow_long_smoke: 14,
  E6_narrow_long_smoke_rtl: 14,
  E7_sweat_spray: 16,
  E7b_sweat_scatter: 14,
  E7c_sweat_chunks: 16,
  E8b1_arc_smoke: 12,
  E8b2_arc_smoke: 12,
  E8c1_right_spread_smoke: 28,
  E8c2_right_spread_smoke: 28,
};

function padFrame(i: number): string {
  return String(i).padStart(2, '0');
}

function urlsFor(id: FlipbookLayerId): string[] {
  const n = LAYER_FRAME_COUNTS[id] ?? 0;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(`${FLIPBOOK_PUBLIC_BASE}/${id}/frame-${padFrame(i)}.png`);
  }
  return out;
}

export const FLIPBOOK_SHEETS: Record<FlipbookLayerId, string[]> = {
  E1_core_flash: urlsFor('E1_core_flash'),
  E2_near_sparks: urlsFor('E2_near_sparks'),
  E2b_hit_sparks: urlsFor('E2b_hit_sparks'),
  E3_ring_smoke: urlsFor('E3_ring_smoke'),
  E4_wide_short_smoke: urlsFor('E4_wide_short_smoke'),
  E5_narrow_long_smoke: urlsFor('E5_narrow_long_smoke'),
  E6_narrow_long_smoke_rtl: urlsFor('E6_narrow_long_smoke_rtl'),
  E7_sweat_spray: urlsFor('E7_sweat_spray'),
  E7b_sweat_scatter: urlsFor('E7b_sweat_scatter'),
  E7c_sweat_chunks: urlsFor('E7c_sweat_chunks'),
  E8b1_arc_smoke: urlsFor('E8b1_arc_smoke'),
  E8b2_arc_smoke: urlsFor('E8b2_arc_smoke'),
  E8c1_right_spread_smoke: urlsFor('E8c1_right_spread_smoke'),
  E8c2_right_spread_smoke: urlsFor('E8c2_right_spread_smoke'),
};

export function sheetCount(id: FlipbookLayerId): number {
  return FLIPBOOK_SHEETS[id]?.length ?? 0;
}
