import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text as RNText,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  TextProps,
} from 'react-native';
import { PaymentAccount, Transaction } from '../types/database';
import { useLedger } from '../context/LedgerContext';
import { getCreditCardBillingCycles, isDateInBillingCycle, BillingCycleOption, sortAccountsByUser } from '../lib/payment';
import { getCategoryIcon } from '../lib/icons';
import { HorizontalScrollView } from './HorizontalScrollView';

const Text: React.FC<TextProps> = ({ allowFontScaling = false, maxFontSizeMultiplier = 1.08, ...rest }) => (
  <RNText
    allowFontScaling={allowFontScaling}
    maxFontSizeMultiplier={Math.min(maxFontSizeMultiplier ?? 1.08, 1.08)}
    {...rest}
  />
);

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface CreditCardReconciliationModalProps {
  visible: boolean;
  onClose: () => void;
  onEditTransaction?: (tx: Transaction) => void;
}

export const CreditCardReconciliationModal: React.FC<CreditCardReconciliationModalProps> = ({
  visible,
  onClose,
  onEditTransaction,
}) => {
  const { paymentAccounts, transactions, toggleReconcileTransaction, getCategoryById, getMemberById, currentUser } = useLedger();

  const creditCards = useMemo(
    () => sortAccountsByUser(paymentAccounts.filter(a => a.type === 'credit_card'), currentUser?.id),
    [paymentAccounts, currentUser]
  );

  const [selectedCardId, setSelectedCardId] = useState<string>('');
  const [selectedCycleKey, setSelectedCycleKey] = useState<string>('');
  const [cycleCount, setCycleCount] = useState<number>(6);

  // 當彈窗關閉時重設為預設最近 6 期
  useEffect(() => {
    if (!visible) {
      setCycleCount(6);
    }
  }, [visible]);

  // 預設選中第一張信用卡
  const currentCard = useMemo(() => {
    return creditCards.find(c => c.id === selectedCardId) || creditCards[0];
  }, [creditCards, selectedCardId]);

  // 計算該信用卡的帳單週期清單 (依 cycleCount 動態展開)
  const billingCycles = useMemo(() => {
    if (!currentCard) return [];
    return getCreditCardBillingCycles(currentCard.billing_cycle_date || 15, new Date(), cycleCount);
  }, [currentCard, cycleCount]);

  // 當前選中的帳單週期
  const currentCycle = useMemo(() => {
    if (billingCycles.length === 0) return null;
    return billingCycles.find(c => c.key === selectedCycleKey) || billingCycles[0];
  }, [billingCycles, selectedCycleKey]);

  // 篩選出落入此卡片與此帳單週期的所有消費
  const cycleTransactions = useMemo(() => {
    if (!currentCard || !currentCycle) return [];
    return transactions.filter(t => {
      // 必須是該卡片（account_id 吻合，或選了信用卡但未指定 account_id 且付款人吻合）
      const isCardMatch = t.account_id === currentCard.id || (t.payment_method === 'credit_card' && !t.account_id && t.paid_by === currentCard.user_id);
      if (!isCardMatch) return false;
      return isDateInBillingCycle(t.transacted_at, currentCycle.startDate, currentCycle.endDate);
    });
  }, [transactions, currentCard, currentCycle]);

  // 本期統計：支出總額、已核對筆數
  const stats = useMemo(() => {
    const totalAmount = cycleTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const reconciledCount = cycleTransactions.filter(t => t.is_reconciled).length;
    const totalCount = cycleTransactions.length;
    const progressPercent = totalCount > 0 ? Math.round((reconciledCount / totalCount) * 100) : 100;
    const isAllReconciled = totalCount > 0 && reconciledCount === totalCount;

    return { totalAmount, reconciledCount, totalCount, progressPercent, isAllReconciled };
  }, [cycleTransactions]);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          {/* 標頭 */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title} maxFontSizeMultiplier={1.15}>💳 信用卡帳單精確對帳</Text>
              <Text style={styles.subtitle} maxFontSizeMultiplier={1.15}>
                收到銀行電子帳單時，依結帳日精確比對每一筆消費
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText} maxFontSizeMultiplier={1.15}>✕</Text>
            </TouchableOpacity>
          </View>

          {creditCards.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>💳</Text>
              <Text style={styles.emptyText}>目前尚未設定任何信用卡</Text>
              <Text style={styles.emptySubtext}>
                請至「家庭與備份」設定家裡的信用卡與結帳日，即可開始智慧對帳！
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
              {/* 卡片選擇標籤橫向滑軌 */}
              <Text style={styles.sectionHeader} maxFontSizeMultiplier={1.15}>選擇核對的信用卡</Text>
              <HorizontalScrollView showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardSelectorScroll}>
                {creditCards.map(card => {
                  const isSelected = (currentCard?.id || creditCards[0]?.id) === card.id;
                  const cardholder = getMemberById(card.user_id);
                  return (
                    <TouchableOpacity
                      key={card.id}
                      style={[
                        styles.cardSelectChip,
                        isSelected && { borderColor: card.color || '#3B82F6', backgroundColor: '#EFF6FF' },
                      ]}
                      onPress={() => {
                        setSelectedCardId(card.id);
                        setSelectedCycleKey('');
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.cardSelectIcon}>💳</Text>
                      <View>
                        <Text
                          style={[styles.cardSelectName, isSelected && { color: card.color || '#1E40AF', fontWeight: '700' }]}
                          maxFontSizeMultiplier={1.15}
                        >
                          {card.name}{card.last_four_digits ? ` (*${card.last_four_digits})` : ''}
                        </Text>
                        <Text style={styles.cardSelectCycle} maxFontSizeMultiplier={1.15}>
                          {cardholder ? `${cardholder.display_name} · ` : ''}每月 {card.billing_cycle_date || 15} 號結帳
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </HorizontalScrollView>

              {/* 帳單週期選擇器 */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeader} maxFontSizeMultiplier={1.15}>
                  選擇帳單期 (依結帳日動態切分)
                </Text>
                {cycleCount > 6 && (
                  <Text style={styles.cycleCountBadge} maxFontSizeMultiplier={1.15}>
                    已展開至最近 {cycleCount} 期
                  </Text>
                )}
              </View>
              <HorizontalScrollView showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cycleSelectorScroll}>
                {billingCycles.map(cycle => {
                  const isSelected = (currentCycle?.key || billingCycles[0]?.key) === cycle.key;
                  return (
                    <TouchableOpacity
                      key={cycle.key}
                      style={[styles.cycleChip, isSelected && styles.cycleChipActive]}
                      onPress={() => setSelectedCycleKey(cycle.key)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[styles.cycleChipText, isSelected && styles.cycleChipTextActive]}
                        maxFontSizeMultiplier={1.15}
                      >
                        {cycle.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}

                {/* 動態載入更多帳單期數按鈕 */}
                {cycleCount < 36 ? (
                  <TouchableOpacity
                    style={styles.loadMoreCycleChip}
                    onPress={() => setCycleCount(prev => Math.min(prev + 6, 36))}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.loadMoreCycleText} maxFontSizeMultiplier={1.15}>
                      + 查看更早帳單
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.maxCycleChip}>
                    <Text style={styles.maxCycleText} maxFontSizeMultiplier={1.15}>
                      已顯示上限 36 期
                    </Text>
                  </View>
                )}

                {/* 展開超過 6 期時提供收起按鈕 */}
                {cycleCount > 6 && (
                  <TouchableOpacity
                    style={styles.collapseCycleChip}
                    onPress={() => {
                      setCycleCount(6);
                      const recent6 = billingCycles.slice(0, 6);
                      if (!recent6.some(c => c.key === selectedCycleKey)) {
                        setSelectedCycleKey('');
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.collapseCycleText} maxFontSizeMultiplier={1.15}>
                      收回至最近 6 期 ▴
                    </Text>
                  </TouchableOpacity>
                )}
              </HorizontalScrollView>

              {/* 本期對帳看板卡片 */}
              {currentCycle && (
                <View style={styles.summaryCard}>
                  <View style={styles.summaryTopRow}>
                    <View>
                      <Text style={styles.summaryCycleName}>{currentCycle.cycleName}</Text>
                      <Text style={styles.summaryDateRange}>週期：{currentCycle.rangeText}</Text>
                    </View>
                    <View style={styles.summaryAmountBox}>
                      <Text style={styles.summaryAmountLabel}>本期累積應繳</Text>
                      <Text style={styles.summaryAmountValue}>
                        NT$ {stats.totalAmount.toLocaleString()}
                      </Text>
                    </View>
                  </View>

                  {/* 進度條 */}
                  <View style={styles.progressSection}>
                    <View style={styles.progressInfoRow}>
                      <Text style={styles.progressText}>
                        對帳進度：已核對 {stats.reconciledCount} / {stats.totalCount} 筆 ({stats.progressPercent}%)
                      </Text>
                      {stats.isAllReconciled && (
                        <Text style={styles.allReconciledBadge}>🎉 全數核對完成</Text>
                      )}
                    </View>
                    <View style={styles.progressBarTrack}>
                      <View
                        style={[
                          styles.progressBarFill,
                          {
                            width: `${stats.progressPercent}%`,
                            backgroundColor: stats.isAllReconciled ? '#10B981' : '#3B82F6',
                          },
                        ]}
                      />
                    </View>
                  </View>
                </View>
              )}

              {/* 明細清單 */}
              <View style={styles.txListHeader}>
                <Text style={styles.txListTitle}>
                  本期消費明細 ({cycleTransactions.length} 筆)
                </Text>
                <Text style={styles.txListHint}>核對無誤請點擊右側按鈕打勾 ✍️</Text>
              </View>

              {cycleTransactions.length === 0 ? (
                <View style={styles.emptyTxBox}>
                  <Text style={styles.emptyTxText}>本期帳單週期內尚無此信用卡的刷卡紀錄</Text>
                </View>
              ) : (
                cycleTransactions.map(tx => {
                  const cat = getCategoryById(tx.category_id, tx.category);
                  const d = new Date(tx.transacted_at);
                  const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
                  return (
                    <View key={tx.id} style={[styles.txRow, tx.is_reconciled && styles.txRowReconciled]}>
                      {/* 類別圖示 */}
                      <View style={[styles.catIconBox, { backgroundColor: `${cat?.color || '#3B82F6'}20` }]}>
                        <Text style={styles.catIcon}>{getCategoryIcon(cat?.icon)}</Text>
                      </View>

                      {/* 消費內容 */}
                      <TouchableOpacity
                        style={styles.txInfoCol}
                        onPress={() => onEditTransaction?.(tx)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.txTitleRow}>
                          <Text style={styles.txMerchantName} numberOfLines={1}>
                            {tx.merchant || cat?.name || '消費'}
                          </Text>
                          <Text style={styles.txAmountText}>
                            -NT$ {Number(tx.amount).toLocaleString()}
                          </Text>
                        </View>
                        <View style={styles.txSubRow}>
                          <Text style={styles.txDate}>{dateStr}</Text>
                          <Text style={styles.txNote} numberOfLines={1}>
                            {tx.note ? `· ${tx.note}` : ''}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      {/* 核對勾選按鈕 */}
                      <TouchableOpacity
                        style={[styles.reconcileBtn, tx.is_reconciled && styles.reconcileBtnActive]}
                        onPress={() => toggleReconcileTransaction(tx.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.reconcileBtnText, tx.is_reconciled && styles.reconcileBtnTextActive]}>
                          {tx.is_reconciled ? '✓ 已核對' : '○ 待核對'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
              <View style={{ height: 30 }} />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.9,
    minHeight: SCREEN_HEIGHT * 0.65,
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  closeText: {
    fontSize: 18,
    color: '#94A3B8',
  },
  scrollArea: {
    flex: 1,
    marginTop: 10,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  cycleCountBadge: {
    fontSize: 10.5,
    color: '#2563EB',
    fontWeight: '600',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  cardSelectorScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
  },
  cardSelectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    gap: 8,
  },
  cardSelectIcon: {
    fontSize: 18,
  },
  cardSelectName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  cardSelectCycle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  cycleSelectorScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 6,
  },
  cycleChip: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cycleChipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  cycleChipText: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#475569',
  },
  cycleChipTextActive: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  loadMoreCycleChip: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: '#93C5FD',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadMoreCycleText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#2563EB',
  },
  collapseCycleChip: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  collapseCycleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  maxCycleChip: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  maxCycleText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  summaryCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  summaryCycleName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  summaryDateRange: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  summaryAmountBox: {
    alignItems: 'flex-end',
  },
  summaryAmountLabel: {
    fontSize: 10.5,
    color: '#64748B',
  },
  summaryAmountValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#EF4444',
  },
  progressSection: {
    marginTop: 4,
  },
  progressInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  allReconciledBadge: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#059669',
  },
  progressBarTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  txListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  txListTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  txListHint: {
    fontSize: 10.5,
    color: '#64748B',
  },
  emptyTxBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyTxText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    gap: 10,
  },
  txRowReconciled: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  catIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catIcon: {
    fontSize: 18,
  },
  txInfoCol: {
    flex: 1,
  },
  txTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txMerchantName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    flex: 1,
  },
  txAmountText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EF4444',
  },
  txSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 4,
  },
  txDate: {
    fontSize: 11,
    color: '#64748B',
  },
  txNote: {
    fontSize: 11,
    color: '#94A3B8',
    flex: 1,
  },
  reconcileBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  reconcileBtnActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  reconcileBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  reconcileBtnTextActive: {
    color: '#15803D',
    fontWeight: '700',
  },
  emptyContainer: {
    padding: 30,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
});

