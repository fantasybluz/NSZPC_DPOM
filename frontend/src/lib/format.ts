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


/** 台灣時間的今天（YYYY-MM-DD）；不要用 toISOString()，那是 UTC，早上 8 點前會變成昨天 */
export function today(): string {
  return new Date().toLocaleDateString('sv', { timeZone: 'Asia/Taipei' });
}
