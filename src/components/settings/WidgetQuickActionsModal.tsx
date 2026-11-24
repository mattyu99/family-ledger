import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from '../common/Text';
import { useTheme } from '../../theme/ThemeContext';
import { QuickActionKind, QUICK_ACTIONS_CONFIG } from '../../lib/quickActions';
import { WidgetSnapshotData } from '../../lib/widgetSync';
import { SettingsSheetModal } from './SettingsSheetModal';

export interface WidgetQuickActionsModalProps {
  visible: boolean;
  onClose: () => void;
  ledgerName: string;
  widgetSnapshot: WidgetSnapshotData | null;
  isSyncingWidget: boolean;
  widgetSyncMessage: string | null;
  onManualSyncWidget: () => void;
  onTriggerQuickAction: (kind: QuickActionKind) => void;
}

export const WidgetQuickActionsModal: React.FC<WidgetQuickActionsModalProps> = ({
  visible,
  onClose,
  ledgerName,
  widgetSnapshot,
  isSyncingWidget,
  widgetSyncMessage,
  onManualSyncWidget,
  onTriggerQuickAction,
}) => {
  const { colors, isDark } = useTheme();

  const headerBadge = (
    <View
      style={[
        styles.roleBadge,
        { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#ECFDF5' },
      ]}
    >
      <Text
        style={[
          styles.roleBadgeText,
          { color: isDark ? '#34D399' : '#065F46' },
        ]}
      >
        🟢 快照就緒
      </Text>
    </View>
  );

  return (
    <SettingsSheetModal
      visible={visible}
      onClose={onClose}
      title="📱 桌面小工具與快捷動作"
      subtitle="免開 App 在手機桌面即覽今日待辦、本月支出，或 1 鍵直達記帳"
      headerRight={headerBadge}
    >
      {/* 桌面小工具即時快照預覽 */}
      <View
        style={{
          backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
          borderRadius: 12,
          padding: 14,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
            gap: 8,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }} numberOfLines={1}>
              📋 今日待辦 (4x2) 快照
            </Text>
            <Text style={{ fontSize: 11, color: colors.text.muted, marginTop: 1 }} numberOfLines={1}>
              帳本：{widgetSnapshot?.ledgerName || ledgerName || '家庭公帳'}
            </Text>
          </View>
          <TouchableOpacity
            style={{
              backgroundColor: isSyncingWidget ? (isDark ? '#334155' : '#E2E8F0') : '#4F46E5',
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 6,
              flexShrink: 0,
            }}
            onPress={onManualSyncWidget}
            disabled={isSyncingWidget}
            activeOpacity={0.7}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '600' }}>
              {isSyncingWidget ? '同步中...' : '🔄 立即同步'}
            </Text>
          </TouchableOpacity>
        </View>

        {widgetSyncMessage && (
          <Text style={{ fontSize: 11, color: '#10B981', fontWeight: '600', marginBottom: 6 }}>
            {widgetSyncMessage}
          </Text>
        )}

        {/* 待辦事項清單預覽 (顯示 4 條與 4x2 桌面小工具 1:1 對齊) */}
        {widgetSnapshot?.pendingMemos && widgetSnapshot.pendingMemos.length > 0 ? (
          <View style={{ gap: 6, marginBottom: 8 }}>
            {widgetSnapshot.pendingMemos.slice(0, 4).map((memo, idx) => (
              <TouchableOpacity
                key={memo.id || idx}
                activeOpacity={0.7}
                onPress={() => onTriggerQuickAction('todo')}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: memo.isOverdue ? '#FCA5A5' : isDark ? '#334155' : '#E2E8F0',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, marginRight: 8 }}>
                  <Text style={{ fontSize: 12, marginRight: 6, flexShrink: 0 }}>
                    {memo.isOverdue ? '⚠️' : '⭕'}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.text.primary, fontWeight: '500', flex: 1 }} numberOfLines={1}>
                    {memo.rawTitle || memo.title}
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 10,
                    color: memo.isOverdue ? '#EF4444' : colors.text.muted,
                    flexShrink: 0,
                  }}
                >
                  {memo.badgeText ||
                    (memo.isOverdue
                      ? '已逾期'
                      : (memo.reminderDate ? memo.reminderDate.slice(5) : '日常') +
                        (memo.assigneeName ? ` · ${memo.assigneeName}` : ''))}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={{ paddingVertical: 10, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 12, color: colors.text.muted }}>
              🎉 今日尚無未辦妥之備忘事項
            </Text>
          </View>
        )}

        {/* 快照底部統計與快捷列 */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 8,
            borderTopWidth: 1,
            borderTopColor: isDark ? '#334155' : '#E2E8F0',
          }}
        >
          <Text style={{ fontSize: 11, color: colors.text.secondary }}>
            本月支出：
            <Text style={{ fontWeight: '700', color: colors.text.primary }}>
              ${Number(widgetSnapshot?.monthlyExpense || 0).toLocaleString()}
            </Text>
          </Text>
          <Text style={{ fontSize: 10, color: colors.text.muted }}>
            快照時間：
            {widgetSnapshot?.updatedAt
              ? new Date(widgetSnapshot.updatedAt).toLocaleTimeString('zh-TW', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '剛剛'}
          </Text>
        </View>
      </View>

      {/* 快捷動作說明列表 */}
      <View
        style={[
          styles.cardScheduleContainer,
          { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default },
        ]}
      >
        {QUICK_ACTIONS_CONFIG.map((item, index) => (
          <View
            key={item.id}
            style={[
              styles.cardScheduleRow,
              index === QUICK_ACTIONS_CONFIG.length - 1 && { borderBottomWidth: 0 },
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
                {item.kind === 'expense'
                  ? '📝'
                  : item.kind === 'income'
                  ? '💰'
                  : item.kind === 'scan'
                  ? '📸'
                  : item.kind === 'todo'
                  ? '✅'
                  : '📌'}{' '}
                {item.title}
              </Text>
              <Text style={[styles.cardScheduleMeta, { color: colors.text.secondary }]}>
                {item.subtitle}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.testNoticeBtn,
                {
                  backgroundColor: colors.background.modal,
                  borderColor: colors.border.default,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                },
              ]}
              onPress={() => onTriggerQuickAction(item.kind)}
              activeOpacity={0.7}
            >
              <Text style={[styles.testNoticeBtnText, { color: colors.text.primary, fontSize: 12 }]}>
                ▶ 試按
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {/* 實用秘訣指引 */}
      <View style={{ marginTop: 12, gap: 6 }}>
        <Text
          style={[styles.backupPrivacyNote, { color: colors.text.muted }]}
          allowFontScaling={false}
          maxFontSizeMultiplier={1.08}
        >
          💡 桌面 1 鍵直達秘訣 (Android)：在手機桌面上長按 App 圖示後，按住「記支出」或「掃描發票」不放直接拖曳至螢幕空白處，即可將快捷按鈕釘選在桌面變成獨立 1x1 小工具！
        </Text>
        <Text
          style={[styles.backupPrivacyNote, { color: colors.text.muted }]}
          allowFontScaling={false}
          maxFontSizeMultiplier={1.08}
        >
          🔒 身分防護整合：若有開啟「身分解鎖防護」，從小工具或捷徑點入時會先通過 Face ID / 指紋驗證後自動直達表單！
        </Text>
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
  cardScheduleContainer: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  cardScheduleRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  cardScheduleName: {
    fontSize: 14,
    fontWeight: '600',
  },
  cardScheduleMeta: {
    fontSize: 12,
    marginTop: 4,
  },
  testNoticeBtn: {
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testNoticeBtnText: {
    fontWeight: '600',
  },
  backupPrivacyNote: {
    fontSize: 11,
    lineHeight: 16,
  },
});
