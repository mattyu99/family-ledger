import {
  parseMemoNote,
  isMemoTagActive,
  toggleMemoTag,
  encodeMemoMerchantTag,
  decodeMemoMerchantTag,
  parseMemoChecklist,
  toggleChecklistItem,
  getRollingMemoDueInfo,
} from '../memo';

describe('生活備忘與待辦清單核心模組測試 (memo.ts)', () => {
  describe('待辦主題標籤解析 (parseMemoNote)', () => {
    it('應能正確解析括號內的生活標籤與 Emoji', () => {
      const res = parseMemoNote('[🛒 採買清單] 鮮奶、雞蛋、土司');
      expect(res.rawTag).toBe('🛒 採買清單');
      expect(res.title).toBe('採買清單');
      expect(res.icon).toBe('🛒');
      expect(res.cleanContent).toBe('鮮奶、雞蛋、土司');
    });

    it('若無標籤應自動預設生活記事圖示', () => {
      const res = parseMemoNote('記得繳瓦斯費');
      expect(res.title).toBe('生活記事');
      expect(res.cleanContent).toBe('記得繳瓦斯費');
    });
  });

  describe('標籤狀態與快速切換 (isMemoTagActive & toggleMemoTag)', () => {
    it('isMemoTagActive 應精準判斷當前備忘是否已被套用該標籤', () => {
      const note = '[💊 用藥提醒] 晚餐後吃維他命';
      expect(isMemoTagActive(note, '💊 用藥提醒')).toBe(true);
      expect(isMemoTagActive(note, '用藥提醒')).toBe(true);
      expect(isMemoTagActive(note, '🛒 採買清單')).toBe(false);
    });

    it('點擊同一個標籤應取消標籤 (移除)', () => {
      const note = '[🛒 採買清單] 鮮奶';
      const toggled = toggleMemoTag(note, '🛒 採買清單');
      expect(toggled).toBe('鮮奶');
    });

    it('點擊不同標籤應直接替換既有標籤', () => {
      const note = '[🛒 採買清單] 鮮奶';
      const toggled = toggleMemoTag(note, '📋 今日代辦');
      expect(toggled).toBe('[📋 今日代辦] 鮮奶');
    });

    it('原本無標籤時應加至最開頭', () => {
      const note = '買衛生紙';
      const toggled = toggleMemoTag(note, '🛒 採買清單');
      expect(toggled).toBe('[🛒 採買清單]\n買衛生紙');
    });
  });

  describe('提醒與完成資訊商戶標籤編解碼 (encodeMemoMerchantTag & decodeMemoMerchantTag)', () => {
    it('應能完整編碼提醒日、重複頻率與辦妥人員', () => {
      const tag = encodeMemoMerchantTag({
        reminderDate: '2026-11-10',
        reminderRepeat: 'weekly',
        completedBy: 'user-dad-uuid',
        completedAt: '2026-11-09T18:00:00.000Z',
      });
      expect(tag).toContain('remind:2026-11-10');
      expect(tag).toContain('rep:weekly');
      expect(tag).toContain('done:user-dad-uuid');
      expect(tag).toContain('done_at:2026-11-09T18:00:00.000Z');
    });

    it('解碼商戶標籤應完整還原屬性', () => {
      const tag = 'remind:2026-11-10|rep:weekly|done:user-dad-uuid|done_at:2026-11-09T18:00:00.000Z';
      const decoded = decodeMemoMerchantTag(tag);
      expect(decoded.isMemo).toBe(true);
      expect(decoded.reminderDate).toBe('2026-11-10');
      expect(decoded.reminderRepeat).toBe('weekly');
      expect(decoded.completedBy).toBe('user-dad-uuid');
      expect(decoded.completedAt).toBe('2026-11-09T18:00:00.000Z');
    });
  });

  describe('Markdown 核取清單解析與打勾切換 (parseMemoChecklist & toggleChecklistItem)', () => {
    const rawNote = `[🛒 採買清單]
- [ ] 全脂鮮奶
- [x] 土司
- [ ] 雞蛋一盒`;

    it('應正確識別清單項數與完成狀態', () => {
      const checklist = parseMemoChecklist(rawNote);
      expect(checklist.isChecklist).toBe(true);
      expect(checklist.items.length).toBe(3);
      expect(checklist.items[0]).toEqual({ index: 0, completed: false, text: '全脂鮮奶', rawLine: '- [ ] 全脂鮮奶' });
      expect(checklist.items[1]).toEqual({ index: 1, completed: true, text: '土司', rawLine: '- [x] 土司' });
      expect(checklist.items[2]).toEqual({ index: 2, completed: false, text: '雞蛋一盒', rawLine: '- [ ] 雞蛋一盒' });
    });

    it('toggleChecklistItem 應能將未完成項目切換為已完成 [x]', () => {
      const toggled = toggleChecklistItem(rawNote, 0); // 切換鮮奶
      const checklist = parseMemoChecklist(toggled);
      expect(checklist.items[0].completed).toBe(true);
    });

    it('toggleChecklistItem 應能將已完成項目取消打勾切換為 [ ]', () => {
      const toggled = toggleChecklistItem(rawNote, 1); // 取消土司
      const checklist = parseMemoChecklist(toggled);
      expect(checklist.items[1].completed).toBe(false);
    });
  });

  describe('待辦到期日狀態推算 (getRollingMemoDueInfo)', () => {
    it('到期日在今天應標註為今天到期 (isToday)', () => {
      const info = getRollingMemoDueInfo('2026-11-05', '2026-11-05');
      expect(info).not.toBeNull();
      expect(info?.isToday).toBe(true);
      expect(info?.daysRemaining).toBe(0);
      expect(info?.badgeText).toBe('今日待辦');
    });

    it('到期日比今天早應標註為已逾期 (isOverdue)', () => {
      const info = getRollingMemoDueInfo('2026-11-01', '2026-11-05');
      expect(info).not.toBeNull();
      expect(info?.isOverdue).toBe(true);
      expect(info?.daysRemaining).toBe(-4);
      expect(info?.badgeText).toBe('逾期 4 天');
    });

    it('到期日在明天應標註為明天到期', () => {
      const info = getRollingMemoDueInfo('2026-11-06', '2026-11-05');
      expect(info).not.toBeNull();
      expect(info?.daysRemaining).toBe(1);
      expect(info?.badgeText).toBe('明日待辦');
    });
  });
});
