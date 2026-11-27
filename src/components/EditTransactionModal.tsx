import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Keyboard,
  Image,
} from 'react-native';
import { Text, TextInput } from './common/Text';

import { HorizontalScrollView } from './HorizontalScrollView';
import { useLedger } from '../context/LedgerContext';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { Transaction, TransactionType, PaymentMethod } from '../types/database';
import {
  PAYMENT_METHOD_OPTIONS,
  DEFAULT_PAYMENT_METHODS,
  formatPaymentLabel,
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
  DEFAULT_MEMO_QUICK_TAGS,
  getMergedMemoTags,
  toggleMemoTag,
  isMemoTagActive,
  BUILTIN_MEMO_TEMPLATES,
  MemoChecklistTemplate,
  applyChecklistTemplate,
  insertChecklistCheckbox,
  handleChecklistInput,
  formatMemoCompletedTime,
  decodeMemoMerchantTag,
  parseMemoNote,
  isMemoPinned,
  checkMemoPinQuota,
  extractDateFromText,
  offsetDateYmd,
  analyzeMemoRelaySchedule,
  isMemoRelayEnabled,
  getMemoRelayOffsetDays,
  resolveAnchorDate,
  detectMemoQuickBuilderConfig,
  removeMemoTag,
  getMemoTagDisplayLabel,
  appendSchoolChecklistItem,
  QuickBuilderDomain,
} from '../lib/memo';
import {
  getNotificationPreferences,
  NotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  formatMemoAdvanceLabel,
} from '../lib/billingNotifications';
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
  stripInvoiceTag,
  fetchMerchantOnlineByTaxId,
  cleanBusinessName,
  ParsedInvoiceData,
} from '../lib/invoice';
import { checkInvoiceWinning } from '../lib/lottery';
import { DatePickerModal } from './DatePickerModal';
import { InvoiceScannerModal } from './InvoiceScannerModal';
import { ImageViewerModal } from './ImageViewerModal';
import { ReceiptSourceModal } from './ReceiptSourceModal';
import {
  uploadReceiptPhoto,
  isPdfReceipt,
  extractReceiptFileName,
  resolveReceiptMimeType,
  MAX_RECEIPT_FILE_BYTES,
} from '../lib/receiptStorage';
import { isDemoLedgerId } from '../constants/sweethomeDemo';
import { isGroupOrderMemo } from '../lib/groupOrder';
import { showConfirm } from '../lib/alert';

let ImagePickerModule: any = null;
try {
  ImagePickerModule = require('expo-image-picker');
} catch {}

let DocumentPickerModule: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const docPkg = require('expo-document-picker');
  if (docPkg?.getDocumentAsync) {
    DocumentPickerModule = docPkg;
  }
} catch {
  DocumentPickerModule = null;
}

const safeAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

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
    getAccountById,
    recentMerchants,
    paymentAccounts,
    paymentMethods,
    recentMemoTags,
    dismissedMemoTags,
    recordMemoTag,
    removeRecentMemoTag,
    taxIdMerchantMap,
    recordTaxIdMerchant,
    isAdminMode,
  } = useLedger();
  const { isDark, colors } = useTheme();
  const styles = useMemo(() => getStyles(isDark, colors), [isDark, colors]);

  const inAdminMode = Boolean(isAdminMode || isOwner);

  const smartDiscountLabels = React.useMemo(
    () => getSmartDiscountLabels(transactions),
    [transactions]
  );

  const displayedMemoTags = React.useMemo(() => {
    return getMergedMemoTags(recentMemoTags, dismissedMemoTags);
  }, [recentMemoTags, dismissedMemoTags]);

  const handleLongPressMemoTag = React.useCallback((tag: string) => {
    if (DEFAULT_MEMO_QUICK_TAGS.includes(tag)) {
      return; // 內建核心標籤常駐保留在最前面
    }
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`是否將「${tag}」從自訂快捷標籤中移除？`)) {
        removeRecentMemoTag(tag);
      }
    } else {
      Alert.alert(
        '移除自訂快捷標籤',
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
  const [memoReminderDate, setMemoReminderDate] = useState<string>(() => {
    if (transaction?.reminder_date) return transaction.reminder_date;
    const decoded = decodeMemoMerchantTag(transaction?.merchant);
    return decoded.reminderDate || '';
  });
  const [memoReminderCalendar, setMemoReminderCalendar] = useState<CalendarSystem>(() => {
    if (transaction?.reminder_calendar) return transaction.reminder_calendar;
    const decoded = decodeMemoMerchantTag(transaction?.merchant);
    return decoded.reminderCalendar || 'solar';
  });
  const [memoReminderRepeat, setMemoReminderRepeat] = useState<MemoRepeatFrequency>(() => {
    if (transaction?.reminder_repeat) return transaction.reminder_repeat;
    const decoded = decodeMemoMerchantTag(transaction?.merchant);
    return decoded.reminderRepeat || 'once';
  });
  const [memoReminderTarget, setMemoReminderTarget] = useState<'family' | 'personal'>(
    () => transaction?.reminder_target || 'family'
  );
  const [memoReminderRelay, setMemoReminderRelay] = useState<boolean>(() => isMemoRelayEnabled(transaction));
  const [memoReminderRelayOffset, setMemoReminderRelayOffset] = useState<number | undefined>(() => getMemoRelayOffsetDays(transaction));
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  useEffect(() => {
    if (visible) {
      getNotificationPreferences().then(setNotifPrefs).catch(() => {});
    }
  }, [visible]);
  const [reminderPickerInitialMode, setReminderPickerInitialMode] = useState<CalendarSystem>(() => {
    if (transaction?.reminder_calendar) return transaction.reminder_calendar;
    const decoded = decodeMemoMerchantTag(transaction?.merchant);
    return decoded.reminderCalendar || 'solar';
  });
  const [isSettled, setIsSettled] = useState<boolean>(() => !!transaction?.is_settled);
  const [isPinned, setIsPinned] = useState<boolean>(() => (transaction ? isMemoPinned(transaction) : false));
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
  const [selectedSchoolSubject, setSelectedSchoolSubject] = useState<string>('國文');
  const [isMemoTagDrawerOpen, setIsMemoTagDrawerOpen] = useState<boolean>(false);
  const [isMemoTemplateDrawerOpen, setIsMemoTemplateDrawerOpen] = useState<boolean>(false);
  const [memoDrawerTab, setMemoDrawerTab] = useState<'templates' | 'quickBuilder'>('templates');
  const [selectedBuilderDomain, setSelectedBuilderDomain] = useState<string>('school');

  const activeMemoTag = React.useMemo(() => {
    return displayedMemoTags.find(tag => isMemoTagActive(note, tag));
  }, [displayedMemoTags, note]);

  const activeQuickBuilder = React.useMemo(
    () => detectMemoQuickBuilderConfig(note, (members || []).map(m => m.display_name), selectedSchoolSubject),
    [note, members, selectedSchoolSubject]
  );

  const currentBuilderConfig = React.useMemo(() => {
    if (activeQuickBuilder) {
      return activeQuickBuilder;
    }
    const domainTagMap: Record<string, string> = {
      school: '[🎒 學校親子]',
      travel: '[✈️ 出國必備]',
      home: '[🏠 家居修繕]',
      schedule: '[📅 行程安排]',
      health: '[🩺 健康用藥]',
      shopping: '[🛒 採買清單]',
      worship: '[🙏 祭祀拜拜]',
    };
    const dummyNote = domainTagMap[selectedBuilderDomain] || '[🎒 學校親子]';
    return detectMemoQuickBuilderConfig(dummyNote, (members || []).map(m => m.display_name), selectedSchoolSubject);
  }, [activeQuickBuilder, selectedBuilderDomain, members, selectedSchoolSubject]);

  const effectiveQuickSubject = React.useMemo(() => {
    const cfg = currentBuilderConfig;
    if (!cfg) return '';
    if (cfg.subjects.includes(selectedSchoolSubject)) {
      return selectedSchoolSubject;
    }
    if (cfg.domain === 'schedule') {
      return '09:00';
    }
    return cfg.subjects[0] || '';
  }, [currentBuilderConfig, selectedSchoolSubject]);

  const orderedBuilderDomains = React.useMemo(() => {
    const list = [
      { key: 'school', label: '🎒 聯絡簿' },
      { key: 'travel', label: '✈️ 行李必備' },
      { key: 'home', label: '🏠 居家保養' },
      { key: 'schedule', label: '📅 時間行程' },
      { key: 'health', label: '🩺 用藥照護' },
      { key: 'shopping', label: '🛒 採買清單' },
      { key: 'worship', label: '🙏 祭祀拜拜' },
    ];
    const activeKey = currentBuilderConfig?.domain || selectedBuilderDomain;
    if (!activeKey) return list;
    const matchIndex = list.findIndex(d => d.key === activeKey);
    if (matchIndex <= 0) return list;
    const activeItem = list[matchIndex];
    const rest = list.filter((_, idx) => idx !== matchIndex);
    return [activeItem, ...rest];
  }, [currentBuilderConfig?.domain, selectedBuilderDomain]);

  const previewScrollRef = useRef<ScrollView>(null);

  const checklistItemsCount = React.useMemo(() => {
    if (!note) return 0;
    const matches = note.match(/[-*]\s*\[\s*[xX]?\s*\]/g);
    return matches ? matches.length : 0;
  }, [note]);

  const handleUndoLastChecklistItem = React.useCallback(() => {
    if (!note) return;
    const lines = note.split('\n');
    let lastIndex = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (/^[-*]\s*\[\s*[xX]?\s*\]/.test(lines[i].trim())) {
        lastIndex = i;
        break;
      }
    }
    if (lastIndex !== -1) {
      lines.splice(lastIndex, 1);
      setNote(lines.join('\n').replace(/\n{3,}/g, '\n\n').trim());
    }
  }, [note]);
  const [keyboardOffset, setKeyboardOffset] = useState<number>(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const lastAutoDetectedDateRef = useRef<string>('');
  const userManuallySetReminderRef = useRef<boolean>(!!(transaction?.reminder_date));
  // 🎯 記憶非農曆初一十五週期時之基準日期與曆法（切換頻率時智慧還原用）
  const baseReminderDateRef = useRef<string>('');
  const baseReminderCalendarRef = useRef<CalendarSystem>('solar');
  // 📂 分類抽屜與發票收折狀態 (支出分頁極致瘦身)
  const [isCategoryDrawerOpen, setIsCategoryDrawerOpen] = useState<boolean>(false);
  const [categorySearchQuery, setCategorySearchQuery] = useState<string>('');
  const [isInvoiceExpanded, setIsInvoiceExpanded] = useState<boolean>(false);

  // 🔁 解析子項目接力路線（僅於有帶日期子項目時顯示接力開關與預覽）
  const relaySchedule = React.useMemo(() => {
    if (transaction?.type !== 'memo' || !note) return null;
    const anchor = transactedAt ? resolveAnchorDate(transactedAt) : (transaction ? resolveAnchorDate(transaction.transacted_at || transaction.created_at) : new Date());
    return analyzeMemoRelaySchedule(note, new Date(), anchor);
  }, [transaction, note, transactedAt]);

  // 💡 智慧日期即時解析：僅解析記事中最具代表性的日期提示（不強制用子項目覆蓋固定提醒）
  const detectedMemoDate = React.useMemo(() => {
    if (transaction?.type !== 'memo' || !note) return null;
    const anchor = transactedAt ? resolveAnchorDate(transactedAt) : (transaction ? resolveAnchorDate(transaction.transacted_at || transaction.created_at) : new Date());
    return extractDateFromText(note, anchor);
  }, [transaction, note, transactedAt]);

  // 即時打字感知自動預填：編輯既有記事時維持使用者設定，不因打字偷蓋提醒
  useEffect(() => {
    if (!detectedMemoDate) return;
    const targetYmd = detectedMemoDate.formattedYmd;
    if (targetYmd !== lastAutoDetectedDateRef.current) {
      lastAutoDetectedDateRef.current = targetYmd;
      if (!memoReminderRelay && !memoReminderDate && !userManuallySetReminderRef.current) {
        setMemoReminderDate(targetYmd);
        setMemoReminderRepeat('once');
        setMemoReminderCalendar('solar');
      }
    }
  }, [detectedMemoDate, memoReminderDate, memoReminderRelay]);

  // 🔁 接力模式即時計算：開啟接力時自動鎖定下一站真實到期日（提前預告由推播於前幾天與當天發送）
  useEffect(() => {
    if (transaction?.type !== 'memo' || !memoReminderRelay) return;
    if (relaySchedule?.nextDateYmd) {
      const nextYmd = relaySchedule.nextDateYmd;
      if (nextYmd !== memoReminderDate) {
        setMemoReminderDate(nextYmd);
        setMemoReminderCalendar('solar');
        setMemoReminderRepeat('once');
      }
    }
  }, [transaction?.type, memoReminderRelay, relaySchedule, memoReminderDate]);

  // 🎁 點數 / 回饋折抵專用狀態（算在原先支出交易的一環）
  const [showDiscountPanel, setShowDiscountPanel] = useState<boolean>(false);
  const [discountAmount, setDiscountAmount] = useState<string>('');
  const [discountLabel, setDiscountLabel] = useState<string>('LINE Points');
  const [discountLabelTouched, setDiscountLabelTouched] = useState<boolean>(false);
  const [discountCalcMode, setDiscountCalcMode] = useState<'subtract' | 'already_net'>('already_net');
  const activeInputScrollYRef = useRef<number | null>(null);

  // 統一發票資訊狀態
  const [invoiceNumber, setInvoiceNumber] = useState<string>(() => transaction?.invoice_number || '');
  const [invoiceRandomCode, setInvoiceRandomCode] = useState<string>(() => transaction?.invoice_random_code || '');
  const [invoiceSellerTaxId, setInvoiceSellerTaxId] = useState<string>('');
  const [invoiceSectionY, setInvoiceSectionY] = useState<number>(0);
  const [scannerModalVisible, setScannerModalVisible] = useState<boolean>(false);
  const lastScannedItemsNoteRef = useRef<string>('');

  // 📎 收據 / 保固 / PDF 憑證 (階段 B)
  const [receiptPhotoUri, setReceiptPhotoUri] = useState<string>(() => transaction?.image_url || '');
  const [receiptPhotoBase64, setReceiptPhotoBase64] = useState<string>('');
  const [receiptPhotoMimeType, setReceiptPhotoMimeType] = useState<string>('');
  const [receiptPhotoName, setReceiptPhotoName] = useState<string>('');
  const [receiptPhotoFile, setReceiptPhotoFile] = useState<Blob | File | null>(null);
  const [receiptSourceModalVisible, setReceiptSourceModalVisible] = useState<boolean>(false);
  const [receiptSourceModalMode, setReceiptSourceModalMode] = useState<'receipt' | 'memo'>('receipt');
  const [viewingPhotoModal, setViewingPhotoModal] = useState<boolean>(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const clearReceiptAttachment = () => {
    setReceiptPhotoUri('');
    setReceiptPhotoBase64('');
    setReceiptPhotoMimeType('');
    setReceiptPhotoName('');
    setReceiptPhotoFile(null);
  };

  const isPdfAttachment = isPdfReceipt(receiptPhotoUri, receiptPhotoMimeType, receiptPhotoName);
  const attachmentDisplayName = receiptPhotoUri
    ? extractReceiptFileName(receiptPhotoUri, receiptPhotoName)
    : '';

  // 相機拍攝收據/保固照片 (階段 B)
  const handlePickReceiptFromCamera = async () => {
    if (!ImagePickerModule?.launchCameraAsync) {
      safeAlert('不支援相機', '目前環境暫不支援原生相機拍攝');
      return;
    }
    try {
      const result = await ImagePickerModule.launchCameraAsync({
        quality: 0.7,
        allowsEditing: true,
        base64: true,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        const asset = result.assets[0];
        setReceiptPhotoUri(asset.uri);
        setReceiptPhotoBase64(asset.base64 || '');
        setReceiptPhotoMimeType(asset.mimeType || 'image/jpeg');
        setReceiptPhotoName(asset.fileName || 'receipt.jpg');
        setReceiptPhotoFile(null);
      }
    } catch (e: any) {
      safeAlert('相機錯誤', e?.message || '無法開啟相機');
    }
  };

  // 相簿挑選收據/保固照片 (階段 B)
  const handlePickReceiptFromLibrary = async () => {
    if (!ImagePickerModule?.launchImageLibraryAsync) {
      safeAlert('不支援相簿', '目前環境暫不支援開啟相簿');
      return;
    }
    try {
      const result = await ImagePickerModule.launchImageLibraryAsync({
        quality: 0.7,
        allowsEditing: true,
        base64: true,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        const asset = result.assets[0];
        setReceiptPhotoUri(asset.uri);
        setReceiptPhotoBase64(asset.base64 || '');
        setReceiptPhotoMimeType(asset.mimeType || 'image/jpeg');
        setReceiptPhotoName(asset.fileName || 'receipt.jpg');
        setReceiptPhotoFile(null);
      }
    } catch (e: any) {
      safeAlert('相簿錯誤', e?.message || '無法讀取相簿');
    }
  };

  // 從檔案總管挑選 PDF 或圖片憑證
  const handlePickReceiptFromDocument = async () => {
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return;
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp';
      input.style.display = 'none';
      document.body.appendChild(input);

      const cleanup = () => {
        try {
          if (input.parentNode) input.parentNode.removeChild(input);
        } catch {}
      };

      input.onchange = () => {
        const file = input.files?.[0];
        cleanup();
        if (!file) return;
        if (file.size > MAX_RECEIPT_FILE_BYTES) {
          safeAlert('檔案過大', '檔案大小超過 20 MB 上限，請選擇較小的 PDF 或圖片檔');
          return;
        }
        const objectUrl = URL.createObjectURL(file);
        setReceiptPhotoUri(objectUrl);
        setReceiptPhotoBase64('');
        setReceiptPhotoMimeType(resolveReceiptMimeType(file.type, file.name));
        setReceiptPhotoName(file.name || 'receipt.pdf');
        setReceiptPhotoFile(file);
      };

      input.oncancel = () => {
        cleanup();
      };

      input.click();
      return;
    }

    if (!DocumentPickerModule?.getDocumentAsync) {
      safeAlert('不支援檔案選取', '目前環境暫不支援開啟檔案總管選取 PDF');
      return;
    }

    try {
      const result = await DocumentPickerModule.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        const asset = result.assets[0];
        if (asset.size && asset.size > MAX_RECEIPT_FILE_BYTES) {
          safeAlert('檔案過大', '檔案大小超過 20 MB 上限，請選擇較小的 PDF 或圖片檔');
          return;
        }
        setReceiptPhotoUri(asset.uri);
        setReceiptPhotoBase64('');
        setReceiptPhotoMimeType(resolveReceiptMimeType(asset.mimeType, asset.name, asset.uri));
        setReceiptPhotoName(asset.name || '');
        setReceiptPhotoFile(null);
      }
    } catch (e: any) {
      safeAlert('檔案選取錯誤', e?.message || '無法讀取選取的檔案');
    }
  };

  // 📷 生活記事拍照或選取照片／PDF 提示 (菜單、聯絡簿、規格備忘)
  const handlePromptMemoPhotoSource = () => {
    Keyboard.dismiss();
    setReceiptSourceModalMode('memo');
    setReceiptSourceModalVisible(true);
  };

  // 📷 消費收據 / 保固憑證 / PDF 來源選擇 (支出分頁極致瘦身)
  const handlePromptReceiptPhotoSource = () => {
    Keyboard.dismiss();
    setReceiptSourceModalMode('receipt');
    setReceiptSourceModalVisible(true);
  };

  const applyParsedInvoice = React.useCallback((parsed: ParsedInvoiceData) => {
    setIsInvoiceExpanded(true);
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
        if (!isNaN(d.getTime())) setTransactedAt(d.toISOString());
      } catch {}
    }
    if (parsed.merchantName) {
      const cleanName = cleanBusinessName(parsed.merchantName);
      setMerchant(cleanName);
      if (parsed.sellerTaxId) {
        recordTaxIdMerchant(parsed.sellerTaxId, cleanName);
      }
    } else if (parsed.sellerTaxId) {
      // 若發票包含賣方統編但靜態庫未收錄，非同步背景即時查詢財政部稅籍並補正店家與分類
      const targetTaxId = parsed.sellerTaxId;
      fetchMerchantOnlineByTaxId(targetTaxId, 2500)
        .then(onlineInfo => {
          if (onlineInfo && onlineInfo.name) {
            const cleanName = cleanBusinessName(onlineInfo.name);
            setMerchant(prev => (prev ? prev : cleanName));
            recordTaxIdMerchant(targetTaxId, cleanName);
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
    const parsed = parseTaiwanInvoiceQRCode(text, taxIdMerchantMap);
    if (parsed && parsed.isQRCode) {
      applyParsedInvoice(parsed);
      return;
    }
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
    const cleaned = data.invoiceNumber ? formatInvoiceNumber(data.invoiceNumber) : '';
    const dup = cleaned ? transactions.find(t => t.id !== transaction?.id && t.invoice_number && formatInvoiceNumber(t.invoice_number) === cleaned) : null;

    if (dup) {
      const payer = getMemberById(dup.paid_by) || currentUser;
      const dateStr = dup.transacted_at ? dup.transacted_at.split('T')[0] : '';
      safeAlert(
        '⚠️ 偵測到發票重複',
        `發票號碼：${cleaned}\n⚠️ 注意：此張發票已由「${payer.display_name}」於 ${dateStr} 記錄過（${dup.merchant || '消費'} NT$ ${dup.amount.toLocaleString()}）！\n\n系統已為您填入，儲存前請確認是否重複記帳。`
      );
    } else if (resolvedData.is1DBarcode) {
      safeAlert(
        '長條發票辨識成功',
        `發票號碼：${resolvedData.invoiceNumber}\n對獎期別：${resolvedData.periodLabel || '當期'}\n\n已為您填入發票號碼與對獎期別！\n（傳統收銀機發票條碼無記載金額，請隨手補填消費金額即可完成記帳對獎）`
      );
    } else {
      safeAlert(
        '發票辨識成功',
        `發票號碼：${resolvedData.invoiceNumber || '未包含號碼'}${resolvedData.merchantName ? `\n店家：${cleanBusinessName(resolvedData.merchantName)}` : ''}${resolvedData.totalAmount ? `\n金額：NT$ ${resolvedData.totalAmount.toLocaleString()}` : ''}${resolvedData.items && resolvedData.items.length > 0 ? `\n商品明細：共 ${resolvedData.items.length} 項 (已帶入備註)` : ''}`
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
            const dup = cleaned ? transactions.find(t => t.id !== transaction?.id && t.invoice_number && formatInvoiceNumber(t.invoice_number) === cleaned) : null;
            if (dup) {
              const payer = getMemberById(dup.paid_by) || currentUser;
              const dateStr = dup.transacted_at ? dup.transacted_at.split('T')[0] : '';
              safeAlert(
                '⚠️ 偵測到發票重複',
                `已辨識發票號碼：${cleaned}\n⚠️ 注意：此張發票已由「${payer.display_name}」於 ${dateStr} 記錄過（${dup.merchant || '消費'} NT$ ${dup.amount.toLocaleString()}）！\n\n請確認是否重複記帳。`
              );
            } else if (parsed.is1DBarcode) {
              safeAlert(
                '長條發票解析成功',
                `已成功辨識發票號碼：${parsed.invoiceNumber}\n對獎期別：${parsed.periodLabel || '當期'}\n\n已填入發票號碼，請補填消費金額即可完成記帳！`
              );
            } else {
              safeAlert(
                '發票解析成功',
                `已辨識並帶入發票資訊！\n號碼：${parsed.invoiceNumber || '未包含號碼'}${parsed.merchantName ? `\n店家：${cleanBusinessName(parsed.merchantName)}` : ''}${parsed.totalAmount ? `\n金額：NT$ ${parsed.totalAmount.toLocaleString()}` : ''}`
              );
            }
            return;
          }
          handleInvoiceInput(text.trim());
          const cleaned = formatInvoiceNumber(text.slice(0, 10));
          const dup = cleaned ? transactions.find(t => t.id !== transaction?.id && t.invoice_number && formatInvoiceNumber(t.invoice_number) === cleaned) : null;
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
    safeAlert('發票快速帶入', '請直接於發票號碼輸入框貼上「AB-12345678」或電子發票 QR Code 77 碼文字，系統將自動解析號碼、金額與日期！');
  };

  const invoicePreview = React.useMemo(() => {
    if (!invoiceNumber || !isValidInvoiceNumber(invoiceNumber)) return null;
    const { periodKey, periodLabel } = getInvoicePeriodKey(transactedAt);
    const winning = checkInvoiceWinning(invoiceNumber, periodKey);
    return {
      periodKey,
      periodLabel,
      winning,
    };
  }, [invoiceNumber, transactedAt]);

  // 發票防重複記帳即時偵測（比對全帳本發票號碼，排除自身當前交易）
  const duplicateInvoiceTx = React.useMemo(() => {
    if (!invoiceNumber || !isValidInvoiceNumber(invoiceNumber)) return null;
    const cleaned = formatInvoiceNumber(invoiceNumber);
    return transactions.find(t => {
      if (t.id === transaction?.id || !t.invoice_number) return false;
      return formatInvoiceNumber(t.invoice_number) === cleaned;
    });
  }, [invoiceNumber, transactions, transaction?.id]);

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
    // Web 版具有自然視窗佈局，點擊輸入框嚴禁強制捲動避免將輸入框頂出視野
    if (Platform.OS === 'web') return;
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

  // Web 版多行備註保底行數估算，避免 textarea 停在預設高度導致多行文字被裁切
  const webNoteLines = React.useMemo(() => {
    const lines = (note || '').split('\n');
    let total = 0;
    for (const line of lines) {
      let units = 0;
      for (const ch of line) {
        units += ch.charCodeAt(0) > 127 ? 1 : 0.55;
      }
      total += Math.max(1, Math.ceil(units / 18));
    }
    return Math.max(1, total);
  }, [note]);

  const availableCategories = categories.filter(c => c.type === (type === 'transfer' ? 'expense' : type));
  // 📂 常用 2 行 8 格精選分類：當分類大於 8 個時，固定前 7 顆 + 1 顆更多，且選中項若在第 8 顆之後則動態置換進前 7 顆
  const displayedCategories = React.useMemo(() => {
    if (availableCategories.length <= 8) {
      return availableCategories;
    }
    const top7 = availableCategories.slice(0, 7);
    const isSelectedInTop7 = top7.some(c => c.id === selectedCategoryId);
    if (isSelectedInTop7 || !selectedCategoryId) {
      return top7;
    }
    const selectedCat = availableCategories.find(c => c.id === selectedCategoryId);
    if (selectedCat) {
      return [...top7.slice(0, 6), selectedCat];
    }
    return top7;
  }, [availableCategories, selectedCategoryId]);

  // 分類抽屜內關鍵字搜尋
  const filteredDrawerCategories = React.useMemo(() => {
    if (!categorySearchQuery.trim()) return availableCategories;
    const q = categorySearchQuery.trim().toLowerCase();
    return availableCategories.filter(c => c.name.toLowerCase().includes(q));
  }, [availableCategories, categorySearchQuery]);
  const targetPayerId = paidBy || currentUser?.id;
  // 記錄開啟此明細時原本關聯的卡片或帳戶 ID，確保若該卡在較後方，開窗時自動置頂於首位；若手動切換選取其他卡片，順序保持平穩不跳動
  const initialAccountId = React.useMemo(() => transaction?.account_id || '', [transaction?.id]);

  const creditCards = React.useMemo(
    () => filterAccountsForUser(paymentAccounts, {
      type: 'credit_card',
      currentUser,
      inAdminMode,
      selectedAccountId,
      priorityAccountId: initialAccountId,
      getMemberById,
      targetPayerId,
    }),
    [paymentAccounts, currentUser, inAdminMode, selectedAccountId, initialAccountId, getMemberById, targetPayerId]
  );
  const storedValueCards = React.useMemo(
    () => filterAccountsForUser(paymentAccounts, {
      type: 'stored_value',
      currentUser,
      inAdminMode,
      selectedAccountId,
      priorityAccountId: initialAccountId,
      getMemberById,
      targetPayerId,
    }),
    [paymentAccounts, currentUser, inAdminMode, selectedAccountId, initialAccountId, getMemberById, targetPayerId]
  );
  const bankAccounts = React.useMemo(
    () => filterAccountsForUser(paymentAccounts, {
      type: 'bank',
      currentUser,
      inAdminMode,
      selectedAccountId,
      priorityAccountId: initialAccountId,
      getMemberById,
      targetPayerId,
    }),
    [paymentAccounts, currentUser, inAdminMode, selectedAccountId, initialAccountId, getMemberById, targetPayerId]
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
    const isCreatorMatch = !!transaction.creator_id && transaction.creator_id === currentUser.id;
    return Boolean(isPayerIdMatch || isPayerNameMatch || isCreatorMatch);
  }, [transaction, currentUser, txPayerProfile, isOwner, isReadOnly, currentLedger?.is_read_only]);

  // 生活記事允許任何已登入家庭成員回報辦妥說明與操作連動
  const canEditCompletion = React.useMemo(() => {
    if (isReadOnly || currentLedger?.is_read_only) return false;
    if (!transaction || !currentUser?.id) return false;
    if (canEdit) return true;
    if (transaction.type === 'memo') return true;
    return false;
  }, [transaction, currentUser, canEdit, isReadOnly, currentLedger?.is_read_only]);

  // 取得生活記事關聯之明細項目 (支援支出、收入、轉帳與接力待辦)
  const linkedExpense = React.useMemo(() => {
    if (!linkedTxId) return undefined;
    return transactions.find(t => t.id === linkedTxId);
  }, [linkedTxId, transactions]);

  // 取得支出/收入/轉帳項目關聯之生活記事項目（支援雙向正反向查找）
  const linkedMemoTx = React.useMemo(() => {
    if (!transaction) return undefined;
    if (transaction.linked_transaction_id) {
      const directMemo = transactions.find(t => t.id === transaction.linked_transaction_id && t.type === 'memo');
      if (directMemo) return directMemo;
    }
    return transactions.find(t => t.type === 'memo' && t.linked_transaction_id === transaction.id);
  }, [transaction, transactions]);

  // 內部轉帳專屬：取得轉入存入目標卡片 (若為加值/轉帳至儲值卡)
  const targetLinkedAccount = React.useMemo(() => {
    if (type !== 'transfer') return undefined;
    const targetId = linkedTxId || transaction?.linked_transaction_id;
    if (targetId) {
      const acc = getAccountById?.(targetId) || paymentAccounts.find(a => a.id === targetId);
      if (acc) return acc;
    }
    // Fallback: 如果加值明細未記 ID，從 note 或 merchant 自動比對儲值卡
    return paymentAccounts.find(a =>
      a.type === 'stored_value' && (
        (note && note.includes(`【${a.name}】`)) ||
        (merchant && merchant.includes(a.name))
      )
    );
  }, [type, linkedTxId, transaction?.linked_transaction_id, getAccountById, paymentAccounts, note, merchant]);

  // 內部轉帳專屬：目標卡片持卡人
  const targetLinkedCardholder = React.useMemo(() => {
    if (!targetLinkedAccount?.user_id) return undefined;
    return getMemberById(targetLinkedAccount.user_id);
  }, [targetLinkedAccount, getMemberById]);

  // 內部轉帳專屬：取得轉入受款成員 (若為發放零用錢等成員間調撥)
  const targetRecipientMember = React.useMemo(() => {
    if (type !== 'transfer') return undefined;
    const recipientId = transaction?.completed_by;
    if (recipientId) {
      return members.find(m => m.id === recipientId) || getMemberById(recipientId);
    }
    return undefined;
  }, [type, transaction?.completed_by, members, getMemberById]);

  // 智慧店家快捷建議標籤列表 (結合自學習 recentMerchants + 分類推薦 + 關鍵字即時比對)
  const suggestedMerchants = React.useMemo(() => {
    const currentCats = categories.filter(c => c.type === (type === 'transfer' ? 'expense' : type));
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

  const prevVisibleRef = useRef(false);
  const prevTxIdRef = useRef<string | undefined>(undefined);

  // 當 transaction 或 visible 改變時同步資料
  useEffect(() => {
    const justOpened = visible && !prevVisibleRef.current;
    const txChanged = visible && transaction?.id !== prevTxIdRef.current;

    if ((justOpened || txChanged) && transaction) {
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
      setInvoiceNumber(transaction.invoice_number || '');
      setInvoiceRandomCode(transaction.invoice_random_code || '');
      setIsInvoiceExpanded(!!transaction.invoice_number);
      if (transaction.type === 'memo') {
        setAmount('');
        setNote(stripInvoiceTag(transaction.note || ''));
        setIsPinned(isMemoPinned(transaction));
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
        setNote(stripInvoiceTag(parsedDisc.cleanNote));
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
      const decodedMemo = decodeMemoMerchantTag(transaction.merchant);
      const initialReminder = transaction.reminder_date || decodedMemo.reminderDate || '';
      const initialCal = transaction.reminder_calendar || decodedMemo.reminderCalendar || 'solar';
      const initialRep = transaction.reminder_repeat || decodedMemo.reminderRepeat || 'once';
      const initialRelay = isMemoRelayEnabled(transaction);
      const initialRelayOffset = getMemoRelayOffsetDays(transaction);
      setMemoReminderDate(initialReminder);
      setMemoReminderCalendar(initialCal);
      setMemoReminderRepeat(initialRep);
      setMemoReminderRelay(initialRelay);
      setMemoReminderRelayOffset(initialRelayOffset);
      userManuallySetReminderRef.current = true;
      baseReminderDateRef.current = (initialRep === 'lunar_1_15' || initialRep === 'lunar_2_16') ? todayYmd : (initialReminder || todayYmd);
      baseReminderCalendarRef.current = (initialRep === 'lunar_1_15' || initialRep === 'lunar_2_16') ? 'solar' : initialCal;
      setMemoReminderTarget(transaction.reminder_target || 'family');
      setReminderPickerInitialMode(initialCal);
      setIsSettled(!!transaction.is_settled);
      setCompletionNote(transaction.completion_note || '');
      setLinkedTxId(transaction.linked_transaction_id || '');
      setReceiptPhotoUri(transaction.image_url || '');
      setReceiptPhotoBase64('');
      setReceiptPhotoMimeType('');
      setReceiptPhotoName('');
      setReceiptPhotoFile(null);
      setReceiptSourceModalVisible(false);
      setViewingPhotoModal(false);
      setReminderDatePickerVisible(false);
      setTransactedAt(transaction.transacted_at || new Date().toISOString());
      setDatePickerVisible(false);
    }
    prevVisibleRef.current = visible;
    prevTxIdRef.current = transaction?.id;
  }, [visible, transaction?.id, getMemberById, categories, getCategoryById]);

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

    const isUserAccount = (accUserId?: string | null) => {
      if (!accUserId || !paidBy) return false;
      if (accUserId === paidBy) return true;
      if (getMemberById && getMemberById(accUserId)?.display_name === getMemberById(paidBy)?.display_name) return true;
      return false;
    };

    if (isCc) {
      const userCard = creditCards.find(c => isUserAccount(c.user_id)) || creditCards.find(c => !c.user_id);
      setSelectedAccountId(userCard ? userCard.id : '');
    } else if (isSv) {
      const userCard = storedValueCards.find(c => isUserAccount(c.user_id)) || storedValueCards.find(c => !c.user_id);
      setSelectedAccountId(userCard ? userCard.id : '');
    } else if (isBank) {
      const userBank = bankAccounts.find(a => isUserAccount(a.user_id)) || bankAccounts.find(a => !a.user_id);
      setSelectedAccountId(userBank ? userBank.id : '');
    } else {
      setSelectedAccountId('');
    }
  };

  // 切換付款成員 (智慧同步卡片與付款方式，絕不殘留他人卡片)
  const handleSelectPayer = (newPayerId: string) => {
    setPaidBy(newPayerId);

    const mObj = (paymentMethods && paymentMethods.length > 0 ? paymentMethods : DEFAULT_PAYMENT_METHODS).find(m => m.id === paymentMethod);
    const isCc = mObj ? !!mObj.supports_credit_card : (paymentMethod === 'credit_card' || paymentMethod === 'line_pay' || paymentMethod === 'px_pay');
    const isSv = mObj ? (mObj.type === 'stored_value' || mObj.id === 'stored_value') : paymentMethod === 'stored_value';
    const isBank = mObj ? (mObj.type === 'bank' || mObj.id === 'transfer') : paymentMethod === 'transfer';

    if (!isCc && !isSv && !isBank) {
      setSelectedAccountId('');
      return;
    }

    const accType = isCc ? 'credit_card' : (isSv ? 'stored_value' : 'bank');
    const newMemberAccounts = filterAccountsForUser(paymentAccounts, {
      type: accType,
      currentUser,
      inAdminMode,
      selectedAccountId: undefined,
      getMemberById,
      targetPayerId: newPayerId,
    });

    const ownCard = newMemberAccounts.find(a => {
      if (!a.user_id) return false;
      if (a.user_id === newPayerId) return true;
      if (getMemberById && getMemberById(a.user_id)?.display_name === getMemberById(newPayerId)?.display_name) return true;
      return false;
    });

    const publicCard = newMemberAccounts.find(a => !a.user_id);

    if (ownCard) {
      setSelectedAccountId(ownCard.id);
    } else if (publicCard) {
      setSelectedAccountId(publicCard.id);
    } else {
      setSelectedAccountId('');
      if (paymentMethod === 'credit_card' || paymentMethod === 'stored_value') {
        setPaymentMethod('cash');
      }
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
          reminder_date: memoReminderDate ? memoReminderDate.trim() : null,
          reminder_calendar: memoReminderDate ? memoReminderCalendar : null,
          reminder_repeat: memoReminderDate ? memoReminderRepeat : null,
          reminder_target: memoReminderTarget || 'family',
          reminder_relay: memoReminderRelay,
          reminder_relay_offset: memoReminderRelay ? (memoReminderRelayOffset === undefined ? null : memoReminderRelayOffset) : null,
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
    if (!transaction || isSubmitting || isUploadingPhoto) return;

    if (!canEdit) {
      if (transaction.type === 'memo' && canEditCompletion) {
        setIsSubmitting(true);
        try {
          const effectiveCompleter = isSettled
            ? (transaction.completed_by || currentUser?.id)
            : undefined;
          const effectiveCompletedAt = isSettled
            ? (transaction.completed_at || new Date().toISOString())
            : undefined;
          const success = await updateTransaction(transaction.id, {
            is_settled: isSettled,
            completed_by: effectiveCompleter,
            completed_at: effectiveCompletedAt,
            completion_note: completionNote.trim() || undefined,
            linked_transaction_id: linkedTxId || undefined,
            is_pinned: isSettled ? false : undefined,
          });

          if (success) {
            onClose();
          } else {
            alert('更新失敗，請檢查網路連線');
          }
        } catch (err: any) {
          alert(err.message || '更新回報時發生錯誤');
        } finally {
          setIsSubmitting(false);
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
      setIsSubmitting(true);
      try {
        let finalImageUrl: string | undefined = transaction.image_url;
        if (receiptPhotoUri !== transaction.image_url) {
          if (!receiptPhotoUri) {
            finalImageUrl = undefined;
          } else if (receiptPhotoUri.startsWith('http://') || receiptPhotoUri.startsWith('https://')) {
            finalImageUrl = receiptPhotoUri;
          } else {
            try {
              setIsUploadingPhoto(true);
              finalImageUrl = await uploadReceiptPhoto({
                ledgerId: currentLedger.id,
                uri: receiptPhotoUri,
                base64: receiptPhotoBase64 || undefined,
                mimeType: receiptPhotoMimeType || undefined,
                originalName: receiptPhotoName || undefined,
                file: receiptPhotoFile || undefined,
              });
            } catch (uploadErr: any) {
              if (typeof uploadErr?.message === 'string' && uploadErr.message.includes('20 MB')) {
                safeAlert('檔案過大', uploadErr.message);
                return;
              }
              finalImageUrl = receiptPhotoUri;
            } finally {
              setIsUploadingPhoto(false);
            }
          }
        }

        const uploadedFallbackPdf =
          isPdfAttachment &&
          finalImageUrl &&
          !finalImageUrl.startsWith('http://') &&
          !finalImageUrl.startsWith('https://') &&
          !isDemoLedgerId(currentLedger?.id);

        const success = await updateTransaction(transaction.id, {
          amount: 0,
          type: 'memo',
          category_id: transaction.category_id || categories[0]?.id,
          paid_by: targetPayer,
          note: note.trim(),
          image_url: finalImageUrl,
          reminder_date: memoReminderDate ? memoReminderDate.trim() : null,
          reminder_calendar: memoReminderDate ? memoReminderCalendar : null,
          reminder_repeat: memoReminderDate ? memoReminderRepeat : null,
          reminder_target: memoReminderTarget || 'family',
          reminder_relay: memoReminderRelay,
          reminder_relay_offset: memoReminderRelay ? (memoReminderRelayOffset === undefined ? null : memoReminderRelayOffset) : null,
          transacted_at: transactedAt || transaction.transacted_at,
          is_settled: isSettled,
          completed_by: isSettled ? (transaction.completed_by || currentUser?.id) : undefined,
          completed_at: isSettled ? (transaction.completed_at || new Date().toISOString()) : undefined,
          completion_note: completionNote.trim() || undefined,
          linked_transaction_id: linkedTxId || undefined,
          is_pinned: isSettled ? false : isPinned,
        });

        if (success) {
          onClose();
          if (uploadedFallbackPdf) {
            safeAlert('PDF 已暫存本機', 'PDF 憑證雲端上傳逾時，已暫存本機，建議於網路穩定時重新附加。');
          }
        } else {
          alert('更新失敗，請檢查網路連線');
        }
      } catch (err: any) {
        alert(err.message || '更新記事時發生錯誤');
      } finally {
        setIsSubmitting(false);
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

    const executeUpdateTransaction = async () => {
      if (isSubmitting || isUploadingPhoto) return;
      setIsSubmitting(true);
      try {
        let finalImageUrl: string | undefined = transaction.image_url;
        if (receiptPhotoUri !== transaction.image_url) {
          if (!receiptPhotoUri) {
            finalImageUrl = undefined;
          } else if (receiptPhotoUri.startsWith('http://') || receiptPhotoUri.startsWith('https://')) {
            finalImageUrl = receiptPhotoUri;
          } else {
            try {
              setIsUploadingPhoto(true);
              finalImageUrl = await uploadReceiptPhoto({
                ledgerId: currentLedger.id,
                uri: receiptPhotoUri,
                base64: receiptPhotoBase64 || undefined,
                mimeType: receiptPhotoMimeType || undefined,
                originalName: receiptPhotoName || undefined,
                file: receiptPhotoFile || undefined,
              });
            } catch (uploadErr: any) {
              if (typeof uploadErr?.message === 'string' && uploadErr.message.includes('20 MB')) {
                safeAlert('檔案過大', uploadErr.message);
                return;
              }
              finalImageUrl = receiptPhotoUri;
            } finally {
              setIsUploadingPhoto(false);
            }
          }
        }

        const uploadedFallbackPdf =
          isPdfAttachment &&
          finalImageUrl &&
          !finalImageUrl.startsWith('http://') &&
          !finalImageUrl.startsWith('https://') &&
          !isDemoLedgerId(currentLedger?.id);

        const success = await updateTransaction(transaction.id, {
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
          image_url: finalImageUrl,
          transacted_at: transactedAt || transaction.transacted_at,
        });

        // 自學習記憶：若發票含有賣方統編，記憶此店家名稱至本機資料庫
        if (invoiceSellerTaxId && merchant.trim()) {
          recordTaxIdMerchant(invoiceSellerTaxId, merchant.trim());
        }

        if (success) {
          onClose();
          if (uploadedFallbackPdf) {
            safeAlert('PDF 已暫存本機', 'PDF 憑證雲端上傳逾時，已暫存本機，建議於網路穩定時重新附加。');
          }
        } else {
          alert('更新失敗，請檢查網路連線');
        }
      } catch (err: any) {
        alert(err.message || '更新記帳時發生錯誤');
      } finally {
        setIsSubmitting(false);
      }
    };

    // 發票重複防呆確認彈窗
    if (duplicateInvoiceTx) {
      const payer = getMemberById(duplicateInvoiceTx.paid_by) || currentUser;
      const dateStr = duplicateInvoiceTx.transacted_at ? duplicateInvoiceTx.transacted_at.split('T')[0] : '';
      const promptTitle = '⚠️ 偵測到重複發票';
      const promptMsg = `發票號碼「${formatInvoiceNumber(duplicateInvoiceTx.invoice_number || '')}」已於 ${dateStr} 由「${payer.display_name}」記錄過（${duplicateInvoiceTx.merchant || '消費'} NT$ ${duplicateInvoiceTx.amount.toLocaleString()}）。\n\n確定仍要將此筆紀錄更新為這筆重複發票嗎？`;

      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
          if (window.confirm(`${promptTitle}\n\n${promptMsg}`)) {
            executeUpdateTransaction();
          }
        }
      } else {
        Alert.alert(promptTitle, promptMsg, [
          { text: '取消返回檢查', style: 'cancel' },
          { text: '確定仍要儲存', style: 'destructive', onPress: executeUpdateTransaction },
        ]);
      }
      return;
    }

    executeUpdateTransaction();
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
            <View style={{ flex: 1, marginRight: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={styles.title} maxFontSizeMultiplier={1.15}>
                  {canEdit
                    ? (transaction.type === 'memo' ? '📝 編輯生活備忘' : transaction.type === 'transfer' ? '⇄ 編輯內部轉帳' : '✏️ 編輯記帳明細')
                    : (transaction.type === 'memo' ? '👀 生活備忘' : transaction.type === 'transfer' ? '👀 內部轉帳' : '👀 記帳明細')}
                </Text>
                {!canEdit && (
                  <View style={styles.readOnlyBadge}>
                    <Text style={styles.readOnlyBadgeText} maxFontSizeMultiplier={1.08}>🔒 唯讀模式</Text>
                  </View>
                )}
              </View>
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
            {!canEdit && (
              <View style={styles.readOnlyTopBanner}>
                <Text style={styles.readOnlyTopBannerIcon}>🔒</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.readOnlyTopBannerTitle} maxFontSizeMultiplier={1.15}>
                    {(isReadOnly || currentLedger?.is_read_only) ? '唯讀封存保護中' : '此明細處於唯讀狀態 (純瀏覽)'}
                  </Text>
                  <Text style={styles.readOnlyTopBannerDesc} maxFontSizeMultiplier={1.08}>
                    {(isReadOnly || currentLedger?.is_read_only)
                      ? '此帳本已開啟唯讀模式，所有歷史明細僅供查詢與統計，無法修改或刪除。'
                      : `此紀錄出資付款人為「${txPayerName}」，僅付款人本人、代記帳人或帳本管理員具有編輯權限。如需代為修改，可至「家庭設定」開啟管理員模式。`}
                  </Text>
                </View>
              </View>
            )}
            {transaction.type === 'memo' ? (
              <>
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
                        ? `✓ 由 ${getMemberById(transaction.completed_by)?.display_name || '家庭成員'}${formatMemoCompletedTime(transaction.completed_at, transaction.updated_at) ? ` 於 ${formatMemoCompletedTime(transaction.completed_at, transaction.updated_at)}` : ''} 打勾辦妥`
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

                {/* 💳 連動紀錄區塊 (辦妥時顯示) */}
                {isSettled && (
                  <View style={styles.linkedExpenseContainer}>
                    <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>
                      {linkedExpense
                        ? (linkedExpense.type === 'income'
                          ? '💵 連動收入紀錄'
                          : linkedExpense.type === 'transfer'
                          ? '⇄ 連動轉帳紀錄'
                          : linkedExpense.type === 'memo'
                          ? '📝 連動接力待辦'
                          : '💳 連動支出紀錄')
                        : '💰 連動記帳 / 轉帳 / 接力待辦'}
                    </Text>
                    {linkedExpense ? (
                      <View style={styles.linkedExpenseCard}>
                        <View style={styles.linkedExpenseHeader}>
                          <View style={styles.linkedExpenseInfo}>
                            <Text style={styles.linkedExpenseTitle} numberOfLines={1}>
                              {linkedExpense.type === 'memo'
                                ? (parseMemoNote(linkedExpense.note).title || linkedExpense.note)
                                : (linkedExpense.merchant || linkedExpense.category?.name || (linkedExpense.type === 'income' ? '收入記帳' : linkedExpense.type === 'transfer' ? '轉帳記錄' : '支出記帳'))}
                            </Text>
                            <Text style={styles.linkedExpenseSubtitle} numberOfLines={1}>
                              {(() => {
                                if (linkedExpense.type === 'memo') {
                                  return `生活待辦 · ${getMemberById(linkedExpense.paid_by)?.display_name || '成員'} 記錄`;
                                }
                                const payLabel = formatPaymentLabel(
                                  linkedExpense.payment_method,
                                  linkedExpense.payment_account || (linkedExpense.account_id ? getAccountById?.(linkedExpense.account_id) : undefined),
                                  paymentMethods
                                ).text;
                                const memberName = getMemberById(linkedExpense.paid_by)?.display_name || '成員';
                                if (linkedExpense.type === 'transfer') {
                                  return `${payLabel} · ${memberName} 轉帳`;
                                }
                                if (linkedExpense.type === 'income') {
                                  return `${payLabel} · ${memberName} 收款`;
                                }
                                return `${payLabel} · ${memberName} 付款`;
                              })()}
                            </Text>
                          </View>
                          <Text style={[
                            styles.linkedExpenseAmount,
                            linkedExpense.type === 'income' && { color: isDark ? '#34D399' : '#059669' },
                            linkedExpense.type === 'transfer' && { color: isDark ? '#818CF8' : '#4F46E5' },
                            linkedExpense.type === 'memo' && { color: isDark ? '#A78BFA' : '#7C3AED', fontSize: 13 },
                          ]}>
                            {linkedExpense.type === 'income'
                              ? `+ NT$ ${Number(linkedExpense.amount).toLocaleString('zh-TW')}`
                              : linkedExpense.type === 'transfer'
                              ? `⇄ NT$ ${Number(linkedExpense.amount).toLocaleString('zh-TW')}`
                              : linkedExpense.type === 'memo'
                              ? '接力待辦'
                              : `- NT$ ${Number(linkedExpense.amount).toLocaleString('zh-TW')}`}
                          </Text>
                        </View>
                        <View style={styles.linkedExpenseActions}>
                          <TouchableOpacity
                            style={styles.linkedExpenseActionBtn}
                            onPress={() => onOpenLinkedExpense?.(linkedExpense)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.linkedExpenseActionBtnText}>
                              {linkedExpense.type === 'memo' ? '查看接力待辦明細 ›' : '查看 / 編輯記帳明細 ›'}
                            </Text>
                          </TouchableOpacity>
                          {(canEdit || canEditCompletion) && (
                            <TouchableOpacity
                              style={styles.linkedExpenseUnlinkBtn}
                              onPress={() => {
                                showConfirm(
                                  '解除連動確認',
                                  '解除連動後，這筆生活待辦與該筆記帳將不再相互關聯，但記帳紀錄仍會保留。確定解除嗎？',
                                  async () => {
                                    setLinkedTxId('');
                                    await updateTransaction(transaction.id, { linked_transaction_id: '' });
                                    await updateTransaction(linkedExpense.id, { linked_transaction_id: '' });
                                  }
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
                          <Text style={styles.linkExpenseBtnText} maxFontSizeMultiplier={1.15}>
                            💰 連動記帳 / 轉帳 / 接力待辦
                          </Text>
                          <Text style={styles.linkExpenseBtnDesc} maxFontSizeMultiplier={1.08}>
                            支援支出、收入、轉帳發零用錢或接續下一則待辦，雙向綁定紀錄
                          </Text>
                        </TouchableOpacity>
                      )
                    )}
                  </View>
                )}

                {/* 記事內容多行輸入框 */}
                <View onLayout={(e) => setMemoSectionY(e.nativeEvent.layout.y)}>
                  <View style={styles.sectionLabelRow}>
                    <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>記事內容與備忘</Text>
                    <View style={styles.memoHeaderActionRow}>
                      {/* 📌 置頂重要記事切換 */}
                      {canEdit && !isSettled && (
                        isGroupOrderMemo(parseMemoNote(note).title, note) ? (
                          <View style={styles.memoHeaderPinBadgeAuto}>
                            <Text style={styles.memoHeaderPinTextAuto} maxFontSizeMultiplier={1.05}>⚡ 協作常駐</Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={[styles.memoHeaderPinBtn, isPinned && styles.memoHeaderPinBtnActive]}
                            onPress={() => {
                              if (!isPinned) {
                                const quota = checkMemoPinQuota(transactions, {
                                  targetScope: memoReminderTarget,
                                  memberId: (paidBy || transaction.paid_by) || currentUser?.id,
                                  excludeTxId: transaction.id,
                                });
                                if (!quota.canPin) {
                                  safeAlert(
                                    memoReminderTarget === 'personal' ? '個人置頂已達上限' : '全家置頂已達上限',
                                    quota.errorMessage || '置頂已達 5 筆上限，請先辦妥或取消現有置頂事項。'
                                  );
                                  return;
                                }
                              }
                              setIsPinned(!isPinned);
                            }}
                            activeOpacity={0.7}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <Text style={[styles.memoHeaderPinText, isPinned && styles.memoHeaderPinTextActive]} maxFontSizeMultiplier={1.08}>
                              📌 {isPinned ? '已置頂' : '置頂'}
                            </Text>
                          </TouchableOpacity>
                        )
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
                    numberOfLines={6}
                    placeholder="記錄今天的事情、靈感、採買備忘或家庭待辦..."
                    placeholderTextColor="#9CA3AF"
                    value={note}
                    onChangeText={(text) => setNote(handleChecklistInput(note, text))}
                    editable={canEdit}
                    onFocus={() => scrollToInput(memoSectionY, isSettled ? 220 : 70)}
                    textAlignVertical="top"
                    maxFontSizeMultiplier={1.15}
                  />

                  {/* 🛠️ 輸入框常駐編輯操作列 (待辦 / 標籤 / 範本快選 / 📷 純圖示拍照選圖) */}
                  {canEdit && (
                    <View style={styles.memoEditorToolbar}>
                      <TouchableOpacity
                        style={styles.memoToolbarBtnChecklist}
                        onPress={() => setNote(prev => insertChecklistCheckbox(prev))}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.memoToolbarBtnIcon}>☑</Text>
                        <Text style={styles.memoToolbarBtnText} maxFontSizeMultiplier={1.08}>＋待辦</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.memoToolbarBtn, !!activeMemoTag && styles.memoToolbarBtnActive]}
                        onPress={() => setIsMemoTagDrawerOpen(true)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.memoToolbarBtnIcon}>🏷️</Text>
                        <Text
                          style={[styles.memoToolbarBtnText, !!activeMemoTag && styles.memoToolbarBtnTextActive]}
                          numberOfLines={1}
                          maxFontSizeMultiplier={1.08}
                        >
                          {getMemoTagDisplayLabel(activeMemoTag)} ▾
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.memoToolbarBtn, !!activeQuickBuilder && styles.memoToolbarBtnHighlight]}
                        onPress={() => {
                          if (activeQuickBuilder) {
                            setMemoDrawerTab('quickBuilder');
                            setSelectedBuilderDomain(activeQuickBuilder.domain);
                          } else {
                            setMemoDrawerTab('templates');
                          }
                          setIsMemoTemplateDrawerOpen(true);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.memoToolbarBtnIcon}>{activeQuickBuilder ? '🪄' : '📋'}</Text>
                        <Text
                          style={[styles.memoToolbarBtnText, !!activeQuickBuilder && styles.memoToolbarBtnTextHighlight]}
                          numberOfLines={1}
                          maxFontSizeMultiplier={1.08}
                        >
                          {activeQuickBuilder ? activeQuickBuilder.shortToggleLabel.replace('⚡ ', '') : '範本快選'} ▾
                        </Text>
                      </TouchableOpacity>

                      {/* 📷 純圖示拍照/相簿/PDF 按鈕 (菜單/聯絡簿/型號速記) */}
                      <TouchableOpacity
                        style={[styles.memoToolbarBtnCamera, !!receiptPhotoUri && styles.memoToolbarBtnCameraActive]}
                        onPress={handlePromptMemoPhotoSource}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.memoToolbarBtnCameraIcon}>{isPdfAttachment ? '📄' : '📷'}</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* 📷 記事即時照片 / PDF 憑證縮圖列 (有附件才顯示，支援點擊檢視與一鍵移除) */}
                  {!!receiptPhotoUri && (
                    <View style={styles.memoPhotoPreviewBar}>
                      <TouchableOpacity
                        onPress={() => setViewingPhotoModal(true)}
                        activeOpacity={0.8}
                        style={styles.memoPhotoThumbnailTouchable}
                      >
                        {isPdfAttachment ? (
                          <View style={styles.memoPdfBadgeBox}>
                            <Text style={styles.memoPdfBadgeIcon}>📄</Text>
                          </View>
                        ) : (
                          <Image source={{ uri: receiptPhotoUri }} style={styles.memoPhotoThumbnailImg} />
                        )}
                        <View style={styles.memoPhotoTextCol}>
                          <Text style={styles.memoPhotoHintText} numberOfLines={1} maxFontSizeMultiplier={1.05}>
                            {isPdfAttachment ? `📄 ${attachmentDisplayName}` : '📷 照片已附加 (點擊放大檢視)'}
                          </Text>
                          {isPdfAttachment && (
                            <Text style={styles.memoPhotoSubHintText} numberOfLines={1} maxFontSizeMultiplier={1.05}>
                              點擊檢視 / 開啟 PDF 憑證
                            </Text>
                          )}
                        </View>
                      </TouchableOpacity>
                      {canEdit && (
                        <TouchableOpacity
                          style={styles.memoPhotoDeleteBtn}
                          onPress={clearReceiptAttachment}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.memoPhotoDeleteBtnText}>✕ 移除</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>

                {/* 💡 智慧即時日期辨識膠囊 (僅在固定提醒模式下顯示，供一鍵套用或提前) */}
                {canEdit && !memoReminderRelay && detectedMemoDate && (
                  <View style={styles.autoDetectedDateCard}>
                    <View style={styles.autoDetectedDateHeader}>
                      <Text style={styles.autoDetectedDateTitle} maxFontSizeMultiplier={1.08}>
                        💡 辨識到日期：<Text style={{ fontWeight: 'bold', color: isDark ? '#FDE68A' : '#B45309' }}>{detectedMemoDate.formattedYmd}</Text>
                        {detectedMemoDate.isRocYear ? ` (${detectedMemoDate.rawMatch})` : ''}
                      </Text>
                      {!!memoReminderDate ? (
                        <TouchableOpacity
                          style={styles.autoDetectedCancelBtn}
                          onPress={() => {
                            setMemoReminderDate('');
                            setMemoReminderRepeat('once');
                            setMemoReminderRelay(false);
                            setMemoReminderRelayOffset(undefined);
                            userManuallySetReminderRef.current = true;
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.autoDetectedCancelBtnText} maxFontSizeMultiplier={1.08}>
                            ✕ 取消提醒
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.autoDetectedDismissedBadge}>
                          <Text style={styles.autoDetectedDismissedBadgeText}>未設提醒</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.autoDetectedDateBtnsRow}>
                      <TouchableOpacity
                        style={[
                          styles.autoDetectedDateActionBtn,
                          memoReminderDate === detectedMemoDate.formattedYmd && styles.autoDetectedDateActionBtnActive,
                        ]}
                        onPress={() => {
                          setMemoReminderDate(detectedMemoDate.formattedYmd);
                          setMemoReminderRepeat('once');
                          setMemoReminderCalendar('solar');
                          setMemoReminderRelay(false);
                          setMemoReminderRelayOffset(undefined);
                          userManuallySetReminderRef.current = true;
                        }}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.autoDetectedDateActionBtnText,
                            memoReminderDate === detectedMemoDate.formattedYmd && styles.autoDetectedDateActionBtnTextActive,
                          ]}
                          maxFontSizeMultiplier={1.08}
                        >
                          當天 ({detectedMemoDate.month}/{detectedMemoDate.day})
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.autoDetectedDateActionBtn,
                          memoReminderDate === offsetDateYmd(detectedMemoDate.formattedYmd, -1) && styles.autoDetectedDateActionBtnActive,
                        ]}
                        onPress={() => {
                          setMemoReminderDate(offsetDateYmd(detectedMemoDate.formattedYmd, -1));
                          setMemoReminderRepeat('once');
                          setMemoReminderCalendar('solar');
                          setMemoReminderRelay(false);
                          setMemoReminderRelayOffset(undefined);
                          userManuallySetReminderRef.current = true;
                        }}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.autoDetectedDateActionBtnText,
                            memoReminderDate === offsetDateYmd(detectedMemoDate.formattedYmd, -1) && styles.autoDetectedDateActionBtnTextActive,
                          ]}
                          maxFontSizeMultiplier={1.08}
                        >
                          提前 1 天
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.autoDetectedDateActionBtn,
                          memoReminderDate === offsetDateYmd(detectedMemoDate.formattedYmd, -3) && styles.autoDetectedDateActionBtnActive,
                        ]}
                        onPress={() => {
                          setMemoReminderDate(offsetDateYmd(detectedMemoDate.formattedYmd, -3));
                          setMemoReminderRepeat('once');
                          setMemoReminderCalendar('solar');
                          setMemoReminderRelay(false);
                          setMemoReminderRelayOffset(undefined);
                          userManuallySetReminderRef.current = true;
                        }}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.autoDetectedDateActionBtnText,
                            memoReminderDate === offsetDateYmd(detectedMemoDate.formattedYmd, -3) && styles.autoDetectedDateActionBtnTextActive,
                          ]}
                          maxFontSizeMultiplier={1.08}
                        >
                          提前 3 天
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* ⏰ 待辦提醒日期 (選填，精簡 4 顆晶片) */}
                <View style={styles.sectionLabelRow}>
                  <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>⏰ 待辦提醒日期 (選填)</Text>
                  {canEdit && !!memoReminderDate && (memoReminderRelay || !detectedMemoDate) && (
                    <TouchableOpacity
                      onPress={() => {
                        setMemoReminderDate('');
                        setMemoReminderRepeat('once');
                        setMemoReminderRelay(false);
                        setMemoReminderRelayOffset(undefined);
                        userManuallySetReminderRef.current = true;
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.clearMerchantText} maxFontSizeMultiplier={1.08}>清除提醒 ✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <HorizontalScrollView
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.memoReminderDateScroll}
                  keyboardShouldPersistTaps="handled"
                >
                  <TouchableOpacity
                    disabled={!canEdit}
                    style={[styles.dateChip, !memoReminderDate && !memoReminderRelay && styles.dateChipActive]}
                    onPress={() => {
                      setMemoReminderDate('');
                      setMemoReminderRepeat('once');
                      setMemoReminderRelay(false);
                      setMemoReminderRelayOffset(undefined);
                      userManuallySetReminderRef.current = true;
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dateChipText, !memoReminderDate && !memoReminderRelay && styles.dateChipTextActive]} maxFontSizeMultiplier={1.15}>
                      不設提醒
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    disabled={!canEdit}
                    style={[styles.dateChip, !memoReminderRelay && memoReminderDate === todayYmd && styles.dateChipActive]}
                    onPress={() => {
                      setMemoReminderDate(todayYmd);
                      setMemoReminderCalendar('solar');
                      setMemoReminderRelay(false);
                      setMemoReminderRelayOffset(undefined);
                      baseReminderDateRef.current = todayYmd;
                      baseReminderCalendarRef.current = 'solar';
                      if (memoReminderRepeat === 'lunar_1_15' || memoReminderRepeat === 'lunar_2_16') {
                        setMemoReminderRepeat('once');
                      }
                      userManuallySetReminderRef.current = true;
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dateChipText, !memoReminderRelay && memoReminderDate === todayYmd && styles.dateChipTextActive]} maxFontSizeMultiplier={1.15}>
                      今天 ({today.getMonth() + 1}/{today.getDate()})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    disabled={!canEdit}
                    style={[styles.dateChip, !memoReminderRelay && memoReminderDate === tomorrowYmd && styles.dateChipActive]}
                    onPress={() => {
                      setMemoReminderDate(tomorrowYmd);
                      setMemoReminderCalendar('solar');
                      setMemoReminderRelay(false);
                      setMemoReminderRelayOffset(undefined);
                      baseReminderDateRef.current = tomorrowYmd;
                      baseReminderCalendarRef.current = 'solar';
                      if (memoReminderRepeat === 'lunar_1_15' || memoReminderRepeat === 'lunar_2_16') {
                        setMemoReminderRepeat('once');
                      }
                      userManuallySetReminderRef.current = true;
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dateChipText, !memoReminderRelay && memoReminderDate === tomorrowYmd && styles.dateChipTextActive]} maxFontSizeMultiplier={1.15}>
                      明天 ({tomorrow.getMonth() + 1}/{tomorrow.getDate()})
                    </Text>
                  </TouchableOpacity>

                  {isCustomReminder && !memoReminderRelay && (
                    <TouchableOpacity
                      disabled={!canEdit}
                      style={[
                        styles.dateChip,
                        styles.dateChipActive,
                        memoReminderCalendar === 'lunar' ? styles.lunarMoreBtnSelected : styles.dateChipCustom,
                      ]}
                      onPress={() => {
                        userManuallySetReminderRef.current = true;
                        setReminderPickerInitialMode(memoReminderCalendar || 'solar');
                        setReminderDatePickerVisible(true);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.dateChipText,
                          styles.dateChipTextActive,
                          memoReminderCalendar === 'lunar' && styles.lunarMoreBtnTextSelected,
                        ]}
                        maxFontSizeMultiplier={1.15}
                      >
                        {memoReminderCalendar === 'lunar'
                          ? `🏮 ${formatMemoReminderBadge(memoReminderDate, 'lunar', 'once')?.dateText || memoReminderDate}`
                          : `🗓️ ${memoReminderDate.slice(5).replace('-', '/')} (自訂)`}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {canEdit && (
                    <TouchableOpacity
                      style={[
                        styles.dateMoreBtn,
                        !memoReminderRelay && isCustomReminder && (memoReminderCalendar === 'lunar' ? styles.lunarMoreBtnSelected : styles.dateMoreBtnSelected),
                      ]}
                      onPress={() => {
                        userManuallySetReminderRef.current = true;
                        setReminderPickerInitialMode(memoReminderCalendar || 'solar');
                        setReminderDatePickerVisible(true);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.dateMoreBtnText,
                          !memoReminderRelay && isCustomReminder && (memoReminderCalendar === 'lunar' ? styles.lunarMoreBtnTextSelected : styles.dateMoreBtnTextSelected),
                        ]}
                        maxFontSizeMultiplier={1.15}
                      >
                        {!memoReminderRelay && isCustomReminder ? '✏️ 改選' : '🗓️ 更多...'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </HorizontalScrollView>

                {/* 🔁 顯性子項目自動接力提醒開關（僅當子項目含日期或已開啟接力時顯示） */}
                {(relaySchedule?.hasDatedChecklistItems || memoReminderRelay) && (() => {
                  const routeStops = [
                    ...(relaySchedule?.pendingStops || []),
                    ...(relaySchedule?.headerStop ? [relaySchedule.headerStop] : []),
                  ];
                  const routePreview = routeStops.slice(0, 3).map(s => s.shortDate).join(' → ')
                    + (routeStops.length > 3 ? ' → …' : '');
                  const ruleHint = memoReminderRelayOffset === undefined
                    ? `跟隨預設：${formatMemoAdvanceLabel(notifPrefs.memoAdvanceMode)}`
                    : memoReminderRelayOffset === 0
                    ? `僅當天 ${notifPrefs.dailyReminderTime} 提醒`
                    : `前 ${Math.abs(memoReminderRelayOffset)} 天 ${notifPrefs.dailyReminderTime} 預告＋當天提醒`;
                  const subText = memoReminderRelay
                    ? (relaySchedule?.nextStop
                        ? `下一站到期：${routePreview}（${ruleHint}）`
                        : '目前所有帶日期子項目皆已完成，將保留原提醒日')
                    : '打勾子項目後自動推進至下一站到期日';

                  return (
                    <View style={[styles.relayToggleCard, memoReminderRelay && styles.relayToggleCardActive]}>
                      <View style={styles.relayHeaderRow}>
                        <View style={styles.relayTitleBlock}>
                          <Text style={[styles.relayTitle, memoReminderRelay && styles.relayTitleActive]} maxFontSizeMultiplier={1.08}>
                            🔁 隨子項目日期自動接力
                          </Text>
                          <Text style={[styles.relaySubtitle, memoReminderRelay && styles.relaySubtitleActive]} maxFontSizeMultiplier={1.08}>
                            {subText}
                          </Text>
                        </View>
                        <TouchableOpacity
                          disabled={!canEdit}
                          style={[styles.relaySwitchBtn, memoReminderRelay && styles.relaySwitchBtnActive]}
                          onPress={() => {
                            userManuallySetReminderRef.current = true;
                            if (!memoReminderRelay) {
                              setMemoReminderRelay(true);
                              setMemoReminderCalendar('solar');
                              setMemoReminderRepeat('once');
                              if (relaySchedule?.nextDateYmd) {
                                setMemoReminderDate(relaySchedule.nextDateYmd);
                              }
                            } else {
                              setMemoReminderRelay(false);
                              setMemoReminderRelayOffset(undefined);
                            }
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.relaySwitchBtnText, memoReminderRelay && styles.relaySwitchBtnTextActive]} maxFontSizeMultiplier={1.08}>
                            {memoReminderRelay ? '已開啟' : '未開啟'}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {memoReminderRelay && (
                        <View style={styles.relayOffsetRow}>
                          <Text style={styles.relayOffsetLabel} maxFontSizeMultiplier={1.08}>每站提醒時機：</Text>
                          {[
                            { label: '跟隨預設', offset: undefined as number | undefined },
                            { label: '僅當天', offset: 0 as number | undefined },
                            { label: '提前 1 天', offset: -1 as number | undefined },
                            { label: '提前 3 天', offset: -3 as number | undefined },
                          ].map(opt => {
                            const selected = memoReminderRelayOffset === opt.offset;
                            return (
                              <TouchableOpacity
                                key={opt.label}
                                disabled={!canEdit}
                                style={[styles.relayOffsetChip, selected && styles.relayOffsetChipActive]}
                                onPress={() => {
                                  userManuallySetReminderRef.current = true;
                                  setMemoReminderRelayOffset(opt.offset);
                                }}
                                activeOpacity={0.7}
                              >
                                <Text style={[styles.relayOffsetChipText, selected && styles.relayOffsetChipTextActive]} maxFontSizeMultiplier={1.08}>
                                  {opt.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })()}

                {/* 🔄 提醒頻率與週期 (僅在設定固定提醒日期時展開，未設提醒或接力模式高度為 0) */}
                {!!memoReminderDate && !memoReminderRelay && (
                  <View style={styles.memoRepeatCard}>
                    <View style={styles.memoRepeatHeaderRow}>
                      <Text style={styles.memoRepeatTitle} maxFontSizeMultiplier={1.08}>
                        🔄 提醒頻率與週期
                      </Text>
                      {canEdit &&
                        memoReminderRepeat !== 'lunar_1_15' &&
                        memoReminderRepeat !== 'lunar_2_16' && (
                          <View style={styles.calendarBasisSwitch}>
                            <TouchableOpacity
                              style={[
                                styles.calendarBasisBtn,
                                memoReminderCalendar === 'solar' && styles.calendarBasisBtnActive,
                              ]}
                              onPress={() => {
                                setMemoReminderCalendar('solar');
                                baseReminderCalendarRef.current = 'solar';
                              }}
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
                              onPress={() => {
                                setMemoReminderCalendar('lunar');
                                baseReminderCalendarRef.current = 'lunar';
                              }}
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
                        const isRepSelected = memoReminderRepeat === opt.value;
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
                                if (memoReminderRepeat !== 'lunar_1_15' && memoReminderRepeat !== 'lunar_2_16') {
                                  baseReminderDateRef.current = memoReminderDate || todayYmd;
                                  baseReminderCalendarRef.current = memoReminderCalendar || 'solar';
                                }
                                setMemoReminderRepeat(opt.value);
                                setMemoReminderCalendar('lunar');
                                const alignedYmd = getNearestLunarPairDate(memoReminderDate || todayYmd, opt.value);
                                setMemoReminderDate(alignedYmd);
                              } else {
                                const wasLunarPair = memoReminderRepeat === 'lunar_1_15' || memoReminderRepeat === 'lunar_2_16';
                                setMemoReminderRepeat(opt.value);
                                if (wasLunarPair) {
                                  const restoredDate = baseReminderDateRef.current || todayYmd;
                                  const restoredCal = baseReminderCalendarRef.current || 'solar';
                                  setMemoReminderDate(restoredDate);
                                  setMemoReminderCalendar(restoredCal);
                                } else if (!memoReminderDate) {
                                  setMemoReminderDate(todayYmd);
                                  baseReminderDateRef.current = todayYmd;
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

                    {(() => {
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
                )}

                {/* 🎯 適用對象範圍切換 (方案 B: 精簡單行 + 下方親切說明) */}
                <View style={styles.memoTargetCard}>
                  <View style={styles.memoRepeatHeaderRow}>
                    <Text style={styles.memoRepeatTitle} maxFontSizeMultiplier={1.08}>
                      🎯 適用對象
                    </Text>
                  </View>
                  <View style={styles.memoTargetButtonsRow}>
                    <TouchableOpacity
                      disabled={!canEdit}
                      style={[
                        styles.memoTargetBtn,
                        memoReminderTarget === 'family' && styles.memoTargetBtnActiveFamily,
                      ]}
                      onPress={() => {
                        if (isPinned && memoReminderTarget !== 'family') {
                          const quota = checkMemoPinQuota(transactions, {
                            targetScope: 'family',
                            memberId: (paidBy || transaction.paid_by) || currentUser?.id,
                            excludeTxId: transaction.id,
                          });
                          if (!quota.canPin) {
                            safeAlert('全家置頂已達上限', `${quota.errorMessage}\n切換為全家共享後已自動取消置頂。`);
                            setIsPinned(false);
                          }
                        }
                        setMemoReminderTarget('family');
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.memoTargetBtnText,
                          memoReminderTarget === 'family' && styles.memoTargetBtnTextActive,
                        ]}
                        maxFontSizeMultiplier={1.1}
                      >
                        🌐 全家共享
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      disabled={!canEdit}
                      style={[
                        styles.memoTargetBtn,
                        memoReminderTarget === 'personal' && styles.memoTargetBtnActivePersonal,
                      ]}
                      onPress={() => {
                        if (isPinned && memoReminderTarget !== 'personal') {
                          const quota = checkMemoPinQuota(transactions, {
                            targetScope: 'personal',
                            memberId: (paidBy || transaction.paid_by) || currentUser?.id,
                            excludeTxId: transaction.id,
                          });
                          if (!quota.canPin) {
                            safeAlert('個人置頂已達上限', `${quota.errorMessage}\n切換為個人專屬後已自動取消置頂。`);
                            setIsPinned(false);
                          }
                        }
                        setMemoReminderTarget('personal');
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.memoTargetBtnText,
                          memoReminderTarget === 'personal' && styles.memoTargetBtnTextActive,
                        ]}
                        maxFontSizeMultiplier={1.1}
                      >
                        👤 個人專屬
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.memoTargetDescText} maxFontSizeMultiplier={1.08}>
                    {memoReminderTarget === 'family'
                      ? (memoReminderDate ? '💡 記帳本所有家庭成員皆可瀏覽與接收待辦提醒' : '💡 記帳本所有家庭成員皆可瀏覽此生活記事')
                      : (memoReminderDate ? '🔒 僅自己可見與接收提醒，不干擾其他家庭成員' : '🔒 僅自己可見，不會出現在其他人的記事列表')}
                  </Text>
                </View>

                {/* 負責 / 記錄成員 */}
                <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>
                  {memoReminderTarget === 'personal'
                    ? (memoReminderDate ? '負責成員 (僅該成員手機接收個人提醒)' : '專屬成員 (僅該成員可見此私人記事)')
                    : '記錄成員'}
                </Text>
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
                      style={[styles.typeBtn, type === 'expense' && styles.typeBtnActiveExpense]}
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

            {/* 金額輸入框 + 點數折抵整合 (極致瘦身卡片) */}
            <View style={[styles.amountCardIntegrated, !canEdit && styles.readOnlyAmountContainer]}>
              <View style={styles.amountInputGroup}>
                <Text style={[styles.currencyPrefixIntegrated, !canEdit && styles.readOnlyTextMuted]} maxFontSizeMultiplier={1.15}>NT$</Text>
                <TextInput
                  style={[styles.amountInputIntegrated, !canEdit && styles.readOnlyAmountInput]}
                  placeholder="0"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                  value={amount}
                  onChangeText={setAmount}
                  editable={canEdit}
                  autoFocus={false}
                  maxFontSizeMultiplier={1.15}
                  underlineColorAndroid="transparent"
                />
              </View>

              {type === 'expense' && canEdit && (
                <TouchableOpacity
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
                  activeOpacity={0.7}
                >
                  <Text
                    style={[styles.discountToggleChipText, showDiscountPanel && styles.discountToggleChipTextActive]}
                    maxFontSizeMultiplier={1.08}
                  >
                    {showDiscountPanel ? '🎁 收起折抵 ▴' : '🎁 點數折抵'}
                  </Text>
                </TouchableOpacity>
              )}
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

            {/* 分類選擇 (常用 2 行 8 格精選 ＋ 更多抽屜) */}
            <View style={styles.sectionLabelRow}>
              <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>選擇分類</Text>
              {availableCategories.length > 8 && canEdit && (
                <TouchableOpacity
                  onPress={() => setIsCategoryDrawerOpen(true)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.categoryMoreHeaderLink} maxFontSizeMultiplier={1.08}>
                    全部 {availableCategories.length} 個 ▾
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.categoryGrid}>
              {displayedCategories.map(cat => {
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
              {availableCategories.length > 8 && canEdit && (
                <TouchableOpacity
                  style={[
                    styles.categoryChip,
                    styles.categoryMoreChip,
                  ]}
                  onPress={() => setIsCategoryDrawerOpen(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.categoryChipIcon}>📂</Text>
                  <Text style={styles.categoryMoreChipText} maxFontSizeMultiplier={1.15}>
                    更多分類 ▾
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* 💳 付款成員與方式 (緊湊雙行左右對齊卡片) */}
            <View style={styles.payerMethodCard}>
              {/* 第一行：付款成員 */}
              <View style={styles.payerMethodRow}>
                <Text style={styles.payerMethodLabel} numberOfLines={1} maxFontSizeMultiplier={1.12}>付款成員</Text>
                <HorizontalScrollView
                  style={styles.payerMethodScroll}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.payerMethodChipsScroll}
                  keyboardShouldPersistTaps="handled"
                >
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
                          styles.payerChipCompact,
                          isSelected && styles.payerChipCompactActive,
                          !canEdit && !isSelected && styles.readOnlyUnselectedChip,
                        ]}
                        onPress={() => handleSelectPayer(member.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.payerAvatarCompact}>{member.avatar_url}</Text>
                        <Text
                          style={[styles.payerNameCompact, isSelected && styles.payerNameCompactActive]}
                          maxFontSizeMultiplier={1.12}
                        >
                          {member.display_name}
                          {isMe ? ' (我)' : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </HorizontalScrollView>
              </View>

              <View style={styles.payerMethodDivider} />

              {/* 第二行：付款方式 */}
              <View style={styles.payerMethodRow}>
                <Text style={styles.payerMethodLabel} numberOfLines={1} maxFontSizeMultiplier={1.12}>付款方式</Text>
                <HorizontalScrollView
                  style={styles.payerMethodScroll}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.payerMethodChipsScroll}
                  keyboardShouldPersistTaps="handled"
                >
                  {activePaymentMethods.map((opt) => {
                    const isSelected = paymentMethod === opt.id;
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        disabled={!canEdit}
                        style={[
                          styles.methodChipCompact,
                          isSelected && { borderColor: opt.color || '#4F46E5', backgroundColor: `${opt.color || '#4F46E5'}18` },
                          !canEdit && !isSelected && styles.readOnlyUnselectedChip,
                        ]}
                        onPress={() => handleMethodChange(opt.id as any)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.methodChipIconCompact}>{opt.icon}</Text>
                        <Text
                          style={[
                            styles.methodChipTextCompact,
                            isSelected && { color: opt.color || '#4F46E5', fontWeight: '700' },
                          ]}
                          maxFontSizeMultiplier={1.12}
                        >
                          {opt.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </HorizontalScrollView>
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
                            isCardSelected && {
                              borderColor: card.color || '#3B82F6',
                              backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#EFF6FF',
                            },
                            !canEdit && !isCardSelected && styles.readOnlyUnselectedChip,
                          ]}
                          onPress={() => setSelectedAccountId(isCardSelected ? '' : card.id)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.cardChipIcon}>💳</Text>
                          <View>
                            <Text
                              style={[
                                styles.cardChipName,
                                isCardSelected && {
                                  color: isDark ? '#93C5FD' : (card.color || '#1E40AF'),
                                  fontWeight: '700',
                                },
                              ]}
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
                <View style={styles.emptySubCardBox}>
                  <Text style={styles.emptySubCardText} maxFontSizeMultiplier={1.15}>
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
                            isCardSelected && {
                              borderColor: card.color || '#0284C7',
                              backgroundColor: isDark ? 'rgba(14, 165, 233, 0.2)' : '#F0F9FF',
                            },
                            !canEdit && !isCardSelected && styles.readOnlyUnselectedChip,
                          ]}
                          onPress={() => setSelectedAccountId(card.id)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.cardChipIcon}>{card.icon || '🚌'}</Text>
                          <View>
                            <Text
                              style={[
                                styles.cardChipName,
                                isCardSelected && {
                                  color: isDark ? '#7DD3FC' : (card.color || '#0284C7'),
                                  fontWeight: '700',
                                },
                              ]}
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
                <View style={styles.emptySubCardBox}>
                  <Text style={styles.emptySubCardText} maxFontSizeMultiplier={1.15}>
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
                            isAccountSelected && {
                              borderColor: account.color || '#8B5CF6',
                              backgroundColor: isDark ? 'rgba(139, 92, 246, 0.2)' : '#F5F3FF',
                            },
                            !canEdit && !isAccountSelected && styles.readOnlyUnselectedChip,
                          ]}
                          onPress={() => setSelectedAccountId(isAccountSelected ? '' : account.id)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.cardChipIcon}>🏦</Text>
                          <View>
                            <Text
                              style={[
                                styles.cardChipName,
                                isAccountSelected && {
                                  color: isDark ? '#C4B5FD' : (account.color || '#8B5CF6'),
                                  fontWeight: '700',
                                },
                              ]}
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
                <View style={styles.emptySubCardBox}>
                  <Text style={styles.emptySubCardText} maxFontSizeMultiplier={1.15}>
                    🏦 目前尚未綁定屬於您的銀行帳戶。{!inAdminMode && '（如需選用其他成員帳戶，可至「家庭設定」啟用管理員模式）'}
                  </Text>
                </View>
              )}
            </View>

            {/* 內部轉帳專屬：轉入終點（卡片或受款成員） */}
            {type === 'transfer' && (targetLinkedAccount || targetRecipientMember) && (
              <View style={styles.destinationSection}>
                <View style={styles.sectionLabelRow}>
                  <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>
                    {targetLinkedAccount ? '📥 轉入目標卡片 (終點)' : '📥 轉入受款成員 (終點)'}
                  </Text>
                </View>
                {targetLinkedAccount && (
                  <View style={[styles.destinationCardBox, { borderColor: `${targetLinkedAccount.color || '#0284C7'}50` }]}>
                    <View style={[styles.destinationCardIconBox, { backgroundColor: `${targetLinkedAccount.color || '#0284C7'}15` }]}>
                      <Text style={styles.destinationCardIcon}>{targetLinkedAccount.icon || '🚌'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.destinationCardName, { color: targetLinkedAccount.color || '#0284C7' }]}
                        maxFontSizeMultiplier={1.15}
                      >
                        {targetLinkedAccount.name}{targetLinkedAccount.last_four_digits ? ` (*${targetLinkedAccount.last_four_digits})` : ''}
                      </Text>
                      <Text style={styles.destinationCardSub} maxFontSizeMultiplier={1.15}>
                        持卡人：{targetLinkedCardholder ? targetLinkedCardholder.display_name : '全家通用'} · 卡片即時餘額：NT$ {targetLinkedAccount.balance.toLocaleString()}
                      </Text>
                    </View>
                    <View style={styles.destinationBadge}>
                      <Text style={styles.destinationBadgeText} maxFontSizeMultiplier={1.08}>入帳卡片</Text>
                    </View>
                  </View>
                )}
                {targetRecipientMember && (
                  <View style={styles.destinationMemberBox}>
                    <View style={styles.destinationMemberAvatarBox}>
                      <Text style={styles.destinationMemberAvatar}>{targetRecipientMember.avatar_url || '👤'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.destinationMemberName} maxFontSizeMultiplier={1.15}>
                        {targetRecipientMember.display_name}
                      </Text>
                      <Text style={styles.destinationMemberSub} maxFontSizeMultiplier={1.15}>
                        家庭零用錢錢包入帳
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.destinationBadge,
                        {
                          backgroundColor: isDark ? 'rgba(16, 185, 129, 0.18)' : '#ECFDF5',
                          borderColor: isDark ? 'rgba(52, 211, 153, 0.4)' : '#A7F3D0',
                        },
                      ]}
                    >
                      <Text style={[styles.destinationBadgeText, { color: isDark ? '#6EE7B7' : '#059669' }]} maxFontSizeMultiplier={1.08}>受款入帳</Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* 發生日期與時間調整 (緊湊單行) */}
            {!canEdit ? (
              <View style={styles.readOnlyDateCard}>
                <Text style={styles.readOnlyDateCardText} maxFontSizeMultiplier={1.15}>
                  📅 發生時間：{curDateFormattedWithTime}
                </Text>
              </View>
            ) : (
              <View style={{ marginBottom: 8 }}>
                <View style={styles.dateInlineContainer}>
                  <Text style={styles.dateInlineLabel} maxFontSizeMultiplier={1.12} numberOfLines={1}>日期</Text>
                  <HorizontalScrollView
                    style={{ flex: 1, minWidth: 0 }}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.dateInlineScroll}
                    keyboardShouldPersistTaps="handled"
                  >
                    <TouchableOpacity
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
                      <Text
                        style={[styles.dateChipText, isOriginal && styles.dateChipTextActive]}
                        maxFontSizeMultiplier={1.12}
                      >
                        原日期 ({origDateFormatted})
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.dateChip, isToday && !isOriginal && styles.dateChipActive]}
                      onPress={() => setQuickDate(today)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[styles.dateChipText, isToday && !isOriginal && styles.dateChipTextActive]}
                        maxFontSizeMultiplier={1.12}
                      >
                        今天 ({today.getMonth() + 1}/{today.getDate()})
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.dateChip, isYesterday && !isOriginal && styles.dateChipActive]}
                      onPress={() => setQuickDate(yesterday)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[styles.dateChipText, isYesterday && !isOriginal && styles.dateChipTextActive]}
                        maxFontSizeMultiplier={1.12}
                      >
                        昨天 ({yesterday.getMonth() + 1}/{yesterday.getDate()})
                      </Text>
                    </TouchableOpacity>

                    {/* 若選擇了其他自訂日期 */}
                    {isCustomDate && (
                      <TouchableOpacity
                        style={[styles.dateChip, styles.dateChipActive, styles.dateChipCustom]}
                        onPress={() => setDatePickerVisible(true)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[styles.dateChipText, styles.dateChipTextActive]}
                          maxFontSizeMultiplier={1.12}
                        >
                          🗓️ {curDate.getMonth() + 1}/{curDate.getDate()}
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
                        maxFontSizeMultiplier={1.12}
                      >
                        {isCustomDate ? '✏️ 改選...' : '🗓️ 改選...'}
                      </Text>
                    </TouchableOpacity>
                  </HorizontalScrollView>
                </View>
                {renderTimeInputRow()}
              </View>
            )}

            {/* 🏪 店家與備註 (整合常駐操作列 · 極致瘦身) */}
            <View
              onLayout={(e) => setMerchantSectionY(e.nativeEvent.layout.y)}
              style={styles.storeNoteCard}
            >
              <View style={styles.storeNoteCardHeader}>
                <Text style={styles.storeNoteCardTitle} maxFontSizeMultiplier={1.12}>
                  🏪 店家與備註
                </Text>
                {/* 📷 拍照附收據/PDF 移至標題列右上角 */}
                {canEdit && (
                  <TouchableOpacity
                    style={[
                      styles.headerReceiptBtn,
                      !!receiptPhotoUri && styles.headerReceiptBtnActive,
                    ]}
                    onPress={handlePromptReceiptPhotoSource}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.headerReceiptBtnIcon}>{isPdfAttachment ? '📄' : '📸'}</Text>
                    <Text
                      style={[
                        styles.headerReceiptBtnText,
                        !!receiptPhotoUri && styles.headerReceiptBtnTextActive,
                      ]}
                      maxFontSizeMultiplier={1.08}
                    >
                      {receiptPhotoUri ? (isPdfAttachment ? 'PDF 已附 ▾' : '收據已附 ▾') : '收據/PDF'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* 第 1 行：店家輸入框（滿版） */}
              <View style={[styles.storeInputInner, !canEdit && styles.readOnlyInputWrapper]}>
                <Text style={styles.storeInputIcon}>🏪</Text>
                <TextInput
                  style={[styles.storeTextInput, !canEdit && styles.readOnlyTextInput]}
                  placeholder={canEdit ? "例如：麥當勞" : "未填店家"}
                  placeholderTextColor="#9CA3AF"
                  value={merchant}
                  onChangeText={setMerchant}
                  editable={canEdit}
                  onFocus={() => scrollToInput(merchantSectionY, 350)}
                  returnKeyType="next"
                  maxFontSizeMultiplier={1.12}
                />
                {canEdit && !!merchant && (
                  <TouchableOpacity
                    onPress={() => setMerchant('')}
                    style={styles.storeClearBtn}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Text style={styles.storeClearBtnText}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* 常用店家快選滑動列 (緊貼店家下方，一戳秒選秒帶入) */}
              {canEdit && suggestedMerchants.length > 0 && (
                <View style={styles.quickMerchantsRowContainer}>
                  <HorizontalScrollView
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.storeQuickChipsScroll}
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
                </View>
              )}

              {/* 第 2 行：備註輸入框（滿版＋多行自動展開） */}
              <View onLayout={(e) => setNoteSectionY(e.nativeEvent.layout.y)}>
                <View style={[styles.noteInputInner, !canEdit && styles.readOnlyInputWrapper]}>
                  <Text style={styles.noteInputIcon}>📝</Text>
                  {canEdit ? (
                    <TextInput
                      style={[
                        styles.noteTextInput,
                        Platform.OS === 'web' && { height: Math.max(20, webNoteLines * 20) },
                      ]}
                      placeholder="備註（例如：好市多牛肉、多筆發票品項明細...）"
                      placeholderTextColor="#9CA3AF"
                      value={note}
                      onChangeText={setNote}
                      multiline
                      scrollEnabled={false}
                      textAlignVertical="top"
                      numberOfLines={Platform.OS === 'web' ? webNoteLines : undefined}
                      onFocus={() => scrollToInput(merchantSectionY > 0 ? merchantSectionY + noteSectionY : 0, 400)}
                      maxFontSizeMultiplier={1.12}
                    />
                  ) : (
                    <Text
                      selectable
                      style={[styles.noteReadOnlyText, !note && styles.noteReadOnlyPlaceholder]}
                      maxFontSizeMultiplier={1.12}
                    >
                      {note || '無備註'}
                    </Text>
                  )}
                  {canEdit && !!note && (
                    <TouchableOpacity
                      onPress={() => setNote('')}
                      style={styles.noteClearBtn}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Text style={styles.storeClearBtnText}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* 緊湊發票操作列 (對稱滿版高顯色排版) */}
              {canEdit && type === 'expense' && (
                <View style={styles.storeNoteToolbarRow}>
                  <TouchableOpacity
                    style={[
                      styles.invoiceToolbarBtn,
                      styles.invoiceToolbarBtnLeft,
                      !!invoiceNumber && { flex: 1.35 },
                      (isInvoiceExpanded || !!invoiceNumber) && styles.invoiceToolbarBtnLeftActive,
                    ]}
                    onPress={() => setIsInvoiceExpanded(prev => !prev)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.invoiceToolbarBtnIcon}>🧾</Text>
                    <Text
                      style={[
                        styles.invoiceToolbarBtnTextLeft,
                        (isInvoiceExpanded || !!invoiceNumber) && styles.invoiceToolbarBtnTextLeftActive,
                      ]}
                      maxFontSizeMultiplier={1.08}
                      adjustsFontSizeToFit
                      minimumFontScale={0.85}
                    >
                      {invoiceNumber ? `發票 ${invoiceNumber}` : '＋發票字軌'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.invoiceToolbarBtn, styles.invoiceToolbarBtnRight]}
                    onPress={() => setScannerModalVisible(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.invoiceToolbarBtnIcon}>📷</Text>
                    <Text style={styles.invoiceToolbarBtnTextRight} maxFontSizeMultiplier={1.08}>掃描發票</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* 📷 支出照片 / PDF 憑證縮圖預覽列 (有附件才顯示，支援點擊放大/開啟與移除) */}
            {!!receiptPhotoUri && (
              <View style={styles.memoPhotoPreviewBar}>
                <TouchableOpacity
                  onPress={() => setViewingPhotoModal(true)}
                  activeOpacity={0.8}
                  style={styles.memoPhotoThumbnailTouchable}
                >
                  {isPdfAttachment ? (
                    <View style={styles.memoPdfBadgeBox}>
                      <Text style={styles.memoPdfBadgeIcon}>📄</Text>
                    </View>
                  ) : (
                    <Image source={{ uri: receiptPhotoUri }} style={styles.memoPhotoThumbnailImg} />
                  )}
                  <View style={styles.memoPhotoTextCol}>
                    <Text style={styles.memoPhotoHintText} numberOfLines={1} maxFontSizeMultiplier={1.05}>
                      {isPdfAttachment ? `📄 ${attachmentDisplayName}` : '📷 收據已附加 (點擊放大檢視)'}
                    </Text>
                    {isPdfAttachment && (
                      <Text style={styles.memoPhotoSubHintText} numberOfLines={1} maxFontSizeMultiplier={1.05}>
                        點擊檢視 / 開啟 PDF 憑證
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
                {canEdit && (
                  <TouchableOpacity
                    style={styles.memoPhotoDeleteBtn}
                    onPress={clearReceiptAttachment}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.memoPhotoDeleteBtnText} maxFontSizeMultiplier={1.05}>✕ 移除</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* 🧾 展開之統一發票輸入與即時對獎區 (展開、有號碼或有雲端發票時顯示) */}
            {type === 'expense' && (isInvoiceExpanded || !!invoiceNumber || !!transaction?.invoice_number || !!transaction?.cloud_synced_at) && (
              <View onLayout={(e) => setInvoiceSectionY(e.nativeEvent.layout.y)} style={styles.invoiceInputContainer}>
                <View style={styles.sectionLabelRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>🧾 統一發票字軌與對獎</Text>
                    <Text style={styles.optionalBadgeText} maxFontSizeMultiplier={1.08}>(選填 · 自動對獎)</Text>
                  </View>
                  {canEdit && (
                    <TouchableOpacity
                      onPress={() => {
                        if (invoiceNumber) {
                          setInvoiceNumber('');
                          setInvoiceRandomCode('');
                        }
                        setIsInvoiceExpanded(false);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.invoiceCloseText} maxFontSizeMultiplier={1.08}>
                        {invoiceNumber ? '✕ 清除發票' : '收起 ▴'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.invoiceInputRow}>
                  <TextInput
                    style={[
                      styles.invoiceNumberInput,
                      !canEdit && styles.readOnlyNoteInput,
                      !!invoicePreview?.winning.isWon && styles.invoiceInputWon,
                    ]}
                    placeholder={canEdit ? "例如：AB-12345678 (貼上QR碼自動解析)" : "無發票紀錄"}
                    placeholderTextColor="#9CA3AF"
                    value={invoiceNumber}
                    onChangeText={handleInvoiceInput}
                    editable={canEdit}
                    autoCapitalize="characters"
                    maxLength={11}
                    onFocus={() => scrollToInput(invoiceSectionY, 450)}
                    returnKeyType="next"
                    maxFontSizeMultiplier={1.15}
                  />
                  <TextInput
                    style={[styles.invoiceRandomCodeInput, !canEdit && styles.readOnlyNoteInput]}
                    placeholder="隨機碼"
                    placeholderTextColor="#9CA3AF"
                    value={invoiceRandomCode}
                    onChangeText={setInvoiceRandomCode}
                    editable={canEdit}
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
                    transaction?.invoice_status === 'claimed' && styles.invoiceStatusRowClaimed,
                  ]}>
                    <Text style={[
                      styles.invoiceStatusText,
                      invoicePreview.winning.isWon && styles.invoiceStatusTextWon,
                      transaction?.invoice_status === 'claimed' && styles.invoiceStatusTextClaimed,
                    ]} maxFontSizeMultiplier={1.08}>
                      {transaction?.invoice_status === 'claimed'
                        ? `✅ 已兌領獎金 NT$ ${(transaction.invoice_prize_amount || invoicePreview.winning.prizeAmount).toLocaleString()}`
                        : invoicePreview.winning.isDrawn
                        ? invoicePreview.winning.isWon
                          ? `🎉 中獎 NT$ ${invoicePreview.winning.prizeAmount.toLocaleString()} (${invoicePreview.winning.prizeName})`
                          : `未中獎 (${invoicePreview.periodLabel})`
                        : `🎯 歸屬 ${invoicePreview.periodLabel} (待開獎)`}
                    </Text>
                  </View>
                )}

                {/* 雲端發票自動校正與明細資訊卡 */}
                {(transaction?.invoice_sync_status === 'matched_cloud' || transaction?.invoice_sync_status === 'cloud_imported') && (
                  <View style={styles.cloudInvoiceCard}>
                    <View style={styles.cloudInvoiceCardHeader}>
                      <Text style={styles.cloudInvoiceCardTitle}>☁️ 財政部雲端發票已自動校正</Text>
                      {!!transaction.cloud_synced_at && (
                        <Text style={styles.cloudInvoiceCardTime}>
                          {new Date(transaction.cloud_synced_at).toLocaleDateString()} 同步
                        </Text>
                      )}
                    </View>
                    <Text style={styles.cloudInvoiceCardSubtext}>
                      來源載具：{transaction.cloud_carrier_name || '雲端載具'} · {transaction.invoice_sync_status === 'matched_cloud' ? '已自動補齊官方號碼與明細' : '由雲端發票自動匯入'}
                    </Text>
                    {/* 若有商品細項，展示商品清單 */}
                    {Array.isArray(transaction.invoice_items) && transaction.invoice_items.length > 0 && (
                      <View style={styles.cloudInvoiceItemsBox}>
                        <Text style={styles.cloudInvoiceItemsTitle}>📦 官方明細清單：</Text>
                        {transaction.invoice_items.map((item, idx) => (
                          <View key={idx} style={styles.cloudInvoiceItemRow}>
                            <Text style={styles.cloudInvoiceItemName} numberOfLines={1}>• {item.name}</Text>
                            <Text style={styles.cloudInvoiceItemQty}>x{item.quantity}</Text>
                            <Text style={styles.cloudInvoiceItemPrice}>NT$ {item.amount.toLocaleString()}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    <View style={styles.cloudInvoicePreserveNotice}>
                      <Text style={styles.cloudInvoicePreserveNoticeText}>
                        🛡️ 系統已自動保留您手動設定之自訂分類、付款人與個人記事備註。
                      </Text>
                    </View>
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
                      已由【{(getMemberById(duplicateInvoiceTx.paid_by) || currentUser).display_name}】於 {duplicateInvoiceTx.transacted_at ? duplicateInvoiceTx.transacted_at.split('T')[0] : '歷史記錄'} 登記（{duplicateInvoiceTx.merchant || '消費'} NT$ ${duplicateInvoiceTx.amount.toLocaleString()}），請確認避免重複記帳。
                    </Text>
                  </View>
                )}
              </View>
            )}
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
            <TouchableOpacity
              style={[
                styles.submitBtn,
                (type === 'expense' || transaction.type === 'expense') && styles.submitBtnExpense,
                (type === 'income' || transaction.type === 'income') && styles.submitBtnIncome,
                (type === 'transfer' || transaction.type === 'transfer') && (targetRecipientMember ? styles.submitBtnAllowance : styles.submitBtnTransfer),
                (type === 'memo' || transaction.type === 'memo') && styles.submitBtnMemo,
                (isSubmitting || isUploadingPhoto) && { opacity: 0.6 },
              ]}
              disabled={isSubmitting || isUploadingPhoto}
              onPress={handleSubmit}
            >
              <Text style={styles.submitBtnText} maxFontSizeMultiplier={1.15}>
                {isSubmitting || isUploadingPhoto
                  ? (isUploadingPhoto ? '⏳ 上傳收據中...' : '⏳ 儲存中...')
                  : '儲存修改'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (transaction.type === 'memo' && canEditCompletion) ? (
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.readOnlyCloseBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.readOnlyCloseBtnText} maxFontSizeMultiplier={1.15}>關閉</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.submitBtn,
                styles.submitBtnMemo,
                (isSubmitting || isUploadingPhoto) && { opacity: 0.6 },
              ]}
              disabled={isSubmitting || isUploadingPhoto}
              onPress={handleSubmit}
            >
              <Text style={styles.submitBtnText} maxFontSizeMultiplier={1.15}>
                {isSubmitting ? '⏳ 儲存中...' : '儲存回報'}
              </Text>
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

      {/* 🏷️ 選擇記事標籤抽屜 (Bottom Sheet 內置浮層) */}
      {isMemoTagDrawerOpen && (
        <View style={styles.memoDrawerOverlay}>
          <TouchableOpacity
            style={styles.memoDrawerBackdrop}
            activeOpacity={1}
            onPress={() => setIsMemoTagDrawerOpen(false)}
          />
          <View style={styles.memoDrawerCard}>
            <View style={styles.memoDrawerHandle} />
            <View style={styles.memoDrawerHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.memoDrawerTitle} maxFontSizeMultiplier={1.12}>🏷️ 選擇生活記事標籤</Text>
                <Text style={styles.memoDrawerSubtitle} maxFontSizeMultiplier={1.05}>點選加入標籤，長按可移除自訂標籤</Text>
              </View>
              {!!activeMemoTag && (
                <TouchableOpacity
                  style={styles.memoDrawerClearBtn}
                  onPress={() => {
                    setNote(prev => removeMemoTag(prev));
                    setIsMemoTagDrawerOpen(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.memoDrawerClearBtnText}>✕ 清除當前標籤</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.memoDrawerCloseBtn}
                onPress={() => setIsMemoTagDrawerOpen(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.memoDrawerCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.memoDrawerScrollBody}
              contentContainerStyle={styles.memoDrawerTagGrid}
              showsVerticalScrollIndicator={false}
            >
              {displayedMemoTags.map((tag) => {
                const active = isMemoTagActive(note, tag);
                return (
                  <TouchableOpacity
                    key={tag}
                    style={[styles.memoDrawerTagChip, active && styles.memoDrawerTagChipActive]}
                    onPress={() => {
                      if (active) {
                        setNote(prev => removeMemoTag(prev));
                      } else {
                        setNote(prev => toggleMemoTag(prev, tag));
                        recordMemoTag(tag, true);
                      }
                      setIsMemoTagDrawerOpen(false);
                    }}
                    onLongPress={() => handleLongPressMemoTag(tag)}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[styles.memoDrawerTagChipText, active && styles.memoDrawerTagChipTextActive]}
                      maxFontSizeMultiplier={1.08}
                    >
                      {tag}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      )}

      {/* 📋 常用生活範本與智慧快選組裝抽屜 (Bottom Sheet 內置浮層) */}
      {isMemoTemplateDrawerOpen && (
        <View style={styles.memoDrawerOverlay}>
          <TouchableOpacity
            style={styles.memoDrawerBackdrop}
            activeOpacity={1}
            onPress={() => setIsMemoTemplateDrawerOpen(false)}
          />
          <View style={[styles.memoDrawerCard, { maxHeight: '82%' }]}>
            <View style={styles.memoDrawerHandle} />
            
            {/* 頁籤切換 Header */}
            <View style={styles.memoDrawerTabHeader}>
              <View style={styles.memoDrawerTabRow}>
                <TouchableOpacity
                  style={[styles.memoDrawerTabBtn, memoDrawerTab === 'templates' && styles.memoDrawerTabBtnActive]}
                  onPress={() => setMemoDrawerTab('templates')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.memoDrawerTabBtnText, memoDrawerTab === 'templates' && styles.memoDrawerTabBtnTextActive]} maxFontSizeMultiplier={1.08}>
                    📋 常用範本
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.memoDrawerTabBtn, memoDrawerTab === 'quickBuilder' && styles.memoDrawerTabBtnActive]}
                  onPress={() => setMemoDrawerTab('quickBuilder')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.memoDrawerTabBtnText, memoDrawerTab === 'quickBuilder' && styles.memoDrawerTabBtnTextActive]} maxFontSizeMultiplier={1.08}>
                    🪄 自由快選組裝
                  </Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.memoDrawerDoneBtn}
                onPress={() => setIsMemoTemplateDrawerOpen(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.memoDrawerDoneBtnText}>
                  完成 ✓{checklistItemsCount > 0 ? ` (${checklistItemsCount}項)` : ''}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.memoDrawerScrollBody} showsVerticalScrollIndicator={false}>
              {memoDrawerTab === 'templates' ? (
                <View style={styles.memoTemplateListContainer}>
                  <Text style={styles.memoDrawerSectionDesc} maxFontSizeMultiplier={1.05}>
                    點選即可一鍵整套帶入生活清單範本：
                  </Text>
                  {BUILTIN_MEMO_TEMPLATES.map((tmpl) => (
                    <TouchableOpacity
                      key={tmpl.id}
                      style={styles.memoTemplateCardItem}
                      onPress={() => {
                        handleSelectTemplate(tmpl);
                        setIsMemoTemplateDrawerOpen(false);
                      }}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.memoTemplateCardIcon}>{tmpl.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.memoTemplateCardTitle} maxFontSizeMultiplier={1.08}>{tmpl.title}</Text>
                        <Text style={styles.memoTemplateCardDesc} maxFontSizeMultiplier={1.05} numberOfLines={1}>
                          {tmpl.description || '點選自動帶入清單範本'}
                        </Text>
                      </View>
                      <View style={styles.memoTemplateCardArrowBadge}>
                        <Text style={styles.memoTemplateCardArrowText}>＋帶入</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={styles.memoQuickBuilderContainer}>
                  {/* 7 大情境領域切換膠囊 */}
                  <Text style={styles.memoDrawerSectionDesc} maxFontSizeMultiplier={1.05}>
                    切換情境領域，點擊作業或項目立即追加至待辦中：
                  </Text>
                  <HorizontalScrollView showsHorizontalScrollIndicator={false} contentContainerStyle={styles.builderDomainChipsRow}>
                    {orderedBuilderDomains.map(d => {
                      const isCur = (currentBuilderConfig?.domain === d.key) || (!currentBuilderConfig && selectedBuilderDomain === d.key);
                      return (
                        <TouchableOpacity
                          key={d.key}
                          style={[styles.builderDomainChip, isCur && styles.builderDomainChipActive]}
                          onPress={() => setSelectedBuilderDomain(d.key)}
                          activeOpacity={0.75}
                        >
                          <Text style={[styles.builderDomainChipText, isCur && styles.builderDomainChipTextActive]} maxFontSizeMultiplier={1.08}>
                            {d.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </HorizontalScrollView>

                  {/* 📝 當前待辦即時鏡像預覽盒 (解決抽屜擋住背後輸入框盲點，支援滾動與撤銷) */}
                  <View style={styles.memoDrawerLivePreviewCard}>
                    <View style={styles.memoDrawerLivePreviewHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                        <Text style={styles.memoDrawerLivePreviewTitle} maxFontSizeMultiplier={1.08}>
                          📝 當前待辦清單 {checklistItemsCount > 0 ? `(已加入 ${checklistItemsCount} 項)` : ''}
                        </Text>
                      </View>
                      {checklistItemsCount > 0 && (
                        <TouchableOpacity
                          style={styles.memoDrawerUndoBtn}
                          onPress={handleUndoLastChecklistItem}
                          activeOpacity={0.7}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={styles.memoDrawerUndoBtnText}>⎌ 撤回最後一項</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <ScrollView
                      ref={previewScrollRef}
                      style={styles.memoDrawerLivePreviewScroll}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={true}
                      onContentSizeChange={() => previewScrollRef.current?.scrollToEnd({ animated: true })}
                    >
                      <Text style={styles.memoDrawerLivePreviewText} maxFontSizeMultiplier={1.05}>
                        {note.trim() || '尚未加入項目，請點選下方時段/科目與作業立即追加待辦'}
                      </Text>
                    </ScrollView>
                  </View>

                  {currentBuilderConfig && (
                    <View style={styles.drawerQuickBuilderInner}>
                      <Text style={styles.schoolQuickRowLabel} maxFontSizeMultiplier={1.05}>
                        {currentBuilderConfig.step1Label}（目前：{effectiveQuickSubject}）：
                      </Text>
                      <View style={styles.schoolQuickChipsRow}>
                        {currentBuilderConfig.subjects.map((subj) => {
                          const isSelected = effectiveQuickSubject === subj;
                          return (
                            <TouchableOpacity
                              key={subj}
                              style={[
                                styles.schoolSubjectChip,
                                isSelected && styles.schoolSubjectChipActive,
                              ]}
                              activeOpacity={0.75}
                              onPress={() => setSelectedSchoolSubject(subj)}
                            >
                              <Text
                                style={[
                                  styles.schoolSubjectChipText,
                                  isSelected && styles.schoolSubjectChipTextActive,
                                ]}
                                maxFontSizeMultiplier={1.08}
                              >
                                {subj}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      <Text style={[styles.schoolQuickRowLabel, { marginTop: 10 }]} maxFontSizeMultiplier={1.05}>
                        {currentBuilderConfig.step2LabelPrefix}「{effectiveQuickSubject}」項目 (可連續快點加入)：
                      </Text>
                      <View style={styles.schoolQuickChipsRow}>
                        {currentBuilderConfig.tasks.map((task) => (
                          <TouchableOpacity
                            key={task}
                            style={styles.schoolActionChip}
                            activeOpacity={0.75}
                            onPress={() =>
                              setNote((prev) =>
                                appendSchoolChecklistItem(
                                  prev,
                                  effectiveQuickSubject,
                                  task,
                                  currentBuilderConfig.defaultTag
                                )
                              )
                            }
                          >
                            <Text style={styles.schoolActionChipText} maxFontSizeMultiplier={1.08}>
                              ＋{effectiveQuickSubject}{/^\d{1,2}:\d{2}/.test(effectiveQuickSubject) ? ' ' : ''}{task}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      <Text style={[styles.schoolQuickRowLabel, { marginTop: 10 }]} maxFontSizeMultiplier={1.05}>
                        {currentBuilderConfig.step3Label}
                      </Text>
                      <View style={styles.schoolQuickChipsRow}>
                        {currentBuilderConfig.routines.map((item) => (
                          <TouchableOpacity
                            key={item}
                            style={styles.schoolRoutineChip}
                            activeOpacity={0.75}
                            onPress={() =>
                              setNote((prev) =>
                                appendSchoolChecklistItem(
                                  prev,
                                  null,
                                  item,
                                  currentBuilderConfig.defaultTag
                                )
                              )
                            }
                          >
                            <Text style={styles.schoolRoutineChipText} maxFontSizeMultiplier={1.08}>
                              ＋{item}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      )}

      {/* 📂 支出全部分類抽屜 Modal (支出分頁極致瘦身) */}
      {isCategoryDrawerOpen && (
        <View style={styles.memoDrawerOverlay}>
          <TouchableOpacity
            style={styles.memoDrawerBackdrop}
            activeOpacity={1}
            onPress={() => {
              setIsCategoryDrawerOpen(false);
              setCategorySearchQuery('');
            }}
          />
          <View style={styles.memoDrawerCard}>
            <View style={styles.memoDrawerHandle} />
            <View style={styles.memoDrawerHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.memoDrawerTitle} maxFontSizeMultiplier={1.12}>📂 選擇記帳分類</Text>
                <Text style={styles.memoDrawerSubtitle} maxFontSizeMultiplier={1.05}>
                  共 {availableCategories.length} 個分類，點選即可選定
                </Text>
              </View>
              <TouchableOpacity
                style={styles.memoDrawerCloseBtn}
                onPress={() => {
                  setIsCategoryDrawerOpen(false);
                  setCategorySearchQuery('');
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.memoDrawerCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* 快速搜尋框 (大於 10 個分類時顯示) */}
            {availableCategories.length > 10 && (
              <View style={styles.categorySearchContainer}>
                <TextInput
                  style={styles.categorySearchInput}
                  placeholder="🔍 搜尋分類名稱..."
                  placeholderTextColor="#94A3B8"
                  value={categorySearchQuery}
                  onChangeText={setCategorySearchQuery}
                  maxFontSizeMultiplier={1.08}
                />
              </View>
            )}

            <ScrollView
              style={styles.memoDrawerScrollBody}
              contentContainerStyle={styles.categoryDrawerGrid}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {filteredDrawerCategories.map((cat) => {
                const isSelected = selectedCategoryId === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    disabled={!canEdit}
                    style={[
                      styles.categoryDrawerCardItem,
                      isSelected && { borderColor: cat.color, backgroundColor: `${cat.color}20` },
                    ]}
                    onPress={() => {
                      setSelectedCategoryId(cat.id);
                      setIsCategoryDrawerOpen(false);
                      setCategorySearchQuery('');
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.categoryDrawerItemIcon}>{getCategoryIcon(cat.icon)}</Text>
                    <Text
                      style={[
                        styles.categoryDrawerItemText,
                        isSelected && { color: cat.color, fontWeight: '700' },
                      ]}
                      maxFontSizeMultiplier={1.1}
                    >
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      )}
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
      setMemoReminderRelay(false);
      setMemoReminderRelayOffset(undefined);
      userManuallySetReminderRef.current = true;
      setMemoReminderDate(ymd);
      if (pickedMode) {
        setMemoReminderCalendar(pickedMode);
      }
      if (memoReminderRepeat === 'lunar_1_15' || memoReminderRepeat === 'lunar_2_16') {
        const l = solarToLunar(newDate);
        if (memoReminderRepeat === 'lunar_1_15' && l.lunarDay !== 1 && l.lunarDay !== 15) {
          setMemoReminderRepeat('monthly');
          baseReminderDateRef.current = ymd;
          baseReminderCalendarRef.current = pickedMode || 'solar';
        } else if (memoReminderRepeat === 'lunar_2_16' && l.lunarDay !== 2 && l.lunarDay !== 16) {
          setMemoReminderRepeat('monthly');
          baseReminderDateRef.current = ymd;
          baseReminderCalendarRef.current = pickedMode || 'solar';
        }
      } else {
        baseReminderDateRef.current = ymd;
        baseReminderCalendarRef.current = pickedMode || 'solar';
      }
      setReminderDatePickerVisible(false);
    }}
  />

  <InvoiceScannerModal
    visible={scannerModalVisible}
    onClose={() => setScannerModalVisible(false)}
    onScanSuccess={handleScanSuccess}
  />

  <ImageViewerModal
    visible={viewingPhotoModal}
    onClose={() => setViewingPhotoModal(false)}
    imageUrl={receiptPhotoUri}
    mimeType={receiptPhotoMimeType}
    fileName={receiptPhotoName}
    title={transaction?.type === 'memo' ? '生活記事附件憑證' : '消費收據 / 保固憑證'}
    onDelete={canEdit ? () => {
      clearReceiptAttachment();
      setViewingPhotoModal(false);
    } : undefined}
  />

  <ReceiptSourceModal
    visible={receiptSourceModalVisible}
    mode={receiptSourceModalMode}
    hasExisting={!!receiptPhotoUri}
    existingIsPdf={isPdfAttachment}
    existingFileName={attachmentDisplayName}
    onPickCamera={handlePickReceiptFromCamera}
    onPickImageLibrary={handlePickReceiptFromLibrary}
    onPickDocument={handlePickReceiptFromDocument}
    onRemove={clearReceiptAttachment}
    onClose={() => setReceiptSourceModalVisible(false)}
  />
</Modal>
  );
};

const getStyles = (isDark: boolean, colors: ThemeColors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.75)' : 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
    width: '100%',
  },
  sheet: {
    backgroundColor: colors.background.modal,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    paddingHorizontal: 16,
    maxHeight: '90%',
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    borderTopWidth: isDark ? 1 : 0,
    borderTopColor: isDark ? colors.border.default : 'transparent',
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
    color: colors.text.primary,
  },
  headerDateBadge: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
    fontWeight: '500',
  },
  readOnlyBadge: {
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(245, 158, 11, 0.4)' : '#FDE68A',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
  },
  readOnlyBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: isDark ? '#FBBF24' : '#92400E',
  },
  readOnlyTopBanner: {
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FFFBEB',
    borderColor: isDark ? 'rgba(245, 158, 11, 0.3)' : '#FCD34D',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  readOnlyTopBannerIcon: {
    fontSize: 20,
  },
  readOnlyTopBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: isDark ? '#FBBF24' : '#92400E',
  },
  readOnlyTopBannerDesc: {
    fontSize: 11.5,
    color: isDark ? '#FCD34D' : '#B45309',
    marginTop: 2,
    lineHeight: 16,
  },
  readOnlyDateCard: {
    backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E2E8F0',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  readOnlyDateCardText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.primary,
  },
  closeBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: isDark ? colors.background.cardSubtle : '#F3F4F6',
  },
  closeText: {
    fontSize: 14,
    color: colors.text.muted,
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
    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.15)' : '#EEF2FF',
    borderColor: isDark ? 'rgba(99, 102, 241, 0.35)' : '#C7D2FE',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    alignItems: 'center',
    gap: 10,
  },
  transferBannerIcon: {
    fontSize: 22,
    color: isDark ? '#818CF8' : '#4F46E5',
  },
  transferBannerContent: {
    flex: 1,
  },
  transferBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: isDark ? '#A5B4FC' : '#4338CA',
    marginBottom: 2,
  },
  transferBannerDesc: {
    fontSize: 12,
    color: isDark ? '#C7D2FE' : '#4F46E5',
    lineHeight: 16,
  },
  typeToggle: {
    flexDirection: 'row',
    backgroundColor: isDark ? colors.background.cardSubtle : '#F3F4F6',
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
  typeBtnActiveExpense: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
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
    color: colors.text.muted,
  },
  typeTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 6,
    marginTop: 2,
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? colors.background.input : '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E5E7EB',
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
    color: colors.text.primary,
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
    backgroundColor: isDark ? colors.background.cardSubtle : '#F9FAFB',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E5E7EB',
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
    color: colors.text.secondary,
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
    backgroundColor: isDark ? colors.background.cardSubtle : '#F9FAFB',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E5E7EB',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 14,
  },
  payerChipActive: {
    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF',
    borderColor: '#4F46E5',
  },
  payerAvatar: {
    fontSize: 14,
    marginRight: 4,
  },
  payerName: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  payerNameActive: {
    color: isDark ? '#818CF8' : '#4F46E5',
    fontWeight: '700',
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  dateHintText: {
    fontSize: 12,
    color: isDark ? '#FB923C' : '#EA580C',
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
    backgroundColor: isDark ? colors.background.input : '#F9FAFB',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 0,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E5E7EB',
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
    color: colors.text.secondary,
  },
  timeInputsWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeDigitInput: {
    backgroundColor: isDark ? colors.background.card : '#FFFFFF',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#D1D5DB',
    borderRadius: 8,
    width: 44,
    height: 36,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
    paddingVertical: 0,
  },
  timeColonText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text.muted,
  },
  timeNowBtn: {
    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(99, 102, 241, 0.4)' : '#C7D2FE',
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
    color: isDark ? '#A5B4FC' : '#4F46E5',
  },
  dateChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: isDark ? colors.background.cardSubtle : '#F3F4F6',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E5E7EB',
  },
  dateChipActive: {
    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF',
    borderColor: '#4F46E5',
  },
  dateChipCustom: {
    backgroundColor: isDark ? 'rgba(249, 115, 22, 0.15)' : '#FFF7ED',
    borderColor: '#F97316',
  },
  dateChipText: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  dateChipTextActive: {
    color: isDark ? '#818CF8' : '#4F46E5',
    fontWeight: '700',
  },
  dateMoreBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: isDark ? 'rgba(2, 132, 199, 0.15)' : '#F0F9FF',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(2, 132, 199, 0.35)' : '#BAE6FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateMoreBtnSelected: {
    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF',
    borderColor: '#4F46E5',
  },
  dateMoreBtnText: {
    fontSize: 12,
    color: isDark ? '#38BDF8' : '#0284C7',
    fontWeight: '700',
  },
  dateMoreBtnTextSelected: {
    color: isDark ? '#818CF8' : '#4F46E5',
    fontWeight: '700',
  },
  clearMerchantText: {
    fontSize: 12,
    color: isDark ? '#818CF8' : '#6366F1',
    fontWeight: '500',
  },
  dismissKeyboardText: {
    fontSize: 12,
    color: isDark ? '#818CF8' : '#4F46E5',
    fontWeight: '600',
    marginLeft: 'auto',
  },
  merchantInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E5E7EB',
    borderRadius: 10,
    backgroundColor: isDark ? colors.background.input : '#F9FAFB',
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
    color: colors.text.primary,
    paddingVertical: 7,
  },
  merchantClearBtn: {
    padding: 4,
  },
  merchantClearBtnText: {
    fontSize: 14,
    color: colors.text.muted,
  },
  merchantChipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 10,
    paddingHorizontal: 1,
  },
  merchantChip: {
    backgroundColor: isDark ? colors.background.cardSubtle : '#F3F4F6',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E5E7EB',
  },
  merchantChipActive: {
    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF',
    borderColor: '#4F46E5',
  },
  merchantChipText: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  merchantChipTextActive: {
    color: isDark ? '#818CF8' : '#4F46E5',
    fontWeight: '700',
  },
  noteInput: {
    backgroundColor: isDark ? colors.background.input : '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E5E7EB',
    paddingHorizontal: 10,
    paddingTop: Platform.OS === 'ios' ? 9 : 8,
    paddingBottom: Platform.OS === 'ios' ? 9 : 8,
    fontSize: 13,
    lineHeight: 19,
    color: colors.text.primary,
    marginBottom: 14,
    width: '100%',
    minHeight: 38,
    maxHeight: 120,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  deleteBtn: {
    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.18)' : '#FEE2E2',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(239, 68, 68, 0.35)' : '#FECACA',
  },
  deleteBtnText: {
    color: isDark ? '#F87171' : '#DC2626',
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
  submitBtnExpense: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
  },
  submitBtnIncome: {
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
  },
  submitBtnTransfer: {
    backgroundColor: '#0284C7',
    shadowColor: '#0284C7',
  },
  submitBtnAllowance: {
    backgroundColor: '#8B5CF6',
    shadowColor: '#8B5CF6',
  },
  submitBtnMemo: {
    backgroundColor: '#D97706',
    shadowColor: '#D97706',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  manageMethodsSmallBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    backgroundColor: isDark ? colors.background.cardSubtle : '#F3F4F6',
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: isDark ? colors.border.default : '#E5E7EB',
  },
  manageMethodsSmallBtnText: {
    fontSize: 11,
    color: colors.text.secondary,
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
    backgroundColor: isDark ? colors.background.cardSubtle : '#F3F4F6',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E5E7EB',
    gap: 4,
  },
  methodChipActive: {
    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF',
    borderColor: '#4F46E5',
  },
  methodChipIcon: {
    fontSize: 13,
  },
  methodChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text.secondary,
  },
  methodChipTextActive: {
    color: isDark ? '#818CF8' : '#4F46E5',
    fontWeight: '700',
  },
  subCardContainer: {
    backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E2E8F0',
  },
  subCardLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 8,
  },
  cardScroll: {
    flexDirection: 'row',
    gap: 8,
  },
  cardChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? colors.background.card : '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#CBD5E1',
    gap: 6,
  },
  cardChipIcon: {
    fontSize: 16,
  },
  cardChipName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.primary,
  },
  cardChipSub: {
    fontSize: 10,
    color: colors.text.muted,
    marginTop: 1,
  },
  emptySubCardBox: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: isDark ? colors.background.cardSubtle : '#F9FAFB',
    borderRadius: 10,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E5E7EB',
  },
  emptySubCardText: {
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  disabledContainer: {
    opacity: 0.85,
  },
  readOnlyUnselectedChip: {
    opacity: 0.45,
  },
  readOnlyAmountContainer: {
    backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
    borderColor: isDark ? colors.border.default : '#E2E8F0',
  },
  readOnlyAmountInput: {
    color: colors.text.primary,
  },
  readOnlyTextMuted: {
    color: colors.text.muted,
  },
  readOnlyInputWrapper: {
    backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
    borderColor: isDark ? colors.border.default : '#E2E8F0',
  },
  readOnlyTextInput: {
    color: colors.text.primary,
  },
  readOnlyNoteInput: {
    backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
    borderColor: isDark ? colors.border.default : '#E2E8F0',
    color: colors.text.primary,
    lineHeight: 19,
  },
  readOnlyBtnRow: {
    marginTop: 20,
    alignItems: 'center',
  },
  readOnlyCloseBtn: {
    width: '100%',
    backgroundColor: isDark ? colors.background.cardSubtle : '#F1F5F9',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#CBD5E1',
  },
  readOnlyCloseBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
  },
  readOnlyFooterHint: {
    fontSize: 11.5,
    color: colors.text.muted,
    marginTop: 8,
    textAlign: 'center',
  },
  memoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FFFBEB',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(245, 158, 11, 0.3)' : '#FDE68A',
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
    color: isDark ? '#FBBF24' : '#92400E',
    marginBottom: 2,
  },
  memoBannerDesc: {
    fontSize: 11,
    color: isDark ? '#FCD34D' : '#B45309',
    lineHeight: 15,
  },
  insertCheckboxBtn: {
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(245, 158, 11, 0.4)' : '#FDE68A',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  insertCheckboxBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: isDark ? '#FBBF24' : '#D97706',
  },
  templateSection: {
    marginBottom: 10,
  },
  templateSectionLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: isDark ? '#FBBF24' : '#92400E',
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
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FFFBEB',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(245, 158, 11, 0.3)' : '#FDE68A',
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
    color: isDark ? '#FDE68A' : '#B45309',
  },
  memoContentInput: {
    backgroundColor: isDark ? colors.background.input : '#FAFAFA',
    borderWidth: 1.5,
    borderColor: isDark ? colors.border.default : '#E5E7EB',
    borderRadius: 12,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
    padding: 12,
    fontSize: 15,
    color: colors.text.primary,
    minHeight: 140,
    marginBottom: 0,
  },
  readOnlyInput: {
    backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
    borderColor: isDark ? colors.border.default : '#E2E8F0',
    color: colors.text.primary,
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
    backgroundColor: isDark ? colors.background.cardSubtle : '#F3F4F6',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E5E7EB',
  },
  quickNoteChipActive: {
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
    borderColor: '#F59E0B',
  },
  quickNoteChipText: {
    fontSize: 11,
    color: colors.text.secondary,
  },
  quickNoteChipTextActive: {
    color: isDark ? '#FBBF24' : '#92400E',
    fontWeight: '700',
  },
  memoStatusContainer: {
    marginBottom: 12,
  },
  memoPinContainer: {
    marginBottom: 12,
  },
  memoPinToggleBtn: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: isDark ? colors.background.cardSubtle : '#F9FAFB',
    borderWidth: 1.5,
    borderColor: isDark ? colors.border.default : '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memoPinToggleBtnActive: {
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
    borderColor: '#F59E0B',
  },
  memoPinToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  memoPinToggleTextActive: {
    color: isDark ? '#FDE68A' : '#B45309',
    fontWeight: '700',
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
    backgroundColor: isDark ? colors.background.cardSubtle : '#F3F4F6',
    borderWidth: 1.5,
    borderColor: isDark ? colors.border.default : '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memoStatusChipActivePending: {
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FFFBEB',
    borderColor: '#F59E0B',
  },
  memoStatusChipActiveCompleted: {
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#ECFDF5',
    borderColor: '#10B981',
  },
  memoStatusChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  memoStatusChipTextActivePending: {
    color: isDark ? '#FBBF24' : '#B45309',
    fontWeight: '700',
  },
  memoStatusChipTextActiveCompleted: {
    color: isDark ? '#34D399' : '#059669',
    fontWeight: '700',
  },
  memoCompleterHint: {
    marginTop: 6,
    fontSize: 12,
    color: isDark ? '#34D399' : '#059669',
    fontWeight: '600',
  },
  completionNoteContainer: {
    marginBottom: 14,
  },
  completionNoteInput: {
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#F0FDF4',
    borderWidth: 1.5,
    borderColor: isDark ? 'rgba(16, 185, 129, 0.35)' : '#86EFAC',
    borderRadius: 12,
    padding: 12,
    fontSize: 14.5,
    color: colors.text.primary,
    minHeight: 76,
  },
  linkedExpenseContainer: {
    marginBottom: 16,
  },
  linkedExpenseCard: {
    backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
    borderWidth: 1.5,
    borderColor: isDark ? colors.border.default : '#E2E8F0',
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
    color: colors.text.primary,
    marginBottom: 2,
  },
  linkedExpenseSubtitle: {
    fontSize: 12,
    color: colors.text.muted,
  },
  linkedExpenseAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: isDark ? '#F87171' : '#DC2626',
  },
  linkedExpenseActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: isDark ? colors.border.default : '#E2E8F0',
    paddingTop: 8,
    marginTop: 2,
  },
  linkedExpenseActionBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: isDark ? 'rgba(37, 99, 235, 0.2)' : '#EFF6FF',
    borderRadius: 8,
  },
  linkedExpenseActionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: isDark ? '#60A5FA' : '#2563EB',
  },
  linkedExpenseUnlinkBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  linkedExpenseUnlinkBtnText: {
    fontSize: 12,
    color: colors.text.muted,
  },
  linkExpenseBtn: {
    backgroundColor: isDark ? 'rgba(37, 99, 235, 0.15)' : '#EFF6FF',
    borderWidth: 1.5,
    borderColor: isDark ? 'rgba(59, 130, 246, 0.35)' : '#BFDBFE',
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
    color: isDark ? '#60A5FA' : '#1D4ED8',
    marginBottom: 2,
  },
  linkExpenseBtnDesc: {
    fontSize: 11,
    color: isDark ? '#93C5FD' : '#3B82F6',
  },
  linkedMemoCard: {
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FFFBEB',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(245, 158, 11, 0.3)' : '#FDE68A',
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
    color: isDark ? '#FBBF24' : '#B45309',
  },
  linkedMemoCardLink: {
    fontSize: 12,
    fontWeight: '600',
    color: isDark ? '#60A5FA' : '#2563EB',
  },
  linkedMemoCardContent: {
    fontSize: 13,
    color: isDark ? '#FEF3C7' : '#78350F',
    lineHeight: 18,
  },
  lunarMoreBtn: {
    borderColor: isDark ? 'rgba(245, 158, 11, 0.3)' : '#FDE68A',
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FFFBEB',
  },
  lunarMoreBtnSelected: {
    borderColor: '#D97706',
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.25)' : '#FEF3C7',
  },
  lunarMoreBtnText: {
    color: isDark ? '#FBBF24' : '#B45309',
  },
  lunarMoreBtnTextSelected: {
    color: isDark ? '#FDE68A' : '#92400E',
    fontWeight: '800',
  },
  autoDetectedDateCard: {
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : '#FFFBEB',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(245, 158, 11, 0.35)' : '#FDE68A',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  autoDetectedDateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  autoDetectedDateTitle: {
    fontSize: 12,
    color: isDark ? '#FDE68A' : '#92400E',
    fontWeight: '600',
    flex: 1,
  },
  autoDetectedAppliedBadge: {
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#DCFCE7',
    borderColor: isDark ? '#059669' : '#86EFAC',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  autoDetectedAppliedBadgeText: {
    fontSize: 10,
    color: isDark ? '#34D399' : '#15803D',
    fontWeight: '700',
  },
  autoDetectedCancelBtn: {
    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2',
    borderColor: isDark ? '#DC2626' : '#FCA5A5',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  autoDetectedCancelBtnText: {
    fontSize: 11,
    color: isDark ? '#FCA5A5' : '#B91C1C',
    fontWeight: '700',
  },
  autoDetectedDismissedBadge: {
    backgroundColor: isDark ? 'rgba(156, 163, 175, 0.2)' : '#F3F4F6',
    borderColor: isDark ? '#6B7280' : '#D1D5DB',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  autoDetectedDismissedBadgeText: {
    fontSize: 11,
    color: isDark ? '#9CA3AF' : '#6B7280',
    fontWeight: '600',
  },
  autoDetectedDateBtnsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  autoDetectedDateActionBtn: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(245, 158, 11, 0.4)' : '#FCD34D',
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoDetectedDateActionBtnActive: {
    borderColor: '#F59E0B',
    backgroundColor: '#F59E0B',
  },
  autoDetectedDateActionBtnText: {
    fontSize: 12,
    color: isDark ? '#FDE68A' : '#B45309',
    fontWeight: '700',
  },
  autoDetectedDateActionBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  relayToggleCard: {
    backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E2E8F0',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  relayToggleCardActive: {
    backgroundColor: isDark ? 'rgba(13, 148, 136, 0.14)' : '#F0FDFA',
    borderColor: isDark ? 'rgba(20, 184, 166, 0.45)' : '#5EEAD4',
  },
  relayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  relayTitleBlock: {
    flex: 1,
  },
  relayTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  relayTitleActive: {
    color: isDark ? '#5EEAD4' : '#0F766E',
  },
  relaySubtitle: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 2,
    lineHeight: 15,
  },
  relaySubtitleActive: {
    color: isDark ? '#99F6E4' : '#0D9488',
    fontWeight: '600',
  },
  relaySwitchBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#CBD5E1',
    backgroundColor: isDark ? colors.background.card : '#FFFFFF',
  },
  relaySwitchBtnActive: {
    borderColor: '#0D9488',
    backgroundColor: '#0D9488',
  },
  relaySwitchBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  relaySwitchBtnTextActive: {
    color: '#FFFFFF',
  },
  relayOffsetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 9,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: isDark ? 'rgba(20, 184, 166, 0.25)' : '#CCFBF1',
  },
  relayOffsetLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: isDark ? '#99F6E4' : '#0F766E',
  },
  relayOffsetChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(20, 184, 166, 0.35)' : '#99F6E4',
    backgroundColor: isDark ? colors.background.card : '#FFFFFF',
  },
  relayOffsetChipActive: {
    borderColor: '#0D9488',
    backgroundColor: '#0D9488',
  },
  relayOffsetChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: isDark ? '#99F6E4' : '#0F766E',
  },
  relayOffsetChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  memoRepeatCard: {
    backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E2E8F0',
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
    color: colors.text.secondary,
  },
  calendarBasisSwitch: {
    flexDirection: 'row',
    backgroundColor: isDark ? colors.background.card : '#E2E8F0',
    borderRadius: 8,
    padding: 2,
  },
  calendarBasisBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  calendarBasisBtnActive: {
    backgroundColor: isDark ? colors.background.cardSubtle : '#FFFFFF',
  },
  calendarBasisBtnLunarActive: {
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.25)' : '#FEF3C7',
  },
  calendarBasisBtnText: {
    fontSize: 11,
    color: colors.text.muted,
    fontWeight: '600',
  },
  calendarBasisBtnTextActive: {
    color: isDark ? '#60A5FA' : '#2563EB',
    fontWeight: '700',
  },
  calendarBasisBtnTextLunarActive: {
    color: isDark ? '#FBBF24' : '#B45309',
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
    backgroundColor: isDark ? colors.background.card : '#FFFFFF',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#CBD5E1',
  },
  memoRepeatChipLunar: {
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : '#FFFBEB',
    borderColor: isDark ? 'rgba(245, 158, 11, 0.3)' : '#FDE68A',
  },
  memoRepeatChipActive: {
    backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#EFF6FF',
    borderColor: '#3B82F6',
  },
  memoRepeatChipLunarActive: {
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.25)' : '#FEF3C7',
    borderColor: '#D97706',
  },
  memoRepeatChipText: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  memoRepeatChipTextLunar: {
    color: isDark ? '#FBBF24' : '#B45309',
  },
  memoRepeatChipTextActive: {
    color: isDark ? '#93C5FA' : '#1D4ED8',
    fontWeight: '700',
  },
  memoRepeatChipTextLunarActive: {
    color: isDark ? '#FEF3C7' : '#92400E',
    fontWeight: '800',
  },
  memoReminderPreviewBox: {
    marginTop: 8,
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FFFBEB',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(245, 158, 11, 0.3)' : '#FDE68A',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  memoReminderPreviewPrimary: {
    fontSize: 12,
    fontWeight: '700',
    color: isDark ? '#FBBF24' : '#92400E',
  },
  memoReminderPreviewNext: {
    fontSize: 11,
    color: isDark ? '#FDE68A' : '#B45309',
    marginTop: 3,
    fontWeight: '600',
  },
  memoTargetCard: {
    backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E2E8F0',
    borderRadius: 12,
    padding: 10,
    marginBottom: 14,
  },
  memoTargetButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
    marginBottom: 4,
  },
  memoTargetBtn: {
    flex: 1,
    height: 36,
    paddingHorizontal: 8,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? colors.background.card : '#EDF2F7',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#CBD5E1',
  },
  memoTargetBtnActiveFamily: {
    backgroundColor: isDark ? '#1E3A8A' : '#EFF6FF',
    borderColor: '#3B82F6',
  },
  memoTargetBtnActivePersonal: {
    backgroundColor: isDark ? '#581C87' : '#FAF5FF',
    borderColor: '#A855F7',
  },
  memoTargetBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: isDark ? colors.text.secondary : '#64748B',
  },
  memoTargetBtnTextActive: {
    color: isDark ? '#FFFFFF' : '#1E293B',
    fontWeight: '700',
  },
  memoTargetDescText: {
    fontSize: 11,
    color: isDark ? colors.text.muted : '#64748B',
    lineHeight: 16,
    marginTop: 4,
    paddingHorizontal: 2,
  },
  discountToggleChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
  },
  discountToggleChipActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  discountToggleChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: isDark ? '#34D399' : '#047857',
  },
  discountToggleChipTextActive: {
    color: '#FFFFFF',
  },
  discountPanelBox: {
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.1)' : '#F0FDF4',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(16, 185, 129, 0.25)' : '#BBF7D0',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  discountModeRow: {
    flexDirection: 'row',
    backgroundColor: isDark ? colors.background.cardSubtle : '#DCFCE7',
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
    backgroundColor: isDark ? colors.background.card : '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  discountModeBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: isDark ? '#34D399' : '#166534',
  },
  discountModeBtnTextActive: {
    fontWeight: '800',
    color: isDark ? '#6EE7B7' : '#065F46',
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
    color: isDark ? '#34D399' : '#065F46',
    marginBottom: 4,
  },
  discountAmountInputInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? colors.background.input : '#FFFFFF',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(16, 185, 129, 0.35)' : '#86EFAC',
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 36,
  },
  discountCurrencyPrefix: {
    fontSize: 14,
    fontWeight: '800',
    color: isDark ? '#34D399' : '#059669',
    marginRight: 4,
  },
  discountAmountInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: isDark ? '#ECFDF5' : '#065F46',
    minWidth: 0,
    padding: 0,
  },
  discountLabelInput: {
    backgroundColor: isDark ? colors.background.input : '#FFFFFF',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(16, 185, 129, 0.35)' : '#86EFAC',
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 36,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.primary,
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
    backgroundColor: isDark ? colors.background.card : '#FFFFFF',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
  },
  discountPresetChipActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  discountPresetChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: isDark ? '#34D399' : '#047857',
  },
  discountPresetChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  discountSummaryBanner: {
    marginTop: 8,
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#DCFCE7',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(16, 185, 129, 0.35)' : '#86EFAC',
  },
  discountSummaryBannerError: {
    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
    borderColor: isDark ? 'rgba(239, 68, 68, 0.35)' : '#FECACA',
  },
  discountSummaryText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: isDark ? '#34D399' : '#065F46',
  },
  discountSummaryTextError: {
    color: isDark ? '#F87171' : '#DC2626',
  },
  destinationSection: {
    marginVertical: 10,
  },
  destinationCardBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: isDark ? 'rgba(2, 132, 199, 0.15)' : '#F0F9FF',
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  destinationCardIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destinationCardIcon: {
    fontSize: 18,
  },
  destinationCardName: {
    fontSize: 13.5,
    fontWeight: '700',
    marginBottom: 2,
  },
  destinationCardSub: {
    fontSize: 11,
    color: colors.text.muted,
  },
  destinationBadge: {
    backgroundColor: isDark ? 'rgba(2, 132, 199, 0.25)' : '#E0F2FE',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(2, 132, 199, 0.45)' : '#BAE6FD',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  destinationBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: isDark ? '#38BDF8' : '#0284C7',
  },
  destinationMemberBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: isDark ? colors.border.default : '#E2E8F0',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  destinationMemberAvatarBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  destinationMemberAvatar: {
    fontSize: 18,
  },
  destinationMemberName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 2,
  },
  destinationMemberSub: {
    fontSize: 11,
    color: colors.text.muted,
  },
  invoiceInputContainer: {
    marginTop: 14,
  },
  optionalBadgeText: {
    fontSize: 12,
    color: colors.text.muted,
    fontWeight: '500',
  },
  invoiceScanBtn: {
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(16, 185, 129, 0.35)' : '#A7F3D0',
  },
  invoiceScanBtnText: {
    fontSize: 11.5,
    color: isDark ? '#34D399' : '#059669',
    fontWeight: '700',
  },
  invoicePasteBtn: {
    backgroundColor: isDark ? 'rgba(37, 99, 235, 0.15)' : '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(37, 99, 235, 0.35)' : '#BFDBFE',
  },
  invoicePasteBtnText: {
    fontSize: 11.5,
    color: isDark ? '#60A5FA' : '#2563EB',
    fontWeight: '600',
  },
  invoiceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  invoiceNumberInput: {
    flex: 1,
    backgroundColor: isDark ? colors.background.input : '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E5E7EB',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text.primary,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  invoiceInputWon: {
    borderColor: '#F59E0B',
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
  },
  invoiceRandomCodeInput: {
    width: 76,
    backgroundColor: isDark ? colors.background.input : '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E5E7EB',
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.text.primary,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  invoiceStatusRow: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: isDark ? colors.background.cardSubtle : '#F3F4F6',
    alignSelf: 'flex-start',
  },
  invoiceStatusRowWon: {
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  invoiceStatusRowClaimed: {
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#ECFDF5',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  invoiceStatusText: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  cloudInvoiceCard: {
    marginTop: 10,
    backgroundColor: isDark ? 'rgba(14, 165, 233, 0.12)' : '#F0F9FF',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(56, 189, 248, 0.4)' : '#BAE6FD',
    borderRadius: 10,
    padding: 10,
  },
  cloudInvoiceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cloudInvoiceCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: isDark ? '#38BDF8' : '#0369A1',
  },
  cloudInvoiceCardTime: {
    fontSize: 11,
    color: isDark ? '#7DD3FC' : '#0284C7',
    fontWeight: '500',
  },
  cloudInvoiceCardSubtext: {
    fontSize: 11.5,
    color: isDark ? '#BAE6FD' : '#0C4A6E',
    marginBottom: 6,
  },
  cloudInvoiceItemsBox: {
    backgroundColor: isDark ? 'rgba(15, 23, 42, 0.6)' : '#FFFFFF',
    borderRadius: 8,
    padding: 8,
    marginVertical: 5,
    borderWidth: 0.5,
    borderColor: isDark ? 'rgba(56, 189, 248, 0.3)' : '#E0F2FE',
  },
  cloudInvoiceItemsTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: isDark ? '#E2E8F0' : '#334155',
    marginBottom: 4,
  },
  cloudInvoiceItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2.5,
  },
  cloudInvoiceItemName: {
    flex: 1,
    fontSize: 11.5,
    color: isDark ? '#CBD5E1' : '#475569',
    marginRight: 6,
  },
  cloudInvoiceItemQty: {
    fontSize: 11,
    color: isDark ? '#94A3B8' : '#64748B',
    marginRight: 10,
  },
  cloudInvoiceItemPrice: {
    fontSize: 11.5,
    fontWeight: '600',
    color: isDark ? '#38BDF8' : '#0284C7',
  },
  cloudInvoicePreserveNotice: {
    marginTop: 4,
  },
  cloudInvoicePreserveNoticeText: {
    fontSize: 11,
    color: isDark ? '#93C5FD' : '#0284C7',
    lineHeight: 15,
  },
  invoiceStatusTextWon: {
    color: isDark ? '#FBBF24' : '#B45309',
    fontWeight: '700',
  },
  invoiceStatusTextClaimed: {
    color: isDark ? '#34D399' : '#047857',
    fontWeight: '700',
  },
  duplicateWarningBox: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FFFBEB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(245, 158, 11, 0.35)' : '#FCD34D',
  },
  duplicateWarningIcon: {
    fontSize: 14,
  },
  duplicateWarningTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: isDark ? '#FBBF24' : '#B45309',
  },
  duplicateWarningDesc: {
    fontSize: 11,
    color: isDark ? '#FCD34D' : '#92400E',
    lineHeight: 16,
  },
  receiptSection: {
    marginTop: 12,
    marginBottom: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E2E8F0',
  },
  receiptUploadingText: {
    fontSize: 11,
    color: '#0284C7',
    fontWeight: '600',
    marginLeft: 'auto',
  },
  receiptPreviewContainer: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  receiptThumbnailTouchable: {
    position: 'relative',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#CBD5E1',
  },
  receiptThumbnailImage: {
    width: 90,
    height: 90,
    borderRadius: 9,
    backgroundColor: isDark ? colors.background.cardSubtle : '#E2E8F0',
  },
  receiptEnlargeOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingVertical: 2,
    alignItems: 'center',
  },
  receiptEnlargeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '600',
  },
  receiptActionsCol: {
    flex: 1,
    gap: 6,
  },
  receiptActionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: isDark ? colors.background.card : '#FFFFFF',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#CBD5E1',
    alignItems: 'center',
  },
  receiptActionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: isDark ? colors.text.primary : '#334155',
  },
  receiptDeleteBtn: {
    borderColor: isDark ? 'rgba(239, 68, 68, 0.4)' : '#FCA5A5',
    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
  },
  receiptDeleteBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },
  receiptUploadBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  receiptPickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: isDark ? colors.background.card : '#FFFFFF',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: isDark ? colors.border.default : '#CBD5E1',
    gap: 6,
  },
  receiptPickBtnIcon: {
    fontSize: 16,
  },
  receiptPickBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: isDark ? colors.text.secondary : '#475569',
  },
  memoHeaderActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 'auto',
  },
  memoHeaderPinBtn: {
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#CBD5E1',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  memoHeaderPinBtnActive: {
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.22)' : '#FEF3C7',
    borderColor: isDark ? '#F59E0B' : '#D97706',
  },
  memoHeaderPinText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: isDark ? '#CBD5E1' : '#475569',
  },
  memoHeaderPinTextActive: {
    color: isDark ? '#FBBF24' : '#B45309',
    fontWeight: '700',
  },
  memoHeaderPinBadgeAuto: {
    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.18)' : '#EEF2FF',
    borderWidth: 1,
    borderColor: isDark ? '#6366F1' : '#A5B4FC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  memoHeaderPinTextAuto: {
    fontSize: 11,
    fontWeight: '700',
    color: isDark ? '#C7D2FE' : '#4338CA',
  },
  memoEditorToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: isDark ? 'rgba(30, 41, 59, 0.9)' : '#F1F5F9',
    borderWidth: 1.5,
    borderColor: isDark ? colors.border.default : '#E5E7EB',
    borderTopWidth: 1,
    borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 8,
    marginBottom: 12,
  },
  memoToolbarBtn: {
    flex: 1,
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#FFFFFF',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#CBD5E1',
    paddingHorizontal: 6,
    borderRadius: 8,
    gap: 4,
  },
  memoToolbarBtnChecklist: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#FFFFFF',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#CBD5E1',
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 4,
  },
  memoToolbarBtnActive: {
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.18)' : '#FEF3C7',
    borderColor: isDark ? 'rgba(245, 158, 11, 0.55)' : '#F59E0B',
  },
  memoToolbarBtnHighlight: {
    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF',
    borderColor: isDark ? 'rgba(99, 102, 241, 0.55)' : '#6366F1',
  },
  memoToolbarBtnIcon: {
    fontSize: 13,
  },
  memoToolbarBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: isDark ? '#E2E8F0' : '#475569',
  },
  memoToolbarBtnTextActive: {
    color: isDark ? '#FBBF24' : '#B45309',
    fontWeight: '700',
  },
  memoToolbarBtnTextHighlight: {
    color: isDark ? '#A5B4FC' : '#4338CA',
    fontWeight: '700',
  },
  memoToolbarBtnCamera: {
    width: 36,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#FFFFFF',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#CBD5E1',
    borderRadius: 8,
  },
  memoToolbarBtnCameraActive: {
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#D1FAE5',
    borderColor: isDark ? '#10B981' : '#059669',
  },
  memoToolbarBtnCameraIcon: {
    fontSize: 14,
    lineHeight: 16,
  },
  memoPhotoPreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: isDark ? 'rgba(30, 41, 59, 0.75)' : '#F8FAFC',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0',
    borderRadius: 10,
    padding: 6,
    paddingHorizontal: 8,
    marginTop: -4,
    marginBottom: 12,
    gap: 8,
  },
  memoPhotoThumbnailTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  memoPhotoThumbnailImg: {
    width: 38,
    height: 38,
    borderRadius: 6,
    backgroundColor: isDark ? colors.background.cardSubtle : '#E2E8F0',
  },
  memoPdfBadgeBox: {
    width: 38,
    height: 38,
    borderRadius: 6,
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(245, 158, 11, 0.45)' : '#FCD34D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memoPdfBadgeIcon: {
    fontSize: 18,
  },
  memoPhotoTextCol: {
    flex: 1,
    minWidth: 0,
  },
  memoPhotoHintText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: isDark ? '#CBD5E1' : '#475569',
  },
  memoPhotoSubHintText: {
    fontSize: 10.5,
    color: isDark ? '#94A3B8' : '#64748B',
    marginTop: 1,
  },
  memoPhotoDeleteBtn: {
    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  memoPhotoDeleteBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: isDark ? '#FCA5A5' : '#DC2626',
  },
  memoDrawerOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
    zIndex: 999,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  memoDrawerBackdrop: {
    flex: 1,
  },
  memoDrawerCard: {
    backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderTopColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 12,
  },
  memoDrawerHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.25)' : '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 10,
  },
  memoDrawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
    marginBottom: 12,
    gap: 8,
  },
  memoDrawerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: isDark ? '#F1F5F9' : '#0F172A',
  },
  memoDrawerSubtitle: {
    fontSize: 11.5,
    color: isDark ? '#94A3B8' : '#64748B',
    marginTop: 2,
  },
  memoDrawerClearBtn: {
    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  memoDrawerClearBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: isDark ? '#FCA5A5' : '#DC2626',
  },
  memoDrawerCloseBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
  },
  memoDrawerCloseBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: isDark ? '#94A3B8' : '#64748B',
  },
  memoDrawerDoneBtn: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  memoDrawerDoneBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  memoDrawerScrollBody: {
    maxHeight: 460,
  },
  memoDrawerTagGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 4,
    paddingBottom: 24,
  },
  memoDrawerTagChip: {
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F8FAFC',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  memoDrawerTagChipActive: {
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
    borderColor: isDark ? '#F59E0B' : '#D97706',
  },
  memoDrawerTagChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: isDark ? '#E2E8F0' : '#334155',
  },
  memoDrawerTagChipTextActive: {
    color: isDark ? '#FBBF24' : '#B45309',
    fontWeight: '700',
  },
  memoDrawerTabHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
    marginBottom: 10,
    gap: 8,
  },
  memoDrawerTabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.3)' : '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  memoDrawerTabBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  memoDrawerTabBtnActive: {
    backgroundColor: isDark ? '#334155' : '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  memoDrawerTabBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: isDark ? '#94A3B8' : '#64748B',
  },
  memoDrawerTabBtnTextActive: {
    color: isDark ? '#F8FAFC' : '#0F172A',
    fontWeight: '700',
  },
  memoDrawerSectionDesc: {
    fontSize: 11.5,
    color: isDark ? '#94A3B8' : '#64748B',
    marginBottom: 8,
  },
  memoTemplateListContainer: {
    paddingVertical: 4,
    gap: 8,
    paddingBottom: 24,
  },
  memoTemplateCardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#F8FAFC',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0',
    borderRadius: 12,
    padding: 10,
    gap: 10,
  },
  memoTemplateCardIcon: {
    fontSize: 22,
  },
  memoTemplateCardTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: isDark ? '#F1F5F9' : '#0F172A',
  },
  memoTemplateCardDesc: {
    fontSize: 11,
    color: isDark ? '#94A3B8' : '#64748B',
    marginTop: 2,
  },
  memoTemplateCardArrowBadge: {
    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.18)' : '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  memoTemplateCardArrowText: {
    fontSize: 11,
    fontWeight: '700',
    color: isDark ? '#A5B4FC' : '#4F46E5',
  },
  memoQuickBuilderContainer: {
    paddingVertical: 4,
    paddingBottom: 24,
  },
  builderDomainChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 8,
    marginBottom: 6,
  },
  builderDomainChip: {
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#CBD5E1',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  builderDomainChipActive: {
    backgroundColor: '#4F46E5',
    borderColor: isDark ? '#818CF8' : '#4338CA',
  },
  builderDomainChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: isDark ? '#CBD5E1' : '#475569',
  },
  builderDomainChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  drawerQuickBuilderInner: {
    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.25)' : '#F8FAFC',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
    borderRadius: 12,
    padding: 10,
  },
  memoDrawerLivePreviewCard: {
    backgroundColor: isDark ? 'rgba(15, 23, 42, 0.85)' : '#F8FAFC',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(99, 102, 241, 0.4)' : '#C7D2FE',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  memoDrawerLivePreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  memoDrawerLivePreviewTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: isDark ? '#A5B4FC' : '#4338CA',
  },
  memoDrawerUndoBtn: {
    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.18)' : '#FEE2E2',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(239, 68, 68, 0.45)' : '#FCA5A5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  memoDrawerUndoBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: isDark ? '#FCA5A5' : '#DC2626',
  },
  memoDrawerLivePreviewScroll: {
    maxHeight: 72,
  },
  memoDrawerLivePreviewText: {
    fontSize: 12,
    lineHeight: 18,
    color: isDark ? '#E2E8F0' : '#334155',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  schoolQuickRowLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: isDark ? colors.text.secondary : '#475569',
    marginBottom: 6,
  },
  schoolQuickChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  schoolSubjectChip: {
    backgroundColor: isDark ? colors.background.cardSubtle : '#F1F5F9',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  schoolSubjectChipActive: {
    backgroundColor: '#4F46E5',
    borderColor: isDark ? '#818CF8' : '#4338CA',
  },
  schoolSubjectChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: isDark ? colors.text.secondary : '#475569',
  },
  schoolSubjectChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  schoolActionChip: {
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(16, 185, 129, 0.4)' : '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  schoolActionChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: isDark ? '#34D399' : '#059669',
  },
  schoolRoutineChip: {
    backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(59, 130, 246, 0.4)' : '#BFDBFE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  schoolRoutineChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: isDark ? '#93C5FD' : '#2563EB',
  },
  categoryMoreHeaderLink: {
    fontSize: 11,
    color: isDark ? '#818CF8' : '#4F46E5',
    fontWeight: '600',
  },
  categoryMoreChip: {
    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.15)' : '#EEF2FF',
    borderColor: isDark ? 'rgba(99, 102, 241, 0.4)' : '#C7D2FE',
  },
  categoryMoreChipText: {
    fontSize: 12,
    color: isDark ? '#A5B4FC' : '#4F46E5',
    fontWeight: '700',
  },
  attachmentToolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  attachmentToolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
    borderWidth: 1,
    borderColor: isDark ? '#334155' : '#E2E8F0',
  },
  attachmentToolbarBtnActive: {
    backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#EFF6FF',
    borderColor: isDark ? 'rgba(59, 130, 246, 0.5)' : '#93C5FD',
  },
  attachmentToolbarBtnCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
    borderWidth: 1,
    borderColor: isDark ? '#334155' : '#E2E8F0',
  },
  attachmentToolbarBtnIcon: {
    fontSize: 13,
  },
  attachmentToolbarBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: isDark ? '#E2E8F0' : '#475569',
  },
  attachmentToolbarBtnTextActive: {
    color: isDark ? '#93C5FD' : '#2563EB',
    fontWeight: '700',
  },
  attachmentToolbarBtnCamera: {
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
    borderColor: isDark ? 'rgba(16, 185, 129, 0.4)' : '#A7F3D0',
  },
  attachmentToolbarBtnCameraActive: {
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.25)' : '#D1FAE5',
    borderColor: isDark ? '#10B981' : '#059669',
  },
  attachmentToolbarBtnCameraIcon: {
    fontSize: 13,
  },
  attachmentToolbarBtnTextCameraActive: {
    color: isDark ? '#6EE7B7' : '#047857',
    fontWeight: '700',
  },
  invoiceCloseText: {
    fontSize: 12,
    fontWeight: '600',
    color: isDark ? '#94A3B8' : '#64748B',
  },
  categorySearchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  categorySearchInput: {
    backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
    borderWidth: 1,
    borderColor: isDark ? '#334155' : '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: isDark ? '#F1F5F9' : '#0F172A',
  },
  categoryDrawerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  categoryDrawerCardItem: {
    width: '31%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
    borderWidth: 1,
    borderColor: isDark ? '#334155' : '#E2E8F0',
  },
  categoryDrawerItemIcon: {
    fontSize: 16,
  },
  categoryDrawerItemText: {
    fontSize: 13,
    color: isDark ? '#E2E8F0' : '#1E293B',
    fontWeight: '500',
    flexShrink: 1,
  },
  payerMethodCard: {
    backgroundColor: isDark ? 'rgba(30, 41, 59, 0.4)' : '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(51, 65, 85, 0.6)' : '#E2E8F0',
    padding: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  payerMethodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  payerMethodLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: isDark ? '#94A3B8' : '#64748B',
    width: 60,
    flexShrink: 0,
  },
  payerMethodScroll: {
    flex: 1,
  },
  payerMethodChipsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  payerChipCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
    borderWidth: 1,
    borderColor: isDark ? '#334155' : '#E2E8F0',
  },
  payerChipCompactActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  payerAvatarCompact: {
    fontSize: 13,
  },
  payerNameCompact: {
    fontSize: 12,
    fontWeight: '500',
    color: isDark ? '#E2E8F0' : '#1E293B',
  },
  payerNameCompactActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  payerMethodDivider: {
    height: 1,
    backgroundColor: isDark ? 'rgba(51, 65, 85, 0.5)' : '#E2E8F0',
    marginVertical: 6,
  },
  methodChipCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
    borderWidth: 1,
    borderColor: isDark ? '#334155' : '#E2E8F0',
  },
  methodChipIconCompact: {
    fontSize: 13,
  },
  methodChipTextCompact: {
    fontSize: 12,
    fontWeight: '500',
    color: isDark ? '#E2E8F0' : '#1E293B',
  },
  dateInlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  dateInlineLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: isDark ? '#94A3B8' : '#64748B',
    flexShrink: 0,
  },
  dateInlineScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  memoReminderDateScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
    marginBottom: 10,
  },
  storeNoteCard: {
    backgroundColor: isDark ? 'rgba(6, 78, 59, 0.15)' : '#F0FDF4',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#BBF7D0',
    padding: 10,
    marginBottom: 8,
    gap: 8,
  },
  storeNoteCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  storeNoteCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: isDark ? '#6EE7B7' : '#047857',
  },
  storeNoteCardSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: isDark ? '#34D399' : '#059669',
  },
  headerReceiptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#DCFCE7',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(16, 185, 129, 0.4)' : '#86EFAC',
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  headerReceiptBtnActive: {
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#BBF7D0',
    borderColor: isDark ? '#10B981' : '#059669',
  },
  headerReceiptBtnIcon: {
    fontSize: 12,
  },
  headerReceiptBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: isDark ? '#6EE7B7' : '#065F46',
  },
  headerReceiptBtnTextActive: {
    color: isDark ? '#A7F3D0' : '#047857',
  },
  quickMerchantsRowContainer: {
    paddingTop: 2,
    paddingBottom: 4,
  },
  storeInputInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
    borderWidth: 1,
    borderColor: isDark ? '#334155' : '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 38,
  },
  storeInputIcon: {
    fontSize: 13,
    marginRight: 4,
  },
  storeTextInput: {
    flex: 1,
    fontSize: 12.5,
    color: isDark ? '#F1F5F9' : '#0F172A',
    paddingVertical: 0,
  },
  noteInputInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
    borderWidth: 1,
    borderColor: isDark ? '#334155' : '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    minHeight: 38,
  },
  noteInputIcon: {
    fontSize: 13,
    marginRight: 4,
    lineHeight: 20,
  },
  noteTextInput: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 20,
    color: isDark ? '#F1F5F9' : '#0F172A',
    paddingTop: 0,
    paddingBottom: 0,
    paddingVertical: 0,
    minHeight: 20,
    includeFontPadding: false,
  },
  noteReadOnlyText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 20,
    color: colors.text.primary,
  },
  noteReadOnlyPlaceholder: {
    color: '#9CA3AF',
  },
  noteClearBtn: {
    padding: 2,
    paddingTop: 3,
  },
  storeClearBtn: {
    padding: 2,
  },
  storeClearBtnText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  storeNoteToolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#DCFCE7',
  },
  invoiceToolbarBtn: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    paddingHorizontal: 6,
    borderRadius: 9,
    borderWidth: 1.2,
    gap: 4,
  },
  invoiceToolbarBtnLeft: {
    backgroundColor: isDark ? 'rgba(6, 78, 59, 0.35)' : '#F0FDF4',
    borderColor: isDark ? 'rgba(16, 185, 129, 0.6)' : '#86EFAC',
  },
  invoiceToolbarBtnLeftActive: {
    backgroundColor: isDark ? 'rgba(6, 78, 59, 0.6)' : '#DCFCE7',
    borderColor: isDark ? '#10B981' : '#059669',
  },
  invoiceToolbarBtnRight: {
    backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
    borderColor: isDark ? '#334155' : '#CBD5E1',
  },
  invoiceToolbarBtnIcon: {
    fontSize: 14,
  },
  invoiceToolbarBtnTextLeft: {
    fontSize: 12.5,
    fontWeight: '700',
    color: isDark ? '#34D399' : '#047857',
  },
  invoiceToolbarBtnTextLeftActive: {
    color: isDark ? '#6EE7B7' : '#065F46',
  },
  invoiceToolbarBtnTextRight: {
    fontSize: 12.5,
    fontWeight: '600',
    color: isDark ? '#E2E8F0' : '#334155',
  },
  storeQuickChipsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 2,
  },
  amountCardIntegrated: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: isDark ? 'rgba(30, 41, 59, 0.5)' : '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(51, 65, 85, 0.7)' : '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 8,
    minHeight: 48,
  },
  amountInputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  currencyPrefixIntegrated: {
    fontSize: 18,
    fontWeight: '800',
    color: isDark ? '#94A3B8' : '#64748B',
    marginRight: 6,
  },
  amountInputIntegrated: {
    flex: 1,
    fontSize: 24,
    fontWeight: '800',
    color: isDark ? '#F8FAFC' : '#0F172A',
    padding: 0,
    paddingVertical: 0,
    height: 38,
    textAlign: 'left',
  },
});
