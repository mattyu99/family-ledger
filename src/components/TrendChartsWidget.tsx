import React, { useMemo } from 'react';
import {
  View,
  Text as RNText,
  StyleSheet,
  TouchableOpacity,
  TextProps,
} from 'react-native';
import { useLedger } from '../context/LedgerContext';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { getCategoryIcon } from '../lib/icons';

const Text: React.FC<TextProps> = ({ allowFontScaling = false, maxFontSizeMultiplier = 1.08, ...rest }) => (
  <RNText
    allowFontScaling={allowFontScaling}
    maxFontSizeMultiplier={Math.min(maxFontSizeMultiplier ?? 1.08, 1.08)}
    {...rest}
  />
);

export interface TrendChartsWidgetProps {
  selectedMonthYm: string;
  onSelectMonth?: (ym: string) => void;
}

export const TrendChartsWidget: React.FC<TrendChartsWidgetProps> = ({
  selectedMonthYm,
  onSelectMonth,
}) => {
  const { getSixMonthTrend, getMoMComparison } = useLedger();
  const { isDark, colors } = useTheme();
  const styles = useMemo(() => getStyles(isDark, colors), [isDark, colors]);

  const sixMonthData = getSixMonthTrend();
  const mom = getMoMComparison(selectedMonthYm);

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

  return (
    <View style={styles.container}>
      {/* 區塊 1: 近 6 個月收支走勢圖 */}
      <View style={styles.chartHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>📈 近 6 個月收支走勢圖</Text>
          <Text style={styles.subtitle}>過去半年收入與支出起伏對照，掌握收支平衡</Text>
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
      <View style={styles.barsContainer}>
        {sixMonthData.map(item => {
          const isSelected = item.ym === selectedMonthYm;
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
                <Text style={[styles.monthLabel, isSelected && styles.monthLabelSelected]}>
                  {item.label}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 區塊 2: 相較上月同期增減 (MoM) 看板 */}
      <View style={styles.momSection}>
        <View style={styles.momHeaderRow}>
          <Text style={styles.momSectionTitle}>⚖️ 相較上月同期比較 (MoM)</Text>
          <Text style={styles.momSubtext}>
            {selectedMonthYm.slice(5)}月 vs {mom.prevYm.slice(5)}月
          </Text>
        </View>

        <View style={styles.momGrid}>
          {/* 總支出同期比較 */}
          <View style={styles.momCard}>
            <Text style={styles.momCardLabel}>💸 總支出</Text>
            <Text style={styles.momCardVal}>NT$ {mom.currentExpense.toLocaleString()}</Text>
            <View
              style={[
                styles.diffBadge,
                mom.expenseDiff > 0 ? styles.diffBadgeExpenseUp : styles.diffBadgeExpenseDown,
              ]}
            >
              <Text
                style={[
                  styles.diffBadgeText,
                  mom.expenseDiff > 0 ? styles.diffBadgeTextExpenseUp : styles.diffBadgeTextExpenseDown,
                ]}
              >
                {mom.expenseDiff > 0
                  ? `+${mom.expenseDiffRate}% 🔺 多花 $${mom.expenseDiff.toLocaleString()}`
                  : mom.expenseDiff < 0
                  ? `${mom.expenseDiffRate}% 📉 節省 $${Math.abs(mom.expenseDiff).toLocaleString()}`
                  : '持平'}
              </Text>
            </View>
          </View>

          {/* 總收入同期比較 */}
          <View style={styles.momCard}>
            <Text style={styles.momCardLabel}>💰 總收入</Text>
            <Text style={styles.momCardVal}>NT$ {mom.currentIncome.toLocaleString()}</Text>
            <View
              style={[
                styles.diffBadge,
                mom.incomeDiff >= 0 ? styles.diffBadgeIncomeUp : styles.diffBadgeIncomeDown,
              ]}
            >
              <Text
                style={[
                  styles.diffBadgeText,
                  mom.incomeDiff >= 0 ? styles.diffBadgeTextIncomeUp : styles.diffBadgeTextIncomeDown,
                ]}
              >
                {mom.incomeDiff > 0
                  ? `+${mom.incomeDiffRate}% 📈 增加 $${mom.incomeDiff.toLocaleString()}`
                  : mom.incomeDiff < 0
                  ? `${mom.incomeDiffRate}% 📉 減少 $${Math.abs(mom.incomeDiff).toLocaleString()}`
                  : '持平'}
              </Text>
            </View>
          </View>
        </View>

        {/* 關鍵支出變動分類洞察 */}
        {(mom.topIncreasedCategory || mom.topDecreasedCategory) && (
          <View style={styles.insightBox}>
            {mom.topIncreasedCategory && (
              <View style={styles.insightRow}>
                <Text style={styles.insightIcon}>🔺</Text>
                <Text style={styles.insightText} numberOfLines={1}>
                  本月增加最多：
                  <Text style={{ fontWeight: '700', color: colors.text.primary }}>
                    {getCategoryIcon(mom.topIncreasedCategory.icon)} {mom.topIncreasedCategory.name}
                  </Text>{' '}
                  (+NT$ {mom.topIncreasedCategory.diff.toLocaleString()})
                </Text>
              </View>
            )}
            {mom.topDecreasedCategory && (
              <View style={[styles.insightRow, mom.topIncreasedCategory && { marginTop: 4 }]}>
                <Text style={styles.insightIcon}>📉</Text>
                <Text style={styles.insightText} numberOfLines={1}>
                  本月省錢最多：
                  <Text style={{ fontWeight: '700', color: colors.text.primary }}>
                    {getCategoryIcon(mom.topDecreasedCategory.icon)} {mom.topDecreasedCategory.name}
                  </Text>{' '}
                  (-NT$ {mom.topDecreasedCategory.diff.toLocaleString()})
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
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
      marginBottom: 12,
    },
    title: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text.primary,
    },
    subtitle: {
      fontSize: 11.5,
      color: colors.text.muted,
      marginTop: 2,
    },
    legendWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
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
      marginBottom: 10,
    },
    momSectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text.primary,
    },
    momSubtext: {
      fontSize: 11,
      color: colors.text.muted,
      fontWeight: '600',
    },
    momGrid: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 10,
    },
    momCard: {
      flex: 1,
      backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
      borderRadius: 12,
      padding: 10,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    momCardLabel: {
      fontSize: 11,
      color: colors.text.muted,
      marginBottom: 2,
    },
    momCardVal: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.text.primary,
      marginBottom: 6,
    },
    diffBadge: {
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 6,
      alignSelf: 'flex-start',
    },
    diffBadgeExpenseUp: {
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
    },
    diffBadgeExpenseDown: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#F0FDF4',
    },
    diffBadgeIncomeUp: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#F0FDF4',
    },
    diffBadgeIncomeDown: {
      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FFFBEB',
    },
    diffBadgeText: {
      fontSize: 10,
      fontWeight: '700',
    },
    diffBadgeTextExpenseUp: {
      color: isDark ? '#F87171' : '#DC2626',
    },
    diffBadgeTextExpenseDown: {
      color: isDark ? '#4ADE80' : '#15803D',
    },
    diffBadgeTextIncomeUp: {
      color: isDark ? '#4ADE80' : '#15803D',
    },
    diffBadgeTextIncomeDown: {
      color: isDark ? '#FBBF24' : '#B45309',
    },
    insightBox: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F1F5F9',
      borderRadius: 10,
      padding: 9,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    insightRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    insightIcon: {
      fontSize: 12,
    },
    insightText: {
      fontSize: 11,
      color: colors.text.secondary,
      flex: 1,
    },
  });

