import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Transaction, Category, Ledger, LedgerMember, Profile, TransactionType } from '../types/database';
import { supabase, isConfigured } from '../lib/supabase';

// 預設示範分類
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-1', name: '餐飲伙食', icon: '🍲', color: '#EF4444', type: 'expense', sort_order: 1 },
  { id: 'cat-2', name: '生鮮超市', icon: '🛒', color: '#F59E0B', type: 'expense', sort_order: 2 },
  { id: 'cat-3', name: '居家水電', icon: '💡', color: '#3B82F6', type: 'expense', sort_order: 3 },
  { id: 'cat-4', name: '交通出行', icon: '🚗', color: '#10B981', type: 'expense', sort_order: 4 },
  { id: 'cat-5', name: '休閒娛樂', icon: '🎬', color: '#8B5CF6', type: 'expense', sort_order: 5 },
  { id: 'cat-6', name: '醫療保健', icon: '💊', color: '#EC4899', type: 'expense', sort_order: 6 },
  { id: 'cat-7', name: '育兒教育', icon: '👶', color: '#06B6D4', type: 'expense', sort_order: 7 },
  { id: 'cat-8', name: '薪資收入', icon: '💰', color: '#059669', type: 'income', sort_order: 8 },
  { id: 'cat-9', name: '投資理財', icon: '📈', color: '#2563EB', type: 'income', sort_order: 9 },
];

// 預設示範家庭成員
export const DEFAULT_MEMBERS: Profile[] = [
  { id: 'usr-1', email: 'dad@family.com', display_name: '爸爸 (我)', avatar_url: '👨' },
  { id: 'usr-2', email: 'mom@family.com', display_name: '媽媽', avatar_url: '👩' },
  { id: 'usr-3', email: 'kid@family.com', display_name: '小寶', avatar_url: '👦' },
];

export const DEFAULT_LEDGER: Ledger = {
  id: 'ledger-demo-1',
  name: '幸福小窩家庭公帳',
  description: '全家人日常採買與生活開銷',
  currency: 'TWD',
  created_by: 'usr-1',
  created_at: new Date().toISOString(),
};

// 初始示範交易資料
const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx-1',
    ledger_id: 'ledger-demo-1',
    creator_id: 'usr-1',
    category_id: 'cat-2',
    amount: 1450,
    type: 'expense',
    paid_by: 'usr-1',
    transacted_at: new Date(Date.now() - 3600000 * 4).toISOString(),
    note: 'Costco 週末採買牛奶與生鮮',
    is_settled: false,
    created_at: new Date().toISOString(),
  },
  {
    id: 'tx-2',
    ledger_id: 'ledger-demo-1',
    creator_id: 'usr-2',
    category_id: 'cat-1',
    amount: 680,
    type: 'expense',
    paid_by: 'usr-2',
    transacted_at: new Date(Date.now() - 3600000 * 20).toISOString(),
    note: '全家日式定食晚餐',
    is_settled: false,
    created_at: new Date().toISOString(),
  },
  {
    id: 'tx-3',
    ledger_id: 'ledger-demo-1',
    creator_id: 'usr-1',
    category_id: 'cat-3',
    amount: 2340,
    type: 'expense',
    paid_by: 'usr-1',
    transacted_at: new Date(Date.now() - 3600000 * 48).toISOString(),
    note: '台電夏季電費代繳',
    is_settled: false,
    created_at: new Date().toISOString(),
  },
  {
    id: 'tx-4',
    ledger_id: 'ledger-demo-1',
    creator_id: 'usr-1',
    category_id: 'cat-8',
    amount: 65000,
    type: 'income',
    paid_by: 'usr-1',
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
};

export const LedgerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentLedger, setCurrentLedger] = useState<Ledger>(DEFAULT_LEDGER);
  const [ledgers, setLedgers] = useState<Ledger[]>([DEFAULT_LEDGER]);
  const [members, setMembers] = useState<Profile[]>(DEFAULT_MEMBERS);
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [currentUser, setCurrentUser] = useState<Profile>(DEFAULT_MEMBERS[0]);
  const [isCloudSynced, setIsCloudSynced] = useState<boolean>(isConfigured);
  const [isDeviceBound, setIsDeviceBound] = useState<boolean>(false);

  // 初始化時自手機本地儲存讀取快取
  useEffect(() => {
    const loadLocalData = async () => {
      try {
        const savedTx = await AsyncStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
        if (savedTx) {
          setTransactions(JSON.parse(savedTx));
        }
        const savedUser = await AsyncStorage.getItem(STORAGE_KEYS.CURRENT_USER);
        if (savedUser) {
          setCurrentUser(JSON.parse(savedUser));
        }
        const savedMembers = await AsyncStorage.getItem(STORAGE_KEYS.MEMBERS);
        if (savedMembers) {
          setMembers(JSON.parse(savedMembers));
        }
        const savedBound = await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_BOUND);
        if (savedBound === 'true') {
          setIsDeviceBound(true);
        }
      } catch (err) {
        console.warn('載入本地記帳快取失敗:', err);
      }
    };
    loadLocalData();
  }, []);

  // 當交易更新時，保存至本地快取
  const saveTransactionsToStorage = async (newTx: Transaction[]) => {
    setTransactions(newTx);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(newTx));
    } catch (e) {
      console.warn('儲存本地記帳資料失敗:', e);
    }
  };

  // 新增交易
  const addTransaction = async (data: {
    amount: number;
    type: TransactionType;
    category_id: string;
    paid_by: string;
    note?: string;
    transacted_at?: string;
    splitWithIds?: string[];
  }) => {
    const newTx: Transaction = {
      id: `tx-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      ledger_id: currentLedger.id,
      creator_id: currentUser.id,
      category_id: data.category_id,
      amount: data.amount,
      type: data.type,
      paid_by: data.paid_by,
      note: data.note || '',
      transacted_at: data.transacted_at || new Date().toISOString(),
      is_settled: false,
      created_at: new Date().toISOString(),
      splits: data.splitWithIds?.map(userId => ({
        id: `split-${Date.now()}-${userId}`,
        transaction_id: '',
        user_id: userId,
        split_amount: data.amount / (data.splitWithIds?.length || 1),
        is_settled: false,
      })),
    };

    const updated = [newTx, ...transactions];
    await saveTransactionsToStorage(updated);

    // 若已設定 Supabase，同步推送至雲端
    if (isConfigured) {
      try {
        await supabase.from('transactions').insert({
          id: newTx.id,
          ledger_id: newTx.ledger_id,
          creator_id: newTx.creator_id,
          category_id: newTx.category_id,
          amount: newTx.amount,
          type: newTx.type,
          paid_by: newTx.paid_by,
          transacted_at: newTx.transacted_at,
          note: newTx.note,
        });
      } catch (err) {
        console.warn('雲端同步延遲，已保存於本地待稍後重試:', err);
      }
    }
  };

  // 刪除交易
  const deleteTransaction = async (id: string) => {
    const updated = transactions.filter(t => t.id !== id);
    await saveTransactionsToStorage(updated);
    if (isConfigured) {
      try {
        await supabase.from('transactions').delete().eq('id', id);
      } catch (err) {
        console.warn('雲端刪除失敗:', err);
      }
    }
  };

  // 匯出為 CSV 格式（可用 Excel 或 Google 試算表開啟）
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
    const newMember: Profile = {
      id: `usr-${Date.now()}`,
      email: `${name.toLowerCase()}@family.com`,
      display_name: name,
      avatar_url: avatar,
    };
    const updated = [...members, newMember];
    setMembers(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(updated));
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
