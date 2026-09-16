# Pixy Dust Finds — eBay → Square photo migration

Continuation of the ChatGPT session archived as
`Pixy_Dust_eBay_Square_Session_Backup_2026-09-15`. Read
[FINDINGS.md](./FINDINGS.md) for what changed and why.

The pipeline is four commands. Each one is resumable and safe to re-run: state
lives in append-only ledgers under `data/`, so an interrupted run costs at most
one item.

```
reconcile  →  collect  →  upload  →  verify
 (exports)    (photo urls)  (into Square)  (against live catalog)
```

## Setup

```bash
npm install
npx playwright install chromium     # only needed for `collect`
```

## 1. Reconcile

Works out what is actually migratable today. Run this before every collection
pass — the two catalogs drift as things sell.

```bash
npm run reconcile -- \
  --square path/to/MLWDJ1T8KK96P_catalog-YYYY-MM-DD.xlsx \
  --ebay   path/to/eBay-all-active-listings-report-YYYY-MM-DD.csv
```

Writes `data/reconcile.json` (full breakdown) and `data/worklist.json` (just the
ids to collect). Both `.xlsx` and `.csv` are accepted for either input.

Against the archived 09-13 / 09-15 exports:

```
Square items                            424
eBay active listings                    425

MIGRATABLE (live listing + Square item) 390
ORPHANED   (Square item, listing gone)   34
MISSING    (live listing, no Square)     35
```

The 35 `MISSING` listings need Square items created; photos alone will not
cover them. They are listed with title, price and quantity in
`data/reconcile.json` under `missingInSquare`.

## 2. Collect

```bash
npm run collect -- --workers 3            # full worklist
npm run collect -- --workers 3 --limit 15 # controlled first test
npm run collect -- --only-failed          # narrow the queue, keep all results
```

Opens a real Chrome window on a persistent profile (`chrome-profile/`, gitignored).
Sign in to eBay once on the first run and press Enter; the session is reused
afterwards. No credentials are read, stored, or transmitted by this code.

Behaviour worth knowing:

- Image bytes are blocked at the network layer — only URLs are read, so a pass
  uses a fraction of the bandwidth.
- Consecutive interruption pages trigger a global exponential backoff, and the
  listing is returned to the queue rather than recorded as a failure.
- Ended listings are classified `ended`, not `failed`, and are never retried.
- Every result is appended to `data/collect-ledger.jsonl` the moment it lands.

Output: `data/photo-map.json`, same shape as the collector output in the
archive, plus a `counts` block.

### The Chrome extension

`extension-v0.2/` is the v0.1 extension with the defects in FINDINGS.md fixed,
for when driving a separate browser is inconvenient. Its `catalog.js` is
generated, not hand-edited:

```bash
npm run catalog -- --reconcile data/reconcile.json --out extension-v0.2/catalog.js
```

Load unpacked from `chrome://extensions` with Developer mode on. The Playwright
collector is the more reliable path for a long run — the extension's workers
still die with their tab.

## 3. Upload to Square

```bash
export SQUARE_ACCESS_TOKEN=...          # never committed, never logged
npm run upload -- --dry-run             # resolve SKUs, upload nothing
npm run upload
```

Options: `--concurrency 2`, `--max-photos 12`, `--force` (upload even to items
that already have images), `--map data/photo-map.json`.

- SKUs are resolved `EB-<id>` → `ITEM_VARIATION` → parent `ITEM` through the
  Catalog API. The spreadsheet's `Token` column is deliberately not used; on
  some export versions it is the variation token, and images attach to items.
- Each (item, photo) pair gets a deterministic `idempotency_key`, so re-running
  after an interruption uploads nothing twice.
- Downloads are sniffed for a real JPEG/PNG/GIF magic number before upload, and
  fall back through eBay's smaller renditions if the full-size one is missing.
- Items that already have images are skipped unless `--force`.
- 429 and 5xx are retried with backoff honouring `Retry-After`; 4xx is not.

Progress is recorded in `data/upload-ledger.jsonl`.

## 4. Verify

```bash
npm run verify
```

Re-reads the live Square catalog — not the upload ledger — and reports which
items still have no photos, writing the gaps to `data/verify.json`. Re-run
`upload` to fill them.

## Tests

```bash
npm test
```

Offline. Covers CSV parsing against the real quirks of the eBay export, URL
normalization and dedupe, ledger crash-safety and concurrent writes, the claim
mutex, image sniffing, and a regression guard on the v0.1 "retry failed"
data loss.

## Security

- The Square token is read from `SQUARE_ACCESS_TOKEN` only. It is never written
  to `data/`, echoed, or embedded in output.
- Nothing here asks for an eBay password. The collector reuses a browser session
  you established yourself.
- The collector is read-only against eBay: it navigates to listing pages and
  reads gallery URLs. It never edits, ends, relists, bids, or buys.
- `data/` and `chrome-profile/` are gitignored.

## Note on repository placement

This toolkit is self-contained and unrelated to the Barberic Culture Media OS
app in the rest of this repository — it has its own `package.json` and
dependencies, and the root project is untouched. It is here because that is
where the session was opened; moving it to its own repository is a `git mv`.
