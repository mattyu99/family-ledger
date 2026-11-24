import React, { useMemo } from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { Text } from '../common/Text';
import { useTheme } from '../../theme/ThemeContext';
import { ThemeColors } from '../../theme/colors';

export interface SettingsSheetModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}

export const SettingsSheetModal: React.FC<SettingsSheetModalProps> = ({
  visible,
  onClose,
  title,
  subtitle,
  headerRight,
  children,
}) => {
  const { isDark, colors } = useTheme();
  const styles = useMemo(() => getSheetStyles(isDark, colors), [isDark, colors]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              {!!subtitle && (
                <Text style={styles.subtitle} numberOfLines={2}>
                  {subtitle}
                </Text>
              )}
            </View>
            <View style={styles.headerRightWrap}>
              {headerRight}
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

export interface SettingsGroupCardProps {
  title: string;
  caption?: string;
  children: React.ReactNode;
}

export const SettingsGroupCard: React.FC<SettingsGroupCardProps> = ({
  title,
  caption,
  children,
}) => {
  const { colors } = useTheme();

  return (
    <View style={groupStyles.wrapper}>
      <View style={groupStyles.headerRow}>
        <Text
          style={[groupStyles.title, { color: colors.text.secondary }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {!!caption && (
          <Text
            style={[groupStyles.caption, { color: colors.text.muted }]}
            numberOfLines={1}
          >
            {caption}
          </Text>
        )}
      </View>
      <View
        style={[
          groupStyles.card,
          {
            backgroundColor: colors.background.modal,
            borderColor: colors.border.default,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
};

export type SettingsBadgeTone =
  | 'neutral'
  | 'success'
  | 'info'
  | 'warning'
  | 'danger'
  | 'brand';

export interface SettingsRowItemProps {
  icon: string;
  iconBg?: string;
  title: string;
  subtitle?: string;
  badgeText?: string;
  badgeTone?: SettingsBadgeTone;
  isLast?: boolean;
  onPress: () => void;
  disabled?: boolean;
}

export const SettingsRowItem: React.FC<SettingsRowItemProps> = ({
  icon,
  iconBg,
  title,
  subtitle,
  badgeText,
  badgeTone = 'neutral',
  isLast = false,
  onPress,
  disabled = false,
}) => {
  const { isDark, colors } = useTheme();

  const badgePalette = useMemo(() => {
    switch (badgeTone) {
      case 'success':
        return {
          bg: isDark ? 'rgba(16, 185, 129, 0.2)' : '#ECFDF5',
          text: isDark ? '#34D399' : '#047857',
        };
      case 'info':
        return {
          bg: isDark ? 'rgba(59, 130, 246, 0.2)' : '#EFF6FF',
          text: isDark ? '#93C5FD' : '#1D4ED8',
        };
      case 'warning':
        return {
          bg: isDark ? 'rgba(245, 158, 11, 0.22)' : '#FEF3C7',
          text: isDark ? '#FBBF24' : '#B45309',
        };
      case 'danger':
        return {
          bg: isDark ? 'rgba(239, 68, 68, 0.22)' : '#FEE2E2',
          text: isDark ? '#FCA5A5' : '#B91C1C',
        };
      case 'brand':
        return {
          bg: isDark ? 'rgba(244, 63, 94, 0.22)' : '#FFE4E6',
          text: isDark ? '#FDA4AF' : '#E11D48',
        };
      default:
        return {
          bg: isDark ? '#334155' : '#F1F5F9',
          text: isDark ? '#CBD5E1' : '#475569',
        };
    }
  }, [badgeTone, isDark]);

  return (
    <TouchableOpacity
      style={[
        rowStyles.row,
        !isLast && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border.default,
        },
        disabled && rowStyles.rowDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <View
        style={[
          rowStyles.iconBox,
          {
            backgroundColor:
              iconBg || (isDark ? 'rgba(148, 163, 184, 0.14)' : '#F1F5F9'),
          },
        ]}
      >
        <Text style={rowStyles.iconText}>{icon}</Text>
      </View>

      <View style={rowStyles.textCol}>
        <Text
          style={[rowStyles.title, { color: colors.text.primary }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {!!subtitle && (
          <Text
            style={[rowStyles.subtitle, { color: colors.text.secondary }]}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        )}
      </View>

      <View style={rowStyles.rightCol}>
        {!!badgeText && (
          <View
            style={[
              rowStyles.badge,
              { backgroundColor: badgePalette.bg },
            ]}
          >
            <Text
              style={[rowStyles.badgeText, { color: badgePalette.text }]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.08}
            >
              {badgeText}
            </Text>
          </View>
        )}
        <Text style={[rowStyles.chevron, { color: colors.text.muted }]}>›</Text>
      </View>
    </TouchableOpacity>
  );
};

const getSheetStyles = (isDark: boolean, colors: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: isDark ? 'rgba(0, 0, 0, 0.75)' : 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    backdrop: {
      flex: 1,
    },
    sheet: {
      backgroundColor: colors.background.modal,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      width: '100%',
      maxWidth: 600,
      alignSelf: 'center',
      maxHeight: '90%',
      paddingTop: 16,
      borderTopWidth: isDark ? 1 : 0,
      borderLeftWidth: Platform.OS === 'web' && isDark ? 1 : 0,
      borderRightWidth: Platform.OS === 'web' && isDark ? 1 : 0,
      borderColor: colors.border.default,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -6 },
      shadowOpacity: 0.16,
      shadowRadius: 16,
      elevation: 10,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.default,
    },
    headerTitleWrap: {
      flex: 1,
      minWidth: 0,
      marginRight: 10,
    },
    title: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.text.primary,
    },
    subtitle: {
      fontSize: 12,
      lineHeight: 16,
      color: colors.text.secondary,
      marginTop: 2,
    },
    headerRightWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexShrink: 0,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? colors.background.cardSubtle : '#F1F5F9',
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text.muted,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 34,
    },
  });

const groupStyles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 8,
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  caption: {
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 0,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
});

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  rowDisabled: {
    opacity: 0.55,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  iconText: {
    fontSize: 18,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    marginRight: 10,
  },
  title: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  rightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  badge: {
    maxWidth: 142,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  chevron: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 22,
  },
});
