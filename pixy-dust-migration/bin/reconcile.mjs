#!/usr/bin/env node
// Reconcile the Square catalog against the current eBay active-listings report.
//
// Run this FIRST, and re-run it before every collection pass. The v0.1 Chrome
// extension hard-coded 424 eBay item numbers into catalog.js; that list starts
// drifting the moment a listing sells or a new one goes up, and a dead listing
// costs three page loads and two backoff sleeps before it gives up.

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadSquareCatalog, loadEbayActive } from '../src/sources.mjs';

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const squareFile = arg('--square');
const ebayFile = arg('--ebay');
const outDir = arg('--out', 'data');

if (!squareFile || !ebayFile) {
  console.error(`usage: node bin/reconcile.mjs --square <catalog.xlsx|csv> --ebay <active-listings.csv|xlsx> [--out data]`);
  process.exit(2);
}

const square = await loadSquareCatalog(squareFile);
const ebay = await loadEbayActive(ebayFile);

const squareByEbayId = new Map(square.filter((s) => s.ebayItemId).map((s) => [s.ebayItemId, s]));
const ebayById = new Map(ebay.map((e) => [e.ebayItemId, e]));

// Items we can actually migrate photos for: a live eBay listing AND a Square item.
const migratable = [...squareByEbayId.keys()]
  .filter((id) => ebayById.has(id))
  .sort()
  .map((id) => ({
    ebayItemId: id,
    sku: squareByEbayId.get(id).sku,
    squareToken: squareByEbayId.get(id).token,
    title: ebayById.get(id).title,
  }));

// Square items whose eBay listing is gone (sold/ended). Their photos are no
// longer fetchable from the live listing page.
const orphanedSquare = [...squareByEbayId.keys()]
  .filter((id) => !ebayById.has(id))
  .sort()
  .map((id) => ({ ebayItemId: id, sku: squareByEbayId.get(id).sku, name: squareByEbayId.get(id).name }));

// Live eBay listings with no Square item at all — these need an item created,
// not just a photo attached.
const missingInSquare = ebay
  .filter((e) => !squareByEbayId.has(e.ebayItemId))
  .sort((a, b) => a.ebayItemId.localeCompare(b.ebayItemId))
  .map((e) => ({ ebayItemId: e.ebayItemId, expectedSku: `EB-${e.ebayItemId}`, title: e.title, price: e.price, quantity: e.quantity }));

const nonEbaySkus = square.filter((s) => !s.ebayItemId).map((s) => s.sku);

const report = {
  generatedAt: new Date().toISOString(),
  sources: { square: path.basename(squareFile), ebay: path.basename(ebayFile) },
  counts: {
    squareItems: square.length,
    squareEbayLinked: squareByEbayId.size,
    squareNonEbaySkus: nonEbaySkus.length,
    ebayActiveListings: ebay.length,
    migratable: migratable.length,
    orphanedSquare: orphanedSquare.length,
    missingInSquare: missingInSquare.length,
  },
  migratable,
  orphanedSquare,
  missingInSquare,
  nonEbaySkus,
};

await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, 'reconcile.json'), JSON.stringify(report, null, 2));
await writeFile(path.join(outDir, 'worklist.json'), JSON.stringify(migratable.map((m) => m.ebayItemId), null, 2));

const c = report.counts;
console.log(`Square items                          ${c.squareItems}`);
console.log(`  linked to an eBay id (EB-*)         ${c.squareEbayLinked}`);
console.log(`  other SKUs                          ${c.squareNonEbaySkus}`);
console.log(`eBay active listings                  ${c.ebayActiveListings}`);
console.log('');
console.log(`MIGRATABLE (live listing + Square item) ${c.migratable}`);
console.log(`ORPHANED   (Square item, listing gone)  ${c.orphanedSquare}`);
console.log(`MISSING    (live listing, no Square)    ${c.missingInSquare}`);
console.log('');
console.log(`wrote ${path.join(outDir, 'reconcile.json')} and ${path.join(outDir, 'worklist.json')}`);
