import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { PaymentAccount, Transaction } from '../types/database';

const NOTIFICATIONS_STORAGE_KEY = '@family_ledger_billing_notifications_enabled';

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
    console.warn('[BillingNotification] 初始化通知處理器失敗:', e);
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
    const value = await AsyncStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
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
    await AsyncStorage.setItem(NOTIFICATIONS_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch (e) {
    console.warn('[BillingNotification] 儲存通知設定失敗:', e);
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
    console.warn('[BillingNotification] 請求推播權限例外:', e);
    return false;
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

  // 若本月結帳日已過，計算目標為本期帳單繳款或下期出帳
  // 出帳日隔天 09:30
  let statementTargetYear = currentYear;
  let statementTargetMonth = currentMonth;
  if (currentDay > cycleDate + 1) {
    statementTargetMonth += 1;
  }
  const billStatementDate = new Date(statementTargetYear, statementTargetMonth, cycleDate + 1, 9, 30, 0, 0);

  // 繳款截止日：結帳日 + 20 天
  // 基準結帳日
  let baseCycleYear = currentYear;
  let baseCycleMonth = currentMonth;
  if (currentDay <= cycleDate) {
    // 尚未到本月結帳日，上期繳款可能正在進行中
  }
  const paymentDueDate = new Date(baseCycleYear, baseCycleMonth, cycleDate + 20, 23, 59, 59, 0);

  // 繳款日前 3 天 09:30
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
      await Notifications.cancelAllScheduledNotificationsAsync();
      return 0;
    }

    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) return 0;

    // 清空舊排程
    await Notifications.cancelAllScheduledNotificationsAsync();

    const creditCards = paymentAccounts.filter(acc => acc.type === 'credit_card');
    if (creditCards.length === 0) return 0;

    let scheduledCount = 0;
    const now = new Date();

    for (const card of creditCards) {
      const { billStatementDate, paymentDueDate, reminderDueDate } = calculateCardScheduleDates(card, now);
      const amount = calculateCardOutstandingAmount(card.id, transactions);
      const amountText = amount > 0 ? `NT$ ${amount.toLocaleString()}` : '請見銀行帳單';
      const dueDayText = `${paymentDueDate.getMonth() + 1}月${paymentDueDate.getDate()}號`;

      // 1. 出帳日隔天推播
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

      // 2. 繳款日前 3 天提醒推播
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
      trigger: null, // null 代表立即發送本機推播
    });

    return true;
  } catch (err) {
    console.warn('[BillingNotification] 發送測試通知失敗:', err);
    return false;
  }
};
