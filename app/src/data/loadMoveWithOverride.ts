import {
  parseMoveDefinition,
  type MoveDefinition,
} from '../combat/move/MoveDefinition';
import { canonicalizeMoveDefinition } from '../combat/move/ryuMoveIds';
import {
  fetchStanceBoxTable,
  parseStanceBoxTable,
  type StanceBoxTable,
} from './loadStanceBoxes';
import {
  baseMoveUrl,
  fetchJsonOptional,
  moveIdFromBaseUrl,
  overrideMoveUrl,
  overrideStanceUrl,
} from './resolveOverrides';

export async function loadMoveDefinitionResolved(
  moveId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ def: MoveDefinition; fromOverride: boolean }> {
  const o = await fetchJsonOptional(overrideMoveUrl(moveId), fetchImpl);
  if (o) {
    return {
      def: canonicalizeMoveDefinition(parseMoveDefinition(o)),
      fromOverride: true,
    };
  }
  const b = await fetchJsonOptional(baseMoveUrl(moveId), fetchImpl);
  if (!b) {
    throw new Error(`Move not found: ${moveId}`);
  }
  return {
    def: canonicalizeMoveDefinition(parseMoveDefinition(b)),
    fromOverride: false,
  };
}

/** Prefer override for a catalog base URL; fall back to base. */
export async function fetchMoveRawResolved(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ raw: unknown; fromOverride: boolean; moveId: string | null }> {
  const moveId = moveIdFromBaseUrl(baseUrl);
  if (moveId) {
    const o = await fetchJsonOptional(overrideMoveUrl(moveId), fetchImpl);
    if (o) return { raw: o, fromOverride: true, moveId };
  }
  const b = await fetchJsonOptional(baseUrl, fetchImpl);
  if (b == null) {
    // last chance: throw like old fetch
    const res = await fetchImpl(baseUrl);
    if (!res.ok) throw new Error(`Failed ${baseUrl}: ${res.status}`);
    return { raw: await res.json(), fromOverride: false, moveId };
  }
  return { raw: b, fromOverride: false, moveId };
}

export async function loadStanceTableResolved(
  fetchImpl: typeof fetch = fetch,
): Promise<{ table: StanceBoxTable; fromOverride: boolean }> {
  const o = await fetchJsonOptional(overrideStanceUrl(), fetchImpl);
  if (o) {
    return { table: parseStanceBoxTable(o), fromOverride: true };
  }
  const table = await fetchStanceBoxTable();
  return { table, fromOverride: false };
}
