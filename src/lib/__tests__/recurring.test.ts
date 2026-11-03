import {
  isBillDueInMonth,
  getInstallmentInfo,
  getCurrentPeriodKey,
  appendPeriodKey,
  isBillPaidForCurrentPeriod,
  getBillPeriodLabel,
  getBillDueDate,
  getRollingBillDueInfo,
} from '../recurring';
import { RecurringRule } from '../../types';

describe('週期性帳單、分期與滾動推算核心模組 (recurring.ts)', () => {
  const baseMonthlyRule: RecurringRule = {
    id: 'rule-monthly',
    ledger_id: 'ledger-1',
    name: '光纖寬頻網路',
    amount_type: 'fixed',
    default_amount: 899,
    category_id: 'cat-internet',
    paid_by: 'user-dad',
    payment_method: 'bank_transfer',
    frequency: 'monthly',
    due_day: 15,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  const biMonthlyWaterRule: RecurringRule = {
    id: 'rule-water',
    ledger_id: 'ledger-1',
    name: '自來水費 (雙月雙數月繳)',
    amount_type: 'variable',
    default_amount: 650,
    category_id: 'cat-water',
    paid_by: 'user-dad',
    payment_method: 'bank_transfer',
    frequency: 'bimonthly',
    bimonthly_start_month: 2, // 雙數月出帳 (2, 4, 6, 8, 10, 12)
    due_day: 20,
    is_active: true,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  };

  const installmentRule: RecurringRule = {
    id: 'rule-phone-install',
    ledger_id: 'ledger-1',
    name: '手機分期',
    amount_type: 'fixed',
    default_amount: 3000,
    category_id: 'cat-phone',
    paid_by: 'user-dad',
    payment_method: 'credit_card',
    frequency: 'monthly',
    due_day: 5,
    is_active: true,
    is_installment: true,
    total_installments: 12,
    current_installment: 4,
    installment_start_period: '2026-01',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  describe('出帳月份判斷 (isBillDueInMonth)', () => {
    it('月繳項目每個月都應出帳', () => {
      for (let m = 1; m <= 12; m++) {
        expect(isBillDueInMonth(baseMonthlyRule, 2026, m)).toBe(true);
      }
    });

    it('雙月雙數月繳 (bimonthly_start_month = 2) 僅在 2, 4, 6, 8, 10, 12 月出帳', () => {
      expect(isBillDueInMonth(biMonthlyWaterRule, 2026, 10)).toBe(true);
      expect(isBillDueInMonth(biMonthlyWaterRule, 2026, 8)).toBe(true);
      expect(isBillDueInMonth(biMonthlyWaterRule, 2026, 9)).toBe(false);
      expect(isBillDueInMonth(biMonthlyWaterRule, 2026, 11)).toBe(false);
    });

    it('季繳項目應每 3 個月出帳一次 (1, 4, 7, 10 月)', () => {
      const quarterlyRule: RecurringRule = { ...baseMonthlyRule, frequency: 'quarterly' };
      expect(isBillDueInMonth(quarterlyRule, 2026, 1)).toBe(true);
      expect(isBillDueInMonth(quarterlyRule, 2026, 4)).toBe(true);
      expect(isBillDueInMonth(quarterlyRule, 2026, 7)).toBe(true);
      expect(isBillDueInMonth(quarterlyRule, 2026, 10)).toBe(true);
      expect(isBillDueInMonth(quarterlyRule, 2026, 2)).toBe(false);
    });
  });

  describe('分期付款進度推算 (getInstallmentInfo)', () => {
    it('非分期規則應回傳 null', () => {
      expect(getInstallmentInfo(baseMonthlyRule)).toBeNull();
    });

    it('分期付款第 4 期應正確計算剩餘期數與剩餘金額', () => {
      // 基準日 2026-04-01 對應 2026-01 起算之第 4 期
      const info = getInstallmentInfo(installmentRule, new Date(2026, 3, 1));
      expect(info).not.toBeNull();
      expect(info?.currentInstallmentNumber).toBe(4);
      expect(info?.totalInstallments).toBe(12);
      expect(info?.remainingInstallments).toBe(9); // 12 - (4 - 1) = 9
      expect(info?.remainingAmount).toBe(9 * 3000);
      expect(info?.labelText).toBe('第 4/12 期');
      expect(info?.isCompleted).toBe(false);
    });
  });

  describe('週期標籤管理 (getCurrentPeriodKey, appendPeriodKey, isBillPaidForCurrentPeriod)', () => {
    it('月繳規則應產生 YYYY-MM 格式標籤', () => {
      const date = new Date(2026, 9, 15); // 2026-10-15
      expect(getCurrentPeriodKey(baseMonthlyRule, date)).toBe('2026-10');
    });

    it('appendPeriodKey 應原子追加並去重排序', () => {
      const res1 = appendPeriodKey(undefined, '2026-09');
      expect(res1).toBe('2026-09');

      const res2 = appendPeriodKey('2026-08', '2026-09');
      expect(res2).toBe('2026-08,2026-09');

      // 重複追加不應產生重複
      const res3 = appendPeriodKey('2026-08,2026-09', '2026-09');
      expect(res3).toBe('2026-08,2026-09');
    });

    it('當期已記帳判定 (isBillPaidForCurrentPeriod)', () => {
      const date = new Date(2026, 9, 15); // 2026-10
      const paidRule: RecurringRule = { ...baseMonthlyRule, last_recorded_period: '2026-09,2026-10' };
      const unpaidRule: RecurringRule = { ...baseMonthlyRule, last_recorded_period: '2026-09' };

      expect(isBillPaidForCurrentPeriod(paidRule, date)).toBe(true);
      expect(isBillPaidForCurrentPeriod(unpaidRule, date)).toBe(false);
    });
  });

  describe('到期日與易讀說明 (getBillDueDate, getBillPeriodLabel)', () => {
    it('應正確計算當月指定 due_day 之到期日', () => {
      const date = new Date(2026, 9, 1);
      const dueDate = getBillDueDate(baseMonthlyRule, date);
      expect(dueDate.getFullYear()).toBe(2026);
      expect(dueDate.getMonth()).toBe(9); // 10 月
      expect(dueDate.getDate()).toBe(15);
    });

    it('雙月繳在雙數月份應精準顯示前月至當月之期別標籤 (例如 9~10月期)', () => {
      const date = new Date(2026, 9, 20); // 2026-10
      const label = getBillPeriodLabel(biMonthlyWaterRule, date);
      expect(label).toBe('2026年 9~10月期');
    });
  });

  describe('未來 7 天滾動推算與逾期防呆 (getRollingBillDueInfo)', () => {
    it('規則建立前的過往期別不得被推算為逾期數十天', () => {
      // 規則 2026-08-01 建立，參考日 2026-10-15
      const info = getRollingBillDueInfo(biMonthlyWaterRule, new Date(2026, 9, 15));
      expect(info.isOverdue).toBe(false);
      expect(info.periodKey).toBe('2026-10');
      expect(info.daysRemaining).toBe(5); // 10/20 到期，差 5 天
    });

    it('已過到期日且未繳款時應精準標註已逾期', () => {
      // 基準日 2026-10-25，到期日 2026-10-20
      const info = getRollingBillDueInfo(biMonthlyWaterRule, new Date(2026, 9, 25));
      expect(info.isOverdue).toBe(true);
      expect(info.daysRemaining).toBeLessThan(0);
    });
  });
});
