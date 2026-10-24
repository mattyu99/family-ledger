import React from 'react';
import {
  Modal,
  View,
  Text as RNText,
  TouchableOpacity,
  StyleSheet,
  TextProps,
} from 'react-native';
import { useLedger } from '../../context/LedgerContext';
import { useTheme } from '../../theme/ThemeContext';
import { ThemeColors } from '../../theme/colors';

const Text: React.FC<TextProps> = ({ allowFontScaling = false, maxFontSizeMultiplier = 1.08, ...rest }) => (
  <RNText
    allowFontScaling={allowFontScaling}
    maxFontSizeMultiplier={Math.min(maxFontSizeMultiplier ?? 1.08, 1.08)}
    {...rest}
  />
);

export interface PendingInviteModalProps {
  visible: boolean;
  inviteCode: string | null;
  onConfirm: (code: string) => void;
  onCancel: () => void;
}

export const PendingInviteModal: React.FC<PendingInviteModalProps> = ({
  visible,
  inviteCode,
  onConfirm,
  onCancel,
}) => {
  const { isDark, colors } = useTheme();
  const styles = React.useMemo(() => getStyles(isDark, colors), [isDark, colors]);
  const { currentLedger } = useLedger();

  if (!inviteCode) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.exportOverlay}>
        <View style={styles.exportCard}>
          <Text style={styles.exportTitle}>💌 收到家庭帳本邀請！</Text>
          <Text style={styles.formHint}>
            系統偵測到來自邀請碼【{inviteCode}】的加入邀請。
            您目前已在「{currentLedger?.name || '現有帳本'}」，是否要切換至該家庭帳本？
          </Text>

          <View style={styles.pendingInviteButtons}>
            <TouchableOpacity
              style={styles.confirmInviteBtn}
              onPress={() => onConfirm(inviteCode)}
            >
              <Text style={styles.confirmInviteBtnText}>✅ 選擇成員身分並切換</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelInviteBtn} onPress={onCancel}>
              <Text style={styles.cancelInviteBtnText}>✕ 保留現有帳本 (取消)</Text>
            </TouchableOpacity>
          </View>
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
      maxWidth: 400,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 5,
    },
    exportTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: isDark ? colors.text.primary : '#1F2937',
      marginBottom: 10,
    },
    formHint: {
      fontSize: 13,
      color: isDark ? colors.text.muted : '#6B7280',
      lineHeight: 18,
      marginBottom: 16,
    },
    pendingInviteButtons: {
      gap: 10,
    },
    confirmInviteBtn: {
      backgroundColor: '#2563EB',
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    confirmInviteBtnText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: 'bold',
    },
    cancelInviteBtn: {
      backgroundColor: isDark ? colors.background.cardSubtle : '#F3F4F6',
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
    },
    cancelInviteBtnText: {
      color: isDark ? colors.text.muted : '#6B7280',
      fontSize: 14,
      fontWeight: '600',
    },
  });
