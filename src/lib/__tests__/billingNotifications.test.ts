const mockScheduleNotificationAsync = jest.fn(() => Promise.resolve('mock-id'));
const mockCancelScheduledNotificationAsync = jest.fn(() => Promise.resolve());
const mockGetAllScheduledNotificationsAsync = jest.fn(() => Promise.resolve([]));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  getAllScheduledNotificationsAsync: mockGetAllScheduledNotificationsAsync,
  cancelScheduledNotificationAsync: mockCancelScheduledNotificationAsync,
  scheduleNotificationAsync: mockScheduleNotificationAsync,
  SchedulableTriggerInputTypes: {
    DATE: 'date',
  },
  IosAuthorizationStatus: {
    PROVISIONAL: 3,
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  getNotificationPreferences,
  saveNotificationPreferences,
  calculateCardScheduleDates,
  buildBillingReminderGroups,
  computeMemoNotificationTriggers,
  scheduleBillingReminderNotifications,
  scheduleMemoReminderNotifications,
} from '../billingNotifications';
import { PaymentAccount, Transaction, Profile } from '../../types/database';

describe('🔔 統一提醒排程核心測試 (billingNotifications.test.ts)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('預設推播偏好應為：統一 07:30、信用卡出帳與繳款皆開啟且繳款為「前 3 天＋當天」、生活記事為「前一晚 20:00」', () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES).toEqual({
      dailyReminderTime: '07:30',
      billingStatementEnabled: true,
      billingDueEnabled: true,
      billingDueAdvanceMode: '3d_and_day',
      memoAdvanceMode: 'eve_20',
    });
  });

  it('偏好設定讀寫應能合併儲存並套用防呆預設', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
    const initial = await getNotificationPreferences();
    expect(initial.dailyReminderTime).toBe('07:30');

    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(
      JSON.stringify({ dailyReminderTime: '08:00', billingDueEnabled: false })
    );
    const loaded = await getNotificationPreferences();
    expect(loaded.dailyReminderTime).toBe('08:00');
    expect(loaded.billingDueEnabled).toBe(false);
    expect(loaded.memoAdvanceMode).toBe('eve_20');

    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(loaded));
    const saved = await saveNotificationPreferences({ memoAdvanceMode: '1d' });
    expect(saved.dailyReminderTime).toBe('08:00');
    expect(saved.memoAdvanceMode).toBe('1d');
    expect(AsyncStorage.setItem).toHaveBeenCalled();
  });

  describe('calculateCardScheduleDates 信用卡出帳日與繳款期限推算', () => {
    it('有自訂同月繳款截止日時，應精準套用統一鐘點與提前 3 天＋當天', () => {
      // 現在：2026-11-01 06:00，結帳日 5 號、繳款日 22 號（同月）
      const now = new Date(2026, 10, 1, 6, 0, 0, 0);
      const res = calculateCardScheduleDates(
        { billing_cycle_date: 5, payment_due_day: 22 },
        now,
        { dailyReminderTime: '07:30', billingDueAdvanceMode: '3d_and_day' }
      );

      expect(res.billStatementDate).toEqual(new Date(2026, 10, 6, 7, 30, 0, 0));
      expect(res.advanceReminderDate).toEqual(new Date(2026, 10, 19, 7, 30, 0, 0));
      expect(res.dueDayReminderDate).toEqual(new Date(2026, 10, 22, 7, 30, 0, 0));
      expect(res.advanceDays).toBe(3);
      expect(res.includeDueDay).toBe(true);
      expect(res.isDueDayCustom).toBe(true);
    });

    it('繳款截止日小於等於結帳日時，應跨月至次月並於小月自動防溢位', () => {
      // 現在：2026-02-01 06:00，結帳日 20 號、繳款日 5 號（上期 1/20 結帳的帳單，2/5 繳款）
      const now = new Date(2026, 1, 1, 6, 0, 0, 0);
      const res = calculateCardScheduleDates(
        { billing_cycle_date: 20, payment_due_day: 5 },
        now,
        { dailyReminderTime: '07:30', billingDueAdvanceMode: '3d_and_day' }
      );
      expect(res.dueDayReminderDate).toEqual(new Date(2026, 1, 5, 7, 30, 0, 0));
      expect(res.advanceReminderDate).toEqual(new Date(2026, 1, 2, 7, 30, 0, 0));

      // 小月防溢位測試：2026 年 2 月無 31 號，結帳 15 號 + 繳款 31 號 (同月) -> 2/28
      const febNow = new Date(2026, 1, 10, 6, 0, 0, 0);
      const febRes = calculateCardScheduleDates(
        { billing_cycle_date: 15, payment_due_day: 31 },
        febNow,
        { dailyReminderTime: '08:00', billingDueAdvanceMode: '1d' }
      );
      expect(febRes.dueDayReminderDate).toEqual(new Date(2026, 1, 28, 8, 0, 0, 0));
      expect(febRes.advanceReminderDate).toEqual(new Date(2026, 1, 27, 8, 0, 0, 0));
      expect(febRes.includeDueDay).toBe(false);
    });

    it('未設定繳款截止日時沿用結帳日 + 20 天，且當期已過自動推進下一週期', () => {
      // 現在：2026-11-28（當期 11/5 結帳 + 20 = 11/25 已過，應推至下期 12/5 結帳 + 20 = 12/25）
      const now = new Date(2026, 10, 28, 10, 0, 0, 0);
      const res = calculateCardScheduleDates(
        { billing_cycle_date: 5, payment_due_day: null },
        now,
        { dailyReminderTime: '07:30', billingDueAdvanceMode: '3d_and_day' }
      );
      expect(res.isDueDayCustom).toBe(false);
      expect(res.billStatementDate).toEqual(new Date(2026, 11, 6, 7, 30, 0, 0));
      expect(res.dueDayReminderDate).toEqual(new Date(2026, 11, 25, 7, 30, 0, 0));
      expect(res.advanceReminderDate).toEqual(new Date(2026, 11, 22, 7, 30, 0, 0));
    });
  });

  describe('buildBillingReminderGroups 同銀行歸戶合併與分流', () => {
    const accounts: PaymentAccount[] = [
      {
        id: 'esun-1',
        ledger_id: 'led-1',
        name: '玉山 Unicard',
        type: 'credit_card',
        user_id: 'dad',
        issuer_bank: '玉山銀行',
        billing_cycle_date: 15,
        payment_due_day: 2,
        balance: 0,
        sort_order: 1,
        created_at: '',
      },
      {
        id: 'esun-2',
        ledger_id: 'led-1',
        name: '玉山 Ubear',
        type: 'credit_card',
        user_id: 'dad',
        issuer_bank: '玉山銀行',
        billing_cycle_date: 15,
        payment_due_day: 2,
        balance: 0,
        sort_order: 2,
        created_at: '',
      },
      {
        id: 'fubon-mom',
        ledger_id: 'led-1',
        name: '富邦 J 卡',
        type: 'credit_card',
        user_id: 'mom',
        billing_cycle_date: 20,
        balance: 0,
        sort_order: 3,
        created_at: '',
      },
    ];
    const transactions: Transaction[] = [
      {
        id: 'tx-1',
        ledger_id: 'led-1',
        creator_id: 'dad',
        category_id: 'cat-1',
        amount: 1200,
        type: 'expense',
        paid_by: 'dad',
        account_id: 'esun-1',
        is_reconciled: false,
        transacted_at: '2026-11-10T10:00:00.000Z',
        is_settled: false,
        created_at: '',
      },
      {
        id: 'tx-2',
        ledger_id: 'led-1',
        creator_id: 'dad',
        category_id: 'cat-1',
        amount: 800,
        type: 'expense',
        paid_by: 'dad',
        account_id: 'esun-2',
        is_reconciled: false,
        transacted_at: '2026-11-11T10:00:00.000Z',
        is_settled: false,
        created_at: '',
      },
    ];

    it('同持卡人同銀行多張卡片應合併為 1 群組並加總待繳金額，排除其他家庭成員卡片', () => {
      const now = new Date(2026, 10, 1, 6, 0, 0, 0);
      const groups = buildBillingReminderGroups(accounts, transactions, 'dad', undefined, now);
      expect(groups.length).toBe(1);
      expect(groups[0].displayName).toBe('玉山銀行 (2張卡)');
      expect(groups[0].estimatedAmount).toBe(2000);
      expect(groups[0].paymentDueDay).toBe(2);
    });
  });

  describe('computeMemoNotificationTriggers 與雙軌推播去重', () => {
    const now = new Date(2026, 10, 1, 6, 0, 0, 0);

    it('一般記事預設套用「前一晚 20:00 ＋ 當天 07:30」，含拜拜標籤不再重複疊加通知', () => {
      const memo = {
        type: 'memo' as const,
        reminder_date: '2026-11-15',
        note: '[🙏 祭祀拜拜] 農曆初一拜拜準備水果',
        transacted_at: '2026-11-01T00:00:00.000Z',
        created_at: '2026-11-01T00:00:00.000Z',
      };
      const schedule = computeMemoNotificationTriggers(memo, DEFAULT_NOTIFICATION_PREFERENCES, now);
      expect(schedule.dueYmd).toBe('2026-11-15');
      expect(schedule.triggers.length).toBe(2);
      expect(schedule.triggers[0].type).toBe('memo_pre_reminder');
      expect(schedule.triggers[0].date).toEqual(new Date(2026, 10, 14, 20, 0, 0, 0));
      expect(schedule.triggers[1].type).toBe('memo_reminder');
      expect(schedule.triggers[1].date).toEqual(new Date(2026, 10, 15, 7, 30, 0, 0));
    });

    it('接力記事支援「跟隨全域預設」與「單則覆寫 (僅當天 0 / 提前 1 天 -1 / 提前 3 天 -3)」', () => {
      const baseRelay = {
        type: 'memo' as const,
        reminder_date: '2026-11-10',
        reminder_relay: true,
        note: '[💊 慢箋接力] 阿公回診 12/15\n- [ ] 11/10 第2次慢箋\n- [ ] 12/01 第3次慢箋',
        transacted_at: '2026-11-01T00:00:00.000Z',
        created_at: '2026-11-01T00:00:00.000Z',
      };

      // 跟隨全域預設 eve_20 + 07:30
      const followDefault = computeMemoNotificationTriggers(baseRelay, DEFAULT_NOTIFICATION_PREFERENCES, now);
      expect(followDefault.dueYmd).toBe('2026-11-10');
      expect(followDefault.triggers.map(t => t.date)).toEqual([
        new Date(2026, 10, 9, 20, 0, 0, 0),
        new Date(2026, 10, 10, 7, 30, 0, 0),
      ]);
      expect(followDefault.nextStopLabel).toContain('11/10');

      // 單則覆寫 0：僅當天
      const onlySameDay = computeMemoNotificationTriggers(
        { ...baseRelay, reminder_relay_offset: 0 },
        DEFAULT_NOTIFICATION_PREFERENCES,
        now
      );
      expect(onlySameDay.triggers.map(t => t.date)).toEqual([
        new Date(2026, 10, 10, 7, 30, 0, 0),
      ]);

      // 單則覆寫 -3：提前 3 天 07:30 + 當天 07:30
      const threeDays = computeMemoNotificationTriggers(
        { ...baseRelay, reminder_relay_offset: -3 },
        DEFAULT_NOTIFICATION_PREFERENCES,
        now
      );
      expect(threeDays.dueYmd).toBe('2026-11-10');
      expect(threeDays.triggers.map(t => t.date)).toEqual([
        new Date(2026, 10, 7, 7, 30, 0, 0),
        new Date(2026, 10, 10, 7, 30, 0, 0),
      ]);
    });
  });

  describe('排程呼叫端整合（分開子開關控制）', () => {
    it('scheduleBillingReminderNotifications 應遵守出帳與繳款獨立子開關', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('true');
      const cards: PaymentAccount[] = [
        {
          id: 'esun-1',
          ledger_id: 'led-1',
          name: '玉山 Unicard',
          type: 'credit_card',
          user_id: 'dad',
          billing_cycle_date: 28,
          payment_due_day: 15,
          balance: 0,
          sort_order: 1,
          created_at: '',
        },
      ];

      // 只開出帳、關閉繳款
      const stmtOnlyCount = await scheduleBillingReminderNotifications(cards, [], 'dad', undefined, {
        dailyReminderTime: '07:30',
        billingStatementEnabled: true,
        billingDueEnabled: false,
        billingDueAdvanceMode: '3d_and_day',
      });
      expect(stmtOnlyCount).toBe(1);
      expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);
      expect((mockScheduleNotificationAsync.mock.calls[0] as any)[0].content.data.type).toBe('statement_issued');
    });

    it('scheduleMemoReminderNotifications 應僅排程本人與全家未辦妥待辦', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('true');
      const members: Profile[] = [
        { id: 'dad', display_name: '智爸', avatar_url: '👨', role: 'admin' },
        { id: 'mom', display_name: '瑩媽', avatar_url: '👩', role: 'member' },
      ];
      const txs: Transaction[] = [
        {
          id: 'm1',
          ledger_id: 'led-1',
          creator_id: 'dad',
          paid_by: 'dad',
          category_id: 'c1',
          amount: 0,
          type: 'memo',
          reminder_target: 'family',
          reminder_date: '2028-05-10',
          note: '[📌 待辦清單] 繳交水電費',
          transacted_at: '2026-11-01T00:00:00.000Z',
          is_settled: false,
          created_at: '',
        },
        {
          id: 'm2',
          ledger_id: 'led-1',
          creator_id: 'mom',
          paid_by: 'mom',
          category_id: 'c1',
          amount: 0,
          type: 'memo',
          reminder_target: 'personal',
          reminder_date: '2028-05-12',
          note: '[💼 重要備忘] 瑩媽個人體檢',
          transacted_at: '2026-11-01T00:00:00.000Z',
          is_settled: false,
          created_at: '',
        },
      ];

      const count = await scheduleMemoReminderNotifications(txs, members, 'dad', {
        dailyReminderTime: '07:30',
        memoAdvanceMode: 'eve_20',
      });
      // m1 有前一晚 20:00 + 當天 07:30 共 2 則；m2 是瑩媽個人專屬應被排除
      expect(count).toBe(2);
    });
  });
});
