#!/usr/bin/env node
// Stage 2: push the collected eBay photos into Square.
//
// This is the half of the project that did not exist yet. Everything before it
// only produced a JSON map of image URLs; nothing ever put a photo into Square.
//
//   SQUARE_ACCESS_TOKEN=... node bin/upload-square.mjs --map data/photo-map.json
//
// Safe to interrupt and re-run: every (item, photo) pair gets a stable
// idempotency key and is recorded in data/upload-ledger.jsonl, so a resumed
// run re-uploads nothing.

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { SquareClient, sniffImageType } from '../src/square.mjs';
import { Ledger } from '../src/ledger.mjs';
import { renditionFallbacks } from '../src/ebay-images.mjs';

const argv = process.argv.slice(2);
const arg = (f, d) => { const i = argv.indexOf(f); return i > -1 && argv[i + 1] ? argv[i + 1] : d; };
const flag = (f) => argv.includes(f);

const mapFile = arg('--map', 'data/photo-map.json');
const ledgerFile = arg('--ledger', 'data/upload-ledger.jsonl');
const concurrency = Number(arg('--concurrency', '2'));
const maxPhotos = Number(arg('--max-photos', '12'));
const dryRun = flag('--dry-run');
const skipItemsWithImages = !flag('--force');

const map = JSON.parse(await readFile(mapFile, 'utf8'));
const items = (map.items ?? []).filter((i) => i.status === 'ok' && i.images?.length);
if (!items.length) {
  console.error(`No successful items with images in ${mapFile}.`);
  process.exit(1);
}

const square = new SquareClient();
const ledger = await new Ledger(ledgerFile).load();

console.log(`Resolving ${items.length} SKUs against the Square catalog...`);
const skus = items.map((i) => `EB-${i.ebayItemId}`);
const resolved = await square.resolveSkus(skus, {
  onProgress: (n, total) => process.stdout.write(`\r  ${n}/${total}`),
});
process.stdout.write('\n');

const unresolved = skus.filter((s) => !resolved.has(s));
if (unresolved.length) {
  console.log(`WARNING: ${unresolved.length} SKU(s) have no Square item and will be skipped.`);
  console.log(`  e.g. ${unresolved.slice(0, 5).join(', ')}`);
}

/** Download one photo, following eBay's rendition fallbacks. */
async function fetchPhoto(url) {
  for (const candidate of [url, ...renditionFallbacks(url)]) {
    let res;
    try {
      res = await fetch(candidate, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/jpeg,image/png,*/*' },
      });
    } catch { continue; }
    if (!res.ok) continue;
    const bytes = Buffer.from(await res.arrayBuffer());
    const type = sniffImageType(bytes);
    // eBay answers a missing rendition with a placeholder or an HTML page;
    // both would upload "successfully" as a broken catalog image.
    if (!type) continue;
    if (bytes.length < 2048) continue;
    return { bytes, contentType: type, url: candidate };
  }
  return null;
}

let uploaded = 0;
let skipped = 0;
let failed = 0;

async function processItem(item) {
  const sku = `EB-${item.ebayItemId}`;
  const target = resolved.get(sku);
  if (!target) { skipped++; return; }

  if (skipItemsWithImages && target.imageIds.length) {
    await ledger.put({ id: sku, status: 'skipped', reason: 'item already has images', itemId: target.itemId });
    skipped++;
    return;
  }

  const photos = item.images.slice(0, maxPhotos);
  for (let idx = 0; idx < photos.length; idx++) {
    const url = photos[idx];
    // Stable per (item, photo): a resumed run reuses it and Square returns the
    // original image instead of creating a second copy.
    const idempotencyKey = createHash('sha256').update(`${target.itemId}|${url}`).digest('hex').slice(0, 45);
    const ledgerId = `${sku}#${idx}`;
    const prior = ledger.get(ledgerId);
    if (prior?.status === 'ok') continue;

    if (dryRun) {
      console.log(`[dry-run] ${sku} -> ${target.itemId} photo ${idx + 1}/${photos.length}`);
      uploaded++;
      continue;
    }

    const photo = await fetchPhoto(url);
    if (!photo) {
      await ledger.put({ id: ledgerId, status: 'failed', reason: 'photo unreachable', url });
      failed++;
      continue;
    }

    try {
      const res = await square.createCatalogImage({
        itemId: target.itemId,
        bytes: photo.bytes,
        contentType: photo.contentType,
        filename: `${sku}-${idx + 1}.jpg`,
        caption: item.pageTitle?.replace(/\s*\|\s*eBay\s*$/i, '').slice(0, 250) ?? '',
        isPrimary: idx === 0 && target.imageIds.length === 0,
        idempotencyKey,
      });
      await ledger.put({
        id: ledgerId, status: 'ok', itemId: target.itemId,
        imageId: res.image?.id ?? res.catalog_object?.id ?? null, url,
      });
      uploaded++;
    } catch (err) {
      await ledger.put({ id: ledgerId, status: 'failed', reason: String(err.message).slice(0, 300), url });
      failed++;
    }
  }
}

// Bounded worker pool. Square's image endpoint is the slow path; 2 concurrent
// uploads keeps well inside the rate limit while still saturating the link.
let cursor = 0;
await Promise.all(Array.from({ length: Math.max(1, concurrency) }, async () => {
  while (cursor < items.length) {
    const item = items[cursor++];
    const n = cursor;
    await processItem(item);
    process.stdout.write(`\r  ${n}/${items.length} items | ${uploaded} uploaded | ${skipped} skipped | ${failed} failed`);
  }
}));
process.stdout.write('\n');

await ledger.flush();
console.log(`\nDone. uploaded=${uploaded} skipped=${skipped} failed=${failed}`);
console.log(`Ledger: ${ledgerFile}`);
if (failed) console.log(`Re-run the same command to retry only the failures.`);
