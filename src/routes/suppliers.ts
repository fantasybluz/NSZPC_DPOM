import { Router, Request, Response } from 'express';
import pool from '../models/database';
import type { ParsedPrice } from '../types';

const router = Router();

// 文字解析
router.post('/parse', async (req: Request, res: Response) => {
  const { text, supplier_name, quote_date } = req.body as { text?: string; supplier_name?: string; quote_date?: string };
  if (!text) return res.status(400).json({ error: '請提供訊息內容' });

  const results = parseLinePrices(text);
  const dt = quote_date || new Date().toISOString().slice(0, 10);
  for (const r of results) {
    await pool.query('INSERT INTO supplier_prices (supplier_name, product_name, price, source_text, quote_date) VALUES ($1, $2, $3, $4, $5)',
      [supplier_name || '', r.product, r.price, text, dt]);
  }
  res.json({ parsed: results, count: results.length });
});

// OCR 結果解析
router.post('/parse-ocr', async (req: Request, res: Response) => {
  const { text, supplier_name, quote_date } = req.body as { text?: string; supplier_name?: string; quote_date?: string };
  if (!text) return res.status(400).json({ error: '無 OCR 文字' });

  const results = parseOcrTable(text);
  const dt = quote_date || new Date().toISOString().slice(0, 10);
  for (const r of results) {
    await pool.query('INSERT INTO supplier_prices (supplier_name, product_name, price, source_text, quote_date) VALUES ($1, $2, $3, $4, $5)',
      [supplier_name || '', r.product, r.price, r.original, dt]);
  }
  res.json({ parsed: results, count: results.length });
});

// 歷史報價
router.get('/prices', async (req: Request, res: Response) => {
  const { search, supplier, month } = req.query;
  let sql = 'SELECT * FROM supplier_prices';
  const params: any[] = [];
  const conditions: string[] = [];
  let idx = 1;
  if (search) { conditions.push(`product_name LIKE $${idx++}`); params.push(`%${search}%`); }
  if (supplier) { conditions.push(`supplier_name LIKE $${idx++}`); params.push(`%${supplier}%`); }
  if (month) { conditions.push(`to_char(quote_date, 'YYYY-MM') = $${idx++}`); params.push(month); }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY quote_date DESC, parsed_at DESC LIMIT 500';
  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

// 刪除報價
router.delete('/prices/:id', async (req: Request, res: Response) => {
  await pool.query('DELETE FROM supplier_prices WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// ========== Line 訊息格式解析 ==========
function parseLinePrices(text: string): ParsedPrice[] {
  const results: ParsedPrice[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    const patterns: RegExp[] = [
      /^(.+?)\s+(?:NT\$?|\$)\s*([\d,]+)/i,
      /^(.+?)\s+([\d,]+)\s*元/,
      /^(.+?)[：:]\s*(?:NT\$?|\$)?\s*([\d,]+)/,
      /^(.+?)\s+([\d,]{4,})\s*$/,
    ];
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const product = match[1].trim();
        const price = parseInt(match[2].replace(/,/g, ''));
        if (price > 0 && product.length > 0) {
          results.push({ product, price, original: line });
        }
        break;
      }
    }
  }
  return results;
}

// ========== OCR 表格格式解析 ==========
function parseOcrTable(text: string): ParsedPrice[] {
  const results: ParsedPrice[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (/新增|刪除|秀圖|插入|規格|組件|庫存|客戶|合計|訂單/i.test(line)) continue;
    if (line.length < 5) continue;

    const priceMatch = line.match(/([\d,]+(?:\.\d+)?)\s*(?:\d+\.\d+)?$/);
    if (!priceMatch) continue;

    const priceStr = priceMatch[1];
    const price = Math.round(parseFloat(priceStr.replace(/,/g, '')));
    if (price < 100) continue;

    let rest = line.slice(0, line.indexOf(priceStr)).trim();
    rest = rest.replace(/^\d{1,2}\s+/, '');
    rest = rest.replace(/^[A-Z0-9]{6,}\s+/i, '');
    rest = rest.replace(/\s+\d+\s*(顆|片|個|台|條|組|支|塊|入)\s*$/, '');
    rest = rest.replace(/\s+\d+\s*$/, '');
    rest = rest.trim();

    if (rest.length < 2) continue;

    const product = cleanProductName(rest);
    results.push({ product, price, original: line });
  }
  return results;
}

function cleanProductName(name: string): string {
  const prefixMap: Record<string, string> = {
    'CPA': 'CPU AMD', 'CPI': 'CPU Intel',
    'VGA': '顯示卡', 'VGN': '顯示卡 NVIDIA', 'VGM': '顯示卡 AMD',
    'MA5A': '主機板', 'MA4A': '主機板', 'MIA': '主機板', 'MIB': '主機板',
    'HSSK': 'SSD', 'HHDD': 'HDD',
    'FAN': '散熱', 'FWC': '水冷', 'FAC': '風冷',
    'PSU': '電源', 'CR': '機殼', 'RAM': '記憶體',
  };

  for (const [prefix, label] of Object.entries(prefixMap)) {
    if (name.startsWith(prefix + ' ')) {
      return name.slice(prefix.length + 1).trim();
    }
  }
  return name;
}

export default router;
