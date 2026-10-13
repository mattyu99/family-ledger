import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text as RNText,
  TextInput as RNTextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
  TextProps,
  TextInputProps,
  Keyboard,
} from 'react-native';
import { Transaction } from '../types/database';
import { useLedger } from '../context/LedgerContext';
import { parseMemoNote, decodeMemoMerchantTag } from '../lib/memo';
import { formatMemoReminderBadge, getNextMemoReminderDate } from '../lib/lunar';
import { HorizontalScrollView } from './HorizontalScrollView';

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

const QUICK_COMPLETION_TAGS = ['已在全聯買齊', '已送達家中', '已繳費完成', '發票已留存', '無額外花費'];

interface MemoCompletionModalProps {
  visible: boolean;
  memo: Transaction | null;
  initialNote?: string;
  initialCompleterId?: string;
  onClose: () => void;
  onCompleteOnly: (memoId: string, completedBy: string, note?: string) => Promise<void>;
  onLinkExpense: (memo: Transaction, completedBy: string, note?: string) => void;
}

export const MemoCompletionModal: React.FC<MemoCompletionModalProps> = ({
  visible,
  memo,
  initialNote = '',
  initialCompleterId,
  onClose,
  onCompleteOnly,
  onLinkExpense,
}) => {
  const { members, currentUser, getMemberById } = useLedger();

  const [completerId, setCompleterId] = useState<string>('');
  const [completionNote, setCompletionNote] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [keyboardOffset, setKeyboardOffset] = useState<number>(0);

  // 初始化辦妥人員與回報說明
  useEffect(() => {
    if (visible && memo) {
      const defaultPerson = initialCompleterId || memo.completed_by || currentUser?.id || members[0]?.id || '';
      setCompleterId(defaultPerson);
      setCompletionNote(initialNote || memo.completion_note || '');
      setSubmitting(false);
    }
  }, [visible, memo, initialCompleterId, initialNote, currentUser?.id, members]);

  // 鍵盤監聽
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardOffset(e?.endCoordinates?.height || 280);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardOffset(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const memoData = useMemo(() => {
    if (!memo) return { title: '', cleanContent: '', icon: '📝' };
    return parseMemoNote(memo.note);
  }, [memo]);

  const creator = memo ? getMemberById(memo.paid_by) || memo.payer_profile : undefined;

  const reminderInfo = useMemo(() => {
    if (!memo) return null;
    const decoded = decodeMemoMerchantTag(memo.merchant);
    const rDate = memo.reminder_date || decoded.reminderDate;
    if (!rDate) return null;
    const rCal = memo.reminder_calendar || decoded.reminderCalendar || 'solar';
    const rRep = memo.reminder_repeat || decoded.reminderRepeat || 'once';
    const badge = formatMemoReminderBadge(rDate, rCal, rRep);
    let nextBadge = null;
    if (rRep !== 'once') {
      const nextYmd = getNextMemoReminderDate(rDate, rRep, rCal);
      nextBadge = formatMemoReminderBadge(nextYmd, rCal, 'once');
    }
    return { badge, nextBadge, rRep };
  }, [memo]);

  // 僅標記完成 (無支出)
  const handleCompleteOnly = async () => {
    if (!memo || submitting) return;
    setSubmitting(true);
    try {
      await onCompleteOnly(memo.id, completerId || currentUser?.id, completionNote.trim() || undefined);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  // 連動記一筆支出
  const handleLinkExpense = () => {
    if (!memo) return;
    onLinkExpense(memo, completerId || currentUser?.id, completionNote.trim() || undefined);
  };

  // 快捷填入標籤
  const handleAddTag = (tag: string) => {
    setCompletionNote((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return tag;
      if (trimmed.includes(tag)) return trimmed;
      return `${trimmed} · ${tag}`;
    });
  };

  if (!visible || !memo) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          {/* 頂部標題列 */}
          <View style={styles.headerRow}>
            <View style={styles.headerTitleGroup}>
              <Text style={styles.headerIcon}>🎉</Text>
              <Text style={styles.headerTitle} maxFontSizeMultiplier={1.15}>辦妥生活待辦</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.scrollContent, { paddingBottom: keyboardOffset > 0 ? keyboardOffset + 20 : 16 }]}
          >
            {/* 待辦事項卡片預覽 */}
            <View style={styles.memoPreviewCard}>
              <View style={styles.memoPreviewHeader}>
                <View style={styles.memoIconBadge}>
                  <Text style={styles.memoIconText}>{memoData.icon}</Text>
                </View>
                <Text style={styles.memoPreviewTitle} numberOfLines={2} maxFontSizeMultiplier={1.12}>
                  {memoData.title}
                </Text>
              </View>
              {!!memoData.cleanContent && memoData.cleanContent !== memoData.title && (
                <Text style={styles.memoPreviewContent} numberOfLines={3} maxFontSizeMultiplier={1.08}>
                  {memoData.cleanContent}
                </Text>
              )}
              {!!reminderInfo?.badge && (
                <Text style={styles.memoPreviewCreator} maxFontSizeMultiplier={1.06}>
                  {reminderInfo.badge.isLunar ? '🏮 ' : '⏰ '}排定提醒：{reminderInfo.badge.fullText}
                </Text>
              )}
              {!!reminderInfo?.nextBadge && (
                <Text style={[styles.memoPreviewCreator, { color: '#D97706', fontWeight: '700', marginTop: 2 }]} maxFontSizeMultiplier={1.06}>
                  🔄 標記辦妥後，將自動接力產生下一期：{reminderInfo.nextBadge.fullText}
                </Text>
              )}
              <Text style={styles.memoPreviewCreator} maxFontSizeMultiplier={1.06}>
                由 {creator?.avatar_url || '👤'} {creator?.display_name || '成員'} 記錄
              </Text>
            </View>

            {/* 辦妥人員選擇 */}
            <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.1}>
              👤 誰辦妥的？
            </Text>
            <HorizontalScrollView showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberChipsRow}>
              {members.map((m) => {
                const isSelected = (completerId || currentUser?.id) === m.id;
                const isMe = currentUser?.id === m.id;
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.memberChip, isSelected && styles.memberChipSelected]}
                    onPress={() => setCompleterId(m.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.memberChipAvatar}>{m.avatar_url || '👤'}</Text>
                    <Text
                      style={[styles.memberChipName, isSelected && styles.memberChipNameSelected]}
                      maxFontSizeMultiplier={1.08}
                    >
                      {m.display_name}{isMe ? ' (我)' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </HorizontalScrollView>

            {/* 辦妥說明 / 回報備註 */}
            <View style={styles.inputLabelRow}>
              <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.1}>
                💬 辦妥補充說明 / 回報 (選填)
              </Text>
              {keyboardOffset > 0 && (
                <TouchableOpacity onPress={Keyboard.dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.dismissKeyboardText} maxFontSizeMultiplier={1.08}>收起鍵盤 ▾</Text>
                </TouchableOpacity>
              )}
            </View>
            <TextInput
              style={styles.noteInput}
              multiline
              numberOfLines={3}
              placeholder="例如：已在全聯買齊、發票放客廳鞋櫃..."
              placeholderTextColor="#94A3B8"
              value={completionNote}
              onChangeText={setCompletionNote}
              textAlignVertical="top"
              maxFontSizeMultiplier={1.12}
            />

            {/* 快捷情境標籤 */}
            <View style={styles.quickTagsRow}>
              {QUICK_COMPLETION_TAGS.map((tag) => (
                <TouchableOpacity
                  key={tag}
                  style={styles.quickTagChip}
                  onPress={() => handleAddTag(tag)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.quickTagChipText} maxFontSizeMultiplier={1.06}>+ {tag}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 操作按鈕群 (方案 B 核心：連動記帳 vs 僅打勾完成) */}
            <View style={styles.actionsContainer}>
              <TouchableOpacity
                style={styles.linkExpenseBtn}
                onPress={handleLinkExpense}
                activeOpacity={0.8}
              >
                <View style={styles.btnTextCol}>
                  <Text style={styles.linkExpenseBtnTitle} maxFontSizeMultiplier={1.15}>
                    💳 連動記一筆支出 (將此採買計入公帳)
                  </Text>
                  <Text style={styles.linkExpenseBtnDesc} maxFontSizeMultiplier={1.06}>
                    自動帶入辦妥人與標題，儲存後雙向綁定紀錄
                  </Text>
                </View>
                <Text style={styles.linkExpenseBtnArrow}>›</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.completeOnlyBtn, submitting && styles.btnDisabled]}
                onPress={handleCompleteOnly}
                disabled={submitting}
                activeOpacity={0.8}
              >
                <Text style={styles.completeOnlyBtnText} maxFontSizeMultiplier={1.12}>
                  ✓ 僅標記完成 (無支出 / 純待辦)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelBtnText} maxFontSizeMultiplier={1.08}>
                  暫不打勾 / 取消
                </Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
    width: '100%',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: Math.min(SCREEN_HEIGHT * 0.9, 760),
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIcon: {
    fontSize: 20,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
  },
  closeBtnText: {
    fontSize: 16,
    color: '#94A3B8',
    fontWeight: '700',
  },
  scrollContent: {
    paddingTop: 4,
  },
  memoPreviewCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  memoPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  memoIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memoIconText: {
    fontSize: 14,
  },
  memoPreviewTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#78350F',
  },
  memoPreviewContent: {
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
    marginTop: 2,
    marginBottom: 4,
  },
  memoPreviewCreator: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  inputLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 6,
  },
  dismissKeyboardText: {
    fontSize: 12,
    color: '#2563EB',
    fontWeight: '600',
  },
  memberChipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
  },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  memberChipSelected: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  memberChipAvatar: {
    fontSize: 14,
  },
  memberChipName: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '600',
  },
  memberChipNameSelected: {
    color: '#065F46',
    fontWeight: '700',
  },
  noteInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13.5,
    color: '#0F172A',
    minHeight: 64,
  },
  quickTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    marginBottom: 16,
  },
  quickTagChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickTagChipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '500',
  },
  actionsContainer: {
    gap: 10,
    marginTop: 4,
  },
  linkExpenseBtn: {
    backgroundColor: '#EA580C',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#EA580C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  btnTextCol: {
    flex: 1,
  },
  linkExpenseBtnTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  linkExpenseBtnDesc: {
    fontSize: 11,
    color: '#FFEDD5',
  },
  linkExpenseBtnArrow: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: '700',
    marginLeft: 8,
  },
  completeOnlyBtn: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeOnlyBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#15803D',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  cancelBtn: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 12.5,
    color: '#94A3B8',
    fontWeight: '600',
  },
});

