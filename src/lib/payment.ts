import { PaymentMethod, PaymentAccount, AccountType } from '../types/database';

export interface PaymentMethodOption {
  key: PaymentMethod;
  name: string;
  icon: string;
  color: string;
  description: string;
}

export const PAYMENT_METHOD_OPTIONS: PaymentMethodOption[] = [
  { key: 'cash', name: '現金', icon: '💵', color: '#10B981', description: '錢包現鈔、零錢' },
  { key: 'credit_card', name: '信用卡', icon: '💳', color: '#3B82F6', description: '實體卡、Apple Pay 刷卡' },
  { key: 'line_pay', name: 'LINE Pay', icon: '🟢', color: '#06C755', description: 'LINE Pay 條碼 / 行動支付' },
  { key: 'stored_value', name: '悠遊卡/儲值卡', icon: '🚌', color: '#0284C7', description: '悠遊卡、一卡通、儲值錢包' },
  { key: 'transfer', name: '銀行轉帳', icon: '🏦', color: '#8B5CF6', description: '網銀轉帳、自動扣繳' },
];

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
 * 格式化顯示付款標籤 (包含圖示與卡片末四碼)
 */
export const formatPaymentLabel = (
  paymentMethod?: PaymentMethod,
  account?: PaymentAccount
): { icon: string; text: string; color: string } => {
  if (account) {
    if (account.type === 'credit_card') {
      const lastFour = account.last_four_digits ? ` (*${account.last_four_digits})` : '';
      return {
        icon: '💳',
        text: `${account.name}${lastFour}`,
        color: account.color || '#3B82F6',
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

  switch (paymentMethod) {
    case 'credit_card':
      return { icon: '💳', text: '信用卡', color: '#3B82F6' };
    case 'line_pay':
      return { icon: '🟢', text: 'LINE Pay', color: '#06C755' };
    case 'stored_value':
      return { icon: '🚌', text: '悠遊卡', color: '#0284C7' };
    case 'transfer':
      return { icon: '🏦', text: '轉帳', color: '#8B5CF6' };
    case 'cash':
      return { icon: '💵', text: '現金', color: '#10B981' };
    default:
      return { icon: '💵', text: '現金', color: '#6B7280' };
  }
};

