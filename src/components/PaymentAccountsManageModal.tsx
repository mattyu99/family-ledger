import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text as RNText,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput as RNTextInput,
  Dimensions,
  Platform,
  Alert,
  TextProps,
  TextInputProps,
  Keyboard,
  KeyboardAvoidingView,
} from 'react-native';
import { PaymentAccount, AccountType } from '../types/database';
import { useLedger } from '../context/LedgerContext';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { sortAccountsByUser } from '../lib/payment';

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

const COLOR_PALETTE = [
  '#1E40AF', // 富邦藍
  '#047857', // 國泰綠
  '#DC2626', // 台新紅
  '#059669', // 中信綠
  '#0284C7', // 悠遊藍
  '#EC4899', // 甜心粉
  '#8B5CF6', // 紫色
  '#D97706', // 琥珀金
];

interface PaymentAccountsManageModalProps {
  visible: boolean;
  onClose: () => void;
  initialTab?: 'credit_card' | 'stored_value' | 'bank' | 'cash';
  scope?: 'my' | 'all';
}

export const PaymentAccountsManageModal: React.FC<PaymentAccountsManageModalProps> = ({
  visible,
  onClose,
  initialTab,
  scope = 'my',
}) => {
  const { isDark, colors } = useTheme();
  const styles = useMemo(() => getStyles(isDark, colors), [isDark, colors]);
  const { paymentAccounts, addPaymentAccount, updatePaymentAccount, deletePaymentAccount, restoreDefaultAccounts, members, currentUser, isOwner } = useLedger();

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const [activeTab, setActiveTab] = useState<'credit_card' | 'stored_value' | 'bank' | 'cash'>(initialTab || 'credit_card');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [keyboardOffset, setKeyboardOffset] = useState<number>(0);
  const formScrollRef = useRef<ScrollView>(null);

  // 當彈窗關閉時，自動重設為瀏覽清單狀態；開啟且有傳入 initialTab 時自動切換
  useEffect(() => {
    if (!visible) {
      setIsEditing(false);
      setEditingId(null);
    } else if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [visible, initialTab]);

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

  const handleInputFocus = (field: 'name' | 'lastFour' | 'cycleDate' | 'balance' | 'cardNumber') => {
    const scrollMap: Record<string, number> = {
      name: 0,
      lastFour: 110,
      cycleDate: 190,
      balance: 140,
      cardNumber: 180,
    };
    setTimeout(() => {
      formScrollRef.current?.scrollTo({ y: scrollMap[field] ?? 0, animated: true });
    }, 120);
  };

  const dynamicBottomPadding = keyboardOffset > 0
    ? (keyboardOffset + 24)
    : 30;

  // 表單狀態
  const [formType, setFormType] = useState<AccountType>('credit_card');
  const [formName, setFormName] = useState<string>('');
  const [formUserId, setFormUserId] = useState<string>(currentUser.id);
  const [formLastFour, setFormLastFour] = useState<string>('');
  const [formCardNumber, setFormCardNumber] = useState<string>('');
  const [formCycleDate, setFormCycleDate] = useState<string>('15');
  const [formBalance, setFormBalance] = useState<string>('0');
  const [formColor, setFormColor] = useState<string>(COLOR_PALETTE[0]);

  // 判斷某個綁定成員 ID 是否對應當前本機使用者 (支援 ID 直接比對、名稱別名比對與名冊連動)
  const isMatchedToCurrentUser = useCallback(
    (memberId?: string | null) => {
      if (!memberId || !currentUser) return false;
      if (memberId === currentUser.id) return true;
      const member = members.find(m => m.id === memberId);
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

  const filteredPaymentAccounts = useMemo(() => {
    if (scope === 'my') {
      return (paymentAccounts || []).filter(a => isMatchedToCurrentUser(a.user_id));
    }
    return paymentAccounts || [];
  }, [paymentAccounts, scope, isMatchedToCurrentUser]);

  const creditCards = useMemo(
    () => sortAccountsByUser(filteredPaymentAccounts.filter(a => a.type === 'credit_card'), currentUser.id),
    [filteredPaymentAccounts, currentUser.id]
  );
  const storedValueCards = useMemo(
    () => sortAccountsByUser(filteredPaymentAccounts.filter(a => a.type === 'stored_value'), currentUser.id),
    [filteredPaymentAccounts, currentUser.id]
  );
  const bankAccounts = useMemo(
    () => sortAccountsByUser(filteredPaymentAccounts.filter(a => a.type === 'bank'), currentUser.id),
    [filteredPaymentAccounts, currentUser.id]
  );
  const cashAccounts = useMemo(
    () => sortAccountsByUser(filteredPaymentAccounts.filter(a => a.type === 'cash'), currentUser.id),
    [filteredPaymentAccounts, currentUser.id]
  );

  // 管理權限：在「我的」模式下每位成員均可管理自己的卡片；在「全家」模式下僅管理員可管理
  const canManage = isOwner || scope === 'my';

  const handleOpenAdd = (type: AccountType) => {
    if (!canManage) {
      showAlert('權限不足', '只有帳本管理員才能在全家一覽中新增卡片與帳戶；若要新增個人卡片，請至「我的」新增。');
      return;
    }
    if (type === 'stored_value' || type === 'credit_card' || type === 'bank' || type === 'cash') {
      setActiveTab(type);
    }
    setIsEditing(true);
    setEditingId(null);
    setFormType(type);
    setFormName(type === 'credit_card' ? '富邦 Costco 卡' : type === 'bank' ? '玉山銀行 薪轉戶' : type === 'cash' ? '現金皮夾' : '悠遊卡');
    const myMember = members.find(m => isMatchedToCurrentUser(m.id));
    setFormUserId(myMember ? myMember.id : (currentUser?.id || ''));
    setFormLastFour('');
    setFormCardNumber('');
    setFormCycleDate('15');
    setFormBalance('0');
    setFormColor(type === 'credit_card' ? COLOR_PALETTE[0] : type === 'bank' ? COLOR_PALETTE[6] : type === 'cash' ? COLOR_PALETTE[2] : COLOR_PALETTE[4]);
  };

  const handleOpenEdit = (acc: PaymentAccount) => {
    const isMyCard = isMatchedToCurrentUser(acc.user_id);
    if (!isOwner && !isMyCard) {
      showAlert('權限不足', '您僅能編輯屬於自己的卡片與帳戶');
      return;
    }
    if (scope === 'all' && !isOwner) {
      showAlert('純瀏覽模式', '在全家一覽中僅供查看；如需編輯您的卡片，請切換至「我的」視角進行管理。');
      return;
    }
    const matchedMember = acc.user_id && members.find(m => m.id === acc.user_id);
    const myMember = members.find(m => isMatchedToCurrentUser(m.id));
    if (acc.type === 'stored_value' || acc.type === 'credit_card' || acc.type === 'bank' || acc.type === 'cash') {
      setActiveTab(acc.type);
    }
    setIsEditing(true);
    setEditingId(acc.id);
    setFormType(acc.type);
    setFormName(acc.name);
    setFormUserId(matchedMember ? matchedMember.id : (myMember ? myMember.id : (currentUser?.id || '')));
    setFormLastFour(acc.last_four_digits || '');
    setFormCardNumber(acc.card_number || (acc.type === 'stored_value' ? (acc.last_four_digits || '') : ''));
    setFormCycleDate(String(acc.billing_cycle_date || 15));
    setFormBalance(String(acc.balance || 0));
    setFormColor(acc.color || (acc.type === 'bank' ? COLOR_PALETTE[6] : COLOR_PALETTE[0]));
  };

  const handleSaveForm = async () => {
    if (!canManage) {
      showAlert('權限不足', '只有帳本管理員才能儲存全家卡片設定');
      return;
    }
    const cleanName = formName.trim();
    if (!cleanName) {
      showAlert('提示', '請輸入卡片或帳戶名稱');
      return;
    }

    const cleanCardNumber = formCardNumber.replace(/\D/g, '').slice(0, 16);
    const cleanLastFour = formLastFour.trim();
    const finalCardNumber = formType === 'stored_value' ? (cleanCardNumber || undefined) : undefined;
    const finalLastFour = formType === 'stored_value'
      ? (cleanCardNumber ? (cleanCardNumber.length > 4 ? cleanCardNumber.slice(-4) : cleanCardNumber) : (cleanLastFour || undefined))
      : (cleanLastFour || undefined);

    const cycleNum = parseInt(formCycleDate, 10);
    const validCycle = isNaN(cycleNum) ? 15 : Math.max(1, Math.min(31, cycleNum));
    const balanceNum = parseFloat(formBalance) || 0;
    const targetUserId = (!isOwner && scope === 'my')
      ? (formUserId && isMatchedToCurrentUser(formUserId) ? formUserId : (currentUser?.id || null))
      : (formUserId ? formUserId : (null as any));

    if (editingId) {
      await updatePaymentAccount(editingId, {
        name: cleanName,
        type: formType,
        user_id: targetUserId,
        last_four_digits: finalLastFour,
        card_number: finalCardNumber,
        billing_cycle_date: formType === 'credit_card' ? validCycle : undefined,
        balance: formType === 'stored_value' ? balanceNum : 0,
        color: formColor,
      });
    } else {
      await addPaymentAccount({
        name: cleanName,
        type: formType,
        user_id: targetUserId,
        last_four_digits: finalLastFour,
        card_number: finalCardNumber,
        billing_cycle_date: formType === 'credit_card' ? validCycle : undefined,
        balance: formType === 'stored_value' ? balanceNum : 0,
        color: formColor,
        icon: formType === 'credit_card' ? '💳' : formType === 'bank' ? '🏦' : '🚌',
        sort_order: paymentAccounts.length + 1,
      });
    }

    if (formType === 'stored_value' || formType === 'credit_card' || formType === 'bank') {
      setActiveTab(formType);
    }
    setIsEditing(false);
    setEditingId(null);
  };

  const handleDelete = (acc: PaymentAccount) => {
    const isMyCard = isMatchedToCurrentUser(acc.user_id);
    if (!isOwner && !isMyCard) {
      showAlert('權限不足', '您僅能刪除屬於自己的卡片與帳戶');
      return;
    }
    if (scope === 'all' && !isOwner) {
      showAlert('純瀏覽模式', '在全家一覽中僅供查看；如需刪除您的卡片，請切換至「我的」視角進行管理。');
      return;
    }
    const confirmMessage = `確定要刪除「${acc.name}」嗎？此操作不會刪除歷史記帳明細。`;
    if (Platform.OS === 'web') {
      if (window.confirm(confirmMessage)) {
        deletePaymentAccount(acc.id);
      }
    } else {
      Alert.alert('刪除確認', confirmMessage, [
        { text: '取消', style: 'cancel' },
        { text: '刪除', style: 'destructive', onPress: () => deletePaymentAccount(acc.id) },
      ]);
    }
  };

  const handleRestoreDefaults = async () => {
    if (!isOwner) {
      showAlert('權限不足', '只有帳本管理員才能恢復預設支付卡片');
      return;
    }
    const confirmMessage = '確定要補齊預設示範卡片（富邦 Costco、國泰 CUBE、悠遊卡）嗎？您已建立的自訂卡片不會受到影響。';
    const doRestore = async () => {
      await restoreDefaultAccounts();
      if (Platform.OS === 'web') alert('已成功恢復預設卡片！');
      else Alert.alert('完成', '已成功恢復預設卡片！');
    };

    if (Platform.OS === 'web') {
      if (window.confirm(confirmMessage)) {
        await doRestore();
      }
    } else {
      Alert.alert('恢復預設卡片', confirmMessage, [
        { text: '取消', style: 'cancel' },
        { text: '確定補齊', onPress: doRestore },
      ]);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          {/* 標頭 */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} maxFontSizeMultiplier={1.15}>
                {isEditing
                  ? (editingId ? '✏️ 編輯卡片設定' : '＋ 新增卡片或帳戶')
                  : activeTab === 'credit_card'
                    ? (canManage ? (scope === 'my' ? '💳 管理我的信用卡' : '💳 管理家庭信用卡') : '💳 家庭信用卡一覽 (純瀏覽)')
                    : activeTab === 'bank'
                      ? (canManage ? (scope === 'my' ? '🏦 管理我的銀行帳戶' : '🏦 管理家庭銀行帳戶') : '🏦 家庭銀行帳戶一覽 (純瀏覽)')
                      : (canManage ? (scope === 'my' ? '🚌 管理我的悠遊卡' : '🚌 管理家庭悠遊卡') : '🚌 家庭悠遊卡一覽 (純瀏覽)')}
              </Text>
              <Text style={styles.subtitle} maxFontSizeMultiplier={1.15}>
                {isEditing
                  ? '設定卡片或帳戶名稱、歸屬成員與相關資訊'
                  : activeTab === 'credit_card'
                    ? (canManage
                      ? (scope === 'my' ? `管理屬於「${currentUser?.display_name || '我'}」之信用卡與結帳日` : '設定全家的信用卡、持卡人與每月結帳日')
                      : '全家一覽瀏覽模式（僅帳本管理員可新增、修改或刪除全家信用卡）')
                    : activeTab === 'bank'
                      ? (canManage
                        ? (scope === 'my' ? `管理屬於「${currentUser?.display_name || '我'}」之銀行帳戶` : '設定全家的銀行帳戶與持有人，供轉帳與週期扣繳對帳')
                        : '全家一覽瀏覽模式（僅帳本管理員可新增、修改或刪除銀行帳戶）')
                      : (canManage
                        ? (scope === 'my' ? `管理屬於「${currentUser?.display_name || '我'}」之悠遊卡與即時餘額` : '設定全家的悠遊卡 / 儲值卡與即時餘額')
                        : '全家一覽瀏覽模式（僅帳本管理員可新增、修改或刪除悠遊卡）')}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                if (isEditing) {
                  setIsEditing(false);
                  setEditingId(null);
                } else {
                  onClose();
                }
              }}
              style={styles.closeBtn}
            >
              <Text style={styles.closeText} maxFontSizeMultiplier={1.15}>
                {isEditing ? '返回' : '✕'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 模式分頁切換 Tab */}
          {!isEditing && (
            <View style={styles.tabBar}>
              <TouchableOpacity
                style={[styles.tabItem, activeTab === 'credit_card' && styles.tabItemActive]}
                onPress={() => setActiveTab('credit_card')}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.tabItemText, activeTab === 'credit_card' && styles.tabItemTextActive]}
                  maxFontSizeMultiplier={1.12}
                >
                  💳 信用卡 ({creditCards.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabItem, activeTab === 'stored_value' && styles.tabItemActive]}
                onPress={() => setActiveTab('stored_value')}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.tabItemText, activeTab === 'stored_value' && styles.tabItemTextActive]}
                  maxFontSizeMultiplier={1.12}
                >
                  🚌 悠遊卡 ({storedValueCards.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabItem, activeTab === 'bank' && styles.tabItemActive]}
                onPress={() => setActiveTab('bank')}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.tabItemText, activeTab === 'bank' && styles.tabItemTextActive]}
                  maxFontSizeMultiplier={1.12}
                >
                  🏦 銀行帳戶 ({bankAccounts.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabItem, activeTab === 'cash' && styles.tabItemActive]}
                onPress={() => setActiveTab('cash')}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.tabItemText, activeTab === 'cash' && styles.tabItemTextActive]}
                  maxFontSizeMultiplier={1.12}
                >
                  💵 現金 ({cashAccounts.length})
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {isEditing ? (
            /* 編輯 / 新增表單 */
            <ScrollView
              ref={formScrollRef}
              style={styles.formScroll}
              contentContainerStyle={[
                styles.formScrollContent,
                { paddingBottom: dynamicBottomPadding },
              ]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              <View style={styles.formHeaderRow}>
                <Text style={styles.formSectionTitle}>
                  {editingId ? '編輯設定' : '新增卡片或帳戶'}
                </Text>
                {keyboardOffset > 0 && (
                  <TouchableOpacity onPress={Keyboard.dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.dismissKeyboardText} maxFontSizeMultiplier={1.08}>收起鍵盤 ▾</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* 類型選擇 */}
              <View style={styles.typeToggle}>
                <TouchableOpacity
                  style={[styles.typeBtn, formType === 'credit_card' && styles.typeBtnActive]}
                  onPress={() => {
                    setFormType('credit_card');
                    if (!editingId && formName === '玉山銀行 薪轉戶') setFormName('富邦 Costco 卡');
                  }}
                >
                  <Text style={[styles.typeBtnText, formType === 'credit_card' && styles.typeBtnTextActive]}>
                    💳 信用卡
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeBtn, formType === 'stored_value' && styles.typeBtnActive]}
                  onPress={() => {
                    setFormType('stored_value');
                    if (!editingId && (formName === '富邦 Costco 卡' || formName === '玉山銀行 薪轉戶')) setFormName('悠遊卡');
                  }}
                >
                  <Text style={[styles.typeBtnText, formType === 'stored_value' && styles.typeBtnTextActive]}>
                    🚌 儲值卡
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeBtn, formType === 'bank' && styles.typeBtnActive]}
                  onPress={() => {
                    setFormType('bank');
                    if (!editingId && (formName === '富邦 Costco 卡' || formName === '悠遊卡' || formName === '現金皮夾')) setFormName('玉山銀行 薪轉戶');
                  }}
                >
                  <Text style={[styles.typeBtnText, formType === 'bank' && styles.typeBtnTextActive]}>
                    🏦 銀行帳戶
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeBtn, formType === 'cash' && styles.typeBtnActive]}
                  onPress={() => {
                    setFormType('cash');
                    if (!editingId && (formName === '富邦 Costco 卡' || formName === '悠遊卡' || formName === '玉山銀行 薪轉戶')) setFormName('現金皮夾');
                  }}
                >
                  <Text style={[styles.typeBtnText, formType === 'cash' && styles.typeBtnTextActive]}>
                    💵 現金皮包
                  </Text>
                </TouchableOpacity>
              </View>

              {/* 卡片/帳戶名稱 */}
              <Text style={styles.fieldLabel}>
                {formType === 'credit_card' ? '卡片名稱' : formType === 'bank' ? '銀行 / 帳戶名稱' : formType === 'cash' ? '現金皮夾名稱' : '卡片名稱'}
              </Text>
              <TextInput
                style={styles.textInput}
                value={formName}
                onChangeText={setFormName}
                placeholder={
                  formType === 'credit_card'
                    ? '例如：富邦 Costco 聯名卡'
                    : formType === 'bank'
                    ? '例如：玉山銀行 薪轉戶、台新 Richart'
                    : formType === 'cash'
                    ? '例如：爸爸皮夾、公用零用金'
                    : '例如：爸爸悠遊卡'
                }
                onFocus={() => handleInputFocus('name')}
                returnKeyType="next"
              />

              {/* 持卡人 / 帳戶持有人 */}
              <Text style={styles.fieldLabel}>
                {formType === 'bank' ? '帳戶持有人 / 歸屬家庭成員' : formType === 'cash' ? '皮包持有人 / 歸屬家庭成員' : '持卡人 / 歸屬家庭成員'}
              </Text>
              <View style={styles.memberChipsRow}>
                {isOwner && (
                  <TouchableOpacity
                    style={[styles.memberChip, !formUserId && styles.memberChipActive]}
                    onPress={() => setFormUserId('')}
                  >
                    <Text style={styles.memberChipAvatar}>🏠</Text>
                    <Text style={[styles.memberChipName, !formUserId && styles.memberChipNameActive]}>
                      全家通用
                    </Text>
                  </TouchableOpacity>
                )}
                {members.map(m => {
                  if (!isOwner && scope === 'my' && !isMatchedToCurrentUser(m.id)) {
                    return null;
                  }
                  const isSelected = formUserId === m.id;
                  return (
                    <TouchableOpacity
                      key={m.id}
                      style={[styles.memberChip, isSelected && styles.memberChipActive]}
                      onPress={() => setFormUserId(m.id)}
                    >
                      <Text style={styles.memberChipAvatar}>{m.avatar_url || '👤'}</Text>
                      <Text style={[styles.memberChipName, isSelected && styles.memberChipNameActive]}>
                        {m.display_name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {formType === 'credit_card' ? (
                <>
                  {/* 末四碼 */}
                  <Text style={styles.fieldLabel}>卡片末四碼 (選填，方便對帳辨識)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={formLastFour}
                    onChangeText={setFormLastFour}
                    placeholder="例如：8829"
                    keyboardType="numeric"
                    maxLength={4}
                    onFocus={() => handleInputFocus('lastFour')}
                    returnKeyType="next"
                  />

                  {/* 結帳日 */}
                  <Text style={styles.fieldLabel}>每月結帳日 (1 ~ 31 號，依帳單切分週期)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={formCycleDate}
                    onChangeText={setFormCycleDate}
                    placeholder="15"
                    keyboardType="numeric"
                    onFocus={() => handleInputFocus('cycleDate')}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  <Text style={styles.fieldHint}>
                    💡 設定結帳日後，每月對帳時系統會精確鎖定上月{parseInt(formCycleDate, 10) + 1 || 16}日到本月{formCycleDate || 15}日的帳單消費。
                  </Text>
                </>
              ) : formType === 'bank' ? (
                <>
                  {/* 目前存款餘額 */}
                  <Text style={styles.fieldLabel}>目前帳戶存款餘額 (TWD)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={formBalance}
                    onChangeText={setFormBalance}
                    placeholder="例如：50000"
                    keyboardType="numeric"
                    onFocus={() => handleInputFocus('balance')}
                    returnKeyType="next"
                  />

                  {/* 銀行帳號末碼 */}
                  <Text style={styles.fieldLabel}>帳號末五碼 / 末四碼 (選填，方便對帳辨識)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={formLastFour}
                    onChangeText={setFormLastFour}
                    placeholder="例如：12345"
                    keyboardType="numeric"
                    maxLength={10}
                    onFocus={() => handleInputFocus('lastFour')}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  <Text style={styles.fieldHint}>
                    💡 建立銀行帳戶後，在轉帳、提款或設定水電週期扣款時，系統將即時連動扣減並計入家庭總淨值。
                  </Text>
                </>
              ) : formType === 'cash' ? (
                <>
                  {/* 現金皮包餘額 */}
                  <Text style={styles.fieldLabel}>目前現金皮包餘額 (TWD)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={formBalance}
                    onChangeText={setFormBalance}
                    placeholder="例如：3000"
                    keyboardType="numeric"
                    onFocus={() => handleInputFocus('balance')}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  <Text style={styles.fieldHint}>
                    💡 現金皮包餘額將自動計入家庭總資產；提款時可一鍵從銀行轉出並充實此皮夾現金。
                  </Text>
                </>
              ) : (
                <>
                  {/* 當前餘額 */}
                  <Text style={styles.fieldLabel}>目前卡片餘額 (TWD)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={formBalance}
                    onChangeText={setFormBalance}
                    placeholder="0"
                    keyboardType="numeric"
                    onFocus={() => handleInputFocus('balance')}
                    returnKeyType="next"
                  />

                  {/* 悠遊卡完整卡號 */}
                  <Text style={styles.fieldLabel}>悠遊卡卡號 (選填，嚴格上限 16 碼，方便官網查餘額與明細)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={formCardNumber}
                    onChangeText={text => setFormCardNumber(text.replace(/\D/g, '').slice(0, 16))}
                    placeholder="例如：0123456789 (舊卡10碼 / 新卡16碼)"
                    keyboardType="numeric"
                    maxLength={16}
                    onFocus={() => handleInputFocus('cardNumber')}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  <Text style={[styles.fieldHint, (formCardNumber.length === 10 || formCardNumber.length === 16) && { color: '#059669', fontWeight: '600' }]}>
                    {formCardNumber.length === 10
                      ? '✓ 已輸入 10 碼（舊版悠遊卡標準長度）'
                      : formCardNumber.length === 16
                      ? '✓ 已輸入 16 碼（新版晶片卡 / 市民卡標準長度）'
                      : formCardNumber.length > 0
                      ? `已輸入 ${formCardNumber.length} 碼（上限 16 碼，悠遊卡標準通常為 10 碼或 16 碼）`
                      : '💡 卡號通常印在悠遊卡背面右下角（嚴格上限 16 碼）。填寫後可在首頁餘額旁一鍵複製，或在「對帳」時跳轉官網快速查詢。'}
                  </Text>
                </>
              )}

              {/* 卡片/帳戶顏色 */}
              <Text style={styles.fieldLabel}>
                {formType === 'bank' ? '帳戶識別顏色' : '卡片識別顏色'}
              </Text>
              <View style={styles.colorPaletteRow}>
                {COLOR_PALETTE.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.colorCircle, { backgroundColor: c }, formColor === c && styles.colorCircleSelected]}
                    onPress={() => setFormColor(c)}
                  />
                ))}
              </View>

              <View style={styles.formActionRow}>
                <TouchableOpacity
                  style={styles.cancelFormBtn}
                  onPress={() => {
                    setIsEditing(false);
                    setEditingId(null);
                  }}
                >
                  <Text style={styles.cancelFormText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveFormBtn} onPress={handleSaveForm}>
                  <Text style={styles.saveFormText}>儲存設定</Text>
                </TouchableOpacity>
              </View>
              <View style={{ height: 30 }} />
            </ScrollView>
          ) : (
            /* 卡片清單列表 */
            <ScrollView style={styles.listScroll} showsVerticalScrollIndicator={false}>
              {!canManage && (
                <View style={styles.memberNoticeBox}>
                  <Text style={styles.memberNoticeText} maxFontSizeMultiplier={1.15}>
                    🔒 全家瀏覽模式：在此僅供查看全家卡片與帳戶。如需管理或新增個人卡片，請切換至「我的」視角。
                  </Text>
                </View>
              )}

              {activeTab === 'credit_card' ? (
                /* 💳 信用卡分頁 */
                <>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>💳 信用卡清單 ({creditCards.length})</Text>
                    {canManage && (
                      <TouchableOpacity
                        style={styles.addMiniBtn}
                        onPress={() => handleOpenAdd('credit_card')}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.addMiniText}>+ 新增信用卡</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {creditCards.length === 0 ? (
                    <View style={styles.emptyStateContainer}>
                      <Text style={styles.emptyNotice}>尚未設定信用卡</Text>
                      {canManage && (
                        <TouchableOpacity
                          style={styles.emptyAddBtn}
                          onPress={() => handleOpenAdd('credit_card')}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.emptyAddBtnText}>＋ 新增第一張信用卡</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : (
                    creditCards.map(card => {
                      const cardholder = members.find(m => m.id === card.user_id);
                      const isMyCard = isMatchedToCurrentUser(card.user_id);
                      const canEditCard = isOwner || (scope === 'my' && isMyCard);
                      return (
                        <View key={card.id} style={[styles.cardItemRow, { borderLeftColor: card.color || '#3B82F6' }]}>
                          <View style={styles.cardInfoCol}>
                            <View style={styles.cardNameRow}>
                              <Text style={styles.cardNameText}>{card.name}</Text>
                              {!!card.last_four_digits && (
                                <View style={styles.tagBadge}>
                                  <Text style={styles.tagBadgeText}>*{card.last_four_digits}</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.cardSubText}>
                              {cardholder ? `${cardholder.avatar_url || '👤'} ${cardholder.display_name} · ` : '🏠 全家通用 · '}
                              每月 {card.billing_cycle_date || 15} 號結帳
                            </Text>
                          </View>
                          {canEditCard && (
                            <View style={styles.cardActionGroup}>
                              <TouchableOpacity style={styles.editBtn} onPress={() => handleOpenEdit(card)}>
                                <Text style={styles.editText}>編輯</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={styles.delBtn} onPress={() => handleDelete(card)}>
                                <Text style={styles.delText}>刪除</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      );
                    })
                  )}
                </>
              ) : activeTab === 'stored_value' ? (
                /* 🚌 悠遊卡 / 儲值卡分頁 */
                <>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>🚌 悠遊卡 / 儲值卡 ({storedValueCards.length})</Text>
                    {canManage && (
                      <TouchableOpacity
                        style={styles.addMiniBtn}
                        onPress={() => handleOpenAdd('stored_value')}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.addMiniText}>+ 新增儲值卡</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {storedValueCards.length === 0 ? (
                    <View style={styles.emptyStateContainer}>
                      <Text style={styles.emptyNotice}>尚未設定儲值卡</Text>
                      {canManage && (
                        <TouchableOpacity
                          style={styles.emptyAddBtn}
                          onPress={() => handleOpenAdd('stored_value')}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.emptyAddBtnText}>＋ 新增第一張儲值卡</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : (
                    storedValueCards.map(card => {
                      const cardholder = members.find(m => m.id === card.user_id);
                      const isMyCard = isMatchedToCurrentUser(card.user_id);
                      const canEditCard = isOwner || (scope === 'my' && isMyCard);
                      return (
                        <View key={card.id} style={[styles.cardItemRow, { borderLeftColor: card.color || '#0284C7' }]}>
                          <View style={styles.cardInfoCol}>
                            <View style={styles.cardNameRow}>
                              <Text style={styles.cardNameText}>{card.name}</Text>
                              {(card.last_four_digits || card.card_number) && (
                                <View style={styles.tagBadge}>
                                  <Text style={styles.tagBadgeText}>
                                    *{(card.last_four_digits || card.card_number)?.slice(-4)}
                                  </Text>
                                </View>
                              )}
                              <Text style={styles.balanceTag}>餘額: NT$ {Number(card.balance).toLocaleString()}</Text>
                            </View>
                            <Text style={styles.cardSubText}>
                              {cardholder ? `${cardholder.avatar_url || '👤'} ${cardholder.display_name}` : '🏠 全家通用'}
                              {card.card_number ? ` · 卡號: ${card.card_number}` : ''}
                            </Text>
                          </View>
                          {canEditCard && (
                            <View style={styles.cardActionGroup}>
                              <TouchableOpacity style={styles.editBtn} onPress={() => handleOpenEdit(card)}>
                                <Text style={styles.editText}>編輯</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={styles.delBtn} onPress={() => handleDelete(card)}>
                                <Text style={styles.delText}>刪除</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      );
                    })
                  )}
                </>
              ) : activeTab === 'bank' ? (
                /* 🏦 銀行帳戶分頁 */
                <>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>🏦 銀行帳戶清單 ({bankAccounts.length})</Text>
                    {canManage && (
                      <TouchableOpacity
                        style={styles.addMiniBtn}
                        onPress={() => handleOpenAdd('bank')}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.addMiniText}>+ 新增銀行帳戶</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {bankAccounts.length === 0 ? (
                    <View style={styles.emptyStateContainer}>
                      <Text style={styles.emptyNotice}>尚未設定銀行帳戶</Text>
                      {canManage && (
                        <TouchableOpacity
                          style={styles.emptyAddBtn}
                          onPress={() => handleOpenAdd('bank')}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.emptyAddBtnText}>＋ 新增第一個銀行帳戶</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : (
                    bankAccounts.map(acc => {
                      const holder = members.find(m => m.id === acc.user_id);
                      const isMyAccount = isMatchedToCurrentUser(acc.user_id);
                      const canEditAccount = isOwner || (scope === 'my' && isMyAccount);
                      return (
                        <View key={acc.id} style={[styles.cardItemRow, { borderLeftColor: acc.color || '#8B5CF6' }]}>
                          <View style={styles.cardInfoCol}>
                            <View style={styles.cardNameRow}>
                              <Text style={styles.cardNameText}>{acc.name}</Text>
                              {!!acc.last_four_digits && (
                                <View style={styles.tagBadge}>
                                  <Text style={styles.tagBadgeText}>*{acc.last_four_digits}</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.cardSubText}>
                              {holder ? `${holder.avatar_url || '👤'} ${holder.display_name} · ` : '🏠 全家通用 · '}
                              存款餘額：NT$ {(acc.balance || 0).toLocaleString()}
                            </Text>
                          </View>
                          {canEditAccount && (
                            <View style={styles.cardActionGroup}>
                              <TouchableOpacity style={styles.editBtn} onPress={() => handleOpenEdit(acc)}>
                                <Text style={styles.editText}>編輯</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={styles.delBtn} onPress={() => handleDelete(acc)}>
                                <Text style={styles.delText}>刪除</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      );
                    })
                  )}
                </>
              ) : (
                /* 💵 現金皮包分頁 */
                <>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>💵 現金皮包清單 ({cashAccounts.length})</Text>
                    {canManage && (
                      <TouchableOpacity
                        style={styles.addMiniBtn}
                        onPress={() => handleOpenAdd('cash')}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.addMiniText}>+ 新增現金皮包</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {cashAccounts.length === 0 ? (
                    <View style={styles.emptyStateContainer}>
                      <Text style={styles.emptyNotice}>尚未設定現金帳戶或皮包</Text>
                      {canManage && (
                        <TouchableOpacity
                          style={styles.emptyAddBtn}
                          onPress={() => handleOpenAdd('cash')}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.emptyAddBtnText}>＋ 新增第一個現金皮夾</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : (
                    cashAccounts.map(acc => {
                      const holder = members.find(m => m.id === acc.user_id);
                      const isMyAccount = isMatchedToCurrentUser(acc.user_id);
                      const canEditAccount = isOwner || (scope === 'my' && isMyAccount);
                      return (
                        <View key={acc.id} style={[styles.cardItemRow, { borderLeftColor: acc.color || '#10B981' }]}>
                          <View style={styles.cardInfoCol}>
                            <View style={styles.cardNameRow}>
                              <Text style={styles.cardNameText}>{acc.name}</Text>
                            </View>
                            <Text style={styles.cardSubText}>
                              {holder ? `${holder.avatar_url || '👤'} ${holder.display_name} · ` : '🏠 全家通用 · '}
                              目前現金：NT$ {(acc.balance || 0).toLocaleString()}
                            </Text>
                          </View>
                          {canEditAccount && (
                            <View style={styles.cardActionGroup}>
                              <TouchableOpacity style={styles.editBtn} onPress={() => handleOpenEdit(acc)}>
                                <Text style={styles.editText}>編輯</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={styles.delBtn} onPress={() => handleDelete(acc)}>
                                <Text style={styles.delText}>刪除</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      );
                    })
                  )}
                </>
              )}

              {/* 恢復預設示範卡片按鈕 */}
              {isOwner && (
                <TouchableOpacity
                  style={styles.restoreDefaultsBtn}
                  onPress={handleRestoreDefaults}
                  activeOpacity={0.7}
                >
                  <Text style={styles.restoreDefaultsText} maxFontSizeMultiplier={1.15}>
                    ↺ 一鍵補齊 / 恢復預設示範卡片組合
                  </Text>
                </TouchableOpacity>
              )}

              <View style={{ height: 30 }} />
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const getStyles = (isDark: boolean, colors: ThemeColors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: isDark ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    width: '100%',
    height: '100%',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    backgroundColor: colors.background.modal,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: Math.min(SCREEN_HEIGHT * 0.85, 650),
    maxHeight: Math.min(SCREEN_HEIGHT * 0.9, 720),
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    borderTopWidth: isDark ? 1 : 0,
    borderTopColor: isDark ? colors.border.default : 'transparent',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? colors.border.default : '#F1F5F9',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: 11.5,
    color: colors.text.muted,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  closeText: {
    fontSize: 18,
    color: colors.text.muted,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: isDark ? colors.background.cardSubtle : '#F1F5F9',
    borderRadius: 12,
    padding: 3,
    marginTop: 10,
    marginBottom: 4,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 9,
  },
  tabItemActive: {
    backgroundColor: isDark ? colors.background.card : '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  tabItemText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.muted,
  },
  tabItemTextActive: {
    color: colors.text.primary,
    fontWeight: '700',
  },
  listScroll: {
    flex: 1,
    marginTop: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
  },
  addMiniBtn: {
    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  addMiniText: {
    color: isDark ? '#818CF8' : '#4F46E5',
    fontSize: 11.5,
    fontWeight: '700',
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
    backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E2E8F0',
    borderStyle: 'dashed',
    marginVertical: 8,
  },
  emptyNotice: {
    fontSize: 13,
    color: colors.text.muted,
    marginBottom: 8,
  },
  emptyAddBtn: {
    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 4,
  },
  emptyAddBtnText: {
    color: isDark ? '#818CF8' : '#4F46E5',
    fontSize: 12.5,
    fontWeight: '700',
  },
  cardItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E2E8F0',
  },
  cardInfoCol: {
    flex: 1,
  },
  cardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardNameText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.text.primary,
  },
  tagBadge: {
    backgroundColor: isDark ? colors.background.card : '#E2E8F0',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  tagBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  balanceTag: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
  },
  cardSubText: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 2,
  },
  cardActionGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  editBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: isDark ? colors.background.card : '#FFFFFF',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#CBD5E1',
    borderRadius: 6,
  },
  editText: {
    fontSize: 11,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  delBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.18)' : '#FEE2E2',
    borderRadius: 6,
  },
  delText: {
    fontSize: 11,
    color: isDark ? '#F87171' : '#DC2626',
    fontWeight: '600',
  },
  formScroll: {
    flex: 1,
    marginTop: 12,
  },
  formScrollContent: {
    paddingBottom: 20,
  },
  formHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  dismissKeyboardText: {
    fontSize: 12,
    color: isDark ? '#818CF8' : '#4F46E5',
    fontWeight: '600',
    marginLeft: 'auto',
  },
  formSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
  },
  typeToggle: {
    flexDirection: 'row',
    backgroundColor: isDark ? colors.background.cardSubtle : '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  typeBtnActive: {
    backgroundColor: isDark ? colors.background.card : '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  typeBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.text.muted,
  },
  typeBtnTextActive: {
    color: colors.text.primary,
    fontWeight: '700',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 6,
    marginTop: 8,
  },
  textInput: {
    backgroundColor: isDark ? colors.background.input : '#F8FAFC',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.text.primary,
  },
  fieldHint: {
    fontSize: 10.5,
    color: colors.text.muted,
    lineHeight: 15,
    marginTop: 4,
  },
  memberChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? colors.background.cardSubtle : '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E2E8F0',
    gap: 4,
  },
  memberChipActive: {
    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF',
    borderColor: '#4F46E5',
  },
  memberChipAvatar: {
    fontSize: 12,
  },
  memberChipName: {
    fontSize: 11.5,
    color: colors.text.secondary,
  },
  memberChipNameActive: {
    color: isDark ? '#818CF8' : '#4F46E5',
    fontWeight: '700',
  },
  colorPaletteRow: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 6,
  },
  colorCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  colorCircleSelected: {
    borderWidth: 3,
    borderColor: colors.text.primary,
  },
  formActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  cancelFormBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#CBD5E1',
    backgroundColor: isDark ? colors.background.cardSubtle : 'transparent',
    alignItems: 'center',
  },
  cancelFormText: {
    color: colors.text.secondary,
    fontSize: 13,
    fontWeight: '600',
  },
  saveFormBtn: {
    flex: 2,
    backgroundColor: '#4F46E5',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveFormText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  restoreDefaultsBtn: {
    marginTop: 24,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#CBD5E1',
    borderStyle: 'dashed',
    backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreDefaultsText: {
    fontSize: 13,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  memberNoticeBox: {
    backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E2E8F0',
  },
  memberNoticeText: {
    fontSize: 12,
    color: colors.text.muted,
    fontWeight: '600',
  },
});
