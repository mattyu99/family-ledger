import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Alert } from 'react-native';
import { Transaction } from '../types/database';
import { useLedger } from '../context/LedgerContext';
import { getCategoryIcon } from '../lib/icons';

interface TransactionItemProps {
  transaction: Transaction;
  onPress?: (transaction: Transaction) => void;
}

export const TransactionItem: React.FC<TransactionItemProps> = ({ transaction, onPress }) => {
  const { categories, members, deleteTransaction } = useLedger();

  const category = categories.find(c => c.id === transaction.category_id);
  const payer = members.find(m => m.id === transaction.paid_by);
  const isExpense = transaction.type === 'expense';

  const date = new Date(transaction.transacted_at);
  const formattedDate = `${date.getMonth() + 1}/${date.getDate()}`;

  const handleDelete = (e: any) => {
    if (e && e.stopPropagation) {
      e.stopPropagation();
    }

    const catName = category?.name || '此筆記帳';
    const amountStr = `NT$ ${Number(transaction.amount).toLocaleString()}`;
    const payerName = payer?.display_name ? `（由「${payer.display_name}」付款）` : '';
    const noteStr = transaction.note ? `\n備註：${transaction.note}` : '';

    const confirmMsg = `確定要刪除這筆【${catName} ${amountStr}】${payerName}${noteStr} 嗎？\n刪除後無法復原。`;

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`確認刪除記帳\n\n${confirmMsg}`)) {
        deleteTransaction(transaction.id);
      }
    } else {
      Alert.alert('確認刪除記帳', confirmMsg, [
        { text: '取消', style: 'cancel' },
        {
          text: '確定刪除',
          style: 'destructive',
          onPress: () => deleteTransaction(transaction.id),
        },
      ]);
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      style={styles.card}
      onPress={() => onPress?.(transaction)}
    >
      {/* 類別圖示 */}
      <View style={[styles.iconBox, { backgroundColor: category ? `${category.color}20` : '#F3F4F6' }]}>
        <Text style={styles.iconText}>{getCategoryIcon(category?.icon)}</Text>
      </View>

      {/* 項目與細節 */}
      <View style={styles.infoBox}>
        <View style={styles.topRow}>
          <Text style={styles.categoryName}>{category?.name || '其他'}</Text>
          <Text style={[styles.amountText, isExpense ? styles.expenseColor : styles.incomeColor]}>
            {isExpense ? '-' : '+'} NT$ {Number(transaction.amount).toLocaleString()}
          </Text>
        </View>

        <View style={styles.bottomRow}>
          <Text style={styles.noteText} numberOfLines={1}>
            {transaction.note ? transaction.note : '無備註'}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.payerTag}>
              {payer?.avatar_url} {payer?.display_name || '未知成員'} 付款
            </Text>
            <Text style={styles.dateText}>{formattedDate}</Text>
          </View>
        </View>
      </View>

      {/* 編輯提示圖示 */}
      <View style={styles.editHintBtn}>
        <Text style={styles.editHintText}>✏️</Text>
      </View>

      {/* 刪除按鈕 */}
      <TouchableOpacity 
        style={styles.deleteButton}
        onPress={handleDelete}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={styles.deleteButtonText}>✕</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconText: {
    fontSize: 20,
  },
  infoBox: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  amountText: {
    fontSize: 16,
    fontWeight: '700',
  },
  expenseColor: {
    color: '#EF4444',
  },
  incomeColor: {
    color: '#10B981',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  noteText: {
    fontSize: 13,
    color: '#6B7280',
    flex: 1,
    marginRight: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  payerTag: {
    fontSize: 11,
    color: '#4B5563',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 6,
  },
  dateText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  deleteButton: {
    padding: 6,
    marginLeft: 6,
  },
  deleteButtonText: {
    color: '#D1D5DB',
    fontSize: 14,
    fontWeight: 'bold',
  },
  editHintBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    marginLeft: 6,
    opacity: 0.6,
  },
  editHintText: {
    fontSize: 14,
  },
});
