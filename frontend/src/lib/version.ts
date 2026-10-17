// 版號（建置時從根目錄的 VERSION 來，見 next.config.ts）和「有沒有看過這一版」
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '';
export const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA || '';
export const BUILD_DATE = process.env.NEXT_PUBLIC_BUILD_DATE || '';

const SEEN_KEY = 'dpom-seen-version';
const listeners = new Set<() => void>();
let seen: string | undefined;

const readSeen = (): string | null => {
  try { return localStorage.getItem(SEEN_KEY); } catch { return null; }
};
const writeSeen = (version: string) => {
  try { localStorage.setItem(SEEN_KEY, version); } catch { /* 存不了就每次都當作看過 */ }
};

/** 第一次來的人不用看 NEW，直接記下目前的版號 */
const current = (): string => {
  if (typeof seen !== 'string') {
    const stored = readSeen();
    seen = stored ?? APP_VERSION;
    if (stored === null) writeSeen(APP_VERSION);
  }
  return seen;
};

/** 給 useSyncExternalStore 用：上次看過的版號跟現在不一樣就顯示 NEW */
export const versionSeen = {
  hasUnseen: () => typeof window !== 'undefined' && current() !== APP_VERSION,
  serverSnapshot: () => false,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  markSeen() {
    if (current() === APP_VERSION) return;
    seen = APP_VERSION;
    writeSeen(APP_VERSION);
    listeners.forEach((listener) => listener());
  },
};
