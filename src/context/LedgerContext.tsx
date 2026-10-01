import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
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
  { id: DEMO_USER_DAD, email: 'dad@family.local', display_name: '爸爸 (我)', avatar_url: '👨' },
  { id: DEMO_USER_MOM, email: 'mom@family.local', display_name: '媽媽', avatar_url: '👩' },
  { id: DEMO_USER_KID, email: 'kid@family.local', display_name: '小寶', avatar_url: '👦' },
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
  deleteMember: (id: string) => Promise<void>;
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
}

const LedgerContext = createContext<LedgerContextType | null>(null);

const STORAGE_KEYS = {
  TRANSACTIONS: '@family_ledger_transactions',
  CURRENT_USER: '@family_ledger_current_user',
  MEMBERS: '@family_ledger_members',
  DEVICE_BOUND: '@family_ledger_device_bound',
  LEDGER: '@family_ledger_current',
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

        const savedLedger = await AsyncStorage.getItem(STORAGE_KEYS.LEDGER);
        if (savedLedger) {
          const parsed = JSON.parse(savedLedger);
          if (isValidUUID(parsed.id)) {
            setCurrentLedger(parsed);
          } else {
            await AsyncStorage.removeItem(STORAGE_KEYS.LEDGER);
          }
        }

        const savedBound = await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_BOUND);
        if (savedBound === 'true') setIsDeviceBound(true);
      } catch (err) {
        console.warn('載入本地記帳快取失敗:', err);
      }
    };
    loadLocalCache();
  }, []);

  // 2. 當連線設定具備時，啟動 Supabase 身分驗證與雲端即時同步
  useEffect(() => {
    if (!isConfigured) {
      setIsCloudSynced(false);
      return;
    }

    let isMounted = true;

    const setupSupabase = async () => {
      try {
        // (A) 身份認證：取得現有 Session 或使用匿名快速登入
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

        // (B) 使用者 Profile 初始化
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
            display_name: '爸爸 (我)',
            avatar_url: '👨',
          };
          await supabase.from('profiles').upsert(myProfile);
        } else {
          myProfile = existingProfile;
        }

        // (C) 帳本取得或自動建立
        const { data: memberLedgers } = await supabase
          .from('ledger_members')
          .select('ledger_id, role, ledgers(*)')
          .eq('user_id', authUser.id);

        let activeLedger: Ledger;
        if (memberLedgers && memberLedgers.length > 0 && memberLedgers[0].ledgers) {
          activeLedger = memberLedgers[0].ledgers as unknown as Ledger;
        } else {
          // 若尚無帳本，為此用戶建立一本公帳
          const newLedgerId = generateUUID();
          activeLedger = {
            id: newLedgerId,
            name: '幸福小窩家庭公帳',
            description: '全家人日常採買與生活開銷',
            currency: 'TWD',
            created_by: authUser.id,
            created_at: new Date().toISOString(),
          };

          await supabase.from('ledgers').insert({
            id: activeLedger.id,
            name: activeLedger.name,
            description: activeLedger.description,
            currency: activeLedger.currency,
            created_by: activeLedger.created_by,
          });

          await supabase.from('ledger_members').insert({
            ledger_id: activeLedger.id,
            user_id: authUser.id,
            role: 'owner',
          });
        }

        if (!isMounted) return;
        setCurrentLedger(activeLedger);
        await AsyncStorage.setItem(STORAGE_KEYS.LEDGER, JSON.stringify(activeLedger));

        // (D) 載入此帳本的分類表
        const { data: catRows } = await supabase
          .from('categories')
          .select('*')
          .or(`ledger_id.eq.${activeLedger.id},ledger_id.is.null`)
          .order('sort_order', { ascending: true });

        if (catRows && catRows.length > 0) {
          setCategories(catRows);
        } else {
          // 若無分類則寫入系統預設分類
          const catsToInsert = DEFAULT_CATEGORIES.map(c => ({
            id: generateUUID(),
            ledger_id: activeLedger.id,
            name: c.name,
            icon: c.icon,
            color: c.color,
            type: c.type,
            sort_order: c.sort_order,
          }));
          await supabase.from('categories').insert(catsToInsert);
          setCategories(catsToInsert);
        }

        // (E) 載入此帳本的全體家庭成員
        const { data: memberRows } = await supabase
          .from('ledger_members')
          .select('user_id, role, profiles(*)')
          .eq('ledger_id', activeLedger.id);

        if (memberRows && memberRows.length > 0) {
          const loadedMembers: Profile[] = memberRows
            .map((r: any) => r.profiles)
            .filter(Boolean);

          if (loadedMembers.length > 0) {
            setMembers(loadedMembers);
            await AsyncStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(loadedMembers));

            // 若目前選定的使用者不在成員清單中，重設為自己的真實 Profile
            setCurrentUser(prev => {
              const matched = loadedMembers.find(m => m.id === prev.id);
              return matched || myProfile;
            });
          }
        }

        // (F) 載入雲端交易明細
        const { data: txRows } = await supabase
          .from('transactions')
          .select('*')
          .eq('ledger_id', activeLedger.id)
          .order('transacted_at', { ascending: false });

        if (txRows) {
          const formattedTx: Transaction[] = txRows.map((t: any) => ({
            ...t,
            amount: Number(t.amount),
          }));
          setTransactions(formattedTx);
          await AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(formattedTx));
          setIsCloudSynced(true);
        }

        // (G) 建立 Supabase WebSocket Realtime 即時推播訂閱
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
        }

        const channel = supabase
          .channel(`ledger-${activeLedger.id}-realtime`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'transactions',
              filter: `ledger_id=eq.${activeLedger.id}`,
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
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              setIsCloudSynced(true);
            }
          });

        channelRef.current = channel;
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

    // 嚴格校驗各 ID 欄位，若為歷史非 UUID 快取（如 usr-179...）則自動修正為有效 UUID
    let validCreatorId = currentUser.id;
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

  // 新增家庭成員
  const addMember = async (name: string, avatar: string = '😊') => {
    const newMemberId = generateUUID();
    const newMember: Profile = {
      id: newMemberId,
      email: `${name.toLowerCase()}@family.local`,
      display_name: name,
      avatar_url: avatar,
    };
    const updated = [...members, newMember];
    setMembers(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(updated));

    if (isConfigured) {
      try {
        await supabase.from('profiles').insert(newMember);
        await supabase.from('ledger_members').insert({
          ledger_id: currentLedger.id,
          user_id: newMemberId,
          role: 'member',
        });
      } catch (err) {
        console.warn('雲端新增成員失敗:', err);
      }
    }
  };

  // 刪除家庭成員
  const deleteMember = async (id: string) => {
    if (members.length <= 1) {
      alert('家庭至少需保留一位成員');
      return;
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
