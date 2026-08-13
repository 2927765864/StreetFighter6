import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Fighter } from '../../src/combat/fighter/Fighter';
import { parseStanceBoxTable } from '../../src/data/loadStanceBoxes';

const stancePath = resolve(
  __dirname,
  '../../public/data/systems/ryu_stance_boxes.json',
);

describe('boxAssembly idle stance', () => {
  it('stand → hurt.length ≥ 3 from stance table', () => {
    const raw = JSON.parse(readFileSync(stancePath, 'utf8'));
    const table = parseStanceBoxTable(raw);
    expect(table.stances.stand.hurt.length).toBeGreaterThanOrEqual(3);
    const parts = new Set(table.stances.stand.hurt.map((h) => h.part));
    expect(parts.has('head')).toBe(true);
    expect(parts.has('body')).toBe(true);
    expect(parts.has('leg')).toBe(true);

    const f = new Fighter('p1', 0, 1, 10000);
    f.setStanceTable(table);
    const hurt = f.worldHurtBoxes(false);
    expect(hurt.length).toBeGreaterThanOrEqual(3);
  });

  it('stand hurt covers feet→head and stays centered on character', () => {
    const raw = JSON.parse(readFileSync(stancePath, 'utf8'));
    const table = parseStanceBoxTable(raw);
    const hurt = table.stances.stand.hurt;
    // Centered: stance locals should not drift to the side (bug: max-area wrong bucket)
    for (const b of hurt) {
      expect(Math.abs(b.x)).toBeLessThanOrEqual(0.15);
    }
    const bots = hurt.map((b) => b.y - b.h / 2);
    const tops = hurt.map((b) => b.y + b.h / 2);
    const minY = Math.min(...bots);
    const maxY = Math.max(...tops);
    // Cover near ground to model head (logicBodyHeight 1.85)
    expect(minY).toBeLessThanOrEqual(0.05);
    expect(maxY).toBeGreaterThanOrEqual(1.8);
    // Each part has usable thickness
    for (const b of hurt) {
      expect(b.h).toBeGreaterThanOrEqual(0.25);
      expect(b.w).toBeGreaterThanOrEqual(0.4);
    }
  });
});
