import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Keyboard,
  Platform,
  StyleSheet,
  Animated,
  Alert,
} from 'react-native';
import { Text, TextInput } from '../components/common/Text';

import { useLedger } from '../context/LedgerContext';
import { usePrivacy } from '../context/PrivacyContext';
import { useTheme } from '../theme/ThemeContext';
import { useFontSize } from '../theme/FontSizeContext';
import { ThemeColors } from '../theme/colors';
import { Transaction } from '../types/database';
import { TransactionItem } from '../components/TransactionItem';
import { NetWorthWidget } from '../components/NetWorthWidget';
import { StoredValueWidget } from '../components/StoredValueWidget';
import { HorizontalScrollView } from '../components/HorizontalScrollView';
import { isTransferToMember } from '../lib/payment';
import { getRollingPendingBills } from '../lib/recurring';
import { getLocalDateYmd, getRollingMemoDueInfo, isMemoPinned, checkMemoPinQuota, isValidMerchantName, parseMemoNote, getEffectiveMemoReminderDate } from '../lib/memo';
import { isGroupOrderMemo, computeGroupOrderSummary } from '../lib/groupOrder';
import { checkInvoiceWinning } from '../lib/lottery';
import { getInvoicePeriodKey } from '../lib/invoice';

const PAGE_SIZE = 40;
const WEEKDAY_NAMES = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

function getLocalDateKeyFromIso(iso?: string): string {
  if (!iso) return 'unknown';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'unknown';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDayGroupLabel(
  ymd: string,
  todayYmd: string,
  yesterdayYmd: string,
  currentYear: number
): string {
  if (ymd === 'unknown') return '未註明日期';
  const parts = ymd.split('-');
  if (parts.length !== 3) return ymd;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return ymd;

  const d = new Date(year, month - 1, day);
  const weekday = WEEKDAY_NAMES[d.getDay()] || '';
  if (ymd === todayYmd) {
    return `今天 · ${month}/${day} (${weekday})`;
  }
  if (ymd === yesterdayYmd) {
    return `昨天 · ${month}/${day} (${weekday})`;
  }
  if (year !== currentYear) {
    return `${year}/${month}/${day} (${weekday})`;
  }
  return `${month}/${day} (${weekday})`;
}

function shiftYm(ym: string, delta: number): string {
  const parts = ym.split('-');
  if (parts.length !== 2) return ym;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  if (isNaN(year) || isNaN(month)) return ym;
  const d = new Date(year, month - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export interface TransactionsScreenProps {
  scrollRef?: React.RefObject<ScrollView>;
  keyboardOffset?: number;
  filterMonth: string;
  setFilterMonth: (month: string) => void;
  filterMemberId: string;
  setFilterMemberId: (memberId: string) => void;
  onOpenModal: (mode: 'expense' | 'income' | 'transfer' | 'allowance' | 'memo', recipientId?: string) => void;
  onOpenEditTransaction: (tx: Transaction) => void;
  onOpenMemoCompletion: (tx: Transaction) => void;
  onOpenBudgetManageModal: (tab?: 'family' | 'members') => void;
  onOpenAccountsManageModal: (scope?: 'all' | 'my') => void;
  onOpenRecurringModal: (scope: 'all' | 'my', targetMemberId?: string, initialTab?: 'bills' | 'pending' | 'installments') => void;
  onOpenMemoTodoModal: () => void;
  onOpenInvoiceLotteryModal: () => void;
  onOpenCloudInvoiceModal?: () => void;
  onOpenReconcileModal: (type: 'credit_card' | 'stored_value', cardId?: string) => void;
  onOpenExportModal: (tab: 'csv' | 'json' | 'attachments' | 'restore') => void;
  onViewImage: (url: string, title?: string) => void;
  onOpenFilterModal: (type: 'month' | 'member') => void;
}

export const TransactionsScreen: React.FC<TransactionsScreenProps> = ({
  scrollRef,
  keyboardOffset = 0,
  filterMonth,
  setFilterMonth,
  filterMemberId,
  setFilterMemberId,
  onOpenModal,
  onOpenEditTransaction,
  onOpenMemoCompletion,
  onOpenBudgetManageModal,
  onOpenAccountsManageModal,
  onOpenRecurringModal,
  onOpenMemoTodoModal,
  onOpenInvoiceLotteryModal,
  onOpenCloudInvoiceModal,
  onOpenReconcileModal,
  onOpenExportModal,
  onViewImage,
  onOpenFilterModal,
}) => {
  const { isDark, colors } = useTheme();
  const { fontScale } = useFontSize();
  const isLargeFont = fontScale >= 1.12;
  const styles = useMemo(() => getStyles(isDark, colors), [isDark, colors]);

  const {
    transactions,
    members,
    currentUser,
    currentLedger,
    historySyncProgress,
    lastBackupAt,
    autoBackupInterval,
    autoBackupEnabled,
    refreshLedger,
    updateTransaction,
    paymentAccounts,
    recurringRules,
    getMemberById,
    getCategoryById,
    recentMerchants,
    getBudgetProgress,
    isBudgetWidgetVisibleOnDevice,
    getNetWorthSummary,
  } = useLedger();

  const { isPrivacyMaskActive } = usePrivacy();

  const internalScrollRef = useRef<ScrollView>(null);
  const activeScrollRef = scrollRef || internalScrollRef;

  const [searchQuery, setSearchQuery] = useState('');
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<'all' | 'financial' | 'memo'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const filterKey = `${filterMonth}|${filterMemberId}|${searchQuery}|${transactionTypeFilter}`;
  const [paginationState, setPaginationState] = useState<{ filterKey: string; count: number }>({
    filterKey,
    count: PAGE_SIZE,
  });
  const displayCount = paginationState.filterKey === filterKey ? paginationState.count : PAGE_SIZE;
  const updateDisplayCount = useCallback((nextCount: number | ((prev: number) => number)) => {
    setPaginationState(prev => {
      const currentCount = prev.filterKey === filterKey ? prev.count : PAGE_SIZE;
      const resolved = typeof nextCount === 'function' ? nextCount(currentCount) : nextCount;
      return { filterKey, count: resolved };
    });
  }, [filterKey]);
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  const [isReminderDismissed, setIsReminderDismissed] = useState(false);
  const [isAssetSectionExpanded, setIsAssetSectionExpanded] = useState(false);
  const [isPinnedExpanded, setIsPinnedExpanded] = useState<boolean>(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState<boolean>(true);
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
  const searchBarYRef = useRef<number>(260);

  // 剛才查看之高光錨點紀錄（自動維持 6 秒讓使用者退回列表時瞬間鎖定焦點）
  const [lastViewedTxId, setLastViewedTxId] = useState<string | null>(null);
  const lastViewedTxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 浮動捲動進度小藥丸（滾動時浮現、靜止 1.2 秒自動平滑淡出）
  const [scrollPillText, setScrollPillText] = useState<string>('');
  const [scrollPillOpacity] = useState(() => new Animated.Value(0));
  const scrollPillTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (lastViewedTxId) {
      if (lastViewedTxTimer.current) clearTimeout(lastViewedTxTimer.current);
      lastViewedTxTimer.current = setTimeout(() => {
        setLastViewedTxId(null);
      }, 6000);
    }
  }, [lastViewedTxId]);

  useEffect(() => {
    return () => {
      if (lastViewedTxTimer.current) clearTimeout(lastViewedTxTimer.current);
      if (scrollPillTimer.current) clearTimeout(scrollPillTimer.current);
    };
  }, []);

  // 當前與可選月份計算
  const currentMonthYm = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const availableMonths = useMemo(() => {
    const monthMap = new Map<string, number>();
    const now = new Date();
    const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    monthMap.set(currentYm, 0);

    transactions.forEach(t => {
      if (t.transacted_at) {
        const d = new Date(t.transacted_at);
        if (!isNaN(d.getTime())) {
          const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          monthMap.set(ym, (monthMap.get(ym) || 0) + 1);
        }
      }
    });

    return Array.from(monthMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([ym, count]) => ({
        ym,
        label: `${ym.split('-')[0]} 年 ${parseInt(ym.split('-')[1], 10)} 月`,
        count,
      }));
  }, [transactions]);

  // 備份提醒計算
  const daysSinceLastBackup = useMemo(() => {
    if (!lastBackupAt) return null;
    const lastDate = new Date(lastBackupAt);
    if (isNaN(lastDate.getTime())) return null;
    const diffMs = nowTimestamp - lastDate.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }, [lastBackupAt, nowTimestamp]);

  // 定期備份橫幅邏輯
  const isBackupDue = useMemo(() => {
    if (!autoBackupEnabled) return false;
    if (daysSinceLastBackup === null) {
      return transactions.length >= 10;
    }
    return daysSinceLastBackup >= autoBackupInterval;
  }, [autoBackupEnabled, daysSinceLastBackup, autoBackupInterval, transactions.length]);

  const showBackupBanner = isBackupDue && !isReminderDismissed;

  // 待辦記事計算
  const pendingMemos = useMemo(() => {
    const todayYmd = getLocalDateYmd();
    return transactions.filter(t => {
      if (t.type !== 'memo') return false;
      if (t.is_settled) return false;
      const effDate = getEffectiveMemoReminderDate(t);
      if (!effDate) return false;
      return effDate <= todayYmd;
    }).sort((a, b) => (getEffectiveMemoReminderDate(a) || '').localeCompare(getEffectiveMemoReminderDate(b) || ''));
  }, [transactions]);

  // 待繳週期帳單計算
  const isMatchedToCurrentUser = useMemo(() => {
    return (paidById?: string) => {
      if (!paidById) return false;
      if (paidById === currentUser?.id) return true;
      const mem = getMemberById(paidById);
      if (mem && currentUser?.display_name && mem.display_name === currentUser.display_name) return true;
      return false;
    };
  }, [currentUser, getMemberById]);

  const isMatchedToTargetMember = useMemo(() => {
    return (paidById?: string, targetId?: string) => {
      if (!paidById || !targetId) return false;
      if (paidById === targetId) return true;
      const mem = getMemberById(paidById);
      const targetM = getMemberById(targetId);
      if (mem && targetM && mem.display_name === targetM.display_name) return true;
      return false;
    };
  }, [getMemberById]);

  const scopedRecurringRules = useMemo(() => {
    return (recurringRules || []).filter(r => !r.ledger_id || r.ledger_id === currentLedger?.id);
  }, [recurringRules, currentLedger?.id]);

  const currentFilterPendingBills = useMemo(() => {
    const now = new Date();
    // 支援滾動未來 7 天時間軸（跨月平滑預告，已逾期 -> 今日 -> 7天內扣款）
    const rollingBills = getRollingPendingBills(scopedRecurringRules, now, 7);

    if (filterMemberId === 'all') {
      return rollingBills;
    }

    const targetM = members.find(m => m.id === filterMemberId);
    const isMe =
      filterMemberId === currentUser?.id ||
      (!!currentUser?.display_name && targetM?.display_name === currentUser.display_name);

    if (isMe) {
      return rollingBills.filter(item => isMatchedToCurrentUser(item.rule.paid_by));
    }

    return rollingBills.filter(item => isMatchedToTargetMember(item.rule.paid_by, filterMemberId));
  }, [scopedRecurringRules, filterMemberId, currentUser, members, isMatchedToCurrentUser, isMatchedToTargetMember]);

  // 提取此帳本現有紀錄中的店家清單（嚴格排除生活備忘與中繼標籤）
  const activeMerchantsInLedger = useMemo(() => {
    const counts = new Map<string, number>();
    transactions.forEach(t => {
      if (t.type === 'memo') return; // 生活記事絕非消費店家！
      const m = (t.merchant || '').trim();
      if (m && isValidMerchantName(m)) {
        counts.set(m, (counts.get(m) || 0) + 1);
      }
    });
    const fromTx = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([m]) => m);

    const validRecent = (recentMerchants || []).filter(isValidMerchantName);
    const combined = Array.from(new Set([...fromTx, ...validRecent]));
    return combined.slice(0, 15);
  }, [transactions, recentMerchants]);

  // 計算各類型數量（全部 / 僅看收支 / 僅看生活備忘）
  // 必須與列表篩選邏輯完全一致，包含五大進行中活動與置頂記事跨月常駐與全家/個人視角隔離
  const typeCountStats = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    // 1. 未結案之五大協作看板 (點餐、投票、懸賞、採買、包裹) - 跨月常駐，全家共享人人可見
    const collabActivities = transactions.filter(t => {
      if (t.type !== 'memo' || t.is_settled) return false;
      const parsed = parseMemoNote(t.note);
      if (!isGroupOrderMemo(parsed.title || t.category?.name, t.note)) return false;

      // 成員過濾 (全家共享人人可見；個人專屬視角隔離)
      if (filterMemberId !== 'all') {
        const isFamily = !t.reminder_target || t.reminder_target === 'family';
        if (!isFamily) {
          const payer = getMemberById(t.paid_by) || t.payer_profile;
          const targetMember = members.find(m => m.id === filterMemberId) || (currentUser?.id === filterMemberId ? currentUser : undefined);
          const isMatch =
            (payer && payer.id === filterMemberId) ||
            t.paid_by === filterMemberId ||
            (targetMember && (payer?.display_name === targetMember.display_name || (t as any).payer_name === targetMember.display_name));
          if (!isMatch) return false;
        }
      } else {
        if (t.reminder_target === 'personal') {
          const isMine =
            (t.paid_by && t.paid_by === currentUser?.id) ||
            (t.creator_id && t.creator_id === currentUser?.id) ||
            (t.paid_by && currentUser?.display_name && (getMemberById(t.paid_by)?.display_name === currentUser.display_name));
          if (!isMine) return false;
        }
      }

      if (q) {
        const mMatch = t.merchant && t.merchant.toLowerCase().includes(q);
        const nMatch = t.note && t.note.toLowerCase().includes(q);
        const cat = getCategoryById(t.category_id, t.category);
        const cMatch = cat && cat.name.toLowerCase().includes(q);
        if (!mMatch && !nMatch && !cMatch) return false;
      }

      return true;
    });

    const collabIds = new Set(collabActivities.map(c => c.id));

    // 2. 符合條件的未完成置頂記事 (排除五大協作活動後，跨月常駐，不受 filterMonth 限制)
    const pinnedMemos = transactions.filter(t => {
      if (collabIds.has(t.id)) return false;
      if (!isMemoPinned(t)) return false;

      // 成員過濾 (全家共享人人可見；個人專屬視角隔離)
      if (filterMemberId !== 'all') {
        const isFamily = !t.reminder_target || t.reminder_target === 'family';
        if (!isFamily) {
          const payer = getMemberById(t.paid_by) || t.payer_profile;
          const targetMember = members.find(m => m.id === filterMemberId) || (currentUser?.id === filterMemberId ? currentUser : undefined);
          const isMatch =
            (payer && payer.id === filterMemberId) ||
            t.paid_by === filterMemberId ||
            (targetMember && (payer?.display_name === targetMember.display_name || (t as any).payer_name === targetMember.display_name));
          if (!isMatch) return false;
        }
      } else {
        if (t.reminder_target === 'personal') {
          const isMine =
            (t.paid_by && t.paid_by === currentUser?.id) ||
            (t.creator_id && t.creator_id === currentUser?.id) ||
            (t.paid_by && currentUser?.display_name && (getMemberById(t.paid_by)?.display_name === currentUser.display_name));
          if (!isMine) return false;
        }
      }

      // 關鍵字過濾
      if (q) {
        const mMatch = t.merchant && t.merchant.toLowerCase().includes(q);
        const nMatch = t.note && t.note.toLowerCase().includes(q);
        const cat = getCategoryById(t.category_id, t.category);
        const cMatch = cat && cat.name.toLowerCase().includes(q);
        if (!mMatch && !nMatch && !cMatch) return false;
      }

      return true;
    });

    const topIds = new Set([...collabIds, ...pinnedMemos.map(p => p.id)]);
    let normalMemoCount = 0;
    let financial = 0;

    // 3. 常規紀錄過濾 (排除已在頂部常駐之協作看板與置頂備忘，受 filterMonth 限制)
    transactions.forEach(t => {
      if (topIds.has(t.id)) return;

      if (filterMonth !== 'all') {
        if (!t.transacted_at) return;
        const d = new Date(t.transacted_at);
        if (isNaN(d.getTime())) return;
        if (/^\d{4}$/.test(filterMonth)) {
          if (d.getFullYear() !== parseInt(filterMonth, 10)) return;
        } else {
          const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          if (ym !== filterMonth) return;
        }
      }

      if (filterMemberId !== 'all') {
        const payer = getMemberById(t.paid_by) || t.payer_profile;
        const targetMember = members.find(m => m.id === filterMemberId) || (currentUser?.id === filterMemberId ? currentUser : undefined);
        const isTransferIn = isTransferToMember(t, filterMemberId, targetMember?.display_name, paymentAccounts);
        const isMatch =
          (payer && payer.id === filterMemberId) ||
          t.paid_by === filterMemberId ||
          (targetMember && (payer?.display_name === targetMember.display_name || (t as any).payer_name === targetMember.display_name)) ||
          isTransferIn;
        if (!isMatch) return;
      } else {
        if (t.type === 'memo' && t.reminder_target === 'personal') {
          const isMine =
            (t.paid_by && t.paid_by === currentUser?.id) ||
            (t.creator_id && t.creator_id === currentUser?.id) ||
            (t.paid_by && currentUser?.display_name && (getMemberById(t.paid_by)?.display_name === currentUser.display_name));
          if (!isMine) return;
        }
      }

      if (q) {
        const mMatch = t.merchant && t.merchant.toLowerCase().includes(q);
        const nMatch = t.note && t.note.toLowerCase().includes(q);
        const cat = getCategoryById(t.category_id, t.category);
        const cMatch = cat && cat.name.toLowerCase().includes(q);
        if (!mMatch && !nMatch && !cMatch) return;
      }

      if (t.type === 'memo') {
        normalMemoCount++;
      } else {
        financial++;
      }
    });

    const memo = collabActivities.length + pinnedMemos.length + normalMemoCount;
    const all = financial + memo;

    return { all, financial, memo };
  }, [transactions, filterMonth, filterMemberId, searchQuery, getMemberById, getCategoryById, members, currentUser, paymentAccounts]);

  // 依據篩選條件計算 groupedFilteredTransactions (支援方案 C 智慧分流與方案 1 全家/個人置頂)
  const groupedFilteredTransactions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    // 1. 若篩選為「僅看收支」，直接排除所有 memo（包含置頂）
    if (transactionTypeFilter === 'financial') {
      const list = transactions.filter(t => {
        if (t.type === 'memo') return false;

        if (filterMonth !== 'all') {
          if (!t.transacted_at) return false;
          const d = new Date(t.transacted_at);
          if (isNaN(d.getTime())) return false;
          if (/^\d{4}$/.test(filterMonth)) {
            if (d.getFullYear() !== parseInt(filterMonth, 10)) return false;
          } else {
            const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (ym !== filterMonth) return false;
          }
        }

        if (filterMemberId !== 'all') {
          const payer = getMemberById(t.paid_by) || t.payer_profile;
          const targetMember = members.find(m => m.id === filterMemberId) || (currentUser?.id === filterMemberId ? currentUser : undefined);
          const isTransferIn = isTransferToMember(t, filterMemberId, targetMember?.display_name, paymentAccounts);
          const isMatch =
            (payer && payer.id === filterMemberId) ||
            t.paid_by === filterMemberId ||
            (targetMember && (payer?.display_name === targetMember.display_name || (t as any).payer_name === targetMember.display_name)) ||
            isTransferIn;
          if (!isMatch) return false;
        }

        if (q) {
          const mMatch = t.merchant && t.merchant.toLowerCase().includes(q);
          const nMatch = t.note && t.note.toLowerCase().includes(q);
          const cat = getCategoryById(t.category_id, t.category);
          const cMatch = cat && cat.name.toLowerCase().includes(q);
          if (!mMatch && !nMatch && !cMatch) return false;
        }

        return true;
      });
      return { collabActivities: [], pinnedMemos: [], normalTransactions: list, all: list };
    }

    // 2. 篩選「全部記錄」或「僅看記事」：
    // (A) 尋找未結案之五大協作看板 (點餐、投票、懸賞、採買、包裹)
    // 關鍵架構分流：進行中協作活動天然保證常駐於首頁最上方，不佔用也不受限於常態置頂 5 筆上限！
    const collabActivities = transactions.filter(t => {
      if (t.type !== 'memo' || t.is_settled) return false;
      const parsed = parseMemoNote(t.note);
      if (!isGroupOrderMemo(parsed.title || t.category?.name, t.note)) return false;

      // 成員過濾 (全家共享人人可見；個人專屬視角隔離)
      if (filterMemberId !== 'all') {
        const isFamily = !t.reminder_target || t.reminder_target === 'family';
        if (!isFamily) {
          const payer = getMemberById(t.paid_by) || t.payer_profile;
          const targetMember = members.find(m => m.id === filterMemberId) || (currentUser?.id === filterMemberId ? currentUser : undefined);
          const isMatch =
            (payer && payer.id === filterMemberId) ||
            t.paid_by === filterMemberId ||
            (targetMember && (payer?.display_name === targetMember.display_name || (t as any).payer_name === targetMember.display_name));
          if (!isMatch) return false;
        }
      } else {
        if (t.reminder_target === 'personal') {
          const isMine =
            (t.paid_by && t.paid_by === currentUser?.id) ||
            (t.creator_id && t.creator_id === currentUser?.id) ||
            (t.paid_by && currentUser?.display_name && (getMemberById(t.paid_by)?.display_name === currentUser.display_name));
          if (!isMine) return false;
        }
      }

      if (q) {
        const mMatch = t.merchant && t.merchant.toLowerCase().includes(q);
        const nMatch = t.note && t.note.toLowerCase().includes(q);
        const cat = getCategoryById(t.category_id, t.category);
        const cMatch = cat && cat.name.toLowerCase().includes(q);
        if (!mMatch && !nMatch && !cMatch) return false;
      }

      return true;
    }).sort((a, b) => (b.transacted_at || '').localeCompare(a.transacted_at || ''));

    const collabIds = new Set(collabActivities.map(c => c.id));

    // (B) 尋找未完成的常態置頂記事 (排除五大協作活動後，專屬於慢箋藥單、日常備忘等，享有獨立 5 筆全家額度)
    const pinnedMemos = transactions.filter(t => {
      if (collabIds.has(t.id)) return false;
      if (!isMemoPinned(t)) return false;

      // 成員過濾 (方案 1: 全家共享人人可見；個人專屬視角隔離)
      if (filterMemberId !== 'all') {
        const isFamily = !t.reminder_target || t.reminder_target === 'family';
        if (!isFamily) {
          // 個人專屬：必須為本人記錄或指名給本人
          const payer = getMemberById(t.paid_by) || t.payer_profile;
          const targetMember = members.find(m => m.id === filterMemberId) || (currentUser?.id === filterMemberId ? currentUser : undefined);
          const isMatch =
            (payer && payer.id === filterMemberId) ||
            t.paid_by === filterMemberId ||
            (targetMember && (payer?.display_name === targetMember.display_name || (t as any).payer_name === targetMember.display_name));
          if (!isMatch) return false;
        }
      } else {
        // 當查看全體「全部」視角時：
        // 全家共享項目對全體家庭成員公開；個人專屬記事僅本人可見，隱藏其他家人的私人備忘
        if (t.reminder_target === 'personal') {
          const isMine =
            (t.paid_by && t.paid_by === currentUser?.id) ||
            (t.creator_id && t.creator_id === currentUser?.id) ||
            (t.paid_by && currentUser?.display_name && (getMemberById(t.paid_by)?.display_name === currentUser.display_name));
          if (!isMine) return false;
        }
      }

      // 關鍵字搜尋過濾
      if (q) {
        const mMatch = t.merchant && t.merchant.toLowerCase().includes(q);
        const nMatch = t.note && t.note.toLowerCase().includes(q);
        const cat = getCategoryById(t.category_id, t.category);
        const cMatch = cat && cat.name.toLowerCase().includes(q);
        if (!mMatch && !nMatch && !cMatch) return false;
      }

      return true;
    }).sort((a, b) => (b.transacted_at || '').localeCompare(a.transacted_at || ''));

    const topIds = new Set([...collabIds, ...pinnedMemos.map(p => p.id)]);

    // (C) 一般時間序列常規過濾 (排除已在上方展示之協作活動與置頂備忘，避免重複渲染)
    const normalTransactions = transactions.filter(t => {
      if (topIds.has(t.id)) return false;
      if (transactionTypeFilter === 'memo' && t.type !== 'memo') return false;

      if (filterMonth !== 'all') {
        if (!t.transacted_at) return false;
        const d = new Date(t.transacted_at);
        if (isNaN(d.getTime())) return false;
        if (/^\d{4}$/.test(filterMonth)) {
          if (d.getFullYear() !== parseInt(filterMonth, 10)) return false;
        } else {
          const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          if (ym !== filterMonth) return false;
        }
      }

      if (filterMemberId !== 'all') {
        const payer = getMemberById(t.paid_by) || t.payer_profile;
        const targetMember = members.find(m => m.id === filterMemberId) || (currentUser?.id === filterMemberId ? currentUser : undefined);
        const isTransferIn = isTransferToMember(t, filterMemberId, targetMember?.display_name, paymentAccounts);
        const isMatch =
          (payer && payer.id === filterMemberId) ||
          t.paid_by === filterMemberId ||
          (targetMember && (payer?.display_name === targetMember.display_name || (t as any).payer_name === targetMember.display_name)) ||
          isTransferIn;
        if (!isMatch) return false;
      } else {
        // 全家「全部」視角：個人專屬純記事不打擾其他家庭成員
        if (t.type === 'memo' && t.reminder_target === 'personal') {
          const isMine =
            (t.paid_by && t.paid_by === currentUser?.id) ||
            (t.creator_id && t.creator_id === currentUser?.id) ||
            (t.paid_by && currentUser?.display_name && (getMemberById(t.paid_by)?.display_name === currentUser.display_name));
          if (!isMine) return false;
        }
      }

      if (q) {
        const mMatch = t.merchant && t.merchant.toLowerCase().includes(q);
        const nMatch = t.note && t.note.toLowerCase().includes(q);
        const cat = getCategoryById(t.category_id, t.category);
        const cMatch = cat && cat.name.toLowerCase().includes(q);
        if (!mMatch && !nMatch && !cMatch) return false;
      }

      return true;
    });

    return {
      collabActivities,
      pinnedMemos,
      normalTransactions,
      all: [...collabActivities, ...pinnedMemos, ...normalTransactions],
    };
  }, [transactions, transactionTypeFilter, filterMonth, filterMemberId, searchQuery, getMemberById, getCategoryById, members, currentUser, paymentAccounts]);

  const filteredTransactions = useMemo(() => {
    return groupedFilteredTransactions.all || [];
  }, [groupedFilteredTransactions]);

  const collabActivitiesList = useMemo(() => {
    return groupedFilteredTransactions.collabActivities || [];
  }, [groupedFilteredTransactions]);

  const pinnedMemosList = useMemo(() => {
    return groupedFilteredTransactions.pinnedMemos || [];
  }, [groupedFilteredTransactions]);

  const normalTransactionsList = useMemo(() => {
    return groupedFilteredTransactions.normalTransactions || [];
  }, [groupedFilteredTransactions]);

  // 首頁置頂防霸屏折疊：預設常駐前 2 筆最新置頂記事，超過 2 筆時折疊收合
  const visiblePinnedMemos = useMemo(() => {
    if (pinnedMemosList.length <= 2 || isPinnedExpanded) {
      return pinnedMemosList;
    }
    return pinnedMemosList.slice(0, 2);
  }, [pinnedMemosList, isPinnedExpanded]);

  const displayedNormalTransactions = useMemo(() => {
    return normalTransactionsList.slice(0, displayCount);
  }, [normalTransactionsList, displayCount]);

  const displayedTransactions = useMemo(() => {
    return [...collabActivitiesList, ...visiblePinnedMemos, ...displayedNormalTransactions];
  }, [collabActivitiesList, visiblePinnedMemos, displayedNormalTransactions]);

  // 預先建立記事與交易雙向關聯索引表，避免單筆卡片渲染重複掃描整份明細陣列
  const { linkedMemoByTxId, linkedTargetsByMemoId } = useMemo(() => {
    const byId = new Map<string, Transaction>();
    transactions.forEach(t => {
      byId.set(t.id, t);
    });

    const memoByTx = new Map<string, Transaction>();
    const targetsByMemo = new Map<string, Transaction[]>();

    transactions.forEach(t => {
      if (t.type !== 'memo') return;
      const targets: Transaction[] = [];
      if (t.linked_transaction_id) {
        const direct = byId.get(t.linked_transaction_id);
        if (direct) {
          targets.push(direct);
          if (direct.type !== 'memo' && !memoByTx.has(direct.id)) {
            memoByTx.set(direct.id, t);
          }
        }
      }
      targetsByMemo.set(t.id, targets);
    });

    transactions.forEach(t => {
      if (t.linked_transaction_id) {
        const linkedOwner = byId.get(t.linked_transaction_id);
        if (linkedOwner) {
          if (t.type !== 'memo' && linkedOwner.type === 'memo' && !memoByTx.has(t.id)) {
            memoByTx.set(t.id, linkedOwner);
          }
          if (linkedOwner.type === 'memo' && t.id !== linkedOwner.id) {
            const list = targetsByMemo.get(linkedOwner.id);
            if (list && !list.some(existing => existing.id === t.id)) {
              list.push(t);
            }
          }
        }
      }
    });

    return { linkedMemoByTxId: memoByTx, linkedTargetsByMemoId: targetsByMemo };
  }, [transactions]);

  // 計算各日收支小計與已展開清單的按日分組結構
  const todayYmd = getLocalDateYmd();
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayYmd = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, '0')}-${String(yesterdayDate.getDate()).padStart(2, '0')}`;
  const currentYearNum = new Date().getFullYear();

  const dailySummaryMap = useMemo(() => {
    const map = new Map<string, { expense: number; income: number }>();
    const isMemberFilter = filterMemberId !== 'all';
    const targetMember = isMemberFilter
      ? (members.find(m => m.id === filterMemberId) || (currentUser?.id === filterMemberId ? currentUser : undefined))
      : undefined;

    normalTransactionsList.forEach(t => {
      const ymd = getLocalDateKeyFromIso(t.transacted_at);
      let entry = map.get(ymd);
      if (!entry) {
        entry = { expense: 0, income: 0 };
        map.set(ymd, entry);
      }
      if (t.type === 'expense') {
        entry.expense += Number(t.amount);
      } else if (t.type === 'income') {
        entry.income += Number(t.amount);
      } else if (t.type === 'transfer' && isMemberFilter) {
        const isTransferIn = isTransferToMember(t, filterMemberId, targetMember?.display_name, paymentAccounts);
        const isTransferOut = t.paid_by === filterMemberId;
        if (isTransferIn && !isTransferOut) {
          entry.income += Number(t.amount);
        } else if (isTransferOut && !isTransferIn) {
          entry.expense += Number(t.amount);
        }
      }
    });

    return map;
  }, [normalTransactionsList, filterMemberId, members, currentUser, paymentAccounts]);

  const groupedNormalTransactions = useMemo(() => {
    const groupsMap = new Map<string, {
      ymd: string;
      label: string;
      items: Transaction[];
      expense: number;
      income: number;
    }>();

    displayedNormalTransactions.forEach(item => {
      const ymd = getLocalDateKeyFromIso(item.transacted_at);
      let group = groupsMap.get(ymd);
      if (!group) {
        const summary = dailySummaryMap.get(ymd) || { expense: 0, income: 0 };
        group = {
          ymd,
          label: formatDayGroupLabel(ymd, todayYmd, yesterdayYmd, currentYearNum),
          items: [],
          expense: summary.expense,
          income: summary.income,
        };
        groupsMap.set(ymd, group);
      }
      group.items.push(item);
    });

    return Array.from(groupsMap.values());
  }, [displayedNormalTransactions, dailySummaryMap, todayYmd, yesterdayYmd, currentYearNum]);

  // 共用置頂切換處理（協作看板、置頂區與常規明細共用）
  const handleTogglePinMemo = useCallback(async (tx: Transaction) => {
    const parsed = parseMemoNote(tx.note);
    if (isGroupOrderMemo(parsed.title || tx.category?.name, tx.note)) {
      Alert.alert(
        '協作活動進行中',
        '此為進行中之家庭協作活動看板，系統已自動常駐於首頁最上方，拍板結案後將自動歸檔，不需也不佔用置頂名額。'
      );
      return;
    }
    const currentlyPinned = isMemoPinned(tx);
    if (!currentlyPinned) {
      const targetScope = tx.reminder_target === 'personal' ? 'personal' : 'family';
      const quota = checkMemoPinQuota(transactions, {
        targetScope,
        memberId: tx.paid_by || currentUser?.id,
        excludeTxId: tx.id,
      });
      if (!quota.canPin) {
        Alert.alert(
          targetScope === 'personal' ? '個人置頂已達上限' : '全家置頂已達上限',
          quota.errorMessage || '置頂已達 5 筆上限，請先辦妥或取消現有置頂事項。'
        );
        return;
      }
    }
    await updateTransaction(tx.id, { is_pinned: !currentlyPinned });
  }, [transactions, currentUser?.id, updateTransaction]);

  // 上方智慧提醒狀態與搜尋列待辦角標資訊
  const headerNoticeInfo = useMemo(() => {
    const nowYmd = getLocalDateYmd();
    const max7DaysDate = new Date();
    max7DaysDate.setDate(max7DaysDate.getDate() + 7);
    const max7DaysYmd = `${max7DaysDate.getFullYear()}-${String(max7DaysDate.getMonth() + 1).padStart(2, '0')}-${String(max7DaysDate.getDate()).padStart(2, '0')}`;

    const upcoming7DaysMemos = transactions
      .filter(t => {
        if (t.type !== 'memo' || t.is_settled) return false;
        const effDate = getEffectiveMemoReminderDate(t);
        return !!effDate && effDate > nowYmd && effDate <= max7DaysYmd;
      })
      .sort((a, b) => (getEffectiveMemoReminderDate(a) || '').localeCompare(getEffectiveMemoReminderDate(b) || ''));

    const hasPendingBills = currentFilterPendingBills.length > 0;
    const isMe =
      filterMemberId === currentUser?.id ||
      (!!currentUser?.display_name && members.find(m => m.id === filterMemberId)?.display_name === currentUser.display_name);

    const billTitle = `待繳帳單 (${currentFilterPendingBills.length})`;

    const hasOverdueMemo = pendingMemos.some(t => {
      const effDate = getEffectiveMemoReminderDate(t);
      return !!effDate && effDate < nowYmd;
    });
    const hasTodayMemo = pendingMemos.some(t => getEffectiveMemoReminderDate(t) === nowYmd);

    const activeInteractiveMemos = transactions.filter(
      t => t.type === 'memo' && !t.is_settled && isGroupOrderMemo(t.category?.name, t.note)
    );
    const hasInteractiveOrder = activeInteractiveMemos.length > 0;
    let interactiveIcon = '🧋';
    let interactiveLabel = '點餐開團中';

    if (hasInteractiveOrder) {
      const topOrder = activeInteractiveMemos[0];
      const summary = computeGroupOrderSummary(topOrder.note || '', topOrder.category?.name);
      if (summary.mode === 'vote') {
        interactiveIcon = '🗳️';
        interactiveLabel = `投票中 (${summary.totalVotes || 0}票)`;
      } else if (summary.mode === 'grocery') {
        interactiveIcon = '🛒';
        interactiveLabel = `${summary.storeName && summary.storeName !== '採買賣場' ? summary.storeName : '賣場'}採買中`;
      } else if (summary.mode === 'chore') {
        interactiveIcon = '🧹';
        interactiveLabel = '家事分工中';
      } else if (summary.mode === 'parcel') {
        interactiveIcon = '📦';
        interactiveLabel = '包裹代領中';
      } else {
        interactiveIcon = '🧋';
        interactiveLabel = `${summary.storeName && summary.storeName !== '點餐店家' ? summary.storeName : '點餐'}開團中`;
      }
    }

    const activeMemoList = pendingMemos.length > 0 ? pendingMemos : upcoming7DaysMemos;
    const hasPendingMemos = pendingMemos.length > 0 || upcoming7DaysMemos.length > 0;
    const hasMemoNotice = hasInteractiveOrder || hasPendingMemos;
    const memoCount = activeMemoList.length;

    let memoPrefix = '今日待辦';
    let chipIcon = pendingMemos.length > 0 ? '🔔' : '🗓️';

    if (hasInteractiveOrder) {
      memoPrefix = interactiveLabel;
      chipIcon = interactiveIcon;
    } else if (hasOverdueMemo) {
      memoPrefix = '待辦/逾期';
    } else if (hasTodayMemo) {
      memoPrefix = '今日待辦';
    } else if (upcoming7DaysMemos.length > 0) {
      const firstDue = getRollingMemoDueInfo(getEffectiveMemoReminderDate(upcoming7DaysMemos[0]), nowYmd);
      memoPrefix = `近期待辦 (${firstDue?.badgeText || '7天內'})`;
    }

    let memoTitle = `${memoPrefix} (${memoCount})`;
    if (hasInteractiveOrder) {
      memoTitle = hasPendingMemos ? `${interactiveLabel} · 待辦(${memoCount})` : interactiveLabel;
    }

    const isUrgentMemo = hasInteractiveOrder || pendingMemos.length > 0 || upcoming7DaysMemos.length > 0;

    return {
      hasPendingBills,
      billTitle,
      isMe,
      hasMemoNotice,
      hasInteractiveOrder,
      urgentTodoCount: pendingMemos.length,
      memoTitle,
      chipIcon,
      isUrgentMemo,
    };
  }, [transactions, currentFilterPendingBills.length, filterMemberId, currentUser, members, pendingMemos]);

  const defaultMemberId = currentUser?.id || 'all';
  const isFiltered = filterMonth !== currentMonthYm || filterMemberId !== defaultMemberId || !!searchQuery.trim() || transactionTypeFilter !== 'all';
  const isSingleMonthFilter = /^\d{4}-\d{2}$/.test(filterMonth);
  const maxSelectableMonthYm = useMemo(() => {
    const firstYm = availableMonths[0]?.ym;
    return firstYm && firstYm > currentMonthYm ? firstYm : currentMonthYm;
  }, [availableMonths, currentMonthYm]);
  const canGoNextMonth = isSingleMonthFilter && filterMonth < maxSelectableMonthYm;

  // 收支總計
  const displaySummary = useMemo(() => {
    let totalExpense = 0;
    let totalIncome = 0;
    let personalTransferIn = 0;
    let personalTransferOut = 0;

    const targetMember = filterMemberId !== 'all'
      ? (members.find(m => m.id === filterMemberId) || (currentUser?.id === filterMemberId ? currentUser : undefined))
      : undefined;

    filteredTransactions.forEach(t => {
      if (t.type === 'expense') {
        totalExpense += Number(t.amount);
      } else if (t.type === 'income') {
        totalIncome += Number(t.amount);
      } else if (t.type === 'transfer' && filterMemberId !== 'all') {
        const isTransferIn = isTransferToMember(t, filterMemberId, targetMember?.display_name, paymentAccounts);
        const isTransferOut = t.paid_by === filterMemberId;
        if (isTransferIn && !isTransferOut) {
          personalTransferIn += Number(t.amount);
        } else if (isTransferOut && !isTransferIn) {
          personalTransferOut += Number(t.amount);
        }
      }
    });

    const isMemberFilter = filterMemberId !== 'all';
    const effectiveIncome = isMemberFilter ? (totalIncome + personalTransferIn) : totalIncome;
    const effectiveExpense = isMemberFilter ? (totalExpense + personalTransferOut) : totalExpense;
    const netBalance = effectiveIncome - effectiveExpense;

    return {
      totalExpense,
      totalIncome,
      personalTransferIn,
      personalTransferOut,
      effectiveIncome,
      effectiveExpense,
      netBalance,
      isMemberFilter,
    };
  }, [filteredTransactions, filterMemberId, members, currentUser, paymentAccounts]);

  const selectedMember = members.find(m => m.id === filterMemberId);
  const selectedMonthObj = availableMonths.find(m => m.ym === filterMonth);

  const summaryCardTitle = useMemo(() => {
    if (searchQuery.trim()) {
      return `🔍「${searchQuery.trim()}」消費總覽`;
    }
    const isMe = filterMemberId === currentUser?.id;
    if (filterMonth === currentMonthYm && filterMemberId === 'all') {
      return '本月全家總覽';
    }
    if (filterMonth === currentMonthYm && isMe) {
      return `本月「${currentUser?.display_name || '我'}」收支總覽`;
    }
    if (filterMonth === 'all' && filterMemberId === 'all') {
      return '全部歷史家庭總覽';
    }
    if (filterMonth === 'all' && isMe) {
      return `全部歷史「${currentUser?.display_name || '我'}」總覽`;
    }
    const parts: string[] = [];
    if (filterMonth === 'all') {
      parts.push('全部歷史');
    } else if (/^\d{4}$/.test(filterMonth)) {
      const year = parseInt(filterMonth, 10);
      const nowY = new Date().getFullYear();
      parts.push(year === nowY ? `今年 (${year} 全年)` : `${year} 全年`);
    } else if (selectedMonthObj) {
      parts.push(selectedMonthObj.label);
    } else if (filterMonth && filterMonth.includes('-')) {
      const p = filterMonth.split('-');
      parts.push(`${p[0]} 年 ${parseInt(p[1], 10)} 月`);
    }
    if (filterMemberId !== 'all') {
      if (isMe) {
        parts.push(`${currentUser?.display_name || '我'} (本機)`);
      } else if (selectedMember) {
        parts.push(selectedMember.display_name);
      }
    } else {
      parts.push('全體成員');
    }
    return `${parts.join(' ‧ ')} 總覽`;
  }, [filterMonth, filterMemberId, searchQuery, currentMonthYm, selectedMonthObj, selectedMember, currentUser]);

  const resetFilters = () => {
    setFilterMonth(currentMonthYm);
    setFilterMemberId(currentUser?.id || 'all');
    setSearchQuery('');
    setTransactionTypeFilter('all');
  };

  const invoiceLotteryStats = useMemo(() => {
    let wonCount = 0;
    transactions.forEach(t => {
      if (t.invoice_number) {
        if (t.invoice_status === 'won') {
          wonCount++;
        } else if (t.invoice_status !== 'claimed') {
          const pk = t.transacted_at ? getInvoicePeriodKey(t.transacted_at).periodKey : (t.invoice_period || '');
          const res = checkInvoiceWinning(t.invoice_number, pk);
          if (res.isWon) wonCount++;
        }
      }
    });
    return { wonCount };
  }, [transactions]);

  // 方向 1：預算進度內嵌與資產淨值折疊計算
  const budgetProgress = useMemo(() => {
    return getBudgetProgress(filterMonth === 'all' ? undefined : filterMonth, filterMemberId);
  }, [getBudgetProgress, filterMonth, filterMemberId]);

  const netWorthSummary = useMemo(() => {
    return getNetWorthSummary(filterMemberId);
  }, [getNetWorthSummary, filterMemberId]);

  const maskedNetWorth = useMemo(() => {
    if (isPrivacyMaskActive) return 'NT$ ••••••';
    return `NT$ ${netWorthSummary.netWorth.toLocaleString()}`;
  }, [isPrivacyMaskActive, netWorthSummary.netWorth]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshLedger();
    } finally {
      setNowTimestamp(Date.now());
      setIsRefreshing(false);
    }
  };

  return (
    <View style={styles.screenContainer}>
      <ScrollView
        ref={activeScrollRef}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.scrollPadding,
          keyboardOffset > 0 && { paddingBottom: keyboardOffset + 90 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={['#4F46E5']}
            tintColor="#4F46E5"
          />
        }
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          const paddingToBottom = 160;
          if (
            layoutMeasurement.height + contentOffset.y >=
            contentSize.height - paddingToBottom
          ) {
            if (displayCount < normalTransactionsList.length) {
              updateDisplayCount(prev => Math.min(prev + PAGE_SIZE, normalTransactionsList.length));
            }
          }

          // 浮動捲動進度小藥丸計算
          const total = displayedTransactions.length;
          if (total > 3) {
            const scrollable = contentSize.height - layoutMeasurement.height;
            if (scrollable > 0) {
              const ratio = Math.max(0, Math.min(1, contentOffset.y / scrollable));
              const currentIndex = Math.min(total, Math.max(1, Math.round(ratio * (total - 1)) + 1));
              const currentItem = displayedTransactions[currentIndex - 1];
              const dateStr = currentItem?.transacted_at ? currentItem.transacted_at.split('T')[0].slice(5) : '';

              const pillText = dateStr
                ? `第 ${currentIndex} / ${total} 筆 · ${dateStr}`
                : `第 ${currentIndex} / ${total} 筆 (${Math.round(ratio * 100)}%)`;

              setScrollPillText(pillText);

              Animated.timing(scrollPillOpacity, {
                toValue: 1,
                duration: 150,
                useNativeDriver: true,
              }).start();

              if (scrollPillTimer.current) {
                clearTimeout(scrollPillTimer.current);
              }
              scrollPillTimer.current = setTimeout(() => {
                Animated.timing(scrollPillOpacity, {
                  toValue: 0,
                  duration: 350,
                  useNativeDriver: true,
                }).start();
              }, 1200);
            }
          }
        }}
        scrollEventThrottle={100}
      >
      {/* 定期備份提醒橫幅 */}
      {showBackupBanner && (
        <View style={styles.backupReminderBanner}>
          <View style={styles.backupReminderHeader}>
            <View style={styles.backupReminderTitleRow}>
              <Text style={styles.backupReminderIcon}>☁️</Text>
              <Text style={styles.backupReminderTitle}>
                {daysSinceLastBackup === null
                  ? '家庭帳本尚未備份至個人雲端'
                  : `定期備份提醒 (已間隔 ${daysSinceLastBackup} 天)`}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.backupReminderDismissBtn}
              onPress={() => setIsReminderDismissed(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.backupReminderDismissText}>✕ 稍後提醒</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.backupReminderDesc}>
            {daysSinceLastBackup === null
              ? `您目前已有 ${transactions.length} 筆明細，建議將資料存檔至 Google 雲端硬碟或個人電腦，確保家庭資料永久安全。`
              : `您設定每 ${autoBackupInterval} 天定期提醒備份，目前已達 ${daysSinceLastBackup} 天，建議花 3 秒存檔一份最新資料至雲端硬碟。`}
          </Text>

          <View style={styles.backupReminderActionRow}>
            <TouchableOpacity
              style={styles.backupReminderActionBtn}
              onPress={() => onOpenExportModal('json')}
              activeOpacity={0.8}
            >
              <Text style={styles.backupReminderActionBtnText}>
                🚀 立即備份至雲端硬碟
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 本月收支摘要卡片 (方案 1 支援一鍵收折，方案 3 內嵌淨值) */}
      <View
        style={[
          styles.summaryCard,
          isDark && {
            backgroundColor: '#1E293B',
            borderColor: '#334155',
            borderWidth: 1,
            shadowOpacity: 0.1,
          },
          !isSummaryExpanded && styles.summaryCardCollapsed,
        ]}
      >
        <View style={[styles.summaryHeader, !isSummaryExpanded && styles.summaryHeaderCollapsed]}>
          <TouchableOpacity
            style={styles.summaryTitleTouchArea}
            activeOpacity={0.7}
            onPress={() => setIsSummaryExpanded(prev => !prev)}
          >
            <Text
              style={styles.summaryTitle}
              numberOfLines={1}
              ellipsizeMode="tail"
              maxFontSizeMultiplier={1.2}
            >
              {summaryCardTitle}
            </Text>
          </TouchableOpacity>

          <View style={styles.summaryHeaderRight}>
            {filterMemberId !== 'all' && filterMemberId !== currentUser?.id && (
              <TouchableOpacity
                style={styles.summaryAllowanceBtn}
                onPress={() => onOpenModal('allowance', filterMemberId)}
                activeOpacity={0.7}
              >
                <Text style={styles.summaryAllowanceBtnText} maxFontSizeMultiplier={1.08}>
                  🎁 撥零用錢
                </Text>
              </TouchableOpacity>
            )}

            {/* 方案 1: 一鍵收折切換按鈕 */}
            <TouchableOpacity
              style={styles.summaryCollapseBtn}
              onPress={() => setIsSummaryExpanded(prev => !prev)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.summaryCollapseBtnText}>
                {isSummaryExpanded ? '收合 ▴' : '展開 ▾'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {!isSummaryExpanded ? (
          /* 緊湊單行摘要 (收折時) */
          <TouchableOpacity
            style={styles.summaryCollapsedBar}
            onPress={() => setIsSummaryExpanded(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.summaryCollapsedText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              結餘{' '}
              <Text
                style={[
                  styles.summaryCollapsedVal,
                  displaySummary.netBalance > 0
                    ? styles.incomeVal
                    : displaySummary.netBalance < 0
                    ? styles.expenseVal
                    : null,
                ]}
              >
                {displaySummary.netBalance > 0 ? '+' : ''}{isLargeFont ? '$' : 'NT$ '}{displaySummary.netBalance.toLocaleString()}
              </Text>
              {'  '}支 -{isLargeFont ? '$' : 'NT$ '}{displaySummary.effectiveExpense.toLocaleString()}
              {!isLargeFont && `  收 +NT$ ${displaySummary.effectiveIncome.toLocaleString()}`}
            </Text>
            <Text style={styles.summaryCollapsedHint} maxFontSizeMultiplier={1.08}>
              💎 {maskedNetWorth}
            </Text>
          </TouchableOpacity>
        ) : (
          /* 展開時完整內容 */
          <>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryCol}>
                <Text style={styles.summaryLabel} maxFontSizeMultiplier={1.2} numberOfLines={1}>
                  {displaySummary.isMemberFilter && displaySummary.personalTransferOut > 0 ? '總支出 (含轉出)' : '總支出'}
                </Text>
                <Text
                  style={[styles.summaryVal, isLargeFont && styles.summaryValLargeFont, styles.expenseVal]}
                  maxFontSizeMultiplier={1.15}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  -{isLargeFont ? '$' : 'NT$ '}{displaySummary.effectiveExpense.toLocaleString()}
                </Text>
              </View>

              <View style={[styles.summaryDivider, isLargeFont && { marginHorizontal: 4 }]} />

              <View style={styles.summaryCol}>
                <Text style={styles.summaryLabel} maxFontSizeMultiplier={1.2} numberOfLines={1}>
                  {displaySummary.isMemberFilter && displaySummary.personalTransferIn > 0
                    ? (displaySummary.totalIncome > 0 ? '總進帳 (含轉入)' : '轉入款項')
                    : '總收入'}
                </Text>
                <Text
                  style={[styles.summaryVal, isLargeFont && styles.summaryValLargeFont, styles.incomeVal]}
                  maxFontSizeMultiplier={1.15}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  +{isLargeFont ? '$' : 'NT$ '}{displaySummary.effectiveIncome.toLocaleString()}
                </Text>
              </View>

              <View style={[styles.summaryDivider, isLargeFont && { marginHorizontal: 4 }]} />

              <View style={styles.summaryCol}>
                <Text style={styles.summaryLabel} maxFontSizeMultiplier={1.2} numberOfLines={1}>
                  結餘
                </Text>
                <Text
                  style={[
                    styles.summaryVal,
                    isLargeFont && styles.summaryValLargeFont,
                    displaySummary.netBalance > 0
                      ? styles.incomeVal
                      : displaySummary.netBalance < 0
                      ? styles.expenseVal
                      : null,
                  ]}
                  maxFontSizeMultiplier={1.15}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {displaySummary.netBalance > 0 ? '+' : ''}{isLargeFont ? '$' : 'NT$ '}{displaySummary.netBalance.toLocaleString()}
                </Text>
              </View>
            </View>

            {/* 方案 3: 卡片內嵌轉出款項與淨值資產整併列 */}
            <View style={styles.summaryBottomInfoRow}>
              {displaySummary.isMemberFilter && (displaySummary.personalTransferIn > 0 || displaySummary.personalTransferOut > 0) ? (
                <View style={styles.summaryTransferHintCol}>
                  {displaySummary.personalTransferIn > 0 && (
                    <Text style={styles.summaryTransferHintText} maxFontSizeMultiplier={1.08}>
                      📥 轉入：+NT$ {displaySummary.personalTransferIn.toLocaleString()}
                    </Text>
                  )}
                  {displaySummary.personalTransferOut > 0 && (
                    <Text style={styles.summaryTransferHintText} maxFontSizeMultiplier={1.08}>
                      📤 轉出：-NT$ {displaySummary.personalTransferOut.toLocaleString()}
                    </Text>
                  )}
                </View>
              ) : (
                <View style={{ flex: 1 }} />
              )}

              {/* 💎 方案 3 內嵌淨值與展開資產按鈕 */}
              <TouchableOpacity
                style={styles.summaryNetWorthInlineBtn}
                onPress={() => setIsAssetSectionExpanded(prev => !prev)}
                activeOpacity={0.7}
              >
                <Text style={styles.summaryNetWorthInlineIcon}>💎</Text>
                <Text style={styles.summaryNetWorthInlineText} maxFontSizeMultiplier={1.08}>
                  {filterMemberId === 'all' ? '全家淨值' : '淨值'} {maskedNetWorth}
                </Text>
                {netWorthSummary.accounts.storedValues.length > 0 && (
                  <View style={styles.summaryNetWorthStoredBadge}>
                    <Text style={styles.summaryNetWorthStoredText}>
                      💳 {netWorthSummary.accounts.storedValues.length}
                    </Text>
                  </View>
                )}
                <Text style={styles.summaryNetWorthInlineArrow}>
                  {isAssetSectionExpanded ? '收合 ▴' : '展開 ▾'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* 內嵌預算迷你進度條 (方向 1 版面瘦身) */}
            {isBudgetWidgetVisibleOnDevice && (
              <View style={styles.summaryBudgetSection}>
                {!budgetProgress.isEnabled ? (
                  <TouchableOpacity
                    style={styles.summaryBudgetUnconfiguredRow}
                    onPress={() => onOpenBudgetManageModal('family')}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.summaryBudgetUnconfiguredText} maxFontSizeMultiplier={1.08}>
                      🎯 尚未設定每月預算 · 點擊立即開啟預算控管 ›
                    </Text>
                  </TouchableOpacity>
                ) : budgetProgress.isMemberPerspective && !budgetProgress.hasMemberBudgetConfigured ? (
                  <TouchableOpacity
                    style={styles.summaryBudgetUnconfiguredRow}
                    onPress={() => onOpenBudgetManageModal('members')}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.summaryBudgetUnconfiguredText} maxFontSizeMultiplier={1.08}>
                      👤 點此設定 {budgetProgress.targetMemberName || '該成員'} 的專屬預算額度 ›
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.summaryBudgetBarWrap}
                    onPress={() => onOpenBudgetManageModal(budgetProgress.isMemberPerspective ? 'members' : 'family')}
                    activeOpacity={0.75}
                  >
                    <View style={styles.summaryBudgetInfoRow}>
                      <Text style={styles.summaryBudgetLabel} numberOfLines={1} maxFontSizeMultiplier={1.08}>
                        {budgetProgress.isOverBudget
                          ? `🚨 預算超支 ${isPrivacyMaskActive ? '••••••' : `NT$ ${Math.abs(budgetProgress.remainingAmount).toLocaleString()}`}`
                          : `🎯 預算剩餘 ${isPrivacyMaskActive ? '••••••' : `NT$ ${budgetProgress.remainingAmount.toLocaleString()}`}`}
                      </Text>
                      <View style={styles.summaryBudgetRightWrap}>
                        <Text
                          style={[
                            styles.summaryBudgetPercent,
                            budgetProgress.isOverBudget && styles.summaryBudgetPercentOver,
                            budgetProgress.isWarning && styles.summaryBudgetPercentWarning,
                          ]}
                          maxFontSizeMultiplier={1.08}
                        >
                          {budgetProgress.spentRatio}%
                        </Text>
                        <Text style={styles.summaryBudgetArrow} maxFontSizeMultiplier={1.08}>›</Text>
                      </View>
                    </View>
                    <View style={styles.summaryBudgetTrack}>
                      <View
                        style={[
                          styles.summaryBudgetFill,
                          {
                            width: `${Math.min(100, Math.max(0, budgetProgress.spentRatio))}%`,
                            backgroundColor: budgetProgress.isOverBudget
                              ? '#EF4444'
                              : budgetProgress.isWarning
                              ? '#F59E0B'
                              : '#10B981',
                          },
                        ]}
                      />
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        )}
      </View>

      {/* 方案 3: 展開之資產明細 (僅於點擊展開時顯示) */}
      {isAssetSectionExpanded && (
        <View style={styles.expandedAssetContentStandalone}>
          <NetWorthWidget
            filterMemberId={filterMemberId}
            onOpenTransferModal={() => onOpenModal('transfer')}
            onOpenAccountsManageModal={() => onOpenAccountsManageModal(filterMemberId && filterMemberId === currentUser?.id ? 'my' : 'all')}
          />
          <StoredValueWidget
            filterMemberId={filterMemberId}
            onOpenCreditCardReconcile={() => onOpenReconcileModal('credit_card')}
            onOpenReconcile={(card) => onOpenReconcileModal('stored_value', card?.id)}
          />
        </View>
      )}

      {/* 智慧雙提醒列：有待繳帳單或近期待辦／進行中協作才顯示，雙邊有事並排、單邊有事撐滿、清空自動隱藏 */}
      {(headerNoticeInfo.hasPendingBills || headerNoticeInfo.hasMemoNotice) && (
        <View style={styles.compactNoticeRow}>
          {headerNoticeInfo.hasPendingBills && (
            <TouchableOpacity
              style={[
                styles.compactNoticeChip,
                styles.compactNoticeBillChip,
                isDark && styles.compactNoticeBillChipDark,
              ]}
              activeOpacity={0.8}
              onPress={() => {
                if (filterMemberId === 'all') {
                  onOpenRecurringModal('all', undefined, 'pending');
                } else if (headerNoticeInfo.isMe) {
                  onOpenRecurringModal('my', undefined, 'pending');
                } else {
                  onOpenRecurringModal('all', filterMemberId, 'pending');
                }
              }}
            >
              <Text style={styles.compactNoticeChipIcon}>🗓️</Text>
              <Text
                style={[
                  styles.compactNoticeChipText,
                  styles.compactNoticeBillText,
                  isDark && styles.compactNoticeBillTextDark,
                ]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.08}
              >
                {headerNoticeInfo.billTitle}
              </Text>
              <Text
                style={[
                  styles.compactNoticeChipArrow,
                  styles.compactNoticeBillText,
                  isDark && styles.compactNoticeBillTextDark,
                ]}
                maxFontSizeMultiplier={1.08}
              >
                ›
              </Text>
            </TouchableOpacity>
          )}

          {headerNoticeInfo.hasMemoNotice && (
            <TouchableOpacity
              style={[
                styles.compactNoticeChip,
                headerNoticeInfo.isUrgentMemo ? styles.compactNoticeMemoChip : styles.compactNoticeUpcomingChip,
                isDark && (headerNoticeInfo.isUrgentMemo ? styles.compactNoticeMemoChipDark : styles.compactNoticeUpcomingChipDark),
              ]}
              activeOpacity={0.8}
              onPress={onOpenMemoTodoModal}
            >
              <Text style={styles.compactNoticeChipIcon}>
                {headerNoticeInfo.chipIcon}
              </Text>
              <Text
                style={[
                  styles.compactNoticeChipText,
                  headerNoticeInfo.isUrgentMemo ? styles.compactNoticeMemoText : styles.compactNoticeUpcomingText,
                  isDark && (headerNoticeInfo.isUrgentMemo ? styles.compactNoticeMemoTextDark : styles.compactNoticeUpcomingTextDark),
                ]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.08}
              >
                {headerNoticeInfo.memoTitle}
              </Text>
              <Text
                style={[
                  styles.compactNoticeChipArrow,
                  headerNoticeInfo.isUrgentMemo ? styles.compactNoticeMemoText : styles.compactNoticeUpcomingText,
                  isDark && (headerNoticeInfo.isUrgentMemo ? styles.compactNoticeMemoTextDark : styles.compactNoticeUpcomingTextDark),
                ]}
                maxFontSizeMultiplier={1.08}
              >
                ›
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* 🔍 店家 / 關鍵字即時搜尋列 + 📋 待辦常駐入口 + 🧾 發票對獎 */}
      <View
        style={styles.searchBarContainer}
        onLayout={(e) => {
          searchBarYRef.current = e.nativeEvent.layout.y;
        }}
      >
        <View style={[styles.searchBarInner, isDark && { backgroundColor: colors.background.input, borderColor: colors.border.default }]}>
          <Text style={styles.searchBarIcon}>🔍</Text>
          <TextInput
            style={[styles.searchBarInput, isDark && { color: colors.text.primary }]}
            placeholder="搜尋店家、備註..."
            placeholderTextColor={isDark ? colors.text.muted : '#9CA3AF'}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            onSubmitEditing={Keyboard.dismiss}
            onFocus={() => {
              setIsSearchFocused(true);
              if (Platform.OS !== 'web') {
                setTimeout(() => {
                  activeScrollRef.current?.scrollTo({
                    y: Math.max(0, searchBarYRef.current - 12),
                    animated: true,
                  });
                }, 120);
              }
            }}
            onBlur={() => {
              setIsSearchFocused(false);
            }}
          />
          {!!searchQuery && (
            <TouchableOpacity
              style={styles.searchClearBtn}
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.searchClearText}>✕</Text>
            </TouchableOpacity>
          )}
          {keyboardOffset > 0 && Platform.OS !== 'web' && (
            <TouchableOpacity
              style={styles.searchDismissBtn}
              onPress={Keyboard.dismiss}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.dismissKeyboardText} maxFontSizeMultiplier={1.08}>收鍵盤▾</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 📋 生活待辦常駐入口 (解法 1：確保待辦總覽永遠有固定可見入口) */}
        {(() => {
          const isMemoHighlight = headerNoticeInfo.hasInteractiveOrder || headerNoticeInfo.urgentTodoCount > 0;
          const memoBtnLabel = headerNoticeInfo.urgentTodoCount > 0
            ? `${headerNoticeInfo.urgentTodoCount}`
            : headerNoticeInfo.hasInteractiveOrder
            ? '開團'
            : '待辦';
          return (
            <TouchableOpacity
              activeOpacity={0.7}
              style={[
                styles.memoShortcutBtn,
                isDark && {
                  backgroundColor: colors.background.card,
                  borderColor: colors.border.default,
                },
                isMemoHighlight && {
                  borderColor: isDark ? 'rgba(245, 158, 11, 0.55)' : '#F59E0B',
                  backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
                },
              ]}
              onPress={onOpenMemoTodoModal}
            >
              <Text style={styles.invoiceMenuBtnIcon}>📋</Text>
              <Text
                style={[
                  styles.invoiceMenuBtnText,
                  isDark && { color: colors.text.primary },
                  isMemoHighlight && {
                    color: isDark ? '#FCD34D' : '#B45309',
                    fontWeight: '700',
                  },
                ]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.08}
              >
                {memoBtnLabel}
              </Text>
            </TouchableOpacity>
          );
        })()}

        {/* 🧾 發票工具按鈕 (點擊直達統一發票對獎中心，有中獎時高亮變身 🎉 中獎) */}
        <TouchableOpacity
          activeOpacity={0.7}
          style={[
            styles.invoiceMenuBtn,
            isDark && {
              backgroundColor: colors.background.card,
              borderColor: colors.border.default,
            },
            invoiceLotteryStats.wonCount > 0 && {
              borderColor: '#F59E0B',
              backgroundColor: isDark ? 'rgba(245, 158, 11, 0.22)' : '#FEF3C7',
            },
          ]}
          onPress={onOpenInvoiceLotteryModal}
        >
          <Text style={styles.invoiceMenuBtnIcon}>
            {invoiceLotteryStats.wonCount > 0 ? '🎉' : '🧾'}
          </Text>
          <Text
            style={[
              styles.invoiceMenuBtnText,
              isDark && { color: colors.text.primary },
              invoiceLotteryStats.wonCount > 0 && {
                color: isDark ? '#FBBF24' : '#B45309',
                fontWeight: '700',
              },
            ]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.08}
          >
            {invoiceLotteryStats.wonCount > 0
              ? `中獎 (${invoiceLotteryStats.wonCount})`
              : '發票'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 🏷️ 店家 1 鍵快速篩選膠囊橫向列 (方案 2: 點擊搜尋框輸入或有搜尋字時才展開，平時不佔空間) */}
      {activeMerchantsInLedger.length > 0 && (isSearchFocused || !!searchQuery.trim()) && (
        <HorizontalScrollView
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.merchantFilterScroll}
          keyboardShouldPersistTaps="handled"
        >
          {activeMerchantsInLedger.map((mName) => {
            const isSelected = searchQuery.trim().toLowerCase() === mName.toLowerCase();
            return (
              <TouchableOpacity
                key={mName}
                style={[
                  styles.merchantFilterChip,
                  isSelected && styles.merchantFilterChipActive,
                  isDark && {
                    backgroundColor: colors.background.card,
                    borderColor: colors.border.default,
                  },
                  isDark && isSelected && {
                    backgroundColor: 'rgba(99, 102, 241, 0.25)',
                    borderColor: '#818CF8',
                  },
                ]}
                onPress={() => setSearchQuery(isSelected ? '' : mName)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.merchantFilterChipText,
                    isSelected && styles.merchantFilterChipTextActive,
                    isDark && { color: colors.text.secondary },
                    isDark && isSelected && { color: '#C7D2FE' },
                  ]}
                  maxFontSizeMultiplier={1.08}
                >
                  {isSelected ? `✓ ${mName}` : mName}
                </Text>
              </TouchableOpacity>
            );
          })}
        </HorizontalScrollView>
      )}

      {/* 🔍 選項 B：搜尋即時統計橫條 */}
      {!!searchQuery.trim() && (
        <View style={[styles.searchStatsBar, isDark && styles.searchStatsBarDark]}>
          <Text
            style={[styles.searchStatsText, isDark && styles.searchStatsTextDark]}
            numberOfLines={2}
            maxFontSizeMultiplier={1.1}
          >
            🔍「{searchQuery.trim()}」共 {filteredTransactions.length} 筆
            {displaySummary.effectiveExpense > 0
              ? ` · 支 -NT$ ${displaySummary.effectiveExpense.toLocaleString()}`
              : ''}
            {displaySummary.effectiveIncome > 0
              ? ` · 收 +NT$ ${displaySummary.effectiveIncome.toLocaleString()}`
              : ''}
          </Text>
          {filterMonth !== 'all' && (
            <TouchableOpacity
              style={[styles.searchStatsAllMonthBtn, isDark && styles.searchStatsAllMonthBtnDark]}
              onPress={() => setFilterMonth('all')}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.searchStatsAllMonthText, isDark && styles.searchStatsAllMonthTextDark]}
                maxFontSizeMultiplier={1.08}
              >
                查全部月份
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* 篩選工具列：單月前後箭頭快切 + 成員選擇 + 一鍵切全家/我 + 清除篩選 */}
      <HorizontalScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterToolbarScroll}
        style={styles.filterToolbarWrapper}
        keyboardShouldPersistTaps="handled"
      >
        {isSingleMonthFilter ? (
          <View
            style={[
              styles.monthStepperGroup,
              filterMonth !== currentMonthYm && styles.filterChipActive,
              isDark && {
                backgroundColor: colors.background.card,
                borderColor: colors.border.default,
              },
              isDark && filterMonth !== currentMonthYm && {
                backgroundColor: 'rgba(99, 102, 241, 0.25)',
                borderColor: '#818CF8',
              },
            ]}
          >
            <TouchableOpacity
              style={styles.monthStepperArrowBtn}
              onPress={() => setFilterMonth(shiftYm(filterMonth, -1))}
              activeOpacity={0.6}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 2 }}
            >
              <Text
                style={[
                  styles.monthStepperArrowText,
                  filterMonth !== currentMonthYm && styles.filterChipTextActive,
                  isDark && { color: colors.text.secondary },
                  isDark && filterMonth !== currentMonthYm && { color: '#C7D2FE' },
                ]}
                maxFontSizeMultiplier={1.08}
              >
                ◀
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.monthStepperCenterBtn}
              onPress={() => onOpenFilterModal('month')}
              activeOpacity={0.7}
            >
              <Text style={styles.filterChipIcon}>📅</Text>
              <Text
                style={[
                  styles.filterChipText,
                  filterMonth !== currentMonthYm && styles.filterChipTextActive,
                  isDark && { color: colors.text.secondary },
                  isDark && filterMonth !== currentMonthYm && { color: '#C7D2FE' },
                ]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.1}
              >
                {filterMonth === currentMonthYm
                  ? `本月 (${parseInt(currentMonthYm.split('-')[1], 10)}月)`
                  : (selectedMonthObj?.label || filterMonth)}
              </Text>
              <Text
                style={[
                  styles.filterChipArrow,
                  filterMonth !== currentMonthYm && styles.filterChipArrowActive,
                  isDark && { color: colors.text.muted },
                  isDark && filterMonth !== currentMonthYm && { color: '#818CF8' },
                ]}
              >
                ▾
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.monthStepperArrowBtn, !canGoNextMonth && styles.monthStepperArrowDisabled]}
              disabled={!canGoNextMonth}
              onPress={() => setFilterMonth(shiftYm(filterMonth, 1))}
              activeOpacity={0.6}
              hitSlop={{ top: 6, bottom: 6, left: 2, right: 6 }}
            >
              <Text
                style={[
                  styles.monthStepperArrowText,
                  filterMonth !== currentMonthYm && styles.filterChipTextActive,
                  isDark && { color: colors.text.secondary },
                  isDark && filterMonth !== currentMonthYm && { color: '#C7D2FE' },
                ]}
                maxFontSizeMultiplier={1.08}
              >
                ▶
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            activeOpacity={0.7}
            style={[
              styles.filterChip,
              filterMonth !== currentMonthYm && styles.filterChipActive,
              isDark && {
                backgroundColor: colors.background.card,
                borderColor: colors.border.default,
              },
              isDark && filterMonth !== currentMonthYm && {
                backgroundColor: 'rgba(99, 102, 241, 0.25)',
                borderColor: '#818CF8',
              },
            ]}
            onPress={() => onOpenFilterModal('month')}
          >
            <Text style={styles.filterChipIcon}>
              {/^\d{4}$/.test(filterMonth) ? '🗓️' : '🌐'}
            </Text>
            <Text
              style={[
                styles.filterChipText,
                filterMonth !== currentMonthYm && styles.filterChipTextActive,
                isDark && { color: colors.text.secondary },
                isDark && filterMonth !== currentMonthYm && { color: '#C7D2FE' },
              ]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.1}
            >
              {filterMonth === 'all'
                ? '全部月份'
                : (parseInt(filterMonth, 10) === currentYearNum ? `今年 (${filterMonth} 全年)` : `${filterMonth} 全年`)}
            </Text>
            <Text
              style={[
                styles.filterChipArrow,
                filterMonth !== currentMonthYm && styles.filterChipArrowActive,
                isDark && { color: colors.text.muted },
                isDark && filterMonth !== currentMonthYm && { color: '#818CF8' },
              ]}
            >
              ▾
            </Text>
          </TouchableOpacity>
        )}

        {/* 成員篩選 */}
        <TouchableOpacity
          activeOpacity={0.7}
          style={[
            styles.filterChip,
            filterMemberId !== defaultMemberId && styles.filterChipActive,
            isDark && {
              backgroundColor: colors.background.card,
              borderColor: colors.border.default,
            },
            isDark && filterMemberId !== defaultMemberId && {
              backgroundColor: 'rgba(99, 102, 241, 0.25)',
              borderColor: '#818CF8',
            },
          ]}
          onPress={() => onOpenFilterModal('member')}
        >
          <Text style={styles.filterChipIcon}>
            {filterMemberId === 'all'
              ? '👨‍👩‍👧'
              : (selectedMember?.avatar_url || currentUser?.avatar_url || '👤')}
          </Text>
          <Text
            style={[
              styles.filterChipText,
              filterMemberId !== defaultMemberId && styles.filterChipTextActive,
              isDark && { color: colors.text.secondary },
              isDark && filterMemberId !== defaultMemberId && { color: '#C7D2FE' },
            ]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.1}
          >
            {filterMemberId === 'all'
              ? '全部成員'
              : filterMemberId === currentUser?.id
              ? (() => {
                  const name = currentUser?.display_name || '我';
                  return /\(我\)|\(本人\)/.test(name) ? name : `${name} (我)`;
                })()
              : (selectedMember?.display_name || '指定成員')}
          </Text>
          <Text style={[styles.filterChipArrow, filterMemberId !== defaultMemberId && styles.filterChipArrowActive, isDark && { color: colors.text.muted }, isDark && filterMemberId !== defaultMemberId && { color: '#818CF8' }]}>▾</Text>
        </TouchableOpacity>

        {/* 一鍵快切：看全家 / 只看我 */}
        {members.length > 1 && !!currentUser?.id && (
          <TouchableOpacity
            activeOpacity={0.7}
            style={[
              styles.filterQuickToggleChip,
              isDark && {
                backgroundColor: colors.background.card,
                borderColor: colors.border.default,
              },
            ]}
            onPress={() => setFilterMemberId(filterMemberId === 'all' ? currentUser.id : 'all')}
          >
            <Text
              style={[styles.filterQuickToggleText, isDark && { color: colors.text.secondary }]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.08}
            >
              {filterMemberId === 'all' ? '👤 只看我' : '👨‍👩‍👧 看全家'}
            </Text>
          </TouchableOpacity>
        )}

        {isFiltered && (
          <TouchableOpacity
            activeOpacity={0.7}
            style={[
              styles.filterResetChip,
              isDark && {
                backgroundColor: 'rgba(99, 102, 241, 0.2)',
                borderColor: 'rgba(99, 102, 241, 0.4)',
              },
            ]}
            onPress={resetFilters}
          >
            <Text style={[styles.filterResetText, isDark && { color: '#A5B4FC' }]} maxFontSizeMultiplier={1.08}>清除篩選 ↺</Text>
          </TouchableOpacity>
        )}
      </HorizontalScrollView>

      {/* 明細筆數與三態分類切換同列並排（緊貼清單上方，連動一目了然且防大字體爆版） */}
      <View style={styles.sectionHeaderInlineRow}>
        <View style={styles.sectionHeaderTitleWrap}>
          <Text
            style={[styles.sectionInlineTitle, isDark && { color: colors.text.primary }]}
            numberOfLines={1}
            ellipsizeMode="tail"
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            maxFontSizeMultiplier={1.12}
          >
            {transactionTypeFilter === 'memo' ? '記事' : transactionTypeFilter === 'financial' ? '收支' : '明細'}{' '}
            {historySyncProgress
              ? `${Math.max(historySyncProgress.loaded, transactions.length).toLocaleString()}/${historySyncProgress.total.toLocaleString()}`
              : filteredTransactions.length < transactions.length
              ? `${filteredTransactions.length.toLocaleString()}/${transactions.length.toLocaleString()}`
              : `${transactions.length.toLocaleString()}`}
          </Text>
        </View>

        {/* 緊湊三態切換膠囊 */}
        <View style={[styles.typeFilterInlineContainer, isDark && { backgroundColor: colors.background.cardSubtle }]}>
          <TouchableOpacity
            style={[
              styles.typeFilterInlineTab,
              transactionTypeFilter === 'all' && styles.typeFilterInlineTabActiveAll,
              isDark && transactionTypeFilter === 'all' && {
                backgroundColor: colors.background.card,
                borderColor: colors.border.strong,
              },
            ]}
            onPress={() => setTransactionTypeFilter('all')}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.typeFilterInlineTabText,
                transactionTypeFilter === 'all' && styles.typeFilterInlineTabTextActiveAll,
                isDark && { color: colors.text.secondary },
                isDark && transactionTypeFilter === 'all' && { color: '#A5B4FC' },
              ]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.06}
            >
              全部 {typeCountStats.all}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.typeFilterInlineTab,
              transactionTypeFilter === 'financial' && styles.typeFilterInlineTabActiveFinancial,
              isDark && transactionTypeFilter === 'financial' && {
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                borderColor: 'rgba(59, 130, 246, 0.45)',
              },
            ]}
            onPress={() => setTransactionTypeFilter('financial')}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.typeFilterInlineTabText,
                transactionTypeFilter === 'financial' && styles.typeFilterInlineTabTextActiveFinancial,
                isDark && { color: colors.text.secondary },
                isDark && transactionTypeFilter === 'financial' && { color: '#93C5FD' },
              ]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.06}
            >
              💳 收支 {typeCountStats.financial}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.typeFilterInlineTab,
              transactionTypeFilter === 'memo' && styles.typeFilterInlineTabActiveMemo,
              isDark && transactionTypeFilter === 'memo' && {
                backgroundColor: 'rgba(245, 158, 11, 0.2)',
                borderColor: 'rgba(245, 158, 11, 0.45)',
              },
            ]}
            onPress={() => setTransactionTypeFilter('memo')}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.typeFilterInlineTabText,
                transactionTypeFilter === 'memo' && styles.typeFilterInlineTabTextActiveMemo,
                isDark && { color: colors.text.secondary },
                isDark && transactionTypeFilter === 'memo' && { color: '#FCD34D' },
              ]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.06}
            >
              📝 記事 {typeCountStats.memo}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 交易清單 */}
      {transactions.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyIcon}>🧾</Text>
          <Text style={[styles.emptyText, isDark && { color: colors.text.secondary }]}>目前還沒有記帳紀錄</Text>
          <Text style={[styles.emptySubtext, isDark && { color: colors.text.muted }]}>點擊右下角「+」開始記錄家庭第一筆花費</Text>
        </View>
      ) : filteredTransactions.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyIcon}>
            {transactionTypeFilter === 'memo' ? '📝' : transactionTypeFilter === 'financial' ? '💳' : '🔍'}
          </Text>
          <Text style={[styles.emptyText, isDark && { color: colors.text.secondary }]}>
            {transactionTypeFilter === 'memo' && !searchQuery.trim()
              ? '目前沒有生活備忘或待辦記事'
              : transactionTypeFilter === 'financial' && !searchQuery.trim()
              ? '目前沒有日常收支消費紀錄'
              : searchQuery.trim()
              ? `查無「${searchQuery.trim()}」的相關紀錄`
              : '沒有符合篩選條件的明細'}
          </Text>
          <Text style={[styles.emptySubtext, isDark && { color: colors.text.muted }]}>
            {transactionTypeFilter === 'memo' && !searchQuery.trim()
              ? '點擊右下角「+」並切換至「記事」隨手記錄家庭大小事'
              : transactionTypeFilter === 'financial' && !searchQuery.trim()
              ? '點擊右下角「+」記錄第一筆家庭收支開銷'
              : searchQuery.trim() && filterMonth !== 'all'
              ? '目前僅搜尋指定月份，您可以點擊下方按鈕改查「全部月份」'
              : '請嘗試更換店家關鍵字或重設篩選'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            {searchQuery.trim() && filterMonth !== 'all' && (
              <TouchableOpacity
                style={[
                  styles.filterEmptyResetBtn,
                  {
                    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.18)' : '#EEF2FF',
                    borderColor: isDark ? '#818CF8' : '#6366F1',
                  },
                ]}
                onPress={() => setFilterMonth('all')}
              >
                <Text style={[styles.filterEmptyResetText, { color: isDark ? '#A5B4FC' : '#4F46E5' }]}>🗓️ 改查全部月份</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.filterEmptyResetBtn} onPress={resetFilters}>
              <Text style={styles.filterEmptyResetText}>重設所有篩選</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          {/* ⚡ 進行中之五大協作活動看板 (全家最高優先級，天然常駐首頁最上方，不佔用靜態置頂名額) */}
          {collabActivitiesList.length > 0 && (
            <>
              <View style={styles.listSectionHeader}>
                <Text style={[styles.listSectionHeaderText, isDark && { color: '#FCD34D' }]} maxFontSizeMultiplier={1.1}>
                  ⚡ 進行中協作 ({collabActivitiesList.length})
                </Text>
              </View>
              {collabActivitiesList.map(item => (
                <TransactionItem
                  key={item.id}
                  transaction={item}
                  viewingMemberId={filterMemberId}
                  isLastViewed={item.id === lastViewedTxId}
                  hideDateInCard={false}
                  precomputedLinkedTargets={linkedTargetsByMemoId.get(item.id) ?? []}
                  onPress={tx => {
                    setLastViewedTxId(tx.id);
                    onOpenEditTransaction(tx);
                  }}
                  onCompleteMemo={tx => {
                    setLastViewedTxId(tx.id);
                    onOpenMemoCompletion(tx);
                  }}
                  onTogglePinMemo={handleTogglePinMemo}
                  onViewImage={(url, title) => onViewImage(url, title || '消費收據 / 保固憑證')}
                />
              ))}
            </>
          )}

          {/* 📌 常態置頂生活記事卡片清單 (慢箋藥單、日常備忘，享有獨立 5 筆全家配額，預設展開最新 2 筆) */}
          {visiblePinnedMemos.length > 0 && (
            <>
              <View style={styles.listSectionHeader}>
                <Text style={[styles.listSectionHeaderText, isDark && { color: '#FCD34D' }]} maxFontSizeMultiplier={1.1}>
                  📌 置頂記事 ({pinnedMemosList.length})
                </Text>
              </View>
              {visiblePinnedMemos.map(item => (
                <TransactionItem
                  key={item.id}
                  transaction={item}
                  viewingMemberId={filterMemberId}
                  isLastViewed={item.id === lastViewedTxId}
                  hideDateInCard={false}
                  precomputedLinkedTargets={linkedTargetsByMemoId.get(item.id) ?? []}
                  onPress={tx => {
                    setLastViewedTxId(tx.id);
                    onOpenEditTransaction(tx);
                  }}
                  onCompleteMemo={tx => {
                    setLastViewedTxId(tx.id);
                    onOpenMemoCompletion(tx);
                  }}
                  onTogglePinMemo={handleTogglePinMemo}
                  onViewImage={(url, title) => onViewImage(url, title || '消費收據 / 保固憑證')}
                />
              ))}

              {/* 首頁防霸屏折疊按鈕：超過 2 筆置頂時提供展開 / 收合控制 */}
              {pinnedMemosList.length > 2 && (
                <TouchableOpacity
                  style={[styles.pinnedCollapseBtn, isDark && styles.pinnedCollapseBtnDark]}
                  onPress={() => setIsPinnedExpanded(prev => !prev)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.pinnedCollapseText, isDark && styles.pinnedCollapseTextDark]}>
                    {isPinnedExpanded
                      ? '▴ 收合其餘置頂事項'
                      : `📌 其餘 ${pinnedMemosList.length - 2} 筆置頂事項 (展開 ▾)`}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* 按日分組之常規交易與日常生活記事清單 */}
          {groupedNormalTransactions.map((group) => (
            <View key={group.ymd} style={styles.dayGroupBlock}>
              <View style={[styles.dayGroupHeader, isDark && styles.dayGroupHeaderDark]}>
                <Text
                  style={[styles.dayGroupTitle, isDark && styles.dayGroupTitleDark]}
                  maxFontSizeMultiplier={1.12}
                >
                  {group.label}
                </Text>
                {(group.expense > 0 || group.income > 0) && (
                  <View style={styles.dayGroupSummaryWrap}>
                    {group.expense > 0 && (
                      <Text
                        style={[styles.dayGroupExpenseText, isDark && styles.dayGroupExpenseTextDark]}
                        maxFontSizeMultiplier={1.08}
                      >
                        支 -NT$ {group.expense.toLocaleString()}
                      </Text>
                    )}
                    {group.income > 0 && (
                      <Text
                        style={[styles.dayGroupIncomeText, isDark && styles.dayGroupIncomeTextDark]}
                        maxFontSizeMultiplier={1.08}
                      >
                        收 +NT$ {group.income.toLocaleString()}
                      </Text>
                    )}
                  </View>
                )}
              </View>

              {group.items.map(item => (
                <TransactionItem
                  key={item.id}
                  transaction={item}
                  viewingMemberId={filterMemberId}
                  isLastViewed={item.id === lastViewedTxId}
                  hideDateInCard={item.type !== 'memo'}
                  precomputedLinkedMemo={item.type !== 'memo' ? (linkedMemoByTxId.get(item.id) ?? null) : undefined}
                  precomputedLinkedTargets={item.type === 'memo' ? (linkedTargetsByMemoId.get(item.id) ?? []) : undefined}
                  onPress={tx => {
                    setLastViewedTxId(tx.id);
                    onOpenEditTransaction(tx);
                  }}
                  onCompleteMemo={tx => {
                    setLastViewedTxId(tx.id);
                    onOpenMemoCompletion(tx);
                  }}
                  onTogglePinMemo={handleTogglePinMemo}
                  onViewImage={(url, title) => onViewImage(url, title || '消費收據 / 保固憑證')}
                />
              ))}
            </View>
          ))}

          {/* 分批動態載入控制列 */}
          {normalTransactionsList.length > displayCount && (
            <View style={styles.loadMoreContainer}>
              <TouchableOpacity
                style={styles.loadMoreBtn}
                onPress={() => updateDisplayCount(prev => Math.min(prev + PAGE_SIZE, normalTransactionsList.length))}
                activeOpacity={0.7}
              >
                <Text style={styles.loadMoreBtnText}>
                  載入更多明細 (+{Math.min(PAGE_SIZE, normalTransactionsList.length - displayCount)} 筆) ▾
                </Text>
                <Text style={styles.loadMoreSubtext}>
                  已顯示 {displayedTransactions.length} / {filteredTransactions.length} 筆
                </Text>
              </TouchableOpacity>

              {normalTransactionsList.length - displayCount > PAGE_SIZE && (
                <TouchableOpacity
                  style={styles.loadAllBtn}
                  onPress={() => updateDisplayCount(normalTransactionsList.length)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.loadAllBtnText}>直接全部展開 ({filteredTransactions.length} 筆)</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {filteredTransactions.length > PAGE_SIZE && displayedTransactions.length >= filteredTransactions.length && (
            <View style={styles.listEndIndicator}>
              <Text style={styles.listEndText}>✨ 已顯示全部 {filteredTransactions.length} 筆明細</Text>
            </View>
          )}
        </>
      )}
    </ScrollView>

    {/* 浮動捲動進度小藥丸 (滾動時浮現、停留 1.2 秒自動平滑淡出) */}
    {!!scrollPillText && (
      <Animated.View
        pointerEvents="none"
        style={[
          styles.scrollProgressPill,
          { opacity: scrollPillOpacity },
        ]}
      >
        <Text style={styles.scrollProgressPillText} maxFontSizeMultiplier={1.08}>
          📍 {scrollPillText}
        </Text>
      </Animated.View>
    )}

  </View>
  );
};

const getStyles = (isDark: boolean, colors: ThemeColors) =>
  StyleSheet.create({
    screenContainer: {
      flex: 1,
    },
    scrollProgressPill: {
      position: 'absolute',
      bottom: 25,
      alignSelf: 'center',
      backgroundColor: isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(30, 41, 59, 0.9)',
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(99, 102, 241, 0.4)' : 'rgba(255, 255, 255, 0.3)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 6,
      zIndex: 999,
    },
    scrollProgressPillText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
      letterSpacing: 0.3,
    },
    scrollPadding: {
      padding: 16,
      paddingBottom: 90,
    },
    backupReminderBanner: {
      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7',
      borderRadius: 16,
      padding: 14,
      marginBottom: 16,
      borderWidth: 1.5,
      borderColor: '#F59E0B',
      shadowColor: '#F59E0B',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
      elevation: 2,
    },
    backupReminderHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    backupReminderTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: 8,
    },
    backupReminderIcon: {
      fontSize: 18,
      marginRight: 6,
    },
    backupReminderTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: isDark ? '#FBBF24' : '#92400E',
    },
    backupReminderDismissBtn: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: 'rgba(217, 119, 6, 0.15)',
    },
    backupReminderDismissText: {
      fontSize: 11,
      fontWeight: '600',
      color: isDark ? '#FBBF24' : '#B45309',
    },
    backupReminderDesc: {
      fontSize: 12,
      color: isDark ? '#FBBF24' : '#78350F',
      lineHeight: 18,
      marginBottom: 10,
      fontWeight: '500',
    },
    backupReminderActionRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    backupReminderActionBtn: {
      backgroundColor: '#D97706',
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backupReminderActionBtnText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
    summaryCard: {
      backgroundColor: '#4F46E5',
      borderRadius: 18,
      padding: 14,
      marginBottom: 8,
      shadowColor: '#4F46E5',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.25,
      shadowRadius: 10,
      elevation: 6,
    },
    summaryCardCollapsed: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      marginBottom: 8,
    },
    summaryHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    summaryHeaderCollapsed: {
      marginBottom: 4,
    },
    summaryTitleTouchArea: {
      flex: 1,
      marginRight: 8,
    },
    summaryHeaderRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    summaryCollapseBtn: {
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    summaryCollapseBtnText: {
      fontSize: 11,
      color: '#FFFFFF',
      fontWeight: '700',
    },
    summaryCollapsedBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 2,
    },
    summaryCollapsedText: {
      fontSize: 12,
      color: '#E0E7FF',
      fontWeight: '600',
      flex: 1,
      minWidth: 0,
    },
    summaryCollapsedVal: {
      fontSize: 13,
      fontWeight: '800',
    },
    summaryCollapsedHint: {
      fontSize: 11,
      color: '#C7D2FE',
      fontWeight: '600',
      flexShrink: 0,
      marginLeft: 6,
    },
    summaryTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: '#E0E7FF',
    },
    summaryAllowanceBtn: {
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
    },
    summaryAllowanceBtnText: {
      fontSize: 12,
      color: '#FFFFFF',
      fontWeight: '700',
    },
    summaryGrid: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    summaryCol: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
    },
    summaryDivider: {
      width: 1,
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      marginHorizontal: 8,
    },
    summaryLabel: {
      fontSize: 12,
      color: '#C7D2FE',
      marginBottom: 4,
    },
    summaryVal: {
      fontSize: 16,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    summaryValLargeFont: {
      fontSize: 14,
    },
    expenseVal: {
      color: '#FCA5A5',
    },
    incomeVal: {
      color: '#6EE7B7',
    },
    summaryBottomInfoRow: {
      marginTop: 9,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: 'rgba(255, 255, 255, 0.15)',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    summaryTransferHintCol: {
      flex: 1,
      gap: 2,
      marginRight: 8,
    },
    summaryTransferHintText: {
      fontSize: 11,
      color: '#E0E7FF',
      fontWeight: '600',
    },
    summaryNetWorthInlineBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.16)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 10,
      gap: 4,
    },
    summaryNetWorthInlineIcon: {
      fontSize: 12,
    },
    summaryNetWorthInlineText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    summaryNetWorthStoredBadge: {
      backgroundColor: 'rgba(255, 255, 255, 0.22)',
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 6,
    },
    summaryNetWorthStoredText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    summaryNetWorthInlineArrow: {
      fontSize: 10,
      fontWeight: '700',
      color: '#C7D2FE',
    },
    expandedAssetContentStandalone: {
      marginBottom: 10,
      gap: 8,
    },
    summaryBudgetSection: {
      marginTop: 9,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: 'rgba(255, 255, 255, 0.15)',
    },
    summaryBudgetUnconfiguredRow: {
      paddingVertical: 2,
      alignItems: 'center',
    },
    summaryBudgetUnconfiguredText: {
      fontSize: 12,
      color: '#E0E7FF',
      fontWeight: '600',
    },
    summaryBudgetBarWrap: {
      gap: 6,
    },
    summaryBudgetInfoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    summaryBudgetLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: '#E0E7FF',
      flex: 1,
      marginRight: 8,
    },
    summaryBudgetRightWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    summaryBudgetPercent: {
      fontSize: 12,
      fontWeight: '700',
      color: '#A7F3D0',
    },
    summaryBudgetPercentOver: {
      color: '#FCA5A5',
    },
    summaryBudgetPercentWarning: {
      color: '#FDE68A',
    },
    summaryBudgetArrow: {
      fontSize: 13,
      color: '#C7D2FE',
      fontWeight: '700',
    },
    summaryBudgetTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: 'rgba(255, 255, 255, 0.22)',
      overflow: 'hidden',
    },
    summaryBudgetFill: {
      height: '100%',
      borderRadius: 3,
    },
    compactNoticeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 10,
    },
    compactNoticeChip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 12,
      borderWidth: 1,
    },
    compactNoticeChipIcon: {
      fontSize: 13,
      marginRight: 5,
    },
    compactNoticeChipText: {
      fontSize: 12,
      fontWeight: '600',
      flex: 1,
    },
    compactNoticeChipArrow: {
      fontSize: 13,
      fontWeight: '700',
      marginLeft: 4,
    },
    compactNoticeBillChip: {
      backgroundColor: '#FEF2F2',
      borderColor: '#FECACA',
    },
    compactNoticeBillChipDark: {
      backgroundColor: 'rgba(239, 68, 68, 0.15)',
      borderColor: 'rgba(239, 68, 68, 0.35)',
    },
    compactNoticeBillText: {
      color: '#DC2626',
    },
    compactNoticeBillTextDark: {
      color: '#FCA5A5',
    },
    compactNoticeMemoChip: {
      backgroundColor: '#FFFBEB',
      borderColor: '#FDE68A',
    },
    compactNoticeMemoChipDark: {
      backgroundColor: 'rgba(245, 158, 11, 0.15)',
      borderColor: 'rgba(245, 158, 11, 0.35)',
    },
    compactNoticeMemoText: {
      color: '#D97706',
    },
    compactNoticeMemoTextDark: {
      color: '#FCD34D',
    },
    compactNoticeUpcomingChip: {
      backgroundColor: '#EFF6FF',
      borderColor: '#BFDBFE',
    },
    compactNoticeUpcomingChipDark: {
      backgroundColor: 'rgba(59, 130, 246, 0.15)',
      borderColor: 'rgba(59, 130, 246, 0.35)',
    },
    compactNoticeUpcomingText: {
      color: '#2563EB',
    },
    compactNoticeUpcomingTextDark: {
      color: '#93C5FD',
    },
    dismissKeyboardText: {
      fontSize: 11,
      color: '#4F46E5',
      fontWeight: '700',
    },
    sectionHeaderInlineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 2,
      marginBottom: 8,
      gap: 6,
    },
    sectionHeaderTitleWrap: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
    },
    sectionInlineTitle: {
      fontSize: 15.5,
      fontWeight: '700',
      color: colors.text.primary,
    },
    typeFilterInlineContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 0,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
      borderRadius: 10,
      padding: 2,
      gap: 2,
    },
    typeFilterInlineTab: {
      paddingVertical: 5,
      paddingHorizontal: 7,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    typeFilterInlineTabActiveAll: {
      backgroundColor: isDark ? colors.background.card : '#FFFFFF',
      borderColor: colors.border.default,
      borderWidth: 1,
      shadowColor: '#4F46E5',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 2,
      elevation: 2,
    },
    typeFilterInlineTabActiveFinancial: {
      backgroundColor: isDark ? 'rgba(37, 99, 235, 0.2)' : '#EFF6FF',
      borderColor: '#3B82F6',
      borderWidth: 1,
      shadowColor: '#1D4ED8',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    typeFilterInlineTabActiveMemo: {
      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
      borderColor: '#F59E0B',
      borderWidth: 1,
      shadowColor: '#B45309',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    typeFilterInlineTabText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.text.muted,
    },
    typeFilterInlineTabTextActiveAll: {
      color: isDark ? '#818CF8' : '#4F46E5',
      fontWeight: '800',
    },
    typeFilterInlineTabTextActiveFinancial: {
      color: isDark ? '#60A5FA' : '#1D4ED8',
      fontWeight: '800',
    },
    typeFilterInlineTabTextActiveMemo: {
      color: isDark ? '#FBBF24' : '#B45309',
      fontWeight: '800',
    },
    searchBarContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 8,
    },
    searchBarInner: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? colors.background.card : '#FFFFFF',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border.default,
      paddingHorizontal: 10,
      paddingVertical: Platform.OS === 'ios' ? 8 : 4,
      minHeight: 40,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.03,
      shadowRadius: 2,
      elevation: 1,
    },
    searchDismissBtn: {
      marginLeft: 6,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF',
    },
    memoShortcutBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? colors.background.card : '#FFFFFF',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border.default,
      paddingHorizontal: 9,
      minHeight: 40,
      gap: 3,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.03,
      shadowRadius: 2,
      elevation: 1,
    },
    invoiceMenuBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? colors.background.card : '#FFFFFF',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border.default,
      paddingHorizontal: 9,
      minHeight: 40,
      gap: 3,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.03,
      shadowRadius: 2,
      elevation: 1,
    },
    invoiceMenuBtnIcon: {
      fontSize: 13.5,
    },
    invoiceMenuBtnText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text.primary,
    },
    searchStatsBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: '#EEF2FF',
      borderColor: '#C7D2FE',
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginBottom: 8,
      gap: 8,
    },
    searchStatsBarDark: {
      backgroundColor: 'rgba(99, 102, 241, 0.16)',
      borderColor: 'rgba(99, 102, 241, 0.4)',
    },
    searchStatsText: {
      flex: 1,
      fontSize: 12,
      fontWeight: '700',
      color: '#4338CA',
    },
    searchStatsTextDark: {
      color: '#C7D2FE',
    },
    searchStatsAllMonthBtn: {
      backgroundColor: '#FFFFFF',
      borderColor: '#818CF8',
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
      flexShrink: 0,
    },
    searchStatsAllMonthBtnDark: {
      backgroundColor: 'rgba(99, 102, 241, 0.25)',
      borderColor: '#818CF8',
    },
    searchStatsAllMonthText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#4F46E5',
    },
    searchStatsAllMonthTextDark: {
      color: '#A5B4FC',
    },
    searchBarIcon: {
      fontSize: 14,
      marginRight: 8,
    },
    searchBarInput: {
      flex: 1,
      fontSize: 13,
      color: colors.text.primary,
      paddingVertical: 4,
    },
    searchClearBtn: {
      padding: 4,
      marginLeft: 4,
    },
    searchClearText: {
      fontSize: 14,
      color: colors.text.muted,
      fontWeight: '600',
    },
    merchantFilterScroll: {
      flexDirection: 'row',
      gap: 8,
      paddingBottom: 8,
      paddingHorizontal: 2,
    },
    merchantFilterChip: {
      backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
      paddingVertical: 5,
      paddingHorizontal: 11,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    merchantFilterChipActive: {
      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.15)' : '#EEF2FF',
      borderColor: '#6366F1',
    },
    merchantFilterChipText: {
      fontSize: 12,
      color: colors.text.secondary,
      fontWeight: '500',
    },
    merchantFilterChipTextActive: {
      color: isDark ? '#818CF8' : '#4F46E5',
      fontWeight: '700',
    },
    filterToolbarWrapper: {
      marginBottom: 8,
    },
    filterToolbarScroll: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingRight: 16,
    },
    monthStepperGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? colors.background.card : '#FFFFFF',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border.default,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 2,
      elevation: 1,
      overflow: 'hidden',
    },
    monthStepperArrowBtn: {
      paddingVertical: 6,
      paddingHorizontal: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    monthStepperArrowDisabled: {
      opacity: 0.3,
    },
    monthStepperArrowText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.text.secondary,
    },
    monthStepperCenterBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 4,
      gap: 4,
    },
    filterQuickToggleChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? colors.background.card : '#FFFFFF',
      paddingVertical: 6,
      paddingHorizontal: 11,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    filterQuickToggleText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    listSectionHeader: {
      paddingHorizontal: 2,
      paddingTop: 2,
      paddingBottom: 6,
    },
    listSectionHeaderText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#B45309',
      letterSpacing: 0.3,
    },
    dayGroupBlock: {
      marginBottom: 4,
    },
    dayGroupHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 4,
      paddingTop: 6,
      paddingBottom: 6,
      gap: 8,
    },
    dayGroupHeaderDark: {
      borderColor: 'transparent',
    },
    dayGroupTitle: {
      fontSize: 12.5,
      fontWeight: '700',
      color: '#64748B',
    },
    dayGroupTitleDark: {
      color: '#94A3B8',
    },
    dayGroupSummaryWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexShrink: 1,
    },
    dayGroupExpenseText: {
      fontSize: 11.5,
      fontWeight: '700',
      color: '#EF4444',
    },
    dayGroupExpenseTextDark: {
      color: '#FCA5A5',
    },
    dayGroupIncomeText: {
      fontSize: 11.5,
      fontWeight: '700',
      color: '#059669',
    },
    dayGroupIncomeTextDark: {
      color: '#6EE7B7',
    },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? colors.background.card : '#FFFFFF',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border.default,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 2,
      elevation: 1,
      gap: 5,
    },
    filterChipActive: {
      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.15)' : '#EEF2FF',
      borderColor: '#6366F1',
    },
    filterChipIcon: {
      fontSize: 13,
    },
    filterChipText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    filterChipTextActive: {
      color: isDark ? '#818CF8' : '#4338CA',
      fontWeight: '700',
    },
    filterChipArrow: {
      fontSize: 11,
      color: colors.text.muted,
      marginLeft: 2,
    },
    filterChipArrowActive: {
      color: isDark ? '#818CF8' : '#6366F1',
    },
    filterResetChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.15)' : '#EEF2FF',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(79, 70, 229, 0.35)' : '#C7D2FE',
    },
    filterResetText: {
      fontSize: 12,
      fontWeight: '700',
      color: isDark ? '#818CF8' : '#4F46E5',
    },
    filterEmptyResetBtn: {
      marginTop: 12,
      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.15)' : '#EEF2FF',
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(79, 70, 229, 0.35)' : '#C7D2FE',
    },
    filterEmptyResetText: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? '#818CF8' : '#4F46E5',
    },
    emptyBox: {
      alignItems: 'center',
      paddingVertical: 60,
    },
    emptyIcon: {
      fontSize: 48,
      marginBottom: 12,
    },
    emptyText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    emptySubtext: {
      fontSize: 13,
      color: colors.text.muted,
      marginTop: 4,
    },
    loadMoreContainer: {
      marginTop: 12,
      marginBottom: 8,
      alignItems: 'center',
      gap: 8,
    },
    loadMoreBtn: {
      width: '100%',
      backgroundColor: isDark ? colors.background.card : '#FFFFFF',
      borderWidth: 1.5,
      borderColor: colors.border.default,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 16,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 2,
      elevation: 1,
    },
    loadMoreBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: isDark ? '#818CF8' : '#4F46E5',
    },
    loadMoreSubtext: {
      fontSize: 11,
      color: colors.text.muted,
      marginTop: 3,
      fontWeight: '600',
    },
    loadAllBtn: {
      paddingVertical: 6,
      paddingHorizontal: 12,
    },
    loadAllBtnText: {
      fontSize: 12,
      color: colors.text.muted,
      textDecorationLine: 'underline',
      fontWeight: '600',
    },
    pinnedCollapseBtn: {
      width: '100%',
      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : '#FFFBEB',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(245, 158, 11, 0.35)' : '#FDE68A',
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: 4,
    },
    pinnedCollapseBtnDark: {
      backgroundColor: 'rgba(245, 158, 11, 0.15)',
      borderColor: 'rgba(245, 158, 11, 0.45)',
    },
    pinnedCollapseText: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? '#FBBF24' : '#D97706',
    },
    pinnedCollapseTextDark: {
      color: '#FBBF24',
    },
    listEndIndicator: {
      marginTop: 14,
      marginBottom: 8,
      alignItems: 'center',
    },
    listEndText: {
      fontSize: 12,
      color: colors.text.muted,
      fontWeight: '500',
    },
  });
