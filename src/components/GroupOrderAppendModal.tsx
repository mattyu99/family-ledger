import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useLedger } from '../context/LedgerContext';
import {
  getMergedOrderTags,
  recordCustomOrderTag,
  getStoreFavoriteItems,
  recordStoreFavoriteItem,
} from '../lib/orderTagsStorage';

interface GroupOrderAppendModalProps {
  visible: boolean;
  storeName: string;
  onClose: () => void;
  onAppend: (item: {
    memberName: string;
    itemName: string;
    specs: string;
    price?: number;
  }) => void;
}

export const GroupOrderAppendModal: React.FC<GroupOrderAppendModalProps> = ({
  visible,
  storeName,
  onClose,
  onAppend,
}) => {
  const { colors, isDark } = useTheme();
  const { currentUser, members } = useLedger();

  const [selectedMember, setSelectedMember] = useState<string>('');
  const [itemName, setItemName] = useState<string>('');
  const [specs, setSpecs] = useState<string>('');
  const [priceStr, setPriceStr] = useState<string>('');
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [favoriteItems, setFavoriteItems] = useState<string[]>([]);

  // 開啟彈窗時初始化資料
  useEffect(() => {
    if (visible) {
      setSelectedMember(currentUser?.display_name || members[0]?.display_name || '家人');
      setItemName('');
      setSpecs('');
      setPriceStr('');

      // 載入自學習規格標籤
      getMergedOrderTags().then(tags => setAvailableTags(tags));

      // 載入該店家的常點招牌
      if (storeName) {
        getStoreFavoriteItems(storeName).then(items => setFavoriteItems(items));
      }
    }
  }, [visible, storeName, currentUser, members]);

  // 點擊規格標籤時串接
  const handleTagPress = (tag: string) => {
    if (!specs) {
      setSpecs(tag);
    } else {
      // 若已包含則不重複串接
      if (!specs.includes(tag)) {
        setSpecs(`${specs}、${tag}`);
      }
    }
  };

  // 點擊店家常點招牌時直接帶入
  const handleFavoriteItemPress = (fav: string) => {
    // 支援格式如 "波霸紅茶拿鐵 $60"
    const m = fav.match(/^(.+?)(?:\s*[\$|\$]\s*(\d+))?$/);
    if (m) {
      setItemName(m[1].trim());
      if (m[2]) {
        setPriceStr(m[2]);
      }
    } else {
      setItemName(fav);
    }
  };

  // 確認送出登記
  const handleConfirm = async () => {
    const cleanItem = itemName.trim();
    if (!cleanItem) return;

    const priceVal = parseInt(priceStr, 10);
    const validPrice = !isNaN(priceVal) && priceVal > 0 ? priceVal : undefined;

    // 儲存新的自訂規格到本地記憶庫
    if (specs.trim()) {
      recordCustomOrderTag(specs.trim());
    }

    // 記憶為該店家的常點招牌
    if (storeName && storeName !== '點餐店家') {
      const favText = validPrice ? `${cleanItem} $${validPrice}` : cleanItem;
      recordStoreFavoriteItem(storeName, favText);
    }

    onAppend({
      memberName: selectedMember || currentUser?.display_name || '家人',
      itemName: cleanItem,
      specs: specs.trim(),
      price: validPrice,
    });

    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.backdrop}
          onPress={onClose}
        />

        <View style={[styles.dialogCard, isDark && { backgroundColor: '#1F2937', borderColor: '#374151' }]}>
          {/* 標題列 */}
          <View style={styles.headerRow}>
            <View style={styles.headerTitleGroup}>
              <Text style={styles.headerIcon}>🧋</Text>
              <Text style={[styles.headerTitle, isDark && { color: colors.text.primary }]}>
                {storeName && storeName !== '點餐店家' ? `${storeName} · 登記點單` : '我要點單 / 許願登記'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.bodyScroll} keyboardShouldPersistTaps="handled">
            {/* 1. 成員選擇列 */}
            <Text style={[styles.sectionLabel, isDark && { color: colors.text.muted }]}>點餐人 (誰要吃/喝)：</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.memberScrollRow}>
              {members.map((member: any) => {
                const isSelected = selectedMember === member.display_name;
                return (
                  <TouchableOpacity
                    key={member.id}
                    onPress={() => setSelectedMember(member.display_name)}
                    style={[
                      styles.memberPill,
                      isSelected && styles.memberPillActive,
                      isDark && {
                        backgroundColor: isSelected ? '#3B82F6' : '#374151',
                        borderColor: isSelected ? '#60A5FA' : '#4B5563',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.memberPillText,
                        isSelected && styles.memberPillTextActive,
                        isDark && { color: isSelected ? '#FFFFFF' : '#D1D5DB' },
                      ]}
                    >
                      {member.display_name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* 2. 店家歷史常點招牌 (若有) */}
            {favoriteItems.length > 0 && (
              <View style={styles.favoriteContainer}>
                <Text style={[styles.sectionLabel, { color: '#F59E0B' }]}>💡 大家常點的招牌 (點擊秒帶入)：</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagScrollRow}>
                  {favoriteItems.map((fav, idx) => (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => handleFavoriteItemPress(fav)}
                      style={[styles.favoritePill, isDark && { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: '#B45309' }]}
                    >
                      <Text style={[styles.favoritePillText, isDark && { color: '#FCD34D' }]}>{fav}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* 3. 品項名稱與金額 */}
            <View style={styles.inputRow}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={[styles.sectionLabel, isDark && { color: colors.text.muted }]}>品項名稱 *：</Text>
                <TextInput
                  value={itemName}
                  onChangeText={setItemName}
                  placeholder="例如：波霸紅茶拿鐵、雞排"
                  placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                  style={[
                    styles.textInput,
                    isDark && { backgroundColor: '#111827', color: '#F9FAFB', borderColor: '#374151' },
                  ]}
                  autoFocus
                />
              </View>

              <View style={{ width: 100 }}>
                <Text style={[styles.sectionLabel, isDark && { color: colors.text.muted }]}>預估金額：</Text>
                <TextInput
                  value={priceStr}
                  onChangeText={setPriceStr}
                  placeholder="$ 60"
                  keyboardType="numeric"
                  placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                  style={[
                    styles.textInput,
                    isDark && { backgroundColor: '#111827', color: '#F9FAFB', borderColor: '#374151' },
                  ]}
                />
              </View>
            </View>

            {/* 4. 客製規格 (甜度/冰塊/辣度) */}
            <Text style={[styles.sectionLabel, isDark && { color: colors.text.muted }]}>
              客製規格 (甜度冰塊、辣度加蒜、飯量等)：
            </Text>
            <TextInput
              value={specs}
              onChangeText={setSpecs}
              placeholder="微糖微冰、中辣加蒜、醬另外放..."
              placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
              style={[
                styles.textInput,
                isDark && { backgroundColor: '#111827', color: '#F9FAFB', borderColor: '#374151' },
                { marginBottom: 8 },
              ]}
            />

            {/* 5. 常用動態記憶膠囊 */}
            <Text style={[styles.hintText, isDark && { color: '#9CA3AF' }]}>常用快捷標籤 (點選即串接)：</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagScrollRow}>
              {availableTags.slice(0, 18).map((t, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => handleTagPress(t)}
                  style={[
                    styles.specTagPill,
                    isDark && { backgroundColor: '#374151', borderColor: '#4B5563' },
                  ]}
                >
                  <Text style={[styles.specTagPillText, isDark && { color: '#D1D5DB' }]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </ScrollView>

          {/* 底部操作按鈕 */}
          <View style={styles.footerRow}>
            <TouchableOpacity onPress={onClose} style={[styles.cancelBtn, isDark && { backgroundColor: '#374151' }]}>
              <Text style={[styles.cancelBtnText, isDark && { color: '#9CA3AF' }]}>取消</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleConfirm}
              disabled={!itemName.trim()}
              style={[
                styles.submitBtn,
                !itemName.trim() && styles.submitBtnDisabled,
              ]}
            >
              <Text style={styles.submitBtnText}>確認登記 ＋</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 20,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  headerIcon: {
    fontSize: 22,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    fontSize: 18,
    color: '#9CA3AF',
    fontWeight: '700',
  },
  bodyScroll: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
    marginBottom: 6,
  },
  memberScrollRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  memberPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 8,
  },
  memberPillActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  memberPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
  },
  memberPillTextActive: {
    color: '#2563EB',
  },
  favoriteContainer: {
    marginBottom: 12,
  },
  favoritePill: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 8,
  },
  favoritePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
  },
  inputRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  textInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: '#111827',
  },
  hintText: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 6,
  },
  tagScrollRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  specTagPill: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 6,
  },
  specTagPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  cancelBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
  submitBtn: {
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F59E0B',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
