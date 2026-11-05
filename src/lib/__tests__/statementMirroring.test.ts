import {
  getStatementForCardCycle,
  getStatementCycleSetForCard,
  StatementFile,
} from '../statementStorage';
import { PaymentAccount } from '../../types/database';

describe('📎 電子帳單同銀行歸戶鏡射共享測試 (statementMirroring.test.ts)', () => {
  const testAccounts: PaymentAccount[] = [
    // 智爸的 2 張國泰卡 (同結帳日 15)
    {
      id: 'card-cube',
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
      id: 'card-shopee',
      ledger_id: 'led-1',
      name: '國泰 蝦皮聯名卡',
      type: 'credit_card',
      user_id: 'user-dad',
      billing_cycle_date: 15,
      balance: 0,
      sort_order: 2,
      created_at: '',
    },
    // 智爸的 1 張富邦卡 (同為 15 號結帳，但不同銀行)
    {
      id: 'card-fubon',
      ledger_id: 'led-1',
      name: '富邦 Costco 聯名卡',
      type: 'credit_card',
      user_id: 'user-dad',
      billing_cycle_date: 15,
      balance: 0,
      sort_order: 3,
      created_at: '',
    },
    // 瑩媽的國泰卡 (持卡人 mom，結帳日 15)
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

  // 模擬 Storage 中已存在的帳單檔案清單
  // 智爸在「國泰 CUBE 卡」上傳了 2026-10 期帳單
  // 瑩媽在「國泰 CUBE 卡」上傳了 2026-10 期帳單
  const existingStatements: StatementFile[] = [
    {
      path: 'led-1/card-cube/2026-10__1728000000__stmt.pdf',
      fileName: '2026-10__1728000000__stmt.pdf',
      targetId: 'card-cube',
      cardId: 'card-cube',
      cycleKey: '2026-10',
      originalName: '國泰世華_10月電子帳單.pdf',
      mimeType: 'application/pdf',
      size: 150000,
      createdAt: '2026-10-16T08:00:00Z',
      publicUrl: 'https://supabase.example.com/storage/v1/object/public/statements/cube.pdf',
    },
    {
      path: 'led-1/card-mom-cube/2026-10__1728000000__mom.pdf',
      fileName: '2026-10__1728000000__mom.pdf',
      targetId: 'card-mom-cube',
      cardId: 'card-mom-cube',
      cycleKey: '2026-10',
      originalName: '瑩媽國泰_10月電子帳單.pdf',
      mimeType: 'application/pdf',
      size: 140000,
      createdAt: '2026-10-16T09:00:00Z',
      publicUrl: 'https://supabase.example.com/storage/v1/object/public/statements/mom.pdf',
    },
  ];

  describe('1. getStatementForCardCycle 智慧查詢', () => {
    it('直接上傳的卡片自身查詢 ➔ 優先返回自身帳單，不標記 isShared', () => {
      const stmt = getStatementForCardCycle(
        existingStatements,
        'card-cube',
        '2026-10',
        testAccounts
      );
      expect(stmt).toBeDefined();
      expect(stmt?.cardId).toBe('card-cube');
      expect(stmt?.originalName).toBe('國泰世華_10月電子帳單.pdf');
      expect(stmt?.isShared).toBeFalsy();
    });

    it('同持卡人姊妹卡 (蝦皮卡) 查詢 ➔ 自動鏡射共享 CUBE 卡帳單', () => {
      const stmt = getStatementForCardCycle(
        existingStatements,
        'card-shopee',
        '2026-10',
        testAccounts
      );
      expect(stmt).toBeDefined();
      expect(stmt?.path).toBe(existingStatements[0].path);
      expect(stmt?.publicUrl).toBe(existingStatements[0].publicUrl);
      expect(stmt?.isShared).toBe(true);
      expect(stmt?.sharedFromCardId).toBe('card-cube');
      expect(stmt?.sharedFromCardName).toBe('國泰世華 CUBE 卡');
      expect(stmt?.issuerName).toBe('國泰世華');
    });

    it('不同銀行的卡片 (富邦) ➔ 絕不跨銀行混淆，返回 null', () => {
      const stmt = getStatementForCardCycle(
        existingStatements,
        'card-fubon',
        '2026-10',
        testAccounts
      );
      expect(stmt).toBeNull();
    });

    it('不同持卡人 (瑩媽) ➔ 絕不跨人混淆，各自獲取各自的帳單', () => {
      const momStmt = getStatementForCardCycle(
        existingStatements,
        'card-mom-cube',
        '2026-10',
        testAccounts
      );
      expect(momStmt).toBeDefined();
      expect(momStmt?.cardId).toBe('card-mom-cube');
      expect(momStmt?.originalName).toBe('瑩媽國泰_10月電子帳單.pdf');
      expect(momStmt?.isShared).toBeFalsy();
    });

    it('未上傳帳單的月份週期 ➔ 返回 null', () => {
      const stmt = getStatementForCardCycle(
        existingStatements,
        'card-shopee',
        '2026-09',
        testAccounts
      );
      expect(stmt).toBeNull();
    });
  });

  describe('2. getStatementCycleSetForCard 週期集合（用於 📎 圖示）', () => {
    it('同銀行姊妹卡自動包含同戶已上傳的週期', () => {
      // CUBE 卡直接上傳了 2026-10
      const cubeSet = getStatementCycleSetForCard(existingStatements, 'card-cube', testAccounts);
      expect(cubeSet.has('2026-10')).toBe(true);

      // 蝦皮卡未直接上傳，但鏡射包含了 2026-10
      const shopeeSet = getStatementCycleSetForCard(existingStatements, 'card-shopee', testAccounts);
      expect(shopeeSet.has('2026-10')).toBe(true);

      // 富邦卡沒有任何帳單
      const fubonSet = getStatementCycleSetForCard(existingStatements, 'card-fubon', testAccounts);
      expect(fubonSet.has('2026-10')).toBe(false);
    });
  });
});
