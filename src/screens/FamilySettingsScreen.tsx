import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  Linking,
} from 'react-native';
import { Text } from '../components/common/Text';
import { useFontSize, FONT_SIZE_OPTIONS } from '../theme/FontSizeContext';
import { useLedger } from '../context/LedgerContext';
import { useTheme } from '../theme/ThemeContext';
import { usePrivacy } from '../context/PrivacyContext';
import { MemberAvatar } from '../components/MemberAvatar';
import { showAlert, showConfirm, copyToClipboard } from '../lib/alert';
import { formatLastBackupText } from '../lib/backup';
import { APP_FULL_VERSION as APP_VERSION } from '../constants/version';
import { Profile, MemberDevice } from '../types';
import { parseMemoNote, getLocalDateYmd, getEffectiveMemoReminderDate } from '../lib/memo';
import {
  isNotificationSupported,
  getBillingNotificationsEnabled,
  setBillingNotificationsEnabled,
  getMemoNotificationsEnabled,
  setMemoNotificationsEnabled,
  requestNotificationPermission,
  scheduleBillingReminderNotifications,
  scheduleMemoReminderNotifications,
  sendTestBillingNotification,
  sendTestMemoNotification,
  calculateCardOutstandingAmount,
  NotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  getNotificationPreferences,
  saveNotificationPreferences,
  buildBillingReminderGroups,
  formatBillingAdvanceLabel,
  formatMemoAdvanceLabel,
} from '../lib/billingNotifications';
import { QuickActionKind } from '../lib/quickActions';
import {
  getWidgetSnapshot,
  syncWidgetData,
  WidgetSnapshotData,
} from '../lib/widgetSync';
import {
  LINE_BOT_BASIC_ID,
  LineNotificationSettingsResponse,
  buildLineBindDeepLink,
  fetchLineNotificationSettings,
  generateLineBindCode,
  saveLineUserPreferences,
  unbindLineUser,
  saveLineGroupPreferences,
  unbindLineGroup,
} from '../lib/lineNotifications';
import {
  SettingsGroupCard,
  SettingsRowItem,
  SettingsBadgeTone,
  InviteAndSecurityModal,
  LocalNotificationsModal,
  LineDailyReportModal,
  PrivacyLockModal,
  DisplayFontModal,
  WidgetQuickActionsModal,
  BackupAndDataModal,
  SystemMaintenanceModal,
} from '../components/settings';

type SettingsSheetKey =
  | 'invite'
  | 'notifications'
  | 'line'
  | 'privacy'
  | 'font'
  | 'widget'
  | 'backup'
  | 'system'
  | null;

interface FamilySettingsScreenProps {
  onOpenModal: (mode: 'expense' | 'income' | 'transfer' | 'allowance' | 'memo', recipientId?: string) => void;
  onTriggerQuickAction?: (kind: QuickActionKind) => void;
  onOpenAddMemberModal: () => void;
  onOpenEditMemberModal: (member: Profile) => void;
  onOpenClaimAdminModal: () => void;
  onOpenEditLedgerModal: () => void;
  onOpenCustomCodeModal: () => void;
  onOpenChangePinModal: () => void;
  onOpenSwitchLedgerModal: () => void;
  onOpenBudgetManageModal: () => void;
  onOpenExportModal: (tab: 'csv' | 'json' | 'attachments' | 'restore') => void;
  onOpenCloudLedgerManager: () => void;
  onOpenProductGuideModal: () => void;
  onOpenChangelogModal: () => void;
  onOpenAdminModeModal?: () => void;
  onCheckForUpdates: () => void;
  isCheckingUpdate: boolean;
  onTriggerLiveToastDemo?: () => void;
  onOpenCloudInvoiceModal?: () => void;
}

export const FamilySettingsScreen: React.FC<FamilySettingsScreenProps> = ({
  onOpenModal,
  onTriggerQuickAction,
  onOpenAddMemberModal,
  onOpenEditMemberModal,
  onOpenClaimAdminModal,
  onOpenEditLedgerModal,
  onOpenCustomCodeModal,
  onOpenChangePinModal,
  onOpenSwitchLedgerModal,
  onOpenBudgetManageModal,
  onOpenExportModal,
  onOpenCloudLedgerManager,
  onOpenProductGuideModal,
  onOpenChangelogModal,
  onCheckForUpdates,
  isCheckingUpdate,
  onTriggerLiveToastDemo,
  onOpenCloudInvoiceModal,
}) => {
  const { colors, isDark } = useTheme();
  const { fontSizeLevel, fontScale, followSystemFont } = useFontSize();
  const {
    members,
    currentUser,
    currentLedger,
    isOwner,
    realIsOwner,
    isAdminMode,
    memberDevices,
    currentDeviceId,
    getMemberById,
    inviteCode,
    getInviteLink,
    regenerateInviteCode,
    adminPin,
    allowNewMembers,
    updateAllowNewMembers,
    transactions,
    categories,
    paymentAccounts,
    recurringRules,
    paymentMethods,
    isCloudSynced,
    historySyncProgress,
    autoBackupEnabled,
    autoBackupInterval,
    lastBackupAt,
    updateAutoBackupConfig,
    hasOtherUnread,
    pendingOfflineCount,
    totalPendingOfflineCount,
    isProcessingQueue,
    processOfflineQueue,
    resetLocalCacheAndResync,
    isDemoLedger,
  } = useLedger();

  const {
    capability,
    privacyMaskEnabled,
    updatePrivacyMaskEnabled,
    appLockEnabled,
    updateAppLockEnabled,
    authenticate,
  } = usePrivacy();

  const [activeSheet, setActiveSheet] = useState<SettingsSheetKey>(null);

  // 先關閉內部設定視窗再開啟外層 App Modal，避免 iOS 雙重 Modal 轉場凍結
  const closeSheetThen = (action: () => void) => {
    setActiveSheet(null);
    setTimeout(action, Platform.OS === 'ios' ? 280 : 60);
  };

  const handleTestBiometrics = async () => {
    if (!capability.isSupported) {
      showAlert(
        '硬體提示',
        `目前裝置未偵測到 ${capability.biometryType} 錄入或硬體支援，在 Web 環境中將以安全 PIN 碼保護。`
      );
      return;
    }
    const success = await authenticate(`測試驗證您的 ${capability.biometryType}`);
    if (success) {
      showAlert('驗證成功', `🎉 太棒了！您的 ${capability.biometryType} 辨識成功，隱私防護運作正常！`);
    } else {
      showAlert('驗證未通過', '生物辨識未通過或使用者已取消驗證。');
    }
  };

  const [billingNoticeEnabled, setBillingNoticeEnabled] = useState(false);
  const [isSchedulingNotice, setIsSchedulingNotice] = useState(false);
  const [memoNoticeEnabled, setMemoNoticeEnabled] = useState(false);
  const [isSchedulingMemoNotice, setIsSchedulingMemoNotice] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [widgetSnapshot, setWidgetSnapshot] = useState<WidgetSnapshotData | null>(null);
  const [isSyncingWidget, setIsSyncingWidget] = useState(false);
  const [widgetSyncMessage, setWidgetSyncMessage] = useState<string | null>(null);
  const [lineSettings, setLineSettings] = useState<LineNotificationSettingsResponse | null>(null);
  const [isLoadingLineSettings, setIsLoadingLineSettings] = useState(false);
  const [isSavingLineSettings, setIsSavingLineSettings] = useState(false);
  const [pendingUserBindCode, setPendingUserBindCode] = useState<{ code: string; expiresAt?: string } | null>(null);
  const [pendingGroupBindCode, setPendingGroupBindCode] = useState<{ code: string; expiresAt?: string } | null>(null);
  const [isResettingCache, setIsResettingCache] = useState(false);

  const loadLineSettings = async () => {
    if (!currentUser?.id || isDemoLedger) {
      setLineSettings(null);
      return;
    }
    setIsLoadingLineSettings(true);
    try {
      const res = await fetchLineNotificationSettings(currentUser.id, currentLedger?.id);
      setLineSettings(res);
      if (res.userBinding.isBound) setPendingUserBindCode(null);
      if (res.groupBinding.isBound) setPendingGroupBindCode(null);
    } finally {
      setIsLoadingLineSettings(false);
    }
  };

  useEffect(() => {
    getBillingNotificationsEnabled().then(setBillingNoticeEnabled);
    getMemoNotificationsEnabled().then(setMemoNoticeEnabled);
    getNotificationPreferences().then(setNotifPrefs);
    getWidgetSnapshot().then(setWidgetSnapshot);
  }, []);

  useEffect(() => {
    loadLineSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentLedger?.id, isDemoLedger]);

  useEffect(() => {
    getWidgetSnapshot().then(setWidgetSnapshot);
  }, [transactions, currentLedger]);

  const handleManualSyncWidget = async () => {
    setIsSyncingWidget(true);
    try {
      const fresh = await syncWidgetData(currentLedger, transactions, members, currentUser?.id);
      setWidgetSnapshot(fresh);
      const nowTime = new Date().toLocaleTimeString('zh-TW', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      setWidgetSyncMessage(`已於 ${nowTime} 完成同步 ✓`);
      setTimeout(() => setWidgetSyncMessage(null), 3500);
    } catch (err) {
      console.warn('[Widget] 手動同步失敗:', err);
    } finally {
      setIsSyncingWidget(false);
    }
  };

  // 僅篩選出本機實際會推播提醒的信用卡（持卡人為本人，或未設定持卡人之全家公用卡）
  const creditCards = useMemo(() => {
    return (paymentAccounts || []).filter((acc) => {
      if (acc.ledger_id && currentLedger?.id && acc.ledger_id !== currentLedger.id) return false;
      if (acc.type !== 'credit_card') return false;
      if (currentUser?.id && acc.user_id) {
        if (acc.user_id === currentUser.id) return true;
        const owner = getMemberById ? getMemberById(acc.user_id) : undefined;
        if (owner?.display_name && currentUser.display_name && owner.display_name === currentUser.display_name) {
          return true;
        }
        return false;
      }
      return true;
    });
  }, [paymentAccounts, currentLedger?.id, currentUser?.id, currentUser?.display_name, getMemberById]);

  // 依發卡銀行歸戶合併本機個人信用卡提醒群組
  const billingGroups = useMemo(() => {
    const ledgerCards = (paymentAccounts || []).filter(
      (acc) => !acc.ledger_id || !currentLedger?.id || acc.ledger_id === currentLedger.id
    );
    return buildBillingReminderGroups(
      ledgerCards,
      transactions || [],
      currentUser?.id,
      getMemberById,
      new Date(),
      notifPrefs
    );
  }, [paymentAccounts, currentLedger?.id, transactions, currentUser?.id, getMemberById, notifPrefs]);

  // 僅篩選出本機實際會推播提醒的待辦記事
  const pendingMemos = useMemo(() => {
    const todayYmd = getLocalDateYmd();
    return (transactions || [])
      .filter((t) => {
        if (t.type !== 'memo' || t.is_settled) return false;
        const effDate = getEffectiveMemoReminderDate(t);
        if (!effDate || effDate < todayYmd) return false;
        if (t.reminder_target === 'personal' && currentUser?.id && t.paid_by) {
          if (t.paid_by !== currentUser.id) {
            const assignee = getMemberById ? getMemberById(t.paid_by) : undefined;
            if (
              !assignee?.display_name ||
              !currentUser.display_name ||
              assignee.display_name !== currentUser.display_name
            ) {
              return false;
            }
          }
        }
        return true;
      })
      .sort((a, b) =>
        (getEffectiveMemoReminderDate(a) || '').localeCompare(getEffectiveMemoReminderDate(b) || '')
      );
  }, [transactions, currentUser?.id, currentUser?.display_name, getMemberById]);

  const handleUpdateNotifPrefs = async (partial: Partial<NotificationPreferences>) => {
    const nextPrefs = await saveNotificationPreferences(partial);
    setNotifPrefs(nextPrefs);

    const affectsBilling =
      partial.dailyReminderTime !== undefined ||
      partial.billingStatementEnabled !== undefined ||
      partial.billingDueEnabled !== undefined ||
      partial.billingDueAdvanceMode !== undefined;
    const affectsMemo =
      partial.dailyReminderTime !== undefined || partial.memoAdvanceMode !== undefined;

    if (affectsBilling && billingNoticeEnabled) {
      scheduleBillingReminderNotifications(
        paymentAccounts,
        transactions,
        currentUser?.id,
        getMemberById,
        nextPrefs
      ).catch(() => {});
    }
    if (affectsMemo && memoNoticeEnabled) {
      scheduleMemoReminderNotifications(transactions, members, currentUser?.id, nextPrefs).catch(() => {});
    }
  };

  const handleToggleBillingNotice = async () => {
    const nextState = !billingNoticeEnabled;
    if (nextState) {
      if (!isNotificationSupported()) {
        showAlert(
          '平台提示',
          'Web 網頁環境暫不支援原生本機推播，建議在手機 App 上使用；信用卡出帳提醒亦會透過每日 LINE 報表自動發送！'
        );
        return;
      }
      const granted = await requestNotificationPermission();
      if (!granted) {
        showAlert(
          '請允許通知權限',
          '甜心記帳本需要通知權限，才能在信用卡出帳日隔天與繳款期限前發送提醒通知。請至手機「設定」中開啟通知！'
        );
        return;
      }
    }
    setBillingNoticeEnabled(nextState);
    await setBillingNotificationsEnabled(nextState);
    if (nextState) {
      setIsSchedulingNotice(true);
      const count = await scheduleBillingReminderNotifications(
        paymentAccounts,
        transactions,
        currentUser?.id,
        getMemberById,
        notifPrefs
      );
      setIsSchedulingNotice(false);
      const activeRules: string[] = [];
      if (notifPrefs.billingStatementEnabled) {
        activeRules.push(`・出帳日隔天 ${notifPrefs.dailyReminderTime}：帳單出帳提醒`);
      }
      if (notifPrefs.billingDueEnabled) {
        activeRules.push(
          `・繳款期限 ${notifPrefs.dailyReminderTime}（${formatBillingAdvanceLabel(
            notifPrefs.billingDueAdvanceMode
          )}）：防忘繳提醒`
        );
      }
      showAlert(
        '🔔 信用卡個人提醒已開啟',
        `已成功為您本人持有的信用卡依發卡銀行合併排程 ${count} 則提醒！\n（同銀行多卡只響一次、其他家庭成員之卡片不干擾本機）\n\n${
          activeRules.length > 0 ? activeRules.join('\n') : '・目前出帳與繳款子開關皆關閉，可於下方隨時開啟'
        }`
      );
    } else {
      await scheduleBillingReminderNotifications(
        paymentAccounts,
        transactions,
        currentUser?.id,
        getMemberById,
        notifPrefs
      );
      showAlert('信用卡提醒已關閉', '已取消所有信用卡本機排程提醒。');
    }
  };

  const handleSendTestBillingNotice = async () => {
    if (!isNotificationSupported()) {
      showAlert('平台提示', 'Web 網頁端不支援發送系統本機通知，請在 iOS / Android 手機 App 測試。');
      return;
    }
    const sampleCard =
      creditCards.find(
        (c) =>
          c.user_id === currentUser?.id ||
          (currentUser?.display_name &&
            getMemberById &&
            getMemberById(c.user_id)?.display_name === currentUser.display_name)
      ) || creditCards[0];
    const cardName = sampleCard ? sampleCard.name : '玉山信用卡';
    const amount = sampleCard ? calculateCardOutstandingAmount(sampleCard.id, transactions) || 12800 : 12800;

    const success = await sendTestBillingNotification(cardName, amount, currentUser?.display_name);
    if (success) {
      showAlert('測試通知已發送', `已發送「${cardName}」帳單出帳測試通知！\n請留意手機螢幕頂部或通知中心橫幅。`);
    } else {
      showAlert('發送失敗', '請確認手機系統已允許「甜心記帳本」發送通知。');
    }
  };

  const handleToggleMemoNotice = async () => {
    const nextState = !memoNoticeEnabled;
    if (nextState) {
      if (!isNotificationSupported()) {
        showAlert(
          '平台提示',
          'Web 網頁環境暫不支援原生本機推播，建議在手機 App 上使用；生活記事待辦亦會透過每日 LINE 報表自動發送！'
        );
        return;
      }
      const granted = await requestNotificationPermission();
      if (!granted) {
        showAlert(
          '請允許通知權限',
          `甜心記帳本需要通知權限，才能於生活記事到期前與當天上午 ${notifPrefs.dailyReminderTime} 發送待辦提醒。請至手機「設定」中開啟通知！`
        );
        return;
      }
    }
    setMemoNoticeEnabled(nextState);
    await setMemoNotificationsEnabled(nextState);
    if (nextState) {
      setIsSchedulingMemoNotice(true);
      const count = await scheduleMemoReminderNotifications(transactions, members, currentUser?.id, notifPrefs);
      setIsSchedulingMemoNotice(false);
      showAlert(
        '📌 記事待辦提醒已開啟',
        `已成功為您排程 ${count} 則待辦提醒！\n（包含全家共同待辦，以及指派給您本人的個人專屬備忘）\n\n・預設預警規則：${formatMemoAdvanceLabel(
          notifPrefs.memoAdvanceMode
        )}\n・早晨提醒鐘點：${notifPrefs.dailyReminderTime}`
      );
    } else {
      await scheduleMemoReminderNotifications(transactions, members, currentUser?.id, notifPrefs);
      showAlert('記事提醒已關閉', '已取消所有生活記事本機排程提醒。');
    }
  };

  const handleSendTestMemoNotice = async () => {
    if (!isNotificationSupported()) {
      showAlert('平台提示', 'Web 網頁端不支援發送系統本機通知，請在 iOS / Android 手機 App 測試。');
      return;
    }
    const sampleMemo = pendingMemos[0];
    const parsed = sampleMemo ? parseMemoNote(sampleMemo.note) : null;
    const title = parsed?.title || '採買清單';
    const content = parsed?.cleanContent || '記得下班順路購買鮮奶與雞蛋！';

    const success = await sendTestMemoNotification(title, content);
    if (success) {
      showAlert('測試通知已發送', `已發送生活記事「${title}」測試通知！\n請留意手機螢幕頂部或通知中心橫幅。`);
    } else {
      showAlert('發送失敗', '請確認手機系統已允許「甜心記帳本」發送通知。');
    }
  };

  // ==================== LINE 雙軌每日收支日報設定 ====================
  const canManageGroupLine = Boolean(!isDemoLedger && (isOwner || realIsOwner || isAdminMode));

  const handleStartUserLineBind = async () => {
    if (!currentUser?.id || isDemoLedger) return;
    setIsSavingLineSettings(true);
    try {
      const res = await generateLineBindCode(currentUser.id, 'user', currentLedger?.id);
      if (!res.success || !res.code) {
        showAlert('無法產生綁定碼', res.message || '請確認網路連線或稍後再試');
        return;
      }
      setPendingUserBindCode({ code: res.code, expiresAt: res.expiresAt });
      const deepLink = buildLineBindDeepLink(res.code);
      try {
        await Linking.openURL(deepLink);
      } catch {
        copyToClipboard(
          res.code,
          `綁定碼 ${res.code} 已複製！\n請打開 LINE 官方帳號 ${LINE_BOT_BASIC_ID} 並傳送此代碼即可完成綁定。`
        );
      }
    } finally {
      setIsSavingLineSettings(false);
    }
  };

  const handleToggleUserLinePref = async (patch: { enabled?: boolean; skipQuietDay?: boolean }) => {
    if (!currentUser?.id || !lineSettings?.userBinding.isBound) return;
    setIsSavingLineSettings(true);
    try {
      const res = await saveLineUserPreferences({
        userId: currentUser.id,
        enabled: patch.enabled,
        skipQuietDay: patch.skipQuietDay,
      });
      if (!res.success) {
        showAlert('儲存失敗', res.message || '無法更新個人 LINE 日報偏好');
        return;
      }
      await loadLineSettings();
    } finally {
      setIsSavingLineSettings(false);
    }
  };

  const handleToggleLedgerLineSub = async (ledgerId: string, nextEnabled: boolean) => {
    if (!currentUser?.id || !lineSettings?.userBinding.isBound) return;
    setIsSavingLineSettings(true);
    try {
      const res = await saveLineUserPreferences({
        userId: currentUser.id,
        ledgerId,
        ledgerEnabled: nextEnabled,
      });
      if (!res.success) {
        showAlert('儲存失敗', res.message || '無法更新此帳簿之日報訂閱設定');
        return;
      }
      await loadLineSettings();
    } finally {
      setIsSavingLineSettings(false);
    }
  };

  const handleUnbindUserLine = () => {
    if (!currentUser?.id) return;
    showConfirm(
      '解除個人 LINE 綁定',
      '解除後，系統將不再傳送每日收支日報至您的個人 LINE，之後隨時可一鍵重新綁定。確定要解除嗎？',
      async () => {
        setIsSavingLineSettings(true);
        try {
          const res = await unbindLineUser(currentUser.id);
          if (!res.success) {
            showAlert('解除失敗', res.message || '請稍後再試');
            return;
          }
          setPendingUserBindCode(null);
          await loadLineSettings();
          showAlert('已解除綁定', '已停止發送個人 LINE 日報並清除綁定紀錄。');
        } finally {
          setIsSavingLineSettings(false);
        }
      }
    );
  };

  const handleStartGroupLineBind = async () => {
    if (!currentUser?.id || !currentLedger?.id || isDemoLedger) return;
    setIsSavingLineSettings(true);
    try {
      const res = await generateLineBindCode(currentUser.id, 'group', currentLedger.id, adminPin);
      if (!res.success || !res.code) {
        showAlert('無法產生群組綁定碼', res.message || '只有帳本管理員才能執行此操作');
        return;
      }
      setPendingGroupBindCode({ code: res.code, expiresAt: res.expiresAt });
      copyToClipboard(
        res.code,
        `群組綁定碼 ${res.code} 已複製！\n\n請依序操作：\n1. 將官方帳號 ${LINE_BOT_BASIC_ID} 邀請進家庭 LINE 群組\n2. 在群組貼上「${res.code}」並傳送\n3. 回到此畫面點「重新整理」`
      );
    } finally {
      setIsSavingLineSettings(false);
    }
  };

  const handleToggleGroupLinePref = async (patch: {
    enabled?: boolean;
    skipQuietDay?: boolean;
    includeCreditCards?: boolean;
  }) => {
    if (!currentUser?.id || !currentLedger?.id || !lineSettings?.groupBinding.isBound) return;
    setIsSavingLineSettings(true);
    try {
      const res = await saveLineGroupPreferences({
        ledgerId: currentLedger.id,
        operatorId: currentUser.id,
        enabled: patch.enabled,
        skipQuietDay: patch.skipQuietDay,
        includeCreditCards: patch.includeCreditCards,
        adminPin,
      });
      if (!res.success) {
        showAlert('儲存失敗', res.message || '無法更新家庭群組播報設定');
        return;
      }
      await loadLineSettings();
    } finally {
      setIsSavingLineSettings(false);
    }
  };

  const handleUnbindGroupLine = () => {
    if (!currentUser?.id || !currentLedger?.id) return;
    showConfirm(
      '解除家庭群組綁定',
      `確定要解除《${currentLedger.name}》與目前家庭 LINE 群組的播報連動嗎？`,
      async () => {
        setIsSavingLineSettings(true);
        try {
          const res = await unbindLineGroup(currentLedger.id, currentUser.id, adminPin);
          if (!res.success) {
            showAlert('解除失敗', res.message || '請稍後再試');
            return;
          }
          setPendingGroupBindCode(null);
          await loadLineSettings();
          showAlert('已解除群組綁定', '家庭群組每晚將不再自動播報本帳本的收支日報。');
        } finally {
          setIsSavingLineSettings(false);
        }
      }
    );
  };

  // 定期備份計算與過期檢測
  const daysSinceLastBackup = useMemo(() => {
    if (!lastBackupAt) return null;
    const lastDate = new Date(lastBackupAt);
    if (isNaN(lastDate.getTime())) return null;
    const diffMs = Date.now() - lastDate.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }, [lastBackupAt]);

  const isBackupDue = useMemo(() => {
    if (!autoBackupEnabled) return false;
    if (daysSinceLastBackup === null) return transactions.length >= 5;
    return daysSinceLastBackup >= autoBackupInterval;
  }, [autoBackupEnabled, daysSinceLastBackup, autoBackupInterval, transactions.length]);

  // 取得成員連線裝置清單
  const getDevicesForMember = (targetMember: Profile): MemberDevice[] => {
    if (!targetMember) return [];
    const targetName = (targetMember.display_name || '').trim().toLowerCase();
    const isTargetCurrent =
      currentUser.id === targetMember.id ||
      (!!currentUser.display_name && (currentUser.display_name || '').trim().toLowerCase() === targetName);

    return memberDevices.filter((d) => {
      if (d.ledger_id && currentLedger?.id && d.ledger_id !== currentLedger.id) return false;
      if (currentDeviceId && d.device_id === currentDeviceId) {
        return isTargetCurrent;
      }
      if (d.member_id === targetMember.id) return true;
      const devMember = getMemberById(d.member_id);
      if (devMember) {
        if (devMember.id === targetMember.id) return true;
        if ((devMember.display_name || '').trim().toLowerCase() === targetName) return true;
      }
      return false;
    });
  };

  const handleResetLocalCache = () => {
    showConfirm(
      '清除本機快取並重新同步',
      '確定要清除手機上的本機暫存快取嗎？\n\n系統將保留雲端資料不動，重新為此手機下載最新完整的明細、成員名冊與支付卡片。',
      async () => {
        setIsResettingCache(true);
        try {
          const res = await resetLocalCacheAndResync();
          if (res.success) {
            showAlert(
              '✅ 本機快取已重整校準完成！',
              `已從雲端載入最新的 ${res.txCount} 筆明細、${res.memberCount} 位成員與 ${res.accountCount} 張支付卡片。`
            );
          } else {
            showAlert('重整失敗', res.message || '無法重新載入雲端資料，請檢查網路連線');
          }
        } catch (err: any) {
          showAlert('重整失敗', err?.message || '操作發生錯誤');
        } finally {
          setIsResettingCache(false);
        }
      }
    );
  };

  // ==================== 目錄摘要徽章計算 ====================
  const pushSummaryBadge = useMemo<{ text: string; tone: SettingsBadgeTone }>(() => {
    if (billingNoticeEnabled && memoNoticeEnabled) {
      return { text: `${notifPrefs.dailyReminderTime} · 全開啟`, tone: 'success' };
    }
    if (billingNoticeEnabled) {
      return { text: `${notifPrefs.dailyReminderTime} · 僅信用卡`, tone: 'info' };
    }
    if (memoNoticeEnabled) {
      return { text: `${notifPrefs.dailyReminderTime} · 僅記事`, tone: 'info' };
    }
    return { text: '已關閉', tone: 'neutral' };
  }, [billingNoticeEnabled, memoNoticeEnabled, notifPrefs.dailyReminderTime]);

  const lineSummaryBadge = useMemo<{ text: string; tone: SettingsBadgeTone }>(() => {
    if (isDemoLedger) {
      return { text: '🎭 示範停用', tone: 'neutral' };
    }
    if (lineSettings?.isTableMissing) {
      return { text: '待升級', tone: 'warning' };
    }
    if (isLoadingLineSettings && !lineSettings) {
      return { text: '同步中...', tone: 'neutral' };
    }
    const userBound = Boolean(lineSettings?.userBinding.isBound);
    const userEnabled = Boolean(lineSettings?.userBinding.enabled);
    const groupBound = Boolean(lineSettings?.groupBinding.isBound);
    const groupEnabled = Boolean(lineSettings?.groupBinding.enabled);

    if (!userBound && !groupBound) {
      return { text: '未綁定', tone: 'neutral' };
    }
    const userIcon = !userBound ? '⚪' : userEnabled ? '🟢' : '⏸️';
    const groupIcon = !groupBound ? '⚪' : groupEnabled ? '🟢' : '⏸️';
    const tone: SettingsBadgeTone =
      (userBound && userEnabled) || (groupBound && groupEnabled) ? 'success' : 'warning';
    return { text: `個人${userIcon} · 群組${groupIcon}`, tone };
  }, [isDemoLedger, isLoadingLineSettings, lineSettings]);

  const privacySummaryBadge = useMemo<{ text: string; tone: SettingsBadgeTone }>(() => {
    if (privacyMaskEnabled && appLockEnabled) {
      return { text: '全防護', tone: 'success' };
    }
    if (privacyMaskEnabled) {
      return { text: '淨值遮罩', tone: 'info' };
    }
    if (appLockEnabled) {
      return { text: '啟動解鎖', tone: 'info' };
    }
    return { text: '未啟用', tone: 'neutral' };
  }, [privacyMaskEnabled, appLockEnabled]);

  const fontSummaryText = useMemo(() => {
    const pct = Math.round(fontScale * 100);
    if (followSystemFont) return `跟隨系統 (${pct}%)`;
    const shortLabel = FONT_SIZE_OPTIONS.find((o) => o.level === fontSizeLevel)?.shortLabel || '標準';
    return `${shortLabel} (${pct}%)`;
  }, [followSystemFont, fontScale, fontSizeLevel]);

  const backupSummaryBadge = useMemo<{ text: string; tone: SettingsBadgeTone }>(() => {
    if (historySyncProgress) {
      return { text: '同步中', tone: 'info' };
    }
    if (isBackupDue) {
      return { text: '建議備份', tone: 'warning' };
    }
    if (isCloudSynced) {
      return { text: '雲端同步', tone: 'success' };
    }
    return { text: '離線模式', tone: 'neutral' };
  }, [historySyncProgress, isBackupDue, isCloudSynced]);

  const scopedPaymentAccountsCount = useMemo(
    () => (paymentAccounts || []).filter((a) => a.ledger_id === currentLedger?.id).length,
    [paymentAccounts, currentLedger?.id]
  );
  const scopedRecurringRulesCount = useMemo(
    () => (recurringRules || []).filter((r) => r.ledger_id === currentLedger?.id).length,
    [recurringRules, currentLedger?.id]
  );
  const enabledPaymentMethodsCount = useMemo(
    () => (paymentMethods || []).filter((m) => m.is_enabled !== false).length,
    [paymentMethods]
  );

  return (
    <>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollPadding, { backgroundColor: colors.background.root }]}
      >
        {/* 頂部常駐版本與操作指南簡報列 (0 滾動即見) */}
        <View
          style={[
            styles.topVersionBar,
            { backgroundColor: colors.background.modal, borderColor: colors.border.default },
          ]}
        >
          <TouchableOpacity style={styles.topVersionLeft} onPress={onOpenChangelogModal} activeOpacity={0.7}>
            <Text style={[styles.topVersionAppName, { color: colors.text.primary }]} numberOfLines={1}>
              甜心記帳本
            </Text>
            <View style={styles.topVersionBadge}>
              <Text style={styles.topVersionBadgeText}>v{APP_VERSION} 📜</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.topVersionRight}>
            <TouchableOpacity
              style={[styles.topCheckUpdateBtn, isCheckingUpdate && styles.topCheckUpdateBtnDisabled]}
              onPress={onCheckForUpdates}
              disabled={isCheckingUpdate}
              activeOpacity={0.7}
            >
              <Text style={styles.topCheckUpdateBtnText} numberOfLines={1}>
                {isCheckingUpdate ? '⏳ 檢查中' : '🔄 檢查更新'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.topGuideBtn,
                { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default },
              ]}
              onPress={onOpenProductGuideModal}
              activeOpacity={0.7}
            >
              <Text style={[styles.topGuideBtnText, { color: colors.text.primary }]} numberOfLines={1}>
                📖 操作指南
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 頂部即時警示橫幅：離線待補傳 */}
        {totalPendingOfflineCount > 0 && (
          <View
            style={[
              styles.alertBannerCard,
              {
                backgroundColor: isDark ? '#450A0A33' : '#FEF2F2',
                borderColor: isDark ? '#991B1B' : '#FCA5A5',
              },
            ]}
          >
            <View style={styles.alertBannerLeft}>
              <Text style={styles.alertBannerIcon}>📴</Text>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={[styles.alertBannerTitle, { color: isDark ? '#FCA5A5' : '#B91C1C' }]}>
                  {pendingOfflineCount > 0 && totalPendingOfflineCount === pendingOfflineCount
                    ? `離線記帳待補傳 (${pendingOfflineCount} 筆)`
                    : pendingOfflineCount > 0
                    ? `離線待補傳 (本帳本 ${pendingOfflineCount} 筆，其他 ${
                        totalPendingOfflineCount - pendingOfflineCount
                      } 筆)`
                    : `其他帳本離線待補傳 (${totalPendingOfflineCount} 筆)`}
                </Text>
                <Text style={[styles.alertBannerDesc, { color: colors.text.secondary }]} numberOfLines={2}>
                  離線紀錄已安全暫存於本機，連網後點擊右側立即上傳雲端。
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.offlineSyncBtn, isProcessingQueue && { opacity: 0.6 }]}
              onPress={processOfflineQueue}
              disabled={isProcessingQueue}
              activeOpacity={0.8}
            >
              <Text style={styles.offlineSyncBtnText}>
                {isProcessingQueue ? '⏳ 上傳中' : '☁️ 立即補傳'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 頂部即時警示橫幅：定期備份到期 */}
        {isBackupDue && (
          <TouchableOpacity
            style={[
              styles.backupDueBanner,
              {
                backgroundColor: isDark ? 'rgba(245, 158, 11, 0.14)' : '#FFFBEB',
                borderColor: isDark ? 'rgba(245, 158, 11, 0.4)' : '#FCD34D',
              },
            ]}
            onPress={() => setActiveSheet('backup')}
            activeOpacity={0.75}
          >
            <Text style={[styles.backupDueBannerText, { color: isDark ? '#FCD34D' : '#B45309' }]}>
              ⚠️ {daysSinceLastBackup === null
                ? '尚未建立第一份資料備份，點擊前往備份 ›'
                : `已超過 ${daysSinceLastBackup} 天未備份，點擊立即匯出保存 ›`}
            </Text>
          </TouchableOpacity>
        )}

        {/* ==================== 區塊 1：🏠 家庭與帳本 ==================== */}
        <View style={styles.groupBlockHeader}>
          <Text style={[styles.groupBlockTitle, { color: colors.text.secondary }]}>
            🏠 家庭與帳本
          </Text>
          <Text style={[styles.groupBlockCaption, { color: colors.text.muted }]}>全家共用</Text>
        </View>

        {/* 家庭成員名單卡片（高頻常用，直接展開保留在主頁） */}
        <View
          style={[
            styles.cardSection,
            { backgroundColor: colors.background.modal, borderColor: colors.border.default },
          ]}
        >
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.cardSectionTitle, { color: colors.text.primary }]} numberOfLines={1}>
              👨‍👩‍👧 家庭成員名單 ({members.length})
            </Text>
            {realIsOwner && (
              <TouchableOpacity
                style={styles.addMemberBtn}
                onPress={() => {
                  if (!isAdminMode) {
                    showAlert(
                      '日常模式受限',
                      '目前為日常檢視模式。如需新增家庭成員，請先點擊首頁頂部的【🛡️ 日常模式】切換為管理員模式。'
                    );
                    return;
                  }
                  onOpenAddMemberModal();
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.addMemberBtnText}>＋ 新增成員</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={[styles.sectionHeaderDesc, { color: colors.text.secondary }]}>
            點擊成員可自訂稱謂、管理連線裝置與 Google 帳號安全防護
          </Text>

          <View style={styles.userSwitchRow}>
            {members.map((member) => {
              const isCurrent =
                currentUser.id === member.id ||
                (!!currentUser.display_name && currentUser.display_name === member.display_name);
              const isMemberAdmin =
                member.role === 'owner' ||
                member.role === 'admin' ||
                currentLedger.created_by === member.id;
              const isCreator = currentLedger.created_by === member.id;
              const canEdit = isOwner || isCurrent;
              const memberDevList = getDevicesForMember(member);

              return (
                <TouchableOpacity
                  key={member.id}
                  style={[
                    styles.userChip,
                    { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default },
                    isCurrent && styles.userChipActive,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => onOpenEditMemberModal(member)}
                >
                  <MemberAvatar avatar={member.avatar_url} size={20} style={styles.userAvatar} />
                  <Text
                    style={[
                      styles.userTitle,
                      { color: colors.text.primary },
                      isCurrent && styles.userTitleActive,
                    ]}
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
                  {memberDevList.length > 0 && (
                    <View style={styles.memberDeviceCountBadge}>
                      <Text style={styles.memberDeviceCountBadgeText}>📱 {memberDevList.length}</Text>
                    </View>
                  )}
                  {member.is_locked ? (
                    <View style={styles.memberLockedBadge}>
                      <Text style={styles.memberLockedBadgeText}>🔒 已保護</Text>
                    </View>
                  ) : isCurrent && !isDemoLedger ? (
                    <View
                      style={[
                        styles.memberLockedBadge,
                        {
                          backgroundColor: isDark ? '#78350F33' : '#FEF3C7',
                          borderColor: isDark ? '#B45309' : '#FDE68A',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.memberLockedBadgeText,
                          { color: isDark ? '#FBBF24' : '#B45309' },
                        ]}
                      >
                        ⚠️ 訪客
                      </Text>
                    </View>
                  ) : null}
                  {isCurrent && <Text style={styles.activeTag}>我</Text>}
                  {canEdit && <Text style={styles.memberEditHintIcon}>✏️</Text>}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 無管理員緊急救援橫幅 */}
          {!realIsOwner && (
            <View
              style={[
                styles.claimAdminBanner,
                {
                  backgroundColor: isDark ? '#1E293B' : '#FEF2F2',
                  borderColor: isDark ? '#334155' : '#FCA5A5',
                },
                !members.some((m) => m.role === 'owner' || m.role === 'admin') && {
                  borderColor: '#EF4444',
                  backgroundColor: isDark ? '#450A0A' : '#FEF2F2',
                },
              ]}
            >
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text
                  style={[
                    styles.claimAdminBannerTitle,
                    !members.some((m) => m.role === 'owner' || m.role === 'admin') && {
                      color: '#EF4444',
                    },
                  ]}
                >
                  {!members.some((m) => m.role === 'owner' || m.role === 'admin')
                    ? '⚠️ 帳本目前無管理員（全員皆為一般成員）'
                    : '👑 您目前為一般成員'}
                </Text>
                <Text
                  style={[
                    styles.claimAdminBannerDesc,
                    { color: colors.text.secondary },
                    !members.some((m) => m.role === 'owner' || m.role === 'admin') && {
                      color: isDark ? '#FCA5A5' : '#991B1B',
                    },
                  ]}
                >
                  {!members.some((m) => m.role === 'owner' || m.role === 'admin')
                    ? '帳本處於異常無管理員狀態，請點擊右側輸入應急安全碼恢復管理員！'
                    : '若需管理帳本與成員，請由現任管理員在成員卡片中將您設為共同管理員。'}
                </Text>
              </View>
              {!members.some((m) => m.role === 'owner' || m.role === 'admin') && (
                <TouchableOpacity
                  style={[styles.claimAdminBannerBtn, { backgroundColor: '#DC2626' }]}
                  onPress={onOpenClaimAdminModal}
                >
                  <Text style={styles.claimAdminBannerBtnText}>救援管理員</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* 家庭與帳本管理清單 */}
        <View
          style={[
            styles.groupCardStandalone,
            { backgroundColor: colors.background.modal, borderColor: colors.border.default },
          ]}
        >
          <SettingsRowItem
            icon="🔗"
            iconBg={isDark ? 'rgba(16, 185, 129, 0.18)' : '#ECFDF5'}
            title="邀請碼、門禁鎖與安全碼"
            subtitle={`《${currentLedger?.name || '家庭公帳'}》 · 邀請碼 ${inviteCode}`}
            badgeText={allowNewMembers ? '🟢 開放加入' : '🔒 已上鎖'}
            badgeTone={allowNewMembers ? 'success' : 'danger'}
            onPress={() => setActiveSheet('invite')}
          />
          <SettingsRowItem
            icon="🚪"
            iconBg={isDark ? 'rgba(59, 130, 246, 0.18)' : '#EFF6FF'}
            title="加入或切換其他家庭公帳"
            subtitle="切換家庭／個人帳本，或輸入邀請碼加入新公帳"
            badgeText={hasOtherUnread ? '新動態' : undefined}
            badgeTone="danger"
            onPress={onOpenSwitchLedgerModal}
          />
          <SettingsRowItem
            icon="🎯"
            iconBg={isDark ? 'rgba(245, 158, 11, 0.18)' : '#FFFBEB'}
            title="預算控管與成員額度"
            subtitle="設定每月公帳預算、個人專屬上限與首頁顯隱偏好"
            isLast={!onOpenCloudInvoiceModal}
            onPress={onOpenBudgetManageModal}
          />
          {onOpenCloudInvoiceModal && (
            <SettingsRowItem
              icon="☁️"
              iconBg={isDark ? 'rgba(14, 165, 233, 0.18)' : '#E0F2FE'}
              title="財政部雲端發票智慧同步"
              subtitle="共通性載具與卡片自動分流歸屬家庭成員"
              isLast
              onPress={onOpenCloudInvoiceModal}
            />
          )}
        </View>

        {/* ==================== 區塊 2：🔔 通知與日報 ==================== */}
        <SettingsGroupCard title="🔔 通知與日報" caption="訊息推播">
          <SettingsRowItem
            icon="📱"
            iconBg={isDark ? 'rgba(59, 130, 246, 0.18)' : '#EFF6FF'}
            title="手機推播提醒"
            subtitle="每日提醒鐘點、本人信用卡帳單與生活記事排程"
            badgeText={pushSummaryBadge.text}
            badgeTone={pushSummaryBadge.tone}
            onPress={() => setActiveSheet('notifications')}
          />
          <SettingsRowItem
            icon="💚"
            iconBg={isDark ? 'rgba(6, 199, 85, 0.18)' : '#DCFCE7'}
            title="LINE 每日收支日報"
            subtitle="個人自主選帳訂閱與家庭群組公開播報雙軌設定"
            badgeText={lineSummaryBadge.text}
            badgeTone={lineSummaryBadge.tone}
            isLast
            onPress={() => setActiveSheet('line')}
          />
        </SettingsGroupCard>

        {/* ==================== 區塊 3：👤 個人偏好與裝置 ==================== */}
        <SettingsGroupCard title="👤 個人偏好與裝置" caption="僅影響本機">
          <SettingsRowItem
            icon="🔐"
            iconBg={isDark ? 'rgba(139, 92, 246, 0.18)' : '#F5F3FF'}
            title="生物辨識與財務隱私鎖"
            subtitle={`以 ${capability.biometryType} 保護淨值遮罩與 App 啟動解鎖`}
            badgeText={privacySummaryBadge.text}
            badgeTone={privacySummaryBadge.tone}
            onPress={() => setActiveSheet('privacy')}
          />
          <SettingsRowItem
            icon="🔤"
            iconBg={isDark ? 'rgba(244, 63, 94, 0.18)' : '#FFE4E6'}
            title="字型大小與顯示"
            subtitle="四段字級與即時排版預覽，長輩閱讀更輕鬆"
            badgeText={fontSummaryText}
            badgeTone="info"
            onPress={() => setActiveSheet('font')}
          />
          <SettingsRowItem
            icon="📱"
            iconBg={isDark ? 'rgba(99, 102, 241, 0.18)' : '#EEF2FF'}
            title="桌面小工具與快捷動作"
            subtitle="4x2 今日待辦即時快照與桌面長按捷徑試按"
            badgeText={
              widgetSnapshot?.pendingMemoCount
                ? `${widgetSnapshot.pendingMemoCount} 則待辦`
                : '快照就緒'
            }
            badgeTone={widgetSnapshot?.pendingMemoCount ? 'info' : 'success'}
            isLast
            onPress={() => setActiveSheet('widget')}
          />
        </SettingsGroupCard>

        {/* ==================== 區塊 4：🛡️ 資料備份與系統 ==================== */}
        <SettingsGroupCard title="🛡️ 資料備份與系統" caption="安全與維護">
          <SettingsRowItem
            icon="💾"
            iconBg={isDark ? 'rgba(16, 185, 129, 0.18)' : '#ECFDF5'}
            title="資料備份、匯出與還原"
            subtitle={`${transactions.length.toLocaleString()} 筆明細 · 上次備份：${formatLastBackupText(
              lastBackupAt
            )}`}
            badgeText={backupSummaryBadge.text}
            badgeTone={backupSummaryBadge.tone}
            onPress={() => setActiveSheet('backup')}
          />
          {realIsOwner && (
            <SettingsRowItem
              icon="☁️"
              iconBg={isDark ? 'rgba(59, 130, 246, 0.18)' : '#EFF6FF'}
              title="雲端帳本總管"
              subtitle="盤點雲端全部帳本現況、監控 500 MB 空間用量"
              badgeText="管理員"
              badgeTone="info"
              onPress={() => {
                if (!isAdminMode) {
                  showAlert(
                    '日常模式受限',
                    '目前為日常檢視模式。如需管理名下所有雲端帳本，請先點擊首頁頂部的【🛡️ 日常模式】啟用管理員模式。'
                  );
                  return;
                }
                onOpenCloudLedgerManager();
              }}
            />
          )}
          <SettingsRowItem
            icon="🔧"
            iconBg={isDark ? 'rgba(148, 163, 184, 0.18)' : '#F1F5F9'}
            title="系統資訊與維護"
            subtitle={`v${APP_VERSION} · 清除本機快取重整、版本更新與手冊`}
            badgeText={
              Platform.OS === 'web' ? 'Web' : Platform.OS === 'ios' ? 'iOS' : 'Android'
            }
            badgeTone="neutral"
            isLast
            onPress={() => setActiveSheet('system')}
          />
        </SettingsGroupCard>
      </ScrollView>

      {/* ==================== 8 個專屬設定 Modal ==================== */}
      <InviteAndSecurityModal
        visible={activeSheet === 'invite'}
        onClose={() => setActiveSheet(null)}
        ledgerName={currentLedger?.name || '家庭公帳'}
        realIsOwner={realIsOwner}
        isAdminMode={isAdminMode}
        inviteCode={inviteCode}
        getInviteLink={getInviteLink}
        regenerateInviteCode={regenerateInviteCode}
        adminPin={adminPin}
        allowNewMembers={allowNewMembers}
        updateAllowNewMembers={updateAllowNewMembers}
        onOpenEditLedgerModal={() => closeSheetThen(onOpenEditLedgerModal)}
        onOpenCustomCodeModal={() => closeSheetThen(onOpenCustomCodeModal)}
        onOpenChangePinModal={() => closeSheetThen(onOpenChangePinModal)}
      />

      <LocalNotificationsModal
        visible={activeSheet === 'notifications'}
        onClose={() => setActiveSheet(null)}
        notifPrefs={notifPrefs}
        billingNoticeEnabled={billingNoticeEnabled}
        isSchedulingNotice={isSchedulingNotice}
        memoNoticeEnabled={memoNoticeEnabled}
        isSchedulingMemoNotice={isSchedulingMemoNotice}
        billingGroups={billingGroups}
        pendingMemos={pendingMemos}
        getMemberById={getMemberById}
        onUpdateNotifPrefs={handleUpdateNotifPrefs}
        onToggleBillingNotice={handleToggleBillingNotice}
        onSendTestBillingNotice={handleSendTestBillingNotice}
        onToggleMemoNotice={handleToggleMemoNotice}
        onSendTestMemoNotice={handleSendTestMemoNotice}
      />

      <LineDailyReportModal
        visible={activeSheet === 'line'}
        onClose={() => setActiveSheet(null)}
        isDemoLedger={isDemoLedger}
        currentLedgerName={currentLedger?.name}
        canManageGroupLine={canManageGroupLine}
        lineSettings={lineSettings}
        isLoadingLineSettings={isLoadingLineSettings}
        isSavingLineSettings={isSavingLineSettings}
        pendingUserBindCode={pendingUserBindCode}
        pendingGroupBindCode={pendingGroupBindCode}
        onRefresh={loadLineSettings}
        onStartUserLineBind={handleStartUserLineBind}
        onToggleUserLinePref={handleToggleUserLinePref}
        onToggleLedgerLineSub={handleToggleLedgerLineSub}
        onUnbindUserLine={handleUnbindUserLine}
        onStartGroupLineBind={handleStartGroupLineBind}
        onToggleGroupLinePref={handleToggleGroupLinePref}
        onUnbindGroupLine={handleUnbindGroupLine}
      />

      <PrivacyLockModal
        visible={activeSheet === 'privacy'}
        onClose={() => setActiveSheet(null)}
        capability={capability}
        privacyMaskEnabled={privacyMaskEnabled}
        onTogglePrivacyMask={updatePrivacyMaskEnabled}
        appLockEnabled={appLockEnabled}
        onToggleAppLock={updateAppLockEnabled}
        onTestBiometrics={handleTestBiometrics}
      />

      <DisplayFontModal
        visible={activeSheet === 'font'}
        onClose={() => setActiveSheet(null)}
      />

      <WidgetQuickActionsModal
        visible={activeSheet === 'widget'}
        onClose={() => setActiveSheet(null)}
        ledgerName={currentLedger?.name || '家庭公帳'}
        widgetSnapshot={widgetSnapshot}
        isSyncingWidget={isSyncingWidget}
        widgetSyncMessage={widgetSyncMessage}
        onManualSyncWidget={handleManualSyncWidget}
        onTriggerQuickAction={(kind) =>
          closeSheetThen(() => {
            if (onTriggerQuickAction) {
              onTriggerQuickAction(kind);
            } else {
              onOpenModal(kind === 'memo' ? 'memo' : 'expense');
            }
          })
        }
      />

      <BackupAndDataModal
        visible={activeSheet === 'backup'}
        onClose={() => setActiveSheet(null)}
        isCloudSynced={isCloudSynced}
        historySyncProgress={historySyncProgress}
        transactionsCount={transactions.length}
        membersCount={members.length}
        categoriesCount={categories.length}
        paymentAccountsCount={scopedPaymentAccountsCount}
        recurringRulesCount={scopedRecurringRulesCount}
        paymentMethodsCount={enabledPaymentMethodsCount}
        lastBackupAt={lastBackupAt}
        autoBackupEnabled={autoBackupEnabled}
        autoBackupInterval={autoBackupInterval}
        daysSinceLastBackup={daysSinceLastBackup}
        isBackupDue={isBackupDue}
        updateAutoBackupConfig={updateAutoBackupConfig}
        pendingOfflineCount={pendingOfflineCount}
        totalPendingOfflineCount={totalPendingOfflineCount}
        isProcessingQueue={isProcessingQueue}
        processOfflineQueue={processOfflineQueue}
        realIsOwner={realIsOwner}
        isAdminMode={isAdminMode}
        onOpenExportModal={(tab) => closeSheetThen(() => onOpenExportModal(tab))}
      />

      <SystemMaintenanceModal
        visible={activeSheet === 'system'}
        onClose={() => setActiveSheet(null)}
        isCheckingUpdate={isCheckingUpdate}
        isResettingCache={isResettingCache}
        isOwner={isOwner}
        onResetLocalCache={handleResetLocalCache}
        onCheckForUpdates={onCheckForUpdates}
        onOpenChangelogModal={() => closeSheetThen(onOpenChangelogModal)}
        onOpenProductGuideModal={() => closeSheetThen(onOpenProductGuideModal)}
        onTriggerLiveToastDemo={
          onTriggerLiveToastDemo ? () => closeSheetThen(onTriggerLiveToastDemo) : undefined
        }
      />
    </>
  );
};

const styles = StyleSheet.create({
  scrollPadding: {
    padding: 16,
    paddingBottom: 100,
  },
  topVersionBar: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  topVersionLeft: {
    flex: 1,
    marginRight: 8,
    justifyContent: 'center',
  },
  topVersionAppName: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  topVersionBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F43F5E',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  topVersionBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  topVersionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  topCheckUpdateBtn: {
    backgroundColor: '#F43F5E',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
  },
  topCheckUpdateBtnDisabled: {
    opacity: 0.6,
  },
  topCheckUpdateBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  topGuideBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  topGuideBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  alertBannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  alertBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  alertBannerIcon: {
    fontSize: 20,
  },
  alertBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  alertBannerDesc: {
    fontSize: 11,
    lineHeight: 15,
  },
  offlineSyncBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    flexShrink: 0,
  },
  offlineSyncBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  backupDueBanner: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  backupDueBannerText: {
    fontSize: 12,
    fontWeight: '600',
  },
  groupBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 8,
    gap: 8,
  },
  groupBlockTitle: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  groupBlockCaption: {
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 0,
  },
  cardSection: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  groupCardStandalone: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 0,
    flex: 1,
    marginRight: 8,
  },
  sectionHeaderDesc: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 12,
  },
  addMemberBtn: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addMemberBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  userSwitchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  userChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  userChipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  userAvatar: {
    marginRight: 2,
  },
  userTitle: {
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 90,
  },
  userTitleActive: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  memberRoleBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  memberRoleBadgeText: {
    color: '#B45309',
    fontSize: 10,
    fontWeight: '700',
  },
  memberDeviceCountBadge: {
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  memberDeviceCountBadgeText: {
    color: '#3730A3',
    fontSize: 10,
    fontWeight: '700',
  },
  memberLockedBadge: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
  },
  memberLockedBadgeText: {
    color: '#15803D',
    fontSize: 9,
    fontWeight: '700',
  },
  activeTag: {
    fontSize: 10,
    fontWeight: '700',
    color: '#3B82F6',
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  memberEditHintIcon: {
    fontSize: 11,
    opacity: 0.6,
  },
  claimAdminBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
  },
  claimAdminBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B45309',
    marginBottom: 2,
  },
  claimAdminBannerDesc: {
    fontSize: 11,
    lineHeight: 15,
  },
  claimAdminBannerBtn: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  claimAdminBannerBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
