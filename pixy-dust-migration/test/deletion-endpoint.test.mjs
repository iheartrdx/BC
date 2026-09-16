import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { createDeletionHandler } from '../bin/ebay-deletion-endpoint.mjs';

const TOKEN = 'pixydust_verification_token_0123456789abcd'; // 42 chars
const ENDPOINT = 'https://example.com/ebay/deletion';

async function withServer(handler, fn) {
  const server = createServer((req, res) => { handler(req, res).catch(() => res.writeHead(500).end()); });
  await new Promise((r) => server.listen(0, r));
  try { return await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((r) => server.close(r)); }
}

test('rejects a verification token that does not meet eBay’s format rules', () => {
  assert.throws(() => createDeletionHandler({ verificationToken: 'too-short', endpointUrl: ENDPOINT }), /32-80/);
  assert.throws(() => createDeletionHandler({ verificationToken: `bad!token${'x'.repeat(30)}`, endpointUrl: ENDPOINT }), /32-80/);
  assert.throws(() => createDeletionHandler({ verificationToken: TOKEN, endpointUrl: 'http://example.com' }), /https/);
});

test('challenge response hashes code + token + url in that exact order', async () => {
  const handler = createDeletionHandler({ verificationToken: TOKEN, endpointUrl: ENDPOINT });
  const code = 'abc123challenge';
  const expected = createHash('sha256').update(code).update(TOKEN).update(ENDPOINT).digest('hex');

  await withServer(handler, async (base) => {
    const res = await fetch(`${base}/?challenge_code=${code}`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /application\/json/);
    assert.equal((await res.json()).challengeResponse, expected);
  });

  // Guard the ordering explicitly: every other permutation must differ, which
  // is the failure mode that produces eBay's unhelpful "validation failed".
  const wrong = [
    createHash('sha256').update(TOKEN).update(code).update(ENDPOINT).digest('hex'),
    createHash('sha256').update(code).update(ENDPOINT).update(TOKEN).digest('hex'),
    createHash('sha256').update(ENDPOINT).update(code).update(TOKEN).digest('hex'),
  ];
  for (const w of wrong) assert.notEqual(w, expected);
});

test('a trailing slash on the endpoint url changes the hash', () => {
  const code = 'x';
  const a = createHash('sha256').update(code).update(TOKEN).update(ENDPOINT).digest('hex');
  const b = createHash('sha256').update(code).update(TOKEN).update(`${ENDPOINT}/`).digest('hex');
  assert.notEqual(a, b, 'the registered URL must match byte for byte');
});

test('missing challenge_code is a 400, not a bad hash', async () => {
  const handler = createDeletionHandler({ verificationToken: TOKEN, endpointUrl: ENDPOINT });
  await withServer(handler, async (base) => {
    assert.equal((await fetch(base)).status, 400);
  });
});

test('deletion notifications are acknowledged before the handler runs', async () => {
  let seen = null;
  let resolveSeen;
  const done = new Promise((r) => { resolveSeen = r; });
  const handler = createDeletionHandler({
    verificationToken: TOKEN,
    endpointUrl: ENDPOINT,
    onDeletion: async (p) => { seen = p; resolveSeen(); },
  });

  await withServer(handler, async (base) => {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadata: { topic: 'MARKETPLACE_ACCOUNT_DELETION' }, notification: { data: { userId: 'ma8vp1jySJC' } } }),
    });
    assert.equal(res.status, 204);
    await done;
    assert.equal(seen.notification.data.userId, 'ma8vp1jySJC');
  });
});

test('a throwing deletion handler still returns success to eBay', async () => {
  const handler = createDeletionHandler({
    verificationToken: TOKEN, endpointUrl: ENDPOINT,
    onDeletion: async () => { throw new Error('database down'); },
  });
  await withServer(handler, async (base) => {
    // eBay retries on non-2xx and counts failures against compliance; the ack
    // must not depend on downstream work succeeding.
    const res = await fetch(base, { method: 'POST', body: '{}' });
    assert.equal(res.status, 204);
  });
});

test('malformed JSON is still acknowledged', async () => {
  const handler = createDeletionHandler({ verificationToken: TOKEN, endpointUrl: ENDPOINT });
  await withServer(handler, async (base) => {
    assert.equal((await fetch(base, { method: 'POST', body: 'not json' })).status, 204);
  });
});
