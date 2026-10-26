import { makeGeoblock } from '@polyhunter/testkit';
import { describe, expect, it } from 'vitest';
import { fetchGeoblock, GeoblockGate } from '../src/index.js';
import { jsonResponse, rejectingFetch, sequenceFetch } from './helpers.js';

describe('geoblock gate', () => {
  it('returns ELIGIBLE only for an explicit blocked=false response', async () => {
    const result = await fetchGeoblock(
      sequenceFetch([jsonResponse(makeGeoblock())]),
      'https://example.test/geoblock',
      1000,
      () => 1_000_000,
    );
    expect(result.status).toBe('ELIGIBLE');
    expect(result.blocked).toBe(false);
    expect(result.country).toBe('PT');
  });

  it('returns BLOCKED for blocked=true', async () => {
    const result = await fetchGeoblock(
      sequenceFetch([jsonResponse(makeGeoblock({ blocked: true, country: 'BR' }))]),
      'https://example.test/geoblock',
      1000,
      () => 1_000_000,
    );
    expect(result.status).toBe('BLOCKED');
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('BR');
  });

  it('fails closed on network errors', async () => {
    const result = await fetchGeoblock(
      rejectingFetch('offline'),
      'https://example.test/geoblock',
      1000,
      () => 1_000_000,
    );
    expect(result.status).toBe('UNKNOWN');
    expect(result.blocked).toBeNull();
    expect(result.reason).toContain('offline');
  });

  it('fails closed on malformed payloads', async () => {
    const result = await fetchGeoblock(
      sequenceFetch([jsonResponse({ country: 'BR' })]),
      'https://example.test/geoblock',
      1000,
      () => 1_000_000,
    );
    expect(result.status).toBe('UNKNOWN');
  });

  it('caches a fresh result and refreshes after the TTL', async () => {
    let now = 1_000_000;
    const fetchImpl = sequenceFetch([
      jsonResponse(makeGeoblock({ blocked: false })),
      jsonResponse(makeGeoblock({ blocked: true })),
    ]);
    const gate = new GeoblockGate({
      url: 'https://example.test/geoblock',
      fetchImpl,
      ttlMs: 1000,
      now: () => now,
    });

    const first = await gate.ensureFresh();
    expect(first.status).toBe('ELIGIBLE');
    expect(fetchImpl.calls).toHaveLength(1);

    now += 500;
    const cached = await gate.ensureFresh();
    expect(cached.status).toBe('ELIGIBLE');
    expect(fetchImpl.calls).toHaveLength(1);

    now += 600;
    const refreshed = await gate.ensureFresh();
    expect(refreshed.status).toBe('BLOCKED');
    expect(fetchImpl.calls).toHaveLength(2);
    expect(gate.isEligible).toBe(false);
  });

  it('deduplicates concurrent refreshes', async () => {
    const fetchImpl = sequenceFetch([jsonResponse(makeGeoblock())]);
    const gate = new GeoblockGate({
      url: 'https://example.test/geoblock',
      fetchImpl,
      ttlMs: 0,
      now: () => 1_000_000,
    });
    const [first, second] = await Promise.all([gate.refresh(), gate.refresh()]);
    expect(first).toBe(second);
    expect(fetchImpl.calls).toHaveLength(1);
  });
});
