import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Transaction, Category, Ledger, Profile, TransactionType } from '../types/database';
import { supabase, isConfigured } from '../lib/supabase';
import { generateUUID } from '../lib/uuid';

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
    transacted_at: new Date(Date.now() - 3600000 * 4).toISOString(),
    note: 'Costco 週末採買牛奶與生鮮',
    is_settled: false,
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
    transacted_at: new Date(Date.now() - 3600000 * 20).toISOString(),
    note: '全家日式定食晚餐',
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
    transacted_at: new Date(Date.now() - 3600000 * 72).toISOString(),
    note: '本月薪資入帳',
    is_settled: true,
    created_at: new Date().toISOString(),
  },
];

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
    note?: string;
    transacted_at?: string;
    splitWithIds?: string[];
  }) => Promise<void>;
  updateTransaction: (
    id: string,
    data: {
      amount?: number;
      type?: TransactionType;
      category_id?: string;
      paid_by?: string;
      note?: string;
      transacted_at?: string;
    }
  ) => Promise<boolean>;
  deleteTransaction: (id: string) => Promise<void>;
  exportToCSV: () => string;
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
};

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
  const [currentUser, setCurrentUser] = useState<Profile>(DEFAULT_MEMBERS[0]);
  const [isCloudSynced, setIsCloudSynced] = useState<boolean>(false);
  const [isDeviceBound, setIsDeviceBound] = useState<boolean>(false);
  const [hasJoinedLedger, setHasJoinedLedger] = useState<boolean>(true);
  const [inviteCode, setInviteCode] = useState<string>('FAM-8823');
  const [adminPin, setAdminPin] = useState<string>('8888');
  const [userRole, setUserRole] = useState<'owner' | 'admin' | 'member'>('member');
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(null);

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

  // 帳本管理員包含建立者 (owner) 與共同管理員 (admin)
  const isOwner = userRole === 'owner' || userRole === 'admin';
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
              return {
                ...t,
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
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `ledger_id=eq.${ledgerId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newRow = payload.new as any;
            setTransactions((prev) => {
              if (prev.some((t) => t.id === newRow.id)) return prev;
              const canonicalPayer = getMemberById(newRow.paid_by);
              const item: Transaction = {
                ...newRow,
                amount: Number(newRow.amount),
                payer_profile: canonicalPayer || newRow.payer_profile,
              };
              const updated = [item, ...prev];
              AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(updated));
              return updated;
            });
          } else if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as any;
            setTransactions((prev) => {
              const updated = prev.filter((t) => t.id !== oldRow.id);
              AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(updated));
              return updated;
            });
          } else if (payload.eventType === 'UPDATE') {
            const updatedRow = payload.new as any;
            setTransactions((prev) => {
              const canonicalPayer = getMemberById(updatedRow.paid_by);
              const updated = prev.map((t) =>
                t.id === updatedRow.id
                  ? {
                      ...updatedRow,
                      amount: Number(updatedRow.amount),
                      payer_profile: canonicalPayer || updatedRow.payer_profile || t.payer_profile,
                    }
                  : t
              );
              AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(updated));
              return updated;
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

    if (dedupedMembers.length > 0) {
      setMembers(dedupedMembers);
      await AsyncStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(dedupedMembers));
      await AsyncStorage.setItem(`${STORAGE_KEYS.MEMBERS}_${targetLedger.id}`, JSON.stringify(dedupedMembers));

      const myMemberRow = memberRows?.find((r: any) => r.user_id === authUserId);
      const isCreator = targetLedger.created_by === authUserId;
      const myDisplayName = (myMemberRow?.profiles as any)?.display_name;

      // 尋找此裝置對應的成員（優先比對 authUserId，若名冊已去重則比對相同 display_name 的主要成員）
      let canonicalMe = dedupedMembers.find(
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

        return {
          ...t,
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

    // 檢查本地是否有尚未成功送至雲端的交易（如因外鍵問題一度失敗，自動補修復上傳）
    const localSavedTxStr = await AsyncStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    if (localSavedTxStr && targetLedger.id !== DEMO_LEDGER_ID) {
      try {
        const localTxList: Transaction[] = JSON.parse(localSavedTxStr);
        const unsyncedTx = localTxList.filter(
          lt => isValidUUID(lt.id) &&
          lt.ledger_id === targetLedger.id &&
          !finalTx.some(ct => ct.id === lt.id) &&
          !lt.id.startsWith('40000000-0000-4000-8000')
        );

        for (const ut of unsyncedTx) {
          try {
            const { error: insErr } = await supabase.from('transactions').insert({
              id: ut.id,
              ledger_id: ut.ledger_id,
              creator_id: ut.creator_id,
              category_id: ut.category_id,
              amount: ut.amount,
              type: ut.type,
              paid_by: ut.paid_by,
              transacted_at: ut.transacted_at,
              note: ut.note,
              is_settled: ut.is_settled,
            });
            if (!insErr) {
              finalTx.push(ut);
            }
          } catch (e) {
            console.warn('補同步本地交易至雲端失敗:', ut.id, e);
          }
        }
      } catch (err) {
        console.warn('解析本地交易快取失敗:', err);
      }
    }

    finalTx.sort((a, b) => new Date(b.transacted_at).getTime() - new Date(a.transacted_at).getTime());
    setTransactions(finalTx);
    await AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(finalTx));
    setIsCloudSynced(true);

    // (E) Realtime 訂閱
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

      await supabase.from('profiles').upsert({
        id: authUserId,
        display_name: finalDisplayName,
        avatar_url: finalAvatar,
      });

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

  // 新增交易（兼顧樂觀更新與雲端同步）
  const addTransaction = async (data: {
    amount: number;
    type: TransactionType;
    category_id: string;
    paid_by: string;
    note?: string;
    transacted_at?: string;
    splitWithIds?: string[];
  }) => {
    const txId = generateUUID();

    const { data: { session } } = await supabase.auth.getSession();
    const authUserId = session?.user?.id;
    let validCreatorId = authUserId || currentUser.id;
    if (!isValidUUID(validCreatorId)) {
      validCreatorId = members.find(m => isValidUUID(m.id))?.id || DEMO_USER_DAD;
    }

    let validPaidBy = data.paid_by;
    if (!isValidUUID(validPaidBy)) {
      validPaidBy = validCreatorId;
    }

    let validLedgerId = currentLedger.id;
    if (!isValidUUID(validLedgerId)) {
      validLedgerId = DEMO_LEDGER_ID;
    }

    let validCategoryId = data.category_id;
    if (!isValidUUID(validCategoryId)) {
      validCategoryId = categories.find(c => isValidUUID(c.id))?.id || DEFAULT_CATEGORIES[0].id;
    }

    const resolvedCategory = getCategoryById(validCategoryId);

    const newTx: Transaction = {
      id: txId,
      ledger_id: validLedgerId,
      creator_id: validCreatorId,
      category_id: validCategoryId,
      category: resolvedCategory,
      amount: data.amount,
      type: data.type,
      paid_by: validPaidBy,
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

    // 樂觀更新本地畫面
    const updated = [newTx, ...transactions];
    await saveTransactionsToStorage(updated);

    // 若雲端已連線且為正式雲端帳本，推送至 Supabase PostgreSQL
    if (isConfigured && isCloudSynced && newTx.ledger_id !== DEMO_LEDGER_ID) {
      try {
        const { error: txError } = await supabase.from('transactions').insert({
          id: newTx.id,
          ledger_id: newTx.ledger_id,
          creator_id: newTx.creator_id,
          category_id: newTx.category_id,
          amount: newTx.amount,
          type: newTx.type,
          paid_by: newTx.paid_by,
          transacted_at: newTx.transacted_at,
          note: newTx.note,
          is_settled: newTx.is_settled,
        });

        if (txError) {
          console.warn('雲端寫入交易失敗:', txError.message);
        } else if (newTx.splits && newTx.splits.length > 0) {
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
      } catch (err) {
        console.warn('雲端新增交易連線延遲，已保存於本機稍後重試:', err);
      }
    }
  };

  // 刪除交易
  const deleteTransaction = async (id: string) => {
    const updated = transactions.filter(t => t.id !== id);
    await saveTransactionsToStorage(updated);

    if (isConfigured) {
      try {
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
      note?: string;
      transacted_at?: string;
    }
  ): Promise<boolean> => {
    try {
      const updatedTxs = transactions.map(t => {
        if (t.id === id) {
          const effectivePaidBy = data.paid_by !== undefined ? data.paid_by : t.paid_by;
          const canonicalPayer = getMemberById(effectivePaidBy);
          return {
            ...t,
            ...data,
            category: data.category_id ? getCategoryById(data.category_id, t.category) : t.category,
            payer_profile: canonicalPayer || t.payer_profile,
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
        if (data.note !== undefined) updatePayload.note = data.note;
        if (data.transacted_at !== undefined) updatePayload.transacted_at = data.transacted_at;
        updatePayload.updated_at = new Date().toISOString();

        const { error } = await supabase
          .from('transactions')
          .update(updatePayload)
          .eq('id', id);

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

  // 匯出為 CSV 格式
  const exportToCSV = (): string => {
    const headers = ['日期', '類型', '分類', '金額', '付款人', '備註'];
    const rows = transactions.map(t => {
      const cat = getCategoryById(t.category_id, t.category)?.name || '未分類';
      const payer = getMemberById(t.paid_by)?.display_name || t.payer_profile?.display_name || '家庭成員';
      const typeStr = t.type === 'expense' ? '支出' : '收入';
      const dateStr = new Date(t.transacted_at).toLocaleDateString('zh-TW');
      return `"${dateStr}","${typeStr}","${cat}",${t.amount},"${payer}","${(t.note || '').replace(/"/g, '""')}"`;
    });
    return [headers.join(','), ...rows].join('\n');
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

  // 新增家庭成員 (優先呼叫安全 RPC 函式，確保 profiles 與 ledger_members 寫入成功)
  const addMember = async (name: string, avatar: string = '😊') => {
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

    // 檢查是否有「該成員實際代墊付款」且金額大於 0 的紀錄
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
        currentUser,
        setCurrentUser: (u: Profile) => {
          setCurrentUser(u);
          AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(u));
        },
        addTransaction,
        updateTransaction,
        deleteTransaction,
        exportToCSV,
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
        isOwner,
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
