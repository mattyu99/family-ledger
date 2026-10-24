import React, { useState, useMemo } from 'react';
import {
  View,
  Text as RNText,
  StyleSheet,
  TouchableOpacity,
  TextProps,
} from 'react-native';
import { useLedger } from '../context/LedgerContext';
import { usePrivacy } from '../context/PrivacyContext';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';

const Text: React.FC<TextProps> = ({ allowFontScaling = false, maxFontSizeMultiplier = 1.08, ...rest }) => (
  <RNText
    allowFontScaling={allowFontScaling}
    maxFontSizeMultiplier={Math.min(maxFontSizeMultiplier ?? 1.08, 1.08)}
    {...rest}
  />
);

export interface NetWorthWidgetProps {
  onOpenTransferModal: () => void;
  onOpenAccountsManageModal: () => void;
  filterMemberId?: string;
}

export const NetWorthWidget: React.FC<NetWorthWidgetProps> = ({
  onOpenTransferModal,
  onOpenAccountsManageModal,
  filterMemberId,
}) => {
  const { getNetWorthSummary, members, currentUser } = useLedger();
  const { isPrivacyMaskActive, togglePrivacyMask } = usePrivacy();
  const { isDark, colors } = useTheme();
  const styles = useMemo(() => getStyles(isDark, colors), [isDark, colors]);

  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  // 隱私遮罩輔助函式
  const maskAmount = (num: number, prefix: string = 'NT$ '): string => {
    if (isPrivacyMaskActive) {
      return `${prefix}••••••`;
    }
    return `${prefix}${num.toLocaleString()}`;
  };

  const isAll = !filterMemberId || filterMemberId === 'all';
  const targetMember = useMemo(() => {
    if (isAll) return undefined;
    return (
      members.find(m => m.id === filterMemberId) ||
      (currentUser?.id === filterMemberId ? currentUser : undefined)
    );
  }, [isAll, members, currentUser, filterMemberId]);

  const isMe = useMemo(() => {
    if (isAll) return false;
    return (
      filterMemberId === currentUser?.id ||
      (!!currentUser?.display_name &&
        targetMember?.display_name?.trim().toLowerCase() === currentUser.display_name.trim().toLowerCase())
    );
  }, [isAll, filterMemberId, currentUser, targetMember]);

  const summary = getNetWorthSummary(filterMemberId);
  const hasAccounts =
    summary.accounts.banks.length > 0 ||
    summary.accounts.cash.length > 0 ||
    summary.accounts.storedValues.length > 0 ||
    summary.accounts.creditCards.length > 0;

  const titleText = isAll
    ? '家庭財務淨值'
    : isMe
    ? '個人財務淨值'
    : `個人財務淨值 (${targetMember?.display_name || '指定成員'})`;

  return (
    <View style={styles.container}>
      {/* 總覽標題與淨值主卡片 */}
      <TouchableOpacity
        style={styles.heroRow}
        onPress={() => setIsExpanded(prev => !prev)}
        activeOpacity={0.85}
      >
        <View style={styles.heroLeft}>
          <View style={styles.titleWrap}>
            <Text style={styles.titleIcon}>💎</Text>
            <Text style={styles.titleText}>{titleText}</Text>
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={togglePrivacyMask}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.eyeBtnText}>
                {isPrivacyMaskActive ? '🔒 遮蔽' : '👁️ 顯示'}
              </Text>
            </TouchableOpacity>
            <View style={styles.expandTag}>
              <Text style={styles.expandTagText}>{isExpanded ? '收起 ▲' : '詳情 ▼'}</Text>
            </View>
          </View>
          <Text style={styles.netWorthAmount}>
            {maskAmount(summary.netWorth)}
          </Text>
        </View>

        <View style={styles.heroRight}>
          <View style={styles.metricBadgeAsset}>
            <Text style={styles.metricLabelAsset}>總資產</Text>
            <Text style={styles.metricValAsset}>
              {isPrivacyMaskActive ? '+$••••' : `+$${summary.totalAssets.toLocaleString()}`}
            </Text>
          </View>

          <View style={styles.metricBadgeLiability}>
            <Text style={styles.metricLabelLiability}>待繳負債</Text>
            <Text style={styles.metricValLiability}>
              {isPrivacyMaskActive
                ? '-$••••'
                : summary.totalLiabilities > 0
                ? `-$${summary.totalLiabilities.toLocaleString()}`
                : '$0'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* 展開之四大資產負債分類明細 */}
      {isExpanded && (
        <View style={styles.detailSection}>
          <View style={styles.gridRow}>
            {/* 🏦 銀行活存 */}
            <View style={styles.gridCard}>
              <View style={styles.gridCardHeader}>
                <Text style={styles.gridCardIcon}>🏦</Text>
                <Text style={styles.gridCardTitle}>銀行存款</Text>
              </View>
              <Text style={styles.gridCardAmount}>
                {maskAmount(summary.bankTotal)}
              </Text>
              <Text style={styles.gridCardSub}>
                {summary.accounts.banks.length} 個銀行帳戶
              </Text>
            </View>

            {/* 💵 現金皮包 */}
            <View style={styles.gridCard}>
              <View style={styles.gridCardHeader}>
                <Text style={styles.gridCardIcon}>💵</Text>
                <Text style={styles.gridCardTitle}>現金皮夾</Text>
              </View>
              <Text style={styles.gridCardAmount}>
                {maskAmount(summary.cashTotal)}
              </Text>
              <Text style={styles.gridCardSub}>
                {summary.accounts.cash.length} 個現金皮包
              </Text>
            </View>
          </View>

          <View style={[styles.gridRow, { marginTop: 8 }]}>
            {/* 🚌 儲值票證 */}
            <View style={styles.gridCard}>
              <View style={styles.gridCardHeader}>
                <Text style={styles.gridCardIcon}>🚌</Text>
                <Text style={styles.gridCardTitle}>儲值卡</Text>
              </View>
              <Text style={styles.gridCardAmount}>
                {maskAmount(summary.storedValueTotal)}
              </Text>
              <Text style={styles.gridCardSub}>
                {summary.accounts.storedValues.length} 張卡片
              </Text>
            </View>

            {/* 💳 信用卡待繳 */}
            <View style={[styles.gridCard, summary.creditCardTotal > 0 && styles.gridCardLiability]}>
              <View style={styles.gridCardHeader}>
                <Text style={styles.gridCardIcon}>💳</Text>
                <Text style={styles.gridCardTitle}>信用卡待繳</Text>
              </View>
              <Text
                style={[
                  styles.gridCardAmount,
                  summary.creditCardTotal > 0 && styles.gridCardAmountLiability,
                ]}
              >
                {isPrivacyMaskActive
                  ? '-NT$ ••••'
                  : summary.creditCardTotal > 0
                  ? `-NT$ ${summary.creditCardTotal.toLocaleString()}`
                  : 'NT$ 0'}
              </Text>
              <Text style={styles.gridCardSub}>
                {summary.accounts.creditCards.length} 張信用卡
              </Text>
            </View>
          </View>

          {/* 各帳戶清單迷你預覽 */}
          {hasAccounts ? (
            <View style={styles.accountListMini}>
              {/* 銀行帳戶 */}
              {summary.accounts.banks.map(b => (
                <View key={b.id} style={styles.miniAccountRow}>
                  <View style={styles.miniAccLeft}>
                    <Text style={styles.miniAccIcon}>🏦</Text>
                    <Text style={styles.miniAccName} numberOfLines={1}>{b.name}</Text>
                  </View>
                  <Text style={styles.miniAccBalance}>
                    {maskAmount(b.balance || 0)}
                  </Text>
                </View>
              ))}

              {/* 現金帳戶 */}
              {summary.accounts.cash.map(c => (
                <View key={c.id} style={styles.miniAccountRow}>
                  <View style={styles.miniAccLeft}>
                    <Text style={styles.miniAccIcon}>💵</Text>
                    <Text style={styles.miniAccName} numberOfLines={1}>{c.name}</Text>
                  </View>
                  <Text style={styles.miniAccBalance}>
                    {maskAmount(c.balance || 0)}
                  </Text>
                </View>
              ))}

              {/* 儲值卡 */}
              {summary.accounts.storedValues.map(sv => (
                <View key={sv.id} style={styles.miniAccountRow}>
                  <View style={styles.miniAccLeft}>
                    <Text style={styles.miniAccIcon}>🚌</Text>
                    <Text style={styles.miniAccName} numberOfLines={1}>{sv.name}</Text>
                  </View>
                  <Text style={styles.miniAccBalance}>
                    {maskAmount(sv.balance || 0)}
                  </Text>
                </View>
              ))}

              {/* 信用卡待繳 */}
              {summary.accounts.creditCards.map(cc => (
                <View key={cc.id} style={styles.miniAccountRow}>
                  <View style={styles.miniAccLeft}>
                    <Text style={styles.miniAccIcon}>💳</Text>
                    <Text style={styles.miniAccName} numberOfLines={1}>{cc.name}</Text>
                  </View>
                  <Text
                    style={[
                      styles.miniAccBalance,
                      cc.outstandingDebt > 0 && { color: '#EF4444' },
                    ]}
                  >
                    {isPrivacyMaskActive
                      ? '-NT$ ••••'
                      : cc.outstandingDebt > 0
                      ? `-NT$ ${cc.outstandingDebt.toLocaleString()}`
                      : '已結清 $0'}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyAccountBox}>
              <Text style={styles.emptyAccountText}>
                {isAll
                  ? '目前尚未建立任何支付卡片或帳戶'
                  : `目前尚未為「${targetMember?.display_name || '此成員'}」設定專屬帳戶或卡片`}
              </Text>
            </View>
          )}

          {/* 快捷操作按鈕列 */}
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={styles.transferBtn}
              onPress={onOpenTransferModal}
              activeOpacity={0.8}
            >
              <Text style={styles.transferBtnText}>⇄ 帳戶互轉 / 提款 / 繳卡費</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.manageBtn}
              onPress={onOpenAccountsManageModal}
              activeOpacity={0.8}
            >
              <Text style={styles.manageBtnText}>⚙️ 管理帳戶</Text>
            </TouchableOpacity>
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
      borderWidth: 1,
      borderColor: colors.border.default,
      marginBottom: 12,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    heroRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 14,
    },
    heroLeft: {
      flex: 1,
    },
    titleWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 4,
    },
    titleIcon: {
      fontSize: 16,
    },
    titleText: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.text.muted,
    },
    eyeBtn: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#F1F5F9',
      paddingHorizontal: 7,
      paddingVertical: 1.5,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    eyeBtnText: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    expandTag: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9',
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 4,
    },
    expandTagText: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.text.muted,
    },
    netWorthAmount: {
      fontSize: 19,
      fontWeight: '800',
      color: colors.text.primary,
    },
    heroRight: {
      alignItems: 'flex-end',
      gap: 4,
    },
    metricBadgeAsset: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#DCFCE7',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    metricLabelAsset: {
      fontSize: 10,
      fontWeight: '600',
      color: isDark ? '#4ADE80' : '#15803D',
    },
    metricValAsset: {
      fontSize: 11,
      fontWeight: '800',
      color: isDark ? '#4ADE80' : '#15803D',
    },
    metricBadgeLiability: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEE2E2',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    metricLabelLiability: {
      fontSize: 10,
      fontWeight: '600',
      color: isDark ? '#F87171' : '#DC2626',
    },
    metricValLiability: {
      fontSize: 11,
      fontWeight: '800',
      color: isDark ? '#F87171' : '#DC2626',
    },
    detailSection: {
      paddingHorizontal: 14,
      paddingBottom: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border.default,
      paddingTop: 12,
    },
    gridRow: {
      flexDirection: 'row',
      gap: 8,
    },
    gridCard: {
      flex: 1,
      backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
      borderRadius: 10,
      padding: 10,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    gridCardLiability: {
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.05)' : '#FFF5F5',
      borderColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FED7D7',
    },
    gridCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginBottom: 4,
    },
    gridCardIcon: {
      fontSize: 13,
    },
    gridCardTitle: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.text.muted,
    },
    gridCardAmount: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.text.primary,
    },
    gridCardAmountLiability: {
      color: isDark ? '#F87171' : '#DC2626',
    },
    gridCardSub: {
      fontSize: 10,
      color: colors.text.muted,
      marginTop: 2,
    },
    accountListMini: {
      marginTop: 10,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border.default,
      gap: 6,
    },
    emptyAccountBox: {
      marginTop: 10,
      paddingVertical: 12,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#F9FAFB',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    emptyAccountText: {
      fontSize: 12,
      color: colors.text.muted,
      textAlign: 'center',
    },
    miniAccountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    miniAccLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flex: 1,
    },
    miniAccIcon: {
      fontSize: 12,
    },
    miniAccName: {
      fontSize: 11.5,
      color: colors.text.secondary,
      fontWeight: '500',
      flex: 1,
    },
    miniAccBalance: {
      fontSize: 11.5,
      fontWeight: '700',
      color: colors.text.primary,
    },
    actionButtonsRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border.default,
    },
    transferBtn: {
      flex: 2,
      backgroundColor: '#4F46E5',
      paddingVertical: 9,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    transferBtnText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
    manageBtn: {
      flex: 1,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
      paddingVertical: 9,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    manageBtnText: {
      color: colors.text.secondary,
      fontSize: 12,
      fontWeight: '600',
    },
  });

