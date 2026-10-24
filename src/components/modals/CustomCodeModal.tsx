import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text as RNText,
  TextInput as RNTextInput,
  TouchableOpacity,
  Keyboard,
  Platform,
  Alert,
  StyleSheet,
  TextProps,
  TextInputProps,
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

const TextInput: React.FC<TextInputProps> = ({ allowFontScaling = false, maxFontSizeMultiplier = 1.08, ...rest }) => (
  <RNTextInput
    allowFontScaling={allowFontScaling}
    maxFontSizeMultiplier={Math.min(maxFontSizeMultiplier ?? 1.08, 1.08)}
    {...rest}
  />
);

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export interface CustomCodeModalProps {
  visible: boolean;
  onClose: () => void;
}

export const CustomCodeModal: React.FC<CustomCodeModalProps> = ({ visible, onClose }) => {
  const { isDark, colors } = useTheme();
  const styles = React.useMemo(() => getStyles(isDark, colors), [isDark, colors]);
  const { inviteCode, updateInviteCode } = useLedger();

  const [codeInput, setCodeInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible && inviteCode) {
      setCodeInput(inviteCode);
    }
  }, [visible, inviteCode]);

  const handleSubmit = async () => {
    const trimmed = codeInput.trim().toUpperCase();
    if (!trimmed) {
      showAlert('請輸入代碼', '邀請碼不能為空');
      return;
    }
    if (trimmed.length < 3 || trimmed.length > 15) {
      showAlert('格式不符', '邀請碼長度需在 3 至 15 個英數字元之間');
      return;
    }
    setIsSubmitting(true);
    try {
      const success = await updateInviteCode(trimmed);
      if (success) {
        showAlert('更新成功', `家庭邀請碼已變更為：${trimmed}`);
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.exportOverlay}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={Keyboard.dismiss} />
        <View style={styles.exportCard}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.exportTitle}>✏️ 自訂專屬邀請碼</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.formHint}>
            身為發起人，您可以將邀請碼改成好記的英數字（3～15 個字元），例如 SWEETHOME、OURFAMILY。
          </Text>

          <View style={styles.formLabelRow}>
            <Text style={styles.formLabel}>新邀請碼 (自動轉為大寫)</Text>
          </View>
          <TextInput
            style={styles.modalInput}
            placeholder="例如：SWEETHOME"
            placeholderTextColor={isDark ? colors.text.muted : '#9CA3AF'}
            value={codeInput}
            autoCapitalize="characters"
            onChangeText={(t) => setCodeInput(t.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />

          <TouchableOpacity
            style={[styles.submitMemberBtn, isSubmitting && styles.submitBtnDisabled]}
            disabled={isSubmitting}
            onPress={handleSubmit}
          >
            <Text style={styles.submitMemberBtnText}>
              {isSubmitting ? '更新中...' : '確認變更邀請碼'}
            </Text>
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
    modalBackdrop: {
      ...StyleSheet.absoluteFill,
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
    formHint: {
      fontSize: 13,
      color: isDark ? colors.text.muted : '#6B7280',
      lineHeight: 18,
      marginBottom: 16,
    },
    formLabelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    formLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? colors.text.secondary : '#374151',
    },
    modalInput: {
      backgroundColor: isDark ? colors.background.cardSubtle : '#F9FAFB',
      borderWidth: 1,
      borderColor: isDark ? colors.border.default : '#E5E7EB',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: isDark ? colors.text.primary : '#1F2937',
      marginBottom: 16,
    },
    submitMemberBtn: {
      backgroundColor: '#2563EB',
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    submitBtnDisabled: {
      opacity: 0.6,
    },
    submitMemberBtnText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: 'bold',
    },
  });
