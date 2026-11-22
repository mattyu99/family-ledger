import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { PaymentAccount, Transaction, Profile } from '../types/database';
import {
  parseMemoNote,
  getEffectiveMemoReminderDate,
  isMemoRelayEnabled,
  getMemoRelayOffsetDays,
  analyzeMemoRelaySchedule,
} from './memo';
import { groupCreditCardsByIssuer } from './bankIssuer';

const BILLING_NOTIFICATIONS_STORAGE_KEY = '@family_ledger_billing_notifications_enabled';
const MEMO_NOTIFICATIONS_STORAGE_KEY = '@family_ledger_memo_notifications_enabled';
const NOTIFICATION_PREFS_STORAGE_KEY = '@family_ledger_notification_preferences_v1';

export type ReminderTimePreset = '07:30' | '08:00' | '09:00' | '09:30';
export type BillingDueAdvanceMode = '3d_and_day' | '3d' | '1d_and_day' | '1d';
export type MemoAdvanceMode = 'eve_20' | 'same_day' | '1d' | '3d';

export interface NotificationPreferences {
  dailyReminderTime: ReminderTimePreset;
  billingStatementEnabled: boolean;
  billingDueEnabled: boolean;
  billingDueAdvanceMode: BillingDueAdvanceMode;
  memoAdvanceMode: MemoAdvanceMode;
}

export const REMINDER_TIME_OPTIONS: ReminderTimePreset[] = ['07:30', '08:00', '09:00', '09:30'];

export const BILLING_DUE_ADVANCE_OPTIONS: { value: BillingDueAdvanceMode; label: string }[] = [
  { value: '3d_and_day', label: '前 3 天＋當天' },
  { value: '3d', label: '提前 3 天' },
  { value: '1d_and_day', label: '前 1 天＋當天' },
  { value: '1d', label: '提前 1 天' },
];

export const MEMO_ADVANCE_OPTIONS: { value: MemoAdvanceMode; label: string }[] = [
  { value: 'eve_20', label: '前一晚 20:00' },
  { value: 'same_day', label: '僅當天' },
  { value: '1d', label: '提前 1 天' },
  { value: '3d', label: '提前 3 天' },
];

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  dailyReminderTime: '07:30',
  billingStatementEnabled: true,
  billingDueEnabled: true,
  billingDueAdvanceMode: '3d_and_day',
  memoAdvanceMode: 'eve_20',
};

const VALID_TIME_PRESETS = new Set<string>(REMINDER_TIME_OPTIONS);
const VALID_BILLING_ADVANCE_MODES = new Set<string>(BILLING_DUE_ADVANCE_OPTIONS.map(o => o.value));
const VALID_MEMO_ADVANCE_MODES = new Set<string>(MEMO_ADVANCE_OPTIONS.map(o => o.value));

/**
 * 解析每日早晨提醒時間字串 (例如 "07:30" -> { hour: 7, minute: 30 })
 */
export const parseReminderTime = (timeStr?: string): { hour: number; minute: number } => {
  if (!timeStr || !VALID_TIME_PRESETS.has(timeStr)) {
    return { hour: 7, minute: 30 };
  }
  const [hh, mm] = timeStr.split(':').map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) {
    return { hour: 7, minute: 30 };
  }
  return { hour: hh, minute: mm };
};

export const formatBillingAdvanceLabel = (mode: BillingDueAdvanceMode): string => {
  return BILLING_DUE_ADVANCE_OPTIONS.find(o => o.value === mode)?.label || '前 3 天＋當天';
};

export const formatMemoAdvanceLabel = (mode: MemoAdvanceMode): string => {
  switch (mode) {
    case 'eve_20':
      return '前一晚 20:00＋當天';
    case 'same_day':
      return '僅當天';
    case '1d':
      return '提前 1 天＋當天';
    case '3d':
      return '提前 3 天＋當天';
    default:
      return '前一晚 20:00＋當天';
  }
};

/**
 * 讀取本機個人提醒偏好設定（統一鐘點、信用卡分段開關與記事預設預警）
 */
export const getNotificationPreferences = async (): Promise<NotificationPreferences> => {
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATION_PREFS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_NOTIFICATION_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
    return {
      dailyReminderTime:
        parsed.dailyReminderTime && VALID_TIME_PRESETS.has(parsed.dailyReminderTime)
          ? parsed.dailyReminderTime
          : DEFAULT_NOTIFICATION_PREFERENCES.dailyReminderTime,
      billingStatementEnabled:
        typeof parsed.billingStatementEnabled === 'boolean'
          ? parsed.billingStatementEnabled
          : DEFAULT_NOTIFICATION_PREFERENCES.billingStatementEnabled,
      billingDueEnabled:
        typeof parsed.billingDueEnabled === 'boolean'
          ? parsed.billingDueEnabled
          : DEFAULT_NOTIFICATION_PREFERENCES.billingDueEnabled,
      billingDueAdvanceMode:
        parsed.billingDueAdvanceMode && VALID_BILLING_ADVANCE_MODES.has(parsed.billingDueAdvanceMode)
          ? parsed.billingDueAdvanceMode
          : DEFAULT_NOTIFICATION_PREFERENCES.billingDueAdvanceMode,
      memoAdvanceMode:
        parsed.memoAdvanceMode && VALID_MEMO_ADVANCE_MODES.has(parsed.memoAdvanceMode)
          ? parsed.memoAdvanceMode
          : DEFAULT_NOTIFICATION_PREFERENCES.memoAdvanceMode,
    };
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
};

/**
 * 儲存本機個人提醒偏好設定並回傳合併後之最新結果
 */
export const saveNotificationPreferences = async (
  partial: Partial<NotificationPreferences>
): Promise<NotificationPreferences> => {
  const current = await getNotificationPreferences();
  const next: NotificationPreferences = {
    ...current,
    ...partial,
  };
  try {
    await AsyncStorage.setItem(NOTIFICATION_PREFS_STORAGE_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('[Notifications] 儲存提醒偏好失敗:', e);
  }
  return next;
};

// 初始化前景通知呈現行為 (僅限非 Web 環境)
if (Platform.OS !== 'web') {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const data = notification?.request?.content?.data as Record<string, any> | undefined;
        const pushType = data?.type;
        const isSilent = Boolean(data?.isSilent) || pushType === 'widget_sync';

        // 1. 若為背景靜默小工具同步，或當使用者「正開著 App（前景）」收到跨裝置即時動態推播時：
        // 開著 App 期間一律只顯示 App 內的頂部泡泡通知（LiveToast），不重複彈出系統推播橫幅，避免雙重轟炸！
        if (
          isSilent ||
          pushType === 'memo_added' ||
          pushType === 'memo_updated' ||
          pushType === 'memo_completed' ||
          pushType === 'transaction_added'
        ) {
          return {
            shouldShowBanner: false,
            shouldShowList: false,
            shouldPlaySound: false,
            shouldSetBadge: false,
          };
        }

        // 2. 本機定時鬧鐘（信用卡出帳/繳款提醒、生活記事提醒）或手動測試推播，在前景正常彈出
        return {
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        };
      },
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
      if (type === 'statement_issued' || type === 'payment_due_soon' || type === 'payment_due_today') {
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
  reminderDueDate: Date;   // 繳款截止日前 N 天預警日
  estimatedAmount: number;
}

export interface CardScheduleDatesResult {
  billStatementDate: Date;
  paymentDueDate: Date;
  reminderDueDate: Date; // 向後相容：等同 advanceReminderDate
  advanceReminderDate: Date;
  dueDayReminderDate: Date;
  advanceDays: number;
  includeDueDay: boolean;
  isDueDayCustom: boolean;
}

export interface BillingReminderGroup {
  groupKey: string;
  displayName: string;
  issuerName: string;
  cards: PaymentAccount[];
  cardNames: string[];
  billingCycleDate: number;
  paymentDueDay: number | null;
  estimatedAmount: number;
  isPersonalCard: boolean;
  dates: CardScheduleDatesResult;
}

/**
 * 安全建立指定年月日的本地時間（自動限制於該月實際最大天數，避免 2 月或小月溢位跨月）
 */
export const buildClampedLocalDate = (
  year: number,
  monthIndex: number,
  day: number,
  hour: number = 0,
  minute: number = 0,
  second: number = 0
): Date => {
  const daysInTargetMonth = new Date(year, monthIndex + 1, 0).getDate();
  const clampedDay = Math.max(1, Math.min(Math.trunc(day), daysInTargetMonth));
  return new Date(year, monthIndex, clampedDay, hour, minute, second, 0);
};

/**
 * 計算信用卡的下一次出帳日、繳款截止日與預警/當天提醒時程
 * 支援自訂每月繳款截止日（含同月與跨月自動推算），留空則預設結帳日 + 20 天；
 * 當期繳款提醒已過時，自動推進至下一個週期。
 */
export const calculateCardScheduleDates = (
  card: Pick<PaymentAccount, 'billing_cycle_date' | 'payment_due_day'>,
  now: Date = new Date(),
  prefs?: Partial<NotificationPreferences>
): CardScheduleDatesResult => {
  const resolvedPrefs: NotificationPreferences = {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...prefs,
  };
  const { hour, minute } = parseReminderTime(resolvedPrefs.dailyReminderTime);
  const cycleDate = Math.max(1, Math.min(31, Math.trunc(card.billing_cycle_date || 15)));
  const rawDueDay =
    card.payment_due_day !== undefined &&
    card.payment_due_day !== null &&
    Number.isFinite(card.payment_due_day) &&
    card.payment_due_day >= 1
      ? Math.min(31, Math.trunc(card.payment_due_day))
      : null;
  const isDueDayCustom = rawDueDay !== null;

  const advanceMode = resolvedPrefs.billingDueAdvanceMode;
  const advanceDays = advanceMode === '1d' || advanceMode === '1d_and_day' ? 1 : 3;
  const includeDueDay = advanceMode === '3d_and_day' || advanceMode === '1d_and_day';

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  // 1. 出帳日隔天：若當期已過則推進至下個月
  const computeStatementDateForMonth = (monthOffset: number): Date => {
    const cycleDayDate = buildClampedLocalDate(currentYear, currentMonth + monthOffset, cycleDate, hour, minute, 0);
    return new Date(
      cycleDayDate.getFullYear(),
      cycleDayDate.getMonth(),
      cycleDayDate.getDate() + 1,
      hour,
      minute,
      0,
      0
    );
  };
  let billStatementDate = computeStatementDateForMonth(0);
  if (billStatementDate.getTime() <= now.getTime()) {
    billStatementDate = computeStatementDateForMonth(1);
  }

  // 2. 繳款截止日與提醒日：從上個月週期 (-1) 開始尋找第一個尚有未來有效提醒的帳單週期
  const computeDueCycle = (monthOffset: number) => {
    let dueDateEnd: Date;
    let dueDayReminderDate: Date;

    if (rawDueDay !== null) {
      // 若繳款日大於結帳日屬當月繳款；小於等於結帳日屬次月繳款
      const dueMonthOffset = rawDueDay > cycleDate ? monthOffset : monthOffset + 1;
      dueDateEnd = buildClampedLocalDate(currentYear, currentMonth + dueMonthOffset, rawDueDay, 23, 59, 59);
      dueDayReminderDate = buildClampedLocalDate(currentYear, currentMonth + dueMonthOffset, rawDueDay, hour, minute, 0);
    } else {
      const cycleBase = buildClampedLocalDate(currentYear, currentMonth + monthOffset, cycleDate, hour, minute, 0);
      dueDateEnd = new Date(cycleBase.getFullYear(), cycleBase.getMonth(), cycleBase.getDate() + 20, 23, 59, 59, 0);
      dueDayReminderDate = new Date(cycleBase.getFullYear(), cycleBase.getMonth(), cycleBase.getDate() + 20, hour, minute, 0, 0);
    }

    const advanceReminderDate = new Date(
      dueDayReminderDate.getFullYear(),
      dueDayReminderDate.getMonth(),
      dueDayReminderDate.getDate() - advanceDays,
      hour,
      minute,
      0,
      0
    );

    return {
      dueDateEnd,
      dueDayReminderDate,
      advanceReminderDate,
    };
  };

  let chosen = computeDueCycle(-1);
  for (const offset of [-1, 0, 1, 2]) {
    const candidate = computeDueCycle(offset);
    const lastTriggerTime = includeDueDay
      ? candidate.dueDayReminderDate.getTime()
      : candidate.advanceReminderDate.getTime();
    if (lastTriggerTime > now.getTime()) {
      chosen = candidate;
      break;
    }
    chosen = candidate;
  }

  return {
    billStatementDate,
    paymentDueDate: chosen.dueDateEnd,
    reminderDueDate: chosen.advanceReminderDate,
    advanceReminderDate: chosen.advanceReminderDate,
    dueDayReminderDate: chosen.dueDayReminderDate,
    advanceDays,
    includeDueDay,
    isDueDayCustom,
  };
};

/**
 * 篩選本機個人應提醒之信用卡並依「持卡人 × 發卡銀行 × 結帳日」歸戶合併群組
 * 同持卡人同銀行的多張卡片會自動合併為單一帳單提醒並加總待繳金額，避免重複打擾。
 */
export const buildBillingReminderGroups = (
  paymentAccounts: PaymentAccount[],
  transactions: Transaction[],
  currentUserId?: string,
  getMemberById?: (id?: string) => Profile | undefined,
  now: Date = new Date(),
  prefs?: Partial<NotificationPreferences>
): BillingReminderGroup[] => {
  const myCreditCards = (paymentAccounts || []).filter(acc => {
    if (acc.type !== 'credit_card') return false;
    if (currentUserId && acc.user_id) {
      if (acc.user_id === currentUserId) return true;
      if (
        getMemberById &&
        getMemberById(acc.user_id)?.display_name &&
        getMemberById(currentUserId)?.display_name &&
        getMemberById(acc.user_id)?.display_name?.trim().toLowerCase() ===
          getMemberById(currentUserId)?.display_name?.trim().toLowerCase()
      ) {
        return true;
      }
      return false;
    }
    return true;
  });

  if (myCreditCards.length === 0) return [];

  const issuerGroups = groupCreditCardsByIssuer(myCreditCards);

  return issuerGroups.map(group => {
    const estimatedAmount = group.cards.reduce(
      (sum, c) => sum + calculateCardOutstandingAmount(c.id, transactions),
      0
    );
    const customDueCard = group.cards.find(
      c => typeof c.payment_due_day === 'number' && Number.isFinite(c.payment_due_day) && c.payment_due_day >= 1
    );
    const paymentDueDay = customDueCard?.payment_due_day ? Math.min(31, Math.trunc(customDueCard.payment_due_day)) : null;

    const dates = calculateCardScheduleDates(
      {
        billing_cycle_date: group.billingCycleDate,
        payment_due_day: paymentDueDay,
      },
      now,
      prefs
    );

    const displayName = group.isMultiCard
      ? `${group.issuer.shortName} (${group.cards.length}張卡)`
      : group.cards[0].name;

    return {
      groupKey: group.key,
      displayName,
      issuerName: group.issuer.shortName,
      cards: group.cards,
      cardNames: group.cards.map(c => c.name),
      billingCycleDate: group.billingCycleDate,
      paymentDueDay,
      estimatedAmount,
      isPersonalCard: group.cards.some(c => !!c.user_id),
      dates,
    };
  });
};

/**
 * 重新排程所有信用卡的本機到期提醒通知（支援個人化持卡人過濾＋同銀行歸戶合併＋分段開關）
 */
export const scheduleBillingReminderNotifications = async (
  paymentAccounts: PaymentAccount[],
  transactions: Transaction[],
  currentUserId?: string,
  getMemberById?: (id?: string) => Profile | undefined,
  explicitPrefs?: Partial<NotificationPreferences>
): Promise<number> => {
  if (!isNotificationSupported()) return 0;

  try {
    const isEnabled = await getBillingNotificationsEnabled();
    if (!isEnabled) {
      await cancelBillingScheduledNotifications();
      return 0;
    }

    const prefs = explicitPrefs
      ? { ...(await getNotificationPreferences()), ...explicitPrefs }
      : await getNotificationPreferences();

    if (!prefs.billingStatementEnabled && !prefs.billingDueEnabled) {
      await cancelBillingScheduledNotifications();
      return 0;
    }

    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) return 0;

    // 清空舊信用卡排程
    await cancelBillingScheduledNotifications();

    const now = new Date();
    const groups = buildBillingReminderGroups(
      paymentAccounts,
      transactions,
      currentUserId,
      getMemberById,
      now,
      prefs
    );
    if (groups.length === 0) return 0;

    let scheduledCount = 0;

    for (const group of groups) {
      const { billStatementDate, paymentDueDate, advanceReminderDate, dueDayReminderDate, advanceDays, includeDueDay } =
        group.dates;
      const amount = group.estimatedAmount;
      const amountText = amount > 0 ? `NT$ ${amount.toLocaleString()}` : '請見銀行帳單';
      const dueDayText = `${paymentDueDate.getMonth() + 1}月${paymentDueDate.getDate()}號`;
      const cardsHint = group.cards.length > 1 ? `（含 ${group.cardNames.join('、')}）` : '';

      // 1. 出帳日隔天推播
      if (prefs.billingStatementEnabled && billStatementDate.getTime() > now.getTime()) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `💳 ${group.displayName} 帳單已出帳`,
            body: `您的 ${group.displayName}${cardsHint}本期帳單已出帳，應繳約 ${amountText}，請記得於 ${dueDayText} 前繳納！`,
            sound: true,
            data: { groupKey: group.groupKey, cardId: group.cards[0]?.id, type: 'statement_issued' },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: billStatementDate,
          },
        });
        scheduledCount++;
      }

      // 2. 繳款期限提前 N 天預警推播
      if (prefs.billingDueEnabled && advanceReminderDate.getTime() > now.getTime()) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `⏰ ${group.displayName} 繳款期限將至`,
            body: `提醒您：${group.displayName}${cardsHint}帳單將於 ${advanceDays} 天後 (${dueDayText}) 到期，待繳金額約 ${amountText}，請及早安排扣款！`,
            sound: true,
            data: { groupKey: group.groupKey, cardId: group.cards[0]?.id, type: 'payment_due_soon' },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: advanceReminderDate,
          },
        });
        scheduledCount++;
      }

      // 3. 繳款截止當天提醒推播
      if (prefs.billingDueEnabled && includeDueDay && dueDayReminderDate.getTime() > now.getTime()) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `🚨 ${group.displayName} 今日為繳款截止日`,
            body: `今天 (${dueDayText}) 是 ${group.displayName}${cardsHint}帳單最後繳款日，待繳金額約 ${amountText}，請確認已完成扣款避免逾期！`,
            sound: true,
            data: { groupKey: group.groupKey, cardId: group.cards[0]?.id, type: 'payment_due_today' },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: dueDayReminderDate,
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

export interface MemoTriggerPoint {
  kind: 'advance' | 'due_day';
  type: 'memo_pre_reminder' | 'memo_reminder';
  date: Date;
  label: string;
  daysBefore?: number;
}

export interface MemoNotificationSchedule {
  dueYmd: string | null;
  dueShortDate: string;
  isRelay: boolean;
  relayOverrideOffset: number | undefined;
  modeLabel: string;
  nextStopLabel?: string;
  triggers: MemoTriggerPoint[];
}

/**
 * 計算單則生活記事（含一般記事與子項目接力）的實際推播觸發時間點
 * 到期日永遠為真實日期；預告與當天推播在此解耦計算，確保一致且絕不重複轟炸。
 */
export const computeMemoNotificationTriggers = (
  memo: Pick<
    Transaction,
    'type' | 'reminder_date' | 'reminder_relay' | 'reminder_relay_offset' | 'merchant' | 'note' | 'transacted_at' | 'created_at'
  >,
  prefs?: Partial<NotificationPreferences>,
  now: Date = new Date()
): MemoNotificationSchedule => {
  const resolvedPrefs: NotificationPreferences = {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...prefs,
  };
  const dueYmd = getEffectiveMemoReminderDate(memo, now);
  if (!dueYmd) {
    return {
      dueYmd: null,
      dueShortDate: '',
      isRelay: false,
      relayOverrideOffset: undefined,
      modeLabel: '',
      triggers: [],
    };
  }

  const parts = dueYmd.split('-').map(Number);
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) {
    return {
      dueYmd: null,
      dueShortDate: '',
      isRelay: false,
      relayOverrideOffset: undefined,
      modeLabel: '',
      triggers: [],
    };
  }

  const [y, m, d] = parts;
  const dueShortDate = `${m}/${d}`;
  const { hour, minute } = parseReminderTime(resolvedPrefs.dailyReminderTime);
  const dueDayDate = new Date(y, m - 1, d, hour, minute, 0, 0);

  const isRelay = isMemoRelayEnabled(memo);
  const relayOverrideOffset = isRelay ? getMemoRelayOffsetDays(memo) : undefined;

  let nextStopLabel: string | undefined;
  if (isRelay && memo.note) {
    const anchorDate = memo.transacted_at || memo.created_at;
    const schedule = analyzeMemoRelaySchedule(memo.note, now, anchorDate);
    if (schedule.nextStop) {
      nextStopLabel = `${schedule.nextStop.shortDate} ${schedule.nextStop.label}`;
    }
  }

  const triggers: MemoTriggerPoint[] = [];
  let modeLabel: string;

  if (isRelay && relayOverrideOffset !== undefined) {
    if (relayOverrideOffset === 0) {
      modeLabel = '單則設定：僅當天';
    } else {
      const daysBefore = Math.abs(relayOverrideOffset);
      const advanceDate = new Date(y, m - 1, d - daysBefore, hour, minute, 0, 0);
      triggers.push({
        kind: 'advance',
        type: 'memo_pre_reminder',
        date: advanceDate,
        label: `前 ${daysBefore} 天 ${resolvedPrefs.dailyReminderTime}`,
        daysBefore,
      });
      modeLabel = `單則設定：提前 ${daysBefore} 天＋當天`;
    }
  } else {
    switch (resolvedPrefs.memoAdvanceMode) {
      case 'same_day':
        modeLabel = '跟隨預設：僅當天';
        break;
      case '1d':
        triggers.push({
          kind: 'advance',
          type: 'memo_pre_reminder',
          date: new Date(y, m - 1, d - 1, hour, minute, 0, 0),
          label: `前 1 天 ${resolvedPrefs.dailyReminderTime}`,
          daysBefore: 1,
        });
        modeLabel = '跟隨預設：提前 1 天＋當天';
        break;
      case '3d':
        triggers.push({
          kind: 'advance',
          type: 'memo_pre_reminder',
          date: new Date(y, m - 1, d - 3, hour, minute, 0, 0),
          label: `前 3 天 ${resolvedPrefs.dailyReminderTime}`,
          daysBefore: 3,
        });
        modeLabel = '跟隨預設：提前 3 天＋當天';
        break;
      case 'eve_20':
      default:
        triggers.push({
          kind: 'advance',
          type: 'memo_pre_reminder',
          date: new Date(y, m - 1, d - 1, 20, 0, 0, 0),
          label: '前一晚 20:00',
          daysBefore: 1,
        });
        modeLabel = '跟隨預設：前一晚 20:00＋當天';
        break;
    }
  }

  triggers.push({
    kind: 'due_day',
    type: 'memo_reminder',
    date: dueDayDate,
    label: `當天 ${resolvedPrefs.dailyReminderTime}`,
  });

  return {
    dueYmd,
    dueShortDate,
    isRelay,
    relayOverrideOffset,
    modeLabel,
    nextStopLabel,
    triggers,
  };
};

/**
 * 重新排程所有未完成生活記事的本機提醒通知（支援全家 vs 個人專屬分流、統一鐘點與提前預告）
 */
export const scheduleMemoReminderNotifications = async (
  transactions: Transaction[],
  members?: Profile[],
  currentUserId?: string,
  explicitPrefs?: Partial<NotificationPreferences>
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

    const prefs = explicitPrefs
      ? { ...(await getNotificationPreferences()), ...explicitPrefs }
      : await getNotificationPreferences();

    // 清理既有的生活記事排程
    await cancelMemoScheduledNotifications();

    const now = new Date();
    const pendingMemos = transactions.filter(
      t => t.type === 'memo' && !t.is_settled && !!getEffectiveMemoReminderDate(t, now)
    );
    if (pendingMemos.length === 0) return 0;

    const currentUserMember =
      currentUserId && members ? members.find(u => u.id === currentUserId) : undefined;

    let scheduledCount = 0;

    for (const memo of pendingMemos) {
      const isPersonal = memo.reminder_target === 'personal';
      // 個人專屬待辦分流：若為個人專屬待辦且指派了負責人，只有當前登入者為該負責人時才在本機排程提醒（支援別名對齊）
      if (isPersonal && currentUserId && memo.paid_by && memo.paid_by !== currentUserId) {
        const assignee = members?.find(u => u.id === memo.paid_by);
        const sameAlias =
          !!assignee?.display_name &&
          !!currentUserMember?.display_name &&
          assignee.display_name.trim().toLowerCase() ===
            currentUserMember.display_name.trim().toLowerCase();
        if (!sameAlias) {
          continue;
        }
      }

      const schedule = computeMemoNotificationTriggers(memo, prefs, now);
      if (!schedule.dueYmd || schedule.triggers.length === 0) continue;

      // 解析標題與內文
      const parsed = parseMemoNote(memo.note);
      const icon = parsed.icon || '📌';
      const title = parsed.title || '生活待辦';
      const cleanContent = parsed.cleanContent || memo.note || '';
      const scopeBadge = isPersonal ? '【個人專屬】' : '【全家】';

      // 責任成員稱謂
      let assigneeText = '';
      if (memo.paid_by && members && members.length > 0) {
        const matched = members.find(u => u.id === memo.paid_by);
        if (matched) assigneeText = ` · 負責人：${matched.display_name}`;
      }

      const mainSummary = schedule.nextStopLabel
        ? `下一站：${schedule.nextStopLabel}`
        : cleanContent;

      for (const trigger of schedule.triggers) {
        if (trigger.date.getTime() <= now.getTime()) continue;

        if (trigger.kind === 'advance') {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `🔔 ${scopeBadge}待辦預告 (${schedule.dueShortDate}到期)：【${title}】`,
              body: `即將到期（${schedule.dueShortDate}）：${mainSummary}${assigneeText}`,
              sound: true,
              data: { memoId: memo.id, type: 'memo_pre_reminder' },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: trigger.date,
            },
          });
          scheduledCount++;
        } else {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `${icon} ${scopeBadge}生活待辦提醒：【${title}】`,
              body: `${mainSummary}${assigneeText}`,
              sound: true,
              data: { memoId: memo.id, type: 'memo_reminder' },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: trigger.date,
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
  amount: number = 12800,
  cardholderName?: string
): Promise<boolean> => {
  if (!isNotificationSupported()) {
    return false;
  }

  try {
    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) return false;

    const holderText = cardholderName ? ` (${cardholderName})` : '';
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `💳 ${cardName}${holderText} 本期帳單已出帳 (測試)`,
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
  content: string = '記得下班順路購買鮮奶與雞蛋！',
  isPersonal: boolean = false
): Promise<boolean> => {
  if (!isNotificationSupported()) return false;

  try {
    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) return false;

    const scopeBadge = isPersonal ? '【個人專屬】' : '【全家】';
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `🛒 ${scopeBadge}生活待辦提醒 (測試)：【${title}】`,
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
