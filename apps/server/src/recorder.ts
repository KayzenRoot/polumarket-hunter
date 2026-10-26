import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { join } from 'node:path';
import { encodeBook, type OrderBook } from '@polyhunter/core';

export interface BookRecorderLike {
  write(book: OrderBook): void;
  close(): Promise<void>;
}

let sequence = 0;

function fileName(now: number): string {
  sequence += 1;
  const stamp = new Date(now).toISOString().replace(/[:.]/g, '-');
  return `polyhunter-${stamp}-${sequence.toString(36)}.jsonl`;
}

export class BookRecorder implements BookRecorderLike {
  private readonly stream: WriteStream;
  private closed = false;

  public constructor(directory: string, now: number = Date.now()) {
    mkdirSync(directory, { recursive: true });
    this.stream = createWriteStream(join(directory, fileName(now)), { flags: 'wx' });
  }

  public write(book: OrderBook): void {
    if (this.closed) {
      return;
    }
    this.stream.write(`${encodeBook(book)}\n`);
  }

  public close(): Promise<void> {
    if (this.closed) {
      return Promise.resolve();
    }
    this.closed = true;
    return new Promise((resolve) => {
      this.stream.end(resolve);
    });
  }
}
