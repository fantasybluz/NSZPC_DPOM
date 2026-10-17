// 更新紀錄：建置時 next.config.ts 把根目錄的 CHANGELOG.md 放進來，這裡切成一版一版
// （寫法跟 cocktail-party、trip-ledger 一樣：「## 版本號」、底下「- 項目」，「## 未發佈」是已上線還沒發版的）

export interface ChangelogSection {
  /** 版本號，或「未發佈」 */
  version: string;
  items: string[];
}

export const UNRELEASED = '未發佈';

/** 只讀「## 標題」和「- 項目」（項目換行縮排的也接在一起），其他說明文字略過 */
export function parseChangelog(text: string): ChangelogSection[] {
  const sections: ChangelogSection[] = [];
  for (const line of text.split('\n')) {
    const heading = line.match(/^## (.+)$/);
    if (heading) {
      sections.push({ version: heading[1].trim(), items: [] });
      continue;
    }
    const current = sections.at(-1);
    if (!current) continue;
    if (line.startsWith('- ')) current.items.push(line.slice(2).trim());
    else if (/^\s{2,}\S/.test(line) && current.items.length > 0) current.items[current.items.length - 1] += line.trim();
  }
  return sections;
}

/** 頁面上顯示的（沒內容的「未發佈」不顯示） */
export const CHANGELOG = parseChangelog(process.env.NEXT_PUBLIC_CHANGELOG || '').filter((section) => section.items.length > 0);

/** 「**粗體**」拆成一段一段，奇數段是粗體 */
export const splitBold = (text: string): string[] => text.split('**');
