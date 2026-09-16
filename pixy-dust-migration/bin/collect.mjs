#!/usr/bin/env node
// Stage 1 (replacement): collect eBay gallery photo URLs with Playwright.
//
// Why not the Chrome extension: the extension's workers live inside a content
// script on one eBay tab. Navigate that tab, or let Chrome discard it under
// memory pressure, and the whole run dies with no way to resume mid-item —
// which is the documented failure mode of the Android run that stopped around
// item 140. Here the browser is driven from outside, each listing gets its own
// page, and every result is appended to disk the moment it lands.
//
//   node bin/collect.mjs --worklist data/worklist.json --workers 3
//
// First run opens a real Chrome window using a persistent profile directory:
// sign in to eBay once, press Enter, and the session is reused on every later
// run. No credentials ever touch this code.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { Ledger } from '../src/ledger.mjs';
import { dedupeImages } from '../src/ebay-images.mjs';

const argv = process.argv.slice(2);
const arg = (f, d) => { const i = argv.indexOf(f); return i > -1 && argv[i + 1] ? argv[i + 1] : d; };
const flag = (f) => argv.includes(f);

const worklistFile = arg('--worklist', 'data/worklist.json');
const ledgerFile = arg('--ledger', 'data/collect-ledger.jsonl');
const outFile = arg('--out', 'data/photo-map.json');
const profileDir = arg('--profile', 'chrome-profile');
const workers = Math.max(1, Number(arg('--workers', '3')));
const limit = Number(arg('--limit', '0'));
const onlyFailed = flag('--only-failed');
const headless = flag('--headless');

let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  console.error('Playwright is not installed. Run:\n  npm install playwright && npx playwright install chromium');
  process.exit(1);
}

const allIds = JSON.parse(await readFile(worklistFile, 'utf8')).map(String);
const ledger = await new Ledger(ledgerFile).load();

// --only-failed narrows the queue. It does NOT reset the ledger: the v0.1
// extension's "retry failed" button handed a shorter id list to its start()
// routine, which treated a changed list as a brand-new run and wiped every
// result already collected.
let queue = allIds.filter((id) => {
  const rec = ledger.get(id);
  if (onlyFailed) return rec && rec.status !== 'ok';
  return !rec || rec.status !== 'ok';
});
if (limit > 0) queue = queue.slice(0, limit);

console.log(`worklist ${allIds.length} | already ok ${ledger.all().filter((r) => r.status === 'ok').length} | queued ${queue.length}`);
if (!queue.length) { await writeOut(); process.exit(0); }

const ctx = await chromium.launchPersistentContext(path.resolve(profileDir), {
  headless,
  viewport: { width: 1400, height: 1000 },
  args: ['--disable-blink-features=AutomationControlled'],
});

// One-time interactive login. eBay serves a stripped listing page to signed-out
// or suspicious sessions, which is where the "no gallery images" results and
// the Pardon Our Interruption pages came from.
if (!headless) {
  const probe = await ctx.newPage();
  await probe.goto('https://www.ebay.com/mys/home', { waitUntil: 'domcontentloaded' }).catch(() => {});
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question('Sign in to eBay in the browser window if needed, then press Enter to start... ');
  rl.close();
  await probe.close();
}

const GALLERY = [
  '.ux-image-carousel img',
  '.ux-image-carousel-item img',
  '[data-testid="ux-image-carousel"] img',
  '.ux-image-filmstrip-carousel img',
].join(',');

// Deliberately NOT included: '.ux-image-grid img' and generic [data-testid*="gallery"].
// On a listing page those also match the "similar items" and "sponsored"
// carousels, which is how earlier parser versions picked up photos belonging to
// other people's listings.

const ENDED = /(this listing (has ended|was ended)|no longer available|item is out of stock|bidding has ended)/i;
const BLOCKED = /(pardon our interruption|are you a human|unusual traffic|security measure|captcha)/i;

async function collectOne(page, id) {
  const res = await page.goto(`https://www.ebay.com/itm/${id}`, {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });

  const status = res?.status() ?? 0;
  if (status === 404 || status === 410) return { status: 'ended', reason: `http ${status}`, images: [] };

  const title = (await page.title()) || '';
  const bodyText = (await page.evaluate(() => document.body?.innerText?.slice(0, 1500) ?? '')) || '';

  if (BLOCKED.test(`${title} ${bodyText}`)) return { status: 'blocked', reason: 'interruption page', pageTitle: title, images: [] };
  if (ENDED.test(bodyText)) return { status: 'ended', reason: 'listing ended', pageTitle: title, images: [] };

  // Wait for the gallery to actually exist rather than sleeping a fixed 3.2s
  // and hoping. A slow listing used to return zero photos and be recorded as a
  // permanent failure.
  try {
    await page.waitForSelector(GALLERY, { timeout: 15000, state: 'attached' });
  } catch {
    return { status: 'failed', reason: 'no gallery element', pageTitle: title, images: [] };
  }

  // Hovering the filmstrip makes eBay swap in the high-res zoom sources.
  const raw = await page.evaluate((sel) => {
    const urls = [];
    for (const img of document.querySelectorAll(sel)) {
      for (const attr of ['data-zoom-src', 'data-src', 'src']) {
        const v = img.getAttribute(attr);
        if (v) urls.push(v);
      }
    }
    return urls;
  }, GALLERY);

  const images = dedupeImages(raw);
  return images.length
    ? { status: 'ok', pageTitle: title, images }
    : { status: 'failed', reason: 'gallery matched but no usable urls', pageTitle: title, images: [] };
}

let done = 0;
let blockedStreak = 0;
let cursor = 0;
const counts = { ok: 0, failed: 0, ended: 0, blocked: 0 };

async function worker(n) {
  const page = await ctx.newPage();
  // Images are never rendered here, only their URLs read. Blocking the bytes
  // cuts bandwidth by roughly an order of magnitude per listing.
  await page.route('**/*', (route) => {
    const t = route.request().resourceType();
    return t === 'image' || t === 'media' || t === 'font' ? route.abort() : route.continue();
  });

  while (cursor < queue.length) {
    const id = queue[cursor++];
    let out;
    try { out = await collectOne(page, id); }
    catch (err) { out = { status: 'failed', reason: String(err.message).slice(0, 200), images: [] }; }

    // Adaptive backoff: consecutive interruption pages mean eBay is throttling,
    // and hammering harder makes it worse. Back off globally, not per-worker.
    if (out.status === 'blocked') {
      blockedStreak++;
      const wait = Math.min(120000, 5000 * 2 ** Math.min(blockedStreak, 5));
      console.log(`\n  [worker ${n}] interruption page; backing off ${Math.round(wait / 1000)}s`);
      await new Promise((r) => setTimeout(r, wait));
      cursor--; // put the id back — it was never actually attempted
      continue;
    }
    blockedStreak = Math.max(0, blockedStreak - 1);

    await ledger.put({ id, ...out, worker: n });
    counts[out.status] = (counts[out.status] ?? 0) + 1;
    done++;
    process.stdout.write(`\r  ${done}/${queue.length} | ok ${counts.ok} ended ${counts.ended} failed ${counts.failed}   `);

    await new Promise((r) => setTimeout(r, 700 + Math.random() * 900));
  }
  await page.close();
}

await Promise.all(Array.from({ length: workers }, (_, i) => worker(i + 1)));
process.stdout.write('\n');
await ledger.flush();
await ctx.close();
await writeOut();

async function writeOut() {
  const items = ledger.all().map((r) => ({
    ebayItemId: r.id,
    images: r.images ?? [],
    status: r.status,
    pageTitle: r.pageTitle ?? '',
    diagnostic: r.reason ?? '',
  }));
  const payload = {
    version: 2,
    collector: 'playwright-v0.2',
    createdAt: new Date().toISOString(),
    counts: items.reduce((a, i) => ({ ...a, [i.status]: (a[i.status] ?? 0) + 1 }), {}),
    items,
  };
  await writeFile(outFile, JSON.stringify(payload, null, 2));
  console.log(`\nwrote ${outFile} (${items.length} items, ${items.filter((i) => i.status === 'ok').length} with photos)`);
}
