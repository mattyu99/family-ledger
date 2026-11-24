import React from 'react';
import { View, TouchableOpacity, Switch, StyleSheet } from 'react-native';
import { Text } from '../common/Text';
import { useTheme } from '../../theme/ThemeContext';
import { copyToClipboard } from '../../lib/alert';
import {
  LINE_BOT_BASIC_ID,
  LineNotificationSettingsResponse,
} from '../../lib/lineNotifications';
import { SettingsSheetModal } from './SettingsSheetModal';

export interface LineDailyReportModalProps {
  visible: boolean;
  onClose: () => void;
  isDemoLedger: boolean;
  currentLedgerName?: string;
  canManageGroupLine: boolean;
  lineSettings: LineNotificationSettingsResponse | null;
  isLoadingLineSettings: boolean;
  isSavingLineSettings: boolean;
  pendingUserBindCode: { code: string; expiresAt?: string } | null;
  pendingGroupBindCode: { code: string; expiresAt?: string } | null;
  onRefresh: () => void;
  onStartUserLineBind: () => void;
  onToggleUserLinePref: (patch: { enabled?: boolean; skipQuietDay?: boolean }) => void;
  onToggleLedgerLineSub: (ledgerId: string, nextEnabled: boolean) => void;
  onUnbindUserLine: () => void;
  onStartGroupLineBind: () => void;
  onToggleGroupLinePref: (patch: {
    enabled?: boolean;
    skipQuietDay?: boolean;
    includeCreditCards?: boolean;
  }) => void;
  onUnbindGroupLine: () => void;
}

export const LineDailyReportModal: React.FC<LineDailyReportModalProps> = ({
  visible,
  onClose,
  isDemoLedger,
  currentLedgerName,
  canManageGroupLine,
  lineSettings,
  isLoadingLineSettings,
  isSavingLineSettings,
  pendingUserBindCode,
  pendingGroupBindCode,
  onRefresh,
  onStartUserLineBind,
  onToggleUserLinePref,
  onToggleLedgerLineSub,
  onUnbindUserLine,
  onStartGroupLineBind,
  onToggleGroupLinePref,
  onUnbindGroupLine,
}) => {
  const { colors, isDark } = useTheme();

  const headerRefreshButton = !isDemoLedger ? (
    <TouchableOpacity
      style={[
        styles.lineRefreshBtn,
        { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default },
      ]}
      onPress={onRefresh}
      disabled={isLoadingLineSettings || isSavingLineSettings}
      activeOpacity={0.75}
    >
      <Text style={[styles.lineRefreshBtnText, { color: colors.text.secondary }]}>
        {isLoadingLineSettings ? '同步中...' : '🔄 重新整理'}
      </Text>
    </TouchableOpacity>
  ) : null;

  return (
    <SettingsSheetModal
      visible={visible}
      onClose={onClose}
      title="💚 LINE 每日收支日報"
      subtitle="自由開關 LINE 通知與挑選訂閱帳簿，個人專屬與家庭群組雙軌並進"
      headerRight={headerRefreshButton}
    >
      {isDemoLedger ? (
        <View
          style={[
            styles.lineNoticeBox,
            { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default },
          ]}
        >
          <Text style={[styles.lineNoticeText, { color: colors.text.secondary }]}>
            🎭 目前為官方示範帳本，不提供 LINE 綁定功能；切換至您的真實家庭或個人帳本即可自由綁定與訂閱。
          </Text>
        </View>
      ) : lineSettings?.isTableMissing ? (
        <View
          style={[
            styles.lineNoticeBox,
            {
              backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : '#FFFBEB',
              borderColor: '#F59E0B',
            },
          ]}
        >
          <Text style={[styles.lineNoticeText, { color: isDark ? '#FCD34D' : '#92400E' }]}>
            ⏳ 雲端 LINE 訂閱資料表尚未建立，請先執行最新資料庫遷移腳本後再點上方「🔄 重新整理」。
          </Text>
        </View>
      ) : (
        <>
          {/* 軌道一：👤 我的個人 LINE 日報 */}
          <View
            style={[
              styles.lineSubCard,
              { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default },
            ]}
          >
            <View style={styles.sectionHeaderRow}>
              <Text
                style={[styles.lineSubCardTitle, { color: colors.text.primary, flex: 1, flexShrink: 1, marginRight: 8 }]}
                numberOfLines={1}
              >
                👤 我的個人 LINE 日報
              </Text>
              <View
                style={[
                  styles.cardholderBadge,
                  {
                    maxWidth: '52%',
                    flexShrink: 0,
                    backgroundColor: lineSettings?.userBinding.isBound
                      ? isDark
                        ? 'rgba(16, 185, 129, 0.2)'
                        : '#ECFDF5'
                      : isDark
                      ? '#334155'
                      : '#E2E8F0',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.cardholderBadgeText,
                    {
                      color: lineSettings?.userBinding.isBound
                        ? isDark
                          ? '#34D399'
                          : '#047857'
                        : colors.text.secondary,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {lineSettings?.userBinding.isBound
                    ? `🟢 已綁定${lineSettings.userBinding.lineDisplayName ? `·${lineSettings.userBinding.lineDisplayName}` : ''}`
                    : '⚪ 未綁定'}
                </Text>
              </View>
            </View>

            {!lineSettings?.userBinding.isBound ? (
              <View style={{ marginTop: 8 }}>
                <Text style={[styles.lineSubDesc, { color: colors.text.secondary }]}>
                  綁定後只會收到「您自己勾選的帳簿」、本人信用卡與本人／全家待辦，不會收到他人的私卡或私密記事。
                </Text>
                <TouchableOpacity
                  style={[styles.linePrimaryBtn, { opacity: isSavingLineSettings ? 0.65 : 1 }]}
                  onPress={onStartUserLineBind}
                  disabled={isSavingLineSettings}
                  activeOpacity={0.8}
                >
                  <Text style={styles.linePrimaryBtnText}>
                    💚 一鍵開啟 LINE 綁定 ({LINE_BOT_BASIC_ID})
                  </Text>
                </TouchableOpacity>

                {pendingUserBindCode && (
                  <View
                    style={[
                      styles.lineCodeBox,
                      { backgroundColor: colors.background.modal, borderColor: '#06C755' },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.lineCodeLabel, { color: colors.text.muted }]}>
                        個人綁定碼（10 分鐘內有效）
                      </Text>
                      <Text style={[styles.lineCodeValue, { color: colors.text.primary }]}>
                        {pendingUserBindCode.code}
                      </Text>
                      <Text style={[styles.lineCodeHint, { color: colors.text.secondary }]}>
                        若 LINE 未自動帶出文字，請複製後貼到官方帳號 {LINE_BOT_BASIC_ID} 傳送，完成後點「🔄 重新整理」。
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.lineCopyBtn}
                      onPress={() =>
                        copyToClipboard(
                          pendingUserBindCode.code,
                          `已複製綁定碼 ${pendingUserBindCode.code}！\n請打開 LINE 官方帳號 ${LINE_BOT_BASIC_ID} 傳送此代碼。`
                        )
                      }
                      activeOpacity={0.75}
                    >
                      <Text style={styles.lineCopyBtnText}>📋 複製</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ) : (
              <View style={{ marginTop: 8 }}>
                <View style={styles.lineSwitchRow}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={[styles.lineSwitchLabel, { color: colors.text.primary }]}>
                      每日 21:18 個人 LINE 推播
                    </Text>
                    <Text style={[styles.lineSwitchDesc, { color: colors.text.muted }]}>
                      亦可直接在 LINE 聊天室傳送「暫停日報」或「恢復日報」
                    </Text>
                  </View>
                  <Switch
                    value={lineSettings.userBinding.enabled}
                    onValueChange={(val) => onToggleUserLinePref({ enabled: val })}
                    disabled={isSavingLineSettings}
                    trackColor={{ false: '#CBD5E1', true: '#06C755' }}
                  />
                </View>

                <View
                  style={[
                    styles.lineSwitchRow,
                    {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: colors.border.default,
                      paddingTop: 10,
                      marginTop: 10,
                    },
                  ]}
                >
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={[styles.lineSwitchLabel, { color: colors.text.primary }]}>
                      🌙 安靜日免打擾
                    </Text>
                    <Text style={[styles.lineSwitchDesc, { color: colors.text.muted }]}>
                      當日無任何消費收入，且無帳單與待辦提醒時不打擾
                    </Text>
                  </View>
                  <Switch
                    value={lineSettings.userBinding.skipQuietDay}
                    onValueChange={(val) => onToggleUserLinePref({ skipQuietDay: val })}
                    disabled={isSavingLineSettings}
                    trackColor={{ false: '#CBD5E1', true: '#06C755' }}
                  />
                </View>

                {/* 訂閱帳簿清單 */}
                <View
                  style={{
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: colors.border.default,
                    paddingTop: 10,
                    marginTop: 10,
                  }}
                >
                  <Text style={[styles.reminderSubLabel, { color: colors.text.secondary, marginBottom: 6 }]}>
                    要接收日報的帳簿（多本帳簿會自動合成單則滑動卡片，不洗版）：
                  </Text>
                  {lineSettings.ledgerSubscriptions.length === 0 ? (
                    <Text style={[styles.lineSwitchDesc, { color: colors.text.muted }]}>
                      目前尚無可訂閱的非示範帳簿
                    </Text>
                  ) : (
                    lineSettings.ledgerSubscriptions.map((sub) => (
                      <View
                        key={sub.ledgerId}
                        style={[
                          styles.lineLedgerSubRow,
                          { backgroundColor: colors.background.modal, borderColor: colors.border.default },
                        ]}
                      >
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={[styles.lineLedgerSubName, { color: colors.text.primary }]} numberOfLines={1}>
                            📒 {sub.ledgerName}
                          </Text>
                          <Text style={[styles.lineSwitchDesc, { color: colors.text.muted }]}>
                            {sub.enabled ? '✅ 每晚自動送達此帳簿日報' : '⏸️ 目前未訂閱'}
                          </Text>
                        </View>
                        <Switch
                          value={sub.enabled}
                          onValueChange={(val) => onToggleLedgerLineSub(sub.ledgerId, val)}
                          disabled={isSavingLineSettings || !lineSettings.userBinding.enabled}
                          trackColor={{ false: '#CBD5E1', true: '#06C755' }}
                        />
                      </View>
                    ))
                  )}
                </View>

                <TouchableOpacity
                  style={[
                    styles.lineDangerOutlineBtn,
                    { borderColor: isDark ? 'rgba(239, 68, 68, 0.45)' : '#FCA5A5' },
                  ]}
                  onPress={onUnbindUserLine}
                  disabled={isSavingLineSettings}
                  activeOpacity={0.75}
                >
                  <Text style={styles.lineDangerOutlineText}>解除我的個人 LINE 綁定</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* 軌道二：🏠 家庭群組公開播報（針對目前帳本） */}
          <View
            style={[
              styles.lineSubCard,
              {
                backgroundColor: colors.background.cardSubtle,
                borderColor: colors.border.default,
                marginTop: 12,
              },
            ]}
          >
            <View style={styles.sectionHeaderRow}>
              <Text
                style={[styles.lineSubCardTitle, { color: colors.text.primary, flex: 1, flexShrink: 1, marginRight: 8 }]}
                numberOfLines={1}
              >
                🏠 家庭群組播報
              </Text>
              <View
                style={[
                  styles.cardholderBadge,
                  {
                    maxWidth: '56%',
                    flexShrink: 0,
                    backgroundColor: lineSettings?.groupBinding.isBound
                      ? isDark
                        ? 'rgba(16, 185, 129, 0.2)'
                        : '#ECFDF5'
                      : isDark
                      ? '#334155'
                      : '#E2E8F0',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.cardholderBadgeText,
                    {
                      color: lineSettings?.groupBinding.isBound
                        ? isDark
                          ? '#34D399'
                          : '#047857'
                        : colors.text.secondary,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {lineSettings?.groupBinding.isBound
                    ? `🟢 ${lineSettings.groupBinding.groupName || '已綁定群組'}`
                    : '⚪ 未綁定群組'}
                </Text>
              </View>
            </View>
            <Text style={[styles.lineTargetLedgerTag, { color: colors.text.secondary }]} numberOfLines={1}>
              對象帳本：《{currentLedgerName || '目前帳本'}》
            </Text>

            <Text style={[styles.lineSubDesc, { color: colors.text.secondary, marginTop: 6 }]}>
              群組版會強制隱藏所有「個人專屬」私密備忘與個人信用卡，只播報全家公帳收支與全家待辦。
            </Text>

            {!lineSettings?.groupBinding.isBound ? (
              canManageGroupLine ? (
                <View style={{ marginTop: 8 }}>
                  <TouchableOpacity
                    style={[
                      styles.lineSecondaryBtn,
                      { backgroundColor: colors.background.modal, borderColor: '#06C755' },
                    ]}
                    onPress={onStartGroupLineBind}
                    disabled={isSavingLineSettings}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.lineSecondaryBtnText, { color: isDark ? '#4ADE80' : '#15803D' }]}>
                      🏠 產生家庭群組綁定碼
                    </Text>
                  </TouchableOpacity>

                  {pendingGroupBindCode && (
                    <View
                      style={[
                        styles.lineCodeBox,
                        { backgroundColor: colors.background.modal, borderColor: '#06C755' },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.lineCodeLabel, { color: colors.text.muted }]}>
                          群組綁定碼（10 分鐘內有效）
                        </Text>
                        <Text style={[styles.lineCodeValue, { color: colors.text.primary }]}>
                          {pendingGroupBindCode.code}
                        </Text>
                        <Text style={[styles.lineCodeHint, { color: colors.text.secondary }]}>
                          請將官方帳號 {LINE_BOT_BASIC_ID} 邀請進家庭群組，並在群組傳送「{pendingGroupBindCode.code}」後點重新整理。
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.lineCopyBtn}
                        onPress={() =>
                          copyToClipboard(
                            pendingGroupBindCode.code,
                            `群組綁定碼 ${pendingGroupBindCode.code} 已複製！`
                          )
                        }
                        activeOpacity={0.75}
                      >
                        <Text style={styles.lineCopyBtnText}>📋 複製</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ) : (
                <Text style={[styles.lineSwitchDesc, { color: colors.text.muted, marginTop: 6 }]}>
                  💡 僅帳本管理員可將本帳本綁定至家庭 LINE 群組。
                </Text>
              )
            ) : (
              <View style={{ marginTop: 8 }}>
                {canManageGroupLine ? (
                  <>
                    <View style={styles.lineSwitchRow}>
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={[styles.lineSwitchLabel, { color: colors.text.primary }]}>
                          每日 21:18 群組公開播報
                        </Text>
                        <Text style={[styles.lineSwitchDesc, { color: colors.text.muted }]}>
                          亦可在群組內輸入「暫停群組日報／恢復群組日報」
                        </Text>
                      </View>
                      <Switch
                        value={lineSettings.groupBinding.enabled}
                        onValueChange={(val) => onToggleGroupLinePref({ enabled: val })}
                        disabled={isSavingLineSettings}
                        trackColor={{ false: '#CBD5E1', true: '#06C755' }}
                      />
                    </View>

                    <View
                      style={[
                        styles.lineSwitchRow,
                        {
                          borderTopWidth: StyleSheet.hairlineWidth,
                          borderTopColor: colors.border.default,
                          paddingTop: 10,
                          marginTop: 10,
                        },
                      ]}
                    >
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={[styles.lineSwitchLabel, { color: colors.text.primary }]}>
                          🌙 群組安靜日免打擾
                        </Text>
                        <Text style={[styles.lineSwitchDesc, { color: colors.text.muted }]}>
                          公帳當日零交易且無提醒時略過，減少群組洗版
                        </Text>
                      </View>
                      <Switch
                        value={lineSettings.groupBinding.skipQuietDay}
                        onValueChange={(val) => onToggleGroupLinePref({ skipQuietDay: val })}
                        disabled={isSavingLineSettings}
                        trackColor={{ false: '#CBD5E1', true: '#06C755' }}
                      />
                    </View>

                    <View
                      style={[
                        styles.lineSwitchRow,
                        {
                          borderTopWidth: StyleSheet.hairlineWidth,
                          borderTopColor: colors.border.default,
                          paddingTop: 10,
                          marginTop: 10,
                        },
                      ]}
                    >
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={[styles.lineSwitchLabel, { color: colors.text.primary }]}>
                          💳 群組播報公用信用卡提醒
                        </Text>
                        <Text style={[styles.lineSwitchDesc, { color: colors.text.muted }]}>
                          預設關閉；開啟時僅播報未指定私人的全家公用卡
                        </Text>
                      </View>
                      <Switch
                        value={lineSettings.groupBinding.includeCreditCards}
                        onValueChange={(val) => onToggleGroupLinePref({ includeCreditCards: val })}
                        disabled={isSavingLineSettings}
                        trackColor={{ false: '#CBD5E1', true: '#06C755' }}
                      />
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.lineDangerOutlineBtn,
                        { borderColor: isDark ? 'rgba(239, 68, 68, 0.45)' : '#FCA5A5' },
                      ]}
                      onPress={onUnbindGroupLine}
                      disabled={isSavingLineSettings}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.lineDangerOutlineText}>解除家庭群組綁定</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <Text style={[styles.lineSwitchDesc, { color: colors.text.secondary }]}>
                    狀態：{lineSettings.groupBinding.enabled ? '🟢 每晚 21:18 播報中' : '⏸️ 管理員已暫停播報'}
                  </Text>
                )}
              </View>
            )}
          </View>
        </>
      )}
    </SettingsSheetModal>
  );
};

const styles = StyleSheet.create({
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardholderBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  cardholderBadgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  reminderSubLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    marginBottom: 6,
  },
  lineRefreshBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  lineRefreshBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  lineNoticeBox: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  lineNoticeText: {
    fontSize: 12,
    lineHeight: 18,
  },
  lineSubCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  lineSubCardTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  lineTargetLedgerTag: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  lineSubDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
  linePrimaryBtn: {
    marginTop: 10,
    backgroundColor: '#06C755',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linePrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  lineSecondaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineSecondaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  lineCodeBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  lineCodeLabel: {
    fontSize: 11,
  },
  lineCodeValue: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 1,
    marginVertical: 2,
  },
  lineCodeHint: {
    fontSize: 11,
    lineHeight: 16,
  },
  lineCopyBtn: {
    backgroundColor: '#06C755',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  lineCopyBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  lineSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lineSwitchLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  lineSwitchDesc: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  lineLedgerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  lineLedgerSubName: {
    fontSize: 13,
    fontWeight: '600',
  },
  lineDangerOutlineBtn: {
    marginTop: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  lineDangerOutlineText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
  },
});
