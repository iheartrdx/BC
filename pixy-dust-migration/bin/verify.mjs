#!/usr/bin/env node
// Stage 3: confirm what actually landed in Square.
//
// Reads the live catalog rather than the upload ledger, so a "success" the
// ledger recorded but Square did not keep shows up as a gap.
//
//   SQUARE_ACCESS_TOKEN=... node bin/verify.mjs --reconcile data/reconcile.json

import { readFile, writeFile } from 'node:fs/promises';
import { SquareClient } from '../src/square.mjs';

const argv = process.argv.slice(2);
const arg = (f, d) => { const i = argv.indexOf(f); return i > -1 && argv[i + 1] ? argv[i + 1] : d; };

const reconcileFile = arg('--reconcile', 'data/reconcile.json');
const outFile = arg('--out', 'data/verify.json');

const reconcile = JSON.parse(await readFile(reconcileFile, 'utf8'));
const skus = reconcile.migratable.map((m) => m.sku);

const square = new SquareClient();
console.log(`Checking ${skus.length} Square items...`);
const resolved = await square.resolveSkus(skus, {
  onProgress: (n, t) => process.stdout.write(`\r  ${n}/${t}`),
});
process.stdout.write('\n');

const withImages = [];
const withoutImages = [];
const notFound = [];

for (const sku of skus) {
  const r = resolved.get(sku);
  if (!r) { notFound.push(sku); continue; }
  (r.imageIds.length ? withImages : withoutImages).push({ sku, itemId: r.itemId, images: r.imageIds.length, name: r.name });
}

const totalPhotos = withImages.reduce((n, i) => n + i.images, 0);
console.log('');
console.log(`items with photos       ${withImages.length}`);
console.log(`items still without     ${withoutImages.length}`);
console.log(`SKUs not found in Square ${notFound.length}`);
console.log(`total photos attached   ${totalPhotos}`);

await writeFile(outFile, JSON.stringify({
  generatedAt: new Date().toISOString(),
  counts: { withImages: withImages.length, withoutImages: withoutImages.length, notFound: notFound.length, totalPhotos },
  withoutImages, notFound,
}, null, 2));
console.log(`\nwrote ${outFile}`);
if (withoutImages.length) console.log(`Re-run bin/upload-square.mjs to fill the gaps.`);
