import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text as RNText,
  TextInput as RNTextInput,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  TextProps,
  TextInputProps,
  Platform,
  Alert,
  Linking,
  AppState,
  Image,
  ActivityIndicator,
} from 'react-native';
import { PaymentAccount, Transaction } from '../types/database';
import { useLedger } from '../context/LedgerContext';
import {
  getCreditCardBillingCycles,
  getCalendarMonthCycles,
  isDateInBillingCycle,
  sortAccountsByUser,
  parseExpenseDiscount,
} from '../lib/payment';
import {
  CreditCardStatementFile,
  loadCachedStatements,
  listLedgerStatements,
  pickAndUploadStatementOnWeb,
  deleteCardStatement,
  formatFileSize,
  isImageStatement,
  buildMobileUploadBridgeUrl,
} from '../lib/statementStorage';
import { getCategoryIcon } from '../lib/icons';
import { HorizontalScrollView } from './HorizontalScrollView';

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

const REBATE_PRESET_TAGS = [
  '現金回饋折抵',
  '小樹點折抵',
  '好市多好多金',
  'LINE Points 折抵',
  '刷卡金回饋',
  '商店退貨退刷',
];

const showAlert = (title: string, message?: string) => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.alert(message ? `${title}\n\n${message}` : title);
    }
  } else {
    Alert.alert(title, message);
  }
};

const showConfirm = (title: string, message: string, onConfirm: () => void) => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: '取消', style: 'cancel' },
      { text: '確定刪除', style: 'destructive', onPress: onConfirm },
    ]);
  }
};

export interface CreditCardReconciliationModalProps {
  visible: boolean;
  onClose: () => void;
  onEditTransaction?: (tx: Transaction) => void;
  initialAccountType?: 'credit_card' | 'stored_value';
  initialAccountId?: string;
}

// 輔助函式：判斷是否為悠遊卡/儲值卡加值存入紀錄
const isTopUpTransaction = (t: Transaction, card: PaymentAccount): boolean => {
  if (!card) return false;
  if (t.merchant === `${card.name}儲值` || t.merchant === `${card.name}加值`) return true;
  if (t.note?.includes(`存入【${card.name}】`)) return true;
  if (t.note?.includes(`${card.name}儲值`) || t.note?.includes(`${card.name}加值`)) return true;
  return false;
};

export const CreditCardReconciliationModal: React.FC<CreditCardReconciliationModalProps> = ({
  visible,
  onClose,
  onEditTransaction,
  initialAccountType,
  initialAccountId,
}) => {
  const {
    currentLedger,
    paymentAccounts,
    transactions,
    toggleReconcileTransaction,
    addTransaction,
    updateTransaction,
    categories,
    getCategoryById,
    getMemberById,
    currentUser,
    members,
    paymentMethods,
  } = useLedger();

  const [accountType, setAccountType] = useState<'credit_card' | 'stored_value'>('credit_card');
  const [selectedCardId, setSelectedCardId] = useState<string>('');
  const [selectedCycleKey, setSelectedCycleKey] = useState<string>('');
  const [cycleCount, setCycleCount] = useState<number>(6);

  // 📎 電子帳單雲端庫狀態
  const [statements, setStatements] = useState<CreditCardStatementFile[]>([]);
  const [loadingStatements, setLoadingStatements] = useState<boolean>(false);
  const [uploadingStatement, setUploadingStatement] = useState<boolean>(false);
  const [showStatementVault, setShowStatementVault] = useState<boolean>(false);
  const [vaultFilterCardId, setVaultFilterCardId] = useState<string>('');
  const [previewImageStatement, setPreviewImageStatement] = useState<CreditCardStatementFile | null>(null);

  // 🎁 本期刷卡回饋折抵 / 退刷快速記帳表單狀態
  const [showRebateForm, setShowRebateForm] = useState<boolean>(false);
  const [rebateAmount, setRebateAmount] = useState<string>('');
  const [rebateTitle, setRebateTitle] = useState<string>('現金回饋折抵');
  const [savingRebate, setSavingRebate] = useState<boolean>(false);

  const creditCards = useMemo(
    () => sortAccountsByUser(paymentAccounts.filter(a => a.type === 'credit_card'), currentUser?.id),
    [paymentAccounts, currentUser]
  );

  const storedValueCards = useMemo(
    () => sortAccountsByUser(paymentAccounts.filter(a => a.type === 'stored_value'), currentUser?.id),
    [paymentAccounts, currentUser]
  );

  const ledgerId = currentLedger?.id || '';

  // 同步載入快取與雲端電子帳單清單
  const refreshStatements = useCallback(async () => {
    if (!ledgerId || creditCards.length === 0) {
      setStatements([]);
      return;
    }
    try {
      const cached = await loadCachedStatements(ledgerId);
      if (cached.length > 0) {
        setStatements(cached);
      }
      setLoadingStatements(true);
      const cardIds = creditCards.map(c => c.id);
      const fresh = await listLedgerStatements(ledgerId, cardIds);
      setStatements(fresh);
    } catch {
      // 保留快取
    } finally {
      setLoadingStatements(false);
    }
  }, [ledgerId, creditCards]);

  // 當彈窗開關或傳入初始參數時同步狀態
  useEffect(() => {
    if (visible) {
      refreshStatements();
      setShowStatementVault(false);
      setShowRebateForm(false);
      if (initialAccountId) {
        const target = paymentAccounts.find(a => a.id === initialAccountId);
        if (target) {
          setAccountType(target.type === 'stored_value' ? 'stored_value' : 'credit_card');
          setSelectedCardId(target.id);
          setSelectedCycleKey('');
          return;
        }
      }
      if (initialAccountType) {
        setAccountType(initialAccountType);
        setSelectedCardId('');
        setSelectedCycleKey('');
      }
    } else {
      setCycleCount(6);
      setShowStatementVault(false);
      setShowRebateForm(false);
      setPreviewImageStatement(null);
    }
  }, [visible, initialAccountType, initialAccountId, paymentAccounts, refreshStatements]);

  // 手機版從外部瀏覽器上傳電子帳單返回 App 時，自動重新整理帳單清單
  useEffect(() => {
    if (!visible || Platform.OS === 'web') return;

    const appStateSub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        refreshStatements();
      }
    });

    const linkSub = Linking.addEventListener('url', event => {
      if (event?.url?.includes('statement-uploaded')) {
        refreshStatements();
      }
    });

    return () => {
      appStateSub.remove();
      linkSub.remove();
    };
  }, [visible, refreshStatements]);

  const activeCards = accountType === 'credit_card' ? creditCards : storedValueCards;

  // 預設選中當前分類中的卡片
  const currentCard = useMemo(() => {
    return activeCards.find(c => c.id === selectedCardId) || activeCards[0];
  }, [activeCards, selectedCardId]);

  // 計算該卡片的帳單週期清單 (信用卡依結帳日動態計算，悠遊卡依自然月份計算)
  const billingCycles = useMemo(() => {
    if (!currentCard) return [];
    if (accountType === 'credit_card') {
      return getCreditCardBillingCycles(currentCard.billing_cycle_date || 15, new Date(), cycleCount);
    } else {
      return getCalendarMonthCycles(new Date(), cycleCount);
    }
  }, [currentCard, accountType, cycleCount]);

  // 當前選中的帳單週期
  const currentCycle = useMemo(() => {
    if (billingCycles.length === 0) return null;
    return billingCycles.find(c => c.key === selectedCycleKey) || billingCycles[0];
  }, [billingCycles, selectedCycleKey]);

  // 當前卡片已上傳電子帳單之週期集合（供月份標籤顯示 📎 圖示）
  const cardStatementCycleSet = useMemo(() => {
    const set = new Set<string>();
    if (!currentCard) return set;
    statements.forEach(s => {
      if (s.cardId === currentCard.id) {
        set.add(s.cycleKey);
      }
    });
    return set;
  }, [statements, currentCard]);

  // 當前卡片 + 當前週期的電子帳單檔案
  const currentStatement = useMemo(() => {
    if (!currentCard || !currentCycle) return null;
    return (
      statements.find(s => s.cardId === currentCard.id && s.cycleKey === currentCycle.key) || null
    );
  }, [statements, currentCard, currentCycle]);

  // 計算全部電子帳單已使用的 Supabase Storage 總容量
  const totalStorageBytes = useMemo(() => {
    return statements.reduce((sum, s) => sum + Number(s.size || 0), 0);
  }, [statements]);

  const filteredVaultStatements = useMemo(() => {
    if (!vaultFilterCardId) return statements;
    return statements.filter(s => s.cardId === vaultFilterCardId);
  }, [statements, vaultFilterCardId]);

  // 篩選出落入此卡片與此週期區間內的所有消費、回饋折抵與加值
  const cycleTransactions = useMemo(() => {
    if (!currentCard || !currentCycle) return [];
    return transactions.filter(t => {
      if (t.type === 'memo') return false;
      if (accountType === 'credit_card') {
        const isCardMatch =
          t.account_id === currentCard.id ||
          (t.payment_method === 'credit_card' && !t.account_id && t.paid_by === currentCard.user_id);
        if (!isCardMatch) return false;
      } else {
        // 悠遊卡模式：
        // 1. 刷卡消費扣款
        const isCardSpend =
          t.account_id === currentCard.id ||
          (t.payment_method === 'stored_value' && !t.account_id && t.paid_by === currentCard.user_id);
        // 2. 加值存入
        const isCardTopUp = isTopUpTransaction(t, currentCard);

        if (!isCardSpend && !isCardTopUp) return false;
      }
      return isDateInBillingCycle(t.transacted_at, currentCycle.startDate, currentCycle.endDate);
    });
  }, [transactions, currentCard, currentCycle, accountType]);

  // 本期統計：支出總額、回饋折抵總額、實際應繳、加值總額、已核對筆數
  const stats = useMemo(() => {
    if (accountType === 'credit_card') {
      const spendTxs = cycleTransactions.filter(t => t.type === 'expense');
      const rebateTxs = cycleTransactions.filter(t => t.type === 'income');

      const totalSpend = spendTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0);
      const totalRebate = rebateTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0);
      const totalAmount = totalSpend - totalRebate;

      const reconciledCount = cycleTransactions.filter(t => t.is_reconciled).length;
      const totalCount = cycleTransactions.length;
      const progressPercent = totalCount > 0 ? Math.round((reconciledCount / totalCount) * 100) : 100;
      const isAllReconciled = totalCount > 0 && reconciledCount === totalCount;

      return {
        totalAmount,
        reconciledCount,
        totalCount,
        progressPercent,
        isAllReconciled,
        totalSpend,
        spendCount: spendTxs.length,
        totalRebate,
        rebateCount: rebateTxs.length,
        totalTopUp: 0,
        topUpCount: 0,
      };
    } else {
      let totalSpend = 0;
      let spendCount = 0;
      let totalTopUp = 0;
      let topUpCount = 0;

      cycleTransactions.forEach(t => {
        if (currentCard && isTopUpTransaction(t, currentCard)) {
          totalTopUp += Number(t.amount || 0);
          topUpCount += 1;
        } else {
          totalSpend += Number(t.amount || 0);
          spendCount += 1;
        }
      });

      const reconciledCount = cycleTransactions.filter(t => t.is_reconciled).length;
      const totalCount = cycleTransactions.length;
      const progressPercent = totalCount > 0 ? Math.round((reconciledCount / totalCount) * 100) : 100;
      const isAllReconciled = totalCount > 0 && reconciledCount === totalCount;

      return {
        totalAmount: totalSpend,
        reconciledCount,
        totalCount,
        progressPercent,
        isAllReconciled,
        totalSpend,
        spendCount,
        totalRebate: 0,
        rebateCount: 0,
        totalTopUp,
        topUpCount,
      };
    }
  }, [cycleTransactions, accountType, currentCard]);

  // 處理上傳電子帳單
  const handleUploadStatement = async () => {
    if (!currentCard || !currentCycle || !ledgerId) return;

    if (Platform.OS === 'web') {
      try {
        const uploaded = await pickAndUploadStatementOnWeb({
          ledgerId,
          cardId: currentCard.id,
          cycleKey: currentCycle.key,
          onUploadingChange: setUploadingStatement,
        });
        if (uploaded) {
          await refreshStatements();
          showAlert(
            '📎 電子帳單已歸檔',
            `已成功上傳「${uploaded.originalName}」（${formatFileSize(uploaded.size)}）至 ${currentCard.name} 的 ${currentCycle.cycleName}！`
          );
        }
      } catch (err: any) {
        showAlert('上傳失敗', err?.message || '電子帳單上傳失敗，請稍後再試');
      }
    } else {
      const bridgeUrl = buildMobileUploadBridgeUrl({
        ledgerId,
        cardId: currentCard.id,
        cardName: currentCard.name,
        cycleKey: currentCycle.key,
        cycleName: currentCycle.cycleName,
      });
      Linking.openURL(bridgeUrl).catch(() => {
        showAlert('無法開啟上傳頁面', '請確認網路連線正常');
      });
    }
  };

  // 開啟或預覽電子帳單
  const handleOpenStatement = (stmt: CreditCardStatementFile) => {
    if (!stmt?.publicUrl) return;
    if (isImageStatement(stmt)) {
      setPreviewImageStatement(stmt);
      return;
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(stmt.publicUrl, '_blank', 'noopener,noreferrer');
    } else {
      Linking.openURL(stmt.publicUrl).catch(() => {
        showAlert('無法開啟檔案', '請確認裝置是否支援開啟 PDF 檔案');
      });
    }
  };

  // 刪除電子帳單
  const handleDeleteStatement = (stmt: CreditCardStatementFile) => {
    const cardObj = creditCards.find(c => c.id === stmt.cardId);
    const cardLabel = cardObj ? cardObj.name : '信用卡';
    showConfirm(
      '刪除電子帳單',
      `確定要刪除【${cardLabel} · ${stmt.cycleKey}】的電子帳單「${stmt.originalName}」（${formatFileSize(stmt.size)}）嗎？\n\n刪除後將立即釋放雲端 Storage 空間。`,
      async () => {
        try {
          setUploadingStatement(true);
          const ok = await deleteCardStatement(stmt.path);
          if (ok) {
            await refreshStatements();
          } else {
            showAlert('刪除失敗', '無法從雲端刪除該帳單檔案，請稍後再試');
          }
        } finally {
          setUploadingStatement(false);
        }
      }
    );
  };

  // 快速新增本期刷卡回饋折抵 / 退刷
  const handleSaveRebate = async () => {
    if (!currentCard || !currentCycle) return;
    const num = parseFloat(rebateAmount);
    if (isNaN(num) || num <= 0) {
      showAlert('金額無效', '請輸入大於 0 的回饋折抵或退刷金額');
      return;
    }

    // 選擇最適合的收入分類（優先找回饋/利息/其他收入）
    const incomeCats = categories.filter(c => c.type === 'income');
    const targetCat =
      incomeCats.find(c => c.name.includes('回饋') || c.name.includes('折抵') || c.name.includes('獎') || c.name.includes('息') || c.name.includes('其他')) ||
      incomeCats[0] ||
      categories[0];

    if (!targetCat) {
      showAlert('缺少分類', '請先確認帳本內有收入分類');
      return;
    }

    // 自動計算落入本期帳單區間的入帳時間：
    // 若今天在本期帳單區間內則用今天，否則使用本期帳單結帳日中午 12:00，確保 100% 歸入本期對帳單！
    const now = new Date();
    let txDate = new Date();
    if (now < currentCycle.startDate || now > currentCycle.endDate) {
      txDate = new Date(currentCycle.endDate);
      txDate.setHours(12, 0, 0, 0);
    }

    const titleText = rebateTitle.trim() || '現金回饋折抵';
    const targetPayer = currentCard.user_id || currentUser?.id || members[0]?.id || '';

    try {
      setSavingRebate(true);
      const createdId = await addTransaction({
        amount: num,
        type: 'income',
        category_id: targetCat.id,
        paid_by: targetPayer,
        merchant: titleText,
        payment_method: 'credit_card',
        account_id: currentCard.id,
        note: `【${currentCard.name}】${currentCycle.cycleName} · ${titleText}`,
        transacted_at: txDate.toISOString(),
      });

      // 自動標記為已核對
      if (createdId) {
        await updateTransaction(createdId, { is_reconciled: true }).catch(() => {});
      }

      setRebateAmount('');
      setShowRebateForm(false);
    } catch (err: any) {
      showAlert('儲存失敗', err?.message || '無法新增回饋折抵紀錄');
    } finally {
      setSavingRebate(false);
    }
  };

  if (!visible) return null;

  const isCredit = accountType === 'credit_card';
  const quotaMaxBytes = 1024 * 1024 * 1024; // 1 GB
  const quotaPercent = Math.min(100, (totalStorageBytes / quotaMaxBytes) * 100);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          {/* 標頭 */}
          <View style={styles.header}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.title} maxFontSizeMultiplier={1.15}>
                {isCredit ? '💳 信用卡帳單精確對帳' : '🚌 悠遊卡自然月對帳'}
              </Text>
              <Text style={styles.subtitle} maxFontSizeMultiplier={1.15}>
                {isCredit
                  ? '依結帳日比對每筆消費、登記回饋折抵與存放電子帳單'
                  : '依自然月檢視悠遊卡每筆扣款與加值，精確掌握卡片餘額'}
              </Text>
            </View>

            {isCredit && creditCards.length > 0 && (
              <TouchableOpacity
                style={[styles.vaultToggleBtn, showStatementVault && styles.vaultToggleBtnActive]}
                onPress={() => setShowStatementVault(prev => !prev)}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.vaultToggleBtnText, showStatementVault && styles.vaultToggleBtnTextActive]}
                  maxFontSizeMultiplier={1.08}
                >
                  {showStatementVault ? '← 返回對帳' : `🗂️ 帳單庫 (${statements.length})`}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText} maxFontSizeMultiplier={1.15}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 模式分頁切換 Tab */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tabItem, isCredit && styles.tabItemActive]}
              onPress={() => {
                setAccountType('credit_card');
                setSelectedCardId('');
                setSelectedCycleKey('');
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabItemText, isCredit && styles.tabItemTextActive]} maxFontSizeMultiplier={1.15}>
                💳 信用卡 ({creditCards.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, !isCredit && styles.tabItemActive]}
              onPress={() => {
                setAccountType('stored_value');
                setSelectedCardId('');
                setSelectedCycleKey('');
                setShowStatementVault(false);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabItemText, !isCredit && styles.tabItemTextActive]} maxFontSizeMultiplier={1.15}>
                🚌 悠遊卡 ({storedValueCards.length})
              </Text>
            </TouchableOpacity>
          </View>

          {activeCards.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>{isCredit ? '💳' : '🚌'}</Text>
              <Text style={styles.emptyText}>
                {isCredit ? '目前尚未設定任何信用卡' : '目前尚未設定任何悠遊卡或儲值卡'}
              </Text>
              <Text style={styles.emptySubtext}>
                {isCredit
                  ? '請至「家庭與備份」設定家裡的信用卡與結帳日，即可開始智慧對帳！'
                  : '請至「家庭與備份」新增家裡的悠遊卡或儲值卡，即可開始智慧對帳！'}
              </Text>
            </View>
          ) : isCredit && showStatementVault ? (
            /* 🗂️ 歷年已存電子帳單庫總覽視圖 */
            <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
              <View style={styles.vaultBannerCard}>
                <View style={styles.vaultBannerHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.vaultBannerTitle}>🗂️ 雲端信用卡電子帳單庫</Text>
                    <Text style={styles.vaultBannerSub}>
                      獨立存放於 Supabase Storage，完全不佔用記帳資料庫空間
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.vaultRefreshBtn}
                    onPress={refreshStatements}
                    disabled={loadingStatements}
                  >
                    <Text style={styles.vaultRefreshBtnText}>
                      {loadingStatements ? '同步中...' : '🔄 重新整理'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.quotaRow}>
                  <Text style={styles.quotaLabel}>
                    📦 已存 {statements.length} 份帳單 · 雲端空間用量：{formatFileSize(totalStorageBytes)} / 1,024 MB ({quotaPercent < 0.01 && totalStorageBytes > 0 ? '<0.01' : quotaPercent.toFixed(2)}%)
                  </Text>
                </View>
                <View style={styles.quotaBarTrack}>
                  <View
                    style={[
                      styles.quotaBarFill,
                      { width: `${Math.max(totalStorageBytes > 0 ? 1.5 : 0, quotaPercent)}%` },
                    ]}
                  />
                </View>
              </View>

              {/* 帳單庫卡片篩選列 */}
              <HorizontalScrollView showsHorizontalScrollIndicator={false} contentContainerStyle={styles.vaultFilterScroll}>
                <TouchableOpacity
                  style={[styles.vaultFilterChip, !vaultFilterCardId && styles.vaultFilterChipActive]}
                  onPress={() => setVaultFilterCardId('')}
                >
                  <Text style={[styles.vaultFilterChipText, !vaultFilterCardId && styles.vaultFilterChipTextActive]}>
                    全部卡片 ({statements.length})
                  </Text>
                </TouchableOpacity>
                {creditCards.map(card => {
                  const count = statements.filter(s => s.cardId === card.id).length;
                  const active = vaultFilterCardId === card.id;
                  return (
                    <TouchableOpacity
                      key={card.id}
                      style={[styles.vaultFilterChip, active && styles.vaultFilterChipActive]}
                      onPress={() => setVaultFilterCardId(active ? '' : card.id)}
                    >
                      <Text style={[styles.vaultFilterChipText, active && styles.vaultFilterChipTextActive]}>
                        💳 {card.name} ({count})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </HorizontalScrollView>

              {filteredVaultStatements.length === 0 ? (
                <View style={styles.emptyTxBox}>
                  <Text style={{ fontSize: 32, marginBottom: 8 }}>📭</Text>
                  <Text style={styles.emptyTxText}>
                    目前尚無已歸檔的信用卡電子帳單
                  </Text>
                  <Text style={[styles.emptyTxText, { marginTop: 4, fontSize: 11 }]}>
                    返回對帳頁面後，選擇月份並點擊「📤 上傳本期電子帳單」即可歸檔！
                  </Text>
                </View>
              ) : (
                filteredVaultStatements.map(stmt => {
                  const card = creditCards.find(c => c.id === stmt.cardId);
                  const isImg = isImageStatement(stmt);
                  const d = new Date(stmt.createdAt);
                  const uploadDateStr = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
                  return (
                    <View key={stmt.path} style={styles.vaultItemCard}>
                      <View style={styles.vaultItemTop}>
                        <View style={styles.vaultFileIconBox}>
                          <Text style={{ fontSize: 20 }}>{isImg ? '🖼️' : '📄'}</Text>
                        </View>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                            <View style={styles.vaultCycleBadge}>
                              <Text style={styles.vaultCycleBadgeText}>{stmt.cycleKey} 期帳單</Text>
                            </View>
                            <Text style={styles.vaultCardName}>
                              💳 {card?.name || '信用卡'}{card?.last_four_digits ? ` (*${card.last_four_digits})` : ''}
                            </Text>
                          </View>
                          <Text style={styles.vaultFileName} numberOfLines={1}>
                            {stmt.originalName}
                          </Text>
                          <Text style={styles.vaultFileMeta}>
                            {isImg ? '圖片帳單' : 'PDF 電子帳單'} · {formatFileSize(stmt.size)} · 歸檔於 {uploadDateStr}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.vaultItemActions}>
                        <TouchableOpacity
                          style={styles.vaultActionPrimary}
                          onPress={() => handleOpenStatement(stmt)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.vaultActionPrimaryText}>
                            {isImg ? '🖼️ 預覽帳單圖片' : '📄 開啟電子帳單'}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.vaultActionSecondary}
                          onPress={() => {
                            setSelectedCardId(stmt.cardId);
                            setSelectedCycleKey(stmt.cycleKey);
                            setShowStatementVault(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.vaultActionSecondaryText}>🔍 對帳明細</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.vaultActionDanger}
                          onPress={() => handleDeleteStatement(stmt)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.vaultActionDangerText}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
              <View style={{ height: 30 }} />
            </ScrollView>
          ) : (
            <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* 卡片選擇標籤橫向滑軌 */}
              <Text style={styles.sectionHeader} maxFontSizeMultiplier={1.15}>
                {isCredit ? '選擇核對的信用卡' : '選擇核對的悠遊卡 / 儲值卡'}
              </Text>
              <HorizontalScrollView showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardSelectorScroll}>
                {activeCards.map(card => {
                  const isSelected = (currentCard?.id || activeCards[0]?.id) === card.id;
                  const cardholder = getMemberById(card.user_id);
                  const cardStmtCount = isCredit ? statements.filter(s => s.cardId === card.id).length : 0;
                  return (
                    <TouchableOpacity
                      key={card.id}
                      style={[
                        styles.cardSelectChip,
                        isSelected && {
                          borderColor: card.color || (isCredit ? '#3B82F6' : '#0284C7'),
                          backgroundColor: isCredit ? '#EFF6FF' : '#F0F9FF',
                        },
                      ]}
                      onPress={() => {
                        setSelectedCardId(card.id);
                        setSelectedCycleKey('');
                        setShowRebateForm(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.cardSelectIcon}>{card.icon || (isCredit ? '💳' : '🚌')}</Text>
                      <View>
                        <Text
                          style={[
                            styles.cardSelectName,
                            isSelected && {
                              color: card.color || (isCredit ? '#1E40AF' : '#0369A1'),
                              fontWeight: '700',
                            },
                          ]}
                          maxFontSizeMultiplier={1.15}
                        >
                          {card.name}{isCredit && card.last_four_digits ? ` (*${card.last_four_digits})` : ''}
                          {cardStmtCount > 0 ? ` 📎${cardStmtCount}` : ''}
                        </Text>
                        <Text style={styles.cardSelectCycle} maxFontSizeMultiplier={1.15}>
                          {cardholder ? `${cardholder.display_name} · ` : '全家通用 · '}
                          {isCredit
                            ? `每月 ${card.billing_cycle_date || 15} 號結帳`
                            : `餘額 NT$ ${card.balance.toLocaleString()}`}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </HorizontalScrollView>

              {/* 週期 / 自然月份選擇器 */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeader} maxFontSizeMultiplier={1.15}>
                  {isCredit ? '選擇帳單期 (有 📎 代表已存電子帳單)' : '選擇對帳月份 (自然月 1 號至月底)'}
                </Text>
                {cycleCount > 6 && (
                  <Text style={styles.cycleCountBadge} maxFontSizeMultiplier={1.15}>
                    已展開至最近 {cycleCount} {isCredit ? '期' : '個月'}
                  </Text>
                )}
              </View>
              <HorizontalScrollView showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cycleSelectorScroll}>
                {billingCycles.map(cycle => {
                  const isSelected = (currentCycle?.key || billingCycles[0]?.key) === cycle.key;
                  const hasStmt = isCredit && cardStatementCycleSet.has(cycle.key);
                  return (
                    <TouchableOpacity
                      key={cycle.key}
                      style={[
                        styles.cycleChip,
                        hasStmt && styles.cycleChipWithStmt,
                        isSelected && styles.cycleChipActive,
                      ]}
                      onPress={() => {
                        setSelectedCycleKey(cycle.key);
                        setShowRebateForm(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[styles.cycleChipText, isSelected && styles.cycleChipTextActive]}
                        maxFontSizeMultiplier={1.15}
                      >
                        {hasStmt ? '📎 ' : ''}{cycle.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}

                {/* 動態載入更多期數按鈕 */}
                {cycleCount < 36 ? (
                  <TouchableOpacity
                    style={styles.loadMoreCycleChip}
                    onPress={() => setCycleCount(prev => Math.min(prev + 6, 36))}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.loadMoreCycleText} maxFontSizeMultiplier={1.15}>
                      {isCredit ? '+ 查看更早帳單' : '+ 查看更早月份'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.maxCycleChip}>
                    <Text style={styles.maxCycleText} maxFontSizeMultiplier={1.15}>
                      已顯示上限 36 期
                    </Text>
                  </View>
                )}

                {/* 展開超過 6 期時提供收起按鈕 */}
                {cycleCount > 6 && (
                  <TouchableOpacity
                    style={styles.collapseCycleChip}
                    onPress={() => {
                      setCycleCount(6);
                      const recent6 = billingCycles.slice(0, 6);
                      if (!recent6.some(c => c.key === selectedCycleKey)) {
                        setSelectedCycleKey('');
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.collapseCycleText} maxFontSizeMultiplier={1.15}>
                      {isCredit ? '收回至最近 6 期 ▴' : '收回至最近 6 個月 ▴'}
                    </Text>
                  </TouchableOpacity>
                )}
              </HorizontalScrollView>

              {/* 本期 / 本月對帳看板卡片 */}
              {currentCycle && currentCard && (
                <View style={styles.summaryCard}>
                  <View style={styles.summaryTopRow}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.summaryCycleName}>{currentCycle.cycleName}</Text>
                      <Text style={styles.summaryDateRange}>
                        {isCredit ? '帳單週期：' : '自然月份：'}{currentCycle.rangeText}
                      </Text>
                      {!isCredit && (
                        <View style={styles.currentBalancePill}>
                          <Text style={styles.currentBalanceLabel}>卡片即時餘額</Text>
                          <Text style={styles.currentBalanceValue}>NT$ {currentCard.balance.toLocaleString()}</Text>
                        </View>
                      )}
                    </View>

                    {isCredit ? (
                      <View style={styles.summaryAmountBox}>
                        <Text style={styles.summaryAmountLabel}>
                          {stats.totalRebate > 0 ? '折抵後實際應繳' : '本期累積應繳'}
                        </Text>
                        <Text style={styles.summaryAmountValue}>
                          NT$ {stats.totalAmount.toLocaleString()}
                        </Text>
                        {stats.totalRebate > 0 && (
                          <Text style={styles.summaryRebateBreakdownText}>
                            刷卡 ${stats.totalSpend.toLocaleString()} - 折抵 ${stats.totalRebate.toLocaleString()}
                          </Text>
                        )}
                      </View>
                    ) : (
                      <View style={styles.storedValueStatsBox}>
                        <View style={styles.storedValueStatRow}>
                          <Text style={styles.storedValueStatLabel}>本月刷卡扣款</Text>
                          <Text style={styles.storedValueSpendValue}>
                            -NT$ {stats.totalSpend.toLocaleString()}
                          </Text>
                        </View>
                        <Text style={styles.storedValueStatSub}>共 {stats.spendCount} 筆消費</Text>

                        <View style={[styles.storedValueStatRow, { marginTop: 5 }]}>
                          <Text style={styles.storedValueStatLabel}>本月加值存入</Text>
                          <Text style={styles.storedValueTopUpValue}>
                            +NT$ {stats.totalTopUp.toLocaleString()}
                          </Text>
                        </View>
                        <Text style={styles.storedValueStatSub}>共 {stats.topUpCount} 次加值</Text>
                      </View>
                    )}
                  </View>

                  {/* 進度條 */}
                  <View style={styles.progressSection}>
                    <View style={styles.progressInfoRow}>
                      <Text style={styles.progressText}>
                        對帳進度：已核對 {stats.reconciledCount} / {stats.totalCount} 筆 ({stats.progressPercent}%)
                      </Text>
                      {stats.isAllReconciled && (
                        <Text style={styles.allReconciledBadge}>🎉 全數核對完成</Text>
                      )}
                    </View>
                    <View style={styles.progressBarTrack}>
                      <View
                        style={[
                          styles.progressBarFill,
                          {
                            width: `${stats.progressPercent}%`,
                            backgroundColor: stats.isAllReconciled
                              ? '#10B981'
                              : (isCredit ? '#3B82F6' : '#0284C7'),
                          },
                        ]}
                      />
                    </View>
                  </View>

                  {/* 💳 信用卡專屬：電子帳單存取區 ＆ 刷卡回饋折抵工具列 */}
                  {isCredit && (
                    <View style={styles.creditToolsContainer}>
                      {currentStatement ? (
                        <View style={styles.attachedStmtBar}>
                          <TouchableOpacity
                            style={styles.attachedStmtMain}
                            onPress={() => handleOpenStatement(currentStatement)}
                            activeOpacity={0.7}
                          >
                            <Text style={{ fontSize: 18, marginRight: 8 }}>
                              {isImageStatement(currentStatement) ? '🖼️' : '📄'}
                            </Text>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.attachedStmtTitle} numberOfLines={1}>
                                {currentStatement.originalName}
                              </Text>
                              <Text style={styles.attachedStmtMeta}>
                                點擊查看電子帳單 · {formatFileSize(currentStatement.size)}
                              </Text>
                            </View>
                          </TouchableOpacity>

                          <View style={styles.attachedStmtActions}>
                            <TouchableOpacity
                              style={styles.stmtMiniBtn}
                              onPress={() => handleOpenStatement(currentStatement)}
                            >
                              <Text style={styles.stmtMiniBtnPrimaryText}>查看</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.stmtMiniBtn}
                              onPress={handleUploadStatement}
                              disabled={uploadingStatement}
                            >
                              <Text style={styles.stmtMiniBtnText}>重傳</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.stmtMiniBtn, styles.stmtMiniBtnDanger]}
                              onPress={() => handleDeleteStatement(currentStatement)}
                              disabled={uploadingStatement}
                            >
                              <Text style={styles.stmtMiniBtnDangerText}>🗑️</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : null}

                      <View style={styles.creditActionBtnRow}>
                        {!currentStatement && (
                          <TouchableOpacity
                            style={styles.creditActionBtnStmt}
                            onPress={handleUploadStatement}
                            disabled={uploadingStatement}
                            activeOpacity={0.7}
                          >
                            {uploadingStatement ? (
                              <ActivityIndicator size="small" color="#1D4ED8" />
                            ) : (
                              <Text style={styles.creditActionBtnStmtText} maxFontSizeMultiplier={1.08}>
                                📤 上傳本期電子帳單 (PDF/圖片)
                              </Text>
                            )}
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity
                          style={[
                            styles.creditActionBtnRebate,
                            showRebateForm && styles.creditActionBtnRebateActive,
                          ]}
                          onPress={() => setShowRebateForm(prev => !prev)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.creditActionBtnRebateText,
                              showRebateForm && styles.creditActionBtnRebateTextActive,
                            ]}
                            maxFontSizeMultiplier={1.08}
                          >
                            {showRebateForm ? '✕ 收起回饋折抵' : '🎁 ＋記一筆回饋折抵 / 退刷'}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* 🎁 快速新增本期回饋折抵面板 */}
                      {showRebateForm && (
                        <View style={styles.rebateFormBox}>
                          <Text style={styles.rebateFormHeader}>
                            🎁 登記本期帳單回饋折抵 / 退刷（將自動從本期應繳金額扣除）
                          </Text>

                          <View style={styles.rebatePresetRow}>
                            {REBATE_PRESET_TAGS.map(tag => {
                              const active = rebateTitle === tag;
                              return (
                                <TouchableOpacity
                                  key={tag}
                                  style={[styles.rebatePresetChip, active && styles.rebatePresetChipActive]}
                                  onPress={() => setRebateTitle(tag)}
                                >
                                  <Text
                                    style={[
                                      styles.rebatePresetChipText,
                                      active && styles.rebatePresetChipTextActive,
                                    ]}
                                  >
                                    {tag}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>

                          <View style={styles.rebateInputRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.rebateInputLabel}>折抵項目名稱</Text>
                              <TextInput
                                style={styles.rebateTextInput}
                                value={rebateTitle}
                                onChangeText={setRebateTitle}
                                placeholder="例如：現金回饋折抵"
                                placeholderTextColor="#94A3B8"
                              />
                            </View>
                            <View style={{ width: 120 }}>
                              <Text style={styles.rebateInputLabel}>折抵金額 (NT$)</Text>
                              <TextInput
                                style={[styles.rebateTextInput, styles.rebateAmountInput]}
                                value={rebateAmount}
                                onChangeText={setRebateAmount}
                                keyboardType="numeric"
                                placeholder="例如 200"
                                placeholderTextColor="#94A3B8"
                              />
                            </View>
                          </View>

                          <TouchableOpacity
                            style={styles.rebateSubmitBtn}
                            onPress={handleSaveRebate}
                            disabled={savingRebate}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.rebateSubmitBtnText}>
                              {savingRebate ? '儲存中...' : '✓ 確認折抵並扣減本期應繳'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              )}

              {/* 明細清單 */}
              <View style={styles.txListHeader}>
                <Text style={styles.txListTitle}>
                  {isCredit
                    ? `本期消費與折抵明細 (${cycleTransactions.length} 筆)`
                    : `當月收支與加值明細 (${cycleTransactions.length} 筆)`}
                </Text>
                <Text style={styles.txListHint}>核對無誤請點擊右側按鈕打勾 ✍️</Text>
              </View>

              {cycleTransactions.length === 0 ? (
                <View style={styles.emptyTxBox}>
                  <Text style={styles.emptyTxText}>
                    {isCredit
                      ? '本期帳單週期內尚無此信用卡的刷卡或折抵紀錄'
                      : '本月份內尚無此悠遊卡的扣款或加值紀錄'}
                  </Text>
                </View>
              ) : (
                cycleTransactions.map(tx => {
                  const isTopUp = !isCredit && currentCard && isTopUpTransaction(tx, currentCard);
                  const isRebate = isCredit && tx.type === 'income';
                  const parsedDiscount = tx.type === 'expense' ? parseExpenseDiscount(tx.note) : null;
                  const cat = getCategoryById(tx.category_id, tx.category);
                  const d = new Date(tx.transacted_at);
                  const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
                  return (
                    <View key={tx.id} style={[styles.txRow, tx.is_reconciled && styles.txRowReconciled]}>
                      {/* 類別圖示 */}
                      <View
                        style={[
                          styles.catIconBox,
                          {
                            backgroundColor:
                              isTopUp || isRebate ? '#ECFDF5' : `${cat?.color || '#3B82F6'}20`,
                          },
                        ]}
                      >
                        <Text style={styles.catIcon}>
                          {isTopUp ? '💰' : isRebate ? '🎁' : getCategoryIcon(cat?.icon)}
                        </Text>
                      </View>

                      {/* 消費/折抵/加值內容 */}
                      <TouchableOpacity
                        style={styles.txInfoCol}
                        onPress={() => onEditTransaction?.(tx)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.txTitleRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 6, flexWrap: 'wrap', gap: 4 }}>
                            {isTopUp && (
                              <View style={styles.topUpBadge}>
                                <Text style={styles.topUpBadgeText}>加值</Text>
                              </View>
                            )}
                            {isRebate && (
                              <View style={styles.topUpBadge}>
                                <Text style={styles.topUpBadgeText}>🎁 折抵/退刷</Text>
                              </View>
                            )}
                            {isCredit && !isRebate && !!tx.payment_method && tx.payment_method !== 'credit_card' && (() => {
                              const pm = paymentMethods.find(m => m.id === tx.payment_method);
                              return (
                                <View style={[styles.payMethodTag, { borderColor: `${pm?.color || '#3B82F6'}35`, backgroundColor: `${pm?.color || '#3B82F6'}15` }]}>
                                  <Text style={[styles.payMethodTagText, { color: pm?.color || '#3B82F6' }]}>
                                    {pm?.icon || '📱'} {pm?.name || tx.payment_method}
                                  </Text>
                                </View>
                              );
                            })()}
                            <Text style={styles.txMerchantName} numberOfLines={1}>
                              {isTopUp
                                ? (tx.merchant || `${currentCard.name}儲值`)
                                : isRebate
                                ? (tx.merchant || cat?.name || '刷卡回饋折抵')
                                : (tx.merchant || cat?.name || (isCredit ? '消費' : '悠遊卡扣款'))}
                            </Text>
                            {!!parsedDiscount?.hasDiscount && (
                              <View style={styles.topUpBadge}>
                                <Text style={styles.topUpBadgeText}>{parsedDiscount.badgeText}</Text>
                              </View>
                            )}
                          </View>
                          <Text style={[styles.txAmountText, (isTopUp || isRebate) && styles.txAmountTopUp]}>
                            {isTopUp
                              ? `+NT$ ${Number(tx.amount).toLocaleString()}`
                              : isRebate
                              ? `-NT$ ${Number(tx.amount).toLocaleString()} (折抵)`
                              : `-NT$ ${Number(tx.amount).toLocaleString()}`}
                          </Text>
                        </View>
                        <View style={styles.txSubRow}>
                          <Text style={styles.txDate}>{dateStr}</Text>
                          <Text style={styles.txNote} numberOfLines={1}>
                            {parsedDiscount?.hasDiscount
                              ? (parsedDiscount.cleanNote ? `· ${parsedDiscount.cleanNote}` : '')
                              : (tx.note ? `· ${tx.note}` : '')}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      {/* 核對勾選按鈕 */}
                      <TouchableOpacity
                        style={[styles.reconcileBtn, tx.is_reconciled && styles.reconcileBtnActive]}
                        onPress={() => toggleReconcileTransaction(tx.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.reconcileBtnText, tx.is_reconciled && styles.reconcileBtnTextActive]}>
                          {tx.is_reconciled ? '✓ 已核對' : '○ 待核對'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
              <View style={{ height: 30 }} />
            </ScrollView>
          )}
        </View>
      </View>

      {/* 🖼️ 圖片格式電子帳單全螢幕預覽彈窗 */}
      <Modal
        visible={!!previewImageStatement}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImageStatement(null)}
      >
        <View style={styles.imgPreviewOverlay}>
          <View style={styles.imgPreviewHeader}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.imgPreviewTitle} numberOfLines={1}>
                {previewImageStatement?.originalName || '電子帳單預覽'}
              </Text>
              <Text style={styles.imgPreviewSub}>
                {previewImageStatement?.cycleKey} 期帳單 · {formatFileSize(previewImageStatement?.size)}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.imgPreviewCloseBtn}
              onPress={() => setPreviewImageStatement(null)}
            >
              <Text style={styles.imgPreviewCloseText}>✕ 關閉</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.imgPreviewBody}>
            {!!previewImageStatement?.publicUrl && (
              <Image
                source={{ uri: previewImageStatement.publicUrl }}
                style={styles.imgPreviewImage}
                resizeMode="contain"
              />
            )}
          </View>

          <View style={styles.imgPreviewFooter}>
            <TouchableOpacity
              style={styles.imgPreviewExternalBtn}
              onPress={() => {
                if (!previewImageStatement?.publicUrl) return;
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  window.open(previewImageStatement.publicUrl, '_blank', 'noopener,noreferrer');
                } else {
                  Linking.openURL(previewImageStatement.publicUrl).catch(() => {});
                }
              }}
            >
              <Text style={styles.imgPreviewExternalText}>🌐 於瀏覽器開啟原圖 / 下載檔案</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Modal>
  );
};

export const CardReconciliationModal = CreditCardReconciliationModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.92,
    minHeight: SCREEN_HEIGHT * 0.68,
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  vaultToggleBtn: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
  },
  vaultToggleBtnActive: {
    backgroundColor: '#1D4ED8',
    borderColor: '#1D4ED8',
  },
  vaultToggleBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  vaultToggleBtnTextActive: {
    color: '#FFFFFF',
  },
  closeBtn: {
    padding: 6,
  },
  closeText: {
    fontSize: 18,
    color: '#94A3B8',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
    marginTop: 10,
    marginBottom: 6,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 9,
  },
  tabItemActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  tabItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabItemTextActive: {
    color: '#1E293B',
    fontWeight: '700',
  },
  scrollArea: {
    flex: 1,
    marginTop: 6,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  cycleCountBadge: {
    fontSize: 10.5,
    color: '#2563EB',
    fontWeight: '600',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  cardSelectorScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 6,
    paddingBottom: 4,
  },
  cardSelectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    gap: 8,
  },
  cardSelectIcon: {
    fontSize: 18,
  },
  cardSelectName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  cardSelectCycle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  cycleSelectorScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 6,
  },
  cycleChip: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cycleChipWithStmt: {
    borderColor: '#93C5FD',
    backgroundColor: '#F8FAFC',
  },
  cycleChipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  cycleChipText: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#475569',
  },
  cycleChipTextActive: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  loadMoreCycleChip: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: '#93C5FD',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadMoreCycleText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#2563EB',
  },
  collapseCycleChip: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  collapseCycleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  maxCycleChip: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  maxCycleText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  summaryCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  summaryCycleName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  summaryDateRange: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  currentBalancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 6,
    gap: 6,
  },
  currentBalanceLabel: {
    fontSize: 10.5,
    color: '#0369A1',
    fontWeight: '600',
  },
  currentBalanceValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0284C7',
  },
  summaryAmountBox: {
    alignItems: 'flex-end',
  },
  summaryAmountLabel: {
    fontSize: 10.5,
    color: '#64748B',
  },
  summaryAmountValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#EF4444',
  },
  summaryRebateBreakdownText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#059669',
    marginTop: 2,
  },
  storedValueStatsBox: {
    alignItems: 'flex-end',
    backgroundColor: '#FFFFFF',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  storedValueStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  storedValueStatLabel: {
    fontSize: 10.5,
    color: '#64748B',
  },
  storedValueSpendValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#EF4444',
  },
  storedValueTopUpValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#10B981',
  },
  storedValueStatSub: {
    fontSize: 9.5,
    color: '#94A3B8',
    marginTop: 1,
  },
  progressSection: {
    marginTop: 4,
  },
  progressInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  allReconciledBadge: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#059669',
  },
  progressBarTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  creditToolsContainer: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 8,
  },
  attachedStmtBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  attachedStmtMain: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  attachedStmtTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  attachedStmtMeta: {
    fontSize: 10.5,
    color: '#2563EB',
    marginTop: 1,
  },
  attachedStmtActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  stmtMiniBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#93C5FD',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  stmtMiniBtnPrimaryText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  stmtMiniBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  stmtMiniBtnDanger: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  stmtMiniBtnDangerText: {
    fontSize: 11,
  },
  creditActionBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  creditActionBtnStmt: {
    flex: 1,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#93C5FD',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creditActionBtnStmtText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  creditActionBtnRebate: {
    flex: 1,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#6EE7B7',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creditActionBtnRebateActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  creditActionBtnRebateText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#047857',
  },
  creditActionBtnRebateTextActive: {
    color: '#FFFFFF',
  },
  rebateFormBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    padding: 12,
    marginTop: 2,
  },
  rebateFormHeader: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
    marginBottom: 8,
  },
  rebatePresetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  rebatePresetChip: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  rebatePresetChipActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  rebatePresetChipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  rebatePresetChipTextActive: {
    color: '#047857',
    fontWeight: '700',
  },
  rebateInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  rebateInputLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 4,
  },
  rebateTextInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    color: '#0F172A',
  },
  rebateAmountInput: {
    fontWeight: '700',
    color: '#059669',
  },
  rebateSubmitBtn: {
    backgroundColor: '#059669',
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  rebateSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  vaultBannerCard: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 14,
    padding: 12,
    marginTop: 6,
    marginBottom: 10,
  },
  vaultBannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  vaultBannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E3A8A',
  },
  vaultBannerSub: {
    fontSize: 11,
    color: '#3B82F6',
    marginTop: 2,
  },
  vaultRefreshBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#93C5FD',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  vaultRefreshBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  quotaRow: {
    marginBottom: 4,
  },
  quotaLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1E40AF',
  },
  quotaBarTrack: {
    height: 6,
    backgroundColor: '#DBEAFE',
    borderRadius: 3,
    overflow: 'hidden',
  },
  quotaBarFill: {
    height: '100%',
    backgroundColor: '#2563EB',
    borderRadius: 3,
  },
  vaultFilterScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 10,
  },
  vaultFilterChip: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  vaultFilterChipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  vaultFilterChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  vaultFilterChipTextActive: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  vaultItemCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  vaultItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vaultFileIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  vaultCycleBadge: {
    backgroundColor: '#DBEAFE',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  vaultCycleBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#1E40AF',
  },
  vaultCardName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  vaultFileName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 3,
  },
  vaultFileMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  vaultItemActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  vaultActionPrimary: {
    flex: 1,
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 7,
    alignItems: 'center',
  },
  vaultActionPrimaryText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  vaultActionSecondary: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: 'center',
  },
  vaultActionSecondaryText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
  vaultActionDanger: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignItems: 'center',
  },
  vaultActionDangerText: {
    fontSize: 12,
  },
  txListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  txListTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  txListHint: {
    fontSize: 10.5,
    color: '#64748B',
  },
  emptyTxBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyTxText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    gap: 10,
  },
  txRowReconciled: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  catIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catIcon: {
    fontSize: 18,
  },
  txInfoCol: {
    flex: 1,
  },
  txTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topUpBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    marginRight: 4,
  },
  topUpBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
  },
  payMethodTag: {
    paddingHorizontal: 4.5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 0.5,
    marginRight: 4,
  },
  payMethodTagText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  txMerchantName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    flex: 1,
  },
  txAmountText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EF4444',
  },
  txAmountTopUp: {
    color: '#10B981',
  },
  txSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 4,
  },
  txDate: {
    fontSize: 11,
    color: '#64748B',
  },
  txNote: {
    fontSize: 11,
    color: '#94A3B8',
    flex: 1,
  },
  reconcileBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  reconcileBtnActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  reconcileBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  reconcileBtnTextActive: {
    color: '#15803D',
    fontWeight: '700',
  },
  emptyContainer: {
    padding: 30,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  imgPreviewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    justifyContent: 'space-between',
    paddingVertical: 36,
    paddingHorizontal: 16,
  },
  imgPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  imgPreviewTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  imgPreviewSub: {
    fontSize: 11.5,
    color: '#94A3B8',
    marginTop: 2,
  },
  imgPreviewCloseBtn: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  imgPreviewCloseText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  imgPreviewBody: {
    flex: 1,
    marginVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imgPreviewImage: {
    width: '100%',
    height: '100%',
  },
  imgPreviewFooter: {
    alignItems: 'center',
  },
  imgPreviewExternalBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  imgPreviewExternalText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
