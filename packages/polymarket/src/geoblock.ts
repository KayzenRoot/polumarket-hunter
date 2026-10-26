import { defaultFetch, errorMessage, type FetchLike, type FetchResponse } from './http.js';
import { geoblockSchema } from './schemas.js';
import type { GeoblockResult } from './types.js';

export interface GeoblockOptions {
  readonly url?: string;
  readonly fetchImpl?: FetchLike;
  readonly timeoutMs?: number;
  readonly ttlMs?: number;
  readonly now?: () => number;
}

export const DEFAULT_GEOBLOCK_URL = 'https://polymarket.com/api/geoblock';

export function unknownGeoblock(now: number, reason: string): GeoblockResult {
  return {
    status: 'UNKNOWN',
    blocked: null,
    ip: null,
    country: null,
    region: null,
    checkedAt: now,
    reason,
  };
}

export async function fetchGeoblock(
  fetchImpl: FetchLike,
  url: string,
  timeoutMs: number,
  now: () => number,
): Promise<GeoblockResult> {
  const checkedAt = now();
  let response: FetchResponse;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return unknownGeoblock(checkedAt, `geoblock request failed: ${errorMessage(error)}`);
  }

  if (!response.ok) {
    return unknownGeoblock(checkedAt, `geoblock returned HTTP ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    return unknownGeoblock(checkedAt, `geoblock returned invalid JSON: ${errorMessage(error)}`);
  }

  const parsed = geoblockSchema.safeParse(payload);
  if (!parsed.success) {
    return unknownGeoblock(checkedAt, 'geoblock response is missing the blocked flag');
  }

  const data = parsed.data;
  return {
    status: data.blocked ? 'BLOCKED' : 'ELIGIBLE',
    blocked: data.blocked,
    ip: data.ip ?? null,
    country: data.country ?? null,
    region: data.region ?? null,
    checkedAt,
    reason: data.blocked
      ? `Polymarket reports trading blocked in ${data.country ?? 'this jurisdiction'}`
      : null,
  };
}

export class GeoblockGate {
  private readonly url: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private cached: GeoblockResult | null = null;
  private inFlight: Promise<GeoblockResult> | null = null;

  public constructor(options: GeoblockOptions = {}) {
    this.url = options.url ?? DEFAULT_GEOBLOCK_URL;
    this.fetchImpl = options.fetchImpl ?? defaultFetch();
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.ttlMs = Math.max(0, options.ttlMs ?? 300_000);
    this.now = options.now ?? Date.now;
  }

  public current(): GeoblockResult | null {
    return this.cached;
  }

  public get isEligible(): boolean {
    return this.cached?.status === 'ELIGIBLE';
  }

  public async refresh(): Promise<GeoblockResult> {
    if (this.inFlight !== null) {
      return this.inFlight;
    }
    this.inFlight = fetchGeoblock(this.fetchImpl, this.url, this.timeoutMs, this.now)
      .then((result) => {
        this.cached = result;
        return result;
      })
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }

  public async ensureFresh(): Promise<GeoblockResult> {
    const now = this.now();
    if (this.cached !== null && now - this.cached.checkedAt < this.ttlMs) {
      return this.cached;
    }
    return this.refresh();
  }
}
