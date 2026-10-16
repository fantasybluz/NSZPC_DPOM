'use client';

// 訂單表單的「客戶」欄：打字時下拉顯示相似的客戶，選了就關聯到客戶管理。
// - 還沒打字：點一下就列出最近的客戶
// - 名字：完全相同 > 開頭相同 > 包含 > 字有一半以上一樣（王小明 → 王曉明、小明）
// - 電話：不管 - 和空白（0933222 → 0933-222-111）
// - ↑↓ 移動、Enter 選、Esc 關
// 打的是新名字時可以順手填電話；電話跟現有客戶一樣會提醒，可以直接改用那位。

import { useEffect, useMemo, useRef, useState } from 'react';
import * as Fmt from '@/lib/format';

export interface PickerCustomer {
  id: number;
  name: string;
  phone: string;
  city: string;
  district: string;
  address?: string;
  order_count?: number;
  last_order_at?: string | null;
  created_at?: string;
}

interface Props {
  customers: PickerCustomer[];
  /** 已關聯的客戶 id（沒有就是 null） */
  selectedId: number | null;
  /** 輸入框的文字 */
  text: string;
  onTextChange: (text: string) => void;
  onSelect: (customer: PickerCustomer) => void;
  newPhone: string;
  onNewPhoneChange: (phone: string) => void;
}

const MAX_RESULTS = 8;
const digits = (value: string) => value.replace(/\D/g, '');
const place = (c: PickerCustomer) => [c.city, c.district].filter(Boolean).join(' ');

/** 0 表示不相似 */
function score(c: PickerCustomer, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const name = c.name.toLowerCase();
  const qDigits = digits(q);

  if (name === q) return 100;
  if (name.startsWith(q)) return 90;
  if (qDigits.length >= 3 && qDigits.length === q.replace(/[\s-]/g, '').length && digits(c.phone).includes(qDigits)) return 85;
  if (name.includes(q)) return 80;

  // 名字相似：查詢的字有一半以上出現在名字裡（中文一個字一個字比）
  const chars = [...new Set([...q.replace(/\s/g, '')])];
  if (chars.length < 2) return 0;
  const hit = chars.filter((ch) => name.includes(ch)).length;
  return hit / chars.length >= 0.5 ? 40 + Math.round((30 * hit) / chars.length) : 0;
}

/** 把名字裡跟查詢一樣的字標出來 */
function highlight(name: string, query: string) {
  const chars = new Set([...query.trim().toLowerCase()]);
  if (!chars.size) return name;
  return [...name].map((ch, i) => (chars.has(ch.toLowerCase()) ? <mark key={i} className="cp-mark">{ch}</mark> : <span key={i}>{ch}</span>));
}

export default function CustomerPicker({ customers, selectedId, text, onTextChange, onSelect, newPhone, onNewPhoneChange }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const query = text.trim();
  const results = useMemo(() => {
    if (!query) {
      // 最近有下單（沒有就最近建立）的客戶
      return [...customers]
        .sort((a, b) => (b.last_order_at || b.created_at || '').localeCompare(a.last_order_at || a.created_at || ''))
        .slice(0, MAX_RESULTS);
    }
    return customers
      .map((c) => ({ c, s: score(c, query) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || (b.c.order_count || 0) - (a.c.order_count || 0))
      .slice(0, MAX_RESULTS)
      .map((x) => x.c);
  }, [customers, query]);

  const exact = query ? customers.find((c) => c.name === query) : undefined;
  const selected = selectedId ? customers.find((c) => c.id === selectedId) : undefined;
  // 新客戶填的電話跟現有客戶一樣
  const phoneTwin = !selectedId && digits(newPhone).length >= 8 ? customers.find((c) => digits(c.phone) === digits(newPhone)) : undefined;

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const pick = (c: PickerCustomer) => {
    onSelect(c);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { setOpen(true); return; }
    if (!open || !results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % results.length); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + results.length) % results.length); }
    if (e.key === 'Enter') { e.preventDefault(); pick(results[active]); }
  };

  return (
    <div className="position-relative" ref={boxRef}>
      <input
        type="text"
        className="form-control"
        value={text}
        placeholder="搜尋姓名或電話，或輸入新客戶"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onChange={(e) => { onTextChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />

      {open && (results.length > 0 || query) && (
        <div className="dropdown-menu show w-100 cp-menu" role="listbox">
          <div className="cp-head">{query ? (results.length ? '相似的客戶' : '找不到相似的客戶') : '最近的客戶'}</div>
          {results.map((c, i) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={i === active}
              className={`dropdown-item cp-item ${i === active ? 'active' : ''} ${c.id === selectedId ? 'cp-current' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(c)}
            >
              <span className="cp-name">{highlight(c.name, query)}</span>
              <span className="cp-meta">
                {[c.phone, place(c)].filter(Boolean).join(' · ') || '沒有聯絡資料'}
              </span>
              <span className="cp-orders">
                {c.order_count ? `${c.order_count} 張訂單${c.last_order_at ? ` · ${Fmt.date(c.last_order_at)}` : ''}` : '還沒有訂單'}
              </span>
            </button>
          ))}
          {query && !exact && (
            <div className="cp-new">
              <i className="bi bi-person-plus" /> 用「{query}」建立新客戶
            </div>
          )}
        </div>
      )}

      {selected ? (
        <div className="small text-muted mt-1">
          <i className="bi bi-person-check text-success" /> {[selected.phone, place(selected), selected.address].filter(Boolean).join(' · ') || '已關聯客戶'}
          {' '}<a href={`/customers?id=${selected.id}`} target="_blank" rel="noopener noreferrer">客戶資料 ›</a>
        </div>
      ) : query ? (
        <div className="mt-1">
          <input
            type="tel"
            className="form-control form-control-sm"
            placeholder="新客戶的電話（選填）"
            value={newPhone}
            onChange={(e) => onNewPhoneChange(e.target.value)}
          />
          {phoneTwin ? (
            <div className="small mt-1 text-warning-emphasis">
              <i className="bi bi-exclamation-circle" /> 這支電話是「{phoneTwin.name}」的
              {' '}<button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={() => pick(phoneTwin)}>改用這位客戶</button>
            </div>
          ) : (
            <div className="small text-muted mt-1">成交或填了電話，存檔時會建立新客戶</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
