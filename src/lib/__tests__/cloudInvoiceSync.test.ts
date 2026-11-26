import {
  findExistingCarrierAccount,
  findMatchingAccount,
  findMatchingTransaction,
  getRecentCloudSyncedTransactions,
  normalizeCardNumber,
  parseMofInvoiceCsv,
  processCloudInvoicesSync,
} from '../cloudInvoiceSync';
import { CloudInvoiceItem, PaymentAccount, Profile, Transaction, CarrierRule } from '../../types/database';

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

    it('應能支援單一卡片帳戶綁定多組載具代碼（以逗號分隔）', () => {
      const accountsWithTokens: PaymentAccount[] = [
        {
          id: 'acc_jko_dad',
          ledger_id: 'ledger_1',
          name: '智爸台新街口卡',
          type: 'credit_card',
          user_id: 'user_dad',
          card_number: '356558hkku998127, 421378e+UI7812',
          last_four_digits: '5566',
          balance: 0,
          sort_order: 3,
          created_at: '2026-01-01',
        },
      ];

      // 比對第一組代碼
      const match1 = findMatchingAccount('356558hkku998127', '2G0001', accountsWithTokens);
      expect(match1).toBeDefined();
      expect(match1?.id).toBe('acc_jko_dad');

      // 比對第二組代碼
      const match2 = findMatchingAccount('421378e+UI7812', '2G0001', accountsWithTokens);
      expect(match2).toBeDefined();
      expect(match2?.id).toBe('acc_jko_dad');
    });

    it('若無符合卡號應回傳 undefined', () => {
      const match = findMatchingAccount('9999-9999-9999-9999', '2G0001', mockAccounts);
      expect(match).toBeUndefined();
    });

    it('應支援不分大小寫比對網購與會員載具代碼及 Email 載具', () => {
      const carrierAccounts: PaymentAccount[] = [
        {
          id: 'acc_uniopen',
          ledger_id: 'ledger_1',
          name: 'uniopen會員載具',
          type: 'carrier',
          user_id: 'user_dad',
          card_number: 'GID37899791210110',
          balance: 0,
          sort_order: 1,
          created_at: '2026-01-01',
        },
        {
          id: 'acc_email',
          ledger_id: 'ledger_1',
          name: '跨境電商電子郵件載具',
          type: 'carrier',
          user_id: 'user_dad',
          card_number: 'MattYu09@gmail.com',
          balance: 0,
          sort_order: 2,
          created_at: '2026-01-01',
        },
      ];

      expect(findMatchingAccount('gid37899791210110', '3J0002', carrierAccounts)?.id).toBe('acc_uniopen');
      expect(findMatchingAccount('mattyu09@gmail.com', 'email', carrierAccounts)?.id).toBe('acc_email');
    });
  });

  describe('findExistingCarrierAccount 網購會員載具防重複比對', () => {
    const carrierAccounts: PaymentAccount[] = [
      ...mockAccounts,
      {
        id: 'acc_uniopen_dad',
        ledger_id: 'ledger_1',
        name: 'uniopen會員載具',
        type: 'carrier',
        user_id: 'user_dad',
        card_number: 'GID37899791210110',
        balance: 0,
        sort_order: 3,
        created_at: '2026-01-01',
      },
      {
        id: 'acc_other_ledger_uniopen',
        ledger_id: 'ledger_2',
        name: 'uniopen會員載具',
        type: 'carrier',
        user_id: 'user_mom',
        card_number: 'GID37899791210110',
        balance: 0,
        sort_order: 1,
        created_at: '2026-01-01',
      },
      {
        id: 'acc_physical_same_code',
        ledger_id: 'ledger_1',
        name: '實體悠遊卡',
        type: 'stored_value',
        user_id: 'user_dad',
        card_number: '1000419002328227',
        balance: 100,
        sort_order: 4,
        created_at: '2026-01-01',
      },
    ];

    it('同帳本相同載具代碼（忽略大小寫與前後空白）應命中既有載具帳戶', () => {
      const hit = findExistingCarrierAccount(carrierAccounts, '  gid37899791210110  ', 'ledger_1');
      expect(hit?.id).toBe('acc_uniopen_dad');
    });

    it('不同帳本相同載具代碼不應誤判命中', () => {
      const hit = findExistingCarrierAccount(carrierAccounts, 'GID37899791210110', 'ledger_3');
      expect(hit).toBeUndefined();
    });

    it('同代碼但非 carrier 類型的實體卡片不應被視為重複網購載具', () => {
      const hit = findExistingCarrierAccount(carrierAccounts, '1000419002328227', 'ledger_1');
      expect(hit).toBeUndefined();
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

    it('發票若命中載具分流規則（隱喻的第三張卡），應自動指派成員且不列入未建檔載具', () => {
      const mockRules: CarrierRule[] = [
        {
          id: 'rule_shopee_mom',
          ledger_id: 'ledger_1',
          carrier_no: '16729177',
          carrier_name: '【樂購蝦皮】載具',
          user_id: 'user_mom',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
        {
          id: 'rule_psn_dad',
          ledger_id: 'ledger_1',
          carrier_no: 'mattyu09@gmail.com',
          carrier_name: 'PSN跨境電商',
          user_id: 'user_dad',
          account_id: 'acc_cc_mom', // 假設綁定媽媽的卡扣款
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ];

      const invoices: CloudInvoiceItem[] = [
        {
          invoiceNumber: 'SP-11112222',
          invoiceDate: '2026-09-10',
          sellerName: '樂購蝦皮拍賣',
          amount: 520,
          carrierNo: '16729177',
          carrierName: '蝦皮購物載具',
        },
        {
          invoiceNumber: 'PS-33334444',
          invoiceDate: '2026-09-11',
          sellerName: 'Sony Interactive Entertainment',
          amount: 1490,
          carrierNo: 'mattyu09@gmail.com',
          carrierName: '跨境電商載具',
        },
      ];

      const result = processCloudInvoicesSync(
        invoices,
        [],
        mockAccounts,
        mockMembers,
        'user_dad', // 預設付費人是智爸
        'ledger_1',
        'cat_general',
        mockRules
      );

      // 1. 蝦皮發票應指派給雅媽 (user_mom)
      const shopeeTx = result.newTransactions.find(t => t.data.invoice_number === 'SP-11112222');
      expect(shopeeTx).toBeDefined();
      expect(shopeeTx?.data.paid_by).toBe('user_mom');

      // 2. PSN 發票應指派給智爸 (user_dad)，且關聯指定帳戶 (acc_cc_mom)
      const psnTx = result.newTransactions.find(t => t.data.invoice_number === 'PS-33334444');
      expect(psnTx).toBeDefined();
      expect(psnTx?.data.paid_by).toBe('user_dad');
      expect(psnTx?.data.account_id).toBe('acc_cc_mom');

      // 3. 兩筆發票都命中規則，未註冊載具清單應為空！
      expect(result.unregisteredCarriers.length).toBe(0);
    });

    it('發票若命中 PaymentAccount 中的網購會員載具卡 (type: carrier)，應自動分流成員且不關聯扣款帳戶', () => {
      const accountsWithCarrier: PaymentAccount[] = [
        ...mockAccounts,
        {
          id: 'acc_carrier_shopee',
          ledger_id: 'ledger_1',
          name: '【樂購蝦皮】載具',
          type: 'carrier',
          user_id: 'user_mom',
          card_number: '16729177',
          balance: 0,
          sort_order: 4,
          created_at: '2026-01-01',
        },
      ];

      const invoices: CloudInvoiceItem[] = [
        {
          invoiceNumber: 'SP-88889999',
          invoiceDate: '2026-09-12',
          sellerName: '蝦皮購物嚴選',
          amount: 880,
          carrierNo: '16729177',
          carrierName: '蝦皮會員載具',
        },
      ];

      const result = processCloudInvoicesSync(
        invoices,
        [],
        accountsWithCarrier,
        mockMembers,
        'user_dad',
        'ledger_1',
        'cat_general'
      );

      const tx = result.newTransactions.find(t => t.data.invoice_number === 'SP-88889999');
      expect(tx).toBeDefined();
      expect(tx?.data.paid_by).toBe('user_mom'); // 自動分流給雅媽
      expect(tx?.data.cloud_carrier_name).toBe('【樂購蝦皮】載具');
      expect(tx?.data.account_id).toBeUndefined(); // 網購載具不作為金融扣款帳戶
      expect(result.unregisteredCarriers.length).toBe(0);
    });

    it('同批發票若有大小寫或空白差異之未登記載具代碼應合併為 1 筆，且登記載具重算後應立即移出未登記清單', () => {
      const invoices: CloudInvoiceItem[] = [
        {
          invoiceNumber: 'UN-11112222',
          invoiceDate: '2026-11-10',
          sellerName: '統一超商',
          amount: 85,
          carrierNo: 'GID37899791210110',
          carrierName: 'uniopen會員載具',
        },
        {
          invoiceNumber: 'UN-33334444',
          invoiceDate: '2026-11-11',
          sellerName: '康是美',
          amount: 199,
          carrierNo: ' gid37899791210110 ',
          carrierName: 'uniopen會員載具',
        },
      ];

      // 登記前：同一載具僅應彙整為 1 筆未登記項目
      const beforeBind = processCloudInvoicesSync(
        invoices,
        [],
        mockAccounts,
        mockMembers,
        'user_dad',
        'ledger_1',
        'cat_general'
      );
      expect(beforeBind.unregisteredCarriers.length).toBe(1);
      expect(beforeBind.unregisteredCarriers[0].carrierNo).toBe('GID37899791210110');
      expect(beforeBind.unregisteredCarriers[0].invoiceCount).toBe(2);
      expect(beforeBind.unregisteredCarriers[0].totalAmount).toBe(284);

      // 登記為雅媽的 uniopen 會員載具並以最新 accounts 重算
      const updatedAccounts: PaymentAccount[] = [
        ...mockAccounts,
        {
          id: 'acc_uniopen_mom',
          ledger_id: 'ledger_1',
          name: 'uniopen會員載具',
          type: 'carrier',
          user_id: 'user_mom',
          card_number: 'GID37899791210110',
          balance: 0,
          sort_order: 3,
          created_at: '2026-11-26',
        },
      ];

      const afterBind = processCloudInvoicesSync(
        invoices,
        [],
        updatedAccounts,
        mockMembers,
        'user_dad',
        'ledger_1',
        'cat_general'
      );
      expect(afterBind.unregisteredCarriers.length).toBe(0);
      expect(afterBind.newTransactions.every(t => t.data.paid_by === 'user_mom')).toBe(true);
    });

    it('已補齊發票的交易（含連字號差異 FB-47844491 vs FB47844491）重複匯入時應判為已同步且不重複修改', () => {
      const existingTransactions: Transaction[] = [
        {
          id: 'tx_711',
          ledger_id: 'ledger_1',
          creator_id: 'user_mom',
          category_id: 'cat_dining',
          amount: 333,
          type: 'expense',
          paid_by: 'user_mom',
          transacted_at: '2026-10-27T11:20:48.736Z',
          merchant: '7-11',
          invoice_number: 'FB-47844491',
          invoice_sync_status: 'matched_cloud',
          cloud_synced_at: '2026-11-26T10:00:00.000Z',
          is_settled: false,
          created_at: '2026-10-27T11:20:48.736Z',
        },
      ];

      const invoices: CloudInvoiceItem[] = [
        {
          invoiceNumber: 'FB47844491',
          invoiceDate: '2026-10-27',
          sellerName: '統一超商',
          amount: 333,
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

      expect(result.stats.alreadySyncedCount).toBe(1);
      expect(result.stats.updatedCount).toBe(0);
      expect(result.stats.newCount).toBe(0);
      expect(result.updatedTransactions[0].isAlreadySynced).toBe(true);
    });

    it('第一次補齊既有手動交易時應正確列出 changedFields 補齊項目摘要', () => {
      const existingTransactions: Transaction[] = [
        {
          id: 'tx_manual_no_merchant',
          ledger_id: 'ledger_1',
          creator_id: 'user_dad',
          category_id: 'cat_dining',
          amount: 120,
          type: 'expense',
          paid_by: 'user_dad',
          transacted_at: '2026-11-08T12:00:00.000Z',
          is_settled: false,
          created_at: '2026-11-08T12:00:00.000Z',
        },
      ];

      const invoices: CloudInvoiceItem[] = [
        {
          invoiceNumber: 'UV12345678',
          invoiceDate: '2026-11-08',
          sellerName: '八方雲集',
          amount: 120,
          carrierType: '1K0001',
          carrierNo: '1000419002328227',
          items: [{ name: '招牌鍋貼', quantity: 1, unit_price: 120, amount: 120 }],
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

      expect(result.updatedTransactions[0].isAlreadySynced).toBe(false);
      expect(result.updatedTransactions[0].changedFields).toEqual([
        '發票號碼',
        '店家名稱',
        '扣款卡片',
        '商品明細',
      ]);
    });
  });

  describe('getRecentCloudSyncedTransactions 跨月異動交易集中彙整', () => {
    const nowMs = new Date('2026-11-26T18:00:00.000Z').getTime();
    const txs: Transaction[] = [
      {
        id: 'tx_matched_oct',
        ledger_id: 'ledger_1',
        creator_id: 'user_mom',
        category_id: 'cat_1',
        amount: 333,
        type: 'expense',
        paid_by: 'user_mom',
        transacted_at: '2026-10-27T11:20:00.000Z',
        merchant: '7-11',
        invoice_number: 'FB-47844491',
        invoice_sync_status: 'matched_cloud',
        cloud_synced_at: '2026-11-26T17:30:00.000Z',
        cloud_carrier_name: '手機條碼載具',
        is_settled: false,
        created_at: '2026-10-27',
      },
      {
        id: 'tx_imported_nov',
        ledger_id: 'ledger_1',
        creator_id: 'user_dad',
        category_id: 'cat_1',
        amount: 848,
        type: 'expense',
        paid_by: 'user_dad',
        transacted_at: '2026-11-01T12:00:00.000Z',
        merchant: '全聯',
        invoice_number: 'EU-46266518',
        invoice_sync_status: 'cloud_imported',
        cloud_synced_at: '2026-11-26T17:45:00.000Z',
        is_settled: false,
        created_at: '2026-11-26',
      },
      {
        id: 'tx_old_synced',
        ledger_id: 'ledger_1',
        creator_id: 'user_dad',
        category_id: 'cat_1',
        amount: 99,
        type: 'expense',
        paid_by: 'user_dad',
        transacted_at: '2026-09-15T12:00:00.000Z',
        merchant: '全家',
        invoice_sync_status: 'cloud_imported',
        cloud_synced_at: '2026-11-20T10:00:00.000Z',
        is_settled: false,
        created_at: '2026-11-20',
      },
      {
        id: 'tx_manual_only',
        ledger_id: 'ledger_1',
        creator_id: 'user_dad',
        category_id: 'cat_1',
        amount: 50,
        type: 'expense',
        paid_by: 'user_dad',
        transacted_at: '2026-11-26T09:00:00.000Z',
        merchant: '早餐店',
        invoice_sync_status: 'manual',
        is_settled: false,
        created_at: '2026-11-26',
      },
    ];

    it('應按同步時間降冪排列並支援 24 小時區間與異動類型篩選', () => {
      const recent24h = getRecentCloudSyncedTransactions(txs, { withinHours: 24, nowMs });
      expect(recent24h.map(i => i.transaction.id)).toEqual(['tx_imported_nov', 'tx_matched_oct']);

      const matchedOnly = getRecentCloudSyncedTransactions(txs, {
        withinHours: 24,
        filterType: 'matched_cloud',
        nowMs,
      });
      expect(matchedOnly.map(i => i.transaction.id)).toEqual(['tx_matched_oct']);

      const allSynced = getRecentCloudSyncedTransactions(txs, { nowMs });
      expect(allSynced.map(i => i.transaction.id)).toEqual([
        'tx_imported_nov',
        'tx_matched_oct',
        'tx_old_synced',
      ]);
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

