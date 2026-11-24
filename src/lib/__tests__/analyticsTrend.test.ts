import { buildAnalyticsTrendSeries } from '../analyticsTrend';
import { Transaction } from '../../types';

const makeTx = (
  type: Transaction['type'],
  amount: number,
  year: number,
  month: number,
  day = 15
): Pick<Transaction, 'type' | 'amount' | 'transacted_at'> => ({
  type,
  amount,
  transacted_at: new Date(year, month - 1, day, 12, 0, 0).toISOString(),
});

describe('analyticsTrend 統計頁走勢資料建構測試', () => {
  // 固定測試基準日：2026-11-24
  const fixedNow = new Date(2026, 10, 24, 12, 0, 0);

  const sampleTransactions = [
    makeTx('expense', 1200, 2024, 5),
    makeTx('income', 45000, 2024, 5),
    makeTx('expense', 800, 2025, 2),
    makeTx('expense', 1500, 2025, 3),
    makeTx('income', 50000, 2025, 3),
    makeTx('expense', 3000, 2026, 1),
    makeTx('income', 60000, 2026, 1),
    makeTx('expense', 2500, 2026, 6),
    makeTx('expense', 4200, 2026, 10),
    makeTx('income', 62000, 2026, 11),
    makeTx('expense', 5100, 2026, 11),
    // memo 與 transfer 不應計入收支走勢
    makeTx('memo', 9999, 2026, 11),
    makeTx('transfer', 8888, 2026, 11),
    // 無效日期應略過
    { type: 'expense' as const, amount: 7777, transacted_at: 'invalid-date' },
  ];

  test('今年模式 (2026) 應回傳 1~12 月完整資料，12 月標記為未來月', () => {
    const res = buildAnalyticsTrendSeries(sampleTransactions, '2026', fixedNow);

    expect(res.mode).toBe('year12');
    expect(res.title).toBe('📈 2026 年各月收支走勢');
    expect(res.subtitle).toBe('1～12 月收支對比，點擊月份柱狀可切換檢視該月明細');
    expect(res.compact).toBe(true);
    expect(res.selectedKey).toBeNull();
    expect(res.items).toHaveLength(12);
    expect(res.items.map(item => item.label)).toEqual([
      '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12',
    ]);
    expect(res.items[0]).toMatchObject({
      key: '2026-01',
      ym: '2026-01',
      income: 60000,
      expense: 3000,
      balance: 57000,
      isFuture: false,
    });
    expect(res.items[10]).toMatchObject({
      key: '2026-11',
      income: 62000,
      expense: 5100,
      balance: 56900,
      isFuture: false,
    });
    expect(res.items[11]).toMatchObject({
      key: '2026-12',
      income: 0,
      expense: 0,
      isFuture: true,
    });
  });

  test('去年模式 (2025) 應僅統計 2025 年 1~12 月且皆非未來月', () => {
    const res = buildAnalyticsTrendSeries(sampleTransactions, '2025', fixedNow);

    expect(res.mode).toBe('year12');
    expect(res.title).toBe('📈 2025 年各月收支走勢');
    expect(res.compact).toBe(true);
    expect(res.selectedKey).toBeNull();
    expect(res.items).toHaveLength(12);
    expect(res.items.every(item => item.isFuture === false)).toBe(true);
    expect(res.items[1]).toMatchObject({ key: '2025-02', expense: 800, income: 0 });
    expect(res.items[2]).toMatchObject({ key: '2025-03', expense: 1500, income: 50000 });
    expect(res.items[10]).toMatchObject({ key: '2025-11', expense: 0, income: 0 });
  });

  test('單月模式在近 6 個月內時應呈現近 6 個月走勢並高亮所選月份', () => {
    const resNov = buildAnalyticsTrendSeries(sampleTransactions, '2026-11', fixedNow);
    expect(resNov.mode).toBe('recent6');
    expect(resNov.title).toBe('📈 近 6 個月收支走勢');
    expect(resNov.compact).toBe(false);
    expect(resNov.selectedKey).toBe('2026-11');
    expect(resNov.items.map(i => i.ym)).toEqual([
      '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11',
    ]);
    expect(resNov.items.map(i => i.label)).toEqual([
      '6月', '7月', '8月', '9月', '10月', '11月',
    ]);

    const resOct = buildAnalyticsTrendSeries(sampleTransactions, '2026-10', fixedNow);
    expect(resOct.mode).toBe('recent6');
    expect(resOct.selectedKey).toBe('2026-10');
    expect(resOct.items[4]).toMatchObject({ key: '2026-10', expense: 4200 });
  });

  test('單月模式選取早於近 6 個月的歷史月份 (2025-03) 時應平移為截至該月的 6 個月區間', () => {
    const res = buildAnalyticsTrendSeries(sampleTransactions, '2025-03', fixedNow);

    expect(res.mode).toBe('window6');
    expect(res.title).toBe('📈 2024/10 – 2025/03 收支走勢');
    expect(res.compact).toBe(false);
    expect(res.selectedKey).toBe('2025-03');
    expect(res.items.map(i => i.ym)).toEqual([
      '2024-10', '2024-11', '2024-12', '2025-01', '2025-02', '2025-03',
    ]);
    expect(res.items[4]).toMatchObject({ key: '2025-02', expense: 800 });
    expect(res.items[5]).toMatchObject({ key: '2025-03', expense: 1500, income: 50000 });
  });

  test('全部歷史模式 (all) 涵蓋多年度時應顯示歷年收支走勢', () => {
    const res = buildAnalyticsTrendSeries(sampleTransactions, 'all', fixedNow);

    expect(res.mode).toBe('allYears');
    expect(res.title).toBe('📈 歷年收支走勢');
    expect(res.subtitle).toBe('點擊年份柱狀可快速切換檢視該年度統計');
    expect(res.compact).toBe(false);
    expect(res.selectedKey).toBeNull();
    expect(res.items).toEqual([
      {
        key: '2024',
        ym: '2024',
        label: '2024年',
        income: 45000,
        expense: 1200,
        balance: 43800,
      },
      {
        key: '2025',
        ym: '2025',
        label: '2025年',
        income: 50000,
        expense: 2300,
        balance: 47700,
      },
      {
        key: '2026',
        ym: '2026',
        label: '2026年',
        income: 122000,
        expense: 14800,
        balance: 107200,
      },
    ]);
  });

  test('全部歷史模式 (all) 僅單一年度時應退回近 6 個月走勢，避免孤立單根年份柱', () => {
    const singleYearTxs = [
      makeTx('expense', 1000, 2026, 9),
      makeTx('income', 30000, 2026, 11),
    ];

    const res = buildAnalyticsTrendSeries(singleYearTxs, 'all', fixedNow);

    expect(res.mode).toBe('recent6');
    expect(res.title).toBe('📈 近 6 個月收支走勢');
    expect(res.compact).toBe(false);
    expect(res.selectedKey).toBeNull();
    expect(res.items).toHaveLength(6);
    expect(res.items[3]).toMatchObject({ key: '2026-09', expense: 1000 });
    expect(res.items[5]).toMatchObject({ key: '2026-11', income: 30000 });
  });

  test('全部歷史模式超過 6 個年度時應套用精簡排版，超過 10 年時取最近 10 個年度', () => {
    const manyYearsTxs = Array.from({ length: 12 }, (_, idx) =>
      makeTx('expense', (idx + 1) * 100, 2015 + idx, 5)
    );

    const res = buildAnalyticsTrendSeries(manyYearsTxs, 'all', fixedNow);

    expect(res.mode).toBe('allYears');
    expect(res.compact).toBe(true);
    expect(res.items).toHaveLength(10);
    expect(res.items[0]).toMatchObject({ key: '2017', label: '2017', expense: 300 });
    expect(res.items[9]).toMatchObject({ key: '2026', label: '2026', expense: 1200 });
  });
});
