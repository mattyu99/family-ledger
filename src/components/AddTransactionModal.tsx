import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Keyboard,
  Alert,
  Image,
} from 'react-native';
import { Text, TextInput } from './common/Text';

import { HorizontalScrollView } from './HorizontalScrollView';

import { useLedger } from '../context/LedgerContext';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { TransactionType, PaymentMethod } from '../types/database';
import {
  DEFAULT_PAYMENT_METHODS,
  filterAccountsForUser,
  getRecommendedDiscountLabel,
  formatExpenseNoteWithDiscount,
  getSmartDiscountLabels,
} from '../lib/payment';
import { getCategoryIcon } from '../lib/icons';
import {
  DEFAULT_MEMO_QUICK_TAGS,
  getMergedMemoTags,
  toggleMemoTag,
  isMemoTagActive,
  parseMemoNote,
  BUILTIN_MEMO_TEMPLATES,
  MemoChecklistTemplate,
  applyChecklistTemplate,
  insertChecklistCheckbox,
  handleChecklistInput,
  checkMemoPinQuota,
  extractDateFromText,
  offsetDateYmd,
  computeNextRelayReminderDate,
  resolveAnchorDate,
  detectMemoQuickBuilderConfig,
  appendSchoolChecklistItem,
  removeMemoTag,
  getMemoTagDisplayLabel,
} from '../lib/memo';
import {
  isGroupOrderMemo,
  detectCollaborativeOrderMode,
  extractPendingRestockItems,
  mergeRestockItemsIntoNote,
  setOrderDeadlineInNote,
  extractOrderDeadline,
  PendingRestockItem,
  applyRestockImportToSourceMemos,
} from '../lib/groupOrder';
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
  cleanBusinessName,
  ParsedInvoiceData,
} from '../lib/invoice';
import { checkInvoiceWinning } from '../lib/lottery';
import { DatePickerModal } from './DatePickerModal';
import { InvoiceScannerModal } from './InvoiceScannerModal';
import { ImageViewerModal } from './ImageViewerModal';
import { RestockPickerModal } from './RestockPickerModal';
import { uploadReceiptPhoto } from '../lib/receiptStorage';
import { DEMO_USER_DAD } from '../constants/ledgerDefaults';

const safeAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

let ImagePickerModule: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pickerPkg = require('expo-image-picker');
  if (pickerPkg?.launchImageLibraryAsync) {
    ImagePickerModule = pickerPkg;
  }
} catch {
  ImagePickerModule = null;
}

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
  initialMode?: 'expense' | 'income' | 'transfer' | 'allowance' | 'memo';
  defaultRecipientId?: string;
  defaultPayerId?: string;
  defaultNote?: string;
  defaultAmount?: number | string;
  defaultMerchant?: string;
  linkedMemoId?: string;
  linkedCompletionNote?: string;
  autoOpenScanner?: boolean;
  onClearAutoOpenScanner?: () => void;
  resetKey?: number;
}

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  visible,
  onClose,
  onSuccess,
  initialMode = 'expense',
  defaultRecipientId,
  defaultPayerId,
  defaultNote,
  defaultAmount,
  defaultMerchant,
  linkedMemoId,
  linkedCompletionNote,
  autoOpenScanner = false,
  onClearAutoOpenScanner,
  resetKey,
}) => {
  const { isDark, colors } = useTheme();
  const styles = useMemo(() => getStyles(isDark, colors), [isDark, colors]);
  const {
    currentLedger,
    categories,
    members,
    currentUser,
    transactions,
    addTransaction,
    updateTransaction,
    transferAllowance,
    executeTransfer,
    getMemberById,
    getCategoryById,
    recentMerchants,
    paymentAccounts,
    paymentMethods,
    recentMemoTags,
    dismissedMemoTags,
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

  const [mode, setMode] = useState<'expense' | 'income' | 'transfer' | 'allowance' | 'memo'>(
    initialMode === 'allowance' ? 'transfer' : (initialMode || 'expense')
  );
  const [transferTargetType, setTransferTargetType] = useState<'account' | 'member'>(
    initialMode === 'allowance' || !!defaultRecipientId ? 'member' : 'account'
  );
  const [type, setType] = useState<TransactionType>(
    initialMode === 'income' ? 'income' : (initialMode === 'memo' ? 'memo' : (initialMode === 'transfer' ? 'transfer' : 'expense'))
  );
  const [amount, setAmount] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [paidBy, setPaidBy] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [merchant, setMerchant] = useState<string>('');
  const [note, setNote] = useState<string>('');

  // ⇄ 轉帳模式專屬狀態 (階段 B)
  const [transferFromAccountId, setTransferFromAccountId] = useState<string>('');
  const [transferToAccountId, setTransferToAccountId] = useState<string>('');
  const [transferFee, setTransferFee] = useState<string>('0');

  // 📎 收據/保固照片附件狀態 (階段 B)
  const [receiptPhotoUri, setReceiptPhotoUri] = useState<string>('');
  const [receiptPhotoBase64, setReceiptPhotoBase64] = useState<string>('');
  const [viewingPhotoModal, setViewingPhotoModal] = useState<boolean>(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
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
  const [memoReminderTarget, setMemoReminderTarget] = useState<'family' | 'personal'>('family');
  const [memoIsPinned, setMemoIsPinned] = useState<boolean>(false);
  const [importedRestockMemoIds, setImportedRestockMemoIds] = useState<string[]>([]);
  const [importedRestockItems, setImportedRestockItems] = useState<PendingRestockItem[]>([]);
  const [isRestockPickerVisible, setIsRestockPickerVisible] = useState<boolean>(false);
  const [reminderPickerInitialMode, setReminderPickerInitialMode] = useState<CalendarSystem>('solar');
  const [reminderDatePickerVisible, setReminderDatePickerVisible] = useState<boolean>(false);
  const [keyboardOffset, setKeyboardOffset] = useState<number>(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const lastAutoDetectedDateRef = useRef<string>('');
  const userManuallySetReminderRef = useRef<boolean>(false);
  const userManuallyToggledPinRef = useRef<boolean>(false);
  // 🎯 記憶非農曆初一十五週期時之基準日期與曆法（切換頻率時智慧還原用）
  const baseReminderDateRef = useRef<string>('');
  const baseReminderCalendarRef = useRef<CalendarSystem>('solar');
  // 📂 分類抽屜與發票收折狀態 (支出分頁極致瘦身)
  const [isCategoryDrawerOpen, setIsCategoryDrawerOpen] = useState<boolean>(false);
  const [categorySearchQuery, setCategorySearchQuery] = useState<string>('');
  const [isInvoiceExpanded, setIsInvoiceExpanded] = useState<boolean>(false);
  const [showSuggestedMerchants, setShowSuggestedMerchants] = useState<boolean>(false);

  // 💡 智慧日期即時解析：感知記事文字中蘊含的日期 (支援待辦清單接力推進、民國年、西元年、月/日、明天等)
  const detectedMemoDate = React.useMemo(() => {
    if (mode !== 'memo' || !note) return null;
    const anchor = selectedDate ? resolveAnchorDate(selectedDate) : new Date();
    const relayYmd = computeNextRelayReminderDate(note, new Date(), anchor);
    if (relayYmd) {
      const [y, m, d] = relayYmd.split('-').map(Number);
      return {
        rawMatch: `${m}/${d}`,
        formattedYmd: relayYmd,
        displayLabel: relayYmd,
        year: y,
        month: m,
        day: d,
      };
    }
    return extractDateFromText(note, anchor);
  }, [mode, note, selectedDate]);

  // 即時打字感知自動預填：若使用者未手動設定其他提醒日，自動無縫帶入最新辨識之日期
  useEffect(() => {
    if (!detectedMemoDate) return;
    const targetYmd = detectedMemoDate.formattedYmd;
    if (targetYmd !== lastAutoDetectedDateRef.current) {
      lastAutoDetectedDateRef.current = targetYmd;
      if (!memoReminderDate || !userManuallySetReminderRef.current) {
        setMemoReminderDate(targetYmd);
        setMemoReminderRepeat('once');
        setMemoReminderCalendar('solar');
      }
    }
  }, [detectedMemoDate, memoReminderDate]);

  // 📌 智慧開團/採買感知自動全家共享：
  // 若生活記事命中五大協作活動（點餐/採買/投票/懸賞/包裹），自動啟用「全家共享」；
  // 協作看板在進行中天然常駐首頁最上方，不佔用也不受限於常態置頂 5 筆配額。
  useEffect(() => {
    if (mode !== 'memo' && type !== 'memo') return;
    if (userManuallyToggledPinRef.current) return;

    const parsed = parseMemoNote(note);
    const isOrder = isGroupOrderMemo(parsed.title, note);
    if (isOrder) {
      setMemoIsPinned(false);
      setMemoReminderTarget('family');
    }
  }, [note, mode, type]);

  // 🏠 家中缺貨隨手記自動感知：當處於賣場採買或網購湊單模式時，偵測尚未結案的家中缺貨項目
  const pendingRestockForCurrentMemo = useMemo(() => {
    if (mode !== 'memo' && type !== 'memo') return [];
    const parsed = parseMemoNote(note);
    if (!isGroupOrderMemo(parsed.title, note)) return [];
    const orderMode = detectCollaborativeOrderMode(parsed.title, note);
    if (orderMode !== 'grocery' && orderMode !== 'parcel') return [];
    const allRestock = extractPendingRestockItems(transactions);
    const lowerNote = (note || '').toLowerCase();
    return allRestock.filter(item => !lowerNote.includes(item.itemName.toLowerCase()));
  }, [mode, type, note, transactions]);

  // ⏰ 協同開團/投票截止時間感知與快捷操作
  const currentOrderDeadline = useMemo(() => {
    if (mode !== 'memo' && type !== 'memo') return null;
    return extractOrderDeadline(note);
  }, [mode, type, note]);

  const isCollabOrderOrVoting = useMemo(() => {
    if (mode !== 'memo' && type !== 'memo') return false;
    const parsed = parseMemoNote(note);
    if (!isGroupOrderMemo(parsed.title, note)) return false;
    const orderMode = detectCollaborativeOrderMode(parsed.title, note);
    return orderMode === 'food' || orderMode === 'vote';
  }, [mode, type, note]);

  const handleSetQuickDeadlineMinutes = (minutes: number) => {
    const target = new Date(Date.now() + minutes * 60000);
    const hh = String(target.getHours()).padStart(2, '0');
    const mm = String(target.getMinutes()).padStart(2, '0');
    setNote(prev => setOrderDeadlineInNote(prev, `${hh}:${mm}`));
  };

  const handleSetFixedDeadline = (timeStr: string) => {
    setNote(prev => setOrderDeadlineInNote(prev, timeStr));
  };

  const handleClearDeadline = () => {
    setNote(prev => setOrderDeadlineInNote(prev, ''));
  };

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
        if (!isNaN(d.getTime())) setSelectedDate(d);
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
            const dup = cleaned ? transactions.find(t => t.invoice_number && formatInvoiceNumber(t.invoice_number) === cleaned) : null;
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

  // 使用者是否在本彈窗開啟期間曾手動點選切換過付款/記錄成員
  const [hasUserManuallySelectedPayer, setHasUserManuallySelectedPayer] = useState<boolean>(false);

  // 計算目前最適之本機成員
  const resolveActiveMember = React.useCallback(
    (targetPayerId?: string) => {
      if (targetPayerId && members.some(m => m.id === targetPayerId)) {
        return members.find(m => m.id === targetPayerId);
      }
      if (defaultPayerId && members.some(m => m.id === defaultPayerId)) {
        return members.find(m => m.id === defaultPayerId);
      }
      return (
        members.find(m => m.id === currentUser?.id) ||
        (currentUser?.id ? getMemberById(currentUser.id) : undefined) ||
        members.find(
          m =>
            (m.display_name || '').trim().toLowerCase() ===
            (currentUser?.display_name || '').trim().toLowerCase()
        ) ||
        members[0]
      );
    },
    [members, defaultPayerId, currentUser, getMemberById]
  );

  // 動態保證付款/記錄成員絕不為空，且優先對齊當前本機成員
  const effectivePaidBy = useMemo(() => {
    // 1. 若使用者已在此次開啟過程中手動選取，且選取的成員在名冊中有效，維持其手動選擇
    if (hasUserManuallySelectedPayer && paidBy && members.some(m => m.id === paidBy)) {
      return paidBy;
    }
    // 2. 若有外部指定之 defaultPayerId 且存在於名冊中，優先採用
    if (defaultPayerId && members.some(m => m.id === defaultPayerId)) {
      return defaultPayerId;
    }
    // 3. 預設優先對齊當前本機成員 (currentUser)
    if (currentUser?.id && members.some(m => m.id === currentUser.id)) {
      return currentUser.id;
    }
    // 4. 若當前 paidBy 在 members 中有效且不是初始示範假爸爸，保留
    if (paidBy && members.some(m => m.id === paidBy) && paidBy !== DEMO_USER_DAD) {
      return paidBy;
    }
    // 5. 透過稱謂比對或名冊首位作為最後防禦
    const fallback = resolveActiveMember();
    return fallback?.id || '';
  }, [hasUserManuallySelectedPayer, paidBy, members, currentUser, defaultPayerId, resolveActiveMember]);

  const effectiveAllowancePayer = useMemo(() => {
    if (allowancePayerId && members.some(m => m.id === allowancePayerId)) {
      return allowancePayerId;
    }
    return effectivePaidBy;
  }, [allowancePayerId, members, effectivePaidBy]);

  const availableCategories = categories.filter(c => c.type === type);
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
  const targetPayerId = effectivePaidBy || currentUser?.id;
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

    const isUserAccount = (accUserId?: string | null) => {
      const activePayer = effectivePaidBy || paidBy;
      if (!accUserId || !activePayer) return false;
      if (accUserId === activePayer) return true;
      if (getMemberById && getMemberById(accUserId)?.display_name === getMemberById(activePayer)?.display_name) return true;
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
    setHasUserManuallySelectedPayer(true);
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
    setAmount(defaultAmount !== undefined && defaultAmount !== null && defaultAmount !== '' ? String(defaultAmount) : '');
    setPaymentMethod('cash');
    setSelectedAccountId('');
    setMerchant(defaultMerchant || '');
    setInvoiceNumber('');
    setInvoiceRandomCode('');
    setInvoiceSellerTaxId('');
    setMemoReminderDate('');
    setMemoReminderCalendar('solar');
    setMemoReminderRepeat('once');
    setMemoReminderTarget('family');
    baseReminderDateRef.current = '';
    baseReminderCalendarRef.current = 'solar';
    setMemoIsPinned(false);
    setImportedRestockMemoIds([]);
    lastAutoDetectedDateRef.current = '';
    userManuallySetReminderRef.current = false;
    userManuallyToggledPinRef.current = false;
    setReminderPickerInitialMode('solar');
    setReminderDatePickerVisible(false);
    setShowDiscountPanel(false);
    setDiscountAmount('');
    setDiscountLabel('LINE Points');
    setDiscountLabelTouched(false);
    setDiscountCalcMode('subtract');
    setAllowanceMode('transfer');
    setTransferFee('0');
    setReceiptPhotoUri('');
    setReceiptPhotoBase64('');
    setViewingPhotoModal(false);
    setScannerModalVisible(false);

    const fromCandidate = paymentAccounts.find(a => a.type === 'bank' || a.type === 'cash') || paymentAccounts[0];
    const toCandidate = paymentAccounts.find(a => a.id !== fromCandidate?.id) || paymentAccounts[1];
    setTransferFromAccountId(fromCandidate?.id || '');
    setTransferToAccountId(toCandidate?.id || '');

    const targetMode = initialMode === 'allowance' ? 'transfer' : (initialMode || 'expense');
    setMode(targetMode);
    if (targetMode === 'expense' || targetMode === 'income' || targetMode === 'memo') {
      setType(targetMode);
    } else if (targetMode === 'transfer') {
      setType('transfer');
    }

    if (initialMode === 'allowance' || defaultRecipientId) {
      setTransferTargetType('member');
    } else {
      setTransferTargetType('account');
    }

    if (defaultNote) {
      setNote(defaultNote);
    } else {
      setNote('');
    }
    lastScannedItemsNoteRef.current = '';

    setHasUserManuallySelectedPayer(false);

    const activeMember = (defaultPayerId && members.find(m => m.id === defaultPayerId))
      || members.find(m => m.id === currentUser?.id)
      || (currentUser?.id ? getMemberById(currentUser.id) : undefined)
      || members.find(m => (m.display_name || '').trim().toLowerCase() === (currentUser?.display_name || '').trim().toLowerCase())
      || members[0];
    if (activeMember) {
      setPaidBy(activeMember.id);
      setAllowancePayerId(activeMember.id);
    }

    // 零用錢受款者預設值
    if (defaultRecipientId && members.some(m => m.id === defaultRecipientId)) {
      setAllowanceRecipientId(defaultRecipientId);
    } else {
      const others = members.filter(m => m.id !== (activeMember?.id || currentUser?.id));
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
  }, [initialMode, defaultNote, defaultPayerId, defaultRecipientId, defaultAmount, defaultMerchant, currentUser, members, categories, getMemberById, paymentAccounts]);

  // 當彈窗開啟時，全面執行 resetForm 確保畫面乾淨無前次殘留；若指定 autoOpenScanner 則自動喚起發票相機
  const prevVisibleRef = React.useRef(false);
  const prevInitialModeRef = React.useRef(initialMode);
  const resetFormRef = React.useRef(resetForm);

  React.useEffect(() => {
    resetFormRef.current = resetForm;
  }, [resetForm]);

  React.useEffect(() => {
    const justOpened = visible && !prevVisibleRef.current;
    const initialModeChanged = visible && initialMode !== prevInitialModeRef.current;

    if (justOpened || initialModeChanged) {
      setHasUserManuallySelectedPayer(false);
      resetFormRef.current();
    } else if (!visible) {
      // 當彈窗關閉時，確保所有子彈窗 (相機掃描器、照片檢視、日期選擇) 無條件關閉釋放資源
      setScannerModalVisible(false);
      setViewingPhotoModal(false);
      setDatePickerVisible(false);
      setReminderDatePickerVisible(false);
    }
    prevVisibleRef.current = visible;
    prevInitialModeRef.current = initialMode;
  }, [visible, initialMode]);

  // 監聽外部傳入之 resetKey（例如桌面小工具快捷進入、或重設要求），強制執行全新表單重設
  const prevResetKeyRef = React.useRef(resetKey);
  React.useEffect(() => {
    if (resetKey !== undefined && resetKey !== prevResetKeyRef.current) {
      prevResetKeyRef.current = resetKey;
      setHasUserManuallySelectedPayer(false);
      resetFormRef.current();
    }
  }, [resetKey]);

  // 專門獨立監聽 autoOpenScanner：只要彈窗處於開啟狀態且 autoOpenScanner 為 true，即刻喚起掃描器並清空單次旗標
  React.useEffect(() => {
    if (visible && autoOpenScanner) {
      const timer = setTimeout(() => {
        setScannerModalVisible(true);
        onClearAutoOpenScanner?.();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [visible, autoOpenScanner, onClearAutoOpenScanner]);

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
        setReceiptPhotoUri(result.assets[0].uri);
        if (result.assets[0].base64) {
          setReceiptPhotoBase64(result.assets[0].base64);
        }
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
        setReceiptPhotoUri(result.assets[0].uri);
        if (result.assets[0].base64) {
          setReceiptPhotoBase64(result.assets[0].base64);
        }
      }
    } catch (e: any) {
      safeAlert('相簿錯誤', e?.message || '無法讀取相簿');
    }
  };

  // 📷 生活記事拍照或選取照片提示 (菜單、聯絡簿、規格備忘)
  const handlePromptMemoPhotoSource = () => {
    Keyboard.dismiss();
    Alert.alert(
      '📷 附加照片備忘',
      '拍下菜單、聯絡簿或物品型號，省去手打快速記錄：',
      [
        { text: '📸 立即拍照', onPress: handlePickReceiptFromCamera },
        { text: '🖼️ 從相簿挑選', onPress: handlePickReceiptFromLibrary },
        { text: '取消', style: 'cancel' },
      ],
      { cancelable: true }
    );
  };

  // 📷 消費收據 / 保固憑證拍照或相簿提示 (支出分頁極致瘦身)
  const handlePromptReceiptPhotoSource = () => {
    Keyboard.dismiss();
    Alert.alert(
      '📷 附加消費收據 / 保固憑證',
      '拍下發票收據或保固卡，日後對帳與保固查驗超省心：',
      [
        { text: '📸 拍照附收據', onPress: handlePickReceiptFromCamera },
        { text: '🖼️ 從相簿選擇', onPress: handlePickReceiptFromLibrary },
        ...(receiptPhotoUri
          ? [{
              text: '🗑️ 移除照片',
              style: 'destructive' as const,
              onPress: () => {
                setReceiptPhotoUri('');
                setReceiptPhotoBase64('');
              },
            }]
          : []),
        { text: '取消', style: 'cancel' as const },
      ],
      { cancelable: true }
    );
  };

  // 送出內部轉帳 / 提款 / 繳卡費 (階段 B)
  const handleTransferSubmit = async () => {
    if (isSubmitting) return;
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      safeAlert('請輸入金額', '請輸入大於 0 的轉帳金額');
      return;
    }
    if (!transferFromAccountId || !transferToAccountId) {
      safeAlert('請選擇帳戶', '請選擇轉出帳戶與轉入目標');
      return;
    }
    if (transferFromAccountId === transferToAccountId) {
      safeAlert('帳戶相同', '轉出帳戶與轉入目標不能是同一個帳戶');
      return;
    }

    const feeNum = parseFloat(transferFee) || 0;
    const now = new Date();
    const txDate = new Date(selectedDate);
    txDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());

    setIsSubmitting(true);
    try {
      const res = await executeTransfer({
        fromAccountId: transferFromAccountId,
        toAccountId: transferToAccountId,
        amount: numAmount,
        fee: feeNum,
        payerId: effectivePaidBy || paidBy || currentUser?.id,
        transactedAt: txDate.toISOString(),
        note: note.trim() || undefined,
      });

      if (!res.success) {
        safeAlert('轉帳失敗', res.error || '執行轉帳時發生錯誤');
        return;
      }

      if (linkedMemoId && res.transactionId) {
        await updateTransaction(linkedMemoId, {
          linked_transaction_id: res.transactionId,
          is_settled: true,
          completed_by: effectivePaidBy || paidBy || currentUser?.id,
          ...(linkedCompletionNote ? { completion_note: linkedCompletionNote } : {}),
        });
      }

      safeAlert('🎉 轉帳成功！', '已完成資金調撥與各帳戶餘額更新！此筆內部資金流動不計入公帳總支出。');
      onSuccess?.(res.transactionId);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  // 送出撥零用錢 (一鍵雙向記帳)
  const handleAllowanceSubmit = async () => {
    if (isSubmitting) return;
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      safeAlert('請輸入金額', '請輸入大於 0 的零用錢金額');
      return;
    }

    const payer = members.find(m => m.id === effectiveAllowancePayer) || currentUser;
    const recipient = members.find(m => m.id === allowanceRecipientId);

    if (!recipient) {
      safeAlert('請選擇受款人', '請選擇零用錢要發放給哪位家庭成員');
      return;
    }
    if (payer.id === recipient.id) {
      safeAlert('成員不能相同', '出資家長與受款成員不能是同一個人');
      return;
    }

    setIsSubmitting(true);
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
        linked_transaction_id: linkedMemoId || undefined,
      });

      if (!res.success) {
        safeAlert('撥發失敗', res.error || '發放零用錢時發生錯誤');
        return;
      }

      const linkedTxId = res.transferTxId || res.parentTxId;
      if (linkedMemoId && linkedTxId) {
        await updateTransaction(linkedMemoId, {
          linked_transaction_id: linkedTxId,
          is_settled: true,
          completed_by: payer.id,
          ...(linkedCompletionNote ? { completion_note: linkedCompletionNote } : {}),
        });
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
      onSuccess?.(linkedTxId);
      onClose();
    } catch (err: any) {
      safeAlert('撥發失敗', err?.message || '發放零用錢時發生錯誤');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 生活記事與待辦備忘提交
  const handleMemoSubmit = async () => {
    if (isSubmitting) return;
    if (!note.trim()) {
      safeAlert('請輸入記事內容', '請填寫您想記錄的生活記事或備忘內容');
      return;
    }

    const defaultMemoCat = categories.find(c => c.name.includes('其他') || c.name.includes('日常')) || categories[0];
    const targetPayer = effectivePaidBy || paidBy || currentUser?.id || members[0]?.id;

    setIsSubmitting(true);
    try {
      const now = new Date();
      const txDate = new Date(selectedDate);
      txDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
      const transacted_at = txDate.toISOString();

      // 若有附加備忘/菜單照片，上傳至雲端 Storage
      let finalImageUrl: string | undefined = undefined;
      if (receiptPhotoUri) {
        if (receiptPhotoUri.startsWith('http://') || receiptPhotoUri.startsWith('https://')) {
          finalImageUrl = receiptPhotoUri;
        } else if (currentLedger?.id) {
          try {
            setIsUploadingPhoto(true);
            finalImageUrl = await uploadReceiptPhoto({
              ledgerId: currentLedger.id,
              uri: receiptPhotoUri,
              base64: receiptPhotoBase64 || undefined,
            });
          } catch {
            finalImageUrl = receiptPhotoUri;
          } finally {
            setIsUploadingPhoto(false);
          }
        } else {
          finalImageUrl = receiptPhotoUri;
        }
      }

      const createdTxId = await addTransaction({
        amount: 0,
        type: 'memo',
        category_id: defaultMemoCat?.id || categories[0]?.id,
        paid_by: targetPayer,
        note: note.trim(),
        image_url: finalImageUrl,
        reminder_date: memoReminderDate || undefined,
        reminder_calendar: memoReminderDate ? memoReminderCalendar : undefined,
        reminder_repeat: memoReminderDate ? memoReminderRepeat : undefined,
        reminder_target: memoReminderTarget || 'family',
        linked_transaction_id: linkedMemoId || undefined,
        transacted_at,
        is_pinned: memoIsPinned,
      });

      if (linkedMemoId && createdTxId) {
        await updateTransaction(linkedMemoId, {
          linked_transaction_id: createdTxId,
          is_settled: true,
          completed_by: targetPayer,
          ...(linkedCompletionNote ? { completion_note: linkedCompletionNote } : {}),
        });
      }

      if (createdTxId && importedRestockItems.length > 0) {
        const plans = applyRestockImportToSourceMemos(importedRestockItems, transactions);
        for (const plan of plans) {
          if (plan.memoId && plan.memoId !== linkedMemoId) {
            await updateTransaction(plan.memoId, {
              note: plan.updatedNote,
              is_settled: plan.shouldSettle,
              completed_by: plan.shouldSettle ? targetPayer : undefined,
              completion_note: plan.completionNote,
              linked_transaction_id: plan.shouldSettle ? createdTxId : undefined,
            });
          }
        }
      } else if (createdTxId && importedRestockMemoIds.length > 0) {
        for (const restockMemoId of importedRestockMemoIds) {
          if (restockMemoId && restockMemoId !== linkedMemoId) {
            await updateTransaction(restockMemoId, {
              linked_transaction_id: createdTxId,
              is_settled: true,
              completed_by: targetPayer,
              completion_note: '已一鍵匯入採買清單',
            });
          }
        }
      }

      setImportedRestockItems([]);
      setImportedRestockMemoIds([]);

      setAmount('');
      setMerchant('');
      setNote('');
      setReceiptPhotoUri('');
      setReceiptPhotoBase64('');
      setMemoReminderDate('');
      setMemoReminderCalendar('solar');
      setMemoReminderRepeat('once');
      setMemoReminderTarget('family');
      lastAutoDetectedDateRef.current = '';
      userManuallySetReminderRef.current = false;
      userManuallyToggledPinRef.current = false;
      setMemoIsPinned(false);
      setImportedRestockMemoIds([]);
      setSelectedDate(new Date());
      onSuccess?.(createdTxId);
      onClose();
    } catch (err: any) {
      safeAlert('儲存失敗', err?.message || '儲存生活記事時發生錯誤');
    } finally {
      setIsSubmitting(false);
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
    if (isSubmitting || isUploadingPhoto) {
      return;
    }

    if (mode === 'transfer') {
      if (transferTargetType === 'member') {
        return handleAllowanceSubmit();
      }
      return handleTransferSubmit();
    }
    if ((mode as string) === 'allowance') {
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
    const targetPayer = effectivePaidBy || paidBy || currentUser?.id || members[0]?.id;

    if (!targetCategory) {
      safeAlert('尚未選擇分類', '請先選擇記帳分類');
      return;
    }

    const executeSaveTransaction = async () => {
      if (isSubmitting || isUploadingPhoto) return;
      setIsSubmitting(true);
      try {
        const now = new Date();
        const txDate = new Date(selectedDate);
        // 保留當下時間的時間戳，以利時間排序
        txDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
        const transacted_at = txDate.toISOString();

        // 若有收據照片附件，上傳至雲端 Storage
        let finalImageUrl: string | undefined = undefined;
        if (receiptPhotoUri) {
          if (receiptPhotoUri.startsWith('http://') || receiptPhotoUri.startsWith('https://')) {
            finalImageUrl = receiptPhotoUri;
          } else {
            try {
              setIsUploadingPhoto(true);
              finalImageUrl = await uploadReceiptPhoto({
                ledgerId: currentLedger.id,
                uri: receiptPhotoUri,
                base64: receiptPhotoBase64 || undefined,
              });
            } catch {
              finalImageUrl = receiptPhotoUri;
            } finally {
              setIsUploadingPhoto(false);
            }
          }
        }

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
          image_url: finalImageUrl,
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
        setReceiptPhotoUri('');
        setReceiptPhotoBase64('');
        onSuccess?.(createdTxId);
        onClose();
      } catch (err: any) {
        safeAlert('儲存失敗', err.message || '儲存記帳時發生錯誤');
      } finally {
        setIsSubmitting(false);
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
              {mode === 'transfer'
                ? (transferTargetType === 'member' ? '🎁 轉給家人 / 撥發零用錢' : '⇄ 帳戶資金互轉 / 提款 / 繳卡費')
                : (mode as string) === 'allowance'
                ? '🎁 轉給家人 / 撥發零用錢'
                : mode === 'income'
                ? '新增一筆收入'
                : mode === 'memo'
                ? '📝 新增生活記事與備忘'
                : '新增一筆支出'}
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
                  🔗 連動生活待辦：儲存時將自動為該待辦打勾辦妥並雙向綁定
                  {linkedCompletionNote ? `（回報：${linkedCompletionNote}）` : ''}
                </Text>
              </View>
            )}

            {/* 支出 / 收入 / 轉帳 / 撥零用錢 / 記事 切換鈕 */}
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
                style={[styles.typeBtn, mode === 'transfer' && styles.typeBtnActiveTransfer]}
                onPress={() => {
                  setMode('transfer');
                  setType('transfer');
                }}
              >
                <Text
                  style={[styles.typeBtnText, mode === 'transfer' && styles.typeBtnTextActiveTransfer]}
                  maxFontSizeMultiplier={1.15}
                >
                  ⇄ 轉帳
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

            {/* ⇄ 轉帳子目標切換：帳戶互轉 VS 轉給家人 / 撥零用錢 */}
            {mode === 'transfer' && (
              <View style={styles.transferTargetTypeContainer}>
                <TouchableOpacity
                  style={[
                    styles.transferTargetTypeBtn,
                    transferTargetType === 'account' && styles.transferTargetTypeBtnActive,
                  ]}
                  onPress={() => setTransferTargetType('account')}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.transferTargetTypeBtnText,
                      transferTargetType === 'account' && styles.transferTargetTypeBtnTextActive,
                    ]}
                    maxFontSizeMultiplier={1.12}
                  >
                    🏦 帳戶互轉 / 提款 / 繳卡費
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.transferTargetTypeBtn,
                    transferTargetType === 'member' && styles.transferTargetTypeBtnActiveAllowance,
                  ]}
                  onPress={() => setTransferTargetType('member')}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.transferTargetTypeBtnText,
                      transferTargetType === 'member' && styles.transferTargetTypeBtnTextActive,
                    ]}
                    maxFontSizeMultiplier={1.12}
                  >
                    🎁 轉給家人 / 撥零用錢
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {mode === 'memo' ? (
              <>
                {/* 記事內容多行輸入框與常駐操作工具列 */}
                <View onLayout={(e) => setMemoSectionY(e.nativeEvent.layout.y)}>
                  <View style={styles.sectionLabelRow}>
                    <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>記事內容與備忘</Text>
                    <View style={styles.memoHeaderActionRow}>
                      {keyboardOffset > 0 && (
                        <TouchableOpacity onPress={Keyboard.dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Text style={styles.dismissKeyboardText} maxFontSizeMultiplier={1.08}>收起鍵盤 ▾</Text>
                        </TouchableOpacity>
                      )}
                      {/* 📌 標題列置頂切換膠囊 (0 像素高度消耗) */}
                      {isGroupOrderMemo(parseMemoNote(note).title, note) ? (
                        <View style={styles.memoHeaderPinBadgeAuto}>
                          <Text style={styles.memoHeaderPinTextAuto} maxFontSizeMultiplier={1.05}>⚡ 協作常駐</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={[styles.memoHeaderPinBtn, memoIsPinned && styles.memoHeaderPinBtnActive]}
                          onPress={() => {
                            if (!memoIsPinned) {
                              const quota = checkMemoPinQuota(transactions, {
                                targetScope: memoReminderTarget,
                                memberId: effectivePaidBy || currentUser?.id,
                              });
                              if (!quota.canPin) {
                                Alert.alert(
                                  memoReminderTarget === 'personal' ? '個人置頂已達上限' : '全家置頂已達上限',
                                  quota.errorMessage || '置頂已達 5 筆上限，請先辦妥或取消現有置頂事項。'
                                );
                                return;
                              }
                            }
                            userManuallyToggledPinRef.current = true;
                            setMemoIsPinned(!memoIsPinned);
                          }}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.memoHeaderPinText, memoIsPinned && styles.memoHeaderPinTextActive]} maxFontSizeMultiplier={1.05}>
                            {memoIsPinned ? '📌 已置頂 ✓' : '📌 置頂'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                  <TextInput
                    style={styles.memoContentInput}
                    multiline
                    numberOfLines={6}
                    placeholder="記錄今天的事情、靈感、採買備忘或家庭待辦..."
                    placeholderTextColor="#9CA3AF"
                    value={note}
                    onChangeText={(text) => setNote(handleChecklistInput(note, text))}
                    onFocus={() => scrollToInput(memoSectionY, 70)}
                    textAlignVertical="top"
                    maxFontSizeMultiplier={1.15}
                  />

                  {/* 🛠️ 輸入框常駐編輯操作列 (待辦 / 標籤 / 範本快選 / 📷 純圖示拍照選圖) */}
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

                    {/* 📷 純圖示拍照/相簿按鈕 (菜單/聯絡簿/型號速記) */}
                    <TouchableOpacity
                      style={[styles.memoToolbarBtnCamera, !!receiptPhotoUri && styles.memoToolbarBtnCameraActive]}
                      onPress={handlePromptMemoPhotoSource}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.memoToolbarBtnCameraIcon}>📷</Text>
                    </TouchableOpacity>
                  </View>

                  {/* 📷 記事即時照片縮圖列 (有照片才顯示，支援點擊全螢幕放大與一鍵移除) */}
                  {!!receiptPhotoUri && (
                    <View style={styles.memoPhotoPreviewBar}>
                      <TouchableOpacity
                        onPress={() => setViewingPhotoModal(true)}
                        activeOpacity={0.8}
                        style={styles.memoPhotoThumbnailTouchable}
                      >
                        <Image source={{ uri: receiptPhotoUri }} style={styles.memoPhotoThumbnailImg} />
                        <Text style={styles.memoPhotoHintText} maxFontSizeMultiplier={1.05}>
                          📷 照片已附加 (點擊放大檢視)
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.memoPhotoDeleteBtn}
                        onPress={() => {
                          setReceiptPhotoUri('');
                          setReceiptPhotoBase64('');
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.memoPhotoDeleteBtnText}>✕ 移除</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* ⏰ 點餐開團 / 家庭投票 截止時間快捷設定列 */}
                  {(isCollabOrderOrVoting || currentOrderDeadline?.hasDeadline) && (
                    <View style={styles.orderDeadlineSettingBox}>
                      <View style={styles.orderDeadlineSettingHeader}>
                        <Text style={styles.orderDeadlineSettingTitle} maxFontSizeMultiplier={1.08}>
                          ⏰ 截止收單時間
                        </Text>
                        {currentOrderDeadline?.hasDeadline ? (
                          <View style={styles.orderDeadlineCurrentBadge}>
                            <Text style={styles.orderDeadlineCurrentBadgeText} maxFontSizeMultiplier={1.08}>
                              {currentOrderDeadline.rawText} 截止 ({currentOrderDeadline.badgeText})
                            </Text>
                            <TouchableOpacity
                              style={styles.orderDeadlineClearBtn}
                              activeOpacity={0.7}
                              onPress={handleClearDeadline}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Text style={styles.orderDeadlineClearBtnText}>✕ 移除</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <Text style={styles.orderDeadlineSettingSubtitle} maxFontSizeMultiplier={1.05}>
                            設定後將自動倒數並於逾期時停止加單
                          </Text>
                        )}
                      </View>

                      <View style={styles.orderDeadlineQuickRow}>
                        <TouchableOpacity
                          style={styles.orderDeadlineQuickChip}
                          activeOpacity={0.75}
                          onPress={() => handleSetQuickDeadlineMinutes(30)}
                        >
                          <Text style={styles.orderDeadlineQuickChipText}>+30 分鐘</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.orderDeadlineQuickChip}
                          activeOpacity={0.75}
                          onPress={() => handleSetQuickDeadlineMinutes(60)}
                        >
                          <Text style={styles.orderDeadlineQuickChipText}>+1 小時</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.orderDeadlineQuickChip}
                          activeOpacity={0.75}
                          onPress={() => handleSetFixedDeadline('12:00')}
                        >
                          <Text style={styles.orderDeadlineQuickChipText}>12:00</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.orderDeadlineQuickChip}
                          activeOpacity={0.75}
                          onPress={() => handleSetFixedDeadline('18:00')}
                        >
                          <Text style={styles.orderDeadlineQuickChipText}>18:00</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>

                {/* 🏠 家中缺貨隨手記挑選匯入提示卡 (僅在發起賣場採買或網購湊單時自動感應現身) */}
                {(pendingRestockForCurrentMemo.length > 0 || importedRestockItems.length > 0 || importedRestockMemoIds.length > 0) && (
                  <View style={styles.restockImportCard}>
                    {pendingRestockForCurrentMemo.length > 0 ? (
                      <>
                        <View style={styles.restockImportHeader}>
                          <Text style={styles.restockImportTitle} maxFontSizeMultiplier={1.08}>
                            🏠 發現家中缺貨隨手記共 {pendingRestockForCurrentMemo.length} 項
                          </Text>
                          <TouchableOpacity
                            style={styles.restockImportBtn}
                            activeOpacity={0.75}
                            onPress={() => setIsRestockPickerVisible(true)}
                          >
                            <Text style={styles.restockImportBtnText} maxFontSizeMultiplier={1.08}>
                              📥 挑選匯入推車
                            </Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.restockImportPreview} maxFontSizeMultiplier={1.08} numberOfLines={2}>
                          待補項目：{pendingRestockForCurrentMemo.map(r => r.itemName).join('、')}
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.restockImportDoneText} maxFontSizeMultiplier={1.08}>
                        ✅ 已挑選並匯入缺貨品項（儲存後將自動將匯入項目標記已買）
                      </Text>
                    )}
                  </View>
                )}

                {/* 💡 智慧即時日期辨識膠囊 (感知記事文字自動帶入) */}
                {detectedMemoDate && (
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

                {/* ⏰ 待辦提醒日期與週期設定 (選填) */}
                <View style={styles.sectionLabelRow}>
                  <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>⏰ 待辦提醒日期 (選填)</Text>
                  {!!memoReminderDate && !detectedMemoDate && (
                    <TouchableOpacity
                      onPress={() => {
                        setMemoReminderDate('');
                        setMemoReminderRepeat('once');
                        userManuallySetReminderRef.current = true;
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
                      userManuallySetReminderRef.current = true;
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dateChipText, !memoReminderDate && styles.dateChipTextActive]} maxFontSizeMultiplier={1.15}>
                      不設提醒
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.dateChip, memoReminderDate === todayYmd && styles.dateChipActive]}
                    onPress={() => {
                      setMemoReminderDate(todayYmd);
                      setMemoReminderCalendar('solar');
                      baseReminderDateRef.current = todayYmd;
                      baseReminderCalendarRef.current = 'solar';
                      if (memoReminderRepeat === 'lunar_1_15' || memoReminderRepeat === 'lunar_2_16') {
                        setMemoReminderRepeat('once');
                      }
                      userManuallySetReminderRef.current = true;
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dateChipText, memoReminderDate === todayYmd && styles.dateChipTextActive]} maxFontSizeMultiplier={1.15}>
                      今天 ({today.getMonth() + 1}/{today.getDate()})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.dateChip, memoReminderDate === tomorrowYmd && styles.dateChipActive]}
                    onPress={() => {
                      setMemoReminderDate(tomorrowYmd);
                      setMemoReminderCalendar('solar');
                      baseReminderDateRef.current = tomorrowYmd;
                      baseReminderCalendarRef.current = 'solar';
                      if (memoReminderRepeat === 'lunar_1_15' || memoReminderRepeat === 'lunar_2_16') {
                        setMemoReminderRepeat('once');
                      }
                      userManuallySetReminderRef.current = true;
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dateChipText, memoReminderDate === tomorrowYmd && styles.dateChipTextActive]} maxFontSizeMultiplier={1.15}>
                      明天 ({tomorrow.getMonth() + 1}/{tomorrow.getDate()})
                    </Text>
                  </TouchableOpacity>

                  {isCustomReminder && (
                    <TouchableOpacity
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

                  <TouchableOpacity
                    style={[
                      styles.dateMoreBtn,
                      isCustomReminder && (memoReminderCalendar === 'lunar' ? styles.lunarMoreBtnSelected : styles.dateMoreBtnSelected),
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
                        isCustomReminder && (memoReminderCalendar === 'lunar' ? styles.lunarMoreBtnTextSelected : styles.dateMoreBtnTextSelected),
                      ]}
                      maxFontSizeMultiplier={1.15}
                    >
                      {isCustomReminder ? '✏️ 改選' : '🗓️ 更多...'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* 🔄 提醒頻率與週期 (僅在設定提醒日期時展開，未設提醒高度為 0) */}
                {!!memoReminderDate && (
                  <View style={styles.memoRepeatCard}>
                    <View style={styles.memoRepeatHeaderRow}>
                      <Text style={styles.memoRepeatTitle} maxFontSizeMultiplier={1.08}>
                        🔄 提醒頻率與週期
                      </Text>
                      {memoReminderRepeat !== 'lunar_1_15' &&
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
                                🗓️ 國曆
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
                                🏮 農曆
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
                            style={[
                              styles.memoRepeatChip,
                              opt.lunarOnly && styles.memoRepeatChipLunar,
                              isRepSelected && (opt.lunarOnly ? styles.memoRepeatChipLunarActive : styles.memoRepeatChipActive),
                            ]}
                            onPress={() => {
                              if (opt.value === 'lunar_1_15' || opt.value === 'lunar_2_16') {
                                // 🏮 若從一般週期進入初一十五，先記憶當前使用者的基準日期與曆法
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
                                  // 🎯 從初一十五改選常規週期時，智慧還原為先前的基準日期（例如今天）與國曆
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
                      style={[
                        styles.memoTargetBtn,
                        memoReminderTarget === 'family' && styles.memoTargetBtnActiveFamily,
                      ]}
                      onPress={() => {
                        if (memoIsPinned && memoReminderTarget !== 'family') {
                          const quota = checkMemoPinQuota(transactions, {
                            targetScope: 'family',
                            memberId: effectivePaidBy || currentUser?.id,
                          });
                          if (!quota.canPin) {
                            Alert.alert('全家置頂已達上限', `${quota.errorMessage}\n切換為全家共享後已自動取消置頂。`);
                            setMemoIsPinned(false);
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
                      style={[
                        styles.memoTargetBtn,
                        memoReminderTarget === 'personal' && styles.memoTargetBtnActivePersonal,
                      ]}
                      onPress={() => {
                        if (memoIsPinned && memoReminderTarget !== 'personal') {
                          const quota = checkMemoPinQuota(transactions, {
                            targetScope: 'personal',
                            memberId: effectivePaidBy || currentUser?.id,
                          });
                          if (!quota.canPin) {
                            Alert.alert('個人置頂已達上限', `${quota.errorMessage}\n切換為個人專屬後已自動取消置頂。`);
                            setMemoIsPinned(false);
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
                    ? (memoReminderDate ? '負責成員' : '專屬成員')
                    : '記錄成員'}
                </Text>
                <View style={styles.payerRow}>
                  {members.map(member => {
                    const isSelected = effectivePaidBy === member.id;
                    const isMe = member.id === currentUser.id || (!!currentUser.display_name && currentUser.display_name === member.display_name);
                    return (
                      <TouchableOpacity
                        key={member.id}
                        style={[styles.payerChip, isSelected && styles.payerChipActive]}
                        onPress={() => handleSelectPayer(member.id)}
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
                {/* 轉給家人 / 撥零用錢模式切換與說明橫幅 */}
                {((mode === 'transfer' && transferTargetType === 'member') || (mode as string) === 'allowance') && (
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

            {/* 金額輸入框 + 點數折抵整合 (極致瘦身卡片) */}
            <View style={styles.amountCardIntegrated}>
              <View style={styles.amountInputGroup}>
                <Text style={styles.currencyPrefixIntegrated} maxFontSizeMultiplier={1.15}>NT$</Text>
                <TextInput
                  style={styles.amountInputIntegrated}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#9CA3AF"
                  value={amount}
                  onChangeText={setAmount}
                  autoFocus={false}
                  maxFontSizeMultiplier={1.15}
                  underlineColorAndroid="transparent"
                />
              </View>

              {mode === 'expense' && (
                <TouchableOpacity
                  style={[
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
                      : '🎁 點數折抵'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* 快捷金額累加膠囊標籤 (左側 4 大面額、右側常駐清除) */}
            <View style={styles.quickAmountRowIntegrated}>
              <View style={styles.quickAmountGroupLeft}>
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
              </View>
              <TouchableOpacity
                style={[
                  styles.quickAmountClearBtnRight,
                  (!amount || amount === '0') && styles.quickAmountClearBtnDisabled,
                ]}
                onPress={() => setAmount('')}
                activeOpacity={amount && amount !== '0' ? 0.7 : 1}
              >
                <Text
                  style={[
                    styles.quickAmountClearTextRight,
                    (!amount || amount === '0') && styles.quickAmountClearTextDisabled,
                  ]}
                  maxFontSizeMultiplier={1.08}
                >
                  清除
                </Text>
              </TouchableOpacity>
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

            {/* 模式切換：轉帳模式 (轉給家人 vs 帳戶互轉) VS 一般收支表單 */}
            {(mode === 'transfer' || (mode as string) === 'allowance') ? (
              (transferTargetType === 'member' || (mode as string) === 'allowance') ? (
              <>
                {/* 出資家長選擇 */}
                <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>出資家長 (付款支出方)</Text>
                <View style={styles.payerRow}>
                  {members.map(member => {
                    const isSelected = effectiveAllowancePayer === member.id;
                    const isMe = member.id === currentUser.id || (!!currentUser.display_name && currentUser.display_name === member.display_name);
                    return (
                      <TouchableOpacity
                        key={member.id}
                        style={[styles.payerChip, isSelected && styles.payerChipActive]}
                        onPress={() => {
                          setHasUserManuallySelectedPayer(true);
                          setAllowancePayerId(member.id);
                          setPaidBy(member.id);
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
                  {members.filter(m => m.id !== effectiveAllowancePayer).map(member => {
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
                    multiline={true}
                    textAlignVertical="top"
                    onFocus={() => scrollToInput(allowanceNoteSectionY, 300)}
                    maxFontSizeMultiplier={1.15}
                  />
                </View>
              </>
            ) : (
              <>
                {/* 轉出帳戶 (扣款來源) */}
                <View style={styles.sectionLabelRow}>
                  <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>轉出帳戶 (扣款來源)</Text>
                </View>
                <HorizontalScrollView showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardScroll}>
                  {paymentAccounts.filter(a => a.type === 'bank' || a.type === 'cash' || a.type === 'stored_value').map(account => {
                    const isSelected = transferFromAccountId === account.id;
                    const icon = account.type === 'bank' ? '🏦' : account.type === 'cash' ? '💵' : (account.icon || '🚌');
                    return (
                      <TouchableOpacity
                        key={account.id}
                        style={[
                          styles.cardChip,
                          isSelected && { borderColor: '#0284C7', backgroundColor: isDark ? 'rgba(2, 132, 199, 0.25)' : '#F0F9FF' },
                        ]}
                        onPress={() => {
                          setTransferFromAccountId(account.id);
                          if (transferToAccountId === account.id) {
                            const other = paymentAccounts.find(a => a.id !== account.id);
                            if (other) setTransferToAccountId(other.id);
                          }
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.cardChipIcon}>{icon}</Text>
                        <View>
                          <Text
                            style={[styles.cardChipName, isSelected && { color: '#0284C7', fontWeight: '700' }]}
                            maxFontSizeMultiplier={1.15}
                          >
                            {account.name}
                          </Text>
                          <Text style={styles.cardChipSub} maxFontSizeMultiplier={1.15}>
                            餘額: NT$ {Number(account.balance || 0).toLocaleString()}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </HorizontalScrollView>

                {/* 轉入目標 */}
                <View style={[styles.sectionLabelRow, { marginTop: 12 }]}>
                  <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>轉入目標 (資金去向 / 繳卡費)</Text>
                </View>
                <HorizontalScrollView showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardScroll}>
                  {paymentAccounts.filter(a => a.id !== transferFromAccountId).map(account => {
                    const isSelected = transferToAccountId === account.id;
                    const isCard = account.type === 'credit_card';
                    const icon = account.type === 'bank' ? '🏦' : account.type === 'cash' ? '💵' : isCard ? '💳' : (account.icon || '🚌');
                    return (
                      <TouchableOpacity
                        key={account.id}
                        style={[
                          styles.cardChip,
                          isSelected && { borderColor: '#10B981', backgroundColor: isDark ? 'rgba(16, 185, 129, 0.25)' : '#ECFDF5' },
                        ]}
                        onPress={() => setTransferToAccountId(account.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.cardChipIcon}>{icon}</Text>
                        <View>
                          <Text
                            style={[styles.cardChipName, isSelected && { color: '#059669', fontWeight: '700' }]}
                            maxFontSizeMultiplier={1.15}
                          >
                            {account.name}{isCard ? ' (繳卡費)' : ''}
                          </Text>
                          <Text style={styles.cardChipSub} maxFontSizeMultiplier={1.15}>
                            {isCard ? '折抵未核銷卡債' : `餘額: NT$ ${Number(account.balance || 0).toLocaleString()}`}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </HorizontalScrollView>

                {/* 跨行手續費 (選填) */}
                <View style={[styles.sectionLabelRow, { marginTop: 12 }]}>
                  <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>跨行手續費 (選填 · 自動獨立記為雜支)</Text>
                </View>
                <View style={styles.feeChipsRow}>
                  {[
                    { label: '免手續費 ($0)', fee: '0' },
                    { label: '跨行轉帳 ($15)', fee: '15' },
                    { label: '跨行提款 ($5)', fee: '5' },
                    { label: '郵局跨行 ($10)', fee: '10' },
                  ].map(opt => {
                    const isFeeActive = transferFee === opt.fee;
                    return (
                      <TouchableOpacity
                        key={opt.fee}
                        style={[styles.feeChip, isFeeActive && styles.feeChipActive]}
                        onPress={() => setTransferFee(opt.fee)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.feeChipText, isFeeActive && styles.feeChipTextActive]} maxFontSizeMultiplier={1.08}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* 轉帳日期 */}
                <View style={[styles.sectionLabelRow, { marginTop: 8 }]}>
                  <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>轉帳日期</Text>
                </View>
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

                {/* 經手成員 */}
                <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>經手成員</Text>
                <View style={styles.payerRow}>
                  {members.map(member => {
                    const isSelected = effectivePaidBy === member.id;
                    const isMe = member.id === currentUser.id || (!!currentUser.display_name && currentUser.display_name === member.display_name);
                    return (
                      <TouchableOpacity
                        key={member.id}
                        style={[styles.payerChip, isSelected && styles.payerChipActive]}
                        onPress={() => handleSelectPayer(member.id)}
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

                {/* 轉帳備註 / 事由 */}
                <View style={styles.sectionLabelRow}>
                  <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>轉帳事由與備註 (選填)</Text>
                </View>
                <View style={styles.quickNoteRow}>
                  {['提款放皮夾', '繳納信用卡費', '銀行定存互轉', '儲值悠遊卡/一卡通', '生活備用金'].map(tag => (
                    <TouchableOpacity
                      key={tag}
                      style={styles.quickNoteChip}
                      onPress={() => setNote(tag)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.quickNoteChipText} maxFontSizeMultiplier={1.08}>{tag}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.noteInput}
                  placeholder="例如：ATM 提款放皮夾、線上繳富邦卡費..."
                  placeholderTextColor="#9CA3AF"
                  value={note}
                  onChangeText={setNote}
                  multiline={true}
                  textAlignVertical="top"
                  maxFontSizeMultiplier={1.15}
                />
              </>
            )) : (
              <>
                {/* 分類選擇 (常用 2 行 8 格精選 ＋ 更多抽屜) */}
                <View style={styles.sectionLabelRow}>
                  <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>選擇分類</Text>
                  {availableCategories.length > 8 && (
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
                  {availableCategories.length > 8 && (
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
                    <Text style={styles.payerMethodLabel} maxFontSizeMultiplier={1.12}>付款成員</Text>
                    <HorizontalScrollView
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.payerMethodChipsScroll}
                      keyboardShouldPersistTaps="handled"
                    >
                      {members.map(member => {
                        const isSelected = effectivePaidBy === member.id;
                        const isMe = member.id === currentUser.id || (!!currentUser.display_name && currentUser.display_name === member.display_name);
                        return (
                          <TouchableOpacity
                            key={member.id}
                            style={[styles.payerChipCompact, isSelected && styles.payerChipCompactActive]}
                            onPress={() => handleSelectPayer(member.id)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.payerAvatarCompact}>{member.avatar_url}</Text>
                            <Text
                              style={[styles.payerNameCompact, isSelected && styles.payerNameCompactActive]}
                              maxFontSizeMultiplier={1.12}
                            >
                              {member.display_name}{isMe ? ' (我)' : ''}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </HorizontalScrollView>
                  </View>

                  <View style={styles.payerMethodDivider} />

                  {/* 第二行：付款方式 */}
                  <View style={styles.payerMethodRow}>
                    <Text style={styles.payerMethodLabel} maxFontSizeMultiplier={1.12}>付款方式</Text>
                    <HorizontalScrollView
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.payerMethodChipsScroll}
                      keyboardShouldPersistTaps="handled"
                    >
                      {activePaymentMethods.map((opt) => {
                        const isSelected = paymentMethod === opt.id;
                        return (
                          <TouchableOpacity
                            key={opt.id}
                            style={[
                              styles.methodChipCompact,
                              isSelected && { borderColor: opt.color || '#4F46E5', backgroundColor: `${opt.color || '#4F46E5'}18` },
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
                </View>

                {/* 記帳日期快速選擇 (緊湊單行) */}
                <View style={styles.dateInlineContainer}>
                  <Text style={styles.dateInlineLabel} maxFontSizeMultiplier={1.12}>日期：</Text>
                  <HorizontalScrollView
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.dateInlineScroll}
                    keyboardShouldPersistTaps="handled"
                  >
                    <TouchableOpacity
                      style={[styles.dateChip, isToday && styles.dateChipActive]}
                      onPress={() => setSelectedDate(today)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[styles.dateChipText, isToday && styles.dateChipTextActive]}
                        maxFontSizeMultiplier={1.12}
                      >
                        今天 ({today.getMonth() + 1}/{today.getDate()})
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.dateChip, isYesterday && styles.dateChipActive]}
                      onPress={() => setSelectedDate(yesterday)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[styles.dateChipText, isYesterday && styles.dateChipTextActive]}
                        maxFontSizeMultiplier={1.12}
                      >
                        昨天 ({yesterday.getMonth() + 1}/{yesterday.getDate()})
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
                          maxFontSizeMultiplier={1.12}
                        >
                          🗓️ {selectedDate.getMonth() + 1}/{selectedDate.getDate()}
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

                {/* 🏪 店家與備註 (整合常駐操作列 · 極致瘦身) */}
                <View
                  onLayout={(e) => setMerchantSectionY(e.nativeEvent.layout.y)}
                  style={styles.storeNoteCard}
                >
                  <View style={styles.storeNoteCardHeader}>
                    <Text style={styles.storeNoteCardTitle} maxFontSizeMultiplier={1.12}>
                      🏪 店家與備註
                    </Text>
                    {/* 📷 拍照附收據移至標題列右上角 */}
                    <TouchableOpacity
                      style={[
                        styles.headerReceiptBtn,
                        !!receiptPhotoUri && styles.headerReceiptBtnActive,
                      ]}
                      onPress={handlePromptReceiptPhotoSource}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.headerReceiptBtnIcon}>📸</Text>
                      <Text
                        style={[
                          styles.headerReceiptBtnText,
                          !!receiptPhotoUri && styles.headerReceiptBtnTextActive,
                        ]}
                        maxFontSizeMultiplier={1.08}
                      >
                        {receiptPhotoUri ? '收據已附 ▾' : '拍照收據'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* 左右並排輸入列 */}
                  <View style={styles.storeNoteInputsRow}>
                    {/* 左側：店家輸入框 */}
                    <View style={styles.storeInputCol}>
                      <View style={styles.storeInputInner}>
                        <Text style={styles.storeInputIcon}>🏪</Text>
                        <TextInput
                          style={styles.storeTextInput}
                          placeholder="例如：麥當勞"
                          placeholderTextColor="#9CA3AF"
                          value={merchant}
                          onChangeText={setMerchant}
                          onFocus={() => scrollToInput(merchantSectionY, 350)}
                          returnKeyType="next"
                          maxFontSizeMultiplier={1.12}
                        />
                        {!!merchant && (
                          <TouchableOpacity
                            onPress={() => setMerchant('')}
                            style={styles.storeClearBtn}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <Text style={styles.storeClearBtnText}>✕</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>

                    {/* 右側：備註輸入框 */}
                    <View style={styles.noteInputCol}>
                      <View style={styles.noteInputInner}>
                        <TextInput
                          style={styles.noteTextInput}
                          placeholder="例如：好市多牛肉、加滿油、午餐雙人餐..."
                          placeholderTextColor="#9CA3AF"
                          value={note}
                          onChangeText={setNote}
                          onFocus={() => scrollToInput(noteSectionY, 400)}
                          maxFontSizeMultiplier={1.12}
                        />
                        {!!note && (
                          <TouchableOpacity
                            onPress={() => setNote('')}
                            style={styles.storeClearBtn}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <Text style={styles.storeClearBtnText}>✕</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>

                  {/* 完整一行：常用店家快選滑動列 (常駐開放，一戳秒選秒帶入) */}
                  {suggestedMerchants.length > 0 && (
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
                                {item}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </HorizontalScrollView>
                    </View>
                  )}

                  {/* 緊湊發票操作列 (移除無意義貼上，單行俐落呈現) */}
                  {mode === 'expense' && (
                    <View style={styles.storeNoteToolbarRow}>
                      <TouchableOpacity
                        style={[
                          styles.attachmentToolbarBtn,
                          (isInvoiceExpanded || !!invoiceNumber) && styles.attachmentToolbarBtnActive,
                        ]}
                        onPress={() => setIsInvoiceExpanded(prev => !prev)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.attachmentToolbarBtnIcon}>🧾</Text>
                        <Text
                          style={[
                            styles.attachmentToolbarBtnText,
                            (isInvoiceExpanded || !!invoiceNumber) && styles.attachmentToolbarBtnTextActive,
                          ]}
                          maxFontSizeMultiplier={1.08}
                        >
                          {invoiceNumber ? `發票 ${invoiceNumber}` : '＋發票字軌'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.attachmentToolbarBtn}
                        onPress={() => setScannerModalVisible(true)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.attachmentToolbarBtnIcon}>📷</Text>
                        <Text style={styles.attachmentToolbarBtnText} maxFontSizeMultiplier={1.08}>掃描發票</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {/* 📷 支出照片縮圖預覽列 (有照片才顯示，支援點擊放大與移除) */}
                {!!receiptPhotoUri && (
                  <View style={styles.memoPhotoPreviewBar}>
                    <TouchableOpacity
                      onPress={() => setViewingPhotoModal(true)}
                      activeOpacity={0.8}
                      style={styles.memoPhotoThumbnailTouchable}
                    >
                      <Image source={{ uri: receiptPhotoUri }} style={styles.memoPhotoThumbnailImg} />
                      <Text style={styles.memoPhotoHintText} maxFontSizeMultiplier={1.05}>
                        📷 收據已附加 (點擊放大檢視)
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.memoPhotoDeleteBtn}
                      onPress={() => {
                        setReceiptPhotoUri('');
                        setReceiptPhotoBase64('');
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.memoPhotoDeleteBtnText} maxFontSizeMultiplier={1.05}>✕ 移除</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* 🧾 展開之統一發票輸入與即時對獎區 (僅在支出模式且展開/有號碼時顯示) */}
                {mode === 'expense' && (isInvoiceExpanded || !!invoiceNumber) && (
                  <View onLayout={(e) => setInvoiceSectionY(e.nativeEvent.layout.y)} style={styles.invoiceInputContainer}>
                    <View style={styles.sectionLabelRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>🧾 統一發票字軌與對獎</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          if (invoiceNumber) {
                            setInvoiceNumber('');
                            setInvoiceRandomCode('');
                            setInvoiceSellerTaxId('');
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
                    </View>

                    <View style={styles.invoiceInputRow}>
                      <TextInput
                        style={[styles.invoiceNumberInput, !!invoicePreview?.winning.isWon && styles.invoiceInputWon]}
                        placeholder="例如：AB-12345678"
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
                )}
              </>
            )}
          </>
        )}

        {/* 儲存 / 一鍵撥款 / 轉帳 / 儲存記事按鈕 */}
        <TouchableOpacity
          style={[
            styles.submitBtn,
            mode === 'transfer' && (transferTargetType === 'member' ? styles.submitBtnAllowance : styles.submitBtnTransfer),
            (mode as string) === 'allowance' && styles.submitBtnAllowance,
            mode === 'memo' && styles.submitBtnMemo,
            (isSubmitting || isUploadingPhoto) && { opacity: 0.6 },
          ]}
          disabled={isSubmitting || isUploadingPhoto}
          onPress={handleSubmit}
        >
          <Text style={styles.submitBtnText} maxFontSizeMultiplier={1.15}>
            {isSubmitting || isUploadingPhoto
              ? (isUploadingPhoto ? '⏳ 上傳收據中...' : '⏳ 儲存中...')
              : mode === 'transfer'
              ? (transferTargetType === 'member' ? '🎁 確認轉發零用錢給家人' : '⇄ 確認轉帳 / 調撥 / 繳款')
              : (mode as string) === 'allowance'
              ? '🎁 確認轉發零用錢給家人'
              : mode === 'memo'
              ? '📌 儲存生活記事'
              : mode === 'expense' && parsedDiscountAmount > 0
              ? `儲存記帳 (實付 NT$ ${previewActualAmount.toLocaleString()} · 已折 $${parsedDiscountAmount.toLocaleString()})`
              : '儲存記帳'}
          </Text>
        </TouchableOpacity>
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
    title={mode === 'memo' ? '記事照片備忘 (菜單/聯絡簿/型號)' : '消費收據 / 保固憑證'}
    onDelete={() => {
      setReceiptPhotoUri('');
      setReceiptPhotoBase64('');
    }}
  />

  <RestockPickerModal
    visible={isRestockPickerVisible}
    pendingItems={pendingRestockForCurrentMemo}
    onClose={() => setIsRestockPickerVisible(false)}
    onConfirm={(selected) => {
      const res = mergeRestockItemsIntoNote(note, selected);
      if (res.addedCount > 0) {
        setNote(res.updatedNote);
        setImportedRestockItems(prev => [...prev, ...selected]);
        setImportedRestockMemoIds(prev => Array.from(new Set([...prev, ...res.affectedMemoIds])));
      }
    }}
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
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    maxHeight: Math.min(SCREEN_HEIGHT * 0.9, 740),
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    borderTopWidth: isDark ? 1 : 0,
    borderTopColor: isDark ? colors.border.default : 'transparent',
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
    color: colors.text.primary,
  },
  closeBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  closeText: {
    fontSize: 16,
    color: colors.text.muted,
    fontWeight: 'bold',
  },
  typeSelector: {
    flexDirection: 'row',
    backgroundColor: isDark ? colors.background.cardSubtle : '#F3F4F6',
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
  typeBtnActiveTransfer: {
    backgroundColor: '#0284C7',
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
    color: isDark ? colors.text.secondary : '#6B7280',
  },
  typeBtnTextActive: {
    color: '#FFFFFF',
  },
  typeBtnTextActiveTransfer: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  typeBtnTextActiveAllowance: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  typeBtnTextActiveMemo: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  transferTargetTypeContainer: {
    flexDirection: 'row',
    backgroundColor: isDark ? colors.background.cardSubtle : '#F1F5F9',
    borderRadius: 12,
    padding: 3,
    marginBottom: 12,
    gap: 4,
    width: '100%',
  },
  transferTargetTypeBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transferTargetTypeBtnActive: {
    backgroundColor: isDark ? '#0284C7' : '#0284C7',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  transferTargetTypeBtnActiveAllowance: {
    backgroundColor: isDark ? '#8B5CF6' : '#8B5CF6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  transferTargetTypeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: isDark ? colors.text.secondary : '#64748B',
  },
  transferTargetTypeBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1.5,
    borderColor: isDark ? colors.border.default : '#E5E7EB',
    paddingVertical: 4,
    marginBottom: 12,
    width: '100%',
    minWidth: 0,
    minHeight: 48,
  },
  currencyPrefix: {
    fontSize: 18,
    fontWeight: '700',
    color: isDark ? colors.text.secondary : '#374151',
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    minWidth: 0,
    width: '100%',
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.primary,
    padding: 0,
    paddingVertical: 0,
    height: 42,
    textAlignVertical: 'center',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: isDark ? colors.text.secondary : '#4B5563',
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
    backgroundColor: isDark ? colors.background.cardSubtle : '#F9FAFB',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E5E7EB',
    maxWidth: '100%',
  },
  categoryChipIcon: {
    fontSize: 13,
    marginRight: 4,
  },
  categoryChipText: {
    fontSize: 12,
    color: isDark ? colors.text.primary : '#374151',
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
    backgroundColor: isDark ? colors.background.cardSubtle : '#F3F4F6',
    borderWidth: 1,
    borderColor: 'transparent',
    maxWidth: '100%',
  },
  payerChipActive: {
    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.25)' : '#EEF2FF',
    borderColor: isDark ? '#818CF8' : '#6366F1',
  },
  payerAvatar: {
    fontSize: 14,
    marginRight: 4,
  },
  payerName: {
    fontSize: 12,
    color: isDark ? colors.text.secondary : '#4B5563',
    fontWeight: '500',
  },
  payerNameActive: {
    color: isDark ? '#A5B4FC' : '#4F46E5',
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
    backgroundColor: isDark ? colors.background.cardSubtle : '#F3F4F6',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E5E7EB',
  },
  dateChipActive: {
    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.25)' : '#EEF2FF',
    borderColor: isDark ? '#818CF8' : '#6366F1',
  },
  dateChipCustom: {
    backgroundColor: isDark ? 'rgba(249, 115, 22, 0.2)' : '#FFF7ED',
    borderColor: '#F97316',
  },
  dateChipText: {
    fontSize: 12,
    color: isDark ? colors.text.secondary : '#4B5563',
    fontWeight: '500',
  },
  dateChipTextActive: {
    color: isDark ? '#A5B4FC' : '#4F46E5',
    fontWeight: '700',
  },
  dateMoreBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: isDark ? colors.background.cardSubtle : '#F0F9FF',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#BAE6FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateMoreBtnSelected: {
    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.25)' : '#EEF2FF',
    borderColor: isDark ? '#818CF8' : '#6366F1',
  },
  dateMoreBtnText: {
    fontSize: 12,
    color: isDark ? '#7DD3FC' : '#0284C7',
    fontWeight: '700',
  },
  dateMoreBtnTextSelected: {
    color: isDark ? '#A5B4FC' : '#4F46E5',
    fontWeight: '700',
  },
  clearMerchantText: {
    fontSize: 12,
    color: isDark ? '#A5B4FC' : '#6366F1',
    fontWeight: '500',
  },
  dismissKeyboardText: {
    fontSize: 12,
    color: isDark ? '#A5B4FC' : '#4F46E5',
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
    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.25)' : '#EEF2FF',
    borderColor: isDark ? '#818CF8' : '#6366F1',
  },
  merchantChipText: {
    fontSize: 12,
    color: isDark ? colors.text.secondary : '#4B5563',
    fontWeight: '500',
  },
  merchantChipTextActive: {
    color: isDark ? '#A5B4FC' : '#4F46E5',
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
    backgroundColor: isDark ? colors.background.cardSubtle : '#F3F4F6',
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: isDark ? colors.border.default : '#E5E7EB',
  },
  manageMethodsSmallBtnText: {
    fontSize: 11,
    color: isDark ? colors.text.secondary : '#4B5563',
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
    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.25)' : '#EEF2FF',
    borderColor: isDark ? '#818CF8' : '#4F46E5',
  },
  methodChipIcon: {
    fontSize: 13,
  },
  methodChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: isDark ? colors.text.secondary : '#4B5563',
  },
  methodChipTextActive: {
    color: isDark ? '#A5B4FC' : '#4F46E5',
    fontWeight: '700',
  },
  subCardContainer: {
    backgroundColor: isDark ? colors.background.input : '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E2E8F0',
  },
  subCardLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: isDark ? colors.text.muted : '#64748B',
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
  allowanceModeSelector: {
    flexDirection: 'row',
    backgroundColor: isDark ? colors.background.cardSubtle : '#F1F5F9',
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
    backgroundColor: isDark ? colors.background.card : '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  allowanceModeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: isDark ? colors.text.secondary : '#64748B',
  },
  allowanceModeBtnTextActive: {
    color: isDark ? '#C4B5FD' : '#6D28D9',
    fontWeight: '700',
  },
  allowanceBanner: {
    flexDirection: 'row',
    backgroundColor: isDark ? 'rgba(109, 40, 217, 0.18)' : '#F5F3FF',
    borderColor: isDark ? 'rgba(109, 40, 217, 0.4)' : '#DDD6FE',
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
    color: isDark ? '#DDD6FE' : '#6D28D9',
    marginBottom: 2,
  },
  allowanceBannerDesc: {
    fontSize: 12,
    color: isDark ? '#C4B5FD' : '#5B21B6',
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
    backgroundColor: isDark ? colors.background.cardSubtle : '#F3F4F6',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E5E7EB',
  },
  quickAmountChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: isDark ? colors.text.secondary : '#4B5563',
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
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.25)' : '#ECFDF5',
  },
  recipientNameActive: {
    color: isDark ? '#6EE7B7' : '#065F46',
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
    backgroundColor: isDark ? colors.background.input : '#F9FAFB',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#F3F4F6',
  },
  allowanceCatBox: {
    flex: 1,
    backgroundColor: isDark ? colors.background.card : '#FFFFFF',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E5E7EB',
  },
  allowanceCatBoxIncome: {
    borderColor: isDark ? 'rgba(16, 185, 129, 0.5)' : '#A7F3D0',
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#F0FDF4',
  },
  allowanceCatBoxTitle: {
    fontSize: 11,
    color: isDark ? colors.text.muted : '#6B7280',
    fontWeight: '600',
    marginBottom: 3,
  },
  allowanceCatBoxVal: {
    fontSize: 13,
    color: isDark ? colors.text.primary : '#1F2937',
    fontWeight: '700',
  },
  allowanceCatArrow: {
    fontSize: 16,
    color: isDark ? colors.text.muted : '#9CA3AF',
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
    backgroundColor: isDark ? colors.background.cardSubtle : '#F3F4F6',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E5E7EB',
  },
  quickNoteChipActive: {
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.25)' : '#FEF3C7',
    borderColor: '#F59E0B',
  },
  quickNoteChipText: {
    fontSize: 11,
    color: isDark ? colors.text.secondary : '#4B5563',
  },
  quickNoteChipTextActive: {
    color: isDark ? '#FCD34D' : '#92400E',
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
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FFFBEB',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(245, 158, 11, 0.35)' : '#FDE68A',
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
    color: isDark ? '#FCD34D' : '#92400E',
    marginBottom: 2,
  },
  memoBannerDesc: {
    fontSize: 11,
    color: isDark ? '#FDE68A' : '#B45309',
    lineHeight: 15,
  },
  insertCheckboxBtn: {
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.25)' : '#FEF3C7',
    borderWidth: 1,
    borderColor: isDark ? '#B45309' : '#FDE68A',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  insertCheckboxBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: isDark ? '#FCD34D' : '#D97706',
  },
  templateSection: {
    marginBottom: 10,
  },
  templateSectionLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: isDark ? '#FCD34D' : '#92400E',
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
    backgroundColor: isDark ? colors.background.cardSubtle : '#FFFBEB',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#FDE68A',
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
    color: isDark ? '#FCD34D' : '#B45309',
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
    backgroundColor: '#E2E8F0',
  },
  memoPhotoHintText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: isDark ? '#CBD5E1' : '#475569',
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
  memoReminderScrollRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 4,
  },
  linkedMemoBanner: {
    backgroundColor: isDark ? 'rgba(59, 130, 246, 0.18)' : '#EFF6FF',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(59, 130, 246, 0.4)' : '#BFDBFE',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  linkedMemoBannerText: {
    fontSize: 12.5,
    color: isDark ? '#93C5FD' : '#1D4ED8',
    fontWeight: '600',
  },
  lunarMoreBtn: {
    borderColor: isDark ? '#B45309' : '#FDE68A',
    backgroundColor: isDark ? colors.background.cardSubtle : '#FFFBEB',
  },
  lunarMoreBtnSelected: {
    borderColor: '#D97706',
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.25)' : '#FEF3C7',
  },
  lunarMoreBtnText: {
    color: isDark ? '#FCD34D' : '#B45309',
  },
  lunarMoreBtnTextSelected: {
    color: isDark ? '#FBBF24' : '#92400E',
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
  memoRepeatCard: {
    backgroundColor: isDark ? colors.background.input : '#F8FAFC',
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
    color: isDark ? colors.text.primary : '#334155',
  },
  calendarBasisSwitch: {
    flexDirection: 'row',
    backgroundColor: isDark ? colors.background.cardSubtle : '#E2E8F0',
    borderRadius: 8,
    padding: 2,
  },
  calendarBasisBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  calendarBasisBtnActive: {
    backgroundColor: isDark ? colors.background.card : '#FFFFFF',
  },
  calendarBasisBtnLunarActive: {
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.25)' : '#FEF3C7',
  },
  calendarBasisBtnText: {
    fontSize: 11,
    color: isDark ? colors.text.muted : '#64748B',
    fontWeight: '600',
  },
  calendarBasisBtnTextActive: {
    color: isDark ? '#93C5FD' : '#2563EB',
    fontWeight: '700',
  },
  calendarBasisBtnTextLunarActive: {
    color: isDark ? '#FCD34D' : '#B45309',
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
    backgroundColor: isDark ? colors.background.cardSubtle : '#FFFBEB',
    borderColor: isDark ? colors.border.default : '#FDE68A',
  },
  memoRepeatChipActive: {
    backgroundColor: isDark ? 'rgba(59, 130, 246, 0.25)' : '#EFF6FF',
    borderColor: isDark ? '#60A5FA' : '#3B82F6',
  },
  memoRepeatChipLunarActive: {
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.25)' : '#FEF3C7',
    borderColor: '#D97706',
  },
  memoRepeatChipText: {
    fontSize: 12,
    color: isDark ? colors.text.secondary : '#475569',
    fontWeight: '600',
  },
  memoRepeatChipTextLunar: {
    color: isDark ? '#FCD34D' : '#B45309',
  },
  memoRepeatChipTextActive: {
    color: isDark ? '#93C5FD' : '#1D4ED8',
    fontWeight: '700',
  },
  memoRepeatChipTextLunarActive: {
    color: isDark ? '#FCD34D' : '#92400E',
    fontWeight: '800',
  },
  memoReminderPreviewBox: {
    marginTop: 8,
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FFFBEB',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(245, 158, 11, 0.35)' : '#FDE68A',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  memoReminderPreviewPrimary: {
    fontSize: 12,
    fontWeight: '700',
    color: isDark ? '#FCD34D' : '#92400E',
  },
  memoReminderPreviewNext: {
    fontSize: 11,
    color: isDark ? '#FDE68A' : '#B45309',
    marginTop: 3,
    fontWeight: '600',
  },
  memoTargetCard: {
    backgroundColor: isDark ? colors.background.input : '#F8FAFC',
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
    backgroundColor: isDark ? colors.background.cardSubtle : '#EDF2F7',
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
  memoPinContainer: {
    marginTop: 12,
    marginBottom: 6,
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
  discountToggleChip: {
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#ECFDF5',
    borderColor: isDark ? 'rgba(16, 185, 129, 0.4)' : '#6EE7B7',
  },
  discountToggleChipActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  discountToggleChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: isDark ? '#6EE7B7' : '#047857',
  },
  discountToggleChipTextActive: {
    color: '#FFFFFF',
  },
  discountPanelBox: {
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#F0FDF4',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(16, 185, 129, 0.35)' : '#A7F3D0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  discountModeSwitchRow: {
    flexDirection: 'row',
    backgroundColor: isDark ? colors.background.cardSubtle : '#E2E8F0',
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
    backgroundColor: isDark ? colors.background.card : '#FFFFFF',
  },
  discountModeBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: isDark ? colors.text.muted : '#64748B',
  },
  discountModeBtnTextActive: {
    color: isDark ? '#34D399' : '#047857',
    fontWeight: '700',
  },
  discountLabelScroll: {
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 8,
  },
  discountLabelChip: {
    backgroundColor: isDark ? colors.background.card : '#FFFFFF',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#CBD5E1',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  discountLabelChipActive: {
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.25)' : '#DCFCE7',
    borderColor: '#10B981',
  },
  discountLabelChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: isDark ? colors.text.secondary : '#475569',
  },
  discountLabelChipTextActive: {
    color: isDark ? '#6EE7B7' : '#065F46',
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
    color: isDark ? '#6EE7B7' : '#065F46',
    marginBottom: 4,
  },
  discountTextInput: {
    backgroundColor: isDark ? colors.background.input : '#FFFFFF',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#A7F3D0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    color: colors.text.primary,
  },
  discountAmountInput: {
    fontWeight: '700',
    color: isDark ? '#34D399' : '#059669',
  },
  discountPreviewBanner: {
    marginTop: 10,
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#DCFCE7',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  discountPreviewText: {
    fontSize: 11.5,
    color: isDark ? '#A7F3D0' : '#065F46',
    fontWeight: '600',
  },
  discountPreviewHighlight: {
    fontSize: 13,
    fontWeight: '800',
    color: isDark ? '#34D399' : '#047857',
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
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.18)' : '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(16, 185, 129, 0.4)' : '#A7F3D0',
  },
  invoiceScanBtnText: {
    fontSize: 11.5,
    color: isDark ? '#6EE7B7' : '#059669',
    fontWeight: '700',
  },
  invoicePasteBtn: {
    backgroundColor: isDark ? 'rgba(59, 130, 246, 0.18)' : '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(59, 130, 246, 0.4)' : '#BFDBFE',
  },
  invoicePasteBtnText: {
    fontSize: 11.5,
    color: isDark ? '#93C5FD' : '#2563EB',
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
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.25)' : '#FEF3C7',
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
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.25)' : '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  invoiceStatusText: {
    fontSize: 12,
    color: isDark ? colors.text.secondary : '#4B5563',
    fontWeight: '600',
  },
  invoiceStatusTextWon: {
    color: isDark ? '#FCD34D' : '#B45309',
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
    color: isDark ? '#FCD34D' : '#B45309',
  },
  duplicateWarningDesc: {
    fontSize: 11,
    color: isDark ? '#FDE68A' : '#92400E',
    lineHeight: 16,
  },
  submitBtnTransfer: {
    backgroundColor: '#0284C7',
    shadowColor: '#0284C7',
  },
  feeChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  feeChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: isDark ? colors.background.cardSubtle : '#F3F4F6',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E5E7EB',
  },
  feeChipActive: {
    backgroundColor: isDark ? 'rgba(2, 132, 199, 0.25)' : '#E0F2FE',
    borderColor: '#0284C7',
  },
  feeChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: isDark ? colors.text.secondary : '#4B5563',
  },
  feeChipTextActive: {
    color: isDark ? '#7DD3FC' : '#0284C7',
    fontWeight: '700',
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
    backgroundColor: '#E2E8F0',
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
  restockImportCard: {
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(16, 185, 129, 0.35)' : '#A7F3D0',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  restockImportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  restockImportTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: isDark ? '#6EE7B7' : '#065F46',
    flex: 1,
  },
  restockImportBtn: {
    backgroundColor: '#059669',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  restockImportBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  restockImportPreview: {
    fontSize: 11.5,
    color: isDark ? '#A7F3D0' : '#047857',
  },
  restockImportDoneText: {
    fontSize: 12,
    fontWeight: '600',
    color: isDark ? '#6EE7B7' : '#065F46',
  },
  orderDeadlineSettingBox: {
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : '#FEF3C7',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(245, 158, 11, 0.35)' : '#FDE68A',
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
    marginBottom: 6,
  },
  orderDeadlineSettingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  orderDeadlineSettingTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: isDark ? '#FCD34D' : '#92400E',
  },
  orderDeadlineSettingSubtitle: {
    fontSize: 11,
    color: isDark ? '#9CA3AF' : '#6B7280',
  },
  orderDeadlineCurrentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.25)' : '#FDE68A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 6,
  },
  orderDeadlineCurrentBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: isDark ? '#FDE68A' : '#78350F',
  },
  orderDeadlineClearBtn: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  orderDeadlineClearBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: isDark ? '#EF4444' : '#DC2626',
  },
  orderDeadlineQuickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  orderDeadlineQuickChip: {
    backgroundColor: isDark ? '#374151' : '#FFFFFF',
    borderWidth: 1,
    borderColor: isDark ? '#4B5563' : '#D1D5DB',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  orderDeadlineQuickChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: isDark ? '#F3F4F6' : '#374151',
  },
  schoolQuickBuilderBox: {
    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.12)' : '#EEF2FF',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(99, 102, 241, 0.35)' : '#C7D2FE',
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
    marginBottom: 6,
  },
  schoolQuickBuilderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  schoolQuickBuilderTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: isDark ? '#A5B4FC' : '#4338CA',
  },
  schoolQuickBuilderSubtitle: {
    fontSize: 11,
    color: isDark ? '#9CA3AF' : '#6B7280',
  },
  schoolQuickRowLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: isDark ? '#C7D2FE' : '#4F46E5',
    marginBottom: 4,
  },
  schoolQuickChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  schoolSubjectChip: {
    backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
    borderWidth: 1,
    borderColor: isDark ? '#4B5563' : '#D1D5DB',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  schoolSubjectChipActive: {
    backgroundColor: isDark ? '#4F46E5' : '#4F46E5',
    borderColor: isDark ? '#818CF8' : '#4338CA',
  },
  schoolSubjectChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: isDark ? '#E5E7EB' : '#374151',
  },
  schoolSubjectChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  schoolActionChip: {
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.18)' : '#FEF3C7',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(245, 158, 11, 0.45)' : '#FCD34D',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  schoolActionChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: isDark ? '#FDE68A' : '#92400E',
  },
  schoolRoutineChip: {
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(16, 185, 129, 0.4)' : '#6EE7B7',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  schoolRoutineChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: isDark ? '#6EE7B7' : '#065F46',
  },
  quickBuilderToggleBtn: {
    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.16)' : '#EEF2FF',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(99, 102, 241, 0.45)' : '#A5B4FC',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  quickBuilderToggleBtnActive: {
    backgroundColor: isDark ? '#4F46E5' : '#4F46E5',
    borderColor: isDark ? '#818CF8' : '#4338CA',
  },
  quickBuilderToggleBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: isDark ? '#A5B4FC' : '#4338CA',
  },
  quickBuilderToggleBtnTextActive: {
    color: '#FFFFFF',
  },
  schoolQuickCollapseBtn: {
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E0E7FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  schoolQuickCollapseBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: isDark ? '#C7D2FE' : '#4338CA',
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
    backgroundColor: isDark ? '#4F46E5' : '#4F46E5',
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
    backgroundColor: isDark ? '#4F46E5' : '#4F46E5',
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
    justifyContent: 'center',
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#CBD5E1',
    gap: 4,
  },
  attachmentToolbarBtnActive: {
    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF',
    borderColor: isDark ? '#818CF8' : '#6366F1',
  },
  attachmentToolbarBtnCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#CBD5E1',
    gap: 3,
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
    color: isDark ? '#A5B4FC' : '#4338CA',
    fontWeight: '700',
  },
  attachmentToolbarBtnCamera: {
    marginLeft: 'auto',
  },
  attachmentToolbarBtnCameraActive: {
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#ECFDF5',
    borderColor: isDark ? '#10B981' : '#059669',
  },
  attachmentToolbarBtnCameraIcon: {
    fontSize: 13,
  },
  attachmentToolbarBtnTextCameraActive: {
    color: isDark ? '#6EE7B7' : '#059669',
    fontWeight: '700',
  },
  invoiceCloseText: {
    fontSize: 11,
    color: isDark ? '#94A3B8' : '#64748B',
    fontWeight: '600',
  },
  categorySearchContainer: {
    marginBottom: 8,
  },
  categorySearchInput: {
    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.3)' : '#F1F5F9',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 7,
    fontSize: 13,
    color: colors.text.primary,
  },
  categoryDrawerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 24,
  },
  categoryDrawerCardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F8FAFC',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0',
    gap: 6,
  },
  categoryDrawerItemIcon: {
    fontSize: 16,
  },
  categoryDrawerItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: isDark ? colors.text.primary : '#334155',
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
    width: 56,
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
  },
  dateInlineScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
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
  storeNoteInputsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  storeInputCol: {
    flex: 1.15,
  },
  noteInputCol: {
    flex: 1.45,
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
    alignItems: 'center',
    backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
    borderWidth: 1,
    borderColor: isDark ? '#334155' : '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 38,
  },
  noteTextInput: {
    flex: 1,
    fontSize: 12.5,
    color: isDark ? '#F1F5F9' : '#0F172A',
    paddingVertical: 0,
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
    gap: 6,
    flexWrap: 'wrap',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#DCFCE7',
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
  quickAmountRowIntegrated: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  quickAmountGroupLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickAmountClearBtnRight: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(239, 68, 68, 0.35)' : '#FECACA',
  },
  quickAmountClearBtnDisabled: {
    opacity: 0.35,
    backgroundColor: isDark ? 'rgba(51, 65, 85, 0.4)' : '#F1F5F9',
    borderColor: isDark ? 'rgba(71, 85, 105, 0.5)' : '#E2E8F0',
  },
  quickAmountClearTextRight: {
    fontSize: 11.5,
    fontWeight: '600',
    color: isDark ? '#FCA5A5' : '#DC2626',
  },
  quickAmountClearTextDisabled: {
    color: isDark ? '#94A3B8' : '#64748B',
  },
});
