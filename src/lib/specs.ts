// 訂單品項 → 主機規格（CPU、主機板…）：發布到官網、檢測表共用。
// 品項存的是分類名稱（可能是子分類，例如「AM5」），往上找到第一層分類再對應。
import { categoryPath, loadCategories } from '../models/database';

export const SPEC_FIELDS = [
  { root: 'CPU', key: 'cpu', label: 'CPU' },
  { root: '主機板', key: 'motherboard', label: '主機板' },
  { root: '記憶體', key: 'ram', label: '記憶體' },
  { root: '硬碟', key: 'storage', label: '硬碟' },
  { root: '顯示卡', key: 'gpu', label: '顯示卡' },
  { root: '電源供應器', key: 'psu', label: '電源' },
  { root: '散熱', key: 'cooler', label: '散熱' },
  { root: '機殼', key: 'pcCase', label: '機殼' },
] as const;

export type SpecKey = (typeof SPEC_FIELDS)[number]['key'];

interface ItemLike {
  category: string;
  name: string;
  spec: string;
  quantity: number;
}

/** 每個規格欄位的文字（同一類有多項就用「 / 」接起來），沒有的是空字串 */
export async function specsFromItems(items: ItemLike[]): Promise<Record<SpecKey, string>> {
  const cats = await loadCategories();
  const rootOf = (name: string): string => {
    const c = cats.find((x) => x.name === name);
    return c ? categoryPath(cats, c.id).split(' › ')[0] : name;
  };
  const out = Object.fromEntries(SPEC_FIELDS.map((f) => [f.key, [] as string[]])) as Record<SpecKey, string[]>;
  for (const it of items) {
    const field = SPEC_FIELDS.find((f) => f.root === rootOf(it.category));
    if (!field) continue;
    out[field.key].push([it.name, it.spec].filter(Boolean).join(' ') + (it.quantity > 1 ? ` x${it.quantity}` : ''));
  }
  return Object.fromEntries(SPEC_FIELDS.map((f) => [f.key, out[f.key].join(' / ')])) as Record<SpecKey, string>;
}
