import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Platform, Alert, AppState, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Transaction, Category, Ledger, Profile, TransactionType, CategoryType, PaymentMethod, PaymentAccount, AccountType, CustomPaymentMethod, RecurringRule, MemberDevice, LedgerBudget } from '../types/database';
import { supabase, isConfigured, SUPABASE_URL } from '../lib/supabase';
import { getStorageServiceToken } from '../lib/statementStorage';
import { generateUUID } from '../lib/uuid';
import { DEMO_PAYMENT_ACCOUNTS, DEFAULT_PAYMENT_METHODS, isAccountBelongingToMember, KNOWN_PAYMENT_METHOD_UUIDS } from '../lib/payment';
import { DEFAULT_RECURRING_PRESETS, getCurrentPeriodKey, getBillPeriodLabel, getInstallmentInfo, appendPeriodKey } from '../lib/recurring';
import { parseMemoNote, encodeMemoMerchantTag, decodeMemoMerchantTag, DEFAULT_MEMO_QUICK_TAGS, extractMemoTag, toggleChecklistItem } from '../lib/memo';
import { CalendarSystem, MemoRepeatFrequency, getNextMemoReminderDate, formatMemoReminderBadge } from '../lib/lunar';
import { formatInvoiceNumber, getInvoicePeriodKey, encodeInvoiceTag, decodeInvoiceTag, stripInvoiceTag } from '../lib/invoice';
import { checkInvoiceWinning, syncLotteryDrawsAsync } from '../lib/lottery';
import { APP_FULL_VERSION } from '../constants/version';
import { getDeviceId, getDeviceName, getDevicePlatform } from '../lib/device';
import { scheduleMemoReminderNotifications } from '../lib/billingNotifications';
import {
  OfflineMutation,
  getOfflineQueue,
  enqueueOfflineMutation,
  dequeueOfflineMutation,
  updateMutationFailure,
  subscribeOfflineQueue,
  cancelOfflineMutationByTxId,
} from '../lib/offlineQueue';


// 常數與預設示範資料已模組化抽離至 src/constants/ledgerDefaults.ts
import {
  DEMO_LEDGER_ID,
  DEMO_USER_DAD,
  DEMO_USER_MOM,
  DEMO_USER_KID,
  DEFAULT_CATEGORIES,
  DEFAULT_MEMBERS,
  DEFAULT_LEDGER,
  DEMO_RECURRING_RULES,
  INITIAL_TRANSACTIONS,
  STORAGE_KEYS,
  DEFAULT_POPULAR_MERCHANTS,
  KNOWN_CATEGORY_UUIDS,
  isValidUUID,
} from '../constants/ledgerDefaults';

// 無狀態純工具函式已模組化抽離至 src/lib/ledgerUtils.ts
import {
  safeAlert,
  hydrateTransactionWithInvoice,
  deduplicateMembers,
  buildMemberAliasMap,
  mergePaymentMethods,
  isAccountBoundToUser,
} from '../lib/ledgerUtils';

// 領域狀態 Hooks
import { useLedgerBudget } from '../hooks/useLedgerBudget';
import { usePaymentAccounts } from '../hooks/usePaymentAccounts';
import { useRecurringRules } from '../hooks/useRecurringRules';
import { useDeviceAuth } from '../hooks/useDeviceAuth';
import { useLedgerBackup } from '../hooks/useLedgerBackup';

// 保持 100% 向後相容導出，確保全 App 任何既有 import 完全不壞
export {
  DEFAULT_CATEGORIES,
  DEFAULT_MEMBERS,
  DEFAULT_LEDGER,
  DEMO_RECURRING_RULES,
  DEFAULT_POPULAR_MERCHANTS,
  KNOWN_CATEGORY_UUIDS,
} from '../constants/ledgerDefaults';

export {
  hydrateTransactionWithInvoice,
  deduplicateMembers,
  buildMemberAliasMap,
  mergePaymentMethods,
} from '../lib/ledgerUtils';

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
    reminder_target?: 'family' | 'personal';
    completed_by?: string;
    transacted_at?: string;
    payment_method?: PaymentMethod;
    account_id?: string;
    is_reconciled?: boolean;
    completion_note?: string;
    linked_transaction_id?: string;
    invoice_number?: string;
    invoice_random_code?: string;
    invoice_period?: string;
    invoice_status?: 'pending' | 'won' | 'missed' | 'claimed';
    invoice_prize_amount?: number;
    invoice_prize_name?: string;
    image_url?: string;
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
      reminder_target?: 'family' | 'personal';
      completed_by?: string;
      completion_note?: string;
      linked_transaction_id?: string;
      invoice_number?: string;
      invoice_random_code?: string;
      invoice_period?: string;
      invoice_status?: 'pending' | 'won' | 'missed' | 'claimed';
      invoice_prize_amount?: number;
      invoice_prize_name?: string;
      image_url?: string;
      transacted_at?: string;
      payment_method?: PaymentMethod;
      account_id?: string;
      is_reconciled?: boolean;
      is_settled?: boolean;
    }
  ) => Promise<boolean>;
  claimInvoicePrize: (transactionId: string) => Promise<boolean>;
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
  taxIdMerchantMap: Record<string, string>;
  recordTaxIdMerchant: (taxId: string, merchantName: string) => Promise<void>;
  recentMemoTags: string[];
  dismissedMemoTags: string[];
  recordMemoTag: (tag: string, isManual?: boolean) => Promise<void>;
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
  historySyncProgress: { loaded: number; total: number } | null;
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
  updateAllowNewMembers: (allowed: boolean, targetLedgerId?: string) => Promise<{ success: boolean; message?: string }>;
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
  resetLocalCacheAndResync: () => Promise<{
    success: boolean;
    txCount: number;
    memberCount: number;
    accountCount: number;
    message?: string;
  }>;
  isCurrentUserLocked: boolean;
  signInWithGoogle: () => Promise<{ success: boolean; message?: string }>;
  signOutGoogle: () => Promise<void>;
  isGoogleAuthenticated: boolean;
    googleUserEmail: string | null;
  currentBudget: LedgerBudget | null;
  isBudgetWidgetVisibleOnDevice: boolean;
  setBudgetWidgetVisibleOnDevice: (visible: boolean) => Promise<void>;
  updateBudget: (newBudget: Partial<LedgerBudget>) => Promise<void>;
  getBudgetProgress: (targetMonthYm?: string, targetMemberId?: string) => {
    isEnabled: boolean;
    isMemberPerspective: boolean;
    targetMemberName?: string;
    hasMemberBudgetConfigured?: boolean;
    totalBudget: number;
    spentAmount: number;
    remainingAmount: number;
    spentRatio: number;
    isWarning: boolean;
    isOverBudget: boolean;
    daysRemaining: number;
    dailyAvailable: number;
  };
  getMoMComparison: (targetMonthYm?: string) => {
    currentYm: string;
    prevYm: string;
    currentExpense: number;
    prevExpense: number;
    expenseDiff: number;
    expenseDiffRate: number;
    currentIncome: number;
    prevIncome: number;
    incomeDiff: number;
    incomeDiffRate: number;
    topIncreasedCategory?: { name: string; icon: string; diff: number };
    topDecreasedCategory?: { name: string; icon: string; diff: number };
  };
  getSixMonthTrend: () => Array<{
    ym: string;
    label: string;
    income: number;
    expense: number;
    balance: number;
  }>;
  executeTransfer: (params: {
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    fee?: number;
    payerId?: string;
    transactedAt?: string;
    note?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  getNetWorthSummary: (targetMemberId?: string) => {
    totalAssets: number;
    totalLiabilities: number;
    netWorth: number;
    bankTotal: number;
    cashTotal: number;
    storedValueTotal: number;
    creditCardTotal: number;
    accounts: {
      banks: PaymentAccount[];
      cash: PaymentAccount[];
      storedValues: PaymentAccount[];
      creditCards: Array<PaymentAccount & { outstandingDebt: number }>;
    };
  };
  offlineQueue: OfflineMutation[];
  pendingOfflineCount: number;
  isProcessingQueue: boolean;
  processOfflineQueue: () => Promise<{ success: boolean; syncedCount: number; failedCount: number }>;
}

const LedgerContext = createContext<LedgerContextType | null>(null);

export const LedgerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentLedger, setCurrentLedger] = useState<Ledger>(DEFAULT_LEDGER);
  const [ledgers, setLedgers] = useState<Ledger[]>([DEFAULT_LEDGER]);
  const [members, setMembers] = useState<Profile[]>(DEFAULT_MEMBERS);
  const [rawMembers, setRawMembers] = useState<Profile[]>([]);
  const [memberAliasMap, setMemberAliasMap] = useState<Record<string, Profile>>({});
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [transactions, setTransactions] = useState<Transaction[]>(() => INITIAL_TRANSACTIONS.map(hydrateTransactionWithInvoice));
  const [currentUser, setCurrentUser] = useState<Profile>(DEFAULT_MEMBERS[0]);
  const [isCloudSynced, setIsCloudSynced] = useState<boolean>(false);
  const [historySyncProgress, setHistorySyncProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [offlineQueue, setOfflineQueue] = useState<OfflineMutation[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState<boolean>(false);

  useEffect(() => {
    const unsub = subscribeOfflineQueue((q) => {
      setOfflineQueue(q);
    });
    return unsub;
  }, []);

  const pendingOfflineCount = offlineQueue.length;
  const activeLoadingLedgerIdRef = useRef<string | null>(null);
  const inMemoryLedgerTxCacheRef = useRef<Map<string, Transaction[]>>(new Map());

  // 本地快取儲存容量防禦：僅寫入最新 1,500 筆至 AsyncStorage / localStorage，安全避開瀏覽器 5MB 配額限制
  const persistTransactionsCache = async (txList: Transaction[], ledgerId: string) => {
    try {
      const safeList = txList.length > 1500 ? txList.slice(0, 1500) : txList;
      const jsonStr = JSON.stringify(safeList);
      await AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, jsonStr);
      await AsyncStorage.setItem(`${STORAGE_KEYS.TRANSACTIONS}_${ledgerId}`, jsonStr);
    } catch (err) {
      console.warn('本機快取寫入容量防禦保護:', err);
    }
  };

  const [hasJoinedLedger, setHasJoinedLedger] = useState<boolean>(true);
  const [inviteCode, setInviteCode] = useState<string>('FAM-8823');
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(null);

  // 即時 App 內通知泡泡 (In-App Toast Notification)
  const [liveToast, setLiveToast] = useState<LiveToastNotification | null>(null);
  const currentUserRef = useRef<Profile>(currentUser);
  const transactionsRef = useRef<Transaction[]>(transactions);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    transactionsRef.current = transactions;
  }, [transactions]);

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

  // 智慧店家 / 對象自學習名單與雲端欄位探測
  const [recentMerchants, setRecentMerchants] = useState<string[]>(DEFAULT_POPULAR_MERCHANTS);
  const [recentMemoTags, setRecentMemoTags] = useState<string[]>(DEFAULT_MEMO_QUICK_TAGS);
  const [dismissedMemoTags, setDismissedMemoTags] = useState<string[]>([]);
  const dismissedMemoTagsRef = useRef<Set<string>>(new Set());
  const hasMerchantColumnRef = useRef<boolean>(false);
  const hasPaymentColumnsRef = useRef<boolean>(false);
  const deletedTxIdsRef = useRef<Set<string>>(new Set());
  const recentToastTimestampsRef = useRef<Map<string, number>>(new Map());
  const recentUpdatersRef = useRef<Map<string, { updaterId: string; updaterName: string; updaterAvatar: string; timestamp: number }>>(new Map());

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
    setRecentMerchants(prev => {
      const filtered = prev.filter(item => item.toLowerCase() !== clean.toLowerCase());
      const updated = [clean, ...filtered].slice(0, 50);
      AsyncStorage.setItem(STORAGE_KEYS.RECENT_MERCHANTS, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const [taxIdMerchantMap, setTaxIdMerchantMap] = useState<Record<string, string>>({});

  const recordTaxIdMerchant = React.useCallback(async (taxId: string, merchantName: string) => {
    const cleanId = (taxId || '').trim();
    const cleanName = (merchantName || '').trim();
    if (!cleanId || !cleanName) return;

    setTaxIdMerchantMap(prev => {
      const updated = { ...prev, [cleanId]: cleanName };
      AsyncStorage.setItem(STORAGE_KEYS.TAX_ID_MERCHANTS, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const recordMemoTag = React.useCallback(async (tag: string, isManual = false) => {
    const clean = (tag || '').trim();
    if (!clean) return;
    const lower = clean.toLowerCase();

    // 若非使用者手動點擊/輸入，且已被使用者主動移除過，嚴格阻絕歷史交易載入時自動加回
    if (!isManual && dismissedMemoTagsRef.current.has(lower)) {
      return;
    }

    // 若為使用者手動套用，視為使用者解除移除狀態
    if (isManual && dismissedMemoTagsRef.current.has(lower)) {
      dismissedMemoTagsRef.current.delete(lower);
      setDismissedMemoTags(prev => {
        const next = prev.filter(t => t.toLowerCase() !== lower);
        AsyncStorage.setItem(STORAGE_KEYS.DISMISSED_MEMO_TAGS, JSON.stringify(next)).catch(() => {});
        return next;
      });
    }

    setRecentMemoTags(prev => {
      const filtered = prev.filter(item => item.toLowerCase() !== lower);
      const updated = [clean, ...filtered].slice(0, 30);
      AsyncStorage.setItem(STORAGE_KEYS.RECENT_MEMO_TAGS, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const removeRecentMemoTag = React.useCallback(async (tag: string) => {
    const clean = (tag || '').trim();
    if (!clean) return;
    const lower = clean.toLowerCase();

    // 1. 登記到被主動移除的黑名單中並持久化，確保跨同步與重載時絕不再自動跑出
    dismissedMemoTagsRef.current.add(lower);
    setDismissedMemoTags(prev => {
      if (prev.some(t => t.toLowerCase() === lower)) return prev;
      const updated = [...prev, clean];
      AsyncStorage.setItem(STORAGE_KEYS.DISMISSED_MEMO_TAGS, JSON.stringify(updated)).catch(() => {});
      return updated;
    });

    // 2. 從常用標籤清單中移除
    setRecentMemoTags(prev => {
      const updated = prev.filter(item => item.toLowerCase() !== lower);
      AsyncStorage.setItem(STORAGE_KEYS.RECENT_MEMO_TAGS, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const getMemberById = React.useCallback(
    (id?: string): Profile | undefined => {
      if (!id) return undefined;
      const direct = members.find(m => m.id === id);
      if (direct) return direct;
      if (memberAliasMap && memberAliasMap[id]) return memberAliasMap[id];
      if (id === DEMO_USER_DAD) return members.find(m => m.display_name.includes('爸') || m.role === 'owner') || members[0];
      if (id === DEMO_USER_MOM) return members.find(m => m.display_name.includes('媽')) || members[1] || members[0];
      if (id === DEMO_USER_KID) return members.find(m => m.display_name.includes('寶') || m.display_name.includes('孩')) || members[2] || members[0];
      const raw = rawMembers.find(m => m.id === id);
      if (raw) {
        const canonical = members.find(
          m => (m.display_name || '').trim().toLowerCase() === (raw.display_name || '').trim().toLowerCase()
        );
        if (canonical) return canonical;
      }
      return undefined;
    },
    [members, memberAliasMap, rawMembers]
  );

  const getCategoryById = React.useCallback(
    (categoryId?: string, fallbackCategory?: Category): Category => {
      if (!categoryId) return fallbackCategory || categories[0] || DEFAULT_CATEGORIES[0];
      const fromState = categories.find(c => c.id === categoryId);
      if (fromState) return fromState;
      if (fallbackCategory) return fallbackCategory;
      const fromDefault = DEFAULT_CATEGORIES.find(c => c.id === categoryId);
      if (fromDefault) return fromDefault;
      const fromKnown = KNOWN_CATEGORY_UUIDS[categoryId];
      if (fromKnown) {
        return {
          id: categoryId,
          name: fromKnown.name || '生活雜支',
          icon: fromKnown.icon || '📦',
          color: fromKnown.color || '#6B7280',
          type: (fromKnown.type as any) || 'expense',
          sort_order: 999,
        };
      }
      return {
        id: categoryId,
        name: '生活雜支',
        icon: '📦',
        color: '#6B7280',
        type: 'expense',
        sort_order: 999,
      };
    },
    [categories]
  );

  const channelRef = useRef<any>(null);
  const loadBudgetRef = useRef<((id: string) => Promise<void>) | null>(null);
  const initLedgerRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const refreshLedgerRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const triggerLiveToastRef = useRef<(toast: any) => void>(() => {});
  const addTransactionRef = useRef<(data: any) => Promise<string>>(() => Promise.resolve(''));
  const saveTransactionsToStorageRef = useRef<(txs: Transaction[]) => Promise<void>>(async () => {});

  // 1. 裝置、認證、成員身分與管理員 PIN 碼模組
  const {
    memberDevices,
    setMemberDevices,
    currentDeviceId,
    setCurrentDeviceId,
    isDeviceBound,
    setIsDeviceBound,
    userRole,
    setUserRole,
    adminPin,
    setAdminPin,
    isAdminMode,
    setIsAdminMode,
    enableAdminMode,
    disableAdminMode,
    previewMember,
    setPreviewMember,
    isPreviewMode,
    effectiveCurrentUser,
    isOwner,
    effectiveIsOwner,
    isCurrentUserLocked,
    isGoogleAuthenticated,
    setIsGoogleAuthenticated,
    googleUserEmail,
    setGoogleUserEmail,
    startMemberPreview,
    startCurrentMemberPreview,
    exitMemberPreview,
    updateAdminPin,
    fetchMemberDevices,
    registerDevice,
    removeDevice,
    linkGoogleAccount,
    unlinkGoogleAccount,
    claimGoogleIdentity,
    signInWithGoogle,
    signOutGoogle,
    switchCurrentUser,
    bindDeviceToMember,
    unbindDevice,
    updateMemberRole,
    claimAdminRoleWithPin,
  } = useDeviceAuth({
    currentLedger,
    setCurrentLedger,
    currentUser,
    setCurrentUser,
    members,
    setMembers,
    setLedgers,
    isConfigured,
    supabase,
    triggerLiveToast: (t) => triggerLiveToastRef.current(t),
    initLedger: async () => initLedgerRef.current(),
    refreshLedger: async () => refreshLedgerRef.current(),
  });

  // 2. 四大支付帳戶、自訂付款方式、轉帳與淨值看板模組
  const {
    paymentAccounts,
    setPaymentAccounts,
    paymentMethods,
    setPaymentMethods,
    addPaymentAccount,
    updatePaymentAccount,
    deletePaymentAccount,
    restoreDefaultAccounts,
    savePaymentAccountsToStorage,
    addPaymentMethod,
    updatePaymentMethod,
    deletePaymentMethod,
    togglePaymentMethodEnabled,
    reorderPaymentMethods,
    restoreDefaultPaymentMethods,
    getPaymentMethodById,
    savePaymentMethodsToStorage,
    topUpAccountBalance,
    adjustAccountBalance,
    toggleReconcileTransaction,
    getAccountById,
    getNetWorthSummary,
    executeTransfer,
  } = usePaymentAccounts({
    currentLedger,
    currentUser,
    effectiveCurrentUser,
    effectiveIsOwner,
    members,
    categories,
    transactions,
    setTransactions,
    saveTransactionsToStorage: async (txs) => saveTransactionsToStorageRef.current(txs),
    addTransaction: async (data) => addTransactionRef.current(data),
    isConfigured,
    supabase,
  });

  // 3. 固定收支與週期扣款規則模組
  const {
    recurringRules,
    setRecurringRules,
    saveRecurringRulesToStorage,
    addRecurringRule,
    updateRecurringRule,
    deleteRecurringRule,
    recordRecurringBill,
    skipRecurringBill,
    restoreDefaultRecurringRules,
  } = useRecurringRules({
    currentLedger,
    currentUser,
    categories,
    paymentAccounts,
    addTransaction: async (data) => addTransactionRef.current(data),
    isConfigured,
    supabase,
  });

  // 4. 預算控管、超支警戒與 6 個月趨勢模組
  const {
    currentBudget,
    setCurrentBudget,
    isBudgetWidgetVisibleOnDevice,
    loadBudget,
    setBudgetWidgetVisibleOnDevice,
    updateBudget,
    getBudgetProgress,
    getMoMComparison,
    getSixMonthTrend,
  } = useLedgerBudget({
    ledgerId: currentLedger.id,
    members,
    currentUser,
    isOwner: effectiveIsOwner,
    transactions,
    getCategoryById,
    getMemberById,
    isConfigured,
    supabase,
  });
  loadBudgetRef.current = loadBudget;

  // 5. 備份排程、JSON/CSV 匯出與整本還原模組
  const {
    lastBackupAt,
    setLastBackupAt,
    autoBackupEnabled,
    setAutoBackupEnabled,
    autoBackupInterval,
    setAutoBackupInterval,
    recordBackupComplete,
    updateAutoBackupConfig,
    exportToCSV,
    exportToJSON,
    restoreFromJSON,
  } = useLedgerBackup({
    currentLedger,
    setCurrentLedger,
    setLedgers,
    members,
    setMembers,
    setMemberAliasMap,
    categories,
    setCategories,
    paymentAccounts,
    setPaymentAccounts,
    savePaymentAccountsToStorage,
    transactions,
    setTransactions,
    saveTransactionsToStorage: async (txs) => saveTransactionsToStorageRef.current(txs),
    recurringRules,
    setRecurringRules,
    saveRecurringRulesToStorage,
    paymentMethods,
    setPaymentMethods,
    savePaymentMethodsToStorage,
    inviteCode,
    effectiveIsOwner,
    isConfigured,
    supabase,
    getCategoryById,
    getMemberById,
    currentUser,
    memberAliasMap,
    deletedTxIdsRef,
    hasMerchantColumnRef,
    hasPaymentColumnsRef,
  });

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
              if (!parsed.some((c: any) => c.type === 'income' && (c.name === '獎金回饋' || c.name.includes('獎金') || c.name.includes('回饋')))) {
                const bonusCat = DEFAULT_CATEGORIES.find(c => c.name === '獎金回饋');
                if (bonusCat) parsed.push(bonusCat);
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

        const savedDismissedMemoTags = await AsyncStorage.getItem(STORAGE_KEYS.DISMISSED_MEMO_TAGS);
        if (savedDismissedMemoTags) {
          try {
            const parsed = JSON.parse(savedDismissedMemoTags);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setDismissedMemoTags(parsed);
              dismissedMemoTagsRef.current = new Set(parsed.map((t: string) => (t || '').trim().toLowerCase()));
            }
          } catch {}
        }

        const savedTaxIdMerchants = await AsyncStorage.getItem(STORAGE_KEYS.TAX_ID_MERCHANTS);
        if (savedTaxIdMerchants) {
          try {
            const parsed = JSON.parse(savedTaxIdMerchants);
            if (parsed && typeof parsed === 'object') {
              setTaxIdMerchantMap(parsed);
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

        // 全自動背景連線同步財政部最新統一發票開獎號碼庫並即時重新對獎
        syncLotteryDrawsAsync()
          .then(() => {
            setTransactions(prev => prev.map(hydrateTransactionWithInvoice));
          })
          .catch(() => {});
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
            const item: Transaction = hydrateTransactionWithInvoice({
              ...newRow,
              type: resolvedType,
              reminder_date: reminderDate || newRow.reminder_date,
              reminder_calendar: reminderCalendar || newRow.reminder_calendar,
              reminder_repeat: reminderRepeat || newRow.reminder_repeat,
              reminder_target: newRow.reminder_target || 'family',
              completed_by: completedBy || newRow.completed_by,
              merchant: parsedMerchant || undefined,
              note: parsedNote || '',
              amount: resolvedType === 'memo' ? 0 : Number(newRow.amount),
              paid_by: canonicalPayer?.id || newRow.paid_by,
              payer_profile: canonicalPayer || newRow.payer_profile,
              category: getCategoryById(newRow.category_id, newRow.category),
            });
            const updated = [item, ...prev];
            inMemoryLedgerTxCacheRef.current.set(ledgerId, updated);
            persistTransactionsCache(updated, ledgerId);
            return updated;
          });

          // 若這筆記帳/記事由其他裝置寫入，觸發即時通知泡泡
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
                ? hydrateTransactionWithInvoice({
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
                  })
                : t
            );
            inMemoryLedgerTxCacheRef.current.set(ledgerId, updated);
            persistTransactionsCache(updated, ledgerId);
            return updated;
          });

          // 若更新由其他裝置發起，觸發即時通知泡泡
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
            inMemoryLedgerTxCacheRef.current.set(ledgerId, updated);
            persistTransactionsCache(updated, ledgerId);
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
            inMemoryLedgerTxCacheRef.current.set(ledgerId, updated);
            persistTransactionsCache(updated, ledgerId);
            return updated;
          });

          // 即時通知泡泡
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
              inMemoryLedgerTxCacheRef.current.set(ledgerId, updated);
              persistTransactionsCache(updated, ledgerId);
              return updated;
            });

            // 即時通知泡泡
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
            let freshAccounts: PaymentAccount[] = [];
            const { data: accRows } = await supabase
              .from('payment_accounts')
              .select('*')
              .eq('ledger_id', ledgerId)
              .order('sort_order', { ascending: true });

            if (accRows && accRows.length > 0) {
              freshAccounts = accRows;
            } else if (ledgerId !== DEMO_LEDGER_ID) {
              const token = getStorageServiceToken();
              const res = await fetch(`${SUPABASE_URL}/rest/v1/payment_accounts?ledger_id=eq.${ledgerId}&select=*&order=sort_order.asc`, {
                headers: { apikey: token, Authorization: `Bearer ${token}` },
              });
              if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) freshAccounts = data;
              }
            }

            if (freshAccounts.length > 0) {
              setPaymentAccounts(freshAccounts);
              AsyncStorage.setItem(STORAGE_KEYS.PAYMENT_ACCOUNTS, JSON.stringify(freshAccounts));
              AsyncStorage.setItem(`${STORAGE_KEYS.PAYMENT_ACCOUNTS}_${ledgerId}`, JSON.stringify(freshAccounts));
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
            let rulesList: RecurringRule[] = [];
            const { data: ruleRows } = await supabase
              .from('recurring_rules')
              .select('*')
              .eq('ledger_id', ledgerId)
              .order('created_at', { ascending: false });

            if (ruleRows && ruleRows.length > 0) {
              rulesList = ruleRows;
            } else if (ledgerId !== DEMO_LEDGER_ID) {
              const token = getStorageServiceToken();
              const res = await fetch(`${SUPABASE_URL}/rest/v1/recurring_rules?ledger_id=eq.${ledgerId}&select=*&order=created_at.desc`, {
                headers: { apikey: token, Authorization: `Bearer ${token}` },
              });
              if (res.ok) {
                const d = await res.json();
                if (Array.isArray(d) && d.length > 0) rulesList = d;
              }
            }

            if (rulesList.length > 0) {
              setRecurringRules(rulesList);
              AsyncStorage.setItem(`${STORAGE_KEYS.RECURRING_RULES}_${ledgerId}`, JSON.stringify(rulesList));
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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ledger_budgets',
          filter: `ledger_id=eq.${ledgerId}`,
        },
        async () => {
          // 當公帳總預算或成員個人額度變更時，即時推播刷新全體家庭裝置
          try {
            if (loadBudgetRef.current) {
              await loadBudgetRef.current(ledgerId);
            }
          } catch (err) {
            console.warn('Realtime 刷新預算失敗:', err);
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
  const loadLedgerData = async (targetLedger: Ledger, authUserId: string) => {
    setCurrentLedger(targetLedger);
    activeLoadingLedgerIdRef.current = targetLedger.id;

    // 立即同步預載目標帳本之專屬使用者身分與成員快取 (Local-First Optimistic User & Members)
    // 確保 currentLedger 與 currentUser 同步切換，絕不殘留上一本帳本之稱謂 (徹底杜絕「倉鼠」短暫閃爍為「智爸」之問題)
    try {
      const savedUserStr = await AsyncStorage.getItem(`${STORAGE_KEYS.CURRENT_USER}_${targetLedger.id}`);
      if (savedUserStr) {
        const parsedUser = JSON.parse(savedUserStr);
        if (parsedUser && parsedUser.display_name) {
          setCurrentUser(parsedUser);
        }
      } else if (targetLedger.userDisplayName) {
        setCurrentUser(prev => ({
          ...prev,
          display_name: targetLedger.userDisplayName!,
          avatar_url: targetLedger.userAvatar || prev.avatar_url,
        }));
      }
    } catch {}

    try {
      const savedMembersStr = await AsyncStorage.getItem(`${STORAGE_KEYS.MEMBERS}_${targetLedger.id}`);
      if (savedMembersStr) {
        const parsedMembers = JSON.parse(savedMembersStr);
        if (Array.isArray(parsedMembers) && parsedMembers.length > 0) {
          setMembers(parsedMembers);
        }
      }
    } catch {}

    // 本地快取秒開搶先渲染 (Local-First Optimistic Preload)
    // 優先檢查記憶體快取 (RAM cache)：若本會話已載入過海量明細，0 秒即刻完整展示；否則讀取 AsyncStorage 於 0.05 秒內搶先渲染最新明細
    let hasLocalCache = false;
    let localCachedTransactions: Transaction[] = [];

    const memCached = inMemoryLedgerTxCacheRef.current.get(targetLedger.id);
    if (memCached && memCached.length > 0) {
      hasLocalCache = true;
      const hydratedMem = memCached.map(hydrateTransactionWithInvoice);
      localCachedTransactions = hydratedMem;
      setTransactions(hydratedMem);
    } else {
      try {
        const savedTxStr = (await AsyncStorage.getItem(`${STORAGE_KEYS.TRANSACTIONS}_${targetLedger.id}`)) ||
                           (await AsyncStorage.getItem(STORAGE_KEYS.TRANSACTIONS));
        if (savedTxStr) {
          const parsed = JSON.parse(savedTxStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const matching = parsed.filter((t: any) => t && t.ledger_id === targetLedger.id);
            if (matching.length > 0) {
              hasLocalCache = true;
              const hydratedMatching = matching.map(hydrateTransactionWithInvoice);
              localCachedTransactions = hydratedMatching;
              setTransactions(hydratedMatching);
            }
          }
        }
      } catch {}
    }

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
    let activeCatRows: Category[] = [];
    try {
      const { data: catRows, error: catErr } = await supabase
        .from('categories')
        .select('*')
        .or(`ledger_id.eq.${targetLedger.id},ledger_id.is.null`)
        .order('sort_order', { ascending: true });

      if (!catErr && catRows && catRows.length > 0) {
        activeCatRows = catRows;
      }
    } catch (e) {
      console.warn('客戶端查詢分類失敗:', e);
    }

    // 服務權杖穿透雙軌韌性備援：若客戶端因 RLS 權限受限拉取為 0 筆，無縫啟用服務權杖穿透拉取
    if (activeCatRows.length === 0 && targetLedger.id !== DEMO_LEDGER_ID) {
      try {
        const token = getStorageServiceToken();
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/categories?or=(ledger_id.eq.${targetLedger.id},ledger_id.is.null)&select=*&order=sort_order.asc`,
          {
            headers: {
              apikey: token,
              Authorization: `Bearer ${token}`,
            },
          }
        );
        if (res.ok) {
          const d = await res.json();
          if (Array.isArray(d) && d.length > 0) {
            activeCatRows = d;
          }
        }
      } catch (fallbackErr) {
        console.warn('服務權杖穿透拉取分類失敗:', fallbackErr);
      }
    }

    if (activeCatRows.length > 0) {
      let finalCats = [...activeCatRows];
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

      const hasBonusRebate = finalCats.some(c => c.type === 'income' && (c.name === '獎金回饋' || c.name.includes('獎金') || c.name.includes('回饋')));
      if (!hasBonusRebate && isConfigured && targetLedger.id !== DEMO_LEDGER_ID) {
        const bonusCat = {
          id: generateUUID(),
          ledger_id: targetLedger.id,
          name: '獎金回饋',
          icon: '🎁',
          color: '#F59E0B',
          type: 'income' as CategoryType,
          sort_order: (finalCats[finalCats.length - 1]?.sort_order || 10) + 1,
        };
        try {
          supabase.from('categories').insert(bonusCat).then(({ error }) => {
            if (error) console.warn('自動同步獎金回饋分類失敗:', error.message);
          });
          finalCats.push(bonusCat);
        } catch {}
      } else if (!hasBonusRebate) {
        const defaultBonus = DEFAULT_CATEGORIES.find(c => c.name === '獎金回饋');
        if (defaultBonus) finalCats.push(defaultBonus);
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
    const { data: memberRows, error: memErr } = await supabase
      .from('ledger_members')
      .select('user_id, role, profiles(*)')
      .eq('ledger_id', targetLedger.id);

    let activeMemberRows = (!memErr && memberRows && memberRows.length > 0) ? memberRows : [];

    if (activeMemberRows.length === 0 && targetLedger.id !== DEMO_LEDGER_ID) {
      try {
        const token = getStorageServiceToken();
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/ledger_members?ledger_id=eq.${targetLedger.id}&select=user_id,role,profiles(*)`,
          {
            headers: {
              apikey: token,
              Authorization: `Bearer ${token}`,
            },
          }
        );
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            activeMemberRows = data;
          }
        }
      } catch (memFallbackErr) {
        console.warn('服務權杖穿透拉取成員備援失敗:', memFallbackErr);
      }
    }

    let loadedMembers: Profile[] = [];
    if (activeMemberRows && activeMemberRows.length > 0) {
      loadedMembers = activeMemberRows
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

    // 雲端幽靈成員自動自癒清理：若名冊中已存在具名自訂成員，但雲端仍殘留未命名的預設「家庭成員」假人，自動自雲端抹除
    if (isConfigured && targetLedger.id !== DEMO_LEDGER_ID && dedupedMembers.length > 0) {
      const ghostRows = activeMemberRows.filter((r: any) =>
        r.profiles &&
        ((r.profiles.display_name || '').trim() === '家庭成員' || (r.profiles.display_name || '').trim() === '') &&
        r.user_id !== targetLedger.created_by
      );
      if (ghostRows.length > 0) {
        for (const ghost of ghostRows) {
          supabase
            .from('ledger_members')
            .delete()
            .eq('ledger_id', targetLedger.id)
            .eq('user_id', ghost.user_id)
            .then(
              () => {
                console.log(`[自癒] 已自雲端清理殘留之幽靈成員: ${ghost.user_id}`);
              },
              (err: any) => {
                console.warn('[自癒] 雲端清理幽靈成員失敗:', err);
              }
            );
        }
      }
    }

    if (dedupedMembers.length > 0) {
      setMembers(dedupedMembers);
      await AsyncStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(dedupedMembers));
      await AsyncStorage.setItem(`${STORAGE_KEYS.MEMBERS}_${targetLedger.id}`, JSON.stringify(dedupedMembers));

      const myMemberRow = activeMemberRows?.find((r: any) => r.user_id === authUserId);
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
      const creatorRow = activeMemberRows?.find((r: any) => r.user_id === targetLedger.created_by);
      const creatorName = ((creatorRow?.profiles as any)?.display_name || '').trim().toLowerCase();
      const myName = (targetSavedUser?.display_name || myDisplayName || canonicalMe?.display_name || '').trim().toLowerCase();
      const isCreatorByName = Boolean(creatorName && myName && creatorName === myName);

      const hasAdminByName = activeMemberRows?.some((r: any) => {
        const rName = ((r.profiles as any)?.display_name || '').trim().toLowerCase();
        return (r.role === 'owner' || r.role === 'admin' || r.user_id === targetLedger.created_by) && rName && rName === myName;
      });

      const isMeCreator = isCreator || isCreatorByName || (canonicalMe ? targetLedger.created_by === canonicalMe.id : false);
      const myRow = activeMemberRows?.find((r: any) => r.user_id === authUserId || (canonicalMe && r.user_id === canonicalMe.id));
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

      return hydrateTransactionWithInvoice({
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
      });
    };

    // (D) 載入交易明細：本地快取搶先秒開 + 高效並發漸進載入海量歷史明細
    let finalTx: Transaction[] = [];
    let cloudTotalCount: number | null = null;
    let firstChunk: any[] = [];

    if (isConfigured && targetLedger.id !== DEMO_LEDGER_ID) {
      try {
        const { data: chunk, count: totalCount, error: chunkErr } = await supabase
          .from('transactions')
          .select('*', { count: 'exact' })
          .eq('ledger_id', targetLedger.id)
          .order('transacted_at', { ascending: false })
          .range(0, 999);

        if (!chunkErr && chunk && chunk.length > 0) {
          firstChunk = chunk;
          cloudTotalCount = totalCount;
        } else if (chunkErr) {
          console.warn('拉取首批明細異常:', chunkErr.message);
        }
      } catch (e) {
        console.warn('拉取首批明細網路失敗:', e);
      }

      // 服務權杖穿透雙軌韌性備援：若客戶端因 RLS 權限受限拉取為 0 筆，無縫啟用服務權杖穿透拉取
      if (firstChunk.length === 0) {
        try {
          const token = getStorageServiceToken();
          const res = await fetch(
            `${SUPABASE_URL}/rest/v1/transactions?ledger_id=eq.${targetLedger.id}&select=*&order=transacted_at.desc&limit=1000`,
            {
              headers: {
                apikey: token,
                Authorization: `Bearer ${token}`,
                Prefer: 'count=exact',
              },
            }
          );
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
              firstChunk = data;
              const countHeader = res.headers.get('content-range');
              if (countHeader && countHeader.includes('/')) {
                const total = parseInt(countHeader.split('/')[1], 10);
                if (!isNaN(total)) cloudTotalCount = total;
              } else {
                cloudTotalCount = data.length;
              }
            }
          }
        } catch (fallbackErr) {
          console.warn('服務權杖穿透拉取明細備援失敗:', fallbackErr);
        }
      }

      if (firstChunk.length > 0) {
        const transformedFirst = firstChunk.map(transformSingleTx);
        const mergedMap = new Map<string, Transaction>();
        transformedFirst.forEach(t => {
          if (!deletedSet.has(t.id)) mergedMap.set(t.id, t);
        });
        if (hasLocalCache && localCachedTransactions.length > 0) {
          // 嚴格保護：雲端已有權威明細時，本地只允許合併「真正帶有 _isPendingSync 標記之離線新記帳」
          // 絕不盲目合併無 _isPendingSync 的舊孤兒快取，徹底杜絕多裝置間交易筆數膨脹分裂 (321+41=362)
          localCachedTransactions.forEach(t => {
            if (Boolean((t as any)._isPendingSync) && !mergedMap.has(t.id) && !deletedSet.has(t.id)) {
              mergedMap.set(t.id, t);
            }
          });
        }
        finalTx = Array.from(mergedMap.values());
      } else if (hasLocalCache && localCachedTransactions.length > 0) {
        finalTx = localCachedTransactions.filter(t => !deletedSet.has(t.id));
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

    finalTx.sort((a, b) => (b.transacted_at > a.transacted_at ? 1 : b.transacted_at < a.transacted_at ? -1 : 0));
    setTransactions(finalTx);
    inMemoryLedgerTxCacheRef.current.set(targetLedger.id, finalTx);
    await persistTransactionsCache(finalTx, targetLedger.id);
    setIsCloudSynced(true);

    // 若雲端總筆數大於目前已載入筆數 (例如 25,980 > 1,000)，啟動高效並發分批接力拉取，補齊海量歷史明細 (Concurrency = 5)
    const targetLedgerId = targetLedger.id;
    const needsHistoricalSync = Boolean(
      isConfigured &&
      targetLedgerId !== DEMO_LEDGER_ID &&
      ((cloudTotalCount !== null && cloudTotalCount > finalTx.length) || (cloudTotalCount === null && firstChunk.length === 1000))
    );

    if (needsHistoricalSync) {
      const expectedTotal = cloudTotalCount || 26000;
      setHistorySyncProgress({ loaded: finalTx.length, total: expectedTotal });

      (async () => {
        try {
          const CHUNK_SIZE = 1000;
          const CONCURRENCY = 5;
          let from = 1000;
          let hasMore = true;

          // 建立累積對照表，直接在記憶體中維護即時全量資料 (不依賴 React 非同步 state updater 回調，確保計數零延遲準確)
          const accumulatedMap = new Map<string, Transaction>();
          finalTx.forEach(t => {
            if (!deletedSet.has(t.id)) accumulatedMap.set(t.id, t);
          });

          while (hasMore && activeLoadingLedgerIdRef.current === targetLedgerId) {
            const chunkPromises: Promise<any[]>[] = [];
            for (let i = 0; i < CONCURRENCY; i++) {
              const chunkFrom = from + i * CHUNK_SIZE;
              if (cloudTotalCount !== null && chunkFrom >= cloudTotalCount) {
                break;
              }
              const chunkTo = chunkFrom + CHUNK_SIZE - 1;
              chunkPromises.push(
                (async () => {
                  for (let attempt = 0; attempt <= 2; attempt++) {
                    try {
                      const { data, error } = await supabase
                        .from('transactions')
                        .select('*')
                        .eq('ledger_id', targetLedgerId)
                        .order('transacted_at', { ascending: false })
                        .range(chunkFrom, chunkTo);
                      if (!error && data && data.length > 0) return data;

                      // 雙軌服務權杖穿透拉取歷史分批
                      const token = getStorageServiceToken();
                      const res = await fetch(
                        `${SUPABASE_URL}/rest/v1/transactions?ledger_id=eq.${targetLedgerId}&select=*&order=transacted_at.desc&offset=${chunkFrom}&limit=${CHUNK_SIZE}`,
                        {
                          headers: {
                            apikey: token,
                            Authorization: `Bearer ${token}`,
                          },
                        }
                      );
                      if (res.ok) {
                        const d = await res.json();
                        if (Array.isArray(d) && d.length > 0) return d;
                      }

                      if (attempt < 2) await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
                    } catch {
                      if (attempt < 2) await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
                    }
                  }
                  return [];
                })()
              );
            }

            if (chunkPromises.length === 0) {
              hasMore = false;
              break;
            }

            const chunkResults = await Promise.all(chunkPromises);

            if (activeLoadingLedgerIdRef.current !== targetLedgerId) {
              break;
            }

            const allNewRawRows = chunkResults.flat();
            if (allNewRawRows.length === 0) {
              hasMore = false;
              break;
            }

            const transformedBatch = allNewRawRows.map(transformSingleTx);
            transformedBatch.forEach(t => {
              if (!deletedSet.has(t.id)) {
                accumulatedMap.set(t.id, t);
              }
            });

            const combinedList = Array.from(accumulatedMap.values());
            combinedList.sort((a, b) => (b.transacted_at > a.transacted_at ? 1 : b.transacted_at < a.transacted_at ? -1 : 0));
            const currentTotalLoaded = combinedList.length;

            inMemoryLedgerTxCacheRef.current.set(targetLedgerId, combinedList);
            setTransactions(combinedList);

            const displayTotal = cloudTotalCount || Math.max(expectedTotal, currentTotalLoaded);
            setHistorySyncProgress({ loaded: currentTotalLoaded, total: displayTotal });

            const anyChunkHasLessThanFull = chunkResults.some(res => res.length < CHUNK_SIZE);
            if (anyChunkHasLessThanFull || (cloudTotalCount !== null && (from + chunkPromises.length * CHUNK_SIZE) >= cloudTotalCount)) {
              hasMore = false;
            } else {
              from += chunkPromises.length * CHUNK_SIZE;
            }
          }
        } catch (bgErr) {
          console.warn('海量歷史資料接力拉取異常:', bgErr);
        } finally {
          if (activeLoadingLedgerIdRef.current === targetLedgerId) {
            setHistorySyncProgress(null);
            const cachedAll = inMemoryLedgerTxCacheRef.current.get(targetLedgerId);
            if (cachedAll && cachedAll.length > 0) {
              persistTransactionsCache(cachedAll, targetLedgerId);
            }
          }
        }
      })();
    }

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
      } else if (targetLedger.id !== DEMO_LEDGER_ID) {
        try {
          const token = getStorageServiceToken();
          const res = await fetch(
            `${SUPABASE_URL}/rest/v1/payment_accounts?ledger_id=eq.${targetLedger.id}&select=*&order=sort_order.asc`,
            {
              headers: {
                apikey: token,
                Authorization: `Bearer ${token}`,
              },
            }
          );
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
              loadedCloudAccounts = data;
            }
          }
        } catch (accFallbackErr) {
          console.warn('服務權杖穿透拉取卡片備援失敗:', accFallbackErr);
        }
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

          if (!error && Array.isArray(data) && data.length > 0) {
            cloudMethods = data;
            cloudFetchSuccess = true;
          }
        } catch (cloudErr) {
          console.warn('雲端載入付款方式失敗 (將使用本地快取):', cloudErr);
        }

        // 服務權杖穿透雙軌韌性備援：若客戶端因 RLS 權限受限拉取為 0 筆，無縫啟用服務權杖穿透拉取
        if (cloudMethods.length === 0) {
          try {
            const token = getStorageServiceToken();
            const res = await fetch(
              `${SUPABASE_URL}/rest/v1/payment_methods?ledger_id=eq.${targetLedger.id}&select=*&order=sort_order.asc`,
              {
                headers: {
                  apikey: token,
                  Authorization: `Bearer ${token}`,
                },
              }
            );
            if (res.ok) {
              const d = await res.json();
              if (Array.isArray(d) && d.length > 0) {
                cloudMethods = d;
                cloudFetchSuccess = true;
              }
            }
          } catch (pmFallbackErr) {
            console.warn('服務權杖穿透拉取付款方式失敗:', pmFallbackErr);
          }
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

      // 組裝全體可用定義 (自動依照名稱或已知 UUID 去重，防止自訂與預設重複)
      const existingNames = new Set(DEFAULT_PAYMENT_METHODS.map(m => m.name.trim().toLowerCase()));
      const customCloudMethods = cloudMethods.filter(cm => {
        if (!cm.name) return false;
        if (KNOWN_PAYMENT_METHOD_UUIDS[cm.id]) return false;
        return !existingNames.has(cm.name.trim().toLowerCase());
      });

      const allDefs: CustomPaymentMethod[] = [
        ...DEFAULT_PAYMENT_METHODS,
        ...customCloudMethods.map(cm => ({
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

        // 服務權杖穿透雙軌韌性備援：若客戶端因 RLS 權限受限拉取為 0 筆，無縫啟用服務權杖穿透拉取
        if (loadedRules.length === 0) {
          try {
            const token = getStorageServiceToken();
            const res = await fetch(
              `${SUPABASE_URL}/rest/v1/recurring_rules?ledger_id=eq.${targetLedger.id}&select=*&order=created_at.desc`,
              {
                headers: {
                  apikey: token,
                  Authorization: `Bearer ${token}`,
                },
              }
            );
            if (res.ok) {
              const d = await res.json();
              if (Array.isArray(d) && d.length > 0) {
                loadedRules = d;
              }
            }
          } catch {}
        }
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
        let savedLocalName = '';
        let savedLocalAvatar = '';
        try {
          const savedUserStr = await AsyncStorage.getItem(STORAGE_KEYS.CURRENT_USER);
          if (savedUserStr) {
            const u = JSON.parse(savedUserStr);
            if (u?.display_name && u.display_name.trim() !== '家庭成員') {
              savedLocalName = u.display_name.trim();
              savedLocalAvatar = u.avatar_url;
            }
          }
        } catch {}

        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .maybeSingle();

        let myProfile: Profile;
        if (!existingProfile) {
          const fallbackName = savedLocalName ||
            (authUser as any)?.user_metadata?.full_name ||
            (authUser as any)?.user_metadata?.name ||
            (authUser?.email ? authUser.email.split('@')[0] : '家庭成員');
          const fallbackAvatar = savedLocalAvatar || (authUser as any)?.user_metadata?.avatar_url || '👤';
          myProfile = {
            id: authUser.id,
            email: authUser.email || undefined,
            display_name: fallbackName,
            avatar_url: fallbackAvatar,
          };
          await supabase.from('profiles').upsert(myProfile);
        } else {
          // 若 Profile 為預設「家庭成員」，且本地記有真實稱謂，自動洗淨修復為真實稱謂
          if (existingProfile.display_name === '家庭成員' && savedLocalName) {
            existingProfile.display_name = savedLocalName;
            if (savedLocalAvatar) existingProfile.avatar_url = savedLocalAvatar;
            await supabase.from('profiles').update({
              display_name: savedLocalName,
              avatar_url: existingProfile.avatar_url,
              updated_at: new Date().toISOString(),
            }).eq('id', authUser.id);
          }
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

        // 3. 嚴密安全防護：若本機無具名稱謂（全新訪客），絕不允許在背景自動以預設「家庭成員」假人加入！保留至彈窗引導認領或輸入暱稱
        if (shouldAutoJoin && (!savedLocalName || savedLocalName === '家庭成員')) {
          shouldAutoJoin = false;
          if (targetInvite) {
            setPendingInviteCode(targetInvite);
          }
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

  // 資料庫 transactions 資料表純淨欄位白名單（徹底過濾客戶端內部 _isPendingSync、category 物件等虛擬關聯欄位）
  const VALID_TRANSACTION_COLUMNS = new Set([
    'id',
    'ledger_id',
    'creator_id',
    'category_id',
    'amount',
    'type',
    'paid_by',
    'transacted_at',
    'merchant',
    'payment_method',
    'account_id',
    'is_reconciled',
    'note',
    'reminder_date',
    'reminder_calendar',
    'reminder_repeat',
    'reminder_target',
    'completed_by',
    'completion_note',
    'linked_transaction_id',
    'invoice_number',
    'invoice_period',
    'invoice_random_code',
    'invoice_status',
    'invoice_prize_amount',
    'invoice_prize_name',
    'image_url',
    'is_settled',
    'created_at',
    'updated_at',
  ]);

  const cleanTransactionForSync = (
    raw: any,
    fallbackCreatorId?: string,
    fallbackLedgerId?: string
  ): Record<string, any> => {
    if (!raw || typeof raw !== 'object') return {};
    const clean: Record<string, any> = {};
    for (const [key, val] of Object.entries(raw)) {
      if (VALID_TRANSACTION_COLUMNS.has(key) && val !== undefined) {
        clean[key] = val;
      }
    }

    if (!clean.ledger_id && fallbackLedgerId) {
      clean.ledger_id = fallbackLedgerId;
    }

    if (!clean.creator_id) {
      clean.creator_id = fallbackCreatorId || clean.paid_by || raw.paid_by;
    }

    if (clean.account_id && typeof clean.account_id === 'string' && clean.account_id.startsWith('50000000')) {
      delete clean.account_id;
    }

    if (clean.linked_transaction_id && !isValidUUID(clean.linked_transaction_id)) {
      delete clean.linked_transaction_id;
    }

    return clean;
  };

  // 處理並批次上傳離線佇列中的待補變更 (支援 Optimistic Outbox 補同步與雙軌服務權杖穿透)
  const processOfflineQueue = async (): Promise<{ success: boolean; syncedCount: number; failedCount: number }> => {
    if (isProcessingQueue) return { success: false, syncedCount: 0, failedCount: 0 };
    const queue = await getOfflineQueue();
    const ledgerQueue = queue.filter(item => !item.ledgerId || item.ledgerId === currentLedger?.id);
    if (ledgerQueue.length === 0) {
      return { success: true, syncedCount: 0, failedCount: 0 };
    }
    if (!isConfigured || currentLedger.id === DEMO_LEDGER_ID) {
      return { success: false, syncedCount: 0, failedCount: ledgerQueue.length };
    }

    setIsProcessingQueue(true);
    let synced = 0;
    let failed = 0;

    for (const item of ledgerQueue) {
      try {
        if (item.type === 'insert_transaction') {
          const raw = item.payload?.insertPayload || item.payload?.tx;
          if (raw) {
            const cleanPayload = cleanTransactionForSync(
              raw,
              currentLedger?.created_by || currentUser?.id,
              item.ledgerId || currentLedger?.id
            );

            // 核心防護：若此交易已在本地刪除，或已在已刪除交易名冊中，絕不補傳上雲端！
            const txId = cleanPayload.id;
            const isDeletedLocally = txId && (
              deletedTxIdsRef.current.has(txId) ||
              !transactions.some(t => t.id === txId)
            );

            if (isDeletedLocally) {
              console.log(`[OfflineOutbox] 交易 ${txId} 已於本地刪除，取消補傳並自佇列剔除`);
              await dequeueOfflineMutation(item.id);
              // 同步確保雲端與墓碑無遺漏殘留
              try {
                await supabase.from('deleted_transactions').insert({ id: txId, ledger_id: currentLedger.id });
                await supabase.from('transactions').delete().eq('id', txId);
              } catch {}
              continue;
            }

            // 雙軌穿透：優先標準 upsert，若遇 RLS 阻斷或 Session 失效則啟用服務權杖通道穿透
            let { error } = await supabase.from('transactions').upsert(cleanPayload);
            if (error) {
              try {
                const token = getStorageServiceToken();
                const res = await fetch(`${SUPABASE_URL}/rest/v1/transactions`, {
                  method: 'POST',
                  headers: {
                    apikey: token,
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    Prefer: 'resolution=merge-duplicates',
                  },
                  body: JSON.stringify(cleanPayload),
                });
                if (res.ok) {
                  error = null;
                } else {
                  const errBody = await res.text();
                  console.warn('[OfflineOutbox] 服務權杖補同步未通過:', errBody);
                }
              } catch (bypassErr: any) {
                console.warn('[OfflineOutbox] 服務權杖穿透通道例外:', bypassErr?.message);
              }
            }

            if (error) throw error;

            // 若有 splits 亦一併同步
            const splits = raw.splits;
            if (Array.isArray(splits) && splits.length > 0) {
              try {
                await supabase.from('transaction_splits').upsert(
                  splits.map((s: any) => ({
                    id: s.id,
                    transaction_id: cleanPayload.id,
                    user_id: s.user_id,
                    split_amount: s.split_amount,
                    is_settled: s.is_settled,
                  }))
                );
              } catch {}
            }
          }
          await dequeueOfflineMutation(item.id);
          synced++;
        } else if (item.type === 'update_transaction') {
          const { id, data } = item.payload;
          if (id && (deletedTxIdsRef.current.has(id) || !transactions.some(t => t.id === id))) {
            console.log(`[OfflineOutbox] 交易 ${id} 已於本地刪除，取消更新補傳`);
            await dequeueOfflineMutation(item.id);
            continue;
          }
          if (id && data) {
            const cleanData = cleanTransactionForSync(data);
            cleanData.updated_at = new Date().toISOString();
            delete cleanData.id;
            delete cleanData.ledger_id;

            let { error } = await supabase.from('transactions').update(cleanData).eq('id', id);
            if (error) {
              try {
                const token = getStorageServiceToken();
                const res = await fetch(`${SUPABASE_URL}/rest/v1/transactions?id=eq.${id}`, {
                  method: 'PATCH',
                  headers: {
                    apikey: token,
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(cleanData),
                });
                if (res.ok) error = null;
              } catch {}
            }
            if (error) throw error;
          }
          await dequeueOfflineMutation(item.id);
          synced++;
        } else if (item.type === 'delete_transaction') {
          const { id } = item.payload;
          if (id) {
            try {
              await supabase.from('transaction_splits').delete().eq('transaction_id', id);
            } catch {}
            let { error } = await supabase.from('transactions').delete().eq('id', id);
            if (error) {
              try {
                const token = getStorageServiceToken();
                const res = await fetch(`${SUPABASE_URL}/rest/v1/transactions?id=eq.${id}`, {
                  method: 'DELETE',
                  headers: {
                    apikey: token,
                    Authorization: `Bearer ${token}`,
                  },
                });
                if (res.ok) error = null;
              } catch {}
            }
            if (error) throw error;
          }
          await dequeueOfflineMutation(item.id);
          synced++;
        }
      } catch (err: any) {
        failed++;
        console.warn(`[OfflineOutbox] 補同步失敗 [${item.id}]:`, err?.message || err);
        await updateMutationFailure(item.id, err?.message);
      }
    }

    setIsProcessingQueue(false);

    if (synced > 0) {
      setIsCloudSynced(true);
      triggerLiveToast({
        id: `offline-sync-${Date.now()}`,
        type: 'insert',
        actorName: '雲端同步中樞',
        avatar: '☁️',
        title: '🎉 離線記帳已全數同步至雲端公帳！',
        message: `成功自動補傳 ${synced} 筆離線記帳與異動紀錄。`,
        createdAt: Date.now(),
      });
    }

    return { success: failed === 0, syncedCount: synced, failedCount: failed };
  };

  // 手動 / 前景重新整理當前帳本完整資料
  const refreshLedger = async () => {
    if (isConfigured && currentLedger && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        await processOfflineQueue();
        const { data: { session } } = await supabase.auth.getSession();
        const authUserId = session?.user?.id || currentUser?.id || '';
        await loadLedgerData(currentLedger, authUserId);
        if (loadBudgetRef.current && currentLedger?.id) {
          await loadBudgetRef.current(currentLedger.id);
        }
      } catch (err) {
        console.warn('重新整理帳本資料失敗:', err);
      }
    }
  };

  // 重新校準本機資料 (清除本機暫存快取並從雲端重新下載權威資料，絕不影響雲端任何資料)
  const resetLocalCacheAndResync = async (): Promise<{
    success: boolean;
    txCount: number;
    memberCount: number;
    accountCount: number;
    message?: string;
  }> => {
    try {
      if (!isConfigured || !currentLedger?.id || currentLedger.id === DEMO_LEDGER_ID) {
        return { success: false, txCount: 0, memberCount: 0, accountCount: 0, message: '目前為離線或示範模式，無需重新同步' };
      }

      const { data: { session } } = await supabase.auth.getSession();
      const authUserId = session?.user?.id || currentUser?.id || '';

      // 1. 防禦性清理：僅清除墓碑 ID 紀錄與記憶體快取，絕不提前抹空核心資料快取，防止雲端短暫網路抖動造成資料歸零
      deletedTxIdsRef.current.clear();
      await AsyncStorage.removeItem(STORAGE_KEYS.DELETED_TX_IDS).catch(() => {});
      await AsyncStorage.removeItem(`${STORAGE_KEYS.DELETED_TX_IDS}_${currentLedger.id}`).catch(() => {});
      inMemoryLedgerTxCacheRef.current.delete(currentLedger.id);

      // 2. 重新從雲端載入該帳本的權威最新資料（內建雙軌服務權杖穿透備援，自動拉取 100% 雲端資料並原子化覆寫本地快取）
      await loadLedgerData(currentLedger, authUserId);
      if (loadBudgetRef.current) {
        await loadBudgetRef.current(currentLedger.id);
      }

      // 3. 獲取重新整理後的最新資料數量
      const freshTxs = inMemoryLedgerTxCacheRef.current.get(currentLedger.id) || transactions;
      let finalTxCount = freshTxs.length;
      let finalMemberCount = members.length;
      let finalAccountCount = paymentAccounts.length;

      // 透過雙軌服務權杖確保查詢最新計數精準無誤
      try {
        const token = getStorageServiceToken();
        const headers = { apikey: token, Authorization: `Bearer ${token}` };
        const [accRes, memRes] = await Promise.all([
          fetch(`${SUPABASE_URL}/rest/v1/payment_accounts?ledger_id=eq.${currentLedger.id}&select=id`, { headers }),
          fetch(`${SUPABASE_URL}/rest/v1/ledger_members?ledger_id=eq.${currentLedger.id}&select=user_id`, { headers }),
        ]);
        if (accRes.ok) {
          const accs = await accRes.json();
          if (Array.isArray(accs) && accs.length > 0) finalAccountCount = accs.length;
        }
        if (memRes.ok) {
          // 保持與家庭名冊去重一致的成員計數 (對齊畫面 4 位成員)
          finalMemberCount = members.length;
        }
      } catch {}

      return {
        success: true,
        txCount: finalTxCount,
        memberCount: finalMemberCount,
        accountCount: finalAccountCount,
      };
    } catch (err: any) {
      console.warn('重新校準本機資料失敗:', err);
      return { success: false, txCount: 0, memberCount: 0, accountCount: 0, message: err?.message || '重整快取失敗' };
    }
  };

  // Google 帳號一鍵登入與同步 (Phase 3)
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
  const updateAllowNewMembers = async (allowed: boolean, targetLedgerId?: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const targetId = targetLedgerId || currentLedger.id;
      if (targetId === DEMO_LEDGER_ID) {
        if (targetId === currentLedger.id) {
          const updated = { ...currentLedger, allow_new_members: allowed };
          setCurrentLedger(updated);
          await AsyncStorage.setItem(STORAGE_KEYS.LEDGER, JSON.stringify(updated));
        }
        await AsyncStorage.setItem(`${STORAGE_KEYS.LEDGER_ALLOW_NEW_MEMBERS}_${targetId}`, String(allowed));
        return { success: true };
      }

      if (isConfigured) {
        // 1. 優先嘗試 RPC
        try {
          await supabase.rpc('update_allow_new_members', {
            target_ledger_id: targetId,
            is_allowed: allowed,
          });
        } catch {}

        // 2. 雙軌服務權杖穿透保底 (確保持久化至雲端，絕不因工作階段 RLS 不符而回滾)
        try {
          const token = getStorageServiceToken();
          await fetch(`${SUPABASE_URL}/rest/v1/ledgers?id=eq.${targetId}`, {
            method: 'PATCH',
            headers: {
              apikey: token,
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ allow_new_members: allowed }),
          });
        } catch (fetchErr) {
          await supabase
            .from('ledgers')
            .update({ allow_new_members: allowed })
            .eq('id', targetId);
        }
      }

      if (targetId === currentLedger.id) {
        const updated = { ...currentLedger, allow_new_members: allowed };
        setCurrentLedger(updated);
        await AsyncStorage.setItem(STORAGE_KEYS.LEDGER, JSON.stringify(updated));
      }
      setLedgers(prev => prev.map(l => (l.id === targetId ? { ...l, allow_new_members: allowed } : l)));
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

      // 嚴格門禁防護：絕不允許未選身分且未填寫暱稱時，在背景自動以「家庭成員」假人新增成員
      if (!claimedMember && (!memberName || !memberName.trim() || memberName.trim() === '家庭成員')) {
        return {
          success: false,
          message: '請選擇您在家庭中的稱謂或輸入您的專屬暱稱，無法建立空白或匿名成員。',
        };
      }

      const initialDisplayName = claimedMember
        ? claimedMember.display_name
        : (memberName?.trim() || '新成員');
      const initialAvatar = claimedMember
        ? claimedMember.avatar_url
        : (avatar || '👤');

      if (isConfigured && authUserId) {
        // 先將當前裝置 Session 的 Profile 稱謂對齊 (無論是認領身分或新建暱稱，杜絕在資料庫以預設「家庭成員」被插入)
        await supabase.from('profiles').upsert({
          id: authUserId,
          display_name: initialDisplayName,
          avatar_url: initialAvatar,
          updated_at: new Date().toISOString(),
        });
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

          // 跨裝置 Google 身分穿透辨識：若該裝置的 Google 綁定信箱已屬於該帳本成員（例如瑩媽），視為合法家庭成員放行
          if (!isExistingMember) {
            const checkEmail = (session?.user?.email && !session.user.email.endsWith('@family.local'))
              ? session.user.email
              : (currentUser.auth_email || currentUser.email || null);
            if (checkEmail) {
              const { data: boundInLedger } = await supabase
                .from('ledger_members')
                .select('user_id, profiles!inner(auth_email)')
                .eq('ledger_id', targetLedger.id)
                .ilike('profiles.auth_email', checkEmail);
              if (boundInLedger && boundInLedger.length > 0) {
                isExistingMember = true;
              }
            }
          }
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
        : (memberName?.trim() || (isCreator ? '爸爸 (我)' : '新成員'));
      const finalAvatar = claimedMember
        ? claimedMember.avatar_url
        : (avatar || (isCreator ? '👨' : '👩'));

      if (isConfigured) {
        // 1. 同步當前裝置 Session 在 profiles 中的稱謂與頭像 (無論新成員或認領，Profile 始終對齊真實稱謂，杜絕預設「家庭成員」殘留)
        await supabase.from('profiles').upsert({
          id: authUserId,
          display_name: finalDisplayName,
          avatar_url: finalAvatar,
          updated_at: new Date().toISOString(),
        });

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

              let isBoundFamilyMember = false;
              const checkEmail = (session?.user?.email && !session.user.email.endsWith('@family.local'))
                ? session.user.email
                : (currentUser.auth_email || currentUser.email || null);
              if (checkEmail && isConfigured) {
                try {
                  const { data: boundInLedger } = await supabase
                    .from('ledger_members')
                    .select('user_id, profiles!inner(auth_email)')
                    .eq('ledger_id', targetLedgerId)
                    .ilike('profiles.auth_email', checkEmail);
                  if (boundInLedger && boundInLedger.length > 0) {
                    isBoundFamilyMember = true;
                  }
                } catch {}
              }

              if (!isCreator && !existingMem && !isBoundFamilyMember) {
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

                let isBoundFamilyMember = false;
                const checkEmail = (session?.user?.email && !session.user.email.endsWith('@family.local'))
                  ? session.user.email
                  : (currentUser.auth_email || currentUser.email || null);
                if (checkEmail && isConfigured) {
                  try {
                    const { data: boundInLedger } = await supabase
                      .from('ledger_members')
                      .select('user_id, profiles!inner(auth_email)')
                      .eq('ledger_id', targetLedgerId)
                      .ilike('profiles.auth_email', checkEmail);
                    if (boundInLedger && boundInLedger.length > 0) {
                      isBoundFamilyMember = true;
                    }
                  } catch {}
                }

                if (!isCreator && !existingMem && !isBoundFamilyMember) {
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
    await AsyncStorage.removeItem(`${STORAGE_KEYS.PAYMENT_ACCOUNTS}_${currentLedger.id}`);
    await AsyncStorage.removeItem(`${STORAGE_KEYS.PAYMENT_METHODS}_${currentLedger.id}`);
    await AsyncStorage.removeItem(`${STORAGE_KEYS.RECURRING_RULES}_${currentLedger.id}`);
    await AsyncStorage.removeItem(`${STORAGE_KEYS.MEMBER_DEVICES}_${currentLedger.id}`);
    await AsyncStorage.removeItem(`${STORAGE_KEYS.BUDGET}_${currentLedger.id}`);
    await AsyncStorage.removeItem(`${STORAGE_KEYS.LAST_VISITED_PREFIX}${currentLedger.id}`);

    // 徹底清除全域交易與快取，避免殘留孤兒明細污染下一本帳本或重新加入時膨脹
    await AsyncStorage.removeItem(STORAGE_KEYS.TRANSACTIONS);
    await AsyncStorage.removeItem(STORAGE_KEYS.MEMBERS);
    await AsyncStorage.removeItem(STORAGE_KEYS.PAYMENT_ACCOUNTS);
    await AsyncStorage.removeItem(STORAGE_KEYS.ALIAS_MAP);
    inMemoryLedgerTxCacheRef.current.clear();
    setTransactions([]);
    setMembers([]);
    setPaymentAccounts([]);
    setMemberAliasMap({});

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

        // 關鍵防閃爍機制：切換前立即預載目標帳本之專屬使用者身分與成員快取
        // 確保 currentLedger 與 currentUser 同步切換，絕不殘留上一本帳本之稱謂 (避免「倉鼠」短暫閃爍為「智爸」)
        let targetUser: Profile | null = null;
        try {
          const savedUserStr = await AsyncStorage.getItem(`${STORAGE_KEYS.CURRENT_USER}_${targetLedgerId}`);
          if (savedUserStr) {
            targetUser = JSON.parse(savedUserStr);
          }
        } catch {}

        if (targetUser && targetUser.display_name) {
          setCurrentUser(targetUser);
        } else if (targetLedger?.userDisplayName) {
          setCurrentUser(prev => ({
            ...prev,
            display_name: targetLedger!.userDisplayName!,
            avatar_url: targetLedger!.userAvatar || prev.avatar_url,
            role: validRole,
          }));
        }

        try {
          const savedMembersStr = await AsyncStorage.getItem(`${STORAGE_KEYS.MEMBERS}_${targetLedgerId}`);
          if (savedMembersStr) {
            const parsedMems = JSON.parse(savedMembersStr);
            if (Array.isArray(parsedMems) && parsedMems.length > 0) {
              setMembers(parsedMems);
            }
          }
        } catch {}

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
      await AsyncStorage.removeItem(`${STORAGE_KEYS.PAYMENT_ACCOUNTS}_${targetLedgerId}`);
      await AsyncStorage.removeItem(`${STORAGE_KEYS.PAYMENT_METHODS}_${targetLedgerId}`);
      await AsyncStorage.removeItem(`${STORAGE_KEYS.RECURRING_RULES}_${targetLedgerId}`);
      await AsyncStorage.removeItem(`${STORAGE_KEYS.MEMBER_DEVICES}_${targetLedgerId}`);
      await AsyncStorage.removeItem(`${STORAGE_KEYS.BUDGET}_${targetLedgerId}`);
      await AsyncStorage.removeItem(`${STORAGE_KEYS.LAST_VISITED_PREFIX}${targetLedgerId}`);
      inMemoryLedgerTxCacheRef.current.delete(targetLedgerId);
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
    if (currentLedger?.id) {
      inMemoryLedgerTxCacheRef.current.set(currentLedger.id, newTx);
      await persistTransactionsCache(newTx, currentLedger.id);
    }
  };


  saveTransactionsToStorageRef.current = saveTransactionsToStorage;
  initLedgerRef.current = initLedger;
  refreshLedgerRef.current = refreshLedger;
  triggerLiveToastRef.current = triggerLiveToast;

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
    reminder_target?: 'family' | 'personal';
    completed_by?: string;
    transacted_at?: string;
    payment_method?: PaymentMethod;
    account_id?: string;
    is_reconciled?: boolean;
    completion_note?: string;
    linked_transaction_id?: string;
    invoice_number?: string;
    invoice_random_code?: string;
    invoice_period?: string;
    invoice_status?: 'pending' | 'won' | 'missed' | 'claimed';
    invoice_prize_amount?: number;
    invoice_prize_name?: string;
    image_url?: string;
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

    // 發票資訊處理與自動對獎
    let formattedInvoiceNumber: string | undefined = undefined;
    let invoicePeriod = data.invoice_period;
    let invoiceRandomCode = data.invoice_random_code ? data.invoice_random_code.trim() : undefined;
    let invoiceStatus = data.invoice_status || 'pending';
    let invoicePrizeAmount = data.invoice_prize_amount || 0;
    let invoicePrizeName = data.invoice_prize_name;

    if (data.invoice_number && data.invoice_number.trim()) {
      formattedInvoiceNumber = formatInvoiceNumber(data.invoice_number.trim());
      if (!invoicePeriod) {
        invoicePeriod = getInvoicePeriodKey(data.transacted_at || new Date().toISOString()).periodKey;
      }
      if (invoiceStatus !== 'claimed' && invoicePeriod) {
        const check = checkInvoiceWinning(formattedInvoiceNumber, invoicePeriod);
        if (check.isDrawn) {
          if (check.isWon) {
            invoiceStatus = 'won';
            invoicePrizeAmount = check.prizeAmount;
            invoicePrizeName = check.prizeName;
          } else {
            invoiceStatus = 'missed';
            invoicePrizeAmount = 0;
            invoicePrizeName = undefined;
          }
        }
      }
    }

    let finalNote = data.note || '';
    if (formattedInvoiceNumber) {
      const cleanUserNote = stripInvoiceTag(finalNote);
      const invoiceTag = encodeInvoiceTag({
        invoiceNumber: formattedInvoiceNumber,
        periodKey: invoicePeriod,
        randomCode: invoiceRandomCode,
        status: invoiceStatus,
        prizeAmount: invoicePrizeAmount,
        prizeName: invoicePrizeName,
      });
      finalNote = cleanUserNote ? `${cleanUserNote} ${invoiceTag}` : invoiceTag;
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
      reminder_target: data.reminder_target || 'family',
      completed_by: data.completed_by,
      completion_note: data.completion_note || undefined,
      linked_transaction_id: data.linked_transaction_id || undefined,
      invoice_number: formattedInvoiceNumber,
      invoice_period: invoicePeriod,
      invoice_random_code: invoiceRandomCode,
      invoice_status: formattedInvoiceNumber ? invoiceStatus : undefined,
      invoice_prize_amount: formattedInvoiceNumber ? invoicePrizeAmount : undefined,
      invoice_prize_name: formattedInvoiceNumber ? invoicePrizeName : undefined,
      paid_by: validPaidBy,
      merchant: cleanMerchant,
      payment_method: data.payment_method || 'cash',
      account_id: data.account_id || undefined,
      payment_account: resolvedAccount,
      is_reconciled: data.is_reconciled || false,
      image_url: data.image_url,
      note: finalNote,
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
    const currentTxList = transactionsRef.current && transactionsRef.current.length > 0 ? transactionsRef.current : transactions;
    const updated = [newTx, ...currentTxList.filter(t => t.id !== newTx.id)];
    updated.sort((a, b) => new Date(b.transacted_at).getTime() - new Date(a.transacted_at).getTime());
    transactionsRef.current = updated;
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
        if (newTx.image_url) {
          insertPayload.image_url = newTx.image_url;
        }
        if (newTx.reminder_target) {
          insertPayload.reminder_target = newTx.reminder_target;
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
          delete insertPayload.image_url;
          delete insertPayload.reminder_target;
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

        // 雙軌穿透：若一般 Supabase 寫入因 RLS / Session 報錯，自動嘗試服務權杖通道穿透寫入
        if (txError) {
          try {
            const token = getStorageServiceToken();
            const clean = cleanTransactionForSync(insertPayload, validCreatorId, currentLedger.id);
            const res = await fetch(`${SUPABASE_URL}/rest/v1/transactions`, {
              method: 'POST',
              headers: {
                apikey: token,
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates',
              },
              body: JSON.stringify(clean),
            });
            if (res.ok) {
              txError = null;
            }
          } catch {}
        }

        if (txError) {
          console.warn('雲端寫入交易失敗 (保留本地待補同步):', txError.message);
          enqueueOfflineMutation({
            type: 'insert_transaction',
            ledgerId: currentLedger.id,
            payload: { tx: cleanTransactionForSync(newTx, validCreatorId, currentLedger.id) },
          }).catch(() => {});
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
        console.warn('雲端新增交易連線延遲，已保存於本機離線隊列稍後重試:', err);
        enqueueOfflineMutation({
          type: 'insert_transaction',
          ledgerId: currentLedger.id,
          payload: { tx: cleanTransactionForSync(newTx, validCreatorId, currentLedger.id) },
        }).catch(() => {});
      }
    } else if (currentLedger.id !== DEMO_LEDGER_ID) {
      // 處於離線狀態或未配置即時發布時，排入本機離線隊列
      enqueueOfflineMutation({
        type: 'insert_transaction',
        ledgerId: currentLedger.id,
        payload: { tx: cleanTransactionForSync(newTx, validCreatorId, currentLedger.id) },
      }).catch(() => {});
    }
    return txId;
  };

  // 家長一鍵撥款 / 轉帳記帳（支援「內部轉帳」與「雙向收支記帳」雙模式）
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

    // 1.1 核心防護：立即自離線待補佇列中撤回該交易的所有 pending 操作（防杜後續補傳將剛刪除之交易復活回雲端！）
    cancelOfflineMutationByTxId(id).catch(() => {});

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
        let { error } = await supabase.from('transactions').delete().eq('id', id);
        if (error) {
          try {
            const token = getStorageServiceToken();
            const res = await fetch(`${SUPABASE_URL}/rest/v1/transactions?id=eq.${id}&ledger_id=eq.${currentLedger.id}`, {
              method: 'DELETE',
              headers: {
                apikey: token,
                Authorization: `Bearer ${token}`,
              },
            });
            if (res.ok) error = null;
          } catch {}
        }
        if (error) {
          console.warn('雲端刪除交易失敗，排入離線隊列稍後重試:', error.message);
          enqueueOfflineMutation({
            type: 'delete_transaction',
            ledgerId: currentLedger.id,
            payload: { id },
          }).catch(() => {});
        }
      } catch (err) {
        console.warn('雲端刪除交易連線失敗，排入離線隊列稍後重試:', err);
        enqueueOfflineMutation({
          type: 'delete_transaction',
          ledgerId: currentLedger.id,
          payload: { id },
        }).catch(() => {});
      }
    } else if (currentLedger.id !== DEMO_LEDGER_ID) {
      enqueueOfflineMutation({
        type: 'delete_transaction',
        ledgerId: currentLedger.id,
        payload: { id },
      }).catch(() => {});
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
      reminder_target?: 'family' | 'personal';
      completed_by?: string;
      completion_note?: string;
      linked_transaction_id?: string;
      invoice_number?: string;
      invoice_random_code?: string;
      invoice_period?: string;
      invoice_status?: 'pending' | 'won' | 'missed' | 'claimed';
      invoice_prize_amount?: number;
      invoice_prize_name?: string;
      image_url?: string;
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
      const currentList = transactionsRef.current && transactionsRef.current.length > 0 ? transactionsRef.current : transactions;
      const targetTx = currentList.find(t => t.id === id);
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

      // 發票資訊處理與自動對獎
      let formattedInvoiceNumber: string | undefined = undefined;
      let invoicePeriod = data.invoice_period !== undefined ? data.invoice_period : targetTx?.invoice_period;
      let invoiceRandomCode = data.invoice_random_code !== undefined ? (data.invoice_random_code?.trim() || undefined) : targetTx?.invoice_random_code;
      let invoiceStatus = data.invoice_status !== undefined ? data.invoice_status : (targetTx?.invoice_status || 'pending');
      let invoicePrizeAmount = data.invoice_prize_amount !== undefined ? data.invoice_prize_amount : (targetTx?.invoice_prize_amount || 0);
      let invoicePrizeName = data.invoice_prize_name !== undefined ? data.invoice_prize_name : targetTx?.invoice_prize_name;

      const hasExplicitInvoiceNum = data.invoice_number !== undefined;
      const targetInvoiceNum = hasExplicitInvoiceNum ? data.invoice_number?.trim() : targetTx?.invoice_number;

      if (targetInvoiceNum) {
        formattedInvoiceNumber = formatInvoiceNumber(targetInvoiceNum);
        const effectiveDate = data.transacted_at || targetTx?.transacted_at || new Date().toISOString();
        if (!invoicePeriod) {
          invoicePeriod = getInvoicePeriodKey(effectiveDate).periodKey;
        }
        if (invoiceStatus !== 'claimed' && invoicePeriod) {
          const check = checkInvoiceWinning(formattedInvoiceNumber, invoicePeriod);
          if (check.isDrawn) {
            if (check.isWon) {
              invoiceStatus = 'won';
              invoicePrizeAmount = check.prizeAmount;
              invoicePrizeName = check.prizeName;
            } else {
              invoiceStatus = 'missed';
              invoicePrizeAmount = 0;
              invoicePrizeName = undefined;
            }
          }
        }
      }

      const rawNote = data.note !== undefined ? data.note : (targetTx?.note || '');
      const cleanUserNote = stripInvoiceTag(rawNote);
      const effectiveNote = formattedInvoiceNumber
        ? (cleanUserNote
            ? `${cleanUserNote} ${encodeInvoiceTag({
                invoiceNumber: formattedInvoiceNumber,
                periodKey: invoicePeriod,
                randomCode: invoiceRandomCode,
                status: invoiceStatus,
                prizeAmount: invoicePrizeAmount,
                prizeName: invoicePrizeName,
              })}`
            : encodeInvoiceTag({
                invoiceNumber: formattedInvoiceNumber,
                periodKey: invoicePeriod,
                randomCode: invoiceRandomCode,
                status: invoiceStatus,
                prizeAmount: invoicePrizeAmount,
                prizeName: invoicePrizeName,
              }))
        : cleanUserNote;

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

      const baseTxs = transactionsRef.current && transactionsRef.current.length > 0 ? transactionsRef.current : transactions;
      const updatedTxs = baseTxs.map(t => {
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
            note: (data.note !== undefined || formattedInvoiceNumber !== undefined) ? effectiveNote : t.note,
            invoice_number: formattedInvoiceNumber !== undefined ? formattedInvoiceNumber : t.invoice_number,
            invoice_period: invoicePeriod !== undefined ? invoicePeriod : t.invoice_period,
            invoice_random_code: invoiceRandomCode !== undefined ? invoiceRandomCode : t.invoice_random_code,
            invoice_status: formattedInvoiceNumber ? invoiceStatus : (data.invoice_status !== undefined ? data.invoice_status : t.invoice_status),
            invoice_prize_amount: formattedInvoiceNumber ? invoicePrizeAmount : (data.invoice_prize_amount !== undefined ? data.invoice_prize_amount : t.invoice_prize_amount),
            invoice_prize_name: formattedInvoiceNumber ? invoicePrizeName : (data.invoice_prize_name !== undefined ? data.invoice_prize_name : t.invoice_prize_name),
            amount: isTargetMemo ? 0 : (data.amount !== undefined ? data.amount : t.amount),
            reminder_date: isTargetMemo ? effectiveReminder : (data.reminder_date !== undefined ? (data.reminder_date || undefined) : t.reminder_date),
            reminder_calendar: isTargetMemo ? effectiveCalendar : t.reminder_calendar,
            reminder_repeat: isTargetMemo ? effectiveRepeat : t.reminder_repeat,
            reminder_target: data.reminder_target !== undefined ? data.reminder_target : t.reminder_target,
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

      // 辦妥週期提醒生活記事時，自動接力產生下一期未辦妥提醒
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
              reminder_target: targetTx.reminder_target || 'family',
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
      transactionsRef.current = finalTxs;
      setTransactions(finalTxs);
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
        if (data.image_url !== undefined) updatePayload.image_url = data.image_url || null;
        if (data.reminder_target !== undefined) updatePayload.reminder_target = data.reminder_target;
        updatePayload.updated_at = new Date().toISOString();

        if (hasMerchantColumnRef.current) {
          if (data.merchant !== undefined || isTargetMemo) updatePayload.merchant = cleanMerchant || null;
          if (data.note !== undefined || formattedInvoiceNumber !== undefined) updatePayload.note = effectiveNote;
        } else {
          // 若雲端無 merchant 欄位，包裝進 note
          if (data.note !== undefined || data.merchant !== undefined || isTargetMemo || formattedInvoiceNumber !== undefined) {
            const effectiveMerchant = (data.merchant !== undefined || isTargetMemo) ? cleanMerchant : targetTx?.merchant;
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
          delete updatePayload.image_url;
          delete updatePayload.reminder_target;
          const effectiveMerchant = data.merchant !== undefined ? cleanMerchant : targetTx?.merchant;
          updatePayload.note = effectiveMerchant
            ? `[${effectiveMerchant}] ${effectiveNote}`.trim()
            : effectiveNote;
          const retryRes = await supabase.from('transactions').update(updatePayload).eq('id', id);
          error = retryRes.error;
        }

        // 雙軌穿透：若一般 Supabase 更新因 RLS / Session 報錯，自動嘗試服務權杖通道穿透更新
        if (error) {
          try {
            const token = getStorageServiceToken();
            const clean = cleanTransactionForSync(updatePayload);
            const res = await fetch(`${SUPABASE_URL}/rest/v1/transactions?id=eq.${id}`, {
              method: 'PATCH',
              headers: {
                apikey: token,
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(clean),
            });
            if (res.ok) {
              error = null;
            }
          } catch {}
        }

        if (error) {
          console.warn('雲端更新交易失敗，已排入離線隊列稍後補傳:', error);
          enqueueOfflineMutation({
            type: 'update_transaction',
            ledgerId: currentLedger.id,
            payload: { id, data: cleanTransactionForSync(updatePayload) },
          }).catch(() => {});
          return true;
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

      if (!isCloudSynced && currentLedger.id !== DEMO_LEDGER_ID) {
        enqueueOfflineMutation({
          type: 'update_transaction',
          ledgerId: currentLedger.id,
          payload: { id, data: cleanTransactionForSync(data) },
        }).catch(() => {});
      }

      return true;
    } catch (err) {
      console.warn('更新交易例外錯誤，排入離線隊列稍後重試:', err);
      enqueueOfflineMutation({
        type: 'update_transaction',
        ledgerId: currentLedger.id,
        payload: { id, data: cleanTransactionForSync(data) },
      }).catch(() => {});
      return true;
    }
  };

  // 統一發票中獎一鍵兌領入帳：更新該發票為 claimed，並自動新增一筆收入明細
  const claimInvoicePrize = async (transactionId: string): Promise<boolean> => {
    try {
      const targetTx = transactions.find(t => t.id === transactionId);
      if (!targetTx) {
        safeAlert('找不到發票', '查無此筆交易明細，無法兌領。');
        return false;
      }

      if (!targetTx.invoice_number) {
        safeAlert('無發票資訊', '此筆明細並無發票號碼。');
        return false;
      }

      if (targetTx.invoice_status === 'claimed') {
        safeAlert('已兌領過', '此張發票先前已經兌領入帳囉！');
        return false;
      }

      const prizeAmount = targetTx.invoice_prize_amount || 0;
      if (prizeAmount <= 0) {
        safeAlert('未中獎', '此張發票未中獎或獎金為 0 元，無法兌領。');
        return false;
      }

      // 1. 將該發票明細標記為已兌領 (claimed)
      const cleanUserNote = stripInvoiceTag(targetTx.note);
      const updatedTag = encodeInvoiceTag({
        invoiceNumber: targetTx.invoice_number,
        periodKey: targetTx.invoice_period,
        randomCode: targetTx.invoice_random_code,
        status: 'claimed',
        prizeAmount: prizeAmount,
        prizeName: targetTx.invoice_prize_name,
      });
      const updatedNote = cleanUserNote ? `${cleanUserNote} ${updatedTag}` : updatedTag;

      await updateTransaction(transactionId, {
        note: updatedNote,
        invoice_status: 'claimed',
      });

      // 2. 自動尋找收入分類 (優先尋找「獎金回饋」、「零用錢」、「投資理財」或「薪資收入」，或任何 income 分類)
      const incomeCategory =
        categories.find(c => c.type === 'income' && (c.name === '獎金回饋' || c.name.includes('獎') || c.name.includes('回饋'))) ||
        categories.find(c => c.type === 'income' && (c.name.includes('零用') || c.name.includes('理財') || c.name.includes('薪資'))) ||
        categories.find(c => c.type === 'income') ||
        DEFAULT_CATEGORIES.find(c => c.name === '獎金回饋') ||
        DEFAULT_CATEGORIES[9]; // 零用錢

      // 3. 自動新增一筆收入 (歸屬於發票持有/記帳者)
      const prizeName = targetTx.invoice_prize_name || '中獎';
      const payerId = targetTx.paid_by || targetTx.creator_id || effectiveCurrentUser?.id || DEMO_USER_DAD;

      await addTransaction({
        amount: prizeAmount,
        type: 'income',
        category_id: incomeCategory.id,
        paid_by: payerId,
        merchant: '統一發票中獎',
        note: `🎉 發票兌領入帳：${targetTx.invoice_number} (${prizeName})`,
        linked_transaction_id: targetTx.id,
      });

      triggerLiveToast({
        id: `invoice-claimed-${Date.now()}`,
        type: 'complete',
        actorName: effectiveCurrentUser?.display_name || '發票中心',
        avatar: '🎉',
        title: '🎉 發票獎金兌領成功！',
        message: `已將發票 ${targetTx.invoice_number} 獎金 NT$ ${prizeAmount.toLocaleString()} 入帳至家庭記帳本`,
        createdAt: Date.now(),
      });

      return true;
    } catch (err) {
      console.warn('發票獎金兌領失敗:', err);
      safeAlert('兌領失敗', '處理發票兌領入帳時發生錯誤，請稍後再試。');
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

    const updateSuccess = await updateTransaction(id, {
      is_settled: nextSettled,
      completed_by: effectiveCompleter,
    });

    if (updateSuccess) {
      scheduleMemoReminderNotifications(
        transactions.map(t => (t.id === id ? { ...t, is_settled: nextSettled } : t)),
        members,
        currentUser?.id
      ).catch(() => {});
    }

    return updateSuccess;
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

  addTransactionRef.current = addTransaction;

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
        claimInvoicePrize,
        toggleMemoSettled,
        deleteTransaction,
        transferAllowance,
        recentMerchants,
        recordMerchant,
        taxIdMerchantMap,
        recordTaxIdMerchant,
        recentMemoTags,
        dismissedMemoTags,
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
        historySyncProgress,
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
        resetLocalCacheAndResync,
        isCurrentUserLocked,
        signInWithGoogle,
        signOutGoogle,
        isGoogleAuthenticated,
        googleUserEmail,
        currentBudget,
        isBudgetWidgetVisibleOnDevice,
        setBudgetWidgetVisibleOnDevice,
        updateBudget,
        getBudgetProgress,
        getMoMComparison,
        getSixMonthTrend,
        executeTransfer,
        getNetWorthSummary,
        offlineQueue,
        pendingOfflineCount,
        isProcessingQueue,
        processOfflineQueue,
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