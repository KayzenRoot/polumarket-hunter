import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeRecordingLine } from '@polyhunter/core';
import { makeBook } from '@polyhunter/testkit';
import { afterEach, describe, expect, it } from 'vitest';
import { BookRecorder } from '../src/recorder.js';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('book recorder', () => {
  it('writes JSONL books and stops after close', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'polyhunter-recorder-'));
    directories.push(directory);
    const now = Date.UTC(2026, 0, 2, 12, 0, 0);
    const recorder = new BookRecorder(directory, now);
    const book = makeBook();

    recorder.write(book);
    await recorder.close();
    recorder.write(makeBook({ tokenId: 'after-close' }));

    const file = join(directory, 'polyhunter-2026-01-02.jsonl');
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const first = lines[0];
    expect(first).toBeDefined();
    if (first === undefined) {
      throw new Error('expected a recorded line');
    }
    expect(decodeRecordingLine(first)).toEqual(book);
  });

  it('closes idempotently', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'polyhunter-recorder-'));
    directories.push(directory);
    const recorder = new BookRecorder(directory, 1_700_000_000_000);
    await recorder.close();
    await expect(recorder.close()).resolves.toBeUndefined();
  });
});
