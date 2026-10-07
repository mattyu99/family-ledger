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
import {
  getCreditCardBillingCycles,
  getCalendarMonthCycles,
  isDateInBillingCycle,
  BillingCycleOption,
  sortAccountsByUser,
} from '../lib/payment';
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

export interface CreditCardReconciliationModalProps {
  visible: boolean;
  onClose: () => void;
  onEditTransaction?: (tx: Transaction) => void;
  initialAccountType?: 'credit_card' | 'stored_value';
  initialAccountId?: string;
}

// 輔助函式：判斷是否為悠遊卡/儲值卡加值存入紀錄
const isTopUpTransaction = (t: Transaction, card: PaymentAccount): boolean => {
  if (!card) return false;
  if (t.merchant === `${card.name}儲值` || t.merchant === `${card.name}加值`) return true;
  if (t.note?.includes(`存入【${card.name}】`)) return true;
  if (t.note?.includes(`${card.name}儲值`) || t.note?.includes(`${card.name}加值`)) return true;
  return false;
};

export const CreditCardReconciliationModal: React.FC<CreditCardReconciliationModalProps> = ({
  visible,
  onClose,
  onEditTransaction,
  initialAccountType,
  initialAccountId,
}) => {
  const { paymentAccounts, transactions, toggleReconcileTransaction, getCategoryById, getMemberById, currentUser } = useLedger();

  const [accountType, setAccountType] = useState<'credit_card' | 'stored_value'>('credit_card');
  const [selectedCardId, setSelectedCardId] = useState<string>('');
  const [selectedCycleKey, setSelectedCycleKey] = useState<string>('');
  const [cycleCount, setCycleCount] = useState<number>(6);

  const creditCards = useMemo(
    () => sortAccountsByUser(paymentAccounts.filter(a => a.type === 'credit_card'), currentUser?.id),
    [paymentAccounts, currentUser]
  );

  const storedValueCards = useMemo(
    () => sortAccountsByUser(paymentAccounts.filter(a => a.type === 'stored_value'), currentUser?.id),
    [paymentAccounts, currentUser]
  );

  // 當彈窗開關或傳入初始參數時同步狀態
  useEffect(() => {
    if (visible) {
      if (initialAccountId) {
        const target = paymentAccounts.find(a => a.id === initialAccountId);
        if (target) {
          setAccountType(target.type === 'stored_value' ? 'stored_value' : 'credit_card');
          setSelectedCardId(target.id);
          setSelectedCycleKey('');
          return;
        }
      }
      if (initialAccountType) {
        setAccountType(initialAccountType);
        setSelectedCardId('');
        setSelectedCycleKey('');
      }
    } else {
      setCycleCount(6);
    }
  }, [visible, initialAccountType, initialAccountId, paymentAccounts]);

  const activeCards = accountType === 'credit_card' ? creditCards : storedValueCards;

  // 預設選中當前分類中的卡片
  const currentCard = useMemo(() => {
    return activeCards.find(c => c.id === selectedCardId) || activeCards[0];
  }, [activeCards, selectedCardId]);

  // 計算該卡片的帳單週期清單 (信用卡依結帳日動態計算，悠遊卡依自然月份計算)
  const billingCycles = useMemo(() => {
    if (!currentCard) return [];
    if (accountType === 'credit_card') {
      return getCreditCardBillingCycles(currentCard.billing_cycle_date || 15, new Date(), cycleCount);
    } else {
      return getCalendarMonthCycles(new Date(), cycleCount);
    }
  }, [currentCard, accountType, cycleCount]);

  // 當前選中的帳單週期
  const currentCycle = useMemo(() => {
    if (billingCycles.length === 0) return null;
    return billingCycles.find(c => c.key === selectedCycleKey) || billingCycles[0];
  }, [billingCycles, selectedCycleKey]);

  // 篩選出落入此卡片與此週期區間內的所有消費與加值
  const cycleTransactions = useMemo(() => {
    if (!currentCard || !currentCycle) return [];
    return transactions.filter(t => {
      if (accountType === 'credit_card') {
        const isCardMatch =
          t.account_id === currentCard.id ||
          (t.payment_method === 'credit_card' && !t.account_id && t.paid_by === currentCard.user_id);
        if (!isCardMatch) return false;
      } else {
        // 悠遊卡模式：
        // 1. 刷卡消費扣款
        const isCardSpend =
          t.account_id === currentCard.id ||
          (t.payment_method === 'stored_value' && !t.account_id && t.paid_by === currentCard.user_id);
        // 2. 加值存入
        const isCardTopUp = isTopUpTransaction(t, currentCard);

        if (!isCardSpend && !isCardTopUp) return false;
      }
      return isDateInBillingCycle(t.transacted_at, currentCycle.startDate, currentCycle.endDate);
    });
  }, [transactions, currentCard, currentCycle, accountType]);

  // 本期統計：支出總額、加值總額、已核對筆數
  const stats = useMemo(() => {
    if (accountType === 'credit_card') {
      const totalAmount = cycleTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);
      const reconciledCount = cycleTransactions.filter(t => t.is_reconciled).length;
      const totalCount = cycleTransactions.length;
      const progressPercent = totalCount > 0 ? Math.round((reconciledCount / totalCount) * 100) : 100;
      const isAllReconciled = totalCount > 0 && reconciledCount === totalCount;

      return {
        totalAmount,
        reconciledCount,
        totalCount,
        progressPercent,
        isAllReconciled,
        totalSpend: totalAmount,
        spendCount: cycleTransactions.filter(t => t.type === 'expense').length,
        totalTopUp: 0,
        topUpCount: 0,
      };
    } else {
      let totalSpend = 0;
      let spendCount = 0;
      let totalTopUp = 0;
      let topUpCount = 0;

      cycleTransactions.forEach(t => {
        if (currentCard && isTopUpTransaction(t, currentCard)) {
          totalTopUp += Number(t.amount || 0);
          topUpCount += 1;
        } else {
          totalSpend += Number(t.amount || 0);
          spendCount += 1;
        }
      });

      const reconciledCount = cycleTransactions.filter(t => t.is_reconciled).length;
      const totalCount = cycleTransactions.length;
      const progressPercent = totalCount > 0 ? Math.round((reconciledCount / totalCount) * 100) : 100;
      const isAllReconciled = totalCount > 0 && reconciledCount === totalCount;

      return {
        totalAmount: totalSpend,
        reconciledCount,
        totalCount,
        progressPercent,
        isAllReconciled,
        totalSpend,
        spendCount,
        totalTopUp,
        topUpCount,
      };
    }
  }, [cycleTransactions, accountType, currentCard]);

  if (!visible) return null;

  const isCredit = accountType === 'credit_card';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          {/* 標頭 */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} maxFontSizeMultiplier={1.15}>
                {isCredit ? '💳 信用卡帳單精確對帳' : '🚌 悠遊卡自然月對帳'}
              </Text>
              <Text style={styles.subtitle} maxFontSizeMultiplier={1.15}>
                {isCredit
                  ? '收到銀行電子帳單時，依結帳日精確比對每一筆消費'
                  : '依自然月檢視悠遊卡每筆扣款與加值，精確掌握卡片餘額'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText} maxFontSizeMultiplier={1.15}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 模式分頁切換 Tab */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tabItem, isCredit && styles.tabItemActive]}
              onPress={() => {
                setAccountType('credit_card');
                setSelectedCardId('');
                setSelectedCycleKey('');
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabItemText, isCredit && styles.tabItemTextActive]} maxFontSizeMultiplier={1.15}>
                💳 信用卡 ({creditCards.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, !isCredit && styles.tabItemActive]}
              onPress={() => {
                setAccountType('stored_value');
                setSelectedCardId('');
                setSelectedCycleKey('');
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabItemText, !isCredit && styles.tabItemTextActive]} maxFontSizeMultiplier={1.15}>
                🚌 悠遊卡 ({storedValueCards.length})
              </Text>
            </TouchableOpacity>
          </View>

          {activeCards.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>{isCredit ? '💳' : '🚌'}</Text>
              <Text style={styles.emptyText}>
                {isCredit ? '目前尚未設定任何信用卡' : '目前尚未設定任何悠遊卡或儲值卡'}
              </Text>
              <Text style={styles.emptySubtext}>
                {isCredit
                  ? '請至「家庭與備份」設定家裡的信用卡與結帳日，即可開始智慧對帳！'
                  : '請至「家庭與備份」新增家裡的悠遊卡或儲值卡，即可開始智慧對帳！'}
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
              {/* 卡片選擇標籤橫向滑軌 */}
              <Text style={styles.sectionHeader} maxFontSizeMultiplier={1.15}>
                {isCredit ? '選擇核對的信用卡' : '選擇核對的悠遊卡 / 儲值卡'}
              </Text>
              <HorizontalScrollView showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardSelectorScroll}>
                {activeCards.map(card => {
                  const isSelected = (currentCard?.id || activeCards[0]?.id) === card.id;
                  const cardholder = getMemberById(card.user_id);
                  return (
                    <TouchableOpacity
                      key={card.id}
                      style={[
                        styles.cardSelectChip,
                        isSelected && {
                          borderColor: card.color || (isCredit ? '#3B82F6' : '#0284C7'),
                          backgroundColor: isCredit ? '#EFF6FF' : '#F0F9FF',
                        },
                      ]}
                      onPress={() => {
                        setSelectedCardId(card.id);
                        setSelectedCycleKey('');
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.cardSelectIcon}>{card.icon || (isCredit ? '💳' : '🚌')}</Text>
                      <View>
                        <Text
                          style={[
                            styles.cardSelectName,
                            isSelected && {
                              color: card.color || (isCredit ? '#1E40AF' : '#0369A1'),
                              fontWeight: '700',
                            },
                          ]}
                          maxFontSizeMultiplier={1.15}
                        >
                          {card.name}{isCredit && card.last_four_digits ? ` (*${card.last_four_digits})` : ''}
                        </Text>
                        <Text style={styles.cardSelectCycle} maxFontSizeMultiplier={1.15}>
                          {cardholder ? `${cardholder.display_name} · ` : '全家通用 · '}
                          {isCredit
                            ? `每月 ${card.billing_cycle_date || 15} 號結帳`
                            : `餘額 NT$ ${card.balance.toLocaleString()}`}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </HorizontalScrollView>

              {/* 週期 / 自然月份選擇器 */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeader} maxFontSizeMultiplier={1.15}>
                  {isCredit ? '選擇帳單期 (依結帳日動態切分)' : '選擇對帳月份 (自然月 1 號至月底)'}
                </Text>
                {cycleCount > 6 && (
                  <Text style={styles.cycleCountBadge} maxFontSizeMultiplier={1.15}>
                    已展開至最近 {cycleCount} {isCredit ? '期' : '個月'}
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

                {/* 動態載入更多期數按鈕 */}
                {cycleCount < 36 ? (
                  <TouchableOpacity
                    style={styles.loadMoreCycleChip}
                    onPress={() => setCycleCount(prev => Math.min(prev + 6, 36))}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.loadMoreCycleText} maxFontSizeMultiplier={1.15}>
                      {isCredit ? '+ 查看更早帳單' : '+ 查看更早月份'}
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
                      {isCredit ? '收回至最近 6 期 ▴' : '收回至最近 6 個月 ▴'}
                    </Text>
                  </TouchableOpacity>
                )}
              </HorizontalScrollView>

              {/* 本期 / 本月對帳看板卡片 */}
              {currentCycle && currentCard && (
                <View style={styles.summaryCard}>
                  <View style={styles.summaryTopRow}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.summaryCycleName}>{currentCycle.cycleName}</Text>
                      <Text style={styles.summaryDateRange}>
                        {isCredit ? '帳單週期：' : '自然月份：'}{currentCycle.rangeText}
                      </Text>
                      {!isCredit && (
                        <View style={styles.currentBalancePill}>
                          <Text style={styles.currentBalanceLabel}>卡片即時餘額</Text>
                          <Text style={styles.currentBalanceValue}>NT$ {currentCard.balance.toLocaleString()}</Text>
                        </View>
                      )}
                    </View>

                    {isCredit ? (
                      <View style={styles.summaryAmountBox}>
                        <Text style={styles.summaryAmountLabel}>本期累積應繳</Text>
                        <Text style={styles.summaryAmountValue}>
                          NT$ {stats.totalAmount.toLocaleString()}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.storedValueStatsBox}>
                        <View style={styles.storedValueStatRow}>
                          <Text style={styles.storedValueStatLabel}>本月刷卡扣款</Text>
                          <Text style={styles.storedValueSpendValue}>
                            -NT$ {stats.totalSpend.toLocaleString()}
                          </Text>
                        </View>
                        <Text style={styles.storedValueStatSub}>共 {stats.spendCount} 筆消費</Text>

                        <View style={[styles.storedValueStatRow, { marginTop: 5 }]}>
                          <Text style={styles.storedValueStatLabel}>本月加值存入</Text>
                          <Text style={styles.storedValueTopUpValue}>
                            +NT$ {stats.totalTopUp.toLocaleString()}
                          </Text>
                        </View>
                        <Text style={styles.storedValueStatSub}>共 {stats.topUpCount} 次加值</Text>
                      </View>
                    )}
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
                            backgroundColor: stats.isAllReconciled
                              ? '#10B981'
                              : (isCredit ? '#3B82F6' : '#0284C7'),
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
                  {isCredit
                    ? `本期消費明細 (${cycleTransactions.length} 筆)`
                    : `當月收支與加值明細 (${cycleTransactions.length} 筆)`}
                </Text>
                <Text style={styles.txListHint}>核對無誤請點擊右側按鈕打勾 ✍️</Text>
              </View>

              {cycleTransactions.length === 0 ? (
                <View style={styles.emptyTxBox}>
                  <Text style={styles.emptyTxText}>
                    {isCredit
                      ? '本期帳單週期內尚無此信用卡的刷卡紀錄'
                      : '本月份內尚無此悠遊卡的扣款或加值紀錄'}
                  </Text>
                </View>
              ) : (
                cycleTransactions.map(tx => {
                  const isTopUp = !isCredit && currentCard && isTopUpTransaction(tx, currentCard);
                  const cat = getCategoryById(tx.category_id, tx.category);
                  const d = new Date(tx.transacted_at);
                  const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
                  return (
                    <View key={tx.id} style={[styles.txRow, tx.is_reconciled && styles.txRowReconciled]}>
                      {/* 類別圖示 */}
                      <View
                        style={[
                          styles.catIconBox,
                          { backgroundColor: isTopUp ? '#ECFDF5' : `${cat?.color || '#3B82F6'}20` },
                        ]}
                      >
                        <Text style={styles.catIcon}>
                          {isTopUp ? '💰' : getCategoryIcon(cat?.icon)}
                        </Text>
                      </View>

                      {/* 消費/加值內容 */}
                      <TouchableOpacity
                        style={styles.txInfoCol}
                        onPress={() => onEditTransaction?.(tx)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.txTitleRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 6 }}>
                            {isTopUp && (
                              <View style={styles.topUpBadge}>
                                <Text style={styles.topUpBadgeText}>加值</Text>
                              </View>
                            )}
                            <Text style={styles.txMerchantName} numberOfLines={1}>
                              {isTopUp
                                ? (tx.merchant || `${currentCard.name}儲值`)
                                : (tx.merchant || cat?.name || (isCredit ? '消費' : '悠遊卡扣款'))}
                            </Text>
                          </View>
                          <Text style={[styles.txAmountText, isTopUp && styles.txAmountTopUp]}>
                            {isTopUp
                              ? `+NT$ ${Number(tx.amount).toLocaleString()}`
                              : `-NT$ ${Number(tx.amount).toLocaleString()}`}
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

export const CardReconciliationModal = CreditCardReconciliationModal;

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
    paddingBottom: 10,
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
    marginTop: 10,
    marginBottom: 6,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 9,
  },
  tabItemActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  tabItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabItemTextActive: {
    color: '#1E293B',
    fontWeight: '700',
  },
  scrollArea: {
    flex: 1,
    marginTop: 6,
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
    marginTop: 10,
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
    paddingTop: 6,
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
  currentBalancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 6,
    gap: 6,
  },
  currentBalanceLabel: {
    fontSize: 10.5,
    color: '#0369A1',
    fontWeight: '600',
  },
  currentBalanceValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0284C7',
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
  storedValueStatsBox: {
    alignItems: 'flex-end',
    backgroundColor: '#FFFFFF',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  storedValueStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  storedValueStatLabel: {
    fontSize: 10.5,
    color: '#64748B',
  },
  storedValueSpendValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#EF4444',
  },
  storedValueTopUpValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#10B981',
  },
  storedValueStatSub: {
    fontSize: 9.5,
    color: '#94A3B8',
    marginTop: 1,
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
  topUpBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    marginRight: 4,
  },
  topUpBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
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
  txAmountTopUp: {
    color: '#10B981',
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
