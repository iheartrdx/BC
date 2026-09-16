#!/usr/bin/env node
// Stage 1 (API route): produce the photo map from GetSellerList.
//
// Drop-in replacement for bin/collect.mjs, emitting the identical
// data/photo-map.json so bin/upload-square.mjs consumes either one. Requires an
// activated production keyset (see bin/ebay-deletion-endpoint.mjs).
//
// Typical run: a few seconds and ~5 API calls, versus ~390 page loads.
//
//   EBAY_AUTH_TOKEN=... node bin/fetch-ebay-photos.mjs

import { writeFile } from 'node:fs/promises';
import { EbayTradingClient } from '../src/ebay-trading.mjs';
import { dedupeImages } from '../src/ebay-images.mjs';

const argv = process.argv.slice(2);
const arg = (f, d) => { const i = argv.indexOf(f); return i > -1 && argv[i + 1] ? argv[i + 1] : d; };

const outFile = arg('--out', 'data/photo-map.json');
const listingsFile = arg('--listings-out', 'data/ebay-listings.json');

const client = new EbayTradingClient();

const items = [];
const listings = [];
let n = 0;

for await (const listing of client.activeListings()) {
  n++;
  process.stdout.write(`\r  ${n} listings`);
  listings.push(listing);
  // Normalize through the same path the scraper used, so both sources produce
  // identical full-size JPEG URLs and the uploader cannot tell them apart.
  const images = dedupeImages(listing.images);
  items.push({
    ebayItemId: listing.ebayItemId,
    images,
    status: images.length ? 'ok' : 'failed',
    pageTitle: listing.title,
    diagnostic: images.length ? '' : 'listing returned no PictureURL',
  });
}
process.stdout.write('\n');

const ok = items.filter((i) => i.status === 'ok');
await writeFile(outFile, JSON.stringify({
  version: 2,
  collector: 'ebay-trading-api-GetSellerList',
  createdAt: new Date().toISOString(),
  counts: { total: items.length, ok: ok.length, failed: items.length - ok.length },
  items,
}, null, 2));
await writeFile(listingsFile, JSON.stringify(listings, null, 2));

console.log(`${items.length} listings, ${ok.length} with photos, ${ok.reduce((a, i) => a + i.images.length, 0)} photos total`);
console.log(`wrote ${outFile} and ${listingsFile}`);
