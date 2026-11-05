import { buildPassbookEntries } from '../statementPassbook';
import { PaymentAccount, Transaction } from '../../types/database';
import { StatementFile } from '../statementStorage';

describe('📜 信用卡歷期帳單存摺彙總演算法 (statementPassbook.test.ts)', () => {
  const mockAccounts: PaymentAccount[] = [
    // 智爸的 2 張國泰卡 (結帳日 15)
    {
      id: 'card-dad-cube',
      ledger_id: 'led-1',
      name: '國泰世華 CUBE 卡',
      type: 'credit_card',
      user_id: 'user-dad',
      billing_cycle_date: 15,
      balance: 0,
      sort_order: 1,
      created_at: '',
    },
    {
      id: 'card-dad-shopee',
      ledger_id: 'led-1',
      name: '國泰 蝦皮聯名卡',
      type: 'credit_card',
      user_id: 'user-dad',
      billing_cycle_date: 15,
      balance: 0,
      sort_order: 2,
      created_at: '',
    },
    // 智爸的 1 張富邦卡 (結帳日 15)
    {
      id: 'card-dad-fubon',
      ledger_id: 'led-1',
      name: '富邦 Costco 聯名卡',
      type: 'credit_card',
      user_id: 'user-dad',
      billing_cycle_date: 15,
      balance: 0,
      sort_order: 3,
      created_at: '',
    },
    // 瑩媽的 1 張國泰卡 (結帳日 15)
    {
      id: 'card-mom-cube',
      ledger_id: 'led-1',
      name: '國泰世華 CUBE 卡',
      type: 'credit_card',
      user_id: 'user-mom',
      billing_cycle_date: 15,
      balance: 0,
      sort_order: 4,
      created_at: '',
    },
  ];

  const mockMembers = [
    { id: 'user-dad', display_name: '智爸' },
    { id: 'user-mom', display_name: '瑩媽' },
  ];

  // 基準日期：2026-10-20
  const refDate = new Date('2026-10-20T12:00:00Z');

  // 交易明細
  const mockTransactions: Transaction[] = [
    // 1. 智爸 CUBE 卡消費 (2026-10 期: 09/16 ~ 10/15)
    {
      id: 'tx-cube-1',
      ledger_id: 'led-1',
      type: 'expense',
      amount: 3000,
      paid_by: 'user-dad',
      creator_id: 'user-dad',
      is_settled: false,
      account_id: 'card-dad-cube',
      payment_method: 'credit_card',
      category_id: 'cat-food',
      transacted_at: '2026-10-05T12:00:00Z',
      created_at: '',
      is_reconciled: true,
    },
    {
      id: 'tx-cube-2',
      ledger_id: 'led-1',
      type: 'expense',
      amount: 2000,
      paid_by: 'user-dad',
      creator_id: 'user-dad',
      is_settled: false,
      account_id: 'card-dad-cube',
      payment_method: 'credit_card',
      category_id: 'cat-shop',
      transacted_at: '2026-10-10T12:00:00Z',
      created_at: '',
      is_reconciled: false, // 待核對
    },
    // 2. 智爸 蝦皮卡消費與回饋折抵 (2026-10 期)
    {
      id: 'tx-shopee-1',
      ledger_id: 'led-1',
      type: 'expense',
      amount: 1500,
      paid_by: 'user-dad',
      creator_id: 'user-dad',
      is_settled: false,
      account_id: 'card-dad-shopee',
      payment_method: 'credit_card',
      category_id: 'cat-shop',
      transacted_at: '2026-10-02T12:00:00Z',
      created_at: '',
      is_reconciled: true,
    },
    {
      id: 'tx-shopee-rebate',
      ledger_id: 'led-1',
      type: 'income',
      amount: 500,
      paid_by: 'user-dad',
      creator_id: 'user-dad',
      is_settled: false,
      account_id: 'card-dad-shopee',
      payment_method: 'credit_card',
      category_id: 'cat-rebate',
      transacted_at: '2026-10-14T12:00:00Z',
      created_at: '',
      is_reconciled: true,
    },
    // 3. 智爸 富邦卡消費 (2026-10 期)
    {
      id: 'tx-fubon-1',
      ledger_id: 'led-1',
      type: 'expense',
      amount: 2500,
      paid_by: 'user-dad',
      creator_id: 'user-dad',
      is_settled: false,
      account_id: 'card-dad-fubon',
      payment_method: 'credit_card',
      category_id: 'cat-market',
      transacted_at: '2026-10-08T12:00:00Z',
      created_at: '',
      is_reconciled: true,
    },
    // 4. 瑩媽 國泰卡消費 (2026-10 期)
    {
      id: 'tx-mom-1',
      ledger_id: 'led-1',
      type: 'expense',
      amount: 4000,
      paid_by: 'user-mom',
      creator_id: 'user-mom',
      is_settled: false,
      account_id: 'card-mom-cube',
      payment_method: 'credit_card',
      category_id: 'cat-beauty',
      transacted_at: '2026-10-03T12:00:00Z',
      created_at: '',
      is_reconciled: true,
    },
    // 5. 智爸 CUBE 卡在 2026-09 期 (08/16 ~ 09/15) 的歷史消費
    {
      id: 'tx-cube-sep',
      ledger_id: 'led-1',
      type: 'expense',
      amount: 5000,
      paid_by: 'user-dad',
      creator_id: 'user-dad',
      is_settled: false,
      account_id: 'card-dad-cube',
      payment_method: 'credit_card',
      category_id: 'cat-travel',
      transacted_at: '2026-09-01T12:00:00Z',
      created_at: '',
      is_reconciled: true,
    },
  ];

  // 智爸在 CUBE 卡上傳了 2026-10 期帳單
  const mockStatements: StatementFile[] = [
    {
      path: 'led-1/card-dad-cube/2026-10__stmt.pdf',
      fileName: '2026-10__stmt.pdf',
      targetId: 'card-dad-cube',
      cardId: 'card-dad-cube',
      cycleKey: '2026-10',
      originalName: '國泰世華_10月帳單.pdf',
      mimeType: 'application/pdf',
      size: 180000,
      createdAt: '2026-10-16T08:00:00Z',
      publicUrl: 'https://example.com/cube-stmt.pdf',
    },
  ];

  it('能正確建構歷期帳單存摺，並按發卡機構歸戶計算應繳總額與各卡小計', () => {
    const entries = buildPassbookEntries({
      creditCards: mockAccounts,
      transactions: mockTransactions,
      statements: mockStatements,
      allAccounts: mockAccounts,
      members: mockMembers,
      referenceDate: refDate,
      cycleCount: 6,
    });

    // 智爸國泰 (2026-10, 2026-09) + 智爸富邦 (2026-10) + 瑩媽國泰 (2026-10) = 4 個條目
    expect(entries.length).toBe(4);

    // 1. 檢查智爸國泰世華 2026-10 期
    const dadCathayOct = entries.find(
      e => e.userId === 'user-dad' && e.issuerName === '國泰世華' && e.cycleKey === '2026-10'
    );
    expect(dadCathayOct).toBeDefined();
    expect(dadCathayOct?.isMultiCard).toBe(true);
    expect(dadCathayOct?.cards.length).toBe(2);
    expect(dadCathayOct?.cardholderName).toBe('智爸');

    // 財務總額：CUBE $5,000 + 蝦皮 ($1,500 - $500 = $1,000) = $6,000 應繳總額
    expect(dadCathayOct?.totalSpend).toBe(6500); // 3000 + 2000 + 1500
    expect(dadCathayOct?.totalRebate).toBe(500);
    expect(dadCathayOct?.totalAmount).toBe(6000);
    expect(dadCathayOct?.totalCount).toBe(4);
    expect(dadCathayOct?.reconciledCount).toBe(3);
    expect(dadCathayOct?.isAllReconciled).toBe(false); // 有一筆未核對

    // 電子帳單鏡射驗證：同戶同銀行成功取得帳單
    expect(dadCathayOct?.statement).toBeDefined();
    expect(dadCathayOct?.statement?.originalName).toBe('國泰世華_10月帳單.pdf');

    // 各卡小計驗證
    expect(dadCathayOct?.cardSubtotals.length).toBe(2);
    const cubeSub = dadCathayOct?.cardSubtotals.find(s => s.card.id === 'card-dad-cube');
    expect(cubeSub?.spend).toBe(5000);
    expect(cubeSub?.totalAmount).toBe(5000);
    expect(cubeSub?.totalCount).toBe(2);
    expect(cubeSub?.reconciledCount).toBe(1);

    const shopeeSub = dadCathayOct?.cardSubtotals.find(s => s.card.id === 'card-dad-shopee');
    expect(shopeeSub?.spend).toBe(1500);
    expect(shopeeSub?.rebate).toBe(500);
    expect(shopeeSub?.totalAmount).toBe(1000);
    expect(shopeeSub?.totalCount).toBe(2);
    expect(shopeeSub?.reconciledCount).toBe(2);
    expect(shopeeSub?.isAllReconciled).toBe(true);

    // 2. 檢查智爸富邦 2026-10 期
    const dadFubonOct = entries.find(
      e => e.userId === 'user-dad' && e.issuerName === '台北富邦' && e.cycleKey === '2026-10'
    );
    expect(dadFubonOct).toBeDefined();
    expect(dadFubonOct?.isMultiCard).toBe(false);
    expect(dadFubonOct?.totalAmount).toBe(2500);
    expect(dadFubonOct?.isAllReconciled).toBe(true);

    // 3. 檢查瑩媽國泰世華 2026-10 期（持卡人隔離驗證）
    const momCathayOct = entries.find(
      e => e.userId === 'user-mom' && e.issuerName === '國泰世華' && e.cycleKey === '2026-10'
    );
    expect(momCathayOct).toBeDefined();
    expect(momCathayOct?.cardholderName).toBe('瑩媽');
    expect(momCathayOct?.totalAmount).toBe(4000);
    expect(momCathayOct?.statement).toBeNull(); // 瑩媽自己沒上傳，絕不共享智爸帳單

    // 4. 排序驗證：2026-10 期在 2026-09 期之前
    const firstCycle = entries[0].cycleKey;
    const lastCycle = entries[entries.length - 1].cycleKey;
    expect(firstCycle).toBe('2026-10');
    expect(lastCycle).toBe('2026-09');
  });

  it('無任何消費且無電子帳單的空週期絕不建立冗餘存摺條目', () => {
    const entries = buildPassbookEntries({
      creditCards: mockAccounts,
      transactions: [], // 0 筆交易
      statements: [],   // 0 份帳單
      allAccounts: mockAccounts,
      referenceDate: refDate,
      cycleCount: 6,
    });
    expect(entries).toEqual([]);
  });
});
