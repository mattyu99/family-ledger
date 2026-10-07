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
} from 'react-native';
import { PaymentAccount, AccountType } from '../types/database';
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
}

export const PaymentAccountsManageModal: React.FC<PaymentAccountsManageModalProps> = ({
  visible,
  onClose,
}) => {
  const { paymentAccounts, addPaymentAccount, updatePaymentAccount, deletePaymentAccount, restoreDefaultAccounts, members, currentUser, isOwner } = useLedger();

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [keyboardOffset, setKeyboardOffset] = useState<number>(0);
  const formScrollRef = useRef<ScrollView>(null);

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
      formScrollRef.current?.scrollToEnd({ animated: true });
    }, delay);
  };

  const dynamicBottomPadding = keyboardOffset > 0
    ? (Platform.OS === 'ios' ? 40 : keyboardOffset + 90)
    : 30;

  // 表單狀態
  const [formType, setFormType] = useState<AccountType>('credit_card');
  const [formName, setFormName] = useState<string>('');
  const [formUserId, setFormUserId] = useState<string>(currentUser.id);
  const [formLastFour, setFormLastFour] = useState<string>('');
  const [formCycleDate, setFormCycleDate] = useState<string>('15');
  const [formBalance, setFormBalance] = useState<string>('0');
  const [formColor, setFormColor] = useState<string>(COLOR_PALETTE[0]);

  const creditCards = paymentAccounts.filter(a => a.type === 'credit_card');
  const storedValueCards = paymentAccounts.filter(a => a.type === 'stored_value');

  const handleOpenAdd = (type: AccountType) => {
    if (!isOwner) {
      showAlert('權限不足', '只有帳本管理員才能新增支付卡片與帳戶');
      return;
    }
    setIsEditing(true);
    setEditingId(null);
    setFormType(type);
    setFormName(type === 'credit_card' ? '富邦 Costco 卡' : '悠遊卡');
    setFormUserId(currentUser.id);
    setFormLastFour('');
    setFormCycleDate('15');
    setFormBalance('0');
    setFormColor(type === 'credit_card' ? COLOR_PALETTE[0] : COLOR_PALETTE[4]);
  };

  const handleOpenEdit = (acc: PaymentAccount) => {
    if (!isOwner) {
      showAlert('權限不足', '只有帳本管理員才能編輯支付卡片與帳戶');
      return;
    }
    setIsEditing(true);
    setEditingId(acc.id);
    setFormType(acc.type);
    setFormName(acc.name);
    setFormUserId(acc.user_id || currentUser.id);
    setFormLastFour(acc.last_four_digits || '');
    setFormCycleDate(String(acc.billing_cycle_date || 15));
    setFormBalance(String(acc.balance || 0));
    setFormColor(acc.color || COLOR_PALETTE[0]);
  };

  const handleSaveForm = async () => {
    if (!isOwner) {
      showAlert('權限不足', '只有帳本管理員才能儲存卡片設定');
      return;
    }
    const cleanName = formName.trim();
    if (!cleanName) {
      showAlert('提示', '請輸入卡片或帳戶名稱');
      return;
    }

    const cycleNum = parseInt(formCycleDate, 10);
    const validCycle = isNaN(cycleNum) ? 15 : Math.max(1, Math.min(31, cycleNum));
    const balanceNum = parseFloat(formBalance) || 0;

    if (editingId) {
      await updatePaymentAccount(editingId, {
        name: cleanName,
        type: formType,
        user_id: formUserId,
        last_four_digits: formLastFour.trim() || undefined,
        billing_cycle_date: formType === 'credit_card' ? validCycle : undefined,
        balance: formType === 'stored_value' ? balanceNum : 0,
        color: formColor,
      });
    } else {
      await addPaymentAccount({
        name: cleanName,
        type: formType,
        user_id: formUserId,
        last_four_digits: formLastFour.trim() || undefined,
        billing_cycle_date: formType === 'credit_card' ? validCycle : undefined,
        balance: formType === 'stored_value' ? balanceNum : 0,
        color: formColor,
        icon: formType === 'credit_card' ? '💳' : '🚌',
        sort_order: paymentAccounts.length + 1,
      });
    }

    setIsEditing(false);
    setEditingId(null);
  };

  const handleDelete = (acc: PaymentAccount) => {
    if (!isOwner) {
      showAlert('權限不足', '只有帳本管理員才能刪除支付卡片與帳戶');
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
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[
          styles.sheet,
          keyboardOffset > 0 && { maxHeight: Math.min(SCREEN_HEIGHT * 0.95, 780), minHeight: undefined }
        ]}>
          {/* 標頭 */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} maxFontSizeMultiplier={1.15}>
                {isOwner ? '💳 管理家庭卡片與帳戶' : '💳 家庭卡片與帳戶一覽'}
              </Text>
              <Text style={styles.subtitle} maxFontSizeMultiplier={1.15}>
                {isOwner
                  ? '設定全家的信用卡（含結帳日）與悠遊卡'
                  : '家庭成員瀏覽模式（僅帳本管理員可新增、修改或刪除卡片）'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText} maxFontSizeMultiplier={1.15}>✕</Text>
            </TouchableOpacity>
          </View>

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
                  {editingId ? '編輯卡片設定' : '新增卡片或帳戶'}
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
                  onPress={() => setFormType('credit_card')}
                >
                  <Text style={[styles.typeBtnText, formType === 'credit_card' && styles.typeBtnTextActive]}>
                    💳 信用卡
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeBtn, formType === 'stored_value' && styles.typeBtnActive]}
                  onPress={() => setFormType('stored_value')}
                >
                  <Text style={[styles.typeBtnText, formType === 'stored_value' && styles.typeBtnTextActive]}>
                    🚌 悠遊卡 / 儲值卡
                  </Text>
                </TouchableOpacity>
              </View>

              {/* 卡片名稱 */}
              <Text style={styles.fieldLabel}>卡片名稱</Text>
              <TextInput
                style={styles.textInput}
                value={formName}
                onChangeText={setFormName}
                placeholder={formType === 'credit_card' ? '例如：富邦 Costco 聯名卡' : '例如：爸爸悠遊卡'}
                onFocus={() => handleInputFocus()}
                returnKeyType="next"
              />

              {/* 持卡人 */}
              <Text style={styles.fieldLabel}>持卡人 / 歸屬家庭成員</Text>
              <View style={styles.memberChipsRow}>
                {members.map(m => {
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
                    onFocus={() => handleInputFocus()}
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
                    onFocus={() => handleInputFocus()}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  <Text style={styles.fieldHint}>
                    💡 設定結帳日後，每月對帳時系統會精確鎖定上月{parseInt(formCycleDate, 10) + 1 || 16}日到本月{formCycleDate || 15}日的帳單消費。
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
                    onFocus={() => handleInputFocus()}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                </>
              )}

              {/* 卡片顏色 */}
              <Text style={styles.fieldLabel}>卡片識別顏色</Text>
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
              {!isOwner && (
                <View style={styles.memberNoticeBox}>
                  <Text style={styles.memberNoticeText} maxFontSizeMultiplier={1.15}>
                    🔒 只有帳本管理員才能新增、修改或刪除卡片與帳戶
                  </Text>
                </View>
              )}

              {/* 信用卡區塊 */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>💳 信用卡清單 ({creditCards.length})</Text>
                {isOwner && (
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
                <Text style={styles.emptyNotice}>尚未設定信用卡</Text>
              ) : (
                creditCards.map(card => {
                  const cardholder = members.find(m => m.id === card.user_id);
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
                          {cardholder ? `${cardholder.avatar_url || '👤'} ${cardholder.display_name} · ` : ''}
                          每月 {card.billing_cycle_date || 15} 號結帳
                        </Text>
                      </View>
                      {isOwner && (
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

              {/* 悠遊卡/儲值卡區塊 */}
              <View style={[styles.sectionHeaderRow, { marginTop: 20 }]}>
                <Text style={styles.sectionTitle}>🚌 悠遊卡 / 儲值卡 ({storedValueCards.length})</Text>
                {isOwner && (
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
                <Text style={styles.emptyNotice}>尚未設定儲值卡</Text>
              ) : (
                storedValueCards.map(card => {
                  const cardholder = members.find(m => m.id === card.user_id);
                  return (
                    <View key={card.id} style={[styles.cardItemRow, { borderLeftColor: card.color || '#0284C7' }]}>
                      <View style={styles.cardInfoCol}>
                        <View style={styles.cardNameRow}>
                          <Text style={styles.cardNameText}>{card.name}</Text>
                          <Text style={styles.balanceTag}>餘額: NT$ {Number(card.balance).toLocaleString()}</Text>
                        </View>
                        <Text style={styles.cardSubText}>
                          {cardholder ? `${cardholder.avatar_url || '👤'} ${cardholder.display_name}` : '全家通用'}
                        </Text>
                      </View>
                      {isOwner && (
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
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.9,
    minHeight: SCREEN_HEIGHT * 0.65,
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  closeText: {
    fontSize: 18,
    color: '#94A3B8',
  },
  listScroll: {
    flex: 1,
    marginTop: 12,
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
    color: '#1E293B',
  },
  addMiniBtn: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  addMiniText: {
    color: '#4F46E5',
    fontSize: 11.5,
    fontWeight: '700',
  },
  emptyNotice: {
    fontSize: 12,
    color: '#94A3B8',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  cardItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    color: '#0F172A',
  },
  tagBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  tagBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  balanceTag: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
  },
  cardSubText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  cardActionGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  editBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
  },
  editText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  delBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#FEE2E2',
    borderRadius: 6,
  },
  delText: {
    fontSize: 11,
    color: '#DC2626',
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
    color: '#4F46E5',
    fontWeight: '600',
    marginLeft: 'auto',
  },
  formSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  typeToggle: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
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
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  typeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  typeBtnTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
    marginTop: 8,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
  },
  fieldHint: {
    fontSize: 10.5,
    color: '#64748B',
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
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  memberChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  memberChipAvatar: {
    fontSize: 12,
  },
  memberChipName: {
    fontSize: 11.5,
    color: '#475569',
  },
  memberChipNameActive: {
    color: '#4F46E5',
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
    borderColor: '#0F172A',
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
    borderColor: '#CBD5E1',
    alignItems: 'center',
  },
  cancelFormText: {
    color: '#64748B',
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
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreDefaultsText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  memberNoticeBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  memberNoticeText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
});

