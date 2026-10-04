import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Transaction, Category, Ledger, Profile, TransactionType } from '../types/database';
import { supabase, isConfigured } from '../lib/supabase';
import { generateUUID } from '../lib/uuid';

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
  deleteTransaction: (id: string) => Promise<void>;
  exportToCSV: () => string;
  addMember: (name: string, avatar?: string) => Promise<void>;
  deleteMember: (id: string) => Promise<boolean | void>;
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
  joinLedgerByCode: (codeOrUrl: string, memberName?: string, avatar?: string) => Promise<{ success: boolean; message?: string }>;
  regenerateInviteCode: () => Promise<string>;
  updateInviteCode: (customCode: string) => Promise<boolean>;
  getInviteLink: () => string;
  pendingInviteCode: string | null;
  confirmPendingInvite: (name?: string, avatar?: string) => Promise<void>;
  cancelPendingInvite: () => void;
  leaveCurrentLedger: () => Promise<void>;
  switchLedgerById: (ledgerId: string) => Promise<void>;
  leaveLedgerById: (ledgerId: string) => Promise<void>;
  updateMemberRole: (memberId: string, newRole: 'owner' | 'member') => Promise<boolean>;
}

const LedgerContext = createContext<LedgerContextType | null>(null);

const STORAGE_KEYS = {
  TRANSACTIONS: '@family_ledger_transactions',
  CURRENT_USER: '@family_ledger_current_user',
  MEMBERS: '@family_ledger_members',
  DEVICE_BOUND: '@family_ledger_device_bound',
  LEDGER: '@family_ledger_current',
  HAS_JOINED: '@family_ledger_has_joined',
  INVITE_CODE: '@family_ledger_invite_code',
  USER_ROLE: '@family_ledger_user_role',
};

export const LedgerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentLedger, setCurrentLedger] = useState<Ledger>(DEFAULT_LEDGER);
  const [ledgers, setLedgers] = useState<Ledger[]>([DEFAULT_LEDGER]);
  const [members, setMembers] = useState<Profile[]>(DEFAULT_MEMBERS);
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [currentUser, setCurrentUser] = useState<Profile>(DEFAULT_MEMBERS[0]);
  const [isCloudSynced, setIsCloudSynced] = useState<boolean>(false);
  const [isDeviceBound, setIsDeviceBound] = useState<boolean>(false);
  const [hasJoinedLedger, setHasJoinedLedger] = useState<boolean>(true);
  const [inviteCode, setInviteCode] = useState<string>('FAM-8823');
  const [userRole, setUserRole] = useState<'owner' | 'admin' | 'member'>('member');
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(null);

  // 帳本管理員包含建立者 (owner) 與共同管理員 (admin)
  const isOwner = userRole === 'owner' || userRole === 'admin';
  const channelRef = useRef<any>(null);

  // 1. 初始化本地快取（Local-First: 先離線秒開，再非同步接雲端）
  useEffect(() => {
    const loadLocalCache = async () => {
      try {
        const savedTx = await AsyncStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
        if (savedTx) {
          const parsed = JSON.parse(savedTx);
          const validTx = parsed.filter((t: any) => isValidUUID(t.id) && isValidUUID(t.ledger_id));
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
              const item: Transaction = { ...newRow, amount: Number(newRow.amount) };
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
              const updated = prev.map((t) =>
                t.id === updatedRow.id ? { ...updatedRow, amount: Number(updatedRow.amount) } : t
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

              if (loadedMembers.length > 0) {
                setMembers(loadedMembers);
                await AsyncStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(loadedMembers));
                await AsyncStorage.setItem(`${STORAGE_KEYS.MEMBERS}_${ledgerId}`, JSON.stringify(loadedMembers));
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

              if (loadedMembers.length > 0) {
                setMembers(loadedMembers);
                await AsyncStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(loadedMembers));
                await AsyncStorage.setItem(`${STORAGE_KEYS.MEMBERS}_${ledgerId}`, JSON.stringify(loadedMembers));
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

    if (loadedMembers.length > 0) {
      setMembers(loadedMembers);
      await AsyncStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(loadedMembers));
      await AsyncStorage.setItem(`${STORAGE_KEYS.MEMBERS}_${targetLedger.id}`, JSON.stringify(loadedMembers));

      const myMemberRow = memberRows?.find((r: any) => r.user_id === authUserId);
      const isCreator = targetLedger.created_by === authUserId;
      const role = isCreator ? 'owner' : ((myMemberRow?.role as 'owner' | 'admin' | 'member') || 'member');
      setUserRole(role);
      await AsyncStorage.setItem(STORAGE_KEYS.USER_ROLE, role);
      if (myMemberRow?.profiles) {
        const profile = myMemberRow.profiles as unknown as Profile;
        setCurrentUser(profile);
        await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(profile));
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

    let finalTx: Transaction[] = [];
    if (txRows) {
      finalTx = txRows.map((t: any) => ({
        ...t,
        amount: Number(t.amount),
      }));
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

        const validMemberLedgers = (memberLedgers || []).filter((m: any) => m.ledgers && isValidUUID(m.ledgers.id));
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

  // 透過邀請碼或專屬連結加入帳本 (家人加入)
  const joinLedgerByCode = async (
    codeOrUrl: string,
    memberName?: string,
    avatar?: string
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

      // 1. 優先使用 SECURITY DEFINER 的 join_ledger_by_invite 函式以邀請碼加入 (自動繞過 RLS 限制)
      if (code) {
        try {
          const { data: rpcRes } = await supabase.rpc('join_ledger_by_invite', {
            invite_code_input: code,
          });

          if (rpcRes && rpcRes.success && rpcRes.ledger_id) {
            targetLedgerId = rpcRes.ledger_id;
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
      const assignedRole: 'owner' | 'member' = isCreator ? 'owner' : 'member';

      await supabase.from('ledger_members').upsert({
        ledger_id: targetLedger.id,
        user_id: authUserId,
        role: assignedRole,
      }, { onConflict: 'ledger_id,user_id' });

      if (memberName || avatar) {
        await supabase.from('profiles').upsert({
          id: authUserId,
          display_name: memberName || (isCreator ? '爸爸 (我)' : '家庭成員'),
          avatar_url: avatar || (isCreator ? '👨' : '👩'),
        });
        const updatedMe: Profile = {
          id: authUserId,
          display_name: memberName || (isCreator ? '爸爸 (我)' : '家庭成員'),
          avatar_url: avatar || (isCreator ? '👨' : '👩'),
        };
        setCurrentUser(updatedMe);
        await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(updatedMe));
      }

      setUserRole(assignedRole);
      await AsyncStorage.setItem(STORAGE_KEYS.USER_ROLE, assignedRole);
      setInviteCode(code);
      setPendingInviteCode(null);
      await AsyncStorage.setItem(STORAGE_KEYS.INVITE_CODE, code);
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

  // 重新產生邀請碼 (Owner 專屬，舊代碼作廢)
  const regenerateInviteCode = async (): Promise<string> => {
    const newCode = 'FAM-' + Math.floor(1000 + Math.random() * 9000);
    setInviteCode(newCode);
    await AsyncStorage.setItem(STORAGE_KEYS.INVITE_CODE, newCode);

    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id || currentUser.id;
      await supabase.from('ledger_invites').insert({
        ledger_id: currentLedger.id,
        invite_code: newCode,
        created_by: uid,
        expires_at: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
      });
    }
    return newCode;
  };

  // 自訂邀請碼 (Owner 專屬)
  const updateInviteCode = async (customCode: string): Promise<boolean> => {
    const clean = customCode.trim().toUpperCase();
    if (clean.length < 3 || clean.length > 15) {
      alert('邀請碼長度需在 3 至 15 個字元之間');
      return false;
    }
    setInviteCode(clean);
    await AsyncStorage.setItem(STORAGE_KEYS.INVITE_CODE, clean);

    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id || currentUser.id;
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
  const confirmPendingInvite = async (name?: string, avatar?: string) => {
    if (pendingInviteCode) {
      const joinName = name || (currentUser.display_name !== '家庭成員' ? currentUser.display_name : '媽媽');
      const joinAvatar = avatar || currentUser.avatar_url || '👩';
      await joinLedgerByCode(pendingInviteCode, joinName, joinAvatar);
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

    const newTx: Transaction = {
      id: txId,
      ledger_id: validLedgerId,
      creator_id: validCreatorId,
      category_id: validCategoryId,
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

  // 匯出為 CSV 格式
  const exportToCSV = (): string => {
    const headers = ['日期', '類型', '分類', '金額', '付款人', '備註'];
    const rows = transactions.map(t => {
      const cat = categories.find(c => c.id === t.category_id)?.name || '未分類';
      const payer = members.find(m => m.id === t.paid_by)?.display_name || '未知';
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
        if (paidByMembers[t.paid_by] !== undefined) {
          paidByMembers[t.paid_by] += Number(t.amount);
        } else {
          paidByMembers[t.paid_by] = Number(t.amount);
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
  }, [transactions, members]);

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

  // 刪除家庭成員 (僅 Owner 可操作，且受歷史紀錄保護)
  const deleteMember = async (id: string): Promise<boolean> => {
    if (members.length <= 1) {
      alert('家庭至少需保留一位成員');
      return false;
    }

    if (!isOwner) {
      alert('只有帳本管理員（Owner）可以移除家庭成員');
      return false;
    }

    if (currentUser.id === id) {
      alert('無法移除自己正在使用的身分，若要離開此帳本請使用「退出帳本」功能');
      return false;
    }

    const hasHistory = transactions.some(t => t.paid_by === id || t.creator_id === id);
    if (hasHistory) {
      alert('該成員已有記帳或代墊紀錄，為確保帳目與分攤結算準確，無法刪除！');
      return false;
    }

    const updated = members.filter(m => m.id !== id);
    setMembers(updated);
    if (currentUser.id === id) {
      setCurrentUser(updated[0]);
    }
    await AsyncStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(updated));

    if (isConfigured) {
      try {
        await supabase
          .from('ledger_members')
          .delete()
          .eq('ledger_id', currentLedger.id)
          .eq('user_id', id);
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

  return (
    <LedgerContext.Provider
      value={{
        currentLedger,
        ledgers,
        members,
        categories,
        transactions,
        currentUser,
        setCurrentUser: (u) => {
          if (!isDeviceBound) {
            setCurrentUser(u);
            AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(u));
          }
        },
        addTransaction,
        deleteTransaction,
        exportToCSV,
        addMember,
        deleteMember,
        isDeviceBound,
        bindDeviceToMember,
        unbindDevice,
        isCloudSynced,
        settlementInfo,
        hasJoinedLedger,
        isOwner,
        inviteCode,
        createLedger,
        joinLedgerByCode,
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
