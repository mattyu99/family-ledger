import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  SafeAreaView,
  View,
  Text as RNText,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Platform,
  TextProps,
  TextInputProps,
  TextInput as RNTextInput,
} from 'react-native';
import * as Updates from 'expo-updates';

import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { LedgerProvider, useLedger } from './src/context/LedgerContext';
import { showAlert, showConfirm } from './src/lib/alert';
import { parseMemoNote } from './src/lib/memo';
import { isBillDueInMonth, isBillPaidForCurrentPeriod } from './src/lib/recurring';
import { Transaction, Profile } from './src/types';

// Screens
import {
  TransactionsScreen,
  AnalyticsScreen,
  BillsScreen,
  FamilySettingsScreen,
} from './src/screens';

// Modals
import {
  CreateLedgerModal,
  JoinLedgerModal,
  SwitchLedgerModal,
  PendingInviteModal,
  EditLedgerModal,
  CustomCodeModal,
  ChangePinModal,
  ClaimAdminModal,
  AdminModeModal,
  EditMemberModal,
  ClaimGoogleModal,
  TransferDeleteModal,
  AddMemberModal,
  ExportBackupModal,
} from './src/components/modals';

// Feature Modals & Widgets
import { AddTransactionModal } from './src/components/AddTransactionModal';
import { EditTransactionModal } from './src/components/EditTransactionModal';
import { MemoTodoModal } from './src/components/MemoTodoModal';
import { MemoCompletionModal } from './src/components/MemoCompletionModal';
import { CategoryManageModal } from './src/components/CategoryManageModal';
import { InvoiceLotteryModal } from './src/components/InvoiceLotteryModal';
import { TransactionFilterModal } from './src/components/TransactionFilterModal';
import { MonthPickerModal } from './src/components/MonthPickerModal';
import { CreditCardReconciliationModal } from './src/components/CreditCardReconciliationModal';
import { PaymentAccountsManageModal } from './src/components/PaymentAccountsManageModal';
import { PaymentMethodsManageModal } from './src/components/PaymentMethodsManageModal';
import { RecurringBillsManageModal } from './src/components/RecurringBillsManageModal';
import { BudgetManageModal } from './src/components/BudgetManageModal';
import { ProductGuideModal } from './src/components/ProductGuideModal';
import { ChangelogModal } from './src/components/ChangelogModal';
import { CloudLedgerManagerModal } from './src/components/CloudLedgerManagerModal';
import { ImageViewerModal } from './src/components/ImageViewerModal';
import { LiveToastBanner } from './src/components/LiveToastBanner';

// 全域文字防禦包裝
const Text: React.FC<TextProps> = ({ allowFontScaling = false, maxFontSizeMultiplier = 1.08, ...rest }) => (
  <RNText
    allowFontScaling={allowFontScaling}
    maxFontSizeMultiplier={Math.min(maxFontSizeMultiplier ?? 1.08, 1.08)}
    {...rest}
  />
);

// Web 專用重設樣式注入
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
      }
    `;
    document.head.appendChild(style);
  }
}

const AppContent: React.FC = () => {
  const { themeMode, isDark, colors, toggleTheme } = useTheme();
  const {
    currentLedger,
    ledgers,
    members,
    transactions,
    currentUser,
    isOwner,
    realIsOwner,
    realCurrentUser,
    hasJoinedLedger,
    isAdminMode,
    disableAdminMode,
    isCloudSynced,
    historySyncProgress,
    refreshLedger,
    hasOtherUnread,
    previewMember,
    isPreviewMode,
    exitMemberPreview,
    recurringRules,
    getMemberById,
    fetchMemberDevices,
    signInWithGoogle,
    liveToast,
    dismissLiveToast,
    triggerLiveToast,
    updateTransaction,
    pendingInviteCode,
    confirmPendingInvite,
    cancelPendingInvite,
  } = useLedger();

  // 分頁狀態
  const [activeTab, setActiveTab] = useState<'transactions' | 'analytics' | 'bills' | 'family'>('transactions');

  // 明細篩選狀態
  const [filterMonth, setFilterMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [filterMemberId, setFilterMemberId] = useState<string>(() => currentUser?.id || 'all');
  const [hasManuallySelectedMember, setHasManuallySelectedMember] = useState<boolean>(false);
  const [filterModalType, setFilterModalType] = useState<'month' | 'member' | null>(null);

  // 統計月份狀態
  const [analyticsMonth, setAnalyticsMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);

  // 帳單與支付範圍
  const [billsScope, setBillsScope] = useState<'my' | 'all'>('my');

  // 手動更新狀態
  const [isRefreshing, setIsRefreshing] = useState(false);
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

  // 切回日常成員模式
  const handleSwitchToDailyMemberMode = () => {
    showConfirm(
      '切回日常成員模式',
      '確定要切回日常成員模式嗎？\n切回後所有管理專屬按鈕將自動隱藏，讓日常記帳更安心防誤觸。',
      () => {
        disableAdminMode();
      }
    );
  };

  // 當前使用者變更時同步篩選
  useEffect(() => {
    if (!hasManuallySelectedMember && currentUser?.id) {
      setFilterMemberId(currentUser.id);
    }
  }, [currentUser?.id, hasManuallySelectedMember]);

  // 新增/編輯交易表單狀態
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<'expense' | 'income' | 'transfer' | 'allowance' | 'memo'>('expense');
  const [modalRecipientId, setModalRecipientId] = useState<string | undefined>(undefined);
  const [modalDefaultPayerId, setModalDefaultPayerId] = useState<string | undefined>(undefined);
  const [modalDefaultNote, setModalDefaultNote] = useState<string | undefined>(undefined);
  const [modalLinkedMemoId, setModalLinkedMemoId] = useState<string | undefined>(undefined);
  const [modalLinkedCompletionNote, setModalLinkedCompletionNote] = useState<string | undefined>(undefined);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const returnToInvoiceLotteryRef = useRef<boolean>(false);

  // 生活記事待辦狀態
  const [memoTodoModalVisible, setMemoTodoModalVisible] = useState(false);
  const [completingMemo, setCompletingMemo] = useState<Transaction | null>(null);
  const [completionTempNote, setCompletionTempNote] = useState<string>('');
  const [completionTempCompleter, setCompletionTempCompleter] = useState<string>('');

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

  const availableYears = useMemo(() => {
    const yearMap = new Map<number, number>();
    const currentYear = new Date().getFullYear();
    yearMap.set(currentYear, 0);

    transactions.forEach(t => {
      if (t.transacted_at) {
        const d = new Date(t.transacted_at);
        if (!isNaN(d.getTime())) {
          const y = d.getFullYear();
          yearMap.set(y, (yearMap.get(y) || 0) + 1);
        }
      }
    });

    return Array.from(yearMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([year, count]) => ({
        year,
        label: `${year} 全年`,
        count,
      }));
  }, [transactions]);

  const handleOpenMemoCompletion = (tx: Transaction) => {
    setCompletingMemo(tx);
    setCompletionTempNote(tx.completion_note || '');
    setCompletionTempCompleter(tx.completed_by || currentUser?.id || members[0]?.id || '');
  };

  const handleCompleteMemoOnly = async (memoId: string, completedBy: string, note?: string) => {
    await updateTransaction(memoId, {
      is_settled: true,
      completed_by: completedBy,
      completion_note: note || undefined,
    });
    setCompletingMemo(null);
    setCompletionTempNote('');
    setCompletionTempCompleter('');
  };

  const handleLinkExpenseFromCompletion = (memo: Transaction, completedBy: string, note?: string) => {
    setModalMode('expense');
    setModalLinkedMemoId(memo.id);
    setModalDefaultPayerId(completedBy || currentUser?.id);
    const memoData = parseMemoNote(memo.note);
    setModalDefaultNote(`[辦妥] ${memoData.title || memo.note}`);
    setModalLinkedCompletionNote(note);
    setCompletionTempCompleter(completedBy);
    setCompletionTempNote(note || '');
    setModalVisible(true);
  };

  // 各功能彈窗顯示狀態
  const [createLedgerModalVisible, setCreateLedgerModalVisible] = useState(false);
  const [joinLedgerModalVisible, setJoinLedgerModalVisible] = useState(false);
  const [switchLedgerModalVisible, setSwitchLedgerModalVisible] = useState(false);
  const [pendingInviteModalVisible, setPendingInviteModalVisible] = useState(false);
  const [editLedgerModalVisible, setEditLedgerModalVisible] = useState(false);
  const [customCodeModalVisible, setCustomCodeModalVisible] = useState(false);
  const [changePinModalVisible, setChangePinModalVisible] = useState(false);
  const [claimAdminModalVisible, setClaimAdminModalVisible] = useState(false);
  const [adminModeModalVisible, setAdminModeModalVisible] = useState(false);
  const [addMemberModalVisible, setAddMemberModalVisible] = useState(false);
  const [editMemberModalVisible, setEditMemberModalVisible] = useState(false);
  const [editingMember, setEditingMember] = useState<Profile | null>(null);
  const [claimGoogleModalVisible, setClaimGoogleModalVisible] = useState(false);
  const [claimGoogleTargetMember, setClaimGoogleTargetMember] = useState<Profile | null>(null);
  const [transferDeleteModalVisible, setTransferDeleteModalVisible] = useState(false);
  const [transferDeleteTargetMember, setTransferDeleteTargetMember] = useState<Profile | null>(null);

  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportModalTab, setExportModalTab] = useState<'csv' | 'json' | 'restore'>('csv');
  const [cloudLedgerManagerVisible, setCloudLedgerManagerVisible] = useState(false);
  const [productGuideModalVisible, setProductGuideModalVisible] = useState(false);
  const [changelogModalVisible, setChangelogModalVisible] = useState(false);

  // 圖片全螢幕預覽
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [imageViewerUrl, setImageViewerUrl] = useState('');
  const [imageViewerTitle, setImageViewerTitle] = useState<string | undefined>(undefined);

  const handleViewImage = (url: string, title?: string) => {
    setImageViewerUrl(url);
    setImageViewerTitle(title);
    setImageViewerVisible(true);
  };

  // 預算管理
  const [budgetManageModalVisible, setBudgetManageModalVisible] = useState(false);
  const [budgetManageModalTab, setBudgetManageModalTab] = useState<'family' | 'members'>('family');

  // 帳單與支付
  const [accountsManageModalVisible, setAccountsManageModalVisible] = useState(false);
  const [paymentMethodsModalVisible, setPaymentMethodsModalVisible] = useState(false);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [recurringModalVisible, setRecurringModalVisible] = useState(false);
  const [recurringModalScope, setRecurringModalScope] = useState<'all' | 'my'>('all');
  const [recurringModalTargetMemberId, setRecurringModalTargetMemberId] = useState<string | undefined>(undefined);
  const [recurringModalInitialTab, setRecurringModalInitialTab] = useState<'pending' | 'rules'>('rules');

  // 對帳
  const [reconcileModalVisible, setReconcileModalVisible] = useState(false);
  const [reconcileAccountType, setReconcileAccountType] = useState<'credit_card' | 'stored_value'>('credit_card');
  const [reconcileAccountId, setReconcileAccountId] = useState<string | undefined>(undefined);
  const [reconcileModalScope, setReconcileModalScope] = useState<'my' | 'all'>('my');
  const [reconcileModalTargetMemberId, setReconcileModalTargetMemberId] = useState<string | undefined>(undefined);

  // 發票對獎
  const [invoiceLotteryModalVisible, setInvoiceLotteryModalVisible] = useState(false);

  // 檢查更新狀態
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
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

  // 本期待繳帳單筆數 (到期需手動確認記帳之項目)
  const pendingRecurringBillsCount = useMemo(() => {
    const now = new Date();
    const currYear = now.getFullYear();
    const currMonth = now.getMonth() + 1;
    return (recurringRules || []).filter(rule => {
      if (rule.ledger_id && currentLedger?.id && rule.ledger_id !== currentLedger.id) return false;
      if (!rule.is_active) return false;
      if (!isBillDueInMonth(rule, currYear, currMonth)) return false;
      return !isBillPaidForCurrentPeriod(rule, now);
    }).length;
  }, [recurringRules, currentLedger?.id]);

  // 開啟成員編輯
  const handleStartEditMember = (member: Profile) => {
    setEditingMember(member);
    setEditMemberModalVisible(true);
    fetchMemberDevices(currentLedger.id, member.id).catch(() => {});
  };

  // 開啟對帳看板
  const openReconcileModalForCurrentFilter = (accountType: 'credit_card' | 'stored_value', accountId?: string) => {
    setReconcileAccountType(accountType);
    setReconcileAccountId(accountId);
    if (filterMemberId === 'all') {
      setReconcileModalScope('all');
      setReconcileModalTargetMemberId(undefined);
    } else {
      const targetM = members.find(m => m.id === filterMemberId);
      const isMe =
        filterMemberId === currentUser?.id ||
        (!!currentUser?.display_name && targetM?.display_name === currentUser.display_name);
      if (isMe) {
        setReconcileModalScope('my');
        setReconcileModalTargetMemberId(undefined);
      } else {
        setReconcileModalScope('all');
        setReconcileModalTargetMemberId(filterMemberId);
      }
    }
    setReconcileModalVisible(true);
  };

  // 1. 若尚未加入或建立帳本，呈現歡迎與引導卡片
  if (!hasJoinedLedger) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.canvas }]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background.card} translucent={true} />
        <ScrollView contentContainerStyle={styles.welcomeScroll}>
          <View style={styles.welcomeContainer}>
            <View style={styles.welcomeHero}>
              <View style={[styles.welcomeBadge, isDark && { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
                <Text style={styles.welcomeBadgeText}>跨裝置即時同步</Text>
              </View>
              <Text style={[styles.welcomeTitle, { color: colors.text.primary }]}>甜心記帳本</Text>
              <Text style={[styles.welcomeDesc, { color: colors.text.secondary }]}>
                專為家庭與伴侶打造的共享公帳。支援多人即時記帳、零用錢撥款、預算控管與週期帳單管理。
              </Text>
            </View>

            <View style={styles.welcomeActionGroup}>
              <TouchableOpacity
                style={styles.welcomeGoogleCard}
                onPress={async () => {
                  const res = await signInWithGoogle();
                  if (!res.success && res.message) {
                    showAlert('登入提示', res.message);
                  }
                }}
                activeOpacity={0.85}
              >
                <View style={styles.welcomeCardHeader}>
                  <Text style={styles.welcomeGoogleBadge}>已有帳號 / 換手機 / 跨裝置</Text>
                  <Text style={styles.welcomeCardArrow}>→</Text>
                </View>
                <Text style={styles.welcomeGoogleTitle}>🟢 使用 Google 帳號一鍵登入</Text>
                <Text style={styles.welcomeGoogleDesc}>
                  曾綁定過 Google 帳號？登入後立即自動還原並解鎖名下的所有家庭公帳與身分稱謂！
                </Text>
              </TouchableOpacity>

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
                style={[styles.welcomeSecondaryCard, { backgroundColor: colors.background.card, borderColor: colors.border.default }]}
                onPress={() => setJoinLedgerModalVisible(true)}
                activeOpacity={0.85}
              >
                <View style={styles.welcomeCardHeader}>
                  <Text style={styles.welcomeCardBadgeSecondary}>我是家人</Text>
                  <Text style={styles.welcomeCardArrowSecondary}>→</Text>
                </View>
                <Text style={[styles.welcomeCardTitleSecondary, { color: colors.text.primary }]}>🔗 輸入邀請碼加入現有帳本</Text>
                <Text style={[styles.welcomeCardDescSecondary, { color: colors.text.secondary }]}>
                  家人已建立帳本？輸入 4~8 碼邀請代碼（或貼上 LINE 邀請連結）立即進入同一本公帳。
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        <CreateLedgerModal
          visible={createLedgerModalVisible}
          onClose={() => setCreateLedgerModalVisible(false)}
          onSuccess={() => setCreateLedgerModalVisible(false)}
        />
        <JoinLedgerModal
          visible={joinLedgerModalVisible}
          onClose={() => setJoinLedgerModalVisible(false)}
          onSuccess={() => setJoinLedgerModalVisible(false)}
        />
        <PendingInviteModal
          visible={!!pendingInviteCode}
          inviteCode={pendingInviteCode}
          onConfirm={(code) => confirmPendingInvite()}
          onCancel={cancelPendingInvite}
        />
      </SafeAreaView>
    );
  }

  // 2. 主介面視圖
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.canvas }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background.card} translucent={true} />

      {/* App 內即時溫馨動態泡泡 */}
      <LiveToastBanner toast={liveToast} onDismiss={dismissLiveToast} />

      {/* 頂部導航列 */}
      <View style={[styles.topBar, { backgroundColor: colors.background.card, borderBottomColor: colors.border.default }]}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <View style={styles.topBarSubtitleRow}>
            <Text style={[styles.ledgerSubtitle, { color: colors.text.muted }]} maxFontSizeMultiplier={1.2}>家庭共享記帳本</Text>
            {isAdminMode && (
              <TouchableOpacity
                style={[styles.ownerTopBadge, isDark && { backgroundColor: 'rgba(236, 72, 153, 0.2)', borderColor: 'rgba(236, 72, 153, 0.4)' }]}
                onPress={handleSwitchToDailyMemberMode}
                activeOpacity={0.7}
              >
                <Text style={styles.ownerTopBadgeText} maxFontSizeMultiplier={1.2}>👑 管理員模式</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.topBarTitleRow}>
            {isOwner ? (
              <TouchableOpacity
                style={styles.ledgerTitleClickable}
                onPress={() => setEditLedgerModalVisible(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.ledgerTitle, { color: colors.text.primary }]} numberOfLines={1} ellipsizeMode="tail" maxFontSizeMultiplier={1.2}>
                  {currentLedger.name}
                </Text>
                <Text style={styles.ledgerEditPencil}>✏️</Text>
              </TouchableOpacity>
            ) : (
              <Text style={[styles.ledgerTitle, { color: colors.text.primary }]} numberOfLines={1} ellipsizeMode="tail" maxFontSizeMultiplier={1.2}>
                {currentLedger.name}
              </Text>
            )}

            {Boolean(currentLedger.is_read_only) && (
              <View style={[styles.topBarReadOnlyBadge, isDark && { backgroundColor: colors.background.cardSubtle }]}>
                <Text style={styles.topBarReadOnlyBadgeText}>🔒 唯讀</Text>
              </View>
            )}

            {ledgers.length > 1 && (
              <TouchableOpacity
                style={[
                  styles.switchLedgerTopBadge,
                  isDark && { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default },
                  hasOtherUnread && styles.switchLedgerTopBadgeUnread,
                ]}
                onPress={() => setSwitchLedgerModalVisible(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.switchLedgerTopBadgeText, isDark && { color: colors.text.secondary }]}>切換 ▾</Text>
                {hasOtherUnread && <View style={styles.topBadgeRedDot} />}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* 右側操作按鈕群組 */}
        <View style={styles.topBarRightActions}>
          <TouchableOpacity
            style={[
              styles.themeToggleBtn,
              {
                backgroundColor: isDark ? colors.background.cardSubtle : '#F1F5F9',
                borderColor: colors.border.default,
              },
            ]}
            onPress={toggleTheme}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.themeToggleBtnIcon}>
              {themeMode === 'light' ? '☀️' : themeMode === 'dark' ? '🌙' : '🌓'}
            </Text>
            <Text style={[styles.themeToggleBtnText, { color: colors.text.secondary }]}>
              {themeMode === 'light' ? '淺色' : themeMode === 'dark' ? '深色' : '系統'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.syncBadge,
              isCloudSynced ? styles.syncOnline : styles.syncLocal,
              isDark && {
                backgroundColor: isCloudSynced ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                borderColor: isCloudSynced ? 'rgba(16, 185, 129, 0.35)' : 'rgba(245, 158, 11, 0.35)',
              },
            ]}
            onPress={handleRefresh}
            activeOpacity={0.7}
          >
            <Text style={styles.syncDot}>{historySyncProgress || isRefreshing ? '🔄' : (isCloudSynced ? '🟢' : '🟡')}</Text>
            <Text style={[styles.syncText, isDark && { color: colors.text.secondary }]} maxFontSizeMultiplier={1.2}>
              {historySyncProgress ? '歷史同步中...' : isRefreshing ? '同步更新中...' : (isCloudSynced ? '雲端即時同步' : '本地離線快取')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 角色預覽模式橫幅 */}
      {isPreviewMode && previewMember && (
        <View style={styles.previewModeBanner}>
          <View style={styles.previewModeBannerLeft}>
            <Text style={styles.previewModeBannerIcon}>
              {previewMember.id === realCurrentUser.id ? '🧪' : '👀'}
            </Text>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.previewModeBannerTitle} numberOfLines={1}>
                {previewMember.id === realCurrentUser.id
                  ? `正在模擬：${previewMember.display_name} (一般成員視角)`
                  : `正在預覽：${previewMember.display_name}`}
              </Text>
              <Text style={styles.previewModeBannerSub} numberOfLines={1}>
                {previewMember.id === realCurrentUser.id
                  ? '已隱藏所有管理員特權・體驗一般成員操作'
                  : '模擬一般成員視角中・記帳預設以其付款'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.exitPreviewBtn}
            activeOpacity={0.8}
            onPress={() => {
              exitMemberPreview();
              showAlert(
                previewMember.id === realCurrentUser.id ? '已結束模擬' : '已結束預覽',
                '已安全恢復為管理員身分！'
              );
            }}
          >
            <Text style={styles.exitPreviewBtnText}>
              {previewMember.id === realCurrentUser.id ? '✕ 結束模擬' : '✕ 結束預覽'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 主頁籤內容 */}
      <View style={{ flex: 1 }}>
        {activeTab === 'transactions' && (
          <TransactionsScreen
            filterMonth={filterMonth}
            setFilterMonth={setFilterMonth}
            filterMemberId={filterMemberId}
            setFilterMemberId={setFilterMemberId}
            onOpenModal={(mode, recipientId) => {
              setModalMode(mode);
              setModalRecipientId(recipientId);
              setModalVisible(true);
            }}
            onOpenEditTransaction={(tx) => setEditingTransaction(tx)}
            onOpenMemoCompletion={handleOpenMemoCompletion}
            onOpenBudgetManageModal={(tab) => {
              setBudgetManageModalTab(tab || 'family');
              setBudgetManageModalVisible(true);
            }}
            onOpenAccountsManageModal={() => setAccountsManageModalVisible(true)}
            onOpenRecurringModal={(scope, targetMemberId, initialTab) => {
              setRecurringModalScope(scope);
              setRecurringModalTargetMemberId(targetMemberId);
              setRecurringModalInitialTab(initialTab === 'pending' ? 'pending' : 'rules');
              setRecurringModalVisible(true);
            }}
            onOpenMemoTodoModal={() => setMemoTodoModalVisible(true)}
            onOpenInvoiceLotteryModal={() => setInvoiceLotteryModalVisible(true)}
            onOpenReconcileModal={openReconcileModalForCurrentFilter}
            onOpenExportModal={(tab) => {
              setExportModalTab(tab);
              setExportModalVisible(true);
            }}
            onViewImage={handleViewImage}
            onOpenFilterModal={(type) => setFilterModalType(type)}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsScreen
            analyticsMonth={analyticsMonth}
            setAnalyticsMonth={setAnalyticsMonth}
            onOpenMonthPicker={() => setMonthPickerVisible(true)}
          />
        )}

        {activeTab === 'bills' && (
          <BillsScreen
            onOpenAccountsManageModal={() => setAccountsManageModalVisible(true)}
            onOpenPaymentMethodsModal={() => setPaymentMethodsModalVisible(true)}
            onOpenCategoryModal={() => setCategoryModalVisible(true)}
            onOpenRecurringModal={(scope, targetMemberId, initialTab) => {
              setRecurringModalScope(scope);
              setRecurringModalTargetMemberId(targetMemberId);
              setRecurringModalInitialTab(initialTab === 'pending' ? 'pending' : 'rules');
              setRecurringModalVisible(true);
            }}
            onOpenReconcileModal={openReconcileModalForCurrentFilter}
          />
        )}

        {activeTab === 'family' && (
          <FamilySettingsScreen
            onOpenModal={(mode, recipientId) => {
              setModalMode(mode);
              setModalRecipientId(recipientId);
              setModalVisible(true);
            }}
            onOpenAddMemberModal={() => setAddMemberModalVisible(true)}
            onOpenEditMemberModal={handleStartEditMember}
            onOpenClaimAdminModal={() => setClaimAdminModalVisible(true)}
            onOpenEditLedgerModal={() => setEditLedgerModalVisible(true)}
            onOpenCustomCodeModal={() => setCustomCodeModalVisible(true)}
            onOpenChangePinModal={() => setChangePinModalVisible(true)}
            onOpenSwitchLedgerModal={() => setSwitchLedgerModalVisible(true)}
            onOpenBudgetManageModal={() => {
              setBudgetManageModalTab('family');
              setBudgetManageModalVisible(true);
            }}
            onOpenExportModal={(tab) => {
              setExportModalTab(tab);
              setExportModalVisible(true);
            }}
            onOpenCloudLedgerManager={() => setCloudLedgerManagerVisible(true)}
            onOpenProductGuideModal={() => setProductGuideModalVisible(true)}
            onOpenChangelogModal={() => setChangelogModalVisible(true)}
            onOpenAdminModeModal={() => setAdminModeModalVisible(true)}
            onCheckForUpdates={handleCheckForUpdates}
            isCheckingUpdate={isCheckingUpdate}
            onTriggerLiveToastDemo={() => {
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
          />
        )}
      </View>

      {/* 浮動記帳按鈕 (FAB) - 僅在「明細」分頁顯示 */}
      {activeTab === 'transactions' && (
        Boolean(currentLedger.is_read_only) ? (
          <TouchableOpacity
            style={[styles.fab, { backgroundColor: '#64748B' }]}
            onPress={() => {
              showAlert(
                '🔒 唯讀帳本保護中',
                `「${currentLedger.name}」已開啟唯讀封存保護，無法新增記帳。\n若需異動，管理員可至「切換帳本」解除唯讀鎖定。`
              );
            }}
          >
            <Text style={styles.fabText}>🔒</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.fab}
            onPress={() => {
              setModalMode('expense');
              setModalRecipientId(undefined);
              setModalVisible(true);
            }}
          >
            <Text style={styles.fabText}>＋</Text>
          </TouchableOpacity>
        )
      )}

      {/* 底部導航頁籤 */}
      <View style={[styles.bottomNav, isDark && { backgroundColor: colors.background.card, borderTopColor: colors.border.default }]}>
        <TouchableOpacity
          style={[styles.navItem, activeTab === 'transactions' && styles.navItemActive, isDark && activeTab === 'transactions' && { borderColor: '#818CF8' }]}
          onPress={() => setActiveTab('transactions')}
        >
          <Text style={styles.navIcon}>📝</Text>
          <Text style={[styles.navText, activeTab === 'transactions' && styles.navTextActive, isDark && { color: colors.text.muted }, isDark && activeTab === 'transactions' && { color: '#A5B4FC' }]}>明細</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, activeTab === 'analytics' && styles.navItemActive, isDark && activeTab === 'analytics' && { borderColor: '#818CF8' }]}
          onPress={() => setActiveTab('analytics')}
        >
          <Text style={styles.navIcon}>📊</Text>
          <Text style={[styles.navText, activeTab === 'analytics' && styles.navTextActive, isDark && { color: colors.text.muted }, isDark && activeTab === 'analytics' && { color: '#A5B4FC' }]}>統計</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, activeTab === 'bills' && styles.navItemActive, isDark && activeTab === 'bills' && { borderColor: '#818CF8' }]}
          onPress={() => setActiveTab('bills')}
        >
          <View style={{ position: 'relative' }}>
            <Text style={styles.navIcon}>💳</Text>
            {pendingRecurringBillsCount > 0 && <View style={styles.navBadgeDot} />}
          </View>
          <Text style={[styles.navText, activeTab === 'bills' && styles.navTextActive, isDark && { color: colors.text.muted }, isDark && activeTab === 'bills' && { color: '#A5B4FC' }]}>帳單支付</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, activeTab === 'family' && styles.navItemActive, isDark && activeTab === 'family' && { borderColor: '#818CF8' }]}
          onPress={() => setActiveTab('family')}
        >
          <Text style={styles.navIcon}>⚙️</Text>
          <Text style={[styles.navText, activeTab === 'family' && styles.navTextActive, isDark && { color: colors.text.muted }, isDark && activeTab === 'family' && { color: '#A5B4FC' }]}>家庭設定</Text>
        </TouchableOpacity>
      </View>

      {/* 全域彈窗調度 */}
      <AddTransactionModal
        visible={modalVisible}
        initialMode={modalMode}
        defaultRecipientId={modalRecipientId}
        defaultPayerId={modalDefaultPayerId}
        defaultNote={modalDefaultNote}
        linkedMemoId={modalLinkedMemoId}
        linkedCompletionNote={modalLinkedCompletionNote}
        onSuccess={() => {
          setCompletingMemo(null);
          setCompletionTempNote('');
          setCompletionTempCompleter('');
        }}
        onClose={() => {
          setModalVisible(false);
          setModalRecipientId(undefined);
          setModalDefaultPayerId(undefined);
          setModalDefaultNote(undefined);
          setModalLinkedMemoId(undefined);
          setModalLinkedCompletionNote(undefined);
        }}
      />

      <EditTransactionModal
        key={editingTransaction?.id || 'edit-tx-modal'}
        visible={!!editingTransaction}
        transaction={editingTransaction}
        onClose={() => {
          setEditingTransaction(null);
          if (returnToInvoiceLotteryRef.current) {
            returnToInvoiceLotteryRef.current = false;
            setInvoiceLotteryModalVisible(true);
          }
        }}
        onLinkExpense={(memoTx) => {
          setEditingTransaction(null);
          setModalMode('expense');
          setModalLinkedMemoId(memoTx.id);
          setModalDefaultPayerId(memoTx.completed_by || currentUser?.id);
          const memoData = parseMemoNote(memoTx.note);
          setModalDefaultNote(`[辦妥] ${memoData.title || memoTx.note}`);
          setModalLinkedCompletionNote(memoTx.completion_note);
          setModalVisible(true);
        }}
        onOpenLinkedExpense={(expenseTx) => {
          setEditingTransaction(expenseTx);
        }}
      />

      <MemoTodoModal
        visible={memoTodoModalVisible && !completingMemo && !modalVisible && !editingTransaction}
        onClose={() => setMemoTodoModalVisible(false)}
        onEditMemo={(tx) => setEditingTransaction(tx)}
        onAddMemo={() => {
          setModalMode('memo');
          setModalVisible(true);
        }}
        onCompleteMemo={handleOpenMemoCompletion}
      />

      <MemoCompletionModal
        visible={!!completingMemo && !modalVisible}
        memo={completingMemo}
        initialNote={completionTempNote}
        initialCompleterId={completionTempCompleter}
        onClose={() => {
          setCompletingMemo(null);
          setCompletionTempNote('');
          setCompletionTempCompleter('');
        }}
        onCompleteOnly={handleCompleteMemoOnly}
        onLinkExpense={handleLinkExpenseFromCompletion}
      />

      <CategoryManageModal
        visible={categoryModalVisible}
        onClose={() => setCategoryModalVisible(false)}
      />

      <InvoiceLotteryModal
        visible={invoiceLotteryModalVisible}
        onClose={() => {
          returnToInvoiceLotteryRef.current = false;
          setInvoiceLotteryModalVisible(false);
        }}
        onSelectTransaction={(tx) => {
          returnToInvoiceLotteryRef.current = true;
          setInvoiceLotteryModalVisible(false);
          setEditingTransaction(tx);
        }}
      />

      <TransactionFilterModal
        visible={!!filterModalType}
        type={filterModalType}
        onClose={() => setFilterModalType(null)}
        selectedMonth={filterMonth}
        onSelectMonth={setFilterMonth}
        selectedMemberId={filterMemberId}
        onSelectMember={(mId) => {
          setFilterMemberId(mId);
          setHasManuallySelectedMember(true);
        }}
        availableMonths={availableMonths}
        availableYears={availableYears}
        members={members}
        currentUser={currentUser}
        transactions={transactions}
        getMemberById={getMemberById}
      />

      <MonthPickerModal
        visible={monthPickerVisible}
        onClose={() => setMonthPickerVisible(false)}
        selectedMonth={analyticsMonth}
        onSelectMonth={setAnalyticsMonth}
        availableMonths={availableMonths}
        availableYears={availableYears}
      />

      <CreditCardReconciliationModal
        visible={reconcileModalVisible}
        onClose={() => {
          setReconcileModalVisible(false);
          setReconcileModalTargetMemberId(undefined);
        }}
        onEditTransaction={tx => setEditingTransaction(tx)}
        initialAccountType={reconcileAccountType}
        initialAccountId={reconcileAccountId}
        scope={reconcileModalScope}
        targetMemberId={reconcileModalTargetMemberId}
      />

      <PaymentAccountsManageModal
        visible={accountsManageModalVisible}
        onClose={() => setAccountsManageModalVisible(false)}
        scope={billsScope}
      />

      <PaymentMethodsManageModal
        visible={paymentMethodsModalVisible}
        onClose={() => setPaymentMethodsModalVisible(false)}
      />

      <RecurringBillsManageModal
        visible={recurringModalVisible}
        initialTab={recurringModalInitialTab}
        onClose={() => {
          setRecurringModalVisible(false);
          setRecurringModalTargetMemberId(undefined);
        }}
        scope={recurringModalScope}
        targetMemberId={recurringModalTargetMemberId}
      />

      <BudgetManageModal
        visible={budgetManageModalVisible}
        initialTab={budgetManageModalTab}
        onClose={() => setBudgetManageModalVisible(false)}
      />

      <ProductGuideModal
        visible={productGuideModalVisible}
        onClose={() => setProductGuideModalVisible(false)}
      />

      <ChangelogModal
        visible={changelogModalVisible}
        onClose={() => setChangelogModalVisible(false)}
      />

      <CloudLedgerManagerModal
        visible={cloudLedgerManagerVisible}
        currentLedgerId={currentLedger.id}
        onClose={() => setCloudLedgerManagerVisible(false)}
      />

      <ImageViewerModal
        visible={imageViewerVisible}
        imageUrl={imageViewerUrl}
        title={imageViewerTitle}
        onClose={() => setImageViewerVisible(false)}
      />

      {/* 獨立模組化彈窗群 (src/components/modals) */}
      <CreateLedgerModal
        visible={createLedgerModalVisible}
        onClose={() => setCreateLedgerModalVisible(false)}
        onSuccess={() => setCreateLedgerModalVisible(false)}
      />

      <JoinLedgerModal
        visible={joinLedgerModalVisible}
        onClose={() => setJoinLedgerModalVisible(false)}
        onSuccess={() => setJoinLedgerModalVisible(false)}
      />

      <SwitchLedgerModal
        visible={switchLedgerModalVisible}
        onClose={() => setSwitchLedgerModalVisible(false)}
        onOpenCreateLedger={() => {
          setSwitchLedgerModalVisible(false);
          setCreateLedgerModalVisible(true);
        }}
      />

      <PendingInviteModal
        visible={!!pendingInviteCode}
        inviteCode={pendingInviteCode}
        onConfirm={(code) => confirmPendingInvite()}
        onCancel={cancelPendingInvite}
      />

      <EditLedgerModal
        visible={editLedgerModalVisible}
        onClose={() => setEditLedgerModalVisible(false)}
      />

      <CustomCodeModal
        visible={customCodeModalVisible}
        onClose={() => setCustomCodeModalVisible(false)}
      />

      <ChangePinModal
        visible={changePinModalVisible}
        onClose={() => setChangePinModalVisible(false)}
      />

      <ClaimAdminModal
        visible={claimAdminModalVisible}
        onClose={() => setClaimAdminModalVisible(false)}
      />

      <AdminModeModal
        visible={adminModeModalVisible}
        onClose={() => setAdminModeModalVisible(false)}
      />

      <AddMemberModal
        visible={addMemberModalVisible}
        onClose={() => setAddMemberModalVisible(false)}
      />

      <EditMemberModal
        visible={editMemberModalVisible}
        memberId={editingMember?.id || null}
        onClose={() => {
          setEditMemberModalVisible(false);
          setEditingMember(null);
        }}
        onOpenClaimGoogle={() => {
          setClaimGoogleModalVisible(true);
        }}
        onOpenTransferDelete={(targetMember: Profile) => {
          setTransferDeleteTargetMember(targetMember);
          setTransferDeleteModalVisible(true);
        }}
      />

      <ClaimGoogleModal
        visible={claimGoogleModalVisible}
        onClose={() => {
          setClaimGoogleModalVisible(false);
          setClaimGoogleTargetMember(null);
        }}
      />

      <TransferDeleteModal
        visible={transferDeleteModalVisible}
        memberToDelete={transferDeleteTargetMember}
        onClose={() => {
          setTransferDeleteModalVisible(false);
          setTransferDeleteTargetMember(null);
        }}
      />

      <ExportBackupModal
        visible={exportModalVisible}
        initialTab={exportModalTab}
        onClose={() => setExportModalVisible(false)}
        onOpenClaimAdmin={() => {
          setExportModalVisible(false);
          setClaimAdminModalVisible(true);
        }}
      />
    </SafeAreaView>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <LedgerProvider>
        <AppContent />
      </LedgerProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  welcomeScroll: {
    padding: 24,
    justifyContent: 'center',
    minHeight: '100%',
  },
  welcomeContainer: {
    maxWidth: 500,
    width: '100%',
    alignSelf: 'center',
  },
  welcomeHero: {
    alignItems: 'center',
    marginBottom: 32,
  },
  welcomeBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
  },
  welcomeBadgeText: {
    color: '#4F46E5',
    fontSize: 12,
    fontWeight: '700',
  },
  welcomeTitle: {
    fontSize: 32,
    fontWeight: '900',
    marginBottom: 12,
  },
  welcomeDesc: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  welcomeActionGroup: {
    gap: 16,
  },
  welcomeGoogleCard: {
    backgroundColor: '#10B981',
    borderRadius: 18,
    padding: 18,
    width: '100%',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  welcomeGoogleBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  welcomeGoogleTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  welcomeGoogleDesc: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    lineHeight: 18,
  },
  welcomePrimaryCard: {
    backgroundColor: '#6366F1',
    borderRadius: 18,
    padding: 18,
    width: '100%',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  welcomeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  welcomeCardBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  welcomeCardArrow: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  welcomeCardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  welcomeCardDesc: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    lineHeight: 18,
  },
  welcomeSecondaryCard: {
    borderRadius: 18,
    padding: 18,
    width: '100%',
    borderWidth: 1,
  },
  welcomeCardBadgeSecondary: {
    backgroundColor: '#E0E7FF',
    color: '#4338CA',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  welcomeCardArrowSecondary: {
    color: '#6366F1',
    fontSize: 18,
    fontWeight: '700',
  },
  welcomeCardTitleSecondary: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  welcomeCardDescSecondary: {
    fontSize: 13,
    lineHeight: 18,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 36 : 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  topBarSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ledgerSubtitle: {
    fontSize: 11,
    fontWeight: '500',
  },
  ownerTopBadge: {
    backgroundColor: '#FCE7F3',
    borderColor: '#F472B6',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  ownerTopBadgeText: {
    color: '#DB2777',
    fontSize: 10,
    fontWeight: '700',
  },
  topBarTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  ledgerTitleClickable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '70%',
  },
  ledgerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  ledgerEditPencil: {
    fontSize: 12,
    opacity: 0.6,
  },
  topBarReadOnlyBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  topBarReadOnlyBadgeText: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
  },
  switchLedgerTopBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    position: 'relative',
  },
  switchLedgerTopBadgeUnread: {
    borderColor: '#EF4444',
  },
  switchLedgerTopBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  topBadgeRedDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  topBarRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  themeToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
  },
  themeToggleBtnIcon: {
    fontSize: 12,
  },
  themeToggleBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
  },
  syncOnline: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  syncLocal: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  syncDot: {
    fontSize: 11,
  },
  syncText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#065F46',
  },
  previewModeBanner: {
    backgroundColor: '#FEF3C7',
    borderBottomWidth: 1,
    borderColor: '#F59E0B',
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewModeBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  previewModeBannerIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  previewModeBannerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
  },
  previewModeBannerSub: {
    fontSize: 10,
    color: '#B45309',
  },
  exitPreviewBtn: {
    backgroundColor: '#D97706',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  exitPreviewBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 80,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    zIndex: 99,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 32,
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingVertical: 6,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    borderTopWidth: 2,
    borderTopColor: 'transparent',
  },
  navItemActive: {
    borderTopColor: '#6366F1',
  },
  navIcon: {
    fontSize: 20,
    marginBottom: 2,
  },
  navBadgeDot: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  navText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  navTextActive: {
    color: '#6366F1',
    fontWeight: '700',
  },
});
