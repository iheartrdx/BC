# Building a Trunk-like app — what it actually takes

## First, a correction that matters

Trunk syncs **stock quantities** across channels, matched by SKU. It does not
migrate photos, titles or descriptions, and it does not create listings.

So Trunk would not have done the thing this project was for. If you installed it
today, your 424 Square items would still have no photos. The photo migration and
the quantity sync are two different products that happen to share a SKU
convention.

What Trunk *would* give you is the thing you don't have and genuinely need: when
a one-of-a-kind item sells on eBay, Square decrements to zero before someone
buys it at the counter. For a 425-item secondhand shop where nearly everything
is quantity 1, that is the highest-value automation available — every unsynced
minute is a chance to sell the same object twice.

## The gate: eBay API access

Any real sync app needs the eBay API. You cannot do near-real-time quantity sync
by scraping, and you cannot write quantities back at all without it.

The archived session abandoned this path over the marketplace
account-deletion/closure notification requirement. That was based on a
misreading worth correcting:

- It is a requirement on the **developer keyset**, not a risk to the seller
  account. Nothing about it can suspend or penalize a selling account.
- There are two ways to satisfy it. **Subscribe**: host an HTTPS endpoint that
  answers a challenge and accepts notifications. **Opt out**: toggle
  "Not persisting eBay data" in the developer portal and submit an exemption
  request with a reason.
- The subscribe path is implemented and tested in this repo:
  `bin/ebay-deletion-endpoint.mjs`, about 40 lines, 7 tests. It is a single
  serverless function.

The payoff is immediate and large. `GetSellerList` returns
`PictureDetails.PictureURL[]` for every active listing, so the entire scraping
stage — Playwright, hidden iframes, interruption pages, adaptive backoff, 390
page loads — collapses into roughly five API calls. That is
`bin/fetch-ebay-photos.mjs`, which emits the identical `photo-map.json`, so the
Square uploader cannot tell the two sources apart.

Activating the keyset is worth doing **even if you never build the sync app**.

## Two very different products

## Scope note: listing mirror is not the same as quantity sync

Two features get bundled under "sync," and they differ enormously in cost:

| | eBay → Square | Square → eBay |
|---|---|---|
| **Create/update the listing** (photos, title, description, price) | Feasible | Expensive |
| **Sync quantity / retire when sold** | Feasible | Feasible |

The asymmetry is in listing *creation*, and it is not about API difficulty — it
is about data that only exists on one side.

An eBay listing carries everything Square needs: title, description, price,
condition, photos. `GetSellerList` already returns all of it, and
`bin/fetch-ebay-photos.mjs` already writes it to `data/ebay-listings.json`.
Creating the matching Square item is a `CreateCatalogObject` call plus the image
upload this repo already does.

Going the other way, eBay demands a category, the category's *required* item
specifics (which vary per category), a condition ID, and shipping/return/payment
business policies. Square holds none of that. Nothing can infer "Brand: Vera
Bradley, Type: Tumbler, Capacity: 24 oz" from a Square catalog row. Building
Square → eBay listing creation means building a listing composer with
per-category item-specific forms — a bigger project than everything else here
combined.

The practical shape: **eBay is the system of record for listing content, Square
mirrors it. Quantity flows both ways.** That matches how the business already
works — items get listed on eBay first, with the full detail eBay requires.

### A. A private sync tool for Pixy Dust Finds

Realistic. Single-tenant, one seller, your own credentials, no marketplace
listing, no OAuth consent screen, no support burden.

Shape:

- A small always-on service (a $5–10/mo VPS, or your desktop — it needs uptime,
  not the 5950X).
- `EB-<id>` already links the two catalogs. That work is done.
- **New eBay listing → Square item.** eBay's `ItemListed` notification fires
  whenever a seller lists or relists. Pull the item, create the Square catalog
  object with SKU `EB-<id>`, upload the photos. `ItemRevised` fires on edits and
  updates the same item.
- **Sold on eBay → Square.** `ItemSold` / `ItemOutOfStock`; look up the SKU; call
  Square's `BatchChangeInventory`.
- **Sold on Square → eBay.** Square's `inventory.count.updated` webhook; call
  eBay `ReviseInventoryStatus` to set quantity 0.
- A reconciliation sweep every few minutes, because notifications get dropped and
  a missed decrement is an oversell.

**Retire listings by zeroing quantity, not by ending them.** With eBay's
out-of-stock control enabled, a fixed-price GTC listing at quantity 0 stays alive
but hidden: the item ID, watchers, sales history and search standing survive, and
restocking is a single quantity change. `EndFixedPriceItem` is irreversible by
comparison — relisting mints a new item ID, breaks the `EB-<id>` mapping, and
discards the listing's history. A sync bug that zeroes a quantity is an
inconvenience; the same bug wired to `EndFixedPriceItem` destroys listings in
bulk with no undo.

The hard parts are not the API calls:

- **Echo suppression.** Your write to Square fires Square's webhook, which writes
  to eBay, which fires eBay's notification. Without an origin marker you build an
  infinite loop that drains inventory.
- **Concurrent sales.** The same item selling on both channels within a second is
  the case that has to be right, and it is exactly the read-modify-write race
  already found in the v0.1 collector — except here it costs a refund and a
  defect on your seller metrics instead of a re-fetch.
- **Truth on conflict.** When the two disagree, which wins? Answer it once,
  explicitly, and write it down.
- **Failure visibility.** A sync that silently stops is worse than no sync,
  because you stop checking.

Honest estimate: a working two-channel version in a couple of weeks. Trustworthy
enough to stop manually checking, longer — most of that is the edge cases above,
not features.

### B. A published Square App Marketplace app

This is starting a company, not finishing a project. Square requires app-partner
approval before you can publish, OAuth (not personal tokens), and both a
technical and a content review; apps with unresolved bugs go around again. Then
multi-tenant token storage and refresh, per-seller rate limiting, onboarding,
billing, support, and an uptime obligation to strangers whose inventory you are
now responsible for.

And you would be competing with an established product that has already absorbed
years of edge cases, at $35–39/mo.

## What I would actually do

1. **Activate the keyset.** Decide subscribe vs. exemption; the endpoint is
   already written either way.
2. **Get the photos in via the API.** `fetch-ebay-photos` → `upload-square`.
   Probably an afternoon, and it covers the 35 items that have no Square record
   yet.
3. **Then decide on sync, deliberately.** Trunk at ~$35/mo is roughly one
   prevented oversell per month. Run it for a month; you will learn exactly what
   you want from a sync tool, which is far better input than guessing now. If it
   fits, you have your evenings back. If it doesn't, you will know precisely
   where it falls short — and by then the API access and the SKU mapping, the
   two genuinely tedious parts, are already done.

Building it yourself is a fine choice; it is just worth making it because you
want to own it, not because Trunk is presumed not to fit.

## On "real time"

Near-real-time, not instant, and the difference is worth understanding before
you rely on it.

Platform notifications and Square webhooks typically arrive in seconds, but they
are best-effort: they can be delayed, delivered more than once, or dropped
entirely. That is why the reconciliation sweep is not optional polish — it is the
thing that catches the missed decrement before it becomes an oversell.

And for quantity-1 items there is an irreducible race. If someone buys the same
object on eBay and at your counter within the same second, no architecture
prevents it; sync shrinks the window from hours to seconds, it does not close it.
Plan for the rare double-sale as a business process (which channel you honour,
how you apologise), not as a bug to engineer away.

## Sources

- [Trunk on the Square App Marketplace](https://squareup.com/us/en/app-marketplace/app/trunk)
- [Trunk — eBay and Square inventory syncing](https://www.trunkinventory.com/sync-ebay-square-inventory)
- [Trunk pricing](https://help.trunkinventory.com/en/articles/4680961-what-are-the-pricing-plans)
- [eBay marketplace account deletion/closure notifications](https://developers.ebay.com/marketplace-account-deletion)
- [eBay — Marketplace User Account Deletion guide](https://developer.ebay.com/develop/guides/sell/marketplace-user-account-deletion)
- [eBay Trading API — GetItem / PictureDetails](https://developer.ebay.com/devzone/xml/docs/reference/ebay/types/picturedetailstype.html)
- [Square — Publish your app to the App Marketplace](https://developer.squareup.com/docs/app-marketplace)
- [Square — App Marketplace API usage requirements](https://developer.squareup.com/docs/app-marketplace/requirements)
