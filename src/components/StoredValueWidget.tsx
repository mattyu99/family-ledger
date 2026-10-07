import React, { useState, useEffect } from 'react';
import {
  View,
  Text as RNText,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput as RNTextInput,
  TextProps,
  TextInputProps,
  Alert,
  Platform,
  Keyboard,
} from 'react-native';
import { PaymentAccount } from '../types/database';
import { useLedger } from '../context/LedgerContext';

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

interface StoredValueWidgetProps {
  onManageAccounts?: () => void;
}

export const StoredValueWidget: React.FC<StoredValueWidgetProps> = ({ onManageAccounts }) => {
  const { paymentAccounts, topUpAccountBalance, adjustAccountBalance, getMemberById, isOwner } = useLedger();

  const storedValueCards = React.useMemo(
    () => paymentAccounts.filter(a => a.type === 'stored_value'),
    [paymentAccounts]
  );

  const [activeModalAccount, setActiveModalAccount] = useState<PaymentAccount | null>(null);
  const [modalMode, setModalMode] = useState<'topup' | 'adjust'>('topup');
  const [customAmount, setCustomAmount] = useState<string>('');
  const [keyboardOffset, setKeyboardOffset] = useState<number>(0);

  // 監聽鍵盤高度 (Android, iOS 與 Mobile Web)
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      const h = e?.endCoordinates?.height || 280;
      setKeyboardOffset(h);
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardOffset(0);
    });

    let removeViewportListener: (() => void) | undefined;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.visualViewport) {
      const handleViewportResize = () => {
        if (!window.visualViewport) return;
        const windowHeight = window.innerHeight;
        const viewportHeight = window.visualViewport.height;
        const diff = windowHeight - viewportHeight;
        if (diff > 120) {
          setKeyboardOffset(diff);
        } else {
          setKeyboardOffset(0);
        }
      };
      window.visualViewport.addEventListener('resize', handleViewportResize);
      removeViewportListener = () => {
        window.visualViewport?.removeEventListener('resize', handleViewportResize);
      };
    }

    return () => {
      showSub.remove();
      hideSub.remove();
      if (removeViewportListener) removeViewportListener();
    };
  }, []);

  if (storedValueCards.length === 0) {
    return null;
  }

  const handleOpenTopUp = (acc: PaymentAccount) => {
    setActiveModalAccount(acc);
    setModalMode('topup');
    setCustomAmount('500');
  };

  const handleOpenAdjust = (acc: PaymentAccount) => {
    if (!isOwner) {
      if (Platform.OS === 'web') alert('權限不足：只有帳本管理員才能校正卡片餘額');
      else Alert.alert('權限不足', '只有帳本管理員才能校正卡片餘額');
      return;
    }
    setActiveModalAccount(acc);
    setModalMode('adjust');
    setCustomAmount(String(acc.balance));
  };

  const handleConfirmAction = async () => {
    if (!activeModalAccount) return;
    const num = parseFloat(customAmount);
    if (isNaN(num) || (modalMode === 'topup' && num <= 0) || (modalMode === 'adjust' && num < 0)) {
      if (Platform.OS === 'web') alert('請輸入有效金額');
      else Alert.alert('提示', '請輸入有效金額');
      return;
    }

    if (modalMode === 'topup') {
      const success = await topUpAccountBalance(activeModalAccount.id, num);
      if (success) {
        setActiveModalAccount(null);
      }
    } else {
      if (!isOwner) {
        if (Platform.OS === 'web') alert('權限不足：只有帳本管理員才能校正卡片餘額');
        else Alert.alert('權限不足', '只有帳本管理員才能校正卡片餘額');
        return;
      }
      const success = await adjustAccountBalance(activeModalAccount.id, num);
      if (success) {
        setActiveModalAccount(null);
      }
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <Text style={styles.titleIcon}>🚌</Text>
          <Text style={styles.titleText}>悠遊卡 / 儲值卡即時餘額</Text>
        </View>
        {onManageAccounts && (
          <TouchableOpacity onPress={onManageAccounts} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.manageLinkText}>{isOwner ? '管理卡片 ›' : '查看卡片 ›'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {storedValueCards.map(card => {
          const owner = getMemberById(card.user_id);
          const isLow = card.balance < 100;
          return (
            <View key={card.id} style={[styles.cardItem, { borderColor: card.color || '#0284C7' }]}>
              {/* 卡片標頭 */}
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleWrap}>
                  <Text style={styles.cardIcon}>{card.icon || '🚌'}</Text>
                  <Text style={styles.cardName} numberOfLines={1}>{card.name}</Text>
                </View>
                {owner && (
                  <View style={styles.ownerBadge}>
                    <Text style={styles.ownerText}>{owner.avatar_url || '👤'} {owner.display_name}</Text>
                  </View>
                )}
              </View>

              {/* 餘額顯示 */}
              <View style={styles.balanceRow}>
                <Text style={styles.balanceLabel}>目前餘額</Text>
                <Text
                  style={[styles.balanceValue, isLow && styles.balanceValueLow]}
                  numberOfLines={1}
                >
                  NT$ {Number(card.balance).toLocaleString()}
                </Text>
              </View>

              {/* 操作按鈕群 */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.quickTopUpBtn, { backgroundColor: card.color || '#0284C7' }, !isOwner && { flex: 1 }]}
                  onPress={() => handleOpenTopUp(card)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.quickTopUpText}>+ 快速加值</Text>
                </TouchableOpacity>

                {isOwner && (
                  <TouchableOpacity
                    style={styles.adjustBtn}
                    onPress={() => handleOpenAdjust(card)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.adjustText}>校正餘額</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* 加值 / 校正彈窗 */}
      <Modal
        visible={!!activeModalAccount}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveModalAccount(null)}
      >
        <View style={[
          styles.modalOverlay,
          keyboardOffset > 0 && { justifyContent: 'flex-start', paddingTop: Platform.OS === 'ios' ? 44 : 24 }
        ]}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={Keyboard.dismiss} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {modalMode === 'topup' ? '🚌 悠遊卡快速加值' : '✏️ 校正卡片餘額'}
              </Text>
              <TouchableOpacity onPress={() => setActiveModalAccount(null)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalCardName}>
              卡片：{activeModalAccount?.name}
            </Text>
            <Text style={styles.modalCardSub}>
              目前餘額：NT$ {activeModalAccount?.balance.toLocaleString()}
            </Text>

            {modalMode === 'topup' ? (
              <>
                <View style={styles.inputLabelRow}>
                  <Text style={styles.inputLabel}>選擇加值金額</Text>
                  {keyboardOffset > 0 && (
                    <TouchableOpacity onPress={Keyboard.dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={styles.dismissKeyboardText}>收起鍵盤 ▾</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.presetAmountsRow}>
                  {[100, 200, 500, 1000].map(val => (
                    <TouchableOpacity
                      key={val}
                      style={[styles.presetChip, customAmount === String(val) && styles.presetChipActive]}
                      onPress={() => setCustomAmount(String(val))}
                    >
                      <Text style={[styles.presetChipText, customAmount === String(val) && styles.presetChipTextActive]}>
                        +${val}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.amountInputRow}>
                  <Text style={styles.currencySymbol}>$</Text>
                  <TextInput
                    style={styles.amountInput}
                    value={customAmount}
                    onChangeText={setCustomAmount}
                    keyboardType="numeric"
                    placeholder="輸入自訂加值金額"
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                </View>
                <Text style={styles.modalHint}>
                  💡 加值完成後將自動扣減皮夾現金並為家庭記錄一筆加值明細。
                </Text>
              </>
            ) : (
              <>
                <View style={styles.inputLabelRow}>
                  <Text style={styles.inputLabel}>實體卡片當前正確餘額</Text>
                  {keyboardOffset > 0 && (
                    <TouchableOpacity onPress={Keyboard.dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={styles.dismissKeyboardText}>收起鍵盤 ▾</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.amountInputRow}>
                  <Text style={styles.currencySymbol}>$</Text>
                  <TextInput
                    style={styles.amountInput}
                    value={customAmount}
                    onChangeText={setCustomAmount}
                    keyboardType="numeric"
                    placeholder="輸入實際餘額"
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                </View>
                <Text style={styles.modalHint}>
                  💡 當悠遊卡在捷運逼卡發現金額有出入時，可直接在此調整為最新餘額。
                </Text>
              </>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setActiveModalAccount(null)}
              >
                <Text style={styles.modalCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: activeModalAccount?.color || '#0284C7' }]}
                onPress={handleConfirmAction}
              >
                <Text style={styles.modalSubmitText}>
                  {modalMode === 'topup' ? '確認加值' : '確認校正'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  titleIcon: {
    fontSize: 16,
  },
  titleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  manageLinkText: {
    fontSize: 11.5,
    color: '#0284C7',
    fontWeight: '600',
  },
  scrollContent: {
    flexDirection: 'row',
    gap: 10,
    paddingRight: 6,
  },
  cardItem: {
    width: 200,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1.5,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  cardIcon: {
    fontSize: 15,
  },
  cardName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    flexShrink: 1,
  },
  ownerBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  ownerText: {
    fontSize: 9.5,
    color: '#475569',
    fontWeight: '500',
  },
  balanceRow: {
    marginBottom: 8,
  },
  balanceLabel: {
    fontSize: 10,
    color: '#64748B',
    marginBottom: 1,
  },
  balanceValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0284C7',
  },
  balanceValueLow: {
    color: '#EF4444',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 6,
  },
  quickTopUpBtn: {
    flex: 1,
    paddingVertical: 5,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTopUpText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  adjustBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustText: {
    color: '#475569',
    fontSize: 10.5,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    width: '100%',
    maxWidth: 380,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalCloseText: {
    fontSize: 16,
    color: '#94A3B8',
  },
  modalCardName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  modalCardSub: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 14,
  },
  inputLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dismissKeyboardText: {
    fontSize: 12,
    color: '#0284C7',
    fontWeight: '600',
    marginLeft: 'auto',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
  },
  presetAmountsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  presetChip: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetChipActive: {
    backgroundColor: '#E0F2FE',
    borderColor: '#0284C7',
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  presetChipTextActive: {
    color: '#0284C7',
    fontWeight: '700',
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  currencySymbol: {
    fontSize: 16,
    fontWeight: '700',
    color: '#64748B',
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    paddingVertical: 8,
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalHint: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
  modalSubmitBtn: {
    flex: 2,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});

