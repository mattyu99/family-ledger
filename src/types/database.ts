export type RoleType = 'owner' | 'admin' | 'member' | 'viewer';
export type TransactionType = 'expense' | 'income' | 'transfer';
export type CategoryType = 'expense' | 'income';

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string;
}

export interface Ledger {
  id: string;
  name: string;
  description?: string;
  currency: string;
  created_by: string;
  created_at: string;
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

export interface Transaction {
  id: string;
  ledger_id: string;
  creator_id: string;
  category_id: string;
  amount: number;
  type: TransactionType;
  paid_by: string;
  transacted_at: string;
  note?: string;
  image_url?: string;
  is_settled: boolean;
  created_at: string;
  category?: Category;
  payer_profile?: Profile;
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
}
