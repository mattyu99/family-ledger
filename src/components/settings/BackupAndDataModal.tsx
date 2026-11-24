import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from '../common/Text';
import { useTheme } from '../../theme/ThemeContext';
import { showAlert } from '../../lib/alert';
import { formatLastBackupText } from '../../lib/backup';
import { SettingsSheetModal } from './SettingsSheetModal';

export interface BackupAndDataModalProps {
  visible: boolean;
  onClose: () => void;
  isCloudSynced: boolean;
  historySyncProgress: { loaded: number; total: number } | null;
  transactionsCount: number;
  membersCount: number;
  categoriesCount: number;
  paymentAccountsCount: number;
  recurringRulesCount: number;
  paymentMethodsCount: number;
  lastBackupAt: string | null;
  autoBackupEnabled: boolean;
  autoBackupInterval: 7 | 14 | 30;
  daysSinceLastBackup: number | null;
  isBackupDue: boolean;
  updateAutoBackupConfig: (enabled: boolean, intervalDays: 7 | 14 | 30) => Promise<void>;
  pendingOfflineCount: number;
  totalPendingOfflineCount: number;
  isProcessingQueue: boolean;
  processOfflineQueue: () => Promise<{ success: boolean; syncedCount: number; failedCount: number }>;
  realIsOwner: boolean;
  isAdminMode: boolean;
  onOpenExportModal: (tab: 'csv' | 'json' | 'attachments' | 'restore') => void;
}

export const BackupAndDataModal: React.FC<BackupAndDataModalProps> = ({
  visible,
  onClose,
  isCloudSynced,
  historySyncProgress,
  transactionsCount,
  membersCount,
  categoriesCount,
  paymentAccountsCount,
  recurringRulesCount,
  paymentMethodsCount,
  lastBackupAt,
  autoBackupEnabled,
  autoBackupInterval,
  daysSinceLastBackup,
  isBackupDue,
  updateAutoBackupConfig,
  pendingOfflineCount,
  totalPendingOfflineCount,
  isProcessingQueue,
  processOfflineQueue,
  realIsOwner,
  isAdminMode,
  onOpenExportModal,
}) => {
  const { colors, isDark } = useTheme();

  const headerBadge = (
    <View
      style={[
        styles.roleBadge,
        isCloudSynced
          ? { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#ECFDF5' }
          : { backgroundColor: isDark ? '#334155' : '#F1F5F9' },
      ]}
    >
      <Text
        style={[
          styles.roleBadgeText,
          isCloudSynced
            ? { color: isDark ? '#34D399' : '#065F46' }
            : { color: isDark ? '#94A3B8' : '#64748B' },
        ]}
        allowFontScaling={false}
        maxFontSizeMultiplier={1.08}
      >
        {historySyncProgress
          ? `🔄 同步中 (${Math.max(historySyncProgress.loaded, transactionsCount).toLocaleString()} / ${historySyncProgress.total.toLocaleString()})`
          : isCloudSynced
          ? '🟢 雲端已同步'
          : '💾 本機離線模式'}
      </Text>
    </View>
  );

  return (
    <SettingsSheetModal
      visible={visible}
      onClose={onClose}
      title="💾 資料備份、匯出與還原"
      subtitle="隨時匯出整本帳簿，資料自主永久保存在個人設備"
      headerRight={headerBadge}
    >
      {/* 帳本狀態小指標 (6 大全要素封存數據) */}
      <View
        style={[
          styles.backupStatsGrid,
          { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default },
        ]}
      >
        <View style={styles.backupStatsRow}>
          <View style={styles.backupStatItem}>
            <Text
              style={[styles.backupStatVal, { color: colors.text.primary }]}
              allowFontScaling={false}
              maxFontSizeMultiplier={1.08}
            >
              {transactionsCount.toLocaleString()}
            </Text>
            <Text
              style={[styles.backupStatLabel, { color: colors.text.secondary }]}
              allowFontScaling={false}
              maxFontSizeMultiplier={1.08}
            >
              📝 交易明細
            </Text>
          </View>
          <View style={[styles.backupStatDivider, { backgroundColor: colors.border.default }]} />
          <View style={styles.backupStatItem}>
            <Text
              style={[styles.backupStatVal, { color: colors.text.primary }]}
              allowFontScaling={false}
              maxFontSizeMultiplier={1.08}
            >
              {membersCount}
            </Text>
            <Text
              style={[styles.backupStatLabel, { color: colors.text.secondary }]}
              allowFontScaling={false}
              maxFontSizeMultiplier={1.08}
            >
              👨‍👩‍👧 家庭成員
            </Text>
          </View>
          <View style={[styles.backupStatDivider, { backgroundColor: colors.border.default }]} />
          <View style={styles.backupStatItem}>
            <Text
              style={[styles.backupStatVal, { color: colors.text.primary }]}
              allowFontScaling={false}
              maxFontSizeMultiplier={1.08}
            >
              {categoriesCount}
            </Text>
            <Text
              style={[styles.backupStatLabel, { color: colors.text.secondary }]}
              allowFontScaling={false}
              maxFontSizeMultiplier={1.08}
            >
              🏷️ 自訂分類
            </Text>
          </View>
        </View>

        <View style={[styles.backupStatsHorizontalDivider, { backgroundColor: colors.border.default }]} />

        <View style={styles.backupStatsRow}>
          <View style={styles.backupStatItem}>
            <Text
              style={[styles.backupStatVal, { color: colors.text.primary }]}
              allowFontScaling={false}
              maxFontSizeMultiplier={1.08}
            >
              {paymentAccountsCount}
            </Text>
            <Text
              style={[styles.backupStatLabel, { color: colors.text.secondary }]}
              allowFontScaling={false}
              maxFontSizeMultiplier={1.08}
            >
              💳 支付卡片
            </Text>
          </View>
          <View style={[styles.backupStatDivider, { backgroundColor: colors.border.default }]} />
          <View style={styles.backupStatItem}>
            <Text
              style={[styles.backupStatVal, { color: colors.text.primary }]}
              allowFontScaling={false}
              maxFontSizeMultiplier={1.08}
            >
              {recurringRulesCount}
            </Text>
            <Text
              style={[styles.backupStatLabel, { color: colors.text.secondary }]}
              allowFontScaling={false}
              maxFontSizeMultiplier={1.08}
            >
              🗓️ 週期/分期
            </Text>
          </View>
          <View style={[styles.backupStatDivider, { backgroundColor: colors.border.default }]} />
          <View style={styles.backupStatItem}>
            <Text
              style={[styles.backupStatVal, { color: colors.text.primary }]}
              allowFontScaling={false}
              maxFontSizeMultiplier={1.08}
            >
              {paymentMethodsCount}
            </Text>
            <Text
              style={[styles.backupStatLabel, { color: colors.text.secondary }]}
              allowFontScaling={false}
              maxFontSizeMultiplier={1.08}
            >
              📱 付款方式
            </Text>
          </View>
        </View>

        <View style={[styles.backupStatsFooter, { borderTopColor: colors.border.default }]}>
          <Text
            style={[styles.backupStatsFooterText, { color: colors.text.muted }]}
            allowFontScaling={false}
            maxFontSizeMultiplier={1.08}
          >
            🛡️ JSON 備份檔 100% 完整封存以上 6 類全要素資料 (含收據照片與帳單連結)
          </Text>
        </View>
      </View>

      {/* 定期備份管理區塊 */}
      <View
        style={[
          styles.backupScheduleBox,
          { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default },
        ]}
      >
        <View style={styles.backupScheduleHeader}>
          <View style={styles.backupScheduleHeaderLeft}>
            <Text
              style={[styles.backupScheduleTitle, { color: colors.text.primary }]}
              allowFontScaling={false}
              maxFontSizeMultiplier={1.08}
            >
              ⏰ 定期備份提醒
            </Text>
            <Text
              style={[styles.backupScheduleSub, { color: colors.text.secondary }]}
              allowFontScaling={false}
              maxFontSizeMultiplier={1.08}
            >
              上次備份：{formatLastBackupText(lastBackupAt)}
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.backupToggleBtn,
              autoBackupEnabled ? styles.backupToggleBtnActive : styles.backupToggleBtnInactive,
            ]}
            onPress={() => updateAutoBackupConfig(!autoBackupEnabled, autoBackupInterval)}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.backupToggleText,
                autoBackupEnabled ? styles.backupToggleTextActive : styles.backupToggleTextInactive,
              ]}
              allowFontScaling={false}
              maxFontSizeMultiplier={1.08}
            >
              {autoBackupEnabled ? '已開啟提醒' : '已關閉提醒'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 備份狀態徽章 */}
        <View
          style={[
            styles.backupStatusNotice,
            isBackupDue ? styles.backupStatusNoticeDue : styles.backupStatusNoticeOk,
          ]}
        >
          <Text
            style={[
              styles.backupStatusNoticeText,
              isBackupDue ? styles.backupStatusNoticeTextDue : styles.backupStatusNoticeTextOk,
            ]}
            allowFontScaling={false}
            maxFontSizeMultiplier={1.08}
          >
            {!autoBackupEnabled
              ? '⏸️ 定期提醒已關閉，您仍可隨時手動點擊下方按鈕匯出存檔。'
              : daysSinceLastBackup === null
              ? '⚠️ 尚未備份至雲端，建議儘早建立第一份備份！'
              : daysSinceLastBackup >= autoBackupInterval
              ? `⚠️ 已間隔 ${daysSinceLastBackup} 天未備份（已超過設定之 ${autoBackupInterval} 天），建議立即存檔！`
              : `✅ 備份狀態良好（預計 ${Math.max(1, autoBackupInterval - daysSinceLastBackup)} 天後提醒）`}
          </Text>
        </View>

        {/* 週期選擇器 Chips */}
        {autoBackupEnabled && (
          <View style={styles.backupIntervalSection}>
            <Text
              style={[styles.backupIntervalLabel, { color: colors.text.secondary }]}
              allowFontScaling={false}
              maxFontSizeMultiplier={1.08}
            >
              提醒週期頻率：
            </Text>
            <View style={styles.backupIntervalChips}>
              {([7, 14, 30] as const).map((days) => (
                <TouchableOpacity
                  key={days}
                  style={[
                    styles.backupIntervalChip,
                    { backgroundColor: colors.background.modal, borderColor: colors.border.default },
                    autoBackupInterval === days && styles.backupIntervalChipActive,
                  ]}
                  onPress={() => updateAutoBackupConfig(true, days)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.backupIntervalChipText,
                      { color: colors.text.secondary },
                      autoBackupInterval === days && styles.backupIntervalChipTextActive,
                    ]}
                    allowFontScaling={false}
                    maxFontSizeMultiplier={1.08}
                  >
                    {days === 7 ? '每週 (7天)' : days === 14 ? '每雙週 (14天)' : '每月 (30天)'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <Text
          style={[styles.backupPrivacyNote, { color: colors.text.muted }]}
          allowFontScaling={false}
          maxFontSizeMultiplier={1.08}
        >
          💡 手機系統隱私機制限制 App 靜默寫入個人雲端；開啟提醒後，系統會在到期時以橫幅通知您一鍵存檔至 Google Drive 或 iCloud。
        </Text>
      </View>

      {/* 📴 離線待補同步隊列看板 */}
      {totalPendingOfflineCount > 0 && (
        <View
          style={[
            styles.offlineOutboxCard,
            {
              backgroundColor: isDark ? '#450A0A33' : '#FEF2F2',
              borderColor: isDark ? '#991B1B' : '#FCA5A5',
            },
          ]}
        >
          <View style={styles.offlineOutboxLeft}>
            <Text style={styles.offlineOutboxIcon}>📴</Text>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={[styles.offlineOutboxTitle, { color: isDark ? '#FCA5A5' : '#B91C1C' }]}>
                {pendingOfflineCount > 0 && totalPendingOfflineCount === pendingOfflineCount
                  ? `離線記帳待補傳隊列 (${pendingOfflineCount} 筆)`
                  : pendingOfflineCount > 0
                  ? `離線記帳待補傳 (本帳本 ${pendingOfflineCount} 筆，其他帳本 ${
                      totalPendingOfflineCount - pendingOfflineCount
                    } 筆)`
                  : `其他帳本待補傳隊列 (${totalPendingOfflineCount} 筆)`}
              </Text>
              <Text style={[styles.offlineOutboxDesc, { color: colors.text.secondary }]}>
                您在離線環境上記錄或編輯的帳目已安全暫存於本機。當網路通暢時，點擊右側按鈕即可立即將所有公帳待補資料同步送達雲端！
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.offlineSyncBtn, isProcessingQueue && { opacity: 0.6 }]}
            onPress={processOfflineQueue}
            disabled={isProcessingQueue}
            activeOpacity={0.8}
          >
            <Text style={styles.offlineSyncBtnText}>
              {isProcessingQueue ? '⏳ 上傳中...' : '☁️ 立即補傳'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 匯出按鈕列 */}
      <View style={styles.backupBtnRow}>
        <TouchableOpacity
          style={styles.exportCsvBtn}
          onPress={() => onOpenExportModal('csv')}
          activeOpacity={0.8}
        >
          <Text style={styles.exportCsvBtnText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
            📊 匯出 CSV 報表 (Excel)
          </Text>
          <Text style={styles.exportBtnSubtext} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
            內建 UTF-8 BOM 防中文亂碼
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.exportJsonBtn}
          onPress={() => onOpenExportModal('json')}
          activeOpacity={0.8}
        >
          <Text style={styles.exportJsonBtnText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
            📦 匯出 JSON 結構備份
          </Text>
          <Text style={styles.exportBtnSubtext} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
            全要素結構 (含照片與帳單)
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[
          styles.restoreEntryBtn,
          {
            backgroundColor: isDark ? 'rgba(99, 102, 241, 0.12)' : '#EEF2FF',
            borderColor: isDark ? 'rgba(99, 102, 241, 0.3)' : '#C7D2FE',
            marginBottom: 10,
          },
        ]}
        onPress={() => onOpenExportModal('attachments')}
        activeOpacity={0.8}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <Text
            style={[styles.restoreEntryBtnText, { color: isDark ? '#A5B4FC' : '#4F46E5' }]}
            allowFontScaling={false}
            maxFontSizeMultiplier={1.08}
          >
            🗂️ 附件離線封存與下載 (收據照片 / 電子帳單)
          </Text>
        </View>
        <Text
          style={[styles.restoreEntryBtnSub, { color: colors.text.secondary }]}
          allowFontScaling={false}
          maxFontSizeMultiplier={1.08}
        >
          匯出 HTML 視覺化封存庫，一鍵在瀏覽器批次下載全部實體 JPG / PDF 檔案
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.restoreEntryBtn,
          { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default },
        ]}
        onPress={() => {
          if (!realIsOwner) {
            showAlert(
              '🔒 僅限管理員執行',
              '回復備份具有覆蓋家庭帳本之重大影響，僅限帳本管理員執行。\n若需回復資料，請洽詢家庭管理員協助。'
            );
            return;
          }
          if (!isAdminMode) {
            showAlert(
              '日常模式受限',
              '目前為日常檢視模式。從備份檔回復資料具有重大影響，請先點擊首頁頂部的【🛡️ 日常模式】啟用管理員模式。'
            );
            return;
          }
          onOpenExportModal('restore');
        }}
        activeOpacity={realIsOwner ? 0.8 : 0.6}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <Text
            style={[styles.restoreEntryBtnText, { color: colors.text.primary }]}
            allowFontScaling={false}
            maxFontSizeMultiplier={1.08}
          >
            {realIsOwner ? '📥 從備份檔回復資料 (還原)' : '🔒 從備份檔回復資料 (僅管理員)'}
          </Text>
          {!realIsOwner && (
            <View style={styles.adminOnlyMiniBadge}>
              <Text style={styles.adminOnlyMiniBadgeText}>管理員</Text>
            </View>
          )}
        </View>
        <Text
          style={[styles.restoreEntryBtnSub, { color: colors.text.secondary }]}
          allowFontScaling={false}
          maxFontSizeMultiplier={1.08}
        >
          {realIsOwner
            ? '支援上傳 .json 備份檔或直接貼上代碼安全還原'
            : '此操作具有覆蓋全帳本之影響，需管理員權限'}
        </Text>
      </TouchableOpacity>
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
  backupStatsGrid: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  backupStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  backupStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  backupStatVal: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
  },
  backupStatLabel: {
    fontSize: 11,
  },
  backupStatDivider: {
    width: 1,
    height: 24,
  },
  backupStatsHorizontalDivider: {
    height: 1,
    marginVertical: 10,
  },
  backupStatsFooter: {
    borderTopWidth: 1,
    marginTop: 10,
    paddingTop: 8,
    alignItems: 'center',
  },
  backupStatsFooterText: {
    fontSize: 11,
    textAlign: 'center',
  },
  backupScheduleBox: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  backupScheduleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  backupScheduleHeaderLeft: {
    flex: 1,
    marginRight: 8,
  },
  backupScheduleTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  backupScheduleSub: {
    fontSize: 11,
    marginTop: 2,
  },
  backupToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
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
  backupStatusNotice: {
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  backupStatusNoticeOk: {
    backgroundColor: '#F0FDF4',
  },
  backupStatusNoticeDue: {
    backgroundColor: '#FEF2F2',
  },
  backupStatusNoticeText: {
    fontSize: 11,
    lineHeight: 15,
  },
  backupStatusNoticeTextOk: {
    color: '#15803D',
  },
  backupStatusNoticeTextDue: {
    color: '#B91C1C',
  },
  backupIntervalSection: {
    marginTop: 4,
    marginBottom: 6,
  },
  backupIntervalLabel: {
    fontSize: 11,
    marginBottom: 4,
  },
  backupIntervalChips: {
    flexDirection: 'row',
    gap: 8,
  },
  backupIntervalChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  backupIntervalChipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  backupIntervalChipText: {
    fontSize: 11,
  },
  backupIntervalChipTextActive: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  backupPrivacyNote: {
    fontSize: 10,
    lineHeight: 14,
    marginTop: 4,
  },
  offlineOutboxCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  offlineOutboxLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  offlineOutboxIcon: {
    fontSize: 22,
  },
  offlineOutboxTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  offlineOutboxDesc: {
    fontSize: 11,
    lineHeight: 15,
  },
  offlineSyncBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  offlineSyncBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  backupBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  exportCsvBtn: {
    flex: 1,
    backgroundColor: '#059669',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  exportCsvBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
    textAlign: 'center',
  },
  exportJsonBtn: {
    flex: 1,
    backgroundColor: '#4F46E5',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  exportJsonBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
    textAlign: 'center',
  },
  exportBtnSubtext: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 10,
    textAlign: 'center',
  },
  restoreEntryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  restoreEntryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  adminOnlyMiniBadge: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 6,
  },
  adminOnlyMiniBadgeText: {
    color: '#B91C1C',
    fontSize: 10,
    fontWeight: '700',
  },
  restoreEntryBtnSub: {
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
});
