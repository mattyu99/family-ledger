import { extractDateFromText, offsetDateYmd } from '../dateParser';

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

    it('今年已過去的月份自動跨至隔年：1/9回診 ➔ 2027-01-09', () => {
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
});
