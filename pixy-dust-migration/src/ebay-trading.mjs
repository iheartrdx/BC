// eBay Trading API client — just enough for GetSellerList.
//
// Once the production keyset is activated, this replaces the entire scraping
// stage: GetSellerList returns PictureDetails.PictureURL[] for every active
// listing, so all ~425 galleries arrive in a handful of paginated calls
// instead of 390 browser page loads with backoff and interruption pages.

import { XMLParser } from 'fast-xml-parser';

const ENDPOINT = 'https://api.ebay.com/ws/api.dll';
const COMPAT_LEVEL = '1193';

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  // PictureURL is a repeated element; a single-photo listing must still parse
  // as an array or the first photo silently becomes a bare string.
  isArray: (name) => ['Item', 'PictureURL'].includes(name),
});

function xmlEscape(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

export class EbayTradingClient {
  constructor({
    authToken = process.env.EBAY_AUTH_TOKEN,
    oauthToken = process.env.EBAY_OAUTH_TOKEN,
    appId = process.env.EBAY_APP_ID,
    devId = process.env.EBAY_DEV_ID,
    certId = process.env.EBAY_CERT_ID,
    siteId = process.env.EBAY_SITE_ID ?? '0',
  } = {}) {
    if (!authToken && !oauthToken) {
      throw new Error('Set EBAY_AUTH_TOKEN (Auth’n’Auth) or EBAY_OAUTH_TOKEN.');
    }
    Object.assign(this, { authToken, oauthToken, appId, devId, certId, siteId });
  }

  async call(callName, innerXml) {
    const credentials = this.authToken
      ? `<RequesterCredentials><eBayAuthToken>${xmlEscape(this.authToken)}</eBayAuthToken></RequesterCredentials>`
      : '';
    const body = `<?xml version="1.0" encoding="utf-8"?>
<${callName}Request xmlns="urn:ebay:apis:eBLBaseComponents">
${credentials}
${innerXml}
</${callName}Request>`;

    const headers = {
      'Content-Type': 'text/xml',
      'X-EBAY-API-CALL-NAME': callName,
      'X-EBAY-API-COMPATIBILITY-LEVEL': COMPAT_LEVEL,
      'X-EBAY-API-SITEID': String(this.siteId),
    };
    if (this.oauthToken) headers['X-EBAY-API-IAF-TOKEN'] = this.oauthToken;
    if (this.appId) headers['X-EBAY-API-APP-NAME'] = this.appId;
    if (this.devId) headers['X-EBAY-API-DEV-NAME'] = this.devId;
    if (this.certId) headers['X-EBAY-API-CERT-NAME'] = this.certId;

    const res = await fetch(ENDPOINT, { method: 'POST', headers, body });
    const text = await res.text();
    const parsed = parser.parse(text)?.[`${callName}Response`];
    if (!parsed) throw new Error(`Unparseable ${callName} response: ${text.slice(0, 400)}`);

    if (parsed.Ack === 'Failure') {
      const errors = [].concat(parsed.Errors ?? []);
      const msg = errors.map((e) => `${e.ErrorCode}: ${e.LongMessage ?? e.ShortMessage}`).join('; ');
      // 21917053 / keyset-disabled errors are the account-deletion compliance
      // gate — see bin/ebay-deletion-endpoint.mjs.
      throw new Error(`${callName} failed — ${msg || text.slice(0, 400)}`);
    }
    return parsed;
  }

  /**
   * All currently-active listings with their photo URLs.
   *
   * GetSellerList requires a <=120-day time window. Filtering on *end* time
   * from now forward is the reliable way to get "everything active": a GTC
   * listing's start date can be years back, but its end date is always near.
   */
  async *activeListings({ perPage = 100, windowDays = 119 } = {}) {
    const now = new Date();
    const until = new Date(now.getTime() + windowDays * 86400000);
    let page = 1;
    let totalPages = 1;

    do {
      const res = await this.call('GetSellerList', `
<EndTimeFrom>${now.toISOString()}</EndTimeFrom>
<EndTimeTo>${until.toISOString()}</EndTimeTo>
<GranularityLevel>Medium</GranularityLevel>
<DetailLevel>ReturnAll</DetailLevel>
<IncludeWatchCount>false</IncludeWatchCount>
<Pagination><EntriesPerPage>${perPage}</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination>`);

      totalPages = Number(res.PaginationResult?.TotalNumberOfPages ?? 1);
      for (const item of res.ItemArray?.Item ?? []) {
        yield {
          ebayItemId: String(item.ItemID),
          title: item.Title ?? '',
          sku: item.SKU ?? '',
          quantity: Number(item.Quantity ?? 0) - Number(item.SellingStatus?.QuantitySold ?? 0),
          price: item.SellingStatus?.CurrentPrice?.['#text'] ?? '',
          images: item.PictureDetails?.PictureURL ?? [],
        };
      }
      page++;
    } while (page <= totalPages);
  }
}
