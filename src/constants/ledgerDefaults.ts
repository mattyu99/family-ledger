import { Category, Profile, Ledger, RecurringRule, Transaction } from '../types/database';
import { DEFAULT_RECURRING_PRESETS } from '../lib/recurring';

// UUID 格式校驗函式
export const isValidUUID = (str?: string | null): boolean => {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
};

// UUID 格式的示範常數，確保離線與 PostgreSQL UUID 格式 100% 相容
export const DEMO_LEDGER_ID = '10000000-0000-4000-8000-000000000001';
export const DEMO_USER_DAD = '20000000-0000-4000-8000-000000000001';
export const DEMO_USER_MOM = '20000000-0000-4000-8000-000000000002';
export const DEMO_USER_KID = '20000000-0000-4000-8000-000000000003';

export const DEFAULT_CATEGORIES: Category[] = [
  { id: '30000000-0000-4000-8000-000000000001', name: '餐飲伙食', icon: '🍲', color: '#EF4444', type: 'expense', sort_order: 1 },
  { id: '30000000-0000-4000-8000-000000000002', name: '生鮮超市', icon: '🛒', color: '#F59E0B', type: 'expense', sort_order: 2 },
  { id: '30000000-0000-4000-8000-000000000003', name: '居家水電', icon: '💡', color: '#3B82F6', type: 'expense', sort_order: 3 },
  { id: '30000000-0000-4000-8000-000000000004', name: '交通出行', icon: '🚗', color: '#10B981', type: 'expense', sort_order: 4 },
  { id: '30000000-0000-4000-8000-000000000005', name: '休閒娛樂', icon: '🎬', color: '#8B5CF6', type: 'expense', sort_order: 5 },
  { id: '30000000-0000-4000-8000-000000000006', name: '醫療保健', icon: '💊', color: '#EC4899', type: 'expense', sort_order: 6 },
  { id: '30000000-0000-4000-8000-000000000007', name: '育兒教育', icon: '👶', color: '#06B6D4', type: 'expense', sort_order: 7 },
  { id: '30000000-0000-4000-8000-000000000008', name: '衣飾美容', icon: '👕', color: '#8B5CF6', type: 'expense', sort_order: 8 },
  { id: '30000000-0000-4000-8000-000000000009', name: '數位３Ｃ', icon: '💻', color: '#6B7280', type: 'expense', sort_order: 9 },
  { id: '30000000-0000-4000-8000-000000000010', name: '薪資收入', icon: '💰', color: '#059669', type: 'income', sort_order: 10 },
  { id: '30000000-0000-4000-8000-000000000011', name: '投資理財', icon: '📈', color: '#2563EB', type: 'income', sort_order: 11 },
  { id: '30000000-0000-4000-8000-000000000012', name: '零用錢', icon: '💵', color: '#10B981', type: 'income', sort_order: 12 },
  { id: '30000000-0000-4000-8000-000000000013', name: '獎金回饋', icon: '🎁', color: '#F59E0B', type: 'income', sort_order: 13 },
];

export const DEFAULT_MEMBERS: Profile[] = [
  { id: DEMO_USER_DAD, email: 'dad@family.local', display_name: '爸爸 (我)', avatar_url: '👨', role: 'owner' },
  { id: DEMO_USER_MOM, email: 'mom@family.local', display_name: '媽媽', avatar_url: '👩', role: 'member' },
  { id: DEMO_USER_KID, email: 'kid@family.local', display_name: '小寶', avatar_url: '👦', role: 'member' },
];

export const DEFAULT_LEDGER: Ledger = {
  id: DEMO_LEDGER_ID,
  name: '幸福小窩家庭公帳',
  description: '全家人日常採買與生活開銷',
  currency: 'TWD',
  created_by: DEMO_USER_DAD,
  created_at: new Date().toISOString(),
};

export const DEMO_RECURRING_RULES: RecurringRule[] = DEFAULT_RECURRING_PRESETS.map((preset, index) => ({
  id: `60000000-0000-4000-8000-00000000000${index + 1}`,
  ledger_id: DEMO_LEDGER_ID,
  name: preset.name,
  amount_type: preset.amount_type,
  default_amount: preset.default_amount,
  category_id: DEFAULT_CATEGORIES[2].id, // 居家水電
  merchant: preset.merchant,
  paid_by: DEMO_USER_DAD,
  payment_method: preset.payment_method,
  account_id: preset.payment_method === 'credit_card' ? '50000000-0000-4000-8000-000000000001' : undefined,
  frequency: preset.frequency,
  due_day: preset.due_day,
  bimonthly_start_month: (preset as any).bimonthly_start_month,
  is_active: true,
  last_recorded_period: undefined,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}));

export const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: '40000000-0000-4000-8000-000000000001',
    ledger_id: DEMO_LEDGER_ID,
    creator_id: DEMO_USER_DAD,
    category_id: DEFAULT_CATEGORIES[1].id,
    amount: 1450,
    type: 'expense',
    paid_by: DEMO_USER_DAD,
    merchant: '好市多',
    payment_method: 'credit_card',
    account_id: '50000000-0000-4000-8000-000000000001', // 富邦 Costco
    invoice_number: 'AB-88888888',
    invoice_random_code: '1688',
    transacted_at: new Date(Date.now() - 3600000 * 4).toISOString(),
    note: 'Costco 週末採買牛奶與生鮮',
    is_settled: false,
    is_reconciled: false,
    created_at: new Date().toISOString(),
  },
  {
    id: '40000000-0000-4000-8000-000000000002',
    ledger_id: DEMO_LEDGER_ID,
    creator_id: DEMO_USER_MOM,
    category_id: DEFAULT_CATEGORIES[0].id,
    amount: 680,
    type: 'expense',
    paid_by: DEMO_USER_MOM,
    merchant: '日式料理',
    payment_method: 'line_pay',
    account_id: '50000000-0000-4000-8000-000000000002', // 國泰 CUBE 卡
    transacted_at: new Date(Date.now() - 3600000 * 20).toISOString(),
    note: '全家日式定食晚餐',
    is_settled: false,
    is_reconciled: false,
    created_at: new Date().toISOString(),
  },
  {
    id: '40000000-0000-4000-8000-000000000005',
    ledger_id: DEMO_LEDGER_ID,
    creator_id: DEMO_USER_DAD,
    category_id: DEFAULT_CATEGORIES[3].id,
    amount: 35,
    type: 'expense',
    paid_by: DEMO_USER_DAD,
    merchant: '台北捷運',
    payment_method: 'stored_value',
    account_id: '50000000-0000-4000-8000-000000000003', // 爸爸悠遊卡
    transacted_at: new Date(Date.now() - 3600000 * 30).toISOString(),
    note: '上班捷運通勤',
    is_settled: false,
    created_at: new Date().toISOString(),
  },
  {
    id: '40000000-0000-4000-8000-000000000003',
    ledger_id: DEMO_LEDGER_ID,
    creator_id: DEMO_USER_DAD,
    category_id: DEFAULT_CATEGORIES[2].id,
    amount: 2340,
    type: 'expense',
    paid_by: DEMO_USER_DAD,
    merchant: '台灣電力公司',
    payment_method: 'transfer',
    transacted_at: new Date(Date.now() - 3600000 * 48).toISOString(),
    note: '台電夏季電費代繳',
    is_settled: false,
    created_at: new Date().toISOString(),
  },
  {
    id: '40000000-0000-4000-8000-000000000004',
    ledger_id: DEMO_LEDGER_ID,
    creator_id: DEMO_USER_DAD,
    category_id: DEFAULT_CATEGORIES.find(c => c.name === '薪資收入')?.id || DEFAULT_CATEGORIES[9].id,
    amount: 65000,
    type: 'income',
    paid_by: DEMO_USER_DAD,
    payment_method: 'transfer',
    transacted_at: new Date(Date.now() - 3600000 * 72).toISOString(),
    note: '本月薪資入帳',
    is_settled: true,
    created_at: new Date().toISOString(),
  },
  {
    id: '40000000-0000-4000-8000-000000000006',
    ledger_id: DEMO_LEDGER_ID,
    creator_id: DEMO_USER_DAD,
    category_id: DEFAULT_CATEGORIES.find(c => c.name === '育兒教育')?.id || DEFAULT_CATEGORIES[6].id,
    amount: 1000,
    type: 'expense',
    paid_by: DEMO_USER_DAD,
    merchant: '小寶',
    payment_method: 'cash',
    transacted_at: new Date(Date.now() - 3600000 * 96).toISOString(),
    note: '給 小寶 零用錢',
    is_settled: true,
    created_at: new Date().toISOString(),
  },
  {
    id: '40000000-0000-4000-8000-000000000007',
    ledger_id: DEMO_LEDGER_ID,
    creator_id: DEMO_USER_DAD,
    category_id: DEFAULT_CATEGORIES.find(c => c.name === '零用錢')?.id || DEFAULT_CATEGORIES[11].id,
    amount: 1000,
    type: 'income',
    paid_by: DEMO_USER_KID,
    merchant: '爸爸',
    payment_method: 'cash',
    transacted_at: new Date(Date.now() - 3600000 * 96 + 1000).toISOString(),
    note: '爸爸 給的零用錢',
    is_settled: true,
    created_at: new Date().toISOString(),
  },
  {
    id: '40000000-0000-4000-8000-000000000008',
    ledger_id: DEMO_LEDGER_ID,
    creator_id: DEMO_USER_KID,
    category_id: DEFAULT_CATEGORIES[0].id,
    amount: 120,
    type: 'expense',
    paid_by: DEMO_USER_KID,
    merchant: '7-11',
    payment_method: 'cash',
    transacted_at: new Date(Date.now() - 3600000 * 12).toISOString(),
    note: '放學點心麵包與牛奶',
    is_settled: true,
    created_at: new Date().toISOString(),
  },
];

export const STORAGE_KEYS = {
  TRANSACTIONS: '@family_ledger_transactions',
  CURRENT_USER: '@family_ledger_current_user',
  MEMBERS: '@family_ledger_members',
  CATEGORIES: '@family_ledger_categories',
  DEVICE_BOUND: '@family_ledger_device_bound',
  LEDGER: '@family_ledger_current',
  HAS_JOINED: '@family_ledger_has_joined',
  INVITE_CODE: '@family_ledger_invite_code',
  USER_ROLE: '@family_ledger_user_role',
  ADMIN_PIN: '@family_ledger_admin_pin',
  ALIAS_MAP: '@family_ledger_alias_map',
  DELETED_TX_IDS: '@family_ledger_deleted_tx_ids',
  LAST_BACKUP_AT: '@family_ledger_last_backup_at',
  AUTO_BACKUP_CONFIG: '@family_ledger_auto_backup_config',
  RECENT_MERCHANTS: '@family_ledger_recent_merchants',
  RECENT_MEMO_TAGS: '@family_ledger_recent_memo_tags',
  DISMISSED_MEMO_TAGS: '@family_ledger_dismissed_memo_tags',
  PAYMENT_ACCOUNTS: '@family_ledger_payment_accounts',
  DELETED_ACCOUNT_IDS: '@family_ledger_deleted_account_ids',
  ACCOUNTS_INITIALIZED: '@family_ledger_accounts_initialized',
  PAYMENT_METHODS: '@family_ledger_payment_methods',
  RECURRING_RULES: '@family_ledger_recurring_rules',
  BUDGET: '@family_ledger_budget',
  LAST_VISITED_PREFIX: '@family_ledger_last_visited_',
  DEVICE_ID: '@family_ledger_device_id',
  MEMBER_DEVICES: '@family_ledger_member_devices',
  LEDGER_READ_ONLY: '@family_ledger_read_only',
  LEDGER_ALLOW_NEW_MEMBERS: '@family_ledger_allow_new_members',
  LEDGERS: '@family_ledger_list',
  TAX_ID_MERCHANTS: '@family_ledger_tax_id_merchants',
};

// 預設常用店家快捷建議清單（涵蓋台灣家庭最普遍的日常採買店家）
export const DEFAULT_POPULAR_MERCHANTS = [
  '全聯',
  '好市多',
  '7-11',
  '全家',
  '家樂福',
  '中油',
  '蝦皮',
  '大潤發',
  '美而美',
  '50嵐',
];

// 已知雲端資料庫分類 UUID 映射表（確保本機離線或 cold start 時舊交易分類 100% 完整解析）
export const KNOWN_CATEGORY_UUIDS: Record<string, Partial<Category>> = {
  'ed4b17ce-c9db-4986-88d3-fa5f2f391e2c': { name: '餐飲伙食', icon: '🍲', color: '#EF4444', type: 'expense' },
  '463e7f0e-0998-40bc-8cc2-ca93db086e62': { name: '生鮮超市', icon: '🛒', color: '#F59E0B', type: 'expense' },
  '605b2f24-9b67-4890-8515-bc3e28622674': { name: '居家水電', icon: '💡', color: '#3B82F6', type: 'expense' },
  'd5eb5014-9b29-436f-ac6e-06e4faf8dcdd': { name: '交通出行', icon: '🚗', color: '#10B981', type: 'expense' },
  'bd4d2fc6-6df9-49b5-9071-9574d0a19e32': { name: '休閒娛樂', icon: '🎬', color: '#8B5CF6', type: 'expense' },
  '8cb7fefd-c8a1-4b2d-a464-8d78c4d6e423': { name: '醫療保健', icon: '💊', color: '#EC4899', type: 'expense' },
  '3b4258cb-f8c3-4eb0-958a-009a86d68a86': { name: '育兒教育', icon: '👶', color: '#06B6D4', type: 'expense' },
  '5e3edd91-e122-499d-a0fb-6715558dc6d1': { name: '衣飾美容', icon: '👕', color: '#8B5CF6', type: 'expense' },
  'b639f194-ec32-453e-98a7-c15c6e1312f5': { name: '數位３Ｃ', icon: '💻', color: '#6B7280', type: 'expense' },
  '52678d37-fed9-4596-90dd-4f606bc62c0b': { name: '薪資收入', icon: '💰', color: '#059669', type: 'income' },
  'c5648d3b-dfcb-4aa0-b230-a9074bfa58f5': { name: '投資理財', icon: '📈', color: '#2563EB', type: 'income' },
  'b04ae970-7f44-4f10-bda8-147e68ced817': { name: '零用錢', icon: '💵', color: '#10B981', type: 'income' },
  '30000000-0000-4000-8000-000000000012': { name: '零用錢', icon: '💵', color: '#10B981', type: 'income' },
  'a7f4fe31-5670-4164-a479-bd1e000ee2f7': { name: '獎金回饋', icon: '🎁', color: '#F59E0B', type: 'income' },
  '30000000-0000-4000-8000-000000000013': { name: '獎金回饋', icon: '🎁', color: '#F59E0B', type: 'income' },
};

