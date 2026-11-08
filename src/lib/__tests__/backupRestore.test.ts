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
});
