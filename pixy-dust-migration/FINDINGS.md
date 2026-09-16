# Review of the Pixy Dust eBay → Square migration (archive dated 2026-09-15)

Reviewed: `SESSION_ARCHIVE.md`, the v0.1 Chrome extension source, the five
`ebay-photo-map*.json` test outputs, the Square catalog export, and the
eBay active-listings CSV.

The approach in the archive is sound. Rendering the listing in a logged-in
browser and reading the real gallery DOM is the right call, and refusing the
eBay Developer account-deletion compliance path was also right. What follows
are defects in the implementation and one gap in the plan.

---

## 1. The project is missing its second half

Every artifact in the archive produces the same thing: a JSON map of eBay image
URLs. Nothing in the archive puts a photo into Square. `SESSION_ARCHIVE.md` §12
step 12 is *"Feed the final complete photo-map into the Square image-upload
stage"* — that stage does not exist.

It is also the part with real constraints: images attach to a Square
`ITEM`, but SKUs live on `ITEM_VARIATION`, so `EB-<id>` has to be resolved
through `SearchCatalogObjects` and walked up to the parent item. Uploads are
`multipart/form-data` against `/v2/catalog/images` and need a stable
`idempotency_key` per photo or a resumed run silently duplicates every image.

`bin/upload-square.mjs` is that stage.

## 2. Catalog drift — measured, not theorized

`catalog.js` hard-codes 424 eBay item numbers captured on 09-13. Running the
09-13 Square export against the 09-15 eBay active-listings report:

| | count |
|---|---|
| Square items (all `EB-*`) | 424 |
| eBay active listings on 09-15 | **425** |
| Live listing **and** Square item — actually migratable | **390** |
| Square item whose eBay listing is gone | **34** |
| Live eBay listing with no Square item | **35** |

Two days of trading moved 69 items. So:

- 34 of the hard-coded ids are dead listings. Under v0.1 each burns three page
  loads and two backoff sleeps before giving up.
- 35 live listings have no Square item at all. These need items *created*;
  a photo migration will never reach them. This is not in the plan.
- The real target is **390**, not 424.

This also probably explains the "384 rather than 424" from the Android run —
worth re-checking rather than assuming a clipboard truncation.

`bin/reconcile.mjs` computes this from the two exports; `bin/make-catalog.mjs`
regenerates the extension's id list from it, so it can't go stale silently.

## 3. `Retry failed` deletes the entire run — the serious one

`popup.js` hands `start()` a shortened id list. `content.js` `start()`:

```js
let same = s?.ids?.length === newIds.length && newIds.every((x,i) => x === s.ids[i]);
if (!same) s = { ids:newIds, results:{}, ... }   // <-- every result discarded
```

A shorter list is never `same`, so clicking **Retry failed** after a 390-item
run throws away all 390 results and restarts from zero. This is step 11 of the
documented resume plan. Nothing warns, and the state is already overwritten in
`chrome.storage` before the first listing is re-fetched.

Guarded by a regression test in `test/selftest.mjs`.

## 4. The three workers race each other

Every worker does an unguarded read-modify-write of one `chrome.storage` key:

```js
let s = await getState();                         // all 3 read the same snapshot
let pending = s.ids.filter(...);
let id = pending[0];                              // all 3 pick the same listing
s.claimed = [...claims, id]; await save(s);       // last write wins
```

Two consequences, both silent:

- Workers claim and fetch the same listing — wasted requests against the thing
  that is already rate-limiting you.
- `save(s)` writes the **whole** object including a stale `s.results`, so a
  result another worker finished in the interim is erased and the listing is
  re-fetched later.

Since all workers share one JS context, a promise-chain mutex fixes it
completely. v0.2 does that; `test/selftest.mjs` covers both the mutex and the
lost-update case.

## 5. Collected URLs are WebP — Square's image endpoint takes JPEG/PNG/GIF

Every URL in `ebay-photo-map (4).json` ends `.webp`:

```
https://i.ebayimg.com/images/g/rI4AAeSwrjRqKI3W/s-l1600.webp
```

`norm()` preserves whatever extension the page emitted. The whole map would
have had to be re-collected or transcoded at upload time. The fix is one
character in the rewrite — request `s-l1600.jpg`; the extension is a rendition
parameter, not part of the asset identity.

## 6. `sleep(3200)` instead of waiting for the gallery

A listing slower than 3.2s returns zero images and is recorded as a permanent
`failed`. v0.2 polls for the gallery selector up to 20s; the Playwright
collector uses `waitForSelector`.

## 7. The selector list reaches outside the listing

`photos()` includes `.ux-image-grid img` and `[data-testid*="gallery"] img`,
which on a listing page also match the "similar items" and sponsored carousels
— i.e. other sellers' photographs, uploaded to your catalog. §4 of the archive
notes v2 had exactly this problem and it was only partly narrowed. v0.2 scopes
to the main carousel only.

## 8. Ended listings are retried as if they were CAPTCHAs

`load()` only distinguishes `blocked` from `failed`. An ended listing gets the
full interruption retry treatment. With 34 dead ids that is ~102 page loads and
~68 backoff sleeps of pure waste, concentrated at the start of the run where it
also raises your interruption rate.

## 9. The run still dies with the tab

The workers live in a content script on one eBay tab. Navigate it, or let
Chrome discard it under memory pressure, and the run stops — the documented
Android failure at ~item 140, on a machine with 128 GB of RAM. Driving the
browser from outside (`bin/collect.mjs`) removes the failure mode, and the
append-only ledger means an interruption costs at most one listing.

---

## Smaller notes

- `wc -l` on the eBay CSV reports 425 lines for 425 listings + 1 header, because
  some titles contain embedded newlines inside quoted fields. Any line-splitting
  parse of that file is off by one or more. `src/csv.mjs` handles it.
- `photos()` caps at 24 images; eBay allows 24, so that is fine, but Square
  allows fewer per item in practice — `--max-photos` defaults to 12.
- `background.js` reads the whole export through a `FileReader` data URL. At 390
  items that is fine; it would not be at 10×.
- Nothing validates downloaded bytes. eBay answers a missing rendition with an
  HTML page, which uploads "successfully" as a corrupt catalog image.
  `sniffImageType()` checks magic bytes before upload.

## Worth checking before collecting anything

Seller Hub's **File Exchange** listing download is a different report from the
"all active listings" report in the archive, and its template includes a
`PicURL` column. If your account offers it, that is one CSV download instead of
390 page loads. I could not verify it against your account from here — it is
worth two minutes before starting a long run.

---

## Addendum: the eBay API decision is worth revisiting

§3B of the archive abandoned the eBay Trading API because the production keyset
required marketplace account-deletion/closure notification compliance, and §9
records this as protecting the seller account from risk.

That conflates two things. The requirement is on the **developer keyset**. It
carries no seller-account exposure — non-compliance costs API access, nothing
else. And it has two exits, either of which activates the keyset:

- **Opt out.** Toggle "Not persisting eBay data" in the developer portal, pick
  an exemption reason, submit.
- **Subscribe.** Host an HTTPS endpoint that answers a challenge with
  `sha256(challengeCode + verificationToken + endpointUrl)` and accepts
  notifications. Implemented and tested here as
  `bin/ebay-deletion-endpoint.mjs` — about 40 lines.

This matters more than it looks, because the keyset gates `GetSellerList`, which
returns `PictureDetails.PictureURL[]` for every active listing. The whole
collector — mobile bookmarklets v1 through v3.4, the desktop extension, the
Playwright rewrite, the interruption backoff, 390 page loads — exists to
reconstruct data that one paginated API call returns directly, and returns
*correctly*: no similar-items contamination, no missed galleries on slow pages,
no blocked listings, and the 34 ended listings simply are not in the response.

`bin/fetch-ebay-photos.mjs` is that path. It emits the identical
`photo-map.json`, so `upload-square.mjs` consumes either source unchanged.

The scraping tooling stays in the repo as the fallback for anyone who does not
want a developer keyset at all. But it should not be the first choice.
