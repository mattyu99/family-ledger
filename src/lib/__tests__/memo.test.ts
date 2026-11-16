import {
  parseMemoNote,
  isMemoTagActive,
  toggleMemoTag,
  encodeMemoMerchantTag,
  decodeMemoMerchantTag,
  parseMemoChecklist,
  toggleChecklistItem,
  parseMemoItemReplies,
  updateChecklistItemReply,
  isChecklistOnlyChange,
  getRollingMemoDueInfo,
  isMemoPinned,
  toggleMemoPinnedMerchant,
  checkMemoPinQuota,
  MAX_PINNED_MEMOS_FAMILY,
  MAX_PINNED_MEMOS_PERSONAL,
  stripMemoInternalTag,
  isValidMerchantName,
  getEffectiveMemoReminderDate,
  BUILTIN_MEMO_TEMPLATES,
  applyChecklistTemplate,
  formatLinkedTransactionSummary,
  isMemoActionTag,
  getMergedMemoTags,
  findMemoTopicTagMatch,
  isSchoolMemoMode,
  appendSchoolChecklistItem,
} from '../memo';
import { hydrateTransactionWithInvoice } from '../ledgerUtils';

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

    it('點擊同一個標籤應維持鎖定選取，安全保留既有標籤不被誤刪除', () => {
      const note = '[🛒 採買清單] 鮮奶';
      const toggled = toggleMemoTag(note, '🛒 採買清單');
      expect(toggled).toBe('[🛒 採買清單] 鮮奶');
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

    it('動作指引按鈕標籤 (+我要買、＋加湊/代領、＋提案/投票) 嚴格禁止被辨識為生活備忘主題標籤', () => {
      expect(isMemoActionTag('+我要買')).toBe(true);
      expect(isMemoActionTag('＋加湊/代領')).toBe(true);
      expect(isMemoActionTag('＋提案/投票')).toBe(true);
      expect(isMemoActionTag('＋ 認領/新任務')).toBe(true);
      expect(isMemoActionTag('🗳️ 家庭投票')).toBe(false);
      expect(isMemoActionTag('🛒 採買清單')).toBe(false);

      // 內文第二行帶有動作指引提示時，絕不可誤判為主題標籤
      const noteWithoutHeaderTag = `賣場：全聯
大家直接點右上方【＋我要買】追加補貨！
- [ ] 鮮奶 / 燕麥奶`;
      const match = findMemoTopicTagMatch(noteWithoutHeaderTag);
      expect(match).toBeNull();

      const parsed = parseMemoNote(noteWithoutHeaderTag);
      expect(parsed.title).toBe('生活記事');
    });

    it('常用標籤合併清單 (getMergedMemoTags) 應主動淨化排除歷史殘留的動作標籤', () => {
      const recent = ['+我要買', '＋加湊/代領', '週末戶外活動', '+提案/投票'];
      const merged = getMergedMemoTags(recent);
      expect(merged).toContain('週末戶外活動');
      expect(merged).not.toContain('+我要買');
      expect(merged).not.toContain('＋加湊/代領');
      expect(merged).not.toContain('+提案/投票');
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
      expect(checklist.items[0]).toMatchObject({ index: 0, completed: false, text: '全脂鮮奶', rawLine: '- [ ] 全脂鮮奶' });
      expect(checklist.items[1]).toMatchObject({ index: 1, completed: true, text: '土司', rawLine: '- [x] 土司' });
      expect(checklist.items[2]).toMatchObject({ index: 2, completed: false, text: '雞蛋一盒', rawLine: '- [ ] 雞蛋一盒' });
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

    it('isChecklistOnlyChange 應正確判斷純打勾切換為 true，文字變更為 false', () => {
      const toggled = toggleChecklistItem(rawNote, 0); // 切換鮮奶
      expect(isChecklistOnlyChange(rawNote, toggled)).toBe(true);
      expect(isChecklistOnlyChange(rawNote, rawNote)).toBe(true);

      const modifiedText = rawNote.replace('全脂鮮奶', '低脂鮮奶');
      expect(isChecklistOnlyChange(rawNote, modifiedText)).toBe(false);

      const addedLine = rawNote + '\n- [ ] 蘋果';
      expect(isChecklistOnlyChange(rawNote, addedLine)).toBe(false);
    });
  });

  describe('待辦子項目成員回覆與留言解析 (parseMemoItemReplies & updateChecklistItemReply)', () => {
    it('parseMemoItemReplies 能精準解析單人回覆與多人分號回覆，並還原純淨項目文字', () => {
      // 1. 單人回覆
      const single = parseMemoItemReplies('鮮奶（智爸：已買全脂2瓶）');
      expect(single.cleanText).toBe('鮮奶');
      expect(single.replies).toEqual([{ memberName: '智爸', text: '已買全脂2瓶' }]);

      // 2. 多人分號回覆
      const multi = parseMemoItemReplies('學校問卷（洋洋：已交給老師；瑩媽：我也簽聯絡簿了）');
      expect(multi.cleanText).toBe('學校問卷');
      expect(multi.replies).toEqual([
        { memberName: '洋洋', text: '已交給老師' },
        { memberName: '瑩媽', text: '我也簽聯絡簿了' },
      ]);

      // 3. 避開一般規格括號（不含人名冒號者不誤判為回覆）
      const spec = parseMemoItemReplies('波霸紅茶拿鐵（微糖微冰）');
      expect(spec.cleanText).toBe('波霸紅茶拿鐵（微糖微冰）');
      expect(spec.replies).toEqual([]);

      // 4. 避開一般金額括號
      const price = parseMemoItemReplies('排骨便當 ($100)');
      expect(price.cleanText).toBe('排骨便當 ($100)');
      expect(price.replies).toEqual([]);

      // 5. 當回覆括號後面仍有金額 $30 時（例如先留言後補金額），仍能精準萃取成員回覆並還原項目與金額
      const replyBeforePrice = parseMemoItemReplies('洋洋：薯條 (智爸：各一份嗎？) $30');
      expect(replyBeforePrice.cleanText).toBe('洋洋：薯條 $30');
      expect(replyBeforePrice.replies).toEqual([{ memberName: '智爸', text: '各一份嗎？' }]);

      // 6. 若回覆括號內帶有歷史殘留或自帶的對話框圖示 (💬/🗨️/🗯️)，應主動淨化剔除，避免 UI 產生重複雙圖示
      const bubbleReply = parseMemoItemReplies('鼎泰豐小籠包 (智爸、瑩媽) (💬 瑩媽：想吃排骨蛋炒飯！)');
      expect(bubbleReply.cleanText).toBe('鼎泰豐小籠包 (智爸、瑩媽)');
      expect(bubbleReply.replies).toEqual([{ memberName: '瑩媽', text: '想吃排骨蛋炒飯！' }]);
    });

    it('updateChecklistItemReply 支援新增、更新與刪除回覆，並正確組裝分號多人語法', () => {
      const note = `[🛒 採買清單]
- [ ] 全脂鮮奶
- [ ] 雞蛋一盒`;

      // 1. 智爸為全脂鮮奶新增回覆 (index 0)
      const step1 = updateChecklistItemReply(note, 0, '智爸', '全聯賣完了');
      expect(step1).toContain('- [ ] 全脂鮮奶（智爸：全聯賣完了）');

      // 2. 瑩媽為全脂鮮奶追加同行回覆 (index 0) -> 自動以分號串接
      const step2 = updateChecklistItemReply(step1, 0, '瑩媽', '好那我下班順路買');
      expect(step2).toContain('- [ ] 全脂鮮奶（智爸：全聯賣完了；瑩媽：好那我下班順路買）');

      // 3. 智爸更新自己的回覆為最新狀態
      const step3 = updateChecklistItemReply(step2, 0, '智爸', '家樂福買到了！');
      expect(step3).toContain('- [ ] 全脂鮮奶（智爸：家樂福買到了！；瑩媽：好那我下班順路買）');

      // 4. 瑩媽清除自己的回覆 (傳入空字串)
      const step4 = updateChecklistItemReply(step3, 0, '瑩媽', '');
      expect(step4).toContain('- [ ] 全脂鮮奶（智爸：家樂福買到了！）');
      expect(step4).not.toContain('瑩媽');

      // 5. 智爸清除自己的回覆 -> 完全還原純文字無括號
      const step5 = updateChecklistItemReply(step4, 0, '智爸', '');
      expect(step5).toContain('- [ ] 全脂鮮奶');
      expect(step5).not.toContain('（');
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
      expect(formatLinkedTransactionSummary({ type: 'expense', amount: 350, note: '超市採買' })).toBe('🔗 連動支出：NT$ 350 (超市採買) ›');
      expect(formatLinkedTransactionSummary({ type: 'income', amount: 5000, note: '兼職收入' })).toBe('🔗 連動收入：NT$ 5,000 (兼職收入) ›');
      expect(formatLinkedTransactionSummary({ type: 'transfer', amount: 500, merchant: '存入【智悠遊卡】' })).toBe('🔗 連動轉帳：NT$ 500 (存入【智悠遊卡】) ›');
      expect(formatLinkedTransactionSummary({ type: 'memo', note: '[🛒 第二階段] 採買生活耗材' })).toBe('🔗 接力待辦：第二階段 ›');
      expect(formatLinkedTransactionSummary({ type: 'memo', note: '[🗳️ 晚餐投票] 投票決定今晚吃什麼' })).toBe('🗳️ 來自投票：晚餐投票 (投票進行中) ›');
      expect(formatLinkedTransactionSummary({ type: 'memo', note: '[🧋 點餐開團] 50嵐飲料開團' })).toBe('🧋 連動開團：50嵐 (等待報單中) ›');
    });

    it('連動開團應支援提取店名與動態報單進度（份數與金額）', () => {
      // 1. 剛開團無人報單
      const newOrder = {
        type: 'memo',
        note: `[🧋 點餐開團] 店家：鮮堡漢堡\n- [ ] 大家直接在下方點「＋我也要 / 登記品項」快速報單！`,
      };
      expect(formatLinkedTransactionSummary(newOrder)).toBe('🧋 連動開團：鮮堡漢堡 (等待報單中) ›');

      // 2. 有人報單且有金額
      const activeOrder = {
        type: 'memo',
        note: `[🧋 點餐開團] 店家：鮮堡漢堡\n- [ ] 智爸：卡啦雞腿堡加蛋 $65\n- [ ] 瑩媽：鮮奶茶大杯微糖 $45`,
      };
      expect(formatLinkedTransactionSummary(activeOrder)).toBe('🧋 連動開團：鮮堡漢堡 (累計 2 份·NT$ 110) ›');

      // 3. 已結案
      const settledOrder = {
        type: 'memo',
        is_settled: true,
        note: `[🧋 點餐開團] 店家：鮮堡漢堡\n- [x] 智爸：卡啦雞腿堡加蛋 $65`,
      };
      expect(formatLinkedTransactionSummary(settledOrder)).toBe('🧋 連動開團：鮮堡漢堡 (已結案) ›');
    });

    it('來自投票應支援提取主題與拍板共識方案', () => {
      // 1. 投票進行中
      const voting = {
        type: 'memo',
        note: `[🗳️ 家庭投票]\n主題：週末聚餐吃什麼？（可直接修改主題）\n- [ ] 🍲 鼎泰豐（智爸 +1）\n- [ ] 🍔 鮮堡漢堡（豆豆、洋洋 +2）`,
      };
      expect(formatLinkedTransactionSummary(voting)).toBe('🗳️ 來自投票：週末聚餐吃什麼？ (領先：鮮堡漢堡 2票) ›');

      // 2. 投票共識拍板結案
      const decided = {
        type: 'memo',
        is_settled: true,
        note: `[🗳️ 家庭投票]\n主題：週末聚餐吃什麼？（可直接修改主題）\n- [x] 🍔 鮮堡漢堡（豆豆、智爸、洋洋 +3）`,
      };
      expect(formatLinkedTransactionSummary(decided)).toBe('🗳️ 來自投票：週末聚餐吃什麼？ (鮮堡漢堡 3票拍板) ›');
    });

    it('協作看板（賣場採買、網購包裹、家事懸賞）連動進度文字呈現', () => {
      // 賣場推車採買
      const grocery = {
        type: 'memo',
        note: `[🛒 採買清單] 賣場：全聯\n- [ ] 鮮奶 2 瓶\n- [ ] 雞蛋 1 盒\n- [x] 吐司 1 條`,
      };
      expect(formatLinkedTransactionSummary(grocery)).toBe('🛒 連動採買：全聯 (待買 2 件) ›');

      // 網購超商包裹
      const parcel = {
        type: 'memo',
        note: `[📦 網購湊單] 超商：蝦皮/7-11\n- [ ] 智爸：手機殼\n- [x] 瑩媽：保溫杯`,
      };
      expect(formatLinkedTransactionSummary(parcel)).toBe('📦 連動包裹：蝦皮/7-11 (待取 1 件) ›');

      // 家事分工
      const chore = {
        type: 'memo',
        note: `[🧹 家事懸賞] 客廳大掃除\n- [ ] 擦桌子 $20\n- [x] 掃地拖地 $50（洋洋）`,
      };
      expect(formatLinkedTransactionSummary(chore)).toBe('🧹 連動家事：客廳大掃除 (1項待認領) ›');
    });

    it('formatLinkedTransactionSummary 應徹底過濾發票中繼標籤與換行，優先顯示商家名稱', () => {
      // 模擬截圖真實場景：含有發票中繼標籤、[辦妥] 前綴與換行備註
      const dirtyTx = {
        type: 'expense',
        amount: 370,
        merchant: 'CoCo',
        note: `[辦妥] 點餐開團\n珍珠奶茶 x1 $55\n[📄 HV-79049445|2026-12|2903|pending|0|]`,
      };
      const formatted = formatLinkedTransactionSummary(dirtyTx);
      expect(formatted).toBe('🔗 連動支出：NT$ 370 (CoCo) ›');
      expect(formatted).not.toContain('HV-79049445');
      expect(formatted).not.toContain('pending');
      expect(formatted).not.toContain('📄');
      expect(formatted).not.toContain('\n');
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

    it('雲端同步持久性：從雲端拉取僅含 merchant 標籤之資料時，水合後置頂標記絕不遺失', () => {
      // 模擬 Supabase 雲端資料庫抓取到的原始 row (DB 中沒有 is_pinned 欄位，標記編碼在 merchant)
      const cloudDbRow = {
        id: 'tx-cloud-1',
        type: 'memo',
        amount: 0,
        merchant: 'remind:2026-11-20|pin:1',
        note: '[📌 重要] 帶爸去三總抽血',
        is_settled: false,
        // is_pinned 為 undefined (Supabase 雲端無此獨立欄位)
      };

      const hydrated = hydrateTransactionWithInvoice(cloudDbRow);
      expect(hydrated.is_pinned).toBe(true);
      expect(isMemoPinned(hydrated)).toBe(true);
    });

    it('應能正確編碼與解碼 tgt:personal 與 tgt:family 適用對象標籤', () => {
      const personalMerchant = encodeMemoMerchantTag({
        reminderDate: '2026-11-20',
        reminderTarget: 'personal',
        isPinned: true,
      });
      expect(personalMerchant).toContain('tgt:personal');
      const decodedPersonal = decodeMemoMerchantTag(personalMerchant);
      expect(decodedPersonal.reminderTarget).toBe('personal');
      expect(decodedPersonal.isPinned).toBe(true);

      const familyMerchant = encodeMemoMerchantTag({
        reminderTarget: 'family',
      });
      expect(familyMerchant).toContain('tgt:family');
      expect(decodeMemoMerchantTag(familyMerchant).reminderTarget).toBe('family');
    });
  });

  describe('生活記事置頂配額限制與防呆測試 (checkMemoPinQuota)', () => {
    it('全家公用置頂上限為 5 筆，達上限時阻擋並回傳親切提示', () => {
      // 構造 5 筆未辦妥之全家公用置頂事項
      const mockTxs = [
        { id: '1', type: 'memo', is_settled: false, is_pinned: true, reminder_target: 'family' },
        { id: '2', type: 'memo', is_settled: false, is_pinned: true, reminder_target: 'family' },
        { id: '3', type: 'memo', is_settled: false, is_pinned: true, reminder_target: 'family' },
        { id: '4', type: 'memo', is_settled: false, is_pinned: true, reminder_target: 'family' },
        { id: '5', type: 'memo', is_settled: false, is_pinned: true, reminder_target: 'family' },
      ];

      const res = checkMemoPinQuota(mockTxs, { targetScope: 'family' });
      expect(res.canPin).toBe(false);
      expect(res.currentCount).toBe(5);
      expect(res.maxLimit).toBe(MAX_PINNED_MEMOS_FAMILY);
      expect(res.errorMessage).toContain('全家公用置頂已達上限（5 筆）');
    });

    it('編輯既有置頂事項時 (傳入 excludeTxId) 應排除自身，允許保存', () => {
      const mockTxs = [
        { id: '1', type: 'memo', is_settled: false, is_pinned: true, reminder_target: 'family' },
        { id: '2', type: 'memo', is_settled: false, is_pinned: true, reminder_target: 'family' },
        { id: '3', type: 'memo', is_settled: false, is_pinned: true, reminder_target: 'family' },
        { id: '4', type: 'memo', is_settled: false, is_pinned: true, reminder_target: 'family' },
        { id: '5', type: 'memo', is_settled: false, is_pinned: true, reminder_target: 'family' },
      ];

      const res = checkMemoPinQuota(mockTxs, { targetScope: 'family', excludeTxId: '3' });
      expect(res.canPin).toBe(true);
      expect(res.currentCount).toBe(4);
    });

    it('已辦妥的事項不計入置頂上限', () => {
      const mockTxs = [
        { id: '1', type: 'memo', is_settled: true, is_pinned: true, reminder_target: 'family' },
        { id: '2', type: 'memo', is_settled: true, is_pinned: true, reminder_target: 'family' },
        { id: '3', type: 'memo', is_settled: false, is_pinned: true, reminder_target: 'family' },
      ];

      const res = checkMemoPinQuota(mockTxs, { targetScope: 'family' });
      expect(res.canPin).toBe(true);
      expect(res.currentCount).toBe(1);
    });

    it('個人專屬置頂上限每人各 5 筆，成員間額度獨立互不干擾', () => {
      // 爸爸 (user-dad) 擁有 5 筆個人置頂
      const mockTxs = [
        { id: 'd1', type: 'memo', is_settled: false, is_pinned: true, reminder_target: 'personal', paid_by: 'user-dad' },
        { id: 'd2', type: 'memo', is_settled: false, is_pinned: true, reminder_target: 'personal', paid_by: 'user-dad' },
        { id: 'd3', type: 'memo', is_settled: false, is_pinned: true, reminder_target: 'personal', paid_by: 'user-dad' },
        { id: 'd4', type: 'memo', is_settled: false, is_pinned: true, reminder_target: 'personal', paid_by: 'user-dad' },
        { id: 'd5', type: 'memo', is_settled: false, is_pinned: true, reminder_target: 'personal', paid_by: 'user-dad' },
        // 媽媽 (user-mom) 只有 1 筆個人置頂
        { id: 'm1', type: 'memo', is_settled: false, is_pinned: true, reminder_target: 'personal', paid_by: 'user-mom' },
      ];

      // 爸爸要再置頂個人備忘 -> 阻擋
      const dadCheck = checkMemoPinQuota(mockTxs, { targetScope: 'personal', memberId: 'user-dad' });
      expect(dadCheck.canPin).toBe(false);
      expect(dadCheck.currentCount).toBe(5);
      expect(dadCheck.maxLimit).toBe(MAX_PINNED_MEMOS_PERSONAL);
      expect(dadCheck.errorMessage).toContain('個人專屬置頂已達上限（5 筆）');

      // 媽媽要置頂個人備忘 -> 通過 (目前僅 1 筆)
      const momCheck = checkMemoPinQuota(mockTxs, { targetScope: 'personal', memberId: 'user-mom' });
      expect(momCheck.canPin).toBe(true);
      expect(momCheck.currentCount).toBe(1);

      // 全家公用置頂依然為 0 筆 -> 通過
      const familyCheck = checkMemoPinQuota(mockTxs, { targetScope: 'family' });
      expect(familyCheck.canPin).toBe(true);
      expect(familyCheck.currentCount).toBe(0);
    });

    it('進行中之五大協作活動 (點餐/開團/投票/懸賞/採買/包裹) 享有配額豁免，完全不佔用常態置頂的 5 筆額度', () => {
      // 構造 3 筆常規靜態置頂備忘 + 3 筆進行中協作看板 (點餐、投票、採買)
      const mockTxs = [
        { id: '1', type: 'memo', is_settled: false, is_pinned: true, reminder_target: 'family', note: '慢箋領藥第2次' },
        { id: '2', type: 'memo', is_settled: false, is_pinned: true, reminder_target: 'family', note: '繳水費電費' },
        { id: '3', type: 'memo', is_settled: false, is_pinned: true, reminder_target: 'family', note: '日常固定備忘' },
        // 以下 3 筆為進行中協作看板，即便帶有 is_pinned 也完全不計入靜態置頂配額
        { id: 'c1', type: 'memo', is_settled: false, is_pinned: true, reminder_target: 'family', note: '[🧋 點餐開團] 50嵐' },
        { id: 'c2', type: 'memo', is_settled: false, is_pinned: true, reminder_target: 'family', note: '[🗳️ 家庭投票] 晚餐吃什麼' },
        { id: 'c3', type: 'memo', is_settled: false, is_pinned: true, reminder_target: 'family', note: '[🛒 採買清單] 全聯採買補貨' },
      ];

      const res = checkMemoPinQuota(mockTxs, { targetScope: 'family' });
      expect(res.canPin).toBe(true);
      // 僅計算 3 筆常態備忘，3 筆協作看板豁免不計入
      expect(res.currentCount).toBe(3);
      expect(res.maxLimit).toBe(MAX_PINNED_MEMOS_FAMILY);
    });
  });

  describe('系統內部中繼標籤剝除與商家合法性過濾 (自癒與防污染機制)', () => {
    it('stripMemoInternalTag 應徹底剝除開頭中繼字串，還原真實使用者記事', () => {
      const dirtyMemo = '[memo|done:8a0505f0-cdd6-4948-9cec-1926805e2e1d|done_at:2026-11-09T10:32:43.983Z] - [x] 洗碗';
      expect(stripMemoInternalTag(dirtyMemo)).toBe('- [x] 洗碗');

      const dirtyRemind = '[remind:2026-11-10|rep:once] 記得繳管理費';
      expect(stripMemoInternalTag(dirtyRemind)).toBe('記得繳管理費');

      const fullWidthDirty = '［memo|pin:1］大掃除工作分配';
      expect(stripMemoInternalTag(fullWidthDirty)).toBe('大掃除工作分配');

      // 多重堆疊內部標籤應全數剝離
      const multiDirty = '[memo|done:abc][remind:2026-11-10] 買醬油';
      expect(stripMemoInternalTag(multiDirty)).toBe('買醬油');

      // 正常使用者自訂主題標籤不應被抹除
      const normalTag = '[🛒 採買清單] 鮮奶、吐司';
      expect(stripMemoInternalTag(normalTag)).toBe('[🛒 採買清單] 鮮奶、吐司');
    });

    it('isValidMerchantName 應精準區分真實商家名稱與系統內部中繼編碼', () => {
      // 合法店家
      expect(isValidMerchantName('全聯福利中心')).toBe(true);
      expect(isValidMerchantName('好市多')).toBe(true);
      expect(isValidMerchantName('台北捷運')).toBe(true);
      expect(isValidMerchantName('7-ELEVEN')).toBe(true);

      // 非法中繼字串 (不得出現在搜尋快捷膠囊或商家統計)
      expect(isValidMerchantName('memo|done:8a0505f0-cdd6-4948-9cec-1926805e2e1d')).toBe(false);
      expect(isValidMerchantName('remind:2026-11-10|rep:once')).toBe(false);
      expect(isValidMerchantName('8a0505f0-cdd6-4948-9cec-1926805e2e1d')).toBe(false);
      expect(isValidMerchantName('2026-11-09T10:32:43.983Z')).toBe(false);
      expect(isValidMerchantName(null)).toBe(false);
      expect(isValidMerchantName('')).toBe(false);
      expect(isValidMerchantName('   ')).toBe(false);
    });

    it('parseMemoChecklist 遇到髒資料時應自動自癒，正確解析清單項目', () => {
      const dirtyChecklistText = '[memo|done:8a0505f0-cdd6-4948-9cec-1926805e2e1d|done_at:2026-11-09T10:32:43.983Z] - [x] 洗碗\n- [ ] 倒垃圾\n- [x] 擦桌子';
      const parsed = parseMemoChecklist(dirtyChecklistText);
      expect(parsed.isChecklist).toBe(true);
      expect(parsed.totalCount).toBe(3);
      expect(parsed.completedCount).toBe(2);
      expect(parsed.items[0].text).toBe('洗碗');
      expect(parsed.items[0].completed).toBe(true);
      expect(parsed.items[1].text).toBe('倒垃圾');
      expect(parsed.items[1].completed).toBe(false);
      expect(parsed.prefixText).toBeUndefined();
    });

    it('hydrateTransactionWithInvoice 應在水合時自癒歷史髒資料', () => {
      const dirtyTx = {
        id: 'tx-123',
        type: 'memo',
        merchant: 'memo|done:8a0505f0-cdd6-4948-9cec-1926805e2e1d|done_at:2026-11-09T10:32:43.983Z',
        note: '[memo|done:8a0505f0-cdd6-4948-9cec-1926805e2e1d|done_at:2026-11-09T10:32:43.983Z] - [x] 洗碗',
      };
      const hydrated = hydrateTransactionWithInvoice(dirtyTx);
      expect(hydrated.note).toBe('- [x] 洗碗');
    });

    describe('getEffectiveMemoReminderDate 智慧接力提醒對齊與自癒', () => {
      const baseDate = new Date(2026, 10, 12); // 2026-11-12

      it('解決歷史舊資料脫節痛點：慢箋未完成時，有效提醒日自動動態對齊最早子任務 (2026-11-08)', () => {
        const tx = {
          reminder_date: '2027-01-09',
          transacted_at: '2026-10-17',
          note: `智116/1/9早28號心臟科\n- [ ] 115/11/8第2次慢籤\n- [ ] 115/12/6第3次慢籤`,
        };
        const effDate = getEffectiveMemoReminderDate(tx, baseDate);
        expect(effDate).toBe('2026-11-08');
      });

      it('領完第2次慢箋打勾後，有效提醒日自動對齊推進至第3次慢箋 (2026-12-06)', () => {
        const tx = {
          reminder_date: '2027-01-09',
          transacted_at: '2026-10-17',
          note: `智116/1/9早28號心臟科\n- [x] 115/11/8第2次慢籤\n- [ ] 115/12/6第3次慢籤`,
        };
        const effDate = getEffectiveMemoReminderDate(tx, baseDate);
        expect(effDate).toBe('2026-12-06');
      });

      it('所有慢箋皆已打勾時，有效提醒日自動推進回主事件/看診日 (2027-01-09)', () => {
        const tx = {
          reminder_date: '2027-01-09',
          transacted_at: '2026-10-17',
          note: `智116/1/9早28號心臟科\n- [x] 115/11/8第2次慢籤\n- [x] 115/12/6第3次慢籤`,
        };
        const effDate = getEffectiveMemoReminderDate(tx, baseDate);
        expect(effDate).toBe('2027-01-09');
      });

      it('嚴格安全防呆門檻：若原先未設提醒，即便子項目有日期，有效提醒日嚴格維持 null', () => {
        const tx = {
          reminder_date: null,
          transacted_at: '2026-10-17',
          note: `智116/1/9早28號心臟科\n- [ ] 115/11/8第2次慢籤\n- [ ] 115/12/6第3次慢籤`,
        };
        const effDate = getEffectiveMemoReminderDate(tx, baseDate);
        expect(effDate).toBeNull();
      });
    });

    describe('applyChecklistTemplate 範本支援純文字前綴 headerText', () => {
      it('點餐開團範本只產出說明純文字，不產生待辦方框', () => {
        const template = BUILTIN_MEMO_TEMPLATES.find(t => t.id === 'group_order_wishlist')!;
        expect(template).toBeDefined();
        const output = applyChecklistTemplate(template);
        expect(output).toContain('[🧋 點餐開團]');
        expect(output).toContain('店家：50嵐（可直接修改店名）');
        expect(output).toContain('大家直接點右上方「＋我也要」快速報單！');
        // 嚴格確保不包含任何待辦方框 - [ ]
        expect(output).not.toContain('- [ ]');
      });
    });

    describe('學校聯絡簿快選組裝器 (School Quick Checklist Builder)', () => {
      it('isSchoolMemoMode 應能識別學校親子與聯絡簿主題', () => {
        expect(isSchoolMemoMode('[🎒 學校親子]')).toBe(true);
        expect(isSchoolMemoMode('洋洋今日聯絡簿')).toBe(true);
        expect(isSchoolMemoMode('[🛒 採買清單] 買鮮奶')).toBe(false);
      });

      it('appendSchoolChecklistItem 應能按順序追加科目＋作業類型與常態項目', () => {
        let note = '';
        note = appendSchoolChecklistItem(note, '數學', '講義');
        expect(note).toBe('[🎒 學校親子]\n- [ ] 數學講義');

        note = appendSchoolChecklistItem(note, '理化', '習作');
        expect(note).toBe('[🎒 學校親子]\n- [ ] 數學講義\n- [ ] 理化習作');

        note = appendSchoolChecklistItem(note, '英文', '單字');
        note = appendSchoolChecklistItem(note, '國文', '注釋');
        note = appendSchoolChecklistItem(note, null, '聯絡簿簽名');
        expect(note).toBe(
          '[🎒 學校親子]\n- [ ] 數學講義\n- [ ] 理化習作\n- [ ] 英文單字\n- [ ] 國文注釋\n- [ ] 聯絡簿簽名'
        );
      });

      it('parseMemoItemReplies 不應將（如：...）或（範圍：...）誤判為成員留言', () => {
        const parsed1 = parseMemoItemReplies('1. 課表特定用具（如：理化實驗衣、體育服、美勞用具）');
        expect(parsed1.replies).toHaveLength(0);
        expect(parsed1.cleanText).toBe('1. 課表特定用具（如：理化實驗衣、體育服、美勞用具）');

        const parsed2 = parseMemoItemReplies('數學小考（範圍：第1-3章）');
        expect(parsed2.replies).toHaveLength(0);
        expect(parsed2.cleanText).toBe('數學小考（範圍：第1-3章）');
      });
    });
  });
});
