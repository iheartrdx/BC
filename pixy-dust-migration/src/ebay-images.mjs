// eBay image URL handling.
//
// An eBay CDN image lives at
//   https://i.ebayimg.com/images/g/<imageKey>/s-l<size>.<ext>
// where <size> and <ext> are rendition parameters, not identity. Two URLs with
// the same <imageKey> are the same photograph. Dedupe on the key, never on the
// whole URL, or the same photo arrives once per rendition the page emitted.

const HOST = /^https:\/\/i\.ebayimg\.com\//i;
const RENDITION = /\/s-l\d+\.(?:jpg|jpeg|png|webp|avif)$/i;

/** Absolute, query-free, full-size, JPEG-rendition URL — or '' if not an eBay image. */
export function normalizeImageUrl(raw, size = 1600) {
  if (!raw) return '';
  let u = String(raw).trim();
  if (u.startsWith('//')) u = `https:${u}`;
  u = u.split('?')[0].split('#')[0];
  // Thumbnail paths point at the same asset under a different prefix.
  u = u.replace('/thumbs/images/g/', '/images/g/');
  if (!HOST.test(u)) return '';
  if (!RENDITION.test(u)) return '';
  // Square's catalog image endpoint accepts JPEG/PNG/GIF. eBay serves WebP by
  // default to modern browsers but will re-encode any asset to JPEG on request,
  // so ask for .jpg up front instead of transcoding locally.
  return u.replace(RENDITION, `/s-l${size}.jpg`);
}

/** Stable identity of the underlying photo, independent of size/format. */
export function imageKey(url) {
  const m = /\/images\/g\/([^/]+)\//i.exec(url);
  return m ? m[1] : url;
}

/** Dedupe a list of raw URLs into ordered, normalized, full-size JPEG URLs. */
export function dedupeImages(rawUrls, { size = 1600, max = 24 } = {}) {
  const seen = new Set();
  const out = [];
  for (const raw of rawUrls) {
    const url = normalizeImageUrl(raw, size);
    if (!url) continue;
    const k = imageKey(url);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(url);
    if (out.length >= max) break;
  }
  return out;
}

/** Fallback renditions to try if the preferred size 404s. */
export function renditionFallbacks(url) {
  return [1600, 1200, 800, 500].map((s) => url.replace(RENDITION, `/s-l${s}.jpg`));
}
