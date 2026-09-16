// Pixy Dust eBay Photo Collector — content script, v0.2
//
// Changes from v0.1, all of which were data-integrity bugs:
//
//  1. All workers share one JS context but each did an unguarded
//     read-modify-write of the whole chrome.storage state object. Two workers
//     could claim the same listing, and a worker saving a stale snapshot
//     erased results another worker had just written. Every state mutation now
//     goes through withLock().
//  2. start() treated a changed id list as a brand-new run and reset
//     results:{}. Combined with the popup's "retry failed" button — which
//     hands start() a *shorter* list — that deleted every result already
//     collected. Results are now merged, never reset, except on explicit Clear.
//  3. Gallery URLs were normalized to .webp, which Square's catalog image
//     endpoint does not accept. Now normalized to .jpg.
//  4. A fixed 3.2s sleep was used instead of waiting for the gallery, so slow
//     listings were recorded as permanent failures.
//  5. Ended listings were retried as if they were interruption pages, costing
//     three loads and two backoffs each.

(() => {
  if (window.__pixyDustCollectorLoaded) return;
  window.__pixyDustCollectorLoaded = true;

  let paused = false, stopping = false, target = 3;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // --- serialized state access -------------------------------------------
  let lockTail = Promise.resolve();
  function withLock(fn) {
    const run = lockTail.then(fn, fn);
    lockTail = run.then(() => {}, () => {});
    return run;
  }
  const readState = async () => (await chrome.storage.local.get('ebayCollectorState')).ebayCollectorState || null;
  const writeState = async (s) => { s.updatedAt = Date.now(); await chrome.storage.local.set({ ebayCollectorState: s }); };
  /** Read-modify-write under the lock. `mutate` receives the freshest state. */
  const updateState = (mutate) => withLock(async () => {
    const s = await readState();
    if (!s) return null;
    const next = await mutate(s);
    if (next !== false) await writeState(s);
    return s;
  });

  // --- url handling -------------------------------------------------------
  const RENDITION = /\/s-l\d+\.(?:jpg|jpeg|png|webp|avif)$/i;
  function norm(u) {
    if (!u) return '';
    u = String(u).trim();
    if (u.startsWith('//')) u = `https:${u}`;
    u = u.split('?')[0].split('#')[0].replace('/thumbs/images/g/', '/images/g/');
    if (!/^https:\/\/i\.ebayimg\.com\//i.test(u)) return '';
    if (!RENDITION.test(u)) return '';
    return u.replace(RENDITION, '/s-l1600.jpg');
  }
  const key = (u) => (u.match(/\/images\/g\/([^/]+)\//i) || [, u])[1];

  // Scoped to the main listing carousel only. v0.1 also matched
  // '.ux-image-grid img' and [data-testid*="gallery"], which pick up the
  // "similar items" strip — other sellers' photos.
  const GALLERY = [
    '.ux-image-carousel img',
    '.ux-image-carousel-item img',
    '[data-testid="ux-image-carousel"] img',
    '.ux-image-filmstrip-carousel img',
  ].join(',');

  function photos(doc) {
    const out = [], seen = new Set();
    doc.querySelectorAll(GALLERY).forEach((img) => {
      ['data-zoom-src', 'data-src', 'src'].forEach((a) => {
        const u = norm(img.getAttribute(a));
        if (!u) return;
        const k = key(u);
        if (seen.has(k)) return;
        seen.add(k);
        out.push(u);
      });
    });
    return out.slice(0, 24);
  }

  const BLOCKED = /pardon our interruption|are you a human|unusual traffic|security measure|captcha|robot/i;
  const ENDED = /this listing (has ended|was ended)|no longer available|bidding has ended/i;

  async function load(id, attempt = 0) {
    const iframe = document.createElement('iframe');
    iframe.style = 'position:fixed;left:-10000px;top:0;width:1100px;height:900px;opacity:0;pointer-events:none';
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
    document.documentElement.appendChild(iframe);

    const result = await new Promise((resolve) => {
      let settled = false;
      const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
      const hardTimeout = setTimeout(() => finish({ status: 'failed', reason: 'timeout', pageTitle: 'timeout', images: [] }), 40000);

      iframe.onload = async () => {
        try {
          const d = iframe.contentDocument;
          const t = (d?.title || '').trim();
          const b = (d?.body?.innerText || '').slice(0, 1500);
          if (BLOCKED.test(`${t} ${b}`)) { clearTimeout(hardTimeout); return finish({ status: 'blocked', reason: 'ebay-interruption', pageTitle: t, images: [] }); }
          if (ENDED.test(b)) { clearTimeout(hardTimeout); return finish({ status: 'ended', reason: 'listing ended', pageTitle: t, images: [] }); }

          // Poll for the gallery instead of a blind fixed sleep.
          const deadline = Date.now() + 20000;
          let imgs = [];
          while (Date.now() < deadline) {
            imgs = photos(iframe.contentDocument);
            if (imgs.length) break;
            await sleep(400);
          }
          clearTimeout(hardTimeout);
          finish(imgs.length
            ? { status: 'ok', reason: '', pageTitle: t, images: imgs }
            : { status: 'failed', reason: 'no-gallery-images', pageTitle: t, images: [] });
        } catch (e) {
          clearTimeout(hardTimeout);
          finish({ status: 'failed', reason: String(e?.message || e), pageTitle: 'error', images: [] });
        }
      };
      iframe.src = `https://www.ebay.com/itm/${id}`;
    });

    iframe.remove();

    // Only interruption pages are worth retrying. An ended listing will never
    // come back, and v0.1 spent 3 loads + 2 sleeps on each of them.
    if (result.status === 'blocked' && attempt < 2) {
      await updateState((s) => { s.retries = (s.retries || 0) + 1; });
      await sleep(6500 * 2 ** attempt + Math.random() * 2500);
      return load(id, attempt + 1);
    }
    return result;
  }

  async function worker(n) {
    while (!stopping) {
      while (paused) await sleep(500);

      // Claim exactly one id atomically.
      const id = await withLock(async () => {
        const s = await readState();
        if (!s?.running) return null;
        const done = new Set(Object.keys(s.results || {}));
        const claimed = new Set(s.claimed || []);
        const next = (s.ids || []).find((x) => !done.has(x) && !claimed.has(x));
        if (!next) {
          if (!claimed.size) { s.running = false; s.finishedAt = Date.now(); await writeState(s); }
          return null;
        }
        s.claimed = [...claimed, next];
        await writeState(s);
        return next;
      });
      if (!id) return;

      const r = await load(id);

      await updateState((s) => {
        s.claimed = (s.claimed || []).filter((x) => x !== id);
        s.results = s.results || {};
        s.results[id] = {
          ebayItemId: id,
          images: r.images || [],
          status: r.status,
          pageTitle: r.pageTitle || '',
          diagnostic: r.reason || '',
          completedAt: new Date().toISOString(),
          worker: n,
        };
      });

      await sleep(900 + Math.random() * 900);
    }
  }

  async function start(ids, workers) {
    stopping = false;
    paused = false;
    target = Math.max(1, Math.min(4, workers || 3));

    await withLock(async () => {
      const prev = await readState();
      const incoming = Array.isArray(ids) && ids.length ? [...new Set(ids.map(String))] : (prev?.ids || []);
      if (!incoming.length) throw new Error('No item numbers loaded.');

      // Merge. A different id list narrows or extends the queue; it never
      // discards results. Use Clear to start over deliberately.
      const s = prev ?? { results: {}, retries: 0, startedAt: Date.now() };
      s.ids = incoming;
      s.results = s.results || {};
      s.claimed = [];          // any claim from a dead run is released
      s.running = true;
      s.paused = false;
      s.startedAt = s.startedAt || Date.now();
      await writeState(s);
    });

    await Promise.all(Array.from({ length: target }, (_, i) => worker(i + 1)));
  }

  chrome.runtime.onMessage.addListener((m, sender, reply) => {
    if (m?.type === 'START_COLLECTOR') {
      start(m.ids || [], m.workers || 3).then(() => reply({ ok: true })).catch((e) => reply({ ok: false, error: String(e?.message || e) }));
      return true;
    }
    if (m?.type === 'PAUSE_COLLECTOR') {
      paused = !paused;
      updateState((s) => { s.paused = paused; }).then(() => reply({ ok: true, paused }));
      return true;
    }
  });
})();
