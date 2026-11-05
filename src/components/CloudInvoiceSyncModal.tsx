import React, { useState, useMemo } from 'react';
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
} from 'react-native';
import { Text } from './common/Text';
import { useTheme } from '../theme/ThemeContext';
import { useLedger } from '../context/LedgerContext';
import {
  processCloudInvoicesSync,
  generateMockCloudInvoices,
  SyncProcessResult,
} from '../lib/cloudInvoiceSync';

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
    getMemberById,
  } = useLedger();

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncProcessResult | null>(null);
  const [mobileBarcode, setMobileBarcode] = useState('/ABC+123');
  const [isEditingBarcode, setIsEditingBarcode] = useState(false);

  // 取得現有各成員登記之卡片對應
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

  // 執行雲端發票智慧同步（展示與測試模式）
  const handleRunSync = async () => {
    setIsSyncing(true);
    setSyncResult(null);

    try {
      // 模擬半秒鐘雲端連線查詢
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
        defaultCategory?.id || ''
      );

      // 1. 執行更新媒合成功的既有手動交易
      for (const item of result.updatedTransactions) {
        await updateTransaction(item.transactionId, item.updates);
      }

      // 2. 執行新增未媒合的全新發票
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
    Linking.openURL('https://www.einvoice.nat.gov.tw/APCONSUMER/BTC501W/');
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
          {/* 標題欄 */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
                ☁️ 財政部雲端發票智慧同步
              </Text>
              <Text style={[styles.headerSubtitle, { color: colors.text.secondary }]}>
                集中管理手機條碼 · 依悠遊卡/信用卡自動分流家庭成員
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Text style={{ fontSize: 18, color: colors.text.secondary }}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false}>
            {/* 手機條碼總戶頭區塊 */}
            <View
              style={[
                styles.barcodeCard,
                {
                  backgroundColor: isDark ? 'rgba(14, 165, 233, 0.12)' : '#F0F9FF',
                  borderColor: isDark ? 'rgba(56, 189, 248, 0.3)' : '#BAE6FD',
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
                全家人可將悠遊卡與信用卡歸戶至此手機條碼，雲端發票將自動依卡號精準歸戶！
              </Text>
            </View>

            {/* 卡片智慧分流對照表 */}
            <View style={styles.sectionBox}>
              <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>
                💳 卡片與家庭成員對應表
              </Text>
              <Text style={[styles.sectionDesc, { color: colors.text.secondary }]}>
                雲端發票進來時，系統會自動根據卡號判定這筆消費是誰付的款：
              </Text>

              {cardMappings.length === 0 ? (
                <Text style={styles.emptyCardHint}>目前尚未建立任何卡片，可至「設定」新增。</Text>
              ) : (
                cardMappings.map(({ account, ownerName, cardDisplay, isConfigured }) => (
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
                        卡號：{cardDisplay}
                      </Text>
                    </View>
                    <View style={styles.cardOwnerPill}>
                      <Text style={styles.cardOwnerPillText}>👤 歸屬【{ownerName}】</Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* 同步模擬測試按鈕 */}
            <View style={styles.actionCard}>
              <Text style={styles.actionCardTitle}>⚡ 模擬雲端發票自動比對</Text>
              <Text style={styles.actionCardDesc}>
                立即模擬自財政部雲端抓取 3 筆最新發票（包含悠遊卡咖啡、全聯買菜、中油加油），自動測試比對引擎：
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
                    <Text style={styles.runSyncBtnText}>正在自雲端抓取並執行智慧比對...</Text>
                  </View>
                ) : (
                  <Text style={styles.runSyncBtnText}>🚀 立即執行模擬雲端同步測試</Text>
                )}
              </TouchableOpacity>

              {/* 同步結果報表 */}
              {syncResult && (
                <View
                  style={[
                    styles.resultCard,
                    {
                      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
                      borderColor: '#10B981',
                    },
                  ]}
                >
                  <Text style={styles.resultTitle}>🎉 智慧同步完成！</Text>
                  <Text style={styles.resultSummary}>
                    共解析 {syncResult.stats.totalInvoices} 筆雲端發票（總額 NT${' '}
                    {syncResult.stats.totalAmount.toLocaleString()}）
                  </Text>
                  <View style={styles.resultDetailRow}>
                    <Text style={styles.resultDetailItem}>
                      • 自動補齊既有手動帳目：{syncResult.stats.updatedCount} 筆
                    </Text>
                    <Text style={styles.resultDetailItem}>
                      • 依卡號自動分流新發票：{syncResult.stats.newCount} 筆
                    </Text>
                  </View>
                  <Text style={styles.resultHint}>
                    ✨ 提示：您可以返回主畫面或明細頁，查看亮起「☁️ 雲端發票」天空藍徽章與「✨ 剛更新」標記的交易！
                  </Text>
                </View>
              )}
            </View>

            {/* 官方 API 申請指南 */}
            <View
              style={[
                styles.guideBox,
                {
                  backgroundColor: isDark ? colors.background.cardSubtle : '#F9FAFB',
                  borderColor: isDark ? colors.border.default : '#E5E7EB',
                },
              ]}
            >
              <Text style={[styles.guideTitle, { color: colors.text.primary }]}>
                📖 如何申請財政部官方正式 API？
              </Text>
              <Text style={[styles.guideStepText, { color: colors.text.secondary }]}>
                1. 登入「財政部電子發票整合服務平台」。{'\n'}
                2. 進入「營業人/開發者專區」申請「API 授權金鑰」。{'\n'}
                3. 通過後將取得專屬的 AppID 與 API Key。{'\n'}
                4. 填入系統環境變數即可正式上線 24 小時全自動同步！
              </Text>

              <TouchableOpacity
                style={styles.openMofBtn}
                onPress={handleOpenMofWebsite}
                activeOpacity={0.7}
              >
                <Text style={styles.openMofBtnText}>🔗 前往財政部電子發票平台申請 ➔</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
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
    maxHeight: '90%',
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
    color: '#0C4A6E',
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
  actionCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 16,
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
  resultCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  resultTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#065F46',
    marginBottom: 2,
  },
  resultSummary: {
    fontSize: 12,
    fontWeight: '600',
    color: '#047857',
    marginBottom: 6,
  },
  resultDetailRow: {
    marginVertical: 4,
    gap: 2,
  },
  resultDetailItem: {
    fontSize: 12,
    color: '#065F46',
  },
  resultHint: {
    fontSize: 11,
    color: '#047857',
    marginTop: 6,
    lineHeight: 15,
  },
  guideBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
  },
  guideTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    marginBottom: 6,
  },
  guideStepText: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
  },
  openMofBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  openMofBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284C7',
  },
});
