import {
  extractDateFromText,
  offsetDateYmd,
  getItemDueDateBadge,
  computeNextRelayReminderDate,
} from '../dateParser';

describe('智慧日期解析引擎 (dateParser)', () => {
  // 固定參考基準日為 2026-11-12 (週四)
  const baseRefDate = new Date(2026, 10, 12, 12, 0, 0); // 10 = 11月

  describe('民國年格式辨識', () => {
    it('能精確辨識使用者截圖真實案例：智116/1/9早28號心臟科', () => {
      const res = extractDateFromText('智116/1/9早28號心臟科', baseRefDate);
      expect(res).not.toBeNull();
      expect(res?.formattedYmd).toBe('2027-01-09');
      expect(res?.year).toBe(2027);
      expect(res?.month).toBe(1);
      expect(res?.day).toBe(9);
      expect(res?.isRocYear).toBe(true);
    });

    it('能辨識：116/1/29洋長庚心智科回診', () => {
      const res = extractDateFromText('116/1/29洋長庚心智科回診', baseRefDate);
      expect(res).not.toBeNull();
      expect(res?.formattedYmd).toBe('2027-01-29');
    });

    it('能辨識慢箋民國年：115/11/8第2次慢箋 與 115/12/6第3次慢箋', () => {
      const res1 = extractDateFromText('115/11/8第2次慢箋', baseRefDate);
      expect(res1?.formattedYmd).toBe('2026-11-08');

      const res2 = extractDateFromText('115/12/6第3次慢箋', baseRefDate);
      expect(res2?.formattedYmd).toBe('2026-12-06');
    });

    it('多重日期出現時，優先抓取最前面的主標題日期 (主事件優先)', () => {
      const note = `智116/1/9早28號心臟科\n115/11/8第2次慢箋\n115/12/6第3次慢箋`;
      const res = extractDateFromText(note, baseRefDate);
      expect(res?.formattedYmd).toBe('2027-01-09');
    });
  });

  describe('月/日簡寫與跨年自動推導', () => {
    it('今年尚未過去的月份採用今年：12/9晚天成回診 ➔ 2026-12-09', () => {
      const res = extractDateFromText('12/9晚天成回診', baseRefDate);
      expect(res?.formattedYmd).toBe('2026-12-09');
    });

    it('近期過去的日期應視為逾期而非明年：基準日11/12時 11/11考歷史 ➔ 2026-11-11 (逾期1天)', () => {
      const res = extractDateFromText('11/11考歷史', baseRefDate);
      expect(res).not.toBeNull();
      expect(res?.formattedYmd).toBe('2026-11-11');
      expect(res?.year).toBe(2026);

      // 驗證倒數標籤為逾期 1 天，絕非還有 364 天
      const badge = getItemDueDateBadge('11/11考歷史', false, baseRefDate);
      expect(badge?.diffDays).toBe(-1);
      expect(badge?.isOverdue).toBe(true);
      expect(badge?.text).toBe('11/11 逾期1天');
    });

    it('今年已過去的遠端月份自動跨至隔年：1/9回診 ➔ 2027-01-09', () => {
      const res = extractDateFromText('1/9回診拿藥', baseRefDate);
      expect(res?.formattedYmd).toBe('2027-01-09');
    });

    it('支援中文月日：12月9號下午回診 ➔ 2026-12-09', () => {
      const res = extractDateFromText('12月9號下午回診', baseRefDate);
      expect(res?.formattedYmd).toBe('2026-12-09');
    });
  });

  describe('相對日期詞', () => {
    it('明天 ➔ 2026-11-13', () => {
      const res = extractDateFromText('明天下午要去銀行換存摺', baseRefDate);
      expect(res?.formattedYmd).toBe('2026-11-13');
    });

    it('後天 ➔ 2026-11-14', () => {
      const res = extractDateFromText('後天記得繳水電費', baseRefDate);
      expect(res?.formattedYmd).toBe('2026-11-14');
    });

    it('大後天 ➔ 2026-11-15', () => {
      const res = extractDateFromText('大後天全家聚餐', baseRefDate);
      expect(res?.formattedYmd).toBe('2026-11-15');
    });
  });

  describe('防呆與序號排除', () => {
    it('課業課次與生字範圍絕不誤判為日期：2-3生', () => {
      const res = extractDateFromText('2-3生', baseRefDate);
      expect(res).toBeNull();

      const badge = getItemDueDateBadge('2-3生', true, baseRefDate);
      expect(badge).toBeNull();
    });

    it('課業頁數與題號範圍不誤判：1-3題、5-6頁', () => {
      expect(extractDateFromText('1-3題', baseRefDate)).toBeNull();
      expect(extractDateFromText('5-6頁', baseRefDate)).toBeNull();
    });

    it('混合日期與作業範圍能精準抓取日期：11/9佳句1-3 ➔ 2026-11-09', () => {
      const res = extractDateFromText('11/9佳句1-3', baseRefDate);
      expect(res).not.toBeNull();
      expect(res?.formattedYmd).toBe('2026-11-09');
    });

    it('純號碼牌或序號不應誤判為日期：門診抽到28號', () => {
      const res = extractDateFromText('門診抽到28號', baseRefDate);
      expect(res).toBeNull();
    });

    it('純金額不應誤判為日期：買菜 100元', () => {
      const res = extractDateFromText('買菜 100元', baseRefDate);
      expect(res).toBeNull();
    });
  });

  describe('offsetDateYmd 提前天數計算', () => {
    it('提前1天', () => {
      expect(offsetDateYmd('2027-01-09', -1)).toBe('2027-01-08');
    });

    it('提前3天', () => {
      expect(offsetDateYmd('2027-01-09', -3)).toBe('2027-01-06');
    });

    it('跨月提前：2027-01-01 提前1天 ➔ 2026-12-31', () => {
      expect(offsetDateYmd('2027-01-01', -1)).toBe('2026-12-31');
    });
  });

  describe('getItemDueDateBadge 子項目動態彩色倒數標籤', () => {
    it('逾期項目：115/11/8 (基準日 11/12) ➔ 逾期 4 天 (紅標)', () => {
      const badge = getItemDueDateBadge('115/11/8第2次慢箋', false, baseRefDate);
      expect(badge).not.toBeNull();
      expect(badge?.isOverdue).toBe(true);
      expect(badge?.text).toContain('逾期4天');
      expect(badge?.formattedYmd).toBe('2026-11-08');
    });

    it('今天到期項目', () => {
      const badge = getItemDueDateBadge('今天回診拿報告', false, baseRefDate);
      expect(badge).not.toBeNull();
      expect(badge?.text).toContain('今天到期');
    });

    it('未來項目：115/12/6 ➔ 還有 24 天', () => {
      const badge = getItemDueDateBadge('115/12/6第3次慢箋', false, baseRefDate);
      expect(badge).not.toBeNull();
      expect(badge?.isOverdue).toBe(false);
      expect(badge?.text).toContain('還有24天');
      expect(badge?.formattedYmd).toBe('2026-12-06');
    });

    it('已完成打勾項目：標示勾選圖示與原日期', () => {
      const badge = getItemDueDateBadge('115/11/8第2次慢箋', true, baseRefDate);
      expect(badge).not.toBeNull();
      expect(badge?.text).toBe('11/8 ✓');
    });

    it('無日期項目：回傳 null', () => {
      const badge = getItemDueDateBadge('買一公升鮮乳', false, baseRefDate);
      expect(badge).toBeNull();
    });
  });

  describe('computeNextRelayReminderDate 接力式推進提醒', () => {
    const rawNote = `智116/1/9早28號心臟科\n[ ] 115/11/8第2次慢箋\n[ ] 115/12/6第3次慢箋`;

    it('子項目皆未打勾時，提醒最早的第2次慢箋 2026-11-08', () => {
      const nextDate = computeNextRelayReminderDate(rawNote, baseRefDate);
      expect(nextDate).toBe('2026-11-08');
    });

    it('第2次慢箋打勾後，自動推進到第3次慢箋 2026-12-06', () => {
      const noteStep2 = `智116/1/9早28號心臟科\n[x] 115/11/8第2次慢箋\n[ ] 115/12/6第3次慢箋`;
      const nextDate = computeNextRelayReminderDate(noteStep2, baseRefDate);
      expect(nextDate).toBe('2026-12-06');
    });

    it('慢箋全部領完打勾後，自動推進到最終回診看診日 2027-01-09', () => {
      const noteStep3 = `智116/1/9早28號心臟科\n[x] 115/11/8第2次慢箋\n[x] 115/12/6第3次慢箋`;
      const nextDate = computeNextRelayReminderDate(noteStep3, baseRefDate);
      expect(nextDate).toBe('2027-01-09');
    });
  });
});
