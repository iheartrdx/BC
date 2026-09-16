const $ = (id) => document.getElementById(id);
const parseIds = (t) => [...new Set(t.match(/\d{10,15}/g) || [])];
const state = async () => (await chrome.storage.local.get('ebayCollectorState')).ebayCollectorState || null;
const fmt = (ms) => { if (!ms || ms < 0) return ''; const s = Math.round(ms / 1000), m = Math.floor(s / 60); return m ? `${m}m ${s % 60}s` : `${s}s`; };

async function ebayTab() {
  const t = await chrome.tabs.query({ url: 'https://www.ebay.com/*' });
  if (!t.length) throw new Error('Open ebay.com in a normal Chrome tab first.');
  return t.find((x) => x.active) || t[0];
}

async function refresh() {
  const s = await state();
  if (!s) {
    $('headline').textContent = 'Idle';
    $('bar').style.width = '0%';
    $('detail').textContent = 'Open ebay.com in a normal Chrome tab before starting.';
    ['completed', 'remaining', 'success', 'failed', 'photos', 'retries'].forEach((x) => { $(x).textContent = '0'; });
    $('timing').textContent = '';
    return;
  }
  const total = s.ids?.length || 0;
  const vals = Object.values(s.results || {});
  // Progress is measured against the queue, but results accumulate across
  // narrowed runs, so count only results for ids currently queued.
  const queued = new Set(s.ids || []);
  const relevant = vals.filter((v) => queued.has(v.ebayItemId));
  const done = relevant.length;
  const ok = relevant.filter((x) => x.status === 'ok').length;
  const ended = relevant.filter((x) => x.status === 'ended').length;
  const fail = done - ok - ended;
  const photos = vals.reduce((n, x) => n + (x.images?.length || 0), 0);
  const pct = total ? Math.round((done / total) * 100) : 0;

  $('headline').textContent = s.running ? (s.paused ? 'Paused' : 'Running') : (done >= total && total ? 'Finished' : 'Ready');
  $('bar').style.width = `${pct}%`;
  $('detail').textContent = `${done} of ${total} listings processed (${vals.length} total results retained)`;
  $('completed').textContent = done;
  $('remaining').textContent = Math.max(0, total - done);
  $('success').textContent = ok;
  $('failed').textContent = ended ? `${fail} (+${ended} ended)` : fail;
  $('photos').textContent = photos;
  $('retries').textContent = s.retries || 0;

  let txt = '';
  if (s.startedAt) {
    const e = Date.now() - s.startedAt;
    txt = `Elapsed: ${fmt(e)}`;
    if (done > 0 && total > done) txt += ` • ETA: ${fmt((e / done) * (total - done))}`;
  }
  $('timing').textContent = txt;
}

$('load424').textContent = `Load current ${PIXY_DUST_ITEM_IDS.length}`;
$('load424').onclick = () => { $('ids').value = PIXY_DUST_ITEM_IDS.join('\n'); };

$('start').onclick = async () => {
  try {
    const ids = parseIds($('ids').value);
    const old = await state();
    if (!ids.length && !old?.ids?.length) throw new Error('Load or paste item numbers first.');
    const t = await ebayTab();
    await chrome.tabs.sendMessage(t.id, { type: 'START_COLLECTOR', ids, workers: +$('workers').value });
    refresh();
  } catch (e) { alert(e.message || String(e)); }
};

$('pause').onclick = async () => {
  try { const t = await ebayTab(); await chrome.tabs.sendMessage(t.id, { type: 'PAUSE_COLLECTOR' }); }
  catch (e) { alert(e.message || String(e)); }
};

$('export').onclick = async () => {
  const s = await state();
  if (!s) return alert('There is no saved run.');
  chrome.runtime.sendMessage({
    type: 'EXPORT_RESULTS',
    payload: {
      version: 2,
      collector: 'desktop-extension-v0.2',
      createdAt: new Date().toISOString(),
      items: Object.values(s.results || {}),
    },
  });
};

// Narrows the queue to listings that did not succeed. In v0.1 this wiped every
// result already collected, because start() reset results whenever the id list
// changed. content.js now merges instead of resetting, so this is safe — and
// 'ended' listings are excluded because they will never succeed.
$('retryFailed').onclick = async () => {
  const s = await state();
  if (!s) return alert('There is no saved run.');
  const results = s.results || {};
  const f = (s.ids || []).filter((id) => {
    const r = results[id];
    return !r || (r.status !== 'ok' && r.status !== 'ended');
  });
  if (!f.length) return alert('There are no retryable listings.');
  $('ids').value = f.join('\n');
  alert(`Loaded ${f.length} retryable listing(s). Existing results are kept. Press Start / Resume.`);
};

$('clear').onclick = async () => {
  const s = await state();
  const n = Object.keys(s?.results || {}).length;
  if (confirm(`Delete all saved progress, including ${n} collected result(s)? Export first if you have not.`)) {
    await chrome.storage.local.remove('ebayCollectorState');
    $('ids').value = '';
    refresh();
  }
};

refresh();
setInterval(refresh, 1000);
