import React, { useMemo } from 'react';
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
} from 'react-native';
import { APP_FULL_VERSION, CHANGELOG_HISTORY } from '../constants/version';

const Text: React.FC<TextProps> = ({ allowFontScaling = false, maxFontSizeMultiplier = 1.08, ...rest }) => (
  <RNText
    allowFontScaling={allowFontScaling}
    maxFontSizeMultiplier={Math.min(maxFontSizeMultiplier ?? 1.08, 1.08)}
    {...rest}
  />
);

interface ChangelogModalProps {
  visible: boolean;
  onClose: () => void;
}

export const ChangelogModal: React.FC<ChangelogModalProps> = ({ visible, onClose }) => {
  const { isDark, colors } = useTheme();
  const styles = useMemo(() => getStyles(isDark, colors), [isDark, colors]);
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* 頂部標題列 */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>📜 版本更新歷程</Text>
              <Text style={styles.subtitle}>
                甜心記帳本最新修訂版本：v{APP_FULL_VERSION}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            {/* 當前版本提示橫幅 */}
            <View style={styles.currentBanner}>
              <View style={styles.currentBadgeRow}>
                <View style={styles.currentBadge}>
                  <Text style={styles.currentBadgeText}>✨ 當前運行版本：v{APP_FULL_VERSION}</Text>
                </View>
                <Text style={styles.currentDateText}>發布於 {CHANGELOG_HISTORY[0]?.date || '2026-10-20'}</Text>
              </View>
              <Text style={styles.currentBannerDesc}>
                💡 甜心記帳本採用 EAS OTA 雲端無感熱更新。每次小版號遞增代表最新功能與修復已推送至雲端，重新啟動 App 即可自動同步至最新狀態！
              </Text>
            </View>

            {/* 歷次更新卡片清單 */}
            {CHANGELOG_HISTORY.map((item, index) => {
              const isLatest = index === 0;
              return (
                <View
                  key={item.version}
                  style={[styles.historyCard, isLatest && styles.historyCardLatest]}
                >
                  <View style={styles.cardHeader}>
                    <View style={[styles.versionPill, isLatest && styles.versionPillLatest]}>
                      <Text style={[styles.versionPillText, isLatest && styles.versionPillTextLatest]}>
                        v{item.version}
                      </Text>
                      {isLatest && (
                        <View style={styles.latestTag}>
                          <Text style={styles.latestTagText}>最新</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.cardDate}>{item.date}</Text>
                  </View>

                  <Text style={styles.cardTitle}>{item.title}</Text>

                  <View style={styles.highlightsBox}>
                    {item.highlights.map((h, i) => (
                      <View key={i} style={styles.bulletRow}>
                        <Text style={styles.bulletDot}>•</Text>
                        <Text style={styles.bulletText}>{h}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* 底部關閉按鈕 */}
          <TouchableOpacity style={styles.footerBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.footerBtnText}>確定關閉</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const getStyles = (isDark: boolean, colors: ThemeColors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.75)' : 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: colors.background.modal,
    borderRadius: 24,
    width: '100%',
    maxWidth: 480,
    maxHeight: '85%',
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
    borderWidth: isDark ? 1 : 0,
    borderColor: isDark ? colors.border.default : 'transparent',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? colors.border.default : '#F1F5F9',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
    fontWeight: '500',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: isDark ? colors.background.cardSubtle : '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  closeBtnText: {
    fontSize: 14,
    color: colors.text.muted,
    fontWeight: '700',
  },
  scrollArea: {
    marginTop: 12,
    marginBottom: 12,
  },
  currentBanner: {
    backgroundColor: isDark ? 'rgba(22, 163, 74, 0.15)' : '#F0FDF4',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(22, 163, 74, 0.35)' : '#BBF7D0',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  currentBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    flexWrap: 'wrap',
    gap: 6,
  },
  currentBadge: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  currentBadgeText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
  },
  currentDateText: {
    fontSize: 11,
    color: isDark ? '#4ADE80' : '#15803D',
    fontWeight: '600',
  },
  currentBannerDesc: {
    fontSize: 11.5,
    color: isDark ? '#86EFAC' : '#166534',
    lineHeight: 17,
  },
  historyCard: {
    backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E2E8F0',
  },
  historyCardLatest: {
    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.15)' : '#EEF2FF',
    borderColor: isDark ? 'rgba(99, 102, 241, 0.35)' : '#C7D2FE',
    borderWidth: 1.5,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  versionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? colors.background.card : '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4,
  },
  versionPillLatest: {
    backgroundColor: '#4F46E5',
  },
  versionPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text.secondary,
  },
  versionPillTextLatest: {
    color: '#FFFFFF',
  },
  latestTag: {
    backgroundColor: '#FEF08A',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  latestTagText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#854D0E',
  },
  cardDate: {
    fontSize: 11,
    color: colors.text.muted,
    fontWeight: '600',
  },
  cardTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 8,
    lineHeight: 19,
  },
  highlightsBox: {
    gap: 5,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  bulletDot: {
    fontSize: 12,
    color: isDark ? '#818CF8' : '#6366F1',
    lineHeight: 18,
    fontWeight: '800',
  },
  bulletText: {
    flex: 1,
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  footerBtn: {
    backgroundColor: '#4F46E5',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
