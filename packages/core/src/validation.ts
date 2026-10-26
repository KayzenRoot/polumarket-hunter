import { formatDuration } from './format.js';
import { topOfBook } from './orderbook.js';
import { type DecodeResult, decodeRecording } from './recording.js';
import type { OrderBook, Outcome } from './types.js';

export const DEFAULT_RECORDING_VALIDATION = {
  maxGapMs: 30_000,
  gapWarnMs: 10_000,
  minDurationMs: 60_000,
} as const;

export interface RecordingValidationOptions {
  readonly maxGapMs?: number;
  readonly gapWarnMs?: number;
  readonly minDurationMs?: number;
  readonly expectedTokens?: readonly string[];
}

export interface RecordingTokenCoverage {
  readonly tokenId: string;
  readonly marketId: string;
  readonly outcome: Outcome;
  readonly books: number;
  readonly firstAt: number;
  readonly lastAt: number;
  readonly maxGapMs: number;
  readonly gaps: number;
  readonly duplicateHashes: number;
}

export interface RecordingValidationReport {
  readonly ok: boolean;
  readonly books: number;
  readonly tokens: number;
  readonly markets: number;
  readonly startedAt: number | null;
  readonly endedAt: number | null;
  readonly durationMs: number;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly coverage: readonly RecordingTokenCoverage[];
  readonly crossedBooks: number;
  readonly duplicateHashes: number;
  readonly outOfOrderBooks: number;
}

interface TokenState {
  readonly marketId: string;
  readonly outcome: Outcome;
  books: number;
  firstAt: number;
  lastAt: number;
  previousAt: number;
  maxGapMs: number;
  gaps: number;
  lastHash: string | null;
  duplicateHashes: number;
}

const MAX_FINDINGS = 50;

function positive(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return value;
}

function validateLevels(book: OrderBook, label: string, addError: (message: string) => void): void {
  for (const [side, levels] of [
    ['bid', book.bids],
    ['ask', book.asks],
  ] as const) {
    for (const level of levels) {
      if (!Number.isFinite(level.price) || level.price <= 0 || level.price >= 1) {
        addError(`${label}: ${side} price ${level.price} is outside (0, 1)`);
        break;
      }
      if (!Number.isFinite(level.size) || level.size <= 0) {
        addError(`${label}: ${side} size ${level.size} must be positive`);
        break;
      }
    }
  }
}

function createTokenState(book: OrderBook): TokenState {
  return {
    marketId: book.marketId,
    outcome: book.outcome,
    books: 1,
    firstAt: book.timestamp,
    lastAt: book.timestamp,
    previousAt: book.timestamp,
    maxGapMs: 0,
    gaps: 0,
    lastHash: book.hash,
    duplicateHashes: 0,
  };
}

interface GapLimits {
  readonly maxGapMs: number;
  readonly gapWarnMs: number;
}

function updateTokenState(
  existing: TokenState,
  book: OrderBook,
  label: string,
  limits: GapLimits,
  addError: (message: string) => void,
  addWarning: (message: string) => void,
): void {
  if (existing.marketId !== book.marketId) {
    addError(
      `${label}: token is mapped to multiple markets (${existing.marketId}, ${book.marketId})`,
    );
  }
  if (existing.outcome !== book.outcome) {
    addError(`${label}: token outcome changed (${existing.outcome}, ${book.outcome})`);
  }

  const gap = book.timestamp - existing.previousAt;
  if (gap < 0) {
    addError(`${label}: timestamp moved backwards by ${Math.abs(gap)}ms for this token`);
  } else {
    existing.previousAt = book.timestamp;
    existing.maxGapMs = Math.max(existing.maxGapMs, gap);
    if (gap > limits.maxGapMs) {
      existing.gaps += 1;
      addError(`${label}: gap ${gap}ms exceeds max ${limits.maxGapMs}ms`);
    } else if (gap > limits.gapWarnMs) {
      existing.gaps += 1;
      addWarning(`${label}: gap ${gap}ms exceeds warning threshold ${limits.gapWarnMs}ms`);
    }
  }

  existing.books += 1;
  existing.firstAt = Math.min(existing.firstAt, book.timestamp);
  existing.lastAt = Math.max(existing.lastAt, book.timestamp);
  if (book.hash !== null && book.hash === existing.lastHash) {
    existing.duplicateHashes += 1;
  }
  existing.lastHash = book.hash;
}

function bookTopIssue(
  book: OrderBook,
  label: string,
  addError: (message: string) => void,
  addWarning: (message: string) => void,
): boolean {
  const top = topOfBook(book);
  if (top === null) {
    addWarning(`${label}: no two-sided quote`);
    return false;
  }
  if (!top.crossed) {
    return false;
  }
  addError(`${label}: crossed book bid ${top.bid} >= ask ${top.ask}`);
  return true;
}

export function validateRecording(
  decoded: DecodeResult,
  options: RecordingValidationOptions = {},
): RecordingValidationReport {
  const maxGapMs = positive(
    options.maxGapMs ?? DEFAULT_RECORDING_VALIDATION.maxGapMs,
    DEFAULT_RECORDING_VALIDATION.maxGapMs,
  );
  const gapWarnMs = Math.min(
    maxGapMs,
    positive(
      options.gapWarnMs ?? DEFAULT_RECORDING_VALIDATION.gapWarnMs,
      DEFAULT_RECORDING_VALIDATION.gapWarnMs,
    ),
  );
  const minDurationMs = positive(
    options.minDurationMs ?? DEFAULT_RECORDING_VALIDATION.minDurationMs,
    DEFAULT_RECORDING_VALIDATION.minDurationMs,
  );

  const errors: string[] = [];
  const warnings: string[] = [];
  let errorCount = 0;
  let warningCount = 0;
  const addError = (message: string): void => {
    errorCount += 1;
    if (errors.length < MAX_FINDINGS) {
      errors.push(message);
    }
  };
  const addWarning = (message: string): void => {
    warningCount += 1;
    if (warnings.length < MAX_FINDINGS) {
      warnings.push(message);
    }
  };

  for (const lineError of decoded.errors) {
    addError(lineError);
  }
  for (const lineWarning of decoded.warnings) {
    addError(lineWarning);
  }

  const byToken = new Map<string, TokenState>();
  let startedAt: number | null = null;
  let endedAt: number | null = null;
  let previousTimestamp: number | null = null;
  let outOfOrderBooks = 0;
  let crossedBooks = 0;

  decoded.books.forEach((book, index) => {
    const label = `book ${index + 1} (${book.tokenId})`;
    const validTimestamp = Number.isFinite(book.timestamp) && book.timestamp > 0;
    if (validTimestamp) {
      if (previousTimestamp !== null && book.timestamp < previousTimestamp) {
        outOfOrderBooks += 1;
      }
      previousTimestamp = book.timestamp;
      startedAt = startedAt === null ? book.timestamp : Math.min(startedAt, book.timestamp);
      endedAt = endedAt === null ? book.timestamp : Math.max(endedAt, book.timestamp);
    } else {
      addError(`${label}: invalid timestamp ${book.timestamp}`);
    }

    validateLevels(book, label, addError);
    if (bookTopIssue(book, label, addError, addWarning)) {
      crossedBooks += 1;
    }

    if (!validTimestamp) {
      return;
    }

    const existing = byToken.get(book.tokenId);
    if (existing === undefined) {
      byToken.set(book.tokenId, createTokenState(book));
      return;
    }
    updateTokenState(existing, book, label, { maxGapMs, gapWarnMs }, addError, addWarning);
  });

  const coverage: RecordingTokenCoverage[] = [...byToken.entries()]
    .map(([tokenId, state]) => ({
      tokenId,
      marketId: state.marketId,
      outcome: state.outcome,
      books: state.books,
      firstAt: state.firstAt,
      lastAt: state.lastAt,
      maxGapMs: state.maxGapMs,
      gaps: state.gaps,
      duplicateHashes: state.duplicateHashes,
    }))
    .sort((left, right) => left.tokenId.localeCompare(right.tokenId));

  const duplicateHashes = coverage.reduce((sum, token) => sum + token.duplicateHashes, 0);
  if (duplicateHashes > 0) {
    addWarning(
      `${duplicateHashes} repeated book hash(es); confirm they are intentional heartbeats`,
    );
  }
  if (outOfOrderBooks > 0) {
    addWarning(
      `${outOfOrderBooks} book(s) arrived out of global timestamp order; per-token order is checked`,
    );
  }

  const durationMs = startedAt === null || endedAt === null ? 0 : endedAt - startedAt;
  if (decoded.books.length === 0) {
    addError('recording has no valid books');
  }
  if (decoded.books.length > 0 && durationMs < minDurationMs) {
    addError(`session duration ${durationMs}ms is shorter than the ${minDurationMs}ms minimum`);
  }

  const expectedTokens = options.expectedTokens ?? [];
  const missingTokens = expectedTokens.filter((tokenId) => !byToken.has(tokenId));
  if (missingTokens.length > 0) {
    addError(`expected token(s) missing from the recording: ${missingTokens.join(', ')}`);
  }

  if (errorCount > errors.length) {
    errors.push(`${errorCount - errors.length} additional error(s) omitted`);
  }
  if (warningCount > warnings.length) {
    warnings.push(`${warningCount - warnings.length} additional warning(s) omitted`);
  }

  const markets = new Set(coverage.map((token) => token.marketId)).size;

  return {
    ok: errorCount === 0,
    books: decoded.books.length,
    tokens: coverage.length,
    markets,
    startedAt,
    endedAt,
    durationMs,
    errors,
    warnings,
    coverage,
    crossedBooks,
    duplicateHashes,
    outOfOrderBooks,
  };
}

export function validateRecordingText(
  text: string,
  options: RecordingValidationOptions = {},
): RecordingValidationReport {
  return validateRecording(decodeRecording(text), options);
}

export function formatValidationReport(report: RecordingValidationReport): string {
  const lines: string[] = [
    `Recording validation: ${report.ok ? 'PASS' : 'FAIL'}`,
    `Books: ${report.books} across ${report.tokens} token(s) and ${report.markets} market(s)`,
  ];

  if (report.startedAt !== null && report.endedAt !== null) {
    lines.push(
      `Window: ${new Date(report.startedAt).toISOString()} -> ${new Date(report.endedAt).toISOString()} (${formatDuration(report.durationMs)})`,
    );
  }
  lines.push(
    `Crossed books: ${report.crossedBooks}; duplicate hashes: ${report.duplicateHashes}; out-of-order: ${report.outOfOrderBooks}`,
  );

  if (report.coverage.length > 0) {
    lines.push('Coverage:');
    for (const token of report.coverage) {
      lines.push(
        `  ${token.tokenId} [${token.marketId}/${token.outcome}]: ${token.books} book(s), max gap ${formatDuration(token.maxGapMs)}, ${token.gaps} gap finding(s)`,
      );
    }
  }

  if (report.errors.length > 0) {
    lines.push(`Errors (${report.errors.length}):`);
    for (const error of report.errors) {
      lines.push(`  - ${error}`);
    }
  } else {
    lines.push('Errors: none');
  }

  if (report.warnings.length > 0) {
    lines.push(`Warnings (${report.warnings.length}):`);
    for (const warning of report.warnings) {
      lines.push(`  - ${warning}`);
    }
  } else {
    lines.push('Warnings: none');
  }

  return lines.join('\n');
}
