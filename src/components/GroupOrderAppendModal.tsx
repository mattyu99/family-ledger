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
import {
  CollaborativeOrderMode,
  extractStoreFamilyFavorites,
  extractPendingRestockItems,
  PendingRestockItem,
  StoreFavoriteItem,
  StoreFamilyFavorites,
} from '../lib/groupOrder';

interface GroupOrderAppendModalProps {
  visible: boolean;
  storeName: string;
  mode?: CollaborativeOrderMode;
  initialIsDone?: boolean;
  onClose: () => void;
  onAppend: (item: {
    memberName: string;
    itemName: string;
    specs: string;
    price?: number;
    isDone?: boolean;
  }) => void;
}

export const GroupOrderAppendModal: React.FC<GroupOrderAppendModalProps> = ({
  visible,
  storeName,
  mode = 'food',
  initialIsDone = false,
  onClose,
  onAppend,
}) => {
  const isChore = mode === 'chore';
  const isGrocery = mode === 'grocery';
  const isParcel = mode === 'parcel';
  const isVote = mode === 'vote';
  const { colors, isDark } = useTheme();
  const { currentUser, members, transactions } = useLedger();

  const [selectedMember, setSelectedMember] = useState<string>('');
  const [itemName, setItemName] = useState<string>('');
  const [specs, setSpecs] = useState<string>('');
  const [priceStr, setPriceStr] = useState<string>('');
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [favoriteItems, setFavoriteItems] = useState<string[]>([]);

  // 當選取成員或店家改變時，自全家歷史開團記事中即時萃取專屬私房招牌與全家熱門排行
  const familyFavorites: StoreFamilyFavorites = React.useMemo(() => {
    if (!visible || !storeName) {
      return { memberFavorites: [], familyTopFavorites: [] };
    }
    return extractStoreFamilyFavorites(storeName, transactions, selectedMember);
  }, [visible, storeName, selectedMember, transactions]);

  // 當處於賣場採買或網購湊單模式時，萃取家中尚未結案的「🏠 家中缺貨」待補項目
  const pendingRestockItems: PendingRestockItem[] = React.useMemo(() => {
    if (!visible || (!isGrocery && !isParcel)) return [];
    return extractPendingRestockItems(transactions);
  }, [visible, isGrocery, isParcel, transactions]);

  // 點擊家中缺貨膠囊一鍵帶入品項與規格
  const handleRestockItemPress = (item: PendingRestockItem) => {
    setItemName(item.itemName);
    setSpecs(item.specs || '缺貨補貨');
    setPriceStr(item.price > 0 ? String(item.price) : '');
    if (item.memberName && members.some((m: any) => m.display_name === item.memberName)) {
      setSelectedMember(item.memberName);
    }
  };

  // 開啟彈窗時初始化資料
  useEffect(() => {
    if (visible) {
      const defaultMember = currentUser?.display_name || members[0]?.display_name || '家人';
      setSelectedMember(defaultMember);
      setItemName('');
      setSpecs('');
      setPriceStr('');

      // 載入自學習規格標籤 (依據餐飲或採買模式分流)
      getMergedOrderTags(mode).then(tags => setAvailableTags(tags));

      // 載入該店家的本地備援招牌
      if (storeName) {
        getStoreFavoriteItems(storeName).then(items => setFavoriteItems(items));
      }
    }
  }, [visible, storeName, currentUser, members, mode]);

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

  // 點擊店家常點招牌時直接秒帶入 (支援一鍵填妥品項、規格與金額)
  const handleFavoriteItemPress = (fav: StoreFavoriteItem | string) => {
    if (typeof fav === 'string') {
      const m = fav.match(/^(.+?)(?:\s*[\$|\$]\s*(\d+))?$/);
      if (m) {
        setItemName(m[1].trim());
        if (m[2]) setPriceStr(m[2]);
      } else {
        setItemName(fav);
      }
      return;
    }

    // 完整招牌物件：品項名、預估金額與專屬規格一次全自動帶入
    setItemName(fav.itemName);
    if (fav.price > 0) {
      setPriceStr(String(fav.price));
    } else {
      setPriceStr('');
    }
    if (fav.specs) {
      setSpecs(fav.specs);
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
    if (storeName && storeName !== '點餐店家' && storeName !== '採買賣場' && storeName !== '網購包裹' && storeName !== '家庭決策') {
      const favText = validPrice ? `${cleanItem} $${validPrice}` : cleanItem;
      recordStoreFavoriteItem(storeName, favText);
    }

    if (isVote) {
      const voter = selectedMember || currentUser?.display_name || '家人';
      const fullTitle = specs.trim() ? `${cleanItem} - ${specs.trim()}` : cleanItem;
      onAppend({
        memberName: '',
        itemName: fullTitle,
        specs: `${voter} +1`,
        price: validPrice,
        isDone: initialIsDone,
      });
    } else {
      onAppend({
        memberName: isChore && !selectedMember ? '' : (selectedMember || currentUser?.display_name || '家人'),
        itemName: cleanItem,
        specs: specs.trim(),
        price: validPrice,
        isDone: initialIsDone,
      });
    }

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
              <Text style={styles.headerIcon}>
                {isVote ? '🗳️' : (isChore ? '🧹' : (isParcel ? '📦' : (isGrocery ? '🛒' : '🧋')))}
              </Text>
              <Text style={[styles.headerTitle, isDark && { color: colors.text.primary }]}>
                {storeName &&
                storeName !== '點餐店家' &&
                storeName !== '採買賣場' &&
                storeName !== '網購包裹' &&
                storeName !== '家庭任務' &&
                storeName !== '家庭決策'
                  ? `${storeName} · ${isVote ? '提案新候選' : (isChore ? '家事分工登記' : (isParcel ? '湊單/包裹登記' : (isGrocery ? '採買補貨登記' : '登記點單')))}`
                  : (isVote
                      ? '家庭投票／提案新候選'
                      : (isChore
                          ? '家事分工／任務懸賞'
                          : (isParcel ? '網購湊單／包裹登記' : (isGrocery ? '採買補貨登記' : '我要點單 / 許願登記'))))}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.bodyScroll} keyboardShouldPersistTaps="handled">
            {/* 1. 成員選擇列 */}
            <Text style={[styles.sectionLabel, isDark && { color: colors.text.muted }]}>
              {isVote
                ? '提案人 (誰提議的，送出後自動投下第 1 票)：'
                : (isChore
                    ? '認領人 (誰來做，或先留空大家搶)：'
                    : (isParcel
                        ? '登記人 (誰要買/誰的包裹)：'
                        : (isGrocery ? '採買人 (誰想買/誰需要)：' : '點餐人 (誰要吃/喝)：')))}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.memberScrollRow}>
              {isChore && (
                <TouchableOpacity
                  onPress={() => setSelectedMember('')}
                  style={[
                    styles.memberPill,
                    selectedMember === '' && styles.memberPillActive,
                    isDark && {
                      backgroundColor: selectedMember === '' ? '#F59E0B' : '#374151',
                      borderColor: selectedMember === '' ? '#FCD34D' : '#4B5563',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.memberPillText,
                      selectedMember === '' && styles.memberPillTextActive,
                      isDark && { color: selectedMember === '' ? '#FFFFFF' : '#D1D5DB' },
                    ]}
                  >
                    ✋ 待認領 (大家搶)
                  </Text>
                </TouchableOpacity>
              )}
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

            {/* 1.5 家中缺貨待補快捷帶入 (賣場採買 / 網購湊單專用) */}
            {pendingRestockItems.length > 0 && (
              <View style={styles.favoriteContainer}>
                <Text style={[styles.sectionLabel, { color: isDark ? '#34D399' : '#059669' }]}>
                  🏠 家中缺貨待補 (點擊秒帶入)：
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagScrollRow}>
                  {pendingRestockItems.map((rItem, idx) => (
                    <TouchableOpacity
                      key={`restock-${idx}`}
                      onPress={() => handleRestockItemPress(rItem)}
                      style={[
                        styles.restockPill,
                        isDark && { backgroundColor: 'rgba(16, 185, 129, 0.16)', borderColor: '#059669' },
                      ]}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.restockPillText, isDark && { color: '#6EE7B7' }]}>
                        🏠 {rItem.itemName}
                        {rItem.memberName ? ` (${rItem.memberName})` : ''}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* 2. 成員專屬私房推薦 (全家同步，點擊一鍵填妥品項、規格與金額) */}
            {familyFavorites.memberFavorites.length > 0 && (
              <View style={styles.favoriteContainer}>
                <Text style={[styles.sectionLabel, { color: isDark ? '#60A5FA' : '#2563EB' }]}>
                  💡 {selectedMember || '家人'}{' '}
                  {isParcel ? '常買的網購 (點擊秒帶入)：' : (isGrocery ? '常買的補貨 (點擊秒帶入)：' : '常點的口味 (點擊秒帶入)：')}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagScrollRow}>
                  {familyFavorites.memberFavorites.map((fav, idx) => (
                    <TouchableOpacity
                      key={`mem-${idx}`}
                      onPress={() => handleFavoriteItemPress(fav)}
                      style={[
                        styles.memberFavoriteCard,
                        isDark && { backgroundColor: 'rgba(59, 130, 246, 0.15)', borderColor: '#1E40AF' },
                      ]}
                      activeOpacity={0.7}
                    >
                      <View style={styles.favoriteCardTop}>
                        <Text style={[styles.favoriteCardName, isDark && { color: '#93C5FD' }]}>
                          {fav.itemName}
                        </Text>
                        {fav.price > 0 && (
                          <Text style={[styles.favoriteCardPrice, isDark && { color: '#34D399' }]}>
                            ${fav.price}
                          </Text>
                        )}
                      </View>
                      {!!fav.specs && (
                        <Text style={[styles.favoriteCardSpecs, isDark && { color: '#9CA3AF' }]} numberOfLines={1}>
                          👉 {fav.specs}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* 3. 全家熱銷排行 (全家同步，大家最常點/最常買 Top 6) */}
            {familyFavorites.familyTopFavorites.length > 0 && (
              <View style={styles.favoriteContainer}>
                <Text style={[styles.sectionLabel, { color: '#F59E0B' }]}>
                  {isParcel ? '🏆 全家常購/包裹範本：' : (isGrocery ? '🏆 全家常買熱銷榜：' : '🏆 全家常點熱銷榜：')}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagScrollRow}>
                  {familyFavorites.familyTopFavorites.map((fav, idx) => (
                    <TouchableOpacity
                      key={`fam-${idx}`}
                      onPress={() => handleFavoriteItemPress(fav)}
                      style={[
                        styles.favoritePill,
                        isDark && { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: '#B45309' },
                      ]}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.favoritePillText, isDark && { color: '#FCD34D' }]}>
                        {fav.itemName}{fav.price > 0 ? ` $${fav.price}` : ''}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* 4. 本地歷史快取 (新店家無全家開團歷史時之備援) */}
            {familyFavorites.memberFavorites.length === 0 &&
              familyFavorites.familyTopFavorites.length === 0 &&
              favoriteItems.length > 0 && (
                <View style={styles.favoriteContainer}>
                  <Text style={[styles.sectionLabel, { color: '#F59E0B' }]}>
                    {isGrocery ? '💡 常買的補貨 (點擊秒帶入)：' : '💡 常點的招牌 (點擊秒帶入)：'}
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagScrollRow}>
                    {favoriteItems.map((fav, idx) => (
                      <TouchableOpacity
                        key={idx}
                        onPress={() => handleFavoriteItemPress(fav)}
                        style={[styles.favoritePill, isDark && { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: '#B45309' }]}
                        activeOpacity={0.7}
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
                <Text style={[styles.sectionLabel, isDark && { color: colors.text.muted }]}>
                  {isVote ? '候選方案名稱 *：' : (isChore ? '任務名稱 *：' : '品項名稱 *：')}
                </Text>
                <TextInput
                  value={itemName}
                  onChangeText={setItemName}
                  placeholder={
                    isVote
                      ? '例如：鼎泰豐小籠包、藏壽司、宜蘭泡湯'
                      : (isChore
                          ? '例如：擦窗戶、刷馬桶、洗紗窗、洗車'
                          : (isParcel
                              ? '例如：全家包裹、濕紙巾箱購、貓砂'
                              : (isGrocery ? '例如：全脂鮮奶、衛生紙、牛小排' : '例如：波霸紅茶拿鐵、雞排')))
                  }
                  placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                  style={[
                    styles.textInput,
                    isDark && { backgroundColor: '#111827', color: '#F9FAFB', borderColor: '#374151' },
                  ]}
                  autoFocus
                />
              </View>

              <View style={{ width: 100 }}>
                <Text style={[styles.sectionLabel, isDark && { color: colors.text.muted }]}>
                  {isVote ? '預估人均：' : (isChore ? '懸賞金額：' : '預估金額：')}
                </Text>
                <TextInput
                  value={priceStr}
                  onChangeText={setPriceStr}
                  placeholder={isVote ? '$ 500' : (isChore ? '$ 50' : '$ 60')}
                  keyboardType="numeric"
                  placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                  style={[
                    styles.textInput,
                    isDark && { backgroundColor: '#111827', color: '#F9FAFB', borderColor: '#374151' },
                  ]}
                />
              </View>
            </View>

            {/* 4. 客製規格 */}
            <Text style={[styles.sectionLabel, isDark && { color: colors.text.muted }]}>
              {isVote
                ? '補充說明／理由 (選填，如評價、需訂位、包廂等)：'
                : (isChore
                    ? '任務備註 (客廳、浴室、加碼獎勵、週末前完成等)：'
                    : (isParcel
                        ? '包裹／湊單備註 (末三碼、已付款免付、貨到付款、取貨超商等)：'
                        : (isGrocery
                            ? '規格備註 (數量、容量、品牌、特價才買等)：'
                            : '客製規格 (甜度冰塊、辣度加蒜、飯量等)：')))}
            </Text>
            <TextInput
              value={specs}
              onChangeText={setSpecs}
              placeholder={
                isVote
                  ? '例如：評價4.8星、需要先訂位、小孩最愛...'
                  : (isChore
                      ? '例如：客廳、加碼獎勵、週末前完成...'
                      : (isParcel
                          ? '例如：末三碼123、已付款免付、7-11取貨、湊免運...'
                          : (isGrocery ? '例如：2瓶、家庭號、特價才買、低脂...' : '微糖微冰、中辣加蒜、醬另外放...')))
              }
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
              <Text style={styles.submitBtnText}>
                {isVote
                  ? '確認提議候選 ＋'
                  : (isChore
                      ? '確認加入任務 ＋'
                      : (isParcel ? '確認加入看板 ＋' : (isGrocery ? '確認放入清單 ＋' : '確認登記 ＋')))}
              </Text>
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
  memberFavoriteCard: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 8,
    minWidth: 110,
  },
  favoriteCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  favoriteCardName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  favoriteCardPrice: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
  },
  favoriteCardSpecs: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
    maxWidth: 160,
  },
  favoritePill: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
  },
  favoritePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
  },
  restockPill: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#6EE7B7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
  },
  restockPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
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
