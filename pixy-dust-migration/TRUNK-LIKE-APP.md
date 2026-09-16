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

### A. A private sync tool for Pixy Dust Finds

Realistic. Single-tenant, one seller, your own credentials, no marketplace
listing, no OAuth consent screen, no support burden.

Shape:

- A small always-on service (a $5–10/mo VPS, or your desktop — it needs uptime,
  not the 5950X).
- `EB-<id>` already links the two catalogs. That work is done.
- **eBay → Square:** eBay Platform Notifications (`ItemSold`,
  `FixedPriceEndOfTransaction`) hit a webhook; look up the SKU; call Square's
  `BatchChangeInventory`.
- **Square → eBay:** Square `inventory.count.updated` webhook; call eBay
  `ReviseInventoryStatus`.
- A reconciliation sweep every few minutes, because webhooks get dropped and a
  missed decrement is an oversell.

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

## Sources

- [Trunk on the Square App Marketplace](https://squareup.com/us/en/app-marketplace/app/trunk)
- [Trunk — eBay and Square inventory syncing](https://www.trunkinventory.com/sync-ebay-square-inventory)
- [Trunk pricing](https://help.trunkinventory.com/en/articles/4680961-what-are-the-pricing-plans)
- [eBay marketplace account deletion/closure notifications](https://developers.ebay.com/marketplace-account-deletion)
- [eBay — Marketplace User Account Deletion guide](https://developer.ebay.com/develop/guides/sell/marketplace-user-account-deletion)
- [eBay Trading API — GetItem / PictureDetails](https://developer.ebay.com/devzone/xml/docs/reference/ebay/types/picturedetailstype.html)
- [Square — Publish your app to the App Marketplace](https://developer.squareup.com/docs/app-marketplace)
- [Square — App Marketplace API usage requirements](https://developer.squareup.com/docs/app-marketplace/requirements)
