import React from 'react';
import { View, TouchableOpacity, Switch, StyleSheet } from 'react-native';
import { Text } from '../common/Text';
import { useTheme } from '../../theme/ThemeContext';
import { useFontSize, FONT_SIZE_OPTIONS } from '../../theme/FontSizeContext';
import { SettingsSheetModal } from './SettingsSheetModal';

export interface DisplayFontModalProps {
  visible: boolean;
  onClose: () => void;
}

export const DisplayFontModal: React.FC<DisplayFontModalProps> = ({ visible, onClose }) => {
  const { colors, isDark } = useTheme();
  const {
    fontSizeLevel,
    fontScale,
    followSystemFont,
    systemFontScale,
    setFontSizeLevel,
    setFollowSystemFont,
  } = useFontSize();

  const headerBadge = (
    <View
      style={[
        styles.roleBadge,
        { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#EFF6FF' },
      ]}
    >
      <Text
        style={[
          styles.roleBadgeText,
          { color: isDark ? '#60A5FA' : '#1D4ED8' },
        ]}
      >
        {followSystemFont
          ? `📱 跟隨系統 (${Math.round(fontScale * 100)}%)`
          : `${FONT_SIZE_OPTIONS.find((o) => o.level === fontSizeLevel)?.shortLabel || '標準'} (${Math.round(
              fontScale * 100
            )}%)`}
      </Text>
    </View>
  );

  return (
    <SettingsSheetModal
      visible={visible}
      onClose={onClose}
      title="🔤 字型大小與顯示"
      subtitle="自由調整全 App 顯示比例，長輩閱讀更輕鬆舒適（僅套用於本裝置）"
      headerRight={headerBadge}
    >
      {/* 4 檔位快速切換晶片 */}
      <View style={styles.fontSizeChipsRow}>
        {FONT_SIZE_OPTIONS.map((opt) => {
          const isSelected = !followSystemFont && fontSizeLevel === opt.level;
          return (
            <TouchableOpacity
              key={opt.level}
              style={[
                styles.fontSizeChip,
                {
                  backgroundColor: isSelected
                    ? isDark
                      ? 'rgba(244, 63, 94, 0.25)'
                      : '#FFE4E6'
                    : isDark
                    ? colors.background.cardSubtle
                    : '#F1F5F9',
                  borderColor: isSelected ? '#F43F5E' : colors.border.default,
                },
              ]}
              onPress={() => setFontSizeLevel(opt.level)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.fontSizeChipText,
                  {
                    color: isSelected ? (isDark ? '#FDA4AF' : '#E11D48') : colors.text.primary,
                    fontWeight: isSelected ? '700' : '600',
                  },
                ]}
              >
                {opt.shortLabel}
              </Text>
              <Text
                style={[
                  styles.fontSizeChipPercent,
                  { color: isSelected ? (isDark ? '#FDA4AF' : '#E11D48') : colors.text.muted },
                ]}
              >
                {Math.round(opt.scale * 100)}%
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 當前檔位詳細說明 */}
      <View
        style={[
          styles.fontSizeDescBox,
          { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default },
        ]}
      >
        <Text style={[styles.fontSizeDescText, { color: colors.text.secondary }]}>
          💡{' '}
          {followSystemFont
            ? `目前啟用跟隨手機系統設定，系統字體倍率為 ${Math.round(systemFontScale * 100)}%（安全上限 130%）。`
            : FONT_SIZE_OPTIONS.find((o) => o.level === fontSizeLevel)?.description}
        </Text>
      </View>

      {/* 即時擬真預覽小卡 (Live Preview Card) */}
      <View
        style={[
          styles.fontSizePreviewCard,
          { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default },
        ]}
      >
        <View style={styles.fontSizePreviewHeader}>
          <Text style={[styles.fontSizePreviewTag, { color: colors.text.muted }]}>
            即時排版效果預覽
          </Text>
          <Text style={[styles.fontSizePreviewScale, { color: '#F43F5E' }]}>
            ×{fontScale.toFixed(2)}
          </Text>
        </View>
        <View style={styles.fontSizePreviewRow}>
          <Text style={{ fontSize: 20, marginRight: 8 }}>🍱</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.fontSizePreviewTitle, { color: colors.text.primary }]}>
              全聯福利中心 · 午餐便當與水果
            </Text>
            <Text style={[styles.fontSizePreviewSub, { color: colors.text.muted }]}>
              2026/10/31 12:30 · 💳 悠遊聯名卡
            </Text>
          </View>
          <Text style={[styles.fontSizePreviewAmount, { color: '#EF4444' }]}>-$125</Text>
        </View>
      </View>

      {/* 跟隨手機系統設定開關 */}
      <View style={[styles.fontSizeSwitchRow, { borderColor: colors.border.default }]}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={[styles.fontSizeSwitchTitle, { color: colors.text.primary }]}>
            📱 同步跟隨手機系統字體
          </Text>
          <Text style={[styles.fontSizeSwitchDesc, { color: colors.text.secondary }]}>
            自動讀取 Android/iOS 系統設定之字體大小（內建安全防爆版保護）
          </Text>
        </View>
        <Switch
          value={followSystemFont}
          onValueChange={setFollowSystemFont}
          trackColor={{ false: '#334155', true: '#10B981' }}
          thumbColor="#FFFFFF"
        />
      </View>
    </SettingsSheetModal>
  );
};

const styles = StyleSheet.create({
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  fontSizeChipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  fontSizeChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fontSizeChipText: {
    fontSize: 13,
  },
  fontSizeChipPercent: {
    fontSize: 11,
    marginTop: 2,
  },
  fontSizeDescBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  fontSizeDescText: {
    fontSize: 12,
    lineHeight: 18,
  },
  fontSizePreviewCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  fontSizePreviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150, 150, 150, 0.2)',
  },
  fontSizePreviewTag: {
    fontSize: 11,
    fontWeight: '600',
  },
  fontSizePreviewScale: {
    fontSize: 11,
    fontWeight: '700',
  },
  fontSizePreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fontSizePreviewTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  fontSizePreviewSub: {
    fontSize: 11,
    marginTop: 2,
  },
  fontSizePreviewAmount: {
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },
  fontSizeSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  fontSizeSwitchTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  fontSizeSwitchDesc: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 16,
  },
});
