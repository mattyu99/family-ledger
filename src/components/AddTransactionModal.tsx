import React, { useState, useRef, useEffect } from 'react';
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
  Dimensions,
  TextProps,
  TextInputProps,
  Keyboard,
  Alert,
} from 'react-native';
import { HorizontalScrollView } from './HorizontalScrollView';

const safeAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

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
import { TransactionType, PaymentMethod } from '../types/database';
import {
  PAYMENT_METHOD_OPTIONS,
  DEFAULT_PAYMENT_METHODS,
  sortAccountsByUser,
  filterAccountsForUser,
  DISCOUNT_PRESET_LABELS,
  getRecommendedDiscountLabel,
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
import {
  parseTaiwanInvoiceQRCode,
  formatInvoiceNumber,
  getInvoicePeriodKey,
  isValidInvoiceNumber,
  fetchMerchantOnlineByTaxId,
  ParsedInvoiceData,
} from '../lib/invoice';
import { checkInvoiceWinning } from '../lib/lottery';
import { DatePickerModal } from './DatePickerModal';
import { InvoiceScannerModal } from './InvoiceScannerModal';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const CATEGORY_MERCHANT_PRESETS: Record<string, string[]> = {
  food: ['全聯', '麥當勞', '50嵐', '美而美', '八方雲集', '星巴克', '摩斯', '路易莎', '7-11', '全家'],
  supermarket: ['全聯', '好市多', '家樂福', '大潤發', '愛買', '7-11', '全家', '蝦皮', '屈臣氏', '康是美'],
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

interface AddTransactionModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: (createdTxId?: string) => void;
  initialMode?: 'expense' | 'income' | 'allowance' | 'memo';
  defaultRecipientId?: string;
  defaultPayerId?: string;
  defaultNote?: string;
  linkedMemoId?: string;
  linkedCompletionNote?: string;
}

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  visible,
  onClose,
  onSuccess,
  initialMode = 'expense',
  defaultRecipientId,
  defaultPayerId,
  defaultNote,
  linkedMemoId,
  linkedCompletionNote,
}) => {
  const {
    categories,
    members,
    currentUser,
    transactions,
    addTransaction,
    updateTransaction,
    transferAllowance,
    getMemberById,
    getCategoryById,
    recentMerchants,
    paymentAccounts,
    paymentMethods,
    recentMemoTags,
    recordMemoTag,
    removeRecentMemoTag,
    taxIdMerchantMap,
    recordTaxIdMerchant,
    isOwner,
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

  const [mode, setMode] = useState<'expense' | 'income' | 'allowance' | 'memo'>(initialMode);
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [paidBy, setPaidBy] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [merchant, setMerchant] = useState<string>('');
  const [note, setNote] = useState<string>('');

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
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [datePickerVisible, setDatePickerVisible] = useState<boolean>(false);
  const [memoReminderDate, setMemoReminderDate] = useState<string>('');
  const [memoReminderCalendar, setMemoReminderCalendar] = useState<CalendarSystem>('solar');
  const [memoReminderRepeat, setMemoReminderRepeat] = useState<MemoRepeatFrequency>('once');
  const [reminderPickerInitialMode, setReminderPickerInitialMode] = useState<CalendarSystem>('solar');
  const [reminderDatePickerVisible, setReminderDatePickerVisible] = useState<boolean>(false);
  const [keyboardOffset, setKeyboardOffset] = useState<number>(0);
  const scrollViewRef = useRef<ScrollView>(null);

  // 撥零用錢專用狀態
  const [allowanceMode, setAllowanceMode] = useState<'transfer' | 'expense_income'>('transfer');
  const [allowancePayerId, setAllowancePayerId] = useState<string>('');
  const [allowanceRecipientId, setAllowanceRecipientId] = useState<string>('');
  const [allowanceExpenseCatId, setAllowanceExpenseCatId] = useState<string>('');

  // 🎁 點數 / 回饋折抵專用狀態（算在原先支出交易的一環）
  const [showDiscountPanel, setShowDiscountPanel] = useState<boolean>(false);
  const [discountAmount, setDiscountAmount] = useState<string>('');
  const [discountLabel, setDiscountLabel] = useState<string>('LINE Points');
  const [discountLabelTouched, setDiscountLabelTouched] = useState<boolean>(false);
  const [discountCalcMode, setDiscountCalcMode] = useState<'subtract' | 'already_net'>('subtract');

  // 各輸入框於 ScrollView 內之 Y 座標（精準平滑滾動，避免強行 scrollToEnd）
  const [discountSectionY, setDiscountSectionY] = useState<number>(0);
  const [memoSectionY, setMemoSectionY] = useState<number>(0);
  const [merchantSectionY, setMerchantSectionY] = useState<number>(0);
  const [noteSectionY, setNoteSectionY] = useState<number>(0);
  const [invoiceSectionY, setInvoiceSectionY] = useState<number>(0);
  const [allowanceNoteSectionY, setAllowanceNoteSectionY] = useState<number>(0);
  const activeInputScrollYRef = useRef<number | null>(null);

  // 統一發票資訊狀態
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [invoiceRandomCode, setInvoiceRandomCode] = useState<string>('');
  const [invoiceSellerTaxId, setInvoiceSellerTaxId] = useState<string>('');
  const [scannerModalVisible, setScannerModalVisible] = useState<boolean>(false);
  const lastScannedItemsNoteRef = useRef<string>('');

  const applyParsedInvoice = React.useCallback((parsed: ParsedInvoiceData) => {
    if (parsed.invoiceNumber) {
      setInvoiceNumber(parsed.invoiceNumber);
    }
    if (parsed.randomCode) {
      setInvoiceRandomCode(parsed.randomCode);
    }
    if (parsed.sellerTaxId) {
      setInvoiceSellerTaxId(parsed.sellerTaxId);
    }
    if (parsed.totalAmount && parsed.totalAmount > 0) {
      setAmount(String(parsed.totalAmount));
    }
    if (parsed.invoiceDate) {
      try {
        const d = new Date(parsed.invoiceDate);
        if (!isNaN(d.getTime())) setSelectedDate(d);
      } catch {}
    }
    if (parsed.merchantName) {
      setMerchant(parsed.merchantName);
      if (parsed.sellerTaxId) {
        recordTaxIdMerchant(parsed.sellerTaxId, parsed.merchantName);
      }
    } else if (parsed.sellerTaxId) {
      // 若發票包含賣方統編但靜態庫未收錄，非同步背景即時查詢財政部稅籍並補正店家與分類
      const targetTaxId = parsed.sellerTaxId;
      fetchMerchantOnlineByTaxId(targetTaxId, 2500)
        .then(onlineInfo => {
          if (onlineInfo && onlineInfo.name) {
            setMerchant(prev => (prev ? prev : onlineInfo.name));
            recordTaxIdMerchant(targetTaxId, onlineInfo.name);
            if (onlineInfo.defaultCategoryName && type === 'expense') {
              const matchedCat = categories.find(
                c =>
                  c.type === 'expense' &&
                  (c.name === onlineInfo.defaultCategoryName ||
                    c.name.includes(onlineInfo.defaultCategoryName!) ||
                    onlineInfo.defaultCategoryName!.includes(c.name))
              );
              if (matchedCat) {
                setSelectedCategoryId(matchedCat.id);
              }
            }
          }
        })
        .catch(() => {});
    }
    if (parsed.defaultCategoryName && type === 'expense') {
      const catName = parsed.defaultCategoryName;
      const matchedCat = categories.find(
        c => c.type === 'expense' && (c.name === catName || c.name.includes(catName) || catName.includes(c.name))
      );
      if (matchedCat) {
        setSelectedCategoryId(matchedCat.id);
      }
    }
    if (parsed.itemsNote) {
      const newItemsNote = parsed.itemsNote.trim();
      setNote(prev => {
        const rawPrev = (prev || '').trim();
        const lastScanned = (lastScannedItemsNoteRef.current || '').trim();

        // 容錯防護：清除先前可能殘留的 "0 $1" 幽靈字串
        const cleanPrev = rawPrev
          .replace(/^0\s*\$1[、\n\s]*/g, '')
          .replace(/[、\n\s]*0\s*\$1/g, '')
          .trim();

        // 1. 若當前備註為空，直接帶入發票品項
        if (!cleanPrev) {
          lastScannedItemsNoteRef.current = newItemsNote;
          return newItemsNote;
        }

        // 2. 若當前備註即為上次掃描的品項（或與本次品項相同），直接替換，絕不重複疊加
        if (cleanPrev === lastScanned || cleanPrev === newItemsNote) {
          lastScannedItemsNoteRef.current = newItemsNote;
          return newItemsNote;
        }

        // 3. 若當前備註包含上次掃描的品項（例如：自訂備註\n前次品項），精確替換該段落
        if (lastScanned && cleanPrev.includes(lastScanned)) {
          lastScannedItemsNoteRef.current = newItemsNote;
          return cleanPrev.replace(lastScanned, newItemsNote);
        }

        // 4. 若當前備註已經包含完全相同的新品項（例如重複掃碼），保持原樣不重複串接
        if (cleanPrev.includes(newItemsNote)) {
          lastScannedItemsNoteRef.current = newItemsNote;
          return cleanPrev;
        }

        // 5. 若先前已有使用者手動輸入的備註，以換行接續在後方
        lastScannedItemsNoteRef.current = newItemsNote;
        return `${cleanPrev}\n${newItemsNote}`;
      });
    }
  }, [type, categories, recordTaxIdMerchant]);

  const handleInvoiceInput = (text: string) => {
    // 檢查是否為 QR Code 掃描/貼上字串 (77碼以上規範或右側品項 QR Code)
    const parsed = parseTaiwanInvoiceQRCode(text, taxIdMerchantMap);
    if (parsed && parsed.isQRCode) {
      applyParsedInvoice(parsed);
      return;
    }
    // 否則自動格式化為 AB-12345678
    setInvoiceNumber(formatInvoiceNumber(text));
  };

  const handleScanSuccess = async (data: ParsedInvoiceData) => {
    let resolvedData = data;
    // 若靜態庫未能比對出店家，且發票具備賣方統編，立即觸發即時線上稅籍登記查詢 (限時 1.8 秒快速超時，絕不卡頓)
    if (!resolvedData.merchantName && resolvedData.sellerTaxId) {
      try {
        const onlineInfo = await fetchMerchantOnlineByTaxId(resolvedData.sellerTaxId, 1800);
        if (onlineInfo?.name) {
          resolvedData = {
            ...resolvedData,
            merchantName: onlineInfo.name,
            defaultCategoryName: resolvedData.defaultCategoryName || onlineInfo.defaultCategoryName,
          };
        }
      } catch {}
    }

    applyParsedInvoice(resolvedData);
    const cleaned = resolvedData.invoiceNumber ? formatInvoiceNumber(resolvedData.invoiceNumber) : '';
    const dup = cleaned ? transactions.find(t => t.invoice_number && formatInvoiceNumber(t.invoice_number) === cleaned) : null;

    if (dup) {
      const payer = getMemberById(dup.paid_by) || currentUser;
      const dateStr = dup.transacted_at ? dup.transacted_at.split('T')[0] : '';
      safeAlert(
        '⚠️ 偵測到發票重複',
        `發票號碼：${cleaned}\n⚠️ 注意：此張發票已由「${payer.display_name}」於 ${dateStr} 記錄過（${dup.merchant || '消費'} NT$ ${dup.amount.toLocaleString()}）！\n\n系統已為您填入，儲存前請確認是否重複記帳。`
      );
    } else {
      safeAlert(
        '發票辨識成功',
        `發票號碼：${resolvedData.invoiceNumber || '未包含號碼'}${resolvedData.merchantName ? `\n店家：${resolvedData.merchantName}` : ''}${resolvedData.totalAmount ? `\n金額：NT$ ${resolvedData.totalAmount.toLocaleString()}` : ''}${resolvedData.items && resolvedData.items.length > 0 ? `\n商品明細：共 ${resolvedData.items.length} 項 (已帶入備註)` : ''}`
      );
    }
  };

  const handlePasteInvoice = async () => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          let parsed = parseTaiwanInvoiceQRCode(text.trim(), taxIdMerchantMap);
          if (parsed && (parsed.invoiceNumber || parsed.items)) {
            if (!parsed.merchantName && parsed.sellerTaxId) {
              try {
                const onlineInfo = await fetchMerchantOnlineByTaxId(parsed.sellerTaxId, 1800);
                if (onlineInfo?.name) {
                  parsed = {
                    ...parsed,
                    merchantName: onlineInfo.name,
                    defaultCategoryName: parsed.defaultCategoryName || onlineInfo.defaultCategoryName,
                  };
                }
              } catch {}
            }
            applyParsedInvoice(parsed);
            const cleaned = parsed.invoiceNumber ? formatInvoiceNumber(parsed.invoiceNumber) : '';
            const dup = cleaned ? transactions.find(t => t.invoice_number && formatInvoiceNumber(t.invoice_number) === cleaned) : null;
            if (dup) {
              const payer = getMemberById(dup.paid_by) || currentUser;
              const dateStr = dup.transacted_at ? dup.transacted_at.split('T')[0] : '';
              safeAlert(
                '⚠️ 偵測到發票重複',
                `已辨識發票號碼：${cleaned}\n⚠️ 注意：此張發票已由「${payer.display_name}」於 ${dateStr} 記錄過（${dup.merchant || '消費'} NT$ ${dup.amount.toLocaleString()}）！\n\n請確認是否重複記帳。`
              );
            } else {
              safeAlert(
                '發票解析成功',
                `已辨識並帶入發票資訊！\n號碼：${parsed.invoiceNumber || '未包含號碼'}${parsed.merchantName ? `\n店家：${parsed.merchantName}` : ''}${parsed.totalAmount ? `\n金額：NT$ ${parsed.totalAmount.toLocaleString()}` : ''}`
              );
            }
            return;
          }
          handleInvoiceInput(text.trim());
          const cleaned = formatInvoiceNumber(text.slice(0, 10));
          const dup = cleaned ? transactions.find(t => t.invoice_number && formatInvoiceNumber(t.invoice_number) === cleaned) : null;
          if (dup) {
            const payer = getMemberById(dup.paid_by) || currentUser;
            const dateStr = dup.transacted_at ? dup.transacted_at.split('T')[0] : '';
            safeAlert(
              '⚠️ 偵測到發票重複',
              `已辨識發票號碼：${cleaned}\n⚠️ 注意：此張發票已由「${payer.display_name}」於 ${dateStr} 記錄過（${dup.merchant || '消費'} NT$ ${dup.amount.toLocaleString()}）！`
            );
          } else {
            safeAlert('發票快速帶入', `已辨識發票號碼：${cleaned}`);
          }
          return;
        }
      }
    } catch {}
    safeAlert('發票快速帶入', '請直接於下方發票號碼輸入框貼上「AB-12345678」或電子發票 QR Code 77 碼文字，系統將自動解析號碼、金額與日期！');
  };

  const invoicePreview = React.useMemo(() => {
    if (!invoiceNumber || !isValidInvoiceNumber(invoiceNumber)) return null;
    const { periodKey, periodLabel } = getInvoicePeriodKey(selectedDate);
    const winning = checkInvoiceWinning(invoiceNumber, periodKey);
    return {
      periodKey,
      periodLabel,
      winning,
    };
  }, [invoiceNumber, selectedDate]);

  // 發票防重複記帳即時偵測（比對全帳本發票號碼）
  const duplicateInvoiceTx = React.useMemo(() => {
    if (!invoiceNumber || !isValidInvoiceNumber(invoiceNumber)) return null;
    const cleaned = formatInvoiceNumber(invoiceNumber);
    return transactions.find(t => {
      if (!t.invoice_number) return false;
      return formatInvoiceNumber(t.invoice_number) === cleaned;
    });
  }, [invoiceNumber, transactions]);

  // 取得有效啟用的付款方式清單（確保現金永遠存在不被全數隱藏）
  const activePaymentMethods = React.useMemo(() => {
    const list = paymentMethods && paymentMethods.length > 0 ? paymentMethods : DEFAULT_PAYMENT_METHODS;
    const enabled = list.filter(m => m.is_enabled !== false);
    if (!enabled.some(m => m.id === 'cash')) {
      const cashObj = list.find(m => m.id === 'cash') || DEFAULT_PAYMENT_METHODS[0];
      enabled.unshift(cashObj);
    }
    return enabled;
  }, [paymentMethods]);

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

  const availableCategories = categories.filter(c => c.type === type);
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

  const isToday = isSameDay(selectedDate, today);
  const isYesterday = isSameDay(selectedDate, yesterday);
  const isDayBeforeYesterday = isSameDay(selectedDate, dayBeforeYesterday);
  const isCustomDate = !isToday && !isYesterday && !isDayBeforeYesterday;
  const isCustomReminder = !!memoReminderDate && memoReminderDate !== todayYmd && memoReminderDate !== tomorrowYmd;

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

  // 智慧店家快捷建議標籤列表 (結合自學習 recentMerchants + 分類推薦 + 關鍵字即時比對)
  const suggestedMerchants = React.useMemo(() => {
    const currentCats = categories.filter(c => c.type === type);
    const targetCategory = currentCats.find(c => c.id === selectedCategoryId) || currentCats[0];
    const categoryPresets = getCategoryPresetMerchants(targetCategory?.name, type);
    const extraPresets: string[] = [];
    if (note && /茶葉蛋|茶|蛋|咖啡|拿鐵|美式|便當|麵包|飯糰|熱狗|關東煮/i.test(note)) {
      extraPresets.push('7-ELEVEN', '全家便利商店');
    }
    const pool = Array.from(new Set([...extraPresets, ...(recentMerchants || []), ...categoryPresets]));
    const query = (merchant || '').trim().toLowerCase();
    if (!query) {
      return pool.slice(0, 12);
    }
    return pool.filter(m => m.toLowerCase().includes(query)).slice(0, 10);
  }, [categories, type, selectedCategoryId, recentMerchants, merchant, note]);

  // 表單重設函式：全面清空金額、分類、付款方式、卡片與備註，回到初始純淨狀態
  const resetForm = React.useCallback(() => {
    setSelectedDate(new Date());
    setDatePickerVisible(false);
    setAmount('');
    setPaymentMethod('cash');
    setSelectedAccountId('');
    setMerchant('');
    setInvoiceNumber('');
    setInvoiceRandomCode('');
    setInvoiceSellerTaxId('');
    setMemoReminderDate('');
    setMemoReminderCalendar('solar');
    setMemoReminderRepeat('once');
    setReminderPickerInitialMode('solar');
    setReminderDatePickerVisible(false);
    setShowDiscountPanel(false);
    setDiscountAmount('');
    setDiscountLabel('LINE Points');
    setDiscountLabelTouched(false);
    setDiscountCalcMode('subtract');
    setAllowanceMode('transfer');

    const targetMode = initialMode || 'expense';
    setMode(targetMode);
    if (targetMode === 'expense' || targetMode === 'income' || targetMode === 'memo') {
      setType(targetMode);
    }

    if (defaultNote) {
      setNote(defaultNote);
    } else {
      setNote('');
    }
    lastScannedItemsNoteRef.current = '';

    const activeMember = (defaultPayerId && members.find(m => m.id === defaultPayerId))
      || members.find(m => m.id === currentUser.id)
      || getMemberById(currentUser.id)
      || members.find(m => (m.display_name || '').trim().toLowerCase() === (currentUser.display_name || '').trim().toLowerCase())
      || members[0];
    if (activeMember) {
      setPaidBy(activeMember.id);
      setAllowancePayerId(activeMember.id);
    }

    // 零用錢受款者預設值
    if (defaultRecipientId && members.some(m => m.id === defaultRecipientId)) {
      setAllowanceRecipientId(defaultRecipientId);
    } else {
      const others = members.filter(m => m.id !== (activeMember?.id || currentUser.id));
      const kid = others.find(m => m.display_name.includes('寶') || m.display_name.includes('兒') || m.display_name.includes('小') || m.display_name.includes('弟') || m.display_name.includes('妹')) || others[0];
      if (kid) {
        setAllowanceRecipientId(kid.id);
      } else if (others.length > 0) {
        setAllowanceRecipientId(others[0].id);
      }
    }

    // 零用錢支出預設分類 (育兒教育)
    const parentingCat = categories.find(c => c.type === 'expense' && (c.name.includes('育兒') || c.name.includes('教育') || c.name.includes('零用')))
      || categories.find(c => c.type === 'expense');
    if (parentingCat) {
      setAllowanceExpenseCatId(parentingCat.id);
    }

    // 預設分類：回到該收支類型之第一個預設分類
    const activeCats = categories.filter(c => c.type === (targetMode === 'income' ? 'income' : 'expense'));
    if (activeCats.length > 0) {
      setSelectedCategoryId(activeCats[0].id);
    } else {
      setSelectedCategoryId('');
    }
  }, [initialMode, defaultNote, defaultPayerId, defaultRecipientId, currentUser, members, categories, getMemberById]);

  // 當彈窗開啟時，全面執行 resetForm 確保畫面乾淨無前次殘留
  React.useEffect(() => {
    if (visible) {
      resetForm();
    }
  }, [visible, resetForm]);

  // 關閉彈窗時同步清空重設表單狀態
  const handleClose = React.useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  // 快捷金額累加
  const handleQuickAddAmount = (addVal: number) => {
    const cur = parseFloat(amount) || 0;
    setAmount(String(cur + addVal));
  };

  // 快捷備註選擇
  const handleQuickNote = (tag: string) => {
    setNote(tag);
  };

  // 送出撥零用錢 (一鍵雙向記帳)
  const handleAllowanceSubmit = async () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      safeAlert('請輸入金額', '請輸入大於 0 的零用錢金額');
      return;
    }

    const payer = members.find(m => m.id === allowancePayerId) || currentUser;
    const recipient = members.find(m => m.id === allowanceRecipientId);

    if (!recipient) {
      safeAlert('請選擇受款人', '請選擇零用錢要發放給哪位家庭成員');
      return;
    }
    if (payer.id === recipient.id) {
      safeAlert('成員不能相同', '出資家長與受款成員不能是同一個人');
      return;
    }

    try {
      const now = new Date();
      const txDate = new Date(selectedDate);
      txDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
      const transacted_at = txDate.toISOString();

      const res = await transferAllowance({
        amount: numAmount,
        fromMemberId: payer.id,
        toMemberId: recipient.id,
        mode: allowanceMode,
        expenseCategoryId: allowanceExpenseCatId || undefined,
        paymentMethod,
        accountId: selectedAccountId || undefined,
        transacted_at,
        note: note.trim() || undefined,
      });

      if (!res.success) {
        safeAlert('撥發失敗', res.error || '發放零用錢時發生錯誤');
        return;
      }

      if (allowanceMode === 'transfer') {
        safeAlert(
          '🎉 零用錢撥發成功！',
          `已為【${payer.display_name}】建立內部轉帳至【${recipient.display_name}】NT$ ${numAmount.toLocaleString()}！\n\n此筆款項不計入家庭總支出，等孩子日後使用手機記帳花費時才算入家庭支出。`
        );
      } else {
        safeAlert(
          '🎉 零用錢發放成功！',
          `已成功為【${payer.display_name}】記支出 NT$ ${numAmount.toLocaleString()}，並為【${recipient.display_name}】記零用錢收入 NT$ ${numAmount.toLocaleString()}！`
        );
      }

      // 重設表單並關閉
      setAmount('');
      setNote('');
      setPaymentMethod('cash');
      setSelectedAccountId('');
      setSelectedDate(new Date());
      onClose();
    } catch (err: any) {
      safeAlert('撥發失敗', err?.message || '發放零用錢時發生錯誤');
    }
  };

  // 生活記事與待辦備忘提交
  const handleMemoSubmit = async () => {
    if (!note.trim()) {
      safeAlert('請輸入記事內容', '請填寫您想記錄的生活記事或備忘內容');
      return;
    }

    const defaultMemoCat = categories.find(c => c.name.includes('其他') || c.name.includes('日常')) || categories[0];
    const targetPayer = paidBy || currentUser.id || members[0]?.id;

    try {
      const now = new Date();
      const txDate = new Date(selectedDate);
      txDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
      const transacted_at = txDate.toISOString();

      await addTransaction({
        amount: 0,
        type: 'memo',
        category_id: defaultMemoCat?.id || categories[0]?.id,
        paid_by: targetPayer,
        note: note.trim(),
        reminder_date: memoReminderDate || undefined,
        reminder_calendar: memoReminderDate ? memoReminderCalendar : undefined,
        reminder_repeat: memoReminderDate ? memoReminderRepeat : undefined,
        transacted_at,
      });

      setAmount('');
      setMerchant('');
      setNote('');
      setMemoReminderDate('');
      setMemoReminderCalendar('solar');
      setMemoReminderRepeat('once');
      setSelectedDate(new Date());
      onClose();
    } catch (err: any) {
      safeAlert('儲存失敗', err?.message || '儲存生活記事時發生錯誤');
    }
  };

  const parsedInputAmount = parseFloat(amount) || 0;
  const parsedDiscountAmount =
    mode === 'expense' && showDiscountPanel ? parseFloat(discountAmount) || 0 : 0;
  const previewOriginalAmount =
    parsedDiscountAmount > 0
      ? discountCalcMode === 'subtract'
        ? parsedInputAmount > 0
          ? parsedInputAmount
          : parsedDiscountAmount
        : Number((parsedInputAmount + parsedDiscountAmount).toFixed(2))
      : parsedInputAmount;
  const previewActualAmount =
    parsedDiscountAmount > 0
      ? discountCalcMode === 'subtract'
        ? parsedInputAmount > 0
          ? Math.max(0, Number((parsedInputAmount - parsedDiscountAmount).toFixed(2)))
          : 0
        : parsedInputAmount
      : parsedInputAmount;

  const handleSubmit = async () => {
    if (mode === 'allowance') {
      return handleAllowanceSubmit();
    }
    if (mode === 'memo') {
      return handleMemoSubmit();
    }

    const discNum = type === 'expense' && showDiscountPanel ? parseFloat(discountAmount) || 0 : 0;
    const rawNum = parseFloat(amount);
    const numAmount = isNaN(rawNum) ? 0 : rawNum;

    if (discNum <= 0 && numAmount <= 0) {
      safeAlert('金額無效', '請輸入有效金額');
      return;
    }

    if (discNum > 0 && numAmount < 0) {
      safeAlert('金額無效', '金額不可為負數');
      return;
    }

    if (discNum > 0 && discountCalcMode === 'subtract' && numAmount > 0 && numAmount < discNum) {
      safeAlert(
        '折抵金額超出原價',
        '折抵金額不可大於商品原價（若上方已填折抵後的實付金額，請切換為「✅ 上方已填實付」）'
      );
      return;
    }

    const finalAmount =
      discNum > 0
        ? discountCalcMode === 'subtract'
          ? numAmount > 0
            ? Math.max(0, Number((numAmount - discNum).toFixed(2)))
            : 0
          : numAmount
        : numAmount;

    const finalOriginalAmount =
      discNum > 0
        ? discountCalcMode === 'subtract'
          ? numAmount > 0
            ? numAmount
            : discNum
          : Number((numAmount + discNum).toFixed(2))
        : undefined;

    const finalNote =
      type === 'expense' && discNum > 0
        ? formatExpenseNoteWithDiscount(note, discNum, discountLabel, finalOriginalAmount)
        : note;

    const currentCats = categories.filter(c => c.type === type);
    const targetCategory = currentCats.find(c => c.id === selectedCategoryId) || currentCats[0];
    const targetPayer = paidBy || currentUser.id || members[0]?.id;

    if (!targetCategory) {
      safeAlert('尚未選擇分類', '請先選擇記帳分類');
      return;
    }

    const executeSaveTransaction = async () => {
      try {
        const now = new Date();
        const txDate = new Date(selectedDate);
        // 保留當下時間的時間戳，以利時間排序
        txDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
        const transacted_at = txDate.toISOString();

        const createdTxId = await addTransaction({
          amount: finalAmount,
          type,
          category_id: targetCategory.id,
          paid_by: targetPayer,
          merchant: merchant.trim() || undefined,
          payment_method: paymentMethod,
          account_id: selectedAccountId || undefined,
          note: finalNote,
          invoice_number: invoiceNumber.trim() || undefined,
          invoice_random_code: invoiceRandomCode.trim() || undefined,
          transacted_at,
          linked_transaction_id: linkedMemoId || undefined,
          splitWithIds: type === 'expense' ? members.map(m => m.id) : undefined,
        });

        // 自學習記憶：若發票含有賣方統編，記憶此店家名稱至本機資料庫
        if (invoiceSellerTaxId && merchant.trim()) {
          recordTaxIdMerchant(invoiceSellerTaxId, merchant.trim());
        }

        if (linkedMemoId && createdTxId) {
          // 同步雙向綁定至生活待辦，並標記已由該成員辦妥與儲存辦妥說明
          await updateTransaction(linkedMemoId, {
            linked_transaction_id: createdTxId,
            is_settled: true,
            completed_by: targetPayer,
            ...(linkedCompletionNote ? { completion_note: linkedCompletionNote } : {}),
          });
        }

        // 重設表單並關閉
        setAmount('');
        setMerchant('');
        setNote('');
        setInvoiceNumber('');
        setInvoiceRandomCode('');
        setShowDiscountPanel(false);
        setDiscountAmount('');
        setPaymentMethod('cash');
        setSelectedAccountId('');
        setSelectedDate(new Date());
        onSuccess?.(createdTxId);
        onClose();
      } catch (err: any) {
        safeAlert('儲存失敗', err.message || '儲存記帳時發生錯誤');
      }
    };

    // 發票重複防呆確認彈窗
    if (duplicateInvoiceTx) {
      const payer = getMemberById(duplicateInvoiceTx.paid_by) || currentUser;
      const dateStr = duplicateInvoiceTx.transacted_at ? duplicateInvoiceTx.transacted_at.split('T')[0] : '';
      const promptTitle = '⚠️ 偵測到重複發票';
      const promptMsg = `發票號碼「${formatInvoiceNumber(duplicateInvoiceTx.invoice_number || '')}」已於 ${dateStr} 由「${payer.display_name}」記錄過（${duplicateInvoiceTx.merchant || '消費'} NT$ ${duplicateInvoiceTx.amount.toLocaleString()}）。\n\n確定仍要重複新增這筆發票紀錄嗎？`;

      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
          if (window.confirm(`${promptTitle}\n\n${promptMsg}`)) {
            executeSaveTransaction();
          }
        }
      } else {
        Alert.alert(promptTitle, promptMsg, [
          { text: '取消返回檢查', style: 'cancel' },
          { text: '確定仍要新增', style: 'destructive', onPress: executeSaveTransaction },
        ]);
      }
      return;
    }

    executeSaveTransaction();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          {/* 頂部把手與標題 */}
          <View style={styles.header}>
            <Text style={styles.title} maxFontSizeMultiplier={1.15}>
              {mode === 'allowance' ? '🎁 撥發零用錢 (雙向記帳)' : mode === 'income' ? '新增一筆收入' : mode === 'memo' ? '📝 新增生活記事與備忘' : '新增一筆支出'}
            </Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Text style={styles.closeText} maxFontSizeMultiplier={1.15}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scrollViewRef}
            showsVerticalScrollIndicator={false}
            style={styles.scrollArea}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: dynamicBottomPadding }
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {!!linkedMemoId && (
              <View style={styles.linkedMemoBanner}>
                <Text style={styles.linkedMemoBannerText} maxFontSizeMultiplier={1.08}>
                  🔗 連動生活待辦採買：儲存時將自動為該記事打勾辦妥
                  {linkedCompletionNote ? `（回報：${linkedCompletionNote}）` : ''}
                </Text>
              </View>
            )}

            {/* 支出 / 收入 / 撥零用錢 / 記事 切換鈕 */}
            <View style={styles.typeSelector}>
              <TouchableOpacity
                style={[styles.typeBtn, mode === 'expense' && styles.typeBtnActiveExpense]}
                onPress={() => {
                  setMode('expense');
                  setType('expense');
                  const first = categories.find(c => c.type === 'expense');
                  if (first) setSelectedCategoryId(first.id);
                }}
              >
                <Text
                  style={[styles.typeBtnText, mode === 'expense' && styles.typeBtnTextActive]}
                  maxFontSizeMultiplier={1.15}
                >
                  支出
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.typeBtn, mode === 'income' && styles.typeBtnActiveIncome]}
                onPress={() => {
                  setMode('income');
                  setType('income');
                  const first = categories.find(c => c.type === 'income');
                  if (first) setSelectedCategoryId(first.id);
                }}
              >
                <Text
                  style={[styles.typeBtnText, mode === 'income' && styles.typeBtnTextActive]}
                  maxFontSizeMultiplier={1.15}
                >
                  收入
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.typeBtn, mode === 'allowance' && styles.typeBtnActiveAllowance]}
                onPress={() => {
                  setMode('allowance');
                }}
              >
                <Text
                  style={[styles.typeBtnText, mode === 'allowance' && styles.typeBtnTextActiveAllowance]}
                  maxFontSizeMultiplier={1.15}
                >
                  🎁 撥零用錢
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.typeBtn, mode === 'memo' && styles.typeBtnActiveMemo]}
                onPress={() => {
                  setMode('memo');
                  setType('memo');
                }}
              >
                <Text
                  style={[styles.typeBtnText, mode === 'memo' && styles.typeBtnTextActiveMemo]}
                  maxFontSizeMultiplier={1.15}
                >
                  📝 記事
                </Text>
              </TouchableOpacity>
            </View>

            {mode === 'memo' ? (
              <>
                {/* 生活記事專用橫幅 */}
                <View style={styles.memoBanner}>
                  <Text style={styles.memoBannerIcon}>📌</Text>
                  <View style={styles.memoBannerContent}>
                    <Text style={styles.memoBannerTitle} maxFontSizeMultiplier={1.15}>家庭生活手帳與備忘</Text>
                    <Text style={styles.memoBannerDesc} maxFontSizeMultiplier={1.08}>
                      隨手記錄生活瑣事、採買清單或重要待辦。獨立於財務統計，支援到期提醒！
                    </Text>
                  </View>
                </View>

                {/* 常用清單範本捷徑列 */}
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

                {/* 記事內容多行輸入框 */}
                <View onLayout={(e) => setMemoSectionY(e.nativeEvent.layout.y)}>
                  <View style={styles.sectionLabelRow}>
                    <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>記事內容與備忘</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <TouchableOpacity
                        style={styles.insertCheckboxBtn}
                        onPress={() => setNote(prev => insertChecklistCheckbox(prev))}
                        activeOpacity={0.7}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={styles.insertCheckboxBtnText} maxFontSizeMultiplier={1.08}>☑ ＋ 待辦方框</Text>
                      </TouchableOpacity>
                      {keyboardOffset > 0 && (
                        <TouchableOpacity onPress={Keyboard.dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Text style={styles.dismissKeyboardText} maxFontSizeMultiplier={1.08}>收起鍵盤 ▾</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                  <TextInput
                    style={styles.memoContentInput}
                    multiline
                    numberOfLines={4}
                    placeholder="記錄今天的事情、靈感、採買備忘或家庭待辦..."
                    placeholderTextColor="#9CA3AF"
                    value={note}
                    onChangeText={(text) => setNote(handleChecklistInput(note, text))}
                    onFocus={() => scrollToInput(memoSectionY, 70)}
                    textAlignVertical="top"
                    maxFontSizeMultiplier={1.15}
                  />
                </View>

                {/* 快捷情境標籤（方式 1：自動換行全顯；策略 1：依頻率智慧動態排序；長按可移除） */}
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

                {/* 記事日期 */}
                <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>記事日期</Text>
                <View style={styles.dateRow}>
                  <TouchableOpacity
                    style={[styles.dateChip, isToday && styles.dateChipActive]}
                    onPress={() => setSelectedDate(today)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dateChipText, isToday && styles.dateChipTextActive]} maxFontSizeMultiplier={1.15}>
                      今天 ({today.getMonth() + 1}/{today.getDate()})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.dateChip, isYesterday && styles.dateChipActive]}
                    onPress={() => setSelectedDate(yesterday)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dateChipText, isYesterday && styles.dateChipTextActive]} maxFontSizeMultiplier={1.15}>
                      昨天 ({yesterday.getMonth() + 1}/{yesterday.getDate()})
                    </Text>
                  </TouchableOpacity>

                  {isCustomDate && (
                    <TouchableOpacity
                      style={[styles.dateChip, styles.dateChipActive, styles.dateChipCustom]}
                      onPress={() => setDatePickerVisible(true)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.dateChipText, styles.dateChipTextActive]} maxFontSizeMultiplier={1.15}>
                        🗓️ {selectedDate.getMonth() + 1}/{selectedDate.getDate()} (自訂)
                      </Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[styles.dateMoreBtn, isCustomDate && styles.dateMoreBtnSelected]}
                    onPress={() => setDatePickerVisible(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dateMoreBtnText, isCustomDate && styles.dateMoreBtnTextSelected]} maxFontSizeMultiplier={1.15}>
                      {isCustomDate ? '✏️ 改選' : '🗓️ 更多...'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* ⏰ 待辦提醒日期與週期設定 (選填) */}
                <View style={styles.sectionLabelRow}>
                  <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>⏰ 待辦提醒日期 (選填)</Text>
                  {!!memoReminderDate && (
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
                    style={[styles.dateChip, memoReminderDate === todayYmd && styles.dateChipActive]}
                    onPress={() => setMemoReminderDate(todayYmd)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dateChipText, memoReminderDate === todayYmd && styles.dateChipTextActive]} maxFontSizeMultiplier={1.15}>
                      今天 ({today.getMonth() + 1}/{today.getDate()})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.dateChip, memoReminderDate === tomorrowYmd && styles.dateChipActive]}
                    onPress={() => setMemoReminderDate(tomorrowYmd)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dateChipText, memoReminderDate === tomorrowYmd && styles.dateChipTextActive]} maxFontSizeMultiplier={1.15}>
                      明天 ({tomorrow.getMonth() + 1}/{tomorrow.getDate()})
                    </Text>
                  </TouchableOpacity>
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
                </View>

                {/* 🔄 提醒頻率與農曆對照預覽 */}
                <View style={styles.memoRepeatCard}>
                  <View style={styles.memoRepeatHeaderRow}>
                    <Text style={styles.memoRepeatTitle} maxFontSizeMultiplier={1.08}>
                      🔄 提醒頻率與週期
                    </Text>
                    {!!memoReminderDate &&
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
                    const isSelected = paidBy === member.id;
                    const isMe = member.id === currentUser.id || (!!currentUser.display_name && currentUser.display_name === member.display_name);
                    return (
                      <TouchableOpacity
                        key={member.id}
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
                {/* 撥零用錢模式切換與說明橫幅 */}
                {mode === 'allowance' && (
                  <>
                    <View style={styles.allowanceModeSelector}>
                      <TouchableOpacity
                        style={[
                          styles.allowanceModeBtn,
                          allowanceMode === 'transfer' && styles.allowanceModeBtnActive,
                        ]}
                        onPress={() => setAllowanceMode('transfer')}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.allowanceModeBtnText,
                            allowanceMode === 'transfer' && styles.allowanceModeBtnTextActive,
                          ]}
                          maxFontSizeMultiplier={1.12}
                        >
                          ⭐️ 內部轉帳模式（推薦）
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.allowanceModeBtn,
                          allowanceMode === 'expense_income' && styles.allowanceModeBtnActive,
                        ]}
                        onPress={() => setAllowanceMode('expense_income')}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.allowanceModeBtnText,
                            allowanceMode === 'expense_income' && styles.allowanceModeBtnTextActive,
                          ]}
                          maxFontSizeMultiplier={1.12}
                        >
                          雙向收支記帳
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.allowanceBanner}>
                      <Text style={styles.allowanceBannerIcon}>💡</Text>
                      <View style={styles.allowanceBannerContent}>
                        <Text style={styles.allowanceBannerTitle} maxFontSizeMultiplier={1.15}>
                          {allowanceMode === 'transfer' ? '內部轉帳模式（推薦）' : '一鍵雙向記帳機制'}
                        </Text>
                        <Text style={styles.allowanceBannerDesc} maxFontSizeMultiplier={1.08}>
                          {allowanceMode === 'transfer'
                            ? '在成員間調撥資金，保留明細與零用錢錢包餘額，不計入家庭總支出。等孩子日後自己拿手機記帳花費時才算入家庭支出！'
                            : '自動為出資家長記「支出」，並為受款小孩記「零用錢收入」。適合小孩不拿手機記帳的家庭，直接認列為本期育兒開銷。'}
                        </Text>
                      </View>
                    </View>
                  </>
                )}

            {/* 金額輸入 */}
            <View style={styles.amountContainer}>
              <Text style={styles.currencyPrefix} maxFontSizeMultiplier={1.15}>NT$</Text>
              <TextInput
                style={styles.amountInput}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#D1D5DB"
                value={amount}
                onChangeText={setAmount}
                autoFocus={false}
                maxFontSizeMultiplier={1.15}
                underlineColorAndroid="transparent"
              />
            </View>

            {/* 快捷金額累加膠囊標籤 */}
            <View style={styles.quickAmountRow}>
              {[100, 200, 500, 1000].map(val => (
                <TouchableOpacity
                  key={val}
                  style={styles.quickAmountChip}
                  onPress={() => handleQuickAddAmount(val)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.quickAmountChipText} maxFontSizeMultiplier={1.08}>+{val.toLocaleString()}</Text>
                </TouchableOpacity>
              ))}
              {!!amount && (
                <TouchableOpacity
                  style={[styles.quickAmountChip, styles.quickAmountClearChip]}
                  onPress={() => setAmount('')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.quickAmountClearText} maxFontSizeMultiplier={1.08}>清除</Text>
                </TouchableOpacity>
              )}
              {mode === 'expense' && (
                <TouchableOpacity
                  style={[
                    styles.quickAmountChip,
                    styles.discountToggleChip,
                    showDiscountPanel && styles.discountToggleChipActive,
                  ]}
                  onPress={() => {
                    const next = !showDiscountPanel;
                    setShowDiscountPanel(next);
                    if (next && !discountLabelTouched) {
                      setDiscountLabel(getRecommendedDiscountLabel(paymentMethod, currentMethodObj?.name));
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.discountToggleChipText,
                      showDiscountPanel && styles.discountToggleChipTextActive,
                    ]}
                    maxFontSizeMultiplier={1.08}
                  >
                    {showDiscountPanel
                      ? parsedDiscountAmount > 0
                        ? `🎁 已折 $${parsedDiscountAmount.toLocaleString()} ▴`
                        : '🎁 收起折抵 ▴'
                      : '🎁 點數/回饋折抵'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* 🎁 點數 / 回饋折抵面板（算在原先支出的一環，不額外產生第 2 筆交易） */}
            {mode === 'expense' && showDiscountPanel && (
              <View
                style={styles.discountPanelBox}
                onLayout={(e) => setDiscountSectionY(e.nativeEvent.layout.y)}
              >
                <View style={styles.discountModeSwitchRow}>
                  <TouchableOpacity
                    style={[
                      styles.discountModeBtn,
                      discountCalcMode === 'subtract' && styles.discountModeBtnActive,
                    ]}
                    onPress={() => setDiscountCalcMode('subtract')}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.discountModeBtnText,
                        discountCalcMode === 'subtract' && styles.discountModeBtnTextActive,
                      ]}
                      maxFontSizeMultiplier={1.08}
                    >
                      🧮 上方填原價 (自動扣減算實付)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.discountModeBtn,
                      discountCalcMode === 'already_net' && styles.discountModeBtnActive,
                    ]}
                    onPress={() => setDiscountCalcMode('already_net')}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.discountModeBtnText,
                        discountCalcMode === 'already_net' && styles.discountModeBtnTextActive,
                      ]}
                      maxFontSizeMultiplier={1.08}
                    >
                      ✅ 上方已填實付 (僅標記折抵)
                    </Text>
                  </TouchableOpacity>
                </View>

                <HorizontalScrollView
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.discountLabelScroll}
                >
                  {smartDiscountLabels.map(lbl => {
                    const active = discountLabel === lbl;
                    return (
                      <TouchableOpacity
                        key={lbl}
                        style={[styles.discountLabelChip, active && styles.discountLabelChipActive]}
                        onPress={() => {
                          setDiscountLabel(lbl);
                          setDiscountLabelTouched(true);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.discountLabelChipText,
                            active && styles.discountLabelChipTextActive,
                          ]}
                          maxFontSizeMultiplier={1.08}
                        >
                          {active ? `✓ ${lbl}` : lbl}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </HorizontalScrollView>

                <View style={styles.discountInputRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.discountFieldLabel} maxFontSizeMultiplier={1.08}>
                      折抵名稱 (自訂常輸會自動記憶為快捷膠囊)
                    </Text>
                    <TextInput
                      style={styles.discountTextInput}
                      value={discountLabel}
                      onChangeText={val => {
                        setDiscountLabel(val);
                        setDiscountLabelTouched(true);
                      }}
                      onFocus={() => scrollToInput(discountSectionY + 45, 210)}
                      placeholder="例如：LINE Points、mo幣"
                      placeholderTextColor="#94A3B8"
                      maxFontSizeMultiplier={1.08}
                    />
                  </View>

                  <View style={{ width: 120 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={[styles.discountFieldLabel, { marginBottom: 0 }]} maxFontSizeMultiplier={1.08}>
                        折抵金額 (NT$)
                      </Text>
                      {keyboardOffset > 0 && (
                        <TouchableOpacity onPress={Keyboard.dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Text style={styles.dismissKeyboardText} maxFontSizeMultiplier={1.08}>收起 ▾</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <TextInput
                      style={[styles.discountTextInput, styles.discountAmountInput]}
                      value={discountAmount}
                      onChangeText={setDiscountAmount}
                      onFocus={() => scrollToInput(discountSectionY + 45, 210)}
                      keyboardType="numeric"
                      placeholder="例如 30"
                      placeholderTextColor="#94A3B8"
                      maxFontSizeMultiplier={1.08}
                    />
                  </View>
                </View>

                {parsedDiscountAmount > 0 && (
                  <View style={styles.discountPreviewBanner}>
                    <Text style={styles.discountPreviewText} maxFontSizeMultiplier={1.08}>
                      {previewActualAmount === 0
                        ? '🎉 全額點數折抵！實際入帳支出：'
                        : '💡 實際入帳支出：'}
                      <Text style={styles.discountPreviewHighlight}>
                        {' '}NT$ {previewActualAmount.toLocaleString()}{' '}
                      </Text>
                      （原價 ${previewOriginalAmount.toLocaleString()} － 🎁 {discountLabel || '點數'} 折抵 ${parsedDiscountAmount.toLocaleString()}）
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* 模式切換：零用錢專屬表單 VS 一般收支表單 */}
            {mode === 'allowance' ? (
              <>
                {/* 出資家長選擇 */}
                <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>出資家長 (付款支出方)</Text>
                <View style={styles.payerRow}>
                  {members.map(member => {
                    const isSelected = allowancePayerId === member.id;
                    const isMe = member.id === currentUser.id || (!!currentUser.display_name && currentUser.display_name === member.display_name);
                    return (
                      <TouchableOpacity
                        key={member.id}
                        style={[styles.payerChip, isSelected && styles.payerChipActive]}
                        onPress={() => {
                          setAllowancePayerId(member.id);
                          if (allowanceRecipientId === member.id) {
                            const other = members.find(m => m.id !== member.id);
                            if (other) setAllowanceRecipientId(other.id);
                          }
                        }}
                        activeOpacity={0.7}
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

                {/* 受款小孩 / 成員選擇 */}
                <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>受款小孩 / 成員 (零用錢入帳方)</Text>
                <View style={styles.payerRow}>
                  {members.filter(m => m.id !== allowancePayerId).map(member => {
                    const isSelected = allowanceRecipientId === member.id;
                    return (
                      <TouchableOpacity
                        key={member.id}
                        style={[
                          styles.payerChip,
                          isSelected && styles.recipientChipActive,
                        ]}
                        onPress={() => setAllowanceRecipientId(member.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.payerAvatar}>{member.avatar_url}</Text>
                        <Text
                          style={[styles.payerName, isSelected && styles.recipientNameActive]}
                          maxFontSizeMultiplier={1.15}
                        >
                          {member.display_name}
                        </Text>
                        {isSelected && (
                          <View style={styles.recipientBadge}>
                            <Text style={styles.recipientBadgeText} maxFontSizeMultiplier={1.08}>入帳</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* 雙向分類展示 */}
                <View style={styles.allowanceCatSection}>
                  <View style={styles.sectionLabelRow}>
                    <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>雙向記帳分類</Text>
                    <Text style={styles.dateHintText} maxFontSizeMultiplier={1.15}>(系統自動配對)</Text>
                  </View>
                  <View style={styles.allowanceCatFlow}>
                    <View style={styles.allowanceCatBox}>
                      <Text style={styles.allowanceCatBoxTitle} maxFontSizeMultiplier={1.08}>出資支出分類</Text>
                      <Text style={styles.allowanceCatBoxVal} maxFontSizeMultiplier={1.15}>
                        {getCategoryById(allowanceExpenseCatId)?.icon || '👶'} {getCategoryById(allowanceExpenseCatId)?.name || '育兒教育'}
                      </Text>
                    </View>
                    <Text style={styles.allowanceCatArrow}>➔</Text>
                    <View style={[styles.allowanceCatBox, styles.allowanceCatBoxIncome]}>
                      <Text style={[styles.allowanceCatBoxTitle, { color: '#059669' }]} maxFontSizeMultiplier={1.08}>小孩收入分類</Text>
                      <Text style={[styles.allowanceCatBoxVal, { color: '#047857' }]} maxFontSizeMultiplier={1.15}>
                        💵 零用錢
                      </Text>
                    </View>
                  </View>
                </View>

                {/* 付款方式與卡片 */}
                <View style={styles.sectionLabelRow}>
                  <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>出資支付方式</Text>
                </View>
                <View style={styles.methodRow}>
                  {activePaymentMethods.map((opt) => {
                    const isSelected = paymentMethod === opt.id;
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[
                          styles.methodChip,
                          isSelected && { borderColor: opt.color || '#4F46E5', backgroundColor: `${opt.color || '#4F46E5'}15` },
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

                {/* 子層：信用卡列表 */}
                {supportsCreditCard && creditCards.length > 0 && (
                  <View style={styles.subCardContainer}>
                    <Text style={styles.subCardLabel} maxFontSizeMultiplier={1.15}>
                      💳 選擇扣款卡片 (對帳核算使用){inAdminMode ? ' · 👑 管理員模式(全體卡片)' : ''}：
                    </Text>
                    <HorizontalScrollView showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardScroll}>
                      {creditCards.map(card => {
                        const isCardSelected = selectedAccountId === card.id;
                        return (
                          <TouchableOpacity
                            key={card.id}
                            style={[
                              styles.cardChip,
                              isCardSelected && { borderColor: card.color || '#3B82F6', backgroundColor: '#EFF6FF' },
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

                {/* 子層：當選擇銀行轉帳時，展開銀行帳戶列表 */}
                {isBankTransfer && bankAccounts.length > 0 && (
                  <View style={styles.subCardContainer}>
                    <Text style={styles.subCardLabel} maxFontSizeMultiplier={1.15}>
                      🏦 選擇入帳銀行帳戶 (選填){inAdminMode ? ' · 👑 管理員模式(全體帳戶)' : ''}：
                    </Text>
                    <HorizontalScrollView showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardScroll}>
                      {bankAccounts.map(account => {
                        const isAccountSelected = selectedAccountId === account.id;
                        const cardholder = getMemberById(account.user_id);
                        return (
                          <TouchableOpacity
                            key={account.id}
                            style={[
                              styles.cardChip,
                              isAccountSelected && { borderColor: account.color || '#8B5CF6', backgroundColor: '#F5F3FF' },
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
                                {cardholder ? cardholder.display_name : '全家通用'}
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

                {/* 記帳日期選擇 */}
                <View style={styles.sectionLabelRow}>
                  <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>發放日期</Text>
                  {!isToday && (
                    <Text style={styles.dateHintText} maxFontSizeMultiplier={1.15}>
                      (補記：{selectedDate.getFullYear()}/{selectedDate.getMonth() + 1}/{selectedDate.getDate()})
                    </Text>
                  )}
                </View>
                <View style={styles.dateRow}>
                  <TouchableOpacity
                    style={[styles.dateChip, isToday && styles.dateChipActive]}
                    onPress={() => setSelectedDate(today)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dateChipText, isToday && styles.dateChipTextActive]} maxFontSizeMultiplier={1.15}>
                      📍 今天 ({today.getMonth() + 1}/{today.getDate()})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.dateChip, isYesterday && styles.dateChipActive]}
                    onPress={() => setSelectedDate(yesterday)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dateChipText, isYesterday && styles.dateChipTextActive]} maxFontSizeMultiplier={1.15}>
                      昨天 ({yesterday.getMonth() + 1}/{yesterday.getDate()})
                    </Text>
                  </TouchableOpacity>

                  {isCustomDate && (
                    <TouchableOpacity
                      style={[styles.dateChip, styles.dateChipActive, styles.dateChipCustom]}
                      onPress={() => setDatePickerVisible(true)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.dateChipText, styles.dateChipTextActive]} maxFontSizeMultiplier={1.15}>
                        🗓️ {selectedDate.getMonth() + 1}/{selectedDate.getDate()} (自訂)
                      </Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[styles.dateMoreBtn, isCustomDate && styles.dateMoreBtnSelected]}
                    onPress={() => setDatePickerVisible(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dateMoreBtnText, isCustomDate && styles.dateMoreBtnTextSelected]} maxFontSizeMultiplier={1.15}>
                      {isCustomDate ? '✏️ 改選' : '🗓️ 更多...'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* 發放事由與備註 */}
                <View style={styles.sectionLabelRow}>
                  <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>發放事由與備註</Text>
                  {keyboardOffset > 0 && (
                    <TouchableOpacity onPress={Keyboard.dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={styles.dismissKeyboardText} maxFontSizeMultiplier={1.08}>收起鍵盤 ▾</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.quickNoteRow}>
                  {['每週零用錢', '做家事獎勵', '段考進步', '生日紅包', '好表現獎勵', '伙食津貼'].map(tag => (
                    <TouchableOpacity
                      key={tag}
                      style={styles.quickNoteChip}
                      onPress={() => handleQuickNote(tag)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.quickNoteChipText} maxFontSizeMultiplier={1.08}>{tag}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View onLayout={(e) => setAllowanceNoteSectionY(e.nativeEvent.layout.y)}>
                  <TextInput
                    style={styles.noteInput}
                    placeholder="例如：每週零用錢、考試進步獎勵..."
                    placeholderTextColor="#9CA3AF"
                    value={note}
                    onChangeText={setNote}
                    onFocus={() => scrollToInput(allowanceNoteSectionY, 300)}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    maxFontSizeMultiplier={1.15}
                  />
                </View>
              </>
            ) : (
              <>
                {/* 分類選擇 */}
                <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>選擇分類</Text>
                <View style={styles.categoryGrid}>
                  {availableCategories.map(cat => {
                    const isSelected = selectedCategoryId === cat.id;
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        style={[
                          styles.categoryChip,
                          isSelected && { backgroundColor: `${cat.color}25`, borderColor: cat.color },
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
                    const isMe = member.id === currentUser.id || (!!currentUser.display_name && currentUser.display_name === member.display_name);
                    return (
                      <TouchableOpacity
                        key={member.id}
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
                        style={[
                          styles.methodChip,
                          isSelected && { borderColor: opt.color || '#4F46E5', backgroundColor: `${opt.color || '#4F46E5'}15` },
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
                            style={[
                              styles.cardChip,
                              isCardSelected && { borderColor: card.color || '#3B82F6', backgroundColor: '#EFF6FF' },
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
                            style={[
                              styles.cardChip,
                              isCardSelected && { borderColor: card.color || '#0284C7', backgroundColor: '#F0F9FF' },
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
                            style={[
                              styles.cardChip,
                              isAccountSelected && { borderColor: account.color || '#8B5CF6', backgroundColor: '#F5F3FF' },
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
                                {cardholder ? cardholder.display_name : '全家通用'}
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

                {/* 記帳日期選擇 */}
                <View style={styles.sectionLabelRow}>
                  <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>記帳日期</Text>
                  {!isToday && (
                    <Text style={styles.dateHintText} maxFontSizeMultiplier={1.15}>
                      (補記：{selectedDate.getFullYear()}/{selectedDate.getMonth() + 1}/{selectedDate.getDate()})
                    </Text>
                  )}
                </View>
                <View style={styles.dateRow}>
                  <TouchableOpacity
                    style={[styles.dateChip, isToday && styles.dateChipActive]}
                    onPress={() => setSelectedDate(today)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[styles.dateChipText, isToday && styles.dateChipTextActive]}
                      maxFontSizeMultiplier={1.15}
                    >
                      📍 今天 ({today.getMonth() + 1}/{today.getDate()})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.dateChip, isYesterday && styles.dateChipActive]}
                    onPress={() => setSelectedDate(yesterday)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[styles.dateChipText, isYesterday && styles.dateChipTextActive]}
                      maxFontSizeMultiplier={1.15}
                    >
                      昨天 ({yesterday.getMonth() + 1}/{yesterday.getDate()})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.dateChip, isDayBeforeYesterday && styles.dateChipActive]}
                    onPress={() => setSelectedDate(dayBeforeYesterday)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[styles.dateChipText, isDayBeforeYesterday && styles.dateChipTextActive]}
                      maxFontSizeMultiplier={1.15}
                    >
                      前天 ({dayBeforeYesterday.getMonth() + 1}/{dayBeforeYesterday.getDate()})
                    </Text>
                  </TouchableOpacity>

                  {/* 若選擇了更早的自訂日期，單獨顯示高亮 Chip */}
                  {isCustomDate && (
                    <TouchableOpacity
                      style={[styles.dateChip, styles.dateChipActive, styles.dateChipCustom]}
                      onPress={() => setDatePickerVisible(true)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[styles.dateChipText, styles.dateChipTextActive]}
                        maxFontSizeMultiplier={1.15}
                      >
                        🗓️ {selectedDate.getMonth() + 1}/{selectedDate.getDate()} (特定日期)
                      </Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[styles.dateMoreBtn, isCustomDate && styles.dateMoreBtnSelected]}
                    onPress={() => setDatePickerVisible(true)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[styles.dateMoreBtnText, isCustomDate && styles.dateMoreBtnTextSelected]}
                      maxFontSizeMultiplier={1.15}
                    >
                      {isCustomDate ? '✏️ 改選其他日期' : '📅 選擇特定日期...'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* 店家 / 對象 (選填) */}
                <View onLayout={(e) => setMerchantSectionY(e.nativeEvent.layout.y)}>
                  <View style={styles.sectionLabelRow}>
                    <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>店家 / 付款對象 (選填)</Text>
                    {!!merchant && (
                      <TouchableOpacity onPress={() => setMerchant('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={styles.clearMerchantText} maxFontSizeMultiplier={1.08}>清除</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={styles.merchantInputWrapper}>
                    <Text style={styles.merchantInputIcon}>🏪</Text>
                    <TextInput
                      style={styles.merchantInput}
                      placeholder="例如：全聯、好市多、麥當勞、中油..."
                      placeholderTextColor="#9CA3AF"
                      value={merchant}
                      onChangeText={setMerchant}
                      onFocus={() => scrollToInput(merchantSectionY, 350)}
                      returnKeyType="next"
                      maxFontSizeMultiplier={1.15}
                    />
                    {!!merchant && (
                      <TouchableOpacity onPress={() => setMerchant('')} style={styles.merchantClearBtn}>
                        <Text style={styles.merchantClearBtnText}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* 智慧自學習快捷膠囊標籤 */}
                {suggestedMerchants.length > 0 && (
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
                    {keyboardOffset > 0 && (
                      <TouchableOpacity onPress={Keyboard.dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={styles.dismissKeyboardText} maxFontSizeMultiplier={1.08}>收起鍵盤 ▾</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <TextInput
                    style={styles.noteInput}
                    placeholder="例如：好市多牛肉、加滿油、水電費..."
                    placeholderTextColor="#9CA3AF"
                    value={note}
                    onChangeText={setNote}
                    onFocus={() => scrollToInput(noteSectionY, 450)}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    maxFontSizeMultiplier={1.15}
                  />
                </View>

                {/* 統一發票輸入與對獎預覽 */}
                <View onLayout={(e) => setInvoiceSectionY(e.nativeEvent.layout.y)} style={styles.invoiceInputContainer}>
                  <View style={styles.sectionLabelRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>🧾 統一發票</Text>
                      <Text style={styles.optionalBadgeText} maxFontSizeMultiplier={1.08}>(選填 · 自動對獎)</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        style={styles.invoiceScanBtn}
                        onPress={() => setScannerModalVisible(true)}
                      >
                        <Text style={styles.invoiceScanBtnText} maxFontSizeMultiplier={1.08}>📷 掃描發票</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        style={styles.invoicePasteBtn}
                        onPress={handlePasteInvoice}
                      >
                        <Text style={styles.invoicePasteBtnText} maxFontSizeMultiplier={1.08}>📋 貼上</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.invoiceInputRow}>
                    <TextInput
                      style={[styles.invoiceNumberInput, !!invoicePreview?.winning.isWon && styles.invoiceInputWon]}
                      placeholder="例如：AB-12345678 (貼上QR碼自動解析)"
                      placeholderTextColor="#9CA3AF"
                      value={invoiceNumber}
                      onChangeText={handleInvoiceInput}
                      autoCapitalize="characters"
                      maxLength={11}
                      onFocus={() => scrollToInput(invoiceSectionY, 450)}
                      returnKeyType="next"
                      maxFontSizeMultiplier={1.15}
                    />
                    <TextInput
                      style={styles.invoiceRandomCodeInput}
                      placeholder="隨機碼"
                      placeholderTextColor="#9CA3AF"
                      value={invoiceRandomCode}
                      onChangeText={setInvoiceRandomCode}
                      keyboardType="number-pad"
                      maxLength={4}
                      onFocus={() => scrollToInput(invoiceSectionY, 450)}
                      maxFontSizeMultiplier={1.15}
                    />
                  </View>

                  {/* 即時對獎與期別指示徽章 */}
                  {invoicePreview && (
                    <View style={[
                      styles.invoiceStatusRow,
                      invoicePreview.winning.isWon && styles.invoiceStatusRowWon,
                    ]}>
                      <Text style={[
                        styles.invoiceStatusText,
                        invoicePreview.winning.isWon && styles.invoiceStatusTextWon,
                      ]} maxFontSizeMultiplier={1.08}>
                        {invoicePreview.winning.isDrawn
                          ? invoicePreview.winning.isWon
                            ? `🎉 中獎 NT$ ${invoicePreview.winning.prizeAmount.toLocaleString()} (${invoicePreview.winning.prizeName})`
                            : `未中獎 (${invoicePreview.periodLabel})`
                          : `🎯 歸屬 ${invoicePreview.periodLabel} (待開獎)`}
                      </Text>
                    </View>
                  )}

                  {/* 發票防重複記帳即時警示橫幅 */}
                  {duplicateInvoiceTx && (
                    <View style={styles.duplicateWarningBox}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                        <Text style={styles.duplicateWarningIcon}>⚠️</Text>
                        <Text style={styles.duplicateWarningTitle} maxFontSizeMultiplier={1.12}>
                          偵測到此發票號碼已在帳本中記錄過！
                        </Text>
                      </View>
                      <Text style={styles.duplicateWarningDesc} maxFontSizeMultiplier={1.08}>
                        已由【{(getMemberById(duplicateInvoiceTx.paid_by) || currentUser).display_name}】於 {duplicateInvoiceTx.transacted_at ? duplicateInvoiceTx.transacted_at.split('T')[0] : '歷史記錄'} 登記（{duplicateInvoiceTx.merchant || '消費'} NT$ {duplicateInvoiceTx.amount.toLocaleString()}），請確認避免重複記帳。
                      </Text>
                    </View>
                  )}
                </View>
              </>
            )}
          </>
        )}

        {/* 儲存 / 一鍵撥款 / 儲存記事按鈕 */}
        <TouchableOpacity
          style={[
            styles.submitBtn,
            mode === 'allowance' && styles.submitBtnAllowance,
            mode === 'memo' && styles.submitBtnMemo,
          ]}
          onPress={handleSubmit}
        >
          <Text style={styles.submitBtnText} maxFontSizeMultiplier={1.15}>
            {mode === 'allowance'
              ? '🎁 一鍵撥款 (自動建立雙向收支)'
              : mode === 'memo'
              ? '📌 儲存生活記事'
              : mode === 'expense' && parsedDiscountAmount > 0
              ? `儲存記帳 (實付 NT$ ${previewActualAmount.toLocaleString()} · 已折 $${parsedDiscountAmount.toLocaleString()})`
              : '儲存記帳'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  </KeyboardAvoidingView>

  <DatePickerModal
    visible={datePickerVisible}
    onClose={() => setDatePickerVisible(false)}
    selectedDate={selectedDate}
    onSelectDate={(newDate: Date) => setSelectedDate(newDate)}
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

  <InvoiceScannerModal
    visible={scannerModalVisible}
    onClose={() => setScannerModalVisible(false)}
    onScanSuccess={handleScanSuccess}
  />
</Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
    width: '100%',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    maxHeight: Math.min(SCREEN_HEIGHT * 0.9, 740),
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  scrollArea: {
    width: '100%',
  },
  scrollContent: {
    width: '100%',
    paddingBottom: 20,
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
  closeBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  closeText: {
    fontSize: 16,
    color: '#9CA3AF',
    fontWeight: 'bold',
  },
  typeSelector: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 3,
    marginBottom: 10,
    width: '100%',
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 8,
  },
  typeBtnActiveExpense: {
    backgroundColor: '#EF4444',
  },
  typeBtnActiveIncome: {
    backgroundColor: '#10B981',
  },
  typeBtnActiveAllowance: {
    backgroundColor: '#8B5CF6',
  },
  typeBtnActiveMemo: {
    backgroundColor: '#F59E0B',
  },
  typeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  typeBtnTextActive: {
    color: '#FFFFFF',
  },
  typeBtnTextActiveAllowance: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  typeBtnTextActiveMemo: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1.5,
    borderColor: '#E5E7EB',
    paddingVertical: 4,
    marginBottom: 12,
    width: '100%',
    minWidth: 0,
    minHeight: 48,
  },
  currencyPrefix: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    minWidth: 0,
    width: '100%',
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    padding: 0,
    paddingVertical: 0,
    height: 42,
    textAlignVertical: 'center',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 6,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
    width: '100%',
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    maxWidth: '100%',
  },
  categoryChipIcon: {
    fontSize: 13,
    marginRight: 4,
  },
  categoryChipText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },
  payerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
    width: '100%',
  },
  payerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: 'transparent',
    maxWidth: '100%',
  },
  payerChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
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
    width: '100%',
  },
  dateChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
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
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateMoreBtnSelected: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  dateMoreBtnText: {
    fontSize: 12,
    color: '#0284C7',
    fontWeight: '700',
  },
  dateMoreBtnTextSelected: {
    color: '#4F46E5',
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
  submitBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
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
  allowanceModeSelector: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
    marginBottom: 10,
    gap: 4,
  },
  allowanceModeBtn: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allowanceModeBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  allowanceModeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  allowanceModeBtnTextActive: {
    color: '#6D28D9',
    fontWeight: '700',
  },
  allowanceBanner: {
    flexDirection: 'row',
    backgroundColor: '#F5F3FF',
    borderColor: '#DDD6FE',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    alignItems: 'center',
    gap: 10,
  },
  allowanceBannerIcon: {
    fontSize: 22,
  },
  allowanceBannerContent: {
    flex: 1,
  },
  allowanceBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6D28D9',
    marginBottom: 2,
  },
  allowanceBannerDesc: {
    fontSize: 12,
    color: '#5B21B6',
    lineHeight: 16,
  },
  quickAmountRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  quickAmountChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  quickAmountChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  quickAmountClearChip: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  quickAmountClearText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },
  recipientChipActive: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
  },
  recipientNameActive: {
    color: '#065F46',
    fontWeight: '700',
  },
  recipientBadge: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    backgroundColor: '#10B981',
    borderRadius: 6,
  },
  recipientBadgeText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  allowanceCatSection: {
    marginBottom: 14,
  },
  allowanceCatFlow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  allowanceCatBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  allowanceCatBoxIncome: {
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FDF4',
  },
  allowanceCatBoxTitle: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
    marginBottom: 3,
  },
  allowanceCatBoxVal: {
    fontSize: 13,
    color: '#1F2937',
    fontWeight: '700',
  },
  allowanceCatArrow: {
    fontSize: 16,
    color: '#9CA3AF',
    marginHorizontal: 8,
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
  submitBtnAllowance: {
    backgroundColor: '#8B5CF6',
  },
  submitBtnMemo: {
    backgroundColor: '#D97706',
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
  linkedMemoBanner: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  linkedMemoBannerText: {
    fontSize: 12.5,
    color: '#1D4ED8',
    fontWeight: '600',
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
    backgroundColor: '#ECFDF5',
    borderColor: '#6EE7B7',
  },
  discountToggleChipActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  discountToggleChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
  },
  discountToggleChipTextActive: {
    color: '#FFFFFF',
  },
  discountPanelBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  discountModeSwitchRow: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
    padding: 2,
    marginBottom: 10,
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
  },
  discountModeBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  discountModeBtnTextActive: {
    color: '#047857',
    fontWeight: '700',
  },
  discountLabelScroll: {
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 8,
  },
  discountLabelChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  discountLabelChipActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#10B981',
  },
  discountLabelChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  discountLabelChipTextActive: {
    color: '#065F46',
    fontWeight: '700',
  },
  discountInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  discountFieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#065F46',
    marginBottom: 4,
  },
  discountTextInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    color: '#0F172A',
  },
  discountAmountInput: {
    fontWeight: '700',
    color: '#059669',
  },
  discountPreviewBanner: {
    marginTop: 10,
    backgroundColor: '#DCFCE7',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  discountPreviewText: {
    fontSize: 11.5,
    color: '#065F46',
    fontWeight: '600',
  },
  discountPreviewHighlight: {
    fontSize: 13,
    fontWeight: '800',
    color: '#047857',
  },
  invoiceInputContainer: {
    marginTop: 14,
  },
  optionalBadgeText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  invoiceScanBtn: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  invoiceScanBtnText: {
    fontSize: 11.5,
    color: '#059669',
    fontWeight: '700',
  },
  invoicePasteBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  invoicePasteBtnText: {
    fontSize: 11.5,
    color: '#2563EB',
    fontWeight: '600',
  },
  invoiceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  invoiceNumberInput: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  invoiceInputWon: {
    borderColor: '#F59E0B',
    backgroundColor: '#FEF3C7',
  },
  invoiceRandomCodeInput: {
    width: 76,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 13,
    color: '#1F2937',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  invoiceStatusRow: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    alignSelf: 'flex-start',
  },
  invoiceStatusRowWon: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  invoiceStatusText: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '600',
  },
  invoiceStatusTextWon: {
    color: '#B45309',
    fontWeight: '700',
  },
  duplicateWarningBox: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  duplicateWarningIcon: {
    fontSize: 14,
  },
  duplicateWarningTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
  },
  duplicateWarningDesc: {
    fontSize: 11,
    color: '#92400E',
    lineHeight: 16,
  },
});
