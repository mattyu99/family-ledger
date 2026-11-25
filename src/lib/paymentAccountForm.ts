import { AccountType, PaymentAccount } from '../types/database';

export const BALANCE_ENABLED_ACCOUNT_TYPES: readonly AccountType[] = [
  'stored_value',
  'bank',
  'cash',
];

/**
 * 判斷指定帳戶類型是否支援維護與儲存餘額。
 */
export const accountTypeSupportsBalance = (type: AccountType): boolean =>
  BALANCE_ENABLED_ACCOUNT_TYPES.includes(type);

/**
 * 將使用者輸入的餘額字串（含千分位逗號與前後空白）安全解析為數值。
 */
export const parseAccountBalanceInput = (
  rawBalance: string | number | null | undefined
): number => {
  if (typeof rawBalance === 'number') {
    return Number.isFinite(rawBalance) ? rawBalance : 0;
  }
  if (typeof rawBalance !== 'string') return 0;
  const parsed = parseFloat(rawBalance.replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

export interface PaymentAccountFormValues {
  type: AccountType;
  name: string;
  userId: string | null;
  lastFour: string;
  cardNumber: string;
  cycleDate: string;
  dueDay: string;
  issuerBank: string;
  balance: string;
  color: string;
}

export interface BuildPaymentAccountPayloadsResult {
  updatePayload: Partial<PaymentAccount>;
  createPayload: Omit<PaymentAccount, 'id' | 'ledger_id' | 'created_at'>;
  validCycle: number;
  validDueDay: number | null;
}

const resolveAccountIcon = (
  type: AccountType,
  cleanName: string,
  rawCardNumber: string
): string => {
  if (type === 'credit_card') return '💳';
  if (type === 'bank') return '🏦';
  if (type === 'cash') return '💵';
  if (type === 'carrier') {
    return cleanName.includes('@') || rawCardNumber.includes('@') ? '📧' : '🛍️';
  }
  return '🚌';
};

/**
 * 將卡片與帳戶管理表單欄位轉換為一致的新增與更新資料庫 payload。
 */
export const buildPaymentAccountPayloads = (
  values: PaymentAccountFormValues,
  sortOrder: number
): BuildPaymentAccountPayloadsResult => {
  const cleanName = values.name.trim();
  const cleanCardNumber = values.cardNumber.replace(/\D/g, '').slice(0, 16);
  const cleanLastFour = values.lastFour.trim();

  const finalCardNumber =
    values.type === 'stored_value'
      ? (cleanCardNumber || undefined)
      : (values.cardNumber.trim() || undefined);

  const finalLastFour =
    values.type === 'stored_value'
      ? (cleanCardNumber
          ? (cleanCardNumber.length > 4 ? cleanCardNumber.slice(-4) : cleanCardNumber)
          : (cleanLastFour || undefined))
      : values.type === 'carrier'
      ? undefined
      : (cleanLastFour || undefined);

  const cleanIssuerBank = values.issuerBank.trim();
  const finalIssuerBankForAdd =
    values.type === 'credit_card' ? (cleanIssuerBank || undefined) : undefined;
  const finalIssuerBankForUpdate =
    values.type === 'credit_card' ? (cleanIssuerBank || null) : null;

  const cycleNum = parseInt(values.cycleDate, 10);
  const validCycle = isNaN(cycleNum) ? 15 : Math.max(1, Math.min(31, cycleNum));

  const parsedDueNum = parseInt(values.dueDay.trim(), 10);
  const validDueDay: number | null =
    values.type === 'credit_card' &&
    !isNaN(parsedDueNum) &&
    parsedDueNum >= 1 &&
    parsedDueNum <= 31
      ? parsedDueNum
      : null;

  const balance = accountTypeSupportsBalance(values.type)
    ? parseAccountBalanceInput(values.balance)
    : 0;

  // 全家通用在資料庫對應 null，保留給 Supabase/本機型別相容
  const userIdValue = (values.userId || null) as unknown as string | undefined;

  const sharedFields: Partial<PaymentAccount> = {
    name: cleanName,
    type: values.type,
    user_id: userIdValue,
    last_four_digits: finalLastFour,
    card_number: finalCardNumber,
    billing_cycle_date: values.type === 'credit_card' ? validCycle : undefined,
    payment_due_day: values.type === 'credit_card' ? validDueDay : undefined,
    balance,
    color: values.color,
  };

  const updatePayload: Partial<PaymentAccount> = {
    ...sharedFields,
    issuer_bank: finalIssuerBankForUpdate,
  };

  const createPayload: Omit<PaymentAccount, 'id' | 'ledger_id' | 'created_at'> = {
    ...(sharedFields as Omit<PaymentAccount, 'id' | 'ledger_id' | 'created_at'>),
    name: cleanName,
    type: values.type,
    balance,
    issuer_bank: finalIssuerBankForAdd,
    icon: resolveAccountIcon(values.type, cleanName, values.cardNumber),
    sort_order: sortOrder,
  };

  return {
    updatePayload,
    createPayload,
    validCycle,
    validDueDay,
  };
};
