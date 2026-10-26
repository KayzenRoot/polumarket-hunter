import { describe, expect, it } from 'vitest';
import { FeedHealthTracker, percentile } from '../src/index.js';

describe('feed health tracker', () => {
  it('computes nearest-rank percentiles', () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2);
    expect(percentile([1, 2, 3, 4], 0.95)).toBe(4);
    expect(percentile([1, 2, 3, 4], 0)).toBe(1);
    expect(percentile([1, 2, 3, 4], 1)).toBe(4);
    expect(percentile([1, Number.NaN, 3], 0.5)).toBe(1);
  });

  it('tracks gaps, provider latency, ages and coverage', () => {
    const tracker = new FeedHealthTracker({ bookStaleMs: 5000 });
    tracker.recordBook(1000, 900);
    tracker.recordBook(1500, 1400);
    tracker.observe(2000);

    const snapshot = tracker.snapshot(2000);
    expect(snapshot.lastBookAt).toBe(1500);
    expect(snapshot.ageMs).toBe(500);
    expect(snapshot.messageGaps).toBe(1);
    expect(snapshot.gapP50Ms).toBe(500);
    expect(snapshot.providerLatencyP50Ms).toBe(100);
    expect(snapshot.ageP95Ms).toBe(500);
    expect(snapshot.stalePeriods).toBe(0);
  });

  it('records stale periods and closes them on a fresh book', () => {
    const tracker = new FeedHealthTracker({ bookStaleMs: 5000 });
    tracker.recordBook(1000, 1000);
    tracker.observe(7000);
    expect(tracker.snapshot(7000)).toMatchObject({ stalePeriods: 1, staleMs: 0 });

    expect(tracker.snapshot(8000).staleMs).toBe(1000);
    tracker.recordBook(9000, 9000);
    const recovered = tracker.snapshot(9000);
    expect(recovered.stalePeriods).toBe(1);
    expect(recovered.staleMs).toBe(2000);
    expect(recovered.ageMs).toBe(0);
  });

  it('caps the rolling window and resets', () => {
    const tracker = new FeedHealthTracker({ bookStaleMs: 5000, capacity: 2 });
    tracker.recordBook(1000, 1000);
    tracker.recordBook(1100, 1100);
    tracker.recordBook(1200, 1200);
    expect(tracker.snapshot(1200).messageGaps).toBe(2);

    tracker.reset();
    const cleared = tracker.snapshot(1200);
    expect(cleared.lastBookAt).toBeNull();
    expect(cleared.messageGaps).toBe(0);
    expect(cleared.stalePeriods).toBe(0);
  });

  it('clamps clock-skewed provider timestamps to zero', () => {
    const tracker = new FeedHealthTracker({ bookStaleMs: 5000 });
    tracker.recordBook(1000, 1200);
    expect(tracker.snapshot(1000).providerLatencyP50Ms).toBe(0);
  });
});
