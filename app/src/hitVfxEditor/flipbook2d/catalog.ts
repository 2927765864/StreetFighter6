import type { FlipbookLayerId } from './types';

const globE1 = import.meta.glob(
  '../../../../vfx-ai-pipeline/runs/hit_ref_v1/E1_core_flash/frames/frame-*.png',
  { eager: true, query: '?url', import: 'default' },
) as Record<string, string>;
const globE2 = import.meta.glob(
  '../../../../vfx-ai-pipeline/runs/hit_ref_v1/E2_near_sparks/frames/frame-*.png',
  { eager: true, query: '?url', import: 'default' },
) as Record<string, string>;
const globE3 = import.meta.glob(
  '../../../../vfx-ai-pipeline/runs/hit_ref_v1/E3_ring_smoke/frames/frame-*.png',
  { eager: true, query: '?url', import: 'default' },
) as Record<string, string>;
const globE4 = import.meta.glob(
  '../../../../vfx-ai-pipeline/runs/hit_ref_v1/E4_wide_short_smoke/frames/frame-*.png',
  { eager: true, query: '?url', import: 'default' },
) as Record<string, string>;
const globE5 = import.meta.glob(
  '../../../../vfx-ai-pipeline/runs/hit_ref_v1/E5_narrow_long_smoke/frames/frame-*.png',
  { eager: true, query: '?url', import: 'default' },
) as Record<string, string>;
const globE6 = import.meta.glob(
  '../../../../vfx-ai-pipeline/runs/hit_ref_v1/E6_narrow_long_smoke_rtl/frames/frame-*.png',
  { eager: true, query: '?url', import: 'default' },
) as Record<string, string>;

function sortedUrls(map: Record<string, string>): string[] {
  return Object.entries(map)
    .sort(([a], [b]) => {
      const na = Number(/frame-(\d+)/.exec(a)?.[1] ?? 0);
      const nb = Number(/frame-(\d+)/.exec(b)?.[1] ?? 0);
      return na - nb;
    })
    .map(([, url]) => url);
}

export const FLIPBOOK_SHEETS: Record<FlipbookLayerId, string[]> = {
  E1_core_flash: sortedUrls(globE1),
  E2_near_sparks: sortedUrls(globE2),
  E3_ring_smoke: sortedUrls(globE3),
  E4_wide_short_smoke: sortedUrls(globE4),
  E5_narrow_long_smoke: sortedUrls(globE5),
  E6_narrow_long_smoke_rtl: sortedUrls(globE6),
};

export function sheetCount(id: FlipbookLayerId): number {
  return FLIPBOOK_SHEETS[id]?.length ?? 0;
}
