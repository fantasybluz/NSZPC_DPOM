export function currency(n: number | null | undefined): string {
  return new Intl.NumberFormat('zh-TW').format(n || 0);
}

export function date(str: string | null | undefined): string {
  if (!str) return '';
  return String(str).slice(0, 10);
}

export function percent(n: number | null | undefined): string {
  return (n || 0).toFixed(1) + '%';
}

export function margin(cost: number, price: number): number {
  if (!price) return 0;
  return ((price - cost) / price) * 100;
}
