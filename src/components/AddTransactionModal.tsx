import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLedger } from '../context/LedgerContext';
import { TransactionType } from '../types/database';

interface AddTransactionModalProps {
  visible: boolean;
  onClose: () => void;
}

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({ visible, onClose }) => {
  const { categories, members, currentUser, addTransaction, isDeviceBound } = useLedger();

  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(categories[0]?.id || '');
  const [paidBy, setPaidBy] = useState<string>(currentUser.id);
  const [note, setNote] = useState<string>('');
  const [isSplit, setIsSplit] = useState<boolean>(true);

  React.useEffect(() => {
    if (isDeviceBound) {
      setPaidBy(currentUser.id);
    }
  }, [visible, currentUser, isDeviceBound]);

  const availableCategories = categories.filter(c => c.type === type);

  const handleSubmit = async () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert('請輸入有效金額');
      return;
    }

    await addTransaction({
      amount: numAmount,
      type,
      category_id: selectedCategoryId || availableCategories[0]?.id || '',
      paid_by: isDeviceBound ? currentUser.id : paidBy,
      note,
      splitWithIds: isSplit && type === 'expense' ? members.map(m => m.id) : undefined,
    });

    // 重設表單並關閉
    setAmount('');
    setNote('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          {/* 頂部把手與標題 */}
          <View style={styles.header}>
            <Text style={styles.title}>新增一筆記帳</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* 支出 / 收入 切換鈕 */}
            <View style={styles.typeSelector}>
              <TouchableOpacity
                style={[styles.typeBtn, type === 'expense' && styles.typeBtnActiveExpense]}
                onPress={() => {
                  setType('expense');
                  const first = categories.find(c => c.type === 'expense');
                  if (first) setSelectedCategoryId(first.id);
                }}
              >
                <Text style={[styles.typeBtnText, type === 'expense' && styles.typeBtnTextActive]}>
                  支出
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.typeBtn, type === 'income' && styles.typeBtnActiveIncome]}
                onPress={() => {
                  setType('income');
                  const first = categories.find(c => c.type === 'income');
                  if (first) setSelectedCategoryId(first.id);
                }}
              >
                <Text style={[styles.typeBtnText, type === 'income' && styles.typeBtnTextActive]}>
                  收入
                </Text>
              </TouchableOpacity>
            </View>

            {/* 金額輸入 */}
            <View style={styles.amountContainer}>
              <Text style={styles.currencyPrefix}>NT$</Text>
              <TextInput
                style={styles.amountInput}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#D1D5DB"
                value={amount}
                onChangeText={setAmount}
                autoFocus
              />
            </View>

            {/* 分類選擇 */}
            <Text style={styles.sectionLabel}>選擇分類</Text>
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
                    <Text style={styles.categoryChipIcon}>{cat.icon}</Text>
                    <Text
                      style={[
                        styles.categoryChipText,
                        isSelected && { color: cat.color, fontWeight: '700' },
                      ]}
                    >
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 付款人選擇 */}
            <Text style={styles.sectionLabel}>誰先付款 / 代墊</Text>
            {isDeviceBound ? (
              <View style={styles.lockedPayerBox}>
                <Text style={styles.lockedPayerAvatar}>{currentUser.avatar_url}</Text>
                <View style={styles.lockedPayerContent}>
                  <Text style={styles.lockedPayerName}>{currentUser.display_name} (本手機專用)</Text>
                  <Text style={styles.lockedPayerHint}>🔒 本裝置已綁定，免選付款人自動記入</Text>
                </View>
              </View>
            ) : (
              <View style={styles.payerRow}>
                {members.map(member => {
                  const isSelected = paidBy === member.id;
                  return (
                    <TouchableOpacity
                      key={member.id}
                      style={[styles.payerChip, isSelected && styles.payerChipActive]}
                      onPress={() => setPaidBy(member.id)}
                    >
                      <Text style={styles.payerAvatar}>{member.avatar_url}</Text>
                      <Text style={[styles.payerName, isSelected && styles.payerNameActive]}>
                        {member.display_name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* 全家平分分攤切換（僅在支出時顯示） */}
            {type === 'expense' && (
              <TouchableOpacity
                style={styles.splitToggleRow}
                onPress={() => setIsSplit(!isSplit)}
              >
                <View>
                  <Text style={styles.splitTitle}>👨‍👩‍👧 全家平分分攤</Text>
                  <Text style={styles.splitSubtitle}>
                    {isSplit
                      ? `此筆支出由 ${members.length} 位家庭成員均分`
                      : '僅記錄為個人花費，不計入分攤代墊'}
                  </Text>
                </View>
                <View style={[styles.toggleSwitch, isSplit && styles.toggleSwitchActive]}>
                  <View style={[styles.toggleCircle, isSplit && styles.toggleCircleActive]} />
                </View>
              </TouchableOpacity>
            )}

            {/* 備註輸入 */}
            <Text style={styles.sectionLabel}>備註說明</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="例如：好市多牛肉、加滿油、水電費..."
              placeholderTextColor="#9CA3AF"
              value={note}
              onChangeText={setNote}
            />

            {/* 儲存按鈕 */}
            <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
              <Text style={styles.submitBtnText}>儲存記帳</Text>
            </TouchableOpacity>
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
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  closeBtn: {
    padding: 6,
  },
  closeText: {
    fontSize: 18,
    color: '#9CA3AF',
    fontWeight: 'bold',
  },
  typeSelector: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
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
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  typeBtnTextActive: {
    color: '#FFFFFF',
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderColor: '#E5E7EB',
    paddingVertical: 10,
    marginBottom: 20,
  },
  currencyPrefix: {
    fontSize: 24,
    fontWeight: '700',
    color: '#374151',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: 'bold',
    color: '#111827',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 10,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  categoryChipIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  categoryChipText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },
  payerRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  payerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  payerChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  payerAvatar: {
    fontSize: 16,
    marginRight: 6,
  },
  payerName: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '500',
  },
  payerNameActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  splitToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  splitTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  splitSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  toggleSwitch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#CBD5E1',
    padding: 2,
    justifyContent: 'center',
  },
  toggleSwitchActive: {
    backgroundColor: '#4F46E5',
  },
  toggleCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  toggleCircleActive: {
    alignSelf: 'flex-end',
  },
  noteInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    marginBottom: 24,
  },
  submitBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  lockedPayerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
    marginBottom: 20,
  },
  lockedPayerAvatar: {
    fontSize: 26,
    marginRight: 12,
  },
  lockedPayerContent: {
    flex: 1,
  },
  lockedPayerName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#3730A3',
  },
  lockedPayerHint: {
    fontSize: 12,
    color: '#6366F1',
    marginTop: 2,
  },
});
