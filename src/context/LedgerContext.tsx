import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Platform, Alert, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Transaction, Category, Ledger, Profile, TransactionType, CategoryType, PaymentMethod, PaymentAccount, AccountType } from '../types/database';
import { supabase, isConfigured } from '../lib/supabase';
import { generateUUID } from '../lib/uuid';
import { DEMO_PAYMENT_ACCOUNTS } from '../lib/payment';

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
];

export interface LiveToastNotification {
  id: string;
  type: 'insert' | 'update' | 'delete' | 'info';
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
    amount: number;
    type: TransactionType;
    category_id: string;
    paid_by: string;
    merchant?: string;
    note?: string;
    transacted_at?: string;
    payment_method?: PaymentMethod;
    account_id?: string;
    is_reconciled?: boolean;
    splitWithIds?: string[];
  }) => Promise<void>;
  updateTransaction: (
    id: string,
    data: {
      amount?: number;
      type?: TransactionType;
      category_id?: string;
      paid_by?: string;
      merchant?: string;
      note?: string;
      transacted_at?: string;
      payment_method?: PaymentMethod;
      account_id?: string;
      is_reconciled?: boolean;
    }
  ) => Promise<boolean>;
  deleteTransaction: (id: string) => Promise<void>;
  paymentAccounts: PaymentAccount[];
  addPaymentAccount: (account: Omit<PaymentAccount, 'id' | 'ledger_id' | 'created_at'>) => Promise<PaymentAccount>;
  updatePaymentAccount: (id: string, data: Partial<PaymentAccount>) => Promise<boolean>;
  deletePaymentAccount: (id: string) => Promise<boolean>;
  restoreDefaultAccounts: () => Promise<void>;
  topUpAccountBalance: (id: string, amount: number, note?: string) => Promise<boolean>;
  adjustAccountBalance: (id: string, newBalance: number) => Promise<boolean>;
  toggleReconcileTransaction: (transactionId: string) => Promise<boolean>;
  getAccountById: (id?: string) => PaymentAccount | undefined;
  recentMerchants: string[];
  recordMerchant: (merchant: string) => Promise<void>;
  exportToCSV: () => string;
  exportToJSON: () => string;
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
  isCloudSynced: boolean;
  settlementInfo: {
    totalExpense: number;
    totalIncome: number;
    netBalance: number;
    paidByMembers: Record<string, number>;
  };
  hasJoinedLedger: boolean;
  isOwner: boolean;
  inviteCode: string;
  createLedger: (name?: string, creatorName?: string, avatar?: string) => Promise<void>;
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
  exitMemberPreview: () => void;
  realCurrentUser: Profile;
  realIsOwner: boolean;
  realUserRole: 'owner' | 'admin' | 'member';
}

const LedgerContext = createContext<LedgerContextType | null>(null);

// 成員名冊去重函式：相同 display_name 視為同一位家庭成員（支援多台手機/電腦認領同一身分）
export const deduplicateMembers = (memberList: Profile[]): Profile[] => {
  const result: Profile[] = [];
  const seen = new Set<string>();

  for (const m of memberList) {
    const key = (m.display_name || '').trim().toLowerCase();
    if (!key) continue;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ ...m });
    } else {
      const existing = result.find(em => (em.display_name || '').trim().toLowerCase() === key);
      if (existing) {
        if (m.role === 'owner') existing.role = 'owner';
        else if (m.role === 'admin' && existing.role !== 'owner') existing.role = 'admin';
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

  // 2. 雲端所有關聯成員（包含不同裝置登入但同一暱稱者）
  for (const raw of loaded) {
    const rawName = (raw.display_name || '').trim().toLowerCase();
    const canonical = deduped.find(
      m => (m.display_name || '').trim().toLowerCase() === rawName
    );
    map[raw.id] = canonical || raw;
  }

  // 3. 額外查詢之付款人 Profile
  if (extraProfiles) {
    for (const p of extraProfiles) {
      const pName = (p.display_name || '').trim().toLowerCase();
      const canonical = deduped.find(
        m => (m.display_name || '').trim().toLowerCase() === pName
      );
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
  PAYMENT_ACCOUNTS: '@family_ledger_payment_accounts',
  DELETED_ACCOUNT_IDS: '@family_ledger_deleted_account_ids',
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
  const [currentUser, setCurrentUser] = useState<Profile>(DEFAULT_MEMBERS[0]);
  const [isCloudSynced, setIsCloudSynced] = useState<boolean>(false);
  const [isDeviceBound, setIsDeviceBound] = useState<boolean>(false);
  const [hasJoinedLedger, setHasJoinedLedger] = useState<boolean>(true);
  const [inviteCode, setInviteCode] = useState<string>('FAM-8823');
  const [adminPin, setAdminPin] = useState<string>('8888');
  const [userRole, setUserRole] = useState<'owner' | 'admin' | 'member'>('member');
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(null);

  // 方案 A：即時 App 內通知泡泡 (In-App Toast Notification)
  const [liveToast, setLiveToast] = useState<LiveToastNotification | null>(null);
  const currentUserRef = useRef<Profile>(currentUser);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const dismissLiveToast = React.useCallback(() => {
    setLiveToast(null);
  }, []);

  const triggerLiveToast = React.useCallback((toast: LiveToastNotification) => {
    setLiveToast(toast);
  }, []);

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
  const hasMerchantColumnRef = useRef<boolean>(false);
  const hasPaymentColumnsRef = useRef<boolean>(false);

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

  const exitMemberPreview = () => {
    setPreviewMember(null);
  };

  // 帳本管理員包含建立者 (owner) 與共同管理員 (admin)
  const isOwner = userRole === 'owner' || userRole === 'admin';

  // 有效身分與權限（若啟動預覽模式，全 App 視角模擬該預覽成員）
  const effectiveCurrentUser = previewMember || currentUser;
  const isPreviewMode = !!previewMember;
  const effectiveUserRole: 'owner' | 'admin' | 'member' = previewMember
    ? (previewMember.role === 'owner' || previewMember.role === 'admin'
        ? (previewMember.role as 'owner' | 'admin')
        : 'member')
    : userRole;
  const effectiveIsOwner = effectiveUserRole === 'owner' || effectiveUserRole === 'admin';
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
              activeCategories = parsed;
              setCategories(parsed);
            }
          } catch {}
        }

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
              if (!parsedMerchant && t.note) {
                const match = t.note.match(/^\[(.*?)\]\s*(.*)$/);
                if (match) {
                  parsedMerchant = match[1];
                  parsedNote = match[2];
                }
              }
              return {
                ...t,
                merchant: parsedMerchant || undefined,
                note: parsedNote || '',
                category: matchedCat || t.category,
              };
            });
          if (validTx.length > 0) setTransactions(validTx);
        }

        const savedUser = await AsyncStorage.getItem(STORAGE_KEYS.CURRENT_USER);
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
        if (savedLedger) {
          const parsed = JSON.parse(savedLedger);
          if (isValidUUID(parsed.id) && parsed.id !== DEMO_LEDGER_ID) {
            setCurrentLedger(parsed);
            if (savedHasJoined !== 'false') {
              setHasJoinedLedger(true);
            }
          }
        } else if (savedHasJoined === 'false') {
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
          let parsedMerchant = newRow.merchant;
          let parsedNote = newRow.note;
          if (!parsedMerchant && newRow.note) {
            const match = newRow.note.match(/^\[(.*?)\]\s*(.*)$/);
            if (match) {
              parsedMerchant = match[1];
              parsedNote = match[2];
            }
          }
          if (parsedMerchant) {
            recordMerchant(parsedMerchant);
          }
          setTransactions((prev) => {
            if (prev.some((t) => t.id === newRow.id)) return prev;
            const canonicalPayer = getMemberById(newRow.paid_by);
            const item: Transaction = {
              ...newRow,
              merchant: parsedMerchant || undefined,
              note: parsedNote || '',
              amount: Number(newRow.amount),
              payer_profile: canonicalPayer || newRow.payer_profile,
            };
            const updated = [item, ...prev];
            AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(updated));
            AsyncStorage.setItem(`${STORAGE_KEYS.TRANSACTIONS}_${ledgerId}`, JSON.stringify(updated));
            return updated;
          });

          // 方案 A：若這筆記帳由其他裝置寫入，觸發即時通知泡泡
          const myId = currentUserRef.current?.id;
          const isFromOther = !myId || (newRow.creator_id && newRow.creator_id !== myId);
          if (isFromOther) {
            const actor = getMemberById(newRow.paid_by) || getMemberById(newRow.creator_id);
            const actorName = actor?.display_name || '家人';
            const actorAvatar = actor?.avatar_url || '👤';
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
            const match = updatedRow.note.match(/^\[(.*?)\]\s*(.*)$/);
            if (match) {
              parsedMerchant = match[1];
              parsedNote = match[2];
            }
          }
          if (parsedMerchant) {
            recordMerchant(parsedMerchant);
          }
          setTransactions((prev) => {
            const canonicalPayer = getMemberById(updatedRow.paid_by);
            const updated = prev.map((t) =>
              t.id === updatedRow.id
                ? {
                    ...updatedRow,
                    merchant: parsedMerchant || undefined,
                    note: parsedNote || '',
                    amount: Number(updatedRow.amount),
                    payer_profile: canonicalPayer || updatedRow.payer_profile || t.payer_profile,
                  }
                : t
            );
            AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(updated));
            AsyncStorage.setItem(`${STORAGE_KEYS.TRANSACTIONS}_${ledgerId}`, JSON.stringify(updated));
            return updated;
          });

          // 方案 A：若更新由其他裝置發起，觸發即時通知泡泡
          const myId = currentUserRef.current?.id;
          const isFromOther = !myId || (updatedRow.creator_id && updatedRow.creator_id !== myId);
          if (isFromOther) {
            const actor = getMemberById(updatedRow.paid_by) || getMemberById(updatedRow.creator_id);
            const actorName = actor?.display_name || '家人';
            const actorAvatar = actor?.avatar_url || '✏️';
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
          if (oldRow && oldRow.id) {
            try {
              const deletedKey = `${STORAGE_KEYS.DELETED_TX_IDS}_${ledgerId}`;
              const savedDeletedStr = await AsyncStorage.getItem(deletedKey);
              const deletedList: string[] = savedDeletedStr ? JSON.parse(savedDeletedStr) : [];
              if (!deletedList.includes(oldRow.id)) {
                deletedList.push(oldRow.id);
                if (deletedList.length > 500) deletedList.shift();
                await AsyncStorage.setItem(deletedKey, JSON.stringify(deletedList));
              }
            } catch {}

            setTransactions((prev) => {
              if (!prev.some((t) => t.id === oldRow.id)) return prev;
              const updated = prev.filter((t) => t.id !== oldRow.id);
              AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(updated));
              AsyncStorage.setItem(`${STORAGE_KEYS.TRANSACTIONS}_${ledgerId}`, JSON.stringify(updated));
              return updated;
            });

            // 方案 A：即時通知泡泡
            setLiveToast({
              id: `delete-${oldRow.id}-${Date.now()}`,
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

              // 即時同步本機使用者之角色權限
              const { data: { session } } = await supabase.auth.getSession();
              const myAuthId = session?.user?.id;
              if (myAuthId) {
                const myRow = memberRows.find((r: any) => r.user_id === myAuthId);
                const isMeCreator = currentLedger.created_by === myAuthId;
                const newRole = isMeCreator ? 'owner' : ((myRow?.role as 'owner' | 'admin' | 'member') || 'member');
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
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsCloudSynced(true);
        }
      });

    channelRef.current = channel;
  };

  // 輔助函式：載入指定帳本的完整資料 (分類、成員、交易、即時推播)
  const loadLedgerData = async (targetLedger: Ledger, authUserId: string) => {
    setCurrentLedger(targetLedger);
    await AsyncStorage.setItem(STORAGE_KEYS.LEDGER, JSON.stringify(targetLedger));

    // (A-0) 載入帳本 admin_pin
    if (isConfigured && targetLedger.id !== DEMO_LEDGER_ID) {
      try {
        const { data: lData } = await supabase
          .from('ledgers')
          .select('admin_pin')
          .eq('id', targetLedger.id)
          .maybeSingle();
        if (lData && lData.admin_pin) {
          setAdminPin(lData.admin_pin);
          await AsyncStorage.setItem(STORAGE_KEYS.ADMIN_PIN, lData.admin_pin);
          await AsyncStorage.setItem(`${STORAGE_KEYS.ADMIN_PIN}_${targetLedger.id}`, lData.admin_pin);
        }
      } catch (e) {
        console.warn('載入帳本 admin_pin 失敗:', e);
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
      setCategories(catRows);
      await AsyncStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(catRows));
      await AsyncStorage.setItem(`${STORAGE_KEYS.CATEGORIES}_${targetLedger.id}`, JSON.stringify(catRows));
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
    }

    // 若雲端已有成員，以雲端為準；僅在離線或雲端尚無成員時才從本地快取補救，避免跨帳本成員污染
    if (loadedMembers.length === 0 && targetLedger.id !== DEMO_LEDGER_ID) {
      const localSavedMembersStr = await AsyncStorage.getItem(`${STORAGE_KEYS.MEMBERS}_${targetLedger.id}`);
      if (localSavedMembersStr) {
        try {
          const localMembers: Profile[] = JSON.parse(localSavedMembersStr);
          const validLocals = localMembers.filter(lm => isValidUUID(lm.id) && !lm.id.startsWith('20000000-0000-4000-8000'));
          for (const m of validLocals) {
            try {
              await supabase.from('profiles').upsert({
                id: m.id,
                display_name: m.display_name,
                avatar_url: m.avatar_url,
                email: m.email,
              });
              await supabase.from('ledger_members').insert({
                ledger_id: targetLedger.id,
                user_id: m.id,
                role: 'member',
              });
              loadedMembers.push(m);
            } catch (e) {
              console.warn('補同步本地成員失敗:', m.display_name, e);
            }
          }
        } catch (err) {
          console.warn('解析本地成員快取失敗:', err);
        }
      }
    }

    setRawMembers(loadedMembers);
    const dedupedMembers = deduplicateMembers(loadedMembers);
    let aliasMap = buildMemberAliasMap(dedupedMembers, loadedMembers);
    let canonicalMe: Profile | undefined = undefined;

    if (dedupedMembers.length > 0) {
      setMembers(dedupedMembers);
      await AsyncStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(dedupedMembers));
      await AsyncStorage.setItem(`${STORAGE_KEYS.MEMBERS}_${targetLedger.id}`, JSON.stringify(dedupedMembers));

      const myMemberRow = memberRows?.find((r: any) => r.user_id === authUserId);
      const isCreator = targetLedger.created_by === authUserId;
      const myDisplayName = (myMemberRow?.profiles as any)?.display_name;

      // 尋找此裝置對應的成員（優先比對 authUserId，若名冊已去重則比對相同 display_name 的主要成員）
      canonicalMe = dedupedMembers.find(
        m => m.id === authUserId || (myDisplayName && (m.display_name || '').trim().toLowerCase() === myDisplayName.trim().toLowerCase())
      );
      if (!canonicalMe) {
        canonicalMe = dedupedMembers[0];
      }

      const role = isCreator
        ? 'owner'
        : ((myMemberRow?.role as 'owner' | 'admin' | 'member') || 'member');
      setUserRole(role);
      await AsyncStorage.setItem(STORAGE_KEYS.USER_ROLE, role);

      if (canonicalMe) {
        setCurrentUser(canonicalMe);
        await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(canonicalMe));
      }

      // 若身為建立者但雲端成員身分被誤設為 member，自動在雲端校正回 owner
      if (isCreator && myMemberRow && myMemberRow.role !== 'owner' && isConfigured) {
        supabase
          .from('ledger_members')
          .update({ role: 'owner' })
          .eq('ledger_id', targetLedger.id)
          .eq('user_id', authUserId)
          .then();
      }
    }

    // (D) 載入交易明細
    const { data: txRows } = await supabase
      .from('transactions')
      .select('*')
      .eq('ledger_id', targetLedger.id)
      .order('transacted_at', { ascending: false });

    // 檢查是否有未在 aliasMap 中的付款人 ID，額外向 profiles 查詢補充
    if (txRows && txRows.length > 0) {
      const missingPayerIds = Array.from(new Set(
        txRows
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
          }
        } catch (e) {
          console.warn('補載入付款人 Profile 失敗:', e);
        }
      }
    }

    setMemberAliasMap(aliasMap);
    await AsyncStorage.setItem(STORAGE_KEYS.ALIAS_MAP, JSON.stringify(aliasMap));
    await AsyncStorage.setItem(`${STORAGE_KEYS.ALIAS_MAP}_${targetLedger.id}`, JSON.stringify(aliasMap));

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
    let finalTx: Transaction[] = [];
    if (txRows) {
      finalTx = txRows.map((t: any) => {
        const canonicalPayer = aliasMap[t.paid_by] || dedupedMembers.find(m => m.id === t.paid_by);
        let correctedPaidBy = t.paid_by;
        if (
          canonicalPayer &&
          isValidUUID(canonicalPayer.id) &&
          !canonicalPayer.id.startsWith('20000000') &&
          canonicalPayer.id !== t.paid_by
        ) {
          correctedPaidBy = canonicalPayer.id;
          healList.push({ id: t.id, paid_by: canonicalPayer.id });
        }

        let parsedMerchant = t.merchant;
        let parsedNote = t.note;
        if (!parsedMerchant && t.note) {
          const match = t.note.match(/^\[(.*?)\]\s*(.*)$/);
          if (match) {
            parsedMerchant = match[1];
            parsedNote = match[2];
          }
        }
        if (parsedMerchant) {
          recordMerchant(parsedMerchant);
        }

        return {
          ...t,
          merchant: parsedMerchant || undefined,
          note: parsedNote || '',
          amount: Number(t.amount),
          paid_by: correctedPaidBy,
          payer_profile: canonicalPayer || t.payer_profile,
          category: getCategoryById(t.category_id, t.category),
        };
      });
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

    // 檢查本地是否有離線建立、尚未成功送至雲端的交易（絕不復活已被刪除的交易）
    const localSavedTxStr = await AsyncStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    if (localSavedTxStr && targetLedger.id !== DEMO_LEDGER_ID) {
      try {
        const deletedKey = `${STORAGE_KEYS.DELETED_TX_IDS}_${targetLedger.id}`;
        const savedDeletedStr = await AsyncStorage.getItem(deletedKey);
        const deletedList: string[] = savedDeletedStr ? JSON.parse(savedDeletedStr) : [];

        const localTxList: Transaction[] = JSON.parse(localSavedTxStr);
        const unsyncedTx = localTxList.filter(
          lt => isValidUUID(lt.id) &&
          lt.ledger_id === targetLedger.id &&
          !finalTx.some(ct => ct.id === lt.id) &&
          !deletedList.includes(lt.id) &&
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

    finalTx.sort((a, b) => new Date(b.transacted_at).getTime() - new Date(a.transacted_at).getTime());
    setTransactions(finalTx);
    await AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(finalTx));
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
        const savedDemo = await AsyncStorage.getItem(STORAGE_KEYS.PAYMENT_ACCOUNTS);
        if (savedDemo) {
          try { setPaymentAccounts(JSON.parse(savedDemo)); } catch {}
        } else {
          setPaymentAccounts(DEMO_PAYMENT_ACCOUNTS);
        }
      } else {
        // 真實雲端帳本：確保包含標準卡片（若使用者未主動刪除）
        const deletedKey = `${STORAGE_KEYS.DELETED_ACCOUNT_IDS}_${targetLedger.id}`;
        let deletedAccountIds: string[] = [];
        try {
          const savedDeletedStr = await AsyncStorage.getItem(deletedKey);
          if (savedDeletedStr) deletedAccountIds = JSON.parse(savedDeletedStr);
        } catch {}

        const defaultOwnerId = canonicalMe?.id || authUserId;
        const secondOwner = dedupedMembers.find(m => m.id !== defaultOwnerId);
        const secondOwnerId = secondOwner?.id || defaultOwnerId;

        // 定義家庭預設常用卡片組合
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

        // 檢查是否有尚未建立且未被使用者手動刪除的預設卡片
        const accountsToInsert: PaymentAccount[] = [];
        for (const preset of defaultPresets) {
          const alreadyExists = loadedCloudAccounts.some(
            a => a.name.trim() === preset.name.trim() ||
                 (preset.last_four_digits && a.last_four_digits === preset.last_four_digits)
          );
          const wasDeleted = deletedAccountIds.includes(preset.name) || deletedAccountIds.includes(`default_${preset.name}`);

          if (!alreadyExists && !wasDeleted) {
            accountsToInsert.push({
              ...preset,
              id: generateUUID(),
              ledger_id: targetLedger.id,
              created_at: new Date().toISOString(),
            });
          }
        }

        if (accountsToInsert.length > 0 && isConfigured) {
          try {
            await supabase.from('payment_accounts').insert(accountsToInsert);
          } catch (insertErr) {
            console.warn('雲端寫入預設付款卡片失敗:', insertErr);
          }
          loadedCloudAccounts = [...loadedCloudAccounts, ...accountsToInsert];
        }

        // 若雲端或補齊後有卡片，以其為準；若完全沒有則檢查本地快取
        if (loadedCloudAccounts.length > 0) {
          setPaymentAccounts(loadedCloudAccounts);
          await AsyncStorage.setItem(STORAGE_KEYS.PAYMENT_ACCOUNTS, JSON.stringify(loadedCloudAccounts));
          await AsyncStorage.setItem(ledgerSpecificKey, JSON.stringify(loadedCloudAccounts));
        } else if (savedLedgerAccounts) {
          try {
            const parsed = JSON.parse(savedLedgerAccounts);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setPaymentAccounts(parsed);
            }
          } catch {}
        }
      }
    } catch (accLoadErr) {
      console.warn('載入雲端付款帳戶失敗，使用本地快取:', accLoadErr);
    }

    // (F) Realtime 訂閱
    setupRealtimeSubscription(targetLedger.id);
  };

  // 2. 當連線設定具備時，啟動 Supabase 身分驗證與雲端即時同步
  useEffect(() => {
    if (!isConfigured) {
      setIsCloudSynced(false);
      return;
    }

    let isMounted = true;

    const setupSupabase = async () => {
      try {
        let { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
          if (anonError) {
            console.warn('Supabase 匿名登入失敗:', anonError.message);
            return;
          }
          session = anonData.session;
        }

        const authUser = session?.user;
        if (!authUser || !isMounted) return;

        // 使用者 Profile 初始化
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .maybeSingle();

        let myProfile: Profile;
        if (!existingProfile) {
          myProfile = {
            id: authUser.id,
            email: authUser.email || undefined,
            display_name: '家庭成員',
            avatar_url: '👩',
          };
          await supabase.from('profiles').upsert(myProfile);
        } else {
          myProfile = existingProfile;
        }

        // 偵測網址是否帶有邀請參數
        let urlInviteCode: string | null = null;
        let urlJoinId: string | null = null;
        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
          const params = new URLSearchParams(window.location.search);
          urlInviteCode = params.get('invite');
          urlJoinId = params.get('join') || params.get('ledger');
        }

        // 查詢該用戶目前已加入的帳本清單 (依加入時間新到舊排序)
        const { data: memberLedgers } = await supabase
          .from('ledger_members')
          .select('ledger_id, role, joined_at, ledgers(*)')
          .eq('user_id', authUser.id)
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

        // 若伺服器查無該使用者的帳本成員記錄，但本機已儲存有效邀請碼或帳本 ID（例如 APK 剛安裝或本地離線恢復）
        if (validMemberLedgers.length === 0 && (savedCode || savedLedgerId)) {
          try {
            let foundLedger: any = null;
            if (savedLedgerId) {
              const { data: directLedger } = await supabase
                .from('ledgers')
                .select('*')
                .eq('id', savedLedgerId)
                .maybeSingle();
              if (directLedger) foundLedger = directLedger;
            }

            if (!foundLedger && savedCode) {
              const { data: inviteRows } = await supabase
                .from('ledger_invites')
                .select('ledger_id, ledgers(*)')
                .ilike('invite_code', savedCode.trim())
                .limit(1);
              if (inviteRows && inviteRows.length > 0 && inviteRows[0].ledgers) {
                foundLedger = inviteRows[0].ledgers;
              }
            }

            // 若因 RLS 限制無法直接讀取，透過 SECURITY DEFINER RPC 進行重連
            if (!foundLedger && savedCode) {
              const { data: rpcRes } = await supabase.rpc('join_ledger_by_invite', {
                invite_code_input: savedCode.trim(),
                claimed_role: (await AsyncStorage.getItem(STORAGE_KEYS.USER_ROLE)) || 'member',
              });
              if (rpcRes?.success && rpcRes?.ledger_id) {
                const { data: lData } = await supabase
                  .from('ledgers')
                  .select('*')
                  .eq('id', rpcRes.ledger_id)
                  .maybeSingle();
                if (lData) foundLedger = lData;
              }
            }

            if (!foundLedger && savedLedgerId) {
              const { data: rpcRes } = await supabase.rpc('join_ledger_by_invite', {
                invite_code_input: savedLedgerId,
                claimed_role: (await AsyncStorage.getItem(STORAGE_KEYS.USER_ROLE)) || 'member',
              });
              if (rpcRes?.success && rpcRes?.ledger_id) {
                const { data: lData } = await supabase
                  .from('ledgers')
                  .select('*')
                  .eq('id', rpcRes.ledger_id)
                  .maybeSingle();
                if (lData) foundLedger = lData;
              }
            }

            if (foundLedger && isValidUUID(foundLedger.id)) {
              const savedRole = (await AsyncStorage.getItem(STORAGE_KEYS.USER_ROLE)) || 'member';
              await supabase.from('ledger_members').upsert({
                ledger_id: foundLedger.id,
                user_id: authUser.id,
                role: savedRole,
              });

              validMemberLedgers = [
                {
                  ledger_id: foundLedger.id,
                  role: savedRole,
                  joined_at: new Date().toISOString(),
                  ledgers: foundLedger,
                },
              ];
            }
          } catch (bindErr) {
            console.warn('本機已存帳本自動關聯失敗:', bindErr);
          }
        }
        const allUserLedgers: Ledger[] = validMemberLedgers.map((m: any) => {
          const l = m.ledgers as unknown as Ledger;
          const isCreator = l.created_by === authUser.id;
          return {
            ...l,
            userRole: (isCreator ? 'owner' : m.role) as any,
          };
        });
        setLedgers(allUserLedgers);

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
          ) || (savedLedgerId && urlJoinId && savedLedgerId === urlJoinId);

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
            if (!isMounted) return;
            await loadLedgerData(activeLedger, authUser.id);
            setHasJoinedLedger(true);
            await AsyncStorage.setItem(STORAGE_KEYS.HAS_JOINED, 'true');
          }
        } else {
          // 情境 C：新訪客打開乾淨網址，或已被管理員從帳本名冊中移除
          if (!isMounted) return;
          const savedLedgerStr = await AsyncStorage.getItem(STORAGE_KEYS.LEDGER);
          if (savedLedgerStr) {
            // 此裝置原先有帳本紀錄，但在雲端查無任何加入紀錄（已被管理員踢除/刪除）
            console.log('此裝置已不再屬於任何雲端帳本，清理本地狀態回到初始歡迎畫面');
            await AsyncStorage.removeItem(STORAGE_KEYS.LEDGER);
            await AsyncStorage.removeItem(STORAGE_KEYS.MEMBERS);
            await AsyncStorage.removeItem(STORAGE_KEYS.TRANSACTIONS);
            await AsyncStorage.removeItem(STORAGE_KEYS.USER_ROLE);
            await AsyncStorage.removeItem(STORAGE_KEYS.INVITE_CODE);
            await AsyncStorage.setItem(STORAGE_KEYS.HAS_JOINED, 'false');
            setHasJoinedLedger(false);
            setIsCloudSynced(false);
            setTransactions([]);
            setMembers(DEFAULT_MEMBERS);
          } else {
            const savedHasJoined = await AsyncStorage.getItem(STORAGE_KEYS.HAS_JOINED);
            if (savedHasJoined !== 'true') {
              setHasJoinedLedger(false);
            }
          }
        }
      } catch (err) {
        console.warn('初始化 Supabase 連線或即時同步時發生錯誤:', err);
        setIsCloudSynced(false);
      }
    };

    setupSupabase();

    return () => {
      isMounted = false;
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

  // 3. 當 App 從背景回到前景時，自動檢查並重新載入最新雲端資料
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && isConfigured && currentLedger && currentLedger.id !== DEMO_LEDGER_ID) {
        refreshLedger();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [currentLedger, isConfigured]);

  // 建立新的家庭公帳 (Owner 發起)
  const createLedger = async (name: string = '幸福家庭帳本', creatorName?: string, avatar?: string) => {
    try {
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data: anonData } = await supabase.auth.signInAnonymously();
        session = anonData?.session || null;
      }
      const authUserId = session?.user?.id || generateUUID();
      const newLedgerId = generateUUID();
      const newCode = 'FAM-' + Math.floor(1000 + Math.random() * 9000);

      const newLedger: Ledger = {
        id: newLedgerId,
        name: name.trim() || '幸福家庭帳本',
        description: '全家共享日常開銷帳本',
        currency: 'TWD',
        created_by: authUserId,
        created_at: new Date().toISOString(),
      };

      if (isConfigured) {
        if (creatorName || avatar) {
          await supabase.from('profiles').upsert({
            id: authUserId,
            display_name: creatorName || '爸爸 (我)',
            avatar_url: avatar || '👨',
          });
        }

        await supabase.from('ledgers').insert({
          id: newLedger.id,
          name: newLedger.name,
          description: newLedger.description,
          currency: newLedger.currency,
          created_by: newLedger.created_by,
          admin_pin: '8888',
        });

        await supabase.from('ledger_members').insert({
          ledger_id: newLedger.id,
          user_id: authUserId,
          role: 'owner',
        });

        await supabase.from('ledger_invites').insert({
          ledger_id: newLedger.id,
          invite_code: newCode,
          created_by: authUserId,
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
      setLedgers(prev => [{ ...newLedger, userRole: 'owner' }, ...prev.filter(l => l.id !== newLedger.id)]);

      if (creatorName || avatar) {
        const updatedMe: Profile = {
          id: authUserId,
          display_name: creatorName || '爸爸 (我)',
          avatar_url: avatar || '👨',
        };
        setCurrentUser(updatedMe);
        await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(updatedMe));
      }

      if (isConfigured) {
        await loadLedgerData(newLedger, authUserId);
      } else {
        setCurrentLedger(newLedger);
        await AsyncStorage.setItem(STORAGE_KEYS.LEDGER, JSON.stringify(newLedger));
      }
    } catch (err: any) {
      console.warn('建立帳本失敗:', err);
      alert('建立帳本時發生錯誤: ' + (err.message || '請檢查網路連線'));
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

      await supabase.from('ledger_members').upsert({
        ledger_id: targetLedger.id,
        user_id: authUserId,
        role: assignedRole,
      }, { onConflict: 'ledger_id,user_id' });

      const finalDisplayName = claimedMember
        ? claimedMember.display_name
        : (memberName || (isCreator ? '爸爸 (我)' : '家庭成員'));
      const finalAvatar = claimedMember
        ? claimedMember.avatar_url
        : (avatar || (isCreator ? '👨' : '👩'));

      if (!isCreator || !claimedMember) {
        await supabase.from('profiles').upsert({
          id: authUserId,
          display_name: finalDisplayName,
          avatar_url: finalAvatar,
        });
      }

      const updatedMe: Profile = {
        id: claimedMember ? claimedMember.id : authUserId,
        display_name: finalDisplayName,
        avatar_url: finalAvatar,
        role: assignedRole,
      };

      setCurrentUser(updatedMe);
      await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(updatedMe));

      setUserRole(assignedRole);
      await AsyncStorage.setItem(STORAGE_KEYS.USER_ROLE, assignedRole);
      setInviteCode(code);
      setPendingInviteCode(null);
      await AsyncStorage.setItem(STORAGE_KEYS.INVITE_CODE, code);

      if ((targetLedger as any)?.admin_pin) {
        setAdminPin((targetLedger as any).admin_pin);
        await AsyncStorage.setItem(STORAGE_KEYS.ADMIN_PIN, (targetLedger as any).admin_pin);
        await AsyncStorage.setItem(`${STORAGE_KEYS.ADMIN_PIN}_${targetLedger.id}`, (targetLedger as any).admin_pin);
      }

      await AsyncStorage.setItem(STORAGE_KEYS.HAS_JOINED, 'true');
      setHasJoinedLedger(true);
      setLedgers(prev => [{ ...targetLedger, userRole: assignedRole }, ...prev.filter(l => l.id !== targetLedger.id)]);

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
            .select('ledger_id, ledgers(id, name)')
            .ilike('invite_code', lookupCode)
            .maybeSingle();

          if (invRow) {
            targetLedgerId = invRow.ledger_id;
            targetLedgerName = (invRow.ledgers as any)?.name || '';
          }
        }

        if (targetLedgerId) {
          if (!targetLedgerName) {
            const { data: lData } = await supabase
              .from('ledgers')
              .select('id, name')
              .eq('id', targetLedgerId)
              .maybeSingle();
            if (lData) targetLedgerName = lData.name;
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
        if (session?.user?.id) {
          await supabase
            .from('ledger_members')
            .delete()
            .eq('ledger_id', currentLedger.id)
            .eq('user_id', session.user.id);
        }
      } catch (e) {
        console.warn('雲端退出帳本失敗:', e);
      }
    }
    await AsyncStorage.setItem(STORAGE_KEYS.HAS_JOINED, 'false');
    await AsyncStorage.removeItem(STORAGE_KEYS.LEDGER);
    await AsyncStorage.removeItem(STORAGE_KEYS.USER_ROLE);
    await AsyncStorage.removeItem(STORAGE_KEYS.INVITE_CODE);
    setUserRole('member');
    setHasJoinedLedger(false);
  };

  // 依帳本 ID 直接在使用者已加入的帳本間無縫切換
  const switchLedgerById = async (targetLedgerId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authUserId = session?.user?.id;
      if (!authUserId) return;

      const { data: memberRow } = await supabase
        .from('ledger_members')
        .select('role, ledgers(*)')
        .eq('ledger_id', targetLedgerId)
        .eq('user_id', authUserId)
        .maybeSingle();

      if (memberRow && memberRow.ledgers) {
        const targetLedger = memberRow.ledgers as unknown as Ledger;
        const isCreator = targetLedger.created_by === authUserId;
        const role = isCreator ? 'owner' : ((memberRow.role as 'owner' | 'admin' | 'member') || 'member');
        setUserRole(role);
        await AsyncStorage.setItem(STORAGE_KEYS.USER_ROLE, role);
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
      }

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

  // 新增付款帳戶 / 信用卡 / 儲值卡
  const addPaymentAccount = async (accountData: Omit<PaymentAccount, 'id' | 'ledger_id' | 'created_at'>): Promise<PaymentAccount> => {
    if (!effectiveIsOwner) {
      safeAlert('權限不足', '只有帳本管理員才能新增支付卡片與帳戶');
      throw new Error('只有帳本管理員才能新增支付卡片與帳戶');
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

    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        await supabase.from('payment_accounts').insert(newAcc);
      } catch (e) {
        console.warn('雲端新增付款帳戶連線失敗 (已保留本地):', e);
      }
    }
    return newAcc;
  };

  // 修改付款帳戶
  const updatePaymentAccount = async (id: string, data: Partial<PaymentAccount>): Promise<boolean> => {
    if (!effectiveIsOwner) {
      safeAlert('權限不足', '只有帳本管理員才能修改支付卡片與帳戶');
      return false;
    }

    const updated = paymentAccounts.map(a => a.id === id ? { ...a, ...data } : a);
    setPaymentAccounts(updated);
    await savePaymentAccountsToStorage(updated);

    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        await supabase.from('payment_accounts').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id);
      } catch (e) {
        console.warn('雲端更新付款帳戶失敗:', e);
      }
    }
    return true;
  };

  // 刪除付款帳戶
  const deletePaymentAccount = async (id: string): Promise<boolean> => {
    if (!effectiveIsOwner) {
      safeAlert('權限不足', '只有帳本管理員才能刪除支付卡片與帳戶');
      return false;
    }

    const deletedAcc = paymentAccounts.find(a => a.id === id);
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

  // 快速加值悠遊卡/儲值卡（更新卡片餘額並自動記錄一筆加值明細）
  const topUpAccountBalance = async (id: string, topUpAmount: number, customNote?: string): Promise<boolean> => {
    try {
      const targetAcc = paymentAccounts.find(a => a.id === id);
      if (!targetAcc) return false;

      const newBalance = Number((targetAcc.balance + topUpAmount).toFixed(2));
      const updatedAccounts = paymentAccounts.map(a => a.id === id ? { ...a, balance: newBalance } : a);
      setPaymentAccounts(updatedAccounts);
      await savePaymentAccountsToStorage(updatedAccounts);

      if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID && !id.startsWith('50000000')) {
        supabase.from('payment_accounts').update({ balance: newBalance }).eq('id', id).then();
      }

      // 自動記錄一筆加值交易
      const trafficCat = categories.find(c => c.name.includes('交通') || c.name.includes('儲值'))
        || categories[0]
        || DEFAULT_CATEGORIES[0];

      // 嚴格確保 validPaidBy 存在於當前家庭成員名冊，避免觸發 Supabase 外鍵報錯
      const matchedPayer = (targetAcc.user_id && members.find(m => m.id === targetAcc.user_id))
        || members.find(m => m.id === currentUser.id)
        || members[0];
      const validPaidBy = matchedPayer?.id || currentUser.id;

      await addTransaction({
        amount: topUpAmount,
        type: 'expense',
        category_id: trafficCat ? trafficCat.id : categories[0]?.id,
        paid_by: validPaidBy,
        merchant: `${targetAcc.name}加值`,
        payment_method: 'cash',
        account_id: targetAcc.id && !targetAcc.id.startsWith('50000000') ? targetAcc.id : undefined,
        note: customNote || `${targetAcc.name} 快速加值 NT$ ${topUpAmount.toLocaleString()}`,
        transacted_at: new Date().toISOString(),
      });

      return true;
    } catch (e) {
      console.warn('加值失敗:', e);
      return false;
    }
  };

  // 直接校正儲值卡餘額 (僅管理員可操作)
  const adjustAccountBalance = async (id: string, newBalance: number): Promise<boolean> => {
    if (!effectiveIsOwner) {
      safeAlert('權限不足', '只有帳本管理員才能校正卡片餘額');
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
    amount: number;
    type: TransactionType;
    category_id: string;
    paid_by: string;
    merchant?: string;
    note?: string;
    transacted_at?: string;
    payment_method?: PaymentMethod;
    account_id?: string;
    is_reconciled?: boolean;
    splitWithIds?: string[];
  }) => {
    const txId = generateUUID();
    const cleanMerchant = data.merchant ? data.merchant.trim() : undefined;
    if (cleanMerchant) {
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
      amount: data.amount,
      type: data.type,
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

    // 若為儲值卡消費 (stored_value) 且指定了 account_id，自動扣減該卡餘額
    if (data.type === 'expense' && data.payment_method === 'stored_value' && data.account_id) {
      setPaymentAccounts((prev) => {
        const updated = prev.map(acc => {
          if (acc.id === data.account_id) {
            return { ...acc, balance: Number((acc.balance - data.amount).toFixed(2)) };
          }
          return acc;
        });
        savePaymentAccountsToStorage(updated).catch(() => {});
        return updated;
      });
    }

    // 樂觀更新本地畫面（預先標記 _isPendingSync，確保在收到雲端成功回執前若重新整理頁面絕不遺失）
    const isOnlinePublishing = isConfigured && isCloudSynced && newTx.ledger_id !== DEMO_LEDGER_ID;
    (newTx as any)._isPendingSync = true;
    const updated = [newTx, ...transactions];
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

        let { error: txError } = await supabase.from('transactions').insert(insertPayload);

        // 如果雲端尚未執行 ALTER TABLE 加欄位導致 42703 (column does not exist) 或 PGRST204，自動切換回相容模式重試
        if (txError && (txError.code === '42703' || txError.code === 'PGRST204' || txError.message?.includes('column') || txError.message?.includes('schema cache'))) {
          hasMerchantColumnRef.current = false;
          hasPaymentColumnsRef.current = false;
          delete insertPayload.merchant;
          delete insertPayload.payment_method;
          delete insertPayload.account_id;
          delete insertPayload.is_reconciled;
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
          saveTransactionsToStorage([newTx, ...transactions.filter(t => t.id !== newTx.id)]).catch(() => {});

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
  };

  // 刪除交易
  const deleteTransaction = async (id: string) => {
    const targetTx = transactions.find(t => t.id === id);

    // 若為儲值卡消費，恢復卡片餘額
    if (targetTx && targetTx.type === 'expense' && targetTx.payment_method === 'stored_value' && targetTx.account_id) {
      setPaymentAccounts((prev) => {
        const updated = prev.map(acc => {
          if (acc.id === targetTx.account_id) {
            return { ...acc, balance: Number((acc.balance + targetTx.amount).toFixed(2)) };
          }
          return acc;
        });
        savePaymentAccountsToStorage(updated).catch(() => {});
        return updated;
      });
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

    // 3. 雲端同步刪除
    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        await supabase.from('transaction_splits').delete().eq('transaction_id', id);
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
      transacted_at?: string;
      payment_method?: PaymentMethod;
      account_id?: string;
      is_reconciled?: boolean;
    }
  ): Promise<boolean> => {
    try {
      const cleanMerchant = data.merchant !== undefined ? (data.merchant ? data.merchant.trim() : undefined) : undefined;
      if (cleanMerchant) {
        recordMerchant(cleanMerchant);
      }
      const targetTx = transactions.find(t => t.id === id);

      // 儲值卡餘額連動校正
      const oldAmount = targetTx?.amount || 0;
      const oldMethod = targetTx?.payment_method;
      const oldAccId = targetTx?.account_id;
      const oldType = targetTx?.type;

      const newAmount = data.amount !== undefined ? data.amount : oldAmount;
      const newMethod = data.payment_method !== undefined ? data.payment_method : oldMethod;
      const newAccId = data.account_id !== undefined ? data.account_id : oldAccId;
      const newType = data.type !== undefined ? data.type : oldType;

      if (oldType === 'expense' && oldMethod === 'stored_value' && oldAccId) {
        // 退回舊扣款
        setPaymentAccounts((prev) => {
          let updated = prev.map(acc => acc.id === oldAccId ? { ...acc, balance: Number((acc.balance + oldAmount).toFixed(2)) } : acc);
          if (newType === 'expense' && newMethod === 'stored_value' && newAccId) {
            updated = updated.map(acc => acc.id === newAccId ? { ...acc, balance: Number((acc.balance - newAmount).toFixed(2)) } : acc);
          }
          savePaymentAccountsToStorage(updated).catch(() => {});
          return updated;
        });
      } else if (newType === 'expense' && newMethod === 'stored_value' && newAccId) {
        // 應用新扣款
        setPaymentAccounts((prev) => {
          const updated = prev.map(acc => acc.id === newAccId ? { ...acc, balance: Number((acc.balance - newAmount).toFixed(2)) } : acc);
          savePaymentAccountsToStorage(updated).catch(() => {});
          return updated;
        });
      }

      const updatedTxs = transactions.map(t => {
        if (t.id === id) {
          const effectivePaidBy = data.paid_by !== undefined ? data.paid_by : t.paid_by;
          const canonicalPayer = getMemberById(effectivePaidBy);
          const effectiveAccId = data.account_id !== undefined ? data.account_id : t.account_id;
          const resolvedAccount = effectiveAccId ? getAccountById(effectiveAccId) : undefined;
          return {
            ...t,
            ...data,
            merchant: data.merchant !== undefined ? cleanMerchant : t.merchant,
            category: data.category_id ? getCategoryById(data.category_id, t.category) : t.category,
            payer_profile: canonicalPayer || t.payer_profile,
            payment_account: resolvedAccount || t.payment_account,
          };
        }
        return t;
      });

      await saveTransactionsToStorage(updatedTxs);

      if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
        const updatePayload: any = {};
        if (data.amount !== undefined) updatePayload.amount = data.amount;
        if (data.type !== undefined) updatePayload.type = data.type;
        if (data.category_id !== undefined) updatePayload.category_id = data.category_id;
        if (data.paid_by !== undefined) updatePayload.paid_by = data.paid_by;
        if (data.transacted_at !== undefined) updatePayload.transacted_at = data.transacted_at;
        if (data.payment_method !== undefined) updatePayload.payment_method = data.payment_method;
        if (data.account_id !== undefined) updatePayload.account_id = data.account_id;
        if (data.is_reconciled !== undefined) updatePayload.is_reconciled = data.is_reconciled;
        updatePayload.updated_at = new Date().toISOString();

        if (hasMerchantColumnRef.current) {
          if (data.merchant !== undefined) updatePayload.merchant = cleanMerchant || null;
          if (data.note !== undefined) updatePayload.note = data.note;
        } else {
          // 若雲端無 merchant 欄位，包裝進 note
          const effectiveMerchant = data.merchant !== undefined ? cleanMerchant : targetTx?.merchant;
          const effectiveNote = data.note !== undefined ? data.note : (targetTx?.note || '');
          if (data.merchant !== undefined || data.note !== undefined) {
            updatePayload.note = effectiveMerchant
              ? `[${effectiveMerchant}] ${effectiveNote}`.trim()
              : effectiveNote;
          }
        }

        let { error } = await supabase
          .from('transactions')
          .update(updatePayload)
          .eq('id', id);

        if (error && (error.code === '42703' || error.code === 'PGRST204' || error.message?.includes('column') || error.message?.includes('schema cache'))) {
          hasMerchantColumnRef.current = false;
          hasPaymentColumnsRef.current = false;
          delete updatePayload.merchant;
          delete updatePayload.payment_method;
          delete updatePayload.account_id;
          delete updatePayload.is_reconciled;
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
      }
      return true;
    } catch (err) {
      console.warn('更新交易例外錯誤:', err);
      return false;
    }
  };

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

  // 匯出為完整 JSON 結構備份檔 (包含帳本資訊、家庭成員、自訂分類、所有記帳明細)
  const exportToJSON = (): string => {
    const backupData = {
      app: '甜心記帳本',
      version: '1.0',
      exported_at: new Date().toISOString(),
      ledger: {
        id: currentLedger.id,
        name: currentLedger.name,
        invite_code: inviteCode,
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
      transactions: transactions.map(t => ({
        id: t.id,
        amount: t.amount,
        type: t.type,
        category_id: t.category_id,
        paid_by: t.paid_by,
        transacted_at: t.transacted_at,
        merchant: t.merchant,
        note: t.note,
      })),
    };
    return JSON.stringify(backupData, null, 2);
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

  // 新增家庭成員 (僅 Owner / Admin 可操作)
  const addMember = async (name: string, avatar: string = '😊') => {
    if (!isOwner) {
      safeAlert('權限不足', '只有帳本管理員才能新增家庭成員');
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
      alert('只有本機成員或帳本管理員可以修改此成員稱謂');
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

        // 若多台裝置認領同一身分 (相同舊 display_name)，一併同步更新
        if (oldName && oldName !== cleanName) {
          const { data: siblingProfiles } = await supabase
            .from('profiles')
            .select('id')
            .eq('display_name', oldName);

          if (siblingProfiles && siblingProfiles.length > 0) {
            const siblingIds = siblingProfiles.map(p => p.id);
            await supabase
              .from('profiles')
              .update({ display_name: cleanName, avatar_url: avatar })
              .in('id', siblingIds);
          }
        }
      } catch (err) {
        console.warn('雲端更新成員資料失敗:', err);
      }
    }

    return true;
  };

  // 刪除家庭成員 (僅 Owner 可操作，支援一鍵移轉帳目)
  const deleteMember = async (id: string, transferToId?: string): Promise<boolean> => {
    if (members.length <= 1) {
      safeAlert('無法刪除', '家庭至少需保留一位成員');
      return false;
    }

    if (!isOwner) {
      safeAlert('權限不足', '只有帳本管理員才能移除家庭成員');
      return false;
    }

    const targetMember = members.find(m => m.id === id);
    const isDeletingSelf = currentUser.id === id || (targetMember && currentUser.display_name === targetMember.display_name);
    if (isDeletingSelf) {
      alert('無法移除自己正在使用的身分，若要離開此帳本請使用「退出帳本」功能');
      return false;
    }

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

    const updated = members.filter(m => m.id !== id && (!targetMember || m.display_name !== targetMember.display_name));
    setMembers(updated);
    if (currentUser.id === id) {
      setCurrentUser(updated[0]);
    }
    await AsyncStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(updated));

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

        // 2. 清除該成員的 ledger_members 紀錄
        await supabase
          .from('ledger_members')
          .delete()
          .eq('ledger_id', currentLedger.id)
          .eq('user_id', id);

        // 3. 若為同名重複紀錄，一併清理
        if (targetMember?.display_name) {
          const { data: siblingProfiles } = await supabase
            .from('profiles')
            .select('id')
            .eq('display_name', targetMember.display_name);

          if (siblingProfiles && siblingProfiles.length > 0) {
            const siblingIds = siblingProfiles.map(p => p.id);
            await supabase
              .from('transactions')
              .update({ creator_id: finalTransferToId })
              .eq('ledger_id', currentLedger.id)
              .in('creator_id', siblingIds);

            await supabase
              .from('transactions')
              .update({ paid_by: finalTransferToId })
              .eq('ledger_id', currentLedger.id)
              .in('paid_by', siblingIds);

            await supabase
              .from('ledger_members')
              .delete()
              .eq('ledger_id', currentLedger.id)
              .in('user_id', siblingIds);
          }
        }
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

  // 將當前裝置綁定至指定家庭成員（長輩防呆專用）
  const bindDeviceToMember = async (member: Profile) => {
    setCurrentUser(member);
    setIsDeviceBound(true);
    await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(member));
    await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_BOUND, 'true');
  };

  // 解除裝置身分綁定
  const unbindDevice = async () => {
    setIsDeviceBound(false);
    await AsyncStorage.removeItem(STORAGE_KEYS.DEVICE_BOUND);
  };

  // 變更成員角色權限 (管理員可指派共同管理員或降為一般成員)
  const updateMemberRole = async (memberId: string, newRole: 'owner' | 'member'): Promise<boolean> => {
    if (!isOwner) {
      alert('只有帳本管理員才能變更成員角色權限');
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
        },
        addTransaction,
        updateTransaction,
        deleteTransaction,
        recentMerchants,
        recordMerchant,
        exportToCSV,
        exportToJSON,
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
        isDeviceBound: false,
        bindDeviceToMember: async (member: Profile) => {
          setCurrentUser(member);
          await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(member));
        },
        unbindDevice: async () => {},
        isCloudSynced,
        settlementInfo,
        hasJoinedLedger,
        isOwner: effectiveIsOwner,
        previewMember,
        isPreviewMode,
        startMemberPreview,
        exitMemberPreview,
        realCurrentUser: currentUser,
        realIsOwner: isOwner,
        realUserRole: userRole,
        inviteCode,
        adminPin,
        updateAdminPin,
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
        topUpAccountBalance,
        adjustAccountBalance,
        toggleReconcileTransaction,
        getAccountById,
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
