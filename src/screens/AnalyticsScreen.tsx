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
import { TrendChartsWidget } from '../components/TrendChartsWidget';
import { MemberAvatar } from '../components/MemberAvatar';
import { HorizontalScrollView } from '../components/HorizontalScrollView';
import { getCategoryIcon } from '../lib/icons';

const Text: React.FC<TextProps> = ({ allowFontScaling = false, maxFontSizeMultiplier = 1.08, ...rest }) => (
  <RNText
    allowFontScaling={allowFontScaling}
    maxFontSizeMultiplier={Math.min(maxFontSizeMultiplier ?? 1.08, 1.08)}
    {...rest}
  />
);

export interface AnalyticsScreenProps {
  analyticsMonth: string;
  setAnalyticsMonth: (m: string) => void;
  onOpenMonthPicker: () => void;
}

export const AnalyticsScreen: React.FC<AnalyticsScreenProps> = ({
  analyticsMonth,
  setAnalyticsMonth,
  onOpenMonthPicker,
}) => {
  const { isDark, colors } = useTheme();
  const styles = useMemo(() => getStyles(isDark, colors), [isDark, colors]);

  const {
    transactions,
    members,
    currentUser,
    getMemberById,
    getCategoryById,
    currentBudget,
  } = useLedger();

  const [analyticsCategoryType, setAnalyticsCategoryType] = useState<'expense' | 'income'>('expense');

  const currentMonthYm = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const lastMonthYm = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const availableMonths = useMemo(() => {
    const monthMap = new Map<string, number>();
    const now = new Date();
    const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    monthMap.set(currentYm, 0);

    transactions.forEach(t => {
      if (t.transacted_at) {
        const d = new Date(t.transacted_at);
        if (!isNaN(d.getTime())) {
          const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          monthMap.set(ym, (monthMap.get(ym) || 0) + 1);
        }
      }
    });

    return Array.from(monthMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([ym, count]) => ({
        ym,
        label: `${ym.split('-')[0]} 年 ${parseInt(ym.split('-')[1], 10)} 月`,
        count,
      }));
  }, [transactions]);

  const availableYears = useMemo(() => {
    const yearMap = new Map<number, number>();
    const currentYear = new Date().getFullYear();
    yearMap.set(currentYear, 0);

    transactions.forEach(t => {
      if (t.transacted_at) {
        const d = new Date(t.transacted_at);
        if (!isNaN(d.getTime())) {
          const y = d.getFullYear();
          yearMap.set(y, (yearMap.get(y) || 0) + 1);
        }
      }
    });

    return Array.from(yearMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([year, count]) => ({
        year,
        label: `${year} 全年`,
        count,
      }));
  }, [transactions]);

  const analyticsTransactions = useMemo(() => {
    if (analyticsMonth === 'all') return transactions;
    const isYear = /^\d{4}$/.test(analyticsMonth);
    const targetYear = isYear ? parseInt(analyticsMonth, 10) : 0;
    return transactions.filter(t => {
      if (!t.transacted_at) return false;
      const d = new Date(t.transacted_at);
      if (isNaN(d.getTime())) return false;
      if (isYear) {
        return d.getFullYear() === targetYear;
      }
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return ym === analyticsMonth;
    });
  }, [transactions, analyticsMonth]);

  const analyticsSummary = useMemo(() => {
    let totalExpense = 0;
    let totalIncome = 0;
    const paidByMembers: Record<string, number> = {};

    members.forEach(m => {
      paidByMembers[m.id] = 0;
    });

    analyticsTransactions.forEach(t => {
      if (t.type === 'expense') {
        const amt = Number(t.amount) || 0;
        totalExpense += amt;
        const canonical = getMemberById(t.paid_by);
        const targetId = canonical ? canonical.id : t.paid_by;
        paidByMembers[targetId] = (paidByMembers[targetId] || 0) + amt;
      } else if (t.type === 'income') {
        totalIncome += Number(t.amount) || 0;
      }
    });

    return {
      totalExpense,
      totalIncome,
      netBalance: totalIncome - totalExpense,
      paidByMembers,
      count: analyticsTransactions.length,
    };
  }, [analyticsTransactions, members, getMemberById]);

  const analyticsMonthLabel = useMemo(() => {
    if (analyticsMonth === 'all') return '全部歷史累計';
    if (/^\d{4}$/.test(analyticsMonth)) {
      const year = parseInt(analyticsMonth, 10);
      const currentYear = new Date().getFullYear();
      if (year === currentYear) {
        return `今年度 (${year} 全年)`;
      }
      return `${year} 年度 (全年)`;
    }
    if (analyticsMonth === currentMonthYm) {
      const parts = currentMonthYm.split('-');
      return `本月 (${parts[0]}年${parseInt(parts[1], 10)}月)`;
    }
    if (analyticsMonth === lastMonthYm) {
      const parts = lastMonthYm.split('-');
      return `上月 (${parts[0]}年${parseInt(parts[1], 10)}月)`;
    }
    const found = availableMonths.find(m => m.ym === analyticsMonth);
    if (found) return found.label;
    if (analyticsMonth && analyticsMonth.includes('-')) {
      const parts = analyticsMonth.split('-');
      return `${parts[0]} 年 ${parseInt(parts[1], 10)} 月`;
    }
    return analyticsMonth;
  }, [analyticsMonth, currentMonthYm, lastMonthYm, availableMonths]);

  const dailyAverageExpense = useMemo(() => {
    if (analyticsSummary.totalExpense <= 0) return 0;

    const now = new Date();
    if (/^\d{4}$/.test(analyticsMonth)) {
      const year = parseInt(analyticsMonth, 10);
      const currentYear = now.getFullYear();
      if (year === currentYear) {
        const startOfYear = new Date(year, 0, 1);
        const daySpan = Math.max(1, Math.floor((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1);
        return Math.round(analyticsSummary.totalExpense / daySpan);
      } else if (year < currentYear) {
        const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
        const daysInYear = isLeapYear ? 366 : 365;
        return Math.round(analyticsSummary.totalExpense / daysInYear);
      } else {
        return Math.round(analyticsSummary.totalExpense / 365);
      }
    }

    if (analyticsMonth === currentMonthYm) {
      const dayOfMonth = Math.max(1, now.getDate());
      return Math.round(analyticsSummary.totalExpense / dayOfMonth);
    }

    if (analyticsMonth !== 'all') {
      const parts = analyticsMonth.split('-');
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const daysInMonth = new Date(year, month, 0).getDate();
      return Math.round(analyticsSummary.totalExpense / (daysInMonth || 30));
    }

    if (analyticsTransactions.length > 0) {
      const timestamps = analyticsTransactions
        .map(t => new Date(t.transacted_at).getTime())
        .filter(t => !isNaN(t));
      if (timestamps.length > 0) {
        const minT = Math.min(...timestamps);
        const maxT = Math.max(...timestamps);
        const daySpan = Math.max(1, Math.round((maxT - minT) / (1000 * 60 * 60 * 24)) + 1);
        return Math.round(analyticsSummary.totalExpense / daySpan);
      }
    }

    return Math.round(analyticsSummary.totalExpense / 30);
  }, [analyticsSummary.totalExpense, analyticsMonth, currentMonthYm, analyticsTransactions]);

  const analyticsMemberPaymentRanking = useMemo(() => {
    const totalExp = analyticsSummary.totalExpense;
    const MEMBER_PALETTE = ['#4F46E5', '#06B6D4', '#EC4899', '#F59E0B', '#10B981', '#8B5CF6', '#3B82F6', '#14B8A6'];

    return members
      .map((member, idx) => {
        const paid = analyticsSummary.paidByMembers[member.id] || 0;
        const ratioNum = totalExp > 0 ? (paid / totalExp) * 100 : 0;
        const ratio = ratioNum.toFixed(1);
        const color = MEMBER_PALETTE[idx % MEMBER_PALETTE.length];
        const isCurrent =
          currentUser.id === member.id ||
          (!!currentUser.display_name && currentUser.display_name === member.display_name);

        return {
          id: member.id,
          display_name: member.display_name,
          avatar_url: member.avatar_url,
          paid,
          ratioNum,
          ratio,
          color,
          isCurrent,
        };
      })
      .sort((a, b) => b.paid - a.paid)
      .map((item, index) => ({
        ...item,
        rank: index + 1,
      }));
  }, [members, analyticsSummary.paidByMembers, analyticsSummary.totalExpense, currentUser]);

  const analyticsCategoryRanking = useMemo(() => {
    const totalAmount =
      analyticsCategoryType === 'expense'
        ? analyticsSummary.totalExpense
        : analyticsSummary.totalIncome;

    if (totalAmount === 0) return [];

    const categoryMap = new Map<string, {
      id: string;
      name: string;
      icon: string;
      color: string;
      amount: number;
      count: number;
    }>();

    analyticsTransactions.forEach(t => {
      if (t.type === analyticsCategoryType) {
        const amt = Number(t.amount) || 0;
        if (amt <= 0) return;

        const resolvedCat = getCategoryById(t.category_id, t.category) || {
          id: 'uncategorized',
          name: '其他未分類',
          icon: 'tag',
          color: '#94A3B8',
          type: analyticsCategoryType,
          sort_order: 999,
        };

        const key = resolvedCat.id || resolvedCat.name || 'uncategorized';
        const existing = categoryMap.get(key);
        if (existing) {
          existing.amount += amt;
          existing.count += 1;
        } else {
          categoryMap.set(key, {
            id: key,
            name: resolvedCat.name || '其他未分類',
            icon: resolvedCat.icon || 'tag',
            color: resolvedCat.color || (analyticsCategoryType === 'income' ? '#10B981' : '#6366F1'),
            amount: amt,
            count: 1,
          });
        }
      }
    });

    return Array.from(categoryMap.values())
      .sort((a, b) => b.amount - a.amount)
      .map((item, index) => {
        const percentage = totalAmount > 0 ? Number(((item.amount / totalAmount) * 100).toFixed(1)) : 0;
        return {
          ...item,
          rank: index + 1,
          percentage,
        };
      });
  }, [analyticsTransactions, analyticsCategoryType, analyticsSummary.totalExpense, analyticsSummary.totalIncome, getCategoryById]);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollPadding}>
      {/* 時間維度切換器 */}
      <View style={styles.analyticsFilterBox}>
        <HorizontalScrollView
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.analyticsFilterScroll}
        >
          {/* 本月 */}
          <TouchableOpacity
            style={[
              styles.analyticsFilterChip,
              analyticsMonth === currentMonthYm && styles.analyticsFilterChipActive,
            ]}
            onPress={() => setAnalyticsMonth(currentMonthYm)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.analyticsFilterText,
                analyticsMonth === currentMonthYm && styles.analyticsFilterTextActive,
              ]}
            >
              📅 本月
            </Text>
          </TouchableOpacity>

          {/* 上月 */}
          {lastMonthYm ? (
            <TouchableOpacity
              style={[
                styles.analyticsFilterChip,
                analyticsMonth === lastMonthYm && styles.analyticsFilterChipActive,
              ]}
              onPress={() => setAnalyticsMonth(lastMonthYm)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.analyticsFilterText,
                  analyticsMonth === lastMonthYm && styles.analyticsFilterTextActive,
                ]}
              >
                📅 上月
              </Text>
            </TouchableOpacity>
          ) : null}

          {/* 年度篩選膠囊 */}
          {availableYears.map(y => {
            const yStr = String(y.year);
            const nowY = new Date().getFullYear();
            const isCurrentYear = y.year === nowY;
            const isLastYear = y.year === nowY - 1;
            const chipLabel = isCurrentYear
              ? `🗓️ 今年 (${y.year})`
              : isLastYear
              ? `🗓️ 去年 (${y.year})`
              : `🗓️ ${y.year} 全年`;
            return (
              <TouchableOpacity
                key={yStr}
                style={[
                  styles.analyticsFilterChip,
                  analyticsMonth === yStr && styles.analyticsFilterChipActive,
                ]}
                onPress={() => setAnalyticsMonth(yStr)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.analyticsFilterText,
                    analyticsMonth === yStr && styles.analyticsFilterTextActive,
                  ]}
                >
                  {chipLabel}
                </Text>
              </TouchableOpacity>
            );
          })}

          {/* 全部歷史 */}
          <TouchableOpacity
            style={[
              styles.analyticsFilterChip,
              analyticsMonth === 'all' && styles.analyticsFilterChipActive,
            ]}
            onPress={() => setAnalyticsMonth('all')}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.analyticsFilterText,
                analyticsMonth === 'all' && styles.analyticsFilterTextActive,
              ]}
            >
              🌐 全部歷史
            </Text>
          </TouchableOpacity>

          {/* 若選中了特定月份 */}
          {analyticsMonth !== currentMonthYm &&
            analyticsMonth !== lastMonthYm &&
            analyticsMonth !== 'all' &&
            !availableYears.some(y => String(y.year) === analyticsMonth) &&
            !availableMonths.some(m => m.ym === analyticsMonth) && (
              <TouchableOpacity
                style={[styles.analyticsFilterChip, styles.analyticsFilterChipActive]}
                onPress={onOpenMonthPicker}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.analyticsFilterText, styles.analyticsFilterTextActive]}
                >
                  🗓️ {analyticsMonthLabel} ✓
                </Text>
              </TouchableOpacity>
            )}

          {/* 其他歷史月份 */}
          {availableMonths
            .filter(m => m.ym !== currentMonthYm && m.ym !== lastMonthYm)
            .map(m => (
              <TouchableOpacity
                key={m.ym}
                style={[
                  styles.analyticsFilterChip,
                  analyticsMonth === m.ym && styles.analyticsFilterChipActive,
                ]}
                onPress={() => setAnalyticsMonth(m.ym)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.analyticsFilterText,
                    analyticsMonth === m.ym && styles.analyticsFilterTextActive,
                  ]}
                >
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}

          {/* 選擇特定月份或年份按鈕 */}
          <TouchableOpacity
            style={[
              styles.analyticsFilterChip,
              styles.analyticsFilterSelectMoreChip,
            ]}
            onPress={onOpenMonthPicker}
            activeOpacity={0.7}
          >
            <Text style={styles.analyticsFilterSelectMoreText}>
              🔍 更多月份/年份 ▾
            </Text>
          </TouchableOpacity>
        </HorizontalScrollView>

        {/* 當前選中期間提示 */}
        <TouchableOpacity
          style={styles.analyticsFilterStatusRow}
          onPress={onOpenMonthPicker}
          activeOpacity={0.7}
        >
          <Text style={styles.analyticsFilterStatusText}>
            📊 統計範圍：{analyticsMonthLabel}（共 {analyticsSummary.count} 筆記帳）
          </Text>
          <Text style={styles.analyticsFilterChangeBtnText}>
            切換 ▾
          </Text>
        </TouchableOpacity>
      </View>

      {/* 統計總覽指標卡 */}
      <View style={styles.analyticsOverviewCard}>
        <View style={styles.analyticsOverviewHeader}>
          <Text style={styles.analyticsOverviewTitle}>
            💳 {analyticsMonthLabel} 收支總覽
          </Text>
          <View style={styles.analyticsOverviewBadge}>
            <Text style={styles.analyticsOverviewBadgeText}>
              {analyticsSummary.count} 筆紀錄
            </Text>
          </View>
        </View>

        <View style={styles.analyticsOverviewGrid}>
          {/* 總支出 */}
          <View style={styles.analyticsOverviewItem}>
            <Text style={styles.analyticsOverviewItemLabel}>
              💸 總支出
            </Text>
            <Text style={[styles.analyticsOverviewItemVal, styles.expenseColor]}>
              NT$ {analyticsSummary.totalExpense.toLocaleString()}
            </Text>
          </View>

          {/* 總收入 */}
          <View style={styles.analyticsOverviewItem}>
            <Text style={styles.analyticsOverviewItemLabel}>
              💰 總收入
            </Text>
            <Text style={[styles.analyticsOverviewItemVal, styles.incomeColor]}>
              NT$ {analyticsSummary.totalIncome.toLocaleString()}
            </Text>
          </View>

          {/* 本期結餘 */}
          <View style={styles.analyticsOverviewItem}>
            <Text style={styles.analyticsOverviewItemLabel}>
              ⚖️ 本期結餘
            </Text>
            <Text
              style={[
                styles.analyticsOverviewItemVal,
                analyticsSummary.netBalance >= 0 ? styles.balancePositive : styles.balanceNegative,
              ]}
            >
              {analyticsSummary.netBalance >= 0 ? '+' : ''}NT$ {analyticsSummary.netBalance.toLocaleString()}
            </Text>
          </View>

          {/* 日均開銷 */}
          <View style={styles.analyticsOverviewItem}>
            <Text style={styles.analyticsOverviewItemLabel}>
              📅 日均支出
            </Text>
            <Text style={styles.analyticsOverviewItemVal}>
              NT$ {dailyAverageExpense.toLocaleString()}
            </Text>
          </View>
        </View>
      </View>

      {/* 📈 近 6 個月走勢圖與 MoM 同期比較看板 */}
      <TrendChartsWidget
        selectedMonthYm={analyticsMonth === 'all' || /^\d{4}$/.test(analyticsMonth) ? currentMonthYm : analyticsMonth}
        onSelectMonth={(ym) => setAnalyticsMonth(ym)}
      />

      {/* 各成員付款支出比例 */}
      <View style={styles.cardSection}>
        <View style={styles.sectionHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardSectionTitle}>
              👨‍👩‍👧 各成員付款支出比例
            </Text>
            <Text style={styles.cardSectionDesc}>
              依付款金額由高到低排序，掌握家庭開銷的付款貢獻
            </Text>
          </View>
        </View>

        <View style={styles.memberPayList}>
          {analyticsMemberPaymentRanking.map(member => {
            const hasPaid = member.paid > 0;
            const rankBadge =
              member.paid > 0
                ? member.rank === 1
                  ? '🥇'
                  : member.rank === 2
                  ? '🥈'
                  : member.rank === 3
                  ? '🥉'
                  : `#${member.rank}`
                : '-';

            return (
              <View
                key={member.id}
                style={[
                  styles.memberPayCard,
                  !hasPaid && styles.memberPayCardZero,
                ]}
              >
                <View style={styles.memberPayTopRow}>
                  <View style={styles.memberInfo}>
                    <Text
                      style={[styles.memberRankText, member.rank <= 3 && hasPaid && styles.memberRankTextTop]}
                    >
                      {rankBadge}
                    </Text>
                    <MemberAvatar avatar={member.avatar_url} size={22} style={styles.memberAvatar} />
                    <Text
                      style={styles.memberName}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {member.display_name}
                    </Text>
                    {member.isCurrent && (
                      <View style={styles.meBadge}>
                        <Text style={styles.meBadgeText}>我</Text>
                      </View>
                    )}
                    {member.rank === 1 && hasPaid && (
                      <View style={styles.topPayerBadge}>
                        <Text style={styles.topPayerBadgeText}>👑 付款主力</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.memberAmountBox}>
                    <Text style={[styles.memberAmount, !hasPaid && styles.memberAmountZero]}>
                      NT$ {member.paid.toLocaleString()}
                    </Text>
                    <Text style={styles.memberRatio}>{member.ratio}%</Text>
                  </View>
                </View>

                {/* 彩色進度比例長條圖 */}
                <View style={styles.progressBarBg}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${Math.min(100, Math.max(hasPaid ? 3 : 0, member.ratioNum))}%`,
                        backgroundColor: hasPaid ? member.color : '#E2E8F0',
                      },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* 分類收支排行 */}
      <View style={styles.cardSection}>
        <View style={styles.sectionHeaderRow}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.cardSectionTitle}>
              {analyticsCategoryType === 'expense' ? '📊 支出分類排行' : '💰 收入分類排行'}
              {analyticsCategoryRanking.length > 0 ? ` (${analyticsCategoryRanking.length}項)` : ''}
            </Text>
            <Text style={styles.cardSectionDesc}>
              {analyticsCategoryType === 'expense'
                ? '依開銷金額由高到低自動排序，掌握最大花費去向'
                : '依進帳金額由高到低自動排序，掌握家庭資金來源'}
            </Text>
          </View>

          {/* 支出 / 收入 切換按鈕 */}
          <View style={styles.typeToggleContainer}>
            <TouchableOpacity
              style={[
                styles.typeToggleBtn,
                analyticsCategoryType === 'expense' && styles.typeToggleBtnActiveExpense,
              ]}
              onPress={() => setAnalyticsCategoryType('expense')}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.typeToggleText,
                  analyticsCategoryType === 'expense' && styles.typeToggleTextActive,
                ]}
              >
                支出
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.typeToggleBtn,
                analyticsCategoryType === 'income' && styles.typeToggleBtnActiveIncome,
              ]}
              onPress={() => setAnalyticsCategoryType('income')}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.typeToggleText,
                  analyticsCategoryType === 'income' && styles.typeToggleTextActive,
                ]}
              >
                收入
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {analyticsCategoryRanking.length === 0 ? (
          <View style={styles.analyticsEmptyBox}>
            <Text style={styles.analyticsEmptyEmoji}>🍃</Text>
            <Text style={styles.analyticsEmptyText}>
              {analyticsCategoryType === 'expense' ? '本期尚無支出紀錄' : '本期尚無收入紀錄'}
            </Text>
          </View>
        ) : (
          analyticsCategoryRanking.map(item => {
            const rankIcon =
              item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : `#${item.rank}`;

            return (
              <View key={item.id} style={styles.categoryStatRow}>
                <View style={styles.catHeader}>
                  <View style={styles.catNameRow}>
                    <Text
                      style={[styles.catRankBadge, item.rank <= 3 && styles.catRankBadgeTop]}
                    >
                      {rankIcon}
                    </Text>
                    <Text
                      style={styles.catName}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {getCategoryIcon(item.icon)} {item.name}
                    </Text>
                    <Text style={styles.catCountText}>({item.count}筆)</Text>
                    {currentBudget?.is_enabled && currentBudget?.category_budgets?.[item.id] && analyticsCategoryType === 'expense' && (
                      <View
                        style={{
                          backgroundColor:
                            item.amount > currentBudget.category_budgets[item.id]
                              ? isDark
                                ? 'rgba(239, 68, 68, 0.2)'
                                : '#FEE2E2'
                              : isDark
                              ? 'rgba(79, 70, 229, 0.2)'
                              : '#EEF2FF',
                          paddingHorizontal: 5,
                          paddingVertical: 1,
                          borderRadius: 4,
                          marginLeft: 4,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 9.5,
                            fontWeight: '700',
                            color:
                              item.amount > currentBudget.category_budgets[item.id]
                                ? '#EF4444'
                                : isDark
                                ? '#818CF8'
                                : '#4F46E5',
                          }}
                        >
                          {item.amount > currentBudget.category_budgets[item.id]
                            ? `⚠️ 超支 $${(item.amount - currentBudget.category_budgets[item.id]).toLocaleString()}`
                            : `上限 $${currentBudget.category_budgets[item.id].toLocaleString()}`}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.catAmount,
                      analyticsCategoryType === 'income' && styles.incomeColor,
                    ]}
                  >
                    NT$ {item.amount.toLocaleString()}{' '}
                    <Text
                      style={[
                        styles.catPercentage,
                        analyticsCategoryType === 'income' && styles.incomeColor,
                      ]}
                    >
                      ({item.percentage}%)
                    </Text>
                  </Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${Math.min(100, Math.max(3, item.percentage))}%`,
                        backgroundColor:
                          item.color ||
                          (analyticsCategoryType === 'income' ? '#10B981' : '#4F46E5'),
                      },
                    ]}
                  />
                </View>
              </View>
            );
          })
        )}
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
    analyticsFilterBox: {
      backgroundColor: isDark ? colors.background.card : '#FFFFFF',
      borderRadius: 16,
      paddingVertical: 12,
      paddingHorizontal: 12,
      marginBottom: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    analyticsFilterScroll: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
      paddingHorizontal: 2,
    },
    analyticsFilterChip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
    },
    analyticsFilterChipActive: {
      backgroundColor: '#4F46E5',
    },
    analyticsFilterText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text.muted,
    },
    analyticsFilterTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    analyticsFilterSelectMoreChip: {
      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.15)' : '#EEF2FF',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(79, 70, 229, 0.35)' : '#C7D2FE',
    },
    analyticsFilterSelectMoreText: {
      fontSize: 13,
      fontWeight: '700',
      color: isDark ? '#818CF8' : '#4F46E5',
    },
    analyticsFilterStatusRow: {
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border.default,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    analyticsFilterStatusText: {
      fontSize: 12,
      color: isDark ? '#818CF8' : '#6366F1',
      fontWeight: '600',
      flex: 1,
    },
    analyticsFilterChangeBtnText: {
      fontSize: 12,
      color: isDark ? '#818CF8' : '#4F46E5',
      fontWeight: '700',
      marginLeft: 6,
    },
    analyticsOverviewCard: {
      backgroundColor: isDark ? colors.background.card : '#FFFFFF',
      borderRadius: 18,
      padding: 16,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    analyticsOverviewHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.default,
    },
    analyticsOverviewTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text.primary,
    },
    analyticsOverviewBadge: {
      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.15)' : '#EEF2FF',
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 10,
    },
    analyticsOverviewBadgeText: {
      fontSize: 11,
      fontWeight: '600',
      color: isDark ? '#818CF8' : '#4F46E5',
    },
    analyticsOverviewGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    analyticsOverviewItem: {
      width: '48%',
      backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
      borderRadius: 12,
      padding: 10,
    },
    analyticsOverviewItemLabel: {
      fontSize: 11,
      color: colors.text.muted,
      fontWeight: '600',
      marginBottom: 4,
    },
    analyticsOverviewItemVal: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.text.primary,
    },
    expenseColor: {
      color: isDark ? '#F87171' : '#EF4444',
    },
    incomeColor: {
      color: '#10B981',
    },
    balancePositive: {
      color: isDark ? '#38BDF8' : '#0284C7',
    },
    balanceNegative: {
      color: isDark ? '#F87171' : '#DC2626',
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
    cardSectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text.primary,
    },
    cardSectionDesc: {
      fontSize: 12,
      color: colors.text.muted,
      marginTop: 2,
      marginBottom: 14,
    },
    memberPayList: {
      gap: 12,
    },
    memberPayCard: {
      backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
      padding: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    memberPayCardZero: {
      backgroundColor: isDark ? colors.background.cardSubtle : '#FAFAFA',
      borderColor: colors.border.default,
      opacity: 0.75,
    },
    memberPayTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    memberInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: 8,
    },
    memberRankText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text.muted,
      minWidth: 18,
      textAlign: 'center',
      marginRight: 4,
    },
    memberRankTextTop: {
      fontSize: 15,
    },
    memberAvatar: {
      fontSize: 22,
      marginRight: 8,
    },
    memberName: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
      flexShrink: 1,
    },
    meBadge: {
      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.15)' : '#EEF2FF',
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 6,
      marginLeft: 4,
    },
    meBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: isDark ? '#818CF8' : '#4F46E5',
    },
    topPayerBadge: {
      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 8,
      marginLeft: 6,
    },
    topPayerBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: isDark ? '#FBBF24' : '#B45309',
    },
    memberAmountBox: {
      alignItems: 'flex-end',
    },
    memberAmount: {
      fontSize: 15,
      fontWeight: '700',
      color: isDark ? '#F87171' : '#EF4444',
    },
    memberAmountZero: {
      color: colors.text.muted,
    },
    memberRatio: {
      fontSize: 11,
      color: colors.text.muted,
      marginTop: 2,
    },
    progressBarBg: {
      height: 8,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
      borderRadius: 4,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      borderRadius: 4,
    },
    typeToggleContainer: {
      flexDirection: 'row',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
      borderRadius: 12,
      padding: 3,
      alignItems: 'center',
    },
    typeToggleBtn: {
      paddingVertical: 5,
      paddingHorizontal: 12,
      borderRadius: 9,
      backgroundColor: 'transparent',
    },
    typeToggleBtnActiveExpense: {
      backgroundColor: '#EF4444',
    },
    typeToggleBtnActiveIncome: {
      backgroundColor: '#10B981',
    },
    typeToggleText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text.muted,
    },
    typeToggleTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    analyticsEmptyBox: {
      alignItems: 'center',
      paddingVertical: 24,
    },
    analyticsEmptyEmoji: {
      fontSize: 32,
      marginBottom: 6,
    },
    analyticsEmptyText: {
      fontSize: 13,
      color: colors.text.muted,
      fontWeight: '500',
    },
    categoryStatRow: {
      marginBottom: 12,
    },
    catHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    catNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flex: 1,
      marginRight: 8,
    },
    catRankBadge: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text.muted,
      minWidth: 20,
      textAlign: 'center',
    },
    catRankBadgeTop: {
      fontSize: 15,
    },
    catName: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    catCountText: {
      fontSize: 11,
      color: colors.text.muted,
      fontWeight: '500',
    },
    catAmount: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text.muted,
    },
    catPercentage: {
      fontSize: 12,
      fontWeight: '700',
      color: isDark ? '#818CF8' : '#4F46E5',
    },
  });
