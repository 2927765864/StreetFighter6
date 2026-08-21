import { describe, expect, it, vi } from 'vitest';
import {
  baseMoveUrl,
  fetchJsonOptional,
  moveIdFromBaseUrl,
  overrideMoveUrl,
} from '../../src/data/resolveOverrides';

describe('resolveOverrides', () => {
  it('urls and moveIdFromBaseUrl', () => {
    expect(overrideMoveUrl('ryu_5lp')).toBe('/data/overrides/moves/ryu_5lp.json');
    expect(baseMoveUrl('ryu_5lp')).toBe('/data/moves/ryu_5lp.json');
    expect(moveIdFromBaseUrl('/data/moves/ryu_5lp.json')).toBe('ryu_5lp');
  });

  it('fetchJsonOptional returns null on 404', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }));
    expect(await fetchJsonOptional('/x', fetchImpl as unknown as typeof fetch)).toBeNull();
  });

  it('fetchJsonOptional returns null on HTML content-type', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('<!DOCTYPE html><html></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    );
    expect(await fetchJsonOptional('/x', fetchImpl as unknown as typeof fetch)).toBeNull();
  });

  it('fetchJsonOptional parses JSON', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ a: 1 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    expect(await fetchJsonOptional('/x', fetchImpl as unknown as typeof fetch)).toEqual({
      a: 1,
    });
  });
});
