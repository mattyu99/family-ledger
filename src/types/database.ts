export type RoleType = 'owner' | 'admin' | 'member' | 'viewer';
export type TransactionType = 'expense' | 'income' | 'transfer' | 'memo';
export type CategoryType = 'expense' | 'income';

export interface Profile {
  id: string;
  email?: string;
  display_name: string;
  avatar_url?: string;
  role?: RoleType;
}

export interface Ledger {
  id: string;
  name: string;
  description?: string;
  currency: string;
  created_by: string;
  created_at: string;
  userRole?: RoleType;
  admin_pin?: string;
  userDisplayName?: string;
  userAvatar?: string;
}

export interface LedgerMember {
  id: string;
  ledger_id: string;
  user_id: string;
  role: RoleType;
  joined_at: string;
  profile?: Profile;
}

export interface Category {
  id: string;
  ledger_id?: string;
  name: string;
  icon: string;
  color: string;
  type: CategoryType;
  sort_order: number;
}

export interface TransactionSplit {
  id: string;
  transaction_id: string;
  user_id: string;
  split_amount: number;
  is_settled: boolean;
  settled_at?: string;
  user_name?: string;
}

export type PaymentMethod =
  | 'cash'
  | 'credit_card'
  | 'line_pay'
  | 'px_pay'
  | 'easycard_pay'
  | 'jkopay'
  | 'stored_value'
  | 'transfer'
  | 'other'
  | (string & {});

export interface CustomPaymentMethod {
  id: string; // 例如：cash, credit_card, line_pay, px_pay, easycard_pay, jkopay, stored_value, transfer 或 UUID
  ledger_id?: string;
  name: string; // 例如：全支付, 悠遊付, 街口支付, 現金, 信用卡
  icon: string; // 例如：🔵, 🩵, 🟣, 💵, 💳, 🚌, 🏦
  color: string; // 識別色 (十六進位色碼)
  type?: 'cash' | 'credit_card' | 'e_wallet' | 'stored_value' | 'bank' | 'other';
  supports_credit_card?: boolean; // 是否支援綁定信用卡扣款（如 LINE Pay、全支付、街口、Apple Pay）
  is_enabled: boolean; // 是否啟用/顯示於記帳選單（使用者可隨時隱藏不常用的）
  is_system?: boolean; // 是否為系統預設項目（預設不可刪除，但可自由停用/隱藏與調整順序）
  sort_order: number;
  created_at?: string;
}

export type AccountType = 'credit_card' | 'stored_value' | 'cash' | 'bank' | 'other';

export interface PaymentAccount {
  id: string;
  ledger_id: string;
  name: string; // 例如：富邦 Costco 卡, 國泰 CUBE 卡, 爸爸悠遊卡
  type: AccountType; // 'credit_card' | 'stored_value' | 'cash' | 'bank' | 'other'
  user_id?: string; // 持卡人 / 歸屬成員 ID
  last_four_digits?: string; // 末四碼 (如 8829)
  billing_cycle_date?: number; // 信用卡結帳日 (每月 1~31 號)
  balance: number; // 儲值卡/帳戶餘額 (悠遊卡使用)
  color?: string; // 卡片識別色
  icon?: string; // 卡片圖示 (如 🚌, 💳)
  sort_order: number;
  created_at: string;
}

export interface Transaction {
  id: string;
  ledger_id: string;
  creator_id: string;
  category_id: string;
  amount: number;
  type: TransactionType;
  paid_by: string;
  transacted_at: string;
  merchant?: string; // 店家 / 付款對象 (例如：全聯、好市多、中油...)
  payment_method?: PaymentMethod; // 付款方式：cash | credit_card | line_pay | stored_value | transfer
  account_id?: string; // 具體卡片或儲值帳戶 ID
  is_reconciled?: boolean; // 信用卡對帳：是否已核對/已核銷
  note?: string;
  reminder_date?: string; // 選填生活記事提醒日期 (YYYY-MM-DD)
  image_url?: string;
  is_settled: boolean;
  created_at: string;
  category?: Category;
  payer_profile?: Profile;
  payment_account?: PaymentAccount;
  splits?: TransactionSplit[];
}

export interface LedgerInvite {
  id: string;
  ledger_id: string;
  invite_code: string;
  created_by: string;
  expires_at: string;
  max_uses: number;
  used_count: number;
  created_at: string;
}

export type RecurringFrequency = 'monthly' | 'bimonthly' | 'quarterly' | 'yearly';
export type RecurringAmountType = 'fixed' | 'variable';

export interface RecurringRule {
  id: string;
  ledger_id: string;
  name: string; // 例如：台灣電力公司 電費、中華電信 手機費、大樓管理費
  amount_type: RecurringAmountType; // 'fixed' (固定金額) | 'variable' (浮動金額如水電瓦斯)
  default_amount: number; // 固定金額或浮動預估參考值
  category_id: string; // 分類 ID
  merchant?: string; // 付款對象/機構 (如：台灣電力公司、中華電信)
  paid_by: string; // 預設付款家庭成員 UUID
  payment_method: PaymentMethod; // 付款方式
  account_id?: string; // 扣款卡片/帳戶 ID
  frequency: RecurringFrequency; // 週期：'monthly' (每月) | 'bimonthly' (雙月) | 'quarterly' (季) | 'yearly' (年)
  due_day: number; // 扣款日 / 帳單日 (1~31)
  bimonthly_start_month?: 1 | 2; // 雙月繳之出帳月份：1 (1,3,5,7,9,11月) 或 2 (2,4,6,8,10,12月)
  is_active: boolean; // 是否啟用
  last_recorded_period?: string; // 最後已記帳之週期標籤 (例如 "2026-10")，避免重複入帳
  note?: string; // 備註
  // 📦 分期付款支援欄位
  is_installment?: boolean; // 是否為分期付款 (例如：手機分期、家電、機車、保費分期)
  total_installments?: number; // 總期數 (例如 12)
  current_installment?: number; // 當前進行中 / 下一期應繳期數 (1-indexed，例如 3 代表第 3 期)
  installment_start_period?: string; // 分期首期年月，格式 "YYYY-MM" (例如 "2026-10")
  created_at: string;
  updated_at: string;
}

