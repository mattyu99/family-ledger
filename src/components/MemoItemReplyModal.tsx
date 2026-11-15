import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useLedger } from '../context/LedgerContext';
import { MemoItemReply } from '../lib/memo';

interface MemoItemReplyModalProps {
  visible: boolean;
  itemText: string;
  replies: MemoItemReply[];
  onClose: () => void;
  onSaveReply: (memberName: string, replyText: string) => void;
  onDeleteReply?: (memberName: string) => void;
}

const QUICK_REPLY_TAGS = [
  '已買妥',
  '已完成',
  '賣完了',
  '晚點買',
  '請家人幫忙',
  '已繳交',
  '下班順路買',
];

export const MemoItemReplyModal: React.FC<MemoItemReplyModalProps> = ({
  visible,
  itemText,
  replies = [],
  onClose,
  onSaveReply,
  onDeleteReply,
}) => {
  const { isDark } = useTheme();
  const { currentUser, members } = useLedger();

  // 身分選擇
  const [selectedMember, setSelectedMember] = useState<string>('');
  const [inputText, setInputText] = useState<string>('');

  // 初始化選取成員與輸入框
  useEffect(() => {
    if (visible) {
      const validMembers = (members || [])
        .map(m => (m?.display_name || '').replace(/\s*[\(（]我[\)）]\s*$/, '').trim())
        .filter(Boolean);
      const myName = (currentUser?.display_name || '').replace(/\s*[\(（]我[\)）]\s*$/, '').trim();

      const defaultMember = (myName && validMembers.includes(myName))
        ? myName
        : (validMembers[0] || '家人');

      setSelectedMember(defaultMember);

      // 若該成員已有留言，預先帶入以方便修改
      const existing = replies.find(
        r => r.memberName.toLowerCase() === defaultMember.toLowerCase()
      );
      setInputText(existing?.text || '');
    }
  }, [visible, currentUser?.display_name, members, replies]);

  // 切換代表成員時，同步載入該成員的既有回覆
  const handleSelectMember = (name: string) => {
    setSelectedMember(name);
    const existing = replies.find(
      r => r.memberName.toLowerCase() === name.toLowerCase()
    );
    setInputText(existing?.text || '');
  };

  const handleSave = () => {
    const clean = inputText.trim();
    if (!selectedMember) return;
    onSaveReply(selectedMember, clean);
    onClose();
  };

  const handleDelete = (member: string) => {
    if (onDeleteReply) {
      onDeleteReply(member);
    } else {
      onSaveReply(member, '');
    }
    if (member === selectedMember) {
      setInputText('');
    }
  };

  const hasMyReply = replies.some(
    r => r.memberName.toLowerCase() === selectedMember.toLowerCase()
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <TouchableOpacity
          style={styles.backdropTouch}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={[styles.dialogCard, isDark && { backgroundColor: '#1F2937', borderColor: '#374151' }]}>
          {/* 頂部標題 */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, isDark && { color: '#F9FAFB' }]} numberOfLines={1}>
                💬 項目回報與回答
              </Text>
              <Text style={[styles.itemSubTitle, isDark && { color: '#93C5FD' }]} numberOfLines={1}>
                📌 {itemText || '待辦子項目'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeIconBtn, isDark && { backgroundColor: '#374151' }]}>
              <Text style={[styles.closeIconText, isDark && { color: '#9CA3AF' }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.contentScroll} keyboardShouldPersistTaps="handled">
            {/* 歷史留言清單 */}
            {replies.length > 0 && (
              <View style={styles.historySection}>
                <Text style={[styles.sectionLabel, isDark && { color: '#9CA3AF' }]}>
                  全家回覆紀錄（{replies.length} 則）：
                </Text>
                <View style={styles.replyList}>
                  {replies.map((r, idx) => {
                    const isMine = r.memberName.toLowerCase() === selectedMember.toLowerCase();
                    return (
                      <View
                        key={idx}
                        style={[
                          styles.replyBubble,
                          isMine && styles.replyBubbleMine,
                          isDark && {
                            backgroundColor: isMine ? '#1E3A8A' : '#374151',
                            borderColor: isMine ? '#3B82F6' : '#4B5563',
                          },
                        ]}
                      >
                        <View style={styles.replyBubbleHeader}>
                          <Text
                            style={[
                              styles.replyMemberName,
                              isMine && styles.replyMemberNameMine,
                              isDark && { color: isMine ? '#93C5FD' : '#D1D5DB' },
                            ]}
                          >
                            👤 {r.memberName}
                          </Text>
                          {isMine && (
                            <TouchableOpacity
                              onPress={() => handleDelete(r.memberName)}
                              style={styles.deleteReplyBtn}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            >
                              <Text style={styles.deleteReplyText}>🗑️ 清除</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                        <Text
                          style={[
                            styles.replyContentText,
                            isDark && { color: isMine ? '#E0F2FE' : '#F3F4F6' },
                          ]}
                        >
                          {r.text}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* 代表成員切換 */}
            <Text style={[styles.sectionLabel, isDark && { color: '#9CA3AF' }]}>
              以誰的身分回覆：
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.memberScrollRow}>
              {(members || []).map((m: any) => {
                const cleanName = (m?.display_name || '').replace(/\s*[\(（]我[\)）]\s*$/, '').trim();
                const isSelected = selectedMember === cleanName;
                const isMe = (currentUser?.display_name || '').replace(/\s*[\(（]我[\)）]\s*$/, '').trim() === cleanName;
                return (
                  <TouchableOpacity
                    key={m.id}
                    onPress={() => handleSelectMember(cleanName)}
                    style={[
                      styles.memberPill,
                      isSelected && styles.memberPillActive,
                      isDark && !isSelected && { backgroundColor: '#374151', borderColor: '#4B5563' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.memberPillText,
                        isSelected && styles.memberPillTextActive,
                        isDark && !isSelected && { color: '#D1D5DB' },
                      ]}
                    >
                      👤 {cleanName}{isMe ? ' (我)' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* 回覆輸入框 */}
            <Text style={[styles.sectionLabel, isDark && { color: '#9CA3AF' }]}>
              {hasMyReply ? '修改回覆內容：' : '輸入回覆內容：'}
            </Text>
            <TextInput
              style={[
                styles.replyInput,
                isDark && { backgroundColor: '#111827', color: '#F9FAFB', borderColor: '#4B5563' },
              ]}
              value={inputText}
              onChangeText={setInputText}
              placeholder="例如：買了全脂 2 瓶、已填好交出..."
              placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
              maxLength={80}
            />

            {/* 快捷點選按鈕 */}
            <View style={styles.quickTagsContainer}>
              {QUICK_REPLY_TAGS.map((tag, tIdx) => (
                <TouchableOpacity
                  key={tIdx}
                  onPress={() => setInputText(tag)}
                  style={[styles.quickTagBtn, isDark && { backgroundColor: '#374151', borderColor: '#4B5563' }]}
                >
                  <Text style={[styles.quickTagText, isDark && { color: '#D1D5DB' }]}>
                    ＋{tag}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* 底部按鈕 */}
          <View style={styles.footerRow}>
            {hasMyReply && (
              <TouchableOpacity
                onPress={() => handleDelete(selectedMember)}
                style={[styles.btnSecondary, isDark && { backgroundColor: '#374151', borderColor: '#4B5563' }]}
              >
                <Text style={[styles.btnSecondaryText, isDark && { color: '#F87171' }]}>
                  🗑️ 清除回覆
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleSave}
              style={[styles.btnPrimary, { flex: 1 }]}
            >
              <Text style={styles.btnPrimaryText}>
                {hasMyReply ? '💾 儲存修改' : '💬 送出回覆'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  backdropTouch: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
  },
  itemSubTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
    marginTop: 2,
  },
  closeIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  closeIconText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#6B7280',
  },
  contentScroll: {
    maxHeight: 380,
  },
  sectionLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 6,
    marginTop: 8,
  },
  historySection: {
    marginBottom: 8,
  },
  replyList: {
    gap: 6,
  },
  replyBubble: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  replyBubbleMine: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  replyBubbleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  replyMemberName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4B5563',
  },
  replyMemberNameMine: {
    color: '#2563EB',
  },
  deleteReplyBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  deleteReplyText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EF4444',
  },
  replyContentText: {
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '600',
  },
  memberScrollRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  memberPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 6,
  },
  memberPillActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  memberPillText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#4B5563',
  },
  memberPillTextActive: {
    color: '#2563EB',
    fontWeight: '800',
  },
  replyInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    marginBottom: 10,
  },
  quickTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  quickTagBtn: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  quickTagText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
  },
  btnPrimary: {
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  btnSecondary: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#DC2626',
  },
});
