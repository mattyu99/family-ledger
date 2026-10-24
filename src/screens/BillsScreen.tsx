import React, { useState, useMemo } from 'react';
import {
  View,
  Text as RNText,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TextProps,
} from 'react-native';
import { useLedger } from '../context/LedgerContext';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { getCategoryIcon } from '../lib/icons';
import { isBillDueInMonth, isBillPaidForCurrentPeriod } from '../lib/recurring';

const Text: React.FC<TextProps> = ({ allowFontScaling = false, maxFontSizeMultiplier = 1.08, ...rest }) => (
  <RNText
    allowFontScaling={allowFontScaling}
    maxFontSizeMultiplier={Math.min(maxFontSizeMultiplier ?? 1.08, 1.08)}
    {...rest}
  />
);

export interface BillsScreenProps {
  onOpenAccountsManageModal: () => void;
  onOpenRecurringModal: (scope: 'all' | 'my', targetMemberId?: string, initialTab?: 'bills' | 'pending' | 'installments') => void;
  onOpenPaymentMethodsModal: () => void;
  onOpenCategoryModal: () => void;
  onOpenReconcileModal: (accountType: 'credit_card' | 'stored_value', accountId?: string, scope?: 'all' | 'my') => void;
}

export const BillsScreen: React.FC<BillsScreenProps> = ({
  onOpenAccountsManageModal,
  onOpenRecurringModal,
  onOpenPaymentMethodsModal,
  onOpenCategoryModal,
  onOpenReconcileModal,
}) => {
  const { isDark, colors } = useTheme();
  const styles = useMemo(() => getStyles(isDark, colors), [isDark, colors]);

  const {
    currentUser,
    isOwner,
    paymentAccounts,
    recurringRules,
    paymentMethods,
    categories,
    getMemberById,
    getCategoryById,
    currentLedger,
  } = useLedger();

  const [billsScope, setBillsScope] = useState<'my' | 'all'>('my');

  const isMatchedToCurrentUser = useMemo(() => {
    return (paidById?: string) => {
      if (!paidById) return false;
      if (paidById === currentUser?.id) return true;
      const mem = getMemberById(paidById);
      if (mem && currentUser?.display_name && mem.display_name === currentUser.display_name) return true;
      return false;
    };
  }, [currentUser, getMemberById]);

  // 帳單支付專屬：當前帳本有效啟用之所有週期規則
  const scopedRecurringRules = useMemo(() => {
    return (recurringRules || []).filter(
      r => (!r.ledger_id || r.ledger_id === currentLedger?.id) && r.is_active
    );
  }, [recurringRules, currentLedger?.id]);

  // 僅綁定本機使用者之週期扣款規則
  const myRecurringRules = useMemo(() => {
    return scopedRecurringRules.filter(r => isMatchedToCurrentUser(r.paid_by));
  }, [scopedRecurringRules, isMatchedToCurrentUser]);

  // 僅綁定本機使用者之支付卡片與帳戶
  const myPaymentAccounts = useMemo(() => {
    return (paymentAccounts || []).filter(acc => isMatchedToCurrentUser(acc.user_id));
  }, [paymentAccounts, isMatchedToCurrentUser]);

  // 全家待核對帳單筆數
  const pendingRecurringBillsCount = useMemo(() => {
    const now = new Date();
    const currYear = now.getFullYear();
    const currMonth = now.getMonth() + 1;
    return scopedRecurringRules.filter(rule => {
      if (!isBillDueInMonth(rule, currYear, currMonth)) return false;
      return !isBillPaidForCurrentPeriod(rule, now);
    }).length;
  }, [scopedRecurringRules]);

  // 本機待核對帳單筆數
  const myPendingRecurringBillsCount = useMemo(() => {
    const now = new Date();
    const currYear = now.getFullYear();
    const currMonth = now.getMonth() + 1;
    return myRecurringRules.filter(rule => {
      if (!isBillDueInMonth(rule, currYear, currMonth)) return false;
      return !isBillPaidForCurrentPeriod(rule, now);
    }).length;
  }, [myRecurringRules]);

  const displayedRecurringRules = billsScope === 'my' ? myRecurringRules : scopedRecurringRules;
  const displayedPaymentAccounts = billsScope === 'my' ? myPaymentAccounts : paymentAccounts;
  const activePendingBillsCount = billsScope === 'my' ? myPendingRecurringBillsCount : pendingRecurringBillsCount;

  // 週期規則膠囊右上角標註紅點提示集合
  const pendingRecurringRuleIds = useMemo(() => {
    const now = new Date();
    const currYear = now.getFullYear();
    const currMonth = now.getMonth() + 1;
    const set = new Set<string>();
    (recurringRules || []).forEach(rule => {
      if (rule.ledger_id && currentLedger?.id && rule.ledger_id !== currentLedger.id) return;
      if (!rule.is_active) return;
      if (!isBillDueInMonth(rule, currYear, currMonth)) return;
      if (!isBillPaidForCurrentPeriod(rule, now)) {
        set.add(rule.id);
      }
    });
    return set;
  }, [recurringRules, currentLedger?.id]);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollPadding}>
      {/* 帳單與支付總覽 Hero 卡片 */}
      <View style={styles.billsHeroCard}>
        <View style={styles.billsHeroLeft}>
          <Text style={styles.billsHeroTitle} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
            💳 帳單與支付資產
          </Text>
          <Text style={styles.billsHeroDesc} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
            定期扣款・分期攤提・信用卡結帳・悠遊卡與電子支付
          </Text>
        </View>
        <View style={styles.billsHeroSummaryChip}>
          <Text style={styles.billsHeroSummaryText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
            {billsScope === 'my'
              ? `${myPaymentAccounts.length} 帳戶 · ${myRecurringRules.length} 項定期 (本機)`
              : `${paymentAccounts.length} 帳戶 · ${scopedRecurringRules.length} 項定期 (全家)`}
          </Text>
        </View>
      </View>

      {/* 切換檢視範圍 */}
      <View style={styles.billsScopeToggleRow}>
        <TouchableOpacity
          style={[styles.billsScopeTab, billsScope === 'my' && styles.billsScopeTabActive]}
          onPress={() => setBillsScope('my')}
          activeOpacity={0.7}
        >
          <Text style={[styles.billsScopeTabText, billsScope === 'my' && styles.billsScopeTabTextActive]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
            👤 我的 ({myPaymentAccounts.length + myRecurringRules.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.billsScopeTab, billsScope === 'all' && styles.billsScopeTabActive]}
          onPress={() => setBillsScope('all')}
          activeOpacity={0.7}
        >
          <Text style={[styles.billsScopeTabText, billsScope === 'all' && styles.billsScopeTabTextActive]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
            👨‍👩‍👧‍👦 全家 ({paymentAccounts.length + scopedRecurringRules.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* 🗓️ 週期扣款與固定帳單 */}
      <View style={styles.cardSection}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeaderLeft}>
            <Text style={styles.cardSectionTitle} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
              🗓️ 週期扣款與固定帳單 ({displayedRecurringRules.length})
            </Text>
            <Text style={styles.sectionHeaderDesc} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
              {billsScope === 'my'
                ? `僅列出綁定本機「${currentUser?.display_name || '我'}」負責之定期項目，可自主管理規則與確認入帳`
                : isOwner
                ? '管理水電瓦斯、房租通訊、分期攤提等定期週期項目，到期手動確認記帳'
                : '查看家庭固定週期扣款設定與出帳月份（全家純瀏覽模式）'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {activePendingBillsCount > 0 && (
              <TouchableOpacity
                style={[styles.manageCategoryBtn, { backgroundColor: '#FEE2E2', borderColor: '#FECACA' }]}
                onPress={() => {
                  onOpenRecurringModal(billsScope, undefined, 'pending');
                }}
              >
                <Text style={[styles.manageCategoryBtnText, { color: '#DC2626' }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                  🔔 待核對 ({activePendingBillsCount})
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.manageCategoryBtn}
              onPress={() => {
                onOpenRecurringModal(billsScope, undefined, 'bills');
              }}
            >
              <Text style={styles.manageCategoryBtnText} maxFontSizeMultiplier={1.2}>
                {billsScope === 'my' || isOwner ? '⚙️ 管理規則' : '👀 查看規則'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.paymentAccountPreviewRow}>
          {displayedRecurringRules.map(rule => {
            const cat = getCategoryById(rule.category_id);
            const payer = rule.paid_by ? getMemberById(rule.paid_by) : null;
            const isPending = pendingRecurringRuleIds.has(rule.id);
            return (
              <View key={rule.id} style={{ position: 'relative', overflow: 'visible' }}>
                <TouchableOpacity
                  style={[
                    styles.paymentAccountPreviewChip,
                    { borderColor: isPending ? '#FECACA' : '#E2E8F0' },
                    isPending && { backgroundColor: '#FFF5F5' },
                  ]}
                  onPress={() => {
                    onOpenRecurringModal(billsScope, undefined, 'pending');
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.paymentAccountPreviewIcon}>{getCategoryIcon(cat?.icon)}</Text>
                  <Text style={styles.paymentAccountPreviewText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                    {rule.name}{billsScope === 'all' && payer?.display_name ? ` · ${payer.display_name}` : ''}
                  </Text>
                  <View
                    style={[
                      styles.paymentAccountBadge,
                      { backgroundColor: isPending ? '#FEE2E2' : '#EFF6FF' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.paymentAccountBadgeText,
                        { color: isPending ? '#DC2626' : '#1D4ED8' },
                      ]}
                      allowFontScaling={false}
                      maxFontSizeMultiplier={1.08}
                    >
                      {rule.due_day}日
                    </Text>
                  </View>
                </TouchableOpacity>
                {isPending && <View pointerEvents="none" style={styles.ruleChipPendingDot} />}
              </View>
            );
          })}
          {displayedRecurringRules.length === 0 && (
            <TouchableOpacity
              style={[styles.paymentAccountPreviewChip, { borderStyle: 'dashed' }]}
              onPress={() => {
                onOpenRecurringModal(billsScope, undefined, 'bills');
              }}
            >
              <Text style={styles.paymentAccountPreviewText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                {billsScope === 'my'
                  ? '＋ 尚無綁定您的定期扣款規則 (點此新增)'
                  : '＋ 新增水電瓦斯或定期帳單規則'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 支付卡片與帳戶管理 */}
      <View style={styles.cardSection}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeaderLeft}>
            <Text style={styles.cardSectionTitle} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
              💳 支付卡片與帳戶 ({displayedPaymentAccounts.length})
            </Text>
            <Text style={styles.sectionHeaderDesc} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
              {billsScope === 'my'
                ? `僅列出綁定本機「${currentUser?.display_name || '我'}」專屬之卡片與帳戶，可自主管理與對帳`
                : isOwner
                ? '管理信用卡結帳週期、悠遊卡/一卡通餘額與帳單對帳'
                : '查看全家信用卡結帳日與悠遊卡即時餘額（全家純瀏覽模式）'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              style={[styles.manageCategoryBtn, { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' }]}
              onPress={() => {
                onOpenReconcileModal('credit_card', undefined, billsScope);
              }}
            >
              <Text style={[styles.manageCategoryBtnText, { color: '#4F46E5' }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                📊 對帳
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.manageCategoryBtn}
              onPress={onOpenAccountsManageModal}
            >
              <Text style={styles.manageCategoryBtnText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                {billsScope === 'my' || isOwner ? '⚙️ 管理' : '👀 查看'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.paymentAccountPreviewRow}>
          {displayedPaymentAccounts.map(acc => {
            const isCard = acc.type === 'credit_card';
            const cardholder = acc.user_id ? getMemberById(acc.user_id) : null;
            return (
              <TouchableOpacity
                key={acc.id}
                activeOpacity={0.7}
                onPress={() => {
                  onOpenReconcileModal(isCard ? 'credit_card' : 'stored_value', acc.id, billsScope);
                }}
                style={[
                  styles.paymentAccountPreviewChip,
                  { borderColor: `${acc.color || '#4F46E5'}40`, backgroundColor: `${acc.color || '#4F46E5'}10` },
                ]}
              >
                <Text style={styles.paymentAccountPreviewIcon} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                  {acc.icon || (isCard ? '💳' : '🚌')}
                </Text>
                <Text
                  style={styles.paymentAccountPreviewText}
                  numberOfLines={1}
                  allowFontScaling={false}
                  maxFontSizeMultiplier={1.08}
                >
                  {acc.name}{(acc.last_four_digits || acc.card_number) ? ` (*${(acc.last_four_digits || acc.card_number)!.slice(-4)})` : ''}
                  {billsScope === 'all' && cardholder?.display_name ? ` · ${cardholder.display_name}` : ''}
                </Text>
                {isCard && acc.billing_cycle_date ? (
                  <View style={[styles.paymentAccountBadge, { backgroundColor: '#EEF2FF' }]}>
                    <Text style={[styles.paymentAccountBadgeText, { color: '#4F46E5' }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                      每月{acc.billing_cycle_date}日結
                    </Text>
                  </View>
                ) : !isCard ? (
                  <View style={[styles.paymentAccountBadge, { backgroundColor: '#ECFDF5' }]}>
                    <Text style={[styles.paymentAccountBadgeText, { color: '#047857' }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                      ${(acc.balance || 0).toLocaleString()}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
          {displayedPaymentAccounts.length === 0 && (
            billsScope === 'my' || isOwner ? (
              <TouchableOpacity
                style={[styles.paymentAccountPreviewChip, { borderStyle: 'dashed' }]}
                onPress={onOpenAccountsManageModal}
              >
                <Text style={styles.paymentAccountPreviewText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                  {billsScope === 'my' ? '＋ 尚無綁定您的支付卡片 (點此新增)' : '＋ 新增第一張信用卡或悠遊卡'}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.paymentAccountPreviewChip, { borderStyle: 'dashed' }]}>
                <Text style={styles.paymentAccountPreviewText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                  尚無支付卡片或帳戶
                </Text>
              </View>
            )
          )}
        </View>
      </View>

      {/* 常用付款方式管理 */}
      <View style={styles.cardSection}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeaderLeft}>
            <Text style={styles.cardSectionTitle} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
              📱 常用付款方式 ({(paymentMethods || []).filter(m => m.is_enabled !== false).length})
            </Text>
            <Text style={styles.sectionHeaderDesc} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
              {isOwner
                ? '自訂日常記帳可用的支付工具（如 LINE Pay、全支付、悠遊付、街口等），可隨時新增或開關隱藏'
                : '查看目前日常記帳可用的支付工具（僅帳本管理員可新增或修改）'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.manageCategoryBtn}
            onPress={onOpenPaymentMethodsModal}
          >
            <Text style={styles.manageCategoryBtnText} maxFontSizeMultiplier={1.2}>
              {isOwner ? '⚙️ 管理付款方式' : '👀 查看付款方式'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.paymentAccountPreviewRow}>
          {(paymentMethods || []).filter(m => m.is_enabled !== false).map(m => (
            <TouchableOpacity
              key={m.id}
              style={[styles.paymentAccountPreviewChip, { borderColor: `${m.color || '#3B82F6'}45` }]}
              onPress={onOpenPaymentMethodsModal}
              activeOpacity={0.7}
            >
              <Text style={styles.paymentAccountPreviewIcon}>{m.icon}</Text>
              <Text style={styles.paymentAccountPreviewText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                {m.name}
              </Text>
              {m.supports_credit_card && (
                <View style={[styles.paymentAccountBadge, { backgroundColor: '#EFF6FF' }]}>
                  <Text style={[styles.paymentAccountBadgeText, { color: '#1D4ED8' }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                    可綁卡
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 記帳分類項目管理入口 */}
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
            onPress={onOpenCategoryModal}
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
              onPress={onOpenCategoryModal}
            >
              <Text style={styles.categoryMoreText} maxFontSizeMultiplier={1.2}>+{categories.length - 10} 更多...</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </ScrollView>
  );
};

const getStyles = (isDark: boolean, colors: ThemeColors) =>
  StyleSheet.create({
    scrollPadding: {
      padding: 16,
      paddingBottom: 90,
    },
    billsHeroCard: {
      backgroundColor: isDark ? colors.background.card : '#FFFFFF',
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: colors.border.default,
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 2,
    },
    billsHeroLeft: {
      flex: 1,
      paddingRight: 10,
    },
    billsHeroTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.text.primary,
      marginBottom: 4,
    },
    billsHeroDesc: {
      fontSize: 11,
      color: colors.text.muted,
      lineHeight: 16,
    },
    billsHeroSummaryChip: {
      backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    billsHeroSummaryText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.text.secondary,
    },
    billsScopeToggleRow: {
      flexDirection: 'row',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
      borderRadius: 12,
      padding: 3,
      marginBottom: 14,
      gap: 4,
    },
    billsScopeTab: {
      flex: 1,
      paddingVertical: 7,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    billsScopeTabActive: {
      backgroundColor: isDark ? colors.background.card : '#FFFFFF',
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 3,
      elevation: 2,
    },
    billsScopeTabText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text.muted,
    },
    billsScopeTabTextActive: {
      fontWeight: '800',
      color: isDark ? '#818CF8' : '#4F46E5',
    },
    cardSection: {
      backgroundColor: isDark ? colors.background.card : '#FFFFFF',
      borderRadius: 18,
      padding: 18,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
      elevation: 2,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    sectionHeaderLeft: {
      flex: 1,
      marginRight: 8,
    },
    cardSectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text.primary,
    },
    sectionHeaderDesc: {
      fontSize: 12,
      color: colors.text.muted,
      marginTop: 2,
      marginBottom: 14,
    },
    manageCategoryBtn: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.15)' : '#EEF2FF',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(79, 70, 229, 0.35)' : '#C7D2FE',
    },
    manageCategoryBtnText: {
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? '#818CF8' : '#4F46E5',
    },
    paymentAccountPreviewRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 10,
    },
    paymentAccountPreviewChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 6,
      maxWidth: '100%',
      overflow: 'hidden',
    },
    paymentAccountPreviewIcon: {
      fontSize: 14,
      marginRight: 6,
    },
    paymentAccountPreviewText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text.secondary,
      flexShrink: 1,
      marginRight: 4,
    },
    paymentAccountBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      flexShrink: 0,
      marginLeft: 2,
    },
    paymentAccountBadgeText: {
      fontSize: 10,
      fontWeight: '700',
    },
    ruleChipPendingDot: {
      position: 'absolute',
      top: -3,
      right: -3,
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor: '#EF4444',
      borderWidth: 1.5,
      borderColor: '#FFFFFF',
      zIndex: 10,
      elevation: 3,
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
      backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
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
      color: colors.text.secondary,
    },
    categoryMoreChip: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
      justifyContent: 'center',
    },
    categoryMoreText: {
      fontSize: 11,
      color: colors.text.muted,
      fontWeight: '600',
    },
  });
