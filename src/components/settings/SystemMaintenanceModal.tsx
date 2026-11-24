import React from 'react';
import { View, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import * as Updates from 'expo-updates';
import { Text } from '../common/Text';
import { useTheme } from '../../theme/ThemeContext';
import { APP_FULL_VERSION as APP_VERSION } from '../../constants/version';
import { SettingsSheetModal } from './SettingsSheetModal';

export interface SystemMaintenanceModalProps {
  visible: boolean;
  onClose: () => void;
  isCheckingUpdate: boolean;
  isResettingCache: boolean;
  isOwner: boolean;
  onResetLocalCache: () => void;
  onCheckForUpdates: () => void;
  onOpenChangelogModal: () => void;
  onOpenProductGuideModal: () => void;
  onTriggerLiveToastDemo?: () => void;
}

export const SystemMaintenanceModal: React.FC<SystemMaintenanceModalProps> = ({
  visible,
  onClose,
  isCheckingUpdate,
  isResettingCache,
  isOwner,
  onResetLocalCache,
  onCheckForUpdates,
  onOpenChangelogModal,
  onOpenProductGuideModal,
  onTriggerLiveToastDemo,
}) => {
  const { colors, isDark } = useTheme();

  const headerBadge = (
    <TouchableOpacity
      style={styles.versionTagBadge}
      onPress={onOpenChangelogModal}
      activeOpacity={0.7}
    >
      <Text style={styles.versionTagBadgeText}>v{APP_VERSION} 📜</Text>
    </TouchableOpacity>
  );

  return (
    <SettingsSheetModal
      visible={visible}
      onClose={onClose}
      title="🔧 系統資訊與維護"
      subtitle="甜心記帳本跨平台運行狀態、本機快取校準與操作指南"
      headerRight={headerBadge}
    >
      {/* 系統版本與更新狀態詳情 */}
      <View
        style={[
          styles.versionDetailBox,
          { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default },
        ]}
      >
        <View style={styles.versionDetailRow}>
          <Text style={[styles.versionDetailLabel, { color: colors.text.secondary }]}>運行環境：</Text>
          <Text style={[styles.versionDetailValue, { color: colors.text.primary }]}>
            {Platform.OS === 'web'
              ? '🌐 Web 網頁版'
              : Platform.OS === 'ios'
              ? '🍎 iOS 原生 App'
              : '🤖 Android 原生 App'}
          </Text>
        </View>

        <View style={styles.versionDetailRow}>
          <Text style={[styles.versionDetailLabel, { color: colors.text.secondary }]}>更新機制：</Text>
          <Text style={[styles.versionDetailValue, { color: colors.text.primary }]}>
            {Platform.OS === 'web'
              ? '🌐 網頁即時快取'
              : Updates.isEnabled
              ? '⚡ EAS 雲端熱更新'
              : '📦 獨立安裝版 (APK)'}
          </Text>
        </View>

        {Platform.OS !== 'web' && !!Updates.updateId && (
          <View style={styles.versionDetailRow}>
            <Text style={[styles.versionDetailLabel, { color: colors.text.secondary }]}>更新代碼：</Text>
            <Text style={[styles.versionDetailValue, styles.monoText, { color: colors.text.primary }]}>
              {Updates.updateId.slice(0, 8)}
            </Text>
          </View>
        )}

        {Platform.OS !== 'web' && !!Updates.createdAt && (
          <View style={styles.versionDetailRow}>
            <Text style={[styles.versionDetailLabel, { color: colors.text.secondary }]}>更新時間：</Text>
            <Text style={[styles.versionDetailValue, { color: colors.text.primary }]}>
              {new Date(Updates.createdAt).toLocaleString('zh-TW', { hour12: false })}
            </Text>
          </View>
        )}
      </View>

      {/* 更新檢查與歷程／指南入口 */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <TouchableOpacity
          style={[
            styles.checkUpdateBtn,
            { flex: 1 },
            isCheckingUpdate && styles.checkUpdateBtnDisabled,
          ]}
          onPress={onCheckForUpdates}
          disabled={isCheckingUpdate}
          activeOpacity={0.8}
        >
          <Text style={styles.checkUpdateBtnText} numberOfLines={1} adjustsFontSizeToFit>
            {isCheckingUpdate ? '⏳ 檢查中...' : '🔄 檢查更新'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.viewChangelogBtn,
            { flex: 1, backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default },
          ]}
          onPress={onOpenChangelogModal}
          activeOpacity={0.8}
        >
          <Text style={[styles.viewChangelogBtnText, { color: colors.text.primary }]} numberOfLines={1} adjustsFontSizeToFit>
            📜 更新歷程
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[
          styles.actionCardBtn,
          {
            backgroundColor: colors.background.cardSubtle,
            borderColor: colors.border.default,
            marginTop: 10,
          },
        ]}
        onPress={onOpenProductGuideModal}
        activeOpacity={0.8}
      >
        <Text style={[styles.actionCardTitle, { color: colors.text.primary }]}>
          📖 產品介紹與常用操作指南
        </Text>
        <Text style={[styles.actionCardSub, { color: colors.text.secondary }]}>
          家庭公帳記帳、撥零用錢、待辦連動、加值與對帳速查手冊
        </Text>
      </TouchableOpacity>

      {/* 🔄 清除本機快取並重新同步 (自癒校準) */}
      <TouchableOpacity
        style={[
          styles.actionCardBtn,
          {
            backgroundColor: isDark ? 'rgba(99, 102, 241, 0.12)' : '#EEF2FF',
            borderColor: isDark ? 'rgba(99, 102, 241, 0.3)' : '#C7D2FE',
            marginTop: 12,
          },
        ]}
        onPress={onResetLocalCache}
        activeOpacity={0.8}
        disabled={isResettingCache}
      >
        <Text
          style={[styles.actionCardTitle, { color: isDark ? '#A5B4FC' : '#4F46E5' }]}
          allowFontScaling={false}
          maxFontSizeMultiplier={1.08}
        >
          {isResettingCache ? '⏳ 正在重新校準本機資料...' : '🔄 清除本機快取並重新同步'}
        </Text>
        <Text
          style={[styles.actionCardSub, { color: isDark ? '#C7D2FE' : '#6366F1' }]}
          allowFontScaling={false}
          maxFontSizeMultiplier={1.08}
        >
          以雲端資料為準，清空手機暫存並重新載入最新明細（絕不影響或修改雲端資料）
        </Text>
      </TouchableOpacity>

      {/* 管理員測試即時動態泡泡通知 */}
      {isOwner && onTriggerLiveToastDemo && (
        <TouchableOpacity
          style={[
            styles.testToastBtn,
            { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default },
          ]}
          onPress={onTriggerLiveToastDemo}
          activeOpacity={0.8}
        >
          <Text
            style={[styles.testToastBtnText, { color: colors.text.primary }]}
            allowFontScaling={false}
            maxFontSizeMultiplier={1.08}
          >
            🔔 測試即時動態泡泡通知
          </Text>
        </TouchableOpacity>
      )}
    </SettingsSheetModal>
  );
};

const styles = StyleSheet.create({
  versionTagBadge: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  versionTagBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  versionDetailBox: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    gap: 8,
  },
  versionDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  versionDetailLabel: {
    fontSize: 12.5,
  },
  versionDetailValue: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  monoText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  checkUpdateBtn: {
    backgroundColor: '#3B82F6',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkUpdateBtnDisabled: {
    opacity: 0.6,
  },
  checkUpdateBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  viewChangelogBtn: {
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewChangelogBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  actionCardBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  actionCardTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  actionCardSub: {
    fontSize: 11.5,
    marginTop: 3,
    textAlign: 'center',
    lineHeight: 16,
  },
  testToastBtn: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  testToastBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
