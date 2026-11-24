import React, { useState, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Text } from '../components/common/Text';
import { useLedger } from '../context/LedgerContext';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { getCategoryIcon } from '../lib/icons';
import { getRollingPendingBills, getRollingBillDueInfo, RollingBillDueInfo } from '../lib/recurring';
import { SettingsGroupCard, SettingsRowItem } from '../components/settings';

const COLLAPSED_RECURRING_LIMIT = 5;
const COLLAPSED_ACCOUNTS_LIMIT = 5;

export interface BillsScreenProps {
  onOpenAccountsManageModal: (scope?: 'all' | 'my') => void;
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
  const [isRecurringExpanded, setIsRecurringExpanded] = useState(false);
  const [isAccountsExpanded, setIsAccountsExpanded] = useState(false);

  const handleScopeChange = (nextScope: 'my' | 'all') => {
    setBillsScope(nextScope);
    setIsRecurringExpanded(false);
    setIsAccountsExpanded(false);
  };

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

  // 帳單支付專屬：當前帳本有效之所有卡片帳戶
  const scopedPaymentAccounts = useMemo(() => {
    return (paymentAccounts || []).filter(
      a => !a.ledger_id || a.ledger_id === currentLedger?.id
    );
  }, [paymentAccounts, currentLedger?.id]);

  // 僅綁定本機使用者之支付卡片與帳戶
  const myPaymentAccounts = useMemo(() => {
    return scopedPaymentAccounts.filter(acc => isMatchedToCurrentUser(acc.user_id));
  }, [scopedPaymentAccounts, isMatchedToCurrentUser]);

  // 全家滾動待繳帳單 (包含已逾期與未來 7 天內即將扣款之平鋪時間軸)
  const rollingPendingBills = useMemo(() => {
    return getRollingPendingBills(scopedRecurringRules, new Date(), 7);
  }, [scopedRecurringRules]);

  // 本機滾動待繳帳單
  const myRollingPendingBills = useMemo(() => {
    return getRollingPendingBills(myRecurringRules, new Date(), 7);
  }, [myRecurringRules]);

  const displayedRecurringRules = billsScope === 'my' ? myRecurringRules : scopedRecurringRules;
  const displayedPaymentAccounts = billsScope === 'my' ? myPaymentAccounts : scopedPaymentAccounts;
  const activePendingBills = billsScope === 'my' ? myRollingPendingBills : rollingPendingBills;
  const activePendingBillsCount = activePendingBills.length;

  // 週期規則之滾動到期資訊映射 (rule.id -> RollingBillDueInfo)
  const rollingBillDueInfoMap = useMemo(() => {
    const now = new Date();
    const map = new Map<string, RollingBillDueInfo>();
    scopedRecurringRules.forEach(rule => {
      map.set(rule.id, getRollingBillDueInfo(rule, now));
    });
    return map;
  }, [scopedRecurringRules]);

  // 待繳規則集合 (未繳且在 7 天滾動窗口內或已逾期)
  const pendingRecurringRuleIds = useMemo(() => {
    const set = new Set<string>();
    activePendingBills.forEach(item => {
      set.add(item.rule.id);
    });
    return set;
  }, [activePendingBills]);

  // 依緊急度自動排序週期帳單：已逾期 > 今日/7天內即將扣款 > 其餘正常週期
  const sortedRecurringRules = useMemo(() => {
    const getPriority = (ruleId: string) => {
      const isPending = pendingRecurringRuleIds.has(ruleId);
      if (!isPending) return 2;
      const dueInfo = rollingBillDueInfoMap.get(ruleId);
      return dueInfo?.isOverdue ? 0 : 1;
    };

    return [...displayedRecurringRules].sort((a, b) => {
      const pA = getPriority(a.id);
      const pB = getPriority(b.id);
      if (pA !== pB) return pA - pB;

      if (pA < 2) {
        const dA = rollingBillDueInfoMap.get(a.id)?.daysRemaining ?? 999;
        const dB = rollingBillDueInfoMap.get(b.id)?.daysRemaining ?? 999;
        if (dA !== dB) return dA - dB;
      }
      return (a.due_day || 99) - (b.due_day || 99);
    });
  }, [displayedRecurringRules, pendingRecurringRuleIds, rollingBillDueInfoMap]);

  const visibleRecurringRules = isRecurringExpanded
    ? sortedRecurringRules
    : sortedRecurringRules.slice(0, COLLAPSED_RECURRING_LIMIT);
  const hiddenRecurringCount = Math.max(0, sortedRecurringRules.length - COLLAPSED_RECURRING_LIMIT);

  const visiblePaymentAccounts = isAccountsExpanded
    ? displayedPaymentAccounts
    : displayedPaymentAccounts.slice(0, COLLAPSED_ACCOUNTS_LIMIT);
  const hiddenAccountsCount = Math.max(0, displayedPaymentAccounts.length - COLLAPSED_ACCOUNTS_LIMIT);

  const enabledPaymentMethods = useMemo(
    () => (paymentMethods || []).filter(m => m.is_enabled !== false),
    [paymentMethods]
  );
  const paymentMethodsPreview = useMemo(() => {
    if (enabledPaymentMethods.length === 0) return '尚未啟用任何付款方式';
    const names = enabledPaymentMethods.slice(0, 4).map(m => m.name).join('、');
    return enabledPaymentMethods.length > 4 ? `${names} 等` : names;
  }, [enabledPaymentMethods]);

  const expenseCategoryCount = useMemo(
    () => categories.filter(c => c.type === 'expense').length,
    [categories]
  );
  const incomeCategoryCount = useMemo(
    () => categories.filter(c => c.type === 'income').length,
    [categories]
  );

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollPadding}>
      {/* 帳單與支付資產總覽＋視角切換整併卡片 */}
      <View style={styles.billsHeroCard}>
        <View style={styles.billsHeroHeaderRow}>
          <Text style={styles.billsHeroTitle} maxFontSizeMultiplier={1.15}>
            💳 帳單與支付資產
          </Text>
          <View style={styles.billsHeroSummaryChip}>
            <Text style={styles.billsHeroSummaryText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
              {displayedPaymentAccounts.length} 帳戶 · {displayedRecurringRules.length} 項定期
            </Text>
          </View>
        </View>

        <View style={styles.billsScopeToggleRow}>
          <TouchableOpacity
            style={[styles.billsScopeTab, billsScope === 'my' && styles.billsScopeTabActive]}
            onPress={() => handleScopeChange('my')}
            activeOpacity={0.7}
          >
            <Text style={[styles.billsScopeTabText, billsScope === 'my' && styles.billsScopeTabTextActive]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
              👤 我的 ({myPaymentAccounts.length + myRecurringRules.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.billsScopeTab, billsScope === 'all' && styles.billsScopeTabActive]}
            onPress={() => handleScopeChange('all')}
            activeOpacity={0.7}
          >
            <Text style={[styles.billsScopeTabText, billsScope === 'all' && styles.billsScopeTabTextActive]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
              👨‍👩‍👧‍👦 全家 ({scopedPaymentAccounts.length + scopedRecurringRules.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 🗓️ 週期固定帳單 */}
      <View style={styles.cardSection}>
        <View style={styles.sectionHeaderWrapRow}>
          <Text style={styles.cardSectionTitle}>
            🗓️ 週期固定帳單 ({displayedRecurringRules.length})
          </Text>
          <View style={styles.sectionActionGroup}>
            {activePendingBillsCount > 0 && (
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  {
                    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2',
                    borderColor: isDark ? 'rgba(248, 113, 113, 0.45)' : '#FECACA',
                  },
                ]}
                onPress={() => onOpenRecurringModal(billsScope, undefined, 'pending')}
                activeOpacity={0.75}
              >
                <Text
                  style={[styles.actionBtnText, { color: isDark ? '#FCA5A5' : '#DC2626' }]}
                  allowFontScaling={false}
                  maxFontSizeMultiplier={1.08}
                >
                  🔔 待核對 ({activePendingBillsCount})
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => onOpenRecurringModal(billsScope, undefined, 'bills')}
              activeOpacity={0.75}
            >
              <Text style={styles.actionBtnText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                {billsScope === 'my' || isOwner ? '⚙️ 規則' : '👀 查看'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionHeaderDesc}>
          {billsScope === 'my'
            ? `僅列出「${currentUser?.display_name || '我'}」負責之定期項目，依逾期與扣款順序置頂`
            : isOwner
            ? '水電瓦斯、房租通訊與分期攤提項目，依到期急迫度排序'
            : '查看家庭固定週期扣款設定與出帳月份（全家純瀏覽模式）'}
        </Text>

        {sortedRecurringRules.length > 0 ? (
          <View style={styles.listContainer}>
            {visibleRecurringRules.map((rule, index) => {
              const cat = getCategoryById(rule.category_id);
              const payer = rule.paid_by ? getMemberById(rule.paid_by) : null;
              const dueInfo = rollingBillDueInfoMap.get(rule.id);
              const isPending = pendingRecurringRuleIds.has(rule.id);
              const isOverdue = Boolean(isPending && dueInfo?.isOverdue);
              const isLast = index === visibleRecurringRules.length - 1 && hiddenRecurringCount === 0;

              const badgeText = isPending && dueInfo?.badgeText ? dueInfo.badgeText : `每月 ${rule.due_day} 日`;
              const badgeBg = isPending
                ? isOverdue
                  ? isDark ? 'rgba(239, 68, 68, 0.22)' : '#FEE2E2'
                  : isDark ? 'rgba(56, 189, 248, 0.2)' : '#E0F2FE'
                : isDark ? 'rgba(148, 163, 184, 0.16)' : '#F1F5F9';
              const badgeColor = isPending
                ? isOverdue
                  ? isDark ? '#FCA5A5' : '#DC2626'
                  : isDark ? '#7DD3FC' : '#0369A1'
                : isDark ? '#CBD5E1' : '#475569';
              const rowBg = isPending
                ? isOverdue
                  ? isDark ? 'rgba(239, 68, 68, 0.08)' : '#FFF7F7'
                  : isDark ? 'rgba(59, 130, 246, 0.08)' : '#F5FAFF'
                : 'transparent';

              return (
                <TouchableOpacity
                  key={rule.id}
                  style={[
                    styles.listRow,
                    { backgroundColor: rowBg },
                    !isLast && styles.listRowBorder,
                  ]}
                  onPress={() => onOpenRecurringModal(billsScope, undefined, isPending ? 'pending' : 'bills')}
                  activeOpacity={0.7}
                >
                  <View style={styles.listRowMain}>
                    <View style={styles.listRowTitleWrap}>
                      {isPending && (
                        <View
                          style={[
                            styles.pendingDot,
                            { backgroundColor: isOverdue ? '#EF4444' : '#0EA5E9' },
                          ]}
                        />
                      )}
                      <Text style={styles.listRowTitle} numberOfLines={1} ellipsizeMode="tail">
                        {getCategoryIcon(cat?.icon)} {rule.name}
                        {billsScope === 'all' && payer?.display_name ? ` · ${payer.display_name}` : ''}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: badgeBg }]}>
                      <Text
                        style={[styles.statusBadgeText, { color: badgeColor }]}
                        allowFontScaling={false}
                        maxFontSizeMultiplier={1.08}
                      >
                        {badgeText}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.listRowChevron}>›</Text>
                </TouchableOpacity>
              );
            })}

            {hiddenRecurringCount > 0 && (
              <TouchableOpacity
                style={styles.expandToggleBtn}
                onPress={() => setIsRecurringExpanded(prev => !prev)}
                activeOpacity={0.7}
              >
                <Text style={styles.expandToggleBtnText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                  {isRecurringExpanded
                    ? '收合週期帳單清單 ▴'
                    : `展開其餘 ${hiddenRecurringCount} 項規則（共 ${sortedRecurringRules.length} 項）▾`}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.emptyActionGroup}>
            <TouchableOpacity
              style={styles.emptyDashedBtn}
              onPress={() => onOpenRecurringModal(billsScope, undefined, 'bills')}
              activeOpacity={0.7}
            >
              <Text style={styles.emptyDashedBtnText}>
                {billsScope === 'my'
                  ? '＋ 尚無綁定您的定期扣款規則 (點此新增)'
                  : '＋ 新增水電瓦斯或定期帳單規則'}
              </Text>
            </TouchableOpacity>
            {billsScope === 'my' && scopedRecurringRules.length > 0 && (
              <TouchableOpacity
                style={styles.switchToAllBtn}
                onPress={() => handleScopeChange('all')}
                activeOpacity={0.7}
              >
                <Text style={styles.switchToAllBtnText}>
                  👥 切換查看全家定期扣款規則 ({scopedRecurringRules.length})
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* 💳 支付卡片與帳戶管理 */}
      <View style={styles.cardSection}>
        <View style={styles.sectionHeaderWrapRow}>
          <Text style={styles.cardSectionTitle}>
            💳 支付卡片與帳戶 ({displayedPaymentAccounts.length})
          </Text>
          <View style={styles.sectionActionGroup}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => onOpenReconcileModal('credit_card', undefined, billsScope)}
              activeOpacity={0.75}
            >
              <Text style={styles.actionBtnText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                📊 對帳
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => onOpenAccountsManageModal(billsScope)}
              activeOpacity={0.75}
            >
              <Text style={styles.actionBtnText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                {billsScope === 'my' || isOwner ? '⚙️ 管理' : '👀 查看'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionHeaderDesc}>
          {billsScope === 'my'
            ? `僅列出「${currentUser?.display_name || '我'}」專屬之卡片與帳戶，點擊即可對帳`
            : isOwner
            ? '管理信用卡結帳週期、悠遊卡／一卡通餘額與帳單對帳'
            : '查看全家信用卡結帳日與悠遊卡即時餘額（全家純瀏覽模式）'}
        </Text>

        {displayedPaymentAccounts.length > 0 ? (
          <View style={styles.listContainer}>
            {visiblePaymentAccounts.map((acc, index) => {
              const isCard = acc.type === 'credit_card';
              const cardholder = acc.user_id ? getMemberById(acc.user_id) : null;
              const last4 = acc.last_four_digits || acc.card_number;
              const isLast = index === visiblePaymentAccounts.length - 1 && hiddenAccountsCount === 0;

              const badgeText = isCard && acc.billing_cycle_date
                ? `每月${acc.billing_cycle_date}日結`
                : !isCard
                ? `$${(acc.balance || 0).toLocaleString()}`
                : null;

              const badgeBg = isCard
                ? isDark ? 'rgba(99, 102, 241, 0.22)' : '#EEF2FF'
                : isDark ? 'rgba(16, 185, 129, 0.2)' : '#ECFDF5';
              const badgeColor = isCard
                ? isDark ? '#A5B4FC' : '#4F46E5'
                : isDark ? '#34D399' : '#047857';

              return (
                <TouchableOpacity
                  key={acc.id}
                  style={[styles.listRow, !isLast && styles.listRowBorder]}
                  onPress={() => onOpenReconcileModal(isCard ? 'credit_card' : 'stored_value', acc.id, billsScope)}
                  activeOpacity={0.7}
                >
                  <View style={styles.listRowMain}>
                    <Text style={styles.listRowTitle} numberOfLines={1} ellipsizeMode="tail">
                      {acc.icon || (isCard ? '💳' : '🚌')} {acc.name}
                      {last4 ? ` (*${last4.slice(-4)})` : ''}
                      {billsScope === 'all' && cardholder?.display_name ? ` · ${cardholder.display_name}` : ''}
                    </Text>
                    {badgeText && (
                      <View style={[styles.statusBadge, { backgroundColor: badgeBg }]}>
                        <Text
                          style={[styles.statusBadgeText, { color: badgeColor }]}
                          allowFontScaling={false}
                          maxFontSizeMultiplier={1.08}
                        >
                          {badgeText}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.listRowChevron}>›</Text>
                </TouchableOpacity>
              );
            })}

            {hiddenAccountsCount > 0 && (
              <TouchableOpacity
                style={styles.expandToggleBtn}
                onPress={() => setIsAccountsExpanded(prev => !prev)}
                activeOpacity={0.7}
              >
                <Text style={styles.expandToggleBtnText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                  {isAccountsExpanded
                    ? '收合卡片與帳戶清單 ▴'
                    : `展開其餘 ${hiddenAccountsCount} 個帳戶（共 ${displayedPaymentAccounts.length} 個）▾`}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.emptyActionGroup}>
            {billsScope === 'my' || isOwner ? (
              <TouchableOpacity
                style={styles.emptyDashedBtn}
                onPress={() => onOpenAccountsManageModal(billsScope)}
                activeOpacity={0.7}
              >
                <Text style={styles.emptyDashedBtnText}>
                  {billsScope === 'my' ? '＋ 尚無綁定您的支付卡片 (點此新增)' : '＋ 新增第一張信用卡或悠遊卡'}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.emptyDashedBtn}>
                <Text style={styles.emptyDashedBtnText}>尚無支付卡片或帳戶</Text>
              </View>
            )}
            {billsScope === 'my' && scopedPaymentAccounts.length > 0 && (
              <TouchableOpacity
                style={styles.switchToAllBtn}
                onPress={() => handleScopeChange('all')}
                activeOpacity={0.7}
              >
                <Text style={styles.switchToAllBtnText}>
                  👥 切換查看全家卡片與帳戶 ({scopedPaymentAccounts.length})
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* ⚙️ 帳務工具與分類（精簡目錄入口） */}
      <SettingsGroupCard title="⚙️ 帳務工具與分類" caption={isOwner ? '可自訂管理' : '唯讀瀏覽'}>
        <SettingsRowItem
          icon="📱"
          title="常用付款方式"
          subtitle={paymentMethodsPreview}
          badgeText={`共 ${enabledPaymentMethods.length} 項`}
          badgeTone="info"
          onPress={onOpenPaymentMethodsModal}
        />
        <SettingsRowItem
          icon="🏷️"
          title="記帳分類項目"
          subtitle={`支出 ${expenseCategoryCount} 項 · 收入 ${incomeCategoryCount} 項`}
          badgeText={`共 ${categories.length} 項`}
          badgeTone="neutral"
          isLast
          onPress={onOpenCategoryModal}
        />
      </SettingsGroupCard>
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
      padding: 14,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border.default,
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 2,
    },
    billsHeroHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 10,
    },
    billsHeroTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.text.primary,
      maxWidth: '100%',
    },
    billsHeroSummaryChip: {
      backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 4,
      flexShrink: 0,
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
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border.default,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
      elevation: 1,
    },
    sectionHeaderWrapRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      columnGap: 8,
      rowGap: 8,
      marginBottom: 6,
    },
    cardSectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text.primary,
      maxWidth: '100%',
    },
    sectionActionGroup: {
      flexDirection: 'row',
      gap: 6,
      alignItems: 'center',
      flexShrink: 0,
    },
    sectionHeaderDesc: {
      fontSize: 12,
      color: colors.text.muted,
      marginBottom: 12,
      lineHeight: 17,
    },
    actionBtn: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.18)' : '#EEF2FF',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(99, 102, 241, 0.4)' : '#C7D2FE',
    },
    actionBtnText: {
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? '#A5B4FC' : '#4F46E5',
    },
    listContainer: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border.default,
      backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
      overflow: 'hidden',
    },
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 11,
      gap: 8,
    },
    listRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border.default,
    },
    listRowMain: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    listRowTitleWrap: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    pendingDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      flexShrink: 0,
    },
    listRowTitle: {
      flex: 1,
      minWidth: 0,
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
      lineHeight: 20,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      flexShrink: 0,
    },
    statusBadgeText: {
      fontSize: 11,
      fontWeight: '700',
    },
    listRowChevron: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.muted,
      flexShrink: 0,
    },
    expandToggleBtn: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border.default,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#FFFFFF',
    },
    expandToggleBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: isDark ? '#93C5FD' : '#2563EB',
    },
    emptyActionGroup: {
      gap: 8,
    },
    emptyDashedBtn: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.border.strong,
      backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
      alignItems: 'center',
    },
    emptyDashedBtnText: {
      fontSize: 12.5,
      fontWeight: '600',
      color: colors.text.secondary,
      textAlign: 'center',
    },
    switchToAllBtn: {
      paddingVertical: 11,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? '#4F46E5' : '#C7D2FE',
      backgroundColor: isDark ? 'rgba(99, 102, 241, 0.14)' : '#EEF2FF',
      alignItems: 'center',
    },
    switchToAllBtnText: {
      fontSize: 12.5,
      fontWeight: '700',
      color: isDark ? '#A5B4FC' : '#4F46E5',
      textAlign: 'center',
    },
  });
