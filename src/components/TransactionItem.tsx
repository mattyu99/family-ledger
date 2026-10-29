import React from 'react';
import { View, Text as RNText, StyleSheet, TouchableOpacity, TextProps, Linking } from 'react-native';
import { Transaction } from '../types/database';
import { useLedger } from '../context/LedgerContext';
import { useTheme } from '../theme/ThemeContext';
import { getCategoryIcon } from '../lib/icons';
import { formatPaymentLabel, parseExpenseDiscount, isTransferToMember } from '../lib/payment';
import { parseMemoNote, decodeMemoMerchantTag, parseMemoChecklist, formatMemoCompletedDate, formatMemoCompletedTime } from '../lib/memo';
import { formatMemoReminderBadge } from '../lib/lunar';
import { stripInvoiceTag } from '../lib/invoice';

const Text: React.FC<TextProps> = ({ allowFontScaling = false, maxFontSizeMultiplier = 1.08, ...rest }) => (
  <RNText
    allowFontScaling={allowFontScaling}
    maxFontSizeMultiplier={Math.min(maxFontSizeMultiplier ?? 1.08, 1.08)}
    {...rest}
  />
);

interface TransactionItemProps {
  transaction: Transaction;
  viewingMemberId?: string;
  onPress?: (transaction: Transaction) => void;
  onCompleteMemo?: (transaction: Transaction) => void;
  onViewImage?: (imageUrl: string, title?: string) => void;
}

export const TransactionItem: React.FC<TransactionItemProps> = React.memo(({
  transaction,
  viewingMemberId,
  onPress,
  onCompleteMemo,
  onViewImage,
}) => {
  const { getMemberById, getCategoryById, getAccountById, paymentMethods, toggleMemoSettled, toggleMemoChecklistItem, transactions, members, currentUser } = useLedger();
  const { isDark, colors } = useTheme();

  const category = getCategoryById(transaction.category_id, transaction.category);
  const payer = getMemberById(transaction.paid_by) || transaction.payer_profile;
  const isExpense = transaction.type === 'expense';
  const isTransfer = transaction.type === 'transfer';
  const recipient = transaction.completed_by ? getMemberById(transaction.completed_by) : undefined;

  // 視角感知：判定在當前檢視成員下的轉帳方向
  const isMemberPerspective = !!viewingMemberId && viewingMemberId !== 'all';
  const targetViewingMember = isMemberPerspective
    ? (members.find(m => m.id === viewingMemberId) || (currentUser?.id === viewingMemberId ? currentUser : undefined))
    : undefined;

  const isTransferIn = isTransfer && isMemberPerspective && isTransferToMember(
    transaction,
    viewingMemberId,
    targetViewingMember?.display_name,
    transaction.linked_transaction_id ? [getAccountById(transaction.linked_transaction_id)].filter(Boolean) as any : undefined
  );

  const isTransferOut = isTransfer && isMemberPerspective && !isTransferIn && (
    transaction.paid_by === viewingMemberId
  );

  const isSelfTransfer = isTransfer && isMemberPerspective && isTransferIn && (
    transaction.paid_by === viewingMemberId
  );

  const date = new Date(transaction.transacted_at);
  const formattedDate = `${date.getMonth() + 1}/${date.getDate()}`;

  const account = transaction.payment_account || (transaction.account_id ? getAccountById(transaction.account_id) : undefined);
  const linkedCard = transaction.linked_transaction_id ? getAccountById(transaction.linked_transaction_id) : undefined;
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
        style={[
          styles.memoCard,
          isCompleted && styles.memoCardCompleted,
          isDark && {
            backgroundColor: isCompleted ? colors.background.card : '#272218',
            borderColor: isCompleted ? colors.border.default : '#78350F',
            borderLeftColor: isCompleted ? colors.status.income : '#F59E0B',
          },
        ]}
        onPress={() => onPress?.(transaction)}
      >
        <View style={styles.memoHeaderRow}>
          <View style={styles.memoHeaderLeft}>
            {/* 一鍵待辦完成 / 取消核取按鈕 */}
            <TouchableOpacity
              style={[
                styles.memoCheckbox,
                isDark && { backgroundColor: colors.background.input, borderColor: '#B45309' },
                isCompleted && styles.memoCheckboxChecked,
              ]}
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

            <View style={[styles.memoIconBadge, isCompleted && styles.memoIconBadgeCompleted, isDark && { backgroundColor: isCompleted ? colors.background.cardSubtle : 'rgba(245, 158, 11, 0.2)' }]}>
              <Text style={styles.memoIconText}>{memoData.icon}</Text>
            </View>
            <Text
              style={[
                styles.memoTitleText,
                isCompleted && styles.memoTitleTextCompleted,
                isDark && { color: colors.text.primary },
              ]}
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  <View style={styles.memoReminderBadge}>
                    <Text style={styles.memoReminderBadgeText} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                      {reminderBadge?.isLunar ? '🏮 ' : '⏰ '}{reminderBadge?.fullText || `提醒：${reminderDate}`}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.memoScopeBadge,
                      transaction.reminder_target === 'personal'
                        ? {
                            backgroundColor: isDark ? 'rgba(168, 85, 247, 0.2)' : '#FAF5FF',
                            borderColor: isDark ? '#A855F7' : '#E9D5FF',
                          }
                        : {
                            backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#EFF6FF',
                            borderColor: isDark ? '#3B82F6' : '#BFDBFE',
                          },
                    ]}
                  >
                    <Text
                      style={[
                        styles.memoScopeBadgeText,
                        {
                          color:
                            transaction.reminder_target === 'personal'
                              ? (isDark ? '#D8B4FE' : '#9333EA')
                              : (isDark ? '#93C5FD' : '#2563EB'),
                        },
                      ]}
                      allowFontScaling={false}
                      maxFontSizeMultiplier={1.08}
                    >
                      {transaction.reminder_target === 'personal' ? `👤 個人${payer?.display_name ? `·${payer.display_name}` : ''}` : '🌐 全家'}
                    </Text>
                  </View>
                </View>
              )
            )}
          </View>
          <Text style={[styles.memoDateText, isCompleted && styles.memoDateTextCompleted, isDark && { color: colors.text.muted }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
            {formattedDate}
          </Text>
        </View>

        {checklistData.isChecklist ? (
          <View style={{ marginBottom: 8 }}>
            {/* 檢核進度條 */}
            <View style={styles.checklistProgressRow}>
              <View style={[styles.checklistProgressBarBg, isDark && { backgroundColor: colors.background.cardSubtle }]}>
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
                  { color: checklistProgressPercent === 100 ? (isDark ? '#34D399' : '#059669') : (isDark ? '#60A5FA' : '#2563EB') },
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
                style={[
                  styles.memoContentText,
                  isCompleted && styles.memoContentTextCompleted,
                  isDark && { color: isCompleted ? colors.text.muted : colors.text.primary },
                  { marginBottom: 6 },
                ]}
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
                    style={[
                      styles.checklistItemRow,
                      itemDone && styles.checklistItemRowCompleted,
                      isDark && {
                        backgroundColor: itemDone ? colors.background.cardSubtle : 'rgba(255, 255, 255, 0.04)',
                        borderColor: isDark ? colors.border.default : '#FDE68A',
                      },
                    ]}
                    activeOpacity={0.7}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      toggleMemoChecklistItem(transaction.id, item.index);
                    }}
                  >
                    <View
                      style={[
                        styles.checklistItemBox,
                        isDark && {
                          backgroundColor: colors.background.input,
                          borderColor: '#B45309',
                        },
                        itemDone && styles.checklistItemBoxChecked,
                      ]}
                    >
                      {itemDone && <Text style={styles.checklistItemCheckIcon}>✓</Text>}
                    </View>
                    <Text
                      style={[
                        styles.checklistItemText,
                        itemDone && styles.checklistItemTextCompleted,
                        isDark && { color: itemDone ? colors.text.muted : colors.text.primary },
                      ]}
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
                style={[
                  styles.memoContentText,
                  isCompleted && styles.memoContentTextCompleted,
                  isDark && { color: isCompleted ? colors.text.muted : colors.text.primary },
                  { marginTop: 6 },
                ]}
                allowFontScaling={false}
                maxFontSizeMultiplier={1.1}
              >
                {renderContentWithLinks(checklistData.suffixText, isCompleted)}
              </Text>
            )}

            {/* 全部打勾完成時的引導提示 */}
            {checklistProgressPercent === 100 && !isCompleted && (
              <View style={[styles.checklistAllDoneHint, isDark && { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.3)' }]}>
                <Text style={[styles.checklistAllDoneHintText, isDark && { color: '#6EE7B7' }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
                  🎉 項目已全數核對！點擊左側「✓」即可將整單歸檔為已辦妥
                </Text>
              </View>
            )}
          </View>
        ) : (
          <Text
            style={[
              styles.memoContentText,
              isCompleted && styles.memoContentTextCompleted,
              isDark && { color: isCompleted ? colors.text.muted : colors.text.primary },
            ]}
            allowFontScaling={false}
            maxFontSizeMultiplier={1.1}
          >
            {renderContentWithLinks(memoData.cleanContent, isCompleted)}
          </Text>
        )}

        {isCompleted && !!transaction.completion_note && (
          <View style={[styles.memoReportBubble, isDark && { backgroundColor: 'rgba(59, 130, 246, 0.15)', borderColor: 'rgba(59, 130, 246, 0.3)' }]}>
            <Text style={[styles.memoReportText, isDark && { color: '#93C5FD' }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
              💬 {completer?.display_name ? `${completer.display_name} 回報` : '辦妥回報'}{formatMemoCompletedTime(transaction.completed_at, transaction.updated_at) ? ` (${formatMemoCompletedTime(transaction.completed_at, transaction.updated_at)})` : ''}：{transaction.completion_note}
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
          <Text style={[styles.memoAuthorText, isCompleted && styles.memoAuthorTextCompleted, isDark && { color: colors.text.muted }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
            {payer?.avatar_url || '👤'} {payer?.display_name || '成員'} 記錄
            {isCompleted && (
              completer
                ? ` · 由 ${completer.avatar_url || '👤'} ${completer.display_name}${formatMemoCompletedDate(transaction.completed_at, transaction.updated_at) ? ` 於 ${formatMemoCompletedDate(transaction.completed_at, transaction.updated_at)}` : ''} 辦妥 ✓`
                : (formatMemoCompletedDate(transaction.completed_at, transaction.updated_at) ? ` · 於 ${formatMemoCompletedDate(transaction.completed_at, transaction.updated_at)} 辦妥 ✓` : ' · 已辦妥 ✓')
            )}
          </Text>
          <Text style={[styles.memoActionHint, isCompleted && styles.memoActionHintCompleted, isDark && { color: isCompleted ? colors.text.muted : '#FBBF24' }]} allowFontScaling={false} maxFontSizeMultiplier={1.08}>
            {isCompleted ? '查看詳情 ›' : '點擊查看 / 編輯 ›'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  const linkedMemo = transaction.linked_transaction_id ? transactions.find(t => t.id === transaction.linked_transaction_id && t.type === 'memo') : undefined;
  const parsedDiscount = isExpense ? parseExpenseDiscount(transaction.note) : null;
  const rawNote = parsedDiscount?.hasDiscount
    ? parsedDiscount.cleanNote || `${parsedDiscount.discountLabel}折抵消費`
    : transaction.note || '無備註';
  const displayNote = stripInvoiceTag(rawNote) || (rawNote && rawNote !== '無備註' ? '' : '無備註');

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      style={[
        styles.card,
        isDark && {
          backgroundColor: colors.background.card,
          borderColor: colors.border.default,
          borderWidth: 1,
          shadowOpacity: 0.15,
        },
      ]}
      onPress={() => onPress?.(transaction)}
    >
      {/* 類別圖示 */}
      <View
        style={[
          styles.iconBox,
          {
            backgroundColor: isTransferIn && !isSelfTransfer
              ? (isDark ? 'rgba(16, 185, 129, 0.18)' : '#ECFDF5')
              : isTransfer
              ? (isDark ? 'rgba(99, 102, 241, 0.18)' : '#EEF2FF')
              : category
              ? `${category.color}25`
              : (isDark ? colors.background.cardSubtle : '#F3F4F6'),
          },
        ]}
      >
        <Text style={styles.iconText}>
          {isTransferIn && !isSelfTransfer
            ? (transaction.merchant?.includes('儲值') || transaction.linked_transaction_id ? '🚌' : '🎁')
            : isTransferOut
            ? '📤'
            : isTransfer
            ? '⇄'
            : getCategoryIcon(category?.icon)}
        </Text>
      </View>

      {/* 項目與細節 */}
      <View style={styles.infoBox}>
        <View style={styles.topRow}>
          <View style={styles.categoryTitleGroup}>
            <Text
              style={[styles.categoryName, isDark && { color: colors.text.primary }]}
              numberOfLines={1}
              ellipsizeMode="tail"
              maxFontSizeMultiplier={1.2}
            >
              {isTransfer ? (category?.name || '內部轉帳') : (category?.name || '其他')}
            </Text>
            {isTransfer && (
              <View
                style={[
                  styles.transferBadge,
                  isTransferIn && !isSelfTransfer && styles.transferInBadge,
                  isTransferOut && styles.transferOutBadge,
                  isSelfTransfer && styles.transferSelfBadge,
                  isDark && {
                    backgroundColor: 'rgba(99, 102, 241, 0.18)',
                    borderColor: 'rgba(99, 102, 241, 0.4)',
                  },
                  isDark && isTransferIn && !isSelfTransfer && {
                    backgroundColor: 'rgba(16, 185, 129, 0.18)',
                    borderColor: 'rgba(16, 185, 129, 0.4)',
                  },
                  isDark && isTransferOut && {
                    backgroundColor: 'rgba(139, 92, 246, 0.18)',
                    borderColor: 'rgba(139, 92, 246, 0.4)',
                  },
                  isDark && isSelfTransfer && {
                    backgroundColor: 'rgba(14, 165, 233, 0.18)',
                    borderColor: 'rgba(14, 165, 233, 0.4)',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.transferBadgeText,
                    isTransferIn && !isSelfTransfer && styles.transferInBadgeText,
                    isTransferOut && styles.transferOutBadgeText,
                    isSelfTransfer && styles.transferSelfBadgeText,
                    isDark && { color: '#A5B4FC' },
                    isDark && isTransferIn && !isSelfTransfer && { color: '#6EE7B7' },
                    isDark && isTransferOut && { color: '#C4B5FD' },
                    isDark && isSelfTransfer && { color: '#7DD3FC' },
                  ]}
                  maxFontSizeMultiplier={1.08}
                >
                  {isSelfTransfer
                    ? '🚌 自有卡片儲值'
                    : isTransferIn
                    ? (transaction.merchant?.includes('儲值') || transaction.linked_transaction_id ? '🚌 卡片加值入帳' : (transaction.note?.includes('零用') || category?.name?.includes('零用') ? '🎁 零用錢轉入' : '📥 轉入入帳'))
                    : isTransferOut
                    ? '📤 轉出款項'
                    : '⇄ 內部轉帳'}
                </Text>
              </View>
            )}
            {!!transaction.merchant && (
              <View style={[styles.merchantBadge, isDark && { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default }]}>
                <Text style={[styles.merchantBadgeText, isDark && { color: colors.text.secondary }]} numberOfLines={1} maxFontSizeMultiplier={1.08}>
                  {transaction.merchant}
                </Text>
              </View>
            )}
            {!!parsedDiscount?.hasDiscount && (
              <View style={[styles.expenseDiscountBadge, isDark && { backgroundColor: 'rgba(239, 68, 68, 0.18)', borderColor: 'rgba(239, 68, 68, 0.4)' }]}>
                <Text style={[styles.expenseDiscountBadgeText, isDark && { color: '#FCA5A5' }]} numberOfLines={1} maxFontSizeMultiplier={1.08}>
                  {parsedDiscount.badgeText}
                </Text>
              </View>
            )}
            {!!linkedMemo && (
              <View style={[styles.expenseLinkedMemoTag, isDark && { backgroundColor: 'rgba(245, 158, 11, 0.18)', borderColor: 'rgba(245, 158, 11, 0.4)' }]}>
                <Text style={[styles.expenseLinkedMemoTagText, isDark && { color: '#FCD34D' }]} numberOfLines={1} maxFontSizeMultiplier={1.08}>
                  📋 連動待辦
                </Text>
              </View>
            )}
            {!!transaction.invoice_number && (
              <View
                style={[
                  styles.invoiceBadge,
                  transaction.invoice_status === 'won' && styles.invoiceBadgeWon,
                  transaction.invoice_status === 'claimed' && styles.invoiceBadgeClaimed,
                  isDark && { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default },
                  isDark && transaction.invoice_status === 'won' && { backgroundColor: 'rgba(236, 72, 153, 0.2)', borderColor: 'rgba(236, 72, 153, 0.5)' },
                  isDark && transaction.invoice_status === 'claimed' && { backgroundColor: 'rgba(16, 185, 129, 0.2)', borderColor: 'rgba(16, 185, 129, 0.5)' },
                ]}
              >
                <Text
                  style={[
                    styles.invoiceBadgeText,
                    transaction.invoice_status === 'won' && styles.invoiceBadgeTextWon,
                    transaction.invoice_status === 'claimed' && styles.invoiceBadgeTextClaimed,
                    isDark && { color: colors.text.secondary },
                    isDark && transaction.invoice_status === 'won' && { color: '#F472B6' },
                    isDark && transaction.invoice_status === 'claimed' && { color: '#34D399' },
                  ]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.08}
                >
                  {transaction.invoice_status === 'won'
                    ? `🎉 中獎 $${transaction.invoice_prize_amount?.toLocaleString()} (${transaction.invoice_prize_name || '中獎'})`
                    : transaction.invoice_status === 'claimed'
                    ? `✅ 已兌領 $${transaction.invoice_prize_amount?.toLocaleString()}`
                    : `🧾 ${transaction.invoice_number}`}
                </Text>
              </View>
            )}
            {!!transaction.image_url && (
              <TouchableOpacity
                style={[
                  styles.imageReceiptBadge,
                  isDark && { backgroundColor: 'rgba(59, 130, 246, 0.18)', borderColor: 'rgba(59, 130, 246, 0.4)' },
                ]}
                onPress={() => {
                  if (onViewImage && transaction.image_url) {
                    onViewImage(
                      transaction.image_url,
                      `${transaction.merchant || category?.name || '消費'} 憑證照片`
                    );
                  } else if (onPress) {
                    onPress(transaction);
                  }
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.imageReceiptBadgeText, isDark && { color: '#93C5FD' }]}
                  maxFontSizeMultiplier={1.08}
                >
                  📷 憑證
                </Text>
              </TouchableOpacity>
            )}
          </View>
          <Text
            style={[
              styles.amountText,
              isExpense
                ? [styles.expenseColor, isDark && { color: colors.status.expense }]
                : isTransferIn && !isSelfTransfer
                ? [styles.incomeColor, isDark && { color: colors.status.income }]
                : isTransferOut
                ? [styles.transferColor, isDark && { color: '#A5B4FC' }]
                : isTransfer
                ? [styles.transferColor, isDark && { color: '#A5B4FC' }]
                : [styles.incomeColor, isDark && { color: colors.status.income }],
            ]}
            maxFontSizeMultiplier={1.2}
          >
            {isExpense
              ? '-'
              : isTransferIn && !isSelfTransfer
              ? '+'
              : isTransferOut
              ? '-'
              : isTransfer
              ? '⇄ '
              : '+'} NT$ {Number(transaction.amount).toLocaleString()}
          </Text>
        </View>

        <View style={styles.bottomRow}>
          <Text
            style={[styles.noteText, isDark && { color: colors.text.secondary }]}
            numberOfLines={1}
            ellipsizeMode="tail"
            maxFontSizeMultiplier={1.2}
          >
            {displayNote || (isTransfer ? '內部資金調撥（不計入總支出）' : '')}
          </Text>
          <View style={styles.metaRow}>
            <Text
              style={[
                styles.payerTag,
                isDark && {
                  backgroundColor: colors.background.cardSubtle,
                  color: colors.text.secondary,
                },
              ]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.2}
            >
              {isSelfTransfer
                ? `存入【${linkedCard?.name || transaction.merchant || '儲值卡'}】`
                : isTransferIn
                ? `由 ${payer?.avatar_url || '👤'} ${payer?.display_name || '出資人'} 撥入`
                : isTransferOut
                ? `轉出至 ${recipient?.avatar_url || '👤'} ${recipient?.display_name || transaction.merchant}`
                : isTransfer && recipient
                ? `${payer?.avatar_url || '👤'} ${payer?.display_name || '出資'} ➔ ${recipient?.avatar_url || '👤'} ${recipient?.display_name || transaction.merchant}`
                : `${payer?.avatar_url || '👤'} ${payer?.display_name || '成員'}`}
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
              <View style={[styles.reconciledBadge, isDark && { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.35)' }]}>
                <Text style={[styles.reconciledBadgeText, isDark && { color: '#34D399' }]} maxFontSizeMultiplier={1.08}>✓ 已核對</Text>
              </View>
            )}
            <Text
              style={[styles.dateText, isDark && { color: colors.text.muted }]}
              maxFontSizeMultiplier={1.2}
            >
              {formattedDate}
            </Text>
          </View>
        </View>
      </View>

      {/* 點擊編輯指示箭頭 */}
      <Text style={[styles.cardArrow, isDark && { color: colors.border.strong }]} maxFontSizeMultiplier={1.1}>›</Text>
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
  transferColor: {
    color: '#4F46E5',
  },
  transferBadge: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  transferBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4F46E5',
  },
  transferInBadge: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  transferInBadgeText: {
    color: '#059669',
  },
  transferOutBadge: {
    backgroundColor: '#F5F3FF',
    borderColor: '#DDD6FE',
  },
  transferOutBadgeText: {
    color: '#7C3AED',
  },
  transferSelfBadge: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
  },
  transferSelfBadgeText: {
    color: '#0284C7',
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
  memoScopeBadge: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
  },
  memoScopeBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
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
  invoiceBadge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginRight: 4,
  },
  imageReceiptBadge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderWidth: 1,
    borderColor: '#93C5FD',
    marginRight: 4,
  },
  imageReceiptBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#2563EB',
  },
  invoiceBadgeWon: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  invoiceBadgeClaimed: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  invoiceBadgeText: {
    fontSize: 11,
    color: '#2563EB',
    fontWeight: '600',
  },
  invoiceBadgeTextWon: {
    color: '#B45309',
    fontWeight: '700',
  },
  invoiceBadgeTextClaimed: {
    color: '#047857',
    fontWeight: '700',
  },
});
