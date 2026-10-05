import React, { useState, useEffect } from 'react';
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
import { Transaction, Profile } from './src/types/database';
import { getCategoryIcon } from './src/lib/icons';
import * as Updates from 'expo-updates';
import appConfig from './app.json';

const AVATAR_OPTIONS = ['👨', '👩', '👦', '👧', '👴', '👵', '👶', '👱', '🐶', '🐱'];

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
  } = useLedger();

  const [activeTab, setActiveTab] = useState<'transactions' | 'analytics' | 'family'>('transactions');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [memberModalVisible, setMemberModalVisible] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('👩');
  const [csvContent, setCsvContent] = useState('');
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

  // 應用程式版本與熱更新狀態
  const APP_VERSION = appConfig.expo.version || '1.0.0';
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

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

  const handleExport = () => {
    const csv = exportToCSV();
    setCsvContent(csv);
    setExportModalVisible(true);
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

  const renderEditMemberModal = () => (
    <Modal visible={editMemberModalVisible} animationType="fade" transparent>
      <View style={styles.exportOverlay}>
        <View style={styles.exportCard}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.exportTitle}>✏️ 編輯成員稱謂與頭像</Text>
            <TouchableOpacity onPress={() => setEditMemberModalVisible(false)} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.formHint}>修改後，所有家人的手機與歷史記帳紀錄皆會即時同步更新為新稱謂。</Text>

          <Text style={styles.formLabel}>成員暱稱 / 稱謂</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="例如：張三、爸爸、媽媽..."
            placeholderTextColor="#9CA3AF"
            value={editingMemberName}
            onChangeText={setEditingMemberName}
            autoFocus={Platform.OS !== 'web'}
          />

          <Text style={styles.formLabel}>選擇專屬頭像</Text>
          <View style={styles.avatarGrid}>
            {AVATAR_OPTIONS.map(avatar => {
              const isSelected = editingMemberAvatar === avatar;
              return (
                <TouchableOpacity
                  key={avatar}
                  style={[styles.avatarChip, isSelected && styles.avatarChipActive]}
                  onPress={() => setEditingMemberAvatar(avatar)}
                >
                  <Text style={styles.avatarEmoji}>{avatar}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.submitMemberBtn}
            disabled={isSavingEdit}
            onPress={handleSaveEditMember}
          >
            <Text style={styles.submitMemberBtnText}>
              {isSavingEdit ? '正在儲存...' : '💾 儲存修改'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

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
              <Text style={styles.transferAlertTitle}>⚠️ 包含代墊付款紀錄</Text>
              <Text style={styles.transferAlertDesc}>
                成員「{memberToDelete.display_name}」尚有{' '}
                <Text style={{ fontWeight: '700', color: '#B45309' }}>{paidTxs.length}</Text> 筆代墊付款紀錄（合計{' '}
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
                      `已將「${sourceName}」的 ${paidTxs.length} 筆代墊紀錄移交給「${targetName}」，並已將該成員從家庭名冊移除。`
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
          <View style={styles.avatarGrid}>
            {AVATAR_OPTIONS.map(avatar => {
              const isSelected = creatorAvatar === avatar;
              return (
                <TouchableOpacity
                  key={avatar}
                  style={[styles.avatarChip, isSelected && styles.avatarChipActive]}
                  onPress={() => setCreatorAvatar(avatar)}
                >
                  <Text style={styles.avatarEmoji}>{avatar}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={styles.submitMemberBtn} onPress={handleCreateLedger}>
            <Text style={styles.submitMemberBtnText}>🚀 確認建立並進入帳本</Text>
          </TouchableOpacity>
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
              <View style={styles.avatarGrid}>
                {AVATAR_OPTIONS.map(avatar => {
                  const isSelected = joinAvatar === avatar;
                  return (
                    <TouchableOpacity
                      key={avatar}
                      style={[styles.avatarChip, isSelected && styles.avatarChipActive]}
                      onPress={() => setJoinAvatar(avatar)}
                    >
                      <Text style={styles.avatarEmoji}>{avatar}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

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
            <Text style={styles.welcomeSubtitle}>全家人一起記帳・即時雲端同步・代墊分攤自動算</Text>
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
                <Text style={styles.featureItemTitle}>代墊分攤一目了然</Text>
                <Text style={styles.featureItemDesc}>自動統計誰代墊多少、結餘清楚，公帳不混淆</Text>
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
          >
            {/* 本月收支摘要卡片 */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryHeader}>
                <Text style={styles.summaryTitle} maxFontSizeMultiplier={1.2}>本月家庭總覽</Text>
                <Text style={styles.currencyLabel} maxFontSizeMultiplier={1.2}>TWD (新台幣)</Text>
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
                    -NT$ {settlementInfo.totalExpense.toLocaleString()}
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
                    +NT$ {settlementInfo.totalIncome.toLocaleString()}
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
                    NT$ {settlementInfo.netBalance.toLocaleString()}
                  </Text>
                </View>
              </View>
            </View>

            {/* 交易列表標題 */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>近期收支明細 ({transactions.length})</Text>
              <Text style={styles.sectionSubtitle}>點擊明細可直接修改或刪除 ✍️</Text>
            </View>

            {/* 交易清單 */}
            {transactions.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyIcon}>🧾</Text>
                <Text style={styles.emptyText}>目前還沒有記帳紀錄</Text>
                <Text style={styles.emptySubtext}>點擊右下角「+」開始記錄家庭第一筆花費</Text>
              </View>
            ) : (
              transactions.map(item => (
                <TransactionItem
                  key={item.id}
                  transaction={item}
                  onPress={tx => setEditingTransaction(tx)}
                />
              ))
            )}
          </ScrollView>
        )}

        {activeTab === 'analytics' && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollPadding}>
            {/* 誰代墊了多少（家庭分攤統計） */}
            <View style={styles.cardSection}>
              <Text style={styles.cardSectionTitle}>👨‍👩‍👧 各成員代墊付款比例</Text>
              <Text style={styles.cardSectionDesc}>清楚掌握誰為家裡付出最多代墊款</Text>

              <View style={styles.memberPayList}>
                {members.map(member => {
                  const paid = settlementInfo.paidByMembers[member.id] || 0;
                  const ratio = settlementInfo.totalExpense > 0 
                    ? ((paid / settlementInfo.totalExpense) * 100).toFixed(1) 
                    : '0';

                  return (
                    <View key={member.id} style={styles.memberPayRow}>
                      <View style={styles.memberInfo}>
                        <Text style={styles.memberAvatar}>{member.avatar_url}</Text>
                        <Text style={styles.memberName}>{member.display_name}</Text>
                      </View>
                      <View style={styles.memberAmountBox}>
                        <Text style={styles.memberAmount}>NT$ {paid.toLocaleString()}</Text>
                        <Text style={styles.memberRatio}>{ratio}%</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* 分類支出排行 */}
            <View style={styles.cardSection}>
              <Text style={styles.cardSectionTitle}>📊 支出分類排行</Text>
              {categories
                .filter(c => c.type === 'expense')
                .map(cat => {
                  const catTotal = transactions
                    .filter(t => {
                      const c = getCategoryById(t.category_id, t.category);
                      return (c.id === cat.id || c.name === cat.name) && t.type === 'expense';
                    })
                    .reduce((sum, t) => sum + Number(t.amount), 0);
                  
                  if (catTotal === 0) return null;

                  const percentage = settlementInfo.totalExpense > 0
                    ? Math.round((catTotal / settlementInfo.totalExpense) * 100)
                    : 0;

                  return (
                    <View key={cat.id} style={styles.categoryStatRow}>
                      <View style={styles.catHeader}>
                        <Text style={styles.catName}>{getCategoryIcon(cat.icon)} {cat.name}</Text>
                        <Text style={styles.catAmount}>NT$ {catTotal.toLocaleString()} ({percentage}%)</Text>
                      </View>
                      <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { width: `${percentage}%`, backgroundColor: cat.color }]} />
                      </View>
                    </View>
                  );
                })}
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
                    每位家人使用自己的手機進入，記帳時預設自動帶入個人身分
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
                  const isCurrent = currentUser.id === member.id || (!!currentUser.display_name && currentUser.display_name === member.display_name);
                  const isMemberAdmin = member.role === 'owner' || member.role === 'admin' || currentLedger.created_by === member.id;
                  const isCreator = currentLedger.created_by === member.id;

                  return (
                    <View key={member.id} style={[styles.userChip, isCurrent && styles.userChipActive]}>
                      {/* 管理員徽章 */}
                      {isMemberAdmin && (
                        <View style={styles.memberRoleBadge}>
                          <Text style={styles.memberRoleBadgeText}>{isCreator ? '👑 創建者' : '👑 管理員'}</Text>
                        </View>
                      )}

                      <View style={styles.userChipClickable}>
                        <Text style={styles.userAvatar}>{member.avatar_url}</Text>
                        <Text style={[styles.userTitle, isCurrent && styles.userTitleActive]} numberOfLines={1} ellipsizeMode="tail">
                          {member.display_name}
                        </Text>
                        {isCurrent && (
                          <Text style={styles.activeTag}>
                            📱 我 (本機)
                          </Text>
                        )}
                      </View>

                      {/* 編輯稱謂與頭像按鈕：只有本機成員或管理員允許編輯 */}
                      {(isCurrent || isOwner) && (
                        <TouchableOpacity
                          style={styles.editMemberBtn}
                          onPress={() => handleStartEditMember(member)}
                        >
                          <Text style={styles.editMemberBtnText}>✏️ 編輯稱謂</Text>
                        </TouchableOpacity>
                      )}

                      {/* 共同管理員角色切換：身為管理員且對象非自己、非原始建立者時可調整 */}
                      {isOwner && !isCurrent && !isCreator && (
                        <TouchableOpacity
                          style={[styles.roleToggleBtn, isMemberAdmin ? styles.roleToggleBtnDemote : styles.roleToggleBtnPromote]}
                          onPress={() => {
                            if (isMemberAdmin) {
                              showConfirm(
                                '取消管理員權限',
                                `確定要將「${member.display_name}」降為一般成員嗎？`,
                                () => updateMemberRole(member.id, 'member')
                              );
                            } else {
                              showConfirm(
                                '設為共同管理員',
                                `確定要將「${member.display_name}」設為這本帳本的共同管理員嗎？\n成為管理員後，該成員也可以刪除成員並管理家庭邀請碼。`,
                                () => updateMemberRole(member.id, 'owner')
                              );
                            }
                          }}
                        >
                          <Text style={[styles.roleToggleBtnText, isMemberAdmin ? styles.roleToggleBtnTextDemote : styles.roleToggleBtnTextPromote]}>
                            {isMemberAdmin ? '降為成員' : '👑 設為管理員'}
                          </Text>
                        </TouchableOpacity>
                      )}

                      {/* 刪除成員按鈕：僅管理員且非本人、非創建者可刪除 */}
                      {isOwner && !isCurrent && members.length > 1 && !isCreator && (
                        <TouchableOpacity
                          style={styles.deleteMemberBtn}
                          onPress={() => {
                            if (!isOwner) {
                              showAlert('權限不足', '只有帳本管理員才能刪除家庭成員');
                              return;
                            }
                            const paidTxs = transactions.filter(t => (getMemberById(t.paid_by)?.id || t.paid_by) === member.id);
                            const paidTotal = paidTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0);
                            if (paidTotal > 0) {
                              setMemberToDelete(member);
                              setTransferRecipientId(currentUser.id);
                            } else {
                              showConfirm(
                                '刪除成員',
                                `確定要將「${member.display_name}」從家庭名冊移除嗎？`,
                                () => deleteMember(member.id)
                              );
                            }
                          }}
                        >
                          <Text style={styles.deleteMemberText}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>
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

            {/* 資料備份與匯出 */}
            <View style={styles.cardSection}>
              <Text style={styles.cardSectionTitle}>🛡️ 資料備份與掌控</Text>
              <Text style={styles.cardSectionDesc}>隨時匯出整本帳簿 Excel / CSV 格式，保存至個人硬碟</Text>

              <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
                <Text style={styles.exportBtnText} numberOfLines={1} adjustsFontSizeToFit>
                  📥 一鍵匯出 CSV / Excel 備份檔
                </Text>
              </TouchableOpacity>
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

      {/* 匯出資料展示彈窗 */}
      <Modal visible={exportModalVisible} animationType="fade" transparent>
        <View style={styles.exportOverlay}>
          <View style={styles.exportCard}>
            <Text style={styles.exportTitle}>📋 CSV 匯出預覽</Text>
            <Text style={styles.exportDesc}>此純文字可用微軟 Excel 或 Google 試算表直接開啟：</Text>
            <ScrollView style={styles.csvBox}>
              <Text style={styles.csvText}>{csvContent}</Text>
            </ScrollView>
            <TouchableOpacity style={styles.closeExportBtn} onPress={() => setExportModalVisible(false)}>
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
            <View style={styles.avatarGrid}>
              {AVATAR_OPTIONS.map(avatar => {
                const isSelected = selectedAvatar === avatar;
                return (
                  <TouchableOpacity
                    key={avatar}
                    style={[styles.avatarChip, isSelected && styles.avatarChipActive]}
                    onPress={() => setSelectedAvatar(avatar)}
                  >
                    <Text style={styles.avatarEmoji}>{avatar}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.submitMemberBtn} onPress={handleAddMember}>
              <Text style={styles.submitMemberBtnText}>確認新增成員</Text>
            </TouchableOpacity>
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
  catAmount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
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
    justifyContent: 'space-between',
    width: '100%',
  },
  userChip: {
    width: '48%',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    marginBottom: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    position: 'relative',
  },
  userChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  userAvatar: {
    fontSize: 24,
    marginBottom: 4,
  },
  userTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  userTitleActive: {
    color: '#4F46E5',
    fontWeight: '700',
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
  exportBtn: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
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
  exportDesc: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 12,
  },
  csvBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  csvText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
    color: '#334155',
  },
  closeExportBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeExportBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
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
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    marginTop: 4,
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
    position: 'absolute',
    top: 4,
    left: 6,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: '#FDE68A',
    zIndex: 5,
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
});
