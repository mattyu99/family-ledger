import React, { useState, useMemo, useRef } from 'react';
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
  Linking,
} from 'react-native';
import { Transaction } from '../types/database';
import { useLedger } from '../context/LedgerContext';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { parseMemoNote, getLocalDateYmd, decodeMemoMerchantTag, parseMemoChecklist, formatMemoCompletedDate, formatMemoCompletedTime } from '../lib/memo';
import { formatMemoReminderBadge } from '../lib/lunar';
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
type TodoScope = 'all' | 'mine';

interface MemoTodoModalProps {
  visible: boolean;
  onClose: () => void;
  onEditMemo: (tx: Transaction) => void;
  onAddMemo: () => void;
  onCompleteMemo?: (tx: Transaction) => void;
}

export const MemoTodoModal: React.FC<MemoTodoModalProps> = ({
  visible,
  onClose,
  onEditMemo,
  onAddMemo,
  onCompleteMemo,
}) => {
  const { isDark, colors } = useTheme();
  const styles = useMemo(() => getStyles(isDark, colors), [isDark, colors]);
  const { transactions, getMemberById, toggleMemoSettled, toggleMemoChecklistItem, currentUser } = useLedger();
  const [activeTab, setActiveTab] = useState<TodoTab>('all');
  const [scopeFilter, setScopeFilter] = useState<TodoScope>('all');
  const scrollRef = useRef<ScrollView>(null);

  // 切換分頁時捲動位置即時歸零置頂
  const handleTabChange = (newTab: TodoTab) => {
    setActiveTab(newTab);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  // 切換視角時捲動位置即時歸零置頂
  const handleScopeChange = (newScope: TodoScope) => {
    setScopeFilter(newScope);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  // 顯式關閉彈窗時歸零分頁、視角與捲動位置
  const handleExplicitClose = () => {
    setActiveTab('all');
    setScopeFilter('all');
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    onClose();
  };

  // 每次開啟彈窗或交易更新時，精準取得本地最新日期 (避免空依賴緩存或 UTC 時區差)
  const todayYmd = useMemo(() => getLocalDateYmd(), [visible, transactions]);

  // 依當前視角篩選生活記事母體 (連動指標看板與各分類統計數字)
  const allMemos = useMemo(() => {
    return transactions.filter(t => {
      if (t.type !== 'memo') return false;
      if (scopeFilter === 'mine') {
        const isPersonal = t.reminder_target === 'personal';
        if (!isPersonal) return false;
        if (t.paid_by) {
          return t.paid_by === currentUser?.id;
        }
        return !!t.creator_id && t.creator_id === currentUser?.id;
      }
      return true;
    });
  }, [transactions, scopeFilter, currentUser?.id]);

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

  // 已完成辦妥記事 (依辦妥時間 completed_at 降序排序，最新辦妥排在最上方)
  const completedMemos = useMemo(() => {
    const getCompletionTimestamp = (item: Transaction): number => {
      const raw = item.completed_at || decodeMemoMerchantTag(item.merchant).completedAt || item.updated_at || item.transacted_at;
      if (!raw) return 0;
      const t = new Date(raw).getTime();
      return isNaN(t) ? 0 : t;
    };

    return allMemos
      .filter(t => !!t.is_settled)
      .sort((a, b) => {
        const timeA = getCompletionTimestamp(a);
        const timeB = getCompletionTimestamp(b);
        if (timeB !== timeA) return timeB - timeA;
        return (b.transacted_at || '').localeCompare(a.transacted_at || '');
      });
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
  const getDueStatus = (item: Transaction) => {
    const decoded = decodeMemoMerchantTag(item.merchant);
    const reminderDateStr = item.reminder_date || decoded.reminderDate;
    if (!reminderDateStr) return null;
    const cal = item.reminder_calendar || decoded.reminderCalendar;
    const rep = item.reminder_repeat || decoded.reminderRepeat;
    const badge = formatMemoReminderBadge(reminderDateStr, cal, rep);
    const detailSuffix = badge ? ` · ${badge.fullText}` : ` (${reminderDateStr.slice(5)})`;

    if (reminderDateStr === todayYmd) {
      return {
        label: `今天到期${badge?.isLunar || (rep && rep !== 'once') ? detailSuffix : ''}`,
        type: 'today',
        color: '#EA580C',
        bg: '#FFF7ED',
        border: '#FDBA74',
      };
    }
    const rDate = new Date(reminderDateStr + 'T00:00:00');
    const tDate = new Date(todayYmd + 'T00:00:00');
    const diffDays = Math.round((rDate.getTime() - tDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      return {
        label: `逾期 ${Math.abs(diffDays)} 天${detailSuffix}`,
        type: 'overdue',
        color: '#DC2626',
        bg: '#FEF2F2',
        border: '#FECACA',
      };
    }
    return {
      label: `還有 ${diffDays} 天${detailSuffix}`,
      type: 'upcoming',
      color: '#2563EB',
      bg: '#EFF6FF',
      border: '#BFDBFE',
    };
  };

  // 正文超連結自動識別與點擊開啟支援
  const renderContentWithLinks = (content: string, isCompleted: boolean) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = content.split(urlRegex);
    if (parts.length === 1) {
      return content;
    }
    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        return (
          <Text
            key={index}
            style={[styles.linkText, isCompleted && styles.linkTextCompleted]}
            onPress={(e: any) => {
              e?.stopPropagation?.();
              Linking.openURL(part).catch(() => {});
            }}
          >
            {part}
          </Text>
        );
      }
      return part;
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleExplicitClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* 頂部標題列 */}
          <View style={styles.header}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.title} maxFontSizeMultiplier={1.15}>📋 生活備忘與待辦總覽</Text>
            </View>
            <TouchableOpacity onPress={handleExplicitClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.closeText} maxFontSizeMultiplier={1.15}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 指標區頂部：副標題與視角切換開關 (配置 1) */}
          <View style={styles.scopeBarRow}>
            <Text style={styles.subtitle} maxFontSizeMultiplier={1.08} numberOfLines={1}>
              日常採買、生活雜記與排程提醒
            </Text>
            <View style={styles.scopeSwitchContainer}>
              <TouchableOpacity
                style={[styles.scopeTab, scopeFilter === 'all' && styles.scopeTabActive]}
                onPress={() => handleScopeChange('all')}
                activeOpacity={0.7}
              >
                <Text style={[styles.scopeTabText, scopeFilter === 'all' && styles.scopeTabTextActive]}>全部</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.scopeTab, scopeFilter === 'mine' && styles.scopeTabActive]}
                onPress={() => handleScopeChange('mine')}
                activeOpacity={0.7}
              >
                <Text style={[styles.scopeTabText, scopeFilter === 'mine' && styles.scopeTabTextActive]}>我的</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 統計摘要指標列 */}
          <View style={styles.metricsRow}>
            <TouchableOpacity
              style={[styles.metricCard, activeTab === 'today' && styles.metricCardActive]}
              onPress={() => handleTabChange('today')}
              activeOpacity={0.7}
            >
              <Text style={styles.metricLabel} maxFontSizeMultiplier={1.08}>今日/逾期 🚨</Text>
              <Text style={[styles.metricValue, { color: '#DC2626' }]} maxFontSizeMultiplier={1.15}>
                {todayAndOverdueMemos.length}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.metricCard, activeTab === 'upcoming' && styles.metricCardActive]}
              onPress={() => handleTabChange('upcoming')}
              activeOpacity={0.7}
            >
              <Text style={styles.metricLabel} maxFontSizeMultiplier={1.08}>未到期預告 🗓️</Text>
              <Text style={[styles.metricValue, { color: '#2563EB' }]} maxFontSizeMultiplier={1.15}>
                {upcomingMemos.length}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.metricCard, activeTab === 'completed' && styles.metricCardActive]}
              onPress={() => handleTabChange('completed')}
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
                    onPress={() => handleTabChange(t.key as TodoTab)}
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

          {/* 待辦事項列表（切換分頁與視角自動歸零置頂） */}
          <ScrollView
            ref={scrollRef}
            key={`${activeTab}_${scopeFilter}`}
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
                const checklistData = parseMemoChecklist(memoData.cleanContent);
                const checklistProgressPercent = checklistData.totalCount > 0
                  ? (checklistData.completedCount / checklistData.totalCount) * 100
                  : 0;
                const dueStatus = getDueStatus(item);
                const payer = getMemberById(item.paid_by) || item.payer_profile;
                const completer = item.completed_by ? getMemberById(item.completed_by) : undefined;
                const date = new Date(item.transacted_at);
                const dateFormatted = `${date.getMonth() + 1}/${date.getDate()}`;

                const linkedExpense = item.linked_transaction_id
                  ? transactions.find(t => t.id === item.linked_transaction_id && t.type !== 'memo')
                  : undefined;

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.itemCard, isCompleted && styles.itemCardCompleted]}
                    activeOpacity={0.7}
                    onPress={() => {
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
                            if (isCompleted) {
                              toggleMemoSettled?.(item.id);
                            } else if (onCompleteMemo) {
                              onCompleteMemo(item);
                            } else {
                              toggleMemoSettled?.(item.id);
                            }
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

                      {/* 右側：已辦妥徽章 或 提醒對象膠囊 (全家 / 個人·某某) */}
                      {isCompleted ? (
                        <View style={styles.completedBadge}>
                          <Text style={styles.completedBadgeText} maxFontSizeMultiplier={1.08}>
                            ✓ {completer?.display_name ? `${completer.display_name} 辦妥` : '已辦妥'}
                          </Text>
                        </View>
                      ) : (
                        <View style={[styles.scopeBadge, item.reminder_target === 'personal' ? styles.scopeBadgePersonal : styles.scopeBadgeFamily]}>
                          <Text style={[styles.scopeBadgeText, item.reminder_target === 'personal' ? styles.scopeBadgeTextPersonal : styles.scopeBadgeTextFamily]} maxFontSizeMultiplier={1.08}>
                            {item.reminder_target === 'personal' ? `👤 個人${payer?.display_name ? `·${payer.display_name}` : ''}` : '🌐 全家'}
                          </Text>
                        </View>
                      )}
                    </View>

                    {checklistData.isChecklist ? (
                      <View style={{ marginBottom: 8 }}>
                        {/* 檢核進度條 */}
                        <View style={styles.checklistProgressRow}>
                          <View style={styles.checklistProgressBarBg}>
                            <View
                              style={[
                                styles.checklistProgressBarFill,
                                {
                                  width: `${checklistProgressPercent}%`,
                                  backgroundColor: checklistProgressPercent === 100 ? '#10B981' : '#3B82F6',
                                },
                              ]}
                            />
                          </View>
                          <Text
                            style={[
                              styles.checklistProgressText,
                              { color: checklistProgressPercent === 100 ? '#059669' : '#2563EB' },
                            ]}
                            allowFontScaling={false}
                            maxFontSizeMultiplier={1.08}
                          >
                            {checklistData.completedCount}/{checklistData.totalCount} ({Math.round(checklistProgressPercent)}%)
                          </Text>
                        </View>

                        {/* 前綴說明文字 (若有) */}
                        {!!checklistData.prefixText && (
                          <Text
                            style={[styles.itemContent, isCompleted && styles.itemContentCompleted, { marginBottom: 6 }]}
                            maxFontSizeMultiplier={1.1}
                          >
                            {renderContentWithLinks(checklistData.prefixText, isCompleted)}
                          </Text>
                        )}

                        {/* 互動式清單項目列表 */}
                        <View style={styles.checklistContainer}>
                          {checklistData.items.map((checkItem) => {
                            const itemDone = checkItem.completed;
                            return (
                              <TouchableOpacity
                                key={checkItem.index}
                                style={[styles.checklistItemRow, itemDone && styles.checklistItemRowCompleted]}
                                activeOpacity={0.7}
                                onPress={(e) => {
                                  e.stopPropagation?.();
                                  toggleMemoChecklistItem(item.id, checkItem.index);
                                }}
                              >
                                <View style={[styles.checklistItemBox, itemDone && styles.checklistItemBoxChecked]}>
                                  {itemDone && <Text style={styles.checklistItemCheckIcon}>✓</Text>}
                                </View>
                                <Text
                                  style={[styles.checklistItemText, itemDone && styles.checklistItemTextCompleted]}
                                  maxFontSizeMultiplier={1.1}
                                >
                                  {checkItem.text}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>

                        {/* 後綴備註文字 (若有) */}
                        {!!checklistData.suffixText && (
                          <Text
                            style={[styles.itemContent, isCompleted && styles.itemContentCompleted, { marginTop: 6 }]}
                            maxFontSizeMultiplier={1.1}
                          >
                            {renderContentWithLinks(checklistData.suffixText, isCompleted)}
                          </Text>
                        )}

                        {/* 全部打勾完成時的引導提示 */}
                        {checklistProgressPercent === 100 && !isCompleted && (
                          <View style={styles.checklistAllDoneHint}>
                            <Text style={styles.checklistAllDoneHintText} maxFontSizeMultiplier={1.08}>
                              🎉 項目已全數核對！點擊左側「✓」即可將整單歸檔為已辦妥
                            </Text>
                          </View>
                        )}
                      </View>
                    ) : (
                      <Text
                        style={[styles.itemContent, isCompleted && styles.itemContentCompleted]}
                        maxFontSizeMultiplier={1.1}
                      >
                        {renderContentWithLinks(memoData.cleanContent, isCompleted)}
                      </Text>
                    )}

                    {/* 提醒時程獨立展示列 (未完成時享有整行寬度，告別擠壓遮蓋) */}
                    {!isCompleted && dueStatus && (
                      <View style={styles.dueRowContainer}>
                        <View style={[styles.dueBadgeStandalone, { backgroundColor: dueStatus.bg, borderColor: dueStatus.border }]}>
                          <Text style={[styles.dueBadgeTextStandalone, { color: dueStatus.color }]} maxFontSizeMultiplier={1.08}>
                            {dueStatus.label}
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* 辦妥回報說明 */}
                    {isCompleted && !!item.completion_note && (
                      <View style={styles.itemReportBubble}>
                        <Text style={styles.itemReportText} maxFontSizeMultiplier={1.08}>
                          💬 {completer?.display_name ? `${completer.display_name} 回報` : '辦妥回報'}{formatMemoCompletedTime(item.completed_at, item.updated_at) ? ` (${formatMemoCompletedTime(item.completed_at, item.updated_at)})` : ''}：{item.completion_note}
                        </Text>
                      </View>
                    )}

                    {/* 連動支出卡片 */}
                    {isCompleted && !!linkedExpense && (
                      <TouchableOpacity
                        style={styles.itemLinkedExpenseBadge}
                        activeOpacity={0.7}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          onEditMemo(linkedExpense);
                        }}
                      >
                        <Text style={styles.itemLinkedExpenseBadgeText} maxFontSizeMultiplier={1.08}>
                          🔗 連動支出：NT$ {Number(linkedExpense.amount).toLocaleString()} ({linkedExpense.note || '支出'}) ›
                        </Text>
                      </TouchableOpacity>
                    )}

                    {/* 底部資訊 */}
                    <View style={styles.itemFooterRow}>
                      <Text style={[styles.itemAuthor, isCompleted && styles.itemAuthorCompleted]} maxFontSizeMultiplier={1.08}>
                        {payer?.avatar_url || '👤'} {payer?.display_name || '成員'} 記錄 · {dateFormatted}
                        {isCompleted && (
                          completer
                            ? ` · 由 ${completer.avatar_url || '👤'} ${completer.display_name}${formatMemoCompletedDate(item.completed_at, item.updated_at) ? ` 於 ${formatMemoCompletedDate(item.completed_at, item.updated_at)}` : ''} 辦妥 ✓`
                            : (formatMemoCompletedDate(item.completed_at, item.updated_at) ? ` · 於 ${formatMemoCompletedDate(item.completed_at, item.updated_at)} 辦妥 ✓` : ' · 已辦妥 ✓')
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
              onPress={handleExplicitClose}
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

const getStyles = (isDark: boolean, colors: ThemeColors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.75)' : 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.background.modal,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: Math.min(SCREEN_HEIGHT * 0.94, 880),
    maxHeight: Math.min(SCREEN_HEIGHT * 0.94, 880),
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    paddingHorizontal: 16,
    borderTopWidth: isDark ? 1 : 0,
    borderTopColor: isDark ? colors.border.default : 'transparent',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: 12,
    color: colors.text.muted,
    flex: 1,
    marginRight: 8,
  },
  scopeBarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: -2,
  },
  scopeSwitchContainer: {
    flexDirection: 'row',
    backgroundColor: isDark ? colors.background.cardSubtle : '#F1F5F9',
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E2E8F0',
  },
  scopeTab: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  scopeTabActive: {
    backgroundColor: isDark ? '#D97706' : '#FFFFFF',
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.15,
          shadowRadius: 2,
        }
      : {
          elevation: 1,
        }),
  },
  scopeTabText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.text.muted,
  },
  scopeTabTextActive: {
    color: isDark ? '#FFFFFF' : '#D97706',
    fontWeight: '700',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: isDark ? colors.background.cardSubtle : '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.muted,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E2E8F0',
    alignItems: 'center',
  },
  metricCardActive: {
    borderColor: '#D97706',
    backgroundColor: isDark ? 'rgba(217, 119, 6, 0.2)' : '#FFFBEB',
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.muted,
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
    backgroundColor: isDark ? colors.background.cardSubtle : '#F1F5F9',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E2E8F0',
  },
  tabChipActive: {
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.25)' : '#FEF3C7',
    borderColor: '#F59E0B',
  },
  tabChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  tabChipTextActive: {
    color: isDark ? '#FBBF24' : '#92400E',
    fontWeight: '700',
  },
  listArea: {
    flex: 1,
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
    color: colors.text.secondary,
    marginBottom: 4,
  },
  emptyDesc: {
    fontSize: 12,
    color: colors.text.muted,
    textAlign: 'center',
  },
  itemCard: {
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : '#FFFBEB',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(245, 158, 11, 0.3)' : '#FDE68A',
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  itemCardCompleted: {
    backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
    borderColor: isDark ? colors.border.default : '#E2E8F0',
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
    backgroundColor: isDark ? colors.background.card : '#FFFFFF',
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
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.25)' : '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemIconBadgeCompleted: {
    backgroundColor: isDark ? colors.background.card : '#E2E8F0',
  },
  itemIconText: {
    fontSize: 12,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: isDark ? '#FBBF24' : '#92400E',
    flex: 1,
  },
  itemTitleCompleted: {
    color: colors.text.muted,
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
  dueRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 4,
  },
  dueBadgeStandalone: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  dueBadgeTextStandalone: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  scopeBadge: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
  },
  scopeBadgeFamily: {
    backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#EFF6FF',
    borderColor: isDark ? '#3B82F6' : '#BFDBFE',
  },
  scopeBadgePersonal: {
    backgroundColor: isDark ? 'rgba(168, 85, 247, 0.2)' : '#FAF5FF',
    borderColor: isDark ? '#A855F7' : '#E9D5FF',
  },
  scopeBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  scopeBadgeTextFamily: {
    color: isDark ? '#93C5FD' : '#2563EB',
  },
  scopeBadgeTextPersonal: {
    color: isDark ? '#D8B4FE' : '#9333EA',
  },
  completedBadge: {
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#ECFDF5',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(16, 185, 129, 0.4)' : '#A7F3D0',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  completedBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: isDark ? '#34D399' : '#059669',
  },
  itemDateText: {
    fontSize: 11.5,
    color: isDark ? '#FCD34D' : '#B45309',
    fontWeight: '600',
  },
  itemContent: {
    fontSize: 13.5,
    color: colors.text.primary,
    lineHeight: 19,
    marginBottom: 6,
  },
  itemContentCompleted: {
    color: colors.text.muted,
    textDecorationLine: 'line-through',
  },
  linkText: {
    color: isDark ? '#60A5FA' : '#2563EB',
    textDecorationLine: 'underline',
  },
  linkTextCompleted: {
    color: colors.text.muted,
    textDecorationLine: 'line-through',
  },
  itemReportBubble: {
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#F0FDF4',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(16, 185, 129, 0.35)' : '#BBF7D0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 6,
  },
  itemReportText: {
    fontSize: 11.5,
    color: isDark ? '#34D399' : '#166534',
    lineHeight: 16,
  },
  itemLinkedExpenseBadge: {
    alignSelf: 'flex-start',
    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(239, 68, 68, 0.35)' : '#FECACA',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 6,
  },
  itemLinkedExpenseBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: isDark ? '#F87171' : '#DC2626',
  },
  itemFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: isDark ? 'rgba(245, 158, 11, 0.25)' : '#FEF3C7',
  },
  itemAuthor: {
    fontSize: 10.5,
    color: isDark ? '#FCD34D' : '#78350F',
    fontWeight: '500',
  },
  itemAuthorCompleted: {
    color: colors.text.muted,
  },
  itemHint: {
    fontSize: 10.5,
    color: isDark ? '#FBBF24' : '#D97706',
    fontWeight: '600',
  },
  itemHintCompleted: {
    color: colors.text.muted,
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
    backgroundColor: isDark ? colors.background.cardSubtle : '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeFooterBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  checklistProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    marginBottom: 6,
  },
  checklistProgressBarBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: isDark ? colors.border.default : '#E2E8F0',
    overflow: 'hidden',
  },
  checklistProgressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  checklistProgressText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  checklistContainer: {
    marginVertical: 4,
    gap: 5,
  },
  checklistItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
    borderWidth: 0.5,
    borderColor: isDark ? colors.border.default : '#E2E8F0',
  },
  checklistItemRowCompleted: {
    backgroundColor: isDark ? colors.background.canvas : '#F1F5F9',
    borderColor: isDark ? colors.border.default : '#E2E8F0',
    opacity: 0.8,
  },
  checklistItemBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.text.muted,
    backgroundColor: isDark ? colors.background.card : '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  checklistItemBoxChecked: {
    borderColor: '#10B981',
    backgroundColor: '#10B981',
  },
  checklistItemCheckIcon: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 13,
  },
  checklistItemText: {
    fontSize: 13.5,
    color: colors.text.primary,
    flex: 1,
    lineHeight: 18,
  },
  checklistItemTextCompleted: {
    color: colors.text.muted,
    textDecorationLine: 'line-through',
  },
  checklistAllDoneHint: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(16, 185, 129, 0.35)' : '#A7F3D0',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    marginTop: 4,
    marginBottom: 6,
  },
  checklistAllDoneHintText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: isDark ? '#34D399' : '#059669',
  },
});
