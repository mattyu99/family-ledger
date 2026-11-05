import { PaymentAccount, Transaction } from '../types/database';
import { StatementFile, getStatementForCardCycle } from './statementStorage';
import { groupCreditCardsByIssuer } from './bankIssuer';
import { getCreditCardBillingCycles, isDateInBillingCycle } from './payment';

/**
 * 歷史存摺各張卡片小計介面
 */
export interface PassbookCardSubtotal {
  card: PaymentAccount;
  spend: number;
  rebate: number;
  totalAmount: number;
  totalCount: number;
  reconciledCount: number;
  isAllReconciled: boolean;
}

/**
 * 歷史帳單存摺單一期別彙總條目
 */
export interface PassbookCycleEntry {
  id: string; // 唯一鍵：${group.key}__${cycle.key}
  groupKey: string;
  issuerCode: string;
  issuerName: string;
  userId?: string;
  cardholderName?: string;
  billingCycleDate: number;
  cycleKey: string;
  cycleName: string;
  rangeText: string;
  startDate: Date;
  endDate: Date;
  cards: PaymentAccount[];
  isMultiCard: boolean;
  totalSpend: number;
  totalRebate: number;
  totalAmount: number; // 銀行扣繳/應繳總額 (消費 - 回饋折抵)
  totalCount: number;
  reconciledCount: number;
  isAllReconciled: boolean;
  statement: StatementFile | null;
  cardSubtotals: PassbookCardSubtotal[];
}

export interface BuildPassbookParams {
  creditCards: PaymentAccount[];
  transactions: Transaction[];
  statements: StatementFile[];
  allAccounts: PaymentAccount[];
  members?: { id: string; display_name: string }[];
  getMemberById?: (id?: string) => { display_name?: string } | undefined;
  cycleCount?: number;
  referenceDate?: Date;
}

/**
 * 依據發卡機構歸戶與帳單週期，彙總建構信用卡歷期帳單存摺條目
 * 1. 依持卡人與發卡銀行將信用卡分組
 * 2. 推算歷次結帳週期並精準過濾消費與回饋折抵
 * 3. 取得電子帳單連結（支援同銀行多卡智慧鏡射）
 * 4. 產出母層（銀行總額）與子層（各卡小計）存摺紀錄
 */
export const buildPassbookEntries = (params: BuildPassbookParams): PassbookCycleEntry[] => {
  const {
    creditCards,
    transactions,
    statements,
    allAccounts,
    members = [],
    getMemberById,
    cycleCount = 12,
    referenceDate = new Date(),
  } = params;

  if (!creditCards || creditCards.length === 0) return [];

  const groups = groupCreditCardsByIssuer(creditCards);
  const result: PassbookCycleEntry[] = [];

  groups.forEach(group => {
    const cycles = getCreditCardBillingCycles(group.billingCycleDate, referenceDate, cycleCount);
    const siblingIds = group.cards.map(c => c.id);
    const cardholder = members.find(m => m.id === group.userId);

    cycles.forEach(cycle => {
      const groupTxs = transactions.filter(t => {
        if (t.type === 'memo') return false;
        const isCardMatch =
          (t.account_id && siblingIds.includes(t.account_id)) ||
          (t.payment_method === 'credit_card' &&
            !t.account_id &&
            (t.paid_by === group.userId ||
              (getMemberById &&
                group.userId &&
                getMemberById(t.paid_by)?.display_name === getMemberById(group.userId)?.display_name)));
        if (!isCardMatch) return false;
        return isDateInBillingCycle(t.transacted_at, cycle.startDate, cycle.endDate);
      });

      const stmt = getStatementForCardCycle(statements, group.cards[0].id, cycle.key, allAccounts);

      // 若該期無任何消費且無電子帳單，不列入存摺
      if (groupTxs.length === 0 && !stmt) return;

      const spendTxs = groupTxs.filter(t => t.type === 'expense' || t.type === 'transfer');
      const rebateTxs = groupTxs.filter(t => t.type === 'income');
      const totalSpend = spendTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0);
      const totalRebate = rebateTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0);
      const totalAmount = totalSpend - totalRebate;
      const reconciledCount = groupTxs.filter(t => t.is_reconciled).length;
      const isAllReconciled = groupTxs.length > 0 && reconciledCount === groupTxs.length;

      const cardSubtotals: PassbookCardSubtotal[] = group.cards.map(card => {
        const cardTxs = groupTxs.filter(t => {
          if (t.account_id) return t.account_id === card.id;
          return card.id === group.cards[0].id;
        });
        const cSpend = cardTxs.filter(t => t.type === 'expense' || t.type === 'transfer').reduce((sum, t) => sum + Number(t.amount || 0), 0);
        const cRebate = cardTxs.filter(t => t.type === 'income').reduce((sum, t) => sum + Number(t.amount || 0), 0);
        const cTotal = cSpend - cRebate;
        const cReconciled = cardTxs.filter(t => t.is_reconciled).length;
        return {
          card,
          spend: cSpend,
          rebate: cRebate,
          totalAmount: cTotal,
          totalCount: cardTxs.length,
          reconciledCount: cReconciled,
          isAllReconciled: cardTxs.length > 0 && cReconciled === cardTxs.length,
        };
      });

      result.push({
        id: `${group.key}__${cycle.key}`,
        groupKey: group.key,
        issuerCode: group.issuer.id,
        issuerName: group.issuer.shortName,
        userId: group.userId,
        cardholderName: cardholder?.display_name || (getMemberById && group.userId ? getMemberById(group.userId)?.display_name : '') || '',
        billingCycleDate: group.billingCycleDate,
        cycleKey: cycle.key,
        cycleName: cycle.cycleName,
        rangeText: cycle.rangeText,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
        cards: group.cards,
        isMultiCard: group.isMultiCard,
        totalSpend,
        totalRebate,
        totalAmount,
        totalCount: groupTxs.length,
        reconciledCount,
        isAllReconciled,
        statement: stmt,
        cardSubtotals,
      });
    });
  });

  // 按帳單期別降序排列（最新期在最上）
  return result.sort((a, b) => b.cycleKey.localeCompare(a.cycleKey));
};
