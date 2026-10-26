import { makeBook } from '@polyhunter/testkit';
import { describe, expect, it } from 'vitest';
import { decodeBook, decodeRecording, decodeRecordingLine, encodeBook } from '../src/index.js';

describe('recording format', () => {
  it('round-trips a book through JSONL', () => {
    const book = makeBook();
    const encoded = encodeBook(book);
    const decoded = decodeRecordingLine(encoded);
    expect(decoded).toEqual(book);
  });

  it('round-trips a 0.001 tick and defaults legacy records to 0.01', () => {
    const book = makeBook({ tickSize: 0.001 });
    expect(decodeRecordingLine(encodeBook(book))?.tickSize).toBe(0.001);

    const legacy = { ...makeBook(), tickSize: undefined };
    expect(decodeBook(legacy)?.tickSize).toBe(0.01);
  });

  it('accepts a raw book object', () => {
    const book = makeBook();
    expect(decodeBook(book)).toEqual(book);
  });

  it('rejects malformed payloads', () => {
    expect(decodeBook(null)).toBeNull();
    expect(decodeBook({ tokenId: 'x' })).toBeNull();
    expect(decodeBook({ ...makeBook(), outcome: 'MAYBE' })).toBeNull();
    expect(decodeBook({ ...makeBook(), bids: [{ price: '0.5', size: 1 }] })).toBeNull();
    expect(decodeRecordingLine('not json')).toBeNull();
  });

  it('reports invalid lines with line numbers', () => {
    const text = `${encodeBook(makeBook())}\nnot json\n${encodeBook(makeBook({ tokenId: 'two' }))}\n`;
    const result = decodeRecording(text);
    expect(result.books).toHaveLength(2);
    expect(result.errors).toEqual(['line 2: invalid book recording']);
  });
});
