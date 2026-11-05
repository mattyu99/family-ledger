import {
  findMatchingAccount,
  findMatchingTransaction,
  normalizeCardNumber,
  processCloudInvoicesSync,
} from '../cloudInvoiceSync';
import { CloudInvoiceItem, PaymentAccount, Profile, Transaction } from '../../types/database';

describe('cloudInvoiceSync 智慧比對引擎測試', () => {
  const mockAccounts: PaymentAccount[] = [
    {
      id: 'acc_easycard_dad',
      ledger_id: 'ledger_1',
      name: '智市民卡',
      type: 'stored_value',
      user_id: 'user_dad',
      card_number: '1000419002328227',
      balance: 418,
      sort_order: 1,
      created_at: '2026-01-01',
    },
    {
      id: 'acc_cc_mom',
      ledger_id: 'ledger_1',
      name: '雅媽國泰 CUBE 卡',
      type: 'credit_card',
      user_id: 'user_mom',
      last_four_digits: '8829',
      balance: 0,
      sort_order: 2,
      created_at: '2026-01-01',
    },
  ];

  const mockMembers: Profile[] = [
    { id: 'user_dad', display_name: '智爸' },
    { id: 'user_mom', display_name: '雅媽' },
  ];

  describe('findMatchingAccount 卡號智慧比對', () => {
    it('應能透過完整 16 碼悠遊卡號精準命中智市民卡', () => {
      const match = findMatchingAccount('1000419002328227', '1K0001', mockAccounts);
      expect(match).toBeDefined();
      expect(match?.id).toBe('acc_easycard_dad');
      expect(match?.user_id).toBe('user_dad');
    });

    it('應能透過含遮罩的信用卡號（末四碼 8829）精準命中雅媽 CUBE 卡', () => {
      const match = findMatchingAccount('4147-****-****-8829', '2G0001', mockAccounts);
      expect(match).toBeDefined();
      expect(match?.id).toBe('acc_cc_mom');
      expect(match?.user_id).toBe('user_mom');
    });

    it('若無符合卡號應回傳 undefined', () => {
      const match = findMatchingAccount('9999-9999-9999-9999', '2G0001', mockAccounts);
      expect(match).toBeUndefined();
    });
  });

  describe('findMatchingTransaction 既有手動交易媒合', () => {
    const existingTransactions: Transaction[] = [
      {
        id: 'tx_1',
        ledger_id: 'ledger_1',
        creator_id: 'user_dad',
        category_id: 'cat_coffee',
        amount: 45,
        type: 'expense',
        paid_by: 'user_dad',
        transacted_at: '2026-11-05T08:30:00.000Z',
        merchant: '全家',
        note: '我和老王喝咖啡',
        is_settled: true,
        created_at: '2026-11-05T08:30:00.000Z',
      },
    ];

    it('金額相同、日期相同且店家相近時，應成功媒合', () => {
      const invoice: CloudInvoiceItem = {
        invoiceNumber: 'EF-21608064',
        invoiceDate: '2026-11-05',
        sellerName: '全家便利商店 忠孝店',
        amount: 45,
        randomCode: '8821',
      };

      const match = findMatchingTransaction(invoice, existingTransactions);
      expect(match).toBeDefined();
      expect(match?.id).toBe('tx_1');
    });

    it('金額不同時絕對不應媒合', () => {
      const invoice: CloudInvoiceItem = {
        invoiceNumber: 'EF-99999999',
        invoiceDate: '2026-11-05',
        sellerName: '全家便利商店 忠孝店',
        amount: 55,
      };

      const match = findMatchingTransaction(invoice, existingTransactions);
      expect(match).toBeUndefined();
    });

    it('日期差距超過 2 天時不應媒合', () => {
      const invoice: CloudInvoiceItem = {
        invoiceNumber: 'EF-21608064',
        invoiceDate: '2026-11-01',
        sellerName: '全家便利商店 忠孝店',
        amount: 45,
      };

      const match = findMatchingTransaction(invoice, existingTransactions);
      expect(match).toBeUndefined();
    });
  });

  describe('processCloudInvoicesSync 整批同步處理', () => {
    it('應能將媒合到的交易進行自動補齊，並將未媒合的發票以卡號所屬成員建立新交易', () => {
      const existingTransactions: Transaction[] = [
        {
          id: 'tx_coffee',
          ledger_id: 'ledger_1',
          creator_id: 'user_dad',
          category_id: 'cat_dining',
          amount: 45,
          type: 'expense',
          paid_by: 'user_dad',
          transacted_at: '2026-11-05T08:20:00.000Z',
          merchant: '全家',
          note: '手動記帳備註',
          is_settled: true,
          created_at: '2026-11-05',
        },
      ];

      const cloudInvoices: CloudInvoiceItem[] = [
        // 發票 1：應媒合 tx_coffee
        {
          invoiceNumber: 'EF-21608064',
          invoiceDate: '2026-11-05',
          sellerName: '全家便利商店 忠孝店',
          amount: 45,
          carrierType: '1K0001',
          carrierNo: '1000419002328227',
          randomCode: '8821',
          items: [{ name: '大杯拿鐵', quantity: 1, unit_price: 45, amount: 45 }],
        },
        // 發票 2：全聯全新發票（刷雅媽信用卡），應全新建立並指派給雅媽
        {
          invoiceNumber: 'EF-59301284',
          invoiceDate: '2026-11-05',
          sellerName: '全聯福利中心 成功店',
          amount: 350,
          carrierType: '2G0001',
          carrierNo: '4147-****-****-8829',
          randomCode: '4392',
          items: [{ name: '鮮乳', quantity: 1, unit_price: 350, amount: 350 }],
        },
      ];

      const result = processCloudInvoicesSync(
        cloudInvoices,
        existingTransactions,
        mockAccounts,
        mockMembers,
        'user_dad',
        'ledger_1',
        'cat_general'
      );

      // 驗證統計
      expect(result.stats.totalInvoices).toBe(2);
      expect(result.stats.updatedCount).toBe(1);
      expect(result.stats.newCount).toBe(1);

      // 驗證更新的交易：保留原本備註與分類，填入發票號碼與標籤
      const updated = result.updatedTransactions[0];
      expect(updated.transactionId).toBe('tx_coffee');
      expect(updated.updates.invoice_number).toBe('EF-21608064');
      expect(updated.updates.invoice_sync_status).toBe('matched_cloud');
      expect(updated.updates.cloud_carrier_name).toBe('智市民卡');
      expect(updated.original.note).toBe('手動記帳備註');
      expect(updated.original.category_id).toBe('cat_dining');

      // 驗證新建立的交易：自動指派給雅媽
      const newTx = result.newTransactions[0];
      expect(newTx.data.invoice_number).toBe('EF-59301284');
      expect(newTx.data.paid_by).toBe('user_mom'); // 核心需求：依卡片來源歸給雅媽！
      expect(newTx.data.account_id).toBe('acc_cc_mom');
      expect(newTx.data.invoice_sync_status).toBe('cloud_imported');
    });
  });
});

