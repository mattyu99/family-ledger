import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from '../common/Text';
import { useTheme } from '../../theme/ThemeContext';
import { Profile, Transaction } from '../../types';
import { parseMemoNote } from '../../lib/memo';
import {
  BillingReminderGroup,
  NotificationPreferences,
  REMINDER_TIME_OPTIONS,
  BILLING_DUE_ADVANCE_OPTIONS,
  MEMO_ADVANCE_OPTIONS,
  computeMemoNotificationTriggers,
} from '../../lib/billingNotifications';
import { SettingsSheetModal } from './SettingsSheetModal';

export interface LocalNotificationsModalProps {
  visible: boolean;
  onClose: () => void;
  notifPrefs: NotificationPreferences;
  billingNoticeEnabled: boolean;
  isSchedulingNotice: boolean;
  memoNoticeEnabled: boolean;
  isSchedulingMemoNotice: boolean;
  billingGroups: BillingReminderGroup[];
  pendingMemos: Transaction[];
  getMemberById: (id?: string) => Profile | undefined;
  onUpdateNotifPrefs: (partial: Partial<NotificationPreferences>) => void;
  onToggleBillingNotice: () => void;
  onSendTestBillingNotice: () => void;
  onToggleMemoNotice: () => void;
  onSendTestMemoNotice: () => void;
}

export const LocalNotificationsModal: React.FC<LocalNotificationsModalProps> = ({
  visible,
  onClose,
  notifPrefs,
  billingNoticeEnabled,
  isSchedulingNotice,
  memoNoticeEnabled,
  isSchedulingMemoNotice,
  billingGroups,
  pendingMemos,
  getMemberById,
  onUpdateNotifPrefs,
  onToggleBillingNotice,
  onSendTestBillingNotice,
  onToggleMemoNotice,
  onSendTestMemoNotice,
}) => {
  const { colors, isDark } = useTheme();
  const [isCreditCardsExpanded, setIsCreditCardsExpanded] = useState(false);
  const [isMemosExpanded, setIsMemosExpanded] = useState(false);

  return (
    <SettingsSheetModal
      visible={visible}
      onClose={onClose}
      title="📱 手機推播提醒"
      subtitle="管理每日提醒鐘點、本人信用卡帳單與生活記事排程（僅影響此手機）"
    >
      {/* ⏰ 統一每日提醒鐘點偏好 */}
      <View
        style={[
          styles.sectionCard,
          { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default },
        ]}
      >
        <View style={styles.sectionHeaderRow}>
          <Text
            style={[styles.cardSectionTitle, { color: colors.text.primary }]}
            allowFontScaling={false}
            maxFontSizeMultiplier={1.08}
          >
            ⏰ 每日提醒鐘點
          </Text>
          <View
            style={[
              styles.cardholderBadge,
              { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#ECFDF5' },
            ]}
          >
            <Text
              style={[
                styles.cardholderBadgeText,
                { color: isDark ? '#34D399' : '#047857' },
              ]}
            >
              目前 {notifPrefs.dailyReminderTime}
            </Text>
          </View>
        </View>

        <Text
          style={[styles.sectionHeaderDesc, { color: colors.text.secondary }]}
          allowFontScaling={false}
          maxFontSizeMultiplier={1.08}
        >
          信用卡帳單與生活記事統一於此早晨時刻響鈴提醒，配合您的日常出門作息
        </Text>

        <View style={styles.reminderOptionsRow}>
          {REMINDER_TIME_OPTIONS.map((timeOpt) => {
            const isSelected = notifPrefs.dailyReminderTime === timeOpt;
            return (
              <TouchableOpacity
                key={timeOpt}
                style={[
                  styles.reminderOptionChip,
                  {
                    backgroundColor: isSelected
                      ? isDark
                        ? 'rgba(59, 130, 246, 0.22)'
                        : '#EFF6FF'
                      : colors.background.modal,
                    borderColor: isSelected ? '#3B82F6' : colors.border.default,
                  },
                ]}
                onPress={() => onUpdateNotifPrefs({ dailyReminderTime: timeOpt })}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.reminderOptionChipText,
                    {
                      color: isSelected
                        ? isDark
                          ? '#93C5FD'
                          : '#1D4ED8'
                        : colors.text.secondary,
                      fontWeight: isSelected ? '700' : '500',
                    },
                  ]}
                >
                  {timeOpt}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 💳 信用卡帳單與智慧推播提醒卡片 */}
      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: colors.background.cardSubtle,
            borderColor: colors.border.default,
            marginTop: 12,
          },
        ]}
      >
        <View style={styles.sectionHeaderRow}>
          <Text
            style={[styles.cardSectionTitle, { color: colors.text.primary }]}
            allowFontScaling={false}
            maxFontSizeMultiplier={1.08}
          >
            💳 信用卡帳單個人提醒
          </Text>
          <TouchableOpacity
            style={[
              styles.backupToggleBtn,
              billingNoticeEnabled ? styles.backupToggleBtnActive : styles.backupToggleBtnInactive,
              isDark && {
                backgroundColor: billingNoticeEnabled ? 'rgba(16, 185, 129, 0.2)' : colors.background.cardSubtle,
              },
            ]}
            onPress={onToggleBillingNotice}
            activeOpacity={0.8}
            disabled={isSchedulingNotice}
          >
            <Text
              style={[
                styles.backupToggleText,
                billingNoticeEnabled ? styles.backupToggleTextActive : styles.backupToggleTextInactive,
                isDark && {
                  color: billingNoticeEnabled ? '#6EE7B7' : colors.text.muted,
                },
              ]}
              allowFontScaling={false}
              maxFontSizeMultiplier={1.08}
            >
              {billingNoticeEnabled ? '已開啟提醒' : '已關閉提醒'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text
          style={[styles.sectionHeaderDesc, { color: colors.text.secondary }]}
          allowFontScaling={false}
          maxFontSizeMultiplier={1.08}
        >
          同銀行多張信用卡自動合併通知不重複轟炸，並依本人持卡分流提醒
        </Text>

        {/* 出帳日與繳款期限獨立子開關 */}
        <View style={styles.reminderSubSection}>
          <Text style={[styles.reminderSubLabel, { color: colors.text.secondary }]}>
            通知項目（可分別開關）
          </Text>
          <View style={styles.reminderSubToggleRow}>
            <TouchableOpacity
              style={[
                styles.reminderSubToggleChip,
                {
                  backgroundColor: notifPrefs.billingStatementEnabled
                    ? isDark
                      ? 'rgba(16, 185, 129, 0.2)'
                      : '#ECFDF5'
                    : colors.background.modal,
                  borderColor: notifPrefs.billingStatementEnabled ? '#10B981' : colors.border.default,
                },
              ]}
              onPress={() =>
                onUpdateNotifPrefs({ billingStatementEnabled: !notifPrefs.billingStatementEnabled })
              }
              activeOpacity={0.75}
            >
              <Text
                style={[
                  styles.reminderSubToggleText,
                  {
                    color: notifPrefs.billingStatementEnabled
                      ? isDark
                        ? '#34D399'
                        : '#047857'
                      : colors.text.muted,
                  },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {notifPrefs.billingStatementEnabled ? '✓ ' : '○ '}📄 出帳隔天提醒
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.reminderSubToggleChip,
                {
                  backgroundColor: notifPrefs.billingDueEnabled
                    ? isDark
                      ? 'rgba(59, 130, 246, 0.22)'
                      : '#EFF6FF'
                    : colors.background.modal,
                  borderColor: notifPrefs.billingDueEnabled ? '#3B82F6' : colors.border.default,
                },
              ]}
              onPress={() => onUpdateNotifPrefs({ billingDueEnabled: !notifPrefs.billingDueEnabled })}
              activeOpacity={0.75}
            >
              <Text
                style={[
                  styles.reminderSubToggleText,
                  {
                    color: notifPrefs.billingDueEnabled
                      ? isDark
                        ? '#93C5FD'
                        : '#1D4ED8'
                      : colors.text.muted,
                  },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {notifPrefs.billingDueEnabled ? '✓ ' : '○ '}🗓️ 繳款期限日
              </Text>
            </TouchableOpacity>
          </View>

          {notifPrefs.billingDueEnabled && (
            <>
              <Text style={[styles.reminderSubLabel, { color: colors.text.secondary, marginTop: 10 }]}>
                繳款預警時機
              </Text>
              <View style={styles.reminderOptionsWrapRow}>
                {BILLING_DUE_ADVANCE_OPTIONS.map((opt) => {
                  const isSelected = notifPrefs.billingDueAdvanceMode === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        styles.reminderChoicePill,
                        {
                          backgroundColor: isSelected
                            ? isDark
                              ? 'rgba(59, 130, 246, 0.22)'
                              : '#EFF6FF'
                            : colors.background.modal,
                          borderColor: isSelected ? '#3B82F6' : colors.border.default,
                        },
                      ]}
                      onPress={() => onUpdateNotifPrefs({ billingDueAdvanceMode: opt.value })}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.reminderChoicePillText,
                          {
                            color: isSelected
                              ? isDark
                                ? '#93C5FD'
                                : '#1D4ED8'
                              : colors.text.secondary,
                            fontWeight: isSelected ? '700' : '500',
                          },
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
        </View>

        {/* 展開/收合信用卡時程按鈕 */}
        <TouchableOpacity
          style={[
            styles.collapseToggleBtn,
            { backgroundColor: colors.background.modal, borderColor: colors.border.default },
          ]}
          onPress={() => setIsCreditCardsExpanded((prev) => !prev)}
          activeOpacity={0.7}
        >
          <Text style={[styles.collapseToggleBtnText, { color: colors.text.primary }]}>
            {isCreditCardsExpanded
              ? '收合銀行帳單排程 ▴'
              : `展開銀行帳單排程 (${billingGroups.length} 組) ▾`}
          </Text>
        </TouchableOpacity>

        {/* 信用卡時程清單預覽（依發卡銀行歸戶顯示） */}
        {isCreditCardsExpanded && (
          <View
            style={[
              styles.cardScheduleContainer,
              { backgroundColor: colors.background.modal, borderColor: colors.border.default },
            ]}
          >
            {billingGroups.length === 0 ? (
              <View style={styles.noCardBox}>
                <Text style={[styles.noCardText, { color: colors.text.muted }]}>
                  💳 目前無屬於您本人的信用卡提醒。可至「錢包與帳戶」新增信用卡或指派持卡人為您本人
                </Text>
              </View>
            ) : (
              billingGroups.map((group) => {
                const { billStatementDate, advanceReminderDate, dueDayReminderDate, advanceDays, includeDueDay } =
                  group.dates;
                const fmtMdHm = (d: Date) =>
                  `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(
                    d.getMinutes()
                  ).padStart(2, '0')}`;
                const scheduleParts: string[] = [];
                if (notifPrefs.billingStatementEnabled) {
                  scheduleParts.push(`出帳 ${fmtMdHm(billStatementDate)}`);
                }
                if (notifPrefs.billingDueEnabled) {
                  scheduleParts.push(`前${advanceDays}天 ${fmtMdHm(advanceReminderDate)}`);
                  if (includeDueDay) {
                    scheduleParts.push(`當天 ${fmtMdHm(dueDayReminderDate)}`);
                  }
                }
                return (
                  <View
                    key={group.groupKey}
                    style={[styles.cardScheduleRow, { borderBottomColor: colors.border.default }]}
                  >
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={styles.cardScheduleIcon}>💳</Text>
                        <Text style={[styles.cardScheduleName, { color: colors.text.primary }]} numberOfLines={1}>
                          {group.displayName}
                        </Text>
                        {group.isPersonalCard ? (
                          <View
                            style={[
                              styles.cardholderBadge,
                              { backgroundColor: isDark ? '#1E3A8A' : '#EFF6FF' },
                            ]}
                          >
                            <Text
                              style={[
                                styles.cardholderBadgeText,
                                { color: isDark ? '#93C5FD' : '#2563EB' },
                              ]}
                            >
                              📱 本人帳單
                            </Text>
                          </View>
                        ) : (
                          <View
                            style={[styles.cardholderBadge, { backgroundColor: colors.border.default }]}
                          >
                            <Text style={[styles.cardholderBadgeText, { color: colors.text.secondary }]}>
                              🌐 公用帳單
                            </Text>
                          </View>
                        )}
                      </View>
                      {group.cards.length > 1 && (
                        <Text style={[styles.cardScheduleMeta, { color: colors.text.muted }]} numberOfLines={2}>
                          合併卡片：{group.cardNames.join('、')}
                        </Text>
                      )}
                      <Text style={[styles.cardScheduleMeta, { color: colors.text.secondary }]}>
                        每月 {group.billingCycleDate} 號結帳 ·{' '}
                        {group.paymentDueDay ? `${group.paymentDueDay} 號繳款` : '結帳後20天繳款'} · 待繳約 NT${' '}
                        {group.estimatedAmount.toLocaleString()}
                      </Text>
                      <Text style={[styles.cardScheduleDates, { color: colors.text.muted }]}>
                        {scheduleParts.length > 0
                          ? `🔔 ${scheduleParts.join(' · ')}`
                          : '⏸️ 目前出帳與繳款子開關皆關閉'}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* 測試按鈕與雙軌說明 */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, alignItems: 'center' }}>
          <TouchableOpacity
            style={[
              styles.testNoticeBtn,
              { backgroundColor: colors.background.modal, borderColor: colors.border.default },
            ]}
            onPress={onSendTestBillingNotice}
            activeOpacity={0.7}
          >
            <Text style={[styles.testNoticeBtnText, { color: colors.text.primary }]}>
              🔔 發送測試推播通知
            </Text>
          </TouchableOpacity>
        </View>

        <Text
          style={[styles.backupPrivacyNote, { color: colors.text.muted, marginTop: 8 }]}
          allowFontScaling={false}
          maxFontSizeMultiplier={1.08}
        >
          💡 雙軌守護：除了手機本機推播之外，每日 LINE 收支日報若適逢出帳日或繳款到期前 3 天，亦會同步在群組發送醒目標籤提醒！
        </Text>
      </View>

      {/* 📌 生活記事與待辦推播提醒卡片 */}
      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: colors.background.cardSubtle,
            borderColor: colors.border.default,
            marginTop: 12,
          },
        ]}
      >
        <View style={styles.sectionHeaderRow}>
          <Text
            style={[styles.cardSectionTitle, { color: colors.text.primary }]}
            allowFontScaling={false}
            maxFontSizeMultiplier={1.08}
          >
            📌 生活記事待辦提醒
          </Text>
          <TouchableOpacity
            style={[
              styles.backupToggleBtn,
              memoNoticeEnabled ? styles.backupToggleBtnActive : styles.backupToggleBtnInactive,
              isDark && {
                backgroundColor: memoNoticeEnabled ? 'rgba(16, 185, 129, 0.2)' : colors.background.cardSubtle,
              },
            ]}
            onPress={onToggleMemoNotice}
            activeOpacity={0.8}
            disabled={isSchedulingMemoNotice}
          >
            <Text
              style={[
                styles.backupToggleText,
                memoNoticeEnabled ? styles.backupToggleTextActive : styles.backupToggleTextInactive,
                isDark && {
                  color: memoNoticeEnabled ? '#6EE7B7' : colors.text.muted,
                },
              ]}
              allowFontScaling={false}
              maxFontSizeMultiplier={1.08}
            >
              {memoNoticeEnabled ? '已開啟提醒' : '已關閉提醒'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text
          style={[styles.sectionHeaderDesc, { color: colors.text.secondary }]}
          allowFontScaling={false}
          maxFontSizeMultiplier={1.08}
        >
          全家待辦全員接收；個人專屬待辦僅提醒被指派之負責成員，到期日與預告推播完美一致
        </Text>

        {/* 生活記事預設提前預警策略 */}
        <View style={styles.reminderSubSection}>
          <Text style={[styles.reminderSubLabel, { color: colors.text.secondary }]}>
            預設提前預警（含一般記事與接力子項目，到期當天皆會於 {notifPrefs.dailyReminderTime} 提醒）
          </Text>
          <View style={styles.reminderOptionsWrapRow}>
            {MEMO_ADVANCE_OPTIONS.map((opt) => {
              const isSelected = notifPrefs.memoAdvanceMode === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.reminderChoicePill,
                    {
                      backgroundColor: isSelected
                        ? isDark
                          ? 'rgba(20, 184, 166, 0.22)'
                          : '#CCFBF1'
                        : colors.background.modal,
                      borderColor: isSelected ? '#0D9488' : colors.border.default,
                    },
                  ]}
                  onPress={() => onUpdateNotifPrefs({ memoAdvanceMode: opt.value })}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.reminderChoicePillText,
                      {
                        color: isSelected
                          ? isDark
                            ? '#5EEAD4'
                            : '#0F766E'
                          : colors.text.secondary,
                        fontWeight: isSelected ? '700' : '500',
                      },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 展開/收合生活待辦時程按鈕 */}
        <TouchableOpacity
          style={[
            styles.collapseToggleBtn,
            { backgroundColor: colors.background.modal, borderColor: colors.border.default },
          ]}
          onPress={() => setIsMemosExpanded((prev) => !prev)}
          activeOpacity={0.7}
        >
          <Text style={[styles.collapseToggleBtnText, { color: colors.text.primary }]}>
            {isMemosExpanded
              ? '收合生活待辦排程 ▴'
              : `展開生活待辦排程 (${pendingMemos.length} 則) ▾`}
          </Text>
        </TouchableOpacity>

        {/* 待辦記事清單預覽 */}
        {isMemosExpanded && (
          <View
            style={[
              styles.cardScheduleContainer,
              { backgroundColor: colors.background.modal, borderColor: colors.border.default },
            ]}
          >
            {pendingMemos.length === 0 ? (
              <View style={styles.noCardBox}>
                <Text style={[styles.noCardText, { color: colors.text.muted }]}>
                  📝 目前無待提醒之生活記事，可在記帳選單中點擊「生活記事」新增並設定提醒日期
                </Text>
              </View>
            ) : (
              pendingMemos.map((memo) => {
                const parsed = parseMemoNote(memo.note);
                const assignee = memo.paid_by ? getMemberById(memo.paid_by) : null;
                const schedule = computeMemoNotificationTriggers(memo, notifPrefs);
                const fmtMdHm = (d: Date) =>
                  `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(
                    d.getMinutes()
                  ).padStart(2, '0')}`;
                const triggerSummary = schedule.triggers.map((t) => fmtMdHm(t.date)).join(' · ');
                return (
                  <View
                    key={memo.id}
                    style={[styles.cardScheduleRow, { borderBottomColor: colors.border.default }]}
                  >
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={styles.cardScheduleIcon}>{parsed.icon || '📌'}</Text>
                        <Text style={[styles.cardScheduleName, { color: colors.text.primary }]} numberOfLines={1}>
                          {parsed.title}
                        </Text>
                        {schedule.isRelay && (
                          <View
                            style={[
                              styles.cardholderBadge,
                              { backgroundColor: isDark ? 'rgba(20, 184, 166, 0.25)' : '#CCFBF1' },
                            ]}
                          >
                            <Text
                              style={[
                                styles.cardholderBadgeText,
                                { color: isDark ? '#5EEAD4' : '#0F766E' },
                              ]}
                            >
                              🔁 接力
                            </Text>
                          </View>
                        )}
                        <View
                          style={[
                            styles.cardholderBadge,
                            {
                              backgroundColor:
                                memo.reminder_target === 'personal'
                                  ? isDark
                                    ? '#581C87'
                                    : '#FAF5FF'
                                  : isDark
                                  ? '#1E3A8A'
                                  : '#EFF6FF',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.cardholderBadgeText,
                              {
                                color:
                                  memo.reminder_target === 'personal'
                                    ? isDark
                                      ? '#D8B4FE'
                                      : '#9333EA'
                                    : isDark
                                    ? '#93C5FD'
                                    : '#2563EB',
                              },
                            ]}
                          >
                            {memo.reminder_target === 'personal'
                              ? `👤 個人專屬${assignee ? `·${assignee.display_name}` : ''}`
                              : '🌐 全家待辦'}
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.cardScheduleMeta, { color: colors.text.secondary }]} numberOfLines={1}>
                        {schedule.nextStopLabel
                          ? `下一站：${schedule.nextStopLabel}`
                          : parsed.cleanContent || memo.note}
                      </Text>
                      <Text style={[styles.cardScheduleDates, { color: colors.text.muted }]}>
                        📅 到期 {schedule.dueYmd} · 🔔 推播：{triggerSummary}
                        {schedule.relayOverrideOffset !== undefined ? `（${schedule.modeLabel}）` : ''}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* 測試按鈕與雙軌說明 */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, alignItems: 'center' }}>
          <TouchableOpacity
            style={[
              styles.testNoticeBtn,
              { backgroundColor: colors.background.modal, borderColor: colors.border.default },
            ]}
            onPress={onSendTestMemoNotice}
            activeOpacity={0.7}
          >
            <Text style={[styles.testNoticeBtnText, { color: colors.text.primary }]}>
              🔔 發送記事測試推播通知
            </Text>
          </TouchableOpacity>
        </View>

        <Text
          style={[styles.backupPrivacyNote, { color: colors.text.muted, marginTop: 8 }]}
          allowFontScaling={false}
          maxFontSizeMultiplier={1.08}
        >
          💡 貼心聯防：除了手機本機推播之外，每日收支日報中也會同步整理今日待辦與未來 3 天預告，讓家人互相溫馨提醒！
        </Text>
      </View>
    </SettingsSheetModal>
  );
};

const styles = StyleSheet.create({
  sectionCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  cardSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  sectionHeaderDesc: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 10,
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
  backupToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    flexShrink: 0,
  },
  backupToggleBtnActive: {
    backgroundColor: '#DCFCE7',
  },
  backupToggleBtnInactive: {
    backgroundColor: '#F1F5F9',
  },
  backupToggleText: {
    fontSize: 11,
    fontWeight: '700',
  },
  backupToggleTextActive: {
    color: '#15803D',
  },
  backupToggleTextInactive: {
    color: '#64748B',
  },
  reminderOptionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  reminderOptionChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reminderOptionChipText: {
    fontSize: 13,
  },
  reminderSubSection: {
    marginTop: 6,
    marginBottom: 2,
  },
  reminderSubLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    marginBottom: 6,
  },
  reminderSubToggleRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  reminderSubToggleChip: {
    flex: 1,
    minWidth: 135,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reminderSubToggleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  reminderOptionsWrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  reminderChoicePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  reminderChoicePillText: {
    fontSize: 12,
  },
  collapseToggleBtn: {
    width: '100%',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  collapseToggleBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  cardScheduleContainer: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 8,
  },
  noCardBox: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  noCardText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  cardScheduleRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  cardScheduleIcon: {
    fontSize: 16,
  },
  cardScheduleName: {
    fontSize: 14,
    fontWeight: '600',
  },
  cardScheduleMeta: {
    fontSize: 12,
    marginTop: 4,
  },
  cardScheduleDates: {
    fontSize: 11,
    marginTop: 2,
  },
  testNoticeBtn: {
    flex: 1,
    paddingVertical: 10,
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
    fontSize: 10.5,
    lineHeight: 15,
  },
});
