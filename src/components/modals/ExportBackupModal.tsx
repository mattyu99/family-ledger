import React, { useState, useMemo, useEffect } from 'react';
import {
  Modal,
  View,
  Text as RNText,
  TextInput as RNTextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  Share,
  StyleSheet,
  TextProps,
  TextInputProps,
  Clipboard,
  Dimensions,
} from 'react-native';
import { useLedger } from '../../context/LedgerContext';
import { useTheme } from '../../theme/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { showAlert, copyToClipboard } from '../../lib/alert';
import { formatLastBackupText } from '../../lib/backup';
import {
  AttachmentStats,
  collectAttachmentStats,
  exportAttachmentArchive,
} from '../../lib/attachmentExport';
import {
  loadCachedStatements,
  loadCachedRecurringStatements,
} from '../../lib/statementStorage';

const Text: React.FC<TextProps> = ({ allowFontScaling = false, maxFontSizeMultiplier = 1.08, ...rest }) => (
  <RNText
    allowFontScaling={allowFontScaling}
    maxFontSizeMultiplier={Math.min(maxFontSizeMultiplier ?? 1.08, 1.08)}
    {...rest}
  />
);

const TextInput: React.FC<TextInputProps> = ({ allowFontScaling = false, maxFontSizeMultiplier = 1.08, ...rest }) => (
  <RNTextInput
    allowFontScaling={allowFontScaling}
    maxFontSizeMultiplier={Math.min(maxFontSizeMultiplier ?? 1.08, 1.08)}
    {...rest}
  />
);

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface ExportBackupModalProps {
  visible: boolean;
  initialTab?: 'csv' | 'json' | 'attachments' | 'restore';
  onClose: () => void;
  onOpenClaimAdmin: () => void;
}

export const ExportBackupModal: React.FC<ExportBackupModalProps> = ({
  visible,
  initialTab = 'csv',
  onClose,
  onOpenClaimAdmin,
}) => {
  const { isDark, colors } = useTheme();
  const styles = useMemo(() => getStyles(isDark, colors), [isDark, colors]);

  const {
    currentLedger,
    isOwner,
    transactions,
    members,
    categories,
    paymentAccounts,
    recurringRules,
    lastBackupAt,
    historySyncProgress,
    exportToCSV,
    exportToJSON,
    restoreFromJSON,
    recordBackupComplete,
  } = useLedger();

  const [exportTab, setExportTab] = useState<'csv' | 'json' | 'attachments' | 'restore'>(initialTab);
  const [csvContent, setCsvContent] = useState('');
  const [jsonContent, setJsonContent] = useState('');
  const [restoreJsonInput, setRestoreJsonInput] = useState('');
  const [restoreMode, setRestoreMode] = useState<'merge' | 'overwrite'>('merge');
  const [isRestoring, setIsRestoring] = useState(false);
  const [attachmentStats, setAttachmentStats] = useState<AttachmentStats>(() =>
    collectAttachmentStats({
      ledgerName: currentLedger?.name || '家庭記帳本',
      transactions: transactions || [],
      cardStatements: [],
      recurringStatements: [],
      paymentAccounts: paymentAccounts || [],
      recurringRules: recurringRules || [],
      members: members || [],
      categories: categories || [],
    })
  );
  const [isExportingArchive, setIsExportingArchive] = useState(false);

  useEffect(() => {
    if (visible) {
      setExportTab(initialTab);
      try {
        const csv = exportToCSV();
        const json = exportToJSON();
        setCsvContent(csv);
        setJsonContent(json);
      } catch (e) {
        console.warn('匯出資料準備失敗:', e);
      }
    }
  }, [visible, initialTab]);

  // 載入附件與電子帳單統計數據
  useEffect(() => {
    if (!visible || !currentLedger?.id) return;
    let isMounted = true;
    Promise.all([
      loadCachedStatements(currentLedger.id),
      loadCachedRecurringStatements(currentLedger.id),
    ])
      .then(([stmts, recStmts]) => {
        if (!isMounted) return;
        const stats = collectAttachmentStats({
          ledgerName: currentLedger.name,
          transactions,
          cardStatements: stmts || [],
          recurringStatements: recStmts || [],
          paymentAccounts,
          recurringRules,
          members,
          categories,
        });
        setAttachmentStats(stats);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [visible, currentLedger?.id, currentLedger?.name, transactions, paymentAccounts, recurringRules, members, categories]);

  const parsedBackupPreview = useMemo(() => {
    if (!restoreJsonInput.trim()) return null;
    try {
      const data = JSON.parse(restoreJsonInput.trim());
      if (!data || typeof data !== 'object') return null;
      if (!Array.isArray(data.transactions)) return null;
      const receiptCount = data.transactions.filter((t: any) => !!t.image_url).length;
      const statementCount =
        (Array.isArray(data.statement_attachments) ? data.statement_attachments.length : (Array.isArray(data.statements) ? data.statements.length : 0)) +
        (Array.isArray(data.recurring_statement_attachments) ? data.recurring_statement_attachments.length : (Array.isArray(data.recurring_statements) ? data.recurring_statements.length : 0));

      return {
        isValid: true,
        appName: data.app || '甜心記帳本',
        version: typeof data.version === 'string' && data.version.trim() ? data.version.trim() : '1.0.3',
        exportedAt: data.exported_at ? new Date(data.exported_at).toLocaleString() : '未知',
        txCount: data.transactions.length,
        memberCount: Array.isArray(data.members) ? data.members.length : 0,
        categoryCount: Array.isArray(data.categories) ? data.categories.length : 0,
        cardCount: Array.isArray(data.payment_accounts) ? data.payment_accounts.length : 0,
        receiptCount,
        statementCount,
      };
    } catch {
      return null;
    }
  }, [restoreJsonInput]);

  const handleExportAttachmentArchive = async () => {
    if (!attachmentStats || attachmentStats.totalCount === 0) {
      showAlert('提示', '目前此帳本尚無任何附件檔案（收據照片或帳單 PDF）。');
      return;
    }
    setIsExportingArchive(true);
    try {
      await exportAttachmentArchive({
        ledgerName: currentLedger.name,
        stats: attachmentStats,
      });
      await recordBackupComplete();
    } catch (e: any) {
      showAlert('匯出失敗', e?.message || '發生未知錯誤');
    } finally {
      setIsExportingArchive(false);
    }
  };

  const handleCopyAttachmentLinks = () => {
    if (!attachmentStats || attachmentStats.totalCount === 0) {
      showAlert('提示', '目前此帳本尚無任何附件檔案。');
      return;
    }
    const lines = attachmentStats.allItems.map(
      it => `${it.originalName}\t${it.url}`
    );
    copyToClipboard(
      lines.join('\n'),
      `✅ 已複製全部 ${attachmentStats.totalCount} 個附件的檔名與下載連結！可直接貼至下載管理器。`
    );
  };

  const handleWebFileSelect = (event: any) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        setRestoreJsonInput(text);
        showAlert('讀取成功', `已載入備份檔案「${file.name}」！`);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleFileSelectBtnPress = () => {
    if (Platform.OS === 'web') {
      if (typeof document !== 'undefined') {
        const el = document.getElementById('backup-file-input');
        el?.click();
      }
    } else {
      Alert.alert(
        '📂 手機端檔案還原指引',
        '在手機上還原最快的方式是使用剪貼簿：\n\n1. 請在手機檔案、雲端硬碟或 LINE 中開啟備份檔並「複製全部文字」\n2. 回到此處點擊「📋 讀取剪貼簿貼上」\n\n系統將自動秒速辨識並完成還原！',
        [
          { text: '關閉', style: 'cancel' },
          { text: '📋 立即讀取剪貼簿', onPress: () => handlePasteClipboard() },
        ]
      );
    }
  };

  const handlePasteClipboard = async () => {
    try {
      let text = '';
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        text = await navigator.clipboard.readText();
      } else if (Clipboard && typeof Clipboard.getString === 'function') {
        text = await Clipboard.getString();
      }

      if (text && text.trim()) {
        setRestoreJsonInput(text.trim());
        showAlert('貼上成功', '已從系統剪貼簿自動讀取並帶入備份內容！');
      } else {
        showAlert('剪貼簿中無內容', '請先從備份檔案、LINE 或雲端記事複製 JSON 備份內容，再點擊此處貼上。');
      }
    } catch {
      showAlert('提示', '無法自動讀取剪貼簿，請直接在文字框中長按並選擇「貼上」。');
    }
  };

  const downloadWebFile = (filename: string, content: string, mimeType: string) => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      try {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        recordBackupComplete();
        showAlert('下載成功', `已將備份檔「${filename}」下載至您的裝置！`);
        return true;
      } catch (err) {
        console.warn('下載失敗:', err);
      }
    }
    return false;
  };

  const handleCopyExportContent = async () => {
    const isCsv = exportTab === 'csv';
    const text = isCsv ? csvContent : jsonContent;
    await recordBackupComplete();
    copyToClipboard(
      text,
      isCsv
        ? '✅ CSV 報表內容已複製到剪貼簿！可直接貼上至 Excel 或 Google 試算表。'
        : '✅ JSON 完整結構備份已複製到剪貼簿！'
    );
  };

  const handleShareToCloud = async () => {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const isCsv = exportTab === 'csv';
    const filename = isCsv
      ? `甜心記帳本_${currentLedger?.name || '家庭公帳'}_${dateStr}.csv`
      : `甜心記帳本_${currentLedger?.name || '家庭公帳'}_完整備份_${dateStr}.json`;
    const content = isCsv ? csvContent : jsonContent;
    const mimeType = isCsv ? 'text/csv;charset=utf-8;' : 'application/json;charset=utf-8;';

    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && typeof File !== 'undefined' && (navigator as any).canShare) {
        try {
          const file = new File([content], filename, { type: mimeType });
          if ((navigator as any).canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: filename,
              text: `甜心記帳本備份檔：${filename}`,
            });
            await recordBackupComplete();
            return;
          }
        } catch (e: any) {
          if (e.name === 'AbortError') return;
        }
      }
      downloadWebFile(filename, content, mimeType);
      return;
    }

    try {
      await Share.share({
        title: filename,
        message: content,
      });
      await recordBackupComplete();
    } catch (err) {
      console.warn('原生呼叫分享失敗:', err);
      copyToClipboard(content, '已將備份內容複製到剪貼簿！可直接貼至 Google 雲端硬碟或備忘錄。');
      await recordBackupComplete();
    }
  };

  const handleConfirmRestore = async () => {
    if (!isOwner) {
      showAlert('🔒 權限不足', '只有在管理員模式下才能回復帳本資料');
      return;
    }
    if (!restoreJsonInput.trim() || !parsedBackupPreview) {
      showAlert('提示', '請先貼上或選擇有效的備份內容');
      return;
    }

    const doRestore = async () => {
      setIsRestoring(true);
      try {
        const result = await restoreFromJSON(restoreJsonInput, { mode: restoreMode });
        if (result.success) {
          showAlert('🎉 資料還原成功', result.message);
          setRestoreJsonInput('');
          onClose();
        } else {
          showAlert('還原失敗', result.message);
        }
      } catch (err: any) {
        showAlert('還原失敗', err?.message || '發生未知錯誤');
      } finally {
        setIsRestoring(false);
      }
    };

    if (restoreMode === 'overwrite') {
      if (Platform.OS === 'web') {
        const confirmed = window.confirm(
          '⚠️ 注意：您選擇了「完全覆蓋」，這將以備份檔資料為準覆蓋現有成員名冊、卡片與明細。確定要繼續嗎？'
        );
        if (confirmed) await doRestore();
      } else {
        Alert.alert(
          '⚠️ 確認完全覆蓋？',
          '這將以備份檔資料為準覆蓋現有成員名冊、卡片與明細，確定要繼續嗎？',
          [
            { text: '取消', style: 'cancel' },
            { text: '確定覆蓋', style: 'destructive', onPress: doRestore },
          ]
        );
      }
    } else {
      await doRestore();
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.exportOverlay}>
        <View style={styles.exportCard}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.exportTitle}>🛡️ 帳本資料備份與還原</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 格式切換頁籤 */}
          <View style={styles.exportTabRow}>
            <TouchableOpacity
              style={[styles.exportTabBtn, exportTab === 'csv' && styles.exportTabBtnActive]}
              onPress={() => setExportTab('csv')}
              activeOpacity={0.7}
            >
              <Text style={[styles.exportTabBtnText, exportTab === 'csv' && styles.exportTabBtnTextActive]}>
                📊 CSV
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.exportTabBtn, exportTab === 'json' && styles.exportTabBtnActive]}
              onPress={() => setExportTab('json')}
              activeOpacity={0.7}
            >
              <Text style={[styles.exportTabBtnText, exportTab === 'json' && styles.exportTabBtnTextActive]}>
                📦 JSON
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.exportTabBtn, exportTab === 'attachments' && styles.exportTabBtnActive]}
              onPress={() => setExportTab('attachments')}
              activeOpacity={0.7}
            >
              <Text style={[styles.exportTabBtnText, exportTab === 'attachments' && styles.exportTabBtnTextActive]}>
                🗂️ 附件
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.exportTabBtn, exportTab === 'restore' && styles.exportTabBtnActive]}
              onPress={() => {
                if (!isOwner) {
                  showAlert(
                    '🔒 權限不足',
                    '只有在管理員模式下才能回復帳本資料。\n\n若需回復，請先於家庭設定中切換至管理員模式。'
                  );
                  return;
                }
                setExportTab('restore');
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.exportTabBtnText, exportTab === 'restore' && styles.exportTabBtnTextActive]}>
                {isOwner ? '📥 還原' : '🔒 還原'}
              </Text>
            </TouchableOpacity>
          </View>

          {exportTab === 'attachments' ? (
            <ScrollView
              style={styles.attachmentScrollArea}
              contentContainerStyle={{ paddingBottom: 16 }}
              showsVerticalScrollIndicator={false}
            >
              {/* 現況數據橫幅 */}
              <View style={styles.attachmentStatsCard}>
                <View style={styles.attachmentStatsHeader}>
                  <Text style={styles.attachmentStatsTitle}>📦 附件庫現況統計</Text>
                  <Text style={styles.attachmentStatsSub}>
                    估算雲端空間：{attachmentStats?.totalEstimatedFormatted || '0 KB'}
                  </Text>
                </View>

                <View style={styles.attachmentStatsGrid}>
                  <View style={styles.attachmentStatBox}>
                    <Text style={styles.attachmentStatNum}>{attachmentStats?.receiptCount || 0}</Text>
                    <Text style={styles.attachmentStatLabel}>📷 收據照片</Text>
                  </View>
                  <View style={styles.attachmentStatBox}>
                    <Text style={styles.attachmentStatNum}>{attachmentStats?.cardStatementCount || 0}</Text>
                    <Text style={styles.attachmentStatLabel}>💳 信用卡帳單</Text>
                  </View>
                  <View style={styles.attachmentStatBox}>
                    <Text style={styles.attachmentStatNum}>{attachmentStats?.recurringStatementCount || 0}</Text>
                    <Text style={styles.attachmentStatLabel}>⚡ 水電固定</Text>
                  </View>
                  <View style={styles.attachmentStatBox}>
                    <Text style={[styles.attachmentStatNum, { color: '#10B981' }]}>
                      {attachmentStats?.totalCount || 0}
                    </Text>
                    <Text style={styles.attachmentStatLabel}>總附件量</Text>
                  </View>
                </View>
              </View>

              {/* 說明提示卡片 */}
              <View style={styles.exportTipBox}>
                <Text style={styles.exportTipText}>
                  💡 實體檔案已 100% 安全儲存於 Supabase 雲端儲存桶。只要雲端帳本正常運作，隨時可於明細與帳單中直接開啟。
                </Text>
                <Text style={styles.exportTipSubtext}>
                  🌐 點擊下方「📥 匯出附件離線索引庫」，將產出包含所有照片縮圖與帳單連結的專屬 HTML 頁面；在任何電腦或手機瀏覽器開啟，即可離線檢視並一鍵批次將真實檔案下載存檔至個人硬碟！
                </Text>
              </View>

              {/* 下載/分享操作群 */}
              <View style={styles.exportActionRow}>
                <TouchableOpacity
                  style={[styles.exportDownloadBtn, isExportingArchive && { opacity: 0.7 }]}
                  onPress={handleExportAttachmentArchive}
                  disabled={isExportingArchive}
                  activeOpacity={0.8}
                >
                  <Text style={styles.exportDownloadBtnText}>
                    {isExportingArchive ? '⏳ 正在封裝...' : '📥 匯出附件離線索引庫 (HTML)'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.exportCopyBtn}
                  onPress={handleCopyAttachmentLinks}
                  activeOpacity={0.8}
                >
                  <Text style={styles.exportCopyBtnText}>📋 複製全附件 URL 清單</Text>
                </TouchableOpacity>
              </View>

              {/* 附件清單預覽 */}
              {attachmentStats && attachmentStats.allItems.length > 0 ? (
                <View style={styles.attachmentListSection}>
                  <Text style={styles.attachmentListHeader}>
                    🗂️ 最近附件預覽 ({attachmentStats.allItems.length} 個項目)
                  </Text>
                  {attachmentStats.allItems.slice(0, 15).map(item => (
                    <View key={item.id} style={styles.attachmentListItem}>
                      <Text style={styles.attachmentItemIcon}>
                        {item.type === 'receipt' ? '📷' : item.type === 'card_statement' ? '💳' : '⚡'}
                      </Text>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.attachmentItemTitle} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={styles.attachmentItemSub} numberOfLines={1}>
                          {item.date} · {item.subtitle}
                        </Text>
                      </View>
                      {item.amountText ? (
                        <Text style={styles.attachmentItemAmount}>{item.amountText}</Text>
                      ) : null}
                    </View>
                  ))}
                  {attachmentStats.allItems.length > 15 ? (
                    <Text style={styles.attachmentMoreHint}>
                      ...其餘 {attachmentStats.allItems.length - 15} 個項目完整收錄於匯出之 HTML 封存庫中
                    </Text>
                  ) : null}
                </View>
              ) : (
                <View style={styles.emptyAttachmentBox}>
                  <Text style={styles.emptyAttachmentIcon}>📭</Text>
                  <Text style={styles.emptyAttachmentText}>目前尚無上傳任何收據照片或電子帳單</Text>
                </View>
              )}
            </ScrollView>
          ) : exportTab === 'restore' ? (
            !isOwner ? (
              <View style={styles.restoreLockedBox}>
                <Text style={styles.restoreLockedIcon}>🔒</Text>
                <Text style={styles.restoreLockedTitle}>僅限帳本管理員使用</Text>
                <Text style={styles.restoreLockedDesc}>
                  回復備份將大範圍更新家庭帳本的成員名冊、卡片與歷史明細。為保護帳本資料安全，此操作僅限帳本管理員執行。
                </Text>
                <TouchableOpacity
                  style={styles.claimAdminBtnMini}
                  onPress={() => {
                    onClose();
                    onOpenClaimAdmin();
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.claimAdminBtnMiniText}>🔐 輸入 PIN 碼升為管理員</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView style={styles.restoreScrollArea} showsVerticalScrollIndicator={false}>
                <View style={styles.exportTipBox}>
                  <Text style={styles.exportTipText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                    {Platform.OS === 'web'
                      ? '💡 支援由甜心記帳本匯出的 .json 備份檔。您可點擊下方按鈕選擇本機檔案，或在文字框貼上 JSON 備份內容進行還原。'
                      : '💡 支援由甜心記帳本匯出的 .json 備份檔。手機端推薦點擊「📋 讀取剪貼簿貼上」一秒自動帶入，亦可於文字框長按貼上。'}
                  </Text>
                </View>

                {/* 方式一：選擇備份檔案 */}
                <View style={styles.restoreFileSection}>
                  <TouchableOpacity
                    style={styles.selectFileBtn}
                    onPress={handleFileSelectBtnPress}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.selectFileBtnIcon}>📂</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.selectFileBtnText}>
                        {Platform.OS === 'web' ? '選擇本機 .json 備份檔案' : '選擇 .json 備份檔案 (手機操作指引)'}
                      </Text>
                      <Text style={styles.selectFileBtnSub}>
                        {Platform.OS === 'web' ? '點擊自動載入並解析備份內容' : '點擊查看手機檔案匯入步驟，或使用下方剪貼簿'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  {Platform.OS === 'web' && (
                    <input
                      id="backup-file-input"
                      type="file"
                      accept=".json,application/json"
                      style={{ display: 'none' }}
                      onChange={handleWebFileSelect}
                    />
                  )}
                </View>

                {/* 方式二：貼上備份內容 */}
                <View style={styles.restoreInputSection}>
                  <View style={styles.restoreInputHeader}>
                    <Text style={styles.restoreInputLabel}>貼上 JSON 備份文字：</Text>
                    <TouchableOpacity onPress={handlePasteClipboard} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={styles.pasteClipboardText}>📋 讀取剪貼簿貼上</Text>
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    multiline
                    style={styles.restoreTextInput}
                    placeholder="請在此貼上 JSON 備份內容，或長按選擇貼上..."
                    placeholderTextColor={isDark ? colors.text.muted : '#94A3B8'}
                    value={restoreJsonInput}
                    onChangeText={setRestoreJsonInput}
                    textAlignVertical="top"
                  />
                  {restoreJsonInput.trim().length > 0 && (
                    <TouchableOpacity
                      style={styles.clearRestoreInputBtn}
                      onPress={() => setRestoreJsonInput('')}
                    >
                      <Text style={styles.clearRestoreInputText}>✕ 清除內容</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* 備份資訊預覽 */}
                {parsedBackupPreview ? (
                  <View style={styles.previewCard}>
                    <View style={styles.previewCardHeader}>
                      <Text style={styles.previewCardTitle}>📦 備份檔解析成功</Text>
                      <View style={styles.previewBadge}>
                        <Text style={styles.previewBadgeText}>格式驗證通過 ✓</Text>
                      </View>
                    </View>
                    <View style={styles.previewGrid}>
                      <View style={styles.previewGridItem}>
                        <Text style={styles.previewItemLabel}>備份版本</Text>
                        <Text style={[styles.previewItemValue, { color: '#059669', fontWeight: '800' }]}>
                          v{parsedBackupPreview.version}
                        </Text>
                      </View>
                      <View style={styles.previewGridItem}>
                        <Text style={styles.previewItemLabel}>備份時間</Text>
                        <Text style={styles.previewItemValue}>{parsedBackupPreview.exportedAt}</Text>
                      </View>
                      <View style={styles.previewGridItem}>
                        <Text style={styles.previewItemLabel}>交易明細筆數</Text>
                        <Text style={[styles.previewItemValue, { color: '#0284C7', fontWeight: '800' }]}>
                          {parsedBackupPreview.txCount} 筆
                        </Text>
                      </View>
                      <View style={styles.previewGridItem}>
                        <Text style={styles.previewItemLabel}>家庭成員</Text>
                        <Text style={styles.previewItemValue}>{parsedBackupPreview.memberCount} 位</Text>
                      </View>
                      <View style={styles.previewGridItem}>
                        <Text style={styles.previewItemLabel}>支付卡片與帳戶</Text>
                        <Text style={styles.previewItemValue}>{parsedBackupPreview.cardCount} 張</Text>
                      </View>
                      <View style={styles.previewGridItem}>
                        <Text style={styles.previewItemLabel}>附件與帳單</Text>
                        <Text style={[styles.previewItemValue, { color: '#8B5CF6', fontWeight: '800' }]}>
                          {parsedBackupPreview.receiptCount > 0 || parsedBackupPreview.statementCount > 0
                            ? `${parsedBackupPreview.receiptCount} 張照片 / ${parsedBackupPreview.statementCount} 份帳單`
                            : '無附件'}
                        </Text>
                      </View>
                      <View style={styles.previewGridItem}>
                        <Text style={styles.previewItemLabel}>來源應用</Text>
                        <Text style={styles.previewItemValue} numberOfLines={1}>{parsedBackupPreview.appName}</Text>
                      </View>
                    </View>

                    {/* 還原模式選擇 */}
                    <Text style={styles.restoreModeTitle}>選擇還原方式：</Text>
                    <View style={styles.restoreModeRow}>
                      <TouchableOpacity
                        style={[styles.restoreModeOption, restoreMode === 'merge' && styles.restoreModeOptionActive]}
                        onPress={() => setRestoreMode('merge')}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.restoreModeOptionTitle, restoreMode === 'merge' && styles.restoreModeOptionTitleActive]}>
                          🔄 安全合併 (推薦)
                        </Text>
                        <Text style={styles.restoreModeOptionDesc}>
                          保留現有成員與資料，補入備份檔中缺少的家庭成員、卡片與歷史明細（依 ID 自動去重，安全不重複）
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.restoreModeOption, restoreMode === 'overwrite' && styles.restoreModeOptionActiveDanger]}
                        onPress={() => setRestoreMode('overwrite')}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.restoreModeOptionTitle, restoreMode === 'overwrite' && styles.restoreModeOptionTitleActiveDanger]}>
                          ⚠️ 完全覆蓋
                        </Text>
                        <Text style={styles.restoreModeOptionDesc}>
                          以備份檔資料為準，完全還原至備份當時的成員名冊、卡片與明細狀態（當前登入者身分將受到保護）
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* 開始還原按鈕 */}
                    <TouchableOpacity
                      style={[styles.confirmRestoreBtn, isRestoring && { opacity: 0.7 }]}
                      onPress={handleConfirmRestore}
                      disabled={isRestoring}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.confirmRestoreBtnText}>
                        {isRestoring ? '⏳ 正在還原中...' : '🚀 確認開始回復資料'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : restoreJsonInput.trim().length > 0 ? (
                  <View style={styles.invalidJsonBox}>
                    <Text style={styles.invalidJsonText}>⚠️ 無法解析此內容為有效的甜心記帳本備份格式，請確認 JSON 是否完整</Text>
                  </View>
                ) : null}
              </ScrollView>
            )
          ) : (
            <>
              {/* 說明橫幅 */}
              <View style={styles.exportTipBox}>
                <Text style={styles.exportTipText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                  {exportTab === 'csv'
                    ? '💡 格式通用於微軟 Excel、Google 試算表與 Apple Numbers，已注入 UTF-8 BOM 繁體中文防亂碼保護。'
                    : '💡 完整封存明細、成員、分類、卡片帳戶、週期規則 (含分期) 及付款方式之 6 大全要素高精度結構封包。'}
                </Text>
                {Platform.OS !== 'web' && (
                  <Text style={styles.exportTipSubtext} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                    {exportTab === 'csv'
                      ? '📱 手機端點擊下方「☁️ 存到雲端硬碟 / 分享」，可在系統選單直接點選「Google 雲端硬碟」或「儲存到檔案」即時備份。'
                      : '📱 手機端點擊下方「📋 一鍵複製全部文字」可直接複製到系統剪貼簿；切換至「📥 回復資料」點擊「📋 讀取剪貼簿貼上」即可快速還原。'}
                  </Text>
                )}
                <View style={styles.exportLastBackupRow}>
                  <Text style={styles.exportLastBackupText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                    ⏱️ 上次備份記錄：{formatLastBackupText(lastBackupAt)}
                  </Text>
                </View>
              </View>

              {/* 內容預覽 */}
              <ScrollView style={styles.csvBox}>
                <Text style={styles.csvText} selectable>
                  {exportTab === 'csv' ? csvContent : jsonContent}
                </Text>
              </ScrollView>

              {/* 操作按鈕群 */}
              <View style={styles.exportActionRow}>
                <TouchableOpacity style={styles.exportCopyBtn} onPress={handleCopyExportContent} activeOpacity={0.8}>
                  <Text style={styles.exportCopyBtnText}>📋 一鍵複製全部文字</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.exportDownloadBtn} onPress={handleShareToCloud} activeOpacity={0.8}>
                  <Text style={styles.exportDownloadBtnText}>
                    {Platform.OS === 'web'
                      ? exportTab === 'csv'
                        ? '💾 下載 .csv 檔案'
                        : '💾 下載 .json 檔案'
                      : '☁️ 存到雲端硬碟 / 分享'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <TouchableOpacity style={styles.closeExportBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.closeExportBtnText}>關閉</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const getStyles = (isDark: boolean, colors: ThemeColors) =>
  StyleSheet.create({
    exportOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 16,
    },
    exportCard: {
      backgroundColor: isDark ? colors.background.modal : '#FFFFFF',
      borderRadius: 16,
      padding: 20,
      width: '100%',
      maxWidth: 500,
      maxHeight: '90%',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 5,
    },
    modalHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
    },
    exportTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: isDark ? colors.text.primary : '#1F2937',
    },
    closeBtn: {
      padding: 4,
    },
    closeText: {
      fontSize: 18,
      color: isDark ? colors.text.muted : '#9CA3AF',
      fontWeight: 'bold',
    },
    exportTabRow: {
      flexDirection: 'row',
      backgroundColor: isDark ? colors.background.cardSubtle : '#F3F4F6',
      borderRadius: 10,
      padding: 4,
      marginBottom: 14,
    },
    exportTabBtn: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      borderRadius: 8,
    },
    exportTabBtnActive: {
      backgroundColor: isDark ? colors.background.modal : '#FFFFFF',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    exportTabBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? colors.text.muted : '#6B7280',
    },
    exportTabBtnTextActive: {
      color: '#2563EB',
      fontWeight: 'bold',
    },
    restoreLockedBox: {
      padding: 24,
      alignItems: 'center',
      backgroundColor: isDark ? colors.background.cardSubtle : '#F9FAFB',
      borderRadius: 12,
      marginVertical: 10,
    },
    restoreLockedIcon: {
      fontSize: 36,
      marginBottom: 10,
    },
    restoreLockedTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: isDark ? colors.text.primary : '#1F2937',
      marginBottom: 6,
    },
    restoreLockedDesc: {
      fontSize: 13,
      color: isDark ? colors.text.muted : '#6B7280',
      textAlign: 'center',
      lineHeight: 18,
      marginBottom: 16,
    },
    claimAdminBtnMini: {
      backgroundColor: '#2563EB',
      borderRadius: 8,
      paddingVertical: 10,
      paddingHorizontal: 16,
    },
    claimAdminBtnMiniText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: 'bold',
    },
    restoreScrollArea: {
      maxHeight: 460,
    },
    attachmentScrollArea: {
      maxHeight: Math.min(480, SCREEN_HEIGHT * 0.62),
    },
    exportTipBox: {
      backgroundColor: isDark ? colors.background.cardSubtle : '#EFF6FF',
      borderRadius: 10,
      padding: 12,
      marginBottom: 12,
    },
    exportTipText: {
      fontSize: 12,
      color: isDark ? colors.text.secondary : '#1E40AF',
      lineHeight: 16,
    },
    exportTipSubtext: {
      fontSize: 11,
      color: isDark ? colors.text.muted : '#3B82F6',
      lineHeight: 15,
      marginTop: 4,
    },
    exportLastBackupRow: {
      marginTop: 6,
      borderTopWidth: 1,
      borderTopColor: isDark ? colors.border.default : '#DBEAFE',
      paddingTop: 6,
    },
    exportLastBackupText: {
      fontSize: 11,
      color: isDark ? colors.text.muted : '#6B7280',
    },
    restoreFileSection: {
      marginBottom: 12,
    },
    selectFileBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
      borderWidth: 1,
      borderColor: isDark ? colors.border.default : '#CBD5E1',
      borderStyle: 'dashed',
      borderRadius: 10,
      padding: 12,
      gap: 10,
    },
    selectFileBtnIcon: {
      fontSize: 24,
    },
    selectFileBtnText: {
      fontSize: 13,
      fontWeight: 'bold',
      color: isDark ? colors.text.primary : '#1E293B',
    },
    selectFileBtnSub: {
      fontSize: 11,
      color: isDark ? colors.text.muted : '#64748B',
      marginTop: 2,
    },
    restoreInputSection: {
      marginBottom: 14,
    },
    restoreInputHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    restoreInputLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? colors.text.secondary : '#374151',
    },
    pasteClipboardText: {
      fontSize: 12,
      color: '#2563EB',
      fontWeight: 'bold',
    },
    restoreTextInput: {
      backgroundColor: isDark ? colors.background.cardSubtle : '#F9FAFB',
      borderWidth: 1,
      borderColor: isDark ? colors.border.default : '#E5E7EB',
      borderRadius: 10,
      padding: 10,
      fontSize: 12,
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
      color: isDark ? colors.text.primary : '#1F2937',
      minHeight: 90,
      maxHeight: 140,
    },
    clearRestoreInputBtn: {
      alignSelf: 'flex-end',
      marginTop: 4,
    },
    clearRestoreInputText: {
      fontSize: 11,
      color: '#EF4444',
    },
    previewCard: {
      backgroundColor: isDark ? colors.background.cardSubtle : '#F0FDF4',
      borderWidth: 1,
      borderColor: '#86EFAC',
      borderRadius: 12,
      padding: 12,
      marginBottom: 14,
    },
    previewCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    previewCardTitle: {
      fontSize: 14,
      fontWeight: 'bold',
      color: '#15803D',
    },
    previewBadge: {
      backgroundColor: '#DCFCE7',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    previewBadgeText: {
      fontSize: 11,
      color: '#166534',
      fontWeight: 'bold',
    },
    previewGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 12,
    },
    previewGridItem: {
      width: '48%',
      backgroundColor: isDark ? colors.background.modal : '#FFFFFF',
      padding: 8,
      borderRadius: 8,
    },
    previewItemLabel: {
      fontSize: 11,
      color: isDark ? colors.text.muted : '#6B7280',
    },
    previewItemValue: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? colors.text.primary : '#1F2937',
      marginTop: 2,
    },
    restoreModeTitle: {
      fontSize: 13,
      fontWeight: 'bold',
      color: isDark ? colors.text.secondary : '#374151',
      marginBottom: 8,
    },
    restoreModeRow: {
      gap: 8,
      marginBottom: 12,
    },
    restoreModeOption: {
      padding: 10,
      backgroundColor: isDark ? colors.background.modal : '#FFFFFF',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: isDark ? colors.border.default : '#E5E7EB',
    },
    restoreModeOptionActive: {
      borderColor: '#10B981',
      backgroundColor: isDark ? '#064E3B' : '#F0FDF4',
    },
    restoreModeOptionActiveDanger: {
      borderColor: '#EF4444',
      backgroundColor: isDark ? '#450A0A' : '#FEF2F2',
    },
    restoreModeOptionTitle: {
      fontSize: 13,
      fontWeight: 'bold',
      color: isDark ? colors.text.primary : '#1F2937',
      marginBottom: 2,
    },
    restoreModeOptionTitleActive: {
      color: '#059669',
    },
    restoreModeOptionTitleActiveDanger: {
      color: '#DC2626',
    },
    restoreModeOptionDesc: {
      fontSize: 11,
      color: isDark ? colors.text.muted : '#6B7280',
      lineHeight: 15,
    },
    confirmRestoreBtn: {
      backgroundColor: '#10B981',
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
    },
    confirmRestoreBtnText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: 'bold',
    },
    invalidJsonBox: {
      padding: 10,
      backgroundColor: '#FEF2F2',
      borderRadius: 8,
      marginBottom: 12,
    },
    invalidJsonText: {
      fontSize: 12,
      color: '#DC2626',
    },
    csvBox: {
      maxHeight: 180,
      backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
      borderWidth: 1,
      borderColor: isDark ? colors.border.default : '#E2E8F0',
      borderRadius: 8,
      padding: 10,
      marginBottom: 12,
    },
    csvText: {
      fontSize: 11,
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
      color: isDark ? colors.text.primary : '#334155',
    },
    exportActionRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 10,
    },
    exportCopyBtn: {
      flex: 1,
      backgroundColor: isDark ? colors.background.cardSubtle : '#F3F4F6',
      borderRadius: 10,
      paddingVertical: 11,
      alignItems: 'center',
    },
    exportCopyBtnText: {
      fontSize: 13,
      fontWeight: 'bold',
      color: isDark ? colors.text.secondary : '#374151',
    },
    exportDownloadBtn: {
      flex: 1,
      backgroundColor: '#2563EB',
      borderRadius: 10,
      paddingVertical: 11,
      alignItems: 'center',
    },
    exportDownloadBtnText: {
      fontSize: 13,
      fontWeight: 'bold',
      color: '#FFFFFF',
    },
    attachmentStatsCard: {
      backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
      borderWidth: 1,
      borderColor: isDark ? colors.border.default : '#E2E8F0',
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
    },
    attachmentStatsHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: 10,
    },
    attachmentStatsTitle: {
      fontSize: 14,
      fontWeight: 'bold',
      color: isDark ? colors.text.primary : '#1F2937',
    },
    attachmentStatsSub: {
      fontSize: 12,
      color: '#059669',
      fontWeight: '600',
    },
    attachmentStatsGrid: {
      flexDirection: 'row',
      gap: 6,
    },
    attachmentStatBox: {
      flex: 1,
      backgroundColor: isDark ? colors.background.modal : '#FFFFFF',
      borderWidth: 1,
      borderColor: isDark ? colors.border.default : '#E5E7EB',
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 4,
      alignItems: 'center',
    },
    attachmentStatNum: {
      fontSize: 15,
      fontWeight: '800',
      color: isDark ? colors.text.primary : '#1F2937',
      marginBottom: 2,
    },
    attachmentStatLabel: {
      fontSize: 10,
      color: isDark ? colors.text.muted : '#6B7280',
    },
    attachmentListSection: {
      marginTop: 8,
      marginBottom: 12,
    },
    attachmentListHeader: {
      fontSize: 13,
      fontWeight: 'bold',
      color: isDark ? colors.text.secondary : '#475569',
      marginBottom: 8,
    },
    attachmentListItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? colors.background.cardSubtle : '#FFFFFF',
      borderWidth: 1,
      borderColor: isDark ? colors.border.default : '#F1F5F9',
      borderRadius: 8,
      padding: 8,
      marginBottom: 6,
    },
    attachmentItemIcon: {
      fontSize: 18,
      marginRight: 8,
    },
    attachmentItemTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? colors.text.primary : '#1F2937',
    },
    attachmentItemSub: {
      fontSize: 11,
      color: isDark ? colors.text.muted : '#64748B',
      marginTop: 1,
    },
    attachmentItemAmount: {
      fontSize: 13,
      fontWeight: '700',
      color: '#0284C7',
    },
    attachmentMoreHint: {
      fontSize: 11,
      textAlign: 'center',
      color: isDark ? colors.text.muted : '#94A3B8',
      marginVertical: 6,
    },
    emptyAttachmentBox: {
      alignItems: 'center',
      paddingVertical: 24,
    },
    emptyAttachmentIcon: {
      fontSize: 32,
      marginBottom: 6,
    },
    emptyAttachmentText: {
      fontSize: 13,
      color: isDark ? colors.text.muted : '#94A3B8',
    },
    closeExportBtn: {
      paddingVertical: 10,
      alignItems: 'center',
    },
    closeExportBtnText: {
      fontSize: 13,
      color: isDark ? colors.text.muted : '#6B7280',
    },
  });
