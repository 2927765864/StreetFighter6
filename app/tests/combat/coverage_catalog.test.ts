import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { RYU_FEEDBACK_MOVE_URLS } from '../../src/combat/move/ryuMoveIds';
import { parseMoveDefinition } from '../../src/combat/move/MoveDefinition';
import { MoveCatalog } from '../../src/combat/move/MoveCatalog';

const coveragePath = resolve(
  __dirname,
  '../../../tools/mmdk_convert/coverage_list.json',
);
const publicRoot = resolve(__dirname, '../../public');

describe('coverage catalog wiring', () => {
  it('all non-deferred coverage ids have public JSON + catalog URL', () => {
    const coverage = JSON.parse(readFileSync(coveragePath, 'utf8')) as {
      moves: { id: string; deferred?: boolean; group?: string }[];
    };
    const required = coverage.moves
      .filter((m) => !m.deferred)
      .map((m) => m.id);

    const catalog = new MoveCatalog();
    for (const url of RYU_FEEDBACK_MOVE_URLS) {
      const rel = url.replace(/^\//, '');
      const path = resolve(publicRoot, rel);
      expect(existsSync(path), `missing file for ${url}`).toBe(true);
      const raw = JSON.parse(readFileSync(path, 'utf8'));
      catalog.register(parseMoveDefinition(raw));
    }

    for (const id of required) {
      // throws already in catalog; all others
      expect(catalog.has(id), `catalog missing ${id}`).toBe(true);
    }
  });
});
