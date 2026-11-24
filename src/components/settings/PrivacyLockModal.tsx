import React from 'react';
import { View, TouchableOpacity, Switch, StyleSheet } from 'react-native';
import { Text } from '../common/Text';
import { useTheme } from '../../theme/ThemeContext';
import { BiometricsCapability } from '../../lib/biometrics';
import { SettingsSheetModal } from './SettingsSheetModal';

export interface PrivacyLockModalProps {
  visible: boolean;
  onClose: () => void;
  capability: BiometricsCapability;
  privacyMaskEnabled: boolean;
  onTogglePrivacyMask: (enabled: boolean) => void | Promise<void>;
  appLockEnabled: boolean;
  onToggleAppLock: (enabled: boolean) => void | Promise<void>;
  onTestBiometrics: () => void | Promise<void>;
}

export const PrivacyLockModal: React.FC<PrivacyLockModalProps> = ({
  visible,
  onClose,
  capability,
  privacyMaskEnabled,
  onTogglePrivacyMask,
  appLockEnabled,
  onToggleAppLock,
  onTestBiometrics,
}) => {
  const { colors, isDark } = useTheme();

  const headerBadge = (
    <View
      style={[
        styles.roleBadge,
        capability.isSupported
          ? { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#ECFDF5' }
          : { backgroundColor: isDark ? '#334155' : '#F1F5F9' },
      ]}
    >
      <Text
        style={[
          styles.roleBadgeText,
          capability.isSupported
            ? { color: isDark ? '#34D399' : '#065F46' }
            : { color: isDark ? '#94A3B8' : '#64748B' },
        ]}
      >
        {capability.isSupported ? `🟢 支援 ${capability.biometryType}` : '⚪ 密碼備援'}
      </Text>
    </View>
  );

  return (
    <SettingsSheetModal
      visible={visible}
      onClose={onClose}
      title="🔐 生物辨識與財務隱私鎖"
      subtitle={`以 ${capability.biometryType} 或安全碼保護資產負債與真實淨值，防旁人窺視`}
      headerRight={headerBadge}
    >
      <View
        style={[
          styles.cardScheduleContainer,
          { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default },
        ]}
      >
        {/* 設定項目 1：淨值看板預設遮罩 */}
        <View
          style={[
            styles.cardScheduleRow,
            {
              borderBottomColor: colors.border.default,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            },
          ]}
        >
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={[styles.cardScheduleName, { color: colors.text.primary }]}>
              👁️ 資產淨值與餘額預設遮罩
            </Text>
            <Text style={[styles.cardScheduleMeta, { color: colors.text.secondary }]}>
              看板金額預設顯示為星號，需點擊眼睛透過 {capability.biometryType} 驗證後方可查看
            </Text>
          </View>
          <Switch
            value={privacyMaskEnabled}
            onValueChange={onTogglePrivacyMask}
            trackColor={{ false: colors.border.default, true: colors.brand.primary }}
            thumbColor="#FFFFFF"
          />
        </View>

        {/* 設定項目 2：啟動 App 時要求生物驗證 */}
        <View
          style={[
            styles.cardScheduleRow,
            {
              borderBottomWidth: 0,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            },
          ]}
        >
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={[styles.cardScheduleName, { color: colors.text.primary }]}>
              🛡️ 啟動 App 時要求身分解鎖
            </Text>
            <Text style={[styles.cardScheduleMeta, { color: colors.text.secondary }]}>
              冷啟動或離開背景超過 15 秒重新返回時，強制驗證 {capability.biometryType} 或 PIN 碼解鎖
            </Text>
          </View>
          <Switch
            value={appLockEnabled}
            onValueChange={onToggleAppLock}
            trackColor={{ false: colors.border.default, true: colors.brand.primary }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>

      {/* 測試按鈕 */}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, alignItems: 'center' }}>
        <TouchableOpacity
          style={[
            styles.testNoticeBtn,
            { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default },
          ]}
          onPress={onTestBiometrics}
          activeOpacity={0.7}
        >
          <Text style={[styles.testNoticeBtnText, { color: colors.text.primary }]}>
            🔐 測試驗證 {capability.biometryType}
          </Text>
        </TouchableOpacity>
      </View>

      <Text
        style={[styles.backupPrivacyNote, { color: colors.text.muted, marginTop: 10 }]}
        allowFontScaling={false}
        maxFontSizeMultiplier={1.08}
      >
        💡 隱私機制：生物特徵資料全程保存在手機本機 Secure Enclave 晶片中，App 雲端絕不存取任何指紋或臉部特徵。
      </Text>
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
  cardScheduleContainer: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  cardScheduleRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  cardScheduleName: {
    fontSize: 14,
    fontWeight: '600',
  },
  cardScheduleMeta: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  testNoticeBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testNoticeBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  backupPrivacyNote: {
    fontSize: 11,
    lineHeight: 16,
  },
});
