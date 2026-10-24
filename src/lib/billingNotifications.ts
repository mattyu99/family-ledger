import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { PaymentAccount, Transaction, Profile } from '../types/database';
import { parseMemoNote } from './memo';

const BILLING_NOTIFICATIONS_STORAGE_KEY = '@family_ledger_billing_notifications_enabled';
const MEMO_NOTIFICATIONS_STORAGE_KEY = '@family_ledger_memo_notifications_enabled';

// 初始化前景通知呈現行為 (僅限非 Web 環境)
if (Platform.OS !== 'web') {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch (e) {
    console.warn('[Notifications] 初始化通知處理器失敗:', e);
  }
}

/**
 * 檢查目前裝置平台是否支援本機通知
 */
export const isNotificationSupported = (): boolean => {
  return Platform.OS === 'ios' || Platform.OS === 'android';
};

/**
 * 取得使用者是否啟用了信用卡帳單與繳款日提醒
 */
export const getBillingNotificationsEnabled = async (): Promise<boolean> => {
  try {
    const value = await AsyncStorage.getItem(BILLING_NOTIFICATIONS_STORAGE_KEY);
    return value === 'true';
  } catch {
    return false;
  }
};

/**
 * 儲存信用卡帳單推播啟用狀態
 */
export const setBillingNotificationsEnabled = async (enabled: boolean): Promise<void> => {
  try {
    await AsyncStorage.setItem(BILLING_NOTIFICATIONS_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch (e) {
    console.warn('[BillingNotification] 儲存通知設定失敗:', e);
  }
};

/**
 * 取得使用者是否啟用了生活記事與待辦到期提醒
 */
export const getMemoNotificationsEnabled = async (): Promise<boolean> => {
  try {
    const value = await AsyncStorage.getItem(MEMO_NOTIFICATIONS_STORAGE_KEY);
    return value === 'true';
  } catch {
    return false;
  }
};

/**
 * 儲存生活記事與待辦推播啟用狀態
 */
export const setMemoNotificationsEnabled = async (enabled: boolean): Promise<void> => {
  try {
    await AsyncStorage.setItem(MEMO_NOTIFICATIONS_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch (e) {
    console.warn('[MemoNotification] 儲存通知設定失敗:', e);
  }
};

/**
 * 請求推播通知權限
 */
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!isNotificationSupported()) {
    return false;
  }

  try {
    const settings = await Notifications.getPermissionsAsync();
    if (settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
      return true;
    }

    const requested = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });

    return Boolean(
      requested.granted || requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
    );
  } catch (e) {
    console.warn('[Notifications] 請求推播權限例外:', e);
    return false;
  }
};

/**
 * 清除所有信用卡類型的既有本機排程通知 (不干擾記事通知)
 */
export const cancelBillingScheduledNotifications = async (): Promise<void> => {
  if (!isNotificationSupported()) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const item of scheduled) {
      const type = item.content.data?.type;
      if (type === 'statement_issued' || type === 'payment_due_soon') {
        await Notifications.cancelScheduledNotificationAsync(item.identifier);
      }
    }
  } catch (e) {
    console.warn('[BillingNotification] 取消信用卡排程失敗:', e);
  }
};

/**
 * 清除所有生活記事類型的既有本機排程通知 (不干擾信用卡通知)
 */
export const cancelMemoScheduledNotifications = async (): Promise<void> => {
  if (!isNotificationSupported()) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const item of scheduled) {
      const type = item.content.data?.type;
      if (type === 'memo_reminder' || type === 'memo_pre_reminder') {
        await Notifications.cancelScheduledNotificationAsync(item.identifier);
      }
    }
  } catch (e) {
    console.warn('[MemoNotification] 取消記事排程失敗:', e);
  }
};

/**
 * 計算指定信用卡的待繳帳單金額 (未對帳或本期消費總額)
 */
export const calculateCardOutstandingAmount = (
  cardId: string,
  transactions: Transaction[]
): number => {
  return transactions
    .filter(
      t =>
        t.account_id === cardId &&
        t.type === 'expense' &&
        t.is_reconciled !== true
    )
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
};

export interface CardNotificationSchedule {
  cardId: string;
  cardName: string;
  billStatementDate: Date; // 出帳日隔天
  paymentDueDate: Date;    // 繳款截止日
  reminderDueDate: Date;   // 繳款截止日前 3 天
  estimatedAmount: number;
}

/**
 * 計算信用卡的下一次出帳日與繳款提醒日
 */
export const calculateCardScheduleDates = (
  card: PaymentAccount,
  now: Date = new Date()
): { billStatementDate: Date; paymentDueDate: Date; reminderDueDate: Date } => {
  const cycleDate = Math.max(1, Math.min(31, card.billing_cycle_date || 15));
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentDay = now.getDate();

  let statementTargetYear = currentYear;
  let statementTargetMonth = currentMonth;
  if (currentDay > cycleDate + 1) {
    statementTargetMonth += 1;
  }
  const billStatementDate = new Date(statementTargetYear, statementTargetMonth, cycleDate + 1, 9, 30, 0, 0);

  const baseCycleYear = currentYear;
  const baseCycleMonth = currentMonth;
  const paymentDueDate = new Date(baseCycleYear, baseCycleMonth, cycleDate + 20, 23, 59, 59, 0);

  const reminderDueDate = new Date(paymentDueDate.getTime() - 3 * 24 * 60 * 60 * 1000);
  reminderDueDate.setHours(9, 30, 0, 0);

  return {
    billStatementDate,
    paymentDueDate,
    reminderDueDate,
  };
};

/**
 * 重新排程所有信用卡的本機到期提醒通知
 */
export const scheduleBillingReminderNotifications = async (
  paymentAccounts: PaymentAccount[],
  transactions: Transaction[]
): Promise<number> => {
  if (!isNotificationSupported()) return 0;

  try {
    const isEnabled = await getBillingNotificationsEnabled();
    if (!isEnabled) {
      await cancelBillingScheduledNotifications();
      return 0;
    }

    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) return 0;

    // 清空舊信用卡排程
    await cancelBillingScheduledNotifications();

    const creditCards = paymentAccounts.filter(acc => acc.type === 'credit_card');
    if (creditCards.length === 0) return 0;

    let scheduledCount = 0;
    const now = new Date();

    for (const card of creditCards) {
      const { billStatementDate, paymentDueDate, reminderDueDate } = calculateCardScheduleDates(card, now);
      const amount = calculateCardOutstandingAmount(card.id, transactions);
      const amountText = amount > 0 ? `NT$ ${amount.toLocaleString()}` : '請見銀行帳單';
      const dueDayText = `${paymentDueDate.getMonth() + 1}月${paymentDueDate.getDate()}號`;

      // 1. 出帳日隔天推播 (09:30)
      if (billStatementDate.getTime() > now.getTime()) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `💳 ${card.name} 帳單已出帳`,
            body: `您的 ${card.name} 本期帳單已出帳，應繳約 ${amountText}，請記得於 ${dueDayText} 前繳納！`,
            sound: true,
            data: { cardId: card.id, type: 'statement_issued' },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: billStatementDate,
          },
        });
        scheduledCount++;
      }

      // 2. 繳款日前 3 天提醒推播 (09:30)
      if (reminderDueDate.getTime() > now.getTime()) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `⏰ ${card.name} 繳款期限將至`,
            body: `提醒您：${card.name} 帳單將於 3 天後 (${dueDayText}) 到期，待繳金額約 ${amountText}，請及早安排扣款！`,
            sound: true,
            data: { cardId: card.id, type: 'payment_due_soon' },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: reminderDueDate,
          },
        });
        scheduledCount++;
      }
    }

    console.log(`[BillingNotification] 成功排程 ${scheduledCount} 則信用卡提醒推播`);
    return scheduledCount;
  } catch (err) {
    console.warn('[BillingNotification] 排程推播通知例外:', err);
    return 0;
  }
};

/**
 * 重新排程所有未完成生活記事的本機提醒通知
 */
export const scheduleMemoReminderNotifications = async (
  transactions: Transaction[],
  members?: Profile[]
): Promise<number> => {
  if (!isNotificationSupported()) return 0;

  try {
    const isEnabled = await getMemoNotificationsEnabled();
    if (!isEnabled) {
      await cancelMemoScheduledNotifications();
      return 0;
    }

    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) return 0;

    // 清理既有的生活記事排程
    await cancelMemoScheduledNotifications();

    const pendingMemos = transactions.filter(
      t => t.type === 'memo' && !t.is_settled && !!t.reminder_date
    );
    if (pendingMemos.length === 0) return 0;

    let scheduledCount = 0;
    const now = new Date();

    for (const memo of pendingMemos) {
      const dateParts = (memo.reminder_date || '').split('-');
      if (dateParts.length !== 3) continue;

      const y = parseInt(dateParts[0], 10);
      const m = parseInt(dateParts[1], 10) - 1;
      const d = parseInt(dateParts[2], 10);
      if (isNaN(y) || isNaN(m) || isNaN(d)) continue;

      // 提醒日當天上午 09:00
      const reminderDate = new Date(y, m, d, 9, 0, 0, 0);

      // 解析標題與內文
      const parsed = parseMemoNote(memo.note);
      const icon = parsed.icon || '📌';
      const title = parsed.title || '生活待辦';
      const cleanContent = parsed.cleanContent || memo.note || '';

      // 責任成員稱謂
      let assigneeText = '';
      if (memo.paid_by && members && members.length > 0) {
        const matched = members.find(u => u.id === memo.paid_by);
        if (matched) assigneeText = ` · 負責人：${matched.display_name}`;
      }

      if (reminderDate.getTime() > now.getTime()) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `${icon} 生活記事提醒：【${title}】`,
            body: `${cleanContent}${assigneeText}`,
            sound: true,
            data: { memoId: memo.id, type: 'memo_reminder' },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: reminderDate,
          },
        });
        scheduledCount++;
      }

      // 特殊重要標籤（例如祭祀拜拜、紀念日、生日）前一天 20:00 預警
      const isImportantTag =
        title.includes('拜拜') ||
        title.includes('祭祀') ||
        title.includes('紀念日') ||
        title.includes('生日') ||
        title.includes('繳費');

      if (isImportantTag) {
        const preReminderDate = new Date(reminderDate.getTime() - 13 * 60 * 60 * 1000); // 前一晚 20:00
        if (preReminderDate.getTime() > now.getTime()) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `🔔 明日生活備忘預告：【${title}】`,
              body: `提醒您明日有重要事項：「${cleanContent}」，請預先準備！${assigneeText}`,
              sound: true,
              data: { memoId: memo.id, type: 'memo_pre_reminder' },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: preReminderDate,
            },
          });
          scheduledCount++;
        }
      }
    }

    console.log(`[MemoNotification] 成功排程 ${scheduledCount} 則生活記事提醒推播`);
    return scheduledCount;
  } catch (err) {
    console.warn('[MemoNotification] 排程記事推播通知例外:', err);
    return 0;
  }
};

/**
 * 發送一則即時測試推播通知 (供使用者測試確認視覺呈現與鈴聲)
 */
export const sendTestBillingNotification = async (
  cardName: string = '玉山信用卡',
  amount: number = 12800
): Promise<boolean> => {
  if (!isNotificationSupported()) {
    return false;
  }

  try {
    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) return false;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `💳 ${cardName} 本期帳單已出帳 (測試)`,
        body: `您的「${cardName}」本期帳單已出帳，應繳 NT$ ${amount.toLocaleString()}，請記得於本月 25 號前繳納！`,
        sound: true,
        data: { test: true },
      },
      trigger: null,
    });

    return true;
  } catch (err) {
    console.warn('[BillingNotification] 發送測試通知失敗:', err);
    return false;
  }
};

/**
 * 發送一則生活記事即時測試推播
 */
export const sendTestMemoNotification = async (
  title: string = '採買清單',
  content: string = '記得下班順路購買鮮奶與雞蛋！'
): Promise<boolean> => {
  if (!isNotificationSupported()) return false;

  try {
    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) return false;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `🛒 生活記事提醒 (測試)：【${title}】`,
        body: content,
        sound: true,
        data: { test: true, type: 'memo_reminder' },
      },
      trigger: null,
    });

    return true;
  } catch (err) {
    console.warn('[MemoNotification] 發送測試記事通知失敗:', err);
    return false;
  }
};
