// Minimal Square Catalog API client (fetch only, no SDK).
//
// Auth: SQUARE_ACCESS_TOKEN in the environment. The token is read from the
// process environment and never written to disk, logged, or embedded in output
// files — see the security notes in README.md.

const DEFAULT_BASE = 'https://connect.squareup.com';

export class SquareClient {
  constructor({ token = process.env.SQUARE_ACCESS_TOKEN, base, version = process.env.SQUARE_VERSION } = {}) {
    if (!token) throw new Error('SQUARE_ACCESS_TOKEN is not set.');
    this.token = token;
    this.version = version; // omitted -> Square uses the application's default version
    this.base = base || (process.env.SQUARE_ENV === 'sandbox'
      ? 'https://connect.squareupsandbox.com'
      : DEFAULT_BASE);
  }

  headers(extra = {}) {
    const h = { Authorization: `Bearer ${this.token}`, ...extra };
    if (this.version) h['Square-Version'] = this.version;
    return h;
  }

  async request(method, path, { json, body, headers } = {}) {
    const init = { method, headers: this.headers(headers) };
    if (json !== undefined) {
      init.body = JSON.stringify(json);
      init.headers['Content-Type'] = 'application/json';
    } else if (body !== undefined) {
      init.body = body;
    }
    // Square returns 429 with Retry-After under sustained load, and 5xx is
    // transient. Everything else is a real error and must not be retried
    // blindly — a retried image upload without a fresh idempotency key would
    // be fine, but a retried 400 just burns quota.
    let lastErr;
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await fetch(`${this.base}${path}`, init);
      if (res.ok) return res.json();
      const text = await res.text();
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.min(30000, 2 ** attempt * 1000) + Math.random() * 500;
        lastErr = new Error(`Square ${res.status}: ${text.slice(0, 300)}`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw new Error(`Square ${res.status} ${method} ${path}: ${text.slice(0, 500)}`);
    }
    throw lastErr;
  }

  /**
   * Resolve SKUs to catalog objects.
   *
   * Images attach to the parent ITEM, but SKUs live on ITEM_VARIATION, so this
   * searches variations and walks up to the item via related objects. This is
   * why the uploader does not use the `Token` column from the spreadsheet
   * export: depending on export version that token is the variation, and
   * attaching an image to a variation id fails or silently misfiles it.
   *
   * @returns Map<sku, { itemId, variationId, name, imageIds: string[] }>
   */
  async resolveSkus(skus, { chunkSize = 100, onProgress } = {}) {
    const out = new Map();
    for (let i = 0; i < skus.length; i += chunkSize) {
      const chunk = skus.slice(i, i + chunkSize);
      const body = {
        object_types: ['ITEM_VARIATION'],
        include_related_objects: true,
        query: { set_query: { attribute_name: 'sku', attribute_values: chunk } },
        limit: chunkSize,
      };
      let cursor;
      do {
        const res = await this.request('POST', '/v2/catalog/search', { json: cursor ? { ...body, cursor } : body });
        const items = new Map((res.related_objects ?? [])
          .filter((o) => o.type === 'ITEM')
          .map((o) => [o.id, o]));
        for (const v of res.objects ?? []) {
          const sku = v.item_variation_data?.sku;
          const itemId = v.item_variation_data?.item_id;
          if (!sku || !itemId) continue;
          const item = items.get(itemId);
          out.set(sku, {
            itemId,
            variationId: v.id,
            name: item?.item_data?.name ?? '',
            imageIds: item?.item_data?.image_ids ?? [],
          });
        }
        cursor = res.cursor;
      } while (cursor);
      onProgress?.(Math.min(i + chunkSize, skus.length), skus.length);
    }
    return out;
  }

  /**
   * Upload one image and attach it to a catalog item.
   * `idempotencyKey` must be stable per (item, photo) so a resumed run cannot
   * create a duplicate image for a photo that already landed.
   */
  async createCatalogImage({ itemId, bytes, contentType, filename, caption, isPrimary, idempotencyKey }) {
    const form = new FormData();
    form.append('request', JSON.stringify({
      idempotency_key: idempotencyKey,
      object_id: itemId,
      is_primary: Boolean(isPrimary),
      image: { id: '#pixydust-image', type: 'IMAGE', image_data: { caption: caption ?? '' } },
    }));
    form.append('image_file', new Blob([bytes], { type: contentType }), filename);
    return this.request('POST', '/v2/catalog/images', { body: form });
  }

  async retrieveItem(itemId) {
    return this.request('GET', `/v2/catalog/object/${encodeURIComponent(itemId)}`);
  }
}

/** JPEG/PNG/GIF sniff — Square rejects anything else, and a 0-byte or HTML
 *  error body dressed up as an image is the classic silent corruption. */
export function sniffImageType(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.slice(0, 3).toString('latin1') === 'GIF') return 'image/gif';
  return null;
}
