import React, { useState, useRef, useEffect } from 'react';
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
import { CustomPaymentMethod } from '../types/database';
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

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const PRESET_ICONS = [
  '📱', '🟢', '🔵', '🩵', '🟣', '💳', '💵', '🚌',
  '🏦', '🟠', '🔴', '🍎', '🇹🇼', '🎟️', '🎫', '🪙',
  '🛒', '⛽', '☕', '⚡', '🍱', '🛍️', '📦', '🎁',
];

const PRESET_COLORS = [
  '#0055B8', // 全支付藍
  '#06C755', // LINE Pay 綠
  '#00A3E0', // 悠遊藍
  '#D8232A', // 街口紅
  '#3B82F6', // 信用卡藍
  '#10B981', // 現金綠
  '#8B5CF6', // 轉帳紫
  '#F97316', // 橘色
  '#EC4899', // 甜心粉
  '#4B5563', // 質感灰
];

interface PaymentMethodsManageModalProps {
  visible: boolean;
  onClose: () => void;
}

export const PaymentMethodsManageModal: React.FC<PaymentMethodsManageModalProps> = ({
  visible,
  onClose,
}) => {
  const {
    paymentMethods,
    addPaymentMethod,
    updatePaymentMethod,
    deletePaymentMethod,
    togglePaymentMethodEnabled,
    reorderPaymentMethods,
    restoreDefaultPaymentMethods,
  } = useLedger();

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // 表單狀態
  const [name, setName] = useState<string>('');
  const [icon, setIcon] = useState<string>('📱');
  const [color, setColor] = useState<string>('#0055B8');
  const [supportsCreditCard, setSupportsCreditCard] = useState<boolean>(true);
  const [isEnabled, setIsEnabled] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const [keyboardOffset, setKeyboardOffset] = useState<number>(0);
  const formScrollRef = useRef<ScrollView>(null);

  // 當彈窗關閉時重設為清單狀態
  useEffect(() => {
    if (!visible) {
      setIsEditing(false);
      setEditingId(null);
    }
  }, [visible]);

  // 監聽鍵盤高度
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

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const openAddForm = () => {
    setEditingId(null);
    setName('');
    setIcon('📱');
    setColor('#0055B8');
    setSupportsCreditCard(true);
    setIsEnabled(true);
    setIsEditing(true);
  };

  const openEditForm = (method: CustomPaymentMethod) => {
    setEditingId(method.id);
    setName(method.name);
    setIcon(method.icon || '📱');
    setColor(method.color || '#3B82F6');
    setSupportsCreditCard(!!method.supports_credit_card);
    setIsEnabled(method.is_enabled !== false);
    setIsEditing(true);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      showAlert('請輸入名稱', '請為付款方式輸入名稱（例如：OPEN 錢包、台灣 Pay 等）');
      return;
    }

    try {
      setIsSaving(true);
      if (editingId) {
        await updatePaymentMethod(editingId, {
          name: trimmed,
          icon,
          color,
          supports_credit_card: supportsCreditCard,
          is_enabled: isEnabled,
        });
      } else {
        await addPaymentMethod({
          name: trimmed,
          icon,
          color,
          supports_credit_card: supportsCreditCard,
          is_enabled: isEnabled,
          type: supportsCreditCard ? 'e_wallet' : 'other',
        });
      }
      setIsEditing(false);
      setEditingId(null);
    } catch (err: any) {
      showAlert('儲存失敗', err?.message || '發生未知錯誤');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (method: CustomPaymentMethod) => {
    if (method.is_system) {
      showAlert('系統預設項目', '系統預設的付款方式不可刪除，但您可以點擊開關將其停用/隱藏！');
      return;
    }

    const doDelete = async () => {
      await deletePaymentMethod(method.id);
      showAlert('已刪除', `已刪除付款方式「${method.name}」`);
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`確定要刪除「${method.name}」嗎？歷史已記錄的交易不受影響。`)) {
        doDelete();
      }
    } else {
      Alert.alert(
        '刪除付款方式',
        `確定要刪除「${method.name}」嗎？歷史已記錄的交易不受影響。`,
        [
          { text: '取消', style: 'cancel' },
          { text: '確定刪除', style: 'destructive', onPress: doDelete },
        ]
      );
    }
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= paymentMethods.length) return;
    const reordered = [...paymentMethods];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIdx, 0, moved);
    reorderPaymentMethods(reordered);
  };

  const handleRestoreDefaults = () => {
    const doRestore = async () => {
      await restoreDefaultPaymentMethods();
      showAlert('已恢復', '已恢復為系統預設的付款方式清單！');
    };

    if (Platform.OS === 'web') {
      if (window.confirm('確定要將所有付款方式恢復為系統預設值嗎？')) {
        doRestore();
      }
    } else {
      Alert.alert(
        '恢復預設值',
        '確定要將所有付款方式恢復為系統預設值嗎？',
        [
          { text: '取消', style: 'cancel' },
          { text: '確定恢復', style: 'destructive', onPress: doRestore },
        ]
      );
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          {/* 頂部標題 */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} maxFontSizeMultiplier={1.15}>
                📱 常用付款方式管理
              </Text>
              <Text style={styles.subtitle} maxFontSizeMultiplier={1.08}>
                自由開關、排序或自訂常用的電子支付與付款工具
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Text style={styles.closeText} maxFontSizeMultiplier={1.15}>✕</Text>
            </TouchableOpacity>
          </View>

          {isEditing ? (
            /* 新增 / 編輯 表單畫面 */
            <ScrollView
              ref={formScrollRef}
              style={styles.formScroll}
              contentContainerStyle={[
                styles.formContent,
                { paddingBottom: keyboardOffset > 0 ? keyboardOffset + 20 : 40 },
              ]}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.formCard}>
                <Text style={styles.formTitle} maxFontSizeMultiplier={1.15}>
                  {editingId ? `編輯「${name || '付款方式'}」` : '➕ 新增自訂付款方式'}
                </Text>

                {/* 名稱輸入 */}
                <Text style={styles.inputLabel} maxFontSizeMultiplier={1.08}>
                  付款方式名稱 <Text style={{ color: '#EF4444' }}>*</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="例如：OPEN 錢包、台灣 Pay、中油 Pay..."
                  placeholderTextColor="#9CA3AF"
                  value={name}
                  onChangeText={setName}
                  maxLength={16}
                />

                {/* 圖示選取 */}
                <Text style={styles.inputLabel} maxFontSizeMultiplier={1.08}>
                  選擇代表圖示 (Emoji)
                </Text>
                <View style={styles.iconGrid}>
                  {PRESET_ICONS.map((emoji) => (
                    <TouchableOpacity
                      key={emoji}
                      style={[
                        styles.iconChip,
                        icon === emoji && styles.iconChipActive,
                      ]}
                      onPress={() => setIcon(emoji)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.iconText}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 顏色選取 */}
                <Text style={styles.inputLabel} maxFontSizeMultiplier={1.08}>
                  代表識別色
                </Text>
                <View style={styles.colorGrid}>
                  {PRESET_COLORS.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[
                        styles.colorChip,
                        { backgroundColor: c },
                        color === c && styles.colorChipActive,
                      ]}
                      onPress={() => setColor(c)}
                      activeOpacity={0.7}
                    >
                      {color === c && <Text style={styles.colorCheck}>✓</Text>}
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 屬性設定：支援綁定信用卡 */}
                <Text style={styles.inputLabel} maxFontSizeMultiplier={1.08}>
                  扣款與對帳屬性
                </Text>
                <TouchableOpacity
                  style={[
                    styles.attrSettingCard,
                    supportsCreditCard && styles.attrSettingCardActive,
                  ]}
                  onPress={() => setSupportsCreditCard(!supportsCreditCard)}
                  activeOpacity={0.8}
                >
                  <View style={styles.attrCheckIcon}>
                    <Text style={{ fontSize: 18 }}>
                      {supportsCreditCard ? '☑️' : '⬜'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.attrSettingTitle} maxFontSizeMultiplier={1.12}>
                      支援綁定信用卡扣款 (納入信用卡對帳)
                    </Text>
                    <Text style={styles.attrSettingDesc} maxFontSizeMultiplier={1.08}>
                      開啟後，記帳選擇此方式時可選取扣款信用卡，並自動納入該卡帳單對帳（如：LINE Pay、全支付、街口、Apple Pay）
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* 表單按鈕列 */}
                <View style={styles.formBtnRow}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => setIsEditing(false)}
                    disabled={isSaving}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.cancelBtnText} maxFontSizeMultiplier={1.15}>取消</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.saveBtn, isSaving && { opacity: 0.6 }]}
                    onPress={handleSave}
                    disabled={isSaving}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.saveBtnText} maxFontSizeMultiplier={1.15}>
                      {isSaving ? '儲存中...' : '儲存'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          ) : (
            /* 付款方式清單畫面 */
            <ScrollView
              style={styles.listScroll}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              {/* 操作橫條 */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.addBtn}
                  onPress={openAddForm}
                  activeOpacity={0.7}
                >
                  <Text style={styles.addBtnText} maxFontSizeMultiplier={1.15}>
                    ➕ 新增自訂付款方式
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.restoreBtn}
                  onPress={handleRestoreDefaults}
                  activeOpacity={0.7}
                >
                  <Text style={styles.restoreBtnText} maxFontSizeMultiplier={1.08}>
                    🔄 恢復預設
                  </Text>
                </TouchableOpacity>
              </View>

              {/* 說明橫條 */}
              <View style={styles.infoBanner}>
                <Text style={styles.infoBannerText} maxFontSizeMultiplier={1.08}>
                  💡 提示：點擊右側開關可自由啟用或隱藏。停用後記帳選單就不會出現該項目，保持介面清爽。
                </Text>
              </View>

              {/* 清單列表 */}
              {paymentMethods.map((method, index) => {
                const isEnabledStatus = method.is_enabled !== false;
                return (
                  <View
                    key={method.id}
                    style={[
                      styles.methodItem,
                      !isEnabledStatus && styles.methodItemDisabled,
                    ]}
                  >
                    {/* 左側圖示 */}
                    <View
                      style={[
                        styles.methodIconBox,
                        { backgroundColor: `${method.color || '#3B82F6'}18`, borderColor: `${method.color || '#3B82F6'}40` },
                      ]}
                    >
                      <Text style={styles.methodItemIcon}>{method.icon}</Text>
                    </View>

                    {/* 中間資訊 */}
                    <View style={styles.methodInfoCol}>
                      <View style={styles.methodNameRow}>
                        <Text
                          style={[
                            styles.methodItemName,
                            !isEnabledStatus && { color: '#9CA3AF' },
                          ]}
                          maxFontSizeMultiplier={1.15}
                        >
                          {method.name}
                        </Text>
                        {method.is_system && (
                          <View style={styles.sysTag}>
                            <Text style={styles.sysTagText} maxFontSizeMultiplier={1.05}>預設</Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.tagRow}>
                        {method.supports_credit_card ? (
                          <View style={styles.cardAttrTag}>
                            <Text style={styles.cardAttrTagText} maxFontSizeMultiplier={1.05}>
                              💳 支援綁卡對帳
                            </Text>
                          </View>
                        ) : (
                          <View style={styles.directAttrTag}>
                            <Text style={styles.directAttrTagText} maxFontSizeMultiplier={1.05}>
                              ⚡ 直接扣款
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* 右側操作按鈕群 */}
                    <View style={styles.methodActionCol}>
                      {/* 開關鈕 */}
                      <TouchableOpacity
                        style={[
                          styles.toggleChip,
                          isEnabledStatus ? styles.toggleChipActive : styles.toggleChipInactive,
                        ]}
                        onPress={() => togglePaymentMethodEnabled(method.id)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.toggleChipText,
                            isEnabledStatus ? styles.toggleChipTextActive : styles.toggleChipTextInactive,
                          ]}
                          maxFontSizeMultiplier={1.08}
                        >
                          {isEnabledStatus ? '✓ 啟用' : '✕ 停用'}
                        </Text>
                      </TouchableOpacity>

                      {/* 排序鈕 */}
                      <View style={styles.sortCol}>
                        <TouchableOpacity
                          disabled={index === 0}
                          style={[styles.sortBtn, index === 0 && { opacity: 0.3 }]}
                          onPress={() => handleMove(index, 'up')}
                        >
                          <Text style={styles.sortArrow}>▲</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          disabled={index === paymentMethods.length - 1}
                          style={[styles.sortBtn, index === paymentMethods.length - 1 && { opacity: 0.3 }]}
                          onPress={() => handleMove(index, 'down')}
                        >
                          <Text style={styles.sortArrow}>▼</Text>
                        </TouchableOpacity>
                      </View>

                      {/* 編輯鈕 */}
                      <TouchableOpacity
                        style={styles.iconActionBtn}
                        onPress={() => openEditForm(method)}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 15 }}>✏️</Text>
                      </TouchableOpacity>

                      {/* 刪除鈕 (自訂項目才顯示) */}
                      {!method.is_system && (
                        <TouchableOpacity
                          style={styles.iconActionBtn}
                          onPress={() => handleDelete(method)}
                          activeOpacity={0.7}
                        >
                          <Text style={{ fontSize: 15 }}>🗑️</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.88,
    minHeight: SCREEN_HEIGHT * 0.62,
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    marginLeft: 8,
  },
  closeText: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '700',
    lineHeight: 16,
  },
  listScroll: {
    flex: 1,
  },
  listContent: {
    paddingTop: 14,
    paddingBottom: 36,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  addBtn: {
    flex: 1,
    backgroundColor: '#3B82F6',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#3B82F6',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  restoreBtn: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  restoreBtnText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '600',
  },
  infoBanner: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  infoBannerText: {
    fontSize: 12,
    color: '#166534',
    lineHeight: 17,
  },
  methodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  methodItemDisabled: {
    backgroundColor: '#F9FAFB',
    borderColor: '#F3F4F6',
    opacity: 0.75,
  },
  methodIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  methodItemIcon: {
    fontSize: 22,
  },
  methodInfoCol: {
    flex: 1,
  },
  methodNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  methodItemName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
  },
  sysTag: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  sysTagText: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '600',
  },
  tagRow: {
    flexDirection: 'row',
    marginTop: 4,
    gap: 6,
  },
  cardAttrTag: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 0.5,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  cardAttrTagText: {
    fontSize: 10.5,
    color: '#1D4ED8',
    fontWeight: '600',
  },
  directAttrTag: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
    borderWidth: 0.5,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  directAttrTagText: {
    fontSize: 10.5,
    color: '#4B5563',
    fontWeight: '600',
  },
  methodActionCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  toggleChipActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  toggleChipInactive: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
  },
  toggleChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  toggleChipTextActive: {
    color: '#059669',
  },
  toggleChipTextInactive: {
    color: '#9CA3AF',
  },
  sortCol: {
    flexDirection: 'column',
    gap: 2,
  },
  sortBtn: {
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  sortArrow: {
    fontSize: 10,
    color: '#6B7280',
  },
  iconActionBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
  },
  formScroll: {
    flex: 1,
  },
  formContent: {
    paddingTop: 14,
    paddingBottom: 30,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#F9FAFB',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  iconChip: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconChipActive: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
    transform: [{ scale: 1.08 }],
  },
  iconText: {
    fontSize: 20,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  colorChip: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorChipActive: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  colorCheck: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  attrSettingCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    gap: 10,
  },
  attrSettingCardActive: {
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
  },
  attrCheckIcon: {
    marginTop: 2,
  },
  attrSettingTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  attrSettingDesc: {
    fontSize: 11.5,
    color: '#6B7280',
    marginTop: 3,
    lineHeight: 16,
  },
  formBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 24,
    gap: 12,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  saveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 10,
    backgroundColor: '#3B82F6',
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
