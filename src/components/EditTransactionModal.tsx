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
import {
  PAYMENT_METHOD_OPTIONS,
  DEFAULT_PAYMENT_METHODS,
  sortAccountsByUser,
  filterAccountsForUser,
  DISCOUNT_PRESET_LABELS,
  getRecommendedDiscountLabel,
  parseExpenseDiscount,
  formatExpenseNoteWithDiscount,
  getSmartDiscountLabels,
} from '../lib/payment';
import { getCategoryIcon } from '../lib/icons';
import {
  getMergedMemoTags,
  toggleMemoTag,
  isMemoTagActive,
  BUILTIN_MEMO_TEMPLATES,
  MemoChecklistTemplate,
  applyChecklistTemplate,
  insertChecklistCheckbox,
  handleChecklistInput,
} from '../lib/memo';
import {
  CalendarSystem,
  MemoRepeatFrequency,
  REPEAT_OPTIONS,
  solarToLunar,
  getNearestLunarPairDate,
  getNextMemoReminderDate,
  formatMemoReminderBadge,
} from '../lib/lunar';
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
  income: ['公司薪資', '年終獎金', '股票股利', '銀行利息', '現金回饋折抵', '小樹點折抵', '好市多好多金', '副業兼職'],
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
  onLinkExpense?: (memoTx: Transaction) => void;
  onOpenLinkedExpense?: (tx: Transaction) => void;
}

export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({
  visible,
  transaction,
  onClose,
  onLinkExpense,
  onOpenLinkedExpense,
}) => {
  const {
    categories,
    members,
    transactions,
    currentUser,
    currentLedger,
    isReadOnly,
    isOwner,
    updateTransaction,
    deleteTransaction,
    getMemberById,
    getCategoryById,
    recentMerchants,
    paymentAccounts,
    paymentMethods,
    recentMemoTags,
    recordMemoTag,
    removeRecentMemoTag,
    isAdminMode,
  } = useLedger();

  const inAdminMode = Boolean(isAdminMode || isOwner);

  const smartDiscountLabels = React.useMemo(
    () => getSmartDiscountLabels(transactions),
    [transactions]
  );

  const displayedMemoTags = React.useMemo(() => {
    return getMergedMemoTags(recentMemoTags);
  }, [recentMemoTags]);

  const handleLongPressMemoTag = React.useCallback((tag: string) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`是否將「${tag}」從快捷標籤中移除？`)) {
        removeRecentMemoTag(tag);
      }
    } else {
      Alert.alert(
        '移除快捷標籤',
        `確定要將「${tag}」從常用標籤中移除嗎？`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '確定移除',
            style: 'destructive',
            onPress: () => removeRecentMemoTag(tag),
          },
        ]
      );
    }
  }, [removeRecentMemoTag]);

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

  const handleSelectTemplate = React.useCallback((template: MemoChecklistTemplate) => {
    if (!note || !note.trim()) {
      setNote(applyChecklistTemplate(template));
      return;
    }

    if (Platform.OS === 'web') {
      const choice = typeof window !== 'undefined' && window.confirm(`是否以「${template.title}」範本替換當前內容？\n\n【確定】：替換現有內容\n【取消】：接續在目前內容下方`);
      if (choice) {
        setNote(applyChecklistTemplate(template, undefined, false));
      } else {
        setNote(applyChecklistTemplate(template, note, true));
      }
      return;
    }

    Alert.alert(
      `帶入「${template.title}」範本`,
      '請問您希望替換當前已輸入的內容，還是接續在目前內容下方？',
      [
        {
          text: '接在下方',
          onPress: () => setNote(applyChecklistTemplate(template, note, true)),
        },
        {
          text: '替換內容',
          style: 'destructive',
          onPress: () => setNote(applyChecklistTemplate(template, undefined, false)),
        },
        { text: '取消', style: 'cancel' },
      ]
    );
  }, [note]);
  const [memoReminderDate, setMemoReminderDate] = useState<string>(() => transaction?.reminder_date || '');
  const [memoReminderCalendar, setMemoReminderCalendar] = useState<CalendarSystem>(
    () => transaction?.reminder_calendar || 'solar'
  );
  const [memoReminderRepeat, setMemoReminderRepeat] = useState<MemoRepeatFrequency>(
    () => transaction?.reminder_repeat || 'once'
  );
  const [reminderPickerInitialMode, setReminderPickerInitialMode] = useState<CalendarSystem>(
    () => transaction?.reminder_calendar || 'solar'
  );
  const [isSettled, setIsSettled] = useState<boolean>(() => !!transaction?.is_settled);
  const [completionNote, setCompletionNote] = useState<string>(() => transaction?.completion_note || '');
  const [linkedTxId, setLinkedTxId] = useState<string>(() => transaction?.linked_transaction_id || '');
  const [transactedAt, setTransactedAt] = useState<string>(() => transaction?.transacted_at || new Date().toISOString());
  const [hourStr, setHourStr] = useState<string>(() => {
    const d = transaction?.transacted_at ? new Date(transaction.transacted_at) : new Date();
    return isNaN(d.getTime()) ? '00' : String(d.getHours()).padStart(2, '0');
  });
  const [minuteStr, setMinuteStr] = useState<string>(() => {
    const d = transaction?.transacted_at ? new Date(transaction.transacted_at) : new Date();
    return isNaN(d.getTime()) ? '00' : String(d.getMinutes()).padStart(2, '0');
  });
  const [datePickerVisible, setDatePickerVisible] = useState<boolean>(false);
  const [reminderDatePickerVisible, setReminderDatePickerVisible] = useState<boolean>(false);
  const [keyboardOffset, setKeyboardOffset] = useState<number>(0);
  const scrollViewRef = useRef<ScrollView>(null);

  // 🎁 點數 / 回饋折抵專用狀態（算在原先支出交易的一環）
  const [showDiscountPanel, setShowDiscountPanel] = useState<boolean>(false);
  const [discountAmount, setDiscountAmount] = useState<string>('');
  const [discountLabel, setDiscountLabel] = useState<string>('LINE Points');
  const [discountLabelTouched, setDiscountLabelTouched] = useState<boolean>(false);
  const [discountCalcMode, setDiscountCalcMode] = useState<'subtract' | 'already_net'>('already_net');
  const activeInputScrollYRef = useRef<number | null>(null);

  // 監聽鍵盤高度 (Android, iOS 與 Mobile Web)
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      const h = e?.endCoordinates?.height || 280;
      setKeyboardOffset(h);
      if (activeInputScrollYRef.current !== null) {
        const target = activeInputScrollYRef.current;
        setTimeout(() => {
          scrollViewRef.current?.scrollTo({ y: target, animated: true });
        }, 60);
      }
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardOffset(0);
      activeInputScrollYRef.current = null;
    });

    let removeViewportListener: (() => void | undefined) | undefined;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.visualViewport) {
      const handleViewportResize = () => {
        if (!window.visualViewport) return;
        const windowHeight = window.innerHeight;
        const viewportHeight = window.visualViewport.height;
        const diff = windowHeight - viewportHeight;
        if (diff > 120) {
          setKeyboardOffset(diff);
          if (activeInputScrollYRef.current !== null) {
            const target = activeInputScrollYRef.current;
            setTimeout(() => {
              scrollViewRef.current?.scrollTo({ y: target, animated: true });
            }, 60);
          }
        } else {
          setKeyboardOffset(0);
          activeInputScrollYRef.current = null;
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

  // 各輸入框於 ScrollView 內之 Y 座標（精準平滑滾動，避免強行 scrollToEnd）
  const [discountSectionY, setDiscountSectionY] = useState<number>(0);
  const [completionNoteSectionY, setCompletionNoteSectionY] = useState<number>(0);
  const [memoSectionY, setMemoSectionY] = useState<number>(0);
  const [merchantSectionY, setMerchantSectionY] = useState<number>(0);
  const [noteSectionY, setNoteSectionY] = useState<number>(0);

  // 點選輸入框時，平滑滑動至該輸入框所在位置，避免強行 scrollToEnd 導致上方輸入框被頂出可見範圍
  const scrollToInput = (targetY: number, defaultY = 0, delay = 80) => {
    const scrollY = Math.max(0, (targetY > 0 ? targetY : defaultY) - 15);
    activeInputScrollYRef.current = scrollY;
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: scrollY, animated: true });
    }, delay);
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: scrollY, animated: true });
    }, 260);
  };

  const dynamicBottomPadding = keyboardOffset > 0
    ? (keyboardOffset + 60)
    : 30;

  const availableCategories = categories.filter(c => c.type === (type === 'transfer' ? 'expense' : type));
  const targetPayerId = paidBy || currentUser?.id;
  const creditCards = React.useMemo(
    () => filterAccountsForUser(paymentAccounts, {
      type: 'credit_card',
      currentUser,
      inAdminMode,
      selectedAccountId,
      getMemberById,
      targetPayerId,
    }),
    [paymentAccounts, currentUser, inAdminMode, selectedAccountId, getMemberById, targetPayerId]
  );
  const storedValueCards = React.useMemo(
    () => filterAccountsForUser(paymentAccounts, {
      type: 'stored_value',
      currentUser,
      inAdminMode,
      selectedAccountId,
      getMemberById,
      targetPayerId,
    }),
    [paymentAccounts, currentUser, inAdminMode, selectedAccountId, getMemberById, targetPayerId]
  );
  const bankAccounts = React.useMemo(
    () => filterAccountsForUser(paymentAccounts, {
      type: 'bank',
      currentUser,
      inAdminMode,
      selectedAccountId,
      getMemberById,
      targetPayerId,
    }),
    [paymentAccounts, currentUser, inAdminMode, selectedAccountId, getMemberById, targetPayerId]
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

  const isBankTransfer = currentMethodObj
    ? (currentMethodObj.type === 'bank' || currentMethodObj.id === 'transfer')
    : paymentMethod === 'transfer';

  // 該筆交易的付款人資料與權限判定（僅付款人為本機使用成員才有權限修改或刪除）
  const txPayerProfile = React.useMemo(() => {
    return transaction?.paid_by ? getMemberById(transaction.paid_by) : undefined;
  }, [transaction?.paid_by, getMemberById]);

  const txPayerName = txPayerProfile?.display_name || transaction?.payer_profile?.display_name || '付款成員';

  const canEdit = React.useMemo(() => {
    if (isReadOnly || currentLedger?.is_read_only) return false;
    if (!transaction || !currentUser?.id) return false;
    // 帳本管理者（在管理員模式下）擁有全域編輯與刪除權限
    if (isOwner) return true;
    const payerId = txPayerProfile ? txPayerProfile.id : transaction.paid_by;
    const isPayerIdMatch = payerId === currentUser.id;
    const isPayerNameMatch = !!txPayerProfile?.display_name && !!currentUser.display_name && txPayerProfile.display_name === currentUser.display_name;
    return Boolean(isPayerIdMatch || isPayerNameMatch);
  }, [transaction, currentUser, txPayerProfile, isOwner, isReadOnly, currentLedger?.is_read_only]);

  // 生活記事允許任何已登入家庭成員回報辦妥說明與操作連動
  const canEditCompletion = React.useMemo(() => {
    if (isReadOnly || currentLedger?.is_read_only) return false;
    if (!transaction || !currentUser?.id) return false;
    if (canEdit) return true;
    if (transaction.type === 'memo') return true;
    return false;
  }, [transaction, currentUser, canEdit, isReadOnly, currentLedger?.is_read_only]);

  // 取得生活記事關聯之支出項目
  const linkedExpense = React.useMemo(() => {
    if (!linkedTxId) return undefined;
    return transactions.find(t => t.id === linkedTxId && t.type !== 'memo');
  }, [linkedTxId, transactions]);

  // 取得支出項目關聯之生活記事項目
  const linkedMemoTx = React.useMemo(() => {
    if (!transaction?.linked_transaction_id) return undefined;
    return transactions.find(t => t.id === transaction.linked_transaction_id && t.type === 'memo');
  }, [transaction?.linked_transaction_id, transactions]);

  // 智慧店家快捷建議標籤列表 (結合自學習 recentMerchants + 分類推薦 + 關鍵字即時比對)
  const suggestedMerchants = React.useMemo(() => {
    const currentCats = categories.filter(c => c.type === (type === 'transfer' ? 'expense' : type));
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
      if (transaction.type === 'memo') {
        setAmount('');
        setNote(transaction.note || '');
        setShowDiscountPanel(false);
        setDiscountAmount('');
      } else {
        const parsedDisc = parseExpenseDiscount(transaction.note);
        setAmount(
          transaction.amount
            ? String(transaction.amount)
            : parsedDisc.hasDiscount
            ? '0'
            : ''
        );
        setNote(parsedDisc.cleanNote);
        if (parsedDisc.hasDiscount) {
          setShowDiscountPanel(true);
          setDiscountAmount(String(parsedDisc.discountAmount));
          setDiscountLabel(parsedDisc.discountLabel);
          setDiscountLabelTouched(true);
          setDiscountCalcMode('already_net');
        } else {
          setShowDiscountPanel(false);
          setDiscountAmount('');
          setDiscountLabel(getRecommendedDiscountLabel(transaction.payment_method));
          setDiscountLabelTouched(false);
          setDiscountCalcMode('subtract');
        }
      }
      setMemoReminderDate(transaction.reminder_date || '');
      setMemoReminderCalendar(transaction.reminder_calendar || 'solar');
      setMemoReminderRepeat(transaction.reminder_repeat || 'once');
      setReminderPickerInitialMode(transaction.reminder_calendar || 'solar');
      setIsSettled(!!transaction.is_settled);
      setCompletionNote(transaction.completion_note || '');
      setLinkedTxId(transaction.linked_transaction_id || '');
      setReminderDatePickerVisible(false);
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
    if (!discountLabelTouched) {
      setDiscountLabel(getRecommendedDiscountLabel(method, mObj?.name));
    }
    const isCc = mObj ? !!mObj.supports_credit_card : (method === 'credit_card' || method === 'line_pay' || method === 'px_pay');
    const isSv = mObj ? (mObj.type === 'stored_value' || mObj.id === 'stored_value') : method === 'stored_value';
    const isBank = mObj ? (mObj.type === 'bank' || mObj.id === 'transfer') : method === 'transfer';

    if (isCc) {
      const userCard = creditCards.find(c => c.user_id === paidBy) || creditCards[0];
      if (userCard) setSelectedAccountId(userCard.id);
    } else if (isSv) {
      const userCard = storedValueCards.find(c => c.user_id === paidBy) || storedValueCards[0];
      if (userCard) setSelectedAccountId(userCard.id);
    } else if (isBank) {
      const userBank = bankAccounts.find(a => a.user_id === paidBy) || bankAccounts[0];
      if (userBank) setSelectedAccountId(userBank.id);
    } else {
      setSelectedAccountId('');
    }
  };

  const today = React.useMemo(() => new Date(), []);
  const tomorrow = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  }, []);
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

  const formatYmd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const todayYmd = React.useMemo(() => formatYmd(new Date()), []);
  const tomorrowYmd = React.useMemo(() => formatYmd(tomorrow), [tomorrow]);

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
  const isCustomReminder = !!memoReminderDate && memoReminderDate !== todayYmd && memoReminderDate !== tomorrowYmd;

  const curDateFormattedWithTime = React.useMemo(() => {
    if (isNaN(curDate.getTime())) return '';
    const yyyy = curDate.getFullYear();
    const mm = String(curDate.getMonth() + 1).padStart(2, '0');
    const dd = String(curDate.getDate()).padStart(2, '0');
    const hh = String(curDate.getHours()).padStart(2, '0');
    const min = String(curDate.getMinutes()).padStart(2, '0');
    return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
  }, [curDate]);

  // 當使用者輸入小時
  const handleHourChange = (text: string) => {
    const clean = text.replace(/[^0-9]/g, '').slice(0, 2);
    setHourStr(clean);
    if (clean.length > 0) {
      const h = Math.min(23, Math.max(0, parseInt(clean, 10)));
      const cur = new Date(transactedAt || transaction?.transacted_at || new Date());
      cur.setHours(h);
      setTransactedAt(cur.toISOString());
    }
  };

  const handleHourBlur = () => {
    let h = parseInt(hourStr, 10);
    if (isNaN(h) || h < 0) h = 0;
    if (h > 23) h = 23;
    const formatted = String(h).padStart(2, '0');
    setHourStr(formatted);
    const cur = new Date(transactedAt || transaction?.transacted_at || new Date());
    cur.setHours(h);
    setTransactedAt(cur.toISOString());
  };

  // 當使用者輸入分鐘
  const handleMinuteChange = (text: string) => {
    const clean = text.replace(/[^0-9]/g, '').slice(0, 2);
    setMinuteStr(clean);
    if (clean.length > 0) {
      const m = Math.min(59, Math.max(0, parseInt(clean, 10)));
      const cur = new Date(transactedAt || transaction?.transacted_at || new Date());
      cur.setMinutes(m);
      setTransactedAt(cur.toISOString());
    }
  };

  const handleMinuteBlur = () => {
    let m = parseInt(minuteStr, 10);
    if (isNaN(m) || m < 0) m = 0;
    if (m > 59) m = 59;
    const formatted = String(m).padStart(2, '0');
    setMinuteStr(formatted);
    const cur = new Date(transactedAt || transaction?.transacted_at || new Date());
    cur.setMinutes(m);
    setTransactedAt(cur.toISOString());
  };

  // 設為現在時間
  const handleSetCurrentTime = () => {
    const now = new Date();
    const cur = new Date(transactedAt || transaction?.transacted_at || new Date());
    cur.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    setTransactedAt(cur.toISOString());
    setHourStr(String(now.getHours()).padStart(2, '0'));
    setMinuteStr(String(now.getMinutes()).padStart(2, '0'));
  };

  const setQuickDate = (targetDate: Date) => {
    const cur = new Date(transactedAt || transaction?.transacted_at || new Date());
    const d = new Date(targetDate);
    let h = parseInt(hourStr, 10);
    let m = parseInt(minuteStr, 10);
    if (isNaN(h)) h = cur.getHours();
    if (isNaN(m)) m = cur.getMinutes();
    d.setHours(h, m, 0, 0);
    setTransactedAt(d.toISOString());
  };

  const handleSelectDate = (newDate: Date) => {
    const cur = new Date(transactedAt || transaction?.transacted_at || new Date());
    const d = new Date(newDate);
    let h = parseInt(hourStr, 10);
    let m = parseInt(minuteStr, 10);
    if (isNaN(h)) h = cur.getHours();
    if (isNaN(m)) m = cur.getMinutes();
    d.setHours(h, m, 0, 0);
    setTransactedAt(d.toISOString());
  };

  const renderTimeInputRow = () => (
    <View style={styles.timeInputRow}>
      <View style={styles.timeLabelContainer}>
        <Text style={styles.timeLabelIcon}>🕒</Text>
        <Text style={styles.timeLabelText} maxFontSizeMultiplier={1.12}>發生時間：</Text>
      </View>
      <View style={styles.timeInputsWrapper}>
        <TextInput
          editable={canEdit}
          style={[styles.timeDigitInput, !canEdit && styles.readOnlyTextInput]}
          value={hourStr}
          onChangeText={handleHourChange}
          onBlur={handleHourBlur}
          keyboardType="number-pad"
          maxLength={2}
          placeholder="HH"
          placeholderTextColor="#9CA3AF"
          selectTextOnFocus
        />
        <Text style={styles.timeColonText}>:</Text>
        <TextInput
          editable={canEdit}
          style={[styles.timeDigitInput, !canEdit && styles.readOnlyTextInput]}
          value={minuteStr}
          onChangeText={handleMinuteChange}
          onBlur={handleMinuteBlur}
          keyboardType="number-pad"
          maxLength={2}
          placeholder="mm"
          placeholderTextColor="#9CA3AF"
          selectTextOnFocus
        />
        {canEdit && (
          <TouchableOpacity
            style={styles.timeNowBtn}
            onPress={handleSetCurrentTime}
            activeOpacity={0.7}
          >
            <Text style={styles.timeNowBtnText} maxFontSizeMultiplier={1.08}>設為現在</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const handleLinkExpensePress = async () => {
    if (!transaction) return;
    const noteToSave = completionNote.trim();
    const effectiveCompleter = isSettled
      ? (transaction.completed_by || currentUser?.id)
      : (currentUser?.id);

    // 立即自動保存使用者剛剛輸入的辦妥說明與狀態，絕不丟失任何輸入內容！
    try {
      if (canEdit) {
        await updateTransaction(transaction.id, {
          note: note.trim() || transaction.note,
          reminder_date: memoReminderDate || undefined,
          reminder_calendar: memoReminderDate ? memoReminderCalendar : undefined,
          reminder_repeat: memoReminderDate ? memoReminderRepeat : undefined,
          is_settled: true,
          completed_by: effectiveCompleter,
          completion_note: noteToSave || undefined,
        });
      } else if (canEditCompletion) {
        await updateTransaction(transaction.id, {
          is_settled: true,
          completed_by: effectiveCompleter,
          completion_note: noteToSave || undefined,
        });
      }
    } catch (err) {
      console.warn('Auto-save memo before linking expense failed:', err);
    }

    onLinkExpense?.({
      ...transaction,
      note: note.trim() || transaction.note,
      is_settled: true,
      completed_by: effectiveCompleter,
      completion_note: noteToSave || transaction.completion_note,
    });
  };

  const handleSubmit = async () => {
    if (!transaction) return;

    if (!canEdit) {
      if (transaction.type === 'memo' && canEditCompletion) {
        try {
          const effectiveCompleter = isSettled
            ? (transaction.completed_by || currentUser?.id)
            : undefined;
          const success = await updateTransaction(transaction.id, {
            is_settled: isSettled,
            completed_by: effectiveCompleter,
            completion_note: completionNote.trim() || undefined,
            linked_transaction_id: linkedTxId || undefined,
          });

          if (success) {
            onClose();
          } else {
            alert('更新失敗，請檢查網路連線');
          }
        } catch (err: any) {
          alert(err.message || '更新回報時發生錯誤');
        }
        return;
      }

      const msg = `權限不足：此筆紀錄由「${txPayerName}」記錄，僅本人或帳本管理者有權修改。`;
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('權限不足', msg);
      return;
    }

    if (transaction.type === 'memo') {
      if (!note.trim()) {
        alert('請輸入記事內容');
        return;
      }
      const canonicalPayer = getMemberById(transaction.paid_by);
      const targetPayer = paidBy || canonicalPayer?.id || currentUser.id || members[0]?.id;
      try {
        const success = await updateTransaction(transaction.id, {
          amount: 0,
          type: 'memo',
          category_id: transaction.category_id || categories[0]?.id,
          paid_by: targetPayer,
          note: note.trim(),
          reminder_date: memoReminderDate || undefined,
          reminder_calendar: memoReminderDate ? memoReminderCalendar : undefined,
          reminder_repeat: memoReminderDate ? memoReminderRepeat : undefined,
          transacted_at: transactedAt || transaction.transacted_at,
          is_settled: isSettled,
          completed_by: isSettled ? (transaction.completed_by || currentUser?.id) : undefined,
          completion_note: completionNote.trim() || undefined,
          linked_transaction_id: linkedTxId || undefined,
        });

        if (success) {
          onClose();
        } else {
          alert('更新失敗，請檢查網路連線');
        }
      } catch (err: any) {
        alert(err.message || '更新記事時發生錯誤');
      }
      return;
    }

    const parsedDiscount =
      type === 'expense' && showDiscountPanel ? parseFloat(discountAmount) || 0 : 0;
    const rawNum = parseFloat(amount);
    const numAmount = isNaN(rawNum) ? 0 : rawNum;

    if (parsedDiscount <= 0 && numAmount <= 0) {
      alert('請輸入有效金額');
      return;
    }

    if (parsedDiscount > 0 && numAmount < 0) {
      alert('金額不可為負數');
      return;
    }

    if (parsedDiscount > 0 && discountCalcMode === 'subtract' && numAmount > 0 && parsedDiscount > numAmount) {
      const msg = '折抵金額不可大於商品原價（若上方已填折抵後的實付金額，請切換為「✅ 上方已填實付」）。';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('折抵金額超出原價', msg);
      return;
    }

    const finalAmount =
      parsedDiscount > 0
        ? discountCalcMode === 'subtract'
          ? numAmount > 0
            ? Math.max(0, Math.round((numAmount - parsedDiscount) * 100) / 100)
            : 0
          : numAmount
        : numAmount;

    const finalOriginalAmount =
      parsedDiscount > 0
        ? discountCalcMode === 'subtract'
          ? numAmount > 0
            ? numAmount
            : parsedDiscount
          : Math.round((numAmount + parsedDiscount) * 100) / 100
        : undefined;

    const finalNote =
      type === 'expense' && parsedDiscount > 0
        ? formatExpenseNoteWithDiscount(
            note,
            parsedDiscount,
            discountLabel.trim() || '點數/回饋',
            finalOriginalAmount
          )
        : note.trim();

    const currentCats = categories.filter(c => c.type === (type === 'transfer' ? 'expense' : type));
    const targetCategory = currentCats.find(c => c.id === selectedCategoryId) || currentCats[0] || categories[0];
    const canonicalPayer = getMemberById(transaction.paid_by);
    const targetPayer = paidBy || canonicalPayer?.id || currentUser.id || members[0]?.id;

    if (!targetCategory) {
      alert('請先選擇記帳分類');
      return;
    }

    try {
      const success = await updateTransaction(transaction.id, {
        amount: finalAmount,
        type,
        category_id: targetCategory.id,
        paid_by: targetPayer,
        merchant: merchant.trim() || undefined,
        payment_method: paymentMethod,
        account_id: selectedAccountId || undefined,
        note: finalNote,
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
      const msg = `權限不足：此筆紀錄由「${txPayerName}」記錄，僅本人或帳本管理者有權刪除。`;
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('權限不足', msg);
      return;
    }

    const title = transaction.type === 'memo' ? '刪除生活備忘' : '刪除記帳';
    const message = transaction.type === 'memo' ? '確定要刪除這筆生活記事備忘嗎？' : '確定要刪除這筆記帳紀錄嗎？';

    if (Platform.OS === 'web') {
      if (window.confirm(message)) {
        deleteTransaction(transaction.id);
        onClose();
      }
    } else {
      Alert.alert(title, message, [
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
                {canEdit
                  ? (transaction.type === 'memo' ? '📝 編輯生活備忘' : transaction.type === 'transfer' ? '⇄ 編輯內部轉帳' : '✏️ 編輯記帳明細')
                  : (transaction.type === 'memo' ? '👀 查看生活備忘' : transaction.type === 'transfer' ? '👀 查看內部轉帳' : '👀 查看記帳明細')}
              </Text>
              <Text style={styles.headerDateBadge} maxFontSizeMultiplier={1.15}>
                發生時間：{curDateFormattedWithTime}
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
            {(isReadOnly || currentLedger?.is_read_only) && (
              <View style={{
                backgroundColor: '#EFF6FF',
                borderColor: '#BFDBFE',
                borderWidth: 1,
                borderRadius: 12,
                padding: 12,
                marginBottom: 16,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}>
                <Text style={{ fontSize: 20 }}>🔒</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: '#1E40AF', fontWeight: '800' }}>
                    唯讀封存保護中
                  </Text>
                  <Text style={{ fontSize: 11, color: '#3B82F6', marginTop: 2, lineHeight: 16 }}>
                    此帳本已開啟唯讀模式，所有歷史明細僅供查詢與統計，無法修改或刪除。
                  </Text>
                </View>
              </View>
            )}
            {transaction.type === 'memo' ? (
              <>
                {/* 生活備忘橫幅 */}
                <View style={styles.memoBanner}>
                  <Text style={styles.memoBannerIcon}>📌</Text>
                  <View style={styles.memoBannerContent}>
                    <Text style={styles.memoBannerTitle} maxFontSizeMultiplier={1.15}>家庭生活手帳與備忘</Text>
                    <Text style={styles.memoBannerDesc} maxFontSizeMultiplier={1.08}>
                      隨手記錄生活瑣事、採買清單或重要待辦。獨立於財務統計，支援到期提醒！
                    </Text>
                  </View>
                </View>

                {/* 待辦事項進度狀態切換 */}
                <View style={styles.memoStatusContainer}>
                  <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>待辦進度狀態</Text>
                  <View style={styles.memoStatusRow}>
                    <TouchableOpacity
                      disabled={!canEdit && !canEditCompletion}
                      style={[styles.memoStatusChip, !isSettled && styles.memoStatusChipActivePending]}
                      onPress={() => setIsSettled(false)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.memoStatusChipText, !isSettled && styles.memoStatusChipTextActivePending]}>
                        ⚪ 待辦進行中
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      disabled={!canEdit && !canEditCompletion}
                      style={[styles.memoStatusChip, isSettled && styles.memoStatusChipActiveCompleted]}
                      onPress={() => setIsSettled(true)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.memoStatusChipText, isSettled && styles.memoStatusChipTextActiveCompleted]}>
                        ✓ 已完成辦妥
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {isSettled && (
                    <Text style={styles.memoCompleterHint} maxFontSizeMultiplier={1.08}>
                      {transaction.completed_by
                        ? `✓ 由 ${getMemberById(transaction.completed_by)?.display_name || '家庭成員'} 打勾辦妥`
                        : `✓ 儲存後將標記由 ${currentUser?.display_name || '本人'} 辦妥`}
                    </Text>
                  )}
                </View>

                {/* 辦妥補充說明 / 回報備註 (辦妥時顯示) */}
                {isSettled && (
                  <View
                    style={styles.completionNoteContainer}
                    onLayout={(e) => setCompletionNoteSectionY(e.nativeEvent.layout.y)}
                  >
                    <View style={styles.sectionLabelRow}>
                      <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>💬 辦妥補充說明 / 回報 (選填)</Text>
                      {keyboardOffset > 0 && (
                        <TouchableOpacity onPress={Keyboard.dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Text style={styles.dismissKeyboardText} maxFontSizeMultiplier={1.08}>收起鍵盤 ▾</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <TextInput
                      style={[styles.completionNoteInput, (!canEdit && !canEditCompletion) && styles.readOnlyInput]}
                      multiline
                      numberOfLines={3}
                      placeholder="補充說明如何辦妥、採買狀況、注意事項..."
                      placeholderTextColor="#9CA3AF"
                      value={completionNote}
                      onChangeText={setCompletionNote}
                      editable={canEdit || canEditCompletion}
                      onFocus={() => scrollToInput(completionNoteSectionY, 70)}
                      textAlignVertical="top"
                      maxFontSizeMultiplier={1.15}
                    />
                  </View>
                )}

                {/* 💳 連動支出紀錄區塊 (辦妥時顯示) */}
                {isSettled && (
                  <View style={styles.linkedExpenseContainer}>
                    <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>💳 連動支出紀錄</Text>
                    {linkedExpense ? (
                      <View style={styles.linkedExpenseCard}>
                        <View style={styles.linkedExpenseHeader}>
                          <View style={styles.linkedExpenseInfo}>
                            <Text style={styles.linkedExpenseTitle} numberOfLines={1}>
                              {linkedExpense.merchant || linkedExpense.category?.name || '支出記帳'}
                            </Text>
                            <Text style={styles.linkedExpenseSubtitle} numberOfLines={1}>
                              {linkedExpense.payment_account?.name || linkedExpense.payment_method || '現金'} · {getMemberById(linkedExpense.paid_by)?.display_name || '成員'} 付款
                            </Text>
                          </View>
                          <Text style={styles.linkedExpenseAmount}>
                            - NT$ {Number(linkedExpense.amount).toLocaleString('zh-TW')}
                          </Text>
                        </View>
                        <View style={styles.linkedExpenseActions}>
                          <TouchableOpacity
                            style={styles.linkedExpenseActionBtn}
                            onPress={() => onOpenLinkedExpense?.(linkedExpense)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.linkedExpenseActionBtnText}>查看 / 編輯記帳明細 ›</Text>
                          </TouchableOpacity>
                          {(canEdit || canEditCompletion) && (
                            <TouchableOpacity
                              style={styles.linkedExpenseUnlinkBtn}
                              onPress={() => {
                                Alert.alert(
                                  '解除連動確認',
                                  '解除連動後，這筆生活待辦與該筆記帳將不再相互關聯，但記帳紀錄仍會保留。確定解除嗎？',
                                  [
                                    { text: '取消', style: 'cancel' },
                                    {
                                      text: '確認解除',
                                      style: 'destructive',
                                      onPress: async () => {
                                        setLinkedTxId('');
                                        await updateTransaction(transaction.id, { linked_transaction_id: '' });
                                        await updateTransaction(linkedExpense.id, { linked_transaction_id: '' });
                                      },
                                    },
                                  ]
                                );
                              }}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.linkedExpenseUnlinkBtnText}>解除連動 ✕</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    ) : (
                      (canEdit || canEditCompletion) && (
                        <TouchableOpacity
                          style={styles.linkExpenseBtn}
                          onPress={handleLinkExpensePress}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.linkExpenseBtnText}>
                            💳 連動記一筆支出 (將此採買計入公帳)
                          </Text>
                          <Text style={styles.linkExpenseBtnDesc}>
                            自動預填此待辦內容，完成後雙向綁定紀錄
                          </Text>
                        </TouchableOpacity>
                      )
                    )}
                  </View>
                )}

                {/* 常用清單範本捷徑列 (僅在可編輯狀態顯現) */}
                {canEdit && (
                  <View style={styles.templateSection}>
                    <Text style={styles.templateSectionLabel} maxFontSizeMultiplier={1.08}>📋 常用範本 (點選一鍵帶入清單)：</Text>
                    <HorizontalScrollView showsHorizontalScrollIndicator={false} contentContainerStyle={styles.templateChipsRow}>
                      {BUILTIN_MEMO_TEMPLATES.map((tmpl) => (
                        <TouchableOpacity
                          key={tmpl.id}
                          style={styles.templateChip}
                          onPress={() => handleSelectTemplate(tmpl)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.templateChipIcon}>{tmpl.icon}</Text>
                          <Text style={styles.templateChipText} maxFontSizeMultiplier={1.08}>{tmpl.title}</Text>
                        </TouchableOpacity>
                      ))}
                    </HorizontalScrollView>
                  </View>
                )}

                {/* 記事內容多行輸入框 */}
                <View onLayout={(e) => setMemoSectionY(e.nativeEvent.layout.y)}>
                  <View style={styles.sectionLabelRow}>
                    <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>記事內容與備忘</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      {canEdit && (
                        <TouchableOpacity
                          style={styles.insertCheckboxBtn}
                          onPress={() => setNote(prev => insertChecklistCheckbox(prev))}
                          activeOpacity={0.7}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={styles.insertCheckboxBtnText} maxFontSizeMultiplier={1.08}>☑ ＋ 待辦方框</Text>
                        </TouchableOpacity>
                      )}
                      {keyboardOffset > 0 && (
                        <TouchableOpacity onPress={Keyboard.dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Text style={styles.dismissKeyboardText} maxFontSizeMultiplier={1.08}>收起鍵盤 ▾</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                  <TextInput
                    style={[styles.memoContentInput, !canEdit && styles.readOnlyInput]}
                    multiline
                    numberOfLines={4}
                    placeholder="記錄今天的事情、靈感、採買備忘或家庭待辦..."
                    placeholderTextColor="#9CA3AF"
                    value={note}
                    onChangeText={(text) => setNote(handleChecklistInput(note, text))}
                    editable={canEdit}
                    onFocus={() => scrollToInput(memoSectionY, isSettled ? 220 : 70)}
                    textAlignVertical="top"
                    maxFontSizeMultiplier={1.15}
                  />
                </View>

                {/* 快捷情境標籤（方式 1：自動換行全顯；策略 1：依頻率智慧動態排序；長按可移除） */}
                {canEdit && (
                  <View style={styles.quickNoteRow}>
                    {displayedMemoTags.map(tag => {
                      const active = isMemoTagActive(note, tag);
                      return (
                        <TouchableOpacity
                          key={tag}
                          style={[styles.quickNoteChip, active && styles.quickNoteChipActive]}
                          onPress={() => {
                            setNote(toggleMemoTag(note, tag));
                            recordMemoTag(tag);
                          }}
                          onLongPress={() => handleLongPressMemoTag(tag)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[styles.quickNoteChipText, active && styles.quickNoteChipTextActive]}
                            maxFontSizeMultiplier={1.08}
                          >
                            {tag}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* 記事日期與發生時間 */}
                <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>記事日期與發生時間</Text>
                <View style={styles.dateRow}>
                  <TouchableOpacity
                    disabled={!canEdit}
                    style={[styles.dateChip, isOriginal && styles.dateChipActive]}
                    onPress={() => {
                      if (transaction?.transacted_at) {
                        setTransactedAt(transaction.transacted_at);
                        const orig = new Date(transaction.transacted_at);
                        setHourStr(String(orig.getHours()).padStart(2, '0'));
                        setMinuteStr(String(orig.getMinutes()).padStart(2, '0'));
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dateChipText, isOriginal && styles.dateChipTextActive]} maxFontSizeMultiplier={1.15}>
                      原日期 ({origDateFormatted})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    disabled={!canEdit}
                    style={[styles.dateChip, !isOriginal && isToday && styles.dateChipActive]}
                    onPress={() => setQuickDate(today)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dateChipText, !isOriginal && isToday && styles.dateChipTextActive]} maxFontSizeMultiplier={1.15}>
                      今天 ({today.getMonth() + 1}/{today.getDate()})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    disabled={!canEdit}
                    style={[styles.dateChip, !isOriginal && isYesterday && styles.dateChipActive]}
                    onPress={() => setQuickDate(yesterday)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dateChipText, !isOriginal && isYesterday && styles.dateChipTextActive]} maxFontSizeMultiplier={1.15}>
                      昨天 ({yesterday.getMonth() + 1}/{yesterday.getDate()})
                    </Text>
                  </TouchableOpacity>

                  {isCustomDate && (
                    <TouchableOpacity
                      disabled={!canEdit}
                      style={[styles.dateChip, styles.dateChipActive, styles.dateChipCustom]}
                      onPress={() => setDatePickerVisible(true)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.dateChipText, styles.dateChipTextActive]} maxFontSizeMultiplier={1.15}>
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
                      <Text style={[styles.dateMoreBtnText, isCustomDate && styles.dateMoreBtnTextSelected]} maxFontSizeMultiplier={1.15}>
                        {isCustomDate ? '✏️ 改選' : '🗓️ 更多...'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                {renderTimeInputRow()}

                {/* ⏰ 待辦提醒日期與週期設定 (選填) */}
                <View style={styles.sectionLabelRow}>
                  <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>⏰ 待辦提醒日期 (選填)</Text>
                  {canEdit && !!memoReminderDate && (
                    <TouchableOpacity
                      onPress={() => {
                        setMemoReminderDate('');
                        setMemoReminderRepeat('once');
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.clearMerchantText} maxFontSizeMultiplier={1.08}>清除提醒 ✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.dateRow}>
                  <TouchableOpacity
                    disabled={!canEdit}
                    style={[styles.dateChip, !memoReminderDate && styles.dateChipActive]}
                    onPress={() => {
                      setMemoReminderDate('');
                      setMemoReminderRepeat('once');
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dateChipText, !memoReminderDate && styles.dateChipTextActive]} maxFontSizeMultiplier={1.15}>
                      不設提醒
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={!canEdit}
                    style={[styles.dateChip, memoReminderDate === todayYmd && styles.dateChipActive]}
                    onPress={() => setMemoReminderDate(todayYmd)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dateChipText, memoReminderDate === todayYmd && styles.dateChipTextActive]} maxFontSizeMultiplier={1.15}>
                      今天 ({today.getMonth() + 1}/{today.getDate()})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={!canEdit}
                    style={[styles.dateChip, memoReminderDate === tomorrowYmd && styles.dateChipActive]}
                    onPress={() => setMemoReminderDate(tomorrowYmd)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dateChipText, memoReminderDate === tomorrowYmd && styles.dateChipTextActive]} maxFontSizeMultiplier={1.15}>
                      明天 ({tomorrow.getMonth() + 1}/{tomorrow.getDate()})
                    </Text>
                  </TouchableOpacity>
                  {canEdit && (
                    <TouchableOpacity
                      style={[
                        styles.dateMoreBtn,
                        isCustomReminder && memoReminderCalendar === 'solar' && styles.dateMoreBtnSelected,
                      ]}
                      onPress={() => {
                        setReminderPickerInitialMode('solar');
                        setReminderDatePickerVisible(true);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.dateMoreBtnText,
                          isCustomReminder && memoReminderCalendar === 'solar' && styles.dateMoreBtnTextSelected,
                        ]}
                        maxFontSizeMultiplier={1.15}
                      >
                        🗓️ 選國曆
                      </Text>
                    </TouchableOpacity>
                  )}
                  {canEdit && (
                    <TouchableOpacity
                      style={[
                        styles.dateMoreBtn,
                        styles.lunarMoreBtn,
                        !!memoReminderDate && memoReminderCalendar === 'lunar' && styles.lunarMoreBtnSelected,
                      ]}
                      onPress={() => {
                        setReminderPickerInitialMode('lunar');
                        setReminderDatePickerVisible(true);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.dateMoreBtnText,
                          styles.lunarMoreBtnText,
                          !!memoReminderDate && memoReminderCalendar === 'lunar' && styles.lunarMoreBtnTextSelected,
                        ]}
                        maxFontSizeMultiplier={1.15}
                      >
                        🏮 選農曆
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* 🔄 提醒頻率與農曆對照預覽 */}
                <View style={styles.memoRepeatCard}>
                  <View style={styles.memoRepeatHeaderRow}>
                    <Text style={styles.memoRepeatTitle} maxFontSizeMultiplier={1.08}>
                      🔄 提醒頻率與週期
                    </Text>
                    {canEdit &&
                      !!memoReminderDate &&
                      memoReminderRepeat !== 'lunar_1_15' &&
                      memoReminderRepeat !== 'lunar_2_16' && (
                        <View style={styles.calendarBasisSwitch}>
                          <TouchableOpacity
                            style={[
                              styles.calendarBasisBtn,
                              memoReminderCalendar === 'solar' && styles.calendarBasisBtnActive,
                            ]}
                            onPress={() => setMemoReminderCalendar('solar')}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                styles.calendarBasisBtnText,
                                memoReminderCalendar === 'solar' && styles.calendarBasisBtnTextActive,
                              ]}
                              maxFontSizeMultiplier={1.05}
                            >
                              🗓️ 國曆基準
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.calendarBasisBtn,
                              memoReminderCalendar === 'lunar' && styles.calendarBasisBtnLunarActive,
                            ]}
                            onPress={() => setMemoReminderCalendar('lunar')}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                styles.calendarBasisBtnText,
                                memoReminderCalendar === 'lunar' && styles.calendarBasisBtnTextLunarActive,
                              ]}
                              maxFontSizeMultiplier={1.05}
                            >
                              🏮 農曆基準
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                  </View>

                  <View style={styles.memoRepeatChipsRow}>
                    {REPEAT_OPTIONS.map(opt => {
                      const isRepSelected = !!memoReminderDate && memoReminderRepeat === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          disabled={!canEdit}
                          style={[
                            styles.memoRepeatChip,
                            opt.lunarOnly && styles.memoRepeatChipLunar,
                            isRepSelected && (opt.lunarOnly ? styles.memoRepeatChipLunarActive : styles.memoRepeatChipActive),
                          ]}
                          onPress={() => {
                            if (opt.value === 'lunar_1_15' || opt.value === 'lunar_2_16') {
                              setMemoReminderRepeat(opt.value);
                              setMemoReminderCalendar('lunar');
                              const alignedYmd = getNearestLunarPairDate(memoReminderDate || todayYmd, opt.value);
                              setMemoReminderDate(alignedYmd);
                            } else {
                              setMemoReminderRepeat(opt.value);
                              if (!memoReminderDate) {
                                setMemoReminderDate(todayYmd);
                              }
                            }
                          }}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.memoRepeatChipText,
                              opt.lunarOnly && styles.memoRepeatChipTextLunar,
                              isRepSelected && (opt.lunarOnly ? styles.memoRepeatChipTextLunarActive : styles.memoRepeatChipTextActive),
                            ]}
                            maxFontSizeMultiplier={1.08}
                          >
                            {opt.shortLabel}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {!!memoReminderDate && (() => {
                    const badge = formatMemoReminderBadge(
                      memoReminderDate,
                      memoReminderCalendar,
                      memoReminderRepeat
                    );
                    const nextYmd =
                      memoReminderRepeat !== 'once'
                        ? getNextMemoReminderDate(memoReminderDate, memoReminderRepeat, memoReminderCalendar)
                        : null;
                    const nextBadge = nextYmd
                      ? formatMemoReminderBadge(nextYmd, memoReminderCalendar, 'once')
                      : null;
                    return (
                      <View style={styles.memoReminderPreviewBox}>
                        <Text style={styles.memoReminderPreviewPrimary} maxFontSizeMultiplier={1.08}>
                          📌 已排定：{badge?.fullText || memoReminderDate}
                        </Text>
                        {memoReminderRepeat !== 'once' && nextBadge && (
                          <Text style={styles.memoReminderPreviewNext} maxFontSizeMultiplier={1.08}>
                            ✨ 辦妥打勾後，將自動接力產生下一期：{nextBadge.fullText}
                          </Text>
                        )}
                      </View>
                    );
                  })()}
                </View>

                {/* 記錄成員 */}
                <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>記錄成員</Text>
                <View style={styles.payerRow}>
                  {members.map(member => {
                    const isSelected = (paidBy || transaction.paid_by) === member.id;
                    const isMe = member.id === currentUser.id || (!!currentUser.display_name && currentUser.display_name === member.display_name);
                    return (
                      <TouchableOpacity
                        key={member.id}
                        disabled={!canEdit}
                        style={[styles.payerChip, isSelected && styles.payerChipActive]}
                        onPress={() => setPaidBy(member.id)}
                      >
                        <Text style={styles.payerAvatar}>{member.avatar_url}</Text>
                        <Text
                          style={[styles.payerName, isSelected && styles.payerNameActive]}
                          maxFontSizeMultiplier={1.15}
                        >
                          {member.display_name}{isMe ? ' (我)' : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : (
              <>
                {/* 若此筆交易連動自生活待辦事項，顯示提示卡片 */}
                {!!linkedMemoTx && (
                  <View style={styles.linkedMemoCard}>
                    <View style={styles.linkedMemoCardHeader}>
                      <Text style={styles.linkedMemoCardBadge} maxFontSizeMultiplier={1.08}>📌 源自生活待辦事項</Text>
                      <TouchableOpacity
                        onPress={() => onOpenLinkedExpense?.(linkedMemoTx)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.linkedMemoCardLink} maxFontSizeMultiplier={1.08}>查看生活待辦 ›</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.linkedMemoCardContent} numberOfLines={2} maxFontSizeMultiplier={1.08}>
                      {linkedMemoTx.note || '生活待辦事項'}
                    </Text>
                  </View>
                )}

                {/* 類型切換 (支出 / 收入) */}
                {/* 類型切換 (支出 / 收入 / 內部轉帳) */}
                {type === 'transfer' ? (
                  <View style={styles.transferBanner}>
                    <Text style={styles.transferBannerIcon}>⇄</Text>
                    <View style={styles.transferBannerContent}>
                      <Text style={styles.transferBannerTitle} maxFontSizeMultiplier={1.15}>內部轉帳紀錄</Text>
                      <Text style={styles.transferBannerDesc} maxFontSizeMultiplier={1.08}>
                        此筆為內部資金調撥（如悠遊卡加值、零用錢轉移），不計入家庭總支出。
                      </Text>
                    </View>
                  </View>
                ) : (
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
                )}

            {/* 金額輸入 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={[styles.sectionLabel, { marginBottom: 0 }]} maxFontSizeMultiplier={1.15}>
                {type === 'expense' && showDiscountPanel && discountCalcMode === 'subtract'
                  ? '商品原價 (TWD)'
                  : '金額 (TWD)'}
              </Text>
              {type === 'expense' && (
                <TouchableOpacity
                  disabled={!canEdit}
                  style={[styles.discountToggleChip, showDiscountPanel && styles.discountToggleChipActive]}
                  onPress={() => {
                    if (!showDiscountPanel) {
                      if (!discountLabel) {
                        setDiscountLabel(getRecommendedDiscountLabel(paymentMethod));
                      }
                      setShowDiscountPanel(true);
                    } else {
                      setShowDiscountPanel(false);
                      setDiscountAmount('');
                    }
                  }}
                >
                  <Text
                    style={[styles.discountToggleChipText, showDiscountPanel && styles.discountToggleChipTextActive]}
                    maxFontSizeMultiplier={1.15}
                  >
                    {showDiscountPanel ? '🎁 取消點數/回饋折抵' : '🎁 點數/回饋折抵'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
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

            {/* 點數／行動支付回饋折抵面板 */}
            {type === 'expense' && showDiscountPanel && (
              <View
                style={styles.discountPanelBox}
                onLayout={(e) => setDiscountSectionY(e.nativeEvent.layout.y)}
              >
                <View style={styles.discountModeRow}>
                  <TouchableOpacity
                    disabled={!canEdit}
                    style={[
                      styles.discountModeBtn,
                      discountCalcMode === 'subtract' && styles.discountModeBtnActive,
                    ]}
                    onPress={() => setDiscountCalcMode('subtract')}
                  >
                    <Text
                      style={[
                        styles.discountModeBtnText,
                        discountCalcMode === 'subtract' && styles.discountModeBtnTextActive,
                      ]}
                      maxFontSizeMultiplier={1.15}
                    >
                      🧮 上方填原價 (自動扣減算實付)
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={!canEdit}
                    style={[
                      styles.discountModeBtn,
                      discountCalcMode === 'already_net' && styles.discountModeBtnActive,
                    ]}
                    onPress={() => setDiscountCalcMode('already_net')}
                  >
                    <Text
                      style={[
                        styles.discountModeBtnText,
                        discountCalcMode === 'already_net' && styles.discountModeBtnTextActive,
                      ]}
                      maxFontSizeMultiplier={1.15}
                    >
                      ✅ 上方已填實付 (僅標記折抵)
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.discountInputRow}>
                  <View style={styles.discountAmountBox}>
                    <Text style={styles.discountInputLabel} maxFontSizeMultiplier={1.15}>折抵金額</Text>
                    <View style={styles.discountAmountInputInner}>
                      <Text style={styles.discountCurrencyPrefix}>-$</Text>
                      <TextInput
                        style={styles.discountAmountInput}
                        placeholder="0"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="numeric"
                        value={discountAmount}
                        onChangeText={setDiscountAmount}
                        onFocus={() => scrollToInput(discountSectionY + 35, 190)}
                        editable={canEdit}
                        maxFontSizeMultiplier={1.15}
                        underlineColorAndroid="transparent"
                      />
                    </View>
                  </View>
                  <View style={styles.discountLabelBox}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={[styles.discountInputLabel, { marginBottom: 0 }]} maxFontSizeMultiplier={1.15}>折抵項目名稱</Text>
                      {keyboardOffset > 0 && (
                        <TouchableOpacity onPress={Keyboard.dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Text style={styles.dismissKeyboardText} maxFontSizeMultiplier={1.08}>收起鍵盤 ▾</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <TextInput
                      style={styles.discountLabelInput}
                      placeholder="例如：LINE Points、mo幣"
                      placeholderTextColor="#9CA3AF"
                      value={discountLabel}
                      onChangeText={setDiscountLabel}
                      onFocus={() => scrollToInput(discountSectionY + 35, 190)}
                      editable={canEdit}
                      maxFontSizeMultiplier={1.15}
                    />
                  </View>
                </View>

                <View style={styles.discountPresetChipsRow}>
                  {smartDiscountLabels.map(preset => {
                    const isSelected = discountLabel === preset;
                    return (
                      <TouchableOpacity
                        key={preset}
                        disabled={!canEdit}
                        style={[styles.discountPresetChip, isSelected && styles.discountPresetChipActive]}
                        onPress={() => setDiscountLabel(preset)}
                      >
                        <Text
                          style={[styles.discountPresetChipText, isSelected && styles.discountPresetChipTextActive]}
                          maxFontSizeMultiplier={1.15}
                        >
                          {preset}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {(() => {
                  const baseAmt = parseFloat(amount) || 0;
                  const discAmt = parseFloat(discountAmount) || 0;
                  if (discAmt <= 0) return null;
                  const netPaid =
                    discountCalcMode === 'subtract'
                      ? baseAmt > 0
                        ? Math.max(0, Math.round((baseAmt - discAmt) * 100) / 100)
                        : 0
                      : baseAmt;
                  const origAmt =
                    discountCalcMode === 'subtract'
                      ? baseAmt > 0
                        ? baseAmt
                        : discAmt
                      : Math.round((baseAmt + discAmt) * 100) / 100;
                  const isInvalid = discountCalcMode === 'subtract' && baseAmt > 0 && discAmt > baseAmt;
                  return (
                    <View style={[styles.discountSummaryBanner, isInvalid && styles.discountSummaryBannerError]}>
                      <Text
                        style={[styles.discountSummaryText, isInvalid && styles.discountSummaryTextError]}
                        maxFontSizeMultiplier={1.15}
                      >
                        {isInvalid
                          ? '⚠️ 折抵金額不可大於商品原價'
                          : netPaid === 0
                          ? `🎉 全額點數折抵！原價 $${origAmt.toLocaleString()} － ${discountLabel || '折抵'} $${discAmt.toLocaleString()} ＝ 實付入帳 $0`
                          : `💡 原價 $${origAmt.toLocaleString()} － ${discountLabel || '折抵'} $${discAmt.toLocaleString()} ＝ 實付入帳 $${netPaid.toLocaleString()} (對帳完全相符)`}
                      </Text>
                    </View>
                  );
                })()}
              </View>
            )}

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
                  💳 選擇卡片 (對帳核算使用){inAdminMode ? ' · 👑 管理員模式(全體卡片)' : ''}：
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
            {supportsCreditCard && creditCards.length === 0 && paymentMethod === 'credit_card' && (
              <View style={[styles.subCardContainer, { paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#F9FAFB', borderRadius: 10, marginVertical: 6, borderWidth: 1, borderColor: '#E5E7EB' }]}>
                <Text style={{ fontSize: 12, color: '#6B7280', lineHeight: 18 }} maxFontSizeMultiplier={1.15}>
                  💳 目前尚未綁定屬於您的信用卡。{!inAdminMode && '（如需選用其他成員卡片，可至「家庭設定」啟用管理員模式）'}
                </Text>
              </View>
            )}

            {/* 子層：當選擇悠遊卡/儲值卡時，展開儲值卡列表 */}
            {isStoredValue && storedValueCards.length > 0 && (
              <View style={styles.subCardContainer}>
                <Text style={styles.subCardLabel} maxFontSizeMultiplier={1.15}>
                  🚌 選擇儲值卡 (將自動扣減餘額){inAdminMode ? ' · 👑 管理員模式(全體卡片)' : ''}：
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
            {isStoredValue && storedValueCards.length === 0 && (
              <View style={[styles.subCardContainer, { paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#F9FAFB', borderRadius: 10, marginVertical: 6, borderWidth: 1, borderColor: '#E5E7EB' }]}>
                <Text style={{ fontSize: 12, color: '#6B7280', lineHeight: 18 }} maxFontSizeMultiplier={1.15}>
                  🚌 目前尚未綁定屬於您的儲值卡/悠遊卡。{!inAdminMode && '（如需選用其他成員卡片，可至「家庭設定」啟用管理員模式）'}
                </Text>
              </View>
            )}

            {/* 子層：當選擇銀行轉帳時，展開銀行帳戶列表 */}
            {isBankTransfer && bankAccounts.length > 0 && (
              <View style={styles.subCardContainer}>
                <Text style={styles.subCardLabel} maxFontSizeMultiplier={1.15}>
                  🏦 選擇扣款銀行帳戶 (選填){inAdminMode ? ' · 👑 管理員模式(全體帳戶)' : ''}：
                </Text>
                <HorizontalScrollView showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardScroll}>
                  {bankAccounts.map(account => {
                    const isAccountSelected = selectedAccountId === account.id;
                    const cardholder = getMemberById(account.user_id);
                    return (
                      <TouchableOpacity
                        key={account.id}
                        disabled={!canEdit}
                        style={[
                          styles.cardChip,
                          isAccountSelected && { borderColor: account.color || '#8B5CF6', backgroundColor: '#F5F3FF' },
                          !canEdit && !isAccountSelected && styles.readOnlyUnselectedChip,
                        ]}
                        onPress={() => setSelectedAccountId(isAccountSelected ? '' : account.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.cardChipIcon}>🏦</Text>
                        <View>
                          <Text
                            style={[styles.cardChipName, isAccountSelected && { color: account.color || '#8B5CF6', fontWeight: '700' }]}
                            maxFontSizeMultiplier={1.15}
                          >
                            {account.name}{account.last_four_digits ? ` (*${account.last_four_digits})` : ''}
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
            {isBankTransfer && bankAccounts.length === 0 && (
              <View style={[styles.subCardContainer, { paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#F9FAFB', borderRadius: 10, marginVertical: 6, borderWidth: 1, borderColor: '#E5E7EB' }]}>
                <Text style={{ fontSize: 12, color: '#6B7280', lineHeight: 18 }} maxFontSizeMultiplier={1.15}>
                  🏦 目前尚未綁定屬於您的銀行帳戶。{!inAdminMode && '（如需選用其他成員帳戶，可至「家庭設定」啟用管理員模式）'}
                </Text>
              </View>
            )}

            {/* 發生日期與時間調整 */}
            <View style={styles.sectionLabelRow}>
              <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>發生日期與時間</Text>
              {!isOriginal && (
                <Text style={styles.dateHintText} maxFontSizeMultiplier={1.15}>
                  (已改為：{curDateFormattedWithTime})
                </Text>
              )}
            </View>
            <View style={styles.dateRow}>
              <TouchableOpacity
                disabled={!canEdit}
                style={[styles.dateChip, isOriginal && styles.dateChipActive, !canEdit && !isOriginal && styles.readOnlyUnselectedChip]}
                onPress={() => {
                  if (transaction?.transacted_at) {
                    setTransactedAt(transaction.transacted_at);
                    const orig = new Date(transaction.transacted_at);
                    setHourStr(String(orig.getHours()).padStart(2, '0'));
                    setMinuteStr(String(orig.getMinutes()).padStart(2, '0'));
                  }
                }}
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
                  style={[styles.dateChipText, isYesterday && !isOriginal && styles.dateChipActive]}
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
            {renderTimeInputRow()}

            {/* 店家 / 對象 (選填) */}
            <View onLayout={(e) => setMerchantSectionY(e.nativeEvent.layout.y)}>
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
                  onFocus={() => scrollToInput(merchantSectionY, 350)}
                  returnKeyType="next"
                  maxFontSizeMultiplier={1.15}
                />
                {canEdit && !!merchant && (
                  <TouchableOpacity onPress={() => setMerchant('')} style={styles.merchantClearBtn}>
                    <Text style={styles.merchantClearBtnText}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
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
            <View onLayout={(e) => setNoteSectionY(e.nativeEvent.layout.y)}>
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
                onFocus={() => scrollToInput(noteSectionY, 450)}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                maxFontSizeMultiplier={1.15}
              />
            </View>
          </>
        )}

        {/* 操作按鈕群 */}
        {canEdit ? (
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
              <Text style={styles.deleteBtnText} maxFontSizeMultiplier={1.15}>
                {transaction.type === 'memo' ? '🗑️ 刪除備忘' : '🗑️ 刪除紀錄'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
              <Text style={styles.submitBtnText} maxFontSizeMultiplier={1.15}>儲存修改</Text>
            </TouchableOpacity>
          </View>
        ) : (transaction.type === 'memo' && canEditCompletion) ? (
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.readOnlyCloseBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.readOnlyCloseBtnText} maxFontSizeMultiplier={1.15}>關閉</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
              <Text style={styles.submitBtnText} maxFontSizeMultiplier={1.15}>儲存回報</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.readOnlyBtnRow}>
            <TouchableOpacity style={styles.readOnlyCloseBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.readOnlyCloseBtnText} maxFontSizeMultiplier={1.15}>關閉明細</Text>
            </TouchableOpacity>
            <Text style={styles.readOnlyFooterHint} maxFontSizeMultiplier={1.08}>
              {(isReadOnly || currentLedger?.is_read_only)
                ? '🔒 此帳本已設定為唯讀封存保護，歷史明細僅供查詢檢視，不可修改或刪除'
                : `🔒 僅付款人「${txPayerName}」本人或帳本管理員具有編輯與刪除權限`}
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

  <DatePickerModal
    visible={reminderDatePickerVisible}
    onClose={() => setReminderDatePickerVisible(false)}
    selectedDate={memoReminderDate ? new Date(`${memoReminderDate}T00:00:00`) : new Date()}
    initialMode={reminderPickerInitialMode}
    title="⏰ 選擇提醒日期 (支援國曆＆農曆)"
    onSelectDate={(newDate: Date, pickedMode?: CalendarSystem) => {
      const ymd = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}-${String(newDate.getDate()).padStart(2, '0')}`;
      setMemoReminderDate(ymd);
      if (pickedMode) {
        setMemoReminderCalendar(pickedMode);
      }
      if (memoReminderRepeat === 'lunar_1_15' || memoReminderRepeat === 'lunar_2_16') {
        const l = solarToLunar(newDate);
        if (memoReminderRepeat === 'lunar_1_15' && l.lunarDay !== 1 && l.lunarDay !== 15) {
          setMemoReminderRepeat('monthly');
        } else if (memoReminderRepeat === 'lunar_2_16' && l.lunarDay !== 2 && l.lunarDay !== 16) {
          setMemoReminderRepeat('monthly');
        }
      }
      setReminderDatePickerVisible(false);
    }}
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
  transferBanner: {
    flexDirection: 'row',
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    alignItems: 'center',
    gap: 10,
  },
  transferBannerIcon: {
    fontSize: 22,
    color: '#4F46E5',
  },
  transferBannerContent: {
    flex: 1,
  },
  transferBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4338CA',
    marginBottom: 2,
  },
  transferBannerDesc: {
    fontSize: 12,
    color: '#4F46E5',
    lineHeight: 16,
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
    marginBottom: 8,
  },
  timeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 0,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  timeLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeLabelIcon: {
    fontSize: 14,
  },
  timeLabelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  timeInputsWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeDigitInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    width: 44,
    height: 36,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
    paddingVertical: 0,
  },
  timeColonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#4B5563',
  },
  timeNowBtn: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  timeNowBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4F46E5',
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
  memoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  memoBannerIcon: {
    fontSize: 22,
    marginRight: 8,
  },
  memoBannerContent: {
    flex: 1,
  },
  memoBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 2,
  },
  memoBannerDesc: {
    fontSize: 11,
    color: '#B45309',
    lineHeight: 15,
  },
  insertCheckboxBtn: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  insertCheckboxBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#D97706',
  },
  templateSection: {
    marginBottom: 10,
  },
  templateSectionLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 5,
  },
  templateChipsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  templateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5.5,
    gap: 5,
  },
  templateChipIcon: {
    fontSize: 13,
  },
  templateChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B45309',
  },
  memoContentInput: {
    backgroundColor: '#FAFAFA',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: '#111827',
    minHeight: 96,
    marginBottom: 10,
  },
  readOnlyInput: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    color: '#334155',
  },
  quickNoteRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  quickNoteChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  quickNoteChipActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  quickNoteChipText: {
    fontSize: 11,
    color: '#4B5563',
  },
  quickNoteChipTextActive: {
    color: '#92400E',
    fontWeight: '700',
  },
  memoStatusContainer: {
    marginBottom: 12,
  },
  memoStatusRow: {
    flexDirection: 'row',
    gap: 8,
  },
  memoStatusChip: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memoStatusChipActivePending: {
    backgroundColor: '#FFFBEB',
    borderColor: '#F59E0B',
  },
  memoStatusChipActiveCompleted: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  memoStatusChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  memoStatusChipTextActivePending: {
    color: '#B45309',
    fontWeight: '700',
  },
  memoStatusChipTextActiveCompleted: {
    color: '#059669',
    fontWeight: '700',
  },
  memoCompleterHint: {
    marginTop: 6,
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
  },
  completionNoteContainer: {
    marginBottom: 14,
  },
  completionNoteInput: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    borderRadius: 12,
    padding: 12,
    fontSize: 14.5,
    color: '#14532D',
    minHeight: 76,
  },
  linkedExpenseContainer: {
    marginBottom: 16,
  },
  linkedExpenseCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
  },
  linkedExpenseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  linkedExpenseInfo: {
    flex: 1,
    marginRight: 8,
  },
  linkedExpenseTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  linkedExpenseSubtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  linkedExpenseAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#DC2626',
  },
  linkedExpenseActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 8,
    marginTop: 2,
  },
  linkedExpenseActionBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
  },
  linkedExpenseActionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  linkedExpenseUnlinkBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  linkedExpenseUnlinkBtnText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  linkExpenseBtn: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkExpenseBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1D4ED8',
    marginBottom: 2,
  },
  linkExpenseBtnDesc: {
    fontSize: 11,
    color: '#3B82F6',
  },
  linkedMemoCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  linkedMemoCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  linkedMemoCardBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
  },
  linkedMemoCardLink: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  linkedMemoCardContent: {
    fontSize: 13,
    color: '#78350F',
    lineHeight: 18,
  },
  lunarMoreBtn: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  lunarMoreBtnSelected: {
    borderColor: '#D97706',
    backgroundColor: '#FEF3C7',
  },
  lunarMoreBtnText: {
    color: '#B45309',
  },
  lunarMoreBtnTextSelected: {
    color: '#92400E',
    fontWeight: '800',
  },
  memoRepeatCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 10,
    marginBottom: 14,
  },
  memoRepeatHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 6,
  },
  memoRepeatTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
  },
  calendarBasisSwitch: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
    padding: 2,
  },
  calendarBasisBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  calendarBasisBtnActive: {
    backgroundColor: '#FFFFFF',
  },
  calendarBasisBtnLunarActive: {
    backgroundColor: '#FEF3C7',
  },
  calendarBasisBtnText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  calendarBasisBtnTextActive: {
    color: '#2563EB',
    fontWeight: '700',
  },
  calendarBasisBtnTextLunarActive: {
    color: '#B45309',
    fontWeight: '700',
  },
  memoRepeatChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  memoRepeatChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  memoRepeatChipLunar: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  memoRepeatChipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  memoRepeatChipLunarActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#D97706',
  },
  memoRepeatChipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  memoRepeatChipTextLunar: {
    color: '#B45309',
  },
  memoRepeatChipTextActive: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  memoRepeatChipTextLunarActive: {
    color: '#92400E',
    fontWeight: '800',
  },
  memoReminderPreviewBox: {
    marginTop: 8,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  memoReminderPreviewPrimary: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
  },
  memoReminderPreviewNext: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 3,
    fontWeight: '600',
  },
  discountToggleChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  discountToggleChipActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  discountToggleChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#047857',
  },
  discountToggleChipTextActive: {
    color: '#FFFFFF',
  },
  discountPanelBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  discountModeRow: {
    flexDirection: 'row',
    backgroundColor: '#DCFCE7',
    borderRadius: 8,
    padding: 3,
    marginBottom: 8,
    gap: 4,
  },
  discountModeBtn: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  discountModeBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  discountModeBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#166534',
  },
  discountModeBtnTextActive: {
    fontWeight: '800',
    color: '#065F46',
  },
  discountInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  discountAmountBox: {
    flex: 0.42,
  },
  discountLabelBox: {
    flex: 0.58,
  },
  discountInputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
    marginBottom: 4,
  },
  discountAmountInputInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 36,
  },
  discountCurrencyPrefix: {
    fontSize: 14,
    fontWeight: '800',
    color: '#059669',
    marginRight: 4,
  },
  discountAmountInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#065F46',
    minWidth: 0,
    padding: 0,
  },
  discountLabelInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 36,
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  discountPresetChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  discountPresetChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  discountPresetChipActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  discountPresetChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#047857',
  },
  discountPresetChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  discountSummaryBanner: {
    marginTop: 8,
    backgroundColor: '#DCFCE7',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  discountSummaryBannerError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  discountSummaryText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
  },
  discountSummaryTextError: {
    color: '#DC2626',
  },
});
