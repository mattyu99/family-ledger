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
import { TrendChartsWidget } from '../components/TrendChartsWidget';
import { MemberAvatar } from '../components/MemberAvatar';
import { HorizontalScrollView } from '../components/HorizontalScrollView';
import { getCategoryIcon } from '../lib/icons';
import { buildAnalyticsTrendSeries } from '../lib/analyticsTrend';
import { isValidMerchantName, stripMemoInternalTag } from '../lib/memo';
import { stripInvoiceTag } from '../lib/invoice';
import { Transaction } from '../types';

const COLLAPSED_CATEGORY_LIMIT = 6;
const TOP_TX_PREVIEW_LIMIT = 5;

function getLocalYm(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthDayLabel(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function formatPureTxLabel(tx: Transaction, fallbackCategoryName: string): string {
  const merchantPart = isValidMerchantName(tx.merchant) ? tx.merchant!.trim() : '';
  const cleanedNote = stripMemoInternalTag(stripInvoiceTag(tx.note || ''))
    .split(/\r?\n/)[0]
    .trim();

  if (merchantPart && cleanedNote) {
    if (cleanedNote === merchantPart || cleanedNote.startsWith(merchantPart)) {
      return cleanedNote;
    }
    return `${merchantPart} · ${cleanedNote}`;
  }
  return merchantPart || cleanedNote || fallbackCategoryName;
}

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

  const [analyticsScope, setAnalyticsScope] = useState<'all' | 'my'>('all');
  const [analyticsCategoryType, setAnalyticsCategoryType] = useState<'expense' | 'income'>('expense');
  const [isCategoriesExpanded, setIsCategoriesExpanded] = useState(false);
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);

  const handleScopeChange = (nextScope: 'all' | 'my') => {
    setAnalyticsScope(nextScope);
    setIsCategoriesExpanded(false);
    setExpandedCategoryId(null);
  };

  const handleMonthChange = (nextMonth: string) => {
    setAnalyticsMonth(nextMonth);
    setIsCategoriesExpanded(false);
    setExpandedCategoryId(null);
  };

  const handleCategoryTypeChange = (nextType: 'expense' | 'income') => {
    setAnalyticsCategoryType(nextType);
    setIsCategoriesExpanded(false);
    setExpandedCategoryId(null);
  };

  const currentYearNum = new Date().getFullYear();

  const currentMonthYm = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const lastMonthYm = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const isMatchedToCurrentUser = useMemo(() => {
    return (paidById?: string) => {
      if (!paidById) return false;
      if (paidById === currentUser?.id) return true;
      const mem = getMemberById(paidById);
      if (mem && currentUser?.display_name && mem.display_name === currentUser.display_name) {
        return true;
      }
      return false;
    };
  }, [currentUser, getMemberById]);

  const scopedAllTransactions = useMemo(() => {
    if (analyticsScope === 'all') return transactions;
    return transactions.filter(t => isMatchedToCurrentUser(t.paid_by));
  }, [transactions, analyticsScope, isMatchedToCurrentUser]);

  const hasLastYearData = useMemo(() => {
    const targetYear = currentYearNum - 1;
    return scopedAllTransactions.some(t => {
      if (!t.transacted_at) return false;
      const d = new Date(t.transacted_at);
      return !isNaN(d.getTime()) && d.getFullYear() === targetYear;
    });
  }, [scopedAllTransactions, currentYearNum]);

  const isSingleMonth = /^\d{4}-\d{2}$/.test(analyticsMonth);

  const analyticsTransactions = useMemo(() => {
    if (analyticsMonth === 'all') return scopedAllTransactions;
    const isYear = /^\d{4}$/.test(analyticsMonth);
    const targetYear = isYear ? parseInt(analyticsMonth, 10) : 0;
    return scopedAllTransactions.filter(t => {
      if (!t.transacted_at) return false;
      const d = new Date(t.transacted_at);
      if (isNaN(d.getTime())) return false;
      if (isYear) {
        return d.getFullYear() === targetYear;
      }
      return getLocalYm(t.transacted_at) === analyticsMonth;
    });
  }, [scopedAllTransactions, analyticsMonth]);

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
      if (year === currentYearNum) {
        return `今年 (${year} 全年)`;
      }
      return `${year} 全年`;
    }
    if (analyticsMonth === currentMonthYm) {
      const parts = currentMonthYm.split('-');
      return `本月 (${parts[0]}年${parseInt(parts[1], 10)}月)`;
    }
    if (analyticsMonth === lastMonthYm) {
      const parts = lastMonthYm.split('-');
      return `上月 (${parts[0]}年${parseInt(parts[1], 10)}月)`;
    }
    if (analyticsMonth && analyticsMonth.includes('-')) {
      const parts = analyticsMonth.split('-');
      return `${parts[0]} 年 ${parseInt(parts[1], 10)} 月`;
    }
    return analyticsMonth;
  }, [analyticsMonth, currentMonthYm, lastMonthYm, currentYearNum]);

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

  // 依據目前視角（全家 / 僅看我）與篩選期間以本地時區建構收支走勢圖資料
  const trendSeries = useMemo(
    () => buildAnalyticsTrendSeries(scopedAllTransactions, analyticsMonth),
    [scopedAllTransactions, analyticsMonth]
  );

  // 單月檢視下的較上月增減與分類變動洞察（與目前視角同步）
  const singleMonthComparison = useMemo(() => {
    if (!isSingleMonth) return null;

    const [yearStr, monthStr] = analyticsMonth.split('-');
    let y = parseInt(yearStr, 10);
    let m = parseInt(monthStr, 10) - 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
    const prevYm = `${y}-${String(m).padStart(2, '0')}`;

    let currentExpense = 0;
    let currentIncome = 0;
    let prevExpense = 0;
    let prevIncome = 0;

    const catMetaMap = new Map<string, { name: string; icon: string }>();
    const currentCatExpense: Record<string, number> = {};
    const prevCatExpense: Record<string, number> = {};

    scopedAllTransactions.forEach(t => {
      const tYm = getLocalYm(t.transacted_at);
      if (tYm !== analyticsMonth && tYm !== prevYm) return;
      const amt = Number(t.amount) || 0;

      if (tYm === analyticsMonth) {
        if (t.type === 'expense') {
          currentExpense += amt;
          const resolved = getCategoryById(t.category_id, t.category);
          const key = resolved?.id || resolved?.name || 'uncategorized';
          if (!catMetaMap.has(key)) {
            catMetaMap.set(key, {
              name: resolved?.name || '其他未分類',
              icon: resolved?.icon || 'tag',
            });
          }
          currentCatExpense[key] = (currentCatExpense[key] || 0) + amt;
        } else if (t.type === 'income') {
          currentIncome += amt;
        }
      } else {
        if (t.type === 'expense') {
          prevExpense += amt;
          const resolved = getCategoryById(t.category_id, t.category);
          const key = resolved?.id || resolved?.name || 'uncategorized';
          if (!catMetaMap.has(key)) {
            catMetaMap.set(key, {
              name: resolved?.name || '其他未分類',
              icon: resolved?.icon || 'tag',
            });
          }
          prevCatExpense[key] = (prevCatExpense[key] || 0) + amt;
        } else if (t.type === 'income') {
          prevIncome += amt;
        }
      }
    });

    const expenseDiff = currentExpense - prevExpense;
    const expenseDiffRate = prevExpense > 0 ? Math.round((expenseDiff / prevExpense) * 1000) / 10 : null;
    const incomeDiff = currentIncome - prevIncome;
    const incomeDiffRate = prevIncome > 0 ? Math.round((incomeDiff / prevIncome) * 1000) / 10 : null;

    const allCatIds = Array.from(new Set([...Object.keys(currentCatExpense), ...Object.keys(prevCatExpense)]));
    let topIncreasedCategory: { name: string; icon: string; diff: number } | undefined;
    let topDecreasedCategory: { name: string; icon: string; diff: number } | undefined;
    let maxIncDiff = 0;
    let maxDecDiff = 0;

    allCatIds.forEach(catId => {
      const diff = (currentCatExpense[catId] || 0) - (prevCatExpense[catId] || 0);
      const meta = catMetaMap.get(catId) || { name: '其他未分類', icon: 'tag' };
      if (diff > maxIncDiff && diff > 0) {
        maxIncDiff = diff;
        topIncreasedCategory = { name: meta.name, icon: meta.icon, diff };
      }
      if (diff < maxDecDiff && diff < 0) {
        maxDecDiff = diff;
        topDecreasedCategory = { name: meta.name, icon: meta.icon, diff: Math.abs(diff) };
      }
    });

    return {
      prevYm,
      prevExpense,
      prevIncome,
      expenseDiff,
      expenseDiffRate,
      incomeDiff,
      incomeDiffRate,
      topIncreasedCategory,
      topDecreasedCategory,
    };
  }, [isSingleMonth, analyticsMonth, scopedAllTransactions, getCategoryById]);

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

  const activePayingMembers = useMemo(
    () => analyticsMemberPaymentRanking.filter(m => m.paid > 0),
    [analyticsMemberPaymentRanking]
  );
  const zeroPayingMembers = useMemo(
    () => analyticsMemberPaymentRanking.filter(m => m.paid === 0),
    [analyticsMemberPaymentRanking]
  );

  // 分類收支排行（附帶該分類最高前 5 筆明細以供點擊展開）
  const analyticsCategoryRanking = useMemo(() => {
    const totalAmount =
      analyticsCategoryType === 'expense'
        ? analyticsSummary.totalExpense
        : analyticsSummary.totalIncome;

    if (totalAmount === 0) return [];

    const categoryMap = new Map<
      string,
      {
        id: string;
        name: string;
        icon: string;
        color: string;
        amount: number;
        count: number;
        txList: Transaction[];
      }
    >();

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
          existing.txList.push(t);
        } else {
          categoryMap.set(key, {
            id: key,
            name: resolvedCat.name || '其他未分類',
            icon: resolvedCat.icon || 'tag',
            color: resolvedCat.color || (analyticsCategoryType === 'income' ? '#10B981' : '#6366F1'),
            amount: amt,
            count: 1,
            txList: [t],
          });
        }
      }
    });

    return Array.from(categoryMap.values())
      .sort((a, b) => b.amount - a.amount)
      .map((item, index) => {
        const percentage = totalAmount > 0 ? Number(((item.amount / totalAmount) * 100).toFixed(1)) : 0;
        const topTransactions = [...item.txList]
          .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))
          .slice(0, TOP_TX_PREVIEW_LIMIT);

        return {
          id: item.id,
          name: item.name,
          icon: item.icon,
          color: item.color,
          amount: item.amount,
          count: item.count,
          rank: index + 1,
          percentage,
          topTransactions,
        };
      });
  }, [
    analyticsTransactions,
    analyticsCategoryType,
    analyticsSummary.totalExpense,
    analyticsSummary.totalIncome,
    getCategoryById,
  ]);

  const visibleCategories = isCategoriesExpanded
    ? analyticsCategoryRanking
    : analyticsCategoryRanking.slice(0, COLLAPSED_CATEGORY_LIMIT);
  const hiddenCategoryCount = Math.max(0, analyticsCategoryRanking.length - COLLAPSED_CATEGORY_LIMIT);

  const isPresetPeriod =
    analyticsMonth === currentMonthYm ||
    analyticsMonth === lastMonthYm ||
    analyticsMonth === String(currentYearNum) ||
    (hasLastYearData && analyticsMonth === String(currentYearNum - 1)) ||
    analyticsMonth === 'all';

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollPadding}>
      {/* 頂部精簡控制卡：全家/個人切換 ＋ 常用時間篩選 */}
      <View style={styles.analyticsFilterBox}>
        <View style={styles.scopeToggleRow}>
          <TouchableOpacity
            style={[styles.scopeTab, analyticsScope === 'all' && styles.scopeTabActive]}
            onPress={() => handleScopeChange('all')}
            activeOpacity={0.7}
          >
            <Text
              style={[styles.scopeTabText, analyticsScope === 'all' && styles.scopeTabTextActive]}
              allowFontScaling={false}
              maxFontSizeMultiplier={1.08}
            >
              👨‍👩‍👧‍👦 全家統計
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.scopeTab, analyticsScope === 'my' && styles.scopeTabActive]}
            onPress={() => handleScopeChange('my')}
            activeOpacity={0.7}
          >
            <Text
              style={[styles.scopeTabText, analyticsScope === 'my' && styles.scopeTabTextActive]}
              allowFontScaling={false}
              maxFontSizeMultiplier={1.08}
            >
              👤 僅看我 ({currentUser?.display_name || '本人'})
            </Text>
          </TouchableOpacity>
        </View>

        <HorizontalScrollView
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.analyticsFilterScroll}
        >
          <TouchableOpacity
            style={[
              styles.analyticsFilterChip,
              analyticsMonth === currentMonthYm && styles.analyticsFilterChipActive,
            ]}
            onPress={() => handleMonthChange(currentMonthYm)}
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

          <TouchableOpacity
            style={[
              styles.analyticsFilterChip,
              analyticsMonth === lastMonthYm && styles.analyticsFilterChipActive,
            ]}
            onPress={() => handleMonthChange(lastMonthYm)}
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

          <TouchableOpacity
            style={[
              styles.analyticsFilterChip,
              analyticsMonth === String(currentYearNum) && styles.analyticsFilterChipActive,
            ]}
            onPress={() => handleMonthChange(String(currentYearNum))}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.analyticsFilterText,
                analyticsMonth === String(currentYearNum) && styles.analyticsFilterTextActive,
              ]}
            >
              🗓️ 今年 ({currentYearNum})
            </Text>
          </TouchableOpacity>

          {hasLastYearData && (
            <TouchableOpacity
              style={[
                styles.analyticsFilterChip,
                analyticsMonth === String(currentYearNum - 1) && styles.analyticsFilterChipActive,
              ]}
              onPress={() => handleMonthChange(String(currentYearNum - 1))}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.analyticsFilterText,
                  analyticsMonth === String(currentYearNum - 1) && styles.analyticsFilterTextActive,
                ]}
              >
                🗓️ 去年 ({currentYearNum - 1})
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.analyticsFilterChip,
              analyticsMonth === 'all' && styles.analyticsFilterChipActive,
            ]}
            onPress={() => handleMonthChange('all')}
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

          {!isPresetPeriod && (
            <TouchableOpacity
              style={[styles.analyticsFilterChip, styles.analyticsFilterChipActive]}
              onPress={onOpenMonthPicker}
              activeOpacity={0.7}
            >
              <Text style={[styles.analyticsFilterText, styles.analyticsFilterTextActive]}>
                🗓️ {analyticsMonthLabel}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.analyticsFilterChip, styles.analyticsFilterSelectMoreChip]}
            onPress={onOpenMonthPicker}
            activeOpacity={0.7}
          >
            <Text style={styles.analyticsFilterSelectMoreText}>
              🔍 指定月份/年份 ▾
            </Text>
          </TouchableOpacity>
        </HorizontalScrollView>
      </View>

      {/* 統計總覽指標卡（整合較上月增減與快速切換入口） */}
      <View style={styles.analyticsOverviewCard}>
        <View style={styles.analyticsOverviewHeader}>
          <Text style={styles.analyticsOverviewTitle}>
            💳 {analyticsMonthLabel}
            {analyticsScope === 'my' ? ' · 個人' : ''} 收支總覽
          </Text>
          <TouchableOpacity
            style={styles.analyticsOverviewBadge}
            onPress={onOpenMonthPicker}
            activeOpacity={0.75}
          >
            <Text style={styles.analyticsOverviewBadgeText}>
              {analyticsSummary.count} 筆 · 切換 ▾
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.overviewRow}>
          {/* 總支出 */}
          <View style={styles.analyticsOverviewItem}>
            <Text style={styles.analyticsOverviewItemLabel}>💸 總支出</Text>
            <Text
              style={[styles.analyticsOverviewItemVal, styles.expenseColor]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
            >
              NT$ {analyticsSummary.totalExpense.toLocaleString()}
            </Text>
            {singleMonthComparison && (
              <View
                style={[
                  styles.overviewDeltaBadge,
                  {
                    backgroundColor:
                      singleMonthComparison.expenseDiff > 0
                        ? isDark
                          ? 'rgba(239, 68, 68, 0.18)'
                          : '#FEF2F2'
                        : singleMonthComparison.expenseDiff < 0
                        ? isDark
                          ? 'rgba(16, 185, 129, 0.18)'
                          : '#F0FDF4'
                        : isDark
                        ? 'rgba(148, 163, 184, 0.16)'
                        : '#F1F5F9',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.overviewDeltaText,
                    {
                      color:
                        singleMonthComparison.expenseDiff > 0
                          ? isDark
                            ? '#FCA5A5'
                            : '#DC2626'
                          : singleMonthComparison.expenseDiff < 0
                          ? isDark
                            ? '#4ADE80'
                            : '#15803D'
                          : colors.text.muted,
                    },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  {singleMonthComparison.expenseDiff === 0
                    ? '➖ 與上月持平'
                    : singleMonthComparison.expenseDiff > 0
                    ? singleMonthComparison.expenseDiffRate !== null
                      ? `🔺 較上月 +${singleMonthComparison.expenseDiffRate}%`
                      : `🔺 較上月 +$${singleMonthComparison.expenseDiff.toLocaleString()}`
                    : singleMonthComparison.expenseDiffRate !== null
                    ? `📉 較上月 ${singleMonthComparison.expenseDiffRate}%`
                    : `📉 較上月 -$${Math.abs(singleMonthComparison.expenseDiff).toLocaleString()}`}
                </Text>
              </View>
            )}
          </View>

          {/* 總收入 */}
          <View style={styles.analyticsOverviewItem}>
            <Text style={styles.analyticsOverviewItemLabel}>💰 總收入</Text>
            <Text
              style={[styles.analyticsOverviewItemVal, styles.incomeColor]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
            >
              NT$ {analyticsSummary.totalIncome.toLocaleString()}
            </Text>
            {singleMonthComparison && (
              <View
                style={[
                  styles.overviewDeltaBadge,
                  {
                    backgroundColor:
                      singleMonthComparison.incomeDiff > 0
                        ? isDark
                          ? 'rgba(16, 185, 129, 0.18)'
                          : '#F0FDF4'
                        : singleMonthComparison.incomeDiff < 0
                        ? isDark
                          ? 'rgba(245, 158, 11, 0.18)'
                          : '#FFFBEB'
                        : isDark
                        ? 'rgba(148, 163, 184, 0.16)'
                        : '#F1F5F9',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.overviewDeltaText,
                    {
                      color:
                        singleMonthComparison.incomeDiff > 0
                          ? isDark
                            ? '#4ADE80'
                            : '#15803D'
                          : singleMonthComparison.incomeDiff < 0
                          ? isDark
                            ? '#FBBF24'
                            : '#B45309'
                          : colors.text.muted,
                    },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  {singleMonthComparison.incomeDiff === 0
                    ? '➖ 與上月持平'
                    : singleMonthComparison.incomeDiff > 0
                    ? singleMonthComparison.incomeDiffRate !== null
                      ? `📈 較上月 +${singleMonthComparison.incomeDiffRate}%`
                      : `📈 較上月 +$${singleMonthComparison.incomeDiff.toLocaleString()}`
                    : singleMonthComparison.incomeDiffRate !== null
                    ? `📉 較上月 ${singleMonthComparison.incomeDiffRate}%`
                    : `📉 較上月 -$${Math.abs(singleMonthComparison.incomeDiff).toLocaleString()}`}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={[styles.overviewRow, { marginTop: 8 }]}>
          {/* 本期結餘 */}
          <View style={styles.analyticsOverviewItem}>
            <Text style={styles.analyticsOverviewItemLabel}>⚖️ 本期結餘</Text>
            <Text
              style={[
                styles.analyticsOverviewItemVal,
                analyticsSummary.netBalance >= 0 ? styles.balancePositive : styles.balanceNegative,
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
            >
              {analyticsSummary.netBalance >= 0 ? '+' : ''}NT$ {analyticsSummary.netBalance.toLocaleString()}
            </Text>
          </View>

          {/* 日均支出 */}
          <View style={styles.analyticsOverviewItem}>
            <Text style={styles.analyticsOverviewItemLabel}>📅 日均支出</Text>
            <Text
              style={styles.analyticsOverviewItemVal}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
            >
              NT$ {dailyAverageExpense.toLocaleString()}
            </Text>
          </View>
        </View>
      </View>

      {/* 📈 隨篩選期間聯動的收支走勢圖與較上月分類變動洞察 */}
      <TrendChartsWidget
        selectedMonthYm={isSingleMonth ? analyticsMonth : currentMonthYm}
        selectedKey={trendSeries.selectedKey}
        onSelectMonth={handleMonthChange}
        trendDataOverride={trendSeries.items}
        title={trendSeries.title}
        subtitle={trendSeries.subtitle}
        compact={trendSeries.compact}
        momOverride={singleMonthComparison}
        showComparison={isSingleMonth}
        isMonthSelected={isSingleMonth}
        scopeLabel={analyticsScope === 'my' ? '個人' : undefined}
      />

      {/* 👨‍👩‍👧 各成員付款支出比例（僅全家視角顯示） */}
      {analyticsScope === 'all' && (
        <View style={styles.cardSection}>
          <Text style={styles.cardSectionTitle}>👨‍👩‍👧 各成員付款支出比例</Text>
          <Text style={styles.cardSectionDesc}>
            依實際付款金額由高到低排序，掌握家庭開銷貢獻
          </Text>

          {activePayingMembers.length === 0 ? (
            <View style={styles.analyticsEmptyBox}>
              <Text style={styles.analyticsEmptyEmoji}>🍃</Text>
              <Text style={styles.analyticsEmptyText}>本期尚無成員支出紀錄</Text>
            </View>
          ) : (
            <View style={styles.memberPayList}>
              {activePayingMembers.map(member => {
                const rankBadge =
                  member.rank === 1
                    ? '🥇'
                    : member.rank === 2
                    ? '🥈'
                    : member.rank === 3
                    ? '🥉'
                    : `#${member.rank}`;

                return (
                  <View key={member.id} style={styles.memberPayCard}>
                    {/* 第一行：名次＋頭像＋名字＋我 ｜ 金額 */}
                    <View style={styles.memberPayTopRow}>
                      <View style={styles.memberInfo}>
                        <Text
                          style={[
                            styles.memberRankText,
                            member.rank <= 3 && styles.memberRankTextTop,
                          ]}
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
                      </View>
                      <Text style={styles.memberAmount}>
                        NT$ {member.paid.toLocaleString()}
                      </Text>
                    </View>

                    {/* 第二行：付款主力徽章 ｜ 佔比 */}
                    <View style={styles.memberMetaRow}>
                      <View style={styles.memberMetaLeft}>
                        {member.rank === 1 && (
                          <View style={styles.topPayerBadge}>
                            <Text style={styles.topPayerBadgeText}>👑 付款主力</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.memberRatio}>佔比 {member.ratio}%</Text>
                    </View>

                    {/* 彩色進度比例長條圖 */}
                    <View style={styles.progressBarBg}>
                      <View
                        style={[
                          styles.progressBarFill,
                          {
                            width: `${Math.min(100, Math.max(3, member.ratioNum))}%`,
                            backgroundColor: member.color,
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}

              {zeroPayingMembers.length > 0 && (
                <View style={styles.zeroMembersFooter}>
                  <Text style={styles.zeroMembersText}>
                    💤 本期尚無支出：{zeroPayingMembers.map(m => m.display_name).join('、')}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {/* 📊 分類收支排行（支援預設收合與點擊展開前 5 筆高消費明細） */}
      <View style={styles.cardSection}>
        <View style={styles.sectionHeaderWrapRow}>
          <Text style={styles.cardSectionTitle}>
            {analyticsCategoryType === 'expense' ? '📊 支出分類排行' : '💰 收入分類排行'}
            {analyticsCategoryRanking.length > 0 ? ` (${analyticsCategoryRanking.length}項)` : ''}
          </Text>

          {/* 支出 / 收入 切換按鈕 */}
          <View style={styles.typeToggleContainer}>
            <TouchableOpacity
              style={[
                styles.typeToggleBtn,
                analyticsCategoryType === 'expense' && styles.typeToggleBtnActiveExpense,
              ]}
              onPress={() => handleCategoryTypeChange('expense')}
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
              onPress={() => handleCategoryTypeChange('income')}
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

        <Text style={styles.cardSectionDesc}>
          {analyticsCategoryType === 'expense'
            ? '依花費金額排序，點擊任一分類可查看前 5 筆最高消費'
            : '依進帳金額排序，點擊任一分類可查看前 5 筆最高入帳'}
        </Text>

        {analyticsCategoryRanking.length === 0 ? (
          <View style={styles.analyticsEmptyBox}>
            <Text style={styles.analyticsEmptyEmoji}>🍃</Text>
            <Text style={styles.analyticsEmptyText}>
              {analyticsCategoryType === 'expense' ? '本期尚無支出紀錄' : '本期尚無收入紀錄'}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.categoryList}>
              {visibleCategories.map((item, idx) => {
                const rankIcon =
                  item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : `#${item.rank}`;
                const isExpanded = expandedCategoryId === item.id;
                const isLastItem = idx === visibleCategories.length - 1;
                const catBudgetLimit =
                  isSingleMonth &&
                  analyticsScope === 'all' &&
                  analyticsCategoryType === 'expense' &&
                  currentBudget?.is_enabled
                    ? currentBudget.category_budgets?.[item.id]
                    : undefined;
                const isOverBudget = Boolean(catBudgetLimit && item.amount > catBudgetLimit);

                return (
                  <View
                    key={item.id}
                    style={[styles.categoryStatRow, !isLastItem && styles.categoryStatRowBorder]}
                  >
                    <TouchableOpacity
                      onPress={() => setExpandedCategoryId(prev => (prev === item.id ? null : item.id))}
                      activeOpacity={0.7}
                    >
                      {/* 第一行：名次＋圖示＋分類名 ｜ 金額＋展開箭頭 */}
                      <View style={styles.catTopRow}>
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
                        </View>
                        <View style={styles.catRightRow}>
                          <Text
                            style={[
                              styles.catAmount,
                              analyticsCategoryType === 'income' && styles.incomeColor,
                            ]}
                          >
                            NT$ {item.amount.toLocaleString()}
                          </Text>
                          <Text style={styles.catExpandIcon}>{isExpanded ? '▴' : '▾'}</Text>
                        </View>
                      </View>

                      {/* 第二行：進度條 */}
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

                      {/* 第三行：筆數佔比與預算狀態 */}
                      <View style={styles.catMetaRow}>
                        <Text style={styles.catCountText}>
                          {item.count} 筆 · 佔比 {item.percentage}%
                        </Text>
                        {catBudgetLimit ? (
                          <View
                            style={[
                              styles.catBudgetBadge,
                              {
                                backgroundColor: isOverBudget
                                  ? isDark
                                    ? 'rgba(239, 68, 68, 0.2)'
                                    : '#FEE2E2'
                                  : isDark
                                  ? 'rgba(79, 70, 229, 0.2)'
                                  : '#EEF2FF',
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.catBudgetBadgeText,
                                {
                                  color: isOverBudget
                                    ? isDark
                                      ? '#FCA5A5'
                                      : '#DC2626'
                                    : isDark
                                    ? '#A5B4FC'
                                    : '#4F46E5',
                                },
                              ]}
                            >
                              {isOverBudget
                                ? `⚠️ 超支 $${(item.amount - catBudgetLimit).toLocaleString()}`
                                : `上限 $${catBudgetLimit.toLocaleString()}`}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </TouchableOpacity>

                    {/* 加分項 B：點擊分類展開金額最高前 5 筆明細 */}
                    {isExpanded && (
                      <View style={styles.topTxDrawer}>
                        {item.topTransactions.map((tx, txIdx) => {
                          const payer = tx.paid_by ? getMemberById(tx.paid_by) : null;
                          const dateStr = formatMonthDayLabel(tx.transacted_at);
                          const txLabel = formatPureTxLabel(tx, item.name);
                          const isLastTx = txIdx === item.topTransactions.length - 1;

                          return (
                            <View
                              key={tx.id || `${item.id}-${txIdx}`}
                              style={[styles.topTxRow, !isLastTx && styles.topTxRowBorder]}
                            >
                              <View style={styles.topTxLeft}>
                                <Text style={styles.topTxTitle} numberOfLines={1} ellipsizeMode="tail">
                                  {txLabel}
                                </Text>
                                <Text style={styles.topTxSub} numberOfLines={1}>
                                  {dateStr}
                                  {analyticsScope === 'all' && payer?.display_name
                                    ? ` · ${payer.display_name}`
                                    : ''}
                                </Text>
                              </View>
                              <Text
                                style={[
                                  styles.topTxAmount,
                                  analyticsCategoryType === 'income' && styles.incomeColor,
                                ]}
                              >
                                ${Number(tx.amount || 0).toLocaleString()}
                              </Text>
                            </View>
                          );
                        })}
                        {item.count > TOP_TX_PREVIEW_LIMIT && (
                          <Text style={styles.topTxFooterHint}>
                            顯示金額最高前 {TOP_TX_PREVIEW_LIMIT} 筆（本分類共 {item.count} 筆）
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            {hiddenCategoryCount > 0 && (
              <TouchableOpacity
                style={styles.expandToggleBtn}
                onPress={() => setIsCategoriesExpanded(prev => !prev)}
                activeOpacity={0.7}
              >
                <Text style={styles.expandToggleBtnText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                  {isCategoriesExpanded
                    ? '收合分類排行 ▴'
                    : `展開其餘 ${hiddenCategoryCount} 項分類（共 ${analyticsCategoryRanking.length} 項）▾`}
                </Text>
              </TouchableOpacity>
            )}
          </>
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
      padding: 12,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border.default,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
      gap: 10,
    },
    scopeToggleRow: {
      flexDirection: 'row',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
      borderRadius: 12,
      padding: 3,
      gap: 4,
    },
    scopeTab: {
      flex: 1,
      paddingVertical: 7,
      paddingHorizontal: 6,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scopeTabActive: {
      backgroundColor: isDark ? colors.background.card : '#FFFFFF',
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 3,
      elevation: 2,
    },
    scopeTabText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text.muted,
    },
    scopeTabTextActive: {
      fontWeight: '800',
      color: isDark ? '#818CF8' : '#4F46E5',
    },
    analyticsFilterScroll: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
      paddingHorizontal: 2,
    },
    analyticsFilterChip: {
      paddingHorizontal: 13,
      paddingVertical: 7,
      borderRadius: 20,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
    },
    analyticsFilterChipActive: {
      backgroundColor: '#4F46E5',
    },
    analyticsFilterText: {
      fontSize: 12.5,
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
      fontSize: 12.5,
      fontWeight: '700',
      color: isDark ? '#818CF8' : '#4F46E5',
    },
    analyticsOverviewCard: {
      backgroundColor: isDark ? colors.background.card : '#FFFFFF',
      borderRadius: 18,
      padding: 16,
      marginBottom: 14,
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
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 12,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.default,
    },
    analyticsOverviewTitle: {
      fontSize: 14.5,
      fontWeight: '700',
      color: colors.text.primary,
      maxWidth: '100%',
    },
    analyticsOverviewBadge: {
      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.18)' : '#EEF2FF',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(99, 102, 241, 0.35)' : '#C7D2FE',
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 10,
      flexShrink: 0,
    },
    analyticsOverviewBadgeText: {
      fontSize: 11.5,
      fontWeight: '700',
      color: isDark ? '#A5B4FC' : '#4F46E5',
    },
    overviewRow: {
      flexDirection: 'row',
      gap: 8,
    },
    analyticsOverviewItem: {
      flex: 1,
      minWidth: 0,
      backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
      borderRadius: 12,
      padding: 11,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    analyticsOverviewItemLabel: {
      fontSize: 11.5,
      color: colors.text.muted,
      fontWeight: '600',
      marginBottom: 4,
    },
    analyticsOverviewItemVal: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.text.primary,
    },
    overviewDeltaBadge: {
      alignSelf: 'flex-start',
      marginTop: 6,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 6,
      maxWidth: '100%',
    },
    overviewDeltaText: {
      fontSize: 10.5,
      fontWeight: '700',
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
      padding: 16,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border.default,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
      elevation: 2,
    },
    sectionHeaderWrapRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      columnGap: 8,
      rowGap: 8,
    },
    cardSectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text.primary,
      maxWidth: '100%',
    },
    cardSectionDesc: {
      fontSize: 12,
      color: colors.text.muted,
      marginTop: 4,
      marginBottom: 12,
      lineHeight: 17,
    },
    memberPayList: {
      gap: 10,
    },
    memberPayCard: {
      backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
      padding: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    memberPayTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6,
    },
    memberInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      minWidth: 0,
    },
    memberRankText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text.muted,
      minWidth: 20,
      textAlign: 'center',
      marginRight: 4,
      flexShrink: 0,
    },
    memberRankTextTop: {
      fontSize: 15,
    },
    memberAvatar: {
      marginRight: 7,
      flexShrink: 0,
    },
    memberName: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text.primary,
      flexShrink: 1,
    },
    meBadge: {
      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.22)' : '#EEF2FF',
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 6,
      marginLeft: 6,
      flexShrink: 0,
    },
    meBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: isDark ? '#A5B4FC' : '#4F46E5',
    },
    memberAmount: {
      fontSize: 14.5,
      fontWeight: '800',
      color: isDark ? '#F87171' : '#EF4444',
      flexShrink: 0,
    },
    memberMetaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 7,
      minHeight: 16,
    },
    memberMetaLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    topPayerBadge: {
      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    topPayerBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: isDark ? '#FBBF24' : '#B45309',
    },
    memberRatio: {
      fontSize: 11.5,
      color: colors.text.secondary,
      fontWeight: '600',
    },
    zeroMembersFooter: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    zeroMembersText: {
      fontSize: 11.5,
      color: colors.text.muted,
      lineHeight: 16,
    },
    progressBarBg: {
      height: 8,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
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
      flexShrink: 0,
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
    categoryList: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border.default,
      backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
      overflow: 'hidden',
    },
    categoryStatRow: {
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    categoryStatRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border.default,
    },
    catTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
      marginBottom: 7,
    },
    catNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flex: 1,
      minWidth: 0,
    },
    catRankBadge: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.text.muted,
      minWidth: 20,
      textAlign: 'center',
      flexShrink: 0,
    },
    catRankBadgeTop: {
      fontSize: 15,
    },
    catName: {
      flex: 1,
      minWidth: 0,
      fontSize: 14,
      fontWeight: '700',
      color: colors.text.primary,
    },
    catRightRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      flexShrink: 0,
    },
    catAmount: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.text.primary,
    },
    catExpandIcon: {
      fontSize: 12,
      color: colors.text.muted,
      fontWeight: '700',
    },
    catMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 6,
    },
    catCountText: {
      fontSize: 11.5,
      color: colors.text.secondary,
      fontWeight: '600',
    },
    catBudgetBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    catBudgetBadgeText: {
      fontSize: 10.5,
      fontWeight: '700',
    },
    topTxDrawer: {
      marginTop: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border.default,
      backgroundColor: isDark ? colors.background.modal : '#FFFFFF',
      overflow: 'hidden',
    },
    topTxRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 10,
      paddingVertical: 8,
      gap: 8,
    },
    topTxRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border.default,
    },
    topTxLeft: {
      flex: 1,
      minWidth: 0,
    },
    topTxTitle: {
      fontSize: 12.5,
      fontWeight: '600',
      color: colors.text.primary,
    },
    topTxSub: {
      fontSize: 11,
      color: colors.text.muted,
      marginTop: 1,
    },
    topTxAmount: {
      fontSize: 13,
      fontWeight: '700',
      color: isDark ? '#F87171' : '#EF4444',
      flexShrink: 0,
    },
    topTxFooterHint: {
      fontSize: 10.5,
      color: colors.text.muted,
      textAlign: 'center',
      paddingVertical: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border.default,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : '#F8FAFC',
    },
    expandToggleBtn: {
      marginTop: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border.default,
      backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
      alignItems: 'center',
      justifyContent: 'center',
    },
    expandToggleBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: isDark ? '#93C5FD' : '#2563EB',
    },
  });
