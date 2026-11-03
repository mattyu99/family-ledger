import {
  parseSolarYmd,
  formatSolarYmd,
  solarToLunar,
  lunarToSolarYmd,
  getNextMemoReminderDate,
} from '../lunar';

describe('國曆農曆轉換與節氣提醒推算模組 (lunar.ts)', () => {
  describe('國曆日期解析與格式化', () => {
    it('應正確解析 YYYY-MM-DD 字串', () => {
      const res = parseSolarYmd('2026-11-05');
      expect(res).toEqual({ year: 2026, month: 11, day: 5 });
    });

    it('應正確將年月日格式化為兩位數填充字串', () => {
      expect(formatSolarYmd(2026, 3, 8)).toBe('2026-03-08');
    });
  });

  describe('國曆與農曆互轉精確度 (solarToLunar & lunarToSolarYmd)', () => {
    it('2026 年中秋節 (國曆 2026-09-25) 應對應農曆八月十五', () => {
      const lunar = solarToLunar('2026-09-25');
      expect(lunar.lunarYear).toBe(2026);
      expect(lunar.lunarMonth).toBe(8);
      expect(lunar.lunarDay).toBe(15);
      expect(lunar.festival).toBe('中秋');
    });

    it('農曆八月十五逆向轉回國曆應為 2026-09-25', () => {
      const solarYmd = lunarToSolarYmd(2026, 8, 15, false);
      expect(solarYmd).toBe('2026-09-25');
    });

    it('2026 年端午節 (國曆 2026-06-19) 應對應農曆五月初五', () => {
      const lunar = solarToLunar('2026-06-19');
      expect(lunar.lunarMonth).toBe(5);
      expect(lunar.lunarDay).toBe(5);
      expect(lunar.festival).toBe('端午');
    });
  });

  describe('待辦事項下期提醒日推算 (getNextMemoReminderDate)', () => {
    it('每週重複 (weekly) 應精準往後遞延 7 天', () => {
      const nextDate = getNextMemoReminderDate('2026-11-05', 'weekly', 'solar', '2026-11-05');
      expect(nextDate).toBe('2026-11-12');
    });

    it('國曆每月重複 (monthly) 應維持相同日期', () => {
      const nextDate = getNextMemoReminderDate('2026-11-05', 'monthly', 'solar', '2026-11-05');
      expect(nextDate).toBe('2026-12-05');
    });

    it('農曆初一與十五拜拜提醒 (lunar_1_15) 在初一時應接力推算至同月十五', () => {
      // 2026-09-11 為農曆八月初一
      const nextDate = getNextMemoReminderDate('2026-09-11', 'lunar_1_15', 'lunar', '2026-09-11');
      // 下一期應為農曆八月十五 (2026-09-25 中秋)
      expect(nextDate).toBe('2026-09-25');
    });

    it('一次性待辦 (once) 應回傳 null (不自動續排)', () => {
      const nextDate = getNextMemoReminderDate('2026-11-05', 'once', 'solar', '2026-11-05');
      expect(nextDate).toBeNull();
    });
  });
});
