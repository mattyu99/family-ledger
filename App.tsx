import React, { useState, useEffect, useMemo } from 'react';
import {
  SafeAreaView,
  View,
  Text as RNText,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
  Modal,
  Platform,
  TextInput as RNTextInput,
  RefreshControl,
  TextProps,
  TextInputProps,
  Share,
} from 'react-native';

// 全域文字防禦包裝：徹底防止 Android 系統無障礙/大字體放大導致全 App 各頁面文字截斷與跑版
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
import { LedgerProvider, useLedger } from './src/context/LedgerContext';
import { TransactionItem } from './src/components/TransactionItem';
import { AddTransactionModal } from './src/components/AddTransactionModal';
import { EditTransactionModal } from './src/components/EditTransactionModal';
import { CategoryManageModal } from './src/components/CategoryManageModal';
import { TransactionFilterModal } from './src/components/TransactionFilterModal';
import { MonthPickerModal } from './src/components/MonthPickerModal';
import { LiveToastBanner } from './src/components/LiveToastBanner';
import { AvatarPicker, ALL_AVATAR_OPTIONS } from './src/components/AvatarPicker';
import { Transaction, Profile } from './src/types/database';
import { getCategoryIcon } from './src/lib/icons';
import * as Updates from 'expo-updates';
import appConfig from './app.json';

const AVATAR_OPTIONS = ALL_AVATAR_OPTIONS;

// 注入 Web 專用重設樣式，徹底防止手機瀏覽器水平超出或縮放跑版
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const meta = document.querySelector('meta[name="viewport"]');
  if (meta) {
    meta.setAttribute(
      'content',
      'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, shrink-to-fit=no, viewport-fit=cover'
    );
  }
  const styleId = 'family-ledger-web-reset';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      html, body, #root {
        overflow-x: hidden !important;
        width: 100% !important;
        max-width: 100vw !important;
        height: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      * {
        box-sizing: border-box !important;
      }
      input, textarea, select {
        font-family: inherit !important;
      }
    `;
    document.head.appendChild(style);
  }
}

// 跨平台確認彈窗輔助函式（完美相容 Web 與 手機）
const showConfirm = (title: string, message: string, onConfirm: () => void) => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: '取消', style: 'cancel' },
      { text: '確定', onPress: onConfirm },
    ]);
  }
};

const showAlert = (title: string, message?: string) => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.alert(message ? `${title}\n\n${message}` : title);
    }
  } else {
    Alert.alert(title, message);
  }
};

const copyToClipboard = async (text: string, successMsg: string) => {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      showAlert('已複製', successMsg);
      return;
    }
    showAlert('已複製', `${successMsg}\n\n${text}`);
  } catch {
    showAlert('邀請碼與連結', text);
  }
};

function MainApp() {
  const {
    currentLedger,
    ledgers,
    transactions,
    categories,
    members,
    currentUser,
    settlementInfo,
    exportToCSV,
    exportToJSON,
    addMember,
    updateMember,
    deleteMember,
    isCloudSynced,
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
    getCategoryById,
    refreshLedger,
    isPreviewMode,
    previewMember,
    startMemberPreview,
    exitMemberPreview,
    realIsOwner,
    realCurrentUser,
    lastBackupAt,
    autoBackupEnabled,
    autoBackupInterval,
    recordBackupComplete,
    updateAutoBackupConfig,
    liveToast,
    dismissLiveToast,
    triggerLiveToast,
    recentMerchants,
  } = useLedger();

  const [activeTab, setActiveTab] = useState<'transactions' | 'analytics' | 'family'>('transactions');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [memberModalVisible, setMemberModalVisible] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('👩');
  const [csvContent, setCsvContent] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReminderDismissed, setIsReminderDismissed] = useState(false);

  // 定期備份計算與過期檢測 (Option B)
  const daysSinceLastBackup = useMemo(() => {
    if (!lastBackupAt) return null;
    const lastDate = new Date(lastBackupAt);
    if (isNaN(lastDate.getTime())) return null;
    const diffMs = Date.now() - lastDate.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }, [lastBackupAt]);

  const isBackupDue = useMemo(() => {
    if (!autoBackupEnabled) return false;
    // 若從未備份過且已經有超過 5 筆交易，提示備份
    if (daysSinceLastBackup === null) return transactions.length >= 5;
    return daysSinceLastBackup >= autoBackupInterval;
  }, [autoBackupEnabled, daysSinceLastBackup, autoBackupInterval, transactions.length]);

  const showBackupBanner = isBackupDue && !isReminderDismissed;

  const formatLastBackupText = (isoString: string | null) => {
    if (!isoString) return '尚未進行過手動/雲端備份';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '尚未進行過手動/雲端備份';

    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    let relative = '';
    if (diffMins < 1) relative = '剛剛';
    else if (diffMins < 60) relative = `${diffMins} 分鐘前`;
    else if (diffHours < 24) relative = `${diffHours} 小時前`;
    else relative = `${diffDays} 天前`;

    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');

    return `${yyyy}/${mm}/${dd} ${hh}:${min} (${relative})`;
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshLedger();
    } catch (e) {
      console.warn('手動同步失敗:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  // 應用程式版本與熱更新狀態
  const APP_VERSION = appConfig.expo.version || '1.0.0';
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  // 當前與上一月份字串
  const currentMonthYm = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const lastMonthYm = useMemo(() => {
    const now = new Date();
    now.setDate(1);
    now.setMonth(now.getMonth() - 1);
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  // 收支明細篩選狀態 (方案 C：預設以當前月份為核心視角)
  const [filterMonth, setFilterMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [filterMemberId, setFilterMemberId] = useState<string>('all');
  const [filterModalType, setFilterModalType] = useState<'month' | 'member' | null>(null);

  // 方案 A：收支明細分批動態載入控制 (預設每批 40 筆，避免一次渲染大量元件導致掉幀)
  const PAGE_SIZE = 40;
  const [displayCount, setDisplayCount] = useState<number>(PAGE_SIZE);

  // 篩選條件改變時，自動重設顯示筆數回初始值
  useEffect(() => {
    setDisplayCount(PAGE_SIZE);
  }, [filterMonth, filterMemberId, searchQuery]);

  // 提取所有有記帳紀錄的歷史月份
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

  // 統計分頁之時間篩選狀態 (預設當前月份)
  const [analyticsMonth, setAnalyticsMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // 統計分頁任意月份選擇彈窗可見性
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);

  // 統計分頁之收支分類排行榜切換 ('expense' | 'income')
  const [analyticsCategoryType, setAnalyticsCategoryType] = useState<'expense' | 'income'>('expense');

  // 統計分頁選定時間之交易紀錄
  const analyticsTransactions = useMemo(() => {
    if (analyticsMonth === 'all') return transactions;
    return transactions.filter(t => {
      if (!t.transacted_at) return false;
      const d = new Date(t.transacted_at);
      if (isNaN(d.getTime())) return false;
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return ym === analyticsMonth;
    });
  }, [transactions, analyticsMonth]);

  // 統計分頁之動態彙總統計
  const analyticsSummary = useMemo(() => {
    let totalExpense = 0;
    let totalIncome = 0;
    const paidByMembers: Record<string, number> = {};

    members.forEach(m => {
      paidByMembers[m.id] = 0;
    });

    analyticsTransactions.forEach(t => {
      if (t.type === 'expense') {
        const amt = Number(t.amount) || 0;
        totalExpense += amt;
        const canonical = getMemberById(t.paid_by);
        const targetId = canonical ? canonical.id : t.paid_by;
        paidByMembers[targetId] = (paidByMembers[targetId] || 0) + amt;
      } else if (t.type === 'income') {
        totalIncome += Number(t.amount) || 0;
      }
    });

    return {
      totalExpense,
      totalIncome,
      netBalance: totalIncome - totalExpense,
      paidByMembers,
      count: analyticsTransactions.length,
    };
  }, [analyticsTransactions, members, getMemberById]);

  const analyticsMonthLabel = useMemo(() => {
    if (analyticsMonth === 'all') return '全部歷史累計';
    if (analyticsMonth === currentMonthYm) {
      const parts = currentMonthYm.split('-');
      return `本月 (${parts[0]}年${parseInt(parts[1], 10)}月)`;
    }
    if (analyticsMonth === lastMonthYm) {
      const parts = lastMonthYm.split('-');
      return `上月 (${parts[0]}年${parseInt(parts[1], 10)}月)`;
    }
    const found = availableMonths.find(m => m.ym === analyticsMonth);
    if (found) return found.label;
    if (analyticsMonth && analyticsMonth.includes('-')) {
      const parts = analyticsMonth.split('-');
      return `${parts[0]} 年 ${parseInt(parts[1], 10)} 月`;
    }
    return analyticsMonth;
  }, [analyticsMonth, currentMonthYm, lastMonthYm, availableMonths]);

  // 統計分頁之分類排行榜 (支援支出與收入切換，依金額由高到低降序排列，包含容錯保護)
  const analyticsCategoryRanking = useMemo(() => {
    const totalAmount =
      analyticsCategoryType === 'expense'
        ? analyticsSummary.totalExpense
        : analyticsSummary.totalIncome;

    if (totalAmount === 0) return [];

    const categoryMap = new Map<string, {
      id: string;
      name: string;
      icon: string;
      color: string;
      amount: number;
      count: number;
    }>();

    analyticsTransactions.forEach(t => {
      if (t.type === analyticsCategoryType) {
        const amt = Number(t.amount) || 0;
        if (amt <= 0) return;

        const resolvedCat = getCategoryById(t.category_id, t.category) || {
          id: 'uncategorized',
          name: '其他未分類',
          icon: 'tag',
          color: '#94A3B8',
          type: analyticsCategoryType,
          sort_order: 999,
        };

        const key = resolvedCat.id || resolvedCat.name || 'uncategorized';
        const existing = categoryMap.get(key);
        if (existing) {
          existing.amount += amt;
          existing.count += 1;
        } else {
          categoryMap.set(key, {
            id: key,
            name: resolvedCat.name || '其他未分類',
            icon: resolvedCat.icon || 'tag',
            color: resolvedCat.color || (analyticsCategoryType === 'income' ? '#10B981' : '#6366F1'),
            amount: amt,
            count: 1,
          });
        }
      }
    });

    return Array.from(categoryMap.values())
      .sort((a, b) => b.amount - a.amount)
      .map((item, index) => {
        const percentage = totalAmount > 0 ? Number(((item.amount / totalAmount) * 100).toFixed(1)) : 0;
        return {
          ...item,
          rank: index + 1,
          percentage,
        };
      });
  }, [analyticsTransactions, analyticsCategoryType, analyticsSummary.totalExpense, analyticsSummary.totalIncome, getCategoryById]);

  // 統計分頁之平均每日支出試算
  const dailyAverageExpense = useMemo(() => {
    if (analyticsSummary.totalExpense <= 0) return 0;

    const now = new Date();
    if (analyticsMonth === currentMonthYm) {
      const dayOfMonth = Math.max(1, now.getDate());
      return Math.round(analyticsSummary.totalExpense / dayOfMonth);
    }

    if (analyticsMonth !== 'all') {
      const parts = analyticsMonth.split('-');
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const daysInMonth = new Date(year, month, 0).getDate();
      return Math.round(analyticsSummary.totalExpense / (daysInMonth || 30));
    }

    // 全部歷史累計：若有交易，算首尾天數
    if (analyticsTransactions.length > 0) {
      const timestamps = analyticsTransactions
        .map(t => new Date(t.transacted_at).getTime())
        .filter(t => !isNaN(t));
      if (timestamps.length > 0) {
        const minT = Math.min(...timestamps);
        const maxT = Math.max(...timestamps);
        const daySpan = Math.max(1, Math.round((maxT - minT) / (1000 * 60 * 60 * 24)) + 1);
        return Math.round(analyticsSummary.totalExpense / daySpan);
      }
    }

    return Math.round(analyticsSummary.totalExpense / 30);
  }, [analyticsSummary.totalExpense, analyticsMonth, currentMonthYm, analyticsTransactions]);

  // 統計分頁之各成員付款排行與佔比 (依付款金額由高到低降序排列)
  const analyticsMemberPaymentRanking = useMemo(() => {
    const totalExp = analyticsSummary.totalExpense;

    // 給成員分配專屬調和色彩
    const MEMBER_PALETTE = ['#4F46E5', '#06B6D4', '#EC4899', '#F59E0B', '#10B981', '#8B5CF6', '#3B82F6', '#14B8A6'];

    return members
      .map((member, idx) => {
        const paid = analyticsSummary.paidByMembers[member.id] || 0;
        const ratioNum = totalExp > 0 ? (paid / totalExp) * 100 : 0;
        const ratio = ratioNum.toFixed(1);
        const color = MEMBER_PALETTE[idx % MEMBER_PALETTE.length];
        const isCurrent =
          currentUser.id === member.id ||
          (!!currentUser.display_name && currentUser.display_name === member.display_name);

        return {
          id: member.id,
          display_name: member.display_name,
          avatar_url: member.avatar_url,
          paid,
          ratioNum,
          ratio,
          color,
          isCurrent,
        };
      })
      .sort((a, b) => b.paid - a.paid)
      .map((item, index) => ({
        ...item,
        rank: index + 1,
      }));
  }, [members, analyticsSummary.paidByMembers, analyticsSummary.totalExpense, currentUser]);

  // 提取此帳本現有紀錄中的店家清單（供 1 鍵快速篩選）
  const activeMerchantsInLedger = useMemo(() => {
    const counts = new Map<string, number>();
    transactions.forEach(t => {
      const m = (t.merchant || '').trim();
      if (m) {
        counts.set(m, (counts.get(m) || 0) + 1);
      }
    });
    // 依出現頻率降序排列
    const fromTx = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([m]) => m);

    // 補上常用自學習店家
    const combined = Array.from(new Set([...fromTx, ...(recentMerchants || [])]));
    return combined.slice(0, 15);
  }, [transactions, recentMerchants]);

  // 依據選取的月份、成員與店家關鍵字進行即時篩選
  const filteredTransactions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return transactions.filter(t => {
      // 1. 月份篩選
      if (filterMonth !== 'all') {
        if (!t.transacted_at) return false;
        const d = new Date(t.transacted_at);
        if (isNaN(d.getTime())) return false;
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (ym !== filterMonth) return false;
      }

      // 2. 成員篩選
      if (filterMemberId !== 'all') {
        const payer = getMemberById(t.paid_by) || t.payer_profile;
        const isMatch = (payer && payer.id === filterMemberId) || t.paid_by === filterMemberId;
        if (!isMatch) return false;
      }

      // 3. 店家與關鍵字即時搜尋
      if (q) {
        const mMatch = t.merchant && t.merchant.toLowerCase().includes(q);
        const nMatch = t.note && t.note.toLowerCase().includes(q);
        const cat = getCategoryById(t.category_id, t.category);
        const cMatch = cat && cat.name.toLowerCase().includes(q);
        if (!mMatch && !nMatch && !cMatch) return false;
      }

      return true;
    });
  }, [transactions, filterMonth, filterMemberId, searchQuery, getMemberById, getCategoryById]);

  // 方案 A：依分批上限動態切片明細清單 (避免一次渲染過多元件)
  const displayedTransactions = useMemo(() => {
    return filteredTransactions.slice(0, displayCount);
  }, [filteredTransactions, displayCount]);

  // 判定是否偏離預設視角（預設視角為：當前月份 + 全部成員 + 無搜尋）
  const isFiltered = filterMonth !== currentMonthYm || filterMemberId !== 'all' || !!searchQuery.trim();

  // 當前檢視範圍之收支總計 (完全精確連動當前月份或指定篩選範圍)
  const activeFilterSummary = useMemo(() => {
    let totalExpense = 0;
    let totalIncome = 0;

    filteredTransactions.forEach(t => {
      if (t.type === 'expense') {
        totalExpense += Number(t.amount);
      } else if (t.type === 'income') {
        totalIncome += Number(t.amount);
      }
    });

    return {
      totalExpense,
      totalIncome,
      netBalance: totalIncome - totalExpense,
    };
  }, [filteredTransactions]);

  const displaySummary = activeFilterSummary;

  const selectedMember = members.find(m => m.id === filterMemberId);
  const selectedMonthObj = availableMonths.find(m => m.ym === filterMonth);

  const summaryCardTitle = useMemo(() => {
    if (searchQuery.trim()) {
      return `🔍「${searchQuery.trim()}」消費總覽`;
    }
    if (filterMonth === currentMonthYm && filterMemberId === 'all') {
      return '本月家庭總覽';
    }
    if (filterMonth === 'all' && filterMemberId === 'all') {
      return '全部歷史總覽';
    }
    const parts: string[] = [];
    if (filterMonth === 'all') {
      parts.push('全部歷史');
    } else if (selectedMonthObj) {
      parts.push(selectedMonthObj.label);
    } else if (filterMonth && filterMonth.includes('-')) {
      const p = filterMonth.split('-');
      parts.push(`${p[0]} 年 ${parseInt(p[1], 10)} 月`);
    }
    if (filterMemberId !== 'all' && selectedMember) {
      parts.push(selectedMember.display_name);
    }
    return `${parts.join(' ‧ ')} 總覽`;
  }, [filterMonth, filterMemberId, searchQuery, currentMonthYm, selectedMonthObj, selectedMember]);

  const resetFilters = () => {
    setFilterMonth(currentMonthYm);
    setFilterMemberId('all');
    setSearchQuery('');
  };

  // 記帳分類管理狀態
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);

  // 帳本更名狀態
  const [editLedgerModalVisible, setEditLedgerModalVisible] = useState(false);
  const [editLedgerNameInput, setEditLedgerNameInput] = useState('');

  // 編輯成員稱謂與頭像狀態
  const [editMemberModalVisible, setEditMemberModalVisible] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingMemberName, setEditingMemberName] = useState('');
  const [editingMemberAvatar, setEditingMemberAvatar] = useState('👨');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // 移轉帳目並刪除成員彈窗狀態
  const [memberToDelete, setMemberToDelete] = useState<Profile | null>(null);
  const [transferRecipientId, setTransferRecipientId] = useState<string>('');
  const [isDeletingMember, setIsDeletingMember] = useState(false);

  // 管理員安全 PIN 碼狀態
  const [adminPinInput, setAdminPinInput] = useState('');
  const [changePinModalVisible, setChangePinModalVisible] = useState(false);
  const [newPinInput, setNewPinInput] = useState('');
  const [showPinClear, setShowPinClear] = useState(false);
  const [claimAdminModalVisible, setClaimAdminModalVisible] = useState(false);
  const [claimAdminPinInput, setClaimAdminPinInput] = useState('');

  // 模式 A：帳本入口與邀請管理狀態
  const [createLedgerModalVisible, setCreateLedgerModalVisible] = useState(false);
  const [newLedgerName, setNewLedgerName] = useState('幸福家庭公帳');
  const [creatorNickname, setCreatorNickname] = useState('爸爸 (我)');
  const [creatorAvatar, setCreatorAvatar] = useState('👨');

  const [joinLedgerModalVisible, setJoinLedgerModalVisible] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinNickname, setJoinNickname] = useState('媽媽');
  const [joinAvatar, setJoinAvatar] = useState('👩');
  const [isJoining, setIsJoining] = useState(false);

  // 認領既有身分與預覽狀態
  const [previewLedgerName, setPreviewLedgerName] = useState<string>('');
  const [previewMembers, setPreviewMembers] = useState<any[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [isCreatingNewMember, setIsCreatingNewMember] = useState<boolean>(false);
  const [selectedClaimMember, setSelectedClaimMember] = useState<any | null>(null);

  const fetchInvitePreview = async (codeToQuery: string) => {
    const clean = codeToQuery.trim();
    if (!clean) return;
    setIsLoadingPreview(true);
    setSelectedClaimMember(null);
    try {
      const res = await previewInvite(clean);
      if (res.success) {
        setPreviewLedgerName(res.ledgerName || '家庭公帳');
        const mems = res.members || [];
        setPreviewMembers(mems);
        if (mems.length > 0) {
          setIsCreatingNewMember(false);
          setSelectedClaimMember(mems[0]);
        } else {
          setIsCreatingNewMember(true);
        }
      } else {
        setPreviewLedgerName('');
        setPreviewMembers([]);
        setIsCreatingNewMember(true);
      }
    } catch {
      setPreviewLedgerName('');
      setPreviewMembers([]);
      setIsCreatingNewMember(true);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const [customCodeModalVisible, setCustomCodeModalVisible] = useState(false);
  const [customCodeInput, setCustomCodeInput] = useState('');

  const [switchLedgerModalVisible, setSwitchLedgerModalVisible] = useState(false);
  const [switchCodeInput, setSwitchCodeInput] = useState('');

  // 當偵測到網址帶有邀請碼且尚未加入帳本時，自動彈出加入彈窗並填入代碼，自動載入帳本名稱與現有成員供直接認領
  useEffect(() => {
    if (pendingInviteCode && !hasJoinedLedger) {
      setJoinCodeInput(pendingInviteCode);
      setJoinLedgerModalVisible(true);
      fetchInvitePreview(pendingInviteCode);
      cancelPendingInvite();
    }
  }, [pendingInviteCode, hasJoinedLedger]);

  const [jsonContent, setJsonContent] = useState('');
  const [exportTab, setExportTab] = useState<'csv' | 'json'>('csv');

  // Web 端自動觸發檔案下載
  const downloadWebFile = (filename: string, content: string, mimeType: string) => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      try {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        recordBackupComplete();
        showAlert('下載成功', `已將備份檔「${filename}」下載至您的裝置！`);
        return true;
      } catch (err) {
        console.warn('下載失敗:', err);
      }
    }
    return false;
  };

  const handleOpenExportModal = (tab: 'csv' | 'json' = 'csv') => {
    const csv = exportToCSV();
    const json = exportToJSON();
    setCsvContent(csv);
    setJsonContent(json);
    setExportTab(tab);
    setExportModalVisible(true);
  };

  const handleCopyExportContent = async () => {
    const isCsv = exportTab === 'csv';
    const text = isCsv ? csvContent : jsonContent;
    await recordBackupComplete();
    copyToClipboard(
      text,
      isCsv
        ? '✅ CSV 報表內容已複製到剪貼簿！可直接貼上至 Excel 或 Google 試算表。'
        : '✅ JSON 完整結構備份已複製到剪貼簿！'
    );
  };

  const handleShareToCloud = async () => {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const isCsv = exportTab === 'csv';
    const filename = isCsv
      ? `甜心記帳本_${currentLedger.name || '家庭公帳'}_${dateStr}.csv`
      : `甜心記帳本_${currentLedger.name || '家庭公帳'}_完整備份_${dateStr}.json`;
    const content = isCsv ? csvContent : jsonContent;
    const mimeType = isCsv ? 'text/csv;charset=utf-8;' : 'application/json;charset=utf-8;';

    // 1. Web 環境
    if (Platform.OS === 'web') {
      // 若為支援 Web Share API 的手機瀏覽器 (如手機 Chrome 或 Safari)
      if (typeof navigator !== 'undefined' && typeof File !== 'undefined' && (navigator as any).canShare) {
        try {
          const file = new File([content], filename, { type: mimeType });
          if ((navigator as any).canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: filename,
              text: `甜心記帳本備份檔：${filename}`,
            });
            await recordBackupComplete();
            return;
          }
        } catch (e: any) {
          if (e.name === 'AbortError') return;
        }
      }

      // 電腦版或不支援 Web Share 的瀏覽器，直接下載檔案至電腦
      downloadWebFile(filename, content, mimeType);
      return;
    }

    // 2. 原生手機 App (Android / iOS) - 直接觸發系統面板存入 Google 雲端硬碟、iCloud 或 LINE
    try {
      await Share.share({
        title: filename,
        message: content,
      });
      await recordBackupComplete();
    } catch (err) {
      console.warn('原生呼叫分享失敗:', err);
      copyToClipboard(content, `已將備份內容複製到剪貼簿！可直接貼至 Google 雲端硬碟或備忘錄。`);
      await recordBackupComplete();
    }
  };

  const handleCheckForUpdates = async () => {
    if (Platform.OS === 'web') {
      showAlert('網頁版已是最新狀態', '網頁版在您每次開啟或重新整理網頁時，皆會自動載入最新程式碼與功能。');
      return;
    }

    if (!Updates.isEnabled) {
      showAlert(
        '目前為獨立安裝版 (APK)',
        '此安裝檔為獨立 APK 版本，未開啟 EAS OTA 遠端熱更新通道。\n\n若您有編譯新版 APK，重新下載安裝後即可啟用「免重新安裝即可遠端更新」功能！'
      );
      return;
    }
    try {
      setIsCheckingUpdate(true);
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        showConfirm(
          '發現新版本！',
          '雲端已發布最新功能更新，是否立即下載並重新啟動應用程式？',
          async () => {
            try {
              await Updates.fetchUpdateAsync();
              await Updates.reloadAsync();
            } catch (e: any) {
              showAlert('更新失敗', e.message || '下載更新時發生問題，請稍後再試');
            }
          }
        );
      } else {
        showAlert('已是最新版本', '目前 App 已運行最新的程式碼，無需更新！');
      }
    } catch (err: any) {
      showAlert('檢查更新完成', '目前已是最新版本，或暫無可用的遠端更新包。');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleAddMember = async () => {
    if (!isOwner) {
      showAlert('權限不足', '只有帳本管理員才能新增家庭成員');
      return;
    }
    if (!newMemberName.trim()) {
      showAlert('請輸入姓名', '成員名稱不能為空');
      return;
    }
    await addMember(newMemberName.trim(), selectedAvatar);
    setNewMemberName('');
    setMemberModalVisible(false);
  };

  const handleStartEditMember = (member: any) => {
    const isCurrent = currentUser.id === member.id || (!!currentUser.display_name && currentUser.display_name === member.display_name);
    if (!isCurrent && !isOwner) {
      showAlert('權限不足', '只有本機成員或帳本管理員才允許編輯該成員稱謂');
      return;
    }
    setEditingMemberId(member.id);
    setEditingMemberName(member.display_name);
    setEditingMemberAvatar(member.avatar_url || '👨');
    setEditMemberModalVisible(true);
  };

  const handleSaveEditMember = async () => {
    if (!editingMemberName.trim()) {
      showAlert('請輸入姓名', '成員名稱不能為空');
      return;
    }
    if (!editingMemberId) return;

    const targetMember = members.find(m => m.id === editingMemberId);
    const isCurrent = editingMemberId === currentUser.id || (!!targetMember && !!currentUser.display_name && targetMember.display_name === currentUser.display_name);
    if (!isCurrent && !isOwner) {
      showAlert('權限不足', '只有本機成員或帳本管理員才允許編輯此稱謂');
      return;
    }

    setIsSavingEdit(true);
    const success = await updateMember(editingMemberId, editingMemberName.trim(), editingMemberAvatar);
    setIsSavingEdit(false);

    if (success) {
      setEditMemberModalVisible(false);
      showAlert('修改成功！', `成員資料已更新為「${editingMemberName.trim()}」！\n全家裝置與歷史記帳皆已同步。`);
    } else {
      showAlert('修改失敗', '儲存時發生錯誤，請稍後重試');
    }
  };

  const handleCreateLedger = async () => {
    if (!newLedgerName.trim()) {
      showAlert('請輸入帳本名稱', '帳本名稱不能為空');
      return;
    }
    await createLedger(newLedgerName.trim(), creatorNickname.trim() || '爸爸 (我)', creatorAvatar);
    setCreateLedgerModalVisible(false);
    showAlert('建立成功！', `已建立「${newLedgerName.trim()}」！\n系統已為您產生專屬邀請碼，可至「家庭與備份」分享給家人。`);
  };

  const handleJoinLedger = async () => {
    if (!joinCodeInput.trim()) {
      showAlert('請輸入邀請碼', '請輸入家人提供的 4~8 碼邀請碼或貼上邀請連結');
      return;
    }
    setIsJoining(true);
    const res = await joinLedgerByCode(joinCodeInput.trim(), joinNickname.trim() || '家庭成員', joinAvatar);
    setIsJoining(false);
    if (res.success) {
      setJoinLedgerModalVisible(false);
      showAlert('成功加入！', '已成功進入家庭公帳！');
    } else {
      showAlert('加入失敗', res.message || '找不到此邀請碼對應的帳本，請確認代碼是否正確。');
    }
  };

  const handleSwitchLedger = async () => {
    if (!switchCodeInput.trim()) {
      showAlert('請輸入邀請碼', '請輸入目標帳本的邀請碼或完整邀請連結');
      return;
    }
    setIsJoining(true);
    const res = await joinLedgerByCode(switchCodeInput.trim(), currentUser.display_name, currentUser.avatar_url);
    setIsJoining(false);
    if (res.success) {
      setSwitchLedgerModalVisible(false);
      showAlert('切換成功', '已成功切換至目標家庭帳本！');
    } else {
      showAlert('切換失敗', res.message || '找不到此邀請碼對應的帳本，請確認代碼是否正確。');
    }
  };

  const renderEditMemberModal = () => {
    if (!editMemberModalVisible || !editingMemberId) return null;
    const targetMember = members.find(m => m.id === editingMemberId);
    if (!targetMember) return null;

    const isCurrent =
      editingMemberId === currentUser.id ||
      (!!targetMember && !!currentUser.display_name && targetMember.display_name === currentUser.display_name);
    const isCreator = currentLedger.created_by === targetMember.id;
    const isMemberAdmin =
      targetMember.role === 'owner' ||
      targetMember.role === 'admin' ||
      currentLedger.created_by === targetMember.id;

    return (
      <Modal visible={editMemberModalVisible} animationType="fade" transparent onRequestClose={() => setEditMemberModalVisible(false)}>
        <View style={styles.exportOverlay}>
          <View style={styles.exportCard}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.exportTitle}>👤 成員資訊與設定</Text>
                <Text style={styles.formHint}>
                  {isCurrent
                    ? '📱 這是您在本機登入的家庭身分'
                    : isCreator
                    ? '👑 此成員為帳本原始創建者'
                    : isMemberAdmin
                    ? '👑 此成員為共同管理員'
                    : '此成員為一般家庭成員'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setEditMemberModalVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ width: '100%' }}>
              <Text style={styles.formLabel}>成員暱稱 / 稱謂</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="例如：張三、爸爸、媽媽..."
                placeholderTextColor="#9CA3AF"
                value={editingMemberName}
                onChangeText={setEditingMemberName}
                autoFocus={false}
              />

              <Text style={styles.formLabel}>選擇專屬頭像</Text>
              <AvatarPicker
                selectedAvatar={editingMemberAvatar}
                onSelectAvatar={setEditingMemberAvatar}
              />

              <TouchableOpacity
                style={styles.submitMemberBtn}
                disabled={isSavingEdit}
                onPress={handleSaveEditMember}
              >
                <Text style={styles.submitMemberBtnText}>
                  {isSavingEdit ? '正在儲存...' : '💾 儲存修改'}
                </Text>
              </TouchableOpacity>

              {/* 若在預覽模式中：在彈窗內提供大按鈕隨時結束預覽返回管理員 */}
              {isPreviewMode && (
                <View style={{ marginTop: 14 }}>
                  <TouchableOpacity
                    style={[styles.modalPreviewBtn, { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }]}
                    onPress={() => {
                      setEditMemberModalVisible(false);
                      exitMemberPreview();
                      showAlert('已結束預覽', '已安全切回管理員身分！');
                    }}
                  >
                    <Text style={[styles.modalPreviewBtnText, { color: '#B91C1C' }]}>
                      ✕ 結束預覽，返回管理員
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* 角色預覽與測試視角：僅管理員且對象非自己時可使用 */}
              {realIsOwner && !isCurrent && targetMember && (
                <View style={styles.modalMemberAdminSection}>
                  <View style={styles.memberSectionDivider} />

                  <Text style={styles.formLabel}>👀 測試與角色體驗</Text>
                  <Text style={styles.modalSubHint}>
                    您可以暫時切換為「{targetMember.display_name}」的視角，測試各項功能對一般成員的影響。測試中隨時可在頂部橫幅一鍵切回管理員。
                  </Text>
                  <TouchableOpacity
                    style={styles.modalPreviewBtn}
                    onPress={() => {
                      setEditMemberModalVisible(false);
                      startMemberPreview(targetMember);
                      showAlert(
                        '已進入成員預覽模式',
                        `目前已切換為「${targetMember.display_name}」視角！\n\n・全 App 介面已模擬為一般成員權限\n・記帳時付款人將預設帶入「${targetMember.display_name}」\n・測試完畢後，點擊畫面頂部橫幅「結束預覽」即可瞬間切回管理員。`
                      );
                    }}
                  >
                    <Text style={styles.modalPreviewBtnText}>👀 以此成員視角預覽 (測試功能)</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* 共同管理員角色切換與刪除：僅管理員且對象非自己、非建立者時可調整 */}
              {isOwner && !isCurrent && !isCreator && (
                <View style={styles.modalMemberAdminSection}>
                  <View style={styles.memberSectionDivider} />

                  <Text style={styles.formLabel}>管理員權限設定</Text>
                  <Text style={styles.modalSubHint}>
                    {isMemberAdmin
                      ? '該成員目前具備管理員權限，可協助管理帳本、編輯成員與邀請碼。'
                      : '設為共同管理員後，該成員也可以協助管理帳本與成員。'}
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.modalRoleToggleBtn,
                      isMemberAdmin ? styles.modalRoleToggleBtnDemote : styles.modalRoleToggleBtnPromote,
                    ]}
                    onPress={() => {
                      if (isMemberAdmin) {
                        showConfirm(
                          '取消管理員權限',
                          `確定要將「${targetMember.display_name}」降為一般成員嗎？`,
                          async () => {
                            await updateMemberRole(targetMember.id, 'member');
                            setEditMemberModalVisible(false);
                            showAlert('更新成功', `已將「${targetMember.display_name}」降為一般成員。`);
                          }
                        );
                      } else {
                        showConfirm(
                          '設為共同管理員',
                          `確定要將「${targetMember.display_name}」設為這本帳本的共同管理員嗎？\n成為管理員後，該成員也可以刪除成員並管理家庭邀請碼。`,
                          async () => {
                            await updateMemberRole(targetMember.id, 'owner');
                            setEditMemberModalVisible(false);
                            showAlert('設定成功', `已將「${targetMember.display_name}」設為共同管理員！`);
                          }
                        );
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.modalRoleToggleBtnText,
                        isMemberAdmin ? styles.modalRoleToggleBtnTextDemote : styles.modalRoleToggleBtnTextPromote,
                      ]}
                    >
                      {isMemberAdmin ? '⬇️ 降為一般成員' : '👑 設為共同管理員'}
                    </Text>
                  </TouchableOpacity>

                  {/* 刪除成員：身為管理員且對象非自己、非建立者、成員數 > 1 */}
                  {members.length > 1 && (
                    <View style={{ marginTop: 14 }}>
                      <Text style={styles.formLabel}>移除家庭成員</Text>
                      <TouchableOpacity
                        style={styles.modalDeleteBtn}
                        onPress={() => {
                          setEditMemberModalVisible(false);
                          const paidTxs = transactions.filter(
                            t => (getMemberById(t.paid_by)?.id || t.paid_by) === targetMember.id
                          );
                          const paidTotal = paidTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0);
                          if (paidTotal > 0) {
                            setMemberToDelete(targetMember);
                            setTransferRecipientId(currentUser.id);
                          } else {
                            showConfirm(
                              '刪除成員',
                              `確定要將「${targetMember.display_name}」從家庭名冊移除嗎？`,
                              () => deleteMember(targetMember.id)
                            );
                          }
                        }}
                      >
                        <Text style={styles.modalDeleteBtnText}>🗑️ 移轉帳目並從家庭移除</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  const renderTransferDeleteModal = () => {
    if (!memberToDelete) return null;
    const paidTxs = transactions.filter(t => (getMemberById(t.paid_by)?.id || t.paid_by) === memberToDelete.id);
    const paidTotal = paidTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const eligibleRecipients = members.filter(m => m.id !== memberToDelete.id);
    const selectedRecipient = members.find(m => m.id === transferRecipientId);

    return (
      <Modal visible={!!memberToDelete} animationType="fade" transparent>
        <View style={styles.exportOverlay}>
          <View style={styles.exportCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.exportTitle}>🔄 移轉帳目並刪除成員</Text>
              <TouchableOpacity
                onPress={() => {
                  if (!isDeletingMember) setMemberToDelete(null);
                }}
                style={styles.closeBtn}
              >
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* 提示說明 */}
            <View style={styles.transferAlertBox}>
              <Text style={styles.transferAlertTitle}>⚠️ 包含付款紀錄</Text>
              <Text style={styles.transferAlertDesc}>
                成員「{memberToDelete.display_name}」尚有{' '}
                <Text style={{ fontWeight: '700', color: '#B45309' }}>{paidTxs.length}</Text> 筆付款紀錄（合計{' '}
                <Text style={{ fontWeight: '700', color: '#B45309' }}>NT$ {paidTotal.toLocaleString()}</Text>）。
              </Text>
              <Text style={[styles.transferAlertDesc, { marginTop: 4 }]}>
                為保持家庭公帳的收支平衡與歷史完整性，請選擇由哪位家人接收並承接這些款項：
              </Text>
            </View>

            <Text style={styles.formLabel}>選擇帳目承接人：</Text>
            <ScrollView style={{ maxHeight: 220, marginBottom: 16 }} showsVerticalScrollIndicator={false}>
              <View style={{ gap: 8 }}>
                {eligibleRecipients.map(m => {
                  const isSelected = transferRecipientId === m.id;
                  const isCurrent = m.id === currentUser.id;
                  const isOwnerRole = m.role === 'owner';
                  return (
                    <TouchableOpacity
                      key={m.id}
                      style={[
                        styles.transferRecipientCard,
                        isSelected && styles.transferRecipientCardActive,
                      ]}
                      onPress={() => setTransferRecipientId(m.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.transferRecipientAvatar}>{m.avatar_url || '👤'}</Text>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text
                            style={[
                              styles.transferRecipientName,
                              isSelected && styles.transferRecipientNameActive,
                            ]}
                            numberOfLines={1}
                          >
                            {m.display_name}
                          </Text>
                          {isCurrent && (
                            <View style={styles.meTransferBadge}>
                              <Text style={styles.meTransferBadgeText}>我 (本機)</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.transferRecipientSub}>
                          {isOwnerRole ? '👑 管理員' : '👤 家庭成員'}
                        </Text>
                      </View>
                      <View style={[styles.radioCircle, isSelected && styles.radioCircleActive]}>
                        {isSelected && <View style={styles.radioDot} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[
                styles.submitMemberBtn,
                (!transferRecipientId || isDeletingMember) && { opacity: 0.6 },
              ]}
              disabled={!transferRecipientId || isDeletingMember}
              onPress={async () => {
                if (!memberToDelete || !transferRecipientId) return;
                if (!isOwner) {
                  showAlert('權限不足', '只有帳本管理員才能刪除家庭成員');
                  return;
                }
                setIsDeletingMember(true);
                try {
                  const targetName = selectedRecipient?.display_name || '指定成員';
                  const sourceName = memberToDelete.display_name;
                  const success = await deleteMember(memberToDelete.id, transferRecipientId);
                  if (success) {
                    setMemberToDelete(null);
                    showAlert(
                      '移轉並刪除成功',
                      `已將「${sourceName}」的 ${paidTxs.length} 筆付款紀錄移交給「${targetName}」，並已將該成員從家庭名冊移除。`
                    );
                  }
                } finally {
                  setIsDeletingMember(false);
                }
              }}
            >
              <Text style={styles.submitMemberBtnText}>
                {isDeletingMember
                  ? '正在移交帳目並刪除...'
                  : `🔄 確認移交給「${selectedRecipient?.display_name || '...'}」並移除成員`}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelTransferBtn}
              onPress={() => {
                if (!isDeletingMember) setMemberToDelete(null);
              }}
            >
              <Text style={styles.cancelTransferBtnText}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  const renderCreateLedgerModal = () => (
    <Modal visible={createLedgerModalVisible} animationType="fade" transparent>
      <View style={styles.exportOverlay}>
        <View style={styles.exportCard}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.exportTitle}>🏠 建立新的家庭公帳</Text>
            <TouchableOpacity onPress={() => setCreateLedgerModalVisible(false)} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ width: '100%' }}>
            <Text style={styles.formHint}>建立專屬帳本後，您將成為管理員，可隨時分享邀請碼給家人加入。</Text>

            <Text style={styles.formLabel}>公帳名稱</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="例如：幸福家庭公帳、我們這一家"
              placeholderTextColor="#9CA3AF"
              value={newLedgerName}
              onChangeText={setNewLedgerName}
            />

            <Text style={styles.formLabel}>您的暱稱 / 稱謂</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="例如：爸爸、媽媽、大寶..."
              placeholderTextColor="#9CA3AF"
              value={creatorNickname}
              onChangeText={setCreatorNickname}
            />

            <Text style={styles.formLabel}>選擇您的頭像</Text>
            <AvatarPicker
              selectedAvatar={creatorAvatar}
              onSelectAvatar={setCreatorAvatar}
            />

            <TouchableOpacity style={styles.submitMemberBtn} onPress={handleCreateLedger}>
              <Text style={styles.submitMemberBtnText}>🚀 確認建立並進入帳本</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const renderJoinLedgerModal = () => (
    <Modal visible={joinLedgerModalVisible} animationType="fade" transparent>
      <View style={styles.exportOverlay}>
        <View style={styles.exportCard}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.exportTitle}>🔗 加入家庭公帳</Text>
            <TouchableOpacity onPress={() => setJoinLedgerModalVisible(false)} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ width: '100%' }}>
            {/* 帳本名稱預覽或代碼輸入 */}
          {previewLedgerName ? (
            <View style={styles.invitePreviewHeader}>
              <View style={styles.invitePreviewIconBox}>
                <Text style={{ fontSize: 24 }}>🏠</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.invitePreviewLedgerName} numberOfLines={1}>{previewLedgerName}</Text>
                <Text style={styles.invitePreviewCodeText}>邀請碼：{joinCodeInput}</Text>
              </View>
              <TouchableOpacity
                style={styles.changeCodeBtn}
                onPress={() => {
                  setPreviewLedgerName('');
                  setPreviewMembers([]);
                  setIsCreatingNewMember(true);
                }}
              >
                <Text style={styles.changeCodeBtnText}>更換代碼</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ marginBottom: 12 }}>
              <Text style={styles.formHint}>請輸入家人提供的 4~8 碼邀請代碼（例如 FAM-8823），或直接貼上 LINE 邀請網址：</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <TextInput
                  style={[styles.modalInput, { flex: 1, marginBottom: 0 }]}
                  placeholder="例如：FAM-8823 或貼上連結"
                  placeholderTextColor="#9CA3AF"
                  value={joinCodeInput}
                  onChangeText={setJoinCodeInput}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={styles.queryPreviewBtn}
                  disabled={isLoadingPreview || !joinCodeInput.trim()}
                  onPress={() => fetchInvitePreview(joinCodeInput)}
                >
                  <Text style={styles.queryPreviewBtnText}>
                    {isLoadingPreview ? '查詢中...' : '查詢'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {isLoadingPreview && (
            <View style={{ paddingVertical: 20, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, color: '#6366F1', fontWeight: '600' }}>🔍 正在載入帳本與成員資訊...</Text>
            </View>
          )}

          {/* 若有現有成員可認領，且目前不是「建立新成員」模式 */}
          {!isLoadingPreview && previewMembers.length > 0 && !isCreatingNewMember && (
            <View style={{ marginTop: 4 }}>
              <Text style={styles.claimSectionTitle}>請問您是哪位家庭成員？</Text>
              <Text style={styles.claimSectionDesc}>
                若是換手機、用電腦開啟、或家人已先建立名單，點選即可直接認領身分，不會重複建立成員！
              </Text>

              <ScrollView style={{ maxHeight: 200, marginVertical: 8 }} showsVerticalScrollIndicator={false}>
                <View style={styles.claimGrid}>
                  {previewMembers.map(m => {
                    const isSelected = selectedClaimMember?.id === m.id;
                    const isMAdmin = m.role === 'owner' || m.role === 'admin';
                    return (
                      <TouchableOpacity
                        key={m.id}
                        style={[styles.claimMemberCard, isSelected && styles.claimMemberCardActive]}
                        onPress={() => {
                          setSelectedClaimMember(m);
                          setAdminPinInput('');
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.claimMemberAvatar}>{m.avatar_url || '👤'}</Text>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.claimMemberName, isSelected && styles.claimMemberNameActive]} numberOfLines={1}>
                            {m.display_name}
                          </Text>
                          <Text style={styles.claimMemberRoleText}>
                            {isMAdmin ? '👑 管理員 (需PIN碼)' : '👤 家庭成員'}
                          </Text>
                        </View>
                        {isSelected && (
                          <View style={styles.claimCheckedBadge}>
                            <Text style={styles.claimCheckedText}>✓ 我是此成員</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              {/* 若選擇的是管理員身分，顯示 PIN 碼輸入防護 */}
              {selectedClaimMember && (selectedClaimMember.role === 'owner' || selectedClaimMember.role === 'admin') && (
                <View style={styles.adminPinPromptBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={{ fontSize: 16, marginRight: 6 }}>🔐</Text>
                    <Text style={styles.adminPinPromptTitle}>管理員身分安全驗證</Text>
                  </View>
                  <Text style={styles.adminPinPromptDesc}>
                    「{selectedClaimMember.display_name}」具備管理員權限，請輸入 4 位數安全 PIN 碼（預設為 8888）：
                  </Text>
                  <TextInput
                    style={styles.adminPinInput}
                    placeholder="請輸入管理員 PIN 碼 (預設 8888)"
                    placeholderTextColor="#9CA3AF"
                    value={adminPinInput}
                    onChangeText={setAdminPinInput}
                    keyboardType="number-pad"
                    maxLength={8}
                    secureTextEntry
                  />
                </View>
              )}

              <TouchableOpacity
                style={[styles.submitMemberBtn, (!selectedClaimMember || isJoining) && { opacity: 0.6 }]}
                disabled={!selectedClaimMember || isJoining}
                onPress={async () => {
                  if (!selectedClaimMember) return;
                  const isClaimingAdmin = selectedClaimMember.role === 'owner' || selectedClaimMember.role === 'admin';
                  if (isClaimingAdmin && !adminPinInput.trim()) {
                    showAlert('請輸入管理員 PIN 碼', '此身分具備管理員特權，請輸入 4 位數安全 PIN 碼（預設 8888）。\n\n若您是一般家庭成員，請直接點選其他成員或建立新身分。');
                    return;
                  }
                  setIsJoining(true);
                  const res = await joinLedgerByCode(
                    joinCodeInput.trim(),
                    undefined,
                    undefined,
                    selectedClaimMember,
                    adminPinInput.trim()
                  );
                  setIsJoining(false);
                  if (res.success) {
                    setJoinLedgerModalVisible(false);
                    setAdminPinInput('');
                    showAlert('加入成功！', `已成功以「${selectedClaimMember.display_name}」身分進入「${previewLedgerName || '家庭帳本'}」！`);
                  } else {
                    showAlert('驗證失敗', res.message || '加入帳本失敗，請確認代碼或 PIN 碼是否正確');
                  }
                }}
              >
                <Text style={styles.submitMemberBtnText}>
                  {isJoining
                    ? '正在認領並進入...'
                    : selectedClaimMember
                    ? `🚀 以「${selectedClaimMember.display_name}」身分進入帳本`
                    : '請先點選上方的身分'}
                </Text>
              </TouchableOpacity>

              <View style={styles.orDividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>或</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity
                style={styles.switchCreateMemberBtn}
                onPress={() => {
                  setIsCreatingNewMember(true);
                  if (!joinNickname) setJoinNickname('');
                }}
              >
                <Text style={styles.switchCreateMemberBtnText}>➕ 我是新加入的家人（建立新稱謂）</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 建立新成員模式（或初次無成員可選時） */}
          {!isLoadingPreview && (isCreatingNewMember || previewMembers.length === 0) && (
            <View style={{ marginTop: 4 }}>
              {previewMembers.length > 0 && (
                <TouchableOpacity
                  style={styles.backToClaimBtn}
                  onPress={() => setIsCreatingNewMember(false)}
                >
                  <Text style={styles.backToClaimBtnText}>← 返回選擇現有家庭成員</Text>
                </TouchableOpacity>
              )}

              <Text style={styles.formLabel}>您的暱稱 / 稱謂</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="例如：媽媽、大寶、奶奶..."
                placeholderTextColor="#9CA3AF"
                value={joinNickname}
                onChangeText={setJoinNickname}
                autoFocus={Platform.OS !== 'web'}
              />

              <Text style={styles.formLabel}>選擇您的頭像</Text>
              <AvatarPicker
                selectedAvatar={joinAvatar}
                onSelectAvatar={setJoinAvatar}
              />

              <TouchableOpacity
                style={styles.submitMemberBtn}
                disabled={isJoining}
                onPress={async () => {
                  if (!joinCodeInput.trim()) {
                    showAlert('請輸入邀請碼', '請輸入邀請碼或貼上邀請連結');
                    return;
                  }
                  if (!joinNickname.trim()) {
                    showAlert('請輸入暱稱', '請輸入您的暱稱或稱謂');
                    return;
                  }
                  setIsJoining(true);
                  const res = await joinLedgerByCode(joinCodeInput.trim(), joinNickname.trim(), joinAvatar);
                  setIsJoining(false);
                  if (res.success) {
                    setJoinLedgerModalVisible(false);
                    showAlert('加入成功！', `已成功以「${joinNickname.trim()}」加入家庭帳本！`);
                  } else {
                    showAlert('加入失敗', res.message || '加入帳本失敗，請確認代碼');
                  }
                }}
              >
                <Text style={styles.submitMemberBtnText}>
                  {isJoining ? '正在建立並加入...' : '✨ 建立新身分並加入帳本'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const renderPendingInviteModal = () => (
    <Modal visible={!!pendingInviteCode} animationType="fade" transparent>
      <View style={styles.exportOverlay}>
        <View style={styles.exportCard}>
          <Text style={styles.exportTitle}>💌 收到家庭帳本邀請！</Text>
          <Text style={styles.formHint}>
            系統偵測到來自邀請碼【{pendingInviteCode}】的加入邀請。
            您目前已在「{currentLedger.name}」，是否要切換至該家庭帳本？
          </Text>

          <View style={styles.pendingInviteButtons}>
            <TouchableOpacity
              style={styles.confirmInviteBtn}
              onPress={() => {
                if (pendingInviteCode) {
                  const code = pendingInviteCode;
                  setJoinCodeInput(code);
                  setJoinLedgerModalVisible(true);
                  fetchInvitePreview(code);
                  cancelPendingInvite();
                }
              }}
            >
              <Text style={styles.confirmInviteBtnText}>✅ 選擇成員身分並切換</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelInviteBtn} onPress={cancelPendingInvite}>
              <Text style={styles.cancelInviteBtnText}>✕ 保留現有帳本 (取消)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderEditLedgerModal = () => (
    <Modal visible={editLedgerModalVisible} animationType="fade" transparent>
      <View style={styles.exportOverlay}>
        <View style={styles.exportCard}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.exportTitle}>✏️ 修改家庭公帳名稱</Text>
            <TouchableOpacity onPress={() => setEditLedgerModalVisible(false)} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.formHint}>
            身為管理員，您可以隨時更新帳本名稱。修改後，所有已加入此帳本的家人手機都會即時同步更新。
          </Text>

          <Text style={styles.formLabel}>新帳本名稱 (例如：陳家幸福公帳)</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="請輸入新帳本名稱"
            placeholderTextColor="#9CA3AF"
            value={editLedgerNameInput}
            onChangeText={setEditLedgerNameInput}
            maxLength={30}
          />

          <TouchableOpacity
            style={styles.submitMemberBtn}
            onPress={async () => {
              if (!editLedgerNameInput.trim()) {
                showAlert('請輸入名稱', '帳本名稱不能為空');
                return;
              }
              const success = await updateLedgerName(editLedgerNameInput.trim());
              if (success) {
                showAlert('修改成功', `帳本名稱已變更為「${editLedgerNameInput.trim()}」！`);
                setEditLedgerModalVisible(false);
              }
            }}
          >
            <Text style={styles.submitMemberBtnText}>確認變更名稱</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderCustomCodeModal = () => (
    <Modal visible={customCodeModalVisible} animationType="fade" transparent>
      <View style={styles.exportOverlay}>
        <View style={styles.exportCard}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.exportTitle}>✏️ 自訂專屬邀請碼</Text>
            <TouchableOpacity onPress={() => setCustomCodeModalVisible(false)} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.formHint}>
            身為發起人，您可以將邀請碼改成好記的英數字（3～15 個字元），例如 SWEETHOME、OURFAMILY。
          </Text>

          <Text style={styles.formLabel}>新邀請碼 (自動轉為大寫)</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="例如：SWEETHOME"
            placeholderTextColor="#9CA3AF"
            value={customCodeInput}
            autoCapitalize="characters"
            onChangeText={(t) => setCustomCodeInput(t.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
          />

          <TouchableOpacity
            style={styles.submitMemberBtn}
            onPress={async () => {
              if (!customCodeInput.trim()) {
                showAlert('請輸入代碼', '邀請碼不能為空');
                return;
              }
              const success = await updateInviteCode(customCodeInput.trim());
              if (success) {
                showAlert('更新成功', `家庭邀請碼已變更為：${customCodeInput.trim().toUpperCase()}`);
                setCustomCodeModalVisible(false);
              }
            }}
          >
            <Text style={styles.submitMemberBtnText}>確認變更邀請碼</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderChangePinModal = () => (
    <Modal visible={changePinModalVisible} animationType="fade" transparent>
      <View style={styles.exportOverlay}>
        <View style={styles.exportCard}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.exportTitle}>🔐 修改管理員安全 PIN 碼</Text>
            <TouchableOpacity onPress={() => setChangePinModalVisible(false)} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.formHint}>
            請設定 4 至 8 位數字 PIN 碼。未來在其他手機或新電腦以「👑 管理員」身分認領時，需輸入此 PIN 碼，防止他人誤認領或奪權。
          </Text>

          <Text style={styles.formLabel}>新管理員 PIN 碼 (4~8 位純數字)</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="例如：1234 或 8888"
            placeholderTextColor="#9CA3AF"
            value={newPinInput}
            keyboardType="number-pad"
            maxLength={8}
            onChangeText={(t) => setNewPinInput(t.replace(/[^0-9]/g, ''))}
          />

          <TouchableOpacity
            style={styles.submitMemberBtn}
            onPress={async () => {
              if (newPinInput.length < 4 || newPinInput.length > 8) {
                showAlert('格式不符', 'PIN 碼長度需在 4 至 8 位純數字之間');
                return;
              }
              const ok = await updateAdminPin(newPinInput);
              if (ok) {
                showAlert('修改成功', `管理員安全 PIN 碼已成功變更為：${newPinInput}`);
                setChangePinModalVisible(false);
              }
            }}
          >
            <Text style={styles.submitMemberBtnText}>確認變更 PIN 碼</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderClaimAdminModal = () => (
    <Modal visible={claimAdminModalVisible} animationType="fade" transparent>
      <View style={styles.exportOverlay}>
        <View style={styles.exportCard}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.exportTitle}>🔐 取得/恢復管理員權限</Text>
            <TouchableOpacity onPress={() => setClaimAdminModalVisible(false)} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.formHint}>
            請輸入本家庭公帳的 4 位數管理員安全 PIN 碼（預設為 8888）。驗證通過後，此手機將立即獲得管理員特權。
          </Text>

          <Text style={styles.formLabel}>管理員安全 PIN 碼</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="請輸入 4 位數 PIN 碼 (預設 8888)"
            placeholderTextColor="#9CA3AF"
            value={claimAdminPinInput}
            keyboardType="number-pad"
            maxLength={8}
            secureTextEntry
            onChangeText={setClaimAdminPinInput}
          />

          <TouchableOpacity
            style={styles.submitMemberBtn}
            onPress={async () => {
              if (!claimAdminPinInput.trim()) {
                showAlert('請輸入 PIN 碼', '請輸入管理員 4 位數安全 PIN 碼');
                return;
              }
              const res = await claimAdminRoleWithPin(claimAdminPinInput.trim());
              if (res.success) {
                setClaimAdminModalVisible(false);
                setClaimAdminPinInput('');
                showAlert('身分升級成功！', '您已成功取得此家庭公帳的管理員權限！');
              } else {
                showAlert('驗證失敗', res.message || 'PIN 碼錯誤，無法取得管理員權限');
              }
            }}
          >
            <Text style={styles.submitMemberBtnText}>確認驗證並取得管理員權限</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderSwitchLedgerModal = () => (
    <Modal visible={switchLedgerModalVisible} animationType="fade" transparent>
      <View style={styles.exportOverlay}>
        <View style={styles.exportCard}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.exportTitle}>🚪 加入或切換家庭公帳</Text>
            <TouchableOpacity onPress={() => setSwitchLedgerModalVisible(false)} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            {ledgers.length > 1 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.formLabel}>📚 您已加入的帳本清單 (點擊可切換)</Text>
                {ledgers.map((l) => {
                  const isCurrent = l.id === currentLedger.id;
                  return (
                    <View
                      key={l.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: isCurrent ? '#EEF2FF' : '#F9FAFB',
                        borderColor: isCurrent ? '#4F46E5' : '#E5E7EB',
                        borderWidth: isCurrent ? 2 : 1,
                        borderRadius: 12,
                        padding: 12,
                        marginBottom: 10,
                      }}
                    >
                      <TouchableOpacity
                        style={{ flex: 1 }}
                        onPress={async () => {
                          if (!isCurrent) {
                            await switchLedgerById(l.id);
                            setSwitchLedgerModalVisible(false);
                            showAlert('切換成功', `已切換至「${l.name}」！`);
                          }
                        }}
                      >
                        <Text style={{ fontSize: 15, fontWeight: '700', color: isCurrent ? '#4F46E5' : '#1F2937' }}>
                          {l.name} {isCurrent ? '（使用中 ✓）' : ''}
                        </Text>
                        <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 3 }}>
                          身分：{l.userRole === 'owner' ? '👑 管理員 (Owner)' : '👤 成員'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          backgroundColor: '#FEE2E2',
                          borderRadius: 8,
                          marginLeft: 8,
                        }}
                        onPress={() => {
                          showConfirm(
                            '退出此帳本',
                            `確定要退出「${l.name}」嗎？退出後該帳本將從您的帳本清單中移除。`,
                            async () => {
                              await leaveLedgerById(l.id);
                              if (isCurrent) {
                                setSwitchLedgerModalVisible(false);
                              }
                            }
                          );
                        }}
                      >
                        <Text style={{ fontSize: 12, color: '#EF4444', fontWeight: 'bold' }}>退出</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}

                <View style={styles.orDividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>或輸入新邀請碼</Text>
                  <View style={styles.dividerLine} />
                </View>
              </View>
            )}

            <Text style={styles.formHint}>
              若您想加入其他家庭帳本，請輸入家人提供的邀請碼或貼上完整 LINE 邀請連結：
            </Text>

            <Text style={styles.formLabel}>邀請碼或完整邀請連結</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="例如：FAM-8823 或貼上連結"
              placeholderTextColor="#9CA3AF"
              value={switchCodeInput}
              onChangeText={setSwitchCodeInput}
              autoCapitalize="characters"
            />

            <TouchableOpacity
              style={styles.submitMemberBtn}
              disabled={isJoining}
              onPress={handleSwitchLedger}
            >
              <Text style={styles.submitMemberBtnText}>
                {isJoining ? '正在驗證並加入...' : '確認加入並切換'}
              </Text>
            </TouchableOpacity>

            <View style={styles.orDividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>或</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={styles.leaveLedgerBtn}
              onPress={() => {
                showConfirm(
                  '退出當前帳本',
                  '退出後將返回初始起始畫面，您可以重新選擇「建立新帳本」或「輸入邀請碼加入」。確定要退出嗎？',
                  async () => {
                    setSwitchLedgerModalVisible(false);
                    await leaveCurrentLedger();
                  }
                );
              }}
            >
              <Text style={styles.leaveLedgerBtnText}>🚪 退出當前帳本（返回初始歡迎畫面）</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  // 若尚未加入任何家庭帳本，顯示模式 A 冷啟動歡迎雙入口
  if (!hasJoinedLedger) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
        <ScrollView contentContainerStyle={styles.welcomeScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.welcomeHero}>
            <Text style={styles.welcomeEmoji}>👨‍👩‍👧‍👦</Text>
            <Text style={styles.welcomeTitle}>家庭共享記帳本</Text>
            <Text style={styles.welcomeSubtitle}>全家人一起記帳・即時雲端同步・收支結餘自動算</Text>
          </View>

          <View style={styles.featureBox}>
            <View style={styles.featureItem}>
              <Text style={styles.featureIcon}>⚡</Text>
              <View style={styles.featureTextCol}>
                <Text style={styles.featureItemTitle}>即時雲端同步</Text>
                <Text style={styles.featureItemDesc}>各自用自己的手機，一人記帳全家秒更新</Text>
              </View>
            </View>
            <View style={styles.featureItem}>
              <Text style={styles.featureIcon}>📊</Text>
              <View style={styles.featureTextCol}>
                <Text style={styles.featureItemTitle}>家庭收支一目了然</Text>
                <Text style={styles.featureItemDesc}>自動統計成員付款、結餘清楚，公帳不混淆</Text>
              </View>
            </View>
            <View style={styles.featureItem}>
              <Text style={styles.featureIcon}>🔒</Text>
              <View style={styles.featureTextCol}>
                <Text style={styles.featureItemTitle}>專屬邀請碼安全守護</Text>
                <Text style={styles.featureItemDesc}>只有持有家庭邀請碼的家人能進入，保護隱私</Text>
              </View>
            </View>
          </View>

          <View style={styles.welcomeActions}>
            <TouchableOpacity
              style={styles.welcomePrimaryCard}
              onPress={() => setCreateLedgerModalVisible(true)}
              activeOpacity={0.85}
            >
              <View style={styles.welcomeCardHeader}>
                <Text style={styles.welcomeCardBadge}>我是發起人</Text>
                <Text style={styles.welcomeCardArrow}>→</Text>
              </View>
              <Text style={styles.welcomeCardTitle}>🏠 建立新的家庭公帳</Text>
              <Text style={styles.welcomeCardDesc}>
                適合第一位建立家庭帳本的人。建立後系統會自動為您產生專屬邀請碼，分享給伴侶或家人加入。
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.welcomeSecondaryCard}
              onPress={() => setJoinLedgerModalVisible(true)}
              activeOpacity={0.85}
            >
              <View style={styles.welcomeCardHeader}>
                <Text style={styles.welcomeCardBadgeSecondary}>我是家人</Text>
                <Text style={styles.welcomeCardArrowSecondary}>→</Text>
              </View>
              <Text style={styles.welcomeCardTitleSecondary}>🔗 輸入邀請碼加入現有帳本</Text>
              <Text style={styles.welcomeCardDescSecondary}>
                家人已建立帳本？輸入 4~8 碼邀請代碼（或貼上 LINE 邀請連結）立即進入同一本公帳。
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* 建立帳本彈窗 */}
        {renderCreateLedgerModal()}

        {/* 加入帳本彈窗 */}
        {renderJoinLedgerModal()}

        {/* 偵測到待確認的邀請網址 */}
        {renderPendingInviteModal()}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* 方案 A: App 內即時溫馨動態泡泡 */}
      <LiveToastBanner toast={liveToast} onDismiss={dismissLiveToast} />

      {/* 頂部導航列 */}
      <View style={styles.topBar}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <View style={styles.topBarSubtitleRow}>
            <Text style={styles.ledgerSubtitle} maxFontSizeMultiplier={1.2}>家庭共享記帳本</Text>
            {isOwner && (
              <View style={styles.ownerTopBadge}>
                <Text style={styles.ownerTopBadgeText} maxFontSizeMultiplier={1.2}>👑 管理員</Text>
              </View>
            )}
          </View>
          <View style={styles.topBarTitleRow}>
            {isOwner ? (
              <TouchableOpacity
                style={styles.ledgerTitleClickable}
                onPress={() => {
                  setEditLedgerNameInput(currentLedger.name);
                  setEditLedgerModalVisible(true);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.ledgerTitle} numberOfLines={1} ellipsizeMode="tail" maxFontSizeMultiplier={1.2}>
                  {currentLedger.name}
                </Text>
                <Text style={styles.ledgerEditPencil}>✏️</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.ledgerTitle} numberOfLines={1} ellipsizeMode="tail" maxFontSizeMultiplier={1.2}>
                {currentLedger.name}
              </Text>
            )}
          </View>
        </View>

        {/* 雲端狀態徽章 (點擊可立即手動重新同步) */}
        <TouchableOpacity
          style={[styles.syncBadge, isCloudSynced ? styles.syncOnline : styles.syncLocal]}
          onPress={handleRefresh}
          activeOpacity={0.7}
        >
          <Text style={styles.syncDot}>{isRefreshing ? '🔄' : (isCloudSynced ? '🟢' : '🟡')}</Text>
          <Text style={styles.syncText} maxFontSizeMultiplier={1.2}>
            {isRefreshing ? '同步更新中...' : (isCloudSynced ? '雲端即時同步' : '本地離線快取')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 角色預覽模式橫幅 (置於導航列下方，避免與系統狀態列重疊) */}
      {isPreviewMode && previewMember && (
        <View style={styles.previewModeBanner}>
          <View style={styles.previewModeBannerLeft}>
            <Text style={styles.previewModeBannerIcon}>👀</Text>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.previewModeBannerTitle} numberOfLines={1}>
                正在預覽：{previewMember.display_name}
              </Text>
              <Text style={styles.previewModeBannerSub} numberOfLines={1}>
                模擬一般成員視角中・記帳預設以其付款
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.exitPreviewBtn}
            activeOpacity={0.8}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            onPress={() => {
              exitMemberPreview();
              showAlert('已結束預覽', '已安全切回管理員身分！');
            }}
          >
            <Text style={styles.exitPreviewBtnText}>✕ 結束預覽</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 頁籤內容 */}
      <View style={styles.content}>
        {activeTab === 'transactions' && (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollPadding}
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
            {/* 定期備份提醒橫幅 (Option B) */}
            {showBackupBanner && (
              <View style={styles.backupReminderBanner}>
                <View style={styles.backupReminderHeader}>
                  <View style={styles.backupReminderTitleRow}>
                    <Text style={styles.backupReminderIcon} allowFontScaling={false} maxFontSizeMultiplier={1.08}>☁️</Text>
                    <Text style={styles.backupReminderTitle} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
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
                    <Text style={styles.backupReminderDismissText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>✕ 稍後提醒</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.backupReminderDesc} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                  {daysSinceLastBackup === null
                    ? `您目前已有 ${transactions.length} 筆明細，建議將資料存檔至 Google 雲端硬碟或個人電腦，確保家庭資料永久安全。`
                    : `您設定每 ${autoBackupInterval} 天定期提醒備份，目前已達 ${daysSinceLastBackup} 天，建議花 3 秒存檔一份最新資料至雲端硬碟。`}
                </Text>

                <View style={styles.backupReminderActionRow}>
                  <TouchableOpacity
                    style={styles.backupReminderActionBtn}
                    onPress={() => handleOpenExportModal('json')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.backupReminderActionBtnText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                      🚀 立即備份至雲端硬碟
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* 本月收支摘要卡片 */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryHeader}>
                <Text style={styles.summaryTitle} maxFontSizeMultiplier={1.2}>{summaryCardTitle}</Text>
                <Text style={styles.currencyLabel} maxFontSizeMultiplier={1.2}>
                  {isFiltered ? '🔍 已套用篩選' : 'TWD (新台幣)'}
                </Text>
              </View>

              <View style={styles.summaryGrid}>
                <View style={styles.summaryCol}>
                  <Text style={styles.summaryLabel} maxFontSizeMultiplier={1.2}>總支出</Text>
                  <Text
                    style={[styles.summaryVal, styles.expenseVal]}
                    maxFontSizeMultiplier={1.2}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    -NT$ {displaySummary.totalExpense.toLocaleString()}
                  </Text>
                </View>

                <View style={styles.summaryDivider} />

                <View style={styles.summaryCol}>
                  <Text style={styles.summaryLabel} maxFontSizeMultiplier={1.2}>總收入</Text>
                  <Text
                    style={[styles.summaryVal, styles.incomeVal]}
                    maxFontSizeMultiplier={1.2}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    +NT$ {displaySummary.totalIncome.toLocaleString()}
                  </Text>
                </View>

                <View style={styles.summaryDivider} />

                <View style={styles.summaryCol}>
                  <Text style={styles.summaryLabel} maxFontSizeMultiplier={1.2}>結餘</Text>
                  <Text
                    style={styles.summaryVal}
                    maxFontSizeMultiplier={1.2}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    NT$ {displaySummary.netBalance.toLocaleString()}
                  </Text>
                </View>
              </View>
            </View>

            {/* 交易列表標題 */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                近期收支明細 ({displayedTransactions.length < filteredTransactions.length ? `${displayedTransactions.length} / ` : ''}{filteredTransactions.length}{isFiltered ? ` / 總 ${transactions.length}` : ''})
              </Text>
              <Text style={styles.sectionSubtitle}>點擊明細可直接修改或刪除 ✍️</Text>
            </View>

            {/* 🔍 店家 / 關鍵字即時搜尋列 */}
            <View style={styles.searchBarContainer}>
              <View style={styles.searchBarInner}>
                <Text style={styles.searchBarIcon}>🔍</Text>
                <TextInput
                  style={styles.searchBarInput}
                  placeholder="搜尋店家或備註 (例如：好市多、全聯、加油...)"
                  placeholderTextColor="#9CA3AF"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  returnKeyType="search"
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
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.merchantFilterScroll}
                keyboardShouldPersistTaps="handled"
              >
                {activeMerchantsInLedger.map((mName) => {
                  const isSelected = searchQuery.trim().toLowerCase() === mName.toLowerCase();
                  return (
                    <TouchableOpacity
                      key={mName}
                      style={[styles.merchantFilterChip, isSelected && styles.merchantFilterChipActive]}
                      onPress={() => setSearchQuery(isSelected ? '' : mName)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[styles.merchantFilterChipText, isSelected && styles.merchantFilterChipTextActive]}
                        maxFontSizeMultiplier={1.08}
                      >
                        {isSelected ? `✓ ${mName}` : mName}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* 篩選工具列 (月份與成員) */}
            <View style={styles.filterToolbar}>
              {/* 月份篩選按鈕 */}
              <TouchableOpacity
                activeOpacity={0.7}
                style={[styles.filterChip, filterMonth !== currentMonthYm && styles.filterChipActive]}
                onPress={() => setFilterModalType('month')}
              >
                <Text style={styles.filterChipIcon}>📅</Text>
                <Text
                  style={[styles.filterChipText, filterMonth !== currentMonthYm && styles.filterChipTextActive]}
                  numberOfLines={1}
                >
                  {filterMonth === 'all'
                    ? '全部月份'
                    : filterMonth === currentMonthYm
                    ? `本月 (${parseInt(currentMonthYm.split('-')[1], 10)}月)`
                    : (selectedMonthObj?.label || filterMonth)}
                </Text>
                <Text style={[styles.filterChipArrow, filterMonth !== currentMonthYm && styles.filterChipArrowActive]}>▾</Text>
              </TouchableOpacity>

              {/* 成員篩選按鈕 */}
              <TouchableOpacity
                activeOpacity={0.7}
                style={[styles.filterChip, filterMemberId !== 'all' && styles.filterChipActive]}
                onPress={() => setFilterModalType('member')}
              >
                <Text style={styles.filterChipIcon}>👤</Text>
                <Text
                  style={[styles.filterChipText, filterMemberId !== 'all' && styles.filterChipTextActive]}
                  numberOfLines={1}
                >
                  {filterMemberId === 'all'
                    ? '全部成員'
                    : (selectedMember?.display_name || '指定成員')}
                </Text>
                <Text style={[styles.filterChipArrow, filterMemberId !== 'all' && styles.filterChipArrowActive]}>▾</Text>
              </TouchableOpacity>

              {/* 若在搜尋狀態下且非查全部月份，提供 1 鍵切換至全部月份 */}
              {!!searchQuery.trim() && filterMonth !== 'all' && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={[styles.filterChip, { borderColor: '#818CF8', backgroundColor: '#EEF2FF' }]}
                  onPress={() => setFilterMonth('all')}
                >
                  <Text style={styles.filterChipIcon}>🌐</Text>
                  <Text style={[styles.filterChipText, { color: '#4F46E5', fontWeight: '700' }]}>改查全部月份</Text>
                </TouchableOpacity>
              )}

              {/* 重設篩選按鈕 (若非預設本月狀態時顯示) */}
              {isFiltered && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={styles.filterResetChip}
                  onPress={resetFilters}
                >
                  <Text style={styles.filterResetText}>清除篩選 ↺</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* 交易清單 */}
            {transactions.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyIcon}>🧾</Text>
                <Text style={styles.emptyText}>目前還沒有記帳紀錄</Text>
                <Text style={styles.emptySubtext}>點擊右下角「+」開始記錄家庭第一筆花費</Text>
              </View>
            ) : filteredTransactions.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyIcon}>🔍</Text>
                <Text style={styles.emptyText}>
                  {searchQuery.trim() ? `查無「${searchQuery.trim()}」的相關紀錄` : '沒有符合篩選條件的明細'}
                </Text>
                <Text style={styles.emptySubtext}>
                  {searchQuery.trim() && filterMonth !== 'all'
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
                    onPress={tx => setEditingTransaction(tx)}
                  />
                ))}

                {/* 方案 A：分批動態載入控制列 */}
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

                    {/* 若剩餘超過一頁，提供一鍵展開全部 */}
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

                {/* 全部已載入完畢指示器 */}
                {filteredTransactions.length > PAGE_SIZE && displayedTransactions.length >= filteredTransactions.length && (
                  <View style={styles.listEndIndicator}>
                    <Text style={styles.listEndText}>✨ 已顯示全部 {filteredTransactions.length} 筆明細</Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        )}

        {activeTab === 'analytics' && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollPadding}>
            {/* 時間維度切換器 */}
            <View style={styles.analyticsFilterBox}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.analyticsFilterScroll}
              >
                {/* 本月 */}
                <TouchableOpacity
                  style={[
                    styles.analyticsFilterChip,
                    analyticsMonth === currentMonthYm && styles.analyticsFilterChipActive,
                  ]}
                  onPress={() => setAnalyticsMonth(currentMonthYm)}
                  activeOpacity={0.7}
                >
                  <Text
                    allowFontScaling={false}
                    maxFontSizeMultiplier={1.08}
                    style={[
                      styles.analyticsFilterText,
                      analyticsMonth === currentMonthYm && styles.analyticsFilterTextActive,
                    ]}
                  >
                    📅 本月
                  </Text>
                </TouchableOpacity>

                {/* 上月 */}
                {lastMonthYm ? (
                  <TouchableOpacity
                    style={[
                      styles.analyticsFilterChip,
                      analyticsMonth === lastMonthYm && styles.analyticsFilterChipActive,
                    ]}
                    onPress={() => setAnalyticsMonth(lastMonthYm)}
                    activeOpacity={0.7}
                  >
                    <Text
                      allowFontScaling={false}
                      maxFontSizeMultiplier={1.08}
                      style={[
                        styles.analyticsFilterText,
                        analyticsMonth === lastMonthYm && styles.analyticsFilterTextActive,
                      ]}
                    >
                      📅 上月
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {/* 全部歷史 */}
                <TouchableOpacity
                  style={[
                    styles.analyticsFilterChip,
                    analyticsMonth === 'all' && styles.analyticsFilterChipActive,
                  ]}
                  onPress={() => setAnalyticsMonth('all')}
                  activeOpacity={0.7}
                >
                  <Text
                    allowFontScaling={false}
                    maxFontSizeMultiplier={1.08}
                    style={[
                      styles.analyticsFilterText,
                      analyticsMonth === 'all' && styles.analyticsFilterTextActive,
                    ]}
                  >
                    🌐 全部歷史
                  </Text>
                </TouchableOpacity>

                {/* 若選中了特定月份 (且非本月/上月/全部，且不在 availableMonths 中)，顯示選中標籤 */}
                {analyticsMonth !== currentMonthYm &&
                  analyticsMonth !== lastMonthYm &&
                  analyticsMonth !== 'all' &&
                  !availableMonths.some(m => m.ym === analyticsMonth) && (
                    <TouchableOpacity
                      style={[styles.analyticsFilterChip, styles.analyticsFilterChipActive]}
                      onPress={() => setMonthPickerVisible(true)}
                      activeOpacity={0.7}
                    >
                      <Text
                        allowFontScaling={false}
                        maxFontSizeMultiplier={1.08}
                        style={[styles.analyticsFilterText, styles.analyticsFilterTextActive]}
                      >
                        📅 {analyticsMonthLabel} ✓
                      </Text>
                    </TouchableOpacity>
                  )}

                {/* 其他歷史月份 */}
                {availableMonths
                  .filter(m => m.ym !== currentMonthYm && m.ym !== lastMonthYm)
                  .map(m => (
                    <TouchableOpacity
                      key={m.ym}
                      style={[
                        styles.analyticsFilterChip,
                        analyticsMonth === m.ym && styles.analyticsFilterChipActive,
                      ]}
                      onPress={() => setAnalyticsMonth(m.ym)}
                      activeOpacity={0.7}
                    >
                      <Text
                        allowFontScaling={false}
                        maxFontSizeMultiplier={1.08}
                        style={[
                          styles.analyticsFilterText,
                          analyticsMonth === m.ym && styles.analyticsFilterTextActive,
                        ]}
                      >
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  ))}

                {/* 選擇特定月份按鈕 (任意年份/12個月網格彈窗) */}
                <TouchableOpacity
                  style={[
                    styles.analyticsFilterChip,
                    styles.analyticsFilterSelectMoreChip,
                  ]}
                  onPress={() => setMonthPickerVisible(true)}
                  activeOpacity={0.7}
                >
                  <Text
                    allowFontScaling={false}
                    maxFontSizeMultiplier={1.08}
                    style={styles.analyticsFilterSelectMoreText}
                  >
                    🔍 選擇特定月份 ▾
                  </Text>
                </TouchableOpacity>
              </ScrollView>

              {/* 當前選中期間提示 & 快速切換按鈕 */}
              <TouchableOpacity
                style={styles.analyticsFilterStatusRow}
                onPress={() => setMonthPickerVisible(true)}
                activeOpacity={0.7}
              >
                <Text allowFontScaling={false} maxFontSizeMultiplier={1.08} style={styles.analyticsFilterStatusText}>
                  📊 統計範圍：{analyticsMonthLabel}（共 {analyticsSummary.count} 筆記帳）
                </Text>
                <Text allowFontScaling={false} maxFontSizeMultiplier={1.08} style={styles.analyticsFilterChangeBtnText}>
                  切換 ▾
                </Text>
              </TouchableOpacity>
            </View>

            {/* 統計總覽指標卡 */}
            <View style={styles.analyticsOverviewCard}>
              <View style={styles.analyticsOverviewHeader}>
                <Text allowFontScaling={false} maxFontSizeMultiplier={1.08} style={styles.analyticsOverviewTitle}>
                  💳 {analyticsMonthLabel} 收支總覽
                </Text>
                <View style={styles.analyticsOverviewBadge}>
                  <Text allowFontScaling={false} maxFontSizeMultiplier={1.08} style={styles.analyticsOverviewBadgeText}>
                    {analyticsSummary.count} 筆紀錄
                  </Text>
                </View>
              </View>

              <View style={styles.analyticsOverviewGrid}>
                {/* 總支出 */}
                <View style={styles.analyticsOverviewItem}>
                  <Text allowFontScaling={false} maxFontSizeMultiplier={1.08} style={styles.analyticsOverviewItemLabel}>
                    💸 總支出
                  </Text>
                  <Text allowFontScaling={false} maxFontSizeMultiplier={1.08} style={[styles.analyticsOverviewItemVal, styles.expenseColor]}>
                    NT$ {analyticsSummary.totalExpense.toLocaleString()}
                  </Text>
                </View>

                {/* 總收入 */}
                <View style={styles.analyticsOverviewItem}>
                  <Text allowFontScaling={false} maxFontSizeMultiplier={1.08} style={styles.analyticsOverviewItemLabel}>
                    💰 總收入
                  </Text>
                  <Text allowFontScaling={false} maxFontSizeMultiplier={1.08} style={[styles.analyticsOverviewItemVal, styles.incomeColor]}>
                    NT$ {analyticsSummary.totalIncome.toLocaleString()}
                  </Text>
                </View>

                {/* 本期結餘 */}
                <View style={styles.analyticsOverviewItem}>
                  <Text allowFontScaling={false} maxFontSizeMultiplier={1.08} style={styles.analyticsOverviewItemLabel}>
                    ⚖️ 本期結餘
                  </Text>
                  <Text
                    allowFontScaling={false}
                    maxFontSizeMultiplier={1.08}
                    style={[
                      styles.analyticsOverviewItemVal,
                      analyticsSummary.netBalance >= 0 ? styles.balancePositive : styles.balanceNegative,
                    ]}
                  >
                    {analyticsSummary.netBalance >= 0 ? '+' : ''}NT$ {analyticsSummary.netBalance.toLocaleString()}
                  </Text>
                </View>

                {/* 日均開銷 */}
                <View style={styles.analyticsOverviewItem}>
                  <Text allowFontScaling={false} maxFontSizeMultiplier={1.08} style={styles.analyticsOverviewItemLabel}>
                    📅 日均支出
                  </Text>
                  <Text allowFontScaling={false} maxFontSizeMultiplier={1.08} style={styles.analyticsOverviewItemVal}>
                    NT$ {dailyAverageExpense.toLocaleString()}
                  </Text>
                </View>
              </View>
            </View>

            {/* 各成員付款支出比例 */}
            <View style={styles.cardSection}>
              <View style={styles.sectionHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text allowFontScaling={false} maxFontSizeMultiplier={1.08} style={styles.cardSectionTitle}>
                    👨‍👩‍👧 各成員付款支出比例
                  </Text>
                  <Text allowFontScaling={false} maxFontSizeMultiplier={1.08} style={styles.cardSectionDesc}>
                    依付款金額由高到低排序，掌握家庭開銷的付款貢獻
                  </Text>
                </View>
              </View>

              <View style={styles.memberPayList}>
                {analyticsMemberPaymentRanking.map(member => {
                  const hasPaid = member.paid > 0;
                  const rankBadge =
                    member.paid > 0
                      ? member.rank === 1
                        ? '🥇'
                        : member.rank === 2
                        ? '🥈'
                        : member.rank === 3
                        ? '🥉'
                        : `#${member.rank}`
                      : '-';

                  return (
                    <View
                      key={member.id}
                      style={[
                        styles.memberPayCard,
                        !hasPaid && styles.memberPayCardZero,
                      ]}
                    >
                      <View style={styles.memberPayTopRow}>
                        <View style={styles.memberInfo}>
                          <Text
                            allowFontScaling={false}
                            maxFontSizeMultiplier={1.08}
                            style={[styles.memberRankText, member.rank <= 3 && hasPaid && styles.memberRankTextTop]}
                          >
                            {rankBadge}
                          </Text>
                          <Text allowFontScaling={false} maxFontSizeMultiplier={1.08} style={styles.memberAvatar}>
                            {member.avatar_url || '👤'}
                          </Text>
                          <Text
                            allowFontScaling={false}
                            maxFontSizeMultiplier={1.08}
                            style={styles.memberName}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {member.display_name}
                          </Text>
                          {member.isCurrent && (
                            <View style={styles.meBadge}>
                              <Text allowFontScaling={false} maxFontSizeMultiplier={1.08} style={styles.meBadgeText}>
                                我
                              </Text>
                            </View>
                          )}
                          {member.rank === 1 && hasPaid && (
                            <View style={styles.topPayerBadge}>
                              <Text allowFontScaling={false} maxFontSizeMultiplier={1.08} style={styles.topPayerBadgeText}>
                                👑 付款主力
                              </Text>
                            </View>
                          )}
                        </View>

                        <View style={styles.memberAmountBox}>
                          <Text
                            allowFontScaling={false}
                            maxFontSizeMultiplier={1.08}
                            style={[styles.memberAmount, !hasPaid && styles.memberAmountZero]}
                          >
                            NT$ {member.paid.toLocaleString()}
                          </Text>
                          <Text allowFontScaling={false} maxFontSizeMultiplier={1.08} style={styles.memberRatio}>
                            {member.ratio}%
                          </Text>
                        </View>
                      </View>

                      {/* 彩色進度比例長條圖 */}
                      <View style={styles.progressBarBg}>
                        <View
                          style={[
                            styles.progressBarFill,
                            {
                              width: `${Math.min(100, Math.max(hasPaid ? 3 : 0, member.ratioNum))}%`,
                              backgroundColor: hasPaid ? member.color : '#E2E8F0',
                            },
                          ]}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* 分類收支排行 */}
            <View style={styles.cardSection}>
              <View style={styles.sectionHeaderRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text allowFontScaling={false} maxFontSizeMultiplier={1.08} style={styles.cardSectionTitle}>
                    {analyticsCategoryType === 'expense' ? '📊 支出分類排行' : '💰 收入分類排行'}
                    {analyticsCategoryRanking.length > 0 ? ` (${analyticsCategoryRanking.length}項)` : ''}
                  </Text>
                  <Text allowFontScaling={false} maxFontSizeMultiplier={1.08} style={styles.cardSectionDesc}>
                    {analyticsCategoryType === 'expense'
                      ? '依開銷金額由高到低自動排序，掌握最大花費去向'
                      : '依進帳金額由高到低自動排序，掌握家庭資金來源'}
                  </Text>
                </View>

                {/* 支出 / 收入 切換按鈕 */}
                <View style={styles.typeToggleContainer}>
                  <TouchableOpacity
                    style={[
                      styles.typeToggleBtn,
                      analyticsCategoryType === 'expense' && styles.typeToggleBtnActiveExpense,
                    ]}
                    onPress={() => setAnalyticsCategoryType('expense')}
                    activeOpacity={0.7}
                  >
                    <Text
                      allowFontScaling={false}
                      maxFontSizeMultiplier={1.08}
                      style={[
                        styles.typeToggleText,
                        analyticsCategoryType === 'expense' && styles.typeToggleTextActive,
                      ]}
                    >
                      支出
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.typeToggleBtn,
                      analyticsCategoryType === 'income' && styles.typeToggleBtnActiveIncome,
                    ]}
                    onPress={() => setAnalyticsCategoryType('income')}
                    activeOpacity={0.7}
                  >
                    <Text
                      allowFontScaling={false}
                      maxFontSizeMultiplier={1.08}
                      style={[
                        styles.typeToggleText,
                        analyticsCategoryType === 'income' && styles.typeToggleTextActive,
                      ]}
                    >
                      收入
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {analyticsCategoryRanking.length === 0 ? (
                <View style={styles.analyticsEmptyBox}>
                  <Text allowFontScaling={false} maxFontSizeMultiplier={1.08} style={styles.analyticsEmptyEmoji}>🍃</Text>
                  <Text allowFontScaling={false} maxFontSizeMultiplier={1.08} style={styles.analyticsEmptyText}>
                    {analyticsCategoryType === 'expense' ? '本期尚無支出紀錄' : '本期尚無收入紀錄'}
                  </Text>
                </View>
              ) : (
                analyticsCategoryRanking.map(item => {
                  const rankIcon =
                    item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : `#${item.rank}`;

                  return (
                    <View key={item.id} style={styles.categoryStatRow}>
                      <View style={styles.catHeader}>
                        <View style={styles.catNameRow}>
                          <Text
                            allowFontScaling={false}
                            maxFontSizeMultiplier={1.08}
                            style={[styles.catRankBadge, item.rank <= 3 && styles.catRankBadgeTop]}
                          >
                            {rankIcon}
                          </Text>
                          <Text
                            allowFontScaling={false}
                            maxFontSizeMultiplier={1.08}
                            style={styles.catName}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {getCategoryIcon(item.icon)} {item.name}
                          </Text>
                          <Text allowFontScaling={false} maxFontSizeMultiplier={1.08} style={styles.catCountText}>
                            ({item.count}筆)
                          </Text>
                        </View>
                        <Text
                          allowFontScaling={false}
                          maxFontSizeMultiplier={1.08}
                          style={[
                            styles.catAmount,
                            analyticsCategoryType === 'income' && styles.incomeColor,
                          ]}
                        >
                          NT$ {item.amount.toLocaleString()}{' '}
                          <Text
                            style={[
                              styles.catPercentage,
                              analyticsCategoryType === 'income' && styles.incomeColor,
                            ]}
                          >
                            ({item.percentage}%)
                          </Text>
                        </Text>
                      </View>
                      <View style={styles.progressBarBg}>
                        <View
                          style={[
                            styles.progressBarFill,
                            {
                              width: `${Math.min(100, Math.max(3, item.percentage))}%`,
                              backgroundColor:
                                item.color ||
                                (analyticsCategoryType === 'income' ? '#10B981' : '#4F46E5'),
                            },
                          ]}
                        />
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>
        )}

        {activeTab === 'family' && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollPadding}>
            {/* 家庭成員名冊與管理 */}
            <View style={styles.cardSection}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderLeft}>
                  <Text style={styles.cardSectionTitle}>👨‍👩‍👧 家庭成員名單 ({members.length})</Text>
                  <Text style={styles.sectionHeaderDesc}>
                    點擊成員可開啟設定；記帳時預設自動帶入個人身分
                  </Text>
                </View>
                {isOwner && (
                  <TouchableOpacity
                    style={styles.addMemberBtn}
                    onPress={() => setMemberModalVisible(true)}
                  >
                    <Text style={styles.addMemberBtnText}>＋ 新增成員</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.userSwitchRow}>
                {members.map(member => {
                  const isCurrent =
                    currentUser.id === member.id ||
                    (!!currentUser.display_name && currentUser.display_name === member.display_name);
                  const isMemberAdmin =
                    member.role === 'owner' ||
                    member.role === 'admin' ||
                    currentLedger.created_by === member.id;
                  const isCreator = currentLedger.created_by === member.id;
                  // 管理員可對所有成員點擊；一般成員只能點自己本機成員
                  const canEdit = isOwner || isCurrent;

                  return (
                    <TouchableOpacity
                      key={member.id}
                      style={[
                        styles.userChip,
                        isCurrent && styles.userChipActive,
                        !canEdit && styles.userChipDisabled,
                      ]}
                      activeOpacity={canEdit ? 0.7 : 1}
                      disabled={!canEdit}
                      onPress={() => {
                        if (canEdit) {
                          handleStartEditMember(member);
                        }
                      }}
                    >
                      <Text style={styles.userAvatar}>{member.avatar_url}</Text>
                      <Text
                        style={[styles.userTitle, isCurrent && styles.userTitleActive]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {member.display_name}
                      </Text>
                      {isCreator ? (
                        <View style={styles.memberRoleBadge}>
                          <Text style={styles.memberRoleBadgeText}>👑 創建者</Text>
                        </View>
                      ) : isMemberAdmin ? (
                        <View style={styles.memberRoleBadge}>
                          <Text style={styles.memberRoleBadgeText}>👑 管理員</Text>
                        </View>
                      ) : null}
                      {isCurrent && (
                        <Text style={styles.activeTag}>我</Text>
                      )}
                      {canEdit && (
                        <Text style={styles.memberEditHintIcon}>✏️</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* 若此手機目前不是管理員，提供 PIN 碼驗證升級入口 */}
              {!isOwner && (
                <View style={styles.claimAdminBanner}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.claimAdminBannerTitle}>👑 您目前為一般成員</Text>
                    <Text style={styles.claimAdminBannerDesc}>
                      若需恢復管理員權限，可輸入 4 位數 PIN 碼立即取回/升級為管理員
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.claimAdminBannerBtn}
                    onPress={() => {
                      setClaimAdminPinInput('');
                      setClaimAdminModalVisible(true);
                    }}
                  >
                    <Text style={styles.claimAdminBannerBtnText}>🔐 升為管理員</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* 邀請家人加入與代碼管理 */}
            <View style={styles.cardSection}>
              <View style={styles.inviteHeaderRow}>
                <View style={styles.sectionHeaderLeft}>
                  <Text style={styles.cardSectionTitle}>🔗 邀請家人共同記帳</Text>
                  <Text style={styles.cardSectionDesc}>讓伴侶或家人加入這本公帳，資料即時雙向同步</Text>
                </View>
                <View style={[styles.roleBadge, isOwner ? styles.roleBadgeOwner : styles.roleBadgeMember]}>
                  <Text style={[styles.roleBadgeText, isOwner ? styles.roleBadgeTextOwner : styles.roleBadgeTextMember]}>
                    {isOwner ? '👑 帳本管理員' : '👤 家庭成員'}
                  </Text>
                </View>
              </View>

              <View style={styles.inviteCard}>
                <Text style={styles.inviteCardLabel}>本家庭專屬邀請碼</Text>
                <View style={styles.inviteCodeRow}>
                  <Text style={styles.inviteCodeLarge}>{inviteCode}</Text>
                  <TouchableOpacity
                    style={styles.copyCodeMiniBtn}
                    onPress={() => copyToClipboard(inviteCode, `邀請碼 ${inviteCode} 已複製！`)}
                  >
                    <Text style={styles.copyCodeMiniBtnText}>複製代碼</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.copyLinkBtn}
                  onPress={() => copyToClipboard(getInviteLink(), '專屬邀請連結已複製！\n請直接貼到 LINE 聊天室傳送給家人，家人點開即可自動加入。')}
                >
                  <Text style={styles.copyLinkBtnText}>📋 複製專屬邀請連結 (傳 LINE 給家人)</Text>
                </TouchableOpacity>

                {isOwner && (
                  <View style={styles.ownerControlsRow}>
                    <TouchableOpacity
                      style={styles.ownerControlBtn}
                      onPress={() => {
                        setEditLedgerNameInput(currentLedger.name);
                        setEditLedgerModalVisible(true);
                      }}
                    >
                      <Text style={styles.ownerControlBtnText}>✏️ 帳本更名</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.ownerControlBtn}
                      onPress={() => {
                        showConfirm(
                          '重新產生邀請碼',
                          '重新產生後，舊代碼將會作廢。確定要產生全新的一組隨機邀請碼嗎？',
                          async () => {
                            const newCode = await regenerateInviteCode();
                            showAlert('已更新', `全新家庭邀請碼為：${newCode}`);
                          }
                        );
                      }}
                    >
                      <Text style={styles.ownerControlBtnText}>🔄 重新產生</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.ownerControlBtn}
                      onPress={() => {
                        setCustomCodeInput(inviteCode);
                        setCustomCodeModalVisible(true);
                      }}
                    >
                      <Text style={styles.ownerControlBtnText}>✏️ 自訂代碼</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* 管理員安全 PIN 碼管理 (僅 Owner 可見) */}
                {isOwner && (
                  <View style={styles.pinSectionWrapper}>
                    <View style={styles.pinHeaderRow}>
                      <Text style={styles.pinHeaderTitle}>🔐 管理員安全 PIN 碼</Text>
                      <Text style={styles.pinHeaderDesc}>
                        換手機或新電腦以「管理員」身分認領時需輸入此碼，防範他人冒充
                      </Text>
                    </View>

                    <View style={styles.pinCardInner}>
                      <View>
                        <Text style={styles.pinCardLabel}>目前安全 PIN 碼</Text>
                        <Text style={styles.pinCardValue}>
                          {showPinClear ? adminPin : `${adminPin.slice(0, 1)}••${adminPin.slice(-1)}`}
                        </Text>
                        <Text style={styles.pinCardHint}>（共 {adminPin.length} 碼）</Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        <TouchableOpacity
                          style={styles.togglePinBtn}
                          onPress={() => setShowPinClear(!showPinClear)}
                        >
                          <Text style={styles.togglePinBtnText}>{showPinClear ? '🙈 隱藏' : '👁️ 顯示'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.changePinBtn}
                          onPress={() => {
                            setNewPinInput(adminPin);
                            setChangePinModalVisible(true);
                          }}
                        >
                          <Text style={styles.changePinBtnText}>✏️ 修改</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                )}
              </View>

              {/* 切換帳本入口 */}
              <TouchableOpacity
                style={styles.switchLedgerEntryBtn}
                onPress={() => {
                  setSwitchCodeInput('');
                  setSwitchLedgerModalVisible(true);
                }}
              >
                <Text style={styles.switchLedgerEntryText}>🚪 加入或切換其他家庭公帳</Text>
              </TouchableOpacity>
            </View>

            {/* 記帳分類項目管理入口 (僅管理員可增修) */}
            <View style={styles.cardSection}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderLeft}>
                  <Text style={styles.cardSectionTitle} maxFontSizeMultiplier={1.2}>🏷️ 記帳分類項目 ({categories.length})</Text>
                  <Text style={styles.sectionHeaderDesc} maxFontSizeMultiplier={1.2}>
                    {isOwner ? '管理員可自訂支出與收入分類項目、圖示及代表顏色' : '查看目前記帳分類項目（僅帳本管理員可新增或修改）'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.manageCategoryBtn}
                  onPress={() => setCategoryModalVisible(true)}
                >
                  <Text style={styles.manageCategoryBtnText} maxFontSizeMultiplier={1.2}>
                    {isOwner ? '⚙️ 管理分類' : '👀 查看分類'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.categoryPreviewRow}>
                {categories.slice(0, 10).map(cat => (
                  <View key={cat.id} style={[styles.categoryPreviewChip, { borderColor: `${cat.color || '#4F46E5'}40` }]}>
                    <Text style={styles.categoryPreviewIcon}>{getCategoryIcon(cat.icon)}</Text>
                    <Text style={styles.categoryPreviewText} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                      {cat.name}
                    </Text>
                  </View>
                ))}
                {categories.length > 10 && (
                  <TouchableOpacity
                    style={styles.categoryMoreChip}
                    onPress={() => setCategoryModalVisible(true)}
                  >
                    <Text style={styles.categoryMoreText} maxFontSizeMultiplier={1.2}>+{categories.length - 10} 更多...</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* 資料備份與掌控 */}
            <View style={styles.cardSection}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderLeft}>
                  <Text style={styles.cardSectionTitle} allowFontScaling={false} maxFontSizeMultiplier={1.08}>🛡️ 資料備份與掌控</Text>
                  <Text style={styles.cardSectionDesc} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                    隨時匯出整本帳簿，資料自主永久保存在個人設備
                  </Text>
                </View>
                <View style={[styles.roleBadge, isCloudSynced ? styles.roleBadgeOwner : styles.roleBadgeMember]}>
                  <Text style={[styles.roleBadgeText, isCloudSynced ? styles.roleBadgeTextOwner : styles.roleBadgeTextMember]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                    {isCloudSynced ? '🟢 雲端已同步' : '💾 本機離線模式'}
                  </Text>
                </View>
              </View>

              {/* 帳本狀態小指標 */}
              <View style={styles.backupStatsRow}>
                <View style={styles.backupStatItem}>
                  <Text style={styles.backupStatVal} allowFontScaling={false} maxFontSizeMultiplier={1.08}>{transactions.length}</Text>
                  <Text style={styles.backupStatLabel} allowFontScaling={false} maxFontSizeMultiplier={1.08}>歷史明細筆數</Text>
                </View>
                <View style={styles.backupStatDivider} />
                <View style={styles.backupStatItem}>
                  <Text style={styles.backupStatVal} allowFontScaling={false} maxFontSizeMultiplier={1.08}>{members.length}</Text>
                  <Text style={styles.backupStatLabel} allowFontScaling={false} maxFontSizeMultiplier={1.08}>家庭成員數</Text>
                </View>
                <View style={styles.backupStatDivider} />
                <View style={styles.backupStatItem}>
                  <Text style={styles.backupStatVal} allowFontScaling={false} maxFontSizeMultiplier={1.08}>{categories.length}</Text>
                  <Text style={styles.backupStatLabel} allowFontScaling={false} maxFontSizeMultiplier={1.08}>自訂分類數</Text>
                </View>
              </View>

              {/* Option B: 定期備份管理區塊 */}
              <View style={styles.backupScheduleBox}>
                <View style={styles.backupScheduleHeader}>
                  <View style={styles.backupScheduleHeaderLeft}>
                    <Text style={styles.backupScheduleTitle} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                      ⏰ 定期備份提醒
                    </Text>
                    <Text style={styles.backupScheduleSub} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                      上次備份：{formatLastBackupText(lastBackupAt)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.backupToggleBtn, autoBackupEnabled ? styles.backupToggleBtnActive : styles.backupToggleBtnInactive]}
                    onPress={() => updateAutoBackupConfig(!autoBackupEnabled, autoBackupInterval)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.backupToggleText, autoBackupEnabled ? styles.backupToggleTextActive : styles.backupToggleTextInactive]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                      {autoBackupEnabled ? '已開啟提醒' : '已關閉提醒'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* 備份狀態徽章 */}
                <View style={[styles.backupStatusNotice, isBackupDue ? styles.backupStatusNoticeDue : styles.backupStatusNoticeOk]}>
                  <Text style={[styles.backupStatusNoticeText, isBackupDue ? styles.backupStatusNoticeTextDue : styles.backupStatusNoticeTextOk]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                    {!autoBackupEnabled
                      ? '⏸️ 定期提醒已關閉，您仍可隨時手動點擊下方按鈕匯出存檔。'
                      : daysSinceLastBackup === null
                      ? '⚠️ 尚未備份至雲端，建議儘早建立第一份備份！'
                      : daysSinceLastBackup >= autoBackupInterval
                      ? `⚠️ 已間隔 ${daysSinceLastBackup} 天未備份（已超過設定之 ${autoBackupInterval} 天），建議立即存檔！`
                      : `✅ 備份狀態良好（預計 ${Math.max(1, autoBackupInterval - daysSinceLastBackup)} 天後提醒）`}
                  </Text>
                </View>

                {/* 週期選擇器 Chips */}
                {autoBackupEnabled && (
                  <View style={styles.backupIntervalSection}>
                    <Text style={styles.backupIntervalLabel} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                      提醒週期頻率：
                    </Text>
                    <View style={styles.backupIntervalChips}>
                      {([7, 14, 30] as const).map((days) => (
                        <TouchableOpacity
                          key={days}
                          style={[
                            styles.backupIntervalChip,
                            autoBackupInterval === days && styles.backupIntervalChipActive,
                          ]}
                          onPress={() => updateAutoBackupConfig(true, days)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.backupIntervalChipText,
                              autoBackupInterval === days && styles.backupIntervalChipTextActive,
                            ]}
                            allowFontScaling={false}
                            maxFontSizeMultiplier={1.08}
                          >
                            {days === 7 ? '每週 (7天)' : days === 14 ? '每雙週 (14天)' : '每月 (30天)'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                <Text style={styles.backupPrivacyNote} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                  💡 手機系統隱私機制限制 App 靜默寫入個人雲端；開啟提醒後，系統會在到期時以橫幅通知您一鍵存檔至 Google Drive 或 iCloud。
                </Text>
              </View>

              <View style={styles.backupBtnRow}>
                <TouchableOpacity
                  style={styles.exportCsvBtn}
                  onPress={() => handleOpenExportModal('csv')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.exportCsvBtnText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>📊 匯出 CSV 報表 (Excel)</Text>
                  <Text style={styles.exportBtnSubtext} allowFontScaling={false} maxFontSizeMultiplier={1.08}>內建 UTF-8 BOM 防中文亂碼</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.exportJsonBtn}
                  onPress={() => handleOpenExportModal('json')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.exportJsonBtnText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>📦 匯出 JSON 結構備份</Text>
                  <Text style={styles.exportBtnSubtext} allowFontScaling={false} maxFontSizeMultiplier={1.08}>包含成員頭像與自訂分類</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 系統版本與更新狀態卡片 */}
            <View style={styles.cardSection}>
              <View style={styles.versionHeaderRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.cardSectionTitle} numberOfLines={1} adjustsFontSizeToFit>
                    📱 應用程式版本資訊
                  </Text>
                  <Text style={styles.cardSectionDesc}>甜心記帳本跨平台系統</Text>
                </View>
                <View style={styles.versionTagBadge}>
                  <Text style={styles.versionTagBadgeText}>v{APP_VERSION}</Text>
                </View>
              </View>

              <View style={styles.versionDetailBox}>
                <View style={styles.versionDetailRow}>
                  <Text style={styles.versionDetailLabel}>運行環境：</Text>
                  <Text style={styles.versionDetailValue}>
                    {Platform.OS === 'web'
                      ? '🌐 Web 網頁版'
                      : Platform.OS === 'ios'
                      ? '🍎 iOS 原生 App'
                      : '🤖 Android 原生 App'}
                  </Text>
                </View>

                <View style={styles.versionDetailRow}>
                  <Text style={styles.versionDetailLabel}>更新機制：</Text>
                  <Text style={styles.versionDetailValue}>
                    {Platform.OS === 'web'
                      ? '🌐 網頁即時快取'
                      : (Updates.isEnabled ? '⚡ EAS 雲端熱更新' : '📦 獨立安裝版 (APK)')}
                  </Text>
                </View>

                {Platform.OS !== 'web' && !!Updates.updateId && (
                  <View style={styles.versionDetailRow}>
                    <Text style={styles.versionDetailLabel}>更新代碼：</Text>
                    <Text style={[styles.versionDetailValue, styles.monoText]}>
                      {Updates.updateId.slice(0, 8)}
                    </Text>
                  </View>
                )}

                {Platform.OS !== 'web' && !!Updates.createdAt && (
                  <View style={styles.versionDetailRow}>
                    <Text style={styles.versionDetailLabel}>更新時間：</Text>
                    <Text style={styles.versionDetailValue}>
                      {new Date(Updates.createdAt).toLocaleString('zh-TW', { hour12: false })}
                    </Text>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={[styles.checkUpdateBtn, isCheckingUpdate && styles.checkUpdateBtnDisabled]}
                onPress={handleCheckForUpdates}
                disabled={isCheckingUpdate}
              >
                <Text style={styles.checkUpdateBtnText} numberOfLines={1} adjustsFontSizeToFit>
                  {isCheckingUpdate ? '⏳ 正在檢查雲端更新...' : '🔄 檢查並載入最新版本'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.testToastBtn}
                onPress={() => {
                  triggerLiveToast({
                    id: `demo-${Date.now()}`,
                    type: 'insert',
                    actorName: '媽媽',
                    avatar: '👩',
                    title: '🎉 媽媽 剛記了一筆！',
                    message: '🛒 全聯生鮮超市 -NT$ 680 (鮮乳、有機蛋)',
                    amount: 680,
                    createdAt: Date.now(),
                  });
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.testToastBtnText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                  🔔 測試即時動態泡泡通知
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </View>

      {/* 浮動記帳按鈕 (FAB) - 僅在「明細」分頁顯示，避免遮擋家庭成員與設定操作 */}
      {activeTab === 'transactions' && (
        <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
          <Text style={styles.fabText}>＋</Text>
        </TouchableOpacity>
      )}

      {/* 底部功能頁籤 */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={[styles.navItem, activeTab === 'transactions' && styles.navItemActive]}
          onPress={() => setActiveTab('transactions')}
        >
          <Text style={styles.navIcon}>📝</Text>
          <Text style={[styles.navText, activeTab === 'transactions' && styles.navTextActive]}>明細</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, activeTab === 'analytics' && styles.navItemActive]}
          onPress={() => setActiveTab('analytics')}
        >
          <Text style={styles.navIcon}>📊</Text>
          <Text style={[styles.navText, activeTab === 'analytics' && styles.navTextActive]}>統計</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, activeTab === 'family' && styles.navItemActive]}
          onPress={() => setActiveTab('family')}
        >
          <Text style={styles.navIcon}>👨‍👩‍👧</Text>
          <Text style={[styles.navText, activeTab === 'family' && styles.navTextActive]}>家庭與備份</Text>
        </TouchableOpacity>
      </View>

      {/* 新增記帳彈窗 */}
      <AddTransactionModal visible={modalVisible} onClose={() => setModalVisible(false)} />

      {/* 編輯記帳明細彈窗 */}
      <EditTransactionModal
        visible={!!editingTransaction}
        transaction={editingTransaction}
        onClose={() => setEditingTransaction(null)}
      />

      {/* 記帳分類項目管理彈窗 (僅管理員可增修) */}
      <CategoryManageModal
        visible={categoryModalVisible}
        onClose={() => setCategoryModalVisible(false)}
      />

      {/* 收支明細月份/成員篩選彈窗 */}
      <TransactionFilterModal
        visible={!!filterModalType}
        type={filterModalType}
        onClose={() => setFilterModalType(null)}
        selectedMonth={filterMonth}
        onSelectMonth={setFilterMonth}
        selectedMemberId={filterMemberId}
        onSelectMember={setFilterMemberId}
        availableMonths={availableMonths}
        members={members}
        currentUser={currentUser}
        transactions={transactions}
        getMemberById={getMemberById}
      />

      {/* 統計分析任意月份選擇彈窗 */}
      <MonthPickerModal
        visible={monthPickerVisible}
        onClose={() => setMonthPickerVisible(false)}
        selectedMonth={analyticsMonth}
        onSelectMonth={setAnalyticsMonth}
        availableMonths={availableMonths}
      />

      {/* 匯出資料展示彈窗 */}
      <Modal
        visible={exportModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setExportModalVisible(false)}
      >
        <View style={styles.exportOverlay}>
          <View style={styles.exportCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.exportTitle}>🛡️ 帳本資料備份與匯出</Text>
              <TouchableOpacity onPress={() => setExportModalVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* 格式切換頁籤 (CSV vs JSON) */}
            <View style={styles.exportTabRow}>
              <TouchableOpacity
                style={[styles.exportTabBtn, exportTab === 'csv' && styles.exportTabBtnActive]}
                onPress={() => setExportTab('csv')}
                activeOpacity={0.7}
              >
                <Text style={[styles.exportTabBtnText, exportTab === 'csv' && styles.exportTabBtnTextActive]}>
                  📊 CSV 報表 (Excel)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.exportTabBtn, exportTab === 'json' && styles.exportTabBtnActive]}
                onPress={() => setExportTab('json')}
                activeOpacity={0.7}
              >
                <Text style={[styles.exportTabBtnText, exportTab === 'json' && styles.exportTabBtnTextActive]}>
                  📦 JSON 完整結構
                </Text>
              </TouchableOpacity>
            </View>

            {/* 說明橫幅 */}
            <View style={styles.exportTipBox}>
              <Text style={styles.exportTipText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                {exportTab === 'csv'
                  ? '💡 格式通用於微軟 Excel、Google 試算表與 Apple Numbers，已注入 UTF-8 BOM 繁體中文防亂碼保護。'
                  : '💡 包含帳本基本資料、全體成員稱謂頭像、自訂分類顏色及每筆交易明細之高精度結構封包。'}
              </Text>
              {Platform.OS !== 'web' && (
                <Text style={styles.exportTipSubtext} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                  📱 手機端點擊下方「☁️ 存到雲端硬碟 / 分享」，可在系統選單直接點選「Google 雲端硬碟」或「儲存到檔案」即時備份。
                </Text>
              )}
              <View style={styles.exportLastBackupRow}>
                <Text style={styles.exportLastBackupText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                  ⏱️ 上次備份記錄：{formatLastBackupText(lastBackupAt)}
                </Text>
              </View>
            </View>

            {/* 內容預覽 */}
            <ScrollView style={styles.csvBox}>
              <Text style={styles.csvText} selectable>
                {exportTab === 'csv' ? csvContent : jsonContent}
              </Text>
            </ScrollView>

            {/* 操作按鈕群 */}
            <View style={styles.exportActionRow}>
              <TouchableOpacity style={styles.exportCopyBtn} onPress={handleCopyExportContent} activeOpacity={0.8}>
                <Text style={styles.exportCopyBtnText}>📋 一鍵複製全部文字</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.exportDownloadBtn} onPress={handleShareToCloud} activeOpacity={0.8}>
                <Text style={styles.exportDownloadBtnText}>
                  {Platform.OS === 'web'
                    ? (exportTab === 'csv' ? '💾 下載 .csv 檔案' : '💾 下載 .json 檔案')
                    : '☁️ 存到雲端硬碟 / 分享'}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.closeExportBtn} onPress={() => setExportModalVisible(false)} activeOpacity={0.8}>
              <Text style={styles.closeExportBtnText}>關閉</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 新增家庭成員彈窗 */}
      <Modal visible={memberModalVisible} animationType="fade" transparent>
        <View style={styles.exportOverlay}>
          <View style={styles.exportCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.exportTitle}>➕ 新增家庭成員</Text>
              <TouchableOpacity onPress={() => setMemberModalVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ width: '100%' }}>
              <Text style={styles.formLabel}>成員暱稱 / 稱謂</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="例如：奶奶、爺爺、姊姊、弟弟..."
                placeholderTextColor="#9CA3AF"
                value={newMemberName}
                onChangeText={setNewMemberName}
                autoFocus={Platform.OS !== 'web'}
              />

              <Text style={styles.formLabel}>選擇專屬頭像</Text>
              <AvatarPicker
                selectedAvatar={selectedAvatar}
                onSelectAvatar={setSelectedAvatar}
              />

              <TouchableOpacity style={styles.submitMemberBtn} onPress={handleAddMember}>
                <Text style={styles.submitMemberBtnText}>確認新增成員</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 編輯家庭成員彈窗 */}
      {renderEditMemberModal()}

      {/* 移轉帳目並刪除成員彈窗 */}
      {renderTransferDeleteModal()}

      {/* 修改家庭公帳名稱彈窗 */}
      {renderEditLedgerModal()}

      {/* 自訂邀請碼彈窗 */}
      {renderCustomCodeModal()}

      {/* 修改管理員安全 PIN 碼彈窗 */}
      {renderChangePinModal()}

      {/* PIN 碼升級管理員彈窗 */}
      {renderClaimAdminModal()}

      {/* 切換帳本彈窗 */}
      {renderSwitchLedgerModal()}

      {/* 偵測到待確認的邀請網址 */}
      {renderPendingInviteModal()}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <LedgerProvider>
      <View style={styles.rootWrapper}>
        <MainApp />
      </View>
    </LedgerProvider>
  );
}

const styles = StyleSheet.create({
  rootWrapper: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    width: '100%',
    height: '100%',
  },
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
    position: 'relative',
    overflow: 'hidden',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 0,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    width: '100%',
  },
  topBarSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  ledgerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  ledgerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    flexShrink: 1,
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 20,
    flexShrink: 0,
  },
  syncOnline: {
    backgroundColor: '#ECFDF5',
  },
  syncLocal: {
    backgroundColor: '#FEF3C7',
  },
  syncDot: {
    fontSize: 10,
    marginRight: 4,
  },
  syncText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  content: {
    flex: 1,
  },
  scrollPadding: {
    padding: 16,
    paddingBottom: 90,
  },
  summaryCard: {
    backgroundColor: '#4F46E5',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
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
    marginBottom: 16,
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#6366F1',
    fontWeight: '500',
  },
  searchBarContainer: {
    marginBottom: 8,
  },
  searchBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    color: '#1E293B',
    paddingVertical: 4,
  },
  searchClearBtn: {
    padding: 4,
    marginLeft: 4,
  },
  searchClearText: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '600',
  },
  merchantFilterScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 8,
    paddingHorizontal: 2,
  },
  merchantFilterChip: {
    backgroundColor: '#F8FAFC',
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  merchantFilterChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  merchantFilterChipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  merchantFilterChipTextActive: {
    color: '#4F46E5',
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
    backgroundColor: '#FFFFFF',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
    gap: 5,
  },
  filterChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  filterChipIcon: {
    fontSize: 13,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  filterChipTextActive: {
    color: '#4338CA',
    fontWeight: '700',
  },
  filterChipArrow: {
    fontSize: 11,
    color: '#94A3B8',
    marginLeft: 2,
  },
  filterChipArrowActive: {
    color: '#6366F1',
  },
  filterResetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  filterResetText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  filterEmptyResetBtn: {
    marginTop: 12,
    backgroundColor: '#EEF2FF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  filterEmptyResetText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4F46E5',
  },
  loadMoreContainer: {
    marginTop: 12,
    marginBottom: 8,
    alignItems: 'center',
    gap: 8,
  },
  loadMoreBtn: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
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
    color: '#4F46E5',
  },
  loadMoreSubtext: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 3,
    fontWeight: '600',
  },
  loadAllBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  loadAllBtnText: {
    fontSize: 12,
    color: '#64748B',
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
    color: '#94A3B8',
    fontWeight: '500',
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
    color: '#4B5563',
  },
  emptySubtext: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 4,
  },
  analyticsFilterBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  analyticsFilterScroll: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  analyticsFilterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  analyticsFilterChipActive: {
    backgroundColor: '#4F46E5',
  },
  analyticsFilterText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  analyticsFilterTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  analyticsFilterStatusRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  analyticsFilterStatusText: {
    fontSize: 12,
    color: '#6366F1',
    fontWeight: '600',
    flex: 1,
  },
  analyticsFilterChangeBtnText: {
    fontSize: 12,
    color: '#4F46E5',
    fontWeight: '700',
    marginLeft: 6,
  },
  analyticsFilterSelectMoreChip: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  analyticsFilterSelectMoreText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4F46E5',
  },
  analyticsEmptyBox: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  analyticsEmptyEmoji: {
    fontSize: 32,
    marginBottom: 6,
  },
  analyticsEmptyText: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
  },
  analyticsOverviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  analyticsOverviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  analyticsOverviewTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  analyticsOverviewBadge: {
    backgroundColor: '#EEF2FF',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  analyticsOverviewBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4F46E5',
  },
  analyticsOverviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  analyticsOverviewItem: {
    width: '48%',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
  },
  analyticsOverviewItemLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 4,
  },
  analyticsOverviewItemVal: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  expenseColor: {
    color: '#EF4444',
  },
  incomeColor: {
    color: '#10B981',
  },
  balancePositive: {
    color: '#0284C7',
  },
  balanceNegative: {
    color: '#DC2626',
  },
  cardSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardSectionDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 14,
  },
  memberPayList: {
    gap: 12,
  },
  memberPayCard: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  memberPayCardZero: {
    backgroundColor: '#FAFAFA',
    borderColor: '#F1F5F9',
    opacity: 0.75,
  },
  memberPayTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  memberRankText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    minWidth: 18,
    textAlign: 'center',
    marginRight: 4,
  },
  memberRankTextTop: {
    fontSize: 15,
  },
  topPayerBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 6,
  },
  topPayerBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
  },
  meBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    marginLeft: 4,
  },
  meBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4F46E5',
  },
  memberAmountZero: {
    color: '#94A3B8',
  },
  memberPayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 12,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberAvatar: {
    fontSize: 22,
    marginRight: 10,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
  },
  memberAmountBox: {
    alignItems: 'flex-end',
  },
  memberAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#EF4444',
  },
  memberRatio: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  typeToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
    alignItems: 'center',
  },
  typeToggleBtn: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: 'transparent',
  },
  typeToggleBtnActiveExpense: {
    backgroundColor: '#EF4444',
  },
  typeToggleBtnActiveIncome: {
    backgroundColor: '#10B981',
  },
  typeToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  typeToggleTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  categoryStatRow: {
    marginBottom: 12,
  },
  catHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  catName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  catNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  catRankBadge: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
    minWidth: 20,
    textAlign: 'center',
  },
  catRankBadgeTop: {
    fontSize: 15,
  },
  catCountText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  catAmount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  catPercentage: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  userSwitchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
  },
  userChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 11,
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    maxWidth: '100%',
  },
  userChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  userChipDisabled: {
    opacity: 0.75,
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  userAvatar: {
    fontSize: 18,
    marginRight: 6,
  },
  userTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  userTitleActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  memberEditHintIcon: {
    fontSize: 11,
    marginLeft: 5,
    opacity: 0.65,
  },
  inviteBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    padding: 12,
    borderRadius: 12,
  },
  inviteCode: {
    fontSize: 18,
    fontWeight: '800',
    color: '#334155',
    letterSpacing: 2,
  },
  copyBtn: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  copyBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  backupStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  backupStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  backupStatVal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
  },
  backupStatLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  backupStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#CBD5E1',
  },
  backupBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  exportCsvBtn: {
    flex: 1,
    backgroundColor: '#10B981',
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  exportCsvBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  exportJsonBtn: {
    flex: 1,
    backgroundColor: '#4F46E5',
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  exportJsonBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  exportBtnSubtext: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 10,
    marginTop: 2,
    fontWeight: '500',
  },
  // Option B: 備份提醒橫幅樣式 (Transactions tab)
  backupReminderBanner: {
    backgroundColor: '#FEF3C7',
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
    color: '#92400E',
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
    color: '#B45309',
  },
  backupReminderDesc: {
    fontSize: 12,
    color: '#78350F',
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

  // Option B: 家庭頁面備份排程與狀態卡片樣式
  backupScheduleBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  backupScheduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  backupScheduleHeaderLeft: {
    flex: 1,
    marginRight: 8,
  },
  backupScheduleTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  backupScheduleSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  backupToggleBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  backupToggleBtnActive: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#4F46E5',
  },
  backupToggleBtnInactive: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  backupToggleText: {
    fontSize: 11,
    fontWeight: '700',
  },
  backupToggleTextActive: {
    color: '#4F46E5',
  },
  backupToggleTextInactive: {
    color: '#64748B',
  },
  backupStatusNotice: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  backupStatusNoticeOk: {
    backgroundColor: '#ECFDF5',
    borderLeftWidth: 3,
    borderLeftColor: '#10B981',
  },
  backupStatusNoticeDue: {
    backgroundColor: '#FFFBEB',
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  backupStatusNoticeText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  backupStatusNoticeTextOk: {
    color: '#065F46',
  },
  backupStatusNoticeTextDue: {
    color: '#92400E',
  },
  backupIntervalSection: {
    marginBottom: 10,
  },
  backupIntervalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  backupIntervalChips: {
    flexDirection: 'row',
    gap: 8,
  },
  backupIntervalChip: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  backupIntervalChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  backupIntervalChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  backupIntervalChipTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  backupPrivacyNote: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 84,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  fabText: {
    fontSize: 32,
    color: '#FFFFFF',
    lineHeight: 34,
    fontWeight: '300',
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
    height: 68,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    borderTopWidth: 1,
    borderColor: '#F1F5F9',
    paddingBottom: 8,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navItemActive: {
    borderTopWidth: 2,
    borderColor: '#4F46E5',
  },
  navIcon: {
    fontSize: 20,
    marginBottom: 2,
  },
  navText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  navTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  exportOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  exportCard: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    maxHeight: '75%',
  },
  exportTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  exportTabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  exportTabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportTabBtnActive: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1.5,
    borderColor: '#4F46E5',
  },
  exportTabBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  exportTabBtnTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  exportTipBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#4F46E5',
  },
  exportTipText: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 16,
  },
  exportTipSubtext: {
    fontSize: 11,
    color: '#4F46E5',
    lineHeight: 16,
    marginTop: 4,
    fontWeight: '600',
  },
  exportLastBackupRow: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  exportLastBackupText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  csvBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  csvText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
    color: '#334155',
  },
  exportActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  exportCopyBtn: {
    flex: 1,
    backgroundColor: '#EEF2FF',
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportCopyBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4F46E5',
  },
  exportDownloadBtn: {
    flex: 1,
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportDownloadBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeExportBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  closeExportBtnText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  sectionHeaderLeft: {
    flex: 1,
    minWidth: 0,
    marginRight: 6,
  },
  sectionHeaderDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  addMemberBtn: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    flexShrink: 0,
  },
  addMemberBtnText: {
    color: '#4F46E5',
    fontSize: 12,
    fontWeight: '700',
  },
  userChipClickable: {
    alignItems: 'center',
    width: '100%',
  },
  activeTag: {
    fontSize: 10,
    color: '#4F46E5',
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
    marginLeft: 5,
    fontWeight: '700',
  },
  deleteMemberBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  deleteMemberText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: 'bold',
  },
  memberRoleBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
    marginLeft: 5,
    borderWidth: 0.5,
    borderColor: '#FDE68A',
  },
  memberRoleBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#B45309',
  },
  roleToggleBtn: {
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    zIndex: 10,
  },
  roleToggleBtnPromote: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  roleToggleBtnDemote: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  roleToggleBtnText: {
    fontSize: 10,
    fontWeight: '700',
  },
  roleToggleBtnTextPromote: {
    color: '#B45309',
  },
  roleToggleBtnTextDemote: {
    color: '#64748B',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  closeBtn: {
    padding: 6,
  },
  closeText: {
    fontSize: 18,
    color: '#9CA3AF',
    fontWeight: 'bold',
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    marginBottom: 18,
    width: '100%',
    minWidth: 0,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  avatarChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatarChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  avatarEmoji: {
    fontSize: 22,
  },
  submitMemberBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  submitMemberBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  modalMemberAdminSection: {
    marginTop: 16,
  },
  memberSectionDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginBottom: 14,
  },
  modalSubHint: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 8,
    lineHeight: 18,
  },
  modalRoleToggleBtn: {
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  modalRoleToggleBtnPromote: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  modalRoleToggleBtnDemote: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  modalRoleToggleBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  modalRoleToggleBtnTextPromote: {
    color: '#4F46E5',
  },
  modalRoleToggleBtnTextDemote: {
    color: '#B45309',
  },
  modalDeleteBtn: {
    backgroundColor: '#FEE2E2',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
    marginTop: 6,
  },
  modalDeleteBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
  },
  topBarTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ledgerTitleClickable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  ledgerEditPencil: {
    fontSize: 13,
  },
  ownerTopBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  ownerTopBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
  },
  welcomeScroll: {
    padding: 20,
    paddingBottom: 60,
    alignItems: 'center',
  },
  welcomeHero: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 24,
  },
  welcomeEmoji: {
    fontSize: 56,
    marginBottom: 12,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 6,
  },
  welcomeSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  featureBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    width: '100%',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  featureIcon: {
    fontSize: 22,
    marginRight: 12,
  },
  featureTextCol: {
    flex: 1,
  },
  featureItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 2,
  },
  featureItemDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  welcomeActions: {
    width: '100%',
    gap: 14,
  },
  welcomePrimaryCard: {
    backgroundColor: '#4F46E5',
    borderRadius: 18,
    padding: 18,
    width: '100%',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  welcomeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  welcomeCardBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  welcomeCardArrow: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  welcomeCardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  welcomeCardDesc: {
    fontSize: 12,
    color: '#E0E7FF',
    lineHeight: 17,
  },
  welcomeSecondaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    width: '100%',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  welcomeCardBadgeSecondary: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  welcomeCardArrowSecondary: {
    fontSize: 18,
    color: '#4F46E5',
    fontWeight: 'bold',
  },
  welcomeCardTitleSecondary: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 4,
  },
  welcomeCardDescSecondary: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
  },
  formHint: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 14,
  },
  pendingInviteButtons: {
    marginTop: 16,
    gap: 10,
  },
  confirmInviteBtn: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmInviteBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelInviteBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelInviteBtnText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
  orDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    paddingHorizontal: 10,
    fontSize: 12,
    color: '#94A3B8',
  },
  leaveLedgerBtn: {
    backgroundColor: '#FEF2F2',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  leaveLedgerBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
  },
  inviteHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    flexShrink: 0,
  },
  roleBadgeOwner: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  roleBadgeMember: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  roleBadgeTextOwner: {
    color: '#B45309',
  },
  roleBadgeTextMember: {
    color: '#4F46E5',
  },
  inviteCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  inviteCardLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 6,
  },
  inviteCodeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  inviteCodeLarge: {
    fontSize: 24,
    fontWeight: '900',
    color: '#1E293B',
    letterSpacing: 2,
  },
  copyCodeMiniBtn: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  copyCodeMiniBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  copyLinkBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  copyLinkBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  ownerControlsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  ownerControlBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  ownerControlBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  switchLedgerEntryBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  switchLedgerEntryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4F46E5',
  },
  invitePreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  invitePreviewIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  invitePreviewLedgerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#312E81',
  },
  invitePreviewCodeText: {
    fontSize: 12,
    color: '#6366F1',
    fontWeight: '600',
    marginTop: 2,
  },
  changeCodeBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    marginLeft: 6,
  },
  changeCodeBtnText: {
    fontSize: 11,
    color: '#4F46E5',
    fontWeight: '600',
  },
  queryPreviewBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  queryPreviewBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  claimSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  claimSectionDesc: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
    marginBottom: 10,
  },
  claimGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
  },
  claimMemberCard: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    position: 'relative',
  },
  claimMemberCardActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  claimMemberAvatar: {
    fontSize: 24,
    marginRight: 8,
  },
  claimMemberName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  claimMemberNameActive: {
    color: '#4F46E5',
  },
  claimMemberRoleText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  claimCheckedBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#4F46E5',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  claimCheckedText: {
    fontSize: 9,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  switchCreateMemberBtn: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 4,
  },
  switchCreateMemberBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
  },
  backToClaimBtn: {
    paddingVertical: 6,
    marginBottom: 10,
  },
  backToClaimBtnText: {
    fontSize: 13,
    color: '#4F46E5',
    fontWeight: '600',
  },
  editMemberBtn: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    width: '100%',
  },
  editMemberBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
  },
  transferAlertBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 12,
    marginBottom: 14,
  },
  transferAlertTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 4,
  },
  transferAlertDesc: {
    fontSize: 12,
    color: '#78350F',
    lineHeight: 18,
  },
  transferRecipientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  transferRecipientCardActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  transferRecipientAvatar: {
    fontSize: 24,
    marginRight: 10,
  },
  transferRecipientName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  transferRecipientNameActive: {
    color: '#4F46E5',
  },
  transferRecipientSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  meTransferBadge: {
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  meTransferBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4338CA',
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  radioCircleActive: {
    borderColor: '#4F46E5',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4F46E5',
  },
  cancelTransferBtn: {
    marginTop: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelTransferBtnText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
  adminPinPromptBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#FCD34D',
    padding: 12,
    marginTop: 6,
    marginBottom: 14,
  },
  adminPinPromptTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
  },
  adminPinPromptDesc: {
    fontSize: 12,
    color: '#78350F',
    lineHeight: 18,
    marginBottom: 10,
  },
  adminPinInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    letterSpacing: 2,
  },
  pinSectionWrapper: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  pinHeaderRow: {
    marginBottom: 8,
  },
  pinHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 2,
  },
  pinHeaderDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  pinCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pinCardLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  pinCardValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 3,
    marginTop: 2,
  },
  pinCardHint: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
  },
  togglePinBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  togglePinBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  changePinBtn: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  changePinBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  claimAdminBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginTop: 10,
  },
  claimAdminBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E40AF',
    marginBottom: 2,
  },
  claimAdminBannerDesc: {
    fontSize: 11,
    color: '#3B82F6',
    lineHeight: 15,
  },
  claimAdminBannerBtn: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  claimAdminBannerBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  versionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  versionTagBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  versionTagBadgeText: {
    color: '#4F46E5',
    fontSize: 12,
    fontWeight: '800',
  },
  versionDetailBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  versionDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  versionDetailLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    flexShrink: 0,
  },
  versionDetailValue: {
    fontSize: 12,
    color: '#1E293B',
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  monoText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
    color: '#4F46E5',
  },
  checkUpdateBtn: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  checkUpdateBtnDisabled: {
    opacity: 0.6,
  },
  checkUpdateBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  manageCategoryBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  manageCategoryBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4F46E5',
  },
  categoryPreviewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  categoryPreviewChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: '48%',
  },
  categoryPreviewIcon: {
    fontSize: 13,
    marginRight: 4,
  },
  categoryPreviewText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#334155',
  },
  categoryMoreChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
  },
  categoryMoreText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  previewModeBanner: {
    backgroundColor: '#FFFBEB',
    borderBottomWidth: 1.5,
    borderBottomColor: '#FDE68A',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 999,
  },
  previewModeBannerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewModeBannerIcon: {
    fontSize: 22,
    marginRight: 10,
  },
  previewModeBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
  },
  previewModeBannerSub: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 1,
  },
  exitPreviewBtn: {
    backgroundColor: '#D97706',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  exitPreviewBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  modalPreviewBtn: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#FCD34D',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  modalPreviewBtnText: {
    color: '#92400E',
    fontSize: 14,
    fontWeight: '700',
  },
  testToastBtn: {
    marginTop: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  testToastBtnText: {
    color: '#4F46E5',
    fontSize: 12,
    fontWeight: '700',
  },
});
