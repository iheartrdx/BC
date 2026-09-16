// Append-only, crash-safe run ledger.
//
// The v0.1 extension kept one JSON blob in chrome.storage that every worker
// read, mutated and wrote back whole. With 3 workers that is a lost-update
// race: worker B's write silently discards whatever worker A finished in
// between. Here each record is one line, appended, never rewritten — a torn
// final line is the worst case and is discarded on load.

import { appendFile, readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export class Ledger {
  constructor(file) {
    this.file = file;
    this.records = new Map();
    this.queue = Promise.resolve();
  }

  async load() {
    await mkdir(path.dirname(this.file), { recursive: true });
    if (!existsSync(this.file)) return this;
    const text = await readFile(this.file, 'utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line);
        if (rec && rec.id) this.records.set(String(rec.id), rec);
      } catch {
        // Truncated tail from an interrupted write. The item simply looks
        // unprocessed and gets retried.
      }
    }
    return this;
  }

  has(id) { return this.records.has(String(id)); }
  get(id) { return this.records.get(String(id)); }
  all() { return [...this.records.values()]; }

  /** Serialized so concurrent workers can never interleave a partial line. */
  async put(rec) {
    const record = { ...rec, id: String(rec.id), at: new Date().toISOString() };
    this.records.set(record.id, record);
    this.queue = this.queue.then(() => appendFile(this.file, `${JSON.stringify(record)}\n`));
    return this.queue;
  }

  async flush() { await this.queue; }

  /** Rewrite the ledger with only the current record per id (compaction). */
  async compact() {
    await this.flush();
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, this.all().map((r) => JSON.stringify(r)).join('\n') + '\n');
    await rename(tmp, this.file);
  }
}

/** A mutex that serializes read-modify-write sections within one process. */
export function createMutex() {
  let tail = Promise.resolve();
  return function withLock(fn) {
    const run = tail.then(fn, fn);
    tail = run.then(() => {}, () => {});
    return run;
  };
}
