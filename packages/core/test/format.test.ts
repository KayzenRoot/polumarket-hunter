import { describe, expect, it } from 'vitest';
import {
  formatCompactUsd,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatPct,
  formatPrice,
  formatSignedPct,
  formatSignedUsd,
  formatTime,
  formatUsd,
  shortToken,
  titleCase,
} from '../src/index.js';

describe('format helpers', () => {
  it('formats USD values and guards non-finite input', () => {
    expect(formatUsd(1234.5)).toBe('$1,234.50');
    expect(formatUsd(Number.NaN)).toBe('—');
    expect(formatSignedUsd(12.3)).toBe('+$12.30');
    expect(formatSignedUsd(-12.3)).toBe('-$12.30');
    expect(formatSignedUsd(0)).toBe('$0.00');
    expect(formatSignedUsd(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatCompactUsd(1_500_000)).toMatch(/\$1\.5M/);
    expect(formatCompactUsd(Number.NaN)).toBe('—');
  });

  it('formats prices, percentages and numbers', () => {
    expect(formatPrice(0.5234)).toBe('0.523');
    expect(formatPrice(Number.NaN)).toBe('—');
    expect(formatPct(0.1234)).toBe('12.34%');
    expect(formatPct(0.1, 0)).toBe('10%');
    expect(formatPct(Number.NaN)).toBe('—');
    expect(formatSignedPct(0.1)).toBe('+10.00%');
    expect(formatSignedPct(-0.1)).toBe('-10.00%');
    expect(formatSignedPct(0)).toBe('0.00%');
    expect(formatSignedPct(Number.NaN)).toBe('—');
    expect(formatNumber(1234.567, 2)).toBe('1,234.57');
    expect(formatNumber(Number.NaN)).toBe('—');
  });

  it('formats time, date and duration', () => {
    expect(formatTime(null)).toBe('—');
    expect(formatTime(1_700_000_000_000)).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime(1_700_000_000_000)).toMatch(/\w{3} \d{2}, \d{2}:\d{2}:\d{2}/);
    expect(formatDuration(3_600_000)).toBe('1h 00m');
    expect(formatDuration(61_000)).toBe('1m 01s');
    expect(formatDuration(5_000)).toBe('5s');
    expect(formatDuration(-1)).toBe('—');
    expect(formatDuration(Number.NaN)).toBe('—');
  });

  it('shortens tokens and title-cases labels', () => {
    expect(shortToken('short')).toBe('short');
    expect(shortToken('123456789012345')).toBe('123456…2345');
    expect(titleCase('micro_maker scalper')).toBe('Micro Maker Scalper');
    expect(titleCase('')).toBe('');
  });
});
