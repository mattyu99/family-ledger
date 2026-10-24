import React, { useState, useMemo, useEffect } from 'react';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import {
  Modal,
  View,
  Text as RNText,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TextProps,
  Dimensions,
} from 'react-native';
import { useLedger } from '../context/LedgerContext';
import {
  LotteryPeriodData,
  getOfficialLotteryDraws,
  syncLotteryDrawsAsync,
  checkInvoiceWinning,
} from '../lib/lottery';
import { getInvoicePeriodKey, formatInvoiceNumber } from '../lib/invoice';
import { Transaction } from '../types/database';

const Text: React.FC<TextProps> = ({ allowFontScaling = false, maxFontSizeMultiplier = 1.08, ...rest }) => (
  <RNText
    allowFontScaling={allowFontScaling}
    maxFontSizeMultiplier={Math.min(maxFontSizeMultiplier ?? 1.08, 1.08)}
    {...rest}
  />
);

interface InvoiceLotteryModalProps {
  visible: boolean;
  onClose: () => void;
  initialPeriodKey?: string;
  onSelectTransaction?: (transaction: Transaction) => void;
}

// 記住使用者上次選看的發票雙月期別，在來回查看記帳明細時無縫維持當前期別
let lastViewedPeriodKey: string | undefined = undefined;

export const InvoiceLotteryModal: React.FC<InvoiceLotteryModalProps> = ({
  visible,
  onClose,
  initialPeriodKey,
  onSelectTransaction,
}) => {
  const { isDark, colors } = useTheme();
  const styles = useMemo(() => getStyles(isDark, colors), [isDark, colors]);
  const { transactions, claimInvoicePrize, getMemberById, currentUser } = useLedger();

  // 本地快取與全自動聯網同步的官方中獎號碼庫
  const [drawsMap, setDrawsMap] = useState<Record<string, LotteryPeriodData>>(() => getOfficialLotteryDraws());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // 彈窗開啟時自動背景聯網向財政部/CDN同步最新期號
  useEffect(() => {
    if (visible) {
      setDrawsMap({ ...getOfficialLotteryDraws() });
      setIsSyncing(true);
      syncLotteryDrawsAsync()
        .then(latest => {
          setDrawsMap({ ...latest });
        })
        .catch(() => {})
        .finally(() => {
          setIsSyncing(false);
        });
    }
  }, [visible]);

  // 取得目前所有可選擇的期別（官方已知開獎期別 + 包含未開獎的本期）
  const availablePeriods = useMemo(() => {
    const now = new Date();
    const currentPeriod = getInvoicePeriodKey(now);
    const set = new Map<string, { periodKey: string; periodLabel: string; draw?: LotteryPeriodData }>();

    // 1. 本期（可能尚未開獎）
    set.set(currentPeriod.periodKey, {
      periodKey: currentPeriod.periodKey,
      periodLabel: currentPeriod.periodLabel,
      draw: drawsMap[currentPeriod.periodKey],
    });

    // 2. 歷史官方已開獎期別
    Object.values(drawsMap).forEach(draw => {
      set.set(draw.periodKey, {
        periodKey: draw.periodKey,
        periodLabel: draw.periodLabel,
        draw,
      });
    });

    // 3. 確保歷史交易中出現的所有發票期別都有對應的切換膠囊
    transactions.forEach(t => {
      if (t.invoice_number && t.transacted_at) {
        const pk = getInvoicePeriodKey(t.transacted_at);
        if (!set.has(pk.periodKey)) {
          set.set(pk.periodKey, {
            periodKey: pk.periodKey,
            periodLabel: pk.periodLabel,
            draw: drawsMap[pk.periodKey],
          });
        }
      }
    });

    // 依期別字串降序排序（最新期別在最前面）
    return Array.from(set.values()).sort((a, b) => b.periodKey.localeCompare(a.periodKey));
  }, [transactions, drawsMap]);

  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string>(() => {
    return initialPeriodKey || lastViewedPeriodKey || availablePeriods[0]?.periodKey || '2026-08';
  });

  const selectedPeriodObj = useMemo(() => {
    return availablePeriods.find(p => p.periodKey === selectedPeriodKey) || availablePeriods[0];
  }, [availablePeriods, selectedPeriodKey]);

  // 篩選屬於當前選定期別的所有交易發票
  const periodTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (!t.invoice_number) return false;
      const pKey = t.transacted_at ? getInvoicePeriodKey(t.transacted_at).periodKey : (t.invoice_period || getInvoicePeriodKey(new Date()).periodKey);
      return pKey === selectedPeriodKey;
    });
  }, [transactions, selectedPeriodKey]);

  // 即時計算各發票的中獎判定（整合最新同步之獎號）
  const evaluatedTransactions = useMemo(() => {
    return periodTransactions.map(tx => {
      const check = checkInvoiceWinning(tx.invoice_number, selectedPeriodKey, drawsMap);
      const isClaimed = tx.invoice_status === 'claimed';
      const isWon = isClaimed ? false : (tx.invoice_status === 'won' || check.isWon);
      const isMissed = isClaimed || isWon ? false : (tx.invoice_status === 'missed' || (check.isDrawn && !check.isWon));
      const isPending = !isClaimed && !isWon && !isMissed;
      const prizeAmount = tx.invoice_prize_amount || (check.isWon ? check.prizeAmount : 0);
      const prizeName = tx.invoice_prize_name || (check.isWon ? check.prizeName : undefined);

      return {
        ...tx,
        isWon,
        isClaimed,
        isMissed,
        isPending,
        computedPrizeAmount: prizeAmount,
        computedPrizeName: prizeName,
      };
    });
  }, [periodTransactions, selectedPeriodKey, drawsMap]);

  // 統計數據：總發票數、中獎數、總獎金
  const stats = useMemo(() => {
    let wonCount = 0;
    let totalPrize = 0;
    let claimedCount = 0;

    evaluatedTransactions.forEach(t => {
      if (t.isWon || t.isClaimed) {
        wonCount += 1;
        totalPrize += (t.computedPrizeAmount || t.invoice_prize_amount || 0);
      }
      if (t.isClaimed) {
        claimedCount += 1;
      }
    });

    return {
      totalCount: evaluatedTransactions.length,
      wonCount,
      totalPrize,
      claimedCount,
    };
  }, [evaluatedTransactions]);

  const drawData = selectedPeriodObj?.draw;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalBox}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.headerTitle}>🧾 統一發票對獎中心</Text>
                {stats.wonCount > 0 && (
                  <View style={styles.headerWonBadge}>
                    <Text style={styles.headerWonBadgeText}>中獎 {stats.wonCount} 張</Text>
                  </View>
                )}
              </View>
              <Text style={styles.headerSub}>自動核對家庭消費發票 · 一鍵兌領獎金入帳</Text>
              <View style={styles.syncRow}>
                <View style={[styles.syncDot, isSyncing && styles.syncDotLoading]} />
                <Text style={styles.syncStatusText}>
                  {isSyncing ? '正在連線同步財政部最新開獎號碼...' : '官方開獎號碼全自動即時同步'}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 期別選擇軌道 */}
          <View style={styles.periodScrollContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periodRow}>
              {availablePeriods.map(p => {
                const isSelected = p.periodKey === selectedPeriodKey;
                const isDrawn = !!p.draw;
                return (
                  <TouchableOpacity
                    key={p.periodKey}
                    style={[styles.periodChip, isSelected && styles.periodChipActive]}
                    onPress={() => {
                      lastViewedPeriodKey = p.periodKey;
                      setSelectedPeriodKey(p.periodKey);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.periodChipText, isSelected && styles.periodChipTextActive]}>
                      {p.periodLabel}
                    </Text>
                    {isDrawn ? (
                      <View style={[styles.periodDrawnDot, isSelected && styles.periodDrawnDotActive]} />
                    ) : (
                      <Text style={styles.periodPendingTag}>未開獎</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <ScrollView style={styles.scrollBody} showsVerticalScrollIndicator={false}>
            {/* 中獎概況統計橫幅 */}
            <View style={[styles.statsBanner, stats.wonCount > 0 && styles.statsBannerWon]}>
              <View style={styles.statsCol}>
                <Text style={styles.statsLabel}>本期發票</Text>
                <Text style={styles.statsValue}>{stats.totalCount} <Text style={styles.statsUnit}>張</Text></Text>
              </View>
              <View style={styles.statsDivider} />
              <View style={styles.statsCol}>
                <Text style={styles.statsLabel}>幸運中獎</Text>
                <Text style={[styles.statsValue, stats.wonCount > 0 ? styles.wonValue : null]}>
                  {stats.wonCount} <Text style={styles.statsUnit}>張</Text>
                </Text>
              </View>
              <View style={styles.statsDivider} />
              <View style={styles.statsCol}>
                <Text style={styles.statsLabel}>中獎總金額</Text>
                <Text style={[styles.statsValue, stats.totalPrize > 0 ? styles.wonValue : null]}>
                  ${stats.totalPrize.toLocaleString()}
                </Text>
              </View>
            </View>

            {/* 本期開獎獎號速查卡 */}
            {drawData ? (
              <View style={styles.drawCard}>
                <View style={styles.drawCardHeader}>
                  <Text style={styles.drawCardTitle}>🎯 本期中獎號碼 ({drawData.periodLabel})</Text>
                  <Text style={styles.drawDateText}>開獎日：{drawData.drawDate}</Text>
                </View>

                <View style={styles.prizeGrid}>
                  {/* 特別獎 */}
                  <View style={styles.prizeItem}>
                    <View style={[styles.prizeTag, { backgroundColor: '#FEE2E2' }]}>
                      <Text style={[styles.prizeTagText, { color: '#DC2626' }]}>特別獎 (1,000萬)</Text>
                    </View>
                    <Text style={[styles.prizeNum, { color: '#B91C1C' }]}>{drawData.superPrize}</Text>
                  </View>

                  {/* 特獎 */}
                  <View style={styles.prizeItem}>
                    <View style={[styles.prizeTag, { backgroundColor: '#FEF3C7' }]}>
                      <Text style={[styles.prizeTagText, { color: '#D97706' }]}>特獎 (200萬)</Text>
                    </View>
                    <Text style={[styles.prizeNum, { color: '#92400E' }]}>{drawData.specialPrize}</Text>
                  </View>

                  {/* 頭獎 */}
                  <View style={styles.prizeItem}>
                    <View style={[styles.prizeTag, { backgroundColor: '#DBEAFE' }]}>
                      <Text style={[styles.prizeTagText, { color: '#2563EB' }]}>頭獎 (20萬)</Text>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                      {drawData.firstPrizes.map((fp, idx) => (
                        <Text key={idx} style={[styles.prizeNum, { color: '#1E40AF', fontSize: 15 }]}>{fp}</Text>
                      ))}
                    </View>
                  </View>

                  {/* 二獎至六獎對獎規則提示 */}
                  <View style={styles.ruleNotice}>
                    <Text style={styles.ruleNoticeText}>
                      💡 二獎 (末7碼) • 三獎 (末6碼) • 四獎 (末5碼) • 五獎 (末4碼 $1,000) • 六獎 (末3碼 $200)
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.pendingDrawCard}>
                <Text style={styles.pendingDrawIcon}>⏳</Text>
                <Text style={styles.pendingDrawTitle}>本期統一發票尚未開獎</Text>
                <Text style={styles.pendingDrawSub}>
                  統一發票於雙月份 25 日下午開獎，開獎後系統將第一時間自動為您進行全量比對！
                </Text>
              </View>
            )}

            {/* 發票明細清單 */}
            <View style={styles.listSectionHeader}>
              <Text style={styles.listSectionTitle}>📋 本期記錄之發票 ({evaluatedTransactions.length})</Text>
              <Text style={styles.listSectionHint}>點擊任一發票可查看或編輯記帳明細 ›</Text>
            </View>

            {evaluatedTransactions.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyIcon}>🧾</Text>
                <Text style={styles.emptyTitle}>此期別尚無發票記錄</Text>
                <Text style={styles.emptySub}>
                  在日常記帳時，輸入發票號碼或直接「掃描發票 QR Code」，開獎後即可享受全自動對獎！
                </Text>
              </View>
            ) : (
              evaluatedTransactions.map(tx => {
                const payer = getMemberById(tx.paid_by) || currentUser;
                const isWon = tx.isWon;
                const isClaimed = tx.isClaimed;
                const isMissed = tx.isMissed;
                const isPending = tx.isPending;
                const prizeAmount = tx.computedPrizeAmount || tx.invoice_prize_amount || 0;
                const prizeName = tx.computedPrizeName || tx.invoice_prize_name || '中獎';

                return (
                  <TouchableOpacity
                    key={tx.id}
                    style={[
                      styles.invoiceCard,
                      (isWon || isClaimed) && styles.invoiceCardWon,
                    ]}
                    activeOpacity={0.7}
                    onPress={() => {
                      lastViewedPeriodKey = selectedPeriodKey;
                      onSelectTransaction?.(tx);
                    }}
                  >
                    <View style={styles.invoiceCardHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                        <Text style={styles.invoiceNumText}>
                          🧾 {formatInvoiceNumber(tx.invoice_number || '')}
                        </Text>
                        {isWon && (
                          <View style={styles.wonBadge}>
                            <Text style={styles.wonBadgeText}>
                              🎉 中獎 ${prizeAmount.toLocaleString()} ({prizeName})
                            </Text>
                          </View>
                        )}
                        {isClaimed && (
                          <View style={styles.claimedBadge}>
                            <Text style={styles.claimedBadgeText}>
                              ✅ 已兌領入帳 (${prizeAmount.toLocaleString()})
                            </Text>
                          </View>
                        )}
                        {isMissed && (
                          <View style={styles.missedBadge}>
                            <Text style={styles.missedBadgeText}>未中獎</Text>
                          </View>
                        )}
                        {isPending && (
                          <View style={styles.pendingBadge}>
                            <Text style={styles.pendingBadgeText}>待開獎</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.invoiceDateText}>
                        {tx.transacted_at.split('T')[0]}
                      </Text>
                    </View>

                    <View style={styles.invoiceCardBody}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={styles.invoiceMerchantText} numberOfLines={1}>
                          {tx.merchant || tx.category?.name || '一般消費'}
                        </Text>
                        <Text style={styles.invoiceMetaText}>
                          {payer.avatar_url || '👤'} {payer.display_name} • 消費 NT$ {tx.amount.toLocaleString()}
                        </Text>
                      </View>

                      {/* 右側：兌領入帳按鈕與查看箭頭 */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {isWon && !isClaimed && (
                          <TouchableOpacity
                            style={styles.claimBtn}
                            onPress={(e) => {
                              e?.stopPropagation?.();
                              claimInvoicePrize(tx.id);
                            }}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.claimBtnText}>💰 兌領入帳</Text>
                          </TouchableOpacity>
                        )}
                        <Text style={styles.cardArrow}>›</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const getStyles = (isDark: boolean, colors: ThemeColors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.75)' : 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: colors.background.canvas,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '90%',
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    backgroundColor: colors.background.modal,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? colors.border.default : '#F1F5F9',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text.primary,
  },
  headerWonBadge: {
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(245, 158, 11, 0.4)' : '#FDE68A',
  },
  headerWonBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: isDark ? '#FBBF24' : '#B45309',
  },
  headerSub: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  syncDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
  },
  syncDotLoading: {
    backgroundColor: '#F59E0B',
  },
  syncStatusText: {
    fontSize: 11,
    color: isDark ? '#34D399' : '#059669',
    fontWeight: '500',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: isDark ? colors.background.cardSubtle : '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    color: colors.text.muted,
    fontWeight: '600',
  },
  periodScrollContainer: {
    backgroundColor: colors.background.modal,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? colors.border.default : '#F1F5F9',
    paddingVertical: 10,
  },
  periodRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
  },
  periodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: isDark ? colors.background.cardSubtle : '#F1F5F9',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E2E8F0',
    gap: 5,
  },
  periodChipActive: {
    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF',
    borderColor: '#6366F1',
  },
  periodChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  periodChipTextActive: {
    color: isDark ? '#818CF8' : '#4F46E5',
    fontWeight: '800',
  },
  periodDrawnDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  periodDrawnDotActive: {
    backgroundColor: '#4F46E5',
  },
  periodPendingTag: {
    fontSize: 10,
    color: colors.text.muted,
    backgroundColor: isDark ? colors.background.card : '#FFFFFF',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  scrollBody: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  statsBanner: {
    flexDirection: 'row',
    backgroundColor: colors.background.card,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  statsBannerWon: {
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FFFBEB',
    borderColor: isDark ? 'rgba(245, 158, 11, 0.35)' : '#FDE68A',
  },
  statsCol: {
    alignItems: 'center',
    flex: 1,
  },
  statsLabel: {
    fontSize: 11,
    color: colors.text.muted,
    marginBottom: 2,
  },
  statsValue: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text.primary,
  },
  wonValue: {
    color: isDark ? '#FBBF24' : '#B45309',
  },
  statsUnit: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.text.muted,
  },
  statsDivider: {
    width: 1,
    height: 24,
    backgroundColor: isDark ? colors.border.default : '#E2E8F0',
  },
  drawCard: {
    backgroundColor: colors.background.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E2E8F0',
    marginBottom: 14,
  },
  drawCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? colors.border.default : '#F1F5F9',
    paddingBottom: 8,
  },
  drawCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
  },
  drawDateText: {
    fontSize: 11,
    color: colors.text.muted,
  },
  prizeGrid: {
    gap: 8,
  },
  prizeItem: {
    backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
    borderRadius: 10,
    padding: 8,
  },
  prizeTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 2,
  },
  prizeTagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  prizeNum: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 2,
  },
  ruleNotice: {
    paddingTop: 4,
  },
  ruleNoticeText: {
    fontSize: 11,
    color: colors.text.muted,
    lineHeight: 16,
  },
  pendingDrawCard: {
    backgroundColor: isDark ? 'rgba(2, 132, 199, 0.15)' : '#F0F9FF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(2, 132, 199, 0.35)' : '#BAE6FD',
    alignItems: 'center',
    marginBottom: 14,
  },
  pendingDrawIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  pendingDrawTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: isDark ? '#38BDF8' : '#0369A1',
    marginBottom: 4,
  },
  pendingDrawSub: {
    fontSize: 12,
    color: isDark ? '#7DD3FC' : '#0284C7',
    textAlign: 'center',
    lineHeight: 18,
  },
  listSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 4,
  },
  listSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  listSectionHint: {
    fontSize: 11,
    color: colors.text.muted,
  },
  emptyBox: {
    backgroundColor: colors.background.card,
    borderRadius: 16,
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E2E8F0',
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.secondary,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 12,
    color: colors.text.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
  invoiceCard: {
    backgroundColor: colors.background.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E2E8F0',
    marginBottom: 8,
  },
  invoiceCardWon: {
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : '#FFFDF5',
    borderColor: isDark ? 'rgba(245, 158, 11, 0.4)' : '#FDE68A',
    borderWidth: 1.5,
  },
  invoiceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: isDark ? colors.border.default : '#F8FAFC',
    paddingBottom: 6,
    marginBottom: 6,
  },
  invoiceNumText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: 0.5,
  },
  wonBadge: {
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  wonBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: isDark ? '#FBBF24' : '#B45309',
  },
  claimedBadge: {
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#D1FAE5',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  claimedBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: isDark ? '#34D399' : '#065F46',
  },
  missedBadge: {
    backgroundColor: isDark ? colors.background.cardSubtle : '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  missedBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text.muted,
  },
  pendingBadge: {
    backgroundColor: isDark ? 'rgba(37, 99, 235, 0.2)' : '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  pendingBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: isDark ? '#60A5FA' : '#2563EB',
  },
  invoiceDateText: {
    fontSize: 11,
    color: colors.text.muted,
  },
  invoiceCardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  invoiceMerchantText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.primary,
  },
  invoiceMetaText: {
    fontSize: 11,
    color: colors.text.secondary,
    marginTop: 2,
  },
  claimBtn: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  claimBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  cardArrow: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.muted,
    marginLeft: 2,
  },
});
