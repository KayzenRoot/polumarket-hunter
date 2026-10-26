import type { FeedHealthSnapshot } from './types.js';

export interface FeedHealthTrackerOptions {
  readonly bookStaleMs: number;
  readonly capacity?: number;
}

export function percentile(values: readonly number[], p: number): number | null {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (sorted.length === 0) {
    return null;
  }
  const clamped = Math.min(1, Math.max(0, p));
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(clamped * sorted.length) - 1));
  return Math.round(sorted[index] ?? 0);
}

class Ring {
  private readonly values: number[] = [];
  private next = 0;

  public constructor(private readonly capacity: number) {}

  public push(value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }
    const normalized = Math.max(0, value);
    if (this.values.length < this.capacity) {
      this.values.push(normalized);
      return;
    }
    this.values[this.next] = normalized;
    this.next = (this.next + 1) % this.capacity;
  }

  public list(): readonly number[] {
    return this.values;
  }

  public clear(): void {
    this.values.length = 0;
    this.next = 0;
  }
}

export function emptyFeedHealth(bookStaleMs = 5000): FeedHealthSnapshot {
  return {
    lastBookAt: null,
    ageMs: null,
    ageP50Ms: null,
    ageP95Ms: null,
    ageP99Ms: null,
    bookStaleMs,
    gapP50Ms: null,
    gapP95Ms: null,
    gapP99Ms: null,
    providerLatencyP50Ms: null,
    providerLatencyP95Ms: null,
    providerLatencyP99Ms: null,
    messageGaps: 0,
    stalePeriods: 0,
    staleMs: 0,
  };
}

export class FeedHealthTracker {
  private readonly bookStaleMs: number;
  private readonly gaps: Ring;
  private readonly latencies: Ring;
  private readonly ages: Ring;
  private lastBookAt: number | null = null;
  private staleSince: number | null = null;
  private stalePeriods = 0;
  private staleMs = 0;

  public constructor(options: FeedHealthTrackerOptions) {
    this.bookStaleMs = Math.max(1, options.bookStaleMs);
    this.gaps = new Ring(Math.max(1, options.capacity ?? 512));
    this.latencies = new Ring(Math.max(1, options.capacity ?? 512));
    this.ages = new Ring(Math.max(1, options.capacity ?? 512));
  }

  public get lastBook(): number | null {
    return this.lastBookAt;
  }

  public recordBook(now: number, providerTimestamp: number): void {
    if (!Number.isFinite(now) || now <= 0) {
      return;
    }
    if (this.lastBookAt !== null) {
      this.gaps.push(now - this.lastBookAt);
    }
    this.lastBookAt = now;
    if (Number.isFinite(providerTimestamp) && providerTimestamp > 0) {
      this.latencies.push(now - providerTimestamp);
    }
    if (this.staleSince !== null) {
      this.staleMs += Math.max(0, now - this.staleSince);
      this.staleSince = null;
    }
  }

  public observe(now: number): void {
    if (this.lastBookAt === null || !Number.isFinite(now)) {
      return;
    }
    const age = Math.max(0, now - this.lastBookAt);
    this.ages.push(age);
    if (age > this.bookStaleMs) {
      if (this.staleSince === null) {
        this.staleSince = now;
        this.stalePeriods += 1;
      }
    }
  }

  public snapshot(now: number): FeedHealthSnapshot {
    const ageMs = this.lastBookAt === null ? null : Math.max(0, now - this.lastBookAt);
    const ongoingStale = this.staleSince === null ? 0 : Math.max(0, now - this.staleSince);
    return {
      lastBookAt: this.lastBookAt,
      ageMs,
      ageP50Ms: percentile(this.ages.list(), 0.5),
      ageP95Ms: percentile(this.ages.list(), 0.95),
      ageP99Ms: percentile(this.ages.list(), 0.99),
      bookStaleMs: this.bookStaleMs,
      gapP50Ms: percentile(this.gaps.list(), 0.5),
      gapP95Ms: percentile(this.gaps.list(), 0.95),
      gapP99Ms: percentile(this.gaps.list(), 0.99),
      providerLatencyP50Ms: percentile(this.latencies.list(), 0.5),
      providerLatencyP95Ms: percentile(this.latencies.list(), 0.95),
      providerLatencyP99Ms: percentile(this.latencies.list(), 0.99),
      messageGaps: this.gaps.list().length,
      stalePeriods: this.stalePeriods,
      staleMs: this.staleMs + ongoingStale,
    };
  }

  public reset(): void {
    this.lastBookAt = null;
    this.staleSince = null;
    this.stalePeriods = 0;
    this.staleMs = 0;
    this.gaps.clear();
    this.latencies.clear();
    this.ages.clear();
  }
}
