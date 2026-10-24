import React, { useState } from 'react';
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

// ----------------------------------------------------
// 1. ChangePinModal
// ----------------------------------------------------
export interface ChangePinModalProps {
  visible: boolean;
  onClose: () => void;
}

export const ChangePinModal: React.FC<ChangePinModalProps> = ({ visible, onClose }) => {
  const { isDark, colors } = useTheme();
  const styles = React.useMemo(() => getStyles(isDark, colors), [isDark, colors]);
  const { updateAdminPin } = useLedger();

  const [pin, setPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (pin.length < 4 || pin.length > 8) {
      showAlert('格式不符', 'PIN 碼長度需在 4 至 8 位純數字之間');
      return;
    }
    setIsSubmitting(true);
    try {
      const ok = await updateAdminPin(pin);
      if (ok) {
        showAlert('修改成功', `管理員安全 PIN 碼已成功變更為：${pin}`);
        setPin('');
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
            <Text style={styles.exportTitle}>🔐 修改管理員安全 PIN 碼</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.formHint}>
            請設定 4 至 8 位數字 PIN 碼。未來在其他手機或新電腦以「👑 管理員」身分認領時，需輸入此 PIN 碼，防止他人誤認領或奪權。
          </Text>

          <View style={styles.formLabelRow}>
            <Text style={styles.formLabel}>新管理員 PIN 碼 (4~8 位純數字)</Text>
          </View>
          <TextInput
            style={styles.modalInput}
            placeholder="例如：1234 或 8888"
            placeholderTextColor={isDark ? colors.text.muted : '#9CA3AF'}
            value={pin}
            keyboardType="number-pad"
            maxLength={8}
            onChangeText={(t) => setPin(t.replace(/[^0-9]/g, ''))}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />

          <TouchableOpacity
            style={[styles.submitMemberBtn, isSubmitting && styles.submitBtnDisabled]}
            disabled={isSubmitting}
            onPress={handleSubmit}
          >
            <Text style={styles.submitMemberBtnText}>
              {isSubmitting ? '變更中...' : '確認變更 PIN 碼'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// ----------------------------------------------------
// 2. ClaimAdminModal
// ----------------------------------------------------
export interface ClaimAdminModalProps {
  visible: boolean;
  onClose: () => void;
}

export const ClaimAdminModal: React.FC<ClaimAdminModalProps> = ({ visible, onClose }) => {
  const { isDark, colors } = useTheme();
  const styles = React.useMemo(() => getStyles(isDark, colors), [isDark, colors]);
  const { claimAdminRoleWithPin } = useLedger();

  const [pin, setPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!pin.trim()) {
      showAlert('請輸入 PIN 碼', '請輸入管理員 4 位數安全 PIN 碼');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await claimAdminRoleWithPin(pin.trim());
      if (res.success) {
        setPin('');
        onClose();
        showAlert('身分升級成功！', '您已成功取得此家庭公帳的管理員權限！');
      } else {
        showAlert('驗證失敗', res.message || 'PIN 碼錯誤，無法取得管理員權限');
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
            <Text style={styles.exportTitle}>🔐 取得/恢復管理員權限</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.formHint}>
            請輸入本家庭公帳的 4 位數管理員安全 PIN 碼（預設為 8888）。驗證通過後，此手機將立即獲得管理員特權。
          </Text>

          <View style={styles.formLabelRow}>
            <Text style={styles.formLabel}>管理員安全 PIN 碼</Text>
          </View>
          <TextInput
            style={styles.modalInput}
            placeholder="請輸入 4 位數 PIN 碼 (預設 8888)"
            placeholderTextColor={isDark ? colors.text.muted : '#9CA3AF'}
            value={pin}
            keyboardType="number-pad"
            maxLength={8}
            secureTextEntry
            onChangeText={setPin}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />

          <TouchableOpacity
            style={[styles.submitMemberBtn, isSubmitting && styles.submitBtnDisabled]}
            disabled={isSubmitting}
            onPress={handleSubmit}
          >
            <Text style={styles.submitMemberBtnText}>
              {isSubmitting ? '驗證中...' : '確認驗證並取得管理員權限'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// ----------------------------------------------------
// 3. AdminModeModal
// ----------------------------------------------------
export interface AdminModeModalProps {
  visible: boolean;
  onClose: () => void;
}

export const AdminModeModal: React.FC<AdminModeModalProps> = ({ visible, onClose }) => {
  const { isDark, colors } = useTheme();
  const styles = React.useMemo(() => getStyles(isDark, colors), [isDark, colors]);
  const { enableAdminMode } = useLedger();

  const [pin, setPin] = useState('');

  const handleSubmit = () => {
    const res = enableAdminMode(pin);
    if (!res.success) {
      showAlert('PIN 碼驗證失敗', res.message || '管理員安全 PIN 碼錯誤，請重新輸入！');
      return;
    }
    setPin('');
    onClose();
    showAlert(
      '👑 管理員模式已啟用',
      '您已切換為管理員模式！\n管理特權已全面解除隱藏，可維護帳本、管理成員與資料庫備份。\n完成後可隨時點擊頂部「👑 管理員模式」切回日常成員模式。'
    );
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.exportOverlay}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={Keyboard.dismiss} />
        <View style={styles.exportCard}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.exportTitle}>🔐 切換為管理員模式</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.formHint}>
            本機目前處於「日常成員模式」。請輸入 4 位數管理員安全 PIN 碼（預設 8888）以啟用管理員模式：
          </Text>

          <View style={styles.formLabelRow}>
            <Text style={styles.formLabel}>管理員安全 PIN 碼</Text>
          </View>
          <TextInput
            style={styles.modalInput}
            placeholder="請輸入 4 位數 PIN 碼 (預設 8888)"
            placeholderTextColor={isDark ? colors.text.muted : '#9CA3AF'}
            value={pin}
            keyboardType="number-pad"
            maxLength={8}
            secureTextEntry
            onChangeText={setPin}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            autoFocus
          />

          <TouchableOpacity style={styles.submitMemberBtn} onPress={handleSubmit}>
            <Text style={styles.submitMemberBtnText}>驗證並啟用管理員模式</Text>
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
