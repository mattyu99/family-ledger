import React from 'react';
import { View, Text as RNText, StyleSheet, TouchableOpacity, TextProps, Linking } from 'react-native';
import { Transaction } from '../types/database';
import { useLedger } from '../context/LedgerContext';
import { getCategoryIcon } from '../lib/icons';
import { formatPaymentLabel, parseExpenseDiscount } from '../lib/payment';
import { parseMemoNote, decodeMemoMerchantTag, parseMemoChecklist } from '../lib/memo';
import { formatMemoReminderBadge } from '../lib/lunar';

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
  onCompleteMemo?: (transaction: Transaction) => void;
}

export const TransactionItem: React.FC<TransactionItemProps> = React.memo(({ transaction, onPress, onCompleteMemo }) => {
  const { getMemberById, getCategoryById, getAccountById, paymentMethods, toggleMemoSettled, toggleMemoChecklistItem, transactions } = useLedger();

  const category = getCategoryById(transaction.category_id, transaction.category);
  const payer = getMemberById(transaction.paid_by) || transaction.payer_profile;
  const isExpense = transaction.type === 'expense';

  const date = new Date(transaction.transacted_at);
  const formattedDate = `${date.getMonth() + 1}/${date.getDate()}`;

  const account = transaction.payment_account || (transaction.account_id ? getAccountById(transaction.account_id) : undefined);
  const paymentLabel = formatPaymentLabel(transaction.payment_method, account, paymentMethods);

  if (transaction.type === 'memo') {
    const isCompleted = !!transaction.is_settled;
    const decodedMerchant = decodeMemoMerchantTag(transaction.merchant);
    const reminderDate = transaction.reminder_date || decodedMerchant.reminderDate;
    const reminderCal = transaction.reminder_calendar || decodedMerchant.reminderCalendar;
    const reminderRep = transaction.reminder_repeat || decodedMerchant.reminderRepeat;
    const reminderBadge = formatMemoReminderBadge(reminderDate, reminderCal, reminderRep);
    const memoData = parseMemoNote(transaction.note, category?.name, getCategoryIcon(category?.icon));
    const checklistData = parseMemoChecklist(memoData.cleanContent);
    const checklistProgressPercent = checklistData.totalCount > 0
      ? (checklistData.completedCount / checklistData.totalCount) * 100
      : 0;
    const completer = transaction.completed_by ? getMemberById(transaction.completed_by) : undefined;
    const linkedExpense = transaction.linked_transaction_id ? transactions.find(t => t.id === transaction.linked_transaction_id && t.type !== 'memo') : undefined;

    // 正文超連結自動識別與點擊開啟支援
    const renderContentWithLinks = (content: string, isCompleted: boolean) => {
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const parts = content.split(urlRegex);
      if (parts.length === 1) {
        return content;
      }
      return parts.map((part, index) => {
        if (part.match(urlRegex)) {
          return (
            <Text
              key={index}
              style={[styles.linkText, isCompleted && styles.linkTextCompleted]}
              onPress={(e: any) => {
                e?.stopPropagation?.();
                Linking.openURL(part).catch(() => {});
              }}
            >
              {part}
            </Text>
          );
        }
        return part;
      });
    };

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        style={[styles.memoCard, isCompleted && styles.memoCardCompleted]}
        onPress={() => onPress?.(transaction)}
      >
        <View style={styles.memoHeaderRow}>
          <View style={styles.memoHeaderLeft}>
            {/* 一鍵待辦完成 / 取消核取按鈕 */}
            <TouchableOpacity
              style={[styles.memoCheckbox, isCompleted && styles.memoCheckboxChecked]}
              onPress={(e) => {
                e.stopPropagation?.();
                if (isCompleted) {
                  toggleMemoSettled?.(transaction.id);
                } else if (onCompleteMemo) {
                  onCompleteMemo(transaction);
                } else {
                  toggleMemoSettled?.(transaction.id);
                }
              }}
              activeOpacity={0.6}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.memoCheckboxIcon, isCompleted && styles.memoCheckboxIconChecked]}>
                {isCompleted ? '✓' : ''}
              </Text>
            </TouchableOpacity>

            <View style={[styles.memoIconBadge, isCompleted && styles.memoIconBadgeCompleted]}>
              <Text style={styles.memoIconText}>{memoData.icon}</Text>
            </View>
            <Text
              style={[styles.memoTitleText, isCompleted && styles.memoTitleTextCompleted]}
              allowFontScaling={false}
              maxFontSizeMultiplier={1.08}
            >
              {memoData.title}
            </Text>
            {isCompleted ? (
              <View style={styles.memoCompletedBadge}>
                <Text style={styles.memoCompletedBadgeText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                  ✓ {completer?.display_name ? `${completer.display_name} 辦妥` : '已辦妥'}
                </Text>
              </View>
            ) : (
              !!reminderDate && (
                <View style={styles.memoReminderBadge}>
                  <Text style={styles.memoReminderBadgeText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                    {reminderBadge?.isLunar ? '🏮 ' : '⏰ '}{reminderBadge?.fullText || `提醒：${reminderDate}`}
                  </Text>
                </View>
              )
            )}
          </View>
          <Text style={[styles.memoDateText, isCompleted && styles.memoDateTextCompleted]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
            {formattedDate}
          </Text>
        </View>

        {checklistData.isChecklist ? (
          <View style={{ marginBottom: 8 }}>
            {/* 檢核進度條 */}
            <View style={styles.checklistProgressRow}>
              <View style={styles.checklistProgressBarBg}>
                <View
                  style={[
                    styles.checklistProgressBarFill,
                    {
                      width: `${checklistProgressPercent}%`,
                      backgroundColor: checklistProgressPercent === 100 ? '#10B981' : '#3B82F6',
                    },
                  ]}
                />
              </View>
              <Text
                style={[
                  styles.checklistProgressText,
                  { color: checklistProgressPercent === 100 ? '#059669' : '#2563EB' },
                ]}
                allowFontScaling={false}
                maxFontSizeMultiplier={1.08}
              >
                {checklistData.completedCount}/{checklistData.totalCount} ({Math.round(checklistProgressPercent)}%)
              </Text>
            </View>

            {/* 前綴說明文字 (若有) */}
            {!!checklistData.prefixText && (
              <Text
                style={[styles.memoContentText, isCompleted && styles.memoContentTextCompleted, { marginBottom: 6 }]}
                allowFontScaling={false}
                maxFontSizeMultiplier={1.1}
              >
                {renderContentWithLinks(checklistData.prefixText, isCompleted)}
              </Text>
            )}

            {/* 互動式清單項目列表 */}
            <View style={styles.checklistContainer}>
              {checklistData.items.map((item) => {
                const itemDone = item.completed;
                return (
                  <TouchableOpacity
                    key={item.index}
                    style={[styles.checklistItemRow, itemDone && styles.checklistItemRowCompleted]}
                    activeOpacity={0.7}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      toggleMemoChecklistItem(transaction.id, item.index);
                    }}
                  >
                    <View style={[styles.checklistItemBox, itemDone && styles.checklistItemBoxChecked]}>
                      {itemDone && <Text style={styles.checklistItemCheckIcon}>✓</Text>}
                    </View>
                    <Text
                      style={[styles.checklistItemText, itemDone && styles.checklistItemTextCompleted]}
                      allowFontScaling={false}
                      maxFontSizeMultiplier={1.1}
                    >
                      {item.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 後綴備註文字 (若有) */}
            {!!checklistData.suffixText && (
              <Text
                style={[styles.memoContentText, isCompleted && styles.memoContentTextCompleted, { marginTop: 6 }]}
                allowFontScaling={false}
                maxFontSizeMultiplier={1.1}
              >
                {renderContentWithLinks(checklistData.suffixText, isCompleted)}
              </Text>
            )}

            {/* 全部打勾完成時的引導提示 */}
            {checklistProgressPercent === 100 && !isCompleted && (
              <View style={styles.checklistAllDoneHint}>
                <Text style={styles.checklistAllDoneHintText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                  🎉 項目已全數核對！點擊左側「✓」即可將整單歸檔為已辦妥
                </Text>
              </View>
            )}
          </View>
        ) : (
          <Text
            style={[styles.memoContentText, isCompleted && styles.memoContentTextCompleted]}
            allowFontScaling={false}
            maxFontSizeMultiplier={1.1}
          >
            {renderContentWithLinks(memoData.cleanContent, isCompleted)}
          </Text>
        )}

        {isCompleted && !!transaction.completion_note && (
          <View style={styles.memoReportBubble}>
            <Text style={styles.memoReportText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
              💬 {completer?.display_name ? `${completer.display_name} 回報` : '辦妥回報'}：{transaction.completion_note}
            </Text>
          </View>
        )}

        {isCompleted && !!linkedExpense && (
          <TouchableOpacity
            style={styles.memoLinkedExpenseBadge}
            activeOpacity={0.7}
            onPress={(e) => {
              e.stopPropagation?.();
              onPress?.(linkedExpense);
            }}
          >
            <Text style={styles.memoLinkedExpenseBadgeText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
              🔗 連動支出：NT$ {Number(linkedExpense.amount).toLocaleString()} ({linkedExpense.note || '支出'}) ›
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.memoFooterRow}>
          <Text style={[styles.memoAuthorText, isCompleted && styles.memoAuthorTextCompleted]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
            {payer?.avatar_url || '👤'} {payer?.display_name || '成員'} 記錄
            {isCompleted && (
              completer
                ? ` · 由 ${completer.avatar_url || '👤'} ${completer.display_name} 辦妥 ✓`
                : ' · 已辦妥 ✓'
            )}
          </Text>
          <Text style={[styles.memoActionHint, isCompleted && styles.memoActionHintCompleted]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
            {isCompleted ? '查看詳情 ›' : '點擊查看 / 編輯 ›'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  const linkedMemo = transaction.linked_transaction_id ? transactions.find(t => t.id === transaction.linked_transaction_id && t.type === 'memo') : undefined;
  const parsedDiscount = isExpense ? parseExpenseDiscount(transaction.note) : null;
  const displayNote = parsedDiscount?.hasDiscount
    ? parsedDiscount.cleanNote || `${parsedDiscount.discountLabel}折抵消費`
    : transaction.note || '無備註';

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
            {!!parsedDiscount?.hasDiscount && (
              <View style={styles.expenseDiscountBadge}>
                <Text style={styles.expenseDiscountBadgeText} numberOfLines={1} maxFontSizeMultiplier={1.08}>
                  {parsedDiscount.badgeText}
                </Text>
              </View>
            )}
            {!!linkedMemo && (
              <View style={styles.expenseLinkedMemoTag}>
                <Text style={styles.expenseLinkedMemoTagText} numberOfLines={1} maxFontSizeMultiplier={1.08}>
                  📋 連動待辦
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
            {displayNote}
          </Text>
          <View style={styles.metaRow}>
            <Text
              style={styles.payerTag}
              numberOfLines={1}
              maxFontSizeMultiplier={1.2}
            >
              {payer?.avatar_url || '👤'} {payer?.display_name || '成員'}
            </Text>
            {!!paymentLabel && (
              <View style={[styles.paymentBadge, { borderColor: `${paymentLabel.color}35`, backgroundColor: `${paymentLabel.color}12` }]}>
                <Text style={styles.paymentBadgeIcon}>{paymentLabel.icon}</Text>
                <Text
                  style={[styles.paymentBadgeText, { color: paymentLabel.color }]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.08}
                >
                  {paymentLabel.text}
                </Text>
              </View>
            )}
            {transaction.is_reconciled && (
              <View style={styles.reconciledBadge}>
                <Text style={styles.reconciledBadgeText} maxFontSizeMultiplier={1.08}>✓ 已核對</Text>
              </View>
            )}
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
  paymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 0.5,
    gap: 3,
    maxWidth: 155,
  },
  paymentBadgeIcon: {
    fontSize: 10,
  },
  paymentBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  reconciledBadge: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 0.5,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  reconciledBadgeText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#059669',
  },
  memoCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    padding: 13,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  memoCardCompleted: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderLeftColor: '#10B981',
    opacity: 0.88,
  },
  memoHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  memoHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  memoCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.8,
    borderColor: '#D97706',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
  },
  memoCheckboxChecked: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  memoCheckboxIcon: {
    fontSize: 11,
    color: 'transparent',
    fontWeight: '800',
  },
  memoCheckboxIconChecked: {
    color: '#FFFFFF',
  },
  memoIconBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memoIconBadgeCompleted: {
    backgroundColor: '#E2E8F0',
  },
  memoIconText: {
    fontSize: 12,
  },
  memoTitleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  memoTitleTextCompleted: {
    color: '#64748B',
    textDecorationLine: 'line-through',
  },
  memoCompletedBadge: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  memoCompletedBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#059669',
  },
  memoReminderBadge: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  memoReminderBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  memoDateText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#B45309',
  },
  memoDateTextCompleted: {
    color: '#94A3B8',
  },
  memoContentText: {
    fontSize: 14,
    color: '#1E293B',
    lineHeight: 20,
    marginBottom: 8,
  },
  memoContentTextCompleted: {
    color: '#94A3B8',
    textDecorationLine: 'line-through',
  },
  memoFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 7,
    borderTopWidth: 1,
    borderTopColor: '#FEF3C7',
  },
  memoAuthorText: {
    fontSize: 11,
    color: '#78350F',
    fontWeight: '500',
  },
  memoAuthorTextCompleted: {
    color: '#94A3B8',
  },
  memoActionHint: {
    fontSize: 11,
    color: '#D97706',
    fontWeight: '600',
  },
  memoActionHintCompleted: {
    color: '#64748B',
  },
  linkText: {
    color: '#2563EB',
    textDecorationLine: 'underline',
  },
  linkTextCompleted: {
    color: '#93C5FD',
  },
  memoReportBubble: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginBottom: 8,
  },
  memoReportText: {
    fontSize: 12,
    color: '#166534',
    lineHeight: 17,
  },
  memoLinkedExpenseBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 8,
  },
  memoLinkedExpenseBadgeText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#DC2626',
  },
  expenseLinkedMemoTag: {
    backgroundColor: '#FEF3C7',
    borderWidth: 0.5,
    borderColor: '#FDE68A',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
  },
  expenseLinkedMemoTagText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#B45309',
  },
  expenseDiscountBadge: {
    backgroundColor: '#ECFDF5',
    borderWidth: 0.5,
    borderColor: '#A7F3D0',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    maxWidth: 185,
  },
  expenseDiscountBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#059669',
  },
  checklistProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    marginBottom: 6,
  },
  checklistProgressBarBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  checklistProgressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  checklistProgressText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  checklistContainer: {
    marginVertical: 4,
    gap: 5,
  },
  checklistItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 0.5,
    borderColor: '#E2E8F0',
  },
  checklistItemRowCompleted: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
    opacity: 0.8,
  },
  checklistItemBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  checklistItemBoxChecked: {
    borderColor: '#10B981',
    backgroundColor: '#10B981',
  },
  checklistItemCheckIcon: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 13,
  },
  checklistItemText: {
    fontSize: 13.5,
    color: '#1E293B',
    flex: 1,
    lineHeight: 18,
  },
  checklistItemTextCompleted: {
    color: '#94A3B8',
    textDecorationLine: 'line-through',
  },
  checklistAllDoneHint: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    marginTop: 4,
    marginBottom: 6,
  },
  checklistAllDoneHintText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#059669',
  },
});
