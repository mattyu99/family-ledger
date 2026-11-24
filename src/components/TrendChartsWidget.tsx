import React, { useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Text } from './common/Text';
import { useLedger } from '../context/LedgerContext';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { getCategoryIcon } from '../lib/icons';
import { TrendPeriodDatum } from '../lib/analyticsTrend';

export interface TrendMonthDatum {
  key?: string;
  ym: string;
  label: string;
  income: number;
  expense: number;
  balance: number;
  isFuture?: boolean;
}

export interface TrendCategoryInsight {
  name: string;
  icon: string;
  diff: number;
}

export interface TrendMoMInsightData {
  prevYm: string;
  topIncreasedCategory?: TrendCategoryInsight;
  topDecreasedCategory?: TrendCategoryInsight;
}

export interface TrendChartsWidgetProps {
  selectedMonthYm: string;
  onSelectMonth?: (ym: string) => void;
  sixMonthDataOverride?: TrendMonthDatum[];
  trendDataOverride?: TrendPeriodDatum[];
  title?: string;
  subtitle?: string;
  compact?: boolean;
  selectedKey?: string | null;
  momOverride?: TrendMoMInsightData | null;
  showComparison?: boolean;
  isMonthSelected?: boolean;
  scopeLabel?: string;
}

export const TrendChartsWidget: React.FC<TrendChartsWidgetProps> = ({
  selectedMonthYm,
  onSelectMonth,
  sixMonthDataOverride,
  trendDataOverride,
  title,
  subtitle,
  compact = false,
  selectedKey,
  momOverride,
  showComparison = true,
  isMonthSelected = true,
  scopeLabel,
}) => {
  const { getSixMonthTrend, getMoMComparison } = useLedger();
  const { isDark, colors } = useTheme();
  const styles = useMemo(() => getStyles(isDark, colors), [isDark, colors]);

  const chartData = useMemo<TrendMonthDatum[]>(
    () => trendDataOverride ?? sixMonthDataOverride ?? getSixMonthTrend(),
    [trendDataOverride, sixMonthDataOverride, getSixMonthTrend]
  );

  const mom = useMemo<TrendMoMInsightData | null>(() => {
    if (!showComparison) return null;
    if (momOverride !== undefined) return momOverride;
    return getMoMComparison(selectedMonthYm);
  }, [showComparison, momOverride, getMoMComparison, selectedMonthYm]);

  const { selectedMonthText, selectedMonthShortLabel, prevMonthShortLabel } = useMemo(() => {
    const now = new Date();
    const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const selectedMonthNum = parseInt(selectedMonthYm.slice(5), 10);
    const shortLabel = isNaN(selectedMonthNum) ? `${selectedMonthYm.slice(5)}月` : `${selectedMonthNum}月`;
    const prevMonthNum = mom ? parseInt(mom.prevYm.slice(5), 10) : NaN;
    const prevLabel = mom
      ? isNaN(prevMonthNum)
        ? `${mom.prevYm.slice(5)}月`
        : `${prevMonthNum}月`
      : '';
    return {
      selectedMonthText: selectedMonthYm === currentYm ? '本月' : shortLabel,
      selectedMonthShortLabel: shortLabel,
      prevMonthShortLabel: prevLabel,
    };
  }, [selectedMonthYm, mom]);

  // 計算區間中的最高單一項目數值，作為柱狀圖高度 100% 之縮放基準 (最低保底 1,000)
  const maxVal = useMemo(() => {
    let max = 1000;
    chartData.forEach(m => {
      if (m.income > max) max = m.income;
      if (m.expense > max) max = m.expense;
    });
    return max;
  }, [chartData]);

  const CHART_MAX_HEIGHT = 100;
  const shouldShowInsights = Boolean(
    showComparison && mom && (mom.topIncreasedCategory || mom.topDecreasedCategory)
  );
  const resolvedTitle = title || '📈 近 6 個月收支走勢';
  const resolvedSubtitle = subtitle || '點擊月份柱狀可快速切換檢視該月明細';
  const activeKey = selectedKey !== undefined ? selectedKey : isMonthSelected ? selectedMonthYm : null;

  return (
    <View style={styles.container}>
      {/* 區塊 1: 收支走勢圖 */}
      <View style={styles.chartHeader}>
        <View style={styles.chartTitleCol}>
          <Text style={styles.title}>
            {resolvedTitle}
            {scopeLabel ? `（${scopeLabel}）` : ''}
          </Text>
          <Text style={styles.subtitle}>{resolvedSubtitle}</Text>
        </View>

        {/* 圖例說明 */}
        <View style={styles.legendWrap}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
            <Text style={styles.legendText}>收入</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#4F46E5' }]} />
            <Text style={styles.legendText}>支出</Text>
          </View>
        </View>
      </View>

      {/* 雙柱狀圖容器 */}
      <View
        style={[
          styles.barsContainer,
          compact && styles.barsContainerCompact,
          !shouldShowInsights && { marginBottom: 0 },
        ]}
      >
        {chartData.map(item => {
          const itemKey = item.key ?? item.ym;
          const isSelected = Boolean(activeKey && itemKey === activeKey);
          const incomeHeight = Math.max(4, Math.round((item.income / maxVal) * CHART_MAX_HEIGHT));
          const expenseHeight = Math.max(4, Math.round((item.expense / maxVal) * CHART_MAX_HEIGHT));

          return (
            <TouchableOpacity
              key={itemKey}
              style={[
                styles.monthCol,
                compact && styles.monthColCompact,
                isSelected && styles.monthColSelected,
              ]}
              onPress={() => onSelectMonth && onSelectMonth(itemKey)}
              activeOpacity={0.7}
            >
              {/* 柱狀繪製區 */}
              <View style={[styles.barsArea, compact && styles.barsAreaCompact, { height: CHART_MAX_HEIGHT }]}>
                {/* 收入柱 (左) */}
                <View style={[styles.barWrap, compact && styles.barWrapCompact]}>
                  <View
                    style={[
                      styles.bar,
                      compact && styles.barCompact,
                      styles.incomeBar,
                      item.isFuture && item.income === 0 && styles.futureBar,
                      { height: item.income > 0 ? incomeHeight : 2 },
                    ]}
                  />
                </View>

                {/* 支出柱 (右) */}
                <View style={[styles.barWrap, compact && styles.barWrapCompact]}>
                  <View
                    style={[
                      styles.bar,
                      compact && styles.barCompact,
                      styles.expenseBar,
                      item.isFuture && item.expense === 0 && styles.futureBar,
                      { height: item.expense > 0 ? expenseHeight : 2 },
                    ]}
                  />
                </View>
              </View>

              {/* 期間標籤 */}
              <View
                style={[
                  styles.monthBadge,
                  compact && styles.monthBadgeCompact,
                  isSelected && styles.monthBadgeSelected,
                ]}
              >
                <Text
                  style={[
                    styles.monthLabel,
                    compact && styles.monthLabelCompact,
                    item.isFuture && !isSelected && styles.futureLabel,
                    isSelected && styles.monthLabelSelected,
                  ]}
                  numberOfLines={1}
                  allowFontScaling={false}
                  maxFontSizeMultiplier={compact ? 1.05 : 1.08}
                >
                  {item.label}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 區塊 2: 較上月分類變動洞察（僅單月視角顯示，不重複總金額大卡） */}
      {shouldShowInsights && mom && (
        <View style={styles.momSection}>
          <View style={styles.momHeaderRow}>
            <Text style={styles.momSectionTitle}>⚖️ 較上月分類變動</Text>
            <Text style={styles.momSubtext}>
              {selectedMonthShortLabel} vs {prevMonthShortLabel}
            </Text>
          </View>

          <View style={styles.insightBox}>
            {mom.topIncreasedCategory && (
              <View style={styles.insightRow}>
                <Text style={styles.insightIcon}>🔺</Text>
                <Text style={styles.insightText}>
                  {selectedMonthText}增加最多：
                  <Text style={styles.insightHighlight}>
                    {getCategoryIcon(mom.topIncreasedCategory.icon)} {mom.topIncreasedCategory.name}
                  </Text>{' '}
                  (+NT$ {mom.topIncreasedCategory.diff.toLocaleString()})
                </Text>
              </View>
            )}
            {mom.topDecreasedCategory && (
              <View style={[styles.insightRow, mom.topIncreasedCategory && { marginTop: 6 }]}>
                <Text style={styles.insightIcon}>📉</Text>
                <Text style={styles.insightText}>
                  {selectedMonthText}省錢最多：
                  <Text style={styles.insightHighlight}>
                    {getCategoryIcon(mom.topDecreasedCategory.icon)} {mom.topDecreasedCategory.name}
                  </Text>{' '}
                  (-NT$ {mom.topDecreasedCategory.diff.toLocaleString()})
                </Text>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

const getStyles = (isDark: boolean, colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      backgroundColor: isDark ? colors.background.card : '#FFFFFF',
      borderRadius: 16,
      padding: 16,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border.default,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    chartHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      flexWrap: 'wrap',
      columnGap: 8,
      rowGap: 6,
      marginBottom: 12,
    },
    chartTitleCol: {
      flex: 1,
      minWidth: 180,
    },
    title: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text.primary,
    },
    subtitle: {
      fontSize: 11.5,
      color: colors.text.muted,
      marginTop: 2,
      lineHeight: 16,
    },
    legendWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flexShrink: 0,
      paddingTop: 2,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    legendDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    legendText: {
      fontSize: 11,
      color: colors.text.secondary,
      fontWeight: '600',
    },
    barsContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      paddingVertical: 10,
      paddingHorizontal: 4,
      backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border.default,
      marginBottom: 14,
    },
    barsContainerCompact: {
      paddingHorizontal: 3,
    },
    monthCol: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 4,
      borderRadius: 8,
    },
    monthColCompact: {
      paddingHorizontal: 0,
    },
    monthColSelected: {
      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.2)' : '#EEF2FF',
    },
    barsArea: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'center',
      width: '100%',
      gap: 3,
      paddingBottom: 4,
    },
    barsAreaCompact: {
      gap: 1.5,
    },
    barWrap: {
      width: 9,
      alignItems: 'center',
      justifyContent: 'flex-end',
      height: '100%',
    },
    barWrapCompact: {
      width: 5,
    },
    bar: {
      width: 9,
      borderRadius: 4,
    },
    barCompact: {
      width: 5,
      borderRadius: 2.5,
    },
    incomeBar: {
      backgroundColor: '#10B981',
    },
    expenseBar: {
      backgroundColor: '#4F46E5',
    },
    futureBar: {
      opacity: 0.25,
    },
    monthBadge: {
      marginTop: 6,
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderRadius: 6,
    },
    monthBadgeCompact: {
      marginTop: 5,
      paddingHorizontal: 1,
      paddingVertical: 1,
      minWidth: 16,
      alignItems: 'center',
    },
    monthBadgeSelected: {
      backgroundColor: '#4F46E5',
    },
    monthLabel: {
      fontSize: 10.5,
      fontWeight: '600',
      color: colors.text.muted,
    },
    monthLabelCompact: {
      fontSize: 10,
    },
    futureLabel: {
      opacity: 0.45,
    },
    monthLabelSelected: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    momSection: {
      borderTopWidth: 1,
      borderTopColor: colors.border.default,
      paddingTop: 12,
    },
    momHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 8,
    },
    momSectionTitle: {
      fontSize: 13.5,
      fontWeight: '700',
      color: colors.text.primary,
    },
    momSubtext: {
      fontSize: 11.5,
      color: colors.text.muted,
      fontWeight: '600',
    },
    insightBox: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#F8FAFC',
      borderRadius: 10,
      padding: 10,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    insightRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
    },
    insightIcon: {
      fontSize: 12.5,
      marginTop: 1,
      flexShrink: 0,
    },
    insightText: {
      fontSize: 12,
      lineHeight: 17,
      color: colors.text.secondary,
      flex: 1,
    },
    insightHighlight: {
      fontWeight: '700',
      color: colors.text.primary,
    },
  });
