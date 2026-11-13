import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Platform,
  StatusBar,
  Alert,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useLedger } from '../context/LedgerContext';
import { GroupOrderSummary, GroupOrderItem, MemberEarningSummary } from '../lib/groupOrder';

interface GroupOrderCounterModalProps {
  visible: boolean;
  summary: GroupOrderSummary;
  onClose: () => void;
  onToggleItem: (itemIndex: number) => void;
  onSettleOrder: (totalAmount: number, storeName: string) => void;
  onUpdateItemMember?: (lineIndex: number, newMemberName?: string) => void;
  onSettleAllowance?: (earnings: MemberEarningSummary[]) => void;
  onAddQuickItem?: () => void;
}

export const GroupOrderCounterModal: React.FC<GroupOrderCounterModalProps> = ({
  visible,
  summary,
  onClose,
  onToggleItem,
  onSettleOrder,
  onUpdateItemMember,
  onSettleAllowance,
  onAddQuickItem,
}) => {
  const { isDark } = useTheme();
  const { currentUser, members } = useLedger();
  const [pickingItem, setPickingItem] = useState<GroupOrderItem | null>(null);

  const isChore = summary.mode === 'chore';
  const isGrocery = summary.mode === 'grocery';
  const isParcel = summary.mode === 'parcel';
  const isShoppingLike = isGrocery || isParcel || isChore;
  const progressPercent = summary.totalCount > 0
    ? Math.round((summary.completedCount / summary.totalCount) * 100)
    : 0;

  // 家事懸賞模式中，已有完成工作且有獎勵的成員清單
  const earnedMembers = (summary.memberEarnings || []).filter(e => e.totalAmount > 0 && e.completedCount > 0);
  const totalEarnedAmount = earnedMembers.reduce((sum, e) => sum + e.totalAmount, 0);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.safeArea, isDark && { backgroundColor: '#111827' }]}>
        <View style={[styles.container, isDark && { backgroundColor: '#111827' }]}>
          {/* 頂部標題與關閉列 */}
          <View style={[styles.header, isDark && { borderBottomColor: '#374151' }]}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <View style={styles.titleRow}>
                <Text style={styles.storeIcon}>
                  {isChore ? '🧹' : (isParcel ? '📦' : (isGrocery ? '🛒' : '🧋'))}
                </Text>
                <Text style={[styles.storeTitle, isDark && { color: '#F9FAFB' }]} numberOfLines={1}>
                  {summary.storeName &&
                  summary.storeName !== '點餐店家' &&
                  summary.storeName !== '採買賣場' &&
                  summary.storeName !== '網購包裹' &&
                  summary.storeName !== '家庭任務'
                    ? summary.storeName
                    : (isChore
                        ? '家庭家事分工'
                        : (isParcel ? '網購湊單／包裹' : (isGrocery ? '賣場採買' : '點餐開團')))}
                </Text>
              </View>
              <Text style={[styles.storeSubtitle, isDark && { color: '#9CA3AF' }]}>
                {isChore
                  ? '家庭家事與懸賞分工 · 做完可直接打勾劃線，點人名隨時換人'
                  : (isParcel
                      ? '網購湊單與包裹代領看板 · 買妥或領完可直接點擊劃線'
                      : (isGrocery
                          ? '賣場推車採買看板 · 放入推車可直接劃線核對'
                          : '櫃檯大字點餐看板 · 點完可直接點擊劃線核對'))}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {onAddQuickItem && (
                <TouchableOpacity
                  onPress={onAddQuickItem}
                  style={[styles.quickAddBtn, isDark && { backgroundColor: '#1E3A8A' }]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.quickAddBtnText, isDark && { color: '#93C5FD' }]}>＋ 現場追加</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose} style={[styles.closeBtn, isDark && { backgroundColor: '#374151' }]}>
                <Text style={[styles.closeBtnText, isDark && { color: '#D1D5DB' }]}>關閉</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 統計大看板 */}
          <View style={[styles.summaryBoard, isDark && { backgroundColor: '#1F2937', borderColor: '#374151' }]}>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>
                {isChore ? '任務進度' : (isParcel ? '處理進度' : (isGrocery ? '採買進度' : '累計數量'))}
              </Text>
              <Text style={[styles.summaryBigNumber, { color: '#F59E0B' }]}>
                {summary.completedCount}/{summary.totalCount}{' '}
                <Text style={{ fontSize: 16 }}>
                  {isChore ? '項' : (isParcel ? '件' : (isGrocery ? '項' : '份'))}
                </Text>
                {isShoppingLike && <Text style={{ fontSize: 13, color: '#10B981', fontWeight: '700' }}> ({progressPercent}%)</Text>}
              </Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>
                {isChore ? '累計懸賞獎勵' : '預估總金額'}
              </Text>
              <Text style={[styles.summaryBigNumber, { color: '#10B981' }]}>
                {isChore
                  ? `$${summary.totalAmount}`
                  : (summary.hasAmount
                      ? `$${summary.totalAmount}`
                      : (isParcel ? '免付/依結帳' : (isGrocery ? '依發票結算' : '隨喜')))}
              </Text>
            </View>
          </View>

          {/* 大字點餐/採買/包裹清單 */}
          <ScrollView style={styles.listScroll} contentContainerStyle={styles.listContent}>
            {summary.items.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>{isParcel ? '📦' : (isGrocery ? '🛒' : '📝')}</Text>
                <Text style={[styles.emptyText, isDark && { color: '#9CA3AF' }]}>
                  {isParcel
                    ? '目前還沒有登記湊單或待領包裹，快點「＋加湊/代領」新增！'
                    : (isGrocery
                        ? '目前還沒有登記採買項目，快通知大家在卡片點「＋我要買」！'
                        : '目前還沒有家人登記點單，快通知大家在卡片點「＋我也要」報單！')}
                </Text>
              </View>
            ) : (
              summary.items.map((item: GroupOrderItem, idx: number) => {
                const isChecked = item.isDone;
                return (
                  <TouchableOpacity
                    key={idx}
                    activeOpacity={0.7}
                    onPress={() => onToggleItem(item.lineIndex)}
                    style={[
                      styles.orderCard,
                      isChecked && styles.orderCardChecked,
                      isDark && {
                        backgroundColor: isChecked ? '#1F2937' : '#1E293B',
                        borderColor: isChecked ? '#374151' : '#334155',
                      },
                    ]}
                  >
                    {/* 左側勾選盒 */}
                    <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
                      {isChecked && <Text style={styles.checkIcon}>✓</Text>}
                    </View>

                    {/* 右側大字餐點/物品內容 */}
                    <View style={styles.cardContent}>
                      <View style={styles.cardHeaderRow}>
                        {!!item.memberName ? (
                          <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={(e) => {
                              e.stopPropagation?.();
                              setPickingItem(item);
                            }}
                            style={[
                              styles.memberBadge,
                              isGrocery && { backgroundColor: '#ECFDF5' },
                              isParcel && { backgroundColor: '#EFF6FF' },
                              isChore && { backgroundColor: '#FEF3C7', borderColor: '#FDE68A', borderWidth: 1 },
                            ]}
                          >
                            <Text
                              style={[
                                styles.memberBadgeText,
                                isGrocery && { color: '#059669' },
                                isParcel && { color: '#2563EB' },
                                isChore && { color: '#B45309' },
                              ]}
                            >
                              {item.memberName} ▾
                            </Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={(e) => {
                              e.stopPropagation?.();
                              const defaultMember = currentUser?.display_name || members[0]?.display_name || '家人';
                              onUpdateItemMember?.(item.lineIndex, defaultMember);
                            }}
                            style={[
                              styles.claimBtn,
                              isDark && { backgroundColor: 'rgba(245, 158, 11, 0.2)', borderColor: '#F59E0B' },
                            ]}
                          >
                            <Text style={styles.claimBtnText}>＋ ✋ 我認領</Text>
                          </TouchableOpacity>
                        )}
                        <Text
                          style={[
                            styles.itemNameText,
                            isChecked && styles.textStrike,
                            isDark && { color: isChecked ? '#6B7280' : '#F9FAFB' },
                          ]}
                        >
                          {item.itemName}
                        </Text>
                        {item.price > 0 && (
                          <Text style={[styles.priceTag, isChecked && styles.textStrike]}>
                            ${item.price}
                          </Text>
                        )}
                      </View>

                      {!!item.specs && (
                        <View style={styles.specsRow}>
                          <Text
                            style={[
                              styles.specsText,
                              isChecked && styles.textStrike,
                              isDark && { color: isChecked ? '#4B5563' : (isGrocery ? '#34D399' : '#FBBF24') },
                            ]}
                          >
                            👉 {item.specs}
                          </Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          {/* 底部動作列 */}
          <View style={[styles.footer, isDark && { backgroundColor: '#1F2937', borderTopColor: '#374151' }]}>
            {isChore ? (
              <View style={styles.choreFooterContent}>
                {earnedMembers.length > 0 ? (
                  <>
                    <View style={styles.choreEarnedList}>
                      {earnedMembers.map((em, eIdx) => (
                        <View key={eIdx} style={[styles.choreEarnedRow, isDark && { borderBottomColor: '#374151' }]}>
                          <Text style={[styles.choreEarnedName, isDark && { color: '#F9FAFB' }]}>
                            👦 {em.memberName}：完成 {em.completedCount} 項
                          </Text>
                          <Text style={styles.choreEarnedAmount}>NT$ {em.totalAmount}</Text>
                        </View>
                      ))}
                    </View>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => {
                        Alert.alert(
                          '核發零用錢獎勵',
                          `確定為 ${earnedMembers.map(e => `${e.memberName} (NT$ ${e.totalAmount})`).join('、')} 建立零用錢記帳嗎？`,
                          [
                            { text: '取消', style: 'cancel' },
                            {
                              text: '確定發放',
                              onPress: () => {
                                onClose();
                                onSettleAllowance?.(earnedMembers);
                              },
                            },
                          ]
                        );
                      }}
                      style={[styles.settleBtn, { backgroundColor: '#F59E0B' }]}
                    >
                      <Text style={styles.settleBtnIcon}>💰</Text>
                      <Text style={styles.settleBtnText}>
                        {earnedMembers.length === 1
                          ? `核發零用錢給 ${earnedMembers[0].memberName} ($${totalEarnedAmount})`
                          : `一鍵全發零用錢 (共 $${totalEarnedAmount} / ${earnedMembers.length}人分流記帳)`}
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      onClose();
                      onSettleOrder(summary.totalAmount, summary.storeName);
                    }}
                    style={[styles.settleBtn, { backgroundColor: '#10B981' }]}
                  >
                    <Text style={styles.settleBtnIcon}>✓</Text>
                    <Text style={styles.settleBtnText}>任務全部完成！一鍵歸檔</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  onClose();
                  onSettleOrder(summary.totalAmount, summary.storeName);
                }}
                style={[
                  styles.settleBtn,
                  isGrocery && { backgroundColor: '#059669' },
                  isParcel && { backgroundColor: '#2563EB' },
                ]}
              >
                <Text style={styles.settleBtnIcon}>{isParcel ? '📦' : (isGrocery ? '🛒' : '💰')}</Text>
                <Text style={styles.settleBtnText}>
                  {isParcel
                    ? `結單／領齊了！一鍵連動記帳 ${summary.hasAmount ? `($${summary.totalAmount})` : ''}`
                    : (isGrocery
                        ? `結帳買齊了！一鍵連動記帳 ${summary.hasAmount ? `($${summary.totalAmount})` : ''}`
                        : `買好了！一鍵連動記帳 ${summary.hasAmount ? `($${summary.totalAmount})` : ''}`)}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>

      {/* 指派與換人彈窗選單 */}
      <Modal
        visible={pickingItem !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPickingItem(null)}
      >
        <TouchableOpacity
          style={styles.pickerBackdrop}
          activeOpacity={1}
          onPress={() => setPickingItem(null)}
        >
          <View style={[styles.pickerDialog, isDark && { backgroundColor: '#1F2937', borderColor: '#374151' }]}>
            <Text style={[styles.pickerTitle, isDark && { color: '#F9FAFB' }]} numberOfLines={1}>
              指派負責人 · {pickingItem?.itemName}
            </Text>
            <Text style={[styles.pickerSubtitle, isDark && { color: '#9CA3AF' }]}>
              選擇此項目的認領成員（完成後獎勵將計入該成員）：
            </Text>

            <View style={styles.pickerMemberList}>
              {members.map((member: any) => {
                const isCurrent = pickingItem?.memberName === member.display_name;
                return (
                  <TouchableOpacity
                    key={member.id}
                    onPress={() => {
                      if (pickingItem) {
                        onUpdateItemMember?.(pickingItem.lineIndex, member.display_name);
                      }
                      setPickingItem(null);
                    }}
                    style={[
                      styles.pickerMemberItem,
                      isCurrent && styles.pickerMemberItemActive,
                      isDark && { backgroundColor: isCurrent ? '#1E3A8A' : '#374151' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.pickerMemberText,
                        isCurrent && styles.pickerMemberTextActive,
                        isDark && { color: isCurrent ? '#93C5FD' : '#D1D5DB' },
                      ]}
                    >
                      👤 {member.display_name} {isCurrent ? '（目前負責人）' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                onPress={() => {
                  if (pickingItem) {
                    onUpdateItemMember?.(pickingItem.lineIndex, '');
                  }
                  setPickingItem(null);
                }}
                style={[styles.pickerMemberItem, styles.pickerUnclaimItem]}
              >
                <Text style={styles.pickerUnclaimText}>❌ 取消認領（退回未分配大家搶）</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => setPickingItem(null)}
              style={[styles.pickerCloseBtn, isDark && { backgroundColor: '#374151' }]}
            >
              <Text style={[styles.pickerCloseBtnText, isDark && { color: '#9CA3AF' }]}>關閉</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 0,
  },
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 12 : 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  storeIcon: {
    fontSize: 26,
  },
  storeTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
  },
  storeSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  quickAddBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  quickAddBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
  },
  closeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
  summaryBoard: {
    flexDirection: 'row',
    margin: 16,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  summaryCol: {
    flex: 1,
    alignItems: 'center',
  },
  divider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 8,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
    fontWeight: '600',
  },
  summaryBigNumber: {
    fontSize: 24,
    fontWeight: '900',
  },
  listScroll: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 22,
  },
  orderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  orderCardChecked: {
    opacity: 0.5,
    backgroundColor: '#F3F4F6',
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  checkboxChecked: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  checkIcon: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 16,
  },
  cardContent: {
    flex: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  memberBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  memberBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2563EB',
  },
  itemNameText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    flex: 1,
  },
  priceTag: {
    fontSize: 17,
    fontWeight: '800',
    color: '#059669',
  },
  specsRow: {
    marginTop: 6,
  },
  specsText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#D97706',
  },
  textStrike: {
    textDecorationLine: 'line-through',
  },
  footer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  settleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  settleBtnIcon: {
    fontSize: 20,
  },
  settleBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  claimBtn: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderStyle: 'dashed',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  claimBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#D97706',
  },
  choreFooterContent: {
    gap: 12,
  },
  choreEarnedList: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  choreEarnedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  choreEarnedName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },
  choreEarnedAmount: {
    fontSize: 14,
    fontWeight: '900',
    color: '#D97706',
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  pickerDialog: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 4,
  },
  pickerSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 16,
    lineHeight: 18,
  },
  pickerMemberList: {
    gap: 8,
    marginBottom: 16,
  },
  pickerMemberItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pickerMemberItemActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  pickerMemberText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#374151',
  },
  pickerMemberTextActive: {
    color: '#2563EB',
    fontWeight: '800',
  },
  pickerUnclaimItem: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  pickerUnclaimText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E11D48',
    textAlign: 'center',
  },
  pickerCloseBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  pickerCloseBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
});
