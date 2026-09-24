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

const AVATAR_OPTIONS = ['👨', '👩', '👦', '👧', '👴', '👵', '👶', '👱', '🐶', '🐱'];

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

function MainApp() {
  const {
    currentLedger,
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
  } = useLedger();

  const [activeTab, setActiveTab] = useState<'transactions' | 'analytics' | 'family'>('transactions');
  const [modalVisible, setModalVisible] = useState(false);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [memberModalVisible, setMemberModalVisible] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('👩');
  const [csvContent, setCsvContent] = useState('');

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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* 頂部導航列 */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.ledgerSubtitle}>家庭共享記帳本</Text>
          <Text style={styles.ledgerTitle}>{currentLedger.name}</Text>
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
                        <Text style={styles.catName}>{cat.icon} {cat.name}</Text>
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
                <View>
                  <Text style={styles.cardSectionTitle}>👨‍👩‍👧 家庭成員名單 ({members.length})</Text>
                  <Text style={styles.cardSectionDesc}>
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
                        <Text style={[styles.userTitle, isCurrent && styles.userTitleActive]}>
                          {member.display_name}
                        </Text>
                        {isCurrent && (
                          <Text style={styles.activeTag}>
                            {isDeviceBound ? '🔒 本機專用' : '使用中'}
                          </Text>
                        )}
                      </TouchableOpacity>
                      {members.length > 1 && !isDeviceBound && (
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
                        <Text style={styles.bindMemberName}>鎖定 {member.display_name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>

            {/* 邀請家人加入 */}
            <View style={styles.cardSection}>
              <Text style={styles.cardSectionTitle}>🔗 邀請家人共同記帳</Text>
              <Text style={styles.cardSectionDesc}>讓伴侶或家人下載 APP 後輸入此邀請碼即可加入</Text>

              <View style={styles.inviteBox}>
                <Text style={styles.inviteCode}>FAM-8823</Text>
                <TouchableOpacity
                  style={styles.copyBtn}
                  onPress={() => showAlert('已複製邀請碼', '您可以將邀請碼傳送到 LINE 群組給家人！')}
                >
                  <Text style={styles.copyBtnText}>複製邀請連結</Text>
                </TouchableOpacity>
              </View>
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

      {/* 浮動記帳按鈕 (FAB) */}
      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>

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
              autoFocus
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
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <LedgerProvider>
      <MainApp />
    </LedgerProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
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
    gap: 10,
  },
  userChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
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
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  addMemberBtn: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
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
  },
  bindMemberBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  bindMemberAvatar: {
    fontSize: 16,
    marginRight: 6,
  },
  bindMemberName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
});
