import { Transaction } from '../types';

export interface TrendPeriodDatum {
  key: string;
  ym: string;
  label: string;
  income: number;
  expense: number;
  balance: number;
  isFuture?: boolean;
}

export type TrendChartMode = 'recent6' | 'window6' | 'year12' | 'allYears';

export interface ResolvedTrendSeries {
  mode: TrendChartMode;
  title: string;
  subtitle: string;
  items: TrendPeriodDatum[];
  compact: boolean;
  selectedKey: string | null;
}

type TrendTransactionInput = Pick<Transaction, 'type' | 'amount' | 'transacted_at'>;

interface MonthSlotSpec {
  ym: string;
  label: string;
  isFuture?: boolean;
}

const SINGLE_MONTH_PATTERN = /^\d{4}-\d{2}$/;
const YEAR_ONLY_PATTERN = /^\d{4}$/;
const MAX_ALL_YEARS_COUNT = 10;

function parseValidDate(dateStr?: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function formatYm(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function buildSixMonthSpecs(endYear: number, endMonthZeroBased: number): MonthSlotSpec[] {
  const specs: MonthSlotSpec[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(endYear, endMonthZeroBased - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    specs.push({
      ym: formatYm(y, m),
      label: `${m}月`,
    });
  }
  return specs;
}

function aggregateByMonthSpecs(
  transactions: TrendTransactionInput[],
  specs: MonthSlotSpec[]
): TrendPeriodDatum[] {
  const bucketMap = new Map<string, { income: number; expense: number }>();
  specs.forEach(spec => bucketMap.set(spec.ym, { income: 0, expense: 0 }));

  transactions.forEach(t => {
    if (t.type !== 'expense' && t.type !== 'income') return;
    const d = parseValidDate(t.transacted_at);
    if (!d) return;
    const ym = formatYm(d.getFullYear(), d.getMonth() + 1);
    const entry = bucketMap.get(ym);
    if (!entry) return;
    const amt = Number(t.amount) || 0;
    if (t.type === 'expense') {
      entry.expense += amt;
    } else {
      entry.income += amt;
    }
  });

  return specs.map(spec => {
    const entry = bucketMap.get(spec.ym) || { income: 0, expense: 0 };
    return {
      key: spec.ym,
      ym: spec.ym,
      label: spec.label,
      income: entry.income,
      expense: entry.expense,
      balance: entry.income - entry.expense,
      ...(spec.isFuture !== undefined ? { isFuture: spec.isFuture } : {}),
    };
  });
}

/**
 * 依據統計頁選擇的時間範圍（單月／全年度／全部歷史）動態建構收支走勢圖資料與標題
 */
export function buildAnalyticsTrendSeries(
  transactions: TrendTransactionInput[],
  analyticsMonth: string,
  now: Date = new Date()
): ResolvedTrendSeries {
  const nowYear = now.getFullYear();
  const nowMonthZeroBased = now.getMonth();
  const nowMonth = nowMonthZeroBased + 1;

  // 1. 年度模式（YYYY）
  if (YEAR_ONLY_PATTERN.test(analyticsMonth)) {
    const targetYear = parseInt(analyticsMonth, 10);
    const yearSpecs: MonthSlotSpec[] = [];
    for (let m = 1; m <= 12; m++) {
      yearSpecs.push({
        ym: formatYm(targetYear, m),
        label: `${m}`,
        isFuture: targetYear > nowYear || (targetYear === nowYear && m > nowMonth),
      });
    }

    return {
      mode: 'year12',
      title: `📈 ${targetYear} 年各月收支走勢`,
      subtitle: '1～12 月收支對比，點擊月份柱狀可切換檢視該月明細',
      items: aggregateByMonthSpecs(transactions, yearSpecs),
      compact: true,
      selectedKey: null,
    };
  }

  // 2. 全部歷史模式（all）：跨越多年度時改呈歷年走勢，僅單一年度時退回近 6 個月
  if (analyticsMonth === 'all') {
    const yearMap = new Map<number, { income: number; expense: number }>();

    transactions.forEach(t => {
      if (t.type !== 'expense' && t.type !== 'income') return;
      const d = parseValidDate(t.transacted_at);
      if (!d) return;
      const year = d.getFullYear();
      const entry = yearMap.get(year) || { income: 0, expense: 0 };
      const amt = Number(t.amount) || 0;
      if (t.type === 'expense') {
        entry.expense += amt;
      } else {
        entry.income += amt;
      }
      yearMap.set(year, entry);
    });

    const sortedYears = Array.from(yearMap.keys()).sort((a, b) => a - b);
    if (sortedYears.length >= 2) {
      const displayYears =
        sortedYears.length > MAX_ALL_YEARS_COUNT
          ? sortedYears.slice(-MAX_ALL_YEARS_COUNT)
          : sortedYears;
      const useCompact = displayYears.length > 6;

      const items: TrendPeriodDatum[] = displayYears.map(year => {
        const entry = yearMap.get(year) || { income: 0, expense: 0 };
        const yearKey = String(year);
        return {
          key: yearKey,
          ym: yearKey,
          label: useCompact ? yearKey : `${year}年`,
          income: entry.income,
          expense: entry.expense,
          balance: entry.income - entry.expense,
        };
      });

      return {
        mode: 'allYears',
        title: '📈 歷年收支走勢',
        subtitle: '點擊年份柱狀可快速切換檢視該年度統計',
        items,
        compact: useCompact,
        selectedKey: null,
      };
    }

    const fallbackSpecs = buildSixMonthSpecs(nowYear, nowMonthZeroBased);
    return {
      mode: 'recent6',
      title: '📈 近 6 個月收支走勢',
      subtitle: '點擊月份柱狀可快速切換檢視該月明細',
      items: aggregateByMonthSpecs(transactions, fallbackSpecs),
      compact: false,
      selectedKey: null,
    };
  }

  // 3. 單月模式（YYYY-MM）及其他情境 fallback
  const recent6Specs = buildSixMonthSpecs(nowYear, nowMonthZeroBased);
  const recent6Yms = recent6Specs.map(s => s.ym);
  const isSingleMonth = SINGLE_MONTH_PATTERN.test(analyticsMonth);

  if (isSingleMonth && !recent6Yms.includes(analyticsMonth)) {
    const [yearStr, monthStr] = analyticsMonth.split('-');
    const targetYear = parseInt(yearStr, 10);
    const targetMonthZeroBased = parseInt(monthStr, 10) - 1;
    const windowSpecs = buildSixMonthSpecs(targetYear, targetMonthZeroBased);
    const firstYm = windowSpecs[0].ym;
    const lastYm = windowSpecs[windowSpecs.length - 1].ym;

    return {
      mode: 'window6',
      title: `📈 ${firstYm.replace('-', '/')} – ${lastYm.replace('-', '/')} 收支走勢`,
      subtitle: '點擊月份柱狀可快速切換檢視該月明細',
      items: aggregateByMonthSpecs(transactions, windowSpecs),
      compact: false,
      selectedKey: analyticsMonth,
    };
  }

  return {
    mode: 'recent6',
    title: '📈 近 6 個月收支走勢',
    subtitle: '點擊月份柱狀可快速切換檢視該月明細',
    items: aggregateByMonthSpecs(transactions, recent6Specs),
    compact: false,
    selectedKey: recent6Yms.includes(analyticsMonth) ? analyticsMonth : null,
  };
}
