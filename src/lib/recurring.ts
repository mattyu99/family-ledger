import { RecurringRule, RecurringFrequency } from '../types/database';

/**
 * 檢查特定規則在指定年份與月份中是否為「應繳費/出帳月份」
 * @param rule 週期規則
 * @param year 年份 (如 2026)
 * @param month 月份 1 ~ 12
 */
export const isBillDueInMonth = (rule: RecurringRule, year: number, month: number): boolean => {
  if (!rule.is_active) return false;

  switch (rule.frequency) {
    case 'monthly':
      return true;

    case 'bimonthly': {
      // 雙月繳：
      // bimonthly_start_month === 1: 單數月出帳 (1, 3, 5, 7, 9, 11 月)
      // bimonthly_start_month === 2: 雙數月出帳 (2, 4, 6, 8, 10, 12 月)
      const startMonth = rule.bimonthly_start_month || 2;
      return startMonth === 1 ? month % 2 === 1 : month % 2 === 0;
    }

    case 'quarterly':
      // 每季繳 (預設 1, 4, 7, 10 月)
      return (month - 1) % 3 === 0;

    case 'yearly':
      // 每年繳 (依建立月份或固定 1 月)
      return month === 1;

    default:
      return true;
  }
};

/**
 * 取得當前或指定日期對應的週期辨識標籤（Period Key）
 * 例如："2026-10" 或雙月繳 "2026-10"
 */
export const getCurrentPeriodKey = (rule: RecurringRule, date = new Date()): string => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1 ~ 12

  if (rule.frequency === 'bimonthly') {
    // 雙月繳：若當月不是出帳月，則歸屬至下個出帳月或上期
    const isDue = isBillDueInMonth(rule, year, month);
    if (isDue) {
      return `${year}-${String(month).padStart(2, '0')}`;
    } else {
      // 若非出帳月，往前推一個月取所屬雙月期
      const prevDate = new Date(year, date.getMonth() - 1, 1);
      return `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    }
  }

  return `${year}-${String(month).padStart(2, '0')}`;
};

/**
 * 檢查該規則在當前所屬週期是否已經記帳完成
 */
export const isBillPaidForCurrentPeriod = (rule: RecurringRule, date = new Date()): boolean => {
  if (!rule.last_recorded_period) return false;
  const currentKey = getCurrentPeriodKey(rule, date);
  return rule.last_recorded_period === currentKey;
};

/**
 * 取得週期週期的易讀中文說明 (例如："2026年10月" 或 "2026年 9~10月期")
 */
export const getBillPeriodLabel = (rule: RecurringRule, date = new Date()): string => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  if (rule.frequency === 'bimonthly') {
    const isDue = isBillDueInMonth(rule, year, month);
    const activeMonth = isDue ? month : (month > 1 ? month - 1 : 12);
    const prevMonth = activeMonth > 1 ? activeMonth - 1 : 12;
    return `${year}年 ${prevMonth}~${activeMonth}月期`;
  }

  return `${year}年 ${month}月份`;
};

/**
 * 取得扣繳週期頻率與日期的清楚標籤說明
 */
export const getFrequencyBadgeText = (rule: RecurringRule): string => {
  const dayText = `${rule.due_day} 號`;
  switch (rule.frequency) {
    case 'monthly':
      return `每月 ${dayText}`;
    case 'bimonthly':
      return rule.bimonthly_start_month === 1
        ? `每單月 (1,3,5月) ${dayText}`
        : `每雙月 (2,4,6月) ${dayText}`;
    case 'quarterly':
      return `每季 ${dayText}`;
    case 'yearly':
      return `每年 ${dayText}`;
    default:
      return `每月 ${dayText}`;
  }
};

/**
 * 計算指定規則在當期月份中的實際扣款截止日 (Date 物件)
 */
export const getBillDueDate = (rule: RecurringRule, date = new Date()): Date => {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const targetDay = Math.min(Math.max(1, rule.due_day || 1), daysInMonth);
  return new Date(year, month, targetDay, 23, 59, 59);
};

/**
 * 預設常用家庭週期扣款範本（提供使用者一鍵快速建立）
 */
export const DEFAULT_RECURRING_PRESETS = [
  {
    name: '台灣電力公司 電費',
    merchant: '台灣電力公司',
    categoryName: '居家水電',
    amount_type: 'variable' as const,
    default_amount: 1800,
    frequency: 'bimonthly' as const,
    bimonthly_start_month: 2 as const, // 雙月出帳 (2, 4, 6, 8, 10, 12月)
    due_day: 15,
    payment_method: 'credit_card' as const,
  },
  {
    name: '自來水費',
    merchant: '台灣自來水公司',
    categoryName: '居家水電',
    amount_type: 'variable' as const,
    default_amount: 650,
    frequency: 'bimonthly' as const,
    bimonthly_start_month: 2 as const,
    due_day: 20,
    payment_method: 'credit_card' as const,
  },
  {
    name: '天然瓦斯費',
    merchant: '欣欣天然氣',
    categoryName: '居家水電',
    amount_type: 'variable' as const,
    default_amount: 800,
    frequency: 'bimonthly' as const,
    bimonthly_start_month: 1 as const, // 單月出帳
    due_day: 10,
    payment_method: 'credit_card' as const,
  },
  {
    name: '手機通訊月租費',
    merchant: '中華電信',
    categoryName: '居家水電',
    amount_type: 'fixed' as const,
    default_amount: 599,
    frequency: 'monthly' as const,
    due_day: 5,
    payment_method: 'credit_card' as const,
  },
  {
    name: '家用寬頻光世代',
    merchant: '中華電信',
    categoryName: '居家水電',
    amount_type: 'fixed' as const,
    default_amount: 899,
    frequency: 'monthly' as const,
    due_day: 12,
    payment_method: 'credit_card' as const,
  },
  {
    name: '大樓社區管理費',
    merchant: '管委會',
    categoryName: '居家水電',
    amount_type: 'fixed' as const,
    default_amount: 2200,
    frequency: 'monthly' as const,
    due_day: 10,
    payment_method: 'transfer' as const,
  },
];

