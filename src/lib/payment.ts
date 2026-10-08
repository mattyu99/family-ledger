import { PaymentMethod, PaymentAccount, AccountType, CustomPaymentMethod } from '../types/database';

export interface PaymentMethodOption {
  key: PaymentMethod;
  name: string;
  icon: string;
  color: string;
  description: string;
}

export const DEFAULT_PAYMENT_METHODS: CustomPaymentMethod[] = [
  {
    id: 'cash',
    name: '現金',
    icon: '💵',
    color: '#10B981',
    type: 'cash',
    supports_credit_card: false,
    is_enabled: true,
    is_system: true,
    sort_order: 1,
  },
  {
    id: 'credit_card',
    name: '信用卡',
    icon: '💳',
    color: '#3B82F6',
    type: 'credit_card',
    supports_credit_card: true,
    is_enabled: true,
    is_system: true,
    sort_order: 2,
  },
  {
    id: 'line_pay',
    name: 'LINE Pay',
    icon: '🟢',
    color: '#06C755',
    type: 'e_wallet',
    supports_credit_card: true,
    is_enabled: true,
    is_system: true,
    sort_order: 3,
  },
  {
    id: 'px_pay',
    name: '全支付',
    icon: '🔵',
    color: '#0055B8',
    type: 'e_wallet',
    supports_credit_card: true,
    is_enabled: true,
    is_system: true,
    sort_order: 4,
  },
  {
    id: 'easycard_pay',
    name: '悠遊付',
    icon: '🩵',
    color: '#00A3E0',
    type: 'e_wallet',
    supports_credit_card: true,
    is_enabled: true,
    is_system: true,
    sort_order: 5,
  },
  {
    id: 'jkopay',
    name: '街口支付',
    icon: '🟣',
    color: '#D8232A',
    type: 'e_wallet',
    supports_credit_card: true,
    is_enabled: true,
    is_system: true,
    sort_order: 6,
  },
  {
    id: 'stored_value',
    name: '悠遊卡/儲值卡',
    icon: '🚌',
    color: '#0284C7',
    type: 'stored_value',
    supports_credit_card: false,
    is_enabled: true,
    is_system: true,
    sort_order: 7,
  },
  {
    id: 'transfer',
    name: '銀行轉帳',
    icon: '🏦',
    color: '#8B5CF6',
    type: 'bank',
    supports_credit_card: false,
    is_enabled: true,
    is_system: true,
    sort_order: 8,
  },
];

export const PAYMENT_METHOD_OPTIONS: PaymentMethodOption[] = DEFAULT_PAYMENT_METHODS.map(m => ({
  key: m.id,
  name: m.name,
  icon: m.icon,
  color: m.color,
  description: m.supports_credit_card ? '可綁定信用卡或帳戶扣款' : '直接扣款',
}));

export const DEMO_PAYMENT_ACCOUNTS: PaymentAccount[] = [
  {
    id: '50000000-0000-4000-8000-000000000001',
    ledger_id: '10000000-0000-4000-8000-000000000001',
    name: '富邦 Costco 聯名卡',
    type: 'credit_card',
    user_id: '20000000-0000-4000-8000-000000000001', // 爸爸
    last_four_digits: '8829',
    billing_cycle_date: 15,
    balance: 0,
    color: '#1E40AF',
    icon: '💳',
    sort_order: 1,
    created_at: new Date().toISOString(),
  },
  {
    id: '50000000-0000-4000-8000-000000000002',
    ledger_id: '10000000-0000-4000-8000-000000000001',
    name: '國泰 CUBE 卡',
    type: 'credit_card',
    user_id: '20000000-0000-4000-8000-000000000002', // 媽媽
    last_four_digits: '1234',
    billing_cycle_date: 27,
    balance: 0,
    color: '#047857',
    icon: '💳',
    sort_order: 2,
    created_at: new Date().toISOString(),
  },
  {
    id: '50000000-0000-4000-8000-000000000003',
    ledger_id: '10000000-0000-4000-8000-000000000001',
    name: '爸爸悠遊卡',
    type: 'stored_value',
    user_id: '20000000-0000-4000-8000-000000000001',
    last_four_digits: '',
    balance: 350,
    color: '#0284C7',
    icon: '🚌',
    sort_order: 3,
    created_at: new Date().toISOString(),
  },
  {
    id: '50000000-0000-4000-8000-000000000004',
    ledger_id: '10000000-0000-4000-8000-000000000001',
    name: '媽媽悠遊卡',
    type: 'stored_value',
    user_id: '20000000-0000-4000-8000-000000000002',
    last_four_digits: '',
    balance: 500,
    color: '#EC4899',
    icon: '🚌',
    sort_order: 4,
    created_at: new Date().toISOString(),
  },
];

export interface BillingCycleOption {
  key: string; // e.g. "2026-10" or "unbilled"
  label: string; // e.g. "10月帳單 (9/16 ~ 10/15)"
  cycleName: string; // e.g. "2026年10月號帳單"
  rangeText: string; // e.g. "09/16 - 10/15"
  startDate: Date;
  endDate: Date;
  isCurrent: boolean; // 當前正在進行或本期
  isClosed: boolean; // 結帳日已過
}

// 取得特定年月的最後一日
export const getDaysInMonth = (year: number, monthIndex: number): number => {
  return new Date(year, monthIndex + 1, 0).getDate();
};

/**
 * 依據信用卡的結帳日 (billingCycleDate: 1~31)，精確計算出過去與當期的信用卡帳單週期
 * 例如結帳日為 15 號：
 * - 10 月帳單：9/16 00:00:00 ~ 10/15 23:59:59
 * - 9 月帳單：8/16 00:00:00 ~ 9/15 23:59:59
 * - 若今天為 10/20，則當前已進入 11 月帳單 (10/16 ~ 11/15)
 */
export const getCreditCardBillingCycles = (
  rawCycleDate?: number,
  refDate: Date = new Date(),
  cycleCount: number = 6
): BillingCycleOption[] => {
  const cycleDate = Math.max(1, Math.min(31, rawCycleDate || 15));
  const cycles: BillingCycleOption[] = [];

  const nowYear = refDate.getFullYear();
  const nowMonth = refDate.getMonth(); // 0-indexed
  const nowDay = refDate.getDate();

  // 判斷今日屬於哪一個帳單月
  // 若今天日期 > 結帳日，代表本月帳單已結，今日落入「下個月」帳單期
  const baseMonthOffset = nowDay > cycleDate ? 1 : 0;

  for (let i = 0; i < cycleCount; i++) {
    // 週期基準月份（0 為當期最新，1 為上一期，依此類推）
    const targetMonthDate = new Date(nowYear, nowMonth + baseMonthOffset - i, 1);
    const targetYear = targetMonthDate.getFullYear();
    const targetMonth = targetMonthDate.getMonth(); // 帳單所屬月份 (0-indexed)

    // 上個月
    const prevMonthDate = new Date(targetYear, targetMonth - 1, 1);
    const prevYear = prevMonthDate.getFullYear();
    const prevMonth = prevMonthDate.getMonth();

    // 週期起日：上個月 (cycleDate + 1)
    const prevMaxDays = getDaysInMonth(prevYear, prevMonth);
    const startDay = Math.min(cycleDate + 1, prevMaxDays);
    const startDate = new Date(prevYear, prevMonth, startDay, 0, 0, 0, 0);

    // 週期訖日：本月 cycleDate
    const targetMaxDays = getDaysInMonth(targetYear, targetMonth);
    const endDay = Math.min(cycleDate, targetMaxDays);
    const endDate = new Date(targetYear, targetMonth, endDay, 23, 59, 59, 999);

    const isCurrent = refDate >= startDate && refDate <= endDate;
    const isClosed = refDate > endDate;

    const startText = `${startDate.getMonth() + 1}/${startDate.getDate()}`;
    const endText = `${endDate.getMonth() + 1}/${endDate.getDate()}`;
    const rangeText = `${startText} ~ ${endText}`;

    const cycleYear = targetYear;
    const cycleMonthNum = targetMonth + 1;
    const cycleName = `${cycleYear}年${cycleMonthNum}月號帳單`;
    const label = `${cycleMonthNum}月帳單 (${rangeText})${isCurrent ? ' [本期]' : ''}`;

    cycles.push({
      key: `${targetYear}-${String(cycleMonthNum).padStart(2, '0')}`,
      label,
      cycleName,
      rangeText,
      startDate,
      endDate,
      isCurrent,
      isClosed,
    });
  }

  return cycles;
};

/**
 * 依據自然月份 (1號 00:00:00 ~ 當月最後一日 23:59:59)，計算過去與當期的自然月週期
 * 適用於悠遊卡/儲值卡對帳 (沒有結帳日，以自然月份為單位)
 */
export const getCalendarMonthCycles = (
  refDate: Date = new Date(),
  cycleCount: number = 6
): BillingCycleOption[] => {
  const cycles: BillingCycleOption[] = [];
  const nowYear = refDate.getFullYear();
  const nowMonth = refDate.getMonth(); // 0-indexed

  for (let i = 0; i < cycleCount; i++) {
    const targetMonthDate = new Date(nowYear, nowMonth - i, 1);
    const targetYear = targetMonthDate.getFullYear();
    const targetMonth = targetMonthDate.getMonth(); // 0-indexed

    const startDate = new Date(targetYear, targetMonth, 1, 0, 0, 0, 0);
    const maxDays = getDaysInMonth(targetYear, targetMonth);
    const endDate = new Date(targetYear, targetMonth, maxDays, 23, 59, 59, 999);

    const isCurrent = refDate >= startDate && refDate <= endDate;
    const isClosed = refDate > endDate;

    const startText = `${targetMonth + 1}/01`;
    const endText = `${targetMonth + 1}/${String(maxDays).padStart(2, '0')}`;
    const rangeText = `${startText} ~ ${endText}`;

    const cycleYear = targetYear;
    const cycleMonthNum = targetMonth + 1;
    const cycleName = `${cycleYear}年${cycleMonthNum}月份`;
    const label = `${cycleMonthNum}月份 (${rangeText})${isCurrent ? ' [本月]' : ''}`;

    cycles.push({
      key: `${targetYear}-${String(cycleMonthNum).padStart(2, '0')}`,
      label,
      cycleName,
      rangeText,
      startDate,
      endDate,
      isCurrent,
      isClosed,
    });
  }

  return cycles;
};

/**
 * 檢查交易日期是否落入某個帳單區間內
 */
export const isDateInBillingCycle = (
  transactedAt: string | Date,
  startDate: Date,
  endDate: Date
): boolean => {
  const t = new Date(transactedAt).getTime();
  return t >= startDate.getTime() && t <= endDate.getTime();
};

/**
 * 取得精簡的卡片識別名稱 (用於在有限的手機標籤空間中顯示)
 * 例如：「富邦 Costco 聯名卡」->「富邦 Costco」或「國泰 CUBE 卡」->「國泰 CUBE」
 */
export const getShortCardName = (fullName: string): string => {
  if (!fullName) return '';
  let clean = fullName.replace(/聯名卡|信用卡|卡片/g, '').trim();
  if (clean.endsWith('卡') && clean.length > 2) {
    clean = clean.slice(0, -1).trim();
  }
  if (clean.length > 6) {
    clean = clean.slice(0, 6);
  }
  return clean || fullName.slice(0, 4);
};

/**
 * 格式化顯示付款標籤 (包含圖示與卡片末四碼或電支複合標籤)
 */
export const formatPaymentLabel = (
  paymentMethod?: PaymentMethod,
  account?: PaymentAccount,
  customMethods?: CustomPaymentMethod[]
): { icon: string; text: string; color: string } => {
  const allMethods = customMethods && customMethods.length > 0 ? customMethods : DEFAULT_PAYMENT_METHODS;
  const currentMethod = allMethods.find(m => m.id === paymentMethod);

  if (account) {
    if (account.type === 'credit_card') {
      const lastFour = account.last_four_digits ? `*${account.last_four_digits}` : '';
      const isPureCreditCard = !paymentMethod || paymentMethod === 'credit_card';

      if (isPureCreditCard) {
        return {
          icon: '💳',
          text: `${account.name}${lastFour ? ` (${lastFour})` : ''}`,
          color: account.color || '#3B82F6',
        };
      }

      // 透過電子支付 (如 全支付, LINE Pay, 悠遊付, 街口 等) 綁定信用卡扣款：
      // 精簡排版：如「🔵 全支付·國泰*1234」或「🟢 LINE Pay·富邦*8829」
      const methodName = currentMethod ? currentMethod.name : (paymentMethod || '行動支付');
      const methodIcon = currentMethod ? currentMethod.icon : '📱';
      const methodColor = currentMethod ? currentMethod.color : (account.color || '#3B82F6');
      const shortCard = getShortCardName(account.name);
      const cardSuffix = lastFour ? `*${account.last_four_digits}` : shortCard;
      const combinedText = `${methodName}·${cardSuffix}`;

      return {
        icon: methodIcon,
        text: combinedText,
        color: methodColor,
      };
    }
    if (account.type === 'stored_value') {
      return {
        icon: account.icon || '🚌',
        text: account.name,
        color: account.color || '#0284C7',
      };
    }
    return {
      icon: account.icon || '💳',
      text: account.name,
      color: account.color || '#4F46E5',
    };
  }

  // 無綁定卡片（純錢包餘額、純現金、純轉帳等）
  if (currentMethod) {
    return {
      icon: currentMethod.icon,
      text: currentMethod.name,
      color: currentMethod.color,
    };
  }

  switch (paymentMethod) {
    case 'credit_card':
      return { icon: '💳', text: '信用卡', color: '#3B82F6' };
    case 'line_pay':
      return { icon: '🟢', text: 'LINE Pay', color: '#06C755' };
    case 'px_pay':
      return { icon: '🔵', text: '全支付', color: '#0055B8' };
    case 'easycard_pay':
      return { icon: '🩵', text: '悠遊付', color: '#00A3E0' };
    case 'jkopay':
      return { icon: '🟣', text: '街口支付', color: '#D8232A' };
    case 'stored_value':
      return { icon: '🚌', text: '悠遊卡', color: '#0284C7' };
    case 'transfer':
      return { icon: '🏦', text: '轉帳', color: '#8B5CF6' };
    case 'cash':
      return { icon: '💵', text: '現金', color: '#10B981' };
    default:
      return { icon: '💵', text: paymentMethod || '現金', color: '#6B7280' };
  }
};

/**
 * 將支付卡片/帳戶列表排序：優先將本機使用成員 (或當前選定付款人) 的卡片排在最前面以利優先選取
 */
export const sortAccountsByUser = (
  accounts: PaymentAccount[],
  preferredUserId?: string
): PaymentAccount[] => {
  if (!accounts || accounts.length === 0) return [];
  return [...accounts].sort((a, b) => {
    const aIsPreferred = preferredUserId && a.user_id === preferredUserId ? 1 : 0;
    const bIsPreferred = preferredUserId && b.user_id === preferredUserId ? 1 : 0;
    if (aIsPreferred !== bIsPreferred) {
      return bIsPreferred - aIsPreferred; // 本機使用成員或優先成員排在最前面
    }
    return (a.sort_order || 0) - (b.sort_order || 0);
  });
};

