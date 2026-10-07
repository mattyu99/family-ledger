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
  Alert,
  Dimensions,
  TextProps,
  TextInputProps,
  Keyboard,
} from 'react-native';

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
import { Category, CategoryType } from '../types/database';
import { getCategoryIcon } from '../lib/icons';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const PRESET_ICONS = [
  '🍲', '🛒', '💡', '🚗', '🎬', '💊', '👶', '💰', '📈', '🐾',
  '🏠', '☕', '🛍️', '✈️', '🎮', '📚', '🎁', '🩺', '💇', '📱',
  '🧴', '🍱', '🧾', '💸', '⛽', '🐶', '🐱', '🍼', '🎂', '🏸',
  '👕', '🚌', '🏥', '🍕', '🍰', '🧹', '💻', '🚕', '🎟️', '🏊'
];

const PRESET_COLORS = [
  '#EF4444', // 紅
  '#F97316', // 橙
  '#F59E0B', // 琥珀
  '#10B981', // 綠
  '#06B6D4', // 青
  '#3B82F6', // 藍
  '#6366F1', // 靛
  '#8B5CF6', // 紫
  '#EC4899', // 粉
  '#6B7280', // 灰
];

interface CategoryManageModalProps {
  visible: boolean;
  onClose: () => void;
}

export const CategoryManageModal: React.FC<CategoryManageModalProps> = ({ visible, onClose }) => {
  const { categories, isOwner, addCategory, updateCategory, deleteCategory, transactions } = useLedger();

  const [activeType, setActiveType] = useState<CategoryType>('expense');
  const [isEditingMode, setIsEditingMode] = useState<boolean>(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // 表單狀態
  const [name, setName] = useState<string>('');
  const [icon, setIcon] = useState<string>('🍲');
  const [color, setColor] = useState<string>('#EF4444');
  const [categoryType, setCategoryType] = useState<CategoryType>('expense');
  const [isSaving, setIsSaving] = useState<boolean>(false);
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

  const handleInputFocus = (delay = 120) => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, delay);
  };

  const dynamicBottomPadding = keyboardOffset > 0
    ? (keyboardOffset + 24)
    : 30;

  // 跨平台確認彈窗
  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
        onConfirm();
      }
    } else {
      Alert.alert(title, message, [
        { text: '取消', style: 'cancel' },
        { text: '確定', onPress: onConfirm },
      ]);
    }
  };

  const showAlert = (title: string, message?: string) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        window.alert(message ? `${title}\n\n${message}` : title);
      }
    } else {
      Alert.alert(title, message);
    }
  };

  const filteredCategories = categories.filter((c) => c.type === activeType);

  const handleOpenAdd = () => {
    if (!isOwner) {
      showAlert('權限不足', '只有帳本管理員才能新增分類項目');
      return;
    }
    setEditingCategory(null);
    setName('');
    setIcon(activeType === 'expense' ? '🍲' : '💰');
    setColor(activeType === 'expense' ? '#EF4444' : '#059669');
    setCategoryType(activeType);
    setIsEditingMode(true);
  };

  const handleOpenEdit = (cat: Category) => {
    if (!isOwner) {
      showAlert('權限不足', '只有帳本管理員才能編輯分類項目');
      return;
    }
    setEditingCategory(cat);
    setName(cat.name);
    setIcon(getCategoryIcon(cat.icon));
    setColor(cat.color || '#4F46E5');
    setCategoryType(cat.type);
    setIsEditingMode(true);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      showAlert('請輸入名稱', '請輸入分類名稱');
      return;
    }

    setIsSaving(true);
    try {
      if (editingCategory) {
        // 更新現有分類
        const ok = await updateCategory(editingCategory.id, {
          name: trimmed,
          icon,
          color,
          type: categoryType,
        });
        if (ok) {
          setIsEditingMode(false);
          setEditingCategory(null);
        } else {
          showAlert('更新失敗', '儲存分類變更時發生錯誤');
        }
      } else {
        // 新增分類
        const ok = await addCategory({
          name: trimmed,
          icon,
          color,
          type: categoryType,
        });
        if (ok) {
          setIsEditingMode(false);
        } else {
          showAlert('新增失敗', '新增分類時發生錯誤');
        }
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (cat: Category) => {
    if (!isOwner) {
      showAlert('權限不足', '只有帳本管理員才能刪除分類項目');
      return;
    }

    const sameTypeCount = categories.filter((c) => c.type === cat.type).length;
    if (sameTypeCount <= 1) {
      showAlert('無法刪除', `至少需要保留一個「${cat.type === 'expense' ? '支出' : '收入'}」分類項目`);
      return;
    }

    const usedCount = transactions.filter((t) => t.category_id === cat.id).length;
    const warningMsg =
      usedCount > 0
        ? `目前已有 ${usedCount} 筆記帳紀錄使用此分類。\n\n刪除後這些紀錄不會遺失，但分類將標記為「其他」。\n確定要刪除「${cat.name}」嗎？`
        : `確定要刪除「${cat.name}」分類嗎？`;

    showConfirm('刪除分類', warningMsg, async () => {
      const res = await deleteCategory(cat.id);
      if (!res.success) {
        showAlert('刪除失敗', res.error || '刪除分類失敗');
      }
    });
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
                {isEditingMode ? (editingCategory ? '✏️ 編輯記帳分類' : '＋ 新增記帳分類') : '🏷️ 記帳分類管理'}
              </Text>
              <Text style={styles.subtitle} maxFontSizeMultiplier={1.15}>
                {isOwner
                  ? isEditingMode ? '自訂分類名稱、圖示與顏色' : '管理員可隨時新增、修改或刪除分類'
                  : '家庭成員瀏覽模式（僅管理員可增修）'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                if (isEditingMode) {
                  setIsEditingMode(false);
                  setEditingCategory(null);
                } else {
                  onClose();
                }
              }}
              style={styles.closeBtn}
            >
              <Text style={styles.closeText} maxFontSizeMultiplier={1.15}>
                {isEditingMode ? '返回' : '✕'}
              </Text>
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
            {isEditingMode ? (
              /* ===== 編輯 / 新增 表單模式 ===== */
              <View style={styles.formContainer}>
                {/* 類型切換 (支出 / 收入) */}
                <Text style={styles.inputLabel} maxFontSizeMultiplier={1.15}>分類類型</Text>
                <View style={styles.typeSelector}>
                  <TouchableOpacity
                    style={[styles.typeBtn, categoryType === 'expense' && styles.typeBtnActiveExpense]}
                    onPress={() => {
                      setCategoryType('expense');
                      if (!editingCategory) {
                        setIcon('🍲');
                        setColor('#EF4444');
                      }
                    }}
                  >
                    <Text
                      style={[styles.typeBtnText, categoryType === 'expense' && styles.typeBtnTextActive]}
                      maxFontSizeMultiplier={1.15}
                    >
                      支出分類
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.typeBtn, categoryType === 'income' && styles.typeBtnActiveIncome]}
                    onPress={() => {
                      setCategoryType('income');
                      if (!editingCategory) {
                        setIcon('💰');
                        setColor('#059669');
                      }
                    }}
                  >
                    <Text
                      style={[styles.typeBtnText, categoryType === 'income' && styles.typeBtnTextActive]}
                      maxFontSizeMultiplier={1.15}
                    >
                      收入分類
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* 分類名稱 */}
                <View style={styles.inputLabelRow}>
                  <Text style={styles.inputLabel} maxFontSizeMultiplier={1.15}>分類名稱</Text>
                  {keyboardOffset > 0 && (
                    <TouchableOpacity onPress={Keyboard.dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={styles.dismissKeyboardText} maxFontSizeMultiplier={1.08}>收起鍵盤 ▾</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <TextInput
                  style={styles.textInput}
                  placeholder="例如：寵物開銷、水電瓦斯、保險..."
                  placeholderTextColor="#9CA3AF"
                  value={name}
                  onChangeText={setName}
                  maxLength={12}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  maxFontSizeMultiplier={1.15}
                />

                {/* 代表圖示選擇 */}
                <Text style={styles.inputLabel} maxFontSizeMultiplier={1.15}>
                  代表圖示 (目前: <Text style={{ fontSize: 16 }}>{icon}</Text>)
                </Text>
                <View style={styles.iconGrid}>
                  {PRESET_ICONS.map((emoji) => (
                    <TouchableOpacity
                      key={emoji}
                      style={[styles.iconChip, icon === emoji && styles.iconChipSelected]}
                      onPress={() => setIcon(emoji)}
                    >
                      <Text style={styles.iconEmoji}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 代表顏色選擇 */}
                <Text style={styles.inputLabel} maxFontSizeMultiplier={1.15}>代表顏色</Text>
                <View style={styles.colorRow}>
                  {PRESET_COLORS.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[
                        styles.colorDot,
                        { backgroundColor: c },
                        color === c && styles.colorDotSelected,
                      ]}
                      onPress={() => setColor(c)}
                    />
                  ))}
                </View>

                {/* 儲存按鈕群 */}
                <View style={styles.btnRow}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => {
                      setIsEditingMode(false);
                      setEditingCategory(null);
                    }}
                  >
                    <Text style={styles.cancelBtnText} maxFontSizeMultiplier={1.15}>取消</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.saveBtn, isSaving && { opacity: 0.6 }]}
                    onPress={handleSave}
                    disabled={isSaving}
                  >
                    <Text style={styles.saveBtnText} maxFontSizeMultiplier={1.15}>
                      {isSaving ? '儲存中...' : (editingCategory ? '儲存修改' : '建立分類')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              /* ===== 分類清單檢視模式 ===== */
              <View style={styles.listContainer}>
                {/* 支出 / 收入 頁籤切換 */}
                <View style={styles.typeSelector}>
                  <TouchableOpacity
                    style={[styles.typeBtn, activeType === 'expense' && styles.typeBtnActiveExpense]}
                    onPress={() => setActiveType('expense')}
                  >
                    <Text
                      style={[styles.typeBtnText, activeType === 'expense' && styles.typeBtnTextActive]}
                      maxFontSizeMultiplier={1.15}
                    >
                      支出分類 ({categories.filter((c) => c.type === 'expense').length})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.typeBtn, activeType === 'income' && styles.typeBtnActiveIncome]}
                    onPress={() => setActiveType('income')}
                  >
                    <Text
                      style={[styles.typeBtnText, activeType === 'income' && styles.typeBtnTextActive]}
                      maxFontSizeMultiplier={1.15}
                    >
                      收入分類 ({categories.filter((c) => c.type === 'income').length})
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* 管理員新增分類按鈕 */}
                {isOwner && (
                  <TouchableOpacity style={styles.addCategoryBtn} onPress={handleOpenAdd}>
                    <Text style={styles.addCategoryBtnText} maxFontSizeMultiplier={1.15}>
                      ＋ 新增{activeType === 'expense' ? '支出' : '收入'}分類
                    </Text>
                  </TouchableOpacity>
                )}

                {!isOwner && (
                  <View style={styles.memberNoticeBox}>
                    <Text style={styles.memberNoticeText} maxFontSizeMultiplier={1.15}>
                      🔒 只有帳本管理員才能新增、修改或刪除分類項目
                    </Text>
                  </View>
                )}

                {/* 分類清單 */}
                <View style={styles.categoryList}>
                  {filteredCategories.map((cat) => (
                    <View key={cat.id} style={styles.categoryRow}>
                      <View style={styles.categoryRowLeft}>
                        <View style={[styles.iconBadge, { backgroundColor: `${cat.color || '#4F46E5'}20` }]}>
                          <Text style={styles.categoryRowIcon}>{getCategoryIcon(cat.icon)}</Text>
                        </View>
                        <Text style={styles.categoryRowName} numberOfLines={1} maxFontSizeMultiplier={1.15}>
                          {cat.name}
                        </Text>
                      </View>

                      {isOwner && (
                        <View style={styles.categoryRowActions}>
                          <TouchableOpacity
                            style={styles.actionBtnEdit}
                            onPress={() => handleOpenEdit(cat)}
                          >
                            <Text style={styles.actionBtnEditText} maxFontSizeMultiplier={1.15}>✏️ 編輯</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.actionBtnDelete}
                            onPress={() => handleDelete(cat)}
                          >
                            <Text style={styles.actionBtnDeleteText} maxFontSizeMultiplier={1.15}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
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
  subtitle: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  closeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  closeText: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '600',
  },
  scrollArea: {
    width: '100%',
  },
  scrollContent: {
    width: '100%',
    paddingBottom: 24,
  },
  listContainer: {
    width: '100%',
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
  typeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  typeBtnTextActive: {
    color: '#FFFFFF',
  },
  addCategoryBtn: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
    marginBottom: 12,
  },
  addCategoryBtnText: {
    color: '#4F46E5',
    fontSize: 13,
    fontWeight: '600',
  },
  memberNoticeBox: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
    alignItems: 'center',
  },
  memberNoticeText: {
    fontSize: 11,
    color: '#6B7280',
  },
  categoryList: {
    gap: 6,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  categoryRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  categoryRowIcon: {
    fontSize: 16,
  },
  categoryRowName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
  },
  categoryRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtnEdit: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  actionBtnEditText: {
    fontSize: 11,
    color: '#4B5563',
    fontWeight: '500',
  },
  actionBtnDelete: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
  },
  actionBtnDeleteText: {
    fontSize: 11,
    color: '#EF4444',
    fontWeight: 'bold',
  },
  formContainer: {
    width: '100%',
  },
  inputLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    marginTop: 8,
  },
  dismissKeyboardText: {
    fontSize: 12,
    color: '#4F46E5',
    fontWeight: '600',
    marginLeft: 'auto',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 6,
    marginTop: 8,
  },
  textInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#111827',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  iconChip: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  iconChipSelected: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  iconEmoji: {
    fontSize: 16,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 4,
  },
  colorDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  colorDotSelected: {
    borderColor: '#111827',
    transform: [{ scale: 1.15 }],
  },
  btnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '600',
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});
