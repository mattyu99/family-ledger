import React, { useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
  Modal,
  Platform,
  TextInput,
} from 'react-native';
import { LedgerProvider, useLedger } from './src/context/LedgerContext';
import { TransactionItem } from './src/components/TransactionItem';
import { AddTransactionModal } from './src/components/AddTransactionModal';
import { getCategoryIcon } from './src/lib/icons';

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
    setCurrentUser,
    settlementInfo,
    exportToCSV,
    addMember,
    deleteMember,
    isDeviceBound,
    bindDeviceToMember,
    unbindDevice,
    isCloudSynced,
    hasJoinedLedger,
    isOwner,
    inviteCode,
    createLedger,
    joinLedgerByCode,
    regenerateInviteCode,
    updateInviteCode,
    getInviteLink,
    pendingInviteCode,
    confirmPendingInvite,
    cancelPendingInvite,
    leaveCurrentLedger,
    switchLedgerById,
    leaveLedgerById,
  } = useLedger();

  const [activeTab, setActiveTab] = useState<'transactions' | 'analytics' | 'family'>('transactions');
  const [modalVisible, setModalVisible] = useState(false);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [memberModalVisible, setMemberModalVisible] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('👩');
  const [csvContent, setCsvContent] = useState('');

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

  const [customCodeModalVisible, setCustomCodeModalVisible] = useState(false);
  const [customCodeInput, setCustomCodeInput] = useState('');

  const [switchLedgerModalVisible, setSwitchLedgerModalVisible] = useState(false);
  const [switchCodeInput, setSwitchCodeInput] = useState('');

  const handleExport = () => {
    const csv = exportToCSV();
    setCsvContent(csv);
    setExportModalVisible(true);
  };

  const handleAddMember = async () => {
    if (!newMemberName.trim()) {
      showAlert('請輸入姓名', '成員名稱不能為空');
      return;
    }
    await addMember(newMemberName.trim(), selectedAvatar);
    setNewMemberName('');
    setMemberModalVisible(false);
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
            <Text style={styles.exportTitle}>🔗 加入現有家庭帳本</Text>
            <TouchableOpacity onPress={() => setJoinLedgerModalVisible(false)} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.formHint}>請輸入家人提供的 4~8 碼邀請代碼（例如 FAM-8823），或直接貼上 LINE 邀請網址。</Text>

          <Text style={styles.formLabel}>邀請碼或完整邀請連結</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="例如：FAM-8823 或貼上連結"
            placeholderTextColor="#9CA3AF"
            value={joinCodeInput}
            onChangeText={setJoinCodeInput}
            autoCapitalize="characters"
          />

          <Text style={styles.formLabel}>您的暱稱 / 稱謂</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="例如：媽媽、大寶..."
            placeholderTextColor="#9CA3AF"
            value={joinNickname}
            onChangeText={setJoinNickname}
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
            onPress={handleJoinLedger}
          >
            <Text style={styles.submitMemberBtnText}>
              {isJoining ? '正在驗證並加入...' : '✨ 驗證並加入帳本'}
            </Text>
          </TouchableOpacity>
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
            {hasJoinedLedger
              ? `您目前已在「${currentLedger.name}」，是否要切換並加入該家庭帳本？`
              : '是否立即加入此家庭公帳？'}
          </Text>

          <View style={styles.pendingInviteButtons}>
            <TouchableOpacity
              style={styles.confirmInviteBtn}
              onPress={async () => {
                await confirmPendingInvite();
                showAlert('加入成功！', '已成功切換至新的家庭帳本！');
              }}
            >
              <Text style={styles.confirmInviteBtnText}>✅ 確認切換並加入</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelInviteBtn} onPress={cancelPendingInvite}>
              <Text style={styles.cancelInviteBtnText}>✕ 保留現有帳本 (取消)</Text>
            </TouchableOpacity>
          </View>
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
        <View>
          <Text style={styles.ledgerSubtitle}>家庭共享記帳本</Text>
          <View style={styles.topBarTitleRow}>
            <Text style={styles.ledgerTitle}>{currentLedger.name}</Text>
            {isOwner && (
              <View style={styles.ownerTopBadge}>
                <Text style={styles.ownerTopBadgeText}>👑 管理員</Text>
              </View>
            )}
          </View>
        </View>

        {/* 雲端狀態徽章 */}
        <View style={[styles.syncBadge, isCloudSynced ? styles.syncOnline : styles.syncLocal]}>
          <Text style={styles.syncDot}>{isCloudSynced ? '🟢' : '🟡'}</Text>
          <Text style={styles.syncText}>{isCloudSynced ? '雲端即時同步' : '本地離線快取'}</Text>
        </View>
      </View>

      {/* 頁籤內容 */}
      <View style={styles.content}>
        {activeTab === 'transactions' && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollPadding}>
            {/* 本月收支摘要卡片 */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryHeader}>
                <Text style={styles.summaryTitle}>本月家庭總覽</Text>
                <Text style={styles.currencyLabel}>TWD (新台幣)</Text>
              </View>

              <View style={styles.summaryGrid}>
                <View style={styles.summaryCol}>
                  <Text style={styles.summaryLabel}>總支出</Text>
                  <Text style={[styles.summaryVal, styles.expenseVal]}>
                    -NT$ {settlementInfo.totalExpense.toLocaleString()}
                  </Text>
                </View>

                <View style={styles.summaryDivider} />

                <View style={styles.summaryCol}>
                  <Text style={styles.summaryLabel}>總收入</Text>
                  <Text style={[styles.summaryVal, styles.incomeVal]}>
                    +NT$ {settlementInfo.totalIncome.toLocaleString()}
                  </Text>
                </View>

                <View style={styles.summaryDivider} />

                <View style={styles.summaryCol}>
                  <Text style={styles.summaryLabel}>結餘</Text>
                  <Text style={styles.summaryVal}>
                    NT$ {settlementInfo.netBalance.toLocaleString()}
                  </Text>
                </View>
              </View>
            </View>

            {/* 交易列表標題 */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>近期收支明細 ({transactions.length})</Text>
              <Text style={styles.sectionSubtitle}>即時自動同步</Text>
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
                <TransactionItem key={item.id} transaction={item} />
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
                    .filter(t => t.category_id === cat.id && t.type === 'expense')
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
                    {isDeviceBound
                      ? '🔒 本機已綁定專屬成員，無法點選切換身分'
                      : '點擊成員可切換當前記帳者，亦可隨時新增'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.addMemberBtn}
                  onPress={() => setMemberModalVisible(true)}
                >
                  <Text style={styles.addMemberBtnText}>＋ 新增成員</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.userSwitchRow}>
                {members.map(member => {
                  const isCurrent = currentUser.id === member.id;
                  return (
                    <View key={member.id} style={[styles.userChip, isCurrent && styles.userChipActive, isDeviceBound && !isCurrent && styles.userChipDisabled]}>
                      <TouchableOpacity
                        style={styles.userChipClickable}
                        onPress={() => {
                          if (isDeviceBound && !isCurrent) {
                            showAlert('本機已鎖定', `此手機已鎖定為「${currentUser.display_name}」的專用機，若要切換請先在下方解除鎖定。`);
                          } else {
                            setCurrentUser(member);
                          }
                        }}
                      >
                        <Text style={styles.userAvatar}>{member.avatar_url}</Text>
                        <Text style={[styles.userTitle, isCurrent && styles.userTitleActive]} numberOfLines={1} ellipsizeMode="tail">
                          {member.display_name}
                        </Text>
                        {isCurrent && (
                          <Text style={styles.activeTag}>
                            {isDeviceBound ? '🔒 本機專用' : '使用中'}
                          </Text>
                        )}
                      </TouchableOpacity>
                      {isOwner && !isCurrent && members.length > 1 && !isDeviceBound && (
                        <TouchableOpacity
                          style={styles.deleteMemberBtn}
                          onPress={() => {
                            showConfirm('刪除成員', `確定要將「${member.display_name}」從家庭名冊移除嗎？`, () => deleteMember(member.id));
                          }}
                        >
                          <Text style={styles.deleteMemberText}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>

            {/* 裝置身分綁定（長輩防呆專用） */}
            <View style={styles.cardSection}>
              <Text style={styles.cardSectionTitle}>📱 裝置身分鎖定（長輩防呆）</Text>
              <Text style={styles.cardSectionDesc}>
                {isDeviceBound
                  ? `本手機已鎖定為【${currentUser.display_name}】專用機，記帳時自動鎖死頭像，長輩絕不按錯！`
                  : '可將這支手機綁定為媽媽（或特定成員）的專用機，鎖定後無法切換身分與付款人。'}
              </Text>

              {isDeviceBound ? (
                <View style={styles.boundStatusBox}>
                  <View style={styles.boundStatusContent}>
                    <Text style={styles.boundStatusIcon}>🔒</Text>
                    <View style={styles.boundStatusTextCol}>
                      <Text style={styles.boundStatusTitle}>
                        已鎖定：{currentUser.avatar_url} {currentUser.display_name}
                      </Text>
                      <Text style={styles.boundStatusSub}>所有新記帳皆自動歸屬此成員，無法更改</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.unbindBtn}
                    onPress={() => {
                      showConfirm('解除裝置鎖定', '解除後即可自由切換成員記帳，確定要解除嗎？', () => unbindDevice());
                    }}
                  >
                    <Text style={styles.unbindBtnText}>🔓 解除鎖定</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.bindActionBox}>
                  <Text style={styles.bindActionPrompt}>
                    點擊下方成員，將本機設為其「專用手機」：
                  </Text>
                  <View style={styles.bindButtonRow}>
                    {members.map(member => (
                      <TouchableOpacity
                        key={member.id}
                        style={styles.bindMemberBtn}
                        onPress={() => {
                          showConfirm('鎖定裝置身分', `確定將這支手機鎖定為「${member.display_name}」的專用機嗎？`, () => bindDeviceToMember(member));
                        }}
                      >
                        <Text style={styles.bindMemberAvatar}>{member.avatar_url}</Text>
                        <Text style={styles.bindMemberName} numberOfLines={1} ellipsizeMode="tail">鎖定 {member.display_name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
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

            {/* 資料備份與匯出 */}
            <View style={styles.cardSection}>
              <Text style={styles.cardSectionTitle}>🛡️ 資料備份與掌控</Text>
              <Text style={styles.cardSectionDesc}>隨時匯出整本帳簿 Excel / CSV 格式，保存至個人硬碟</Text>

              <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
                <Text style={styles.exportBtnText}>📥 一鍵匯出 CSV / Excel 備份檔</Text>
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

      {/* 自訂邀請碼彈窗 */}
      {renderCustomCodeModal()}

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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    width: '100%',
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
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
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
    color: '#94A3B8',
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
    fontSize: 16,
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
    paddingVertical: 12,
    alignItems: 'center',
  },
  exportBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
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
  userChipDisabled: {
    opacity: 0.6,
  },
  boundStatusBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    padding: 14,
  },
  boundStatusContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  boundStatusIcon: {
    fontSize: 26,
    marginRight: 10,
  },
  boundStatusTextCol: {
    flex: 1,
  },
  boundStatusTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#166534',
  },
  boundStatusSub: {
    fontSize: 12,
    color: '#15803D',
    marginTop: 2,
  },
  unbindBtn: {
    backgroundColor: '#DCFCE7',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  unbindBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
  },
  bindActionBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bindActionPrompt: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 10,
  },
  bindButtonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
  },
  bindMemberBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    maxWidth: '100%',
    marginBottom: 4,
  },
  bindMemberAvatar: {
    fontSize: 16,
    marginRight: 6,
  },
  bindMemberName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    flexShrink: 1,
  },
  topBarTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ownerTopBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  ownerTopBadgeText: {
    fontSize: 11,
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
});
