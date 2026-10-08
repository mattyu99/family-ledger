import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text as RNText,
  Modal,
  StyleSheet,
  TextInput as RNTextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Dimensions,
  TextProps,
  TextInputProps,
  Keyboard,
} from 'react-native';
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
import { useLedger } from '../context/LedgerContext';
import { Transaction, TransactionType, PaymentMethod } from '../types/database';
import { PAYMENT_METHOD_OPTIONS, DEFAULT_PAYMENT_METHODS, sortAccountsByUser } from '../lib/payment';
import { getCategoryIcon } from '../lib/icons';
import { DatePickerModal } from './DatePickerModal';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const CATEGORY_MERCHANT_PRESETS: Record<string, string[]> = {
  food: ['全聯', '麥當勞', '50嵐', '美而美', '八方雲集', '星巴克', '摩斯', '路易莎', '7-11', '全家'],
  supermarket: ['全聯', '好市多', '家樂送', '大潤發', '愛買', '7-11', '全家', '蝦皮', '屈臣氏', '康是美'],
  transport: ['中油', '台塑', '悠遊卡', '高鐵', '台鐵', 'Uber', '捷運', '嘟嘟房'],
  housing: ['台電', '自來水', '瓦斯公司', '中華電信', '特力屋', 'IKEA', '管理費'],
  entertainment: ['威秀影城', 'Netflix', 'Spotify', 'KTV', 'Steam', 'YouTube'],
  medical: ['診所', '大樹藥局', '屈臣氏', '康是美', '醫院', '健保局'],
  education: ['幼兒園', '安親班', '誠品', '金石堂', '補習班'],
  income: ['公司薪資', '年終獎金', '股票股利', '銀行利息', '副業兼職'],
};

const getCategoryPresetMerchants = (catName?: string, type?: TransactionType): string[] => {
  const name = (catName || '').toLowerCase();
  if (type === 'income') return CATEGORY_MERCHANT_PRESETS.income;
  if (name.includes('餐') || name.includes('伙') || name.includes('食') || name.includes('吃') || name.includes('喝')) {
    return CATEGORY_MERCHANT_PRESETS.food;
  }
  if (name.includes('超') || name.includes('市') || name.includes('購') || name.includes('買') || name.includes('生鮮')) {
    return CATEGORY_MERCHANT_PRESETS.supermarket;
  }
  if (name.includes('交') || name.includes('油') || name.includes('車') || name.includes('行')) {
    return CATEGORY_MERCHANT_PRESETS.transport;
  }
  if (name.includes('水') || name.includes('電') || name.includes('居') || name.includes('家') || name.includes('住')) {
    return CATEGORY_MERCHANT_PRESETS.housing;
  }
  if (name.includes('娛') || name.includes('玩') || name.includes('樂') || name.includes('休')) {
    return CATEGORY_MERCHANT_PRESETS.entertainment;
  }
  if (name.includes('醫') || name.includes('藥') || name.includes('健')) {
    return CATEGORY_MERCHANT_PRESETS.medical;
  }
  if (name.includes('教') || name.includes('育') || name.includes('學') || name.includes('書')) {
    return CATEGORY_MERCHANT_PRESETS.education;
  }
  return ['全聯', '好市多', '7-11', '全家', '家樂福', '中油', '蝦皮', '麥當勞'];
};

interface EditTransactionModalProps {
  visible: boolean;
  transaction: Transaction | null;
  onClose: () => void;
}

export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({
  visible,
  transaction,
  onClose,
}) => {
  const { categories, members, currentUser, isOwner, updateTransaction, deleteTransaction, getMemberById, getCategoryById, recentMerchants, paymentAccounts, paymentMethods } = useLedger();

  const [type, setType] = useState<TransactionType>(() => transaction?.type || 'expense');
  const [amount, setAmount] = useState<string>(() => (transaction?.amount ? String(transaction.amount) : ''));
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(() => {
    if (!transaction) return '';
    const cat = getCategoryById(transaction.category_id, transaction.category);
    const match = categories.find(c => c.id === transaction.category_id || (cat && (c.id === cat.id || c.name === cat.name)));
    return match?.id || transaction.category_id || cat?.id || '';
  });
  const [paidBy, setPaidBy] = useState<string>(() => {
    if (!transaction) return '';
    const canonicalPayer = getMemberById(transaction.paid_by);
    return canonicalPayer ? canonicalPayer.id : (transaction.paid_by || '');
  });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(() => transaction?.payment_method || 'cash');
  const [selectedAccountId, setSelectedAccountId] = useState<string>(() => transaction?.account_id || '');
  const [merchant, setMerchant] = useState<string>(() => transaction?.merchant || '');
  const [note, setNote] = useState<string>(() => transaction?.note || '');
  const [transactedAt, setTransactedAt] = useState<string>(() => transaction?.transacted_at || new Date().toISOString());
  const [datePickerVisible, setDatePickerVisible] = useState<boolean>(false);
  const [keyboardOffset, setKeyboardOffset] = useState<number>(0);
  const scrollViewRef = useRef<ScrollView>(null);

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

  // 點選店家或備註欄時，自動平滑滑動到底部可見安全區域
  const handleInputFocus = (delay = 120) => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, delay);
  };

  const dynamicBottomPadding = keyboardOffset > 0
    ? (keyboardOffset + 24)
    : 30;

  const availableCategories = categories.filter(c => c.type === type);
  const targetPayerId = paidBy || currentUser?.id;
  const creditCards = React.useMemo(
    () => sortAccountsByUser(paymentAccounts.filter(a => a.type === 'credit_card'), targetPayerId),
    [paymentAccounts, targetPayerId]
  );
  const storedValueCards = React.useMemo(
    () => sortAccountsByUser(paymentAccounts.filter(a => a.type === 'stored_value'), targetPayerId),
    [paymentAccounts, targetPayerId]
  );

  // 取得有效啟用的付款方式清單（現金永遠保留，若當前交易的付款方式被停用，仍保留顯示）
  const activePaymentMethods = React.useMemo(() => {
    const list = paymentMethods && paymentMethods.length > 0 ? paymentMethods : DEFAULT_PAYMENT_METHODS;
    const enabled = list.filter(m => m.is_enabled !== false);
    if (!enabled.some(m => m.id === 'cash')) {
      const cashObj = list.find(m => m.id === 'cash') || DEFAULT_PAYMENT_METHODS[0];
      enabled.unshift(cashObj);
    }
    if (paymentMethod && !enabled.some(m => m.id === paymentMethod)) {
      const target = list.find(m => m.id === paymentMethod);
      if (target) enabled.push(target);
    }
    return enabled;
  }, [paymentMethods, paymentMethod]);

  const currentMethodObj = React.useMemo(() => {
    const list = paymentMethods && paymentMethods.length > 0 ? paymentMethods : DEFAULT_PAYMENT_METHODS;
    return list.find(m => m.id === paymentMethod);
  }, [paymentMethods, paymentMethod]);

  const supportsCreditCard = currentMethodObj
    ? !!currentMethodObj.supports_credit_card
    : (paymentMethod === 'credit_card' || paymentMethod === 'line_pay' || paymentMethod === 'px_pay' || paymentMethod === 'easycard_pay' || paymentMethod === 'jkopay');

  const isStoredValue = currentMethodObj
    ? (currentMethodObj.type === 'stored_value' || currentMethodObj.id === 'stored_value')
    : paymentMethod === 'stored_value';

  // 該筆交易的付款人資料與權限判定（僅付款人為本機使用成員才有權限修改或刪除）
  const txPayerProfile = React.useMemo(() => {
    return transaction?.paid_by ? getMemberById(transaction.paid_by) : undefined;
  }, [transaction?.paid_by, getMemberById]);

  const txPayerName = txPayerProfile?.display_name || transaction?.payer_profile?.display_name || '付款成員';

  const canEdit = React.useMemo(() => {
    if (!transaction || !currentUser?.id) return false;
    // 帳本管理者擁有全域編輯與刪除權限
    if (isOwner) return true;
    const payerId = txPayerProfile ? txPayerProfile.id : transaction.paid_by;
    const isPayerIdMatch = payerId === currentUser.id;
    const isPayerNameMatch = !!txPayerProfile?.display_name && !!currentUser.display_name && txPayerProfile.display_name === currentUser.display_name;
    return Boolean(isPayerIdMatch || isPayerNameMatch);
  }, [transaction, currentUser, txPayerProfile, isOwner]);

  // 智慧店家快捷建議標籤列表 (結合自學習 recentMerchants + 分類推薦 + 關鍵字即時比對)
  const suggestedMerchants = React.useMemo(() => {
    const currentCats = categories.filter(c => c.type === type);
    const targetCategory = currentCats.find(c => c.id === selectedCategoryId) || currentCats[0];
    const categoryPresets = getCategoryPresetMerchants(targetCategory?.name, type);
    const pool = Array.from(new Set([...(recentMerchants || []), ...categoryPresets]));
    const query = (merchant || '').trim().toLowerCase();
    if (!query) {
      return pool.slice(0, 12);
    }
    return pool.filter(m => m.toLowerCase().includes(query)).slice(0, 10);
  }, [categories, type, selectedCategoryId, recentMerchants, merchant]);

  // 當 transaction 或 visible 改變時同步資料
  useEffect(() => {
    if (visible && transaction) {
      setType(transaction.type);
      setAmount(transaction.amount ? String(transaction.amount) : '');
      const cat = getCategoryById(transaction.category_id, transaction.category);
      const match = categories.find(c => c.id === transaction.category_id || (cat && (c.id === cat.id || c.name === cat.name)));
      const targetCatId = match?.id || transaction.category_id || cat?.id || '';
      setSelectedCategoryId(targetCatId);
      const canonicalPayer = getMemberById(transaction.paid_by);
      setPaidBy(canonicalPayer ? canonicalPayer.id : (transaction.paid_by || ''));
      setPaymentMethod(transaction.payment_method || 'cash');
      setSelectedAccountId(transaction.account_id || '');
      setMerchant(transaction.merchant || '');
      setNote(transaction.note || '');
      setTransactedAt(transaction.transacted_at || new Date().toISOString());
      setDatePickerVisible(false);
    }
  }, [visible, transaction, getMemberById, categories, getCategoryById]);

  // 切換支出/收入時，若當前分類不屬於新類型，才調整為新類型的第一個分類
  const handleTypeChange = (newType: TransactionType) => {
    setType(newType);
    const activeCats = categories.filter(c => c.type === newType);
    if (!activeCats.some(c => c.id === selectedCategoryId)) {
      if (activeCats[0]) setSelectedCategoryId(activeCats[0].id);
    }
  };

  // 切換付款方式
  const handleMethodChange = (method: PaymentMethod) => {
    setPaymentMethod(method);
    const mObj = (paymentMethods && paymentMethods.length > 0 ? paymentMethods : DEFAULT_PAYMENT_METHODS).find(m => m.id === method);
    const isCc = mObj ? !!mObj.supports_credit_card : (method === 'credit_card' || method === 'line_pay' || method === 'px_pay');
    const isSv = mObj ? (mObj.type === 'stored_value' || mObj.id === 'stored_value') : method === 'stored_value';

    if (isCc) {
      const userCard = creditCards.find(c => c.user_id === paidBy) || creditCards[0];
      if (userCard) setSelectedAccountId(userCard.id);
    } else if (isSv) {
      const userCard = storedValueCards.find(c => c.user_id === paidBy) || storedValueCards[0];
      if (userCard) setSelectedAccountId(userCard.id);
    } else {
      setSelectedAccountId('');
    }
  };

  const today = React.useMemo(() => new Date(), []);
  const yesterday = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  }, []);
  const dayBeforeYesterday = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    return d;
  }, []);

  const isSameDay = (d1: Date, d2: Date) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  const origDate = transaction?.transacted_at ? new Date(transaction.transacted_at) : new Date();
  const origDateFormatted = `${origDate.getMonth() + 1}/${origDate.getDate()}`;

  const curDate = transactedAt ? new Date(transactedAt) : origDate;
  const isOriginal = isSameDay(curDate, origDate);
  const isToday = isSameDay(curDate, today);
  const isYesterday = isSameDay(curDate, yesterday);
  const isDayBeforeYesterday = isSameDay(curDate, dayBeforeYesterday);
  const isCustomDate = !isOriginal && !isToday && !isYesterday && !isDayBeforeYesterday;

  const setQuickDate = (targetDate: Date) => {
    const orig = transaction?.transacted_at ? new Date(transaction.transacted_at) : new Date();
    const d = new Date(targetDate);
    d.setHours(orig.getHours(), orig.getMinutes(), orig.getSeconds(), orig.getMilliseconds());
    setTransactedAt(d.toISOString());
  };

  const handleSelectDate = (newDate: Date) => {
    const orig = transaction?.transacted_at ? new Date(transaction.transacted_at) : new Date();
    const d = new Date(newDate);
    d.setHours(orig.getHours(), orig.getMinutes(), orig.getSeconds(), orig.getMilliseconds());
    setTransactedAt(d.toISOString());
  };

  const handleSubmit = async () => {
    if (!transaction) return;

    if (!canEdit) {
      const msg = `權限不足：此筆記帳由「${txPayerName}」付款，僅付款人或帳本管理者有權修改。`;
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('權限不足', msg);
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert('請輸入有效金額');
      return;
    }

    const currentCats = categories.filter(c => c.type === type);
    const targetCategory = currentCats.find(c => c.id === selectedCategoryId) || currentCats[0];
    const canonicalPayer = getMemberById(transaction.paid_by);
    const targetPayer = paidBy || canonicalPayer?.id || currentUser.id || members[0]?.id;

    if (!targetCategory) {
      alert('請先選擇記帳分類');
      return;
    }

    try {
      const success = await updateTransaction(transaction.id, {
        amount: numAmount,
        type,
        category_id: targetCategory.id,
        paid_by: targetPayer,
        merchant: merchant.trim() || undefined,
        payment_method: paymentMethod,
        account_id: selectedAccountId || undefined,
        note,
        transacted_at: transactedAt || transaction.transacted_at,
      });

      if (success) {
        onClose();
      } else {
        alert('更新失敗，請檢查網路連線');
      }
    } catch (err: any) {
      alert(err.message || '更新記帳時發生錯誤');
    }
  };

  const handleDelete = () => {
    if (!transaction) return;

    if (!canEdit) {
      const msg = `權限不足：此筆記帳由「${txPayerName}」付款，僅付款人或帳本管理者有權刪除。`;
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('權限不足', msg);
      return;
    }

    if (Platform.OS === 'web') {
      if (window.confirm('確定要刪除這筆記帳紀錄嗎？')) {
        deleteTransaction(transaction.id);
        onClose();
      }
    } else {
      Alert.alert('刪除記帳', '確定要刪除這筆記帳紀錄嗎？', [
        { text: '取消', style: 'cancel' },
        {
          text: '刪除',
          style: 'destructive',
          onPress: () => {
            deleteTransaction(transaction.id);
            onClose();
          },
        },
      ]);
    }
  };

  if (!transaction) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          {/* 頂部把手與標題 */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title} maxFontSizeMultiplier={1.15}>
                {canEdit ? '✏️ 編輯記帳明細' : '👀 查看記帳明細'}
              </Text>
              <Text style={styles.headerDateBadge} maxFontSizeMultiplier={1.15}>
                記帳日期：{curDate.getMonth() + 1}/{curDate.getDate()}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText} maxFontSizeMultiplier={1.15}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scrollViewRef}
            showsVerticalScrollIndicator={false}
            style={styles.scrollArea}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: dynamicBottomPadding },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {/* 類型切換 (支出 / 收入) */}
            <View style={[styles.typeToggle, !canEdit && styles.disabledContainer]}>
              <TouchableOpacity
                disabled={!canEdit}
                style={[styles.typeBtn, type === 'expense' && styles.typeBtnActive]}
                onPress={() => handleTypeChange('expense')}
              >
                <Text
                  style={[styles.typeText, type === 'expense' && styles.typeTextActive]}
                  maxFontSizeMultiplier={1.15}
                >
                  支出
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={!canEdit}
                style={[styles.typeBtn, type === 'income' && styles.typeBtnActiveIncome]}
                onPress={() => handleTypeChange('income')}
              >
                <Text
                  style={[styles.typeText, type === 'income' && styles.typeTextActive]}
                  maxFontSizeMultiplier={1.15}
                >
                  收入
                </Text>
              </TouchableOpacity>
            </View>

            {/* 金額輸入 */}
            <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>金額 (TWD)</Text>
            <View style={[styles.amountContainer, !canEdit && styles.readOnlyAmountContainer]}>
              <Text style={[styles.currencySymbol, !canEdit && styles.readOnlyTextMuted]} maxFontSizeMultiplier={1.15}>$</Text>
              <TextInput
                style={[styles.amountInput, !canEdit && styles.readOnlyAmountInput]}
                placeholder="0"
                placeholderTextColor="#D1D5DB"
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
                editable={canEdit}
                autoFocus={false}
                maxFontSizeMultiplier={1.15}
                underlineColorAndroid="transparent"
              />
            </View>

            {/* 分類選擇 */}
            <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>分類</Text>
            <View style={styles.categoryGrid}>
              {availableCategories.map(cat => {
                const isSelected = selectedCategoryId === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    disabled={!canEdit}
                    style={[
                      styles.categoryChip,
                      isSelected && { backgroundColor: `${cat.color}25`, borderColor: cat.color },
                      !canEdit && !isSelected && styles.readOnlyUnselectedChip,
                    ]}
                    onPress={() => setSelectedCategoryId(cat.id)}
                  >
                    <Text style={styles.categoryChipIcon}>{getCategoryIcon(cat.icon)}</Text>
                    <Text
                      style={[
                        styles.categoryChipText,
                        isSelected && { color: cat.color, fontWeight: '700' },
                      ]}
                      maxFontSizeMultiplier={1.15}
                    >
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 付款人選擇 */}
            <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>付款成員</Text>
            <View style={styles.payerRow}>
              {members.map(member => {
                const isSelected = paidBy === member.id;
                const isMe =
                  member.id === currentUser.id ||
                  (!!currentUser.display_name && currentUser.display_name === member.display_name);
                return (
                  <TouchableOpacity
                    key={member.id}
                    disabled={!canEdit}
                    style={[
                      styles.payerChip,
                      isSelected && styles.payerChipActive,
                      !canEdit && !isSelected && styles.readOnlyUnselectedChip,
                    ]}
                    onPress={() => setPaidBy(member.id)}
                  >
                    <Text style={styles.payerAvatar}>{member.avatar_url}</Text>
                    <Text
                      style={[styles.payerName, isSelected && styles.payerNameActive]}
                      maxFontSizeMultiplier={1.15}
                    >
                      {member.display_name}
                      {isMe ? ' (我)' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 付款方式與卡片 */}
            <View style={styles.sectionLabelRow}>
              <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>付款方式</Text>
              <Text style={styles.dateHintText} maxFontSizeMultiplier={1.15}>
                {supportsCreditCard
                  ? '(可選信用卡便於對帳)'
                  : isStoredValue
                  ? '(連動悠遊卡扣餘額)'
                  : ''}
              </Text>
            </View>
            <View style={styles.methodRow}>
              {activePaymentMethods.map((opt) => {
                const isSelected = paymentMethod === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    disabled={!canEdit}
                    style={[
                      styles.methodChip,
                      isSelected && { borderColor: opt.color || '#4F46E5', backgroundColor: `${opt.color || '#4F46E5'}15` },
                      !canEdit && !isSelected && styles.readOnlyUnselectedChip,
                    ]}
                    onPress={() => handleMethodChange(opt.id as any)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.methodChipIcon}>{opt.icon}</Text>
                    <Text
                      style={[
                        styles.methodChipText,
                        isSelected && { color: opt.color || '#4F46E5', fontWeight: '700' },
                      ]}
                      maxFontSizeMultiplier={1.15}
                    >
                      {opt.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 子層：當選擇信用卡或支援信用卡的行動支付時，展開關聯信用卡列表 */}
            {supportsCreditCard && creditCards.length > 0 && (
              <View style={styles.subCardContainer}>
                <Text style={styles.subCardLabel} maxFontSizeMultiplier={1.15}>
                  💳 選擇卡片 (對帳核算使用)：
                </Text>
                <HorizontalScrollView showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardScroll}>
                  {creditCards.map(card => {
                    const isCardSelected = selectedAccountId === card.id;
                    const cardholder = getMemberById(card.user_id);
                    return (
                      <TouchableOpacity
                        key={card.id}
                        disabled={!canEdit}
                        style={[
                          styles.cardChip,
                          isCardSelected && { borderColor: card.color || '#3B82F6', backgroundColor: '#EFF6FF' },
                          !canEdit && !isCardSelected && styles.readOnlyUnselectedChip,
                        ]}
                        onPress={() => setSelectedAccountId(isCardSelected ? '' : card.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.cardChipIcon}>💳</Text>
                        <View>
                          <Text
                            style={[styles.cardChipName, isCardSelected && { color: card.color || '#1E40AF', fontWeight: '700' }]}
                            maxFontSizeMultiplier={1.15}
                          >
                            {card.name}{card.last_four_digits ? ` (*${card.last_four_digits})` : ''}
                          </Text>
                          <Text style={styles.cardChipSub} maxFontSizeMultiplier={1.15}>
                            {cardholder ? cardholder.display_name : '全家通用'} · 每月{card.billing_cycle_date || 15}日結帳
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </HorizontalScrollView>
              </View>
            )}

            {/* 子層：當選擇悠遊卡/儲值卡時，展開儲值卡列表 */}
            {isStoredValue && storedValueCards.length > 0 && (
              <View style={styles.subCardContainer}>
                <Text style={styles.subCardLabel} maxFontSizeMultiplier={1.15}>
                  🚌 選擇儲值卡 (將自動扣減餘額)：
                </Text>
                <HorizontalScrollView showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardScroll}>
                  {storedValueCards.map(card => {
                    const isCardSelected = selectedAccountId === card.id;
                    const cardholder = getMemberById(card.user_id);
                    return (
                      <TouchableOpacity
                        key={card.id}
                        disabled={!canEdit}
                        style={[
                          styles.cardChip,
                          isCardSelected && { borderColor: card.color || '#0284C7', backgroundColor: '#F0F9FF' },
                          !canEdit && !isCardSelected && styles.readOnlyUnselectedChip,
                        ]}
                        onPress={() => setSelectedAccountId(card.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.cardChipIcon}>{card.icon || '🚌'}</Text>
                        <View>
                          <Text
                            style={[styles.cardChipName, isCardSelected && { color: card.color || '#0284C7', fontWeight: '700' }]}
                            maxFontSizeMultiplier={1.15}
                          >
                            {card.name} (餘額: ${card.balance.toLocaleString()})
                          </Text>
                          <Text style={styles.cardChipSub} maxFontSizeMultiplier={1.15}>
                            持卡人：{cardholder ? cardholder.display_name : '全家通用'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </HorizontalScrollView>
              </View>
            )}

            {/* 記帳日期調整 */}
            <View style={styles.sectionLabelRow}>
              <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>記帳日期</Text>
              {!isOriginal && (
                <Text style={styles.dateHintText} maxFontSizeMultiplier={1.15}>
                  (已改為：{curDate.getFullYear()}/{curDate.getMonth() + 1}/{curDate.getDate()})
                </Text>
              )}
            </View>
            <View style={styles.dateRow}>
              <TouchableOpacity
                disabled={!canEdit}
                style={[styles.dateChip, isOriginal && styles.dateChipActive, !canEdit && !isOriginal && styles.readOnlyUnselectedChip]}
                onPress={() => setTransactedAt(transaction.transacted_at)}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.dateChipText, isOriginal && styles.dateChipTextActive]}
                  maxFontSizeMultiplier={1.15}
                >
                  📅 原日期 ({origDateFormatted})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={!canEdit}
                style={[styles.dateChip, isToday && !isOriginal && styles.dateChipActive, !canEdit && !(isToday && !isOriginal) && styles.readOnlyUnselectedChip]}
                onPress={() => setQuickDate(today)}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.dateChipText, isToday && !isOriginal && styles.dateChipTextActive]}
                  maxFontSizeMultiplier={1.15}
                >
                  今天 ({today.getMonth() + 1}/{today.getDate()})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={!canEdit}
                style={[styles.dateChip, isYesterday && !isOriginal && styles.dateChipActive, !canEdit && !(isYesterday && !isOriginal) && styles.readOnlyUnselectedChip]}
                onPress={() => setQuickDate(yesterday)}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.dateChipText, isYesterday && !isOriginal && styles.dateChipTextActive]}
                  maxFontSizeMultiplier={1.15}
                >
                  昨天 ({yesterday.getMonth() + 1}/{yesterday.getDate()})
                </Text>
              </TouchableOpacity>

              {/* 若選擇了其他自訂日期 */}
              {isCustomDate && (
                <TouchableOpacity
                  disabled={!canEdit}
                  style={[styles.dateChip, styles.dateChipActive, styles.dateChipCustom]}
                  onPress={() => canEdit && setDatePickerVisible(true)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[styles.dateChipText, styles.dateChipTextActive]}
                    maxFontSizeMultiplier={1.15}
                  >
                    🗓️ {curDate.getMonth() + 1}/{curDate.getDate()} (自訂)
                  </Text>
                </TouchableOpacity>
              )}

              {canEdit && (
                <TouchableOpacity
                  style={[styles.dateMoreBtn, isCustomDate && styles.dateMoreBtnSelected]}
                  onPress={() => setDatePickerVisible(true)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[styles.dateMoreBtnText, isCustomDate && styles.dateMoreBtnTextSelected]}
                    maxFontSizeMultiplier={1.15}
                  >
                    {isCustomDate ? '✏️ 改選' : '🗓️ 更多...'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* 店家 / 對象 (選填) */}
            <View style={styles.sectionLabelRow}>
              <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>店家 / 付款對象 (選填)</Text>
              {canEdit && !!merchant && (
                <TouchableOpacity onPress={() => setMerchant('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.clearMerchantText} maxFontSizeMultiplier={1.08}>清除</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={[styles.merchantInputWrapper, !canEdit && styles.readOnlyInputWrapper]}>
              <Text style={styles.merchantInputIcon}>🏪</Text>
              <TextInput
                style={[styles.merchantInput, !canEdit && styles.readOnlyTextInput]}
                placeholder={canEdit ? "例如：全聯、好市多、麥當勞、中油..." : "未填寫店家"}
                placeholderTextColor="#9CA3AF"
                value={merchant}
                onChangeText={setMerchant}
                editable={canEdit}
                onFocus={() => handleInputFocus()}
                returnKeyType="next"
                maxFontSizeMultiplier={1.15}
              />
              {canEdit && !!merchant && (
                <TouchableOpacity onPress={() => setMerchant('')} style={styles.merchantClearBtn}>
                  <Text style={styles.merchantClearBtnText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* 智慧自學習快捷膠囊標籤 (唯讀模式下不需顯示快捷推薦) */}
            {canEdit && suggestedMerchants.length > 0 && (
              <HorizontalScrollView
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.merchantChipsRow}
                keyboardShouldPersistTaps="handled"
              >
                {suggestedMerchants.map((item) => {
                  const isSelected = merchant.trim().toLowerCase() === item.toLowerCase();
                  return (
                    <TouchableOpacity
                      key={item}
                      style={[styles.merchantChip, isSelected && styles.merchantChipActive]}
                      onPress={() => setMerchant(isSelected ? '' : item)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[styles.merchantChipText, isSelected && styles.merchantChipTextActive]}
                        maxFontSizeMultiplier={1.08}
                      >
                        {isSelected ? `✓ ${item}` : item}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </HorizontalScrollView>
            )}

            {/* 備註說明 */}
            <View style={styles.sectionLabelRow}>
              <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>備註說明</Text>
              {canEdit && keyboardOffset > 0 && (
                <TouchableOpacity onPress={Keyboard.dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.dismissKeyboardText} maxFontSizeMultiplier={1.08}>收起鍵盤 ▾</Text>
                </TouchableOpacity>
              )}
            </View>
            <TextInput
              style={[styles.noteInput, !canEdit && styles.readOnlyNoteInput]}
              placeholder={canEdit ? "例如：好市多牛肉、加滿油、水電費..." : "無備註"}
              placeholderTextColor="#9CA3AF"
              value={note}
              onChangeText={setNote}
              editable={canEdit}
              onFocus={() => handleInputFocus()}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
              maxFontSizeMultiplier={1.15}
            />

            {/* 操作按鈕群 */}
            {canEdit ? (
              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
                  <Text style={styles.deleteBtnText} maxFontSizeMultiplier={1.15}>🗑️ 刪除紀錄</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
                  <Text style={styles.submitBtnText} maxFontSizeMultiplier={1.15}>儲存修改</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.readOnlyBtnRow}>
                <TouchableOpacity style={styles.readOnlyCloseBtn} onPress={onClose} activeOpacity={0.8}>
                  <Text style={styles.readOnlyCloseBtnText} maxFontSizeMultiplier={1.15}>關閉明細</Text>
                </TouchableOpacity>
                <Text style={styles.readOnlyFooterHint} maxFontSizeMultiplier={1.08}>
                  🔒 僅付款成員「{txPayerName}」本人或帳本管理者具有編輯與刪除此筆記帳的權限
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      <DatePickerModal
        visible={datePickerVisible}
        onClose={() => setDatePickerVisible(false)}
        selectedDate={curDate}
        onSelectDate={handleSelectDate}
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    width: '100%',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    paddingHorizontal: 16,
    maxHeight: Math.min(SCREEN_HEIGHT * 0.9, 740),
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    width: '100%',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  headerDateBadge: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '500',
  },
  closeBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
  },
  closeText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '700',
  },
  scrollArea: {
    width: '100%',
  },
  scrollContent: {
    width: '100%',
    paddingBottom: 20,
  },
  typeToggle: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 3,
    marginBottom: 10,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 8,
  },
  typeBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  typeBtnActiveIncome: {
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 1,
  },
  typeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  typeTextActive: {
    color: '#111827',
    fontWeight: '700',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 6,
    marginTop: 2,
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 12,
    minHeight: 48,
  },
  currencySymbol: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4F46E5',
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    minWidth: 0,
    height: 42,
    padding: 0,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 14,
  },
  categoryChipIcon: {
    fontSize: 13,
    marginRight: 4,
  },
  categoryChipText: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '500',
  },
  payerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  payerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 14,
  },
  payerChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  payerAvatar: {
    fontSize: 14,
    marginRight: 4,
  },
  payerName: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '500',
  },
  payerNameActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  dateHintText: {
    fontSize: 12,
    color: '#EA580C',
    fontWeight: '700',
    marginLeft: 6,
  },
  dateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  dateChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  dateChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  dateChipCustom: {
    backgroundColor: '#FFF7ED',
    borderColor: '#F97316',
  },
  dateChipText: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '500',
  },
  dateChipTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  dateMoreBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateMoreBtnSelected: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
    borderStyle: 'solid',
  },
  dateMoreBtnText: {
    fontSize: 12,
    color: '#4F46E5',
    fontWeight: '600',
  },
  dateMoreBtnTextSelected: {
    fontWeight: '700',
  },
  clearMerchantText: {
    fontSize: 12,
    color: '#6366F1',
    fontWeight: '500',
  },
  dismissKeyboardText: {
    fontSize: 12,
    color: '#4F46E5',
    fontWeight: '600',
    marginLeft: 'auto',
  },
  merchantInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 10,
    marginBottom: 8,
    minHeight: 38,
  },
  merchantInputIcon: {
    fontSize: 15,
    marginRight: 6,
  },
  merchantInput: {
    flex: 1,
    fontSize: 13,
    color: '#111827',
    paddingVertical: 7,
  },
  merchantClearBtn: {
    padding: 4,
  },
  merchantClearBtnText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  merchantChipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 10,
    paddingHorizontal: 1,
  },
  merchantChip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  merchantChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  merchantChipText: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '500',
  },
  merchantChipTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  noteInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    color: '#111827',
    marginBottom: 14,
    width: '100%',
    minHeight: 38,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  deleteBtn: {
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  deleteBtnText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '700',
  },
  submitBtn: {
    flex: 1,
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  manageMethodsSmallBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: '#E5E7EB',
  },
  manageMethodsSmallBtnText: {
    fontSize: 11,
    color: '#4B5563',
    fontWeight: '600',
  },
  methodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  methodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 4,
  },
  methodChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  methodChipIcon: {
    fontSize: 13,
  },
  methodChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#4B5563',
  },
  methodChipTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  subCardContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  subCardLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 8,
  },
  cardScroll: {
    flexDirection: 'row',
    gap: 8,
  },
  cardChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    gap: 6,
  },
  cardChipIcon: {
    fontSize: 16,
  },
  cardChipName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
  },
  cardChipSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  disabledContainer: {
    opacity: 0.85,
  },
  readOnlyUnselectedChip: {
    opacity: 0.45,
  },
  readOnlyAmountContainer: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  readOnlyAmountInput: {
    color: '#334155',
  },
  readOnlyTextMuted: {
    color: '#64748B',
  },
  readOnlyInputWrapper: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  readOnlyTextInput: {
    color: '#334155',
  },
  readOnlyNoteInput: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    color: '#334155',
  },
  readOnlyBtnRow: {
    marginTop: 20,
    alignItems: 'center',
  },
  readOnlyCloseBtn: {
    width: '100%',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  readOnlyCloseBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  readOnlyFooterHint: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 8,
    textAlign: 'center',
  },
});
