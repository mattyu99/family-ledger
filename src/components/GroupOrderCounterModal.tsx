import React from 'react';
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
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { GroupOrderSummary, GroupOrderItem } from '../lib/groupOrder';

interface GroupOrderCounterModalProps {
  visible: boolean;
  summary: GroupOrderSummary;
  onClose: () => void;
  onToggleItem: (itemIndex: number) => void;
  onSettleOrder: (totalAmount: number, storeName: string) => void;
  onAddQuickItem?: () => void;
}

export const GroupOrderCounterModal: React.FC<GroupOrderCounterModalProps> = ({
  visible,
  summary,
  onClose,
  onToggleItem,
  onSettleOrder,
  onAddQuickItem,
}) => {
  const { isDark } = useTheme();
  const isGrocery = summary.mode === 'grocery';
  const isParcel = summary.mode === 'parcel';
  const isShoppingLike = isGrocery || isParcel;
  const progressPercent = summary.totalCount > 0
    ? Math.round((summary.completedCount / summary.totalCount) * 100)
    : 0;

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
                <Text style={styles.storeIcon}>{isParcel ? '📦' : (isGrocery ? '🛒' : '🧋')}</Text>
                <Text style={[styles.storeTitle, isDark && { color: '#F9FAFB' }]} numberOfLines={1}>
                  {summary.storeName &&
                  summary.storeName !== '點餐店家' &&
                  summary.storeName !== '採買賣場' &&
                  summary.storeName !== '網購包裹'
                    ? summary.storeName
                    : (isParcel ? '網購湊單／包裹' : (isGrocery ? '賣場採買' : '點餐開團'))}
                </Text>
              </View>
              <Text style={[styles.storeSubtitle, isDark && { color: '#9CA3AF' }]}>
                {isParcel
                  ? '網購湊單與包裹代領看板 · 買妥或領完可直接點擊劃線'
                  : (isGrocery
                      ? '賣場推車採買看板 · 放入推車可直接劃線核對'
                      : '櫃檯大字點餐看板 · 點完可直接點擊劃線核對')}
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
                {isParcel ? '處理進度' : (isGrocery ? '採買進度' : '累計數量')}
              </Text>
              <Text style={[styles.summaryBigNumber, { color: '#F59E0B' }]}>
                {summary.completedCount}/{summary.totalCount}{' '}
                <Text style={{ fontSize: 16 }}>
                  {isParcel ? '件' : (isGrocery ? '項' : '份')}
                </Text>
                {isShoppingLike && <Text style={{ fontSize: 13, color: '#10B981', fontWeight: '700' }}> ({progressPercent}%)</Text>}
              </Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>預估總金額</Text>
              <Text style={[styles.summaryBigNumber, { color: '#10B981' }]}>
                {summary.hasAmount
                  ? `$${summary.totalAmount}`
                  : (isParcel ? '免付/依結帳' : (isGrocery ? '依發票結算' : '隨喜'))}
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
                        {!!item.memberName && (
                          <View
                            style={[
                              styles.memberBadge,
                              isGrocery && { backgroundColor: '#ECFDF5' },
                              isParcel && { backgroundColor: '#EFF6FF' },
                            ]}
                          >
                            <Text
                              style={[
                                styles.memberBadgeText,
                                isGrocery && { color: '#059669' },
                                isParcel && { color: '#2563EB' },
                              ]}
                            >
                              {item.memberName}{isParcel ? ' 登記' : (isGrocery ? ' 想買' : '')}
                            </Text>
                          </View>
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
          </View>
        </View>
      </SafeAreaView>
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
});
