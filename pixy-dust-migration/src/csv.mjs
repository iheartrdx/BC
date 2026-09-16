// Minimal RFC 4180 CSV parser. eBay's active-listings export embeds newlines
// inside quoted title fields, so a naive split('\n') under-counts rows — that
// is why `wc -l` reports one fewer listing than the file actually contains.

export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

export function toRecords(rows, headerRowIndex = 0) {
  const header = rows[headerRowIndex].map((h) => String(h).trim());
  return rows.slice(headerRowIndex + 1).map((r) => {
    const o = {};
    header.forEach((h, i) => { o[h] = r[i] === undefined ? '' : String(r[i]).trim(); });
    return o;
  });
}
