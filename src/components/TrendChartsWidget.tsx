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

export interface TrendMonthDatum {
  ym: string;
  label: string;
  income: number;
  expense: number;
  balance: number;
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
  momOverride?: TrendMoMInsightData | null;
  showComparison?: boolean;
  isMonthSelected?: boolean;
  scopeLabel?: string;
}

export const TrendChartsWidget: React.FC<TrendChartsWidgetProps> = ({
  selectedMonthYm,
  onSelectMonth,
  sixMonthDataOverride,
  momOverride,
  showComparison = true,
  isMonthSelected = true,
  scopeLabel,
}) => {
  const { getSixMonthTrend, getMoMComparison } = useLedger();
  const { isDark, colors } = useTheme();
  const styles = useMemo(() => getStyles(isDark, colors), [isDark, colors]);

  const sixMonthData = useMemo(
    () => sixMonthDataOverride || getSixMonthTrend(),
    [sixMonthDataOverride, getSixMonthTrend]
  );

  const mom = useMemo<TrendMoMInsightData | null>(() => {
    if (!showComparison) return null;
    if (momOverride !== undefined) return momOverride;
    return getMoMComparison(selectedMonthYm);
  }, [showComparison, momOverride, getMoMComparison, selectedMonthYm]);

  // 計算 6 個月中的最高單一項目數值，作為柱狀圖高度 100% 之縮放基準 (最低保底 1,000)
  const maxVal = useMemo(() => {
    let max = 1000;
    sixMonthData.forEach(m => {
      if (m.income > max) max = m.income;
      if (m.expense > max) max = m.expense;
    });
    return max;
  }, [sixMonthData]);

  const CHART_MAX_HEIGHT = 100;
  const shouldShowInsights = Boolean(
    showComparison && mom && (mom.topIncreasedCategory || mom.topDecreasedCategory)
  );

  return (
    <View style={styles.container}>
      {/* 區塊 1: 近 6 個月收支走勢圖 */}
      <View style={styles.chartHeader}>
        <View style={styles.chartTitleCol}>
          <Text style={styles.title}>
            📈 近 6 個月收支走勢{scopeLabel ? `（${scopeLabel}）` : ''}
          </Text>
          <Text style={styles.subtitle}>
            點擊月份柱狀可快速切換檢視該月明細
          </Text>
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
      <View style={[styles.barsContainer, !shouldShowInsights && { marginBottom: 0 }]}>
        {sixMonthData.map(item => {
          const isSelected = isMonthSelected && item.ym === selectedMonthYm;
          const incomeHeight = Math.max(4, Math.round((item.income / maxVal) * CHART_MAX_HEIGHT));
          const expenseHeight = Math.max(4, Math.round((item.expense / maxVal) * CHART_MAX_HEIGHT));

          return (
            <TouchableOpacity
              key={item.ym}
              style={[styles.monthCol, isSelected && styles.monthColSelected]}
              onPress={() => onSelectMonth && onSelectMonth(item.ym)}
              activeOpacity={0.7}
            >
              {/* 柱狀繪製區 */}
              <View style={[styles.barsArea, { height: CHART_MAX_HEIGHT }]}>
                {/* 收入柱 (左) */}
                <View style={styles.barWrap}>
                  <View
                    style={[
                      styles.bar,
                      styles.incomeBar,
                      { height: item.income > 0 ? incomeHeight : 2 },
                    ]}
                  />
                </View>

                {/* 支出柱 (右) */}
                <View style={styles.barWrap}>
                  <View
                    style={[
                      styles.bar,
                      styles.expenseBar,
                      { height: item.expense > 0 ? expenseHeight : 2 },
                    ]}
                  />
                </View>
              </View>

              {/* 月份標籤 */}
              <View style={[styles.monthBadge, isSelected && styles.monthBadgeSelected]}>
                <Text
                  style={[styles.monthLabel, isSelected && styles.monthLabelSelected]}
                  allowFontScaling={false}
                  maxFontSizeMultiplier={1.08}
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
              {selectedMonthYm.slice(5)}月 vs {mom.prevYm.slice(5)}月
            </Text>
          </View>

          <View style={styles.insightBox}>
            {mom.topIncreasedCategory && (
              <View style={styles.insightRow}>
                <Text style={styles.insightIcon}>🔺</Text>
                <Text style={styles.insightText}>
                  本月增加最多：
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
                  本月省錢最多：
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
    monthCol: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 4,
      borderRadius: 8,
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
    barWrap: {
      width: 9,
      alignItems: 'center',
      justifyContent: 'flex-end',
      height: '100%',
    },
    bar: {
      width: 9,
      borderRadius: 4,
    },
    incomeBar: {
      backgroundColor: '#10B981',
    },
    expenseBar: {
      backgroundColor: '#4F46E5',
    },
    monthBadge: {
      marginTop: 6,
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderRadius: 6,
    },
    monthBadgeSelected: {
      backgroundColor: '#4F46E5',
    },
    monthLabel: {
      fontSize: 10.5,
      fontWeight: '600',
      color: colors.text.muted,
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
