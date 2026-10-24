import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Switch,
  Platform,
} from 'react-native';
import * as Updates from 'expo-updates';
import { useLedger } from '../context/LedgerContext';
import { useTheme } from '../theme/ThemeContext';
import { MemberAvatar } from '../components/MemberAvatar';
import { showAlert, showConfirm, copyToClipboard } from '../lib/alert';
import { formatLastBackupText } from '../lib/backup';
import { APP_FULL_VERSION as APP_VERSION } from '../constants/version';
import { Profile, MemberDevice } from '../types';

interface FamilySettingsScreenProps {
  onOpenModal: (mode: 'expense' | 'income' | 'transfer' | 'allowance' | 'memo', recipientId?: string) => void;
  onOpenAddMemberModal: () => void;
  onOpenEditMemberModal: (member: Profile) => void;
  onOpenClaimAdminModal: () => void;
  onOpenEditLedgerModal: () => void;
  onOpenCustomCodeModal: () => void;
  onOpenChangePinModal: () => void;
  onOpenSwitchLedgerModal: () => void;
  onOpenBudgetManageModal: () => void;
  onOpenExportModal: (tab: 'csv' | 'json' | 'restore') => void;
  onOpenCloudLedgerManager: () => void;
  onOpenProductGuideModal: () => void;
  onOpenChangelogModal: () => void;
  onOpenAdminModeModal: () => void;
  onCheckForUpdates: () => void;
  isCheckingUpdate: boolean;
  onTriggerLiveToastDemo?: () => void;
}

export const FamilySettingsScreen: React.FC<FamilySettingsScreenProps> = ({
  onOpenModal,
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
  onOpenAdminModeModal,
  onCheckForUpdates,
  isCheckingUpdate,
  onTriggerLiveToastDemo,
}) => {
  const { colors, isDark } = useTheme();
  const {
    members,
    currentUser,
    currentLedger,
    isOwner,
    realIsOwner,
    isAdminMode,
    disableAdminMode,
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
  } = useLedger();

  const [showPinClear, setShowPinClear] = useState(false);

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

  // 取得成員連線裝置清單
  const getDevicesForMember = (targetMember: Profile): MemberDevice[] => {
    if (!targetMember) return [];
    const targetName = (targetMember.display_name || '').trim().toLowerCase();
    const isTargetCurrent =
      currentUser.id === targetMember.id ||
      (!!currentUser.display_name && (currentUser.display_name || '').trim().toLowerCase() === targetName);

    return memberDevices.filter(d => {
      if (d.ledger_id && currentLedger?.id && d.ledger_id !== currentLedger.id) return false;
      if (d.member_id === targetMember.id) return true;
      if (isTargetCurrent && d.device_id === currentDeviceId) return true;
      const devMember = getMemberById(d.member_id);
      if (devMember) {
        if (devMember.id === targetMember.id) return true;
        if ((devMember.display_name || '').trim().toLowerCase() === targetName) return true;
      }
      return false;
    });
  };

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.scrollPadding, { backgroundColor: colors.background.root }]}
    >
      {/* 家庭成員名冊與管理 */}
      <View style={[styles.cardSection, { backgroundColor: colors.background.modal, borderColor: colors.border.default }]}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeaderLeft}>
            <Text style={[styles.cardSectionTitle, { color: colors.text.primary }]}>
              👨‍👩‍👧 家庭成員名單 ({members.length})
            </Text>
            <Text style={[styles.sectionHeaderDesc, { color: colors.text.secondary }]}>
              點擊成員可自訂稱謂、管理連線裝置與 Google 帳號安全防護
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TouchableOpacity
              style={styles.allowanceQuickBtn}
              onPress={() => {
                onOpenModal('allowance');
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.allowanceQuickBtnText} maxFontSizeMultiplier={1.08}>🎁 撥零用錢</Text>
            </TouchableOpacity>
            {isOwner && (
              <TouchableOpacity
                style={styles.addMemberBtn}
                onPress={onOpenAddMemberModal}
                activeOpacity={0.7}
              >
                <Text style={styles.addMemberBtnText}>＋ 新增成員</Text>
              </TouchableOpacity>
            )}
          </View>
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
                onPress={() => {
                  if (!canEdit) {
                    showAlert('成員資料', `「${member.display_name}」為家庭成員。\n若需由管理員調整稱謂或權限，請先至下方切換至管理員模式。`);
                    return;
                  }
                  onOpenEditMemberModal(member);
                }}
              >
                <MemberAvatar avatar={member.avatar_url} size={20} style={styles.userAvatar} />
                <Text
                  style={[styles.userTitle, { color: colors.text.primary }, isCurrent && styles.userTitleActive]}
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
                ) : isCurrent ? (
                  <View style={[styles.memberLockedBadge, { backgroundColor: isDark ? '#78350F33' : '#FEF3C7', borderColor: isDark ? '#B45309' : '#FDE68A' }]}>
                    <Text style={[styles.memberLockedBadgeText, { color: isDark ? '#FBBF24' : '#B45309' }]}>⚠️ 訪客</Text>
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
        {!realIsOwner && (
          <View style={[
            styles.claimAdminBanner,
            { backgroundColor: isDark ? '#1E293B' : '#FEF2F2', borderColor: isDark ? '#334155' : '#FCA5A5' },
            !members.some(m => m.role === 'owner' || m.role === 'admin') && { borderColor: '#EF4444', backgroundColor: isDark ? '#450A0A' : '#FEF2F2' }
          ]}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={[
                styles.claimAdminBannerTitle,
                !members.some(m => m.role === 'owner' || m.role === 'admin') && { color: '#EF4444' }
              ]}>
                {!members.some(m => m.role === 'owner' || m.role === 'admin')
                  ? '⚠️ 帳本目前無管理員（全員皆為一般成員）'
                  : '👑 您目前為一般成員'}
              </Text>
              <Text style={[
                styles.claimAdminBannerDesc,
                { color: colors.text.secondary },
                !members.some(m => m.role === 'owner' || m.role === 'admin') && { color: isDark ? '#FCA5A5' : '#991B1B' }
              ]}>
                {!members.some(m => m.role === 'owner' || m.role === 'admin')
                  ? '請點擊右側輸入管理員 PIN 碼（預設 8888），即可立即恢復並將您設為管理員！'
                  : '若需恢復管理員權限，可輸入 4 位數 PIN 碼立即取回/升級為管理員'}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.claimAdminBannerBtn,
                !members.some(m => m.role === 'owner' || m.role === 'admin') && { backgroundColor: '#DC2626' }
              ]}
              onPress={onOpenClaimAdminModal}
            >
              <Text style={styles.claimAdminBannerBtnText}>🔐 升為管理員</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* 邀請家人加入與代碼管理 */}
      <View style={[styles.cardSection, { backgroundColor: colors.background.modal, borderColor: colors.border.default }]}>
        <View style={styles.inviteHeaderRow}>
          <View style={styles.sectionHeaderLeft}>
            <Text style={[styles.cardSectionTitle, { color: colors.text.primary }]}>🔗 邀請家人共同記帳</Text>
            <Text style={[styles.cardSectionDesc, { color: colors.text.secondary }]}>讓伴侶或家人加入這本公帳，資料即時雙向同步</Text>
          </View>
          <View style={[styles.roleBadge, isOwner ? styles.roleBadgeOwner : styles.roleBadgeProtected]}>
            <Text style={[styles.roleBadgeText, isOwner ? styles.roleBadgeTextOwner : styles.roleBadgeTextProtected]}>
              {isOwner ? '👑 帳本管理員 (已啟用)' : (realIsOwner ? '🛡️ 日常成員模式 (安全防護中)' : '👤 家庭成員')}
            </Text>
          </View>
        </View>

        <View style={[styles.inviteCard, { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default }]}>
          <Text style={[styles.inviteCardLabel, { color: colors.text.secondary }]}>本家庭專屬邀請碼</Text>
          <View style={styles.inviteCodeRow}>
            <Text style={[styles.inviteCodeLarge, { color: colors.text.primary }]}>{inviteCode}</Text>
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
                style={[styles.ownerControlBtn, { backgroundColor: colors.background.modal, borderColor: colors.border.default }]}
                onPress={onOpenEditLedgerModal}
              >
                <Text style={[styles.ownerControlBtnText, { color: colors.text.primary }]}>✏️ 帳本更名</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.ownerControlBtn, { backgroundColor: colors.background.modal, borderColor: colors.border.default }]}
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
                <Text style={[styles.ownerControlBtnText, { color: colors.text.primary }]}>🔄 重新產生</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.ownerControlBtn, { backgroundColor: colors.background.modal, borderColor: colors.border.default }]}
                onPress={onOpenCustomCodeModal}
              >
                <Text style={[styles.ownerControlBtnText, { color: colors.text.primary }]}>✏️ 自訂代碼</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 管理員安全 PIN 碼管理 (僅 Owner 可見) */}
          {isOwner && (
            <View style={[styles.pinSectionWrapper, { borderTopColor: colors.border.default }]}>
              <View style={styles.pinHeaderRow}>
                <Text style={[styles.pinHeaderTitle, { color: colors.text.primary }]}>🔐 管理員安全 PIN 碼</Text>
                <Text style={[styles.pinHeaderDesc, { color: colors.text.secondary }]}>
                  換手機或新電腦以「管理員」身分認領時需輸入此碼，防範他人冒充
                </Text>
              </View>

              <View style={[styles.pinCardInner, { backgroundColor: colors.background.modal, borderColor: colors.border.default }]}>
                <View>
                  <Text style={[styles.pinCardLabel, { color: colors.text.secondary }]}>目前安全 PIN 碼</Text>
                  <Text style={[styles.pinCardValue, { color: colors.text.primary }]}>
                    {showPinClear ? adminPin : `${adminPin.slice(0, 1)}••${adminPin.slice(-1)}`}
                  </Text>
                  <Text style={[styles.pinCardHint, { color: colors.text.muted }]}>（共 {adminPin.length} 碼）</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <TouchableOpacity
                    style={[styles.togglePinBtn, { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default }]}
                    onPress={() => setShowPinClear(!showPinClear)}
                  >
                    <Text style={[styles.togglePinBtnText, { color: colors.text.primary }]}>{showPinClear ? '🙈 隱藏' : '👁️ 顯示'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.changePinBtn}
                    onPress={onOpenChangePinModal}
                  >
                    <Text style={styles.changePinBtnText}>✏️ 修改</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* 🔒 家庭門禁安全鎖 (允許新成員加入開關) */}
          <View style={[styles.gatekeeperSectionWrapper, { borderTopColor: colors.border.default }]}>
            <View style={styles.gatekeeperHeaderRow}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Text style={[styles.gatekeeperHeaderTitle, { color: colors.text.primary }]}>🔒 家庭門禁安全鎖</Text>
                  <View style={[styles.gatekeeperBadge, allowNewMembers ? styles.gatekeeperBadgeOpen : styles.gatekeeperBadgeLocked]}>
                    <Text style={[styles.gatekeeperBadgeText, allowNewMembers ? styles.gatekeeperBadgeTextOpen : styles.gatekeeperBadgeTextLocked]}>
                      {allowNewMembers ? '🟢 開放加入中' : '🔒 門禁已上鎖'}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.gatekeeperHeaderDesc, { color: colors.text.secondary }]}>
                  {allowNewMembers
                    ? '開放中：家人可憑邀請碼加入或認領身分。家人全數就位後建議關閉上鎖，防範邀請碼外流風險。'
                    : '已上鎖：全面阻斷新成員加入並隱藏家庭名冊，現有已加入之家人日常記帳完全不受影響。'}
                </Text>
              </View>
              {isOwner ? (
                <Switch
                  value={allowNewMembers}
                  onValueChange={async (newVal) => {
                    if (!newVal) {
                      showConfirm(
                        '上鎖家庭門禁',
                        '確定要關閉新成員加入通道嗎？\n\n上鎖後：\n• 任何持邀請碼的新訪客均無法加入或預覽此家庭\n• 絕不洩露家庭成員名冊\n• 現有已加入的家人不受任何影響\n\n您可隨時在此重新解鎖開啟！',
                        async () => {
                          const res = await updateAllowNewMembers(false);
                          if (res.success) {
                            showAlert('門禁已上鎖 🔒', '已成功關閉新成員加入通道，有效防範邀請碼外流！');
                          } else {
                            showAlert('更新失敗', res.message || '無法更新門禁設定');
                          }
                        }
                      );
                    } else {
                      const res = await updateAllowNewMembers(true);
                      if (res.success) {
                        showAlert('門禁已開啟 🟢', '已開放新成員加入通道，家人現在可憑邀請碼加入！');
                      } else {
                        showAlert('更新失敗', res.message || '無法更新門禁設定');
                      }
                    }
                  }}
                  trackColor={{ false: '#FECACA', true: '#BBF7D0' }}
                  thumbColor={allowNewMembers ? '#16A34A' : '#DC2626'}
                />
              ) : (
                <View style={styles.gatekeeperReadonlyTag}>
                  <Text style={styles.gatekeeperReadonlyTagText}>
                    {allowNewMembers ? '開放中' : '已上鎖'}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* 切換帳本入口 */}
        <TouchableOpacity
          style={[styles.switchLedgerEntryBtn, { backgroundColor: colors.background.modal, borderColor: colors.border.default }]}
          onPress={onOpenSwitchLedgerModal}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Text style={[styles.switchLedgerEntryText, { color: colors.text.primary }]}>🚪 加入或切換其他家庭公帳</Text>
            {hasOtherUnread && (
              <View style={styles.switchLedgerEntryRedBadge}>
                <Text style={styles.switchLedgerEntryRedBadgeText}>新動態</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      {/* 🎯 預算控管與成員額度設定 */}
      <View style={[styles.cardSection, { backgroundColor: colors.background.modal, borderColor: colors.border.default }]}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeaderLeft}>
            <Text style={[styles.cardSectionTitle, { color: colors.text.primary }]}>🎯 預算控管與成員額度</Text>
            <Text style={[styles.sectionHeaderDesc, { color: colors.text.secondary }]}>
              設定每月家庭公帳預算、成員個人專屬上限，或自訂此裝置顯隱偏好
            </Text>
          </View>
          <TouchableOpacity
            style={styles.manageCategoryBtn}
            onPress={onOpenBudgetManageModal}
            activeOpacity={0.7}
          >
            <Text style={styles.manageCategoryBtnText}>⚙️ 設定預算</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 資料備份與掌控 */}
      <View style={[styles.cardSection, { backgroundColor: colors.background.modal, borderColor: colors.border.default }]}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeaderLeft}>
            <Text style={[styles.cardSectionTitle, { color: colors.text.primary }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
              🛡️ 資料備份與掌控
            </Text>
            <Text style={[styles.sectionHeaderDesc, { color: colors.text.secondary }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
              隨時匯出整本帳簿，資料自主永久保存在個人設備
            </Text>
          </View>
          <View style={[styles.roleBadge, isCloudSynced ? styles.roleBadgeOwner : styles.roleBadgeMember]}>
            <Text style={[styles.roleBadgeText, isCloudSynced ? styles.roleBadgeTextOwner : styles.roleBadgeTextMember]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
              {historySyncProgress ? `🔄 歷史資料同步中 (${Math.max(historySyncProgress.loaded, transactions.length).toLocaleString()} / ${historySyncProgress.total.toLocaleString()})` : (isCloudSynced ? '🟢 雲端已同步' : '💾 本機離線模式')}
            </Text>
          </View>
        </View>

        {/* 帳本狀態小指標 (6 大全要素封存數據) */}
        <View style={[styles.backupStatsGrid, { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default }]}>
          <View style={styles.backupStatsRow}>
            <View style={styles.backupStatItem}>
              <Text style={[styles.backupStatVal, { color: colors.text.primary }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                {transactions.length.toLocaleString()}
              </Text>
              <Text style={[styles.backupStatLabel, { color: colors.text.secondary }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                📝 交易明細
              </Text>
            </View>
            <View style={[styles.backupStatDivider, { backgroundColor: colors.border.default }]} />
            <View style={styles.backupStatItem}>
              <Text style={[styles.backupStatVal, { color: colors.text.primary }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                {members.length}
              </Text>
              <Text style={[styles.backupStatLabel, { color: colors.text.secondary }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                👨‍👩‍👧 家庭成員
              </Text>
            </View>
            <View style={[styles.backupStatDivider, { backgroundColor: colors.border.default }]} />
            <View style={styles.backupStatItem}>
              <Text style={[styles.backupStatVal, { color: colors.text.primary }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                {categories.length}
              </Text>
              <Text style={[styles.backupStatLabel, { color: colors.text.secondary }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                🏷️ 自訂分類
              </Text>
            </View>
          </View>

          <View style={[styles.backupStatsHorizontalDivider, { backgroundColor: colors.border.default }]} />

          <View style={styles.backupStatsRow}>
            <View style={styles.backupStatItem}>
              <Text style={[styles.backupStatVal, { color: colors.text.primary }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                {paymentAccounts.length}
              </Text>
              <Text style={[styles.backupStatLabel, { color: colors.text.secondary }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                💳 支付卡片
              </Text>
            </View>
            <View style={[styles.backupStatDivider, { backgroundColor: colors.border.default }]} />
            <View style={styles.backupStatItem}>
              <Text style={[styles.backupStatVal, { color: colors.text.primary }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                {(recurringRules || []).filter(r => !r.ledger_id || r.ledger_id === currentLedger?.id).length}
              </Text>
              <Text style={[styles.backupStatLabel, { color: colors.text.secondary }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                🗓️ 週期/分期
              </Text>
            </View>
            <View style={[styles.backupStatDivider, { backgroundColor: colors.border.default }]} />
            <View style={styles.backupStatItem}>
              <Text style={[styles.backupStatVal, { color: colors.text.primary }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                {(paymentMethods || []).filter(m => m.is_enabled !== false).length}
              </Text>
              <Text style={[styles.backupStatLabel, { color: colors.text.secondary }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                📱 付款方式
              </Text>
            </View>
          </View>

          <View style={[styles.backupStatsFooter, { borderTopColor: colors.border.default }]}>
            <Text style={[styles.backupStatsFooterText, { color: colors.text.muted }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
              🛡️ JSON 備份檔 100% 完整封存以上 6 類全要素資料
            </Text>
          </View>
        </View>

        {/* Option B: 定期備份管理區塊 */}
        <View style={[styles.backupScheduleBox, { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default }]}>
          <View style={styles.backupScheduleHeader}>
            <View style={styles.backupScheduleHeaderLeft}>
              <Text style={[styles.backupScheduleTitle, { color: colors.text.primary }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                ⏰ 定期備份提醒
              </Text>
              <Text style={[styles.backupScheduleSub, { color: colors.text.secondary }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
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
              <Text style={[styles.backupIntervalLabel, { color: colors.text.secondary }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                提醒週期頻率：
              </Text>
              <View style={styles.backupIntervalChips}>
                {([7, 14, 30] as const).map((days) => (
                  <TouchableOpacity
                    key={days}
                    style={[
                      styles.backupIntervalChip,
                      { backgroundColor: colors.background.modal, borderColor: colors.border.default },
                      autoBackupInterval === days && styles.backupIntervalChipActive,
                    ]}
                    onPress={() => updateAutoBackupConfig(true, days)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.backupIntervalChipText,
                        { color: colors.text.secondary },
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

          <Text style={[styles.backupPrivacyNote, { color: colors.text.muted }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
            💡 手機系統隱私機制限制 App 靜默寫入個人雲端；開啟提醒後，系統會在到期時以橫幅通知您一鍵存檔至 Google Drive 或 iCloud。
          </Text>
        </View>

        <View style={styles.backupBtnRow}>
          <TouchableOpacity
            style={styles.exportCsvBtn}
            onPress={() => onOpenExportModal('csv')}
            activeOpacity={0.8}
          >
            <Text style={styles.exportCsvBtnText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>📊 匯出 CSV 報表 (Excel)</Text>
            <Text style={styles.exportBtnSubtext} allowFontScaling={false} maxFontSizeMultiplier={1.08}>內建 UTF-8 BOM 防中文亂碼</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.exportJsonBtn}
            onPress={() => onOpenExportModal('json')}
            activeOpacity={0.8}
          >
            <Text style={styles.exportJsonBtnText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>📦 匯出 JSON 結構備份</Text>
            <Text style={styles.exportBtnSubtext} allowFontScaling={false} maxFontSizeMultiplier={1.08}>包含成員頭像與自訂分類</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.restoreEntryBtn, { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default }]}
          onPress={() => onOpenExportModal('restore')}
          activeOpacity={0.8}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={[styles.restoreEntryBtnText, { color: colors.text.primary }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
              {isOwner ? '📥 從備份檔回復資料 (還原)' : '🔒 從備份檔回復資料 (僅管理員)'}
            </Text>
            {!isOwner && (
              <View style={styles.adminOnlyMiniBadge}>
                <Text style={styles.adminOnlyMiniBadgeText}>管理員</Text>
              </View>
            )}
          </View>
          <Text style={[styles.restoreEntryBtnSub, { color: colors.text.secondary }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
            {isOwner
              ? '支援上傳 .json 備份檔或直接貼上代碼安全還原'
              : '此操作具有覆蓋全帳本之影響，需管理員權限'}
          </Text>
        </TouchableOpacity>

        {/* 👑 管理員專屬：☁️ 雲端帳本總管入口 */}
        {(isAdminMode || isOwner) && (
          <TouchableOpacity
            style={[styles.restoreEntryBtn, { backgroundColor: isDark ? '#1E3A8A22' : '#EFF6FF', borderColor: isDark ? '#1E40AF' : '#BFDBFE', marginTop: 10 }]}
            onPress={onOpenCloudLedgerManager}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[styles.restoreEntryBtnText, { color: '#3B82F6' }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                ☁️ 雲端帳本總管
              </Text>
              <View style={[styles.adminOnlyMiniBadge, { backgroundColor: isDark ? '#1E3A8A' : '#DBEAFE', borderColor: '#3B82F6' }]}>
                <Text style={[styles.adminOnlyMiniBadgeText, { color: '#93C5FD' }]}>管理員</Text>
              </View>
            </View>
            <Text style={[styles.restoreEntryBtnSub, { color: '#60A5FA' }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
              盤點雲端全部帳本現況、監控 500 MB 空間用量（安全唯讀模式）
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 📖 產品介紹與常用操作指南卡片 */}
      <View style={[styles.cardSection, { backgroundColor: colors.background.modal, borderColor: colors.border.default }]}>
        <TouchableOpacity
          style={styles.guideEntryCard}
          onPress={onOpenProductGuideModal}
          activeOpacity={0.75}
        >
          <View style={styles.guideEntryLeft}>
            <View style={[styles.guideEntryIconCircle, { backgroundColor: isDark ? '#1E293B' : '#EFF6FF' }]}>
              <Text style={styles.guideEntryIcon}>📖</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.guideEntryTitleRow}>
                <Text style={[styles.guideEntryTitle, { color: colors.text.primary }]} numberOfLines={1} adjustsFontSizeToFit>
                  產品介紹與常用操作指南
                </Text>
                <View style={styles.guideEntryBadge}>
                  <Text style={styles.guideEntryBadgeText}>速查手冊</Text>
                </View>
              </View>
              <Text style={[styles.guideEntryDesc, { color: colors.text.secondary }]} numberOfLines={2}>
                家庭公帳記帳、撥零用錢、待辦連動、加值與對帳速查
              </Text>
            </View>
          </View>
          <View style={styles.guideEntryChevronWrap}>
            <Text style={[styles.guideEntryChevron, { color: colors.text.muted }]}>›</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* 系統版本與更新狀態卡片 */}
      <View style={[styles.cardSection, { backgroundColor: colors.background.modal, borderColor: colors.border.default }]}>
        <View style={styles.versionHeaderRow}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={[styles.cardSectionTitle, { color: colors.text.primary }]} numberOfLines={1} adjustsFontSizeToFit>
              📱 應用程式版本資訊
            </Text>
            <Text style={[styles.cardSectionDesc, { color: colors.text.secondary }]}>甜心記帳本跨平台系統</Text>
          </View>
          <TouchableOpacity
            style={styles.versionTagBadge}
            onPress={onOpenChangelogModal}
            activeOpacity={0.7}
          >
            <Text style={styles.versionTagBadgeText}>v{APP_VERSION} 📜</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.versionDetailBox, { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default }]}>
          <View style={styles.versionDetailRow}>
            <Text style={[styles.versionDetailLabel, { color: colors.text.secondary }]}>運行環境：</Text>
            <Text style={[styles.versionDetailValue, { color: colors.text.primary }]}>
              {Platform.OS === 'web'
                ? '🌐 Web 網頁版'
                : Platform.OS === 'ios'
                ? '🍎 iOS 原生 App'
                : '🤖 Android 原生 App'}
            </Text>
          </View>

          <View style={styles.versionDetailRow}>
            <Text style={[styles.versionDetailLabel, { color: colors.text.secondary }]}>更新機制：</Text>
            <Text style={[styles.versionDetailValue, { color: colors.text.primary }]}>
              {Platform.OS === 'web'
                ? '🌐 網頁即時快取'
                : (Updates.isEnabled ? '⚡ EAS 雲端熱更新' : '📦 獨立安裝版 (APK)')}
            </Text>
          </View>

          {Platform.OS !== 'web' && !!Updates.updateId && (
            <View style={styles.versionDetailRow}>
              <Text style={[styles.versionDetailLabel, { color: colors.text.secondary }]}>更新代碼：</Text>
              <Text style={[styles.versionDetailValue, styles.monoText, { color: colors.text.primary }]}>
                {Updates.updateId.slice(0, 8)}
              </Text>
            </View>
          )}

          {Platform.OS !== 'web' && !!Updates.createdAt && (
            <View style={styles.versionDetailRow}>
              <Text style={[styles.versionDetailLabel, { color: colors.text.secondary }]}>更新時間：</Text>
              <Text style={[styles.versionDetailValue, { color: colors.text.primary }]}>
                {new Date(Updates.createdAt).toLocaleString('zh-TW', { hour12: false })}
              </Text>
            </View>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <TouchableOpacity
            style={[styles.checkUpdateBtn, { flex: 1, marginTop: 0 }, isCheckingUpdate && styles.checkUpdateBtnDisabled]}
            onPress={onCheckForUpdates}
            disabled={isCheckingUpdate}
          >
            <Text style={styles.checkUpdateBtnText} numberOfLines={1} adjustsFontSizeToFit>
              {isCheckingUpdate ? '⏳ 檢查中...' : '🔄 檢查更新'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.viewChangelogBtn, { flex: 1, backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default }]}
            onPress={onOpenChangelogModal}
            activeOpacity={0.8}
          >
            <Text style={[styles.viewChangelogBtnText, { color: colors.text.primary }]} numberOfLines={1} adjustsFontSizeToFit>
              📜 更新歷程
            </Text>
          </TouchableOpacity>
        </View>

        {isOwner && onTriggerLiveToastDemo && (
          <TouchableOpacity
            style={[styles.testToastBtn, { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default }]}
            onPress={onTriggerLiveToastDemo}
            activeOpacity={0.8}
          >
            <Text style={[styles.testToastBtnText, { color: colors.text.primary }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
              🔔 測試即時動態泡泡通知
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 管理員日常成員模式 / 提權管理模式切換窗條 */}
      {realIsOwner && (
        <View style={[styles.sudoCard, isAdminMode ? styles.sudoCardUnlocked : styles.sudoCardProtected, { marginTop: 12 }]}>
          <View style={styles.sudoCardLeft}>
            <Text style={styles.sudoCardIcon}>{isAdminMode ? '👑' : '🛡️'}</Text>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={[styles.sudoCardTitle, isAdminMode ? styles.sudoCardTitleUnlocked : styles.sudoCardTitleProtected]}>
                {isAdminMode ? '目前模式：管理員模式 (已啟用)' : '目前模式：日常成員模式 (安全防護中)'}
              </Text>
              <Text style={[styles.sudoCardDesc, { color: colors.text.secondary }]}>
                {isAdminMode
                  ? '管理員特權已全面解除隱藏，可自由維護帳本、管理成員與資料庫備份。管理完成後建議切回日常成員模式。'
                  : '本機已進入日常成員保護模式，所有管理員專屬按鈕已自動隱藏，日常記帳更安心防誤觸。需要管理時請輸入 PIN 碼切換。'}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {isAdminMode ? (
              <TouchableOpacity
                style={[styles.sudoCardBtn, styles.sudoCardBtnLock, { flex: 1 }]}
                onPress={handleSwitchToDailyMemberMode}
                activeOpacity={0.7}
              >
                <Text style={[styles.sudoCardBtnText, styles.sudoCardBtnTextLock]}>
                  🔒 切回日常成員模式
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.sudoCardBtn, styles.sudoCardBtnUnlock, { flex: 1 }]}
                onPress={onOpenAdminModeModal}
                activeOpacity={0.7}
              >
                <Text style={[styles.sudoCardBtnText, styles.sudoCardBtnUnlock]}>
                  🔐 輸入 PIN 碼切換為管理員模式
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollPadding: {
    padding: 16,
    paddingBottom: 100,
  },
  cardSection: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  sectionHeaderLeft: {
    flex: 1,
    marginRight: 8,
  },
  cardSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  sectionHeaderDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  cardSectionDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  allowanceQuickBtn: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  allowanceQuickBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
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
    marginTop: 6,
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
  inviteHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roleBadgeOwner: {
    backgroundColor: '#FEF3C7',
  },
  roleBadgeProtected: {
    backgroundColor: '#E2E8F0',
  },
  roleBadgeMember: {
    backgroundColor: '#F1F5F9',
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  roleBadgeTextOwner: {
    color: '#B45309',
  },
  roleBadgeTextProtected: {
    color: '#475569',
  },
  roleBadgeTextMember: {
    color: '#64748B',
  },
  inviteCard: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
  },
  inviteCardLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  inviteCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  inviteCodeLarge: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 3,
  },
  copyCodeMiniBtn: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  copyCodeMiniBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  copyLinkBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  copyLinkBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  ownerControlsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  ownerControlBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  ownerControlBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  pinSectionWrapper: {
    borderTopWidth: 1,
    marginTop: 14,
    paddingTop: 12,
  },
  pinHeaderRow: {
    marginBottom: 8,
  },
  pinHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  pinHeaderDesc: {
    fontSize: 11,
    lineHeight: 15,
  },
  pinCardInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  pinCardLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  pinCardValue: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 2,
  },
  pinCardHint: {
    fontSize: 9,
  },
  togglePinBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  togglePinBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  changePinBtn: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  changePinBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  gatekeeperSectionWrapper: {
    borderTopWidth: 1,
    marginTop: 14,
    paddingTop: 12,
  },
  gatekeeperHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gatekeeperHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  gatekeeperBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  gatekeeperBadgeOpen: {
    backgroundColor: '#DCFCE7',
  },
  gatekeeperBadgeLocked: {
    backgroundColor: '#FEE2E2',
  },
  gatekeeperBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  gatekeeperBadgeTextOpen: {
    color: '#15803D',
  },
  gatekeeperBadgeTextLocked: {
    color: '#B91C1C',
  },
  gatekeeperHeaderDesc: {
    fontSize: 11,
    lineHeight: 15,
  },
  gatekeeperReadonlyTag: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  gatekeeperReadonlyTagText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600',
  },
  switchLedgerEntryBtn: {
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  switchLedgerEntryText: {
    fontSize: 13,
    fontWeight: '700',
  },
  switchLedgerEntryRedBadge: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  switchLedgerEntryRedBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  manageCategoryBtn: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  manageCategoryBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  backupStatsGrid: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  backupStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  backupStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  backupStatVal: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
  },
  backupStatLabel: {
    fontSize: 11,
  },
  backupStatDivider: {
    width: 1,
    height: 24,
  },
  backupStatsHorizontalDivider: {
    height: 1,
    marginVertical: 10,
  },
  backupStatsFooter: {
    borderTopWidth: 1,
    marginTop: 10,
    paddingTop: 8,
    alignItems: 'center',
  },
  backupStatsFooterText: {
    fontSize: 11,
  },
  backupScheduleBox: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  backupScheduleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  backupScheduleHeaderLeft: {
    flex: 1,
    marginRight: 8,
  },
  backupScheduleTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  backupScheduleSub: {
    fontSize: 11,
    marginTop: 2,
  },
  backupToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  backupToggleBtnActive: {
    backgroundColor: '#DCFCE7',
  },
  backupToggleBtnInactive: {
    backgroundColor: '#F1F5F9',
  },
  backupToggleText: {
    fontSize: 11,
    fontWeight: '700',
  },
  backupToggleTextActive: {
    color: '#15803D',
  },
  backupToggleTextInactive: {
    color: '#64748B',
  },
  backupStatusNotice: {
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  backupStatusNoticeOk: {
    backgroundColor: '#F0FDF4',
  },
  backupStatusNoticeDue: {
    backgroundColor: '#FEF2F2',
  },
  backupStatusNoticeText: {
    fontSize: 11,
    lineHeight: 15,
  },
  backupStatusNoticeTextOk: {
    color: '#15803D',
  },
  backupStatusNoticeTextDue: {
    color: '#B91C1C',
  },
  backupIntervalSection: {
    marginTop: 4,
    marginBottom: 6,
  },
  backupIntervalLabel: {
    fontSize: 11,
    marginBottom: 4,
  },
  backupIntervalChips: {
    flexDirection: 'row',
    gap: 8,
  },
  backupIntervalChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  backupIntervalChipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  backupIntervalChipText: {
    fontSize: 11,
  },
  backupIntervalChipTextActive: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  backupPrivacyNote: {
    fontSize: 10,
    lineHeight: 14,
    marginTop: 4,
  },
  backupBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  exportCsvBtn: {
    flex: 1,
    backgroundColor: '#059669',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  exportCsvBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  exportJsonBtn: {
    flex: 1,
    backgroundColor: '#4F46E5',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  exportJsonBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  exportBtnSubtext: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 10,
  },
  restoreEntryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  restoreEntryBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  adminOnlyMiniBadge: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 6,
  },
  adminOnlyMiniBadgeText: {
    color: '#B91C1C',
    fontSize: 10,
    fontWeight: '700',
  },
  restoreEntryBtnSub: {
    fontSize: 11,
    marginTop: 2,
  },
  guideEntryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  guideEntryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  guideEntryIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideEntryIcon: {
    fontSize: 22,
  },
  guideEntryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  guideEntryTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  guideEntryBadge: {
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  guideEntryBadgeText: {
    color: '#4338CA',
    fontSize: 10,
    fontWeight: '700',
  },
  guideEntryDesc: {
    fontSize: 11,
    lineHeight: 15,
  },
  guideEntryChevronWrap: {
    paddingLeft: 8,
  },
  guideEntryChevron: {
    fontSize: 20,
    fontWeight: '600',
  },
  versionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  versionTagBadge: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  versionTagBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  versionDetailBox: {
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    gap: 6,
  },
  versionDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  versionDetailLabel: {
    fontSize: 12,
  },
  versionDetailValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  monoText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  checkUpdateBtn: {
    backgroundColor: '#3B82F6',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkUpdateBtnDisabled: {
    opacity: 0.6,
  },
  checkUpdateBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  viewChangelogBtn: {
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewChangelogBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  testToastBtn: {
    marginTop: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  testToastBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  sudoCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  sudoCardProtected: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
  },
  sudoCardUnlocked: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  sudoCardLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 10,
  },
  sudoCardIcon: {
    fontSize: 24,
  },
  sudoCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  sudoCardTitleProtected: {
    color: '#334155',
  },
  sudoCardTitleUnlocked: {
    color: '#B45309',
  },
  sudoCardDesc: {
    fontSize: 11,
    lineHeight: 16,
  },
  sudoCardBtn: {
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  sudoCardBtnLock: {
    backgroundColor: '#D97706',
  },
  sudoCardBtnUnlock: {
    backgroundColor: '#2563EB',
  },
  sudoCardBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  sudoCardBtnTextLock: {
    color: '#FFFFFF',
  },
  sudoCardBtnTextUnlock: {
    color: '#FFFFFF',
  },
});
