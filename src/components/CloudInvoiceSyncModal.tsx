import React, { useState, useMemo, useEffect } from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  Alert,
  Linking,
  ActivityIndicator,
  TextInput,
  Clipboard,
} from 'react-native';
import { Text } from './common/Text';
import { useTheme } from '../theme/ThemeContext';
import { useLedger } from '../context/LedgerContext';
import {
  processCloudInvoicesSync,
  generateMockCloudInvoices,
  parseMofInvoiceCsv,
  SyncProcessResult,
} from '../lib/cloudInvoiceSync';
import { CloudInvoiceItem, CarrierRule } from '../types/database';
import {
  loadCarrierRules,
  addOrUpdateCarrierRule,
  removeCarrierRule,
} from '../lib/carrierRules';

interface CloudInvoiceSyncModalProps {
  visible: boolean;
  onClose: () => void;
}

export const CloudInvoiceSyncModal: React.FC<CloudInvoiceSyncModalProps> = ({
  visible,
  onClose,
}) => {
  const { colors, isDark } = useTheme();
  const {
    transactions,
    paymentAccounts,
    members,
    currentUser,
    currentLedger,
    categories,
    updateTransaction,
    addTransaction,
    addPaymentAccount,
    updatePaymentAccount,
    getMemberById,
  } = useLedger();

  const [isSyncing, setIsSyncing] = useState(false);
  const [isExecutingImport, setIsExecutingImport] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncProcessResult | null>(null);
  const [parsedInvoices, setParsedInvoices] = useState<CloudInvoiceItem[] | null>(null);
  const [rawCsvText, setRawCsvText] = useState('');
  const [showRawTextInput, setShowRawTextInput] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // 載具分流字典（隱喻的第三張卡）
  const [carrierRules, setCarrierRules] = useState<CarrierRule[]>([]);
  const [changingRuleTarget, setChangingRuleTarget] = useState<CarrierRule | null>(null);

  // 登記未登記載具互動彈窗
  const [quickBindCarrier, setQuickBindCarrier] = useState<{
    carrierNo: string;
    carrierName?: string;
    invoiceCount: number;
    totalAmount: number;
  } | null>(null);
  const [quickBindTab, setQuickBindTab] = useState<'rule' | 'bind_card' | 'new_card'>('rule');

  const [mobileBarcode, setMobileBarcode] = useState('/ABC+123');
  const [isEditingBarcode, setIsEditingBarcode] = useState(false);

  // 載入當前帳本的載具分流字典
  useEffect(() => {
    if (visible && currentLedger?.id) {
      loadCarrierRules(currentLedger.id).then(setCarrierRules);
    }
  }, [visible, currentLedger?.id]);

  // 取得現有各成員登記之實體卡片對應
  const cardMappings = useMemo(() => {
    return paymentAccounts.map(acc => {
      const owner = acc.user_id ? getMemberById(acc.user_id) : undefined;
      const cardDisplay =
        acc.card_number || (acc.last_four_digits ? `末四碼 ${acc.last_four_digits}` : '未填卡號');
      return {
        account: acc,
        ownerName: owner?.display_name || '全家共用',
        cardDisplay,
        isConfigured: !!(acc.card_number || acc.last_four_digits),
      };
    });
  }, [paymentAccounts, getMemberById]);

  // 解析 CSV 核心邏輯
  const handleProcessCsvText = (
    text: string,
    sourceLabel: string = '檔案',
    overrideRules?: CarrierRule[]
  ) => {
    if (!text || !text.trim()) {
      setStatusBanner({
        type: 'error',
        message: '發票內容為空，請確認已選取或貼上正確的發票資料。',
      });
      return;
    }

    try {
      const invoices = parseMofInvoiceCsv(text);
      if (invoices.length === 0) {
        setStatusBanner({
          type: 'error',
          message: '未偵測到有效發票紀錄，請確認檔案格式是否包含 M|發票主檔 與 D|明細。',
        });
        return;
      }

      setParsedInvoices(invoices);
      setRawCsvText(text);

      const defaultCategory = categories.find(c => c.type === 'expense') || categories[0];
      const defaultPayerId = currentUser?.id || members[0]?.id || '';
      const ledgerId = currentLedger?.id || '';

      const activeRules = overrideRules || carrierRules;

      const preview = processCloudInvoicesSync(
        invoices,
        transactions,
        paymentAccounts,
        members,
        defaultPayerId,
        ledgerId,
        defaultCategory?.id || '',
        activeRules
      );

      setSyncResult(preview);
      setStatusBanner({
        type: 'success',
        message: `✅ 已自【${sourceLabel}】成功解析 ${preview.stats.totalInvoices} 筆發票，總額 NT$ ${preview.stats.totalAmount.toLocaleString()}！請檢視分流預覽並確認匯入。`,
      });
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        message: `解析失敗：${err.message || '檔案格式錯誤'}`,
      });
    }
  };

  // Web 端檔案選擇事件處理
  const handleWebCsvFileSelect = (event: any) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      if (text) {
        handleProcessCsvText(text, file.name);
      }
    };
    reader.readAsText(file, 'utf-8');
    event.target.value = '';
  };

  // 點選檔案選取按鈕（跨平台分流）
  const handleFileSelectBtnPress = () => {
    if (Platform.OS === 'web') {
      if (typeof document !== 'undefined') {
        const el = document.getElementById('mof-csv-file-input');
        el?.click();
      }
    } else {
      Alert.alert(
        '📂 手機端讀取發票 CSV 指引',
        '在手機上匯入最簡便的方式：\n\n1. 請於信箱中開啟財政部通知信之附件 CSV 檔並「全選複製」\n2. 回到此處點擊「📋 讀取剪貼簿貼上 CSV」\n\n系統將自動秒速辨識並完成卡號分流！',
        [
          { text: '關閉', style: 'cancel' },
          { text: '📋 立即讀取剪貼簿', onPress: () => handlePasteClipboard() },
        ]
      );
    }
  };

  // 從系統剪貼簿讀取
  const handlePasteClipboard = async () => {
    try {
      let text = '';
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        text = await navigator.clipboard.readText();
      } else if (Clipboard && typeof Clipboard.getString === 'function') {
        text = await Clipboard.getString();
      }

      if (text && text.trim()) {
        handleProcessCsvText(text.trim(), '剪貼簿');
      } else {
        setStatusBanner({
          type: 'info',
          message: '剪貼簿中無內容，請先開啟財政部發票 CSV 檔案複製內容後再點擊貼上。',
        });
      }
    } catch {
      setStatusBanner({
        type: 'info',
        message: '無法自動讀取剪貼簿，可點擊「✍️ 手動貼上」展開文字框直接貼上。',
      });
    }
  };

  // 執行正式匯入寫入帳本資料庫
  const handleExecuteImport = async () => {
    if (!syncResult) return;
    setIsExecutingImport(true);

    try {
      let updatedCount = 0;
      let newCount = 0;

      // 1. 執行更新媒合成功的既有手動交易 (排除已完全同步過無變更者)
      for (const item of syncResult.updatedTransactions) {
        if (!item.isAlreadySynced) {
          await updateTransaction(item.transactionId, item.updates);
          updatedCount++;
        }
      }

      // 2. 執行新增全新雲端發票
      for (const item of syncResult.newTransactions) {
        await addTransaction({
          amount: item.data.amount,
          type: 'expense',
          category_id: item.data.category_id,
          paid_by: item.data.paid_by,
          merchant: item.data.merchant,
          payment_method: item.data.payment_method,
          account_id: item.data.account_id,
          note: item.data.note,
          invoice_number: item.data.invoice_number,
          invoice_random_code: item.data.invoice_random_code,
          transacted_at: item.data.transacted_at,
          invoice_sync_status: 'cloud_imported',
          cloud_synced_at: item.data.cloud_synced_at,
          cloud_carrier_name: item.data.cloud_carrier_name,
          invoice_items: item.data.invoice_items,
        });
        newCount++;
      }

      setStatusBanner({
        type: 'success',
        message: `🎉 匯入完成！成功補齊 ${updatedCount} 筆手動帳目，依卡號自動新增 ${newCount} 筆雲端支出！`,
      });
      setParsedInvoices(null);
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        message: `匯入時發生錯誤：${err.message || '請稍候重試'}`,
      });
    } finally {
      setIsExecutingImport(false);
    }
  };

  // 動作 1：登記為「網購與會員載具分流規則」（隱喻的第三張卡）
  const handleCreateCarrierRule = async (memberId: string) => {
    if (!quickBindCarrier || !currentLedger?.id) return;
    const member = getMemberById(memberId);
    const memberName = member?.display_name || '家庭成員';

    try {
      const newRule = await addOrUpdateCarrierRule(currentLedger.id, {
        carrier_no: quickBindCarrier.carrierNo,
        carrier_name: quickBindCarrier.carrierName || '網購/會員載具',
        user_id: memberId,
      });

      const nextRules = [...carrierRules.filter(r => r.carrier_no !== newRule.carrier_no), newRule];
      setCarrierRules(nextRules);
      setQuickBindCarrier(null);

      if (rawCsvText) {
        handleProcessCsvText(rawCsvText, '載具分流規則已建立', nextRules);
      }

      Alert.alert(
        '🎉 載具分流規則已建立',
        `已成功建立「${quickBindCarrier.carrierName || '載具'}」分流規則！發票將自動歸屬給【${memberName}】，且絕不產生多餘假卡片！`
      );
    } catch (err: any) {
      Alert.alert('建立失敗', err.message || '發生未知錯誤');
    }
  };

  // 動作 2：綁定至「現有實體金融卡片」（真卡絕不重複）
  const handleBindToExistingCard = async (accountId: string) => {
    if (!quickBindCarrier) return;
    const targetAccount = paymentAccounts.find(a => a.id === accountId);
    if (!targetAccount) return;

    try {
      const existingTokens = targetAccount.card_number
        ? targetAccount.card_number.split(/[,;\s]+/).map(t => t.trim()).filter(Boolean)
        : [];
      if (!existingTokens.includes(quickBindCarrier.carrierNo.trim())) {
        existingTokens.push(quickBindCarrier.carrierNo.trim());
      }
      const updatedCardNumber = existingTokens.join(', ');

      await updatePaymentAccount(targetAccount.id, {
        card_number: updatedCardNumber,
      });

      setQuickBindCarrier(null);

      if (rawCsvText) {
        handleProcessCsvText(rawCsvText, '已綁定至現有卡片');
      }

      Alert.alert(
        '🎉 成功綁定至現有卡片',
        `已將載具代號綁定至【${targetAccount.name}】！發票將直接對應此卡，絕不產生多餘重複卡片！`
      );
    } catch (err: any) {
      Alert.alert('綁定失敗', err.message || '發生未知錯誤');
    }
  };

  // 動作 3：建立全新實體金融卡片
  const handleCreateNewPhysicalCard = async (memberId: string) => {
    if (!quickBindCarrier) return;
    const member = getMemberById(memberId);
    const memberName = member?.display_name || '家庭成員';

    const isStored =
      quickBindCarrier.carrierName?.includes('悠遊') ||
      quickBindCarrier.carrierName?.includes('一卡通') ||
      /^\d{10,16}$/.test(quickBindCarrier.carrierNo);

    try {
      await addPaymentAccount({
        name: `${memberName}的${quickBindCarrier.carrierName || (isStored ? '悠遊/一卡通' : '信用卡')}`,
        type: isStored ? 'stored_value' : 'credit_card',
        user_id: memberId,
        card_number: quickBindCarrier.carrierNo,
        last_four_digits: quickBindCarrier.carrierNo.slice(-4),
        balance: 0,
        icon: isStored ? '🚌' : '💳',
        sort_order: paymentAccounts.length,
      });

      setQuickBindCarrier(null);

      if (rawCsvText) {
        handleProcessCsvText(rawCsvText, '新卡片已建立');
      }

      Alert.alert(
        '🎉 新卡片建立成功',
        `已為【${memberName}】建立實體卡片！`
      );
    } catch (err: any) {
      Alert.alert('建卡失敗', err.message || '發生未知錯誤');
    }
  };

  // 修改載具分流字典的歸屬成員
  const handleChangeRuleMemberConfirm = async (newMemberId: string) => {
    if (!changingRuleTarget || !currentLedger?.id) return;
    const member = getMemberById(newMemberId);
    const memberName = member?.display_name || '家庭成員';

    try {
      const updatedRule = await addOrUpdateCarrierRule(currentLedger.id, {
        carrier_no: changingRuleTarget.carrier_no,
        carrier_name: changingRuleTarget.carrier_name,
        user_id: newMemberId,
      });

      const nextRules = carrierRules.map(r => (r.id === updatedRule.id ? updatedRule : r));
      setCarrierRules(nextRules);
      setChangingRuleTarget(null);

      if (rawCsvText) {
        handleProcessCsvText(rawCsvText, '變更歸屬成員', nextRules);
      }

      Alert.alert(
        '✅ 歸屬人變更成功',
        `已將「${changingRuleTarget.carrier_name || changingRuleTarget.carrier_no}」之分流歸屬改為【${memberName}】！`
      );
    } catch (err: any) {
      Alert.alert('更新失敗', err.message || '發生未知錯誤');
    }
  };

  // 刪除載具分流規則（解綁）
  const handleDeleteCarrierRule = (rule: CarrierRule) => {
    Alert.alert(
      '確認解除綁定',
      `確定要解除「${rule.carrier_name || rule.carrier_no}」的分流規則嗎？解除後相關發票將不再自動歸屬特定成員。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '確定解除',
          style: 'destructive',
          onPress: async () => {
            if (!currentLedger?.id) return;
            const updated = await removeCarrierRule(currentLedger.id, rule.id);
            setCarrierRules(updated);
            if (rawCsvText) {
              handleProcessCsvText(rawCsvText, '已解除分流規則', updated);
            }
          },
        },
      ]
    );
  };

  // 開啟未登記載具登記彈窗時自動推薦最合適模式
  const handleOpenQuickBind = (unreg: {
    carrierNo: string;
    carrierName?: string;
    invoiceCount: number;
    totalAmount: number;
  }) => {
    setQuickBindCarrier(unreg);
    const name = unreg.carrierName || '';
    if (name.includes('悠遊') || name.includes('信用卡') || name.includes('金融卡')) {
      setQuickBindTab('bind_card'); // 實體卡預設推薦「綁定至現有真卡」
    } else {
      setQuickBindTab('rule'); // 蝦皮、PSN、MOMO 預設推薦「建立分流規則」
    }
  };

  // 執行雲端發票智慧同步（展示與測試模式）
  const handleRunSync = async () => {
    setIsSyncing(true);
    setSyncResult(null);

    try {
      await new Promise(resolve => setTimeout(resolve, 800));

      const mockInvoices = generateMockCloudInvoices(paymentAccounts);
      const defaultCategory = categories.find(c => c.type === 'expense') || categories[0];
      const defaultPayerId = currentUser?.id || members[0]?.id || '';
      const ledgerId = currentLedger?.id || '';

      const result = processCloudInvoicesSync(
        mockInvoices,
        transactions,
        paymentAccounts,
        members,
        defaultPayerId,
        ledgerId,
        defaultCategory?.id || '',
        carrierRules
      );

      for (const item of result.updatedTransactions) {
        if (!item.isAlreadySynced) {
          await updateTransaction(item.transactionId, item.updates);
        }
      }

      for (const item of result.newTransactions) {
        await addTransaction({
          amount: item.data.amount,
          type: 'expense',
          category_id: item.data.category_id,
          paid_by: item.data.paid_by,
          merchant: item.data.merchant,
          payment_method: item.data.payment_method,
          account_id: item.data.account_id,
          note: item.data.note,
          invoice_number: item.data.invoice_number,
          invoice_random_code: item.data.invoice_random_code,
          transacted_at: item.data.transacted_at,
          invoice_sync_status: 'cloud_imported',
          cloud_synced_at: item.data.cloud_synced_at,
          cloud_carrier_name: item.data.cloud_carrier_name,
          invoice_items: item.data.invoice_items,
        });
      }

      setSyncResult(result);
    } catch (err: any) {
      Alert.alert('同步失敗', err.message || '發生未知錯誤');
    } finally {
      setIsSyncing(false);
    }
  };

  // 開啟財政部官方平台申請
  const handleOpenMofWebsite = () => {
    Linking.openURL('https://www.einvoice.nat.gov.tw/');
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View
          style={[
            styles.modalContent,
            { backgroundColor: isDark ? colors.background.card : '#FFFFFF' },
          ]}
        >
          {/* Web 端隱藏原生檔案選取器 */}
          {Platform.OS === 'web' && (
            <input
              id="mof-csv-file-input"
              type="file"
              accept=".csv,text/csv,text/plain"
              style={{ display: 'none' }}
              onChange={handleWebCsvFileSelect}
            />
          )}

          {/* 標題欄 */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
                ☁️ 財政部雲端發票智慧同步
              </Text>
              <Text style={[styles.headerSubtitle, { color: colors.text.secondary }]}>
                消費發票 CSV 匯入 · 依卡號與網購載具自動分流家庭成員
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Text style={{ fontSize: 18, color: colors.text.secondary }}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false}>
            {/* 狀態提示橫幅 */}
            {statusBanner && (
              <View
                style={[
                  styles.statusBannerBox,
                  {
                    backgroundColor:
                      statusBanner.type === 'success'
                        ? isDark
                          ? 'rgba(16, 185, 129, 0.2)'
                          : '#ECFDF5'
                        : statusBanner.type === 'error'
                        ? isDark
                          ? 'rgba(239, 68, 68, 0.2)'
                          : '#FEF2F2'
                        : isDark
                        ? 'rgba(14, 165, 233, 0.2)'
                        : '#F0F9FF',
                    borderColor:
                      statusBanner.type === 'success'
                        ? '#10B981'
                        : statusBanner.type === 'error'
                        ? '#EF4444'
                        : '#0284C7',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusBannerText,
                    {
                      color:
                        statusBanner.type === 'success'
                          ? '#065F46'
                          : statusBanner.type === 'error'
                          ? '#991B1B'
                          : '#0369A1',
                    },
                  ]}
                >
                  {statusBanner.message}
                </Text>
              </View>
            )}

            {/* 1. 核心發票 CSV 檔案匯入專區 */}
            <View
              style={[
                styles.csvImportHeroCard,
                {
                  backgroundColor: isDark ? 'rgba(14, 165, 233, 0.12)' : '#F0F9FF',
                  borderColor: isDark ? 'rgba(56, 189, 248, 0.35)' : '#BAE6FD',
                },
              ]}
            >
              <View style={styles.heroHeaderRow}>
                <Text style={styles.heroTitle}>📂 匯入官方 Email 發票 CSV 檔案</Text>
                <View style={styles.heroBadge}>
                  <Text style={styles.heroBadgeText}>最推薦</Text>
                </View>
              </View>
              <Text style={styles.heroDesc}>
                每月初財政部寄送的「消費發票彙整通知」CSV 附件，匯入後系統自動解析商品細項，並依卡號分流家庭成員！
              </Text>

              {/* 匯入動作按鈕列 */}
              <View style={styles.actionBtnRow}>
                <TouchableOpacity
                  style={[styles.primaryActionBtn, { flex: 1.1 }]}
                  onPress={handleFileSelectBtnPress}
                  activeOpacity={0.8}
                >
                  <Text style={styles.primaryActionBtnText}>📂 選擇發票 CSV 檔</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.secondaryActionBtn, { flex: 1 }]}
                  onPress={handlePasteClipboard}
                  activeOpacity={0.8}
                >
                  <Text style={styles.secondaryActionBtnText}>📋 讀取剪貼簿貼上</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.textInputToggleBtn}
                  onPress={() => setShowRawTextInput(!showRawTextInput)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.textInputToggleBtnText}>
                    {showRawTextInput ? '收合文字框' : '✍️ 手動貼上'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* 手動文字輸入區塊（可收合） */}
              {showRawTextInput && (
                <View style={styles.rawInputBox}>
                  <TextInput
                    style={[
                      styles.rawTextInput,
                      {
                        backgroundColor: isDark ? colors.background.input : '#FFFFFF',
                        color: colors.text.primary,
                        borderColor: isDark ? colors.border.default : '#CBD5E1',
                      },
                    ]}
                    multiline
                    numberOfLines={5}
                    value={rawCsvText}
                    onChangeText={setRawCsvText}
                    placeholder="在此貼上財政部 CSV 內容 (包含 M| 與 D| 表頭)..."
                    placeholderTextColor="#94A3B8"
                  />
                  <TouchableOpacity
                    style={styles.parseRawBtn}
                    onPress={() => handleProcessCsvText(rawCsvText, '手動貼上')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.parseRawBtnText}>🔍 開始解析發票內容</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* 2. 發票解析即時預覽與確認區塊 */}
            {parsedInvoices && syncResult && (
              <View
                style={[
                  styles.previewSectionBox,
                  {
                    backgroundColor: isDark ? colors.background.cardSubtle : '#FFFFFF',
                    borderColor: '#10B981',
                  },
                ]}
              >
                <View style={styles.previewHeaderRow}>
                  <Text style={styles.previewTitle}>📊 發票分流預覽報告</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setParsedInvoices(null);
                      setSyncResult(null);
                      setRawCsvText('');
                    }}
                  >
                    <Text style={styles.clearPreviewBtnText}>清除重新選取</Text>
                  </TouchableOpacity>
                </View>

                {/* 數據總覽 */}
                <View style={styles.statsSummaryGrid}>
                  <View style={styles.statsSummaryCol}>
                    <Text style={styles.statsSummaryLabel}>發票張數</Text>
                    <Text style={styles.statsSummaryVal}>{syncResult.stats.totalInvoices} 張</Text>
                  </View>
                  <View style={styles.statsSummaryCol}>
                    <Text style={styles.statsSummaryLabel}>總計消費額</Text>
                    <Text style={[styles.statsSummaryVal, { color: '#0284C7' }]}>
                      NT$ {syncResult.stats.totalAmount.toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.statsSummaryCol}>
                    <Text style={styles.statsSummaryLabel}>自動分流</Text>
                    <Text style={[styles.statsSummaryVal, { color: '#10B981' }]}>
                      {syncResult.stats.newCount} 筆
                    </Text>
                  </View>
                  <View style={styles.statsSummaryCol}>
                    <Text style={styles.statsSummaryLabel}>補齊手動記帳</Text>
                    <Text style={[styles.statsSummaryVal, { color: '#F59E0B' }]}>
                      {syncResult.stats.updatedCount} 筆
                    </Text>
                  </View>
                </View>

                {syncResult.stats.alreadySyncedCount > 0 && (
                  <View style={styles.alreadySyncedNote}>
                    <Text style={styles.alreadySyncedNoteText}>
                      🛡️ 系統已自動辨識並略過 {syncResult.stats.alreadySyncedCount} 筆過去已匯入過的相同發票，絕不重複記帳！
                    </Text>
                  </View>
                )}

                {/* 3. 未登記載具提示與登記導引 */}
                {syncResult.unregisteredCarriers.length > 0 && (
                  <View style={styles.unregWarningBox}>
                    <Text style={styles.unregWarningTitle}>💡 偵測到尚未建立對應的載具</Text>
                    <Text style={styles.unregWarningDesc}>
                      以下載具已有發票，目前暫歸主要管理者。您可以點擊「➕ 登記」綁定現有卡片或建立網購分流規則：
                    </Text>
                    {syncResult.unregisteredCarriers.map(unreg => (
                      <View key={unreg.carrierNo} style={styles.unregCarrierRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.unregCarrierName}>
                            {unreg.carrierName || '載具代碼'}
                          </Text>
                          <Text style={styles.unregCarrierNo}>
                            代碼：{unreg.carrierNo}（共 {unreg.invoiceCount} 筆，NT$ {unreg.totalAmount.toLocaleString()}）
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.quickAddCardBtn}
                          onPress={() => handleOpenQuickBind(unreg)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.quickAddCardBtnText}>➕ 登記此載具</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {/* 發票前數筆明細預覽 */}
                <Text style={styles.invoicePreviewListTitle}>
                  📝 匯入明細預覽（前 4 筆示範）：
                </Text>
                {parsedInvoices.slice(0, 4).map(inv => {
                  const itemsSummary =
                    inv.items && inv.items.length > 0
                      ? inv.items.map(i => `${i.name} ($${i.amount})`).join('、')
                      : '無明細清單';
                  return (
                    <View
                      key={inv.invoiceNumber}
                      style={[
                        styles.previewInvoiceItem,
                        {
                          backgroundColor: isDark ? colors.background.input : '#F8FAFC',
                          borderColor: isDark ? colors.border.default : '#E2E8F0',
                        },
                      ]}
                    >
                      <View style={styles.previewInvoiceTopRow}>
                        <Text style={[styles.previewInvoiceMerchant, { color: colors.text.primary }]}>
                          {inv.sellerName || '商店'}
                        </Text>
                        <Text style={styles.previewInvoiceAmount}>
                          NT$ {inv.amount.toLocaleString()}
                        </Text>
                      </View>
                      <View style={styles.previewInvoiceMetaRow}>
                        <Text style={styles.previewInvoiceDate}>
                          📅 {inv.invoiceDate} · 發票 {inv.invoiceNumber}
                        </Text>
                        <View style={styles.previewCarrierBadge}>
                          <Text style={styles.previewCarrierBadgeText}>
                            {inv.carrierName || (inv.carrierNo?.startsWith('/') ? '手機條碼' : '載具')}
                          </Text>
                        </View>
                      </View>
                      <Text
                        style={[styles.previewInvoiceItems, { color: colors.text.secondary }]}
                        numberOfLines={1}
                      >
                        🛒 {itemsSummary}
                      </Text>
                    </View>
                  );
                })}

                {/* 確認執行匯入按鈕 */}
                <TouchableOpacity
                  style={[styles.confirmImportBtn, isExecutingImport && { opacity: 0.7 }]}
                  onPress={handleExecuteImport}
                  disabled={isExecutingImport}
                  activeOpacity={0.85}
                >
                  {isExecutingImport ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <ActivityIndicator color="#FFFFFF" size="small" />
                      <Text style={styles.confirmImportBtnText}>正在同步寫入帳本資料庫...</Text>
                    </View>
                  ) : (
                    <Text style={styles.confirmImportBtnText}>
                      ✅ 確認匯入並同步至帳本 (共 {syncResult.stats.newCount + syncResult.stats.updatedCount} 筆更新)
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* 手機條碼總戶頭區塊 */}
            <View
              style={[
                styles.barcodeCard,
                {
                  backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
                  borderColor: isDark ? colors.border.default : '#E2E8F0',
                },
              ]}
            >
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardHeaderTitle}>📱 共通性載具（手機條碼）</Text>
                <TouchableOpacity
                  onPress={() => setIsEditingBarcode(!isEditingBarcode)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.editBarcodeBtnText}>
                    {isEditingBarcode ? '完成設定' : '修改條碼'}
                  </Text>
                </TouchableOpacity>
              </View>

              {isEditingBarcode ? (
                <TextInput
                  style={[
                    styles.barcodeInput,
                    {
                      backgroundColor: isDark ? colors.background.input : '#FFFFFF',
                      color: colors.text.primary,
                      borderColor: '#38BDF8',
                    },
                  ]}
                  value={mobileBarcode}
                  onChangeText={setMobileBarcode}
                  placeholder="/ABC+123"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="characters"
                />
              ) : (
                <View style={styles.barcodeDisplayRow}>
                  <Text style={styles.barcodeText}>{mobileBarcode}</Text>
                  <View style={styles.verifiedPill}>
                    <Text style={styles.verifiedPillText}>✅ 已啟用自動比對</Text>
                  </View>
                </View>
              )}
              <Text style={styles.barcodeHintText}>
                全家人將悠遊卡與信用卡歸戶至此手機條碼，官方 Email 發票檔將自動依卡號精準分流！
              </Text>
            </View>

            {/* 4. 實體金融卡片載具對照（錢包裡的真卡） */}
            <View style={styles.sectionBox}>
              <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>
                💳 實體金融卡片載具對應（真金白銀）
              </Text>
              <Text style={[styles.sectionDesc, { color: colors.text.secondary }]}>
                發票出現這些卡號時，系統會自動歸入該真實卡片與持卡人，絕不重複多建卡片：
              </Text>

              {cardMappings.length === 0 ? (
                <Text style={styles.emptyCardHint}>目前尚未建立任何卡片，可至「設定」新增。</Text>
              ) : (
                cardMappings.map(({ account, ownerName, cardDisplay }) => (
                  <View
                    key={account.id}
                    style={[
                      styles.cardItemRow,
                      {
                        backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
                        borderColor: isDark ? colors.border.default : '#E2E8F0',
                      },
                    ]}
                  >
                    <View style={styles.cardItemIconBox}>
                      <Text style={{ fontSize: 18 }}>
                        {account.type === 'stored_value' ? '🚌' : '💳'}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardItemName, { color: colors.text.primary }]}>
                        {account.name}
                      </Text>
                      <Text style={[styles.cardItemDetail, { color: colors.text.secondary }]}>
                        卡號/代碼：{cardDisplay}
                      </Text>
                    </View>
                    <View style={styles.cardOwnerPill}>
                      <Text style={styles.cardOwnerPillText}>👤 歸屬【{ownerName}】</Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* 5. 網購與會員分流字典（隱喻的第三張卡） */}
            <View style={styles.sectionBox}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>
                  🛍️ 網購與會員分流字典（隱喻的第三張卡）
                </Text>
                <View style={styles.ruleCountBadge}>
                  <Text style={styles.ruleCountBadgeText}>{carrierRules.length} 條規則</Text>
                </View>
              </View>
              <Text style={[styles.sectionDesc, { color: colors.text.secondary }]}>
                專門處理蝦皮、MOMO、Netflix 等非實體卡載具，只記錄歸屬成員，不污染卡片資產：
              </Text>

              {carrierRules.length === 0 ? (
                <View style={styles.emptyRuleBox}>
                  <Text style={styles.emptyRuleHint}>
                    目前尚無分流規則。匯入發票時若有蝦皮、MOMO 等載具，點擊「登記」即可一鍵加入！
                  </Text>
                </View>
              ) : (
                carrierRules.map(rule => {
                  const owner = getMemberById(rule.user_id);
                  const ownerName = owner?.display_name || '未指定成員';
                  return (
                    <View
                      key={rule.id}
                      style={[
                        styles.ruleItemRow,
                        {
                          backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
                          borderColor: isDark ? colors.border.default : '#E2E8F0',
                        },
                      ]}
                    >
                      <View style={styles.ruleItemIconBox}>
                        <Text style={{ fontSize: 18 }}>
                          {rule.carrier_name?.includes('蝦皮')
                            ? '🛍️'
                            : rule.carrier_name?.includes('PSN') || rule.carrier_name?.includes('Netflix')
                            ? '🎮'
                            : '🏷️'}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.ruleItemName, { color: colors.text.primary }]}>
                          {rule.carrier_name || '網購載具'}
                        </Text>
                        <Text style={[styles.ruleItemDetail, { color: colors.text.secondary }]}>
                          代碼：{rule.carrier_no}
                        </Text>
                      </View>
                      <View style={styles.ruleActionGroup}>
                        <TouchableOpacity
                          style={styles.ruleOwnerBadgeBtn}
                          onPress={() => setChangingRuleTarget(rule)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.ruleOwnerBadgeText}>👤【{ownerName}】 ✏️換人</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.deleteRuleBtn}
                          onPress={() => handleDeleteCarrierRule(rule)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.deleteRuleBtnText}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            {/* 官方 Email 發票通知設定指引 */}
            <View
              style={[
                styles.emailGuideBox,
                {
                  backgroundColor: isDark ? 'rgba(245, 158, 11, 0.1)' : '#FFFBEB',
                  borderColor: isDark ? 'rgba(245, 158, 11, 0.3)' : '#FDE68A',
                },
              ]}
            >
              <Text style={styles.emailGuideTitle}>
                📧 如何開啟財政部每月/每期發票自動寄送？
              </Text>
              <Text style={styles.emailGuideText}>
                1. 登入「財政部電子發票整合服務平台」➔ 進入「手機條碼專區」。{'\n'}
                2. 展開「通知設定」➔「寄送消費資訊」。{'\n'}
                3. 勾選「每月寄送」或「每期寄送」（建議勾選每期寄送，一次涵蓋雙月完整發票）。{'\n'}
                4. 收到官方寄達的 Email 附件 CSV 後，直接匯入此處即可！
              </Text>
              <TouchableOpacity
                style={styles.openMofBtn}
                onPress={handleOpenMofWebsite}
                activeOpacity={0.7}
              >
                <Text style={styles.openMofBtnText}>🔗 前往財政部電子發票平台設定 ➔</Text>
              </TouchableOpacity>
            </View>

            {/* 同步模擬測試按鈕 (保留供測試與演示) */}
            <View style={styles.actionCard}>
              <Text style={styles.actionCardTitle}>⚡ 模擬雲端發票自動比對測試</Text>
              <Text style={styles.actionCardDesc}>
                無 CSV 檔案時，亦可立即模擬抓取 3 筆測試發票（含悠遊卡咖啡、全聯買菜、中油加油）驗證比對引擎：
              </Text>

              <TouchableOpacity
                style={[styles.runSyncBtn, isSyncing && { opacity: 0.7 }]}
                onPress={handleRunSync}
                disabled={isSyncing}
                activeOpacity={0.8}
              >
                {isSyncing ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator color="#FFFFFF" size="small" />
                    <Text style={styles.runSyncBtnText}>正在執行智慧比對測試...</Text>
                  </View>
                ) : (
                  <Text style={styles.runSyncBtnText}>🚀 執行模擬雲端同步測試</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* 登記新載具彈窗（三大模式：分流規則 / 綁定真卡 / 建立真卡） */}
          {quickBindCarrier && (
            <View style={styles.quickBindOverlay}>
              <View
                style={[
                  styles.quickBindCard,
                  { backgroundColor: isDark ? colors.background.card : '#FFFFFF' },
                ]}
              >
                <Text style={[styles.quickBindTitle, { color: colors.text.primary }]}>
                  💡 登記新載具：{quickBindCarrier.carrierName || '載具代碼'}
                </Text>
                <Text style={[styles.quickBindDesc, { color: colors.text.secondary }]}>
                  載具代碼：{quickBindCarrier.carrierNo}（共 {quickBindCarrier.invoiceCount} 筆，NT$ {quickBindCarrier.totalAmount.toLocaleString()}）
                </Text>

                {/* 模式切換 Tabs */}
                <View style={styles.bindTabRow}>
                  <TouchableOpacity
                    style={[styles.bindTabBtn, quickBindTab === 'rule' && styles.bindTabBtnActive]}
                    onPress={() => setQuickBindTab('rule')}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.bindTabBtnText,
                        quickBindTab === 'rule' && styles.bindTabBtnTextActive,
                      ]}
                    >
                      🛍️ 網購分流規則
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.bindTabBtn, quickBindTab === 'bind_card' && styles.bindTabBtnActive]}
                    onPress={() => setQuickBindTab('bind_card')}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.bindTabBtnText,
                        quickBindTab === 'bind_card' && styles.bindTabBtnTextActive,
                      ]}
                    >
                      🔗 綁定現有卡片
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.bindTabBtn, quickBindTab === 'new_card' && styles.bindTabBtnActive]}
                    onPress={() => setQuickBindTab('new_card')}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.bindTabBtnText,
                        quickBindTab === 'new_card' && styles.bindTabBtnTextActive,
                      ]}
                    >
                      ➕ 建立新卡
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* 模式 1：網購與會員載具分流規則（隱喻的第三張卡） */}
                {quickBindTab === 'rule' && (
                  <View style={{ marginVertical: 8 }}>
                    <Text style={styles.tabGuideHint}>
                      📌 適合蝦皮、MOMO、Netflix 等非金融帳戶。純粹記錄一律算哪位成員的支出，不污染卡片資產：
                    </Text>
                    <ScrollView style={{ maxHeight: 200 }}>
                      {members.map(member => (
                        <TouchableOpacity
                          key={member.id}
                          style={[
                            styles.quickBindMemberItem,
                            { borderColor: isDark ? colors.border.default : '#E2E8F0' },
                          ]}
                          onPress={() => handleCreateCarrierRule(member.id)}
                          activeOpacity={0.7}
                        >
                          <Text style={{ fontSize: 20, marginRight: 10 }}>👤</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.quickBindMemberName, { color: colors.text.primary }]}>
                              {member.display_name}
                            </Text>
                            <Text style={{ fontSize: 11, color: colors.text.secondary }}>
                              {member.role === 'owner' ? '👑 帳本管理員' : '家庭成員'}
                            </Text>
                          </View>
                          <Text style={{ color: '#0284C7', fontWeight: '700', fontSize: 13 }}>
                            指定給此成員 ➔
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* 模式 2：綁定至現有實體金融卡片（真卡絕不重複） */}
                {quickBindTab === 'bind_card' && (
                  <View style={{ marginVertical: 8 }}>
                    <Text style={styles.tabGuideHint}>
                      📌 適合台新街口卡 (356558...)、聯邦卡、悠遊卡等實體卡。直接綁入現有卡片，絕不重複建卡：
                    </Text>
                    <ScrollView style={{ maxHeight: 200 }}>
                      {paymentAccounts.length === 0 ? (
                        <Text style={{ color: colors.text.secondary, padding: 12, textAlign: 'center' }}>
                          目前帳本尚無建立卡片，請先建立或切換至其他選項。
                        </Text>
                      ) : (
                        paymentAccounts.map(account => {
                          const owner = account.user_id ? getMemberById(account.user_id) : undefined;
                          return (
                            <TouchableOpacity
                              key={account.id}
                              style={[
                                styles.quickBindMemberItem,
                                { borderColor: isDark ? colors.border.default : '#E2E8F0' },
                              ]}
                              onPress={() => handleBindToExistingCard(account.id)}
                              activeOpacity={0.7}
                            >
                              <Text style={{ fontSize: 20, marginRight: 10 }}>
                                {account.type === 'stored_value' ? '🚌' : '💳'}
                              </Text>
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.quickBindMemberName, { color: colors.text.primary }]}>
                                  {account.name}
                                </Text>
                                <Text style={{ fontSize: 11, color: colors.text.secondary }}>
                                  持卡人：{owner?.display_name || '全家共用'} · {account.last_four_digits ? `末四碼 ${account.last_four_digits}` : '一般帳戶'}
                                </Text>
                              </View>
                              <Text style={{ color: '#10B981', fontWeight: '700', fontSize: 13 }}>
                                綁定至此卡 ➔
                              </Text>
                            </TouchableOpacity>
                          );
                        })
                      )}
                    </ScrollView>
                  </View>
                )}

                {/* 模式 3：建立全新實體卡片 */}
                {quickBindTab === 'new_card' && (
                  <View style={{ marginVertical: 8 }}>
                    <Text style={styles.tabGuideHint}>
                      📌 只有在皮夾裡真的一張全新信用卡或悠遊卡時才建立：
                    </Text>
                    <ScrollView style={{ maxHeight: 200 }}>
                      {members.map(member => (
                        <TouchableOpacity
                          key={member.id}
                          style={[
                            styles.quickBindMemberItem,
                            { borderColor: isDark ? colors.border.default : '#E2E8F0' },
                          ]}
                          onPress={() => handleCreateNewPhysicalCard(member.id)}
                          activeOpacity={0.7}
                        >
                          <Text style={{ fontSize: 20, marginRight: 10 }}>👤</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.quickBindMemberName, { color: colors.text.primary }]}>
                              {member.display_name}
                            </Text>
                            <Text style={{ fontSize: 11, color: colors.text.secondary }}>
                              以 {member.display_name} 名義建立新卡片
                            </Text>
                          </View>
                          <Text style={{ color: '#F59E0B', fontWeight: '700', fontSize: 13 }}>
                            建立全新卡 ➔
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.quickBindCancelBtn}
                  onPress={() => setQuickBindCarrier(null)}
                  activeOpacity={0.7}
                >
                  <Text style={{ color: colors.text.secondary, fontWeight: '600' }}>取消</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* 修改載具分流字典歸屬人彈窗 */}
          {changingRuleTarget && (
            <View style={styles.quickBindOverlay}>
              <View
                style={[
                  styles.quickBindCard,
                  { backgroundColor: isDark ? colors.background.card : '#FFFFFF' },
                ]}
              >
                <Text style={[styles.quickBindTitle, { color: colors.text.primary }]}>
                  ✏️ 修改分流歸屬人：{changingRuleTarget.carrier_name || changingRuleTarget.carrier_no}
                </Text>
                <Text style={[styles.quickBindDesc, { color: colors.text.secondary }]}>
                  載具代碼：{changingRuleTarget.carrier_no}{'\n'}
                  請選擇往後這張載具開立的發票要改算在誰的頭上：
                </Text>

                <ScrollView style={{ maxHeight: 220, marginVertical: 10 }}>
                  {members.map(member => (
                    <TouchableOpacity
                      key={member.id}
                      style={[
                        styles.quickBindMemberItem,
                        { borderColor: isDark ? colors.border.default : '#E2E8F0' },
                        member.id === changingRuleTarget.user_id && {
                          backgroundColor: isDark ? 'rgba(2, 132, 199, 0.2)' : '#E0F2FE',
                          borderColor: '#0284C7',
                        },
                      ]}
                      onPress={() => handleChangeRuleMemberConfirm(member.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 20, marginRight: 10 }}>👤</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.quickBindMemberName, { color: colors.text.primary }]}>
                          {member.display_name} {member.id === changingRuleTarget.user_id && '（目前歸屬）'}
                        </Text>
                      </View>
                      <Text style={{ color: '#0284C7', fontWeight: '700', fontSize: 13 }}>
                        改歸此成員 ➔
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <TouchableOpacity
                  style={styles.quickBindCancelBtn}
                  onPress={() => setChangingRuleTarget(null)}
                  activeOpacity={0.7}
                >
                  <Text style={{ color: colors.text.secondary, fontWeight: '600' }}>取消</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    maxHeight: '92%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  bodyScroll: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  statusBannerBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  statusBannerText: {
    fontSize: 12.5,
    fontWeight: '600',
    lineHeight: 18,
  },
  csvImportHeroCard: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  heroTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0369A1',
  },
  heroBadge: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  heroBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  heroDesc: {
    fontSize: 12.5,
    color: '#0C4A6E',
    lineHeight: 18,
    marginBottom: 14,
  },
  actionBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryActionBtn: {
    backgroundColor: '#0284C7',
    borderRadius: 9,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryActionBtn: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#7DD3FC',
    borderRadius: 9,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionBtnText: {
    color: '#0369A1',
    fontSize: 13,
    fontWeight: '700',
  },
  textInputToggleBtn: {
    paddingVertical: 11,
    paddingHorizontal: 8,
  },
  textInputToggleBtnText: {
    color: '#0284C7',
    fontSize: 12,
    fontWeight: '600',
  },
  rawInputBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#BAE6FD',
  },
  rawTextInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlignVertical: 'top',
    height: 100,
  },
  parseRawBtn: {
    backgroundColor: '#0369A1',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
    marginTop: 8,
  },
  parseRawBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  previewSectionBox: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  previewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  previewTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#065F46',
  },
  clearPreviewBtnText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '600',
  },
  statsSummaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  statsSummaryCol: {
    alignItems: 'center',
    flex: 1,
  },
  statsSummaryLabel: {
    fontSize: 11,
    color: '#047857',
    marginBottom: 2,
  },
  statsSummaryVal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#065F46',
  },
  alreadySyncedNote: {
    backgroundColor: '#F0FDF4',
    padding: 8,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: '#86EFAC',
  },
  alreadySyncedNoteText: {
    fontSize: 11.5,
    color: '#15803D',
    lineHeight: 16,
  },
  unregWarningBox: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  unregWarningTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#B45309',
    marginBottom: 4,
  },
  unregWarningDesc: {
    fontSize: 11.5,
    color: '#92400E',
    lineHeight: 16,
    marginBottom: 8,
  },
  unregCarrierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: '#FCD34D',
    marginBottom: 6,
  },
  unregCarrierName: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  unregCarrierNo: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  quickAddCardBtn: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  quickAddCardBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
  invoicePreviewListTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
  },
  previewInvoiceItem: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
  },
  previewInvoiceTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewInvoiceMerchant: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  previewInvoiceAmount: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0284C7',
  },
  previewInvoiceMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  previewInvoiceDate: {
    fontSize: 11,
    color: '#64748B',
  },
  previewCarrierBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  previewCarrierBadgeText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#0369A1',
  },
  previewInvoiceItems: {
    fontSize: 11,
    marginTop: 2,
  },
  confirmImportBtn: {
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  confirmImportBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  barcodeCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardHeaderTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0284C7',
  },
  editBarcodeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0284C7',
  },
  barcodeDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 4,
  },
  barcodeText: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 2,
    color: '#0369A1',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  barcodeInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 16,
    fontWeight: '700',
    marginVertical: 4,
  },
  verifiedPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  verifiedPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  barcodeHintText: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 16,
  },
  sectionBox: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    marginBottom: 3,
  },
  sectionDesc: {
    fontSize: 12,
    marginBottom: 10,
    lineHeight: 16,
  },
  cardItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  cardItemIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  cardItemName: {
    fontSize: 13,
    fontWeight: '700',
  },
  cardItemDetail: {
    fontSize: 11.5,
    marginTop: 2,
  },
  cardOwnerPill: {
    backgroundColor: '#EFF6FF',
    borderWidth: 0.5,
    borderColor: '#93C5FD',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  cardOwnerPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  emptyCardHint: {
    fontSize: 12,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  ruleCountBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  ruleCountBadgeText: {
    color: '#0284C7',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyRuleBox: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
    alignItems: 'center',
  },
  emptyRuleHint: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
    textAlign: 'center',
  },
  ruleItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  ruleItemIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  ruleItemName: {
    fontSize: 13,
    fontWeight: '700',
  },
  ruleItemDetail: {
    fontSize: 11.5,
    marginTop: 2,
  },
  ruleActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ruleOwnerBadgeBtn: {
    backgroundColor: '#EFF6FF',
    borderWidth: 0.5,
    borderColor: '#93C5FD',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  ruleOwnerBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  deleteRuleBtn: {
    padding: 6,
  },
  deleteRuleBtnText: {
    fontSize: 14,
  },
  emailGuideBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  emailGuideTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 6,
  },
  emailGuideText: {
    fontSize: 12,
    color: '#78350F',
    lineHeight: 18,
    marginBottom: 8,
  },
  actionCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 20,
  },
  actionCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  actionCardDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
    marginBottom: 12,
  },
  runSyncBtn: {
    backgroundColor: '#0284C7',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  runSyncBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  openMofBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  openMofBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
  },
  quickBindOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 999,
  },
  quickBindCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  quickBindTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    marginBottom: 4,
  },
  quickBindDesc: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 10,
  },
  bindTabRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    borderRadius: 8,
    padding: 3,
    marginBottom: 10,
  },
  bindTabBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 6,
  },
  bindTabBtnActive: {
    backgroundColor: '#0284C7',
  },
  bindTabBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  bindTabBtnTextActive: {
    color: '#FFFFFF',
  },
  tabGuideHint: {
    fontSize: 11.5,
    color: '#0369A1',
    lineHeight: 16,
    marginBottom: 8,
  },
  quickBindMemberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 8,
  },
  quickBindMemberName: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  quickBindCancelBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 6,
  },
});
