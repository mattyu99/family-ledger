import {
  parseMemoNote,
  isMemoTagActive,
  toggleMemoTag,
  encodeMemoMerchantTag,
  decodeMemoMerchantTag,
  parseMemoChecklist,
  toggleChecklistItem,
  getRollingMemoDueInfo,
  isMemoPinned,
  toggleMemoPinnedMerchant,
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

  describe('生活待辦全模式連動邏輯 (Multi-Mode Memo Linkage)', () => {
    it('應支援支出、收入、轉帳與接力待辦各類型之文字與標籤顯示', () => {
      const formatLinkedBadge = (target: { type: string; amount?: number; note?: string; merchant?: string }) => {
        if (target.type === 'income') {
          return `🔗 連動收入：NT$ ${Number(target.amount || 0).toLocaleString()} (${target.note || '收入'}) ›`;
        }
        if (target.type === 'transfer') {
          return `🔗 連動轉帳：NT$ ${Number(target.amount || 0).toLocaleString()} (${target.merchant || target.note || '轉帳'}) ›`;
        }
        if (target.type === 'memo') {
          const parsed = parseMemoNote(target.note || '');
          return `🔗 接力待辦：${parsed.title || target.note} ›`;
        }
        return `🔗 連動支出：NT$ ${Number(target.amount || 0).toLocaleString()} (${target.note || '支出'}) ›`;
      };

      expect(formatLinkedBadge({ type: 'expense', amount: 350, note: '超市採買' })).toBe('🔗 連動支出：NT$ 350 (超市採買) ›');
      expect(formatLinkedBadge({ type: 'income', amount: 5000, note: '兼職收入' })).toBe('🔗 連動收入：NT$ 5,000 (兼職收入) ›');
      expect(formatLinkedBadge({ type: 'transfer', amount: 500, merchant: '存入【智悠遊卡】' })).toBe('🔗 連動轉帳：NT$ 500 (存入【智悠遊卡】) ›');
      expect(formatLinkedBadge({ type: 'memo', note: '[🛒 第二階段] 採買生活耗材' })).toBe('🔗 接力待辦：第二階段 ›');
    });

    it('雙向正反向查找應能精準配對生活待辦與記帳交易', () => {
      const transactions = [
        { id: 'memo-1', type: 'memo', note: '繳水費', linked_transaction_id: 'tx-expense-1' },
        { id: 'tx-expense-1', type: 'expense', amount: 450, linked_transaction_id: 'memo-1' },
        { id: 'memo-2', type: 'memo', note: '發零用錢', linked_transaction_id: 'tx-transfer-2' },
        { id: 'tx-transfer-2', type: 'transfer', amount: 200, linked_transaction_id: 'account-wallet-id' }, // 轉帳之 linked_transaction_id 指向目標帳戶
      ];

      // memo-1 -> tx-expense-1 (正向)
      const target1 = transactions.find(t => t.id === transactions[0].linked_transaction_id);
      expect(target1?.id).toBe('tx-expense-1');

      // tx-transfer-2 -> memo-2 (反向查找)
      const findLinkedMemo = (tx: { id: string; linked_transaction_id?: string }) => {
        if (tx.linked_transaction_id) {
          const direct = transactions.find(t => t.id === tx.linked_transaction_id && t.type === 'memo');
          if (direct) return direct;
        }
        return transactions.find(t => t.type === 'memo' && t.linked_transaction_id === tx.id);
      };

      const memoForTransfer = findLinkedMemo(transactions[3]);
      expect(memoForTransfer?.id).toBe('memo-2');
    });
  });

  describe('記事置頂與退場機制 (isMemoPinned & toggleMemoPinnedMerchant)', () => {
    it('應能正確編碼與解碼 pin:1 標籤', () => {
      const merchant = encodeMemoMerchantTag({
        reminderDate: '2026-11-20',
        isPinned: true,
      });
      expect(merchant).toContain('pin:1');
      const decoded = decodeMemoMerchantTag(merchant);
      expect(decoded.isPinned).toBe(true);
      expect(decoded.reminderDate).toBe('2026-11-20');
    });

    it('未辦妥且帶有置頂標記時 isMemoPinned 應傳回 true', () => {
      const tx = {
        type: 'memo',
        is_settled: false,
        merchant: 'memo|pin:1',
      };
      expect(isMemoPinned(tx)).toBe(true);
    });

    it('核心防呆：一旦事項標記為辦妥 (is_settled: true)，置頂自動解除並傳回 false', () => {
      const tx = {
        type: 'memo',
        is_settled: true,
        merchant: 'memo|pin:1',
      };
      expect(isMemoPinned(tx)).toBe(false);
    });

    it('切換置頂狀態 toggleMemoPinnedMerchant 應能精準新增與移除 pin:1', () => {
      const initial = 'remind:2026-11-14|cal:solar';
      const pinned = toggleMemoPinnedMerchant(initial, true);
      expect(pinned).toContain('pin:1');
      expect(decodeMemoMerchantTag(pinned).isPinned).toBe(true);

      const unpinned = toggleMemoPinnedMerchant(pinned, false);
      expect(unpinned).not.toContain('pin:1');
      expect(decodeMemoMerchantTag(unpinned).isPinned).toBe(false);
    });
  });
});
