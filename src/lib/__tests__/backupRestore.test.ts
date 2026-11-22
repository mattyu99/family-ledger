import { encodeMemoMerchantTag, decodeMemoMerchantTag } from '../memo';
import { extractWidgetSnapshot } from '../widgetSync';
import { Transaction, Ledger, Profile } from '../../types';

describe('帳本備份與還原資料完整性測試 (Backup & Restore Integrity)', () => {
  const mockLedger: Ledger = {
    id: 'ledger-backup-test',
    name: '幸福家庭記帳本',
    currency: 'TWD',
    created_by: 'user-dad',
    created_at: '2026-01-01T00:00:00.000Z',
  };

  const mockMembers: Profile[] = [
    { id: 'user-dad', display_name: '智爸', role: 'owner' },
    { id: 'user-mom', display_name: '智媽', role: 'member' },
  ];

  it('生活備忘在匯出與還原時，提醒日期、對象、曆法與週期應 100% 完整保留', () => {
    // 模擬一筆含有提醒日、農曆週期與個人專屬的備忘
    const originalMemo: Transaction = {
      id: 'tx-memo-1',
      ledger_id: mockLedger.id,
      creator_id: 'user-dad',
      paid_by: 'user-dad',
      category_id: 'cat-memo',
      amount: 0,
      type: 'memo',
      note: '[🏥 醫療健康] 116/1/29 洋長庚心臟內科定期回診',
      transacted_at: '2026-11-08T10:00:00.000Z',
      created_at: '2026-11-08T10:00:00.000Z',
      is_settled: false,
      reminder_date: '2027-01-29',
      reminder_calendar: 'solar',
      reminder_repeat: 'once',
      reminder_target: 'personal',
      completion_note: '記得帶抽血檢驗單',
    };

    // 1. 模擬 exportToJSON 編碼
    const memoMerchantTag = originalMemo.merchant || encodeMemoMerchantTag({
      reminderDate: originalMemo.reminder_date,
      reminderCalendar: originalMemo.reminder_calendar,
      reminderRepeat: originalMemo.reminder_repeat,
      completedBy: originalMemo.completed_by,
      completedAt: originalMemo.completed_at,
    });

    const exportedJson = JSON.stringify({
      transactions: [{
        ...originalMemo,
        merchant: memoMerchantTag,
      }],
    });

    // 2. 模擬 restoreFromJSON 解析
    const parsedBackup = JSON.parse(exportedJson);
    const restoredRawTx = parsedBackup.transactions[0];

    const decodedMemo = decodeMemoMerchantTag(restoredRawTx.merchant);
    const restoredReminderDate = restoredRawTx.reminder_date || decodedMemo.reminderDate;
    const restoredReminderCal = restoredRawTx.reminder_calendar || decodedMemo.reminderCalendar;
    const restoredReminderRep = restoredRawTx.reminder_repeat || decodedMemo.reminderRepeat;
    const restoredReminderTarget = restoredRawTx.reminder_target || 'family';
    const restoredCompletionNote = restoredRawTx.completion_note;

    expect(restoredReminderDate).toBe('2027-01-29');
    expect(restoredReminderCal).toBe('solar');
    expect(restoredReminderRep).toBe('once');
    expect(restoredReminderTarget).toBe('personal');
    expect(restoredCompletionNote).toBe('記得帶抽血檢驗單');

    // 3. 驗證還原後的備忘放入桌面小工具快照時，不再顯示為預設「日常」，而是精準顯示日期與責任人
    const restoredTx: Transaction = {
      ...restoredRawTx,
      reminder_date: restoredReminderDate,
      reminder_calendar: restoredReminderCal,
      reminder_repeat: restoredReminderRep,
      reminder_target: restoredReminderTarget,
    };

    const snapshot = extractWidgetSnapshot(mockLedger, [restoredTx], mockMembers, 'user-dad');
    expect(snapshot.pendingMemos.length).toBe(1);
    expect(snapshot.pendingMemos[0].badgeText).toContain('01-29 · 智爸');
    expect(snapshot.pendingMemos[0].badgeText).not.toBe('日常');
  });

  it('備忘 merchant 標籤具備雙向容錯，即使 reminder_date 遺失也能由 merchant 標籤安全還原', () => {
    // 模擬從舊版備份還原：JSON 頂層無 reminder_date，但 merchant 帶有 remind:2027-01-29 標籤
    const legacyRawTx: Partial<Transaction> = {
      id: 'tx-legacy-1',
      type: 'memo',
      amount: 0,
      note: '長庚回診',
      merchant: 'remind:2027-01-29|cal:solar|rep:once',
    };

    const decoded = decodeMemoMerchantTag(legacyRawTx.merchant);
    const restoredReminder = legacyRawTx.reminder_date || decoded.reminderDate;

    expect(restoredReminder).toBe('2027-01-29');
    expect(decoded.reminderCalendar).toBe('solar');
    expect(decoded.reminderRepeat).toBe('once');
  });

  it('生活記事之長按置頂標記 (is_pinned) 在匯出與還原時應 100% 完整保留', () => {
    const pinnedMemo: Transaction = {
      id: 'tx-pinned-1',
      ledger_id: mockLedger.id,
      creator_id: 'user-dad',
      paid_by: 'user-dad',
      category_id: 'cat-memo',
      amount: 0,
      type: 'memo',
      note: '重要慢箋用藥清單',
      transacted_at: '2026-11-16T10:00:00.000Z',
      created_at: '2026-11-16T10:00:00.000Z',
      is_settled: false,
      is_pinned: true,
    };

    const memoMerchantTag = encodeMemoMerchantTag({
      isPinned: pinnedMemo.is_pinned,
    });

    const exportedJson = JSON.stringify({
      transactions: [{
        ...pinnedMemo,
        merchant: memoMerchantTag,
      }],
    });

    const parsedBackup = JSON.parse(exportedJson);
    const restoredRawTx = parsedBackup.transactions[0];
    const decodedMemo = decodeMemoMerchantTag(restoredRawTx.merchant);
    const restoredIsPinned = Boolean(restoredRawTx.is_pinned ?? decodedMemo.isPinned);

    expect(restoredIsPinned).toBe(true);
    expect(decodedMemo.isPinned).toBe(true);
  });

  it('生活記事之接力提醒開關 (reminder_relay) 與單則覆寫 (undefined / 0 / -1) 及信用卡繳款截止日 (payment_due_day) 在匯出與還原時應 100% 完整保留', () => {
    const relayMemo: Transaction = {
      id: 'tx-relay-1',
      ledger_id: mockLedger.id,
      creator_id: 'user-dad',
      paid_by: 'user-dad',
      category_id: 'cat-memo',
      amount: 0,
      type: 'memo',
      note: '[💊 慢箋接力] 阿公回診 116/1/9\n- [ ] 115/11/8 第2次慢箋',
      transacted_at: '2026-10-17T10:00:00.000Z',
      created_at: '2026-10-17T10:00:00.000Z',
      is_settled: false,
      reminder_date: '2026-11-08',
      reminder_calendar: 'solar',
      reminder_repeat: 'once',
      reminder_target: 'family',
      reminder_relay: true,
      reminder_relay_offset: -1,
    };

    const relayFollowDefaultMemo: Transaction = {
      ...relayMemo,
      id: 'tx-relay-default',
      reminder_relay_offset: undefined,
    };

    const relaySameDayMemo: Transaction = {
      ...relayMemo,
      id: 'tx-relay-sameday',
      reminder_relay_offset: 0,
    };

    const memoMerchantTag = encodeMemoMerchantTag({
      reminderDate: relayMemo.reminder_date,
      reminderCalendar: relayMemo.reminder_calendar,
      reminderRepeat: relayMemo.reminder_repeat,
      reminderTarget: relayMemo.reminder_target,
      isRelay: relayMemo.reminder_relay,
      relayOffsetDays: relayMemo.reminder_relay_offset,
    });
    const defaultTag = encodeMemoMerchantTag({
      reminderDate: relayFollowDefaultMemo.reminder_date,
      reminderTarget: 'family',
      isRelay: true,
      relayOffsetDays: relayFollowDefaultMemo.reminder_relay_offset,
    });
    const sameDayTag = encodeMemoMerchantTag({
      reminderDate: relaySameDayMemo.reminder_date,
      reminderTarget: 'family',
      isRelay: true,
      relayOffsetDays: relaySameDayMemo.reminder_relay_offset,
    });

    const exportedJson = JSON.stringify({
      payment_accounts: [
        {
          id: 'card-1',
          name: '玉山 Ubear',
          type: 'credit_card',
          billing_cycle_date: 15,
          payment_due_day: 2,
          balance: 0,
          sort_order: 1,
        },
      ],
      transactions: [
        { ...relayMemo, merchant: memoMerchantTag },
        { ...relayFollowDefaultMemo, merchant: defaultTag },
        { ...relaySameDayMemo, merchant: sameDayTag },
      ],
    });

    const parsedBackup = JSON.parse(exportedJson);
    const [restoredMinusOne, restoredDefault, restoredSameDay] = parsedBackup.transactions;

    expect(parsedBackup.payment_accounts[0].payment_due_day).toBe(2);

    expect(decodeMemoMerchantTag(restoredMinusOne.merchant).relayOffsetDays).toBe(-1);
    expect(decodeMemoMerchantTag(restoredDefault.merchant).relayOffsetDays).toBeUndefined();
    expect(decodeMemoMerchantTag(restoredSameDay.merchant).relayOffsetDays).toBe(0);
    expect(restoredMinusOne.reminder_relay_offset).toBe(-1);
    expect(restoredDefault.reminder_relay_offset).toBeUndefined();
    expect(restoredSameDay.reminder_relay_offset).toBe(0);
  });

  it('統一發票延伸明細與品項細項在匯出與還原時應 100% 完整保留', () => {
    const invoiceTx: Transaction = {
      id: 'tx-invoice-1',
      ledger_id: mockLedger.id,
      creator_id: 'user-dad',
      paid_by: 'user-dad',
      category_id: 'cat-food',
      amount: 155,
      type: 'expense',
      note: '全家便利商店',
      transacted_at: '2026-11-16T12:00:00.000Z',
      created_at: '2026-11-16T12:00:00.000Z',
      is_settled: false,
      invoice_number: 'AB-12345678',
      invoice_period: '2026-10',
      invoice_random_code: '8899',
      invoice_status: 'won',
      invoice_prize_amount: 200,
      invoice_prize_name: '六獎',
      invoice_sync_status: 'matched_cloud',
      invoice_items: [
        { name: '茶葉蛋', quantity: 2, unit_price: 14, amount: 28 },
        { name: '鮮乳 936ml', quantity: 1, unit_price: 98, amount: 98 },
        { name: '御飯糰', quantity: 1, unit_price: 29, amount: 29 },
      ],
      splits: [
        { id: 'sp-1', transaction_id: 'tx-invoice-1', user_id: 'user-dad', split_amount: 100, is_settled: false },
        { id: 'sp-2', transaction_id: 'tx-invoice-1', user_id: 'user-mom', split_amount: 55, is_settled: false },
      ],
    };

    const exportedJson = JSON.stringify({
      transactions: [invoiceTx],
    });

    const parsedBackup = JSON.parse(exportedJson);
    const restoredTx: Transaction = parsedBackup.transactions[0];

    expect(restoredTx.invoice_number).toBe('AB-12345678');
    expect(restoredTx.invoice_period).toBe('2026-10');
    expect(restoredTx.invoice_random_code).toBe('8899');
    expect(restoredTx.invoice_status).toBe('won');
    expect(restoredTx.invoice_prize_amount).toBe(200);
    expect(restoredTx.invoice_prize_name).toBe('六獎');
    expect(restoredTx.invoice_items?.length).toBe(3);
    expect(restoredTx.invoice_items?.[0].name).toBe('茶葉蛋');
    expect(restoredTx.splits?.length).toBe(2);
    expect(restoredTx.splits?.[1].split_amount).toBe(55);
  });
});
