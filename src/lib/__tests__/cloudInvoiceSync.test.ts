import {
  findMatchingAccount,
  findMatchingTransaction,
  normalizeCardNumber,
  parseMofInvoiceCsv,
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

    it('若已存在過去匯入過之發票，應自動標記防重且不重複新增', () => {
      const existingTransactions: Transaction[] = [
        {
          id: 'tx_already_synced',
          ledger_id: 'ledger_1',
          creator_id: 'user_dad',
          category_id: 'cat_dining',
          amount: 848,
          type: 'expense',
          paid_by: 'user_dad',
          transacted_at: '2026-09-01T12:00:00.000Z',
          merchant: '全聯實業股份有限公司大溪文化分公司',
          invoice_number: 'EU46266518',
          invoice_sync_status: 'cloud_imported',
          cloud_synced_at: '2026-10-01T10:00:00.000Z',
          is_settled: true,
          created_at: '2026-10-01',
        },
      ];

      const invoices: CloudInvoiceItem[] = [
        {
          invoiceNumber: 'EU46266518',
          invoiceDate: '2026-09-01',
          sellerName: '全聯實業股份有限公司大溪文化分公司',
          amount: 848,
          carrierType: '3J0002',
          carrierNo: '/R-VNORQ',
        },
      ];

      const result = processCloudInvoicesSync(
        invoices,
        existingTransactions,
        mockAccounts,
        mockMembers,
        'user_dad',
        'ledger_1',
        'cat_general'
      );

      expect(result.stats.totalInvoices).toBe(1);
      expect(result.stats.alreadySyncedCount).toBe(1);
      expect(result.stats.updatedCount).toBe(0);
      expect(result.stats.newCount).toBe(0);
      expect(result.updatedTransactions[0].isAlreadySynced).toBe(true);
    });

    it('若發票含有未建檔之卡片載具，應正確彙整至 unregisteredCarriers', () => {
      const invoices: CloudInvoiceItem[] = [
        {
          invoiceNumber: 'IP-12345678',
          invoiceDate: '2026-09-05',
          sellerName: '高雄捷運',
          amount: 35,
          carrierType: '1H0001',
          carrierName: '一卡通',
          carrierNo: '0123456789012345',
        },
      ];

      const result = processCloudInvoicesSync(
        invoices,
        [],
        mockAccounts,
        mockMembers,
        'user_dad',
        'ledger_1',
        'cat_general'
      );

      expect(result.unregisteredCarriers.length).toBe(1);
      expect(result.unregisteredCarriers[0].carrierNo).toBe('0123456789012345');
      expect(result.unregisteredCarriers[0].carrierName).toBe('一卡通');
      expect(result.unregisteredCarriers[0].invoiceCount).toBe(1);
      expect(result.unregisteredCarriers[0].totalAmount).toBe(35);
    });
  });

  describe('parseMofInvoiceCsv 財政部官方 CSV 解析器', () => {
    const sampleCsv = `
表頭=M|載具名稱|載具號碼|發票日期|商店統編|商店店名|發票號碼|總金額|發票狀態|
明細=D|發票號碼|小計|品項名稱|
M|手機條碼|/R-VNORQ|20260901|28984380|全聯實業股份有限公司大溪文化分公司|EU46266518|848|開立|
D|EU46266518|0|柏賓士印花張|
D|EU46266518|6|PCR購物袋大|
D|EU46266518|166|瑞穗全脂鮮奶|
D|EU46266518|-203|折讓|
M|手機條碼|/R-VNORQ|20260901|61392995|統一超商股份有限公司桃園市第九十三門市|FB47823008|338|開立|
D|FB47823008|2|購物袋-特大袋|
D|FB47823008|70|愛餡大亨-煉乳牛奶|
M|悠遊卡|1000419002328227|20260903|23060248|全家便利商店|FA11223344|50|開立|
D|FA11223344|50|拿鐵咖啡|
M|手機條碼|/R-VNORQ|20260902|12345678|測試作廢商店|XX99999999|100|作廢|
D|XX99999999|100|測試項目|
    `.trim();

    it('應能正確解析主發票 M 與商品明細 D，並濾除作廢發票', () => {
      const parsed = parseMofInvoiceCsv(sampleCsv);
      expect(parsed.length).toBe(3); // 4 筆中有一筆作廢

      // 第 1 筆：全聯發票
      const inv1 = parsed[0];
      expect(inv1.invoiceNumber).toBe('EU46266518');
      expect(inv1.invoiceDate).toBe('2026-09-01');
      expect(inv1.sellerName).toBe('全聯實業股份有限公司大溪文化分公司');
      expect(inv1.sellerTaxId).toBe('28984380');
      expect(inv1.amount).toBe(848);
      expect(inv1.carrierNo).toBe('/R-VNORQ');
      expect(inv1.carrierName).toBe('手機條碼');
      expect(inv1.items?.length).toBe(4);
      expect(inv1.items?.[2]).toEqual({
        name: '瑞穗全脂鮮奶',
        quantity: 1,
        unit_price: 166,
        amount: 166,
      });
      // 驗證負數折讓項目正確解析
      expect(inv1.items?.[3]).toEqual({
        name: '折讓',
        quantity: 1,
        unit_price: -203,
        amount: -203,
      });

      // 第 2 筆：統一超商
      const inv2 = parsed[1];
      expect(inv2.invoiceNumber).toBe('FB47823008');
      expect(inv2.amount).toBe(338);
      expect(inv2.items?.length).toBe(2);

      // 第 3 筆：悠遊卡載具
      const inv3 = parsed[2];
      expect(inv3.invoiceNumber).toBe('FA11223344');
      expect(inv3.carrierType).toBe('1K0001');
      expect(inv3.carrierName).toBe('悠遊卡');
      expect(inv3.carrierNo).toBe('1000419002328227');
    });

    it('空字串應回傳空陣列', () => {
      expect(parseMofInvoiceCsv('')).toEqual([]);
      expect(parseMofInvoiceCsv('   ')).toEqual([]);
    });
  });
});

