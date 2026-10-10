import React, { useState, useMemo } from 'react';
import {
  View,
  Text as RNText,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Platform,
  TextProps,
} from 'react-native';
import { Transaction } from '../types/database';
import { useLedger } from '../context/LedgerContext';
import { parseMemoNote } from '../lib/memo';
import { HorizontalScrollView } from './HorizontalScrollView';

const Text: React.FC<TextProps> = ({ allowFontScaling = false, maxFontSizeMultiplier = 1.08, ...rest }) => (
  <RNText
    allowFontScaling={allowFontScaling}
    maxFontSizeMultiplier={Math.min(maxFontSizeMultiplier ?? 1.08, 1.08)}
    {...rest}
  />
);

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

type TodoTab = 'all' | 'today' | 'upcoming' | 'undated' | 'completed';

interface MemoTodoModalProps {
  visible: boolean;
  onClose: () => void;
  onEditMemo: (tx: Transaction) => void;
  onAddMemo: () => void;
}

export const MemoTodoModal: React.FC<MemoTodoModalProps> = ({
  visible,
  onClose,
  onEditMemo,
  onAddMemo,
}) => {
  const { transactions, getMemberById, toggleMemoSettled } = useLedger();
  const [activeTab, setActiveTab] = useState<TodoTab>('all');

  const todayYmd = useMemo(() => new Date().toISOString().split('T')[0], []);

  // 篩選生活記事
  const allMemos = useMemo(() => {
    return transactions.filter(t => t.type === 'memo');
  }, [transactions]);

  // 今日或已逾期待辦 (未完成)
  const todayAndOverdueMemos = useMemo(() => {
    return allMemos
      .filter(t => !t.is_settled && !!t.reminder_date && t.reminder_date <= todayYmd)
      .sort((a, b) => (a.reminder_date || '').localeCompare(b.reminder_date || ''));
  }, [allMemos, todayYmd]);

  // 未來到期預告 (未完成)
  const upcomingMemos = useMemo(() => {
    return allMemos
      .filter(t => !t.is_settled && !!t.reminder_date && t.reminder_date > todayYmd)
      .sort((a, b) => (a.reminder_date || '').localeCompare(b.reminder_date || ''));
  }, [allMemos, todayYmd]);

  // 日常備忘 (未設提醒日期且未完成)
  const undatedMemos = useMemo(() => {
    return allMemos.filter(t => !t.is_settled && !t.reminder_date);
  }, [allMemos]);

  // 已完成辦妥記事
  const completedMemos = useMemo(() => {
    return allMemos.filter(t => !!t.is_settled);
  }, [allMemos]);

  // 全部未完成待辦
  const activeMemos = useMemo(() => {
    return [...todayAndOverdueMemos, ...upcomingMemos, ...undatedMemos];
  }, [todayAndOverdueMemos, upcomingMemos, undatedMemos]);

  // 當前分頁顯示之項目清單
  const displayList = useMemo(() => {
    switch (activeTab) {
      case 'today':
        return todayAndOverdueMemos;
      case 'upcoming':
        return upcomingMemos;
      case 'undated':
        return undatedMemos;
      case 'completed':
        return completedMemos;
      case 'all':
      default:
        return activeMemos;
    }
  }, [activeTab, todayAndOverdueMemos, upcomingMemos, undatedMemos, completedMemos, activeMemos]);

  // 計算距今天數狀態
  const getDueStatus = (reminderDateStr?: string) => {
    if (!reminderDateStr) return null;
    if (reminderDateStr === todayYmd) {
      return { label: '今天到期', type: 'today', color: '#EA580C', bg: '#FFF7ED', border: '#FDBA74' };
    }
    const rDate = new Date(reminderDateStr + 'T00:00:00');
    const tDate = new Date(todayYmd + 'T00:00:00');
    const diffDays = Math.round((rDate.getTime() - tDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      return {
        label: `逾期 ${Math.abs(diffDays)} 天 (${reminderDateStr.slice(5)})`,
        type: 'overdue',
        color: '#DC2626',
        bg: '#FEF2F2',
        border: '#FECACA',
      };
    }
    return {
      label: `還有 ${diffDays} 天 (${reminderDateStr.slice(5)})`,
      type: 'upcoming',
      color: '#2563EB',
      bg: '#EFF6FF',
      border: '#BFDBFE',
    };
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* 頂部標題列 */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title} maxFontSizeMultiplier={1.15}>📋 生活備忘與待辦總覽</Text>
              <Text style={styles.subtitle} maxFontSizeMultiplier={1.08}>
                全家日常採買、生活雜記與未來排程提醒
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.closeText} maxFontSizeMultiplier={1.15}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 統計摘要指標列 */}
          <View style={styles.metricsRow}>
            <TouchableOpacity
              style={[styles.metricCard, activeTab === 'today' && styles.metricCardActive]}
              onPress={() => setActiveTab('today')}
              activeOpacity={0.7}
            >
              <Text style={styles.metricLabel} maxFontSizeMultiplier={1.08}>今日/逾期 🚨</Text>
              <Text style={[styles.metricValue, { color: '#DC2626' }]} maxFontSizeMultiplier={1.15}>
                {todayAndOverdueMemos.length}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.metricCard, activeTab === 'upcoming' && styles.metricCardActive]}
              onPress={() => setActiveTab('upcoming')}
              activeOpacity={0.7}
            >
              <Text style={styles.metricLabel} maxFontSizeMultiplier={1.08}>未到期預告 🗓️</Text>
              <Text style={[styles.metricValue, { color: '#2563EB' }]} maxFontSizeMultiplier={1.15}>
                {upcomingMemos.length}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.metricCard, activeTab === 'completed' && styles.metricCardActive]}
              onPress={() => setActiveTab('completed')}
              activeOpacity={0.7}
            >
              <Text style={styles.metricLabel} maxFontSizeMultiplier={1.08}>已辦妥 ✓</Text>
              <Text style={[styles.metricValue, { color: '#059669' }]} maxFontSizeMultiplier={1.15}>
                {completedMemos.length}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 分頁標籤切換列 */}
          <View style={styles.tabScrollWrapper}>
            <HorizontalScrollView showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScrollContent}>
              {[
                { key: 'all', label: `全部待辦 (${activeMemos.length})` },
                { key: 'today', label: `今日與逾期 (${todayAndOverdueMemos.length})` },
                { key: 'upcoming', label: `未到期預告 (${upcomingMemos.length})` },
                { key: 'undated', label: `日常雜記 (${undatedMemos.length})` },
                { key: 'completed', label: `已辦妥 (${completedMemos.length})` },
              ].map(t => {
                const isSelected = activeTab === t.key;
                return (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.tabChip, isSelected && styles.tabChipActive]}
                    onPress={() => setActiveTab(t.key as TodoTab)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[styles.tabChipText, isSelected && styles.tabChipTextActive]}
                      maxFontSizeMultiplier={1.08}
                    >
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </HorizontalScrollView>
          </View>

          {/* 待辦事項列表 */}
          <ScrollView
            style={styles.listArea}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {displayList.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>
                  {activeTab === 'completed' ? '📝' : activeTab === 'upcoming' ? '🗓️' : '🎉'}
                </Text>
                <Text style={styles.emptyTitle} maxFontSizeMultiplier={1.12}>
                  {activeTab === 'completed'
                    ? '尚無已完成的記事'
                    : activeTab === 'upcoming'
                    ? '目前沒有未到期的排程提醒'
                    : activeTab === 'today'
                    ? '今天沒有待辦事項，輕鬆一下！'
                    : '目前沒有待辦事項'}
                </Text>
                <Text style={styles.emptyDesc} maxFontSizeMultiplier={1.08}>
                  {activeTab === 'completed'
                    ? '待辦完成後點擊勾勾，即會自動歸檔於此處'
                    : '隨時點選下方「新增生活記事」記錄家庭大小事'}
                </Text>
              </View>
            ) : (
              displayList.map((item) => {
                const isCompleted = !!item.is_settled;
                const memoData = parseMemoNote(item.note);
                const dueStatus = getDueStatus(item.reminder_date);
                const payer = getMemberById(item.paid_by) || item.payer_profile;
                const completer = item.completed_by ? getMemberById(item.completed_by) : undefined;
                const date = new Date(item.transacted_at);
                const dateFormatted = `${date.getMonth() + 1}/${date.getDate()}`;

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.itemCard, isCompleted && styles.itemCardCompleted]}
                    activeOpacity={0.7}
                    onPress={() => {
                      onClose();
                      onEditMemo(item);
                    }}
                  >
                    <View style={styles.itemHeaderRow}>
                      <View style={styles.itemHeaderLeft}>
                        {/* 一鍵打勾完成按鈕 */}
                        <TouchableOpacity
                          style={[styles.checkbox, isCompleted && styles.checkboxChecked]}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            toggleMemoSettled?.(item.id);
                          }}
                          activeOpacity={0.6}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={[styles.checkboxIcon, isCompleted && styles.checkboxIconChecked]}>
                            {isCompleted ? '✓' : ''}
                          </Text>
                        </TouchableOpacity>

                        <View style={[styles.itemIconBadge, isCompleted && styles.itemIconBadgeCompleted]}>
                          <Text style={styles.itemIconText}>{memoData.icon}</Text>
                        </View>
                        <Text
                          style={[styles.itemTitle, isCompleted && styles.itemTitleCompleted]}
                          numberOfLines={1}
                          maxFontSizeMultiplier={1.08}
                        >
                          {memoData.title}
                        </Text>
                      </View>

                      {/* 提醒狀態徽章 */}
                      {isCompleted ? (
                        <View style={styles.completedBadge}>
                          <Text style={styles.completedBadgeText} maxFontSizeMultiplier={1.08}>
                            ✓ {completer?.display_name ? `${completer.display_name} 辦妥` : '已辦妥'}
                          </Text>
                        </View>
                      ) : dueStatus ? (
                        <View style={[styles.dueBadge, { backgroundColor: dueStatus.bg, borderColor: dueStatus.border }]}>
                          <Text style={[styles.dueBadgeText, { color: dueStatus.color }]} maxFontSizeMultiplier={1.08}>
                            {dueStatus.label}
                          </Text>
                        </View>
                      ) : (
                        <Text style={styles.itemDateText} maxFontSizeMultiplier={1.08}>{dateFormatted}</Text>
                      )}
                    </View>

                    {/* 正文文字 */}
                    <Text
                      style={[styles.itemContent, isCompleted && styles.itemContentCompleted]}
                      maxFontSizeMultiplier={1.1}
                    >
                      {memoData.cleanContent}
                    </Text>

                    {/* 底部資訊 */}
                    <View style={styles.itemFooterRow}>
                      <Text style={[styles.itemAuthor, isCompleted && styles.itemAuthorCompleted]} maxFontSizeMultiplier={1.08}>
                        {payer?.avatar_url || '👤'} {payer?.display_name || '成員'} 記錄 · {dateFormatted}
                        {isCompleted && (
                          completer
                            ? ` · 由 ${completer.avatar_url || '👤'} ${completer.display_name} 辦妥 ✓`
                            : ' · 已辦妥 ✓'
                        )}
                      </Text>
                      <Text style={[styles.itemHint, isCompleted && styles.itemHintCompleted]} maxFontSizeMultiplier={1.08}>
                        查看 / 編輯 ›
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          {/* 底部按鈕區 */}
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={styles.addMemoBtn}
              onPress={() => {
                onClose();
                onAddMemo();
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.addMemoBtnText} maxFontSizeMultiplier={1.12}>
                ✏️ 新增生活記事 / 待辦
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.closeFooterBtn}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={styles.closeFooterBtnText} maxFontSizeMultiplier={1.12}>
                關閉
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: Math.min(SCREEN_HEIGHT * 0.88, 760),
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1E293B',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#64748B',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  metricCardActive: {
    borderColor: '#D97706',
    backgroundColor: '#FFFBEB',
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 17,
    fontWeight: '800',
  },
  tabScrollWrapper: {
    marginBottom: 10,
  },
  tabScrollContent: {
    gap: 6,
    paddingVertical: 2,
  },
  tabChip: {
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tabChipActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  tabChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  tabChipTextActive: {
    color: '#92400E',
    fontWeight: '700',
  },
  listArea: {
    maxHeight: SCREEN_HEIGHT * 0.48,
    marginBottom: 12,
  },
  listContent: {
    paddingVertical: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 45,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  emptyDesc: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
  },
  itemCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  itemCardCompleted: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderLeftColor: '#10B981',
    opacity: 0.88,
  },
  itemHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  itemHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.8,
    borderColor: '#D97706',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  checkboxIcon: {
    fontSize: 11,
    color: 'transparent',
    fontWeight: '800',
  },
  checkboxIconChecked: {
    color: '#FFFFFF',
  },
  itemIconBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemIconBadgeCompleted: {
    backgroundColor: '#E2E8F0',
  },
  itemIconText: {
    fontSize: 12,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
    flex: 1,
  },
  itemTitleCompleted: {
    color: '#64748B',
    textDecorationLine: 'line-through',
  },
  dueBadge: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  dueBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  completedBadge: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  completedBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#059669',
  },
  itemDateText: {
    fontSize: 11.5,
    color: '#B45309',
    fontWeight: '600',
  },
  itemContent: {
    fontSize: 13.5,
    color: '#1E293B',
    lineHeight: 19,
    marginBottom: 6,
  },
  itemContentCompleted: {
    color: '#94A3B8',
    textDecorationLine: 'line-through',
  },
  itemFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#FEF3C7',
  },
  itemAuthor: {
    fontSize: 10.5,
    color: '#78350F',
    fontWeight: '500',
  },
  itemAuthorCompleted: {
    color: '#94A3B8',
  },
  itemHint: {
    fontSize: 10.5,
    color: '#D97706',
    fontWeight: '600',
  },
  itemHintCompleted: {
    color: '#64748B',
  },
  footerRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 6,
  },
  addMemoBtn: {
    flex: 1,
    backgroundColor: '#D97706',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMemoBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeFooterBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeFooterBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
});

