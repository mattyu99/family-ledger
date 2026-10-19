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
import { PaymentAccount, PaymentMethod, CustomPaymentMethod } from '../types/database';
import { useLedger } from '../context/LedgerContext';
import { sortAccountsByUser, DEFAULT_PAYMENT_METHODS } from '../lib/payment';
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

interface StoredValueWidgetProps {
  onManageAccounts?: () => void;
  onOpenReconcile?: (account?: PaymentAccount) => void;
  onOpenCreditCardReconcile?: () => void;
  filterMemberId?: string;
}

export const StoredValueWidget: React.FC<StoredValueWidgetProps> = ({
  onManageAccounts,
  onOpenReconcile,
  onOpenCreditCardReconcile,
  filterMemberId,
}) => {
  const { paymentAccounts, paymentMethods, topUpAccountBalance, adjustAccountBalance, getMemberById, isOwner, currentUser, members } = useLedger();

  const targetFilteredMember = React.useMemo(() => {
    if (!filterMemberId || filterMemberId === 'all') return undefined;
    return members.find(m => m.id === filterMemberId) || (currentUser?.id === filterMemberId ? currentUser : undefined);
  }, [filterMemberId, members, currentUser]);

  const storedValueCards = React.useMemo(() => {
    let cards = paymentAccounts.filter(a => a.type === 'stored_value');
    if (filterMemberId && filterMemberId !== 'all') {
      cards = cards.filter(a => {
        if (a.user_id === filterMemberId) return true;
        if (!a.user_id && targetFilteredMember && a.name.includes(targetFilteredMember.display_name)) return true;
        return false;
      });
    }
    return sortAccountsByUser(cards, currentUser?.id);
  }, [paymentAccounts, currentUser, filterMemberId, targetFilteredMember]);

  const scrollRef = React.useRef<ScrollView | null>(null);

  // 當篩選成員切換或卡片數量變動時，重設滾動位置至最左側 (x: 0)，避免切換成員後因殘留捲動位移導致卡片落在可視範圍外
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
  }, [filterMemberId, storedValueCards.length]);

  const creditCards = React.useMemo(
    () => paymentAccounts.filter(a => a.type === 'credit_card'),
    [paymentAccounts]
  );

  const bankAccounts = React.useMemo(
    () => paymentAccounts.filter(a => a.type === 'bank'),
    [paymentAccounts]
  );

  const isMatchedToCurrentUser = React.useCallback(
    (userId?: string | null) => {
      if (!userId || !currentUser) return false;
      if (userId === currentUser.id) return true;
      const member = members.find(m => m.id === userId);
      if (member) {
        if (member.id === currentUser.id) return true;
        if (
          member.display_name &&
          currentUser.display_name &&
          member.display_name.trim().toLowerCase() === currentUser.display_name.trim().toLowerCase()
        ) {
          return true;
        }
      }
      return false;
    },
    [currentUser, members]
  );

  const [activeModalAccount, setActiveModalAccount] = useState<PaymentAccount | null>(null);
  const [modalMode, setModalMode] = useState<'topup' | 'adjust'>('topup');
  const [customAmount, setCustomAmount] = useState<string>('');
  const [keyboardOffset, setKeyboardOffset] = useState<number>(0);

  // 加值扣款來源設定（全面動態化支援所有支付方式與關聯卡片/銀行）
  const [topUpPaymentMethod, setTopUpPaymentMethod] = useState<PaymentMethod>('cash');
  const [topUpAccountId, setTopUpAccountId] = useState<string>('');
  const [topUpPayerId, setTopUpPayerId] = useState<string>('');
  const [showAllSubAccounts, setShowAllSubAccounts] = useState<boolean>(false);
  const [recordExpense, setRecordExpense] = useState<boolean>(true);

  // 其他儲值卡（排除目前正在加值的卡片）
  const otherStoredValueCards = React.useMemo(
    () => paymentAccounts.filter(a => a.type === 'stored_value' && a.id !== activeModalAccount?.id),
    [paymentAccounts, activeModalAccount]
  );

  // 取得有效啟用的出資支付方式清單（動態支援現金、信用卡、銀行轉帳、悠遊付、街口等）
  const activeTopUpPaymentMethods = React.useMemo(() => {
    const list = paymentMethods && paymentMethods.length > 0 ? paymentMethods : DEFAULT_PAYMENT_METHODS;
    const enabled = list.filter(m => m.is_enabled !== false);
    const result: CustomPaymentMethod[] = [];
    const cashObj = enabled.find(m => m.id === 'cash') || list.find(m => m.id === 'cash') || DEFAULT_PAYMENT_METHODS[0];
    result.push(cashObj);
    for (const m of enabled) {
      if (m.id === 'cash') continue;
      // 若為儲值卡，但家庭中沒有其他儲值卡可供轉出，則不顯示
      if (m.id === 'stored_value' || m.type === 'stored_value') {
        const others = paymentAccounts.filter(a => a.type === 'stored_value' && a.id !== activeModalAccount?.id);
        if (others.length === 0) continue;
      }
      result.push(m);
    }
    return result;
  }, [paymentMethods, paymentAccounts, activeModalAccount]);

  const currentMethodObj = React.useMemo(() => {
    const list = paymentMethods && paymentMethods.length > 0 ? paymentMethods : DEFAULT_PAYMENT_METHODS;
    return list.find(m => m.id === topUpPaymentMethod);
  }, [paymentMethods, topUpPaymentMethod]);

  const isPureCreditCard = currentMethodObj
    ? (currentMethodObj.id === 'credit_card' || currentMethodObj.type === 'credit_card')
    : topUpPaymentMethod === 'credit_card';

  const isBankTransfer = currentMethodObj
    ? (currentMethodObj.type === 'bank' || currentMethodObj.id === 'transfer')
    : topUpPaymentMethod === 'transfer';

  const isStoredValue = currentMethodObj
    ? (currentMethodObj.type === 'stored_value' || currentMethodObj.id === 'stored_value')
    : topUpPaymentMethod === 'stored_value';

  const isEWallet = currentMethodObj
    ? (currentMethodObj.type === 'e_wallet' || (!!currentMethodObj.supports_credit_card && !isPureCreditCard))
    : (topUpPaymentMethod === 'easycard_pay' || topUpPaymentMethod === 'jkopay' || topUpPaymentMethod === 'line_pay' || topUpPaymentMethod === 'px_pay');

  // 依據當前選取的出資付款人 (topUpPayerId) 動態過濾其專屬之信用卡
  const payerCreditCards = React.useMemo(() => {
    if (!topUpPayerId) return creditCards;
    const targetM = members.find(m => m.id === topUpPayerId);
    return creditCards.filter(c => {
      if (c.user_id === topUpPayerId) return true;
      if (targetM && targetM.display_name && c.name.includes(targetM.display_name)) return true;
      return false;
    });
  }, [creditCards, topUpPayerId, members]);

  const displayedCreditCards = React.useMemo(() => {
    if (showAllSubAccounts || payerCreditCards.length === 0) {
      return creditCards;
    }
    return payerCreditCards;
  }, [showAllSubAccounts, payerCreditCards, creditCards]);

  // 依據出資付款人動態過濾其銀行帳戶
  const payerBankAccounts = React.useMemo(() => {
    if (!topUpPayerId) return bankAccounts;
    const targetM = members.find(m => m.id === topUpPayerId);
    return bankAccounts.filter(b => {
      if (b.user_id === topUpPayerId) return true;
      if (targetM && targetM.display_name && b.name.includes(targetM.display_name)) return true;
      return false;
    });
  }, [bankAccounts, topUpPayerId, members]);

  const displayedBankAccounts = React.useMemo(() => {
    if (showAllSubAccounts || payerBankAccounts.length === 0) {
      return bankAccounts;
    }
    return payerBankAccounts;
  }, [showAllSubAccounts, payerBankAccounts, bankAccounts]);

  // 依據出資付款人動態過濾其他儲值卡
  const payerOtherStoredCards = React.useMemo(() => {
    if (!topUpPayerId) return otherStoredValueCards;
    const targetM = members.find(m => m.id === topUpPayerId);
    return otherStoredValueCards.filter(s => {
      if (s.user_id === topUpPayerId) return true;
      if (targetM && targetM.display_name && s.name.includes(targetM.display_name)) return true;
      return false;
    });
  }, [otherStoredValueCards, topUpPayerId, members]);

  const displayedOtherStoredCards = React.useMemo(() => {
    if (showAllSubAccounts || payerOtherStoredCards.length === 0) {
      return otherStoredValueCards;
    }
    return payerOtherStoredCards;
  }, [showAllSubAccounts, payerOtherStoredCards, otherStoredValueCards]);

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

  const handlePaymentMethodChange = (newMethod: PaymentMethod) => {
    setTopUpPaymentMethod(newMethod);
    const mObj = (paymentMethods && paymentMethods.length > 0 ? paymentMethods : DEFAULT_PAYMENT_METHODS).find(m => m.id === newMethod);
    const mPureCc = mObj ? (mObj.id === 'credit_card' || mObj.type === 'credit_card') : newMethod === 'credit_card';
    const mBank = mObj ? (mObj.type === 'bank' || mObj.id === 'transfer') : newMethod === 'transfer';
    const mSv = mObj ? (mObj.type === 'stored_value' || mObj.id === 'stored_value') : newMethod === 'stored_value';

    if (mPureCc) {
      // 信用卡：預設選取該付款人的第一張卡片
      const userCard = payerCreditCards[0] || creditCards[0];
      setTopUpAccountId(userCard?.id || '');
    } else if (mBank) {
      // 銀行轉帳：預設不強制指定特定帳戶
      setTopUpAccountId('');
    } else if (mSv) {
      // 其他儲值卡：預設選第一張其他儲值卡
      const userCard = payerOtherStoredCards[0] || otherStoredValueCards[0];
      setTopUpAccountId(userCard?.id || '');
    } else {
      // 現金或電子錢包：預設帳戶為空（電子錢包留空代表「錢包餘額/直接扣款」）
      setTopUpAccountId('');
    }
  };

  const handlePayerChange = (newPayerId: string) => {
    setTopUpPayerId(newPayerId);
    setShowAllSubAccounts(false);
    if (isPureCreditCard) {
      const targetM = members.find(m => m.id === newPayerId);
      const userCard = creditCards.find(c => {
        if (c.user_id === newPayerId) return true;
        if (targetM?.display_name && c.name.includes(targetM.display_name)) return true;
        return false;
      }) || creditCards[0];
      setTopUpAccountId(userCard?.id || '');
    } else if (isStoredValue) {
      const targetM = members.find(m => m.id === newPayerId);
      const userCard = otherStoredValueCards.find(c => {
        if (c.user_id === newPayerId) return true;
        if (targetM?.display_name && c.name.includes(targetM.display_name)) return true;
        return false;
      }) || otherStoredValueCards[0];
      setTopUpAccountId(userCard?.id || '');
    } else {
      setTopUpAccountId('');
    }
  };

  const handleOpenTopUp = (acc: PaymentAccount) => {
    setActiveModalAccount(acc);
    setModalMode('topup');
    setCustomAmount('500');
    setTopUpPaymentMethod('cash');
    setTopUpAccountId('');
    setShowAllSubAccounts(false);

    const matchedMember = acc.user_id && members.find(m => m.id === acc.user_id);
    const defaultPayerId = matchedMember ? matchedMember.id : (currentUser?.id || members[0]?.id || '');
    setTopUpPayerId(defaultPayerId);
    setRecordExpense(true);
  };

  const renderModalHint = () => {
    const formattedAmount = Number(customAmount || 0).toLocaleString();
    if (!recordExpense) {
      return `💡 僅手動增加【${activeModalAccount?.name}】卡片餘額 +NT$ ${formattedAmount}，不產生任何交易明細（各卡對帳單將不含此加值紀錄）。`;
    }

    if (isPureCreditCard) {
      const card = paymentAccounts.find(c => c.id === topUpAccountId);
      const cardName = card ? card.name : '信用卡';
      return `💡 將建立內部轉帳明細：【${activeModalAccount?.name}】餘額增加 +NT$ ${formattedAmount}，從【${cardName}】扣款並納入信用卡帳單對帳，且不重複計入家庭總支出！`;
    }

    if (isBankTransfer) {
      const bank = paymentAccounts.find(a => a.id === topUpAccountId);
      const bankName = bank ? bank.name : null;
      return `💡 將建立內部轉帳明細：【${activeModalAccount?.name}】餘額增加 +NT$ ${formattedAmount}，從【${bankName ? `🏦 ${bankName}` : '🏦 銀行轉帳'}】扣款，且不重複計入家庭總支出！`;
    }

    if (isEWallet) {
      const linkedCard = topUpAccountId ? paymentAccounts.find(a => a.id === topUpAccountId) : null;
      const methodName = currentMethodObj?.name || '電子支付';
      const methodIcon = currentMethodObj?.icon || '🩵';
      const sourceDesc = linkedCard ? `${methodName} (綁定 ${linkedCard.name})` : `${methodName} 錢包餘額 / 帳戶直接扣款`;
      return `💡 將建立內部轉帳明細：【${activeModalAccount?.name}】餘額增加 +NT$ ${formattedAmount}，從【${methodIcon} ${sourceDesc}】扣款，且不重複計入家庭總支出！`;
    }

    if (isStoredValue) {
      const srcCard = paymentAccounts.find(a => a.id === topUpAccountId);
      return `💡 將建立內部轉帳明細：【${activeModalAccount?.name}】餘額增加 +NT$ ${formattedAmount}，從【🚌 ${srcCard ? srcCard.name : '儲值卡'}】餘額扣除轉入，且不重複計入家庭總支出！`;
    }

    if (topUpPaymentMethod === 'cash') {
      return `💡 將建立內部轉帳明細：【${activeModalAccount?.name}】餘額增加 +NT$ ${formattedAmount}，從【💵 皮夾現金】扣款，且不重複計入家庭總支出！`;
    }

    return `💡 將建立內部轉帳明細：【${activeModalAccount?.name}】餘額增加 +NT$ ${formattedAmount}，從【${currentMethodObj?.icon || ''} ${currentMethodObj?.name || '其他出資管道'}】扣款，且不重複計入家庭總支出！`;
  };

  const handleOpenAdjust = (acc: PaymentAccount) => {
    const isMyCard = isMatchedToCurrentUser(acc.user_id);
    if (!isOwner && !isMyCard) {
      if (Platform.OS === 'web') alert('權限不足：只有帳本管理員或持卡人本人才能校正卡片餘額');
      else Alert.alert('權限不足', '只有帳本管理員或持卡人本人才能校正卡片餘額');
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
      const success = await topUpAccountBalance(activeModalAccount.id, num, {
        sourceType: topUpPaymentMethod,
        sourceAccountId: topUpAccountId || undefined,
        payerId: topUpPayerId,
        recordExpense: recordExpense,
      });
      if (success) {
        setActiveModalAccount(null);
      }
    } else {
      const isMyCard = isMatchedToCurrentUser(activeModalAccount.user_id);
      if (!isOwner && !isMyCard) {
        if (Platform.OS === 'web') alert('權限不足：只有帳本管理員或持卡人本人才能校正卡片餘額');
        else Alert.alert('權限不足', '只有帳本管理員或持卡人本人才能校正卡片餘額');
        return;
      }
      const success = await adjustAccountBalance(activeModalAccount.id, num);
      if (success) {
        setActiveModalAccount(null);
      }
    }
  };

  if (storedValueCards.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <Text style={styles.titleIcon}>🚌</Text>
          <Text style={styles.titleText}>
            {targetFilteredMember
              ? `${targetFilteredMember.display_name}的悠遊卡 / 儲值卡 (${storedValueCards.length})`
              : `悠遊卡 / 儲值卡即時餘額 (${storedValueCards.length})`}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {onOpenCreditCardReconcile && (
            <TouchableOpacity onPress={onOpenCreditCardReconcile} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.creditReconcileLinkText}>💳 信用卡對帳</Text>
            </TouchableOpacity>
          )}
          {onManageAccounts && (
            <TouchableOpacity onPress={onManageAccounts} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.manageLinkText}>{isOwner ? '管理卡片 ›' : '查看卡片 ›'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <HorizontalScrollView
        key={filterMemberId || 'all'}
        ref={scrollRef}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onContentSizeChange={(w) => {
          if (w > 0 && storedValueCards.length <= 1) {
            scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
          }
        }}
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
                  style={[styles.quickTopUpBtn, { backgroundColor: card.color || '#0284C7' }]}
                  onPress={() => handleOpenTopUp(card)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.quickTopUpText}>+ 加值</Text>
                </TouchableOpacity>

                {onOpenReconcile && (
                  <TouchableOpacity
                    style={styles.reconcileBtn}
                    onPress={() => onOpenReconcile(card)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.reconcileBtnText}>📊 對帳</Text>
                  </TouchableOpacity>
                )}

                {isOwner && (
                  <TouchableOpacity
                    style={styles.adjustBtn}
                    onPress={() => handleOpenAdjust(card)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.adjustText}>校正</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </HorizontalScrollView>

      {/* 加值 / 校正彈窗 */}
      <Modal
        visible={!!activeModalAccount}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveModalAccount(null)}
      >
        <View style={[
          styles.modalOverlay,
          keyboardOffset > 0 && { justifyContent: 'center', paddingBottom: 80 }
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

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 6 }}>
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

                  {/* 出資付款人 */}
                  <Text style={[styles.inputLabel, { marginTop: 4 }]}>出資付款人</Text>
                  <View style={styles.payerChipsRow}>
                    {members.map(m => {
                      const isSelected = topUpPayerId === m.id;
                      return (
                        <TouchableOpacity
                          key={m.id}
                          style={[styles.payerChip, isSelected && styles.payerChipActive]}
                          onPress={() => handlePayerChange(m.id)}
                        >
                          <Text style={styles.payerChipAvatar}>{m.avatar_url || '👤'}</Text>
                          <Text style={[styles.payerChipName, isSelected && styles.payerChipNameActive]}>
                            {m.display_name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* 出資支付方式 (第一層：動態支付方式) */}
                  <View style={styles.inputLabelRow}>
                    <Text style={[styles.inputLabel, { marginBottom: 0 }]}>出資支付方式</Text>
                  </View>
                  <View style={styles.sourceChipsRow}>
                    {activeTopUpPaymentMethods.map(m => {
                      const isSelected = topUpPaymentMethod === m.id;
                      return (
                        <TouchableOpacity
                          key={m.id}
                          style={[
                            styles.sourceChip,
                            isSelected && {
                              borderColor: m.color || '#0284C7',
                              backgroundColor: `${m.color || '#0284C7'}18`,
                            },
                          ]}
                          onPress={() => handlePaymentMethodChange(m.id as any)}
                        >
                          <Text
                            style={[
                              styles.sourceChipText,
                              isSelected && { color: m.color || '#0284C7', fontWeight: '700' },
                            ]}
                          >
                            {m.icon} {m.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* 第二層：關聯卡片與帳戶連動 */}
                  {/* 子層：當選擇信用卡時 */}
                  {isPureCreditCard && (
                    <View style={styles.subAccountSection}>
                      <View style={styles.inputLabelRow}>
                        <Text style={styles.subAccountLabel}>💳 選擇扣款信用卡 (納入對帳)</Text>
                        {payerCreditCards.length > 0 && creditCards.length > payerCreditCards.length && (
                          <TouchableOpacity
                            onPress={() => setShowAllSubAccounts(prev => !prev)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Text style={styles.toggleAllCardsLinkText}>
                              {showAllSubAccounts ? '僅顯示出資人卡片 ▴' : `展開全家卡片 (${creditCards.length}) ▾`}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={styles.sourceChipsRow}>
                        {displayedCreditCards.map(cc => {
                          const isSelected = topUpAccountId === cc.id;
                          return (
                            <TouchableOpacity
                              key={cc.id}
                              style={[styles.sourceChip, isSelected && styles.sourceChipActive]}
                              onPress={() => setTopUpAccountId(cc.id)}
                            >
                              <Text style={[styles.sourceChipText, isSelected && styles.sourceChipTextActive]}>
                                💳 {cc.name}{cc.last_four_digits ? ` (*${cc.last_four_digits})` : ''}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                        {displayedCreditCards.length === 0 && (
                          <Text style={styles.emptyAccountHint}>💳 目前尚未建立屬於該出資人的信用卡</Text>
                        )}
                      </View>
                    </View>
                  )}

                  {/* 子層：當選擇電子錢包/行動支付時 (悠遊付、街口、全支付、LINE Pay 等) */}
                  {isEWallet && (
                    <View style={styles.subAccountSection}>
                      <View style={styles.inputLabelRow}>
                        <Text style={styles.subAccountLabel}>
                          {currentMethodObj?.icon || '🩵'} 選擇扣款來源方式
                        </Text>
                        {payerCreditCards.length > 0 && creditCards.length > payerCreditCards.length && (
                          <TouchableOpacity
                            onPress={() => setShowAllSubAccounts(prev => !prev)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Text style={styles.toggleAllCardsLinkText}>
                              {showAllSubAccounts ? '僅顯示出資人卡片 ▴' : `展開全家卡片 (${creditCards.length}) ▾`}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={styles.sourceChipsRow}>
                        <TouchableOpacity
                          style={[styles.sourceChip, !topUpAccountId && styles.sourceChipActive]}
                          onPress={() => setTopUpAccountId('')}
                        >
                          <Text style={[styles.sourceChipText, !topUpAccountId && styles.sourceChipTextActive]}>
                            {currentMethodObj?.icon || '🩵'} {currentMethodObj?.name || '電子錢包'}餘額 / 帳戶直接扣款
                          </Text>
                        </TouchableOpacity>
                        {displayedCreditCards.map(cc => {
                          const isSelected = topUpAccountId === cc.id;
                          return (
                            <TouchableOpacity
                              key={cc.id}
                              style={[styles.sourceChip, isSelected && styles.sourceChipActive]}
                              onPress={() => setTopUpAccountId(cc.id)}
                            >
                              <Text style={[styles.sourceChipText, isSelected && styles.sourceChipTextActive]}>
                                💳 綁定 {cc.name}{cc.last_four_digits ? ` (*${cc.last_four_digits})` : ''}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* 子層：當選擇銀行轉帳時 */}
                  {isBankTransfer && bankAccounts.length > 0 && (
                    <View style={styles.subAccountSection}>
                      <View style={styles.inputLabelRow}>
                        <Text style={styles.subAccountLabel}>🏦 選擇扣款銀行帳戶 (選填)</Text>
                        {payerBankAccounts.length > 0 && bankAccounts.length > payerBankAccounts.length && (
                          <TouchableOpacity
                            onPress={() => setShowAllSubAccounts(prev => !prev)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Text style={styles.toggleAllCardsLinkText}>
                              {showAllSubAccounts ? '僅顯示出資人帳戶 ▴' : `展開全家帳戶 (${bankAccounts.length}) ▾`}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={styles.sourceChipsRow}>
                        <TouchableOpacity
                          style={[styles.sourceChip, !topUpAccountId && styles.sourceChipActive]}
                          onPress={() => setTopUpAccountId('')}
                        >
                          <Text style={[styles.sourceChipText, !topUpAccountId && styles.sourceChipTextActive]}>
                            🏦 一般轉帳 (不指定銀行)
                          </Text>
                        </TouchableOpacity>
                        {displayedBankAccounts.map(ba => {
                          const isSelected = topUpAccountId === ba.id;
                          return (
                            <TouchableOpacity
                              key={ba.id}
                              style={[styles.sourceChip, isSelected && styles.sourceChipActive]}
                              onPress={() => setTopUpAccountId(ba.id)}
                            >
                              <Text style={[styles.sourceChipText, isSelected && styles.sourceChipTextActive]}>
                                🏦 {ba.name}{ba.last_four_digits ? ` (*${ba.last_four_digits})` : ''}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* 子層：當選擇其他儲值卡互轉時 */}
                  {isStoredValue && otherStoredValueCards.length > 0 && (
                    <View style={styles.subAccountSection}>
                      <View style={styles.inputLabelRow}>
                        <Text style={styles.subAccountLabel}>🚌 選擇出資轉出之卡片</Text>
                        {payerOtherStoredCards.length > 0 && otherStoredValueCards.length > payerOtherStoredCards.length && (
                          <TouchableOpacity
                            onPress={() => setShowAllSubAccounts(prev => !prev)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Text style={styles.toggleAllCardsLinkText}>
                              {showAllSubAccounts ? '僅顯示出資人卡片 ▴' : `展開全家卡片 (${otherStoredValueCards.length}) ▾`}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={styles.sourceChipsRow}>
                        {displayedOtherStoredCards.map(sc => {
                          const isSelected = topUpAccountId === sc.id;
                          return (
                            <TouchableOpacity
                              key={sc.id}
                              style={[styles.sourceChip, isSelected && styles.sourceChipActive]}
                              onPress={() => setTopUpAccountId(sc.id)}
                            >
                              <Text style={[styles.sourceChipText, isSelected && styles.sourceChipTextActive]}>
                                🚌 {sc.name} (餘額: ${sc.balance})
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* 自動記帳開關 */}
                  <TouchableOpacity
                    style={styles.toggleRow}
                    activeOpacity={0.8}
                    onPress={() => setRecordExpense(prev => !prev)}
                  >
                    <Text style={styles.toggleCheckbox}>{recordExpense ? '☑️' : '⬜'}</Text>
                    <Text style={styles.toggleLabel}>自動記錄加值轉帳明細（納入對帳）</Text>
                  </TouchableOpacity>

                  <Text style={styles.modalHint}>
                    {renderModalHint()}
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
            </ScrollView>

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
    color: '#64748B',
    fontWeight: '600',
  },
  reconcileLinkText: {
    fontSize: 11.5,
    color: '#0284C7',
    fontWeight: '700',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  creditReconcileLinkText: {
    fontSize: 11.5,
    color: '#4F46E5',
    fontWeight: '700',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  scrollContent: {
    flexDirection: 'row',
    gap: 10,
    paddingRight: 6,
  },
  cardItem: {
    width: 215,
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
    gap: 5,
  },
  quickTopUpBtn: {
    flex: 1.1,
    paddingVertical: 5,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTopUpText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '700',
  },
  reconcileBtn: {
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reconcileBtnText: {
    color: '#0284C7',
    fontSize: 10.5,
    fontWeight: '700',
  },
  adjustBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustText: {
    color: '#475569',
    fontSize: 10,
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
  toggleAllCardsLinkText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#0284C7',
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
  sourceChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  sourceChip: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sourceChipActive: {
    backgroundColor: '#E0F2FE',
    borderColor: '#0284C7',
  },
  sourceChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  sourceChipTextActive: {
    color: '#0284C7',
    fontWeight: '700',
  },
  payerChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  payerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  payerChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  payerChipAvatar: {
    fontSize: 12,
  },
  payerChipName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  payerChipNameActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    marginTop: 2,
  },
  toggleCheckbox: {
    fontSize: 14,
  },
  toggleLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  subAccountSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginBottom: 10,
  },
  subAccountLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
  },
  emptyAccountHint: {
    fontSize: 11,
    color: '#94A3B8',
    paddingVertical: 4,
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

