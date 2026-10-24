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

const Text: React.FC<TextProps> = ({ allowFontScaling = false, maxFontSizeMultiplier = 1.08, ...rest }) => (
  <RNText
    allowFontScaling={allowFontScaling}
    maxFontSizeMultiplier={Math.min(maxFontSizeMultiplier ?? 1.08, 1.08)}
    {...rest}
  />
);

export interface BudgetHeroWidgetProps {
  onOpenManageModal: () => void;
  targetMonthYm?: string;
}

export const BudgetHeroWidget: React.FC<BudgetHeroWidgetProps> = ({
  onOpenManageModal,
  targetMonthYm,
}) => {
  const { getBudgetProgress } = useLedger();
  const { isDark, colors } = useTheme();
  const styles = useMemo(() => getStyles(isDark, colors), [isDark, colors]);

  const progress = getBudgetProgress(targetMonthYm);

  if (!progress.isEnabled) {
    return (
      <TouchableOpacity
        style={styles.unconfiguredBanner}
        onPress={onOpenManageModal}
        activeOpacity={0.8}
      >
        <View style={styles.unconfiguredLeft}>
          <Text style={styles.unconfiguredIcon}>🎯</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.unconfiguredTitle}>設定家庭每月預算</Text>
            <Text style={styles.unconfiguredSubtitle}>開啟預算進度條與超支警戒，掌握每日可用額度</Text>
          </View>
        </View>
        <View style={styles.setupPill}>
          <Text style={styles.setupPillText}>立即設定 ❯</Text>
        </View>
      </TouchableOpacity>
    );
  }

  const barColor = progress.isOverBudget
    ? '#EF4444'
    : progress.isWarning
    ? '#F59E0B'
    : '#10B981';

  return (
    <TouchableOpacity
      style={[
        styles.container,
        progress.isOverBudget && styles.containerOverBudget,
        progress.isWarning && styles.containerWarning,
      ]}
      onPress={onOpenManageModal}
      activeOpacity={0.88}
    >
      {/* 頂部標題列 */}
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.titleIcon}>🎯</Text>
          <Text style={styles.titleText}>每月預算進度</Text>
          <View
            style={[
              styles.statusBadge,
              progress.isOverBudget && styles.statusBadgeOver,
              progress.isWarning && styles.statusBadgeWarning,
            ]}
          >
            <Text
              style={[
                styles.statusBadgeText,
                progress.isOverBudget && styles.statusBadgeTextOver,
                progress.isWarning && styles.statusBadgeTextWarning,
              ]}
            >
              {progress.isOverBudget
                ? `已超支 ${progress.spentRatio}%`
                : progress.isWarning
                ? `即將達標 ${progress.spentRatio}%`
                : `正常 ${progress.spentRatio}%`}
            </Text>
          </View>
        </View>

        <TouchableOpacity onPress={onOpenManageModal} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.settingsLinkText}>⚙️ 調整</Text>
        </TouchableOpacity>
      </View>

      {/* 總額與花費大數字對照 */}
      <View style={styles.amountsRow}>
        <View style={styles.amountCol}>
          <Text style={styles.amountLabel}>已支出</Text>
          <Text style={[styles.amountVal, { color: barColor }]}>
            NT$ {progress.spentAmount.toLocaleString()}
          </Text>
        </View>

        <View style={styles.amountDivider} />

        <View style={styles.amountCol}>
          <Text style={styles.amountLabel}>
            {progress.isOverBudget ? '超支金額' : '剩餘可用'}
          </Text>
          <Text
            style={[
              styles.amountVal,
              { color: progress.isOverBudget ? '#EF4444' : isDark ? '#34D399' : '#059669' },
            ]}
          >
            {progress.isOverBudget
              ? `-NT$ ${(progress.spentAmount - progress.totalBudget).toLocaleString()}`
              : `NT$ ${progress.remainingAmount.toLocaleString()}`}
          </Text>
        </View>

        <View style={styles.amountDivider} />

        <View style={styles.amountCol}>
          <Text style={styles.amountLabel}>總預算</Text>
          <Text style={[styles.amountVal, { color: colors.text.primary }]}>
            NT$ {progress.totalBudget.toLocaleString()}
          </Text>
        </View>
      </View>

      {/* 動態彩色進度條 */}
      <View style={styles.progressBarTrack}>
        <View
          style={[
            styles.progressBarFill,
            {
              width: `${Math.min(100, Math.max(3, progress.spentRatio))}%`,
              backgroundColor: barColor,
            },
          ]}
        />
      </View>

      {/* 底部日均額度與提示 */}
      <View style={styles.footerRow}>
        <Text style={styles.footerInfoText}>
          {progress.isOverBudget ? (
            '🚨 本月開銷已超出設定總額，建議暫緩非必要支出'
          ) : (
            `📅 尚餘 ${progress.daysRemaining} 天 · 平均每日可用 NT$ ${progress.dailyAvailable.toLocaleString()}`
          )}
        </Text>
        <Text style={styles.detailHintText}>查看詳情 ❯</Text>
      </View>
    </TouchableOpacity>
  );
};

const getStyles = (isDark: boolean, colors: ThemeColors) =>
  StyleSheet.create({
    unconfiguredBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.12)' : '#EEF2FF',
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 14,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(79, 70, 229, 0.25)' : '#C7D2FE',
    },
    unconfiguredLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
      marginRight: 8,
    },
    unconfiguredIcon: {
      fontSize: 20,
    },
    unconfiguredTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: isDark ? '#A5B4FC' : '#4F46E5',
    },
    unconfiguredSubtitle: {
      fontSize: 11,
      color: colors.text.muted,
      marginTop: 1,
    },
    setupPill: {
      backgroundColor: '#4F46E5',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
    },
    setupPillText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '700',
    },
    container: {
      backgroundColor: isDark ? colors.background.card : '#FFFFFF',
      borderRadius: 16,
      padding: 14,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border.default,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    containerWarning: {
      borderColor: isDark ? 'rgba(245, 158, 11, 0.4)' : '#FDE68A',
      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.06)' : '#FFFBEB',
    },
    containerOverBudget: {
      borderColor: isDark ? 'rgba(239, 68, 68, 0.4)' : '#FECACA',
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.06)' : '#FEF2F2',
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    titleWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    titleIcon: {
      fontSize: 15,
    },
    titleText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text.primary,
    },
    statusBadge: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#DCFCE7',
    },
    statusBadgeWarning: {
      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
    },
    statusBadgeOver: {
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2',
    },
    statusBadgeText: {
      fontSize: 10.5,
      fontWeight: '700',
      color: isDark ? '#4ADE80' : '#15803D',
    },
    statusBadgeTextWarning: {
      color: isDark ? '#FBBF24' : '#B45309',
    },
    statusBadgeTextOver: {
      color: isDark ? '#F87171' : '#DC2626',
    },
    settingsLinkText: {
      fontSize: 11.5,
      color: isDark ? '#818CF8' : '#4F46E5',
      fontWeight: '600',
    },
    amountsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    amountCol: {
      flex: 1,
      alignItems: 'center',
    },
    amountDivider: {
      width: 1,
      height: 24,
      backgroundColor: colors.border.default,
    },
    amountLabel: {
      fontSize: 10.5,
      color: colors.text.muted,
      marginBottom: 2,
    },
    amountVal: {
      fontSize: 14.5,
      fontWeight: '800',
    },
    progressBarTrack: {
      height: 8,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9',
      borderRadius: 4,
      overflow: 'hidden',
      marginBottom: 10,
    },
    progressBarFill: {
      height: '100%',
      borderRadius: 4,
    },
    footerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    footerInfoText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.text.secondary,
      flex: 1,
      marginRight: 6,
    },
    detailHintText: {
      fontSize: 11,
      color: colors.text.muted,
      fontWeight: '500',
    },
  });
