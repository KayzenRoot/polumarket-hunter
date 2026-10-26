import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  decodeRecording,
  formatValidationReport,
  validateRecording,
  validateRecordingText,
} from '../src/index.js';

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/recordings/${name}`, import.meta.url), 'utf8');
}

describe('recording validation', () => {
  it('passes a clean recording and reports coverage', () => {
    const report = validateRecordingText(fixture('clean.jsonl'));
    expect(report.ok).toBe(true);
    expect(report.books).toBe(14);
    expect(report.tokens).toBe(2);
    expect(report.markets).toBe(1);
    expect(report.durationMs).toBe(60_000);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.crossedBooks).toBe(0);
    expect(report.coverage.find((token) => token.tokenId === 'yes-token')).toMatchObject({
      marketId: 'market-1',
      outcome: 'YES',
      books: 7,
      maxGapMs: 10_000,
      gaps: 0,
    });
    const text = formatValidationReport(report);
    expect(text).toContain('PASS');
    expect(text).toContain('yes-token');
    expect(text).toContain('Errors: none');
  });

  it('fails a crossed book', () => {
    const report = validateRecordingText(fixture('crossed.jsonl'));
    expect(report.ok).toBe(false);
    expect(report.crossedBooks).toBe(1);
    expect(report.errors.join(' ')).toContain('crossed book');
  });

  it('fails a gap above the hard threshold', () => {
    const report = validateRecordingText(fixture('gap.jsonl'));
    expect(report.ok).toBe(false);
    expect(report.coverage[0]?.maxGapMs).toBe(50_000);
    expect(report.errors.join(' ')).toContain('gap 50000ms exceeds max 30000ms');
  });

  it('allows the same gap when the threshold is raised', () => {
    const report = validateRecordingText(fixture('gap.jsonl'), { maxGapMs: 60_000 });
    expect(report.ok).toBe(true);
    expect(report.warnings.join(' ')).toContain('warning threshold');
  });

  it('fails a backwards timestamp for one token', () => {
    const report = validateRecordingText(fixture('backwards.jsonl'));
    expect(report.ok).toBe(false);
    expect(report.errors.join(' ')).toContain('moved backwards');
    expect(report.outOfOrderBooks).toBe(1);
  });

  it('warns on repeated hashes without failing', () => {
    const report = validateRecordingText(fixture('duplicate.jsonl'));
    expect(report.ok).toBe(true);
    expect(report.duplicateHashes).toBe(6);
    expect(report.warnings.join(' ')).toContain('repeated book hash');
  });

  it('fails a session shorter than the minimum duration', () => {
    const report = validateRecordingText(fixture('short.jsonl'));
    expect(report.ok).toBe(false);
    expect(report.durationMs).toBe(1_000);
    expect(report.errors.join(' ')).toContain('shorter than the 60000ms minimum');
  });

  it('fails malformed lines and out-of-range prices', () => {
    const report = validateRecordingText(fixture('malformed.jsonl'));
    expect(report.ok).toBe(false);
    expect(report.books).toBe(2);
    expect(report.errors.join(' ')).toContain('invalid book recording');
    expect(report.errors.join(' ')).toContain('outside (0, 1)');
  });

  it('fails when an expected token is missing', () => {
    const report = validateRecordingText(fixture('clean.jsonl'), {
      expectedTokens: ['yes-token', 'missing-token'],
    });
    expect(report.ok).toBe(false);
    expect(report.errors.join(' ')).toContain('missing-token');
  });

  it('fails an empty recording', () => {
    const report = validateRecordingText('');
    expect(report.ok).toBe(false);
    expect(report.books).toBe(0);
    expect(report.errors).toContain('recording has no valid books');
  });

  it('is deterministic for the same input', () => {
    const decoded = decodeRecording(fixture('clean.jsonl'));
    expect(validateRecording(decoded)).toEqual(validateRecording(decoded));
  });

  it('formats failures with actionable errors', () => {
    const text = formatValidationReport(validateRecordingText(fixture('crossed.jsonl')));
    expect(text).toContain('FAIL');
    expect(text).toContain('Errors (');
    expect(text).toContain('crossed book');
  });
});
