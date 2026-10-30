/**
 * 台灣繁體農曆 (陰曆) 與國曆雙向換算及週期推算引擎 (支援 1900 ~ 2100 年)
 * 內建經天文曆法校正之 201 年完整農曆大小月與閏月資料表，零外部套件相依，100% 離線可用。
 */

export type CalendarSystem = 'solar' | 'lunar';
export type MemoRepeatFrequency = 'once' | 'weekly' | 'monthly' | 'lunar_1_15' | 'lunar_2_16' | 'yearly';

export interface LunarDateInfo {
  lunarYear: number;
  lunarMonth: number; // 1 ~ 12
  lunarDay: number; // 1 ~ 30
  isLeapMonth: boolean;
  yearGanZhi: string; // 例如：丙午
  zodiac: string; // 例如：馬
  monthStr: string; // 例如：正月、九月、閏六月
  dayStr: string; // 例如：初一、十五、廿三
  festival?: string; // 傳統節日（如：春節、端午、中秋、除夕）
  cellLabel: string; // 日曆格下方小字（優先顯示節日 -> 初一顯示月份 -> 其餘顯示初幾）
  isHighlight: boolean; // 是否為傳統節日或初一/十五（供日曆格暖色突顯）
  fullLabel: string; // 完整農曆顯示字串（例如：農曆九月初四）
}

// 1900~2100 年農曆資料表 (起始基準日：國曆 1900-01-31 = 農曆 1900年正月初一)
// Bit 16 (0x10000): 閏月為大月(30天)=1, 小月(29天)=0
// Bit 15~4 (0x8000~0x0010): 農曆 1~12 月大小月，大月(30天)=1, 小月(29天)=0
// Bit 3~0 (0x000F): 閏月月份 (0 代表該年無閏月, 1~12 代表閏幾月)
const LUNAR_INFO: number[] = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x18da3, 0x095b0, 0x14977,
  0x04970, 0x0a4b0, 0x1b0b6, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
  0x06566, 0x0d4a0, 0x0ea50, 0x16a95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
  0x06ca0, 0x0b550, 0x15355, 0x04db0, 0x025b0, 0x18573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0,
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x1ad47, 0x0ab60, 0x09570,
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x05ac0, 0x0ab60, 0x096e5, 0x092e0,
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
  0x0a950, 0x0b4a0, 0x0bca4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x05270, 0x0a930,
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4f0, 0x05260, 0x0ea65, 0x0d520,
  0x0daa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0,
  0x092e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,
  0x092d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160,
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252,
  0x0d520,
];

const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const ZODIAC = ['鼠', '牛', '虎', '兔', '龍', '蛇', '馬', '羊', '猴', '雞', '狗', '豬'];

export const LUNAR_MONTH_NAMES = [
  '正月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '冬月', '臘月',
];

export const LUNAR_DAY_NAMES = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
];

/**
 * 取得某農曆年的閏月月份 (0 代表無閏月，1~12 代表閏幾月)
 */
export function getLeapMonth(lunarYear: number): number {
  const idx = lunarYear - 1900;
  if (idx < 0 || idx >= LUNAR_INFO.length) return 0;
  return LUNAR_INFO[idx] & 0xf;
}

/**
 * 取得某農曆年閏月的天數 (29 或 30，無閏月則回傳 0)
 */
export function getLeapMonthDays(lunarYear: number): number {
  if (getLeapMonth(lunarYear) === 0) return 0;
  const idx = lunarYear - 1900;
  return (LUNAR_INFO[idx] & 0x10000) ? 30 : 29;
}

/**
 * 取得某農曆年指定月份的天數 (29 或 30)
 */
export function getLunarMonthDays(lunarYear: number, lunarMonth: number, isLeapMonth = false): number {
  const idx = lunarYear - 1900;
  if (idx < 0 || idx >= LUNAR_INFO.length) return 30;
  if (isLeapMonth) {
    return getLeapMonth(lunarYear) === lunarMonth ? getLeapMonthDays(lunarYear) : 29;
  }
  const clampedMonth = Math.max(1, Math.min(12, lunarMonth));
  return (LUNAR_INFO[idx] & (0x10000 >> clampedMonth)) ? 30 : 29;
}

/**
 * 取得某農曆年的總天數
 */
export function getLunarYearDays(lunarYear: number): number {
  const idx = lunarYear - 1900;
  if (idx < 0 || idx >= LUNAR_INFO.length) return 354;
  let sum = 348; // 12 * 29
  for (let i = 0x8000; i > 0x8; i >>= 1) {
    sum += (LUNAR_INFO[idx] & i) ? 1 : 0;
  }
  return sum + getLeapMonthDays(lunarYear);
}

/**
 * 取得指定農曆年份的所有月份清單（含閏月），供農曆選取器使用
 */
export function getLunarMonthsForYear(lunarYear: number): {
  month: number;
  isLeap: boolean;
  label: string;
  days: number;
}[] {
  const leap = getLeapMonth(lunarYear);
  const result: { month: number; isLeap: boolean; label: string; days: number }[] = [];
  for (let m = 1; m <= 12; m++) {
    const baseName = LUNAR_MONTH_NAMES[m - 1];
    result.push({
      month: m,
      isLeap: false,
      label: baseName,
      days: getLunarMonthDays(lunarYear, m, false),
    });
    if (leap === m) {
      result.push({
        month: m,
        isLeap: true,
        label: `閏${baseName}`,
        days: getLeapMonthDays(lunarYear),
      });
    }
  }
  return result;
}

/**
 * 傳統農曆節慶識別
 */
export function getLunarFestival(
  lunarYear: number,
  lunarMonth: number,
  lunarDay: number,
  isLeapMonth: boolean
): string | undefined {
  if (isLeapMonth) return undefined;
  if (lunarMonth === 1 && lunarDay === 1) return '春節';
  if (lunarMonth === 1 && lunarDay === 9) return '天公生';
  if (lunarMonth === 1 && lunarDay === 15) return '元宵';
  if (lunarMonth === 2 && lunarDay === 2) return '頭牙';
  if (lunarMonth === 3 && lunarDay === 23) return '媽祖生';
  if (lunarMonth === 5 && lunarDay === 5) return '端午';
  if (lunarMonth === 7 && lunarDay === 1) return '鬼門開';
  if (lunarMonth === 7 && lunarDay === 7) return '七夕';
  if (lunarMonth === 7 && lunarDay === 15) return '中元';
  if (lunarMonth === 8 && lunarDay === 15) return '中秋';
  if (lunarMonth === 9 && lunarDay === 9) return '重陽';
  if (lunarMonth === 12 && lunarDay === 8) return '臘八';
  if (lunarMonth === 12 && lunarDay === 16) return '尾牙';
  if (lunarMonth === 12 && lunarDay === 24) return '送神';

  // 除夕：農曆十二月最後一天（29 或 30）
  if (lunarMonth === 12) {
    const lastDay = getLunarMonthDays(lunarYear, 12, false);
    if (lunarDay === lastDay) return '除夕';
  }
  return undefined;
}

/**
 * 解析國曆 Date 或 YYYY-MM-DD 為本地年月日
 */
export function parseSolarYmd(dateOrYmd: Date | string): { year: number; month: number; day: number } {
  if (typeof dateOrYmd === 'string') {
    const clean = dateOrYmd.trim().slice(0, 10);
    const parts = clean.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
        return { year: y, month: m, day: d };
      }
    }
    const parsed = new Date(dateOrYmd);
    if (!isNaN(parsed.getTime())) {
      return { year: parsed.getFullYear(), month: parsed.getMonth() + 1, day: parsed.getDate() };
    }
  } else if (dateOrYmd instanceof Date && !isNaN(dateOrYmd.getTime())) {
    return {
      year: dateOrYmd.getFullYear(),
      month: dateOrYmd.getMonth() + 1,
      day: dateOrYmd.getDate(),
    };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

export function formatSolarYmd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * 國曆轉農曆
 */
export function solarToLunar(dateOrYmd: Date | string): LunarDateInfo {
  const { year, month, day } = parseSolarYmd(dateOrYmd);
  const baseUTC = Date.UTC(1900, 0, 31);
  const targetUTC = Date.UTC(year, month - 1, day);
  let offset = Math.round((targetUTC - baseUTC) / 86400000);

  if (offset < 0) offset = 0;

  let lunarYear = 1900;
  let daysInYear = 0;
  for (lunarYear = 1900; lunarYear <= 2100 && offset > 0; lunarYear++) {
    daysInYear = getLunarYearDays(lunarYear);
    if (offset < daysInYear) break;
    offset -= daysInYear;
  }

  const monthsOfYear = getLunarMonthsForYear(lunarYear);
  let isLeapMonth = false;
  let lunarMonth = 1;

  for (const mObj of monthsOfYear) {
    if (offset < mObj.days) {
      lunarMonth = mObj.month;
      isLeapMonth = mObj.isLeap;
      break;
    }
    offset -= mObj.days;
  }

  const lunarDay = offset + 1;
  const ganIdx = (lunarYear - 4) % 10;
  const zhiIdx = (lunarYear - 4) % 12;
  const yearGanZhi = `${GAN[(ganIdx + 10) % 10]}${ZHI[(zhiIdx + 12) % 12]}`;
  const zodiac = ZODIAC[(zhiIdx + 12) % 12];

  const baseMonthName = LUNAR_MONTH_NAMES[Math.max(0, Math.min(11, lunarMonth - 1))];
  const monthStr = isLeapMonth ? `閏${baseMonthName}` : baseMonthName;
  const dayStr = LUNAR_DAY_NAMES[Math.max(0, Math.min(29, lunarDay - 1))];
  const festival = getLunarFestival(lunarYear, lunarMonth, lunarDay, isLeapMonth);

  const cellLabel = festival || (lunarDay === 1 ? monthStr : dayStr);
  const isHighlight = Boolean(festival) || lunarDay === 1 || lunarDay === 15;
  const fullLabel = `農曆${monthStr}${dayStr}${festival ? ` (${festival})` : ''}`;

  return {
    lunarYear,
    lunarMonth,
    lunarDay,
    isLeapMonth,
    yearGanZhi,
    zodiac,
    monthStr,
    dayStr,
    festival,
    cellLabel,
    isHighlight,
    fullLabel,
  };
}

/**
 * 農曆轉國曆 Date 物件
 */
export function lunarToSolar(
  lunarYear: number,
  lunarMonth: number,
  lunarDay: number,
  isLeapMonth = false
): Date {
  const clampedYear = Math.max(1900, Math.min(2100, lunarYear));
  const clampedMonth = Math.max(1, Math.min(12, lunarMonth));

  let offset = 0;
  for (let y = 1900; y < clampedYear; y++) {
    offset += getLunarYearDays(y);
  }

  const leap = getLeapMonth(clampedYear);
  const effectiveLeap = isLeapMonth && leap === clampedMonth;

  for (let m = 1; m < clampedMonth; m++) {
    offset += getLunarMonthDays(clampedYear, m, false);
    if (leap === m) {
      offset += getLeapMonthDays(clampedYear);
    }
  }

  if (effectiveLeap) {
    offset += getLunarMonthDays(clampedYear, clampedMonth, false);
  }

  const maxDay = getLunarMonthDays(clampedYear, clampedMonth, effectiveLeap);
  const clampedDay = Math.max(1, Math.min(maxDay, lunarDay));
  offset += clampedDay - 1;

  const baseUTC = Date.UTC(1900, 0, 31, 12, 0, 0);
  const targetUTC = new Date(baseUTC + offset * 86400000);
  return new Date(targetUTC.getUTCFullYear(), targetUTC.getUTCMonth(), targetUTC.getUTCDate());
}

/**
 * 農曆轉國曆 YYYY-MM-DD 字串
 */
export function lunarToSolarYmd(
  lunarYear: number,
  lunarMonth: number,
  lunarDay: number,
  isLeapMonth = false
): string {
  const d = lunarToSolar(lunarYear, lunarMonth, lunarDay, isLeapMonth);
  return formatSolarYmd(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/**
 * 推進一個農曆月份（包含閏月序列）
 */
function advanceOneLunarMonth(
  lunarYear: number,
  lunarMonth: number,
  isLeapMonth: boolean
): { lunarYear: number; lunarMonth: number; isLeapMonth: boolean } {
  const leap = getLeapMonth(lunarYear);
  if (!isLeapMonth && leap === lunarMonth) {
    return { lunarYear, lunarMonth, isLeapMonth: true };
  }
  if (lunarMonth < 12) {
    return { lunarYear, lunarMonth: lunarMonth + 1, isLeapMonth: false };
  }
  return { lunarYear: Math.min(2100, lunarYear + 1), lunarMonth: 1, isLeapMonth: false };
}

/**
 * 單步推算下一個週期提醒日期 (YYYY-MM-DD)
 */
function stepNextReminderDate(
  baseYmd: string,
  frequency: MemoRepeatFrequency,
  calendar: CalendarSystem,
  anchorDay?: number
): string {
  const { year, month, day } = parseSolarYmd(baseYmd);

  if (frequency === 'weekly') {
    const d = new Date(year, month - 1, day);
    d.setDate(d.getDate() + 7);
    return formatSolarYmd(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  if (frequency === 'lunar_1_15') {
    const lunar = solarToLunar(baseYmd);
    if (lunar.lunarDay < 15) {
      return lunarToSolarYmd(lunar.lunarYear, lunar.lunarMonth, 15, lunar.isLeapMonth);
    }
    const nextM = advanceOneLunarMonth(lunar.lunarYear, lunar.lunarMonth, lunar.isLeapMonth);
    return lunarToSolarYmd(nextM.lunarYear, nextM.lunarMonth, 1, nextM.isLeapMonth);
  }

  if (frequency === 'lunar_2_16') {
    const lunar = solarToLunar(baseYmd);
    if (lunar.lunarDay < 2) {
      return lunarToSolarYmd(lunar.lunarYear, lunar.lunarMonth, 2, lunar.isLeapMonth);
    }
    if (lunar.lunarDay < 16) {
      return lunarToSolarYmd(lunar.lunarYear, lunar.lunarMonth, 16, lunar.isLeapMonth);
    }
    const nextM = advanceOneLunarMonth(lunar.lunarYear, lunar.lunarMonth, lunar.isLeapMonth);
    return lunarToSolarYmd(nextM.lunarYear, nextM.lunarMonth, 2, nextM.isLeapMonth);
  }

  if (calendar === 'lunar') {
    const lunar = solarToLunar(baseYmd);
    const targetLunarDay = anchorDay || lunar.lunarDay;

    if (frequency === 'monthly') {
      const nextM = advanceOneLunarMonth(lunar.lunarYear, lunar.lunarMonth, lunar.isLeapMonth);
      const maxD = getLunarMonthDays(nextM.lunarYear, nextM.lunarMonth, nextM.isLeapMonth);
      return lunarToSolarYmd(nextM.lunarYear, nextM.lunarMonth, Math.min(targetLunarDay, maxD), nextM.isLeapMonth);
    }

    if (frequency === 'yearly') {
      const nextY = Math.min(2100, lunar.lunarYear + 1);
      const nextLeap = getLeapMonth(nextY);
      const useLeap = lunar.isLeapMonth && nextLeap === lunar.lunarMonth;
      const maxD = getLunarMonthDays(nextY, lunar.lunarMonth, useLeap);
      return lunarToSolarYmd(nextY, lunar.lunarMonth, Math.min(targetLunarDay, maxD), useLeap);
    }
  } else {
    // 國曆 (solar)
    const targetSolarDay = anchorDay || day;

    if (frequency === 'monthly') {
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      const maxDaysInNextMonth = new Date(nextYear, nextMonth, 0).getDate();
      return formatSolarYmd(nextYear, nextMonth, Math.min(targetSolarDay, maxDaysInNextMonth));
    }

    if (frequency === 'yearly') {
      const nextYear = year + 1;
      const maxDaysInMonth = new Date(nextYear, month, 0).getDate();
      return formatSolarYmd(nextYear, month, Math.min(targetSolarDay, maxDaysInMonth));
    }
  }

  return baseYmd;
}

/**
 * 根據當前提醒日期、頻率與曆法基準，推算下一期提醒日期 (YYYY-MM-DD)
 * 若原提醒已逾期較久，會自動往後推算至第一個 >= 今天 且 > 原提醒日 的有效週期日
 */
export function getNextMemoReminderDate(
  currentReminderYmd: string,
  frequency?: MemoRepeatFrequency,
  calendar: CalendarSystem = 'solar',
  todayYmd?: string
): string | null {
  if (!currentReminderYmd || !frequency || frequency === 'once') {
    return null;
  }

  const effectiveCal: CalendarSystem =
    frequency === 'lunar_1_15' || frequency === 'lunar_2_16' ? 'lunar' : calendar;

  const anchorDay =
    effectiveCal === 'lunar'
      ? solarToLunar(currentReminderYmd).lunarDay
      : parseSolarYmd(currentReminderYmd).day;

  const now = new Date();
  const minDateYmd = todayYmd || formatSolarYmd(now.getFullYear(), now.getMonth() + 1, now.getDate());

  let candidate = stepNextReminderDate(currentReminderYmd, frequency, effectiveCal, anchorDay);
  let safetyCounter = 0;

  while (candidate < minDateYmd && safetyCounter < 48) {
    const next = stepNextReminderDate(candidate, frequency, effectiveCal, anchorDay);
    if (next <= candidate) break;
    candidate = next;
    safetyCounter++;
  }

  return candidate;
}

/**
 * 當使用者點選「每月初一＆十五」或「每月初二＆十六」時，
 * 若當前選取日期並非初一/十五（或初二/十六），自動對齊至最近即將到來的那一天
 */
export function getNearestLunarPairDate(
  baseYmd: string,
  pairType: 'lunar_1_15' | 'lunar_2_16'
): string {
  const lunar = solarToLunar(baseYmd);
  if (pairType === 'lunar_1_15') {
    if (lunar.lunarDay === 1 || lunar.lunarDay === 15) return baseYmd;
    if (lunar.lunarDay < 15) {
      return lunarToSolarYmd(lunar.lunarYear, lunar.lunarMonth, 15, lunar.isLeapMonth);
    }
    const nextM = advanceOneLunarMonth(lunar.lunarYear, lunar.lunarMonth, lunar.isLeapMonth);
    return lunarToSolarYmd(nextM.lunarYear, nextM.lunarMonth, 1, nextM.isLeapMonth);
  } else {
    if (lunar.lunarDay === 2 || lunar.lunarDay === 16) return baseYmd;
    if (lunar.lunarDay < 2) {
      return lunarToSolarYmd(lunar.lunarYear, lunar.lunarMonth, 2, lunar.isLeapMonth);
    }
    if (lunar.lunarDay < 16) {
      return lunarToSolarYmd(lunar.lunarYear, lunar.lunarMonth, 16, lunar.isLeapMonth);
    }
    const nextM = advanceOneLunarMonth(lunar.lunarYear, lunar.lunarMonth, lunar.isLeapMonth);
    return lunarToSolarYmd(nextM.lunarYear, nextM.lunarMonth, 2, nextM.isLeapMonth);
  }
}

export interface RepeatOptionItem {
  value: MemoRepeatFrequency;
  label: string;
  shortLabel: string;
  lunarOnly?: boolean;
}

export const REPEAT_OPTIONS: RepeatOptionItem[] = [
  { value: 'once', label: '單次提醒 (不重複)', shortLabel: '單次' },
  { value: 'weekly', label: '每週重複', shortLabel: '🔄 每週' },
  { value: 'monthly', label: '每月重複', shortLabel: '🔄 每月' },
  { value: 'lunar_1_15', label: '農曆每月初一＆十五', shortLabel: '🏮 初一＆十五', lunarOnly: true },
  { value: 'lunar_2_16', label: '農曆每月初二＆十六', shortLabel: '🏮 初二＆十六', lunarOnly: true },
  { value: 'yearly', label: '每年重複', shortLabel: '🔄 每年' },
];

export interface MemoReminderBadgeInfo {
  isLunar: boolean;
  repeatText: string;
  dateText: string;
  fullText: string;
}

/**
 * 格式化記事提醒的友善徽章說明
 * 例如：「🔄 每月 · 農曆十五 (10/24)」或「農曆九月初四 (10/13)」
 */
export function formatMemoReminderBadge(
  reminderDate?: string | null,
  calendar?: CalendarSystem,
  repeat?: MemoRepeatFrequency
): MemoReminderBadgeInfo | null {
  if (!reminderDate) return null;
  const lunar = solarToLunar(reminderDate);
  const { month, day } = parseSolarYmd(reminderDate);
  const shortSolar = `${month}/${day}`;

  const effectiveCal: CalendarSystem =
    repeat === 'lunar_1_15' || repeat === 'lunar_2_16'
      ? 'lunar'
      : (calendar || 'solar');

  let repeatLabel = '';
  if (repeat === 'weekly') repeatLabel = '🔄 每週';
  else if (repeat === 'monthly') repeatLabel = '🔄 每月';
  else if (repeat === 'lunar_1_15') repeatLabel = '🔄 初一/十五';
  else if (repeat === 'lunar_2_16') repeatLabel = '🔄 初二/十六';
  else if (repeat === 'yearly') repeatLabel = '🔄 每年';

  if (effectiveCal === 'lunar') {
    const lunarShort = `農曆${lunar.monthStr}${lunar.dayStr} (${shortSolar})`;
    const fullText = repeatLabel ? `${repeatLabel} · ${lunarShort}` : lunarShort;
    return {
      isLunar: true,
      repeatText: repeatLabel,
      dateText: lunarShort,
      fullText,
    };
  }

  const solarText = `${reminderDate} (農曆${lunar.monthStr}${lunar.dayStr})`;
  const fullText = repeatLabel ? `${repeatLabel} · ${reminderDate}` : `提醒：${reminderDate}`;
  return {
    isLunar: false,
    repeatText: repeatLabel,
    dateText: solarText,
    fullText,
  };
}
