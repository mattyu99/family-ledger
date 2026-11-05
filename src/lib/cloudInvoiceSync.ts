import { CloudInvoiceItem, PaymentAccount, Profile, Transaction } from '../types/database';

/**
 * 清理並標準化卡號字串（去除空格、連字號、星號遮罩）
 */
export const normalizeCardNumber = (raw?: string): string => {
  if (!raw) return '';
  return raw.replace(/[-\s*]/g, '');
};

/**
 * 依據財政部回傳之載具卡號，智慧比對帳本中的對應卡片帳戶
 */
export const findMatchingAccount = (
  carrierNo?: string,
  carrierType?: string,
  accounts: PaymentAccount[] = []
): PaymentAccount | undefined => {
  if (!carrierNo || accounts.length === 0) return undefined;

  const cleanCarrierNo = normalizeCardNumber(carrierNo);
  if (!cleanCarrierNo) return undefined;

  // 1. 若為悠遊卡載具 (1K0001) 或含有 10~16 碼純數字卡號，優先比對完整悠遊卡號
  for (const acc of accounts) {
    if (acc.card_number) {
      const cleanAccCard = normalizeCardNumber(acc.card_number);
      if (
        cleanAccCard &&
        (cleanCarrierNo === cleanAccCard ||
          cleanCarrierNo.endsWith(cleanAccCard) ||
          cleanAccCard.endsWith(cleanCarrierNo))
      ) {
        return acc;
      }
    }
  }

  // 2. 比對信用卡末四碼 (例如 8829 或 4147-****-****-8829)
  const carrierTail4 = cleanCarrierNo.slice(-4);
  if (carrierTail4 && carrierTail4.length === 4) {
    for (const acc of accounts) {
      if (acc.last_four_digits) {
        const cleanLast4 = normalizeCardNumber(acc.last_four_digits);
        if (cleanLast4 === carrierTail4) {
          return acc;
        }
      }
      if (acc.card_number) {
        const cleanAccCard = normalizeCardNumber(acc.card_number);
        if (cleanAccCard.endsWith(carrierTail4)) {
          return acc;
        }
      }
    }
  }

  return undefined;
};

/**
 * 智慧媒合：在現有手動交易中尋找最吻合的交易進行無條件自動補齊
 */
export const findMatchingTransaction = (
  invoice: CloudInvoiceItem,
  transactions: Transaction[],
  matchedAccount?: PaymentAccount,
  alreadyMatchedTxIds: Set<string> = new Set()
): Transaction | undefined => {
  const invoiceAmt = Math.round(invoice.amount);
  const invoiceDateMs = new Date(invoice.invoiceDate).getTime();

  let bestMatch: Transaction | undefined;
  let highestScore = -1;

  for (const tx of transactions) {
    // 必須為支出交易且尚未被本輪其他發票媒合
    if (tx.type !== 'expense' || alreadyMatchedTxIds.has(tx.id)) continue;

    // 硬條件 1：金額必須 100% 相同
    if (Math.round(tx.amount) !== invoiceAmt) continue;

    // 硬條件 2：若已有發票號碼且與當前發票不同，不搶佔他人已綁定的發票
    if (tx.invoice_number && tx.invoice_number.trim() !== invoice.invoiceNumber.trim()) {
      continue;
    }

    // 硬條件 3：日期差距在 ±1.5 天之內 (考慮店家跨午夜批次上傳)
    const txDateStr = tx.transacted_at.split('T')[0];
    const txDateMs = new Date(txDateStr).getTime();
    const diffHours = Math.abs(txDateMs - invoiceDateMs) / (1000 * 60 * 60);
    if (diffHours > 36) continue;

    // 評分機制 (Score)
    let score = 10; // 通過金額與日期的基礎分

    // 同一天加分
    if (txDateStr === invoice.invoiceDate) {
      score += 20;
    }

    // 發票號碼早已吻合加滿分
    if (tx.invoice_number && tx.invoice_number.trim() === invoice.invoiceNumber.trim()) {
      score += 100;
    }

    // 扣款卡片帳戶吻合加分
    if (matchedAccount && tx.account_id === matchedAccount.id) {
      score += 40;
    }

    // 店家名稱模糊吻合加分
    if (tx.merchant && invoice.sellerName) {
      const txM = tx.merchant.toLowerCase().replace(/[\s·-]/g, '');
      const invM = invoice.sellerName.toLowerCase().replace(/[\s·-]/g, '');
      if (txM && (invM.includes(txM) || txM.includes(invM))) {
        score += 30;
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestMatch = tx;
    }
  }

  return bestMatch;
};

export interface SyncProcessResult {
  updatedTransactions: {
    transactionId: string;
    original: Transaction;
    updates: Partial<Transaction>;
    invoice: CloudInvoiceItem;
    matchedAccount?: PaymentAccount;
  }[];
  newTransactions: {
    data: Omit<Transaction, 'id' | 'created_at'>;
    invoice: CloudInvoiceItem;
    matchedAccount?: PaymentAccount;
  }[];
  stats: {
    totalInvoices: number;
    updatedCount: number;
    newCount: number;
    totalAmount: number;
  };
}

/**
 * 執行雲端發票整批智慧同步處理
 */
export const processCloudInvoicesSync = (
  invoices: CloudInvoiceItem[],
  existingTransactions: Transaction[],
  accounts: PaymentAccount[],
  members: Profile[],
  defaultPayerId: string,
  ledgerId: string,
  defaultCategoryId: string
): SyncProcessResult => {
  const updatedTransactions: SyncProcessResult['updatedTransactions'] = [];
  const newTransactions: SyncProcessResult['newTransactions'] = [];
  const alreadyMatchedTxIds = new Set<string>();

  const nowIso = new Date().toISOString();

  for (const inv of invoices) {
    // 1. 卡號比對：找到所屬卡片帳戶
    const matchedAcc = findMatchingAccount(inv.carrierNo, inv.carrierType, accounts);

    // 2. 在現有手動交易中尋找吻合項目
    const matchedTx = findMatchingTransaction(inv, existingTransactions, matchedAcc, alreadyMatchedTxIds);

    if (matchedTx) {
      // 既有交易無條件自動補齊
      alreadyMatchedTxIds.add(matchedTx.id);

      const updates: Partial<Transaction> = {
        invoice_number: inv.invoiceNumber,
        invoice_random_code: inv.randomCode || matchedTx.invoice_random_code,
        invoice_sync_status: 'matched_cloud',
        cloud_synced_at: nowIso,
        cloud_carrier_name: matchedAcc?.name || (inv.carrierType === '1K0001' ? '悠遊卡載具' : '手機條碼載具'),
        invoice_items: inv.items && inv.items.length > 0 ? inv.items : matchedTx.invoice_items,
      };

      // 若手動記帳未填店家名稱，以發票官方營業人名稱補齊
      if (!matchedTx.merchant && inv.sellerName) {
        updates.merchant = inv.sellerName;
      }

      // 若原交易未設定帳戶且已比對到卡片，自動關聯帳戶
      if (!matchedTx.account_id && matchedAcc) {
        updates.account_id = matchedAcc.id;
      }

      updatedTransactions.push({
        transactionId: matchedTx.id,
        original: matchedTx,
        updates,
        invoice: inv,
        matchedAccount: matchedAcc,
      });
    } else {
      // 全新發票：根據卡片自動指派持卡人為付款人
      const targetPayerId = matchedAcc?.user_id || defaultPayerId;

      const newTxData: Omit<Transaction, 'id' | 'created_at'> = {
        ledger_id: ledgerId,
        creator_id: defaultPayerId,
        category_id: defaultCategoryId,
        amount: inv.amount,
        type: 'expense',
        paid_by: targetPayerId,
        transacted_at: `${inv.invoiceDate}T${inv.invoiceTime || '12:00:00'}.000Z`,
        merchant: inv.sellerName,
        payment_method: matchedAcc?.type === 'credit_card' ? 'credit_card' : matchedAcc?.type === 'stored_value' ? 'stored_value' : 'cash',
        account_id: matchedAcc?.id,
        note: inv.items && inv.items.length > 0 ? inv.items.map(i => `${i.name} x${i.quantity}`).join('、') : '',
        invoice_number: inv.invoiceNumber,
        invoice_random_code: inv.randomCode,
        invoice_sync_status: 'cloud_imported',
        cloud_synced_at: nowIso,
        cloud_carrier_name: matchedAcc?.name || '雲端載具',
        invoice_items: inv.items,
        is_settled: false,
      };

      newTransactions.push({
        data: newTxData,
        invoice: inv,
        matchedAccount: matchedAcc,
      });
    }
  }

  const totalAmount = invoices.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

  return {
    updatedTransactions,
    newTransactions,
    stats: {
      totalInvoices: invoices.length,
      updatedCount: updatedTransactions.length,
      newCount: newTransactions.length,
      totalAmount,
    },
  };
};

/**
 * 產生逼真的模擬雲端發票資料（自動取自當前帳本之真實卡號與成員）
 */
export const generateMockCloudInvoices = (
  accounts: PaymentAccount[] = [],
  todayYmd?: string
): CloudInvoiceItem[] => {
  const baseDate = todayYmd || new Date().toISOString().split('T')[0];
  const invoices: CloudInvoiceItem[] = [];

  // 尋找悠遊卡
  const easyCard = accounts.find(a => a.type === 'stored_value' || a.name.includes('悠遊') || a.name.includes('市民'));
  // 尋找信用卡
  const creditCard = accounts.find(a => a.type === 'credit_card');

  // 發票 1：超商早餐（使用悠遊卡）
  const easyCardNo = easyCard?.card_number || '1000419002328227';
  invoices.push({
    invoiceNumber: 'EF-21608064',
    invoiceDate: baseDate,
    invoiceTime: '08:25:10',
    sellerName: '全家便利商店 忠孝店',
    sellerTaxId: '23060248',
    amount: 45,
    carrierType: '1K0001',
    carrierNo: easyCardNo,
    randomCode: '8821',
    items: [
      { name: '大杯拿鐵 (熱)', quantity: 1, unit_price: 45, amount: 45 },
    ],
  });

  // 發票 2：全聯採買食材（使用信用卡或手機條碼）
  const ccTail = creditCard?.last_four_digits || '8829';
  invoices.push({
    invoiceNumber: 'EF-59301284',
    invoiceDate: baseDate,
    invoiceTime: '17:40:22',
    sellerName: '全聯福利中心 成功店',
    sellerTaxId: '16740494',
    amount: 350,
    carrierType: '2G0001',
    carrierNo: `4147-****-****-${ccTail}`,
    randomCode: '4392',
    items: [
      { name: '鮮乳 (全脂) 936ml', quantity: 1, unit_price: 92, amount: 92 },
      { name: '洗選紅蛋 10入', quantity: 1, unit_price: 68, amount: 68 },
      { name: '有機履歷高麗菜', quantity: 1, unit_price: 55, amount: 55 },
      { name: '冷藏去骨雞腿排', quantity: 1, unit_price: 135, amount: 135 },
    ],
  });

  // 發票 3：台灣中油加油（使用悠遊卡或信用卡）
  invoices.push({
    invoiceNumber: 'EF-88129033',
    invoiceDate: baseDate,
    invoiceTime: '12:15:05',
    sellerName: '台灣中油 內湖加油站',
    sellerTaxId: '03795505',
    amount: 150,
    carrierType: '1K0001',
    carrierNo: easyCardNo,
    randomCode: '1092',
    items: [
      { name: '95無鉛汽油', quantity: 5.1, unit_price: 29.4, amount: 150 },
    ],
  });

  return invoices;
};
