import React, { useState, useEffect } from 'react';
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
import { Transaction, TransactionType } from '../types/database';
import { getCategoryIcon } from '../lib/icons';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface EditTransactionModalProps {
  visible: boolean;
  transaction: Transaction | null;
  onClose: () => void;
}

export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({
  visible,
  transaction,
  onClose,
}) => {
  const { categories, members, currentUser, updateTransaction, deleteTransaction, getMemberById, getCategoryById } = useLedger();

  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [paidBy, setPaidBy] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [transactedAt, setTransactedAt] = useState<string>('');

  const availableCategories = categories.filter(c => c.type === type);

  // 當 transaction 或 visible 改變時同步資料
  useEffect(() => {
    if (visible && transaction) {
      setType(transaction.type);
      setAmount(transaction.amount ? String(transaction.amount) : '');
      const cat = getCategoryById(transaction.category_id, transaction.category);
      const match = categories.find(c => c.id === cat.id || c.name === cat.name) || categories[0];
      setSelectedCategoryId(match?.id || transaction.category_id || '');
      const canonicalPayer = getMemberById(transaction.paid_by);
      setPaidBy(canonicalPayer ? canonicalPayer.id : (transaction.paid_by || ''));
      setNote(transaction.note || '');
      setTransactedAt(transaction.transacted_at || new Date().toISOString());
    }
  }, [visible, transaction, getMemberById, categories, getCategoryById]);

  const origDate = transaction?.transacted_at ? new Date(transaction.transacted_at) : new Date();
  const origDateFormatted = `${origDate.getMonth() + 1}/${origDate.getDate()}`;

  const curDate = transactedAt ? new Date(transactedAt) : origDate;
  const isOriginal = Math.abs(curDate.getTime() - origDate.getTime()) < 60000;

  const today = new Date();
  const isToday = curDate.toDateString() === today.toDateString();

  // 切換支出/收入時，若當前分類不符，自動調整至該類型的第一個分類
  useEffect(() => {
    if (visible) {
      const activeCats = categories.filter(c => c.type === type);
      if (activeCats.length > 0 && !activeCats.some(c => c.id === selectedCategoryId)) {
        setSelectedCategoryId(activeCats[0].id);
      }
    }
  }, [type, visible, categories, selectedCategoryId]);

  const handleSubmit = async () => {
    if (!transaction) return;

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert('請輸入有效金額');
      return;
    }

    const currentCats = categories.filter(c => c.type === type);
    const targetCategory = currentCats.find(c => c.id === selectedCategoryId) || currentCats[0];
    const canonicalPayer = getMemberById(transaction.paid_by);
    const targetPayer = paidBy || canonicalPayer?.id || currentUser.id || members[0]?.id;

    if (!targetCategory) {
      alert('請先選擇記帳分類');
      return;
    }

    try {
      const success = await updateTransaction(transaction.id, {
        amount: numAmount,
        type,
        category_id: targetCategory.id,
        paid_by: targetPayer,
        note,
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

    if (Platform.OS === 'web') {
      if (window.confirm('確定要刪除這筆記帳紀錄嗎？')) {
        deleteTransaction(transaction.id);
        onClose();
      }
    } else {
      Alert.alert('刪除記帳', '確定要刪除這筆記帳紀錄嗎？', [
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
              <Text style={styles.title} maxFontSizeMultiplier={1.15}>✏️ 編輯記帳明細</Text>
              <Text style={styles.headerDateBadge} maxFontSizeMultiplier={1.15}>
                記帳日期：{curDate.getMonth() + 1}/{curDate.getDate()}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText} maxFontSizeMultiplier={1.15}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollArea}>
            {/* 類型切換 (支出 / 收入) */}
            <View style={styles.typeToggle}>
              <TouchableOpacity
                style={[styles.typeBtn, type === 'expense' && styles.typeBtnActive]}
                onPress={() => setType('expense')}
              >
                <Text
                  style={[styles.typeText, type === 'expense' && styles.typeTextActive]}
                  maxFontSizeMultiplier={1.15}
                >
                  支出
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, type === 'income' && styles.typeBtnActiveIncome]}
                onPress={() => setType('income')}
              >
                <Text
                  style={[styles.typeText, type === 'income' && styles.typeTextActive]}
                  maxFontSizeMultiplier={1.15}
                >
                  收入
                </Text>
              </TouchableOpacity>
            </View>

            {/* 金額輸入 */}
            <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>金額 (TWD)</Text>
            <View style={styles.amountContainer}>
              <Text style={styles.currencySymbol} maxFontSizeMultiplier={1.15}>$</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="0"
                placeholderTextColor="#D1D5DB"
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
                autoFocus={false}
                maxFontSizeMultiplier={1.15}
              />
            </View>

            {/* 分類選擇 */}
            <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>分類</Text>
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
            <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>誰先付款 / 代墊</Text>
            <View style={styles.payerRow}>
              {members.map(member => {
                const isSelected = paidBy === member.id;
                const isMe =
                  member.id === currentUser.id ||
                  (!!currentUser.display_name && currentUser.display_name === member.display_name);
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
                      {member.display_name}
                      {isMe ? ' (我)' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 記帳日期調整 */}
            <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>記帳日期</Text>
            <View style={styles.dateRow}>
              <TouchableOpacity
                style={[styles.dateChip, isOriginal && styles.dateChipActive]}
                onPress={() => setTransactedAt(transaction.transacted_at)}
              >
                <Text
                  style={[styles.dateChipText, isOriginal && styles.dateChipTextActive]}
                  maxFontSizeMultiplier={1.15}
                >
                  📅 原日期 ({origDateFormatted})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.dateChip, isToday && !isOriginal && styles.dateChipActive]}
                onPress={() => setTransactedAt(new Date().toISOString())}
              >
                <Text
                  style={[styles.dateChipText, isToday && !isOriginal && styles.dateChipTextActive]}
                  maxFontSizeMultiplier={1.15}
                >
                  今天 ({today.getMonth() + 1}/{today.getDate()})
                </Text>
              </TouchableOpacity>
            </View>

            {/* 備註說明 */}
            <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.15}>備註說明</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="例如：好市多牛肉、加滿油、水電費..."
              placeholderTextColor="#9CA3AF"
              value={note}
              onChangeText={setNote}
              maxFontSizeMultiplier={1.15}
            />

            {/* 操作按鈕群 */}
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
                <Text style={styles.deleteBtnText} maxFontSizeMultiplier={1.15}>🗑️ 刪除紀錄</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
                <Text style={styles.submitBtnText} maxFontSizeMultiplier={1.15}>儲存修改</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
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
  },
  currencySymbol: {
    fontSize: 18,
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
    height: 34,
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
  dateRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  dateChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  dateChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
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
});
