// Loaders for the two source-of-truth exports.
//
// Neither file is trusted as a fixed list: both are re-read on every run so the
// tooling always reflects the *current* state of the two catalogs rather than a
// snapshot frozen into source code.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseCsv, toRecords } from './csv.mjs';

const EBAY_ID = /^\d{10,15}$/;

/** Square item-library exports put a blank row above the real header. */
async function readSheetRows(file) {
  if (path.extname(file).toLowerCase() === '.csv') {
    return parseCsv(await readFile(file, 'utf8'));
  }
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet('Items') ?? wb.worksheets[0];
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values.slice(1).map((v) => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') return String(v.text ?? v.result ?? v.richText?.map((t) => t.text).join('') ?? '');
      return String(v);
    });
    rows.push(values);
  });
  return rows;
}

function findHeaderRow(rows, required) {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const cells = rows[i].map((c) => String(c).split('\n')[0].trim());
    if (required.every((r) => cells.includes(r))) return i;
  }
  throw new Error(`Could not find a header row containing ${required.join(', ')}`);
}

/**
 * Square item library export -> [{ sku, ebayItemId, token, name, price }]
 * `token` is the Square object token from the export. It is recorded for
 * reference only; the uploader re-resolves SKU -> item id through the Catalog
 * API, because the export's token column is a *variation* token on some Square
 * export versions and images attach to the parent item, not the variation.
 */
export async function loadSquareCatalog(file) {
  const rows = await readSheetRows(file);
  const h = findHeaderRow(rows, ['SKU', 'Item Name']);
  const header = rows[h].map((c) => String(c).split('\n')[0].trim());
  const col = (name) => header.indexOf(name);
  const iSku = col('SKU');
  const iTok = col('Token');
  const iName = col('Item Name');
  const iPrice = col('Price');

  const out = [];
  for (const r of rows.slice(h + 1)) {
    const sku = String(r[iSku] ?? '').trim();
    if (!sku) continue;
    const m = /^EB-(\d{10,15})$/.exec(sku);
    out.push({
      sku,
      ebayItemId: m ? m[1] : null,
      token: iTok >= 0 ? String(r[iTok] ?? '').trim() : '',
      name: iName >= 0 ? String(r[iName] ?? '').trim() : '',
      price: iPrice >= 0 ? String(r[iPrice] ?? '').trim() : '',
    });
  }
  return out;
}

/** eBay active-listings report -> [{ ebayItemId, title, sku, quantity, price }] */
export async function loadEbayActive(file) {
  const rows = await readSheetRows(file);
  const h = findHeaderRow(rows, ['Item number', 'Title']);
  const records = toRecords(rows, h);
  return records
    .map((r) => ({
      ebayItemId: String(r['Item number'] ?? '').replace(/"/g, '').trim(),
      title: r['Title'] ?? '',
      sku: r['Custom label (SKU)'] ?? '',
      quantity: r['Available quantity'] ?? '',
      price: r['Current price'] ?? r['Start price'] ?? '',
    }))
    .filter((r) => EBAY_ID.test(r.ebayItemId));
}
