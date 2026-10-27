import React, { useState, useMemo, useRef } from 'react';
import {
  View,
  Text as RNText,
  TextInput as RNTextInput,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Keyboard,
  Platform,
  StyleSheet,
  TextProps,
  TextInputProps,
} from 'react-native';
import { useLedger } from '../context/LedgerContext';
import { usePrivacy } from '../context/PrivacyContext';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { Transaction } from '../types/database';
import { TransactionItem } from '../components/TransactionItem';
import { NetWorthWidget } from '../components/NetWorthWidget';
import { StoredValueWidget } from '../components/StoredValueWidget';
import { HorizontalScrollView } from '../components/HorizontalScrollView';
import { isTransferToMember } from '../lib/payment';
import { isBillDueInMonth, isBillPaidForCurrentPeriod } from '../lib/recurring';
import { getLocalDateYmd } from '../lib/memo';
import { checkInvoiceWinning } from '../lib/lottery';

const PAGE_SIZE = 40;

const Text: React.FC<TextProps> = ({ allowFontScaling = false, maxFontSizeMultiplier = 1.08, ...rest }) => (
  <RNText
    allowFontScaling={allowFontScaling}
    maxFontSizeMultiplier={Math.min(maxFontSizeMultiplier ?? 1.08, 1.08)}
    {...rest}
  />
);

const TextInput: React.FC<TextInputProps> = ({ allowFontScaling = false, maxFontSizeMultiplier = 1.08, ...rest }) => (
  <RNTextInput
    allowFontScaling={allowFontScaling}
    maxFontSizeMultiplier={Math.min(maxFontSizeMultiplier ?? 1.08, 1.08)}
    {...rest}
  />
);

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
  onOpenAccountsManageModal: () => void;
  onOpenRecurringModal: (scope: 'all' | 'my', targetMemberId?: string, initialTab?: 'bills' | 'pending' | 'installments') => void;
  onOpenMemoTodoModal: () => void;
  onOpenInvoiceLotteryModal: () => void;
  onOpenReconcileModal: (type: 'credit_card' | 'stored_value', cardId?: string) => void;
  onOpenExportModal: (tab: 'csv' | 'json' | 'restore') => void;
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
  onOpenReconcileModal,
  onOpenExportModal,
  onViewImage,
  onOpenFilterModal,
}) => {
  const { isDark, colors } = useTheme();
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
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const [isReminderDismissed, setIsReminderDismissed] = useState(false);
  const [isAssetSectionExpanded, setIsAssetSectionExpanded] = useState(false);

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
    const diffMs = Date.now() - lastDate.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }, [lastBackupAt]);

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
      if (!t.reminder_date) return false;
      return t.reminder_date <= todayYmd;
    }).sort((a, b) => (a.reminder_date || '').localeCompare(b.reminder_date || ''));
  }, [transactions]);

  const upcomingMemos = useMemo(() => {
    const todayYmd = getLocalDateYmd();
    return transactions.filter(t => {
      if (t.type !== 'memo') return false;
      if (t.is_settled) return false;
      if (!t.reminder_date) return false;
      return t.reminder_date > todayYmd;
    }).sort((a, b) => (a.reminder_date || '').localeCompare(b.reminder_date || ''));
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
      const targetM = members.find(m => m.id === targetId);
      if (mem && targetM && mem.display_name === targetM.display_name) return true;
      return false;
    };
  }, [members, getMemberById]);

  const scopedRecurringRules = useMemo(() => {
    return (recurringRules || []).filter(r => !r.ledger_id || r.ledger_id === currentLedger?.id);
  }, [recurringRules, currentLedger?.id]);

  const currentFilterPendingBills = useMemo(() => {
    const now = new Date();
    const currYear = now.getFullYear();
    const currMonth = now.getMonth() + 1;

    const allDueBills = scopedRecurringRules.filter(rule => {
      if (!isBillDueInMonth(rule, currYear, currMonth)) return false;
      return !isBillPaidForCurrentPeriod(rule, now);
    });

    if (filterMemberId === 'all') {
      return allDueBills;
    }

    const targetM = members.find(m => m.id === filterMemberId);
    const isMe =
      filterMemberId === currentUser?.id ||
      (!!currentUser?.display_name && targetM?.display_name === currentUser.display_name);

    if (isMe) {
      return allDueBills.filter(rule => isMatchedToCurrentUser(rule.paid_by));
    }

    return allDueBills.filter(rule => isMatchedToTargetMember(rule.paid_by, filterMemberId));
  }, [scopedRecurringRules, filterMemberId, currentUser, members, isMatchedToCurrentUser, isMatchedToTargetMember]);

  // 提取此帳本現有紀錄中的店家清單
  const activeMerchantsInLedger = useMemo(() => {
    const counts = new Map<string, number>();
    transactions.forEach(t => {
      const m = (t.merchant || '').trim();
      if (m) {
        counts.set(m, (counts.get(m) || 0) + 1);
      }
    });
    const fromTx = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([m]) => m);

    const combined = Array.from(new Set([...fromTx, ...(recentMerchants || [])]));
    return combined.slice(0, 15);
  }, [transactions, recentMerchants]);

  // 計算各類型數量（全部 / 僅看收支 / 僅看生活備忘）
  const typeCountStats = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let all = 0;
    let financial = 0;
    let memo = 0;

    transactions.forEach(t => {
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
      }

      if (q) {
        const mMatch = t.merchant && t.merchant.toLowerCase().includes(q);
        const nMatch = t.note && t.note.toLowerCase().includes(q);
        const cat = getCategoryById(t.category_id, t.category);
        const cMatch = cat && cat.name.toLowerCase().includes(q);
        if (!mMatch && !nMatch && !cMatch) return;
      }

      all++;
      if (t.type === 'memo') {
        memo++;
      } else {
        financial++;
      }
    });

    return { all, financial, memo };
  }, [transactions, filterMonth, filterMemberId, searchQuery, getMemberById, getCategoryById, members, currentUser, paymentAccounts]);

  // 依據篩選條件計算 filteredTransactions
  const filteredTransactions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return transactions.filter(t => {
      if (transactionTypeFilter === 'financial' && t.type === 'memo') return false;
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
  }, [transactions, transactionTypeFilter, filterMonth, filterMemberId, searchQuery, getMemberById, getCategoryById, members, currentUser, paymentAccounts]);

  const displayedTransactions = useMemo(() => {
    return filteredTransactions.slice(0, displayCount);
  }, [filteredTransactions, displayCount]);

  const defaultMemberId = currentUser?.id || 'all';
  const isFiltered = filterMonth !== currentMonthYm || filterMemberId !== defaultMemberId || !!searchQuery.trim() || transactionTypeFilter !== 'all';

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
        const res = checkInvoiceWinning(t.invoice_number, t.transacted_at);
        if (res.isWon) wonCount++;
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
      setIsRefreshing(false);
    }
  };

  return (
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
          if (displayCount < filteredTransactions.length) {
            setDisplayCount(prev => Math.min(prev + PAGE_SIZE, filteredTransactions.length));
          }
        }
      }}
      scrollEventThrottle={200}
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

      {/* 本月收支摘要卡片 */}
      <View
        style={[
          styles.summaryCard,
          isDark && {
            backgroundColor: '#1E293B',
            borderColor: '#334155',
            borderWidth: 1,
            shadowOpacity: 0.1,
          },
        ]}
      >
        <View style={styles.summaryHeader}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.summaryTitle} maxFontSizeMultiplier={1.2}>
              {summaryCardTitle}
            </Text>
            <Text style={styles.currencyLabel} maxFontSizeMultiplier={1.2}>
              {isFiltered ? '🔍 已套用篩選' : 'TWD (新台幣)'}
            </Text>
          </View>
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
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel} maxFontSizeMultiplier={1.2}>
              {displaySummary.isMemberFilter && displaySummary.personalTransferOut > 0 ? '總支出 (含轉出)' : '總支出'}
            </Text>
            <Text
              style={[styles.summaryVal, styles.expenseVal]}
              maxFontSizeMultiplier={1.2}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              -NT$ {displaySummary.effectiveExpense.toLocaleString()}
            </Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel} maxFontSizeMultiplier={1.2}>
              {displaySummary.isMemberFilter && displaySummary.personalTransferIn > 0
                ? (displaySummary.totalIncome > 0 ? '總進帳 (含轉入)' : '轉入款項')
                : '總收入'}
            </Text>
            <Text
              style={[styles.summaryVal, styles.incomeVal]}
              maxFontSizeMultiplier={1.2}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              +NT$ {displaySummary.effectiveIncome.toLocaleString()}
            </Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel} maxFontSizeMultiplier={1.2}>
              結餘
            </Text>
            <Text
              style={[
                styles.summaryVal,
                displaySummary.netBalance > 0
                  ? styles.incomeVal
                  : displaySummary.netBalance < 0
                  ? styles.expenseVal
                  : null,
              ]}
              maxFontSizeMultiplier={1.2}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {displaySummary.netBalance > 0 ? '+' : ''}NT$ {displaySummary.netBalance.toLocaleString()}
            </Text>
          </View>
        </View>

        {displaySummary.isMemberFilter && (displaySummary.personalTransferIn > 0 || displaySummary.personalTransferOut > 0) && (
          <View style={styles.summaryTransferHintRow}>
            {displaySummary.personalTransferIn > 0 && (
              <Text style={styles.summaryTransferHintText} maxFontSizeMultiplier={1.08}>
                📥 轉入款項：+NT$ {displaySummary.personalTransferIn.toLocaleString()}
              </Text>
            )}
            {displaySummary.personalTransferOut > 0 && (
              <Text style={styles.summaryTransferHintText} maxFontSizeMultiplier={1.08}>
                📤 轉出款項：-NT$ {displaySummary.personalTransferOut.toLocaleString()}
              </Text>
            )}
          </View>
        )}

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
      </View>

      {/* 雙提醒單行膠囊 (待繳週期帳單 + 生活待辦備忘) */}
      {(() => {
        const hasPendingBills = currentFilterPendingBills.length > 0;
        const hasPendingMemos = pendingMemos.length > 0 || upcomingMemos.length > 0;
        if (!hasPendingBills && !hasPendingMemos) return null;

        const hasBothNotices = hasPendingBills && hasPendingMemos;

        const isMe =
          filterMemberId === currentUser?.id ||
          (!!currentUser?.display_name && members.find(m => m.id === filterMemberId)?.display_name === currentUser.display_name);
        const canActBill = isMe || filterMemberId === 'all';
        const billActionText = canActBill ? '核對記帳 ›' : '查看帳單 ›';
        const billPrefix = filterMemberId === 'all' ? '全家待繳' : '本期待繳';
        const billName = currentFilterPendingBills[0]?.name || '週期帳單';
        const billAmount = currentFilterPendingBills[0]?.default_amount ? ` · NT$ ${currentFilterPendingBills[0].default_amount.toLocaleString()}` : '';
        const billMore = currentFilterPendingBills.length > 1 ? ` 等 ${currentFilterPendingBills.length} 筆` : '';
        const billTitle = hasBothNotices
          ? `待繳帳單 (${currentFilterPendingBills.length})`
          : `${billPrefix} (${currentFilterPendingBills.length})：${billName}${billAmount}${billMore}`;

        const todayYmd = getLocalDateYmd();
        const hasOverdueMemo = pendingMemos.some(t => t.reminder_date && t.reminder_date < todayYmd);
        const memoPrefix = hasOverdueMemo ? '待辦/逾期' : '今日待辦';
        const firstMemoNote = (pendingMemos.length > 0 ? pendingMemos[0]?.note : upcomingMemos[0]?.note) || '';
        const memoCount = pendingMemos.length > 0 ? pendingMemos.length : upcomingMemos.length;
        const memoMore = memoCount > 1 ? ` 等 ${memoCount} 則` : '';
        const memoTitle = hasBothNotices
          ? pendingMemos.length > 0
            ? `今日待辦 (${pendingMemos.length})`
            : `排程預告 (${upcomingMemos.length})`
          : pendingMemos.length > 0
          ? `${memoPrefix} (${pendingMemos.length})：${firstMemoNote}${memoMore}`
          : `排程預告 (${upcomingMemos.length})：${firstMemoNote}${memoMore}`;

        return (
          <View style={styles.compactNoticeRow}>
            {hasPendingBills && (
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
                  } else {
                    if (isMe) {
                      onOpenRecurringModal('my', undefined, 'pending');
                    } else {
                      onOpenRecurringModal('all', filterMemberId, 'pending');
                    }
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
                  {billTitle}
                </Text>
                {hasBothNotices ? (
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
                ) : (
                  <View
                    style={[
                      styles.compactNoticeActionPill,
                      styles.compactNoticeActionPillBill,
                      isDark && styles.compactNoticeActionPillBillDark,
                    ]}
                  >
                    <Text
                      style={[
                        styles.compactNoticeActionPillText,
                        styles.compactNoticeBillText,
                        isDark && styles.compactNoticeBillTextDark,
                      ]}
                      maxFontSizeMultiplier={1.08}
                    >
                      {billActionText}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            )}

            {hasPendingMemos && (
              <TouchableOpacity
                style={[
                  styles.compactNoticeChip,
                  pendingMemos.length > 0 ? styles.compactNoticeMemoChip : styles.compactNoticeUpcomingChip,
                  isDark && (pendingMemos.length > 0 ? styles.compactNoticeMemoChipDark : styles.compactNoticeUpcomingChipDark),
                ]}
                activeOpacity={0.8}
                onPress={onOpenMemoTodoModal}
              >
                <Text style={styles.compactNoticeChipIcon}>{pendingMemos.length > 0 ? '🔔' : '📌'}</Text>
                <Text
                  style={[
                    styles.compactNoticeChipText,
                    pendingMemos.length > 0 ? styles.compactNoticeMemoText : styles.compactNoticeUpcomingText,
                    isDark && (pendingMemos.length > 0 ? styles.compactNoticeMemoTextDark : styles.compactNoticeUpcomingTextDark),
                  ]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.08}
                >
                  {memoTitle}
                </Text>
                {hasBothNotices ? (
                  <Text
                    style={[
                      styles.compactNoticeChipArrow,
                      pendingMemos.length > 0 ? styles.compactNoticeMemoText : styles.compactNoticeUpcomingText,
                      isDark && (pendingMemos.length > 0 ? styles.compactNoticeMemoTextDark : styles.compactNoticeUpcomingTextDark),
                    ]}
                    maxFontSizeMultiplier={1.08}
                  >
                    ›
                  </Text>
                ) : (
                  <View
                    style={[
                      styles.compactNoticeActionPill,
                      pendingMemos.length > 0 ? styles.compactNoticeActionPillMemo : styles.compactNoticeActionPillUpcoming,
                      isDark && (pendingMemos.length > 0 ? styles.compactNoticeActionPillMemoDark : styles.compactNoticeActionPillUpcomingDark),
                    ]}
                  >
                    <Text
                      style={[
                        styles.compactNoticeActionPillText,
                        pendingMemos.length > 0 ? styles.compactNoticeMemoText : styles.compactNoticeUpcomingText,
                        isDark && (pendingMemos.length > 0 ? styles.compactNoticeMemoTextDark : styles.compactNoticeUpcomingTextDark),
                      ]}
                      maxFontSizeMultiplier={1.08}
                    >
                      待辦總覽 ›
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
          </View>
        );
      })()}

      {/* 💎 財務淨值與儲值票證折疊看板 */}
      <View style={styles.collapsibleAssetWrapper}>
        <TouchableOpacity
          style={[
            styles.compactAssetBar,
            isDark && styles.compactAssetBarDark,
            isAssetSectionExpanded && styles.compactAssetBarExpanded,
            isDark && isAssetSectionExpanded && styles.compactAssetBarExpandedDark,
          ]}
          activeOpacity={0.8}
          onPress={() => setIsAssetSectionExpanded(prev => !prev)}
        >
          <View style={styles.compactAssetLeft}>
            <Text style={styles.compactAssetIcon}>💎</Text>
            <Text style={[styles.compactAssetLabel, isDark && { color: colors.text.secondary }]} maxFontSizeMultiplier={1.08}>
              {filterMemberId === 'all'
                ? '全家淨值'
                : filterMemberId === currentUser?.id
                ? '我的淨值'
                : `${members.find(m => m.id === filterMemberId)?.display_name || '成員'}淨值`}
            </Text>
            <Text style={[styles.compactAssetAmount, isDark && { color: colors.text.primary }]} maxFontSizeMultiplier={1.08}>
              {maskedNetWorth}
            </Text>
            {netWorthSummary.accounts.storedValues.length > 0 && (
              <View style={[styles.compactAssetPill, isDark && styles.compactAssetPillDark]}>
                <Text style={[styles.compactAssetPillText, isDark && styles.compactAssetPillTextDark]} maxFontSizeMultiplier={1.08}>
                  💳 儲值卡 {netWorthSummary.accounts.storedValues.length}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.compactAssetRight}>
            <Text style={[styles.compactAssetToggleText, isDark && { color: '#818CF8' }]} maxFontSizeMultiplier={1.08}>
              {isAssetSectionExpanded ? '收合資產 ▴' : '展開資產 ▾'}
            </Text>
          </View>
        </TouchableOpacity>

        {isAssetSectionExpanded && (
          <View style={styles.expandedAssetContent}>
            <NetWorthWidget
              filterMemberId={filterMemberId}
              onOpenTransferModal={() => onOpenModal('transfer')}
              onOpenAccountsManageModal={onOpenAccountsManageModal}
            />
            <StoredValueWidget
              filterMemberId={filterMemberId}
              onOpenCreditCardReconcile={() => onOpenReconcileModal('credit_card')}
              onOpenReconcile={(card) => onOpenReconcileModal('stored_value', card?.id)}
            />
          </View>
        )}
      </View>

      {/* 交易列表標題 */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, isDark && { color: colors.text.primary }]}>
          {transactionTypeFilter === 'memo' ? '📝 生活備忘記事' : transactionTypeFilter === 'financial' ? '💳 日常收支明細' : '近期收支明細'} {historySyncProgress ? `(同步中 ${Math.max(historySyncProgress.loaded, transactions.length).toLocaleString()} / ${historySyncProgress.total.toLocaleString()})` : (filteredTransactions.length < transactions.length ? `(${filteredTransactions.length.toLocaleString()} / 總 ${transactions.length.toLocaleString()})` : `(總 ${transactions.length.toLocaleString()})`)}
        </Text>
        {keyboardOffset > 0 ? (
          <TouchableOpacity onPress={Keyboard.dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.dismissKeyboardText} maxFontSizeMultiplier={1.08}>收起鍵盤 ▾</Text>
          </TouchableOpacity>
        ) : (
          <Text style={[styles.sectionSubtitle, isDark && { color: '#818CF8' }]}>點擊明細可直接修改或刪除 ✍️</Text>
        )}
      </View>

      {/* 明細類型快捷切換列 */}
      <View style={[styles.typeFilterContainer, isDark && { backgroundColor: colors.background.cardSubtle }]}>
        <TouchableOpacity
          style={[
            styles.typeFilterTab,
            transactionTypeFilter === 'all' && styles.typeFilterTabActiveAll,
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
              styles.typeFilterTabText,
              transactionTypeFilter === 'all' && styles.typeFilterTabTextActiveAll,
              isDark && { color: colors.text.secondary },
              isDark && transactionTypeFilter === 'all' && { color: '#A5B4FC' },
            ]}
            maxFontSizeMultiplier={1.08}
          >
            全部紀錄 ({typeCountStats.all})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.typeFilterTab,
            transactionTypeFilter === 'financial' && styles.typeFilterTabActiveFinancial,
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
              styles.typeFilterTabText,
              transactionTypeFilter === 'financial' && styles.typeFilterTabTextActiveFinancial,
              isDark && { color: colors.text.secondary },
              isDark && transactionTypeFilter === 'financial' && { color: '#93C5FD' },
            ]}
            maxFontSizeMultiplier={1.08}
          >
            💳 僅看收支 ({typeCountStats.financial})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.typeFilterTab,
            transactionTypeFilter === 'memo' && styles.typeFilterTabActiveMemo,
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
              styles.typeFilterTabText,
              transactionTypeFilter === 'memo' && styles.typeFilterTabTextActiveMemo,
              isDark && { color: colors.text.secondary },
              isDark && transactionTypeFilter === 'memo' && { color: '#FCD34D' },
            ]}
            maxFontSizeMultiplier={1.08}
          >
            📝 僅看記事 ({typeCountStats.memo})
          </Text>
        </TouchableOpacity>
      </View>

      {/* 🔍 店家 / 關鍵字即時搜尋列 */}
      <View style={styles.searchBarContainer}>
        <View style={[styles.searchBarInner, isDark && { backgroundColor: colors.background.input, borderColor: colors.border.default }]}>
          <Text style={styles.searchBarIcon}>🔍</Text>
          <TextInput
            style={[styles.searchBarInput, isDark && { color: colors.text.primary }]}
            placeholder="搜尋店家或備註 (例如：好市多、全聯、加油...)"
            placeholderTextColor={isDark ? colors.text.muted : '#9CA3AF'}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            onSubmitEditing={Keyboard.dismiss}
            onFocus={() => {
              setTimeout(() => {
                activeScrollRef.current?.scrollTo({ y: 260, animated: true });
              }, 120);
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
        </View>
      </View>

      {/* 🏷️ 店家 1 鍵快速篩選膠囊橫向列 */}
      {activeMerchantsInLedger.length > 0 && (
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

      {/* 篩選工具列 */}
      <View style={styles.filterToolbar}>
        {/* 月份篩選 */}
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
            {/^\d{4}$/.test(filterMonth) ? '🗓️' : filterMonth === 'all' ? '🌐' : '📅'}
          </Text>
          <Text
            style={[
              styles.filterChipText,
              filterMonth !== currentMonthYm && styles.filterChipTextActive,
              isDark && { color: colors.text.secondary },
              isDark && filterMonth !== currentMonthYm && { color: '#C7D2FE' },
            ]}
            numberOfLines={1}
          >
            {filterMonth === 'all'
              ? '全部月份'
              : /^\d{4}$/.test(filterMonth)
              ? (parseInt(filterMonth, 10) === new Date().getFullYear() ? `今年 (${filterMonth} 全年)` : `${filterMonth} 全年`)
              : filterMonth === currentMonthYm
              ? `本月 (${parseInt(currentMonthYm.split('-')[1], 10)}月)`
              : (selectedMonthObj?.label || filterMonth)}
          </Text>
          <Text style={[styles.filterChipArrow, filterMonth !== currentMonthYm && styles.filterChipArrowActive, isDark && { color: colors.text.muted }, isDark && filterMonth !== currentMonthYm && { color: '#818CF8' }]}>▾</Text>
        </TouchableOpacity>

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
          >
            {filterMemberId === 'all'
              ? '全部成員'
              : filterMemberId === currentUser?.id
              ? `${currentUser?.display_name || '我'} (本機)`
              : (selectedMember?.display_name || '指定成員')}
          </Text>
          <Text style={[styles.filterChipArrow, filterMemberId !== defaultMemberId && styles.filterChipArrowActive, isDark && { color: colors.text.muted }, isDark && filterMemberId !== defaultMemberId && { color: '#818CF8' }]}>▾</Text>
        </TouchableOpacity>

        {/* 發票對獎按鈕 */}
        <TouchableOpacity
          activeOpacity={0.7}
          style={[
            styles.filterChip,
            isDark && {
              backgroundColor: colors.background.card,
              borderColor: colors.border.default,
            },
            invoiceLotteryStats.wonCount > 0 && {
              borderColor: '#F59E0B',
              backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
            },
          ]}
          onPress={onOpenInvoiceLotteryModal}
        >
          <Text style={styles.filterChipIcon}>{invoiceLotteryStats.wonCount > 0 ? '🎉' : '🧾'}</Text>
          <Text
            style={[
              styles.filterChipText,
              isDark && { color: colors.text.secondary },
              invoiceLotteryStats.wonCount > 0 && { color: isDark ? '#FBBF24' : '#B45309', fontWeight: '700' },
            ]}
            numberOfLines={1}
          >
            {invoiceLotteryStats.wonCount > 0
              ? `發票中獎 (${invoiceLotteryStats.wonCount})`
              : '發票對獎'}
          </Text>
        </TouchableOpacity>

        {!!searchQuery.trim() && filterMonth !== 'all' && (
          <TouchableOpacity
            activeOpacity={0.7}
            style={[
              styles.filterChip,
              {
                borderColor: isDark ? '#6366F1' : '#818CF8',
                backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF',
              },
            ]}
            onPress={() => setFilterMonth('all')}
          >
            <Text style={styles.filterChipIcon}>🌐</Text>
            <Text style={[styles.filterChipText, { color: isDark ? '#A5B4FC' : '#4F46E5', fontWeight: '700' }]}>改查全部月份</Text>
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
            <Text style={[styles.filterResetText, isDark && { color: '#A5B4FC' }]}>清除篩選 ↺</Text>
          </TouchableOpacity>
        )}
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
                style={[styles.filterEmptyResetBtn, { backgroundColor: '#EEF2FF', borderColor: '#6366F1' }]}
                onPress={() => setFilterMonth('all')}
              >
                <Text style={[styles.filterEmptyResetText, { color: '#4F46E5' }]}>🗓️ 改查全部月份</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.filterEmptyResetBtn} onPress={resetFilters}>
              <Text style={styles.filterEmptyResetText}>重設所有篩選</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          {displayedTransactions.map(item => (
            <TransactionItem
              key={item.id}
              transaction={item}
              viewingMemberId={filterMemberId}
              onPress={tx => onOpenEditTransaction(tx)}
              onCompleteMemo={tx => onOpenMemoCompletion(tx)}
              onViewImage={(url, title) => onViewImage(url, title || '消費收據 / 保固憑證')}
            />
          ))}

          {/* 分批動態載入控制列 */}
          {filteredTransactions.length > displayCount && (
            <View style={styles.loadMoreContainer}>
              <TouchableOpacity
                style={styles.loadMoreBtn}
                onPress={() => setDisplayCount(prev => Math.min(prev + PAGE_SIZE, filteredTransactions.length))}
                activeOpacity={0.7}
              >
                <Text style={styles.loadMoreBtnText}>
                  載入更多明細 (+{Math.min(PAGE_SIZE, filteredTransactions.length - displayCount)} 筆) ▾
                </Text>
                <Text style={styles.loadMoreSubtext}>
                  已顯示 {displayedTransactions.length} / {filteredTransactions.length} 筆
                </Text>
              </TouchableOpacity>

              {filteredTransactions.length - displayCount > PAGE_SIZE && (
                <TouchableOpacity
                  style={styles.loadAllBtn}
                  onPress={() => setDisplayCount(filteredTransactions.length)}
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
  );
};

const getStyles = (isDark: boolean, colors: ThemeColors) =>
  StyleSheet.create({
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
      borderRadius: 20,
      padding: 18,
      marginBottom: 10,
      shadowColor: '#4F46E5',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.25,
      shadowRadius: 10,
      elevation: 6,
    },
    summaryHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
    },
    summaryTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: '#E0E7FF',
    },
    currencyLabel: {
      fontSize: 12,
      color: '#C7D2FE',
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
    expenseVal: {
      color: '#FCA5A5',
    },
    incomeVal: {
      color: '#6EE7B7',
    },
    summaryTransferHintRow: {
      marginTop: 14,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: 'rgba(255, 255, 255, 0.15)',
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 12,
    },
    summaryTransferHintText: {
      fontSize: 12,
      color: '#E0E7FF',
      fontWeight: '600',
    },
    summaryBudgetSection: {
      marginTop: 12,
      paddingTop: 10,
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
    compactNoticeActionPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      marginLeft: 6,
    },
    compactNoticeActionPillText: {
      fontSize: 11,
      fontWeight: '700',
    },
    compactNoticeActionPillBill: {
      backgroundColor: '#FEE2E2',
    },
    compactNoticeActionPillBillDark: {
      backgroundColor: 'rgba(239, 68, 68, 0.25)',
    },
    compactNoticeActionPillMemo: {
      backgroundColor: '#FEF3C7',
    },
    compactNoticeActionPillMemoDark: {
      backgroundColor: 'rgba(245, 158, 11, 0.25)',
    },
    compactNoticeActionPillUpcoming: {
      backgroundColor: '#DBEAFE',
    },
    compactNoticeActionPillUpcomingDark: {
      backgroundColor: 'rgba(59, 130, 246, 0.25)',
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
    collapsibleAssetWrapper: {
      marginBottom: 10,
    },
    compactAssetBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: '#FFFFFF',
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: '#E2E8F0',
      shadowColor: '#6366F1',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 1,
    },
    compactAssetBarDark: {
      backgroundColor: '#1E293B',
      borderColor: '#334155',
    },
    compactAssetBarExpanded: {
      borderBottomLeftRadius: 4,
      borderBottomRightRadius: 4,
      borderColor: '#C7D2FE',
    },
    compactAssetBarExpandedDark: {
      borderColor: '#4338CA',
    },
    compactAssetLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      flexWrap: 'nowrap',
      gap: 6,
    },
    compactAssetIcon: {
      fontSize: 14,
    },
    compactAssetLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: '#64748B',
    },
    compactAssetAmount: {
      fontSize: 14,
      fontWeight: '700',
      color: '#0F172A',
    },
    compactAssetPill: {
      backgroundColor: '#F1F5F9',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 8,
      marginLeft: 2,
    },
    compactAssetPillDark: {
      backgroundColor: '#334155',
    },
    compactAssetPillText: {
      fontSize: 10,
      fontWeight: '600',
      color: '#475569',
    },
    compactAssetPillTextDark: {
      color: '#94A3B8',
    },
    compactAssetRight: {
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: 8,
    },
    compactAssetToggleText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#4F46E5',
    },
    expandedAssetContent: {
      marginTop: 8,
      gap: 8,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text.primary,
    },
    dismissKeyboardText: {
      fontSize: 12,
      color: '#4F46E5',
      fontWeight: '700',
    },
    sectionSubtitle: {
      fontSize: 12,
      color: isDark ? '#818CF8' : '#6366F1',
      fontWeight: '500',
    },
    typeFilterContainer: {
      flexDirection: 'row',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
      borderRadius: 12,
      padding: 3,
      marginBottom: 10,
      gap: 4,
    },
    typeFilterTab: {
      flex: 1,
      paddingVertical: 7,
      paddingHorizontal: 4,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    typeFilterTabActiveAll: {
      backgroundColor: isDark ? colors.background.card : '#FFFFFF',
      borderColor: colors.border.default,
      borderWidth: 1,
      shadowColor: '#4F46E5',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 2,
      elevation: 2,
    },
    typeFilterTabActiveFinancial: {
      backgroundColor: isDark ? 'rgba(37, 99, 235, 0.15)' : '#EFF6FF',
      borderColor: '#3B82F6',
      borderWidth: 1,
      shadowColor: '#1D4ED8',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    typeFilterTabActiveMemo: {
      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7',
      borderColor: '#F59E0B',
      borderWidth: 1,
      shadowColor: '#B45309',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    typeFilterTabText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text.muted,
    },
    typeFilterTabTextActiveAll: {
      color: isDark ? '#818CF8' : '#4F46E5',
      fontWeight: '800',
    },
    typeFilterTabTextActiveFinancial: {
      color: isDark ? '#60A5FA' : '#1D4ED8',
      fontWeight: '800',
    },
    typeFilterTabTextActiveMemo: {
      color: isDark ? '#FBBF24' : '#B45309',
      fontWeight: '800',
    },
    searchBarContainer: {
      marginBottom: 8,
    },
    searchBarInner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? colors.background.card : '#FFFFFF',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border.default,
      paddingHorizontal: 12,
      paddingVertical: Platform.OS === 'ios' ? 8 : 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.03,
      shadowRadius: 2,
      elevation: 1,
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
    filterToolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
      flexWrap: 'wrap',
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
