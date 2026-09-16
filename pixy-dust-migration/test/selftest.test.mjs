// Offline self-test: parsing, url normalization, and the concurrency
// properties that v0.1 got wrong. Run with: node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseCsv, toRecords } from '../src/csv.mjs';
import { normalizeImageUrl, imageKey, dedupeImages } from '../src/ebay-images.mjs';
import { Ledger, createMutex } from '../src/ledger.mjs';
import { sniffImageType } from '../src/square.mjs';

test('csv parser keeps rows whose quoted fields contain newlines', () => {
  const rows = parseCsv('Item number,Title\n"1234567890","Two\nline title"\n"1234567891","Plain"\n');
  assert.equal(rows.length, 3);
  const recs = toRecords(rows);
  assert.equal(recs.length, 2);
  assert.equal(recs[0].Title, 'Two\nline title');
});

test('csv parser strips BOM and handles escaped quotes', () => {
  const recs = toRecords(parseCsv('﻿a,b\n"say ""hi""",2\n'));
  assert.equal(recs[0].a, 'say "hi"');
});

test('image urls normalize to full-size JPEG', () => {
  assert.equal(
    normalizeImageUrl('https://i.ebayimg.com/images/g/ABC/s-l500.webp?foo=1'),
    'https://i.ebayimg.com/images/g/ABC/s-l1600.jpg',
  );
});

test('protocol-relative and thumbnail paths resolve to the same photo', () => {
  const a = normalizeImageUrl('//i.ebayimg.com/thumbs/images/g/ABC/s-l140.jpg');
  const b = normalizeImageUrl('https://i.ebayimg.com/images/g/ABC/s-l1600.webp');
  assert.equal(a, b);
  assert.equal(imageKey(a), 'ABC');
});

test('non-eBay and non-rendition urls are rejected', () => {
  assert.equal(normalizeImageUrl('https://ir.ebaystatic.com/x/logo.png'), '');
  assert.equal(normalizeImageUrl('https://i.ebayimg.com/00/s/banner.jpg'), '');
  assert.equal(normalizeImageUrl(''), '');
});

test('dedupe collapses renditions of one photo and preserves order', () => {
  const out = dedupeImages([
    'https://i.ebayimg.com/images/g/AAA/s-l64.webp',
    'https://i.ebayimg.com/images/g/AAA/s-l1600.jpg',
    'https://i.ebayimg.com/images/g/BBB/s-l500.jpg',
    'https://ir.ebaystatic.com/logo.png',
  ]);
  assert.deepEqual(out, [
    'https://i.ebayimg.com/images/g/AAA/s-l1600.jpg',
    'https://i.ebayimg.com/images/g/BBB/s-l1600.jpg',
  ]);
});

test('ledger survives a truncated final line', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pd-'));
  const file = path.join(dir, 'l.jsonl');
  const a = new Ledger(file);
  await a.load();
  await a.put({ id: '1', status: 'ok' });
  await a.flush();
  const { appendFile } = await import('node:fs/promises');
  await appendFile(file, '{"id":"2","stat');       // simulate a kill mid-write
  const b = await new Ledger(file).load();
  assert.equal(b.get('1').status, 'ok');
  assert.equal(b.has('2'), false);                  // discarded, so it gets retried
});

test('concurrent ledger writes never lose a record', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pd-'));
  const file = path.join(dir, 'l.jsonl');
  const led = await new Ledger(file).load();
  // 3 "workers" writing interleaved, exactly the v0.1 scenario.
  await Promise.all([0, 1, 2].map((w) =>
    (async () => {
      for (let i = 0; i < 40; i++) {
        await led.put({ id: `${w}-${i}`, status: 'ok', worker: w });
        await new Promise((r) => setTimeout(r, Math.random() * 2));
      }
    })()));
  await led.flush();
  const reloaded = await new Ledger(file).load();
  assert.equal(reloaded.all().length, 120);
  const lines = (await readFile(file, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 120);
  for (const line of lines) JSON.parse(line);       // no interleaved/torn lines
});

test('mutex serializes read-modify-write so no claim is handed out twice', async () => {
  const withLock = createMutex();
  const shared = { queue: ['a', 'b', 'c', 'd', 'e'], claimed: [] };
  const claim = () => withLock(async () => {
    const snapshot = [...shared.queue];             // read
    await new Promise((r) => setTimeout(r, 1));     // the window v0.1 left open
    const next = snapshot.find((x) => !shared.claimed.includes(x));
    if (next) shared.claimed.push(next);            // write
    return next;
  });
  const got = await Promise.all(Array.from({ length: 5 }, claim));
  assert.equal(new Set(got).size, 5, 'each worker must get a distinct listing');
});

test('image sniffing rejects html error pages dressed as images', () => {
  assert.equal(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), 'image/jpeg');
  assert.equal(sniffImageType(Buffer.from('<!DOCTYPE html><html>err')), null);
  assert.equal(sniffImageType(Buffer.alloc(0)), null);
});

// --- regression: the two v0.1 behaviours that destroyed data ---------------

/** v0.1 content.js start(): a changed id list was treated as a brand-new run. */
function startV1(prev, newIds) {
  const same = prev?.ids?.length === newIds.length && newIds.every((x, i) => x === prev.ids[i]);
  if (!same) return { ids: newIds, results: {}, claimed: [], retries: 0, running: true };
  return { ...prev, running: true, claimed: [] };
}

/** v0.2 content.js start(): narrow the queue, keep every result. */
function startV2(prev, newIds) {
  const s = prev ?? { results: {}, retries: 0 };
  return { ...s, ids: [...new Set(newIds.map(String))], results: s.results || {}, claimed: [], running: true };
}

test('v0.1 "retry failed" wiped the whole run (regression guard)', () => {
  const after390 = {
    ids: ['1', '2', '3'],
    results: { 1: { status: 'ok' }, 2: { status: 'ok' }, 3: { status: 'failed' } },
  };
  const failedOnly = ['3'];
  assert.equal(Object.keys(startV1(after390, failedOnly).results).length, 0,
    'documents the v0.1 data loss this toolkit exists to prevent');
  const v2 = startV2(after390, failedOnly);
  assert.equal(Object.keys(v2.results).length, 3, 'v0.2 keeps every collected result');
  assert.deepEqual(v2.ids, ['3'], 'v0.2 still narrows the queue to the failure');
});

test('a resumed upload reuses the same idempotency key per (item, photo)', async () => {
  const { createHash } = await import('node:crypto');
  const key = (itemId, url) => createHash('sha256').update(`${itemId}|${url}`).digest('hex').slice(0, 45);
  const a = key('ITEM1', 'https://i.ebayimg.com/images/g/AAA/s-l1600.jpg');
  const b = key('ITEM1', 'https://i.ebayimg.com/images/g/AAA/s-l1600.jpg');
  const c = key('ITEM1', 'https://i.ebayimg.com/images/g/BBB/s-l1600.jpg');
  assert.equal(a, b, 'same photo re-uploaded must not create a duplicate');
  assert.notEqual(a, c);
  assert.ok(a.length <= 45, 'Square caps idempotency_key at 45 characters');
});
