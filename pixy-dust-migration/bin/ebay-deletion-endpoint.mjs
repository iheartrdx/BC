#!/usr/bin/env node
// eBay Marketplace Account Deletion/Closure notification endpoint.
//
// This is the entire obstacle that caused the eBay API route to be abandoned in
// the archived session. It is ~40 lines. It is a requirement on the *developer
// keyset*, not a risk to the seller account, and satisfying it activates the
// production keyset — which in turn makes GetSellerList (and therefore
// bin/fetch-ebay-photos.mjs) work, replacing 390 scraped page loads with a
// handful of API calls.
//
// Protocol:
//   GET  /?challenge_code=XYZ
//        -> 200 application/json {"challengeResponse": sha256(code + token + url)}
//           The three values are hashed IN THAT ORDER, and `url` must be
//           byte-identical to the endpoint URL entered in the developer portal.
//   POST /
//        -> 200/204. Body is a MARKETPLACE_ACCOUNT_DELETION notification.
//
// Run:
//   EBAY_VERIFICATION_TOKEN=<32-80 chars, [A-Za-z0-9_-]> \
//   EBAY_ENDPOINT_URL=https://your.host/ebay/deletion \
//   node bin/ebay-deletion-endpoint.mjs --port 8080
//
// Must be reachable over real HTTPS — no localhost, no internal IP. Put it
// behind a reverse proxy or deploy the handler to any serverless platform;
// `createDeletionHandler` is exported for that.

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

const TOKEN_RE = /^[A-Za-z0-9_-]{32,80}$/;

export function createDeletionHandler({ verificationToken, endpointUrl, onDeletion } = {}) {
  if (!TOKEN_RE.test(verificationToken ?? '')) {
    throw new Error('verificationToken must be 32-80 chars of [A-Za-z0-9_-] and match the developer portal exactly.');
  }
  if (!/^https:\/\//.test(endpointUrl ?? '')) {
    throw new Error('endpointUrl must be the exact https:// URL registered with eBay.');
  }

  return async function handle(req, res) {
    const url = new URL(req.url, 'http://placeholder');

    if (req.method === 'GET') {
      const challengeCode = url.searchParams.get('challenge_code');
      if (!challengeCode) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'missing challenge_code' }));
      }
      // Order is fixed by eBay: challengeCode, then verificationToken, then the
      // endpoint URL. Any other order, or a URL that differs by so much as a
      // trailing slash, fails validation with no useful error.
      const challengeResponse = createHash('sha256')
        .update(challengeCode)
        .update(verificationToken)
        .update(endpointUrl)
        .digest('hex');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ challengeResponse }));
    }

    if (req.method === 'POST') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      let payload = null;
      try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { /* ack anyway */ }
      // Acknowledge first: eBay retries on non-2xx, and a slow handler looks
      // like a failure. Do the actual erasure out of band.
      res.writeHead(204).end();
      try { await onDeletion?.(payload); } catch (err) { console.error('deletion handler error:', err); }
      return;
    }

    res.writeHead(405, { Allow: 'GET, POST' }).end();
  };
}

// --- CLI ------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const arg = (f, d) => { const i = argv.indexOf(f); return i > -1 && argv[i + 1] ? argv[i + 1] : d; };
  const port = Number(arg('--port', process.env.PORT || 8080));

  const handler = createDeletionHandler({
    verificationToken: process.env.EBAY_VERIFICATION_TOKEN,
    endpointUrl: process.env.EBAY_ENDPOINT_URL,
    onDeletion: async (payload) => {
      // Pixy Dust stores no other eBay user's data — only its own listings —
      // so there is nothing to erase. Logged for the audit trail.
      const userId = payload?.notification?.data?.userId ?? 'unknown';
      console.log(`[${new Date().toISOString()}] account deletion notice for ${userId}: nothing stored, no action`);
    },
  });

  createServer((req, res) => { handler(req, res).catch((e) => { console.error(e); res.writeHead(500).end(); }); })
    .listen(port, () => {
      console.log(`eBay deletion endpoint listening on :${port}`);
      console.log(`Registered URL must be exactly: ${process.env.EBAY_ENDPOINT_URL}`);
    });
}
