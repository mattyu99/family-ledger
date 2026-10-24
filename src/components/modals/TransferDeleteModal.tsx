import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text as RNText,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TextProps,
} from 'react-native';
import { useLedger } from '../../context/LedgerContext';
import { useTheme } from '../../theme/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { Profile } from '../../types/database';
import { MemberAvatar } from '../MemberAvatar';
import { showAlert } from '../../lib/alert';

const Text: React.FC<TextProps> = ({ allowFontScaling = false, maxFontSizeMultiplier = 1.08, ...rest }) => (
  <RNText
    allowFontScaling={allowFontScaling}
    maxFontSizeMultiplier={Math.min(maxFontSizeMultiplier ?? 1.08, 1.08)}
    {...rest}
  />
);

export interface TransferDeleteModalProps {
  visible: boolean;
  memberToDelete: Profile | null;
  onClose: () => void;
}

export const TransferDeleteModal: React.FC<TransferDeleteModalProps> = ({
  visible,
  memberToDelete,
  onClose,
}) => {
  const { isDark, colors } = useTheme();
  const styles = React.useMemo(() => getStyles(isDark, colors), [isDark, colors]);

  const {
    members,
    currentUser,
    isOwner,
    transactions,
    getMemberById,
    deleteMember,
  } = useLedger();

  const [transferRecipientId, setTransferRecipientId] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (visible && memberToDelete) {
      // Default recipient to currentUser if not self, otherwise first other member
      if (currentUser.id !== memberToDelete.id) {
        setTransferRecipientId(currentUser.id);
      } else {
        const other = members.find(m => m.id !== memberToDelete.id);
        setTransferRecipientId(other?.id || '');
      }
    }
  }, [visible, memberToDelete?.id, currentUser.id, members]);

  if (!visible || !memberToDelete) return null;

  const paidTxs = transactions.filter(
    t => (getMemberById(t.paid_by)?.id || t.paid_by) === memberToDelete.id
  );
  const paidTotal = paidTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const eligibleRecipients = members.filter(m => m.id !== memberToDelete.id);
  const selectedRecipient = members.find(m => m.id === transferRecipientId);

  const handleConfirmTransfer = async () => {
    if (!transferRecipientId) return;
    if (!isOwner) {
      showAlert('權限不足', '只有帳本管理員才能刪除家庭成員');
      return;
    }
    setIsDeleting(true);
    try {
      const targetName = selectedRecipient?.display_name || '指定成員';
      const sourceName = memberToDelete.display_name;
      const success = await deleteMember(memberToDelete.id, transferRecipientId);
      if (success) {
        onClose();
        showAlert(
          '移轉並刪除成功',
          `已將「${sourceName}」的 ${paidTxs.length} 筆付款紀錄移交給「${targetName}」，並已將該成員從家庭名冊移除。`
        );
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.exportOverlay}>
        <View style={styles.exportCard}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.exportTitle}>🔄 移轉帳目並刪除成員</Text>
            <TouchableOpacity
              onPress={() => {
                if (!isDeleting) onClose();
              }}
              style={styles.closeBtn}
            >
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 提示說明 */}
          <View style={styles.transferAlertBox}>
            <Text style={styles.transferAlertTitle}>⚠️ 包含付款紀錄</Text>
            <Text style={styles.transferAlertDesc}>
              成員「{memberToDelete.display_name}」尚有{' '}
              <Text style={{ fontWeight: '700', color: '#B45309' }}>{paidTxs.length}</Text> 筆付款紀錄（合計{' '}
              <Text style={{ fontWeight: '700', color: '#B45309' }}>NT$ {paidTotal.toLocaleString()}</Text>）。
            </Text>
            <Text style={[styles.transferAlertDesc, { marginTop: 4 }]}>
              為保持家庭公帳的收支平衡與歷史完整性，請選擇由哪位家人接收並承接這些款項：
            </Text>
          </View>

          <Text style={styles.formLabel}>選擇帳目承接人：</Text>
          <ScrollView style={{ maxHeight: 220, marginBottom: 16 }} showsVerticalScrollIndicator={false}>
            <View style={{ gap: 8 }}>
              {eligibleRecipients.map(m => {
                const isSelected = transferRecipientId === m.id;
                const isCurrent = m.id === currentUser.id;
                const isOwnerRole = m.role === 'owner';
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[
                      styles.transferRecipientCard,
                      isSelected && styles.transferRecipientCardActive,
                    ]}
                    onPress={() => setTransferRecipientId(m.id)}
                    activeOpacity={0.7}
                  >
                    <MemberAvatar avatar={m.avatar_url} size={24} style={styles.transferRecipientAvatar} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text
                          style={[
                            styles.transferRecipientName,
                            isSelected && styles.transferRecipientNameActive,
                          ]}
                          numberOfLines={1}
                        >
                          {m.display_name}
                        </Text>
                        {isCurrent && (
                          <View style={styles.meTransferBadge}>
                            <Text style={styles.meTransferBadgeText}>我 (本機)</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.transferRecipientSub}>
                        {isOwnerRole ? '👑 管理員' : '👤 家庭成員'}
                      </Text>
                    </View>
                    <View style={[styles.radioCircle, isSelected && styles.radioCircleActive]}>
                      {isSelected && <View style={styles.radioDot} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          <TouchableOpacity
            style={[
              styles.submitMemberBtn,
              (!transferRecipientId || isDeleting) && { opacity: 0.6 },
            ]}
            disabled={!transferRecipientId || isDeleting}
            onPress={handleConfirmTransfer}
          >
            <Text style={styles.submitMemberBtnText}>
              {isDeleting
                ? '正在移交帳目並刪除...'
                : `🔄 確認移交給「${selectedRecipient?.display_name || '...'}」並移除成員`}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelTransferBtn}
            onPress={() => {
              if (!isDeleting) onClose();
            }}
          >
            <Text style={styles.cancelTransferBtnText}>取消</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const getStyles = (isDark: boolean, colors: ThemeColors) =>
  StyleSheet.create({
    exportOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    exportCard: {
      backgroundColor: isDark ? colors.background.modal : '#FFFFFF',
      borderRadius: 16,
      padding: 20,
      width: '100%',
      maxWidth: 420,
      maxHeight: '90%',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 5,
    },
    modalHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    exportTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: isDark ? colors.text.primary : '#1F2937',
    },
    closeBtn: {
      padding: 4,
    },
    closeText: {
      fontSize: 18,
      color: isDark ? colors.text.muted : '#9CA3AF',
      fontWeight: 'bold',
    },
    transferAlertBox: {
      backgroundColor: isDark ? '#451A03' : '#FFFBEB',
      borderColor: '#F59E0B',
      borderWidth: 1,
      borderRadius: 10,
      padding: 12,
      marginBottom: 14,
    },
    transferAlertTitle: {
      fontSize: 14,
      fontWeight: 'bold',
      color: '#B45309',
      marginBottom: 4,
    },
    transferAlertDesc: {
      fontSize: 12,
      color: isDark ? '#FDE68A' : '#78350F',
      lineHeight: 18,
    },
    formLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? colors.text.secondary : '#374151',
      marginBottom: 8,
    },
    transferRecipientCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      backgroundColor: isDark ? colors.background.cardSubtle : '#F9FAFB',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? colors.border.default : '#E5E7EB',
      gap: 10,
    },
    transferRecipientCardActive: {
      borderColor: '#2563EB',
      backgroundColor: isDark ? '#1E293B' : '#EFF6FF',
    },
    transferRecipientAvatar: {
      fontSize: 22,
    },
    transferRecipientName: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? colors.text.primary : '#1F2937',
    },
    transferRecipientNameActive: {
      color: '#2563EB',
    },
    meTransferBadge: {
      backgroundColor: '#2563EB',
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 4,
    },
    meTransferBadgeText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: 'bold',
    },
    transferRecipientSub: {
      fontSize: 11,
      color: isDark ? colors.text.muted : '#9CA3AF',
      marginTop: 2,
    },
    radioCircle: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: isDark ? colors.border.default : '#D1D5DB',
      justifyContent: 'center',
      alignItems: 'center',
    },
    radioCircleActive: {
      borderColor: '#2563EB',
    },
    radioDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: '#2563EB',
    },
    submitMemberBtn: {
      backgroundColor: '#DC2626',
      borderRadius: 12,
      paddingVertical: 13,
      alignItems: 'center',
      marginTop: 6,
    },
    submitMemberBtnText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: 'bold',
    },
    cancelTransferBtn: {
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 6,
    },
    cancelTransferBtnText: {
      fontSize: 13,
      color: isDark ? colors.text.muted : '#6B7280',
    },
  });
