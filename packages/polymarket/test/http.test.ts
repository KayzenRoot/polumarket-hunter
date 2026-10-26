import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorMessage, sleep } from '../src/http.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('http helpers', () => {
  it('extracts error messages from unknown values', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('plain')).toBe('plain');
    expect(errorMessage(42)).toBe('42');
  });

  it('sleeps for the requested duration', async () => {
    vi.useFakeTimers();
    const resolved: string[] = [];
    const pending = sleep(250).then(() => resolved.push('done'));
    expect(resolved).toEqual([]);
    await vi.advanceTimersByTimeAsync(249);
    expect(resolved).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(resolved).toEqual(['done']);
  });
});
