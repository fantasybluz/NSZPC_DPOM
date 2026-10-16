// 出機檢測表的型別與預設項目。
// 架構參考 Bluz Computer Studio（bluz_computer_studio/frontend/src/lib/inspection.ts）：
// 高壓測試一列一個受測對象、記錄溫度功耗；其他項目逐項標「正常／異常／不適用」，最後給結論。
// 預設項目照星辰原本的「出機檢查單」（OCCT、R23、AIDA64 + FurMark、系統驅動、配件）。

export type CheckStatus = 'pass' | 'fail' | 'na';
export type StressStatus = 'pass' | 'warn' | 'fail';
export type Conclusion = 'pass' | 'conditional' | 'fail';
export type Section = 'system' | 'function';

export interface StressRow {
  target: string;   // CPU / GPU / 記憶體 / 硬碟 / 電源 / 整機
  tool: string;     // 測試工具
  duration: string; // 測試時長
  tempMax: number;  // 最高溫度 °C
  powerMax: number; // 最高功耗 W
  clock: string;    // 時脈 / 分數
  extra: string;    // 補充說明
  status: StressStatus;
  note: string;
}

export interface Check {
  section: Section;
  name: string;
  value: string;
  status: CheckStatus;
  note: string;
}

export interface Inspection {
  reportNo: string;
  testDate: string;
  clientName: string;
  machineSpec: string;
  osVersion: string;
  tester: string;
  ambientTemp: number;
  stress: StressRow[];
  checks: Check[];
  conclusion: Conclusion;
  notes: string;
}

const stress = (target: string, tool: string, duration: string, extra = ''): StressRow => ({
  target, tool, duration, tempMax: 0, powerMax: 0, clock: '', extra, status: 'pass', note: '',
});
const check = (section: Section, name: string, value = ''): Check => ({ section, name, value, status: 'pass', note: '' });

export const defaultStress = (): StressRow[] => [
  stress('CPU + RAM', 'OCCT', '1 小時', '無錯誤、無當機'),
  stress('CPU', 'OCCT CPU', '30 分鐘'),
  stress('記憶體', 'OCCT Memory', '30 分鐘', 'XMP / EXPO 已開啟，錯誤 0'),
  stress('CPU', 'OCCT LINPACK', '30 分鐘'),
  stress('GPU', 'OCCT 3D Adaptive', '30 分鐘'),
  stress('GPU', 'OCCT VRAM', '30 分鐘', '錯誤 0'),
  stress('電源', 'OCCT Power', '30 分鐘', '無異音、無斷電'),
  stress('CPU', 'Cinebench R23 Multi Core', '10 分鐘'),
  stress('CPU', 'Cinebench R23 Single Core', '10 分鐘'),
  stress('CPU', 'AIDA64 系統穩定性測試', '3 小時', '無過熱降頻'),
  stress('GPU', 'FurMark', '3 小時', '無破圖、無當機'),
  stress('硬碟', 'AS SSD Benchmark', '單次'),
];

export const defaultChecks = (): Check[] => [
  check('system', '系統安裝', 'Windows 11'),
  check('system', 'BIOS 優化'),
  check('system', '零組件相關驅動程式'),
  check('system', '主機板驅動'),
  check('system', '顯示卡驅動'),
  check('system', '主機板（燈光 / 音效）'),
  check('system', '水冷螢幕驅動'),
  check('system', '硬碟 4K 對齊'),
  check('function', '待機瓦數', 'W'),
  check('function', '滿載瓦數', 'W'),
  check('function', '整體穩定性'),
  check('function', 'Wi-Fi / 藍牙'),
  check('function', '前後音源孔'),
  check('function', '前後 USB'),
  check('function', '燈光同步'),
  check('function', '電源線'),
  check('function', 'Wi-Fi 天線'),
];

export const DEFAULT_NOTES =
  '1. 本檢測表為出機前實測紀錄，數據依當日室溫與環境條件而異。\n' +
  '2. 高壓測試為極端負載，一般使用時的溫度與功耗會低於表中數值。\n' +
  '3. 如發現任何異常請於七日內聯繫，我們協助處理。';

const STRESS_STATUS = new Set(['pass', 'warn', 'fail']);
const CHECK_STATUS = new Set(['pass', 'fail', 'na']);
const SECTIONS = new Set(['system', 'function']);
const CONCLUSIONS = new Set(['pass', 'conditional', 'fail']);

const str = (v: unknown, max = 500): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : 0;
};

/** 檢查並整理前端送來的檢測表；不合法的欄位改成預設值，項目數量有上限 */
export function normalizeInspection(raw: any): Inspection {
  const stressRows = Array.isArray(raw?.stress) ? raw.stress.slice(0, 40) : [];
  const checkRows = Array.isArray(raw?.checks) ? raw.checks.slice(0, 80) : [];
  return {
    reportNo: str(raw?.reportNo, 60),
    testDate: str(raw?.testDate, 20),
    clientName: str(raw?.clientName, 100),
    machineSpec: str(raw?.machineSpec, 2000),
    osVersion: str(raw?.osVersion, 100),
    tester: str(raw?.tester, 100),
    ambientTemp: num(raw?.ambientTemp),
    stress: stressRows.map((r: any) => ({
      target: str(r?.target, 40),
      tool: str(r?.tool, 100),
      duration: str(r?.duration, 40),
      tempMax: num(r?.tempMax),
      powerMax: num(r?.powerMax),
      clock: str(r?.clock, 60),
      extra: str(r?.extra, 200),
      status: STRESS_STATUS.has(r?.status) ? r.status : 'pass',
      note: str(r?.note, 200),
    })),
    checks: checkRows.map((c: any) => ({
      section: SECTIONS.has(c?.section) ? c.section : 'function',
      name: str(c?.name, 100),
      value: str(c?.value, 200),
      status: CHECK_STATUS.has(c?.status) ? c.status : 'pass',
      note: str(c?.note, 200),
    })),
    conclusion: CONCLUSIONS.has(raw?.conclusion) ? raw.conclusion : 'pass',
    notes: str(raw?.notes, 3000),
  };
}
