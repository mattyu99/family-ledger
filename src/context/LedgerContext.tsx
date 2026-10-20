import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Platform, Alert, AppState, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Transaction, Category, Ledger, Profile, TransactionType, CategoryType, PaymentMethod, PaymentAccount, AccountType, CustomPaymentMethod, RecurringRule, MemberDevice } from '../types/database';
import { supabase, isConfigured } from '../lib/supabase';
import { generateUUID } from '../lib/uuid';
import { DEMO_PAYMENT_ACCOUNTS, DEFAULT_PAYMENT_METHODS } from '../lib/payment';
import { DEFAULT_RECURRING_PRESETS, getCurrentPeriodKey, getBillPeriodLabel, getInstallmentInfo, appendPeriodKey } from '../lib/recurring';
import { parseMemoNote, encodeMemoMerchantTag, decodeMemoMerchantTag, DEFAULT_MEMO_QUICK_TAGS, extractMemoTag, toggleChecklistItem } from '../lib/memo';
import { CalendarSystem, MemoRepeatFrequency, getNextMemoReminderDate, formatMemoReminderBadge } from '../lib/lunar';
import { APP_FULL_VERSION } from '../constants/version';
import { getDeviceId, getDeviceName, getDevicePlatform } from '../lib/device';

const safeAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

// UUID 格式校驗函式（本地內建，避免打包快取未更新）
const isValidUUID = (str?: string | null): boolean => {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
};

// UUID 格式的示範常數，確保離線與 PostgreSQL UUID 格式 100% 相容
const DEMO_LEDGER_ID = '10000000-0000-4000-8000-000000000001';
const DEMO_USER_DAD = '20000000-0000-4000-8000-000000000001';
const DEMO_USER_MOM = '20000000-0000-4000-8000-000000000002';
const DEMO_USER_KID = '20000000-0000-4000-8000-000000000003';

export const DEFAULT_CATEGORIES: Category[] = [
  { id: '30000000-0000-4000-8000-000000000001', name: '餐飲伙食', icon: '🍲', color: '#EF4444', type: 'expense', sort_order: 1 },
  { id: '30000000-0000-4000-8000-000000000002', name: '生鮮超市', icon: '🛒', color: '#F59E0B', type: 'expense', sort_order: 2 },
  { id: '30000000-0000-4000-8000-000000000003', name: '居家水電', icon: '💡', color: '#3B82F6', type: 'expense', sort_order: 3 },
  { id: '30000000-0000-4000-8000-000000000004', name: '交通出行', icon: '🚗', color: '#10B981', type: 'expense', sort_order: 4 },
  { id: '30000000-0000-4000-8000-000000000005', name: '休閒娛樂', icon: '🎬', color: '#8B5CF6', type: 'expense', sort_order: 5 },
  { id: '30000000-0000-4000-8000-000000000006', name: '醫療保健', icon: '💊', color: '#EC4899', type: 'expense', sort_order: 6 },
  { id: '30000000-0000-4000-8000-000000000007', name: '育兒教育', icon: '👶', color: '#06B6D4', type: 'expense', sort_order: 7 },
  { id: '30000000-0000-4000-8000-000000000008', name: '薪資收入', icon: '💰', color: '#059669', type: 'income', sort_order: 8 },
  { id: '30000000-0000-4000-8000-000000000009', name: '投資理財', icon: '📈', color: '#2563EB', type: 'income', sort_order: 9 },
  { id: '30000000-0000-4000-8000-000000000010', name: '零用錢', icon: '💵', color: '#10B981', type: 'income', sort_order: 10 },
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

const INITIAL_TRANSACTIONS: Transaction[] = [
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
    category_id: DEFAULT_CATEGORIES[7].id,
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
    category_id: DEFAULT_CATEGORIES[6].id,
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
    category_id: DEFAULT_CATEGORIES[9].id,
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

export interface LiveToastNotification {
  id: string;
  type: 'insert' | 'update' | 'delete' | 'info' | 'complete';
  actorName: string;
  avatar: string;
  title: string;
  message: string;
  amount?: number;
  createdAt: number;
}

interface LedgerContextType {
  currentLedger: Ledger;
  ledgers: Ledger[];
  members: Profile[];
  categories: Category[];
  transactions: Transaction[];
  currentUser: Profile;
  setCurrentUser: (user: Profile) => void;
  addTransaction: (data: {
    id?: string;
    amount: number;
    type: TransactionType;
    category_id: string;
    paid_by: string;
    merchant?: string;
    note?: string;
    reminder_date?: string;
    reminder_calendar?: CalendarSystem;
    reminder_repeat?: MemoRepeatFrequency;
    completed_by?: string;
    transacted_at?: string;
    payment_method?: PaymentMethod;
    account_id?: string;
    is_reconciled?: boolean;
    completion_note?: string;
    linked_transaction_id?: string;
    splitWithIds?: string[];
  }) => Promise<string>;
  updateTransaction: (
    id: string,
    data: {
      amount?: number;
      type?: TransactionType;
      category_id?: string;
      paid_by?: string;
      merchant?: string;
      note?: string;
      reminder_date?: string;
      reminder_calendar?: CalendarSystem;
      reminder_repeat?: MemoRepeatFrequency;
      completed_by?: string;
      completion_note?: string;
      linked_transaction_id?: string;
      transacted_at?: string;
      payment_method?: PaymentMethod;
      account_id?: string;
      is_reconciled?: boolean;
      is_settled?: boolean;
    }
  ) => Promise<boolean>;
  toggleMemoSettled: (id: string, completedByUserId?: string) => Promise<boolean>;
  deleteTransaction: (id: string) => Promise<void>;
  transferAllowance: (data: {
    amount: number;
    fromMemberId: string;
    toMemberId: string;
    mode?: 'transfer' | 'expense_income';
    expenseCategoryId?: string;
    incomeCategoryId?: string;
    paymentMethod?: PaymentMethod;
    accountId?: string;
    transacted_at?: string;
    note?: string;
  }) => Promise<{ success: boolean; error?: string; parentTxId?: string; kidTxId?: string; transferTxId?: string }>;
  paymentAccounts: PaymentAccount[];
  addPaymentAccount: (account: Omit<PaymentAccount, 'id' | 'ledger_id' | 'created_at'>) => Promise<PaymentAccount>;
  updatePaymentAccount: (id: string, data: Partial<PaymentAccount>) => Promise<boolean>;
  deletePaymentAccount: (id: string) => Promise<boolean>;
  restoreDefaultAccounts: () => Promise<void>;
  paymentMethods: CustomPaymentMethod[];
  addPaymentMethod: (data: Omit<CustomPaymentMethod, 'id' | 'sort_order'>) => Promise<CustomPaymentMethod>;
  updatePaymentMethod: (id: string, data: Partial<CustomPaymentMethod>) => Promise<boolean>;
  deletePaymentMethod: (id: string) => Promise<boolean>;
  togglePaymentMethodEnabled: (id: string) => Promise<boolean>;
  reorderPaymentMethods: (methods: CustomPaymentMethod[]) => Promise<void>;
  restoreDefaultPaymentMethods: () => Promise<void>;
  getPaymentMethodById: (id?: string) => CustomPaymentMethod | undefined;
  recurringRules: RecurringRule[];
  addRecurringRule: (
    rule: Omit<RecurringRule, 'id' | 'ledger_id' | 'created_at' | 'updated_at'>
  ) => Promise<RecurringRule>;
  updateRecurringRule: (
    id: string,
    data: Partial<Omit<RecurringRule, 'id' | 'ledger_id'>>
  ) => Promise<boolean>;
  deleteRecurringRule: (id: string) => Promise<boolean>;
  recordRecurringBill: (
    ruleId: string,
    customAmount?: number,
    transactedAt?: string,
    note?: string,
    targetPeriodDate?: Date
  ) => Promise<boolean>;
  skipRecurringBill: (ruleId: string, periodKey?: string) => Promise<boolean>;
  restoreDefaultRecurringRules: () => Promise<void>;
  topUpAccountBalance: (
    id: string,
    amount: number,
    options?: {
      sourceType?: PaymentMethod | 'cash' | 'credit_card' | 'transfer' | string;
      sourceAccountId?: string;
      payerId?: string;
      recordExpense?: boolean;
      note?: string;
    } | string
  ) => Promise<boolean>;
  adjustAccountBalance: (id: string, newBalance: number) => Promise<boolean>;
  toggleReconcileTransaction: (transactionId: string) => Promise<boolean>;
  getAccountById: (id?: string) => PaymentAccount | undefined;
  recentMerchants: string[];
  recordMerchant: (merchant: string) => Promise<void>;
  recentMemoTags: string[];
  recordMemoTag: (tag: string) => Promise<void>;
  removeRecentMemoTag: (tag: string) => Promise<void>;
  toggleMemoChecklistItem: (transactionId: string, itemIndex: number) => Promise<boolean>;
  exportToCSV: () => string;
  exportToJSON: () => string;
  restoreFromJSON: (
    jsonStr: string,
    options?: { mode?: 'merge' | 'overwrite' }
  ) => Promise<{ success: boolean; message: string; restoredCount?: number }>;
  lastBackupAt: string | null;
  autoBackupEnabled: boolean;
  autoBackupInterval: 7 | 14 | 30;
  recordBackupComplete: () => Promise<void>;
  updateAutoBackupConfig: (enabled: boolean, intervalDays: 7 | 14 | 30) => Promise<void>;
  liveToast: LiveToastNotification | null;
  dismissLiveToast: () => void;
  triggerLiveToast: (toast: LiveToastNotification) => void;
  addMember: (name: string, avatar?: string) => Promise<void>;
  updateMember: (id: string, name: string, avatar: string) => Promise<boolean>;
  deleteMember: (id: string, transferToId?: string) => Promise<boolean | void>;
  isDeviceBound: boolean;
  bindDeviceToMember: (member: Profile) => Promise<void>;
  unbindDevice: () => Promise<void>;
  switchCurrentUser: (member: Profile, pin?: string) => Promise<{ success: boolean; message?: string }>;
  isCloudSynced: boolean;
  settlementInfo: {
    totalExpense: number;
    totalIncome: number;
    netBalance: number;
    paidByMembers: Record<string, number>;
  };
  hasJoinedLedger: boolean;
  isOwner: boolean;
  isReadOnly: boolean;
  toggleLedgerReadOnly: (ledgerId: string, readOnly?: boolean) => Promise<boolean>;
  allowNewMembers: boolean;
  updateAllowNewMembers: (allowed: boolean) => Promise<{ success: boolean; message?: string }>;
  inviteCode: string;
  createLedger: (name?: string, creatorName?: string, avatar?: string, isReadOnly?: boolean) => Promise<void>;
  updateLedgerName: (newName: string) => Promise<boolean>;
  joinLedgerByCode: (
    codeOrUrl: string,
    memberName?: string,
    avatar?: string,
    claimedMember?: Profile,
    adminPin?: string
  ) => Promise<{ success: boolean; message?: string }>;
  adminPin: string;
  updateAdminPin: (newPin: string) => Promise<boolean>;
  previewInvite: (codeOrUrl: string) => Promise<{
    success: boolean;
    ledgerId?: string;
    ledgerName?: string;
    members?: Profile[];
    message?: string;
    isGateLocked?: boolean;
  }>;
  regenerateInviteCode: () => Promise<string>;
  updateInviteCode: (customCode: string) => Promise<boolean>;
  getInviteLink: () => string;
  pendingInviteCode: string | null;
  confirmPendingInvite: (name?: string, avatar?: string, claimedMember?: Profile) => Promise<void>;
  cancelPendingInvite: () => void;
  leaveCurrentLedger: () => Promise<void>;
  switchLedgerById: (ledgerId: string) => Promise<void>;
  leaveLedgerById: (ledgerId: string) => Promise<void>;
  unreadLedgerMap: Record<string, number>;
  hasOtherUnread: boolean;
  checkUnreadLedgers: () => Promise<void>;
  updateMemberRole: (memberId: string, newRole: 'owner' | 'member') => Promise<boolean>;
  claimAdminRoleWithPin: (pin: string) => Promise<{ success: boolean; message?: string }>;
  getMemberById: (id?: string) => Profile | undefined;
  memberAliasMap: Record<string, Profile>;
  getCategoryById: (categoryId?: string, txCategory?: Category) => Category;
  addCategory: (data: {
    name: string;
    icon: string;
    color: string;
    type: CategoryType;
  }) => Promise<boolean>;
  updateCategory: (
    id: string,
    data: {
      name?: string;
      icon?: string;
      color?: string;
      type?: CategoryType;
    }
  ) => Promise<boolean>;
  deleteCategory: (id: string) => Promise<{ success: boolean; error?: string }>;
  refreshLedger: () => Promise<void>;
  previewMember: Profile | null;
  isPreviewMode: boolean;
  startMemberPreview: (member: Profile) => void;
  startCurrentMemberPreview: () => void;
  exitMemberPreview: () => void;
  realCurrentUser: Profile;
  realIsOwner: boolean;
  realUserRole: 'owner' | 'admin' | 'member';
  isAdminMode: boolean;
  setIsAdminMode: (enabled: boolean) => void;
  enableAdminMode: (pin: string) => { success: boolean; message?: string };
  disableAdminMode: () => void;
  isAdminUnlocked: boolean;
  setIsAdminUnlocked: (unlocked: boolean) => void;
  unlockAdmin: (pin: string) => { success: boolean; message?: string };
  lockAdmin: () => void;
  memberDevices: MemberDevice[];
  currentDeviceId: string;
  fetchMemberDevices: (ledgerId?: string, memberId?: string) => Promise<void>;
  registerDevice: (memberId?: string, ledgerId?: string) => Promise<void>;
  removeDevice: (deviceId: string) => Promise<boolean>;
  linkGoogleAccount: (targetProfileId?: string, actionType?: 'bind_google' | 'claim') => Promise<{ success: boolean; message?: string }>;
  unlinkGoogleAccount: (targetProfileId?: string) => Promise<{ success: boolean; message?: string }>;
  claimGoogleIdentity: (codeOrEmail: string) => Promise<{ success: boolean; message?: string; profile?: Profile }>;
  isCurrentUserLocked: boolean;
  signInWithGoogle: () => Promise<{ success: boolean; message?: string }>;
  signOutGoogle: () => Promise<void>;
  isGoogleAuthenticated: boolean;
  googleUserEmail: string | null;
}

const LedgerContext = createContext<LedgerContextType | null>(null);

// 成員名冊去重函式：相同 display_name 或相同 Google 綁定信箱者視為同一位家庭成員（支援多台手機/電腦認領同一身分及 Google 帳號授權）
export const deduplicateMembers = (memberList: Profile[]): Profile[] => {
  const result: Profile[] = [];
  const seenNames = new Set<string>();
  const seenEmails = new Set<string>();

  // 排除殘留之訪客寶可夢與歷史幽靈成員，確保名冊永遠純淨
  const cleanList = memberList.filter(m =>
    m.id !== '9b017d89-b21f-4638-b076-5a7629e2dda5' &&
    m.id !== 'e6a2d1ec-3b2a-495f-b24e-71c2647d9a86' &&
    (m.display_name || '').trim() !== '寶可夢'
  );

  // 步驟一：先將已綁定 Google 且加鎖之重要受保護成員放前，確保保留自訂家庭稱謂（如「智爸」優先於「Matt Yu」）
  const sortedList = [...cleanList].sort((a, b) => {
    // 1. 已加鎖保護者優先
    if (a.is_locked && !b.is_locked) return -1;
    if (!a.is_locked && b.is_locked) return 1;
    // 2. 具有自訂稱謂（非 Google 預設姓名、頭像不是圖片網址）者優先
    const aIsUrl = Boolean(a.avatar_url && (a.avatar_url.startsWith('http://') || a.avatar_url.startsWith('https://')));
    const bIsUrl = Boolean(b.avatar_url && (b.avatar_url.startsWith('http://') || b.avatar_url.startsWith('https://')));
    if (!aIsUrl && bIsUrl) return -1;
    if (aIsUrl && !bIsUrl) return 1;
    // 3. owner / admin 優先
    if ((a.role === 'owner' || a.role === 'admin') && b.role === 'member') return -1;
    if (a.role === 'member' && (b.role === 'owner' || b.role === 'admin')) return 1;
    return 0;
  });

  for (const m of sortedList) {
    const nameKey = (m.display_name || '').trim().toLowerCase();
    const emailKey = (m.auth_email || m.email || '').trim().toLowerCase();

    // 檢查是否已有名稱相同，或已綁定信箱相同且其中一方為 Google 影子帳號的既有成員
    let existing: Profile | undefined = undefined;

    if (nameKey && seenNames.has(nameKey)) {
      existing = result.find(em => (em.display_name || '').trim().toLowerCase() === nameKey);
    } else if (emailKey && seenEmails.has(emailKey)) {
      // 僅在其中一個是 Google 授權所產生的影子帳號（大頭貼為 HTTP 圖片網址，或稱謂為未加鎖的 Google 帳號姓名）時，才與既有自訂家庭稱謂合併！
      // 若兩者皆為獨立的自訂稱謂（例如「智爸」與「倉鼠」），絕對不能互相合併覆蓋！
      existing = result.find(em => {
        const emEmail = (em.auth_email || em.email || '').trim().toLowerCase();
        if (emEmail !== emailKey) return false;
        const mIsUrl = Boolean(m.avatar_url && (m.avatar_url.startsWith('http://') || m.avatar_url.startsWith('https://')));
        const emIsUrl = Boolean(em.avatar_url && (em.avatar_url.startsWith('http://') || em.avatar_url.startsWith('https://')));
        const isSameName = (em.display_name || '').trim().toLowerCase() === nameKey;
        return isSameName || mIsUrl || emIsUrl;
      });
    }

    if (!existing) {
      if (nameKey) seenNames.add(nameKey);
      if (emailKey) seenEmails.add(emailKey);
      result.push({ ...m });
    } else {
      // 合併屬性：保留較高的權限與已綁定資訊
      if (m.role === 'owner') existing.role = 'owner';
      else if (m.role === 'admin' && existing.role !== 'owner') existing.role = 'admin';
      if (m.auth_email && !existing.auth_email) existing.auth_email = m.auth_email;
      if (m.auth_provider && !existing.auth_provider) existing.auth_provider = m.auth_provider;
      if (m.is_locked) existing.is_locked = true;
      if (m.claim_code && !existing.claim_code) existing.claim_code = m.claim_code;
      if (m.claim_code_expires_at && !existing.claim_code_expires_at) existing.claim_code_expires_at = m.claim_code_expires_at;
      // 保留正常 Emoji 大頭貼（若 existing 的是 URL 而 m 是 Emoji，換回 Emoji）
      if (existing.avatar_url && (existing.avatar_url.startsWith('http://') || existing.avatar_url.startsWith('https://')) && m.avatar_url && !m.avatar_url.startsWith('http')) {
        existing.avatar_url = m.avatar_url;
      }
    }
  }
  return result;
};

// 建立成員別名映射表：將多台裝置同名 UUID、示範資料常數 UUID 等均映射至去重後之主要 Profile
export const buildMemberAliasMap = (
  deduped: Profile[],
  loaded: Profile[],
  extraProfiles?: Profile[]
): Record<string, Profile> => {
  const map: Record<string, Profile> = {};

  // 1. 主要成員自身映射
  for (const m of deduped) {
    map[m.id] = m;
  }

  // 2. 雲端所有關聯成員（包含不同裝置登入但同一暱稱者、以及 Google OAuth 幽靈帳號）
  for (const raw of loaded) {
    const rawName = (raw.display_name || '').trim().toLowerCase();
    const rawEmail = (raw.auth_email || raw.email || '').trim().toLowerCase();

    // 優先以名稱比對
    let canonical = deduped.find(
      m => (m.display_name || '').trim().toLowerCase() === rawName
    );
    // 次之以已綁定之 Google 信箱比對 (僅比對 Matt Yu 圖片影子成員，不跨稱謂亂對齊)
    if (!canonical && rawEmail) {
      canonical = deduped.find(
        m => {
          const mEmail = (m.auth_email || m.email || '').trim().toLowerCase();
          if (mEmail !== rawEmail) return false;
          const rawIsUrl = Boolean(raw.avatar_url && (raw.avatar_url.startsWith('http://') || raw.avatar_url.startsWith('https://')));
          const mIsUrl = Boolean(m.avatar_url && (m.avatar_url.startsWith('http://') || m.avatar_url.startsWith('https://')));
          return (m.display_name || '').trim().toLowerCase() === rawName || rawIsUrl || mIsUrl;
        }
      );
    }
    map[raw.id] = canonical || raw;
  }

  // 3. 額外查詢之付款人 Profile
  if (extraProfiles) {
    for (const p of extraProfiles) {
      const pName = (p.display_name || '').trim().toLowerCase();
      const pEmail = (p.auth_email || p.email || '').trim().toLowerCase();
      let canonical = deduped.find(
        m => (m.display_name || '').trim().toLowerCase() === pName
      );
      if (!canonical && pEmail) {
        canonical = deduped.find(
          m => {
            const mEmail = (m.auth_email || m.email || '').trim().toLowerCase();
            if (mEmail !== pEmail) return false;
            const pIsUrl = Boolean(p.avatar_url && (p.avatar_url.startsWith('http://') || p.avatar_url.startsWith('https://')));
            const mIsUrl = Boolean(m.avatar_url && (m.avatar_url.startsWith('http://') || m.avatar_url.startsWith('https://')));
            return (m.display_name || '').trim().toLowerCase() === pName || pIsUrl || mIsUrl;
          }
        );
      }
      map[p.id] = canonical || p;
    }
  }

  // 4. 歷史與示範帳目常數回退
  if (deduped.length > 0) {
    const dad = deduped.find(m => m.display_name.includes('爸') || m.role === 'owner') || deduped[0];
    const mom = deduped.find(m => m.display_name.includes('媽')) || deduped[1] || dad;
    const kid = deduped.find(m => m.display_name.includes('寶') || m.display_name.includes('孩')) || deduped[2] || dad;
    map[DEMO_USER_DAD] = dad;
    map[DEMO_USER_MOM] = mom;
    map[DEMO_USER_KID] = kid;
  }

  return map;
};

// 合併常用付款方式：定義（雲端與系統預設）共享，啟用開關（is_enabled）與排序（sort_order）由各裝置本機獨立維持
export const mergePaymentMethods = (
  definitions: CustomPaymentMethod[],
  localPreferences?: CustomPaymentMethod[] | null
): CustomPaymentMethod[] => {
  if (!localPreferences || localPreferences.length === 0) {
    return definitions.map((m, idx) => ({
      ...m,
      is_enabled: m.id === 'cash' ? true : (m.is_enabled ?? true),
      sort_order: idx + 1,
    }));
  }

  // 本機偏好設定映射表 (以 id 與 name 雙重相容)
  const localMap = new Map<string, { is_enabled: boolean; sort_order: number }>();
  localPreferences.forEach((m, idx) => {
    const isEnabled = m.id === 'cash' ? true : m.is_enabled !== false;
    const sortOrder = m.sort_order ?? (idx + 1);
    localMap.set(m.id, { is_enabled: isEnabled, sort_order: sortOrder });
    if (m.name) {
      localMap.set(m.name, { is_enabled: isEnabled, sort_order: sortOrder });
    }
  });

  const merged: CustomPaymentMethod[] = [];
  definitions.forEach((def, idx) => {
    const localPref = localMap.get(def.id) || localMap.get(def.name);
    if (localPref) {
      // 繼承雲端/預設的名稱、圖示、色彩與綁卡設定，但保留本地使用者的個人開關與排序
      merged.push({
        ...def,
        is_enabled: def.id === 'cash' ? true : localPref.is_enabled,
        sort_order: localPref.sort_order,
      });
    } else {
      // 雲端新增項目（本機尚未看過，如管理員新增的 Google Pay）：預設開啟，排在最後
      merged.push({
        ...def,
        is_enabled: true,
        sort_order: 900 + idx,
      });
    }
  });

  // 依據本機排序偏好由小到大排序
  merged.sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));

  // 重整為連續 1-indexed 順序
  return merged.map((m, idx) => ({ ...m, sort_order: idx + 1 }));
};

const STORAGE_KEYS = {
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
  PAYMENT_ACCOUNTS: '@family_ledger_payment_accounts',
  DELETED_ACCOUNT_IDS: '@family_ledger_deleted_account_ids',
  ACCOUNTS_INITIALIZED: '@family_ledger_accounts_initialized',
  PAYMENT_METHODS: '@family_ledger_payment_methods',
  RECURRING_RULES: '@family_ledger_recurring_rules',
  LAST_VISITED_PREFIX: '@family_ledger_last_visited_',
  DEVICE_ID: '@family_ledger_device_id',
  MEMBER_DEVICES: '@family_ledger_member_devices',
  LEDGER_READ_ONLY: '@family_ledger_read_only',
  LEDGER_ALLOW_NEW_MEMBERS: '@family_ledger_allow_new_members',
  LEDGERS: '@family_ledger_list',
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
  '52678d37-fed9-4596-90dd-4f606bc62c0b': { name: '薪資收入', icon: '💰', color: '#059669', type: 'income' },
  'c5648d3b-dfcb-4aa0-b230-a9074bfa58f5': { name: '投資理財', icon: '📈', color: '#2563EB', type: 'income' },
  '30000000-0000-4000-8000-000000000010': { name: '零用錢', icon: '💵', color: '#10B981', type: 'income' },
};

export const LedgerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentLedger, setCurrentLedger] = useState<Ledger>(DEFAULT_LEDGER);
  const [ledgers, setLedgers] = useState<Ledger[]>([DEFAULT_LEDGER]);
  const [members, setMembers] = useState<Profile[]>(DEFAULT_MEMBERS);
  const [rawMembers, setRawMembers] = useState<Profile[]>([]);
  const [memberAliasMap, setMemberAliasMap] = useState<Record<string, Profile>>({});
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>(DEMO_PAYMENT_ACCOUNTS);
  const [paymentMethods, setPaymentMethods] = useState<CustomPaymentMethod[]>(DEFAULT_PAYMENT_METHODS);
  const [recurringRules, setRecurringRules] = useState<RecurringRule[]>([]);
  const [currentUser, setCurrentUser] = useState<Profile>(DEFAULT_MEMBERS[0]);
  const [isCloudSynced, setIsCloudSynced] = useState<boolean>(false);
  const [isDeviceBound, setIsDeviceBound] = useState<boolean>(false);
  const [hasJoinedLedger, setHasJoinedLedger] = useState<boolean>(true);
  const [inviteCode, setInviteCode] = useState<string>('FAM-8823');
  const [adminPin, setAdminPin] = useState<string>('8888');
  const [userRole, setUserRole] = useState<'owner' | 'admin' | 'member'>('member');
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(null);
  const [memberDevices, setMemberDevices] = useState<MemberDevice[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('');
  const [isGoogleAuthenticated, setIsGoogleAuthenticated] = useState<boolean>(false);
  const [googleUserEmail, setGoogleUserEmail] = useState<string | null>(null);

  // 方案 A：即時 App 內通知泡泡 (In-App Toast Notification)
  const [liveToast, setLiveToast] = useState<LiveToastNotification | null>(null);
  const currentUserRef = useRef<Profile>(currentUser);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const dismissLiveToast = React.useCallback(() => {
    setLiveToast(null);
  }, []);

  const triggerLiveToast = React.useCallback((toast: LiveToastNotification) => {
    setLiveToast(toast);
  }, []);

  // 跨帳本未讀動態與紅點標記 (Record<ledger_id, unread_count>)
  const [unreadLedgerMap, setUnreadLedgerMap] = useState<Record<string, number>>({});
  const multiLedgerChannelRef = useRef<any>(null);

  const hasOtherUnread = React.useMemo(() => {
    return Object.entries(unreadLedgerMap).some(([lid, cnt]) => lid !== currentLedger.id && cnt > 0);
  }, [unreadLedgerMap, currentLedger.id]);

  // 定期備份設定與上次備份記錄
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState<boolean>(true);
  const [autoBackupInterval, setAutoBackupInterval] = useState<7 | 14 | 30>(7);

  const recordBackupComplete = async () => {
    const nowIso = new Date().toISOString();
    setLastBackupAt(nowIso);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_BACKUP_AT, nowIso);
    } catch {}
  };

  const updateAutoBackupConfig = async (enabled: boolean, intervalDays: 7 | 14 | 30) => {
    setAutoBackupEnabled(enabled);
    setAutoBackupInterval(intervalDays);
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.AUTO_BACKUP_CONFIG,
        JSON.stringify({ enabled, intervalDays })
      );
    } catch {}
  };

  // 智慧店家 / 對象自學習名單與雲端欄位探測
  const [recentMerchants, setRecentMerchants] = useState<string[]>(DEFAULT_POPULAR_MERCHANTS);
  const [recentMemoTags, setRecentMemoTags] = useState<string[]>(DEFAULT_MEMO_QUICK_TAGS);
  const hasMerchantColumnRef = useRef<boolean>(false);
  const hasPaymentColumnsRef = useRef<boolean>(false);
  const deletedTxIdsRef = useRef<Set<string>>(new Set());
  const recentToastTimestampsRef = useRef<Map<string, number>>(new Map());
  const recentUpdatersRef = useRef<Map<string, { updaterId: string; updaterName: string; updaterAvatar: string; timestamp: number }>>(new Map());

  // 輔助函式：避免 Realtime 多重通道（廣播 + 資料庫變更）在 4 秒內重複彈出相同通知泡泡
  const shouldShowToast = React.useCallback((id: string, actionType: string): boolean => {
    const key = `${id}:${actionType}`;
    const now = Date.now();
    const last = recentToastTimestampsRef.current.get(key);
    if (last && now - last < 4000) {
      return false;
    }
    recentToastTimestampsRef.current.set(key, now);
    return true;
  }, []);

  const recordMerchant = React.useCallback(async (m: string) => {
    const clean = (m || '').trim();
    if (!clean) return;
    setRecentMerchants((prev) => {
      const filtered = prev.filter(item => item.toLowerCase() !== clean.toLowerCase());
      const updated = [clean, ...filtered].slice(0, 50);
      AsyncStorage.setItem(STORAGE_KEYS.RECENT_MERCHANTS, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const recordMemoTag = React.useCallback(async (tag: string) => {
    const clean = (tag || '').trim();
    if (!clean || clean.length < 2 || clean.length > 20 || clean.startsWith('http')) return;
    setRecentMemoTags((prev) => {
      const filtered = prev.filter(item => item.toLowerCase() !== clean.toLowerCase());
      const updated = [clean, ...filtered].slice(0, 30);
      AsyncStorage.setItem(STORAGE_KEYS.RECENT_MEMO_TAGS, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const removeRecentMemoTag = React.useCallback(async (tag: string) => {
    const clean = (tag || '').trim();
    if (!clean) return;
    setRecentMemoTags((prev) => {
      const updated = prev.filter(item => item.toLowerCase() !== clean.toLowerCase());
      AsyncStorage.setItem(STORAGE_KEYS.RECENT_MEMO_TAGS, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  // 透過 ID 取得標準成員資料（自動穿透多裝置 UUID、別名表、歷史示範常數）
  const getMemberById = React.useCallback(
    (id?: string): Profile | undefined => {
      if (!id) return undefined;
      // 1. 直查去重後主要成員名單
      const direct = members.find(m => m.id === id);
      if (direct) return direct;

      // 2. 查別名映射表
      if (memberAliasMap[id]) return memberAliasMap[id];

      // 3. 示範常數映射
      if (id === DEMO_USER_DAD) {
        return members.find(m => m.display_name.includes('爸') || m.role === 'owner') || members[0];
      }
      if (id === DEMO_USER_MOM) {
        return members.find(m => m.display_name.includes('媽')) || members[1] || members[0];
      }
      if (id === DEMO_USER_KID) {
        return members.find(m => m.display_name.includes('寶') || m.display_name.includes('孩')) || members[2] || members[0];
      }

      // 4. 查未去重之 rawMembers
      const raw = rawMembers.find(m => m.id === id);
      if (raw) {
        const canonical = members.find(
          m => (m.display_name || '').trim().toLowerCase() === (raw.display_name || '').trim().toLowerCase()
        );
        return canonical || raw;
      }

      return undefined;
    },
    [members, memberAliasMap, rawMembers]
  );

  // 透過 ID 或交易附加資訊精確取得分類（支援本機離線快取、歷史示範常數、雲端 UUID）
  const getCategoryById = React.useCallback(
    (categoryId?: string, txCategory?: Category): Category => {
      if (categoryId) {
        // 1. 直查當前 categories state
        const fromState = categories.find(c => c.id === categoryId);
        if (fromState) return fromState;

        // 2. 查預設 DEFAULT_CATEGORIES
        const fromDefault = DEFAULT_CATEGORIES.find(c => c.id === categoryId);
        if (fromDefault) return fromDefault;

        // 3. 查已知雲端 UUID 字典表 (確保離線狀態下舊帳目永不遺失)
        const fromKnown = KNOWN_CATEGORY_UUIDS[categoryId];
        if (fromKnown) {
          return {
            id: categoryId,
            name: fromKnown.name || '其他',
            icon: fromKnown.icon || '📝',
            color: fromKnown.color || '#6B7280',
            type: fromKnown.type || 'expense',
            sort_order: 99,
          };
        }
      }

      // 4. 查交易自身快取的 category 物件
      if (txCategory && txCategory.name) {
        return txCategory;
      }

      return {
        id: categoryId || 'unknown',
        name: '其他',
        icon: '📝',
        color: '#6B7280',
        type: 'expense',
        sort_order: 99,
      };
    },
    [categories]
  );

  // 角色預覽模式（供管理員測試一般成員視角使用）
  const [previewMember, setPreviewMember] = useState<Profile | null>(null);

  const startMemberPreview = (member: Profile) => {
    setPreviewMember(member);
  };

  const startCurrentMemberPreview = () => {
    setPreviewMember({ ...currentUser, role: 'member' });
  };

  const exitMemberPreview = () => {
    setPreviewMember(null);
  };

  // 管理員日常成員模式 / 提權管理模式切換 (Default-to-Member Mode)
  // 本機開機/重新整理預設為日常成員模式 (isAdminMode = false)，
  // 畫面完全如一般成員般乾淨防呆；需要時至家庭設定輸入 PIN 碼提權啟用管理員模式 (isAdminMode = true)。
  const [isAdminMode, setIsAdminMode] = useState<boolean>(false);

  const enableAdminMode = (inputPin: string): { success: boolean; message?: string } => {
    const clean = (inputPin || '').trim();
    const expected = (((currentLedger as any)?.admin_pin || adminPin || '8888') as string).trim();
    if (!clean || clean !== expected) {
      return { success: false, message: '管理員安全 PIN 碼錯誤，請重新輸入！' };
    }
    setIsAdminMode(true);
    return { success: true };
  };

  const disableAdminMode = () => {
    setIsAdminMode(false);
  };

  // 帳本管理員包含建立者 (owner) 與共同管理員 (admin)
  const isOwner = userRole === 'owner' || userRole === 'admin';

  // 有效身分與權限：
  // 1. 若啟動 previewMember（角色體驗），則完全以該模擬成員角色為準
  // 2. 若真實身分為管理員 (isOwner)，但在預設日常成員模式 (!isAdminMode)，則前端 isOwner 為 false (無管理特權)
  // 3. 只有真實身分為管理員且啟用管理員模式 (isOwner && isAdminMode) 時，effectiveIsOwner 為 true
  const effectiveCurrentUser = previewMember || currentUser;
  const isPreviewMode = !!previewMember;
  const effectiveUserRole: 'owner' | 'admin' | 'member' = previewMember
    ? (previewMember.role === 'owner' || previewMember.role === 'admin'
        ? (previewMember.role as 'owner' | 'admin')
        : 'member')
    : (isOwner && isAdminMode ? userRole : 'member');
  const effectiveIsOwner = isPreviewMode
    ? (previewMember.role === 'owner' || previewMember.role === 'admin')
    : (isOwner && isAdminMode);
  const channelRef = useRef<any>(null);

  // 1. 初始化本地快取（Local-First: 先離線秒開，再非同步接雲端）
  useEffect(() => {
    const loadLocalCache = async () => {
      try {
        // 優先載入本地分類快取
        const savedCategories = await AsyncStorage.getItem(STORAGE_KEYS.CATEGORIES);
        let activeCategories = DEFAULT_CATEGORIES;
        if (savedCategories) {
          try {
            const parsed = JSON.parse(savedCategories);
            if (Array.isArray(parsed) && parsed.length > 0) {
              if (!parsed.some((c: any) => c.type === 'income' && (c.name.includes('零用') || c.name === '零用錢'))) {
                const allowanceCat = DEFAULT_CATEGORIES.find(c => c.name === '零用錢');
                if (allowanceCat) parsed.push(allowanceCat);
              }
              activeCategories = parsed;
              setCategories(parsed);
            }
          } catch {}
        }

        const savedLedgerStr = await AsyncStorage.getItem(STORAGE_KEYS.LEDGER);
        let parsedLedgerId: string | null = null;
        if (savedLedgerStr) {
          try { parsedLedgerId = JSON.parse(savedLedgerStr)?.id; } catch {}
        }

        const deletedSet = new Set<string>();
        try {
          const deletedKeys = [
            STORAGE_KEYS.DELETED_TX_IDS,
            parsedLedgerId ? `${STORAGE_KEYS.DELETED_TX_IDS}_${parsedLedgerId}` : null,
          ].filter(Boolean) as string[];

          for (const key of deletedKeys) {
            const savedDeleted = await AsyncStorage.getItem(key);
            if (savedDeleted) {
              const arr = JSON.parse(savedDeleted);
              if (Array.isArray(arr)) {
                arr.forEach((id: string) => {
                  deletedSet.add(id);
                  deletedTxIdsRef.current.add(id);
                });
              }
            }
          }
        } catch {}

        const savedTx = await AsyncStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
        if (savedTx) {
          const parsed = JSON.parse(savedTx);
          const validTx = parsed
            .filter((t: any) => isValidUUID(t.id) && isValidUUID(t.ledger_id))
            .map((t: any) => {
              const matchedCat =
                activeCategories.find((c: any) => c.id === t.category_id) ||
                DEFAULT_CATEGORIES.find(c => c.id === t.category_id) ||
                (t.category_id && KNOWN_CATEGORY_UUIDS[t.category_id]
                  ? {
                      id: t.category_id,
                      name: KNOWN_CATEGORY_UUIDS[t.category_id].name || '其他',
                      icon: KNOWN_CATEGORY_UUIDS[t.category_id].icon || '📝',
                      color: KNOWN_CATEGORY_UUIDS[t.category_id].color || '#6B7280',
                      type: KNOWN_CATEGORY_UUIDS[t.category_id].type || 'expense',
                      sort_order: 99,
                    }
                  : null) ||
                t.category;
              let parsedMerchant = t.merchant;
              let parsedNote = t.note;
              if (t.type !== 'memo' && !parsedMerchant && t.note) {
                const match = t.note.match(/^[\[［【](.*?)[\]］】]\s*(.*)$/);
                if (match) {
                  parsedMerchant = match[1];
                  parsedNote = match[2];
                }
              }
              const decodedLocalMemo = decodeMemoMerchantTag(parsedMerchant);
              return {
                ...t,
                type: decodedLocalMemo.isMemo ? 'memo' : t.type,
                reminder_date: decodedLocalMemo.reminderDate || t.reminder_date,
                reminder_calendar: decodedLocalMemo.reminderCalendar || t.reminder_calendar,
                reminder_repeat: decodedLocalMemo.reminderRepeat || t.reminder_repeat,
                completed_by: decodedLocalMemo.completedBy || t.completed_by,
                merchant: decodedLocalMemo.isMemo ? undefined : (parsedMerchant || undefined),
                note: parsedNote || '',
                category: matchedCat || t.category,
              };
            });
          if (validTx.length > 0) setTransactions(validTx);
        }

        const perLedgerUser = parsedLedgerId ? await AsyncStorage.getItem(`${STORAGE_KEYS.CURRENT_USER}_${parsedLedgerId}`) : null;
        const savedUser = perLedgerUser || await AsyncStorage.getItem(STORAGE_KEYS.CURRENT_USER);
        if (savedUser) {
          const parsed = JSON.parse(savedUser);
          if (isValidUUID(parsed.id)) {
            setCurrentUser(parsed);
          } else {
            await AsyncStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
          }
        }

        const savedMembers = await AsyncStorage.getItem(STORAGE_KEYS.MEMBERS);
        if (savedMembers) {
          const parsed = JSON.parse(savedMembers);
          const validMembers = parsed.filter((m: any) => isValidUUID(m.id));
          if (validMembers.length > 0) {
            setMembers(validMembers);
          } else {
            await AsyncStorage.removeItem(STORAGE_KEYS.MEMBERS);
          }
        }

        const savedAlias = await AsyncStorage.getItem(STORAGE_KEYS.ALIAS_MAP);
        if (savedAlias) {
          try {
            setMemberAliasMap(JSON.parse(savedAlias));
          } catch {}
        }

        const savedHasJoined = await AsyncStorage.getItem(STORAGE_KEYS.HAS_JOINED);
        const savedCode = await AsyncStorage.getItem(STORAGE_KEYS.INVITE_CODE);
        if (savedCode) setInviteCode(savedCode);

        const savedLedger = await AsyncStorage.getItem(STORAGE_KEYS.LEDGER);
        const savedUserStr = await AsyncStorage.getItem(STORAGE_KEYS.CURRENT_USER);

        if (savedLedger) {
          try {
            const parsed = JSON.parse(savedLedger);
            if (isValidUUID(parsed.id) && parsed.id !== DEMO_LEDGER_ID) {
              setLedgers([parsed]);
              setCurrentLedger(parsed);
              // 只要本機存有真實帳本快取，自動修復任何舊版殘留的 'false' 標記，100% 保持已加入狀態
              setHasJoinedLedger(true);
              if (savedHasJoined !== 'true') {
                await AsyncStorage.setItem(STORAGE_KEYS.HAS_JOINED, 'true');
              }
            }
          } catch {}
        }

        // 本機快取黃金絕對鎖定 (Local-First Absolute Lock)：
        // 只要本機存有真實帳本、已加入標記、邀請碼或使用者身分紀錄，100% 鎖死為已加入狀態
        if (savedLedger || savedHasJoined === 'true' || savedCode || savedUserStr) {
          setHasJoinedLedger(true);
        } else {
          // 僅在「完全無任何帳本快取、身分紀錄與邀請碼」的全新冷啟動時，才顯示初始歡迎畫面
          setHasJoinedLedger(false);
        }

        const savedBound = await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_BOUND);
        if (savedBound === 'true') setIsDeviceBound(true);

        const savedRole = await AsyncStorage.getItem(STORAGE_KEYS.USER_ROLE);
        if (savedRole === 'owner' || savedRole === 'member') {
          setUserRole(savedRole as any);
        }

        const savedPin = await AsyncStorage.getItem(STORAGE_KEYS.ADMIN_PIN);
        if (savedPin) setAdminPin(savedPin);

        const savedLastBackup = await AsyncStorage.getItem(STORAGE_KEYS.LAST_BACKUP_AT);
        if (savedLastBackup) setLastBackupAt(savedLastBackup);

        const savedAutoBackup = await AsyncStorage.getItem(STORAGE_KEYS.AUTO_BACKUP_CONFIG);
        if (savedAutoBackup) {
          try {
            const parsed = JSON.parse(savedAutoBackup);
            if (typeof parsed.enabled === 'boolean') setAutoBackupEnabled(parsed.enabled);
            if ([7, 14, 30].includes(parsed.intervalDays)) setAutoBackupInterval(parsed.intervalDays);
          } catch {}
        }

        const savedRecentMerchants = await AsyncStorage.getItem(STORAGE_KEYS.RECENT_MERCHANTS);
        if (savedRecentMerchants) {
          try {
            const parsed = JSON.parse(savedRecentMerchants);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setRecentMerchants(parsed);
            }
          } catch {}
        }

        const savedRecentMemoTags = await AsyncStorage.getItem(STORAGE_KEYS.RECENT_MEMO_TAGS);
        if (savedRecentMemoTags) {
          try {
            const parsed = JSON.parse(savedRecentMemoTags);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setRecentMemoTags(parsed);
            }
          } catch {}
        }

        const ledgerId = savedLedger ? JSON.parse(savedLedger)?.id : null;
        const savedAccounts = (ledgerId && await AsyncStorage.getItem(`${STORAGE_KEYS.PAYMENT_ACCOUNTS}_${ledgerId}`)) || await AsyncStorage.getItem(STORAGE_KEYS.PAYMENT_ACCOUNTS);
        if (savedAccounts) {
          try {
            const parsed = JSON.parse(savedAccounts);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setPaymentAccounts(parsed);
            }
          } catch {}
        }

        const savedMethods = (ledgerId && await AsyncStorage.getItem(`${STORAGE_KEYS.PAYMENT_METHODS}_${ledgerId}`)) || await AsyncStorage.getItem(STORAGE_KEYS.PAYMENT_METHODS);
        if (savedMethods) {
          try {
            const parsed = JSON.parse(savedMethods);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const merged = [...parsed];
              DEFAULT_PAYMENT_METHODS.forEach(defM => {
                if (!merged.some(m => m.id === defM.id)) {
                  merged.push(defM);
                }
              });
              const sanitized = merged.map(m => m.id === 'cash' ? { ...m, is_enabled: true } : m);
              setPaymentMethods(sanitized);
            }
          } catch {}
        } else {
          setPaymentMethods(DEFAULT_PAYMENT_METHODS);
        }

        // 週期扣款規則：嚴格依帳本 ID 獨立載入，絕不讀取全域未隔離快取
        const savedRecurringStr = ledgerId ? await AsyncStorage.getItem(`${STORAGE_KEYS.RECURRING_RULES}_${ledgerId}`) : null;
        if (savedRecurringStr) {
          try {
            const parsed = JSON.parse(savedRecurringStr);
            if (Array.isArray(parsed)) {
              // 雙重保證：過濾掉非此帳本之規則
              const validRules = parsed.filter((r: any) => r.ledger_id === ledgerId);
              setRecurringRules(validRules);
            }
          } catch {}
        } else if (ledgerId === DEMO_LEDGER_ID || !ledgerId) {
          setRecurringRules(DEMO_RECURRING_RULES);
        } else {
          setRecurringRules([]);
        }
        // 清理歷史版本殘留之全域無前綴 key，防止跨帳本洩漏
        AsyncStorage.removeItem(STORAGE_KEYS.RECURRING_RULES).catch(() => {});

        // 載入本機裝置指紋與成員裝置快取
        const devId = await getDeviceId();
        setCurrentDeviceId(devId);
        const savedDevicesStr = ledgerId ? await AsyncStorage.getItem(`${STORAGE_KEYS.MEMBER_DEVICES}_${ledgerId}`) : null;
        if (savedDevicesStr) {
          try {
            const parsed = JSON.parse(savedDevicesStr);
            if (Array.isArray(parsed)) setMemberDevices(parsed);
          } catch {}
        }
      } catch (err) {
        console.warn('載入本地記帳快取失敗:', err);
      }
    };
    loadLocalCache();
  }, []);

  // 輔助函式：建立 Realtime WebSocket 訂閱
  const setupRealtimeSubscription = (ledgerId: string) => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`ledger-${ledgerId}-realtime`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'transactions',
          filter: `ledger_id=eq.${ledgerId}`,
        },
        (payload) => {
          const newRow = payload.new as any;
          if (!newRow) return;

          // 若此 ID 先前曾存在於本機刪除快取，由於雲端已確認寫入新交易/還原紀錄，解除本機刪除標記
          if (deletedTxIdsRef.current.has(newRow.id)) {
            deletedTxIdsRef.current.delete(newRow.id);
          }
          let parsedMerchant = newRow.merchant;
          let parsedNote = newRow.note;
          if (!parsedMerchant && newRow.note) {
            const match = newRow.note.match(/^[\[［【](.*?)[\]］】]\s*(.*)$/);
            if (match) {
              parsedMerchant = match[1];
              parsedNote = match[2];
            }
          }

          let reminderDate: string | undefined = undefined;
          let reminderCalendar: CalendarSystem | undefined = newRow.reminder_calendar;
          let reminderRepeat: MemoRepeatFrequency | undefined = newRow.reminder_repeat;
          let completedBy: string | undefined = newRow.completed_by;
          let resolvedType: TransactionType = newRow.type;

          const decodedMemo = decodeMemoMerchantTag(parsedMerchant);
          if (decodedMemo.isMemo) {
            resolvedType = 'memo';
            reminderDate = decodedMemo.reminderDate;
            reminderCalendar = decodedMemo.reminderCalendar;
            reminderRepeat = decodedMemo.reminderRepeat;
            if (decodedMemo.completedBy) completedBy = decodedMemo.completedBy;
            parsedMerchant = undefined;
          } else if (newRow.type === 'memo' || (newRow.type === 'transfer' && Number(newRow.amount) === 0)) {
            resolvedType = 'memo';
            parsedMerchant = undefined;
            parsedNote = newRow.note;
          } else if (parsedMerchant) {
            recordMerchant(parsedMerchant);
          }

          if (resolvedType === 'memo' && newRow.note) {
            const memoTag = extractMemoTag(newRow.note);
            if (memoTag) recordMemoTag(memoTag);
          }

          setTransactions((prev) => {
            if (prev.some((t) => t.id === newRow.id)) return prev;
            const canonicalPayer = getMemberById(newRow.paid_by);
            const item: Transaction = {
              ...newRow,
              type: resolvedType,
              reminder_date: reminderDate || newRow.reminder_date,
              reminder_calendar: reminderCalendar || newRow.reminder_calendar,
              reminder_repeat: reminderRepeat || newRow.reminder_repeat,
              completed_by: completedBy || newRow.completed_by,
              merchant: parsedMerchant || undefined,
              note: parsedNote || '',
              amount: resolvedType === 'memo' ? 0 : Number(newRow.amount),
              paid_by: canonicalPayer?.id || newRow.paid_by,
              payer_profile: canonicalPayer || newRow.payer_profile,
              category: getCategoryById(newRow.category_id, newRow.category),
            };
            const updated = [item, ...prev];
            AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(updated));
            AsyncStorage.setItem(`${STORAGE_KEYS.TRANSACTIONS}_${ledgerId}`, JSON.stringify(updated));
            return updated;
          });

          // 方案 A：若這筆記帳/記事由其他裝置寫入，觸發即時通知泡泡
          const myId = currentUserRef.current?.id;
          const isFromOther = !myId || (newRow.creator_id && newRow.creator_id !== myId);
          if (isFromOther && shouldShowToast(newRow.id, 'insert')) {
            const actor = getMemberById(newRow.paid_by) || getMemberById(newRow.creator_id);
            const actorName = actor?.display_name || '家人';
            const actorAvatar = actor?.avatar_url || '👤';

            if (resolvedType === 'memo') {
              const memoData = parseMemoNote(parsedNote);
              setLiveToast({
                id: `insert-memo-${newRow.id}-${Date.now()}`,
                type: 'insert',
                actorName,
                avatar: memoData.icon || actorAvatar,
                title: `📝 ${actorName} 留了一則生活記事！`,
                message: `[${memoData.title}] ${memoData.cleanContent}`,
                createdAt: Date.now(),
              });
            } else {
              const cat = getCategoryById(newRow.category_id);
              const isIncome = newRow.type === 'income';
              const amountStr = Number(newRow.amount).toLocaleString();
              const displayDetail = [parsedMerchant ? `[${parsedMerchant}]` : '', parsedNote || ''].filter(Boolean).join(' ');

              setLiveToast({
                id: `insert-${newRow.id}-${Date.now()}`,
                type: 'insert',
                actorName,
                avatar: actorAvatar,
                title: `🎉 ${actorName} 剛記了一筆！`,
                message: `${cat.icon} ${cat.name} ${isIncome ? '+' : '-'}NT$ ${amountStr}${displayDetail ? ` (${displayDetail})` : ''}`,
                amount: Number(newRow.amount),
                createdAt: Date.now(),
              });
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'transactions',
          filter: `ledger_id=eq.${ledgerId}`,
        },
        (payload) => {
          const updatedRow = payload.new as any;
          if (!updatedRow) return;
          let parsedMerchant = updatedRow.merchant;
          let parsedNote = updatedRow.note;
          if (!parsedMerchant && updatedRow.note) {
            const match = updatedRow.note.match(/^[\[［【](.*?)[\]］】]\s*(.*)$/);
            if (match) {
              parsedMerchant = match[1];
              parsedNote = match[2];
            }
          }

          let reminderDate: string | undefined = undefined;
          let reminderCalendar: CalendarSystem | undefined = updatedRow.reminder_calendar;
          let reminderRepeat: MemoRepeatFrequency | undefined = updatedRow.reminder_repeat;
          let completedBy: string | undefined = updatedRow.completed_by;
          let resolvedType: TransactionType = updatedRow.type;

          const decodedMemo = decodeMemoMerchantTag(parsedMerchant);
          if (decodedMemo.isMemo) {
            resolvedType = 'memo';
            reminderDate = decodedMemo.reminderDate;
            reminderCalendar = decodedMemo.reminderCalendar;
            reminderRepeat = decodedMemo.reminderRepeat;
            if (decodedMemo.completedBy) completedBy = decodedMemo.completedBy;
            parsedMerchant = undefined;
          } else if (updatedRow.type === 'memo' || (updatedRow.type === 'transfer' && Number(updatedRow.amount) === 0)) {
            resolvedType = 'memo';
            parsedMerchant = undefined;
            parsedNote = updatedRow.note;
          } else if (parsedMerchant) {
            recordMerchant(parsedMerchant);
          }

          if (resolvedType === 'memo' && updatedRow.note) {
            const memoTag = extractMemoTag(updatedRow.note);
            if (memoTag) recordMemoTag(memoTag);
          }

          let prevTx: Transaction | undefined;
          setTransactions((prev) => {
            prevTx = prev.find((t) => t.id === updatedRow.id);
            const canonicalPayer = getMemberById(updatedRow.paid_by);
            const updated = prev.map((t) =>
              t.id === updatedRow.id
                ? {
                    ...t,
                    ...updatedRow,
                    type: resolvedType,
                    reminder_date: reminderDate !== undefined ? reminderDate : t.reminder_date,
                    reminder_calendar: reminderCalendar !== undefined ? reminderCalendar : t.reminder_calendar,
                    reminder_repeat: reminderRepeat !== undefined ? reminderRepeat : t.reminder_repeat,
                    completed_by: updatedRow.is_settled ? (completedBy || t.completed_by) : undefined,
                    merchant: parsedMerchant || undefined,
                    note: parsedNote || '',
                    amount: resolvedType === 'memo' ? 0 : Number(updatedRow.amount),
                    payer_profile: canonicalPayer || updatedRow.payer_profile || t.payer_profile,
                    category: getCategoryById(updatedRow.category_id, updatedRow.category || t.category),
                  }
                : t
            );
            AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(updated));
            AsyncStorage.setItem(`${STORAGE_KEYS.TRANSACTIONS}_${ledgerId}`, JSON.stringify(updated));
            return updated;
          });

          // 方案 A：若更新由其他裝置發起，觸發即時通知泡泡
          const myId = currentUserRef.current?.id;
          const isMemo = resolvedType === 'memo' || prevTx?.type === 'memo';

          const recentUpdater = recentUpdatersRef.current.get(updatedRow.id);
          const isFreshUpdater = recentUpdater && (Date.now() - recentUpdater.timestamp < 15000);
          const effectiveUpdaterId = isFreshUpdater ? recentUpdater.updaterId : undefined;

          if (isMemo) {
            const wasSettledBefore = !!prevTx?.is_settled;
            const isSettledNow = !!updatedRow.is_settled;

            if (!wasSettledBefore && isSettledNow) {
              // 待辦打勾完成！
              const completerId = completedBy || prevTx?.completed_by;
              const isFromOther = !myId || (completerId && completerId !== myId);
              if (isFromOther && shouldShowToast(updatedRow.id, 'done')) {
                const completer = getMemberById(completerId);
                const completerName = completer?.display_name || '家人';
                const memoData = parseMemoNote(parsedNote || prevTx?.note);
                setLiveToast({
                  id: `complete-${updatedRow.id}-${Date.now()}`,
                  type: 'complete',
                  actorName: completerName,
                  avatar: '✓',
                  title: `✓ ${completerName} 辦妥了一項待辦！`,
                  message: `[${memoData.title}] ${memoData.cleanContent}`,
                  createdAt: Date.now(),
                });
              }
            } else if (wasSettledBefore && !isSettledNow) {
              // 取消完成（重新開啟待辦）
              const isFromOther = !myId || (effectiveUpdaterId ? effectiveUpdaterId !== myId : (updatedRow.creator_id && updatedRow.creator_id !== myId));
              if (isFromOther && shouldShowToast(updatedRow.id, 'reopen')) {
                const actorName = (isFreshUpdater && recentUpdater.updaterName) || getMemberById(updatedRow.paid_by)?.display_name || getMemberById(updatedRow.creator_id)?.display_name || '家人';
                const memoData = parseMemoNote(parsedNote || prevTx?.note);
                setLiveToast({
                  id: `reopen-${updatedRow.id}-${Date.now()}`,
                  type: 'update',
                  actorName,
                  avatar: '⚪',
                  title: `⚪ ${actorName} 重新開啟了待辦事項`,
                  message: `[${memoData.title}] ${memoData.cleanContent}`,
                  createdAt: Date.now(),
                });
              }
            } else {
              // 生活記事內容更新
              const isFromOther = !myId || (effectiveUpdaterId ? effectiveUpdaterId !== myId : (updatedRow.creator_id && updatedRow.creator_id !== myId));
              if (isFromOther && shouldShowToast(updatedRow.id, 'update-memo')) {
                const actorName = (isFreshUpdater && recentUpdater.updaterName) || getMemberById(updatedRow.paid_by)?.display_name || getMemberById(updatedRow.creator_id)?.display_name || '家人';
                const memoData = parseMemoNote(parsedNote || prevTx?.note);
                setLiveToast({
                  id: `update-memo-${updatedRow.id}-${Date.now()}`,
                  type: 'update',
                  actorName,
                  avatar: memoData.icon || '📝',
                  title: `📝 ${actorName} 更新了生活記事`,
                  message: `[${memoData.title}] ${memoData.cleanContent}`,
                  createdAt: Date.now(),
                });
              }
            }
          } else {
            const isFromOther = !myId || (effectiveUpdaterId ? effectiveUpdaterId !== myId : (updatedRow.creator_id && updatedRow.creator_id !== myId));
            if (isFromOther && shouldShowToast(updatedRow.id, 'update')) {
              const actorName = (isFreshUpdater && recentUpdater.updaterName) || getMemberById(updatedRow.paid_by)?.display_name || getMemberById(updatedRow.creator_id)?.display_name || '家人';
              const actorAvatar = (isFreshUpdater && recentUpdater.updaterAvatar) || getMemberById(updatedRow.paid_by)?.avatar_url || '✏️';
              const cat = getCategoryById(updatedRow.category_id);
              const isIncome = updatedRow.type === 'income';
              const amountStr = Number(updatedRow.amount).toLocaleString();
              const displayDetail = [parsedMerchant ? `[${parsedMerchant}]` : '', parsedNote || ''].filter(Boolean).join(' ');

              setLiveToast({
                id: `update-${updatedRow.id}-${Date.now()}`,
                type: 'update',
                actorName,
                avatar: actorAvatar,
                title: `✏️ ${actorName} 更新了帳目`,
                message: `${cat.icon} ${cat.name} ${isIncome ? '+' : '-'}NT$ ${amountStr}${displayDetail ? ` (${displayDetail})` : ''}`,
                amount: Number(updatedRow.amount),
                createdAt: Date.now(),
              });
            }
          }
        }
      )
      .on(
        'broadcast',
        { event: 'TX_UPDATED' },
        (payload: any) => {
          const data = payload?.payload;
          if (!data || !data.id || !data.updaterId) return;
          recentUpdatersRef.current.set(data.id, {
            updaterId: data.updaterId,
            updaterName: data.updaterName || '家人',
            updaterAvatar: data.updaterAvatar || '✏️',
            timestamp: Date.now(),
          });
        }
      )
      .on(
        'broadcast',
        { event: 'TX_MEMO_TOGGLED' },
        async (payload: any) => {
          const data = payload?.payload;
          if (!data || !data.id) return;
          const { id, is_settled, actorId, actorName, completed_by } = data;
          const myId = currentUserRef.current?.id;
          if (myId && actorId === myId) return;

          let targetNote = '';
          setTransactions((prev) => {
            const target = prev.find((t) => t.id === id);
            if (!target) return prev;
            targetNote = target.note || '';
            const updated = prev.map((t) =>
              t.id === id
                ? {
                    ...t,
                    is_settled,
                    completed_by: is_settled ? (completed_by || actorId) : undefined,
                  }
                : t
            );
            AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(updated));
            AsyncStorage.setItem(`${STORAGE_KEYS.TRANSACTIONS}_${ledgerId}`, JSON.stringify(updated));
            return updated;
          });

          const completerName = actorName || '家人';
          const memoData = parseMemoNote(targetNote);
          if (is_settled) {
            if (shouldShowToast(id, 'done')) {
              setLiveToast({
                id: `memo-done-${id}-${Date.now()}`,
                type: 'complete',
                actorName: completerName,
                avatar: '✓',
                title: `✓ ${completerName} 辦妥了一項待辦！`,
                message: `[${memoData.title}] ${memoData.cleanContent}`,
                createdAt: Date.now(),
              });
            }
          } else {
            if (shouldShowToast(id, 'reopen')) {
              setLiveToast({
                id: `memo-reopen-${id}-${Date.now()}`,
                type: 'update',
                actorName: completerName,
                avatar: '⚪',
                title: `⚪ ${completerName} 重新開啟了待辦事項`,
                message: `[${memoData.title}] ${memoData.cleanContent}`,
                createdAt: Date.now(),
              });
            }
          }
        }
      )
      .on(
        'broadcast',
        { event: 'TX_DELETED' },
        async (payload: any) => {
          const deletedId = payload?.payload?.id;
          const actorName = payload?.payload?.actorName || '家人';
          if (!deletedId) return;

          deletedTxIdsRef.current.add(deletedId);
          try {
            const deletedKey = `${STORAGE_KEYS.DELETED_TX_IDS}_${ledgerId}`;
            const savedDeletedStr = await AsyncStorage.getItem(deletedKey);
            const deletedList: string[] = savedDeletedStr ? JSON.parse(savedDeletedStr) : [];
            if (!deletedList.includes(deletedId)) {
              deletedList.push(deletedId);
              if (deletedList.length > 500) deletedList.shift();
              await AsyncStorage.setItem(deletedKey, JSON.stringify(deletedList));
            }
          } catch {}

          setTransactions((prev) => {
            if (!prev.some((t) => t.id === deletedId)) return prev;
            const updated = prev.filter((t) => t.id !== deletedId);
            AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(updated));
            AsyncStorage.setItem(`${STORAGE_KEYS.TRANSACTIONS}_${ledgerId}`, JSON.stringify(updated));
            return updated;
          });

          // 方案 A：即時通知泡泡
          setLiveToast({
            id: `delete-${deletedId}-${Date.now()}`,
            type: 'delete',
            actorName,
            avatar: '🗑️',
            title: `🗑️ ${actorName} 刪除了一筆記帳`,
            message: '該筆明細已從全體裝置同步移除',
            createdAt: Date.now(),
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'transactions',
        },
        async (payload) => {
          const oldRow = payload.old as any;
          const deletedId = oldRow?.id;
          if (deletedId) {
            deletedTxIdsRef.current.add(deletedId);
            try {
              const deletedKey = `${STORAGE_KEYS.DELETED_TX_IDS}_${ledgerId}`;
              const savedDeletedStr = await AsyncStorage.getItem(deletedKey);
              const deletedList: string[] = savedDeletedStr ? JSON.parse(savedDeletedStr) : [];
              if (!deletedList.includes(deletedId)) {
                deletedList.push(deletedId);
                if (deletedList.length > 500) deletedList.shift();
                await AsyncStorage.setItem(deletedKey, JSON.stringify(deletedList));
              }
            } catch {}

            setTransactions((prev) => {
              if (!prev.some((t) => t.id === deletedId)) return prev;
              const updated = prev.filter((t) => t.id !== deletedId);
              AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(updated));
              AsyncStorage.setItem(`${STORAGE_KEYS.TRANSACTIONS}_${ledgerId}`, JSON.stringify(updated));
              return updated;
            });

            // 方案 A：即時通知泡泡
            setLiveToast({
              id: `delete-${deletedId}-${Date.now()}`,
              type: 'delete',
              actorName: '家人',
              avatar: '🗑️',
              title: '🗑️ 家人刪除了一筆記帳',
              message: '該筆明細已從全體裝置同步移除',
              createdAt: Date.now(),
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ledger_members',
          filter: `ledger_id=eq.${ledgerId}`,
        },
        async (payload: any) => {
          // 當有成員變動（如角色升降級、新增或刪除成員）時，即時推播刷新全體成員名單
          try {
            if (payload?.eventType === 'DELETE') {
              const deletedUserId = payload.old?.user_id;
              const { data: { session } } = await supabase.auth.getSession();
              const myAuthId = session?.user?.id;
              if (deletedUserId && myAuthId && deletedUserId === myAuthId) {
                // 本機裝置已被管理員移出帳本！清理本地資料回到首頁
                await leaveCurrentLedger();
                alert('您已被管理員移出此帳本');
                return;
              }

              // 其他成員被刪除：立刻從本地狀態中移除，所有手機畫面同步更新
              if (deletedUserId) {
                setMembers((prev) => {
                  const updated = prev.filter((m) => m.id !== deletedUserId);
                  AsyncStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(updated));
                  AsyncStorage.setItem(`${STORAGE_KEYS.MEMBERS}_${ledgerId}`, JSON.stringify(updated));
                  return updated;
                });
              }
            }

            const { data: memberRows } = await supabase
              .from('ledger_members')
              .select('user_id, role, profiles(*)')
              .eq('ledger_id', ledgerId);

            if (memberRows && memberRows.length > 0) {
              const loadedMembers: Profile[] = memberRows
                .map((r: any) => {
                  if (!r.profiles) return null;
                  const isThisCreator = currentLedger.created_by === r.user_id;
                  return {
                    ...r.profiles,
                    role: isThisCreator ? 'owner' : (r.role || 'member'),
                  };
                })
                .filter(Boolean);

              setRawMembers(loadedMembers);
              const dedupedMembers = deduplicateMembers(loadedMembers);
              const updatedAliasMap = buildMemberAliasMap(dedupedMembers, loadedMembers);
              setMemberAliasMap(updatedAliasMap);
              await AsyncStorage.setItem(STORAGE_KEYS.ALIAS_MAP, JSON.stringify(updatedAliasMap));
              await AsyncStorage.setItem(`${STORAGE_KEYS.ALIAS_MAP}_${ledgerId}`, JSON.stringify(updatedAliasMap));

              if (dedupedMembers.length > 0) {
                setMembers(dedupedMembers);
                await AsyncStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(dedupedMembers));
                await AsyncStorage.setItem(`${STORAGE_KEYS.MEMBERS}_${ledgerId}`, JSON.stringify(dedupedMembers));
              }

              // 即時同步本機使用者之角色權限 (跨裝置同名身分自動對齊)
              const { data: { session } } = await supabase.auth.getSession();
              const myAuthId = session?.user?.id;
              if (myAuthId) {
                const myRow = memberRows.find((r: any) => r.user_id === myAuthId);
                const myName = ((myRow?.profiles as any)?.display_name || currentUser.display_name || '').trim().toLowerCase();
                const creatorRow = memberRows.find((r: any) => r.user_id === currentLedger.created_by);
                const creatorName = ((creatorRow?.profiles as any)?.display_name || '').trim().toLowerCase();
                const isMeCreator = currentLedger.created_by === myAuthId || Boolean(creatorName && myName && creatorName === myName);
                const hasAdminByName = memberRows.some((r: any) => {
                  const rName = ((r.profiles as any)?.display_name || '').trim().toLowerCase();
                  return (r.role === 'owner' || r.role === 'admin' || r.user_id === currentLedger.created_by) && rName && rName === myName;
                });
                const isMeAdmin = isMeCreator || hasAdminByName || (myRow?.role === 'owner' || myRow?.role === 'admin');
                const newRole = isMeAdmin ? 'owner' : ((myRow?.role as 'owner' | 'admin' | 'member') || 'member');
                setUserRole(newRole);
                await AsyncStorage.setItem(STORAGE_KEYS.USER_ROLE, newRole);
              }
            }
          } catch (err) {
            console.warn('Realtime 刷新成員名冊失敗:', err);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
        },
        async () => {
          // 當有成員資料（如大頭貼或暱稱）變更時，刷新成員名單
          try {
            const { data: memberRows } = await supabase
              .from('ledger_members')
              .select('user_id, role, profiles(*)')
              .eq('ledger_id', ledgerId);

            if (memberRows && memberRows.length > 0) {
              const loadedMembers: Profile[] = memberRows
                .map((r: any) => {
                  if (!r.profiles) return null;
                  const isThisCreator = currentLedger.created_by === r.user_id;
                  return {
                    ...r.profiles,
                    role: isThisCreator ? 'owner' : (r.role || 'member'),
                  };
                })
                .filter(Boolean);

              setRawMembers(loadedMembers);
              const dedupedMembers = deduplicateMembers(loadedMembers);
              const updatedAliasMap = buildMemberAliasMap(dedupedMembers, loadedMembers);
              setMemberAliasMap(updatedAliasMap);
              await AsyncStorage.setItem(STORAGE_KEYS.ALIAS_MAP, JSON.stringify(updatedAliasMap));
              await AsyncStorage.setItem(`${STORAGE_KEYS.ALIAS_MAP}_${ledgerId}`, JSON.stringify(updatedAliasMap));

              if (dedupedMembers.length > 0) {
                setMembers(dedupedMembers);
                await AsyncStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(dedupedMembers));
                await AsyncStorage.setItem(`${STORAGE_KEYS.MEMBERS}_${ledgerId}`, JSON.stringify(dedupedMembers));
              }
            }
          } catch (err) {
            console.warn('Realtime 依 Profile 刷新成員失敗:', err);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'categories',
        },
        async () => {
          // 當有分類被新增、修改或刪除時，即時重整全體成員的手機分類清單
          try {
            const { data: catRows } = await supabase
              .from('categories')
              .select('*')
              .or(`ledger_id.eq.${ledgerId},ledger_id.is.null`)
              .order('sort_order', { ascending: true });

            if (catRows && catRows.length > 0) {
              setCategories(catRows);
              AsyncStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(catRows));
              AsyncStorage.setItem(`${STORAGE_KEYS.CATEGORIES}_${ledgerId}`, JSON.stringify(catRows));
            }
          } catch (err) {
            console.warn('Realtime 刷新分類失敗:', err);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payment_accounts',
          filter: `ledger_id=eq.${ledgerId}`,
        },
        async () => {
          // 當卡片被新增、更新或餘額變更時，即時更新全體裝置
          try {
            const { data: accRows } = await supabase
              .from('payment_accounts')
              .select('*')
              .eq('ledger_id', ledgerId)
              .order('sort_order', { ascending: true });

            if (accRows) {
              setPaymentAccounts(accRows);
              AsyncStorage.setItem(STORAGE_KEYS.PAYMENT_ACCOUNTS, JSON.stringify(accRows));
              AsyncStorage.setItem(`${STORAGE_KEYS.PAYMENT_ACCOUNTS}_${ledgerId}`, JSON.stringify(accRows));
            }
          } catch (err) {
            console.warn('Realtime 刷新卡片帳戶失敗:', err);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payment_methods',
          filter: `ledger_id=eq.${ledgerId}`,
        },
        async () => {
          // 當管理員新增、編輯或刪除自訂付款方式時，即時推播至全體家庭成員
          try {
            const { data: cloudMethods } = await supabase
              .from('payment_methods')
              .select('*')
              .eq('ledger_id', ledgerId);

            if (cloudMethods !== null) {
              const methodLedgerKey = `${STORAGE_KEYS.PAYMENT_METHODS}_${ledgerId}`;
              const savedMethodsStr = (await AsyncStorage.getItem(methodLedgerKey)) || (await AsyncStorage.getItem(STORAGE_KEYS.PAYMENT_METHODS));
              let localSaved: CustomPaymentMethod[] = [];
              if (savedMethodsStr) {
                try { localSaved = JSON.parse(savedMethodsStr); } catch {}
              }

              const allDefs: CustomPaymentMethod[] = [
                ...DEFAULT_PAYMENT_METHODS,
                ...(cloudMethods || []).map((cm: any) => ({
                  id: cm.id,
                  ledger_id: ledgerId,
                  name: cm.name,
                  icon: cm.icon || '📱',
                  color: cm.color || '#0055B8',
                  type: cm.type || 'e_wallet',
                  supports_credit_card: !!cm.supports_credit_card,
                  is_enabled: true,
                  is_system: false,
                  sort_order: cm.sort_order || 99,
                  created_at: cm.created_at,
                })),
              ];

              const merged = mergePaymentMethods(allDefs, localSaved);
              setPaymentMethods(merged);
              await AsyncStorage.setItem(STORAGE_KEYS.PAYMENT_METHODS, JSON.stringify(merged));
              await AsyncStorage.setItem(methodLedgerKey, JSON.stringify(merged));
            }
          } catch (err) {
            console.warn('Realtime 刷新付款方式失敗:', err);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'recurring_rules',
          filter: `ledger_id=eq.${ledgerId}`,
        },
        async () => {
          try {
            const { data: ruleRows } = await supabase
              .from('recurring_rules')
              .select('*')
              .eq('ledger_id', ledgerId)
              .order('created_at', { ascending: false });

            if (ruleRows && Array.isArray(ruleRows)) {
              setRecurringRules(ruleRows);
              AsyncStorage.setItem(`${STORAGE_KEYS.RECURRING_RULES}_${ledgerId}`, JSON.stringify(ruleRows));
            }
          } catch (err) {
            console.warn('Realtime 刷新週期扣款規則失敗:', err);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'member_devices',
          filter: `ledger_id=eq.${ledgerId}`,
        },
        async () => {
          try {
            const { data: devRows } = await supabase
              .from('member_devices')
              .select('*')
              .eq('ledger_id', ledgerId)
              .order('last_active_at', { ascending: false });

            if (devRows && Array.isArray(devRows)) {
              setMemberDevices(devRows as MemberDevice[]);
              AsyncStorage.setItem(`${STORAGE_KEYS.MEMBER_DEVICES}_${ledgerId}`, JSON.stringify(devRows)).catch(() => {});
            }
          } catch (err) {
            console.warn('Realtime 刷新成員裝置失敗:', err);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsCloudSynced(true);
        }
      });

    channelRef.current = channel;
  };

  // 讀取指定帳本的成員連線裝置清單
  const fetchMemberDevices = async (targetLedgerId?: string, targetMemberId?: string) => {
    const lId = targetLedgerId || currentLedger.id;
    if (!lId || lId === DEMO_LEDGER_ID) return;

    const devId = await getDeviceId();
    setCurrentDeviceId(devId);
    const devName = getDeviceName();
    const platform = getDevicePlatform();
    const mId = targetMemberId || effectiveCurrentUser?.id || currentUser.id;

    const myDev: MemberDevice = {
      id: devId,
      ledger_id: lId,
      member_id: mId,
      device_id: devId,
      device_name: devName,
      platform,
      app_version: APP_FULL_VERSION,
      last_active_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    if (isConfigured && lId !== DEMO_LEDGER_ID) {
      try {
        const { data, error } = await supabase
          .from('member_devices')
          .select('*')
          .eq('ledger_id', lId)
          .order('last_active_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          // 確保本機裝置必定在清單中（若雲端推播延遲或新裝置剛加入）
          const hasMe = data.some(d => d.device_id === devId);
          const combined = hasMe ? data : [myDev, ...data];
          setMemberDevices(combined as MemberDevice[]);
          await AsyncStorage.setItem(`${STORAGE_KEYS.MEMBER_DEVICES}_${lId}`, JSON.stringify(combined));
          return;
        }
      } catch (e) {
        console.warn('讀取雲端成員裝置清單失敗（若尚未執行 migration 屬正常現象）:', e);
      }
    }

    // 若為示範帳本或雲端讀取失敗，自本地快取恢復，並確保本機設備在內
    try {
      const cachedStr = await AsyncStorage.getItem(`${STORAGE_KEYS.MEMBER_DEVICES}_${lId}`);
      let cachedList: MemberDevice[] = [];
      if (cachedStr) {
        try { cachedList = JSON.parse(cachedStr); } catch {}
      }
      const hasMe = cachedList.some(d => d.device_id === devId);
      const combined = hasMe ? cachedList : [myDev, ...cachedList];
      setMemberDevices(combined);
    } catch {}
  };

  // 登記本機裝置連線與心跳時間
  const registerDevice = async (targetMemberId?: string, targetLedgerId?: string) => {
    try {
      const devId = await getDeviceId();
      setCurrentDeviceId(devId);
      const devName = getDeviceName();
      const platform = getDevicePlatform();
      const lId = targetLedgerId || currentLedger.id;
      const mId = targetMemberId || effectiveCurrentUser?.id || currentUser.id;

      if (!lId || lId === DEMO_LEDGER_ID) return;

      const nowIso = new Date().toISOString();
      const myDev: MemberDevice = {
        id: devId,
        ledger_id: lId,
        member_id: mId,
        device_id: devId,
        device_name: devName,
        platform,
        app_version: APP_FULL_VERSION,
        last_active_at: nowIso,
        created_at: nowIso,
      };

      // 1. 立即更新本機狀態保底（確保無延遲呈現本機設備）
      setMemberDevices(prev => {
        const remaining = prev.filter(d => !(d.device_id === devId && d.ledger_id === lId));
        const next = [myDev, ...remaining];
        AsyncStorage.setItem(`${STORAGE_KEYS.MEMBER_DEVICES}_${lId}`, JSON.stringify(next)).catch(() => {});
        return next;
      });

      // 2. 雲端同步
      if (isConfigured && lId !== DEMO_LEDGER_ID) {
        try {
          const { error } = await supabase.from('member_devices').upsert({
            ledger_id: lId,
            member_id: mId,
            device_id: devId,
            device_name: devName,
            platform,
            app_version: APP_FULL_VERSION,
            last_active_at: nowIso,
          }, { onConflict: 'ledger_id,device_id' });

          if (!error) {
            const { data: cloudData } = await supabase
              .from('member_devices')
              .select('*')
              .eq('ledger_id', lId)
              .order('last_active_at', { ascending: false });

            if (cloudData && Array.isArray(cloudData)) {
              const hasMe = cloudData.some(d => d.device_id === devId);
              const combined = hasMe ? cloudData : [myDev, ...cloudData];
              setMemberDevices(combined as MemberDevice[]);
              await AsyncStorage.setItem(`${STORAGE_KEYS.MEMBER_DEVICES}_${lId}`, JSON.stringify(combined));
            }
          } else {
            console.warn('雲端登記裝置心跳回應 (若尚未執行 migration 屬正常現象):', error.message);
          }
        } catch (e) {
          console.warn('登記裝置心跳失敗（若尚未執行 migration 屬正常現象）:', e);
        }
      }
    } catch (err) {
      console.warn('本機登記裝置發生異常:', err);
    }
  };

  // 解除指定裝置的綁定
  const removeDevice = async (targetDeviceId: string): Promise<boolean> => {
    try {
      const lId = currentLedger.id;
      if (isConfigured && lId !== DEMO_LEDGER_ID) {
        try {
          await supabase
            .from('member_devices')
            .delete()
            .eq('ledger_id', lId)
            .eq('device_id', targetDeviceId);
        } catch (e) {
          console.warn('雲端刪除成員裝置失敗:', e);
        }
      }
      setMemberDevices(prev => {
        const next = prev.filter(d => d.device_id !== targetDeviceId);
        AsyncStorage.setItem(`${STORAGE_KEYS.MEMBER_DEVICES}_${lId}`, JSON.stringify(next)).catch(() => {});
        return next;
      });
      return true;
    } catch (e) {
      console.warn('移除裝置失敗:', e);
      return false;
    }
  };

  // ==============================================================================
  // Google 帳號綁定與身分電子鎖 (Phase 2)
  // ==============================================================================
  const isCurrentUserLocked = Boolean(currentUser?.is_locked);

  const linkGoogleAccount = async (
    targetProfileId?: string,
    actionType: 'bind_google' | 'claim' = 'bind_google'
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      if (!isConfigured) {
        return { success: false, message: '目前為示範或離線模式，無法進行 Google 帳號綁定。' };
      }

      const targetId = targetProfileId || currentUser.id;
      const targetMember = members.find(m => m.id === targetId) || currentUser;

      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.location) {
          const redirectUrl = `${window.location.origin}${window.location.pathname}?action=${actionType}&profile_id=${targetId}&ledger_id=${currentLedger.id}&display_name=${encodeURIComponent(targetMember.display_name)}`;
          const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: redirectUrl,
            },
          });
          if (error) {
            return { success: false, message: error.message };
          }
          return { success: true };
        }
      } else {
        // 行動端（Android / iOS）：開啟系統瀏覽器完成 Google 授權
        const redirectUrl = `https://mattyu99.github.io/family-ledger/auth-callback.html?action=${actionType}&profile_id=${targetId}&ledger_id=${currentLedger.id}&display_name=${encodeURIComponent(targetMember.display_name)}`;
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirectUrl,
            skipBrowserRedirect: true,
          },
        });
        if (error) {
          return { success: false, message: error.message };
        }
        if (data?.url) {
          await Linking.openURL(data.url);
          return { success: true, message: '已開啟瀏覽器進行 Google 授權，請在授權完成後返回 APP' };
        }
      }
      return { success: false, message: '未能取得 Google 授權轉跳網址' };
    } catch (err: any) {
      console.warn('發起 Google 帳號授權失敗:', err);
      return { success: false, message: err?.message || '授權失敗' };
    }
  };

  const unlinkGoogleAccount = async (targetProfileId?: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const targetId = targetProfileId || currentUser.id;
      const targetMember = members.find(m => m.id === targetId) || currentUser;

      if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
        try {
          await supabase.from('profiles').update({
            auth_email: null,
            auth_provider: null,
            is_locked: false,
            claim_code: null,
            claim_code_expires_at: null,
            updated_at: new Date().toISOString(),
          }).eq('id', targetId);
        } catch (e) {
          console.warn('雲端解除綁定更新失敗:', e);
        }
      }

      const updatedUser: Profile = {
        ...currentUser,
        auth_email: undefined,
        auth_provider: null,
        is_locked: false,
      };

      if (currentUser.id === targetId) {
        setCurrentUser(updatedUser);
        await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(updatedUser));
        if (currentLedger?.id) {
          await AsyncStorage.setItem(`${STORAGE_KEYS.CURRENT_USER}_${currentLedger.id}`, JSON.stringify(updatedUser));
        }
      }

      setMembers(prev => prev.map(m => m.id === targetId ? {
        ...m,
        auth_email: undefined,
        auth_provider: null,
        is_locked: false,
      } : m));

      triggerLiveToast({
        id: `auth-${Date.now()}`,
        type: 'info',
        actorName: '帳號安全',
        avatar: '🛡️',
        title: '已解除 Google 綁定',
        message: `稱謂【${targetMember.display_name}】已恢復為訪客模式`,
        createdAt: Date.now(),
      });

      return { success: true };
    } catch (err: any) {
      console.warn('解除 Google 綁定失敗:', err);
      return { success: false, message: err?.message || '解除失敗' };
    }
  };

  const claimGoogleIdentity = async (codeOrEmail: string): Promise<{ success: boolean; message?: string; profile?: Profile }> => {
    const clean = (codeOrEmail || '').trim();
    if (!clean) return { success: false, message: '請輸入有效的 Google Email 或 6 位數認領驗證碼' };

    try {
      if (!isConfigured) {
        return { success: false, message: '雲端資料庫未連線，無法認領身分' };
      }

      // 查詢受鎖定保護之成員
      let query = supabase.from('profiles').select('*').eq('is_locked', true);
      if (clean.includes('@')) {
        query = query.eq('auth_email', clean.toLowerCase());
      } else {
        query = query.eq('claim_code', clean);
      }

      const { data: matchedProfiles, error } = await query;
      if (error || !matchedProfiles || matchedProfiles.length === 0) {
        return { success: false, message: '找不到符合且受保護的 Google 身分稱謂，請確認輸入是否正確' };
      }

      const matched = matchedProfiles[0] as Profile;

      // 驗證碼時效性檢驗
      if (!clean.includes('@') && (matched as any).claim_code_expires_at) {
        const expiresAt = new Date((matched as any).claim_code_expires_at).getTime();
        if (Date.now() > expiresAt) {
          return { success: false, message: '驗證碼已過期（超過 10 分鐘），請重新驗證 Google 登入以獲取新驗證碼' };
        }
      }

      // 登錄當前裝置到該成員
      await registerDevice(matched.id, currentLedger.id);

      // 清除已使用之驗證碼
      if (!clean.includes('@')) {
        await supabase.from('profiles').update({
          claim_code: null,
          claim_code_expires_at: null,
          updated_at: new Date().toISOString(),
        }).eq('id', matched.id);
      }

      // 更新本機身分
      setCurrentUser(matched);
      await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(matched));
      if (currentLedger?.id) {
        await AsyncStorage.setItem(`${STORAGE_KEYS.CURRENT_USER}_${currentLedger.id}`, JSON.stringify(matched));
      }

      if (matched.auth_email) {
        setIsGoogleAuthenticated(true);
        setGoogleUserEmail(matched.auth_email);
        await AsyncStorage.setItem('@family_ledger_google_email', matched.auth_email);
      }

      // 若該成員具備管理員權限，同步提升本地身分角色
      if (matched.role === 'owner' || matched.role === 'admin' || currentLedger.created_by === matched.id) {
        const targetRole = matched.role === 'owner' || matched.role === 'admin' ? matched.role : 'owner';
        setUserRole(targetRole);
        await AsyncStorage.setItem(STORAGE_KEYS.USER_ROLE, targetRole);
      }

      await initLedger();
      await refreshLedger();

      triggerLiveToast({
        id: `auth-claim-${Date.now()}`,
        type: 'complete',
        actorName: matched.display_name,
        avatar: matched.avatar_url || '🔑',
        title: '🎉 身分認領成功！',
        message: `已成功恢復為【${matched.display_name}】(${matched.auth_email || '受保護'})`,
        createdAt: Date.now(),
      });

      return { success: true, profile: matched };
    } catch (err: any) {
      console.warn('身分認領過程發生異常:', err);
      return { success: false, message: err?.message || '認領身分失敗' };
    }
  };

  // 輔助函式：載入指定帳本的完整資料 (分類、成員、交易、即時推播)
  const loadLedgerData = async (targetLedger: Ledger, authUserId: string) => {
    setCurrentLedger(targetLedger);

    // (A-pre) 方案 C：本地快取秒開搶先渲染 (Local-First Optimistic Preload)
    // 0.05 秒內搶先灌入本機快取明細，徹底消除切換海量帳本時的漫長白畫面或卡頓等待
    let hasLocalCache = false;
    let localCachedTransactions: Transaction[] = [];
    try {
      const savedTxStr = (await AsyncStorage.getItem(`${STORAGE_KEYS.TRANSACTIONS}_${targetLedger.id}`)) ||
                         (await AsyncStorage.getItem(STORAGE_KEYS.TRANSACTIONS));
      if (savedTxStr) {
        const parsed = JSON.parse(savedTxStr);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const matching = parsed.filter((t: any) => t && t.ledger_id === targetLedger.id);
          if (matching.length > 0) {
            hasLocalCache = true;
            localCachedTransactions = matching;
            setTransactions(matching);
          }
        }
      }
    } catch {}

    // 僅清除非當前目標帳本之規則；若為同帳本重整則保留現有快取，避免雲端載入期間「待繳」橫條短暫消失閃爍
    setRecurringRules(prev => prev.filter(r => r.ledger_id === targetLedger.id));
    try {
      const cachedRulesStr = await AsyncStorage.getItem(`${STORAGE_KEYS.RECURRING_RULES}_${targetLedger.id}`);
      if (cachedRulesStr) {
        const parsed = JSON.parse(cachedRulesStr);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((r: any) => r.ledger_id === targetLedger.id);
          if (valid.length > 0) {
            setRecurringRules(valid);
          }
        }
      }
    } catch {}
    await AsyncStorage.setItem(STORAGE_KEYS.LEDGER, JSON.stringify(targetLedger));

    // 記錄當前帳本最後造訪時間，並消除本機該帳本的未讀紅點標記
    const nowIso = new Date().toISOString();
    await AsyncStorage.setItem(`${STORAGE_KEYS.LAST_VISITED_PREFIX}${targetLedger.id}`, nowIso);
    setUnreadLedgerMap(prev => {
      if (!prev[targetLedger.id]) return prev;
      const next = { ...prev };
      delete next[targetLedger.id];
      return next;
    });

    // 檢查此帳本是否開啟唯讀封存保護與門禁安全鎖
    try {
      const savedReadOnly = await AsyncStorage.getItem(`${STORAGE_KEYS.LEDGER_READ_ONLY}_${targetLedger.id}`);
      if (savedReadOnly === 'true' || targetLedger.is_read_only) {
        targetLedger = { ...targetLedger, is_read_only: true };
      }
      const savedAllowNewMembers = await AsyncStorage.getItem(`${STORAGE_KEYS.LEDGER_ALLOW_NEW_MEMBERS}_${targetLedger.id}`);
      if (savedAllowNewMembers !== null) {
        targetLedger = { ...targetLedger, allow_new_members: savedAllowNewMembers === 'true' };
      }
    } catch {}

    // (A-0) 載入帳本最新雲端資訊 (created_by, admin_pin, is_read_only, allow_new_members 等)
    if (isConfigured && targetLedger.id !== DEMO_LEDGER_ID) {
      try {
        const { data: lData } = await supabase
          .from('ledgers')
          .select('*')
          .eq('id', targetLedger.id)
          .maybeSingle();
        if (lData) {
          if (lData.admin_pin) {
            setAdminPin(lData.admin_pin);
            await AsyncStorage.setItem(STORAGE_KEYS.ADMIN_PIN, lData.admin_pin);
            await AsyncStorage.setItem(`${STORAGE_KEYS.ADMIN_PIN}_${targetLedger.id}`, lData.admin_pin);
          }
          let needsUpdate = false;
          const cloudReadOnly = Boolean(lData.is_read_only || lData.description?.includes('[READ_ONLY]'));
          if (cloudReadOnly !== Boolean(targetLedger.is_read_only)) {
            targetLedger = { ...targetLedger, is_read_only: cloudReadOnly };
            await AsyncStorage.setItem(`${STORAGE_KEYS.LEDGER_READ_ONLY}_${targetLedger.id}`, String(cloudReadOnly));
            needsUpdate = true;
          }
          if (lData.allow_new_members !== undefined && lData.allow_new_members !== targetLedger.allow_new_members) {
            targetLedger = { ...targetLedger, allow_new_members: lData.allow_new_members };
            await AsyncStorage.setItem(`${STORAGE_KEYS.LEDGER_ALLOW_NEW_MEMBERS}_${targetLedger.id}`, String(lData.allow_new_members));
            needsUpdate = true;
          }
          if (lData.created_by && lData.created_by !== targetLedger.created_by) {
            targetLedger = { ...targetLedger, ...lData };
            needsUpdate = true;
          }
          if (needsUpdate) {
            setCurrentLedger(targetLedger);
            await AsyncStorage.setItem(STORAGE_KEYS.LEDGER, JSON.stringify(targetLedger));
          }
        }
      } catch (e) {
        console.warn('載入帳本最新雲端資訊失敗:', e);
      }
    }

    // (A) 載入或獲取邀請碼
    const { data: inviteRows } = await supabase
      .from('ledger_invites')
      .select('invite_code')
      .eq('ledger_id', targetLedger.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (inviteRows && inviteRows.length > 0 && inviteRows[0].invite_code) {
      setInviteCode(inviteRows[0].invite_code);
      await AsyncStorage.setItem(STORAGE_KEYS.INVITE_CODE, inviteRows[0].invite_code);
    } else {
      const fallbackCode = 'FAM-' + (targetLedger.id ? targetLedger.id.replace(/-/g, '').slice(0, 4).toUpperCase() : '8823');
      setInviteCode(fallbackCode);
      await AsyncStorage.setItem(STORAGE_KEYS.INVITE_CODE, fallbackCode);
      if (isConfigured && targetLedger.id !== DEMO_LEDGER_ID) {
        await supabase.from('ledger_invites').upsert({
          ledger_id: targetLedger.id,
          invite_code: fallbackCode,
          created_by: authUserId,
          expires_at: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
        }, { onConflict: 'ledger_id,invite_code' });
      }
    }

    // (B) 載入分類表
    const { data: catRows } = await supabase
      .from('categories')
      .select('*')
      .or(`ledger_id.eq.${targetLedger.id},ledger_id.is.null`)
      .order('sort_order', { ascending: true });

    if (catRows && catRows.length > 0) {
      let finalCats = [...catRows];
      const hasAllowance = finalCats.some(c => c.type === 'income' && (c.name.includes('零用') || c.name === '零用錢'));
      if (!hasAllowance && isConfigured && targetLedger.id !== DEMO_LEDGER_ID) {
        const allowanceCat = {
          id: generateUUID(),
          ledger_id: targetLedger.id,
          name: '零用錢',
          icon: '💵',
          color: '#10B981',
          type: 'income' as CategoryType,
          sort_order: (finalCats[finalCats.length - 1]?.sort_order || 9) + 1,
        };
        try {
          supabase.from('categories').insert(allowanceCat).then(({ error }) => {
            if (error) console.warn('自動同步零用錢分類失敗:', error.message);
          });
          finalCats.push(allowanceCat);
        } catch {}
      } else if (!hasAllowance) {
        const defaultAllowance = DEFAULT_CATEGORIES.find(c => c.name === '零用錢');
        if (defaultAllowance) finalCats.push(defaultAllowance);
      }
      setCategories(finalCats);
      await AsyncStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(finalCats));
      await AsyncStorage.setItem(`${STORAGE_KEYS.CATEGORIES}_${targetLedger.id}`, JSON.stringify(finalCats));
    } else {
      const catsToInsert = DEFAULT_CATEGORIES.map(c => ({
        id: generateUUID(),
        ledger_id: targetLedger.id,
        name: c.name,
        icon: c.icon,
        color: c.color,
        type: c.type,
        sort_order: c.sort_order,
      }));
      await supabase.from('categories').insert(catsToInsert);
      setCategories(catsToInsert);
      await AsyncStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(catsToInsert));
      await AsyncStorage.setItem(`${STORAGE_KEYS.CATEGORIES}_${targetLedger.id}`, JSON.stringify(catsToInsert));
    }

    // (C) 載入全體家庭成員
    const { data: memberRows } = await supabase
      .from('ledger_members')
      .select('user_id, role, profiles(*)')
      .eq('ledger_id', targetLedger.id);

    let loadedMembers: Profile[] = [];
    if (memberRows && memberRows.length > 0) {
      loadedMembers = memberRows
        .map((r: any) => {
          if (!r.profiles) return null;
          const isThisCreator = targetLedger.created_by === r.user_id;
          return {
            ...r.profiles,
            role: isThisCreator ? 'owner' : (r.role || 'member'),
          };
        })
        .filter(Boolean);

      // deduplicateMembers 會在記憶體中自動整併 Google OAuth 影子紀錄至受保護稱謂（如「倉鼠」或「智爸」），名冊呈現始終純淨
    }

    // 若雲端已有成員，以雲端為準；離線時僅在本地記憶體中載入快取，絕不盲目向雲端 insert 避免跨帳本身分污染
    if (loadedMembers.length === 0 && targetLedger.id !== DEMO_LEDGER_ID) {
      const localSavedMembersStr = await AsyncStorage.getItem(`${STORAGE_KEYS.MEMBERS}_${targetLedger.id}`);
      if (localSavedMembersStr) {
        try {
          const localMembers: Profile[] = JSON.parse(localSavedMembersStr);
          const validLocals = localMembers.filter(lm =>
            isValidUUID(lm.id) &&
            !lm.id.startsWith('20000000-0000-4000-8000') &&
            lm.id !== '9b017d89-b21f-4638-b076-5a7629e2dda5' &&
            lm.id !== 'e6a2d1ec-3b2a-495f-b24e-71c2647d9a86' &&
            (lm.display_name || '').trim() !== '寶可夢'
          );
          if (validLocals.length > 0) {
            loadedMembers = validLocals;
          }
        } catch (err) {
          console.warn('解析本地成員快取失敗:', err);
        }
      }
    }

    // 讀取本地針對此帳本所記錄之專屬身分稱謂
    const savedLedgerUserStr = await AsyncStorage.getItem(`${STORAGE_KEYS.CURRENT_USER}_${targetLedger.id}`);
    let targetSavedUser: Profile | null = null;
    if (savedLedgerUserStr) {
      try { targetSavedUser = JSON.parse(savedLedgerUserStr); } catch {}
    }

    setRawMembers(loadedMembers);
    let dedupedMembers = deduplicateMembers(loadedMembers);
    let aliasMap = buildMemberAliasMap(dedupedMembers, loadedMembers);
    let canonicalMe: Profile | undefined = undefined;

    if (dedupedMembers.length > 0) {
      setMembers(dedupedMembers);
      await AsyncStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(dedupedMembers));
      await AsyncStorage.setItem(`${STORAGE_KEYS.MEMBERS}_${targetLedger.id}`, JSON.stringify(dedupedMembers));

      const myMemberRow = memberRows?.find((r: any) => r.user_id === authUserId);
      const isCreator = targetLedger.created_by === authUserId;
      const myDisplayName = (myMemberRow?.profiles as any)?.display_name;

      // 尋找此裝置對應的成員：
      // 1. 優先查本地為該帳本記憶之專屬成員 (${STORAGE_KEYS.CURRENT_USER}_${targetLedger.id})
      // 2. 其次比對 authUserId 或去重名冊中同名之主要成員
      // 3. 預設名冊首位
      const savedLedgerUserStr = await AsyncStorage.getItem(`${STORAGE_KEYS.CURRENT_USER}_${targetLedger.id}`);
      let targetSavedUser: Profile | null = null;
      if (savedLedgerUserStr) {
        try { targetSavedUser = JSON.parse(savedLedgerUserStr); } catch {}
      }

      // 尋找此裝置對應的成員：
      // 1. 優先查本地為該帳本記憶之專屬成員 (${STORAGE_KEYS.CURRENT_USER}_${targetLedger.id})
      if (targetSavedUser) {
        canonicalMe = dedupedMembers.find(
          m => (isValidUUID(targetSavedUser?.id) && m.id === targetSavedUser?.id) ||
               (targetSavedUser?.display_name && (m.display_name || '').trim().toLowerCase() === targetSavedUser.display_name.trim().toLowerCase())
        );
      }

      // 2. 若尚未找到且使用者具備已綁定之 Google 信箱，優先在此帳本名冊中尋找綁定同信箱的受保護身分（例如在幸福家庭公帳中為「倉鼠」，在其他帳本中為「智爸」）
      const userGoogleEmail = currentUser?.auth_email || targetSavedUser?.auth_email;
      if (!canonicalMe && userGoogleEmail) {
        canonicalMe = dedupedMembers.find(
          m => (m.auth_email || '').trim().toLowerCase() === userGoogleEmail.trim().toLowerCase() &&
               (!m.avatar_url || (!m.avatar_url.startsWith('http://') && !m.avatar_url.startsWith('https://')))
        ) || dedupedMembers.find(
          m => (m.auth_email || '').trim().toLowerCase() === userGoogleEmail.trim().toLowerCase()
        );
      }

      // 3. 若為建立者，對齊建立者 Profile (防止舊版本受污染的本地快取將創建者誤導至其他成員)
      if (!canonicalMe && isCreator) {
        canonicalMe = dedupedMembers.find(m => m.id === authUserId);
      }

      if (!canonicalMe) {
        canonicalMe = dedupedMembers.find(
          m => m.id === authUserId || (myDisplayName && (m.display_name || '').trim().toLowerCase() === myDisplayName.trim().toLowerCase())
        );
      }

      if (!canonicalMe) {
        canonicalMe = dedupedMembers[0];
      }

      // 跨裝置管理員身分統一辨識：
      // 1. 本裝置為建立者 (isCreator)
      // 2. 建立者的稱謂與本成員相同 (isCreatorByName，多裝置匿名帳號對齊)
      // 3. 去重後的統一成員 (canonicalMe) 具備 owner/admin 權限 (例如在 Web 端已恢復權限)
      // 4. 雲端名冊中存在同名紀錄且具備 owner/admin/created_by
      const creatorRow = memberRows?.find((r: any) => r.user_id === targetLedger.created_by);
      const creatorName = ((creatorRow?.profiles as any)?.display_name || '').trim().toLowerCase();
      const myName = (targetSavedUser?.display_name || myDisplayName || canonicalMe?.display_name || '').trim().toLowerCase();
      const isCreatorByName = Boolean(creatorName && myName && creatorName === myName);

      const hasAdminByName = memberRows?.some((r: any) => {
        const rName = ((r.profiles as any)?.display_name || '').trim().toLowerCase();
        return (r.role === 'owner' || r.role === 'admin' || r.user_id === targetLedger.created_by) && rName && rName === myName;
      });

      const isMeCreator = isCreator || isCreatorByName || (canonicalMe ? targetLedger.created_by === canonicalMe.id : false);
      const myRow = memberRows?.find((r: any) => r.user_id === authUserId || (canonicalMe && r.user_id === canonicalMe.id));
      const isMeAdmin = isMeCreator || (canonicalMe ? (canonicalMe.role === 'owner' || canonicalMe.role === 'admin') : false) || Boolean(hasAdminByName);

      let role: 'owner' | 'admin' | 'member' = isMeAdmin
        ? 'owner'
        : ((myRow?.role as 'owner' | 'admin' | 'member') || (canonicalMe?.role as any) || 'member');

      // 0 管理員自癒保護：若雲端帳本全體成員皆無任何管理員 (0 admin)，且本機曾記錄為管理員，自動救援恢復為 owner
      const hasAnyAdminInLedger = dedupedMembers.some(m => m.role === 'owner' || m.role === 'admin' || targetLedger.created_by === m.id);
      const savedLocalRole = await AsyncStorage.getItem(STORAGE_KEYS.USER_ROLE);
      if (!hasAnyAdminInLedger && (savedLocalRole === 'owner' || savedLocalRole === 'admin')) {
        role = 'owner';
      }

      // 若確認身分為管理員，但本機裝置在雲端的 ledger_members 紀錄仍為 member，自動同步升級為 owner (多裝置權限永久對齊)
      if (role === 'owner' && myMemberRow && myMemberRow.role !== 'owner' && isConfigured && targetLedger.id !== DEMO_LEDGER_ID) {
        supabase.from('ledger_members').update({ role: 'owner' }).eq('ledger_id', targetLedger.id).eq('user_id', authUserId).then();
      }

      if (canonicalMe && role === 'owner') {
        canonicalMe.role = 'owner';
        dedupedMembers = dedupedMembers.map(m => m.id === canonicalMe?.id || ((m.display_name || '').trim().toLowerCase() === myName) ? { ...m, role: 'owner' as const } : m);
        setMembers(dedupedMembers);
        AsyncStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(dedupedMembers));
        AsyncStorage.setItem(`${STORAGE_KEYS.MEMBERS}_${targetLedger.id}`, JSON.stringify(dedupedMembers));
      }

      setUserRole(role);
      await AsyncStorage.setItem(STORAGE_KEYS.USER_ROLE, role);

      if (canonicalMe) {
        const activeMe = canonicalMe;
        setCurrentUser(activeMe);
        await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(activeMe));
        await AsyncStorage.setItem(`${STORAGE_KEYS.CURRENT_USER}_${targetLedger.id}`, JSON.stringify(activeMe));
        setLedgers(prev => prev.map(l => l.id === targetLedger.id ? {
          ...l,
          userDisplayName: activeMe.display_name,
          userAvatar: activeMe.avatar_url,
        } : l));
      }

      // 若身為建立者但雲端成員身分被誤設為 member，自動在雲端校正回 owner
      if (isMeCreator && myRow && myRow.role !== 'owner' && isConfigured) {
        supabase
          .from('ledger_members')
          .update({ role: 'owner' })
          .eq('ledger_id', targetLedger.id)
          .eq('user_id', myRow.user_id || authUserId)
          .then();
      }
    }

    // 排除本機已知已刪除之交易 ID（避免極端 Realtime 延遲時短暫重現）
    const deletedKey = `${STORAGE_KEYS.DELETED_TX_IDS}_${targetLedger.id}`;
    let deletedList: string[] = [];
    try {
      const savedDeletedStr = await AsyncStorage.getItem(deletedKey);
      if (savedDeletedStr) deletedList = JSON.parse(savedDeletedStr);
    } catch {}
    const deletedSet = new Set(deletedList);
    deletedList.forEach(id => deletedTxIdsRef.current.add(id));

    // 查詢雲端墓碑表 (Tombstone)，同步全體裝置的刪除名單
    if (isConfigured && targetLedger.id !== DEMO_LEDGER_ID) {
      try {
        const { data: cloudDeletedRows } = await supabase
          .from('deleted_transactions')
          .select('id')
          .eq('ledger_id', targetLedger.id)
          .order('deleted_at', { ascending: false })
          .limit(500);

        if (cloudDeletedRows && cloudDeletedRows.length > 0) {
          cloudDeletedRows.forEach((r: any) => {
            if (r.id) {
              deletedList.push(r.id);
              deletedSet.add(r.id);
              deletedTxIdsRef.current.add(r.id);
            }
          });
          const dedupedDeleted = Array.from(deletedSet).slice(-500);
          await AsyncStorage.setItem(deletedKey, JSON.stringify(dedupedDeleted));
        }
      } catch (e) {
        // 雲端尚未建立 deleted_transactions 表時容錯略過
      }
    }

    // 探測 Supabase transactions 表是否已有 merchant, payment_method 等欄位
    if (isConfigured && targetLedger.id !== DEMO_LEDGER_ID) {
      try {
        const { error: probeErr } = await supabase.from('transactions').select('merchant').limit(1);
        hasMerchantColumnRef.current = !probeErr;
      } catch {
        hasMerchantColumnRef.current = false;
      }
      try {
        const { error: payErr } = await supabase.from('transactions').select('payment_method, account_id, is_reconciled').limit(1);
        hasPaymentColumnsRef.current = !payErr;
      } catch {
        hasPaymentColumnsRef.current = false;
      }
    }

    const healList: { id: string; paid_by: string }[] = [];

    // 單筆明細正規化轉換函式
    const transformSingleTx = (t: any): Transaction => {
      const canonicalPayer = aliasMap[t.paid_by] || dedupedMembers.find(m => m.id === t.paid_by);
      let correctedPaidBy = t.paid_by;
      const isPlaceholderPaidBy = !isValidUUID(t.paid_by) || t.paid_by.startsWith('20000000') || t.paid_by.startsWith('offline-');
      if (
        canonicalPayer &&
        isValidUUID(canonicalPayer.id) &&
        !canonicalPayer.id.startsWith('20000000') &&
        isPlaceholderPaidBy &&
        canonicalPayer.id !== t.paid_by
      ) {
        correctedPaidBy = canonicalPayer.id;
        healList.push({ id: t.id, paid_by: canonicalPayer.id });
      }

      let parsedMerchant = t.merchant;
      let parsedNote = t.note;
      if (!parsedMerchant && t.note) {
        const match = t.note.match(/^[\[［【](.*?)[\]］】]\s*(.*)$/);
        if (match) {
          parsedMerchant = match[1];
          parsedNote = match[2];
        }
      }
      let reminderDate: string | undefined = undefined;
      let reminderCalendar: CalendarSystem | undefined = t.reminder_calendar;
      let reminderRepeat: MemoRepeatFrequency | undefined = t.reminder_repeat;
      let completedBy: string | undefined = t.completed_by;
      let resolvedType: TransactionType = t.type;
      const decodedMemo = decodeMemoMerchantTag(parsedMerchant);
      if (decodedMemo.isMemo) {
        resolvedType = 'memo';
        reminderDate = decodedMemo.reminderDate;
        reminderCalendar = decodedMemo.reminderCalendar;
        reminderRepeat = decodedMemo.reminderRepeat;
        if (decodedMemo.completedBy) completedBy = decodedMemo.completedBy;
        parsedMerchant = undefined;
      } else if (t.type === 'memo' || (t.type === 'transfer' && Number(t.amount) === 0)) {
        resolvedType = 'memo';
        parsedMerchant = undefined;
        parsedNote = t.note;
      } else if (parsedMerchant) {
        recordMerchant(parsedMerchant);
      }

      if (resolvedType === 'memo' && t.note) {
        const memoTag = extractMemoTag(t.note);
        if (memoTag) recordMemoTag(memoTag);
      }

      return {
        ...t,
        type: resolvedType,
        reminder_date: reminderDate || t.reminder_date,
        reminder_calendar: reminderCalendar || t.reminder_calendar,
        reminder_repeat: reminderRepeat || t.reminder_repeat,
        completed_by: completedBy || t.completed_by,
        merchant: parsedMerchant || undefined,
        note: parsedNote || '',
        amount: Number(t.amount),
        paid_by: correctedPaidBy,
        payer_profile: canonicalPayer || t.payer_profile,
        category: getCategoryById(t.category_id, t.category),
      };
    };

    // (D) 載入交易明細：本地快取搶先秒開 (方案 C) + 兩段式漸進分批同步 (方案 B)
    let finalTx: Transaction[] = [];

    if (isConfigured && targetLedger.id !== DEMO_LEDGER_ID) {
      if (hasLocalCache && localCachedTransactions.length > 0) {
        // === 方案 C：既有快取帳本走極速增量同步 (0.8 秒以內完成) ===
        try {
          const { data: recentChunk } = await supabase
            .from('transactions')
            .select('*')
            .eq('ledger_id', targetLedger.id)
            .order('transacted_at', { ascending: false })
            .limit(500);

          if (recentChunk && recentChunk.length > 0) {
            const transformedRecent = recentChunk.map(transformSingleTx);
            const mergedMap = new Map<string, Transaction>();
            transformedRecent.forEach(t => {
              if (!deletedSet.has(t.id)) mergedMap.set(t.id, t);
            });
            localCachedTransactions.forEach(t => {
              if (!mergedMap.has(t.id) && !deletedSet.has(t.id)) {
                mergedMap.set(t.id, t);
              }
            });
            finalTx = Array.from(mergedMap.values());
          } else {
            finalTx = localCachedTransactions.filter(t => !deletedSet.has(t.id));
          }
        } catch (syncErr) {
          console.warn('增量同步失敗，保留本機快取:', syncErr);
          finalTx = localCachedTransactions.filter(t => !deletedSet.has(t.id));
        }
      } else {
        // === 方案 B：全新裝置初次載入海量帳本 (兩段式漸進秒開) ===
        // 第一階段：優先拉取首批最近 1,000 筆，1 秒內立刻渲染開工！
        let firstChunk: any[] = [];
        try {
          const { data: chunk, error: chunkErr } = await supabase
            .from('transactions')
            .select('*')
            .eq('ledger_id', targetLedger.id)
            .order('transacted_at', { ascending: false })
            .range(0, 999);

          if (!chunkErr && chunk) {
            firstChunk = chunk;
          }
        } catch (e) {
          console.warn('拉取首批明細失敗:', e);
        }

        if (firstChunk.length > 0) {
          finalTx = firstChunk.map(transformSingleTx);
          // 首屏資料就位，立即更新狀態與本機儲存，解除畫面轉圈等待！
          finalTx.sort((a, b) => new Date(b.transacted_at).getTime() - new Date(a.transacted_at).getTime());
          setTransactions(finalTx);
          AsyncStorage.setItem(`${STORAGE_KEYS.TRANSACTIONS}_${targetLedger.id}`, JSON.stringify(finalTx)).catch(() => {});
          AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(finalTx)).catch(() => {});

          // 第二階段：若歷史明細達到 1,000 筆上限，背景靜默非同步接力拉取剩餘明細，完全不擋使用者操作！
          if (firstChunk.length === 1000) {
            (async () => {
              try {
                let from = 1000;
                const batchSize = 1000;
                let hasMore = true;
                let bgRows: any[] = [];
                while (hasMore) {
                  const { data: bgChunk, error: bgErr } = await supabase
                    .from('transactions')
                    .select('*')
                    .eq('ledger_id', targetLedger.id)
                    .order('transacted_at', { ascending: false })
                    .range(from, from + batchSize - 1);

                  if (bgErr || !bgChunk || bgChunk.length === 0) {
                    hasMore = false;
                  } else {
                    bgRows = bgRows.concat(bgChunk);
                    if (bgChunk.length < batchSize) {
                      hasMore = false;
                    } else {
                      from += batchSize;
                    }
                  }
                }

                if (bgRows.length > 0) {
                  const bgTransformed = bgRows.map(transformSingleTx);
                  setTransactions(prev => {
                    const combinedMap = new Map<string, Transaction>();
                    prev.forEach(t => combinedMap.set(t.id, t));
                    bgTransformed.forEach(t => {
                      if (!combinedMap.has(t.id) && !deletedSet.has(t.id)) {
                        combinedMap.set(t.id, t);
                      }
                    });
                    const fullList = Array.from(combinedMap.values());
                    fullList.sort((a, b) => new Date(b.transacted_at).getTime() - new Date(a.transacted_at).getTime());
                    AsyncStorage.setItem(`${STORAGE_KEYS.TRANSACTIONS}_${targetLedger.id}`, JSON.stringify(fullList)).catch(() => {});
                    AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(fullList)).catch(() => {});
                    return fullList;
                  });
                }
              } catch (bgSyncErr) {
                console.warn('背景歷史明細補拉取失敗:', bgSyncErr);
              }
            })();
          }
        }
      }
    }

    // 檢查是否有未在 aliasMap 中的付款人 ID，額外向 profiles 查詢補充
    if (finalTx && finalTx.length > 0) {
      const missingPayerIds = Array.from(new Set(
        finalTx
          .slice(0, 1000)
          .map((t: any) => t.paid_by)
          .filter((id: string) => id && isValidUUID(id) && !aliasMap[id] && !id.startsWith('20000000-0000-4000-8000'))
      ));

      if (missingPayerIds.length > 0) {
        try {
          const { data: missingProfiles } = await supabase
            .from('profiles')
            .select('*')
            .in('id', missingPayerIds);
          if (missingProfiles && missingProfiles.length > 0) {
            aliasMap = buildMemberAliasMap(dedupedMembers, loadedMembers, missingProfiles);
            setMemberAliasMap(aliasMap);
            AsyncStorage.setItem(STORAGE_KEYS.ALIAS_MAP, JSON.stringify(aliasMap)).catch(() => {});
            AsyncStorage.setItem(`${STORAGE_KEYS.ALIAS_MAP}_${targetLedger.id}`, JSON.stringify(aliasMap)).catch(() => {});
          }
        } catch (e) {
          console.warn('補載入付款人 Profile 失敗:', e);
        }
      }
    }

    // 自動校正雲端 Supabase 中的歷史付款人 ID（背景執行）
    if (healList.length > 0 && targetLedger.id !== DEMO_LEDGER_ID && isConfigured) {
      Promise.all(
        healList.map(item =>
          supabase.from('transactions').update({ paid_by: item.paid_by }).eq('id', item.id)
        )
      ).catch(err => {
        console.warn('自動修復歷史交易付款人 ID 失敗:', err);
      });
    }

    // 檢查本地是否有離線建立、尚未成功送至雲端的交易（僅補同步真正標記為 _isPendingSync 的離線新明細，絕不復活已被刪除的舊交易）
    const localSavedTxStr = await AsyncStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    if (localSavedTxStr && targetLedger.id !== DEMO_LEDGER_ID) {
      try {
        const localTxList: Transaction[] = JSON.parse(localSavedTxStr);
        const unsyncedTx = localTxList.filter(
          lt => isValidUUID(lt.id) &&
          lt.ledger_id === targetLedger.id &&
          Boolean((lt as any)._isPendingSync) &&
          !finalTx.some(ct => ct.id === lt.id) &&
          !deletedSet.has(lt.id) &&
          !lt.id.startsWith('40000000-0000-4000-8000')
        );

        for (const ut of unsyncedTx) {
          try {
            const safePaidBy = members.some(m => m.id === ut.paid_by)
              ? ut.paid_by
              : (canonicalMe?.id || members[0]?.id || authUserId);
            const safeCatId = categories.some(c => c.id === ut.category_id)
              ? ut.category_id
              : (categories[0]?.id || null);

            const syncPayload: any = {
              id: ut.id,
              ledger_id: ut.ledger_id,
              creator_id: ut.creator_id && !ut.creator_id.startsWith('20000000') ? ut.creator_id : authUserId,
              category_id: safeCatId,
              amount: ut.amount,
              type: ut.type,
              paid_by: safePaidBy,
              transacted_at: ut.transacted_at,
              note: ut.note,
              is_settled: ut.is_settled,
            };

            if (hasMerchantColumnRef.current && ut.merchant) {
              syncPayload.merchant = ut.merchant;
            } else if (ut.merchant && !syncPayload.note?.startsWith(`[${ut.merchant}]`)) {
              syncPayload.note = `[${ut.merchant}] ${ut.note || ''}`.trim();
            }

            if (hasPaymentColumnsRef.current) {
              if (ut.payment_method) syncPayload.payment_method = ut.payment_method;
              if (ut.account_id && !ut.account_id.startsWith('50000000')) syncPayload.account_id = ut.account_id;
              if (ut.is_reconciled !== undefined) syncPayload.is_reconciled = ut.is_reconciled;
            }

            const { error: insErr } = await supabase.from('transactions').insert(syncPayload);
            if (!insErr) {
              delete (ut as any)._isPendingSync;
            } else {
              console.warn('補同步本地交易至雲端重試失敗:', insErr.message);
            }
          } catch (e) {
            console.warn('補同步本地交易至雲端失敗:', ut.id, e);
          }
          // 關鍵保證：無論當前雲端補同步是否成功，本地此筆明細均保留在 finalTx，絕不在刷新後遺失！
          finalTx.push({
            ...ut,
            category: getCategoryById(ut.category_id, ut.category),
            payer_profile: aliasMap[ut.paid_by] || dedupedMembers.find(m => m.id === ut.paid_by) || ut.payer_profile,
            payment_account: ut.account_id ? getAccountById(ut.account_id) : undefined,
          });
        }
      } catch (err) {
        console.warn('解析本地交易快取失敗:', err);
      }
    }

    // 雲端查詢失敗或無資料時的 Local-First 保底：絕不將本機快取的交易明細覆蓋成空陣列
    if (finalTx.length === 0 && targetLedger.id !== DEMO_LEDGER_ID) {
      if (localCachedTransactions.length > 0) {
        finalTx = localCachedTransactions;
      } else {
        try {
          const savedTxStr = (await AsyncStorage.getItem(`${STORAGE_KEYS.TRANSACTIONS}_${targetLedger.id}`)) ||
                             (await AsyncStorage.getItem(STORAGE_KEYS.TRANSACTIONS));
          if (savedTxStr) {
            const cachedTx = JSON.parse(savedTxStr);
            if (Array.isArray(cachedTx) && cachedTx.length > 0) {
              finalTx = cachedTx;
            }
          }
        } catch {}
      }
    }

    finalTx.sort((a, b) => new Date(b.transacted_at).getTime() - new Date(a.transacted_at).getTime());
    setTransactions(finalTx);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(finalTx));
      await AsyncStorage.setItem(`${STORAGE_KEYS.TRANSACTIONS}_${targetLedger.id}`, JSON.stringify(finalTx));
    } catch (storageErr) {
      console.warn('本機快取儲存空間限制，略過完整寫入 (資料已在記憶體與雲端安全保留):', storageErr);
    }
    setIsCloudSynced(true);

    // (E) 載入付款帳戶與卡片
    try {
      const ledgerSpecificKey = `${STORAGE_KEYS.PAYMENT_ACCOUNTS}_${targetLedger.id}`;
      const savedLedgerAccounts = await AsyncStorage.getItem(ledgerSpecificKey);

      let loadedCloudAccounts: PaymentAccount[] = [];
      const { data: accountRows, error: accErr } = await supabase
        .from('payment_accounts')
        .select('*')
        .eq('ledger_id', targetLedger.id)
        .order('sort_order', { ascending: true });

      if (!accErr && accountRows && accountRows.length > 0) {
        loadedCloudAccounts = accountRows;
      }

      if (targetLedger.id === DEMO_LEDGER_ID) {
        const savedDemo = (await AsyncStorage.getItem(ledgerSpecificKey)) || (await AsyncStorage.getItem(STORAGE_KEYS.PAYMENT_ACCOUNTS));
        if (savedDemo) {
          try { setPaymentAccounts(JSON.parse(savedDemo)); } catch {}
        } else {
          setPaymentAccounts(DEMO_PAYMENT_ACCOUNTS);
        }
      } else {
        const initKey = `${STORAGE_KEYS.ACCOUNTS_INITIALIZED}_${targetLedger.id}`;
        const hasInitialized = await AsyncStorage.getItem(initKey);

        const deletedKey = `${STORAGE_KEYS.DELETED_ACCOUNT_IDS}_${targetLedger.id}`;
        let deletedAccountIds: string[] = [];
        try {
          const savedDeletedStr = await AsyncStorage.getItem(deletedKey);
          if (savedDeletedStr) deletedAccountIds = JSON.parse(savedDeletedStr);
        } catch {}

        if (loadedCloudAccounts.length > 0) {
          // 雲端已有卡片（無論更名、新增或刪除過），以雲端為唯一真實來源，絕不自動復活預設示範卡片
          setPaymentAccounts(loadedCloudAccounts);
          await AsyncStorage.setItem(STORAGE_KEYS.PAYMENT_ACCOUNTS, JSON.stringify(loadedCloudAccounts));
          await AsyncStorage.setItem(ledgerSpecificKey, JSON.stringify(loadedCloudAccounts));
          await AsyncStorage.setItem(initKey, 'true');
        } else if (hasInitialized === 'true' || deletedAccountIds.length > 0) {
          // 雲端無卡片且使用者先前已清空/刪除過所有卡片，尊重使用者的決定保持空清單
          setPaymentAccounts([]);
          await AsyncStorage.setItem(STORAGE_KEYS.PAYMENT_ACCOUNTS, JSON.stringify([]));
          await AsyncStorage.setItem(ledgerSpecificKey, JSON.stringify([]));
        } else if (savedLedgerAccounts) {
          // 離線快取卡片
          try {
            const parsed = JSON.parse(savedLedgerAccounts);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setPaymentAccounts(parsed);
            }
          } catch {}
        } else {
          // 全新建立的帳本首次載入（雲端完全為空且從未初始化過），寫入預設示範卡片組合
          const defaultOwnerId = canonicalMe?.id || authUserId;
          const secondOwner = dedupedMembers.find(m => m.id !== defaultOwnerId);
          const secondOwnerId = secondOwner?.id || defaultOwnerId;

          const defaultPresets: PaymentAccount[] = [
            {
              id: generateUUID(),
              ledger_id: targetLedger.id,
              name: '富邦 Costco 聯名卡',
              type: 'credit_card',
              user_id: defaultOwnerId,
              last_four_digits: '8829',
              billing_cycle_date: 15,
              balance: 0,
              color: '#1E40AF',
              icon: '💳',
              sort_order: 1,
              created_at: new Date().toISOString(),
            },
            {
              id: generateUUID(),
              ledger_id: targetLedger.id,
              name: '國泰 CUBE 卡',
              type: 'credit_card',
              user_id: secondOwnerId,
              last_four_digits: '1234',
              billing_cycle_date: 27,
              balance: 0,
              color: '#047857',
              icon: '💳',
              sort_order: 2,
              created_at: new Date().toISOString(),
            },
            {
              id: generateUUID(),
              ledger_id: targetLedger.id,
              name: '爸爸悠遊卡',
              type: 'stored_value',
              user_id: defaultOwnerId,
              last_four_digits: '',
              balance: 350,
              color: '#0284C7',
              icon: '🚌',
              sort_order: 3,
              created_at: new Date().toISOString(),
            },
            {
              id: generateUUID(),
              ledger_id: targetLedger.id,
              name: '媽媽悠遊卡',
              type: 'stored_value',
              user_id: secondOwnerId,
              last_four_digits: '',
              balance: 500,
              color: '#EC4899',
              icon: '🚌',
              sort_order: 4,
              created_at: new Date().toISOString(),
            },
          ];

          if (isConfigured) {
            try {
              await supabase.from('payment_accounts').insert(defaultPresets);
            } catch (insertErr) {
              console.warn('雲端初始化預設付款卡片失敗:', insertErr);
            }
          }
          setPaymentAccounts(defaultPresets);
          await AsyncStorage.setItem(STORAGE_KEYS.PAYMENT_ACCOUNTS, JSON.stringify(defaultPresets));
          await AsyncStorage.setItem(ledgerSpecificKey, JSON.stringify(defaultPresets));
          await AsyncStorage.setItem(initKey, 'true');
        }
      }
    } catch (accLoadErr) {
      console.warn('載入雲端付款帳戶失敗，使用本地快取:', accLoadErr);
    }

    // (E-2) 載入自訂/常用付款方式 (定義雲端共享，開關各自獨立)
    try {
      const methodLedgerKey = `${STORAGE_KEYS.PAYMENT_METHODS}_${targetLedger.id}`;
      const savedMethodsStr = (await AsyncStorage.getItem(methodLedgerKey)) || (await AsyncStorage.getItem(STORAGE_KEYS.PAYMENT_METHODS));
      let localSaved: CustomPaymentMethod[] = [];
      if (savedMethodsStr) {
        try {
          const parsed = JSON.parse(savedMethodsStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            localSaved = parsed;
          }
        } catch {}
      }

      let cloudMethods: any[] = [];
      let cloudFetchSuccess = false;

      if (isConfigured && targetLedger.id !== DEMO_LEDGER_ID) {
        try {
          const { data, error } = await supabase
            .from('payment_methods')
            .select('*')
            .eq('ledger_id', targetLedger.id)
            .order('sort_order', { ascending: true });

          if (!error && Array.isArray(data)) {
            cloudMethods = data;
            cloudFetchSuccess = true;
          }
        } catch (cloudErr) {
          console.warn('雲端載入付款方式失敗 (將使用本地快取):', cloudErr);
        }

        // 若為管理員，自動檢查本地是否有尚未上雲的自訂付款方式（例如先前本機建立的 Google Pay），自動補登至雲端
        if (effectiveIsOwner && cloudFetchSuccess && localSaved.length > 0) {
          const localCustoms = localSaved.filter(m => !m.is_system);
          const missingInCloud = localCustoms.filter(lm => !cloudMethods.some(cm => cm.id === lm.id || cm.name === lm.name));
          if (missingInCloud.length > 0) {
            try {
              const toInsert = missingInCloud.map(m => ({
                id: m.id,
                ledger_id: targetLedger.id,
                name: m.name,
                icon: m.icon || '📱',
                color: m.color || '#0055B8',
                type: m.type || (m.supports_credit_card ? 'e_wallet' : 'other'),
                supports_credit_card: !!m.supports_credit_card,
                is_system: false,
                sort_order: m.sort_order || 99,
              }));
              await supabase.from('payment_methods').upsert(toInsert);
              cloudMethods.push(...toInsert);
            } catch (syncErr) {
              console.warn('自動同步本地付款方式至雲端失敗:', syncErr);
            }
          }
        }
      }

      // 組裝全體可用定義
      const allDefs: CustomPaymentMethod[] = [
        ...DEFAULT_PAYMENT_METHODS,
        ...cloudMethods.map(cm => ({
          id: cm.id,
          ledger_id: targetLedger.id,
          name: cm.name,
          icon: cm.icon || '📱',
          color: cm.color || '#0055B8',
          type: cm.type || 'e_wallet',
          supports_credit_card: !!cm.supports_credit_card,
          is_enabled: true,
          is_system: false,
          sort_order: cm.sort_order || 99,
          created_at: cm.created_at,
        })),
      ];

      // 若雲端連線失敗，保留本地既有自訂項目以防離線遺失
      if (!cloudFetchSuccess && localSaved.length > 0) {
        localSaved.filter(m => !m.is_system).forEach(cm => {
          if (!allDefs.some(d => d.id === cm.id)) {
            allDefs.push(cm);
          }
        });
      }

      const merged = mergePaymentMethods(allDefs, localSaved);
      setPaymentMethods(merged);
      await AsyncStorage.setItem(STORAGE_KEYS.PAYMENT_METHODS, JSON.stringify(merged));
      await AsyncStorage.setItem(methodLedgerKey, JSON.stringify(merged));
    } catch (methodErr) {
      console.warn('載入付款方式失敗:', methodErr);
    }

    // (E-3) 載入週期扣款規則 (嚴格綁定 targetLedger.id，絕不跨帳本共享)
    try {
      const recurringLedgerKey = `${STORAGE_KEYS.RECURRING_RULES}_${targetLedger.id}`;
      let loadedRules: RecurringRule[] = [];

      // 1. 若有雲端資料表支援，優先自雲端取得該帳本之週期規則
      if (isConfigured && targetLedger.id !== DEMO_LEDGER_ID) {
        try {
          const { data: cloudRules, error: cloudErr } = await supabase
            .from('recurring_rules')
            .select('*')
            .eq('ledger_id', targetLedger.id)
            .order('created_at', { ascending: false });
          if (!cloudErr && Array.isArray(cloudRules) && cloudRules.length > 0) {
            loadedRules = cloudRules;
          }
        } catch {}
      }

      // 2. 若雲端未取得或無雲端表，自該帳本專屬本機快取讀取
      if (loadedRules.length === 0) {
        const savedRecurringStr = await AsyncStorage.getItem(recurringLedgerKey);
        if (savedRecurringStr) {
          try {
            const parsed = JSON.parse(savedRecurringStr);
            if (Array.isArray(parsed)) {
              // 關鍵隔離防護：只保留明確歸屬於 targetLedger.id 的規則，排除任何跨帳本洩漏的規則
              loadedRules = parsed.filter((r: any) => r.ledger_id === targetLedger.id);
            }
          } catch {}
        }
      }

      // 3. 若為 DEMO 帳本且從無規則紀錄，提供預設示範規則；真實帳本則維持空白（使用者自訂或點擊預設導入）
      if (loadedRules.length === 0 && targetLedger.id === DEMO_LEDGER_ID) {
        loadedRules = DEMO_RECURRING_RULES;
      }

      setRecurringRules(loadedRules);
      // 僅存入目標帳本專屬快取，絕不寫入全域無前綴 key，避免污染其他帳本
      await AsyncStorage.setItem(recurringLedgerKey, JSON.stringify(loadedRules));
    } catch (recErr) {
      console.warn('載入週期扣款規則失敗:', recErr);
    }

    // (E-4) 載入成員裝置清單並為本機自動登記心跳
    try {
      const activeMemberId = canonicalMe?.id || authUserId;
      await registerDevice(activeMemberId, targetLedger.id);
      await fetchMemberDevices(targetLedger.id, activeMemberId);
    } catch (devErr) {
      console.warn('載入成員裝置或登記失敗:', devErr);
    }

    // (F) Realtime 訂閱
    setupRealtimeSubscription(targetLedger.id);
  };

  // 2. 當連線設定具備時，啟動 Supabase 身分驗證與雲端即時同步
  const initLedger = async () => {
    try {
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Web 端 AsyncStorage 非同步讀取 localStorage，給予多次漸進式重試，杜絕太早放棄而建立新匿名帳號
        for (let i = 0; i < 4; i++) {
          await new Promise(r => setTimeout(r, 150));
          const retryGet = await supabase.auth.getSession();
          if (retryGet.data?.session) {
            session = retryGet.data.session;
            break;
          }
        }
        if (!session) {
          const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
          if (anonError) {
            console.warn('Supabase 匿名登入失敗:', anonError.message);
            return;
          }
          session = anonData.session;
        }
      }

      const authUser = session?.user;
      if (!authUser || !isMountedRef.current) return;

      let savedGoogleEmail = '';
      try {
        savedGoogleEmail = (await AsyncStorage.getItem('@family_ledger_google_email')) || '';
        if (!savedGoogleEmail) {
          const savedUserStr = await AsyncStorage.getItem(STORAGE_KEYS.CURRENT_USER);
          if (savedUserStr) {
            const u = JSON.parse(savedUserStr);
            if (u?.auth_email && !u.auth_email.endsWith('@family.local')) {
              savedGoogleEmail = u.auth_email;
            }
          }
        }
      } catch {}

      const effectiveGoogleEmail = (authUser?.email && !authUser.email.endsWith('@family.local') && !authUser.is_anonymous)
        ? authUser.email
        : (savedGoogleEmail || null);

      const isRealGoogle = Boolean(effectiveGoogleEmail && !effectiveGoogleEmail.endsWith('@family.local'));
      setIsGoogleAuthenticated(isRealGoogle);
      setGoogleUserEmail(effectiveGoogleEmail);

        // 使用者 Profile 初始化
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .maybeSingle();

        let myProfile: Profile;
        if (!existingProfile) {
          const fallbackName = (authUser as any)?.user_metadata?.full_name ||
            (authUser as any)?.user_metadata?.name ||
            (authUser?.email ? authUser.email.split('@')[0] : '家庭成員');
          const fallbackAvatar = (authUser as any)?.user_metadata?.avatar_url || '👤';
          myProfile = {
            id: authUser.id,
            email: authUser.email || undefined,
            display_name: fallbackName,
            avatar_url: fallbackAvatar,
          };
          await supabase.from('profiles').upsert(myProfile);
        } else {
          myProfile = existingProfile;
        }

        // 偵測網址是否帶有邀請參數或 Google 綁定回傳
        let urlInviteCode: string | null = null;
        let urlJoinId: string | null = null;
        let urlAuthAction: string | null = null;
        let urlProfileId: string | null = null;

        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
          const params = new URLSearchParams(window.location.search);
          urlInviteCode = params.get('invite');
          urlJoinId = params.get('join') || params.get('ledger');
          urlAuthAction = params.get('action');
          urlProfileId = params.get('profile_id');

          // 若為 Web Google OAuth 綁定回傳
          if (urlAuthAction === 'bind_google' && urlProfileId && authUser?.email) {
            try {
              await supabase.from('profiles').update({
                auth_email: authUser.email.toLowerCase(),
                auth_provider: 'google',
                is_locked: true,
                updated_at: new Date().toISOString(),
              }).eq('id', urlProfileId);
            } catch (err) {
              console.warn('Web Google 綁定更新失敗:', err);
            }
          }

          // 網址列第 0 秒靜默洗淨：一旦讀取出參數，立即清洗瀏覽器網址列，避免使用者未來按 F5 重新整理時再度夾帶 Query 參數
          if ((urlInviteCode || urlJoinId || urlAuthAction) && window.history) {
            try {
              window.history.replaceState({}, document.title, window.location.pathname);
            } catch {}
          }
        }

        // 查詢該用戶目前已加入的帳本清單 (依加入時間新到舊排序)
        // 跨裝置 Google 帳號整合：若當前登入者具備 Google 信箱，反查全庫所有綁定此信箱的身分 ID，實現多帳本全自動反查！
        let candidateUserIds = [authUser.id];
        let lookupEmail: string | undefined = undefined;

        if (authUser?.email && !authUser.email.endsWith('@family.local') && !authUser.email.includes('anonymous')) {
          lookupEmail = authUser.email;
        }

        // 若 authUser 無真實 Google email（例如手機端為匿名 Session），反查本機快取或該 Session 在 profiles 中綁定的 Google 信箱
        if (!lookupEmail) {
          try {
            const savedUserStr = await AsyncStorage.getItem(STORAGE_KEYS.CURRENT_USER);
            if (savedUserStr) {
              const u = JSON.parse(savedUserStr);
              if (u?.auth_email && !u.auth_email.endsWith('@family.local')) {
                lookupEmail = u.auth_email;
              }
            }
          } catch {}
        }
        if (!lookupEmail && authUser?.id) {
          try {
            const { data: myProf } = await supabase
              .from('profiles')
              .select('auth_email')
              .eq('id', authUser.id)
              .maybeSingle();
            if (myProf?.auth_email && !myProf.auth_email.endsWith('@family.local')) {
              lookupEmail = myProf.auth_email;
            }
          } catch {}
        }

        if (lookupEmail) {
          try {
            const { data: boundProfiles } = await supabase
              .from('profiles')
              .select('id')
              .eq('auth_email', lookupEmail.toLowerCase());
            if (boundProfiles && boundProfiles.length > 0) {
              candidateUserIds = [...new Set([...candidateUserIds, ...boundProfiles.map(p => p.id)])];
            }
          } catch (e) {
            console.warn('反查 Google 綁定帳本身分失敗:', e);
          }
        }

        const { data: memberLedgers } = await supabase
          .from('ledger_members')
          .select('ledger_id, role, joined_at, ledgers(*), profiles(*)')
          .in('user_id', candidateUserIds)
          .order('joined_at', { ascending: false });

        const targetInvite = urlInviteCode || urlJoinId;

        // 讀取本地快取的帳本 ID 與邀請碼
        const savedLedgerStr = await AsyncStorage.getItem(STORAGE_KEYS.LEDGER);
        let savedLedgerId: string | null = null;
        if (savedLedgerStr) {
          try {
            const parsed = JSON.parse(savedLedgerStr);
            if (isValidUUID(parsed?.id) && parsed.id !== DEMO_LEDGER_ID) {
              savedLedgerId = parsed.id;
            }
          } catch {}
        }
        const savedCode = await AsyncStorage.getItem(STORAGE_KEYS.INVITE_CODE);

        let validMemberLedgers = (memberLedgers || []).filter((m: any) => m.ledgers && isValidUUID(m.ledgers.id));

        // 額外保底：查出由 candidateUserIds 建立之所有帳本，確保發起人永遠能見到自己建立的公帳
        try {
          const { data: createdLedgers } = await supabase
            .from('ledgers')
            .select('*')
            .in('created_by', candidateUserIds);
          if (createdLedgers && createdLedgers.length > 0) {
            for (const cl of createdLedgers) {
              const exists = validMemberLedgers.some((m: any) => {
                const lObj = Array.isArray(m.ledgers) ? m.ledgers[0] : m.ledgers;
                return lObj?.id === cl.id || m.ledger_id === cl.id;
              });
              if (!exists) {
                validMemberLedgers.push({
                  ledger_id: cl.id,
                  role: 'owner',
                  joined_at: cl.created_at || new Date().toISOString(),
                  ledgers: cl,
                  profiles: null,
                } as any);
              }
            }
          }
        } catch (e) {
          console.warn('反查建立之帳本失敗:', e);
        }

        // 僅在使用者主動點擊全新邀請網址 (targetInvite) 且本機查無任何成員記錄時，才允許自動加入；
        // 絕不允許無邀請連結時在背景隱式自動重入，徹底杜絕已被移除之成員（如跨帳本誤入者）回滾復活！
        let shouldAutoJoin = validMemberLedgers.length === 0 && Boolean(targetInvite);

        // 嚴格安全防護：
        // 1. 若該本機已有 lookupEmail (Google 綁定信箱)，絕不允許匿名 Session 自動以「家庭成員」加入！
        if (shouldAutoJoin && lookupEmail) {
          shouldAutoJoin = false;
        }

        // 2. 檢查雲端是否已存在此 Google 信箱所保護的成員稱謂（防止以 Google OAuth 影子身分或匿名 Session 重複加入）
        if (shouldAutoJoin && (savedLedgerId || targetInvite)) {
          try {
            const checkEmail = (authUser?.email && !authUser.email.endsWith('@family.local')) ? authUser.email : lookupEmail;
            if (checkEmail) {
              const { data: boundProfiles } = await supabase
                .from('profiles')
                .select('id, display_name, auth_email')
                .eq('auth_email', checkEmail.toLowerCase())
                .eq('is_locked', true);

              if (boundProfiles && boundProfiles.length > 0) {
                shouldAutoJoin = false;
              }
            }
          } catch (e) {}
        }

        if (shouldAutoJoin) {
          try {
            let foundLedger: any = null;
            const savedRole = (await AsyncStorage.getItem(STORAGE_KEYS.USER_ROLE)) || 'member';
            const savedPin = (await AsyncStorage.getItem(STORAGE_KEYS.ADMIN_PIN)) || '8888';

            // 1. 優先以邀請碼呼叫 RPC 重新綁定當前 Supabase Session (攜帶 PIN 碼)
            if (savedCode) {
              const { data: rpcRes } = await supabase.rpc('join_ledger_by_invite', {
                invite_code_input: savedCode.trim(),
                claimed_role: savedRole,
                admin_pin_input: savedPin,
              });
              if (rpcRes?.success && rpcRes?.ledger_id) {
                foundLedger = {
                  id: rpcRes.ledger_id,
                  name: rpcRes.ledger_name || (savedLedgerStr ? JSON.parse(savedLedgerStr)?.name : '家庭公帳'),
                  currency: 'TWD',
                  description: '全家共享日常開銷帳本',
                  created_at: new Date().toISOString(),
                };
                const { data: lData } = await supabase
                  .from('ledgers')
                  .select('*')
                  .eq('id', rpcRes.ledger_id)
                  .maybeSingle();
                if (lData) foundLedger = lData;
              } else if (!rpcRes?.success) {
                // 若以 admin/owner 被 PIN 擋下或失敗，100% 自動降級為 member 保底加入，確保雲端綁定成功絕不被踢出！
                const { data: fallbackRpc } = await supabase.rpc('join_ledger_by_invite', {
                  invite_code_input: savedCode.trim(),
                  claimed_role: 'member',
                  admin_pin_input: null,
                });
                if (fallbackRpc?.success && fallbackRpc?.ledger_id) {
                  foundLedger = {
                    id: fallbackRpc.ledger_id,
                    name: fallbackRpc.ledger_name || (savedLedgerStr ? JSON.parse(savedLedgerStr)?.name : '家庭公帳'),
                    currency: 'TWD',
                    description: '全家共享日常開銷帳本',
                    created_at: new Date().toISOString(),
                  };
                  const { data: lData } = await supabase
                    .from('ledgers')
                    .select('*')
                    .eq('id', fallbackRpc.ledger_id)
                    .maybeSingle();
                  if (lData) foundLedger = lData;
                }
              }
            }

            // 2. 若邀請碼未成功但有 savedLedgerId，以帳本 ID 重新綁定
            if (!foundLedger && savedLedgerId) {
              const { data: rpcRes } = await supabase.rpc('join_ledger_by_invite', {
                invite_code_input: savedLedgerId,
                claimed_role: savedRole,
                admin_pin_input: savedPin,
              });
              if (rpcRes?.success && rpcRes?.ledger_id) {
                foundLedger = {
                  id: rpcRes.ledger_id,
                  name: rpcRes.ledger_name || (savedLedgerStr ? JSON.parse(savedLedgerStr)?.name : '家庭公帳'),
                  currency: 'TWD',
                  description: '全家共享日常開銷帳本',
                  created_at: new Date().toISOString(),
                };
                const { data: lData } = await supabase
                  .from('ledgers')
                  .select('*')
                  .eq('id', rpcRes.ledger_id)
                  .maybeSingle();
                if (lData) foundLedger = lData;
              } else if (!rpcRes?.success) {
                const { data: fallbackRpc } = await supabase.rpc('join_ledger_by_invite', {
                  invite_code_input: savedLedgerId,
                  claimed_role: 'member',
                  admin_pin_input: null,
                });
                if (fallbackRpc?.success && fallbackRpc?.ledger_id) {
                  foundLedger = {
                    id: fallbackRpc.ledger_id,
                    name: fallbackRpc.ledger_name || (savedLedgerStr ? JSON.parse(savedLedgerStr)?.name : '家庭公帳'),
                    currency: 'TWD',
                    description: '全家共享日常開銷帳本',
                    created_at: new Date().toISOString(),
                  };
                  const { data: lData } = await supabase
                    .from('ledgers')
                    .select('*')
                    .eq('id', fallbackRpc.ledger_id)
                    .maybeSingle();
                  if (lData) foundLedger = lData;
                }
              }
            }

            // 3. 備援：若 RPC 沒能查到但 directLedger 查得到
            if (!foundLedger && savedLedgerId) {
              const { data: directLedger } = await supabase
                .from('ledgers')
                .select('*')
                .eq('id', savedLedgerId)
                .maybeSingle();
              if (directLedger) foundLedger = directLedger;
            }

            // 4. 終極保底：若雲端都未回應，但本機快取存有有效的 cachedLedger，直接認領為當前帳本
            if (!foundLedger && savedLedgerStr) {
              try {
                const cl = JSON.parse(savedLedgerStr);
                if (cl && isValidUUID(cl.id) && cl.id !== DEMO_LEDGER_ID) {
                  foundLedger = cl;
                }
              } catch {}
            }

            if (foundLedger && isValidUUID(foundLedger.id)) {
              validMemberLedgers = [
                {
                  ledger_id: foundLedger.id,
                  role: savedRole,
                  joined_at: new Date().toISOString(),
                  ledgers: foundLedger,
                  profiles: null,
                } as any,
              ];
            }
          } catch (bindErr) {
            console.warn('本機已存帳本自動關聯失敗:', bindErr);
          }
        }
        // 對 validMemberLedgers 進行帳本去重，並優先保留具有專屬自訂家庭稱謂（非 Google HTTP 頭像影子成員）的紀錄
        const ledgerMap = new Map<string, any>();
        for (const m of validMemberLedgers) {
          const lObj = (Array.isArray(m.ledgers) ? m.ledgers[0] : m.ledgers) as any;
          const lId = lObj?.id;
          if (!lId) continue;
          if (!ledgerMap.has(lId)) {
            ledgerMap.set(lId, m);
          } else {
            const existing = ledgerMap.get(lId);
            const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
            const isCustom = prof?.avatar_url && !prof.avatar_url.startsWith('http');
            const existingProf = Array.isArray(existing.profiles) ? existing.profiles[0] : existing.profiles;
            const existingIsUrl = existingProf?.avatar_url && existingProf.avatar_url.startsWith('http');
            if (isCustom || existingIsUrl) {
              ledgerMap.set(lId, m);
            }
          }
        }
        const uniqueMemberLedgers = Array.from(ledgerMap.values());

        const allUserLedgers: Ledger[] = await Promise.all(uniqueMemberLedgers.map(async (m: any) => {
          const l = m.ledgers as unknown as Ledger;
          const isCreator = l.created_by === authUser.id;
          let savedName = '';
          let savedAvatar = '';
          try {
            const savedUserStr = await AsyncStorage.getItem(`${STORAGE_KEYS.CURRENT_USER}_${l.id}`);
            if (savedUserStr) {
              const u = JSON.parse(savedUserStr);
              savedName = u.display_name;
              savedAvatar = u.avatar_url;
            }
          } catch {}
          if (!savedName && m.profiles) {
            const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
            if (prof?.display_name && (!prof.avatar_url || !prof.avatar_url.startsWith('http'))) {
              savedName = prof.display_name;
              savedAvatar = prof.avatar_url;
            }
          }
          if (!savedName && lookupEmail) {
            try {
              const { data: bMems } = await supabase
                .from('ledger_members')
                .select('profiles(id, display_name, avatar_url, auth_email)')
                .eq('ledger_id', l.id);
              if (bMems && bMems.length > 0) {
                const match = bMems.find((bm: any) => {
                  const bp = Array.isArray(bm.profiles) ? bm.profiles[0] : bm.profiles;
                  return bp && (bp.auth_email || '').toLowerCase() === lookupEmail.toLowerCase() &&
                         (!bp.avatar_url || !bp.avatar_url.startsWith('http'));
                });
                if (match) {
                  const bp = Array.isArray(match.profiles) ? match.profiles[0] : match.profiles;
                  savedName = bp.display_name;
                  savedAvatar = bp.avatar_url;
                }
              }
            } catch {}
          }
          let ledgerReadOnly = Boolean(l.is_read_only || l.description?.includes('[READ_ONLY]'));
          try {
            const savedReadOnly = await AsyncStorage.getItem(`${STORAGE_KEYS.LEDGER_READ_ONLY}_${l.id}`);
            if (savedReadOnly === 'true') ledgerReadOnly = true;
          } catch {}
          return {
            ...l,
            is_read_only: ledgerReadOnly,
            userRole: (isCreator ? 'owner' : m.role) as any,
            userDisplayName: savedName,
            userAvatar: savedAvatar,
          };
        }));
        if (allUserLedgers.length > 0) {
          setLedgers(allUserLedgers);
        }

        // 情境 A：網址自帶邀請碼
        if (targetInvite) {
          // 清理網址列，避免使用者往後重新整理時再次觸發邀請參數
          if (Platform.OS === 'web' && typeof window !== 'undefined' && window.history) {
            window.history.replaceState({}, '', window.location.pathname);
          }

          const alreadyInThisLedger = validMemberLedgers.some(
            (m: any) =>
              (urlJoinId && (m.ledger_id === urlJoinId || m.ledgers?.id === urlJoinId)) ||
              (urlInviteCode && savedCode && savedCode.toUpperCase() === urlInviteCode.toUpperCase())
          ) || (savedLedgerId && urlJoinId && savedLedgerId === urlJoinId)
            || (savedLedgerId && !urlJoinId) // 若本機已有有效帳本，且網址僅為一般邀請碼，不應強制跳加入彈窗
            || (validMemberLedgers.length > 0 && !urlJoinId); // 若已在有效成員帳本中，不強制跳彈窗

          if (!alreadyInThisLedger) {
            // 收到邀請：交給 Join Modal 讓使用者填寫自己的暱稱與頭像確認加入，絕不可在背景偷偷產生「家庭成員」假人
            setPendingInviteCode(targetInvite);
          }
        }

        // 情境 B：一般進入（已在某帳本內）
        if (validMemberLedgers.length > 0) {
          // 精確決定啟動帳本優先順序：
          // 1. 網址指定的 join ID
          // 2. 本地儲存的邀請碼匹配之帳本 (避免回到舊帳本)
          // 3. 本地儲存的有效帳本 ID (若仍在成員名冊中)
          // 4. 最新加入的帳本 (validMemberLedgers[0]，joined_at DESC)
          let targetRecord: any = null;

          if (urlJoinId) {
            targetRecord = validMemberLedgers.find(
              (m: any) => m.ledger_id === urlJoinId || m.ledgers?.id === urlJoinId
            );
          }

          if (!targetRecord && (urlInviteCode || savedCode)) {
            const inviteToMatch = (urlInviteCode || savedCode || '').trim().toUpperCase();
            const ledgerIds = validMemberLedgers.map((m: any) => m.ledger_id);
            const { data: matchedInvites } = await supabase
              .from('ledger_invites')
              .select('ledger_id, invite_code')
              .in('ledger_id', ledgerIds)
              .ilike('invite_code', inviteToMatch);

            if (matchedInvites && matchedInvites.length > 0) {
              const matchedLedgerId = matchedInvites[0].ledger_id;
              targetRecord = validMemberLedgers.find((m: any) => m.ledger_id === matchedLedgerId);
            }
          }

          if (!targetRecord && savedLedgerId) {
            targetRecord = validMemberLedgers.find(
              (m: any) => m.ledger_id === savedLedgerId || m.ledgers?.id === savedLedgerId
            );
          }

          if (!targetRecord && validMemberLedgers.length > 0) {
            targetRecord = validMemberLedgers[0];
          }

          if (targetRecord) {
            const activeLedger = targetRecord.ledgers as unknown as Ledger;
            const isCreator = activeLedger.created_by === authUser.id;
            const role = isCreator ? 'owner' : ((targetRecord.role as 'owner' | 'admin' | 'member') || 'member');
            setUserRole(role);
            await AsyncStorage.setItem(STORAGE_KEYS.USER_ROLE, role);
            if (!isMountedRef.current) return;

            await loadLedgerData(activeLedger, authUser.id);
            setHasJoinedLedger(true);
            await AsyncStorage.setItem(STORAGE_KEYS.HAS_JOINED, 'true');
          }
        } else {
          // 情境 C：雲端查無成員名冊或離線狀態 (Local-First: 絕對不可任意清理使用者本地已加入的帳本！)
          if (!isMountedRef.current) return;
          const savedLedgerStr = await AsyncStorage.getItem(STORAGE_KEYS.LEDGER);
          if (savedLedgerStr) {
            try {
              const cachedLedger = JSON.parse(savedLedgerStr);
              if (cachedLedger && isValidUUID(cachedLedger.id) && cachedLedger.id !== DEMO_LEDGER_ID) {
                console.log('雲端未查詢到即時名冊，但本機具備有效帳本快取：維持本地離線優先狀態，絕不踢出帳本');
                setLedgers([cachedLedger]);
                setCurrentLedger(cachedLedger);
                setHasJoinedLedger(true);
                setIsCloudSynced(false);
                await loadLedgerData(cachedLedger, authUser.id);
                return;
              }
            } catch {}
          }
          // 僅在確定本機「完全沒有任何帳本快取、身分紀錄與邀請碼」時，才顯示初始加入畫面
          const savedHasJoined = await AsyncStorage.getItem(STORAGE_KEYS.HAS_JOINED);
          const savedCode = await AsyncStorage.getItem(STORAGE_KEYS.INVITE_CODE);
          const savedUser = await AsyncStorage.getItem(STORAGE_KEYS.CURRENT_USER);
          if (savedHasJoined !== 'true' && !savedLedgerStr && !savedCode && !savedUser) {
            setHasJoinedLedger(false);
          } else {
            setHasJoinedLedger(true);
          }
        }
      } catch (err) {
        console.warn('初始化 Supabase 連線或即時同步時發生錯誤:', err);
        setIsCloudSynced(false);
      }
    };

    useEffect(() => {
      isMountedRef.current = true;
      if (!isConfigured) {
        setIsCloudSynced(false);
        return;
      }

      initLedger();

      return () => {
        isMountedRef.current = false;
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
        }
      };
    }, []);

  // 手動 / 前景重新整理當前帳本完整資料
  const refreshLedger = async () => {
    if (isConfigured && currentLedger && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const authUserId = session?.user?.id;
        if (authUserId) {
          await loadLedgerData(currentLedger, authUserId);
        }
      } catch (err) {
        console.warn('重新整理帳本資料失敗:', err);
      }
    }
  };

  // Google 帳號一鍵登入與同步 (Phase 3)
  const signInWithGoogle = async (): Promise<{ success: boolean; message?: string }> => {
    try {
      if (!isConfigured) {
        return { success: false, message: '目前為示範或離線模式，無法進行 Google 登入。' };
      }
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.location) {
          const redirectUrl = `${window.location.origin}${window.location.pathname}?action=login`;
          const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: redirectUrl,
            },
          });
          if (error) {
            return { success: false, message: error.message };
          }
          return { success: true };
        }
      } else {
        const syncCode = Math.floor(100000 + Math.random() * 900000).toString();
        await AsyncStorage.setItem('@family_ledger_pending_sync_code', syncCode);
        const redirectUrl = `https://mattyu99.github.io/family-ledger/auth-callback.html?action=login&sync_code=${syncCode}`;
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirectUrl,
            skipBrowserRedirect: true,
          },
        });
        if (error) {
          return { success: false, message: error.message };
        }
        if (data?.url) {
          await Linking.openURL(data.url);
          return { success: true, message: '已開啟系統瀏覽器進行 Google 授權，完成後返回 App 即可自動同步' };
        }
      }
      return { success: false, message: '未能取得 Google 授權轉跳網址' };
    } catch (err: any) {
      console.warn('發起 Google 登入失敗:', err);
      return { success: false, message: err?.message || '登入失敗' };
    }
  };

  const signOutGoogle = async () => {
    try {
      await supabase.auth.signOut();
      setIsGoogleAuthenticated(false);
      setGoogleUserEmail(null);
      const { data: anonData } = await supabase.auth.signInAnonymously();
      if (anonData?.session) {
        await initLedger();
      }
      triggerLiveToast({
        id: `auth-signout-${Date.now()}`,
        type: 'info',
        actorName: '帳號安全',
        avatar: '👋',
        title: '已登出 Google 帳號',
        message: '已安全登出並重設為本機訪客身分',
        createdAt: Date.now(),
      });
    } catch (err) {
      console.warn('Google 登出失敗:', err);
    }
  };

  // 3. 當 App 從背景回到前景時，自動檢查並重新載入最新雲端資料，並自動完成待處理的 Google 授權同步
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active' && isConfigured) {
        try {
          const pendingSyncCode = await AsyncStorage.getItem('@family_ledger_pending_sync_code');
          if (pendingSyncCode) {
            console.log('App 回到前景，自動檢查待驗證 Google 授權碼:', pendingSyncCode);
            const res = await claimGoogleIdentity(pendingSyncCode);
            if (res.success) {
              await AsyncStorage.removeItem('@family_ledger_pending_sync_code');
              await initLedger();
              triggerLiveToast({
                id: `auth-sync-${Date.now()}`,
                type: 'complete',
                actorName: '帳號同步',
                avatar: '🎉',
                title: 'Google 帳號同步成功！',
                message: `已自動還原為【${res.profile?.display_name || 'Google 使用者'}】，名下公帳已全部解鎖！`,
                createdAt: Date.now(),
              });
            }
          }
        } catch (e) {
          console.warn('檢查待處理授權碼失敗:', e);
        }

        if (currentLedger && currentLedger.id !== DEMO_LEDGER_ID) {
          refreshLedger();
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [currentLedger, isConfigured]);

  // 4. 監聽行動端 Deep Link 與 Supabase Auth 事件 (Phase 2 Google 綁定與授權回傳)
  useEffect(() => {
    // 檢查 Web 端是否有取消或錯誤的授權回呼殘留
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
      const search = window.location.search || '';
      const hash = window.location.hash || '';
      if (
        search.includes('error') ||
        search.includes('access_denied') ||
        hash.includes('error') ||
        hash.includes('access_denied')
      ) {
        console.log('Web 端檢測到 Google 授權取消或失敗，清理網址列');
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

    const handleUrl = async (event: { url: string }) => {
      try {
        const linkUrl = event?.url;
        if (!linkUrl) return;
        console.log('收到 Deep Link 呼叫:', linkUrl);

        // 若使用者在 Google 畫面點擊取消或出錯，靜默忽略，絕不彈出成功通知
        if (
          linkUrl.includes('error') ||
          linkUrl.includes('access_denied') ||
          linkUrl.includes('auth-cancelled')
        ) {
          console.log('Deep Link 包含取消或錯誤，忽略處理');
          return;
        }

        // 僅當明確來自原生 Deep Link 授權成功回呼時處理
        if (linkUrl.startsWith('familyledger://auth-success') || linkUrl.includes('//auth-success')) {
          let action: string | null = null;
          let code: string | null = null;
          let email: string | null = null;
          const queryIdx = linkUrl.indexOf('?');
          if (queryIdx !== -1) {
            const query = linkUrl.substring(queryIdx + 1);
            const searchParams = new URLSearchParams(query);
            action = searchParams.get('action');
            code = searchParams.get('code');
            email = searchParams.get('email');
          }

          if (action === 'claim' && (code || email)) {
            await claimGoogleIdentity(code || email!);
          } else if (action === 'login') {
            await initLedger();
            triggerLiveToast({
              id: `auth-login-${Date.now()}`,
              type: 'complete',
              actorName: '帳號同步',
              avatar: '🎉',
              title: 'Google 帳號登入成功',
              message: email ? `已成功登入【${email}】！已同步解鎖名下的家庭公帳。` : '已成功登入 Google 帳號！已同步解鎖名下的家庭公帳。',
              createdAt: Date.now(),
            });
          } else {
            await refreshLedger();
            triggerLiveToast({
              id: `auth-link-${Date.now()}`,
              type: 'complete',
              actorName: '帳號安全',
              avatar: '🛡️',
              title: 'Google 帳號綁定成功',
              message: email ? `已成功綁定【${email}】！身分稱謂已受安全保護。` : '您的身分稱謂已受 Google 帳號安全保護！',
              createdAt: Date.now(),
            });
          }
        }
      } catch (err) {
        console.warn('解析 Deep Link 異常:', err);
      }
    };

    const linkSub = Linking.addEventListener('url', handleUrl);
    Linking.getInitialURL().then(initialUrl => {
      // 僅在非 Web 或原生 scheme 時解析 initialURL，避免 Web 刷新重複誤判
      if (initialUrl && !initialUrl.startsWith('http')) {
        handleUrl({ url: initialUrl });
      }
    }).catch(() => {});

    let authListener: any = null;
    if (isConfigured) {
      const res = supabase.auth.onAuthStateChange(async (event, currentSession) => {
        if (event === 'SIGNED_IN' && currentSession?.user?.email) {
          const userEmail = currentSession.user.email.toLowerCase();
          const isRealGoogle = !userEmail.endsWith('@family.local') && !currentSession.user.is_anonymous;
          if (isRealGoogle) {
            setIsGoogleAuthenticated(true);
            setGoogleUserEmail(userEmail);
          }
          console.log('Supabase 使用者已登入:', userEmail);

          if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
            const params = new URLSearchParams(window.location.search);
            const action = params.get('action');
            const profileId = params.get('profile_id');

            if (action === 'bind_google' && profileId) {
              const { error: upErr } = await supabase.from('profiles').update({
                auth_email: userEmail,
                auth_provider: 'google',
                is_locked: true,
                updated_at: new Date().toISOString(),
              }).eq('id', profileId);

              window.history.replaceState({}, document.title, window.location.pathname);

              if (!upErr) {
                // 本地同步更新 currentUser
                setCurrentUser(prev => {
                  const updated: Profile = {
                    ...prev,
                    auth_email: userEmail,
                    auth_provider: 'google',
                    is_locked: true,
                  };
                  AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(updated)).catch(() => {});
                  if (currentLedger?.id) {
                    AsyncStorage.setItem(`${STORAGE_KEYS.CURRENT_USER}_${currentLedger.id}`, JSON.stringify(updated)).catch(() => {});
                  }
                  return updated;
                });
                await refreshLedger();
                triggerLiveToast({
                  id: `auth-link-${Date.now()}`,
                  type: 'complete',
                  actorName: '帳號安全',
                  avatar: '🛡️',
                  title: 'Google 帳號綁定成功',
                  message: `已成功綁定【${userEmail}】！身分稱謂已受安全保護。`,
                  createdAt: Date.now(),
                });
              } else {
                console.error('更新 Profile 鎖定失敗:', upErr);
              }
            } else if (action === 'claim') {
              const { data: matchedProfiles, error: claimErr } = await supabase
                .from('profiles')
                .select('*')
                .eq('auth_email', userEmail)
                .eq('is_locked', true);

              window.history.replaceState({}, document.title, window.location.pathname);

              if (!claimErr && matchedProfiles && matchedProfiles.length > 0) {
                const matched = matchedProfiles[0] as Profile;
                await registerDevice(matched.id, currentLedger.id);
                setCurrentUser(matched);
                await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(matched));
                if (currentLedger?.id) {
                  await AsyncStorage.setItem(`${STORAGE_KEYS.CURRENT_USER}_${currentLedger.id}`, JSON.stringify(matched));
                }
                if (matched.role === 'owner' || matched.role === 'admin' || currentLedger.created_by === matched.id) {
                  const targetRole = matched.role === 'owner' || matched.role === 'admin' ? matched.role : 'owner';
                  setUserRole(targetRole);
                  await AsyncStorage.setItem(STORAGE_KEYS.USER_ROLE, targetRole);
                }
                await refreshLedger();
                triggerLiveToast({
                  id: `auth-claim-${Date.now()}`,
                  type: 'complete',
                  actorName: matched.display_name,
                  avatar: matched.avatar_url || '🔑',
                  title: '🎉 身分認領成功！',
                  message: `已成功恢復為【${matched.display_name}】(${matched.auth_email})`,
                  createdAt: Date.now(),
                });
              } else {
                triggerLiveToast({
                  id: `auth-claim-warn-${Date.now()}`,
                  type: 'info',
                  actorName: '帳號安全',
                  avatar: '⚠️',
                  title: '找不到受保護身分',
                  message: `未找到綁定此信箱 (${userEmail}) 的受保護稱謂。`,
                  createdAt: Date.now(),
                });
              }
            } else if (action === 'login' || (!action && isRealGoogle)) {
              window.history.replaceState({}, document.title, window.location.pathname);
              await initLedger();
              triggerLiveToast({
                id: `auth-login-${Date.now()}`,
                type: 'complete',
                actorName: '帳號同步',
                avatar: '🎉',
                title: 'Google 帳號登入成功',
                message: `已成功登入【${userEmail}】！已同步解鎖名下的家庭公帳。`,
                createdAt: Date.now(),
              });
            }
          }
        } else if (event === 'SIGNED_OUT') {
          setIsGoogleAuthenticated(false);
          setGoogleUserEmail(null);
        }
      });
      authListener = res?.data?.subscription;
    }

    return () => {
      linkSub.remove();
      authListener?.unsubscribe?.();
    };
  }, [currentLedger, isConfigured]);

  // 檢查使用者所屬之其他帳本是否有未讀新動態
  const checkUnreadLedgers = async (
    targetLedgers?: Ledger[],
    activeLedgerId?: string,
    currentAuthUserId?: string
  ) => {
    if (!isConfigured) return;
    try {
      const ledgerList = targetLedgers || ledgers;
      const activeId = activeLedgerId || currentLedger.id;
      if (!ledgerList || ledgerList.length <= 1) return;

      const otherLedgers = ledgerList.filter(
        l => l.id !== activeId && isValidUUID(l.id) && l.id !== DEMO_LEDGER_ID
      );
      if (otherLedgers.length === 0) return;

      let authId = currentAuthUserId;
      if (!authId) {
        const { data: { session } } = await supabase.auth.getSession();
        authId = session?.user?.id;
      }

      const newUnreadMap: Record<string, number> = {};

      for (const otherL of otherLedgers) {
        const visitKey = `${STORAGE_KEYS.LAST_VISITED_PREFIX}${otherL.id}`;
        const lastVisitedStr = await AsyncStorage.getItem(visitKey);

        // 查詢該帳本最新一筆交易 (以 created_at 降冪排序)
        const { data: latestTxs } = await supabase
          .from('transactions')
          .select('id, created_at, transacted_at, creator_id, paid_by')
          .eq('ledger_id', otherL.id)
          .order('created_at', { ascending: false })
          .limit(1);

        if (latestTxs && latestTxs.length > 0) {
          const latest = latestTxs[0];
          const latestTime = latest.created_at || latest.transacted_at;

          if (!lastVisitedStr) {
            // 初次使用或未記錄過離開時間：以目前時間為起點，避免將歷史舊帳誤判為未讀紅點
            await AsyncStorage.setItem(visitKey, new Date().toISOString());
          } else if (latestTime && new Date(latestTime).getTime() > new Date(lastVisitedStr).getTime()) {
            // 防呆：若是自己建立的交易，不觸發自己的未讀紅點
            const isMe = (authId && latest.creator_id === authId) ||
                         (authId && latest.paid_by === authId) ||
                         (currentUserRef.current?.id && (latest.creator_id === currentUserRef.current.id || latest.paid_by === currentUserRef.current.id));
            if (!isMe) {
              newUnreadMap[otherL.id] = 1;
            }
          }
        }
      }

      setUnreadLedgerMap(prev => {
        const next = { ...prev };
        otherLedgers.forEach(ol => {
          if (newUnreadMap[ol.id]) {
            next[ol.id] = newUnreadMap[ol.id];
          } else {
            delete next[ol.id];
          }
        });
        return next;
      });
    } catch (err) {
      console.warn('檢查跨帳本未讀動態失敗:', err);
    }
  };

  // 4. 跨帳本即時動態與紅點監聽器：當 ledgers 變更或切換帳本時自動維護
  useEffect(() => {
    if (!isConfigured || ledgers.length <= 1) {
      if (multiLedgerChannelRef.current) {
        supabase.removeChannel(multiLedgerChannelRef.current);
        multiLedgerChannelRef.current = null;
      }
      return;
    }

    let isSubscribed = true;

    const initMultiLedgerRealtime = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const authId = session?.user?.id;

      if (!isSubscribed) return;

      // 1. 靜態檢查其他帳本是否有新動態
      await checkUnreadLedgers(ledgers, currentLedger.id, authId);

      if (!isSubscribed) return;

      // 2. 訂閱其他帳本的 Realtime 廣播
      if (multiLedgerChannelRef.current) {
        supabase.removeChannel(multiLedgerChannelRef.current);
        multiLedgerChannelRef.current = null;
      }

      const otherLedgers = ledgers.filter(
        l => l.id !== currentLedger.id && isValidUUID(l.id) && l.id !== DEMO_LEDGER_ID
      );
      if (otherLedgers.length === 0) return;

      const channel = supabase.channel(`multi-ledger-unread-${currentLedger.id}-${Date.now()}`);

      otherLedgers.forEach((otherL) => {
        channel.on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'transactions',
            filter: `ledger_id=eq.${otherL.id}`,
          },
          (payload) => {
            const newRow = payload.new as any;
            if (!newRow) return;

            // 防呆：若記帳者為本機裝置，不觸發紅點
            const isMe = (authId && newRow.creator_id === authId) ||
                         (authId && newRow.paid_by === authId) ||
                         (currentUserRef.current?.id && (newRow.creator_id === currentUserRef.current.id || newRow.paid_by === currentUserRef.current.id));
            if (isMe) return;

            // 1. 標記該帳本未讀
            setUnreadLedgerMap(prev => ({
              ...prev,
              [otherL.id]: (prev[otherL.id] || 0) + 1,
            }));

            // 2. 彈出頂部跨帳本即時動態泡泡
            let displayMerchant = '記事';
            if (newRow.type === 'memo') {
              const memoData = parseMemoNote(newRow.note);
              displayMerchant = `[${memoData.title}] ${memoData.cleanContent}`;
            } else {
              let parsedMerchant = newRow.merchant;
              if (!parsedMerchant && newRow.note) {
                const match = newRow.note.match(/^[\[［【](.*?)[\]］】]\s*(.*)$/);
                if (match) parsedMerchant = match[1];
              }
              displayMerchant = parsedMerchant || (newRow.type === 'expense' ? '支出' : '收入');
            }
            const displayAmount = newRow.amount ? ` NT$ ${Number(newRow.amount).toLocaleString('zh-TW')}` : '';

            triggerLiveToast({
              id: `cross-ledger-${otherL.id}-${newRow.id || Date.now()}`,
              type: 'insert',
              actorName: otherL.name,
              avatar: '📬',
              title: `📬 [${otherL.name}] 新記帳`,
              message: `${displayMerchant}${displayAmount}`,
              amount: newRow.amount ? Number(newRow.amount) : undefined,
              createdAt: Date.now(),
            });
          }
        );
      });

      channel.subscribe();
      multiLedgerChannelRef.current = channel;
    };

    initMultiLedgerRealtime();

    return () => {
      isSubscribed = false;
      if (multiLedgerChannelRef.current) {
        supabase.removeChannel(multiLedgerChannelRef.current);
        multiLedgerChannelRef.current = null;
      }
    };
  }, [ledgers, currentLedger.id, isConfigured]);

  // 建立新的家庭公帳 (Owner 發起)
  const createLedger = async (name: string = '幸福家庭帳本', creatorName?: string, avatar?: string, isReadOnly: boolean = false) => {
    try {
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data: anonData } = await supabase.auth.signInAnonymously();
        session = anonData?.session || null;
      }
      const newLedgerId = generateUUID();
      const newCode = 'FAM-' + Math.floor(1000 + Math.random() * 9000);

      // 關鍵修復：為新帳本建立專屬獨立的 creatorProfileId，絕不直接覆寫全域 authUserId 的 Profile 稱謂！
      // 徹底杜絕在 A 帳本命名「龜龜」，卻把 B 帳本（如「智爸」）的稱謂一併覆寫污染的問題
      const creatorProfileId = generateUUID();
      const chosenName = creatorName?.trim() || '爸爸 (我)';
      const chosenAvatar = avatar || '👨';

      // 檢查當前使用者是否綁定 Google 信箱，若有則繼承 auth_email 供 Google 跨帳本統一查帳，但 display_name 完全隔離
      const userGoogleEmail = currentUser?.auth_email || (session?.user?.email && !session.user.email.endsWith('@family.local') ? session.user.email : null);

      const newLedger: Ledger = {
        id: newLedgerId,
        name: name.trim() || '幸福家庭帳本',
        description: '全家共享日常開銷帳本',
        currency: 'TWD',
        created_by: creatorProfileId,
        created_at: new Date().toISOString(),
        is_read_only: isReadOnly,
        allow_new_members: true,
      };

      if (isConfigured) {
        await supabase.from('profiles').insert({
          id: creatorProfileId,
          display_name: chosenName,
          avatar_url: chosenAvatar,
          auth_email: userGoogleEmail || null,
          auth_provider: userGoogleEmail ? 'google' : null,
          is_locked: Boolean(userGoogleEmail),
        });

        const ledgerDesc = isReadOnly ? '[READ_ONLY] 全家共享日常開銷帳本' : '全家共享日常開銷帳本';
        const ledgerInsertPayload: any = {
          id: newLedger.id,
          name: newLedger.name,
          description: ledgerDesc,
          currency: newLedger.currency,
          created_by: creatorProfileId,
          admin_pin: '8888',
          allow_new_members: true,
        };
        const { error: lErr } = await supabase.from('ledgers').insert({
          ...ledgerInsertPayload,
          is_read_only: isReadOnly,
        });
        if (lErr) {
          await supabase.from('ledgers').insert(ledgerInsertPayload);
        }

        await supabase.from('ledger_members').insert({
          ledger_id: newLedger.id,
          user_id: creatorProfileId,
          role: 'owner',
        });

        await supabase.from('ledger_invites').insert({
          ledger_id: newLedger.id,
          invite_code: newCode,
          created_by: creatorProfileId,
          expires_at: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
        });
      }

      setUserRole('owner');
      await AsyncStorage.setItem(STORAGE_KEYS.USER_ROLE, 'owner');
      setInviteCode(newCode);
      await AsyncStorage.setItem(STORAGE_KEYS.INVITE_CODE, newCode);
      setAdminPin('8888');
      await AsyncStorage.setItem(STORAGE_KEYS.ADMIN_PIN, '8888');
      await AsyncStorage.setItem(`${STORAGE_KEYS.ADMIN_PIN}_${newLedger.id}`, '8888');
      await AsyncStorage.setItem(STORAGE_KEYS.HAS_JOINED, 'true');
      setHasJoinedLedger(true);
      await AsyncStorage.setItem(`${STORAGE_KEYS.LEDGER_READ_ONLY}_${newLedger.id}`, String(isReadOnly));
      await AsyncStorage.setItem(`${STORAGE_KEYS.LEDGER_ALLOW_NEW_MEMBERS}_${newLedger.id}`, 'true');
      setLedgers(prev => [{ ...newLedger, userRole: 'owner', userDisplayName: chosenName, userAvatar: chosenAvatar }, ...prev.filter(l => l.id !== newLedger.id)]);

      const updatedMe: Profile = {
        id: creatorProfileId,
        display_name: chosenName,
        avatar_url: chosenAvatar,
        role: 'owner',
        auth_email: userGoogleEmail || undefined,
      };
      setCurrentUser(updatedMe);
      await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(updatedMe));
      await AsyncStorage.setItem(`${STORAGE_KEYS.CURRENT_USER}_${newLedger.id}`, JSON.stringify(updatedMe));

      if (isConfigured) {
        await loadLedgerData(newLedger, creatorProfileId);
      } else {
        setCurrentLedger(newLedger);
        await AsyncStorage.setItem(STORAGE_KEYS.LEDGER, JSON.stringify(newLedger));
      }
    } catch (err: any) {
      console.warn('建立帳本失敗:', err);
      alert('建立帳本時發生錯誤: ' + (err.message || '請檢查網路連線'));
    }
  };

  // 切換指定帳本之唯讀鎖定保護模式 (防止意外異動與歷史歸檔)
  const toggleLedgerReadOnly = async (ledgerId: string, readOnly?: boolean): Promise<boolean> => {
    try {
      const target = ledgers.find(l => l.id === ledgerId) || (currentLedger.id === ledgerId ? currentLedger : null);
      if (!target) return false;
      const nextVal = readOnly !== undefined ? readOnly : !target.is_read_only;

      const updatedLedgers = ledgers.map(l => l.id === ledgerId ? { ...l, is_read_only: nextVal } : l);
      setLedgers(updatedLedgers);
      await AsyncStorage.setItem(STORAGE_KEYS.LEDGERS, JSON.stringify(updatedLedgers));
      await AsyncStorage.setItem(`${STORAGE_KEYS.LEDGER_READ_ONLY}_${ledgerId}`, String(nextVal));

      if (currentLedger.id === ledgerId) {
        const updatedCur = { ...currentLedger, is_read_only: nextVal };
        setCurrentLedger(updatedCur);
        await AsyncStorage.setItem(STORAGE_KEYS.LEDGER, JSON.stringify(updatedCur));
      }

      if (isConfigured && ledgerId !== DEMO_LEDGER_ID) {
        try {
          const currentDesc = target.description || '';
          let newDesc = currentDesc;
          if (nextVal) {
            if (!newDesc.includes('[READ_ONLY]')) {
              newDesc = `[READ_ONLY] ${newDesc}`.trim();
            }
          } else {
            newDesc = newDesc.replace(/\[READ_ONLY\]\s*/g, '').trim();
          }
          if (newDesc !== currentDesc) {
            await supabase.from('ledgers').update({ description: newDesc }).eq('id', ledgerId);
          }
          await supabase.from('ledgers').update({ is_read_only: nextVal }).eq('id', ledgerId);
        } catch (e) {
          console.warn('雲端更新 is_read_only 失敗:', e);
        }
      }
      return true;
    } catch (err) {
      console.error('toggleLedgerReadOnly 失敗:', err);
      return false;
    }
  };

  // 切換家庭門禁安全鎖 (僅限 Owner/Admin 操作，關閉時阻斷新成員加入)
  const updateAllowNewMembers = async (allowed: boolean): Promise<{ success: boolean; message?: string }> => {
    try {
      const targetId = currentLedger.id;
      if (targetId === DEMO_LEDGER_ID) {
        const updated = { ...currentLedger, allow_new_members: allowed };
        setCurrentLedger(updated);
        await AsyncStorage.setItem(STORAGE_KEYS.LEDGER, JSON.stringify(updated));
        await AsyncStorage.setItem(`${STORAGE_KEYS.LEDGER_ALLOW_NEW_MEMBERS}_${targetId}`, String(allowed));
        return { success: true };
      }

      if (isConfigured) {
        // 1. 優先呼叫 RPC
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('update_allow_new_members', {
          target_ledger_id: targetId,
          is_allowed: allowed,
        });

        if (rpcErr || (rpcRes && !rpcRes.success)) {
          // 2. 備用：直接更新 ledgers 表
          const { error: updErr } = await supabase
            .from('ledgers')
            .update({ allow_new_members: allowed })
            .eq('id', targetId);

          if (updErr) {
            console.warn('雲端更新 allow_new_members 失敗:', updErr);
            return { success: false, message: updErr.message || '更新家庭門禁設定失敗' };
          }
        }
      }

      const updated = { ...currentLedger, allow_new_members: allowed };
      setCurrentLedger(updated);
      setLedgers(prev => prev.map(l => (l.id === targetId ? { ...l, allow_new_members: allowed } : l)));
      await AsyncStorage.setItem(STORAGE_KEYS.LEDGER, JSON.stringify(updated));
      await AsyncStorage.setItem(`${STORAGE_KEYS.LEDGER_ALLOW_NEW_MEMBERS}_${targetId}`, String(allowed));
      return { success: true };
    } catch (err: any) {
      console.warn('切換家庭門禁安全鎖出錯:', err);
      return { success: false, message: err?.message || '操作失敗，請稍後重試' };
    }
  };

  // 修改家庭公帳名稱 (管理員專屬)
  const updateLedgerName = async (newName: string): Promise<boolean> => {
    const clean = newName.trim();
    if (!clean) {
      alert('帳本名稱不能為空');
      return false;
    }
    const updatedLedger = { ...currentLedger, name: clean };
    setCurrentLedger(updatedLedger);
    setLedgers(prev => prev.map(l => (l.id === currentLedger.id ? { ...l, name: clean } : l)));
    await AsyncStorage.setItem(STORAGE_KEYS.LEDGER, JSON.stringify(updatedLedger));

    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        const { error } = await supabase
          .from('ledgers')
          .update({ name: clean, updated_at: new Date().toISOString() })
          .eq('id', currentLedger.id);
        if (error) {
          console.warn('雲端更新帳本名稱失敗:', error);
        }
      } catch (e) {
        console.warn('雲端更新帳本名稱失敗:', e);
      }
    }
    return true;
  };

  // 透過邀請碼或專屬連結加入帳本 (家人加入或認領既有身分，支援管理員 PIN 碼驗證)
  const joinLedgerByCode = async (
    codeOrUrl: string,
    memberName?: string,
    avatar?: string,
    claimedMember?: Profile,
    adminPinInput?: string
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      if (!codeOrUrl || !codeOrUrl.trim()) {
        return { success: false, message: '請輸入有效的邀請碼或邀請連結' };
      }

      let code = codeOrUrl.trim();
      let extractedJoinId = '';

      if (code.includes('http://') || code.includes('https://') || code.includes('?')) {
        try {
          const urlObj = new URL(code.startsWith('http') ? code : `https://dummy.com/${code}`);
          const pInvite = urlObj.searchParams.get('invite');
          const pJoin = urlObj.searchParams.get('join') || urlObj.searchParams.get('ledger');
          if (pInvite) code = pInvite.trim();
          if (pJoin) extractedJoinId = pJoin.trim();
        } catch {
          // ignore parsing error
        }
      }

      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data: anonData } = await supabase.auth.signInAnonymously();
        session = anonData?.session || null;
      }
      const authUserId = session?.user?.id || generateUUID();

      let targetLedger: Ledger | null = null;
      let targetLedgerId = extractedJoinId;

      const targetRole = claimedMember?.role || undefined;
      const isClaimingAdmin = claimedMember?.role === 'owner' || claimedMember?.role === 'admin';

      // Google 電子鎖保護：若欲認領之成員已鎖定，禁止一般邀請碼直接冒名認領
      if (claimedMember?.is_locked) {
        if (!currentUser.auth_email || currentUser.auth_email.toLowerCase() !== (claimedMember.auth_email || '').toLowerCase()) {
          return {
            success: false,
            message: `「${claimedMember.display_name}」身分已受 Google 帳號鎖定保護，無法直接透過邀請碼認領。請在加入後使用「以 Google 帳號認領身分」！`
          };
        }
      }

      // 1. 優先使用 SECURITY DEFINER 的 join_ledger_by_invite 函式以邀請碼加入 (自動驗證 PIN 與繞過 RLS 限制)
      if (code) {
        try {
          const { data: rpcRes } = await supabase.rpc('join_ledger_by_invite', {
            invite_code_input: code,
            claimed_role: targetRole,
            admin_pin_input: adminPinInput?.trim() || null,
          });

          if (rpcRes) {
            if (!rpcRes.success) {
              return { success: false, message: rpcRes.message || '加入帳本失敗' };
            }
            if (rpcRes.ledger_id) {
              targetLedgerId = rpcRes.ledger_id;
            }
          }
        } catch (rpcE) {
          console.warn('RPC 加入帳本嘗試失敗，改用備用邏輯:', rpcE);
        }
      }

      // 2. 獲取帳本實體
      if (isValidUUID(targetLedgerId)) {
        const { data: lData } = await supabase.from('ledgers').select('*').eq('id', targetLedgerId).maybeSingle();
        if (lData) targetLedger = lData as unknown as Ledger;
      }

      if (!targetLedger) {
        const { data: invRow } = await supabase
          .from('ledger_invites')
          .select('ledger_id, invite_code, ledgers(*)')
          .ilike('invite_code', code)
          .maybeSingle();

        if (invRow && invRow.ledgers) {
          targetLedger = invRow.ledgers as unknown as Ledger;
          targetLedgerId = targetLedger.id;
        }
      }

      if (!targetLedger && isValidUUID(code)) {
        const { data: lData } = await supabase.from('ledgers').select('*').eq('id', code).maybeSingle();
        if (lData) {
          targetLedger = lData as unknown as Ledger;
          targetLedgerId = lData.id;
        }
      }

      if (!targetLedger) {
        return { success: false, message: '找不到此邀請碼對應的帳本，請確認代碼是否正確！' };
      }

      const isCreator = targetLedger.created_by === authUserId;

      // 門禁安全鎖檢查：若帳本已關閉新成員加入，且呼叫者既非建立者也非現有成員，則阻斷加入
      if (targetLedger.allow_new_members === false) {
        let isExistingMember = false;
        if (isConfigured) {
          const { data: memCheck } = await supabase
            .from('ledger_members')
            .select('user_id')
            .eq('ledger_id', targetLedger.id)
            .eq('user_id', authUserId)
            .maybeSingle();
          if (memCheck) isExistingMember = true;
        }
        if (!isCreator && !isExistingMember) {
          return {
            success: false,
            message: '🔒 此家庭公帳已啟動門禁安全防護（已關閉新成員加入通道），無法加入。若您是家庭成員，請聯繫管理員暫時開啟門禁！',
          };
        }
      }

      // 若非原始建立者，但試圖認領管理員身分，進行安全 PIN 碼核對
      if (!isCreator && isClaimingAdmin) {
        const expectedPin = (targetLedger as any)?.admin_pin || '8888';
        if (!adminPinInput || adminPinInput.trim() !== expectedPin.trim()) {
          return {
            success: false,
            message: '管理員安全 PIN 碼錯誤！若您是一般家庭成員，請直接點選其他家庭成員稱謂或建立新身分。',
          };
        }
      }

      const assignedRole: 'owner' | 'admin' | 'member' = isCreator
        ? 'owner'
        : (isClaimingAdmin ? (claimedMember?.role === 'admin' ? 'admin' : 'owner') : 'member');

      const finalDisplayName = claimedMember
        ? claimedMember.display_name
        : (memberName || (isCreator ? '爸爸 (我)' : '家庭成員'));
      const finalAvatar = claimedMember
        ? claimedMember.avatar_url
        : (avatar || (isCreator ? '👨' : '👩'));

      if (isConfigured) {
        // 1. 若為全新成員建立或當前裝置自身的 Profile，更新雲端稱謂與頭像
        if (!claimedMember || claimedMember.id === authUserId) {
          await supabase.from('profiles').upsert({
            id: authUserId,
            display_name: finalDisplayName,
            avatar_url: finalAvatar,
          });
        }

        // 2. 寫入 ledger_members 表（確保當前裝置具備存取權限）
        await supabase.from('ledger_members').upsert({
          ledger_id: targetLedger.id,
          user_id: authUserId,
          role: assignedRole,
        }, { onConflict: 'ledger_id,user_id' });
      }

      // 決定本機裝置上活躍的成員 Profile (若認領既有身分，本機身分即為該成員)
      const updatedMe: Profile = claimedMember ? {
        ...claimedMember,
        role: assignedRole,
      } : {
        id: authUserId,
        display_name: finalDisplayName,
        avatar_url: finalAvatar,
        role: assignedRole,
      };

      setCurrentUser(updatedMe);
      await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(updatedMe));
      await AsyncStorage.setItem(`${STORAGE_KEYS.CURRENT_USER}_${targetLedger.id}`, JSON.stringify(updatedMe));

      setUserRole(assignedRole);
      await AsyncStorage.setItem(STORAGE_KEYS.USER_ROLE, assignedRole);
      setInviteCode(code);
      setPendingInviteCode(null);
      await AsyncStorage.setItem(STORAGE_KEYS.INVITE_CODE, code);

      const finalVerifiedPin = (targetLedger as any)?.admin_pin || adminPinInput?.trim();
      if (finalVerifiedPin) {
        setAdminPin(finalVerifiedPin);
        await AsyncStorage.setItem(STORAGE_KEYS.ADMIN_PIN, finalVerifiedPin);
        await AsyncStorage.setItem(`${STORAGE_KEYS.ADMIN_PIN}_${targetLedger.id}`, finalVerifiedPin);
      }

      await AsyncStorage.setItem(STORAGE_KEYS.HAS_JOINED, 'true');
      setHasJoinedLedger(true);
      setLedgers(prev => [{ ...targetLedger, userRole: assignedRole, userDisplayName: finalDisplayName, userAvatar: finalAvatar }, ...prev.filter(l => l.id !== targetLedger.id)]);

      await loadLedgerData(targetLedger, authUserId);
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.history) {
        window.history.replaceState({}, '', window.location.pathname);
      }
      return { success: true };
    } catch (err: any) {
      console.warn('加入帳本時出錯:', err);
      return { success: false, message: err.message || '加入帳本失敗，請稍後重試' };
    }
  };

  // 預覽邀請碼對應的帳本與既有成員名單（供認領身分使用）
  const previewInvite = async (
    codeOrUrl: string
  ): Promise<{
    success: boolean;
    ledgerId?: string;
    ledgerName?: string;
    members?: Profile[];
    message?: string;
    isGateLocked?: boolean;
  }> => {
    try {
      if (!codeOrUrl || !codeOrUrl.trim()) {
        return { success: false, message: '請輸入有效的邀請碼或邀請連結' };
      }

      let code = codeOrUrl.trim();
      let extractedJoinId = '';

      if (code.includes('http://') || code.includes('https://') || code.includes('?')) {
        try {
          const urlObj = new URL(code.startsWith('http') ? code : `https://dummy.com/${code}`);
          const pInvite = urlObj.searchParams.get('invite');
          const pJoin = urlObj.searchParams.get('join') || urlObj.searchParams.get('ledger');
          if (pInvite) code = pInvite.trim();
          if (pJoin) extractedJoinId = pJoin.trim();
        } catch {
          // ignore parsing error
        }
      }

      const lookupCode = code || extractedJoinId;

      // 1. 優先嘗試 RPC 獲取預覽 (SECURITY DEFINER 供訪客查詢成員與帳本名稱)
      if (isConfigured) {
        try {
          const { data: rpcRes, error: rpcErr } = await supabase.rpc('get_ledger_invite_preview', {
            invite_code_input: lookupCode,
          });

          if (!rpcErr && rpcRes && rpcRes.success) {
            const rawMems: Profile[] = (rpcRes.members || []).map((m: any) => ({
              id: m.id,
              display_name: m.display_name,
              avatar_url: m.avatar_url,
              role: m.role || 'member',
            }));
            return {
              success: true,
              ledgerId: rpcRes.ledger_id,
              ledgerName: rpcRes.ledger_name,
              members: deduplicateMembers(rawMems),
            };
          } else if (rpcRes && !rpcRes.success && (rpcRes.is_gate_locked || rpcRes.message?.includes('門禁') || rpcRes.message?.includes('關閉'))) {
            return {
              success: false,
              isGateLocked: true,
              message: rpcRes.message || '🔒 此家庭公帳已啟動門禁安全防護（已關閉新成員加入通道），無法加入。若您是家庭成員，請聯繫管理員暫時開啟門禁！',
            };
          }
        } catch (rpcErr) {
          console.warn('RPC 預覽邀請碼失敗，改用備用查詢:', rpcErr);
        }

        // 2. 備用查詢（若尚未在 Supabase 執行新 RPC 腳本）
        let targetLedgerId = extractedJoinId;
        let targetLedgerName = '';

        if (!targetLedgerId && lookupCode) {
          const { data: invRow } = await supabase
            .from('ledger_invites')
            .select('ledger_id, ledgers(id, name, created_by, allow_new_members)')
            .ilike('invite_code', lookupCode)
            .maybeSingle();

          if (invRow) {
            targetLedgerId = invRow.ledger_id;
            targetLedgerName = (invRow.ledgers as any)?.name || '';
            const ledgerMeta = invRow.ledgers as any;
            if (ledgerMeta && ledgerMeta.allow_new_members === false) {
              const { data: { session } } = await supabase.auth.getSession();
              const uid = session?.user?.id || currentUser.id;
              const isCreator = ledgerMeta.created_by === uid;
              const { data: existingMem } = await supabase
                .from('ledger_members')
                .select('user_id')
                .eq('ledger_id', targetLedgerId)
                .eq('user_id', uid)
                .maybeSingle();

              if (!isCreator && !existingMem) {
                return {
                  success: false,
                  isGateLocked: true,
                  message: '🔒 此家庭公帳已啟動門禁安全防護（已關閉新成員加入通道），無法加入。若您是家庭成員，請聯繫管理員暫時開啟門禁！',
                };
              }
            }
          }
        }

        if (targetLedgerId) {
          if (!targetLedgerName) {
            const { data: lData } = await supabase
              .from('ledgers')
              .select('id, name, created_by, allow_new_members')
              .eq('id', targetLedgerId)
              .maybeSingle();
            if (lData) {
              targetLedgerName = lData.name;
              if (lData.allow_new_members === false) {
                const { data: { session } } = await supabase.auth.getSession();
                const uid = session?.user?.id || currentUser.id;
                const isCreator = lData.created_by === uid;
                const { data: existingMem } = await supabase
                  .from('ledger_members')
                  .select('user_id')
                  .eq('ledger_id', targetLedgerId)
                  .eq('user_id', uid)
                  .maybeSingle();

                if (!isCreator && !existingMem) {
                  return {
                    success: false,
                    isGateLocked: true,
                    message: '🔒 此家庭公帳已啟動門禁安全防護（已關閉新成員加入通道），無法加入。若您是家庭成員，請聯繫管理員暫時開啟門禁！',
                  };
                }
              }
            }
          }

          const { data: memRows } = await supabase
            .from('ledger_members')
            .select('user_id, role, profiles(*)')
            .eq('ledger_id', targetLedgerId);

          const foundMembers: Profile[] = (memRows || [])
            .map((r: any) => {
              if (!r.profiles) return null;
              return {
                ...r.profiles,
                role: r.role || 'member',
              };
            })
            .filter(Boolean);

          return {
            success: true,
            ledgerId: targetLedgerId,
            ledgerName: targetLedgerName || '家庭共享帳本',
            members: deduplicateMembers(foundMembers),
          };
        }
      }

      return { success: false, message: '找不到此邀請碼對應的帳本或邀請已失效' };
    } catch (e: any) {
      return { success: false, message: e.message || '查詢邀請失敗' };
    }
  };

  // 重新產生邀請碼 (Owner 專屬，舊代碼作廢)
  const regenerateInviteCode = async (): Promise<string> => {
    const newCode = 'FAM-' + Math.floor(1000 + Math.random() * 9000);

    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session?.user?.id || currentUser.id;
        // 清理此帳本舊的邀請紀錄，確保舊碼作廢
        await supabase.from('ledger_invites').delete().eq('ledger_id', currentLedger.id);
        await supabase.from('ledger_invites').insert({
          ledger_id: currentLedger.id,
          invite_code: newCode,
          created_by: uid,
          expires_at: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
        });
      } catch (e) {
        console.warn('雲端更新邀請碼失敗:', e);
      }
    }

    setInviteCode(newCode);
    await AsyncStorage.setItem(STORAGE_KEYS.INVITE_CODE, newCode);
    return newCode;
  };

  // 自訂邀請碼 (Owner 專屬)
  const updateInviteCode = async (customCode: string): Promise<boolean> => {
    const clean = customCode.trim().toUpperCase();
    if (clean.length < 3 || clean.length > 15) {
      alert('邀請碼長度需在 3 至 15 個字元之間');
      return false;
    }

    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session?.user?.id || currentUser.id;

        // 檢查此代碼是否已被「其他家庭」使用
        const { data: existing } = await supabase
          .from('ledger_invites')
          .select('id, ledger_id')
          .ilike('invite_code', clean)
          .maybeSingle();

        if (existing && existing.ledger_id !== currentLedger.id) {
          alert('此自訂代碼已被其他家庭使用，請換一個！');
          return false;
        }

        // 若不是同一個既有代碼，作廢舊碼並寫入新碼
        if (!existing) {
          await supabase.from('ledger_invites').delete().eq('ledger_id', currentLedger.id);
          const { error } = await supabase.from('ledger_invites').insert({
            ledger_id: currentLedger.id,
            invite_code: clean,
            created_by: uid,
            expires_at: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
          });
          if (error) {
            alert('此自訂代碼已被其他家庭使用，請換一個！');
            return false;
          }
        }
      } catch (e) {
        console.warn('自訂邀請碼時發生錯誤:', e);
        alert('變更邀請碼失敗，請稍後再試');
        return false;
      }
    }

    setInviteCode(clean);
    await AsyncStorage.setItem(STORAGE_KEYS.INVITE_CODE, clean);
    return true;
  };

  // 自訂管理員安全 PIN 碼 (Owner 專屬)
  const updateAdminPin = async (newPin: string): Promise<boolean> => {
    const clean = newPin.trim();
    if (clean.length < 4 || clean.length > 8) {
      alert('PIN 碼長度需在 4 至 8 碼之間');
      return false;
    }
    setAdminPin(clean);
    await AsyncStorage.setItem(STORAGE_KEYS.ADMIN_PIN, clean);
    await AsyncStorage.setItem(`${STORAGE_KEYS.ADMIN_PIN}_${currentLedger.id}`, clean);

    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('update_admin_pin', {
          target_ledger_id: currentLedger.id,
          new_pin: clean,
        });
        if (rpcErr || (rpcRes && !rpcRes.success)) {
          await supabase
            .from('ledgers')
            .update({ admin_pin: clean })
            .eq('id', currentLedger.id);
        }
      } catch (e) {
        console.warn('雲端更新 admin_pin 失敗:', e);
      }
    }
    return true;
  };

  // 取得完整邀請分享網址
  const getInviteLink = (): string => {
    let base = 'https://mattyu99.github.io/family-ledger/';
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
      base = window.location.origin + window.location.pathname;
    }
    return `${base}?invite=${inviteCode}&join=${currentLedger.id}`;
  };

  // 確認切換至新邀請碼帳本
  const confirmPendingInvite = async (name?: string, avatar?: string, claimedMember?: Profile) => {
    if (pendingInviteCode) {
      const joinName = name || (currentUser.display_name !== '家庭成員' ? currentUser.display_name : '媽媽');
      const joinAvatar = avatar || currentUser.avatar_url || '👩';
      await joinLedgerByCode(pendingInviteCode, joinName, joinAvatar, claimedMember);
      setPendingInviteCode(null);
    }
  };

  // 取消切換
  const cancelPendingInvite = () => {
    setPendingInviteCode(null);
  };

  // 離開當前帳本 (回到冷啟動首頁，並從雲端解除成員綁定)
  const leaveCurrentLedger = async () => {
    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const myAuthId = session?.user?.id;
        if (myAuthId) {
          await supabase
            .from('ledger_members')
            .delete()
            .eq('ledger_id', currentLedger.id)
            .eq('user_id', myAuthId);
        }
        // 清除此裝置在該帳本的註冊記錄
        const devId = await getDeviceId();
        await supabase
          .from('member_devices')
          .delete()
          .eq('ledger_id', currentLedger.id)
          .eq('device_id', devId);
      } catch (e) {
        console.warn('雲端退出帳本失敗:', e);
      }
    }

    // 清理此帳本的本地專屬身分與快取記錄
    await AsyncStorage.removeItem(`${STORAGE_KEYS.CURRENT_USER}_${currentLedger.id}`);
    await AsyncStorage.removeItem(`${STORAGE_KEYS.MEMBERS}_${currentLedger.id}`);
    await AsyncStorage.removeItem(`${STORAGE_KEYS.TRANSACTIONS}_${currentLedger.id}`);

    // 重要：自帳本清單中移除當前帳本，避免切換清單殘留幽靈帳本
    setLedgers(prev => prev.filter(l => l.id !== currentLedger.id));

    await AsyncStorage.setItem(STORAGE_KEYS.HAS_JOINED, 'false');
    await AsyncStorage.removeItem(STORAGE_KEYS.LEDGER);
    await AsyncStorage.removeItem(STORAGE_KEYS.USER_ROLE);
    await AsyncStorage.removeItem(STORAGE_KEYS.INVITE_CODE);
    setUserRole('member');
    setIsAdminMode(false);
    setHasJoinedLedger(false);
  };

  // 依帳本 ID 直接在使用者已加入的帳本間無縫切換
  const switchLedgerById = async (targetLedgerId: string) => {
    try {
      setIsAdminMode(false);
      setRecurringRules(prev => prev.filter(r => r.ledger_id === targetLedgerId));
      const { data: { session } } = await supabase.auth.getSession();
      const authUserId = session?.user?.id;
      if (!authUserId) return;

      // 優先從現有 ledgers 狀態中尋找目標帳本
      let targetLedger = ledgers.find(l => l.id === targetLedgerId);
      let targetRole = targetLedger?.userRole || 'member';

      if (!targetLedger && isConfigured) {
        const { data: lData } = await supabase
          .from('ledgers')
          .select('*')
          .eq('id', targetLedgerId)
          .maybeSingle();
        if (lData) {
          targetLedger = lData as unknown as Ledger;
        }
      }

      if (targetLedger) {
        const isCreator = targetLedger.created_by === authUserId;
        if (isCreator) {
          targetRole = 'owner';
        } else if (isConfigured) {
          const { data: memberRow } = await supabase
            .from('ledger_members')
            .select('role')
            .eq('ledger_id', targetLedgerId)
            .eq('user_id', authUserId)
            .maybeSingle();
          if (memberRow?.role) targetRole = memberRow.role as any;
        }

        const validRole: 'owner' | 'admin' | 'member' =
          (targetRole === 'owner' || targetRole === 'admin') ? targetRole : 'member';
        setUserRole(validRole);
        await AsyncStorage.setItem(STORAGE_KEYS.USER_ROLE, validRole);
        await AsyncStorage.setItem(STORAGE_KEYS.LEDGER, JSON.stringify(targetLedger));

        await loadLedgerData(targetLedger, authUserId);
      }
    } catch (e) {
      console.warn('切換帳本失敗:', e);
    }
  };

  // 退出指定帳本（從雲端 ledger_members 徹底刪除關係）
  const leaveLedgerById = async (targetLedgerId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authUserId = session?.user?.id;
      if (authUserId && isConfigured && targetLedgerId !== DEMO_LEDGER_ID) {
        await supabase
          .from('ledger_members')
          .delete()
          .eq('ledger_id', targetLedgerId)
          .eq('user_id', authUserId);

        const devId = await getDeviceId();
        await supabase
          .from('member_devices')
          .delete()
          .eq('ledger_id', targetLedgerId)
          .eq('device_id', devId);
      }

      await AsyncStorage.removeItem(`${STORAGE_KEYS.CURRENT_USER}_${targetLedgerId}`);
      await AsyncStorage.removeItem(`${STORAGE_KEYS.MEMBERS}_${targetLedgerId}`);
      await AsyncStorage.removeItem(`${STORAGE_KEYS.TRANSACTIONS}_${targetLedgerId}`);
      await AsyncStorage.removeItem(`${STORAGE_KEYS.LAST_VISITED_PREFIX}${targetLedgerId}`);
      setUnreadLedgerMap(prev => {
        if (!prev[targetLedgerId]) return prev;
        const next = { ...prev };
        delete next[targetLedgerId];
        return next;
      });

      const remainingLedgers = ledgers.filter(l => l.id !== targetLedgerId);
      setLedgers(remainingLedgers);

      // 若退出的是目前正在使用的帳本，自動切換至其他已加入帳本或返回首頁
      if (currentLedger.id === targetLedgerId) {
        if (remainingLedgers.length > 0 && authUserId) {
          const nextLedger = remainingLedgers[0];
          await switchLedgerById(nextLedger.id);
        } else {
          await leaveCurrentLedger();
        }
      }
    } catch (err) {
      console.warn('退出特定帳本失敗:', err);
    }
  };

  // 更新交易並保存至本地快取
  const saveTransactionsToStorage = async (newTx: Transaction[]) => {
    setTransactions(newTx);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(newTx));
    } catch (e) {
      console.warn('儲存本地記帳資料失敗:', e);
    }
  };

  // 儲存付款帳戶至本地快取
  const savePaymentAccountsToStorage = async (accounts: PaymentAccount[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.PAYMENT_ACCOUNTS, JSON.stringify(accounts));
      if (currentLedger?.id) {
        await AsyncStorage.setItem(`${STORAGE_KEYS.PAYMENT_ACCOUNTS}_${currentLedger.id}`, JSON.stringify(accounts));
      }
    } catch (e) {
      console.warn('儲存付款帳戶快取失敗:', e);
    }
  };

  // 判斷某個成員 ID 是否歸屬於當前使用者本人 (支援 ID 直接比對、名稱別名比對與名冊連動)
  const isAccountBoundToCurrentUser = (userId?: string | null) => {
    if (!userId || !effectiveCurrentUser) return false;
    if (userId === effectiveCurrentUser.id) return true;
    const member = members.find(m => m.id === userId);
    if (member) {
      if (member.id === effectiveCurrentUser.id) return true;
      if (
        member.display_name &&
        effectiveCurrentUser.display_name &&
        member.display_name.trim().toLowerCase() === effectiveCurrentUser.display_name.trim().toLowerCase()
      ) {
        return true;
      }
    }
    return false;
  };

  // 新增付款帳戶 / 信用卡 / 儲值卡
  const addPaymentAccount = async (accountData: Omit<PaymentAccount, 'id' | 'ledger_id' | 'created_at'>): Promise<PaymentAccount> => {
    // 方案 A 權限體系：
    // - 帳本管理員 (effectiveIsOwner) 可為全家新增任何卡片與帳戶
    // - 一般家庭成員可在「我的」視角下自主新增屬於自己的卡片或帳戶
    const isTargetingSelf = !accountData.user_id || isAccountBoundToCurrentUser(accountData.user_id);
    if (!effectiveIsOwner && !isTargetingSelf) {
      safeAlert('權限不足', '只有帳本管理員才能新增全家或其他成員的支付卡片與帳戶');
      throw new Error('只有帳本管理員才能新增全家或其他成員的支付卡片與帳戶');
    }

    const newAcc: PaymentAccount = {
      ...accountData,
      id: generateUUID(),
      ledger_id: currentLedger.id,
      created_at: new Date().toISOString(),
      balance: accountData.balance ?? 0,
    };
    const updated = [...paymentAccounts, newAcc];
    setPaymentAccounts(updated);
    await savePaymentAccountsToStorage(updated);

    if (currentLedger?.id) {
      AsyncStorage.setItem(`${STORAGE_KEYS.ACCOUNTS_INITIALIZED}_${currentLedger.id}`, 'true').catch(() => {});
    }

    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        const { error: insErr } = await supabase.from('payment_accounts').insert(newAcc);
        if (insErr && (insErr.code === '42703' || insErr.message?.includes('card_number'))) {
          // 資料庫若尚未執行 card_number 欄位遷移，降級移除該欄位後寫入
          const { card_number: _, ...fallbackAcc } = newAcc;
          await supabase.from('payment_accounts').insert(fallbackAcc);
        }
      } catch (e) {
        console.warn('雲端新增付款帳戶連線失敗 (已保留本地):', e);
      }
    }
    return newAcc;
  };

  // 修改付款帳戶
  const updatePaymentAccount = async (id: string, data: Partial<PaymentAccount>): Promise<boolean> => {
    const existing = paymentAccounts.find(a => a.id === id);
    // 方案 A 權限體系：
    // - 帳本管理員可修改全家任何卡片與帳戶
    // - 一般家庭成員僅能修改屬於自己的卡片與帳戶，且不可轉移給其他成員
    const isOwnerOfCard = existing && isAccountBoundToCurrentUser(existing.user_id);
    const isChangingToOther = data.user_id !== undefined && data.user_id !== null && !isAccountBoundToCurrentUser(data.user_id);

    if (!effectiveIsOwner && (!isOwnerOfCard || isChangingToOther)) {
      safeAlert('權限不足', '只有帳本管理員才能修改全家或其他成員的支付卡片與帳戶');
      return false;
    }

    const updated = paymentAccounts.map(a => a.id === id ? { ...a, ...data } : a);
    setPaymentAccounts(updated);
    await savePaymentAccountsToStorage(updated);

    if (currentLedger?.id) {
      AsyncStorage.setItem(`${STORAGE_KEYS.ACCOUNTS_INITIALIZED}_${currentLedger.id}`, 'true').catch(() => {});
    }

    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        const { error: updErr } = await supabase.from('payment_accounts').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id);
        if (updErr && (updErr.code === '42703' || updErr.message?.includes('card_number'))) {
          // 資料庫若尚未執行 card_number 欄位遷移，降級移除該欄位後寫入
          const { card_number: _, ...fallbackData } = data;
          await supabase.from('payment_accounts').update({ ...fallbackData, updated_at: new Date().toISOString() }).eq('id', id);
        }
      } catch (e) {
        console.warn('雲端更新付款帳戶失敗:', e);
      }
    }
    return true;
  };

  // 刪除付款帳戶
  const deletePaymentAccount = async (id: string): Promise<boolean> => {
    const deletedAcc = paymentAccounts.find(a => a.id === id);
    // 方案 A 權限體系：
    // - 帳本管理員可刪除全家任何卡片與帳戶
    // - 一般家庭成員僅能刪除屬於自己的卡片與帳戶
    const isOwnerOfCard = deletedAcc && isAccountBoundToCurrentUser(deletedAcc.user_id);

    if (!effectiveIsOwner && !isOwnerOfCard) {
      safeAlert('權限不足', '只有帳本管理員才能刪除全家或其他成員的支付卡片與帳戶');
      return false;
    }

    const updated = paymentAccounts.filter(a => a.id !== id);
    setPaymentAccounts(updated);
    await savePaymentAccountsToStorage(updated);

    // 紀錄已被使用者主動刪除的卡片 ID / 卡片名稱，防止刷新時被自動補齊機制重新復活
    if (currentLedger?.id) {
      try {
        const deletedKey = `${STORAGE_KEYS.DELETED_ACCOUNT_IDS}_${currentLedger.id}`;
        const savedDeletedStr = await AsyncStorage.getItem(deletedKey);
        const deletedList: string[] = savedDeletedStr ? JSON.parse(savedDeletedStr) : [];
        if (!deletedList.includes(id)) deletedList.push(id);
        if (deletedAcc && deletedAcc.name && !deletedList.includes(deletedAcc.name)) {
          deletedList.push(deletedAcc.name);
        }
        await AsyncStorage.setItem(deletedKey, JSON.stringify(deletedList));
        await AsyncStorage.setItem(`${STORAGE_KEYS.ACCOUNTS_INITIALIZED}_${currentLedger.id}`, 'true');
      } catch (err) {
        console.warn('紀錄刪除卡片失敗:', err);
      }
    }

    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        await supabase.from('payment_accounts').delete().eq('id', id);
      } catch (e) {
        console.warn('雲端刪除付款帳戶失敗:', e);
      }
    }
    return true;
  };

  // 一鍵補齊 / 恢復預設示範卡片組合
  const restoreDefaultAccounts = async () => {
    if (!effectiveIsOwner) {
      safeAlert('權限不足', '只有帳本管理員才能恢復預設支付卡片');
      return;
    }
    if (!currentLedger?.id) return;
    try {
      const deletedKey = `${STORAGE_KEYS.DELETED_ACCOUNT_IDS}_${currentLedger.id}`;
      await AsyncStorage.removeItem(deletedKey);

      const defaultOwnerId = currentUser?.id || members[0]?.id;
      const secondOwner = members.find(m => m.id !== defaultOwnerId);
      const secondOwnerId = secondOwner?.id || defaultOwnerId;

      const defaultPresets: Omit<PaymentAccount, 'id' | 'ledger_id' | 'created_at'>[] = [
        {
          name: '富邦 Costco 聯名卡',
          type: 'credit_card',
          user_id: defaultOwnerId,
          last_four_digits: '8829',
          billing_cycle_date: 15,
          balance: 0,
          color: '#1E40AF',
          icon: '💳',
          sort_order: 1,
        },
        {
          name: '國泰 CUBE 卡',
          type: 'credit_card',
          user_id: secondOwnerId,
          last_four_digits: '1234',
          billing_cycle_date: 27,
          balance: 0,
          color: '#047857',
          icon: '💳',
          sort_order: 2,
        },
        {
          name: '爸爸悠遊卡',
          type: 'stored_value',
          user_id: defaultOwnerId,
          last_four_digits: '',
          balance: 350,
          color: '#0284C7',
          icon: '🚌',
          sort_order: 3,
        },
        {
          name: '媽媽悠遊卡',
          type: 'stored_value',
          user_id: secondOwnerId,
          last_four_digits: '',
          balance: 500,
          color: '#EC4899',
          icon: '🚌',
          sort_order: 4,
        },
      ];

      const toInsert: PaymentAccount[] = [];
      for (const preset of defaultPresets) {
        const alreadyExists = paymentAccounts.some(
          a => a.name.trim() === preset.name.trim() ||
               (preset.last_four_digits && a.last_four_digits === preset.last_four_digits)
        );
        if (!alreadyExists) {
          toInsert.push({
            ...preset,
            id: generateUUID(),
            ledger_id: currentLedger.id,
            created_at: new Date().toISOString(),
          });
        }
      }

      if (toInsert.length > 0) {
        const updated = [...paymentAccounts, ...toInsert];
        setPaymentAccounts(updated);
        await savePaymentAccountsToStorage(updated);
        if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
          try {
            await supabase.from('payment_accounts').insert(toInsert);
          } catch (e) {
            console.warn('恢復預設卡片至雲端失敗:', e);
          }
        }
      }
    } catch (err) {
      console.warn('恢復預設卡片失敗:', err);
    }
  };

  const savePaymentMethodsToStorage = async (methods: CustomPaymentMethod[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.PAYMENT_METHODS, JSON.stringify(methods));
      if (currentLedger?.id) {
        await AsyncStorage.setItem(`${STORAGE_KEYS.PAYMENT_METHODS}_${currentLedger.id}`, JSON.stringify(methods));
      }
    } catch (e) {
      console.warn('儲存付款方式快取失敗:', e);
    }
  };

  // 新增自訂付款方式 (僅管理員有權限，雲端同步定義)
  const addPaymentMethod = async (
    data: Omit<CustomPaymentMethod, 'id' | 'sort_order'>
  ): Promise<CustomPaymentMethod> => {
    if (!effectiveIsOwner) {
      safeAlert('權限不足', '只有帳本管理員才能新增付款方式');
      throw new Error('只有帳本管理員才能新增付款方式');
    }
    const newId = generateUUID();
    const maxOrder = paymentMethods.reduce((max, m) => Math.max(max, m.sort_order || 0), 0);
    const newMethod: CustomPaymentMethod = {
      ...data,
      id: newId,
      ledger_id: currentLedger.id,
      sort_order: maxOrder + 1,
      is_enabled: data.is_enabled ?? true,
      is_system: false,
      created_at: new Date().toISOString(),
    };

    const updated = [...paymentMethods, newMethod];
    setPaymentMethods(updated);
    await savePaymentMethodsToStorage(updated);

    // 雲端同步新增定義
    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        await supabase.from('payment_methods').insert({
          id: newId,
          ledger_id: currentLedger.id,
          name: newMethod.name,
          icon: newMethod.icon,
          color: newMethod.color,
          type: newMethod.type || (newMethod.supports_credit_card ? 'e_wallet' : 'other'),
          supports_credit_card: !!newMethod.supports_credit_card,
          is_system: false,
          sort_order: newMethod.sort_order,
        });
      } catch (cloudErr) {
        console.warn('雲端新增付款方式失敗 (已保留本地):', cloudErr);
      }
    }

    return newMethod;
  };

  // 編輯付款方式 (僅管理員有權限，雲端同步定義)
  const updatePaymentMethod = async (
    id: string,
    data: Partial<CustomPaymentMethod>
  ): Promise<boolean> => {
    if (!effectiveIsOwner) {
      safeAlert('權限不足', '只有帳本管理員才能修改付款方式');
      return false;
    }
    const updated = paymentMethods.map(m => {
      if (m.id === id) {
        return {
          ...m,
          ...data,
          // 現金永遠保持啟用
          is_enabled: id === 'cash' ? true : (data.is_enabled ?? m.is_enabled),
        };
      }
      return m;
    });
    setPaymentMethods(updated);
    await savePaymentMethodsToStorage(updated);

    // 雲端同步更新定義
    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        const updatePayload: any = { updated_at: new Date().toISOString() };
        if (data.name !== undefined) updatePayload.name = data.name;
        if (data.icon !== undefined) updatePayload.icon = data.icon;
        if (data.color !== undefined) updatePayload.color = data.color;
        if (data.type !== undefined) updatePayload.type = data.type;
        if (data.supports_credit_card !== undefined) updatePayload.supports_credit_card = data.supports_credit_card;

        await supabase
          .from('payment_methods')
          .update(updatePayload)
          .match({ ledger_id: currentLedger.id, id });
      } catch (cloudErr) {
        console.warn('雲端更新付款方式失敗:', cloudErr);
      }
    }

    return true;
  };

  // 刪除付款方式 (系統預設項目不可刪除，但可停用；僅管理員有權限)
  const deletePaymentMethod = async (id: string): Promise<boolean> => {
    if (!effectiveIsOwner) {
      safeAlert('權限不足', '只有帳本管理員才能刪除付款方式');
      return false;
    }
    const target = paymentMethods.find(m => m.id === id);
    if (target?.is_system) {
      safeAlert('無法刪除', '系統預設的付款方式不可刪除，但您可以將其開關切換為「停用/隱藏」！');
      return false;
    }
    const updated = paymentMethods.filter(m => m.id !== id);
    setPaymentMethods(updated);
    await savePaymentMethodsToStorage(updated);

    // 雲端同步刪除定義
    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        await supabase
          .from('payment_methods')
          .delete()
          .match({ ledger_id: currentLedger.id, id });
      } catch (cloudErr) {
        console.warn('雲端刪除付款方式失敗:', cloudErr);
      }
    }

    return true;
  };

  // 切換啟用/停用（開放全體成員自由設定，僅儲存於本機裝置，不干擾他人）
  const togglePaymentMethodEnabled = async (id: string): Promise<boolean> => {
    if (id === 'cash') {
      safeAlert('不可隱藏', '💵 現金為系統最基本的付款方式，必須保留至少一種付款方式，無法隱藏。');
      return false;
    }
    const updated = paymentMethods.map(m => (m.id === id ? { ...m, is_enabled: !m.is_enabled } : m));
    setPaymentMethods(updated);
    await savePaymentMethodsToStorage(updated);
    return true;
  };

  // 調整排序（開放全體成員自由設定本機前後順序）
  const reorderPaymentMethods = async (methods: CustomPaymentMethod[]): Promise<void> => {
    const reordered = methods.map((m, idx) => ({ ...m, sort_order: idx + 1 }));
    setPaymentMethods(reordered);
    await savePaymentMethodsToStorage(reordered);
  };

  // 恢復預設付款方式清單
  const restoreDefaultPaymentMethods = async (): Promise<void> => {
    if (!effectiveIsOwner) {
      safeAlert('權限不足', '只有帳本管理員才能恢復預設付款方式清單');
      return;
    }
    setPaymentMethods(DEFAULT_PAYMENT_METHODS);
    await savePaymentMethodsToStorage(DEFAULT_PAYMENT_METHODS);
  };

  // 取得付款方式資訊輔助函式
  const getPaymentMethodById = (id?: string): CustomPaymentMethod | undefined => {
    if (!id) return undefined;
    return paymentMethods.find(m => m.id === id) || DEFAULT_PAYMENT_METHODS.find(m => m.id === id);
  };

  const saveRecurringRulesToStorage = async (rules: RecurringRule[], targetLedgerId?: string) => {
    try {
      const ledgerId = targetLedgerId || currentLedger?.id;
      if (ledgerId) {
        const scopedRules = rules.map(r => ({ ...r, ledger_id: ledgerId }));
        await AsyncStorage.setItem(`${STORAGE_KEYS.RECURRING_RULES}_${ledgerId}`, JSON.stringify(scopedRules));
      }
    } catch (e) {
      console.warn('儲存週期扣款規則快取失敗:', e);
    }
  };

  // 新增自訂週期扣款規則
  const addRecurringRule = async (
    ruleData: Omit<RecurringRule, 'id' | 'ledger_id' | 'created_at' | 'updated_at'>
  ): Promise<RecurringRule> => {
    const newRule: RecurringRule = {
      ...ruleData,
      id: generateUUID(),
      ledger_id: currentLedger.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const currentScoped = recurringRules.filter(r => r.ledger_id === currentLedger.id);
    const updated = [newRule, ...currentScoped];
    setRecurringRules(updated);
    await saveRecurringRulesToStorage(updated, currentLedger.id);

    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        await supabase.from('recurring_rules').insert(newRule);
      } catch (err) {
        console.warn('雲端新增週期規則失敗 (本地可用):', err);
      }
    }
    return newRule;
  };

  // 更新週期扣款規則
  const updateRecurringRule = async (
    id: string,
    data: Partial<Omit<RecurringRule, 'id' | 'ledger_id'>>
  ): Promise<boolean> => {
    const updated = recurringRules.map(r => {
      if (r.id === id) {
        return {
          ...r,
          ...data,
          ledger_id: currentLedger.id,
          updated_at: new Date().toISOString(),
        };
      }
      return r;
    });
    setRecurringRules(updated);
    await saveRecurringRulesToStorage(updated, currentLedger.id);

    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        await supabase.from('recurring_rules').update({
          ...data,
          updated_at: new Date().toISOString(),
        }).eq('id', id);
      } catch (err) {
        console.warn('雲端更新週期規則失敗 (本地可用):', err);
      }
    }
    return true;
  };

  // 刪除週期扣款規則
  const deleteRecurringRule = async (id: string): Promise<boolean> => {
    const updated = recurringRules.filter(r => r.id !== id);
    setRecurringRules(updated);
    await saveRecurringRulesToStorage(updated, currentLedger.id);

    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        await supabase.from('recurring_rules').delete().eq('id', id);
      } catch (err) {
        console.warn('雲端刪除週期規則失敗 (本地可用):', err);
      }
    }
    return true;
  };

  // 確認記帳（方案 B：將待繳項目寫入記帳交易並標記本期已記帳）
  const recordRecurringBill = async (
    ruleId: string,
    customAmount?: number,
    transactedAt?: string,
    note?: string,
    targetPeriodDate?: Date
  ): Promise<boolean> => {
    const rule = recurringRules.find(r => r.id === ruleId);
    if (!rule) return false;

    const finalAmount = customAmount !== undefined && customAmount > 0 ? customAmount : rule.default_amount;
    if (!finalAmount || finalAmount <= 0) {
      safeAlert('金額錯誤', '請填寫大於 0 的正確金額');
      return false;
    }

    const txDate = transactedAt || new Date().toISOString();
    // 以所屬帳單期別或指定日期作為週期計算基準（例如補繳上期水電時，期別歸屬為上月，入帳日為今天）
    const periodRefDate = targetPeriodDate || new Date(txDate);
    const periodLabel = getBillPeriodLabel(rule, periodRefDate);
    const autoNote = note !== undefined && note.trim() !== ''
      ? note.trim()
      : `[${rule.name}] ${periodLabel}`;

    await addTransaction({
      amount: finalAmount,
      type: 'expense',
      category_id: rule.category_id,
      paid_by: rule.paid_by || currentUser.id,
      merchant: rule.merchant || rule.name,
      payment_method: rule.payment_method,
      account_id: rule.account_id,
      transacted_at: txDate,
      note: autoNote,
    });

    const periodKey = getCurrentPeriodKey(rule, periodRefDate);
    let nextCurrentInstallment = rule.current_installment;
    let nextIsActive = rule.is_active;
    let isFullyCompleted = false;

    if (rule.is_installment && rule.total_installments && rule.total_installments > 0) {
      const instInfo = getInstallmentInfo(rule, periodRefDate);
      const currentNumber = instInfo ? instInfo.currentInstallmentNumber : (rule.current_installment || 1);
      nextCurrentInstallment = currentNumber + 1;
      if (nextCurrentInstallment > rule.total_installments) {
        nextIsActive = false; // 已全數繳納完畢，自動除役完結！
        isFullyCompleted = true;
      }
    }

    const nextPeriodStr = appendPeriodKey(rule.last_recorded_period, periodKey);

    const updated = recurringRules.map(r => {
      if (r.id === ruleId) {
        return {
          ...r,
          last_recorded_period: nextPeriodStr,
          current_installment: nextCurrentInstallment,
          is_active: nextIsActive,
          updated_at: new Date().toISOString(),
        };
      }
      return r;
    });
    setRecurringRules(updated);
    await saveRecurringRulesToStorage(updated, currentLedger.id);

    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        await supabase.from('recurring_rules').update({
          last_recorded_period: nextPeriodStr,
          current_installment: nextCurrentInstallment,
          is_active: nextIsActive,
          updated_at: new Date().toISOString(),
        }).eq('id', ruleId);
      } catch {}
    }

    if (isFullyCompleted) {
      safeAlert(
        '🎉 分期付款已全額繳清！',
        `恭喜！「${rule.name}」共 ${rule.total_installments} 期已全數入帳結清，系統已自動將此規則完結除役，感謝您的細心記帳！`
      );
    }

    return true;
  };

  // 略過本期帳單
  const skipRecurringBill = async (ruleId: string, periodKey?: string): Promise<boolean> => {
    const rule = recurringRules.find(r => r.id === ruleId);
    if (!rule) return false;

    const targetPeriod = periodKey || getCurrentPeriodKey(rule, new Date());
    let nextCurrentInstallment = rule.current_installment;
    let nextIsActive = rule.is_active;

    if (rule.is_installment && rule.total_installments && rule.total_installments > 0) {
      const instInfo = getInstallmentInfo(rule, new Date());
      const currentNumber = instInfo ? instInfo.currentInstallmentNumber : (rule.current_installment || 1);
      nextCurrentInstallment = currentNumber + 1;
      if (nextCurrentInstallment > rule.total_installments) {
        nextIsActive = false;
      }
    }

    const nextPeriodStr = appendPeriodKey(rule.last_recorded_period, targetPeriod);

    const updated = recurringRules.map(r => {
      if (r.id === ruleId) {
        return {
          ...r,
          last_recorded_period: nextPeriodStr,
          current_installment: nextCurrentInstallment,
          is_active: nextIsActive,
          updated_at: new Date().toISOString(),
        };
      }
      return r;
    });
    setRecurringRules(updated);
    await saveRecurringRulesToStorage(updated, currentLedger.id);

    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        await supabase.from('recurring_rules').update({
          last_recorded_period: nextPeriodStr,
          current_installment: nextCurrentInstallment,
          is_active: nextIsActive,
          updated_at: new Date().toISOString(),
        }).eq('id', ruleId);
      } catch {}
    }
    return true;
  };

  // 恢復/導入常用預設週期規則
  const restoreDefaultRecurringRules = async (): Promise<void> => {
    const utilityCategory = categories.find(c => c.name.includes('水電') || c.name.includes('居家')) || categories[0];
    const defaultCard = paymentAccounts.find(a => a.type === 'credit_card');
    const defaultRules: RecurringRule[] = DEFAULT_RECURRING_PRESETS.map((preset, index) => ({
      id: generateUUID(),
      ledger_id: currentLedger.id,
      name: preset.name,
      amount_type: preset.amount_type,
      default_amount: preset.default_amount,
      category_id: utilityCategory?.id || '',
      merchant: preset.merchant,
      paid_by: currentUser.id,
      payment_method: preset.payment_method,
      account_id: preset.payment_method === 'credit_card' ? defaultCard?.id : undefined,
      frequency: preset.frequency,
      due_day: preset.due_day,
      bimonthly_start_month: (preset as any).bimonthly_start_month,
      is_active: true,
      last_recorded_period: undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    setRecurringRules(defaultRules);
    await saveRecurringRulesToStorage(defaultRules, currentLedger.id);

    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        await supabase.from('recurring_rules').insert(defaultRules);
      } catch {}
    }
  };

  // 快速加值悠遊卡/儲值卡（更新卡片餘額並可自動記錄一筆出資扣款明細）
  const topUpAccountBalance = async (
    id: string,
    topUpAmount: number,
    options?: {
      sourceType?: PaymentMethod | 'cash' | 'credit_card' | 'transfer' | string;
      sourceAccountId?: string;
      payerId?: string;
      recordExpense?: boolean;
      note?: string;
    } | string
  ): Promise<boolean> => {
    try {
      const targetAcc = paymentAccounts.find(a => a.id === id);
      if (!targetAcc) return false;

      const opts = typeof options === 'string' ? { note: options } : (options || {});
      const recordExpense = opts.recordExpense !== false;
      const sourceType = (opts.sourceType || 'cash') as PaymentMethod;
      const sourceAccountId = opts.sourceAccountId;

      const newBalance = Number((targetAcc.balance + topUpAmount).toFixed(2));
      let updatedAccounts = paymentAccounts.map(a => a.id === id ? { ...a, balance: newBalance } : a);

      // 若來源帳戶也是儲值卡 (stored_value) 且非目標卡，自動扣減來源儲值卡之餘額
      if (sourceAccountId && sourceAccountId !== id) {
        const sourceAcc = paymentAccounts.find(a => a.id === sourceAccountId);
        if (sourceAcc && sourceAcc.type === 'stored_value') {
          const srcNewBal = Number((sourceAcc.balance - topUpAmount).toFixed(2));
          updatedAccounts = updatedAccounts.map(a => a.id === sourceAccountId ? { ...a, balance: srcNewBal } : a);
          if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID && !sourceAccountId.startsWith('50000000')) {
            supabase.from('payment_accounts').update({ balance: srcNewBal }).eq('id', sourceAccountId).then();
          }
        }
      }

      setPaymentAccounts(updatedAccounts);
      await savePaymentAccountsToStorage(updatedAccounts);

      if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID && !id.startsWith('50000000')) {
        supabase.from('payment_accounts').update({ balance: newBalance }).eq('id', id).then();
      }

      if (recordExpense) {
        // 自動記錄一筆扣款出資交易
        const trafficCat = categories.find(c => c.name.includes('交通') || c.name.includes('儲值'))
          || categories[0]
          || DEFAULT_CATEGORIES[0];

        // 嚴格確保 validPaidBy 存在於當前家庭成員名冊，避免觸發 Supabase 外鍵報錯
        const candidatePayerId = opts.payerId || targetAcc.user_id || currentUser.id;
        const matchedPayer = members.find(m => m.id === candidatePayerId)
          || members.find(m => m.id === currentUser.id)
          || members[0];
        const validPaidBy = matchedPayer?.id || currentUser.id;

        const isEasyCard = targetAcc.name.includes('悠遊') || targetAcc.name.includes('市民');
        const defaultMerchant = isEasyCard ? '悠遊卡加值' : `${targetAcc.name}加值`;

        await addTransaction({
          amount: topUpAmount,
          type: 'transfer',
          category_id: trafficCat ? trafficCat.id : categories[0]?.id,
          paid_by: validPaidBy,
          merchant: defaultMerchant,
          payment_method: sourceType,
          account_id: sourceAccountId, // 扣款信用卡 ID / 銀行帳戶 ID / 來源儲值卡 ID；若未指定則為 undefined
          linked_transaction_id: targetAcc.id,
          note: opts.note !== undefined ? opts.note : `存入【${targetAcc.name}】`,
          transacted_at: new Date().toISOString(),
        });
      }

      return true;
    } catch (e) {
      console.warn('加值失敗:', e);
      return false;
    }
  };

  // 直接校正儲值卡餘額 (管理員或持卡人本人可操作)
  const adjustAccountBalance = async (id: string, newBalance: number): Promise<boolean> => {
    const targetAcc = paymentAccounts.find(a => a.id === id);
    const isOwnerOfCard = targetAcc && isAccountBoundToCurrentUser(targetAcc.user_id);

    if (!effectiveIsOwner && !isOwnerOfCard) {
      safeAlert('權限不足', '只有帳本管理員或持卡人本人才能校正卡片餘額');
      return false;
    }
    try {
      const updatedAccounts = paymentAccounts.map(a => a.id === id ? { ...a, balance: Number(newBalance.toFixed(2)) } : a);
      setPaymentAccounts(updatedAccounts);
      await savePaymentAccountsToStorage(updatedAccounts);

      if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID && !id.startsWith('50000000')) {
        supabase.from('payment_accounts').update({ balance: Number(newBalance.toFixed(2)) }).eq('id', id).then();
      }
      return true;
    } catch (e) {
      console.warn('校正餘額失敗:', e);
      return false;
    }
  };

  // 切換特定交易的信用卡對帳核銷狀態 (is_reconciled)
  const toggleReconcileTransaction = async (transactionId: string): Promise<boolean> => {
    try {
      let nextReconciled = false;
      const updated = transactions.map(t => {
        if (t.id === transactionId) {
          nextReconciled = !t.is_reconciled;
          return { ...t, is_reconciled: nextReconciled };
        }
        return t;
      });
      setTransactions(updated);
      await saveTransactionsToStorage(updated);

      if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
        try {
          await supabase.from('transactions').update({ is_reconciled: nextReconciled }).eq('id', transactionId);
        } catch {}
      }
      return true;
    } catch (e) {
      console.warn('切換對帳狀態失敗:', e);
      return false;
    }
  };

  // 透過 ID 取得卡片帳戶資料
  const getAccountById = React.useCallback(
    (id?: string): PaymentAccount | undefined => {
      if (!id) return undefined;
      const found = paymentAccounts.find(a => a.id === id);
      if (found) return found;

      // 容錯支援：若舊資料紀錄為示範 ID，智慧對應至當前同名或同末碼的實際卡片
      if (id === '50000000-0000-4000-8000-000000000001') {
        return paymentAccounts.find(a => a.name.includes('富邦') || a.last_four_digits === '8829');
      }
      if (id === '50000000-0000-4000-8000-000000000002') {
        return paymentAccounts.find(a => a.name.includes('國泰') || a.last_four_digits === '1234');
      }
      if (id === '50000000-0000-4000-8000-000000000003') {
        return paymentAccounts.find(a => a.name.includes('爸爸') && a.type === 'stored_value') || paymentAccounts.find(a => a.type === 'stored_value');
      }
      if (id === '50000000-0000-4000-8000-000000000004') {
        return paymentAccounts.find(a => a.name.includes('媽媽') && a.type === 'stored_value');
      }

      return undefined;
    },
    [paymentAccounts]
  );

  // 新增交易（兼顧樂觀更新與雲端同步）
  const addTransaction = async (data: {
    id?: string;
    amount: number;
    type: TransactionType;
    category_id: string;
    paid_by: string;
    merchant?: string;
    note?: string;
    reminder_date?: string;
    reminder_calendar?: CalendarSystem;
    reminder_repeat?: MemoRepeatFrequency;
    completed_by?: string;
    transacted_at?: string;
    payment_method?: PaymentMethod;
    account_id?: string;
    is_reconciled?: boolean;
    completion_note?: string;
    linked_transaction_id?: string;
    splitWithIds?: string[];
  }): Promise<string> => {
    if (currentLedger.is_read_only) {
      safeAlert('🔒 唯讀帳本保護中', `「${currentLedger.name}」已開啟唯讀封存保護，無法新增記帳。\n若需記帳，請先至「切換帳本」解除唯讀鎖定。`);
      throw new Error('此帳本已開啟唯讀保護，無法新增記帳');
    }
    const txId = data.id || generateUUID();
    let cleanMerchant = data.merchant ? data.merchant.trim() : undefined;
    const effectiveReminderCal: CalendarSystem | undefined =
      data.type === 'memo' && data.reminder_date
        ? (data.reminder_repeat === 'lunar_1_15' || data.reminder_repeat === 'lunar_2_16'
            ? 'lunar'
            : (data.reminder_calendar || 'solar'))
        : undefined;
    const effectiveReminderRep: MemoRepeatFrequency | undefined =
      data.type === 'memo' && data.reminder_date
        ? (data.reminder_repeat || 'once')
        : undefined;

    if (data.type === 'memo') {
      cleanMerchant = encodeMemoMerchantTag({
        reminderDate: data.reminder_date,
        reminderCalendar: effectiveReminderCal,
        reminderRepeat: effectiveReminderRep,
        completedBy: data.completed_by,
      });
      if (data.note) {
        const memoTag = extractMemoTag(data.note);
        if (memoTag) recordMemoTag(memoTag);
      }
    } else if (cleanMerchant) {
      recordMerchant(cleanMerchant);
    }

    const { data: { session } } = await supabase.auth.getSession();
    const authUserId = session?.user?.id;
    let validCreatorId: string =
      effectiveCurrentUser?.id && isValidUUID(effectiveCurrentUser.id) && !effectiveCurrentUser.id.startsWith('20000000')
        ? effectiveCurrentUser.id
        : (authUserId && isValidUUID(authUserId)
            ? authUserId
            : (members.find(m => isValidUUID(m.id) && !m.id.startsWith('20000000'))?.id || DEMO_USER_DAD));

    // 嚴格確保 validPaidBy 存在於當前家庭成員名冊，避免觸發 Supabase 外鍵約束失敗
    let candidatePaidBy = data.paid_by;
    let matchedPayer = members.find(m => m.id === candidatePaidBy);
    if (!matchedPayer && candidatePaidBy) {
      const alias = memberAliasMap[candidatePaidBy];
      if (alias) matchedPayer = alias;
    }
    if (!matchedPayer) {
      matchedPayer = members.find(m => m.id === effectiveCurrentUser?.id) || members[0];
    }
    const validPaidBy = matchedPayer?.id || validCreatorId;

    let validLedgerId = currentLedger.id;
    if (!isValidUUID(validLedgerId)) {
      validLedgerId = DEMO_LEDGER_ID;
    }

    // 嚴格確保 validCategoryId 存在於分類列表，避免觸發 Supabase 外鍵約束失敗
    let validCategoryId = data.category_id;
    const catExists = categories.some(c => c.id === validCategoryId);
    if (!catExists) {
      const fallbackCat = categories.find(c => isValidUUID(c.id) && !c.id.startsWith('30000000')) || categories[0];
      if (fallbackCat) {
        validCategoryId = fallbackCat.id;
      }
    }

    const resolvedCategory = getCategoryById(validCategoryId);
    const resolvedAccount = data.account_id ? getAccountById(data.account_id) : undefined;

    const newTx: Transaction = {
      id: txId,
      ledger_id: validLedgerId,
      creator_id: validCreatorId,
      category_id: validCategoryId,
      category: resolvedCategory,
      amount: data.type === 'memo' ? 0 : (data.amount || 0),
      type: data.type,
      reminder_date: data.reminder_date,
      reminder_calendar: effectiveReminderCal,
      reminder_repeat: effectiveReminderRep,
      completed_by: data.completed_by,
      completion_note: data.completion_note || undefined,
      linked_transaction_id: data.linked_transaction_id || undefined,
      paid_by: validPaidBy,
      merchant: cleanMerchant,
      payment_method: data.payment_method || 'cash',
      account_id: data.account_id || undefined,
      payment_account: resolvedAccount,
      is_reconciled: data.is_reconciled || false,
      note: data.note || '',
      transacted_at: data.transacted_at || new Date().toISOString(),
      is_settled: false,
      created_at: new Date().toISOString(),
      splits: data.splitWithIds?.map(userId => ({
        id: generateUUID(),
        transaction_id: txId,
        user_id: isValidUUID(userId) ? userId : validCreatorId,
        split_amount: data.amount / (data.splitWithIds?.length || 1),
        is_settled: false,
      })),
    };

    // 若為儲值卡 (stored_value) 且指定了 account_id，自動增減該卡餘額 (支出扣款、收入退款) 並同步至雲端
    if ((data.type === 'expense' || data.type === 'income') && data.payment_method === 'stored_value' && data.account_id) {
      const delta = data.type === 'expense' ? -data.amount : data.amount;
      let finalNewBalance: number | undefined;
      setPaymentAccounts((prev) => {
        const updated = prev.map(acc => {
          if (acc.id === data.account_id) {
            finalNewBalance = Number((acc.balance + delta).toFixed(2));
            return { ...acc, balance: finalNewBalance };
          }
          return acc;
        });
        savePaymentAccountsToStorage(updated).catch(() => {});
        return updated;
      });

      if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID && !data.account_id.startsWith('50000000')) {
        const targetAcc = paymentAccounts.find(a => a.id === data.account_id);
        const newBal = finalNewBalance !== undefined ? finalNewBalance : (targetAcc ? Number((targetAcc.balance + delta).toFixed(2)) : undefined);
        if (newBal !== undefined) {
          supabase.from('payment_accounts').update({ balance: newBal, updated_at: new Date().toISOString() }).eq('id', data.account_id).then();
        }
      }
    }

    // 樂觀更新本地畫面（預先標記 _isPendingSync，確保在收到雲端成功回執前若重新整理頁面絕不遺失）
    const isOnlinePublishing = isConfigured && isCloudSynced && newTx.ledger_id !== DEMO_LEDGER_ID;
    (newTx as any)._isPendingSync = true;
    const updated = [newTx, ...transactions];
    updated.sort((a, b) => new Date(b.transacted_at).getTime() - new Date(a.transacted_at).getTime());
    setTransactions(updated);
    await saveTransactionsToStorage(updated);

    // 若雲端已連線且為正式雲端帳本，推送至 Supabase PostgreSQL
    if (isOnlinePublishing) {
      try {
        const insertPayload: any = {
          id: newTx.id,
          ledger_id: newTx.ledger_id,
          creator_id: newTx.creator_id,
          category_id: newTx.category_id,
          amount: newTx.amount,
          type: newTx.type,
          paid_by: newTx.paid_by,
          transacted_at: newTx.transacted_at,
          is_settled: newTx.is_settled,
        };

        if (hasMerchantColumnRef.current) {
          insertPayload.merchant = newTx.merchant || null;
          insertPayload.note = newTx.note;
        } else {
          insertPayload.note = newTx.merchant
            ? `[${newTx.merchant}] ${newTx.note || ''}`.trim()
            : newTx.note;
        }

        if (hasPaymentColumnsRef.current) {
          if (newTx.payment_method) insertPayload.payment_method = newTx.payment_method;
          if (newTx.account_id && !newTx.account_id.startsWith('50000000')) {
            insertPayload.account_id = newTx.account_id;
          }
          if (newTx.is_reconciled !== undefined) insertPayload.is_reconciled = newTx.is_reconciled;
        }

        if (newTx.completion_note) insertPayload.completion_note = newTx.completion_note;
        if (newTx.linked_transaction_id && isValidUUID(newTx.linked_transaction_id)) {
          insertPayload.linked_transaction_id = newTx.linked_transaction_id;
        }

        let { error: txError } = await supabase.from('transactions').insert(insertPayload);

        // 若雲端 DB 尚未放寬 check constraint 允許 'memo' (23514)，自動退回為 'transfer' 重試
        if (txError && (txError.code === '23514' || txError.message?.includes('check constraint') || txError.message?.includes('transactions_type_check'))) {
          insertPayload.type = 'transfer';
          const retryTypeRes = await supabase.from('transactions').insert(insertPayload);
          txError = retryTypeRes.error;
        }

        // 如果雲端尚未執行 ALTER TABLE 加欄位導致 42703 (column does not exist) 或 PGRST204，自動切換回相容模式重試
        if (txError && (txError.code === '42703' || txError.code === 'PGRST204' || txError.message?.includes('column') || txError.message?.includes('schema cache'))) {
          hasMerchantColumnRef.current = false;
          hasPaymentColumnsRef.current = false;
          delete insertPayload.merchant;
          delete insertPayload.payment_method;
          delete insertPayload.account_id;
          delete insertPayload.is_reconciled;
          delete insertPayload.completion_note;
          delete insertPayload.linked_transaction_id;
          insertPayload.note = newTx.merchant
            ? `[${newTx.merchant}] ${newTx.note || ''}`.trim()
            : newTx.note;
          const retryRes = await supabase.from('transactions').insert(insertPayload);
          txError = retryRes.error;
        }

        // 若因外鍵 (23503) 約束報錯，自動修正為安全成員與預設分類並重試
        if (txError && (txError.code === '23503' || txError.message?.includes('foreign key'))) {
          delete insertPayload.account_id;
          insertPayload.paid_by = validCreatorId || authUserId;
          insertPayload.category_id = null;
          const retryFkRes = await supabase.from('transactions').insert(insertPayload);
          txError = retryFkRes.error;
        }

        if (txError) {
          console.warn('雲端寫入交易失敗 (保留本地待補同步):', txError.message);
        } else {
          // 雲端確認成功寫入，解除待同步標記並更新快取
          delete (newTx as any)._isPendingSync;
          const freshList = [newTx, ...transactions.filter(t => t.id !== newTx.id)];
          freshList.sort((a, b) => new Date(b.transacted_at).getTime() - new Date(a.transacted_at).getTime());
          saveTransactionsToStorage(freshList).catch(() => {});

          if (newTx.splits && newTx.splits.length > 0) {
            // 同步分攤明細至 transaction_splits
            await supabase.from('transaction_splits').insert(
              newTx.splits.map(s => ({
                id: s.id,
                transaction_id: newTx.id,
                user_id: s.user_id,
                split_amount: s.split_amount,
                is_settled: s.is_settled,
              }))
            );
          }
        }
      } catch (err) {
        console.warn('雲端新增交易連線延遲，已保存於本機稍後重試:', err);
      }
    }
    return txId;
  };

  // 方案 D：家長一鍵撥款 / 轉帳記帳（支援「內部轉帳」與「雙向收支記帳」雙模式）
  const transferAllowance = async (data: {
    amount: number;
    fromMemberId: string;
    toMemberId: string;
    mode?: 'transfer' | 'expense_income';
    expenseCategoryId?: string;
    incomeCategoryId?: string;
    paymentMethod?: PaymentMethod;
    accountId?: string;
    transacted_at?: string;
    note?: string;
  }): Promise<{ success: boolean; error?: string; parentTxId?: string; kidTxId?: string; transferTxId?: string }> => {
    if (currentLedger.is_read_only) {
      return { success: false, error: '此帳本已開啟唯讀封存保護，無法進行轉帳或零用錢發放' };
    }
    if (!data.amount || isNaN(data.amount) || data.amount <= 0) {
      return { success: false, error: '請輸入大於 0 的有效金額' };
    }

    const fromMember = members.find(m => m.id === data.fromMemberId) || getMemberById(data.fromMemberId) || effectiveCurrentUser;
    const toMember = members.find(m => m.id === data.toMemberId) || getMemberById(data.toMemberId);

    if (!toMember) {
      return { success: false, error: '請選擇受款成員' };
    }
    if (fromMember.id === toMember.id) {
      return { success: false, error: '出資成員與受款成員不能相同' };
    }

    const isTransferMode = data.mode !== 'expense_income';

    // 1. 解析出資方支出分類 (優先取指定分類、育兒教育、零用錢)
    let expCat = (data.expenseCategoryId ? getCategoryById(data.expenseCategoryId) : undefined);
    if (!expCat || expCat.type !== 'expense') {
      expCat = categories.find(c => c.type === 'expense' && (c.name.includes('育兒') || c.name.includes('教育') || c.name.includes('零用')))
        || categories.find(c => c.type === 'expense')
        || DEFAULT_CATEGORIES.find(c => c.name === '育兒教育')
        || DEFAULT_CATEGORIES[0];
    }

    // 2. 解析受款方收入分類 (優先取「零用錢」收入分類)
    let incCat = (data.incomeCategoryId ? getCategoryById(data.incomeCategoryId) : undefined);
    if (!incCat || incCat.type !== 'income') {
      incCat = categories.find(c => c.type === 'income' && (c.name.includes('零用') || c.name === '零用錢'))
        || categories.find(c => c.type === 'income')
        || DEFAULT_CATEGORIES.find(c => c.name === '零用錢')
        || DEFAULT_CATEGORIES[7];
    }

    const parentTxId = generateUUID();
    const kidTxId = generateUUID();

    const { data: { session } } = await supabase.auth.getSession();
    const authUserId = session?.user?.id;
    let validCreatorId: string =
      effectiveCurrentUser?.id && isValidUUID(effectiveCurrentUser.id) && !effectiveCurrentUser.id.startsWith('20000000')
        ? effectiveCurrentUser.id
        : (authUserId && isValidUUID(authUserId)
            ? authUserId
            : (members.find(m => isValidUUID(m.id) && !m.id.startsWith('20000000'))?.id || DEMO_USER_DAD));

    let validLedgerId = currentLedger.id;
    if (!isValidUUID(validLedgerId)) {
      validLedgerId = DEMO_LEDGER_ID;
    }

    const baseDate = data.transacted_at ? new Date(data.transacted_at) : new Date();
    const parentTransactedAt = !isNaN(baseDate.getTime()) ? baseDate.toISOString() : new Date().toISOString();
    const kidTransactedAt = !isNaN(baseDate.getTime()) ? new Date(baseDate.getTime() + 1).toISOString() : new Date().toISOString();

    const customNote = (data.note || '').trim();
    const transferNote = customNote ? `給${toMember.display_name}零用錢: ${customNote}` : `給 ${toMember.display_name} 零用錢`;
    const parentNote = customNote ? `給${toMember.display_name}零用錢: ${customNote}` : `給 ${toMember.display_name} 零用錢`;
    const kidNote = customNote ? `${fromMember.display_name}給的零用錢: ${customNote}` : `${fromMember.display_name} 給的零用錢`;

    const resolvedAccount = data.accountId ? getAccountById(data.accountId) : undefined;

    const transferTx: Transaction = {
      id: parentTxId,
      ledger_id: validLedgerId,
      creator_id: validCreatorId,
      category_id: expCat.id,
      category: expCat,
      amount: data.amount,
      type: 'transfer',
      paid_by: fromMember.id,
      completed_by: toMember.id,
      merchant: toMember.display_name,
      payment_method: data.paymentMethod || 'cash',
      account_id: data.accountId || undefined,
      payment_account: resolvedAccount,
      is_reconciled: false,
      note: transferNote,
      transacted_at: parentTransactedAt,
      is_settled: true,
      created_at: new Date().toISOString(),
    };

    const parentTx: Transaction = {
      id: parentTxId,
      ledger_id: validLedgerId,
      creator_id: validCreatorId,
      category_id: expCat.id,
      category: expCat,
      amount: data.amount,
      type: 'expense',
      paid_by: fromMember.id,
      merchant: toMember.display_name,
      payment_method: data.paymentMethod || 'cash',
      account_id: data.accountId || undefined,
      payment_account: resolvedAccount,
      is_reconciled: false,
      note: parentNote,
      transacted_at: parentTransactedAt,
      is_settled: false,
      created_at: new Date().toISOString(),
    };

    const kidTx: Transaction = {
      id: kidTxId,
      ledger_id: validLedgerId,
      creator_id: validCreatorId,
      category_id: incCat.id,
      category: incCat,
      amount: data.amount,
      type: 'income',
      paid_by: toMember.id,
      merchant: fromMember.display_name,
      payment_method: data.paymentMethod || 'cash',
      is_reconciled: false,
      note: kidNote,
      transacted_at: kidTransactedAt,
      is_settled: true,
      created_at: new Date().toISOString(),
    };

    // 若出資方式為儲值卡 (stored_value) 且有指定卡片，扣減該卡餘額並同步雲端
    if (data.paymentMethod === 'stored_value' && data.accountId) {
      let finalNewBalance: number | undefined;
      setPaymentAccounts((prev) => {
        const updated = prev.map(acc => {
          if (acc.id === data.accountId) {
            finalNewBalance = Number((acc.balance - data.amount).toFixed(2));
            return { ...acc, balance: finalNewBalance };
          }
          return acc;
        });
        savePaymentAccountsToStorage(updated).catch(() => {});
        return updated;
      });

      if (isConfigured && validLedgerId !== DEMO_LEDGER_ID && !data.accountId.startsWith('50000000')) {
        const targetAcc = paymentAccounts.find(a => a.id === data.accountId);
        const newBal = finalNewBalance !== undefined ? finalNewBalance : (targetAcc ? Number((targetAcc.balance - data.amount).toFixed(2)) : undefined);
        if (newBal !== undefined) {
          supabase.from('payment_accounts').update({ balance: newBal, updated_at: new Date().toISOString() }).eq('id', data.accountId).then();
        }
      }
    }

    const createdTxs = isTransferMode ? [transferTx] : [parentTx, kidTx];

    // 樂觀更新本地畫面
    const isOnlinePublishing = isConfigured && isCloudSynced && validLedgerId !== DEMO_LEDGER_ID;
    createdTxs.forEach(t => {
      (t as any)._isPendingSync = true;
    });

    setTransactions((prev) => {
      const nextTx = [...createdTxs, ...prev];
      saveTransactionsToStorage(nextTx).catch(() => {});
      return nextTx;
    });

    // 廣播即時通知
    triggerLiveToast({
      id: `allowance-${parentTxId}-${Date.now()}`,
      type: 'insert',
      actorName: fromMember.display_name,
      avatar: fromMember.avatar_url || '🎁',
      title: isTransferMode ? '🎁 零用錢內部轉帳' : '🎁 發放零用錢',
      message: isTransferMode
        ? `轉帳 NT$ ${data.amount.toLocaleString()} 給 ${toMember.display_name}（內部轉帳，不計家庭支出）`
        : `撥款 NT$ ${data.amount.toLocaleString()} 給 ${toMember.display_name}（已自動產生雙向紀錄）`,
      amount: data.amount,
      createdAt: Date.now(),
    });

    // 若正式雲端帳本，同步寫入 Supabase
    if (isOnlinePublishing) {
      try {
        const makePayload = (tx: Transaction) => {
          const payload: any = {
            id: tx.id,
            ledger_id: tx.ledger_id,
            creator_id: tx.creator_id,
            category_id: tx.category_id,
            amount: tx.amount,
            type: tx.type,
            paid_by: tx.paid_by,
            transacted_at: tx.transacted_at,
            is_settled: tx.is_settled,
          };
          if (tx.completed_by) {
            payload.completed_by = tx.completed_by;
          }
          if (hasMerchantColumnRef.current) {
            payload.merchant = tx.merchant || null;
            payload.note = tx.note;
          } else {
            payload.note = tx.merchant ? `[${tx.merchant}] ${tx.note || ''}`.trim() : tx.note;
          }
          if (hasPaymentColumnsRef.current) {
            if (tx.payment_method) payload.payment_method = tx.payment_method;
            if (tx.account_id && !tx.account_id.startsWith('50000000')) payload.account_id = tx.account_id;
            if (tx.is_reconciled !== undefined) payload.is_reconciled = tx.is_reconciled;
          }
          return payload;
        };

        const payloads = createdTxs.map(makePayload);
        let { error: txError } = await supabase.from('transactions').insert(payloads);

        if (txError && (txError.code === '42703' || txError.code === 'PGRST204' || txError.message?.includes('column') || txError.message?.includes('schema cache'))) {
          hasMerchantColumnRef.current = false;
          hasPaymentColumnsRef.current = false;
          const compatPayloads = payloads.map(p => {
            const cp = { ...p };
            delete cp.merchant;
            delete cp.payment_method;
            delete cp.account_id;
            delete cp.is_reconciled;
            return cp;
          });
          const retryRes = await supabase.from('transactions').insert(compatPayloads);
          txError = retryRes.error;
        }

        if (txError && (txError.code === '23503' || txError.message?.includes('foreign key'))) {
          const safePayloads = payloads.map(p => ({
            ...p,
            paid_by: validCreatorId || authUserId,
            category_id: null,
            account_id: null,
          }));
          const retryFkRes = await supabase.from('transactions').insert(safePayloads);
          txError = retryFkRes.error;
        }

        if (txError) {
          console.warn('雲端寫入零用錢交易失敗 (保留本地待補同步):', txError.message);
        } else {
          createdTxs.forEach(t => {
            delete (t as any)._isPendingSync;
          });
        }
      } catch (err: any) {
        console.warn('雲端推送零用錢交易異常:', err?.message || err);
      }
    }

    return {
      success: true,
      parentTxId,
      kidTxId: isTransferMode ? undefined : kidTxId,
      transferTxId: isTransferMode ? parentTxId : undefined,
    };
  };

  // 刪除交易
  const deleteTransaction = async (id: string) => {
    if (currentLedger.is_read_only) {
      safeAlert('🔒 唯讀帳本保護中', `「${currentLedger.name}」已開啟唯讀封存保護，無法刪除記帳。\n若需刪除，請先至「切換帳本」解除唯讀鎖定。`);
      return;
    }
    deletedTxIdsRef.current.add(id);
    const targetTx = transactions.find(t => t.id === id);

    // 若為儲值卡消費、退款或轉帳，更新卡片餘額並同步雲端
    if (targetTx) {
      if ((targetTx.type === 'expense' || targetTx.type === 'income') && targetTx.payment_method === 'stored_value' && targetTx.account_id) {
        const delta = targetTx.type === 'expense' ? targetTx.amount : -targetTx.amount;
        let finalNewBalance: number | undefined;
        setPaymentAccounts((prev) => {
          const updated = prev.map(acc => {
            if (acc.id === targetTx.account_id) {
              finalNewBalance = Number((acc.balance + delta).toFixed(2));
              return { ...acc, balance: finalNewBalance };
            }
            return acc;
          });
          savePaymentAccountsToStorage(updated).catch(() => {});
          return updated;
        });

        if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID && !targetTx.account_id.startsWith('50000000')) {
          const targetAcc = paymentAccounts.find(a => a.id === targetTx.account_id);
          const newBal = finalNewBalance !== undefined ? finalNewBalance : (targetAcc ? Number((targetAcc.balance + delta).toFixed(2)) : undefined);
          if (newBal !== undefined) {
            supabase.from('payment_accounts').update({ balance: newBal, updated_at: new Date().toISOString() }).eq('id', targetTx.account_id).then();
          }
        }
      } else if (targetTx.type === 'transfer') {
        // 1. 若為自儲值卡轉出扣款 (如發放零用錢選擇用儲值卡付款)
        if (targetTx.payment_method === 'stored_value' && targetTx.account_id) {
          const delta = targetTx.amount; // 刪除轉出紀錄，應補回卡片餘額
          let finalNewBalance: number | undefined;
          setPaymentAccounts((prev) => {
            const updated = prev.map(acc => {
              if (acc.id === targetTx.account_id) {
                finalNewBalance = Number((acc.balance + delta).toFixed(2));
                return { ...acc, balance: finalNewBalance };
              }
              return acc;
            });
            savePaymentAccountsToStorage(updated).catch(() => {});
            return updated;
          });
          if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID && !targetTx.account_id.startsWith('50000000')) {
            const targetAcc = paymentAccounts.find(a => a.id === targetTx.account_id);
            const newBal = finalNewBalance !== undefined ? finalNewBalance : (targetAcc ? Number((targetAcc.balance + delta).toFixed(2)) : undefined);
            if (newBal !== undefined) {
              supabase.from('payment_accounts').update({ balance: newBal, updated_at: new Date().toISOString() }).eq('id', targetTx.account_id).then();
            }
          }
        }
        // 2. 若為加值轉存入儲值卡 (例如信用卡或現金加值悠遊卡)
        const targetAcc = paymentAccounts.find(a =>
          (targetTx.linked_transaction_id && a.id === targetTx.linked_transaction_id) ||
          targetTx.merchant === `${a.name}儲值` ||
          targetTx.merchant === `${a.name}加值` ||
          targetTx.note?.includes(`存入【${a.name}】`)
        );
        if (targetAcc && targetAcc.type === 'stored_value') {
          const delta = -targetTx.amount; // 刪除加值紀錄，應扣回加值的金額
          let finalNewBalance: number | undefined;
          setPaymentAccounts((prev) => {
            const updated = prev.map(acc => {
              if (acc.id === targetAcc.id) {
                finalNewBalance = Number((acc.balance + delta).toFixed(2));
                return { ...acc, balance: finalNewBalance };
              }
              return acc;
            });
            savePaymentAccountsToStorage(updated).catch(() => {});
            return updated;
          });
          if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID && !targetAcc.id.startsWith('50000000')) {
            const newBal = finalNewBalance !== undefined ? finalNewBalance : Number((targetAcc.balance + delta).toFixed(2));
            supabase.from('payment_accounts').update({ balance: newBal, updated_at: new Date().toISOString() }).eq('id', targetAcc.id).then();
          }
        }
      }
    }

    // 1. 本地立即清除
    const updated = transactions.filter(t => t.id !== id);
    setTransactions(updated);
    await saveTransactionsToStorage(updated);

    // 2. 記錄至已刪除清單，避免離線補同步時誤當作未上傳交易重新插入
    try {
      const deletedKey = `${STORAGE_KEYS.DELETED_TX_IDS}_${currentLedger.id}`;
      const savedDeletedStr = await AsyncStorage.getItem(deletedKey);
      const deletedList: string[] = savedDeletedStr ? JSON.parse(savedDeletedStr) : [];
      if (!deletedList.includes(id)) {
        deletedList.push(id);
        if (deletedList.length > 500) deletedList.shift();
        await AsyncStorage.setItem(deletedKey, JSON.stringify(deletedList));
      }
    } catch {}

    // 3. 即時廣播給所有已連線裝置（跨裝置毫秒級同步）
    if (channelRef.current) {
      try {
        channelRef.current.send({
          type: 'broadcast',
          event: 'TX_DELETED',
          payload: {
            id,
            actorName: effectiveCurrentUser?.display_name || '家人',
            ledgerId: currentLedger.id,
          },
        });
      } catch (err) {
        console.warn('Realtime 廣播刪除事件失敗:', err);
      }
    }

    // 4. 雲端同步刪除
    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        await supabase.from('transaction_splits').delete().eq('transaction_id', id);
        // 先寫入墓碑表以防舊裝置復活（即使資料庫尚未設定觸發器也具雙重防護）
        try {
          await supabase.from('deleted_transactions').insert({ id, ledger_id: currentLedger.id });
        } catch {}
        const { error } = await supabase.from('transactions').delete().eq('id', id);
        if (error) console.warn('雲端刪除交易失敗:', error.message);
      } catch (err) {
        console.warn('雲端刪除交易連線失敗:', err);
      }
    }
  };

  // 修改編輯既有交易明細
  const updateTransaction = async (
    id: string,
    data: {
      amount?: number;
      type?: TransactionType;
      category_id?: string;
      paid_by?: string;
      merchant?: string;
      note?: string;
      reminder_date?: string;
      reminder_calendar?: CalendarSystem;
      reminder_repeat?: MemoRepeatFrequency;
      completed_by?: string;
      completion_note?: string;
      linked_transaction_id?: string;
      transacted_at?: string;
      payment_method?: PaymentMethod;
      account_id?: string;
      is_reconciled?: boolean;
      is_settled?: boolean;
    }
  ): Promise<boolean> => {
    if (currentLedger.is_read_only) {
      safeAlert('🔒 唯讀帳本保護中', `「${currentLedger.name}」已開啟唯讀封存保護，無法修改記帳。\n若需修改，請先至「切換帳本」解除唯讀鎖定。`);
      return false;
    }
    try {
      const targetTx = transactions.find(t => t.id === id);
      const isTargetMemo = data.type === 'memo' || targetTx?.type === 'memo';
      let cleanMerchant = data.merchant !== undefined ? (data.merchant ? data.merchant.trim() : undefined) : undefined;

      let effectiveReminder: string | undefined;
      let effectiveCalendar: CalendarSystem | undefined;
      let effectiveRepeat: MemoRepeatFrequency | undefined;
      let effectiveSettled: boolean | undefined;

      if (isTargetMemo) {
        effectiveSettled = data.is_settled !== undefined ? data.is_settled : targetTx?.is_settled;
        const effectiveCompletedBy = effectiveSettled
          ? (data.completed_by !== undefined ? data.completed_by : targetTx?.completed_by)
          : undefined;
        effectiveReminder = data.reminder_date !== undefined
          ? (data.reminder_date || undefined)
          : targetTx?.reminder_date;
        const rawRepeat = data.reminder_repeat !== undefined
          ? data.reminder_repeat
          : (targetTx?.reminder_repeat || 'once');
        const rawCal = data.reminder_calendar !== undefined
          ? data.reminder_calendar
          : (targetTx?.reminder_calendar || 'solar');

        effectiveCalendar = effectiveReminder
          ? (rawRepeat === 'lunar_1_15' || rawRepeat === 'lunar_2_16' ? 'lunar' : rawCal)
          : undefined;
        effectiveRepeat = effectiveReminder ? rawRepeat : undefined;

        cleanMerchant = encodeMemoMerchantTag({
          reminderDate: effectiveReminder,
          reminderCalendar: effectiveCalendar,
          reminderRepeat: effectiveRepeat,
          completedBy: effectiveCompletedBy,
        });
        const currentMemoNote = data.note !== undefined ? data.note : targetTx?.note;
        if (currentMemoNote) {
          const memoTag = extractMemoTag(currentMemoNote);
          if (memoTag) recordMemoTag(memoTag);
        }
      } else if (cleanMerchant) {
        recordMerchant(cleanMerchant);
      }

      // 儲值卡餘額連動校正
      const oldAmount = targetTx?.amount || 0;
      const oldMethod = targetTx?.payment_method;
      const oldAccId = targetTx?.account_id;
      const oldType = targetTx?.type;

      const newAmount = data.amount !== undefined ? data.amount : oldAmount;
      const newMethod = data.payment_method !== undefined ? data.payment_method : oldMethod;
      const newAccId = data.account_id !== undefined ? data.account_id : oldAccId;
      const newType = data.type !== undefined ? data.type : oldType;

      let nextAccounts: PaymentAccount[] = [];
      const affectedAccIds = new Set<string>();

      if ((oldType === 'expense' || oldType === 'income') && oldMethod === 'stored_value' && oldAccId) {
        // 退回舊交易對餘額之影響 (舊為支出則退回+，舊為收入則退回-)
        const oldRefundDelta = oldType === 'expense' ? oldAmount : -oldAmount;
        affectedAccIds.add(oldAccId);

        setPaymentAccounts((prev) => {
          let updated = prev.map(acc => acc.id === oldAccId ? { ...acc, balance: Number((acc.balance + oldRefundDelta).toFixed(2)) } : acc);
          if ((newType === 'expense' || newType === 'income') && newMethod === 'stored_value' && newAccId) {
            affectedAccIds.add(newAccId);
            const newApplyDelta = newType === 'expense' ? -newAmount : newAmount;
            updated = updated.map(acc => acc.id === newAccId ? { ...acc, balance: Number((acc.balance + newApplyDelta).toFixed(2)) } : acc);
          }
          savePaymentAccountsToStorage(updated).catch(() => {});
          nextAccounts = updated;
          return updated;
        });
      } else if ((newType === 'expense' || newType === 'income') && newMethod === 'stored_value' && newAccId) {
        // 應用新交易之餘額影響
        affectedAccIds.add(newAccId);
        const newApplyDelta = newType === 'expense' ? -newAmount : newAmount;
        setPaymentAccounts((prev) => {
          const updated = prev.map(acc => acc.id === newAccId ? { ...acc, balance: Number((acc.balance + newApplyDelta).toFixed(2)) } : acc);
          savePaymentAccountsToStorage(updated).catch(() => {});
          nextAccounts = updated;
          return updated;
        });
      }

      if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID && affectedAccIds.size > 0) {
        affectedAccIds.forEach(accId => {
          if (!accId.startsWith('50000000')) {
            const found = nextAccounts.find(a => a.id === accId) || paymentAccounts.find(a => a.id === accId);
            if (found) {
              supabase.from('payment_accounts').update({ balance: found.balance, updated_at: new Date().toISOString() }).eq('id', accId).then();
            }
          }
        });
      }

      const updatedTxs = transactions.map(t => {
        if (t.id === id) {
          const effectivePaidBy = data.paid_by !== undefined ? data.paid_by : t.paid_by;
          const canonicalPayer = getMemberById(effectivePaidBy);
          const effectiveAccId = data.account_id !== undefined ? data.account_id : t.account_id;
          const resolvedAccount = effectiveAccId ? getAccountById(effectiveAccId) : undefined;
          const rowSettled = data.is_settled !== undefined ? data.is_settled : t.is_settled;
          const rowCompletedBy = rowSettled
            ? (data.completed_by !== undefined ? data.completed_by : t.completed_by)
            : undefined;
          return {
            ...t,
            ...data,
            amount: isTargetMemo ? 0 : (data.amount !== undefined ? data.amount : t.amount),
            reminder_date: isTargetMemo ? effectiveReminder : (data.reminder_date !== undefined ? (data.reminder_date || undefined) : t.reminder_date),
            reminder_calendar: isTargetMemo ? effectiveCalendar : t.reminder_calendar,
            reminder_repeat: isTargetMemo ? effectiveRepeat : t.reminder_repeat,
            completed_by: rowCompletedBy,
            completion_note: data.completion_note !== undefined ? (data.completion_note || undefined) : t.completion_note,
            linked_transaction_id: data.linked_transaction_id !== undefined ? (data.linked_transaction_id || undefined) : t.linked_transaction_id,
            merchant: (data.merchant !== undefined || isTargetMemo) ? cleanMerchant : t.merchant,
            category: data.category_id ? getCategoryById(data.category_id, t.category) : t.category,
            payer_profile: canonicalPayer || t.payer_profile,
            payment_account: resolvedAccount || t.payment_account,
          };
        }
        return t;
      });

      // 方案 2：辦妥週期提醒生活記事時，自動接力產生下一期未辦妥提醒
      let nextMemoTx: Transaction | null = null;
      if (
        isTargetMemo &&
        targetTx &&
        !targetTx.is_settled &&
        effectiveSettled === true &&
        effectiveReminder &&
        effectiveRepeat &&
        effectiveRepeat !== 'once'
      ) {
        const nextReminderYmd = getNextMemoReminderDate(
          effectiveReminder,
          effectiveRepeat,
          effectiveCalendar || 'solar'
        );
        const effectiveNote = data.note !== undefined ? data.note : (targetTx.note || '');
        if (nextReminderYmd && nextReminderYmd !== effectiveReminder) {
          const alreadyExists = updatedTxs.some(
            t =>
              t.type === 'memo' &&
              !t.is_settled &&
              t.reminder_date === nextReminderYmd &&
              (t.note || '').trim() === effectiveNote.trim()
          );
          if (!alreadyExists) {
            const nextMerchantTag = encodeMemoMerchantTag({
              reminderDate: nextReminderYmd,
              reminderCalendar: effectiveCalendar,
              reminderRepeat: effectiveRepeat,
            });
            nextMemoTx = {
              id: generateUUID(),
              ledger_id: targetTx.ledger_id,
              creator_id: targetTx.creator_id,
              category_id: targetTx.category_id,
              category: targetTx.category,
              amount: 0,
              type: 'memo',
              reminder_date: nextReminderYmd,
              reminder_calendar: effectiveCalendar,
              reminder_repeat: effectiveRepeat,
              completed_by: undefined,
              paid_by: targetTx.paid_by,
              payer_profile: targetTx.payer_profile,
              merchant: nextMerchantTag,
              payment_method: targetTx.payment_method || 'cash',
              is_reconciled: false,
              note: effectiveNote,
              transacted_at: new Date().toISOString(),
              is_settled: false,
              created_at: new Date().toISOString(),
            };
          }
        }
      }

      const finalTxs = nextMemoTx ? [nextMemoTx, ...updatedTxs] : updatedTxs;
      finalTxs.sort((a, b) => new Date(b.transacted_at).getTime() - new Date(a.transacted_at).getTime());
      await saveTransactionsToStorage(finalTxs);

      if (nextMemoTx) {
        const memoParsed = parseMemoNote(nextMemoTx.note);
        const nextBadge = formatMemoReminderBadge(
          nextMemoTx.reminder_date,
          nextMemoTx.reminder_calendar,
          nextMemoTx.reminder_repeat
        );
        triggerLiveToast({
          id: `next-memo-${nextMemoTx.id}-${Date.now()}`,
          type: 'info',
          actorName: effectiveCurrentUser?.display_name || '系統提醒',
          avatar: memoParsed.icon || '🔄',
          title: '🔄 已自動接力排入下一期提醒！',
          message: `【${memoParsed.title}】${memoParsed.cleanContent} → 下次提醒：${nextBadge?.fullText || nextMemoTx.reminder_date}`,
          createdAt: Date.now(),
        });
      }

      if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
        const updatePayload: any = {};
        if (data.amount !== undefined) updatePayload.amount = isTargetMemo ? 0 : data.amount;
        if (data.type !== undefined) updatePayload.type = data.type;
        if (data.category_id !== undefined) updatePayload.category_id = data.category_id;
        if (data.paid_by !== undefined) updatePayload.paid_by = data.paid_by;
        if (data.transacted_at !== undefined) updatePayload.transacted_at = data.transacted_at;
        if (data.payment_method !== undefined) updatePayload.payment_method = data.payment_method;
        if (data.account_id !== undefined) updatePayload.account_id = data.account_id;
        if (data.is_reconciled !== undefined) updatePayload.is_reconciled = data.is_reconciled;
        if (data.is_settled !== undefined) updatePayload.is_settled = data.is_settled;
        if (data.completion_note !== undefined) updatePayload.completion_note = data.completion_note || null;
        if (data.linked_transaction_id !== undefined) updatePayload.linked_transaction_id = data.linked_transaction_id || null;
        updatePayload.updated_at = new Date().toISOString();

        if (hasMerchantColumnRef.current) {
          if (data.merchant !== undefined || isTargetMemo) updatePayload.merchant = cleanMerchant || null;
          if (data.note !== undefined) updatePayload.note = data.note;
        } else {
          // 若雲端無 merchant 欄位，包裝進 note
          const effectiveMerchant = (data.merchant !== undefined || isTargetMemo) ? cleanMerchant : targetTx?.merchant;
          const effectiveNote = data.note !== undefined ? data.note : (targetTx?.note || '');
          if (data.merchant !== undefined || data.note !== undefined || isTargetMemo) {
            updatePayload.note = effectiveMerchant
              ? `[${effectiveMerchant}] ${effectiveNote}`.trim()
              : effectiveNote;
          }
        }

        let { error } = await supabase
          .from('transactions')
          .update(updatePayload)
          .eq('id', id);

        if (error && (error.code === '23514' || error.message?.includes('check constraint') || error.message?.includes('transactions_type_check'))) {
          updatePayload.type = 'transfer';
          const retryTypeRes = await supabase.from('transactions').update(updatePayload).eq('id', id);
          error = retryTypeRes.error;
        }

        if (error && (error.code === '42703' || error.code === 'PGRST204' || error.message?.includes('column') || error.message?.includes('schema cache'))) {
          hasMerchantColumnRef.current = false;
          hasPaymentColumnsRef.current = false;
          delete updatePayload.merchant;
          delete updatePayload.payment_method;
          delete updatePayload.account_id;
          delete updatePayload.is_reconciled;
          delete updatePayload.completion_note;
          delete updatePayload.linked_transaction_id;
          const effectiveMerchant = data.merchant !== undefined ? cleanMerchant : targetTx?.merchant;
          const effectiveNote = data.note !== undefined ? data.note : (targetTx?.note || '');
          updatePayload.note = effectiveMerchant
            ? `[${effectiveMerchant}] ${effectiveNote}`.trim()
            : effectiveNote;
          const retryRes = await supabase.from('transactions').update(updatePayload).eq('id', id);
          error = retryRes.error;
        }

        if (error) {
          console.warn('雲端更新交易失敗:', error);
          return false;
        }

        // 若有自動接力產生的下一期記事，一併同步寫入雲端
        if (nextMemoTx) {
          try {
            const nextInsertPayload: any = {
              id: nextMemoTx.id,
              ledger_id: nextMemoTx.ledger_id,
              creator_id: nextMemoTx.creator_id,
              category_id: nextMemoTx.category_id,
              amount: 0,
              type: 'memo',
              paid_by: nextMemoTx.paid_by,
              transacted_at: nextMemoTx.transacted_at,
              is_settled: false,
            };
            if (hasMerchantColumnRef.current) {
              nextInsertPayload.merchant = nextMemoTx.merchant || null;
              nextInsertPayload.note = nextMemoTx.note;
            } else {
              nextInsertPayload.note = nextMemoTx.merchant
                ? `[${nextMemoTx.merchant}] ${nextMemoTx.note || ''}`.trim()
                : nextMemoTx.note;
            }
            let { error: nextErr } = await supabase.from('transactions').insert(nextInsertPayload);
            if (nextErr && (nextErr.code === '23514' || nextErr.message?.includes('check constraint'))) {
              nextInsertPayload.type = 'transfer';
              await supabase.from('transactions').insert(nextInsertPayload);
            }
          } catch (nextSyncErr) {
            console.warn('雲端同步下一期週期記事失敗:', nextSyncErr);
          }
        }
      }

      // 即時廣播更新事件給所有已連線裝置（跨裝置即時反應更新者）
      if (channelRef.current) {
        try {
          const updaterId = effectiveCurrentUser?.id || currentUser?.id;
          const updater = getMemberById(updaterId);
          const updaterName = updater?.display_name || '家人';
          const updaterAvatar = updater?.avatar_url || '✏️';
          if (updaterId) {
            recentUpdatersRef.current.set(id, { updaterId, updaterName, updaterAvatar, timestamp: Date.now() });
            channelRef.current.send({
              type: 'broadcast',
              event: 'TX_UPDATED',
              payload: {
                id,
                updaterId,
                updaterName,
                updaterAvatar,
                ledgerId: currentLedger.id,
              },
            });
          }
        } catch (err) {}
      }

      return true;
    } catch (err) {
      console.warn('更新交易例外錯誤:', err);
      return false;
    }
  };

  // 一鍵切換生活記事完成/待辦狀態（自動記錄是哪位家庭成員打勾完成的）
  const toggleMemoSettled = async (id: string, completedByUserId?: string): Promise<boolean> => {
    const target = transactions.find(t => t.id === id);
    if (!target) return false;
    const nextSettled = !target.is_settled;
    const effectiveCompleter = nextSettled
      ? (completedByUserId || effectiveCurrentUser?.id || currentUser?.id)
      : undefined;

    // 即時廣播給所有已連線裝置（跨裝置毫秒級通知）
    if (channelRef.current) {
      try {
        const actor = getMemberById(effectiveCompleter || effectiveCurrentUser?.id || currentUser?.id);
        channelRef.current.send({
          type: 'broadcast',
          event: 'TX_MEMO_TOGGLED',
          payload: {
            id,
            is_settled: nextSettled,
            completed_by: effectiveCompleter,
            actorId: effectiveCompleter || effectiveCurrentUser?.id || currentUser?.id,
            actorName: actor?.display_name || '家人',
            actorAvatar: actor?.avatar_url || (nextSettled ? '✓' : '⚪'),
            ledgerId: currentLedger.id,
          },
        });
      } catch (err) {
        console.warn('Realtime 廣播待辦切換事件失敗:', err);
      }
    }

    return updateTransaction(id, {
      is_settled: nextSettled,
      completed_by: effectiveCompleter,
    });
  };

  // 切換生活記事內特定子檢核清單項目的勾選狀態 [ ] <-> [x]
  const toggleMemoChecklistItem = React.useCallback(async (transactionId: string, itemIndex: number): Promise<boolean> => {
    const targetTx = transactions.find(t => t.id === transactionId);
    if (!targetTx || !targetTx.note) return false;
    const nextNote = toggleChecklistItem(targetTx.note, itemIndex);
    if (nextNote === targetTx.note) return false;
    return updateTransaction(transactionId, { note: nextNote });
  }, [transactions, updateTransaction]);

  // 匯出為 CSV 格式 (自帶 UTF-8 BOM，防止 Windows Excel 雙擊開啟出現繁體中文亂碼)
  const exportToCSV = (): string => {
    const BOM = '\uFEFF';
    const headers = ['日期', '類型', '分類', '金額', '付款人', '店家/對象', '備註'];
    const rows = transactions.map(t => {
      const cat = getCategoryById(t.category_id, t.category)?.name || '未分類';
      const payer = getMemberById(t.paid_by)?.display_name || t.payer_profile?.display_name || '家庭成員';
      const typeStr = t.type === 'expense' ? '支出' : '收入';
      const dateStr = t.transacted_at ? new Date(t.transacted_at).toLocaleDateString('zh-TW') : '';
      return `"${dateStr}","${typeStr}","${cat}",${t.amount},"${payer}","${(t.merchant || '').replace(/"/g, '""')}","${(t.note || '').replace(/"/g, '""')}"`;
    });
    return BOM + [headers.join(','), ...rows].join('\n');
  };

  // 匯出為完整 JSON 結構備份檔 (包含帳本資訊、家庭成員、自訂分類、支付卡片帳戶、所有記帳明細)
  const exportToJSON = (): string => {
    const backupData = {
      app: '甜心記帳本',
      version: APP_FULL_VERSION,
      exported_at: new Date().toISOString(),
      ledger: {
        id: currentLedger.id,
        name: currentLedger.name,
        invite_code: inviteCode,
        is_read_only: currentLedger.is_read_only,
      },
      members: members.map(m => ({
        id: m.id,
        display_name: m.display_name,
        avatar_url: m.avatar_url,
        role: m.role,
      })),
      categories: categories.map(c => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        color: c.color,
        type: c.type,
        sort_order: c.sort_order,
      })),
      payment_accounts: paymentAccounts.map(a => ({
        id: a.id,
        name: a.name,
        type: a.type,
        user_id: a.user_id,
        last_four_digits: a.last_four_digits,
        billing_cycle_date: a.billing_cycle_date,
        balance: a.balance,
        color: a.color,
        icon: a.icon,
        sort_order: a.sort_order,
      })),
      transactions: transactions.map(t => ({
        id: t.id,
        amount: t.amount,
        type: t.type,
        reminder_date: t.reminder_date,
        completed_by: t.completed_by,
        category_id: t.category_id,
        paid_by: t.paid_by,
        transacted_at: t.transacted_at,
        merchant: t.merchant,
        note: t.note,
        payment_method: t.payment_method,
        account_id: t.account_id,
        is_reconciled: t.is_reconciled,
        is_settled: t.is_settled,
      })),
      recurring_rules: recurringRules
        .filter(r => !r.ledger_id || r.ledger_id === currentLedger.id)
        .map(r => ({
        id: r.id,
        name: r.name,
        amount_type: r.amount_type,
        default_amount: r.default_amount,
        category_id: r.category_id,
        merchant: r.merchant,
        paid_by: r.paid_by,
        payment_method: r.payment_method,
        account_id: r.account_id,
        frequency: r.frequency,
        due_day: r.due_day,
        bimonthly_start_month: r.bimonthly_start_month,
        is_active: r.is_active,
        last_recorded_period: r.last_recorded_period,
        is_installment: r.is_installment,
        total_installments: r.total_installments,
        current_installment: r.current_installment,
        installment_start_period: r.installment_start_period,
        note: r.note,
      })),
      payment_methods: paymentMethods.map(m => ({
        id: m.id,
        name: m.name,
        icon: m.icon,
        color: m.color,
        type: m.type,
        supports_credit_card: m.supports_credit_card,
        is_enabled: m.is_enabled,
        is_system: m.is_system,
        sort_order: m.sort_order,
      })),
    };
    return JSON.stringify(backupData, null, 2);
  };

  // 從完整 JSON 結構備份檔還原資料
  const restoreFromJSON = async (
    jsonStr: string,
    options?: { mode?: 'merge' | 'overwrite' }
  ): Promise<{ success: boolean; message: string; restoredCount?: number }> => {
    if (!effectiveIsOwner) {
      return { success: false, message: '權限不足：只有帳本管理員才能回復帳本資料' };
    }
    const mode = options?.mode || 'merge';
    try {
      if (!jsonStr || typeof jsonStr !== 'string' || !jsonStr.trim()) {
        return { success: false, message: '請提供有效的 JSON 備份內容' };
      }

      let backup: any;
      try {
        backup = JSON.parse(jsonStr.trim());
      } catch {
        return { success: false, message: 'JSON 格式解析錯誤，請確認文字內容完整' };
      }

      if (!backup || typeof backup !== 'object') {
        return { success: false, message: '備份檔內容格式不正確' };
      }

      if (!Array.isArray(backup.transactions)) {
        return { success: false, message: '備份檔中缺少交易明細資料 (transactions)' };
      }

      const isRealCloud = isConfigured && currentLedger?.id && currentLedger.id !== DEMO_LEDGER_ID;

      // 若備份檔標記此帳本為唯讀封存 (is_read_only)，自動同步啟用唯讀保護
      if (backup.ledger?.is_read_only) {
        await AsyncStorage.setItem(`${STORAGE_KEYS.LEDGER_READ_ONLY}_${currentLedger.id}`, 'true');
        setCurrentLedger(prev => ({ ...prev, is_read_only: true }));
        setLedgers(prev => prev.map(l => l.id === currentLedger.id ? { ...l, is_read_only: true } : l));
        if (isRealCloud) {
          try {
            await supabase.from('ledgers').update({ is_read_only: true }).eq('id', currentLedger.id);
          } catch {}
        }
      }

      // 1. 還原/合併 家庭成員 (Members)
      let nextMembers = [...members];
      const memberIdMap: Record<string, string> = {};

      // 預設將現有成員自身的 ID 映射給自己
      nextMembers.forEach(m => {
        if (m.id) {
          memberIdMap[m.id] = m.id;
        }
      });

      if (Array.isArray(backup.members) && backup.members.length > 0) {
        const validBackupMembers = backup.members.filter(
          (m: any) => m && (m.display_name || m.name)
        );

        if (mode === 'overwrite') {
          // 覆蓋模式：以備份成員名冊為骨幹，但嚴格保留當前裝置操作者 currentUser
          const newMemberList: Profile[] = [];
          if (currentUser?.id) {
            newMemberList.push({ ...currentUser });
            memberIdMap[currentUser.id] = currentUser.id;
          }

          for (const bm of validBackupMembers) {
            const rawName = (bm.display_name || bm.name || '').trim();
            const nameKey = rawName.toLowerCase();
            const backupId = bm.id;

            // 檢查是否與已加入清單（如 currentUser）重名或同 ID
            const existing = newMemberList.find(
              m => (backupId && m.id === backupId) ||
                   (m.display_name || '').trim().toLowerCase() === nameKey
            );

            if (existing) {
              if (backupId) {
                memberIdMap[backupId] = existing.id;
              }
              if (bm.avatar_url && !existing.avatar_url) {
                existing.avatar_url = bm.avatar_url;
              }
            } else {
              const isDemoConst = backupId?.startsWith('20000000');
              const targetId = (backupId && isValidUUID(backupId) && (!isRealCloud || !isDemoConst))
                ? backupId
                : generateUUID();

              const restoredProf: Profile = {
                id: targetId,
                display_name: rawName,
                avatar_url: bm.avatar_url || '😊',
                role: bm.role || 'member',
                email: bm.email || `${rawName.toLowerCase()}@family.local`,
              };
              newMemberList.push(restoredProf);
              if (backupId) {
                memberIdMap[backupId] = targetId;
              }
            }
          }
          nextMembers = deduplicateMembers(newMemberList);
        } else {
          // 合併模式 (merge)：保留現有名冊，去重補入備份檔中不存在的新成員
          for (const bm of validBackupMembers) {
            const rawName = (bm.display_name || bm.name || '').trim();
            const nameKey = rawName.toLowerCase();
            const backupId = bm.id;

            const existing = nextMembers.find(
              m => (backupId && m.id === backupId) ||
                   (m.display_name || '').trim().toLowerCase() === nameKey
            );

            if (existing) {
              if (backupId) {
                memberIdMap[backupId] = existing.id;
              }
            } else {
              const isDemoConst = backupId?.startsWith('20000000');
              const targetId = (backupId && isValidUUID(backupId) && (!isRealCloud || !isDemoConst))
                ? backupId
                : generateUUID();

              const newProf: Profile = {
                id: targetId,
                display_name: rawName,
                avatar_url: bm.avatar_url || '😊',
                role: bm.role || 'member',
                email: bm.email || `${rawName.toLowerCase()}@family.local`,
              };
              nextMembers.push(newProf);
              if (backupId) {
                memberIdMap[backupId] = targetId;
              }
            }
          }
          nextMembers = deduplicateMembers(nextMembers);
        }

        setMembers(nextMembers);
        await AsyncStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(nextMembers));
        if (currentLedger?.id) {
          await AsyncStorage.setItem(`${STORAGE_KEYS.MEMBERS}_${currentLedger.id}`, JSON.stringify(nextMembers));
        }

        // 若為已連線之 Supabase 雲端帳本，同步建立 profiles 與 ledger_members
        if (isRealCloud) {
          try {
            for (const m of nextMembers) {
              await supabase.from('profiles').upsert({
                id: m.id,
                display_name: m.display_name,
                avatar_url: m.avatar_url || '😊',
                email: m.email || `${(m.display_name || 'member').toLowerCase()}@family.local`,
              });
              await supabase.from('ledger_members').upsert({
                ledger_id: currentLedger.id,
                user_id: m.id,
                role: m.role || 'member',
              });
            }
          } catch (e) {
            console.warn('雲端還原同步成員名冊失敗:', e);
          }
        }

        // 重新構建成員別名映射表
        const updatedAliasMap = buildMemberAliasMap(nextMembers, nextMembers);
        setMemberAliasMap(updatedAliasMap);
        await AsyncStorage.setItem(STORAGE_KEYS.ALIAS_MAP, JSON.stringify(updatedAliasMap));
      }

      // 2. 還原/合併 自訂分類
      let nextCategories = [...categories];
      const categoryIdMap: Record<string, string> = {};

      nextCategories.forEach(c => {
        if (c.id) categoryIdMap[c.id] = c.id;
      });

      if (Array.isArray(backup.categories) && backup.categories.length > 0) {
        if (mode === 'overwrite') {
          const validBackupCats = backup.categories.filter((c: any) => c && c.name && c.id);
          if (validBackupCats.length > 0) {
            nextCategories = validBackupCats.map((bc: any) => {
              if (bc.id) categoryIdMap[bc.id] = bc.id;
              return {
                id: bc.id,
                name: bc.name,
                icon: bc.icon || '📝',
                color: bc.color || '#6B7280',
                type: bc.type || 'expense',
                sort_order: bc.sort_order || 1,
              };
            });
          }
        } else {
          backup.categories.forEach((bc: any) => {
            if (!bc || !bc.name) return;
            const existing = nextCategories.find(c => c.id === bc.id || c.name === bc.name);
            if (existing) {
              if (bc.id) categoryIdMap[bc.id] = existing.id;
            } else {
              const isDemoConst = bc.id?.startsWith('30000000');
              const targetId = (bc.id && isValidUUID(bc.id) && (!isRealCloud || !isDemoConst))
                ? bc.id
                : generateUUID();
              const newCat = {
                id: targetId,
                name: bc.name,
                icon: bc.icon || '📝',
                color: bc.color || '#6B7280',
                type: bc.type || 'expense',
                sort_order: bc.sort_order || nextCategories.length + 1,
              };
              nextCategories.push(newCat);
              if (bc.id) categoryIdMap[bc.id] = targetId;
            }
          });
        }
        setCategories(nextCategories);
        await AsyncStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(nextCategories));
        if (currentLedger?.id) {
          await AsyncStorage.setItem(`${STORAGE_KEYS.CATEGORIES}_${currentLedger.id}`, JSON.stringify(nextCategories));
        }
      }

      // 3. 還原/合併 支付卡片與帳戶
      let nextAccounts = [...paymentAccounts];
      const accountIdMap: Record<string, string> = {};

      nextAccounts.forEach(a => {
        if (a.id) accountIdMap[a.id] = a.id;
      });

      if (Array.isArray(backup.payment_accounts) && backup.payment_accounts.length > 0) {
        const processAccount = (ba: any) => {
          let mappedUserId = ba.user_id;
          if (ba.user_id) {
            if (memberIdMap[ba.user_id]) {
              mappedUserId = memberIdMap[ba.user_id];
            } else if (!nextMembers.some(m => m.id === ba.user_id)) {
              const matchedMember = nextMembers.find(m => m.display_name && ba.name?.includes(m.display_name));
              mappedUserId = matchedMember ? matchedMember.id : undefined;
            }
          }

          const isDemoConst = ba.id?.startsWith('50000000');
          const targetId = (ba.id && isValidUUID(ba.id) && (!isRealCloud || !isDemoConst))
            ? ba.id
            : generateUUID();

          if (ba.id) {
            accountIdMap[ba.id] = targetId;
          }

          return {
            ...ba,
            id: targetId,
            user_id: mappedUserId,
            ledger_id: currentLedger.id,
          };
        };

        if (mode === 'overwrite') {
          nextAccounts = backup.payment_accounts
            .filter((a: any) => a && a.name)
            .map(processAccount);
        } else {
          backup.payment_accounts.forEach((ba: any) => {
            if (!ba || !ba.name) return;
            const existing = nextAccounts.find(
              a => a.id === ba.id || (a.name === ba.name && a.last_four_digits === ba.last_four_digits)
            );
            if (existing) {
              if (ba.id) accountIdMap[ba.id] = existing.id;
            } else {
              nextAccounts.push(processAccount(ba));
            }
          });
        }
        setPaymentAccounts(nextAccounts);
        await savePaymentAccountsToStorage(nextAccounts);

        // 同步卡片至 Supabase 雲端 (若為已連線雲端帳本)
        if (isRealCloud) {
          try {
            const accountsToSync = nextAccounts.map(acc => ({
              id: acc.id,
              ledger_id: currentLedger.id,
              name: acc.name,
              type: acc.type,
              user_id: acc.user_id && nextMembers.some(m => m.id === acc.user_id) ? acc.user_id : null,
              last_four_digits: acc.last_four_digits || '',
              billing_cycle_date: acc.billing_cycle_date || 1,
              balance: acc.balance || 0,
              color: acc.color || '#3B82F6',
              icon: acc.icon || '💳',
              sort_order: acc.sort_order || 1,
            }));
            await supabase.from('payment_accounts').upsert(accountsToSync);
          } catch (e) {
            console.warn('雲端還原同步卡片帳戶失敗:', e);
          }
        }
      }

      // 3.5 還原/合併 週期扣款規則 (Recurring Rules)
      let nextRecurringRules = [...recurringRules];
      if (Array.isArray(backup.recurring_rules) && backup.recurring_rules.length > 0) {
        const processRule = (br: any): RecurringRule => {
          let mappedPaidBy = br.paid_by;
          if (br.paid_by && memberIdMap[br.paid_by]) {
            mappedPaidBy = memberIdMap[br.paid_by];
          } else if (currentUser?.id) {
            mappedPaidBy = currentUser.id;
          }

          let mappedCategoryId = br.category_id;
          if (br.category_id && categoryIdMap[br.category_id]) {
            mappedCategoryId = categoryIdMap[br.category_id];
          }

          let mappedAccountId = br.account_id;
          if (br.account_id && accountIdMap[br.account_id]) {
            mappedAccountId = accountIdMap[br.account_id];
          }

          return {
            ...br,
            id: br.id || generateUUID(),
            ledger_id: currentLedger.id,
            paid_by: mappedPaidBy,
            category_id: mappedCategoryId || nextCategories[0]?.id || '',
            account_id: mappedAccountId,
            is_installment: br.is_installment,
            total_installments: br.total_installments,
            current_installment: br.current_installment,
            installment_start_period: br.installment_start_period,
            updated_at: new Date().toISOString(),
          };
        };

        if (mode === 'overwrite') {
          nextRecurringRules = backup.recurring_rules
            .filter((r: any) => r && r.name)
            .map(processRule);
        } else {
          backup.recurring_rules.forEach((br: any) => {
            if (!br || !br.name) return;
            const existing = nextRecurringRules.find(r => r.id === br.id || r.name === br.name);
            if (!existing) {
              nextRecurringRules.push(processRule(br));
            }
          });
        }
        setRecurringRules(nextRecurringRules);
        await saveRecurringRulesToStorage(nextRecurringRules, currentLedger.id);
      }

      // 3.6 還原/合併 自訂付款方式 (Payment Methods)
      let nextPaymentMethods = [...paymentMethods];
      if (Array.isArray(backup.payment_methods) && backup.payment_methods.length > 0) {
        if (mode === 'overwrite') {
          nextPaymentMethods = backup.payment_methods.map((bm: any) => ({
            id: bm.id,
            ledger_id: currentLedger.id,
            name: bm.name,
            icon: bm.icon || '💳',
            color: bm.color || '#6366F1',
            type: bm.type || 'other',
            supports_credit_card: !!bm.supports_credit_card,
            is_enabled: bm.is_enabled !== false,
            is_system: !!bm.is_system,
            sort_order: bm.sort_order || 1,
            created_at: new Date().toISOString(),
          }));
        } else {
          backup.payment_methods.forEach((bm: any) => {
            if (!bm || !bm.name) return;
            const existingIndex = nextPaymentMethods.findIndex(m => m.id === bm.id || m.name === bm.name);
            if (existingIndex >= 0) {
              nextPaymentMethods[existingIndex] = {
                ...nextPaymentMethods[existingIndex],
                is_enabled: bm.is_enabled !== false,
                sort_order: bm.sort_order ?? nextPaymentMethods[existingIndex].sort_order,
              };
            } else {
              nextPaymentMethods.push({
                id: bm.id || generateUUID(),
                ledger_id: currentLedger.id,
                name: bm.name,
                icon: bm.icon || '💳',
                color: bm.color || '#6366F1',
                type: bm.type || 'other',
                supports_credit_card: !!bm.supports_credit_card,
                is_enabled: bm.is_enabled !== false,
                is_system: !!bm.is_system,
                sort_order: bm.sort_order || nextPaymentMethods.length + 1,
                created_at: new Date().toISOString(),
              });
            }
          });
        }
        setPaymentMethods(nextPaymentMethods);
        await savePaymentMethodsToStorage(nextPaymentMethods);
      }

      // 4. 還原/合併 交易明細
      const backupTxs = Array.isArray(backup.transactions) ? backup.transactions : [];
      const targetLedgerId = currentLedger.id;
      const fallbackPayerId = currentUser?.id || nextMembers[0]?.id || 'unknown';

      // 關鍵防禦：徹底清空本機與雲端墓碑名冊，防止任何還原紀錄被既有刪除快取阻擋
      deletedTxIdsRef.current.clear();
      try {
        await AsyncStorage.removeItem(STORAGE_KEYS.DELETED_TX_IDS);
        await AsyncStorage.removeItem(`${STORAGE_KEYS.DELETED_TX_IDS}_${targetLedgerId}`);
        if (isRealCloud) {
          await supabase.from('deleted_transactions').delete().eq('ledger_id', targetLedgerId);
        }
      } catch {}

      if (mode === 'overwrite' && isRealCloud) {
        try {
          await supabase.from('transactions').delete().eq('ledger_id', targetLedgerId);
        } catch (e) {
          console.warn('覆蓋模式清空舊交易失敗:', e);
        }
      }

      // 建立現有明細特徵指紋集合（以防 merge 模式重複補入）
      const existingFingerprints = new Set(
        transactions.map(t => `${t.type}_${Number(t.amount)}_${t.transacted_at}_${t.merchant || ''}_${t.note || ''}`)
      );

      const sanitizedTxs: Transaction[] = [];

      for (const t of backupTxs) {
        if (!t || isNaN(Number(t.amount))) continue;

        const fingerprint = `${t.type}_${Number(t.amount)}_${t.transacted_at}_${t.merchant || ''}_${t.note || ''}`;
        if (mode === 'merge' && existingFingerprints.has(fingerprint)) {
          // 合併模式下，若已存在完全相同的明細，跳過避免重複
          continue;
        }

        // 分類對齊
        const targetCatId = t.category_id && categoryIdMap[t.category_id] ? categoryIdMap[t.category_id] : t.category_id;
        const matchedCategory = nextCategories.find(c => c.id === targetCatId) || nextCategories[0];

        // 付款人對齊
        let resolvedPaidBy = fallbackPayerId;
        if (t.paid_by) {
          if (memberIdMap[t.paid_by]) {
            resolvedPaidBy = memberIdMap[t.paid_by];
          } else if (nextMembers.some(m => m.id === t.paid_by)) {
            resolvedPaidBy = t.paid_by;
          } else if (memberAliasMap[t.paid_by]) {
            resolvedPaidBy = memberAliasMap[t.paid_by].id;
          }
        }

        // 建立者對齊
        let resolvedCreatorId = currentUser?.id;
        if (t.creator_id) {
          if (memberIdMap[t.creator_id]) {
            resolvedCreatorId = memberIdMap[t.creator_id];
          } else if (nextMembers.some(m => m.id === t.creator_id)) {
            resolvedCreatorId = t.creator_id;
          }
        }

        // 扣款卡片對齊
        let resolvedAccountId = t.account_id;
        if (resolvedAccountId && accountIdMap[resolvedAccountId]) {
          resolvedAccountId = accountIdMap[resolvedAccountId];
        }

        // 核心免疫關鍵：一律生成全新獨立 UUID！
        // 徹底根除任何客戶端或資料庫中舊 ID 的「歷史刪除標記」，確保 100% 不會被自動刪除
        const freshTxId = generateUUID();

        const isBackupMemo = t.type === 'memo' || (t.type === 'transfer' && Number(t.amount) === 0) || t.merchant?.startsWith('remind:') || t.merchant === 'memo';
        const restoredType: TransactionType = isBackupMemo ? 'memo' : (t.type === 'income' ? 'income' : (t.type === 'transfer' ? 'transfer' : 'expense'));
        const restoredReminder = t.reminder_date || (t.merchant?.startsWith('remind:') ? t.merchant.replace('remind:', '') : undefined);

        sanitizedTxs.push({
          id: freshTxId,
          ledger_id: targetLedgerId,
          creator_id: resolvedCreatorId,
          category_id: matchedCategory?.id || targetCatId,
          amount: isBackupMemo ? 0 : Number(t.amount),
          type: restoredType,
          reminder_date: restoredReminder,
          completed_by: t.completed_by || undefined,
          paid_by: resolvedPaidBy,
          transacted_at: t.transacted_at || new Date().toISOString(),
          merchant: t.merchant || undefined,
          note: t.note || '',
          payment_method: t.payment_method || 'cash',
          account_id: resolvedAccountId || undefined,
          is_reconciled: Boolean(t.is_reconciled),
          category: matchedCategory,
          is_settled: t.is_settled ?? false,
          created_at: t.created_at || new Date().toISOString(),
        });
      }

      let finalTxs: Transaction[];
      if (mode === 'overwrite') {
        finalTxs = sanitizedTxs;
      } else {
        finalTxs = [...transactions, ...sanitizedTxs];
      }

      finalTxs.sort((a, b) => new Date(b.transacted_at).getTime() - new Date(a.transacted_at).getTime());

      setTransactions(finalTxs);
      await saveTransactionsToStorage(finalTxs);

      // 同步還原交易至 Supabase 雲端 (若為已連線雲端帳本)
      if (isRealCloud && sanitizedTxs.length > 0) {
        try {
          const txsToUpsert = sanitizedTxs.map(t => {
            const p: any = {
              id: t.id,
              ledger_id: t.ledger_id,
              creator_id: t.creator_id || currentUser?.id,
              category_id: t.category_id,
              amount: t.amount,
              type: t.type,
              paid_by: t.paid_by,
              transacted_at: t.transacted_at,
              is_settled: t.is_settled || false,
              note: t.note || '',
            };
            if (hasMerchantColumnRef.current) {
              p.merchant = t.merchant || null;
            }
            if (hasPaymentColumnsRef.current) {
              if (t.payment_method) p.payment_method = t.payment_method;
              if (t.account_id && !t.account_id.startsWith('50000000')) p.account_id = t.account_id;
              if (t.is_reconciled !== undefined) p.is_reconciled = t.is_reconciled;
            }
            return p;
          });

          for (let i = 0; i < txsToUpsert.length; i += 500) {
            await supabase.from('transactions').upsert(txsToUpsert.slice(i, i + 500));
          }
        } catch (cloudErr) {
          console.warn('雲端還原同步交易失敗:', cloudErr);
        }
      }

      const parts: string[] = [`${sanitizedTxs.length} 筆明細`];
      if (Array.isArray(backup.members) && backup.members.length > 0) {
        parts.push(`${nextMembers.length} 位成員`);
      }
      if (Array.isArray(backup.payment_accounts) && backup.payment_accounts.length > 0) {
        parts.push(`${nextAccounts.length} 張卡片`);
      }
      if (Array.isArray(backup.categories) && backup.categories.length > 0) {
        parts.push(`${nextCategories.length} 個分類`);
      }
      if (Array.isArray(backup.recurring_rules) && backup.recurring_rules.length > 0) {
        parts.push(`${nextRecurringRules.length} 個週期規則`);
      }
      if (Array.isArray(backup.payment_methods) && backup.payment_methods.length > 0) {
        parts.push(`${nextPaymentMethods.length} 個付款方式`);
      }

      return {
        success: true,
        message: `成功還原！${mode === 'overwrite' ? '已覆蓋還原' : '已合併補入'} ${parts.join('、')}。`,
        restoredCount: sanitizedTxs.length,
      };
    } catch (err: any) {
      console.error('restoreFromJSON 錯誤:', err);
      return { success: false, message: `還原失敗: ${err?.message || '未知錯誤'}` };
    }
  };

  // 計算結算與統計資訊
  const settlementInfo = React.useMemo(() => {
    let totalExpense = 0;
    let totalIncome = 0;
    const paidByMembers: Record<string, number> = {};

    members.forEach(m => {
      paidByMembers[m.id] = 0;
    });

    transactions.forEach(t => {
      if (t.type === 'expense') {
        totalExpense += Number(t.amount);
        const canonical = getMemberById(t.paid_by);
        const targetId = canonical ? canonical.id : t.paid_by;
        if (paidByMembers[targetId] !== undefined) {
          paidByMembers[targetId] += Number(t.amount);
        } else {
          paidByMembers[targetId] = Number(t.amount);
        }
      } else if (t.type === 'income') {
        totalIncome += Number(t.amount);
      }
    });

    return {
      totalExpense,
      totalIncome,
      netBalance: totalIncome - totalExpense,
      paidByMembers,
    };
  }, [transactions, members, getMemberById]);

  // 新增家庭成員 (僅在管理員模式下可操作)
  const addMember = async (name: string, avatar: string = '😊') => {
    if (!effectiveIsOwner) {
      safeAlert('權限不足', '只有在管理員模式下才能新增家庭成員');
      return;
    }

    let newMemberId = generateUUID();
    let newMember: Profile = {
      id: newMemberId,
      email: `${name.toLowerCase()}@family.local`,
      display_name: name,
      avatar_url: avatar,
    };

    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('add_family_member', {
          target_ledger_id: currentLedger.id,
          member_name: name,
          member_avatar: avatar,
        });

        if (rpcRes && rpcRes.success && rpcRes.member) {
          newMember = {
            id: rpcRes.member.id,
            email: `${name.toLowerCase()}@family.local`,
            display_name: rpcRes.member.display_name,
            avatar_url: rpcRes.member.avatar_url,
          };
        } else {
          // 備用直寫 (若尚未建立 RPC 函式)
          await supabase.from('profiles').upsert(newMember);
          await supabase.from('ledger_members').insert({
            ledger_id: currentLedger.id,
            user_id: newMember.id,
            role: 'member',
          });
        }
      } catch (err: any) {
        console.warn('雲端新增成員失敗:', err);
      }
    }

    const updated = [...members.filter(m => m.id !== newMember.id), newMember];
    setMembers(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(updated));
  };

  // 編輯成員資料 (名稱與頭像)
  const updateMember = async (id: string, name: string, avatar: string): Promise<boolean> => {
    const cleanName = name.trim();
    if (!cleanName) return false;

    const oldMember = members.find(m => m.id === id);
    const oldName = oldMember?.display_name;

    // 只有本機上的成員才允許編輯稱謂，其他非本機成員不允許，但以管理員身分登入的成員例外
    const isCurrent = currentUser.id === id || (!!oldName && !!currentUser.display_name && currentUser.display_name === oldName);
    if (!isCurrent && !isOwner) {
      safeAlert('提示', '只有本機成員或帳本管理員可以修改此成員稱謂');
      return false;
    }

    // Google 電子鎖保護：若成員已鎖定且非本人修改，全面阻斷竄改
    if (oldMember?.is_locked && !isCurrent) {
      safeAlert('身分受保護', `「${oldName}」已受 Google 帳號電子鎖保護（${oldMember.auth_email || '已加密保護'}），無法由其他裝置直接修改其稱謂。`);
      return false;
    }

    // 1. 本地更新
    const updated = members.map(m => (m.id === id ? { ...m, display_name: cleanName, avatar_url: avatar } : m));
    setMembers(updated);

    // 若修改的是目前使用中的成員身分，同步更新 currentUser
    if (currentUser.id === id || (oldName && currentUser.display_name === oldName)) {
      const updatedMe: Profile = {
        ...currentUser,
        display_name: cleanName,
        avatar_url: avatar,
      };
      setCurrentUser(updatedMe);
      await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(updatedMe));
      if (currentLedger?.id) {
        await AsyncStorage.setItem(`${STORAGE_KEYS.CURRENT_USER}_${currentLedger.id}`, JSON.stringify(updatedMe));
      }
    }

    await AsyncStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(updated));
    await AsyncStorage.setItem(`${STORAGE_KEYS.MEMBERS}_${currentLedger.id}`, JSON.stringify(updated));

    // 2. 雲端同步更新 (Supabase profiles 表)
    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        await supabase
          .from('profiles')
          .update({ display_name: cleanName, avatar_url: avatar })
          .eq('id', id);
      } catch (err) {
        console.warn('雲端更新成員資料失敗:', err);
      }
    }

    return true;
  };

  // 刪除家庭成員 (僅在管理員模式下可操作，支援一鍵移轉帳目)
  const deleteMember = async (id: string, transferToId?: string): Promise<boolean> => {
    if (members.length <= 1) {
      safeAlert('無法刪除', '家庭至少需保留一位成員');
      return false;
    }

    if (!effectiveIsOwner) {
      safeAlert('權限不足', '只有在管理員模式下才能移除家庭成員');
      return false;
    }

    const targetMember = members.find(m => m.id === id);
    const isDeletingSelf = currentUser.id === id || (targetMember && currentUser.display_name === targetMember.display_name);
    if (isDeletingSelf) {
      safeAlert('無法刪除', '無法移除自己正在使用的身分，若要離開此帳本請使用「退出帳本」功能');
      return false;
    }

    // 管理員可自本公帳名冊中移除成員關係 (僅解除此帳本之 ledger_members 關聯，絕不抹除其全域 Profile 或 Google 帳號)

    // 檢查是否有「該成員實際付款」且金額大於 0 的紀錄
    const paidTxs = transactions.filter(t => t.paid_by === id);
    const paidTotal = paidTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    if (paidTotal > 0 && !transferToId) {
      alert(`該成員尚有 ${paidTxs.length} 筆付款紀錄（合計 NT$ ${paidTotal.toLocaleString()}）。為確保帳目歷史準確，無法直接刪除。若要清理，請先將這些紀錄的付款人變更為其他成員。`);
      return false;
    }

    const finalTransferToId = transferToId || currentUser.id;

    // 若有該成員作為建檔人 (creator_id) 或付款人，自動將紀錄移轉給承接者，避免外鍵關聯阻礙刪除
    const cleanTxs = transactions.map(t => {
      let updated = { ...t };
      if (t.creator_id === id) updated.creator_id = finalTransferToId;
      if (t.paid_by === id) updated.paid_by = finalTransferToId;
      return updated;
    });
    setTransactions(cleanTxs);
    await saveTransactionsToStorage(cleanTxs);

    const updated = members.filter(m => m.id !== id);
    setMembers(updated);
    if (currentUser.id === id) {
      setCurrentUser(updated[0]);
    }
    await AsyncStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(updated));
    if (currentLedger?.id) {
      await AsyncStorage.setItem(`${STORAGE_KEYS.MEMBERS}_${currentLedger.id}`, JSON.stringify(updated));
    }

    if (isConfigured) {
      try {
        // 1. 將舊成員在雲端的建檔人/付款人轉給承接者，確保外鍵與權限平順移交
        await supabase
          .from('transactions')
          .update({ creator_id: finalTransferToId })
          .eq('ledger_id', currentLedger.id)
          .eq('creator_id', id);

        await supabase
          .from('transactions')
          .update({ paid_by: finalTransferToId })
          .eq('ledger_id', currentLedger.id)
          .eq('paid_by', id);

        // 2. 清除該成員在此帳本的 ledger_members 紀錄
        await supabase
          .from('ledger_members')
          .delete()
          .eq('ledger_id', currentLedger.id)
          .eq('user_id', id);

        // 3. 清除該成員在此帳本登記的連線裝置紀錄
        await supabase
          .from('member_devices')
          .delete()
          .eq('ledger_id', currentLedger.id)
          .eq('member_id', id);
      } catch (err) {
        console.warn('雲端刪除成員失敗:', err);
      }
    }
    return true;
  };

  // 新增記帳分類 (僅管理員權限呼叫)
  const addCategory = async (data: {
    name: string;
    icon: string;
    color: string;
    type: CategoryType;
  }): Promise<boolean> => {
    try {
      const trimmedName = data.name.trim();
      if (!trimmedName) return false;

      const newCatId = generateUUID();
      const newCat: Category = {
        id: newCatId,
        ledger_id: currentLedger.id,
        name: trimmedName,
        icon: data.icon.trim() || '📝',
        color: data.color || '#4F46E5',
        type: data.type,
        sort_order: categories.length + 1,
      };

      const updated = [...categories, newCat];
      setCategories(updated);
      await AsyncStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(updated));
      await AsyncStorage.setItem(`${STORAGE_KEYS.CATEGORIES}_${currentLedger.id}`, JSON.stringify(updated));

      if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
        const { error } = await supabase.from('categories').insert({
          id: newCat.id,
          ledger_id: currentLedger.id,
          name: newCat.name,
          icon: newCat.icon,
          color: newCat.color,
          type: newCat.type,
          sort_order: newCat.sort_order,
        });
        if (error) {
          console.warn('雲端新增分類失敗:', error.message);
          return false;
        }
      }
      return true;
    } catch (err) {
      console.error('新增分類發生異常:', err);
      return false;
    }
  };

  // 修改編輯記帳分類 (僅管理員權限呼叫)
  const updateCategory = async (
    id: string,
    data: {
      name?: string;
      icon?: string;
      color?: string;
      type?: CategoryType;
    }
  ): Promise<boolean> => {
    try {
      const updated = categories.map((c) =>
        c.id === id
          ? {
              ...c,
              ...data,
              name: data.name !== undefined ? data.name.trim() : c.name,
              icon: data.icon !== undefined ? data.icon.trim() : c.icon,
            }
          : c
      );
      setCategories(updated);
      await AsyncStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(updated));
      await AsyncStorage.setItem(`${STORAGE_KEYS.CATEGORIES}_${currentLedger.id}`, JSON.stringify(updated));

      // 同步更新當前交易中的 category 引用
      const targetCat = updated.find((c) => c.id === id);
      if (targetCat) {
        setTransactions((prev) =>
          prev.map((t) => (t.category_id === id ? { ...t, category: targetCat } : t))
        );
      }

      if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
        const updatePayload: any = {};
        if (data.name !== undefined) updatePayload.name = data.name.trim();
        if (data.icon !== undefined) updatePayload.icon = data.icon.trim();
        if (data.color !== undefined) updatePayload.color = data.color;
        if (data.type !== undefined) updatePayload.type = data.type;

        const { error } = await supabase
          .from('categories')
          .update(updatePayload)
          .eq('id', id);
        if (error) {
          console.warn('雲端更新分類失敗:', error.message);
          return false;
        }
      }
      return true;
    } catch (err) {
      console.error('更新分類發生異常:', err);
      return false;
    }
  };

  // 刪除記帳分類 (僅管理員權限呼叫)
  const deleteCategory = async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const updated = categories.filter((c) => c.id !== id);
      setCategories(updated);
      await AsyncStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(updated));
      await AsyncStorage.setItem(`${STORAGE_KEYS.CATEGORIES}_${currentLedger.id}`, JSON.stringify(updated));

      // 更新現有交易中指向此分類的項目為 fallback 分類
      setTransactions((prev) =>
        prev.map((t) =>
          t.category_id === id
            ? {
                ...t,
                category: {
                  id,
                  name: '其他',
                  icon: '📝',
                  color: '#6B7280',
                  type: t.type === 'income' ? 'income' : 'expense',
                  sort_order: 99,
                },
              }
            : t
        )
      );

      if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
        const { error } = await supabase.from('categories').delete().eq('id', id);
        if (error) {
          console.warn('雲端刪除分類失敗:', error.message);
          return { success: false, error: error.message };
        }
      }
      return { success: true };
    } catch (err: any) {
      console.error('刪除分類發生異常:', err);
      return { success: false, error: err.message || '刪除分類失敗' };
    }
  };

  // 一鍵切換本機成員身分（包含管理員 PIN 碼權限防護）
  const switchCurrentUser = async (member: Profile, inputPin?: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const isMemberCreator = currentLedger.created_by === member.id;
      const targetIsAdmin = isMemberCreator || member.role === 'owner' || member.role === 'admin';
      const currentIsAdmin = userRole === 'owner' || userRole === 'admin';

      // Google 電子鎖安全防護：
      // 若目標成員已受 Google 帳號鎖定，且當前裝置未綁定該 Google 帳號，禁止直接切換冒充
      if (member.is_locked && (!currentUser.auth_email || currentUser.auth_email.toLowerCase() !== (member.auth_email || '').toLowerCase())) {
        return {
          success: false,
          message: `「${member.display_name}」身分已受 Google 帳號（${member.auth_email || '受保護'}）鎖定。請於設定頁使用「以 Google 帳號認領身分」以完成切換。`
        };
      }

      // 安全防護機制：
      // 若當前裝置為一般成員身分（非管理員），且欲切換至具備管理員權限的成員，強制驗證 4 位數管理員 PIN 碼！
      if (!currentIsAdmin && targetIsAdmin) {
        const clean = (inputPin || '').trim();
        const expected = ((currentLedger as any)?.admin_pin || adminPin || '8888').trim();
        if (!clean || clean !== expected) {
          return { success: false, message: '管理員安全 PIN 碼錯誤，無法切換至管理員身分！' };
        }
      }

      const resolvedRole: 'owner' | 'admin' | 'member' =
        isMemberCreator ? 'owner' : (member.role === 'owner' || member.role === 'admin' ? member.role : 'member');
      const updatedUser: Profile = { ...member, role: resolvedRole };

      setCurrentUser(updatedUser);
      setUserRole(resolvedRole);
      setIsDeviceBound(true);

      // 立即持久化本地身分與角色
      await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(updatedUser));
      if (currentLedger?.id) {
        await AsyncStorage.setItem(`${STORAGE_KEYS.CURRENT_USER}_${currentLedger.id}`, JSON.stringify(updatedUser));
      }
      await AsyncStorage.setItem(STORAGE_KEYS.USER_ROLE, resolvedRole);
      await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_BOUND, 'true');

      // 同步更新 ledgers 列表中的當前使用者快取
      setLedgers(prev => prev.map(l => l.id === currentLedger.id ? {
        ...l,
        userRole: resolvedRole,
        userDisplayName: member.display_name,
        userAvatar: member.avatar_url,
      } : l));

      return { success: true };
    } catch (err: any) {
      console.error('switchCurrentUser 異常:', err);
      return { success: false, message: err?.message || '切換身分失敗' };
    }
  };

  // 將當前裝置綁定至指定家庭成員（長輩防呆專用）
  const bindDeviceToMember = async (member: Profile) => {
    await switchCurrentUser(member);
  };

  // 解除裝置身分綁定
  const unbindDevice = async () => {
    setIsDeviceBound(false);
    await AsyncStorage.removeItem(STORAGE_KEYS.DEVICE_BOUND);
  };

  // 變更成員角色權限 (僅在管理員模式下可操作)
  const updateMemberRole = async (memberId: string, newRole: 'owner' | 'member'): Promise<boolean> => {
    if (!effectiveIsOwner) {
      alert('只有在管理員模式下才能變更成員角色權限');
      return false;
    }

    if (currentLedger.created_by === memberId && newRole === 'member') {
      alert('此帳本的原始建立者不能被降為一般成員');
      return false;
    }

    // 防呆保護：若欲降級的成員是目前唯一的管理員，強制禁止，避免整本帳本出現 0 管理員
    if (newRole === 'member') {
      const remainingAdmins = members.filter(
        m => m.id !== memberId && (m.role === 'owner' || m.role === 'admin' || currentLedger.created_by === m.id)
      );
      if (remainingAdmins.length === 0) {
        alert('家庭公帳至少需保留一位管理員。若要卸任，請先將另一位家人（如伴侶）設為管理員！');
        return false;
      }
    }

    // 1. 本地更新
    const updated = members.map(m => m.id === memberId ? { ...m, role: newRole } : m);
    setMembers(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(updated));
    await AsyncStorage.setItem(`${STORAGE_KEYS.MEMBERS}_${currentLedger.id}`, JSON.stringify(updated));

    const { data: { session } } = await supabase.auth.getSession();
    const myAuthId = session?.user?.id;
    if (myAuthId === memberId) {
      setUserRole(newRole);
      await AsyncStorage.setItem(STORAGE_KEYS.USER_ROLE, newRole);
    }

    // 2. 雲端同步
    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        let rpcSuccess = false;
        try {
          const { data: rpcRes } = await supabase.rpc('set_member_role', {
            target_ledger_id: currentLedger.id,
            target_user_id: memberId,
            new_role: newRole,
          });
          if (rpcRes && rpcRes.success) {
            rpcSuccess = true;
          }
        } catch {
          // fallback to direct table update
        }

        if (!rpcSuccess) {
          const { error } = await supabase
            .from('ledger_members')
            .update({ role: newRole })
            .eq('ledger_id', currentLedger.id)
            .eq('user_id', memberId);

          if (error) {
            console.warn('雲端更新成員角色失敗:', error);
            alert('變更成員權限失敗: ' + error.message);
            return false;
          }
        }
      } catch (err: any) {
        console.warn('雲端更新成員角色異常:', err);
        return false;
      }
    }

    return true;
  };

  // 透過管理員安全 PIN 碼恢復或取回管理員權限 (救援機制)
  const claimAdminRoleWithPin = async (inputPin: string): Promise<{ success: boolean; message?: string }> => {
    const clean = inputPin.trim();
    const expected = (currentLedger as any)?.admin_pin || adminPin || '8888';
    if (!clean || clean !== expected.trim()) {
      return { success: false, message: '管理員安全 PIN 碼錯誤，無法取得管理員權限！' };
    }

    const { data: { session } } = await supabase.auth.getSession();
    const authUserId = session?.user?.id || currentUser.id;

    setPreviewMember(null);
    setUserRole('owner');
    await AsyncStorage.setItem(STORAGE_KEYS.USER_ROLE, 'owner');

    const updatedMembers = members.map(m => (m.id === currentUser.id ? { ...m, role: 'owner' as const } : m));
    setMembers(updatedMembers);
    await AsyncStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(updatedMembers));
    await AsyncStorage.setItem(`${STORAGE_KEYS.MEMBERS}_${currentLedger.id}`, JSON.stringify(updatedMembers));

    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        await supabase.from('ledger_members').upsert({
          ledger_id: currentLedger.id,
          user_id: authUserId,
          role: 'owner',
        }, { onConflict: 'ledger_id,user_id' });

        if (currentUser.id && currentUser.id !== authUserId) {
          await supabase.from('ledger_members').upsert({
            ledger_id: currentLedger.id,
            user_id: currentUser.id,
            role: 'owner',
          }, { onConflict: 'ledger_id,user_id' });
        }

        // 僅在帳本目前無建立者或本使用者即為創立者時，才設定 created_by；否則只升級 owner 角色，避免誤改帳本原創者
        if (!currentLedger.created_by || currentLedger.created_by === authUserId) {
          await supabase.from('ledgers').update({ created_by: authUserId }).eq('id', currentLedger.id);
          setCurrentLedger(prev => ({ ...prev, created_by: authUserId }));
        }

        // 跨裝置同步：若名冊中有其他同名紀錄 (例如同成員的手機 APP 或其他瀏覽器裝置)，一併升級為 owner
        const myName = (currentUser.display_name || '').trim().toLowerCase();
        if (myName) {
          const { data: allMembersInLedger } = await supabase
            .from('ledger_members')
            .select('user_id, profiles(display_name)')
            .eq('ledger_id', currentLedger.id);

          if (allMembersInLedger) {
            for (const m of allMembersInLedger) {
              const mName = ((m.profiles as any)?.display_name || '').trim().toLowerCase();
              if (mName === myName && m.user_id !== authUserId) {
                await supabase
                  .from('ledger_members')
                  .update({ role: 'owner' })
                  .eq('ledger_id', currentLedger.id)
                  .eq('user_id', m.user_id);
              }
            }
          }
        }
      } catch (e) {
        console.warn('雲端更新角色失敗:', e);
      }
    }
    return { success: true };
  };

  return (
    <LedgerContext.Provider
      value={{
        currentLedger,
        ledgers,
        members,
        categories,
        transactions,
        currentUser: effectiveCurrentUser,
        setCurrentUser: (u: Profile) => {
          setCurrentUser(u);
          AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(u));
          if (currentLedger?.id) {
            AsyncStorage.setItem(`${STORAGE_KEYS.CURRENT_USER}_${currentLedger.id}`, JSON.stringify(u));
          }
          // 同步為該身分登記本裝置
          registerDevice(u.id, currentLedger?.id).catch(() => {});
        },
        addTransaction,
        updateTransaction,
        toggleMemoSettled,
        deleteTransaction,
        transferAllowance,
        recentMerchants,
        recordMerchant,
        recentMemoTags,
        recordMemoTag,
        removeRecentMemoTag,
        toggleMemoChecklistItem,
        exportToCSV,
        exportToJSON,
        restoreFromJSON,
        lastBackupAt,
        autoBackupEnabled,
        autoBackupInterval,
        recordBackupComplete,
        updateAutoBackupConfig,
        liveToast,
        dismissLiveToast,
        triggerLiveToast,
        addMember,
        updateMember,
        deleteMember,
        isDeviceBound,
        bindDeviceToMember,
        unbindDevice,
        switchCurrentUser,
        isCloudSynced,
        settlementInfo,
        hasJoinedLedger,
        isOwner: effectiveIsOwner,
        previewMember,
        isPreviewMode,
        startMemberPreview,
        startCurrentMemberPreview,
        exitMemberPreview,
        realCurrentUser: currentUser,
        realIsOwner: isOwner,
        realUserRole: userRole,
        isAdminMode,
        setIsAdminMode,
        enableAdminMode,
        disableAdminMode,
        isAdminUnlocked: isAdminMode,
        setIsAdminUnlocked: setIsAdminMode,
        unlockAdmin: enableAdminMode,
        lockAdmin: disableAdminMode,
        inviteCode,
        adminPin,
        updateAdminPin,
        isReadOnly: Boolean(currentLedger.is_read_only),
        toggleLedgerReadOnly,
        allowNewMembers: currentLedger.allow_new_members !== false,
        updateAllowNewMembers,
        createLedger,
        updateLedgerName,
        joinLedgerByCode,
        previewInvite,
        regenerateInviteCode,
        updateInviteCode,
        getInviteLink,
        pendingInviteCode,
        confirmPendingInvite,
        cancelPendingInvite,
        leaveCurrentLedger,
        switchLedgerById,
        leaveLedgerById,
        unreadLedgerMap,
        hasOtherUnread,
        checkUnreadLedgers,
        updateMemberRole,
        claimAdminRoleWithPin,
        getMemberById,
        memberAliasMap,
        getCategoryById,
        addCategory,
        updateCategory,
        deleteCategory,
        refreshLedger,
        paymentAccounts,
        addPaymentAccount,
        updatePaymentAccount,
        deletePaymentAccount,
        restoreDefaultAccounts,
        paymentMethods,
        addPaymentMethod,
        updatePaymentMethod,
        deletePaymentMethod,
        togglePaymentMethodEnabled,
        reorderPaymentMethods,
        restoreDefaultPaymentMethods,
        getPaymentMethodById,
        recurringRules,
        addRecurringRule,
        updateRecurringRule,
        deleteRecurringRule,
        recordRecurringBill,
        skipRecurringBill,
        restoreDefaultRecurringRules,
        topUpAccountBalance,
        adjustAccountBalance,
        toggleReconcileTransaction,
        getAccountById,
        memberDevices,
        currentDeviceId,
        fetchMemberDevices,
        registerDevice,
        removeDevice,
        linkGoogleAccount,
        unlinkGoogleAccount,
        claimGoogleIdentity,
        isCurrentUserLocked,
        signInWithGoogle,
        signOutGoogle,
        isGoogleAuthenticated,
        googleUserEmail,
      }}
    >
      {children}
    </LedgerContext.Provider>
  );
};

export const useLedger = () => {
  const context = useContext(LedgerContext);
  if (!context) {
    throw new Error('useLedger 必須在 LedgerProvider 內部使用');
  }
  return context;
};
