import React from 'react';
import { View, Text as RNText, StyleSheet, TouchableOpacity, TextProps } from 'react-native';
import { Transaction } from '../types/database';
import { useLedger } from '../context/LedgerContext';
import { getCategoryIcon } from '../lib/icons';

const Text: React.FC<TextProps> = ({ allowFontScaling = false, maxFontSizeMultiplier = 1.08, ...rest }) => (
  <RNText
    allowFontScaling={allowFontScaling}
    maxFontSizeMultiplier={Math.min(maxFontSizeMultiplier ?? 1.08, 1.08)}
    {...rest}
  />
);

interface TransactionItemProps {
  transaction: Transaction;
  onPress?: (transaction: Transaction) => void;
}

export const TransactionItem: React.FC<TransactionItemProps> = React.memo(({ transaction, onPress }) => {
  const { getMemberById, getCategoryById } = useLedger();

  const category = getCategoryById(transaction.category_id, transaction.category);
  const payer = getMemberById(transaction.paid_by) || transaction.payer_profile;
  const isExpense = transaction.type === 'expense';

  const date = new Date(transaction.transacted_at);
  const formattedDate = `${date.getMonth() + 1}/${date.getDate()}`;

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
          <View style={styles.categoryTitleGroup}>
            <Text
              style={styles.categoryName}
              numberOfLines={1}
              ellipsizeMode="tail"
              maxFontSizeMultiplier={1.2}
            >
              {category?.name || '其他'}
            </Text>
            {!!transaction.merchant && (
              <View style={styles.merchantBadge}>
                <Text style={styles.merchantBadgeText} numberOfLines={1} maxFontSizeMultiplier={1.08}>
                  {transaction.merchant}
                </Text>
              </View>
            )}
          </View>
          <Text
            style={[styles.amountText, isExpense ? styles.expenseColor : styles.incomeColor]}
            maxFontSizeMultiplier={1.2}
          >
            {isExpense ? '-' : '+'} NT$ {Number(transaction.amount).toLocaleString()}
          </Text>
        </View>

        <View style={styles.bottomRow}>
          <Text
            style={styles.noteText}
            numberOfLines={1}
            ellipsizeMode="tail"
            maxFontSizeMultiplier={1.2}
          >
            {transaction.note ? transaction.note : '無備註'}
          </Text>
          <View style={styles.metaRow}>
            <Text
              style={styles.payerTag}
              numberOfLines={1}
              maxFontSizeMultiplier={1.2}
            >
              {payer?.avatar_url || '👤'} {payer?.display_name || '成員'}
            </Text>
            <Text
              style={styles.dateText}
              maxFontSizeMultiplier={1.2}
            >
              {formattedDate}
            </Text>
          </View>
        </View>
      </View>

      {/* 點擊編輯指示箭頭 */}
      <Text style={styles.cardArrow} maxFontSizeMultiplier={1.1}>›</Text>
    </TouchableOpacity>
  );
});

TransactionItem.displayName = 'TransactionItem';

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
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
    gap: 8,
  },
  categoryTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  categoryName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    flexShrink: 1,
  },
  merchantBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: '#E2E8F0',
    maxWidth: 100,
  },
  merchantBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  amountText: {
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 0,
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
    gap: 8,
  },
  noteText: {
    fontSize: 13,
    color: '#6B7280',
    flex: 1,
    flexShrink: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  payerTag: {
    fontSize: 11,
    color: '#4B5563',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    maxWidth: 110,
  },
  dateText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  cardArrow: {
    fontSize: 20,
    fontWeight: '300',
    color: '#CBD5E1',
    marginLeft: 6,
    marginRight: -2,
    alignSelf: 'center',
  },
});
