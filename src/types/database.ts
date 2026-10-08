export type RoleType = 'owner' | 'admin' | 'member' | 'viewer';
export type TransactionType = 'expense' | 'income' | 'transfer';
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
