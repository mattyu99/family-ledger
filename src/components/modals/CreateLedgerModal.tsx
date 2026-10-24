import React, { useState } from 'react';
import {
  Modal,
  View,
  Text as RNText,
  TextInput as RNTextInput,
  TouchableOpacity,
  ScrollView,
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
import { AvatarPicker } from '../AvatarPicker';

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

export interface CreateLedgerModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const CreateLedgerModal: React.FC<CreateLedgerModalProps> = ({
  visible,
  onClose,
  onSuccess,
}) => {
  const { isDark, colors } = useTheme();
  const styles = React.useMemo(() => getStyles(isDark, colors), [isDark, colors]);
  const { createLedger } = useLedger();

  const [newLedgerName, setNewLedgerName] = useState('');
  const [creatorNickname, setCreatorNickname] = useState('爸爸 (我)');
  const [creatorAvatar, setCreatorAvatar] = useState('👨');
  const [newLedgerIsReadOnly, setNewLedgerIsReadOnly] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateLedger = async () => {
    if (!newLedgerName.trim()) {
      showAlert('請輸入帳本名稱', '帳本名稱不能為空');
      return;
    }
    try {
      setIsSubmitting(true);
      const createdId = await createLedger(
        newLedgerName.trim(),
        creatorNickname.trim() || '爸爸 (我)',
        creatorAvatar,
        newLedgerIsReadOnly
      );
      const wasReadOnly = newLedgerIsReadOnly;
      setNewLedgerName('');
      setCreatorNickname('爸爸 (我)');
      setCreatorAvatar('👨');
      setNewLedgerIsReadOnly(false);
      onClose();
      onSuccess?.();
      showAlert(
        '建立成功！',
        `已建立「${newLedgerName.trim()}」！\n${wasReadOnly ? '🔒 此帳本已啟用「唯讀保護模式」，所有紀錄僅供查詢檢視。\n' : ''}系統已為您產生專屬邀請碼，可至「家庭設定」分享給家人。`
      );
    } catch (err: any) {
      showAlert('建立失敗', err?.message || '建立帳本時發生錯誤');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={Keyboard.dismiss} />
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>🏠 建立新的家庭公帳</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            style={{ width: '100%' }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <Text style={styles.hint}>建立專屬帳本後，您將成為管理員，可隨時分享邀請碼給家人加入。</Text>

            <View style={styles.labelRow}>
              <Text style={styles.label}>公帳名稱</Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder="例如：幸福家庭公帳、我們這一家"
              placeholderTextColor={isDark ? colors.text.muted : '#9CA3AF'}
              value={newLedgerName}
              onChangeText={setNewLedgerName}
              returnKeyType="next"
            />

            <Text style={styles.label}>您的暱稱 / 稱謂</Text>
            <TextInput
              style={styles.input}
              placeholder="例如：爸爸、媽媽、大寶..."
              placeholderTextColor={isDark ? colors.text.muted : '#9CA3AF'}
              value={creatorNickname}
              onChangeText={setCreatorNickname}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />

            <Text style={styles.label}>選擇您的頭像</Text>
            <AvatarPicker
              selectedAvatar={creatorAvatar}
              onSelectAvatar={setCreatorAvatar}
            />

            <TouchableOpacity
              style={[
                styles.readOnlyToggle,
                newLedgerIsReadOnly && styles.readOnlyToggleActive,
              ]}
              onPress={() => setNewLedgerIsReadOnly(prev => !prev)}
              activeOpacity={0.8}
            >
              <Text style={styles.readOnlyIcon}>{newLedgerIsReadOnly ? '🔒' : '🔓'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.readOnlyTitle, newLedgerIsReadOnly && styles.readOnlyTitleActive]}>
                  開啟「唯讀封存模式」(僅供查詢)
                </Text>
                <Text style={styles.readOnlyDesc}>
                  特別適合 Adarian 等歷史資料匯入，鎖定後防止任何誤增或誤刪
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleCreateLedger}
              disabled={isSubmitting}
            >
              <Text style={styles.submitBtnText}>
                {isSubmitting ? '建立中...' : '🚀 確認建立並進入帳本'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const getStyles = (isDark: boolean, colors: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: isDark ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    card: {
      width: '100%',
      maxWidth: 500,
      backgroundColor: colors.background.modal,
      borderRadius: 20,
      padding: 20,
      maxHeight: '88%',
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text.primary,
    },
    closeBtn: {
      padding: 6,
    },
    closeText: {
      fontSize: 18,
      color: colors.text.muted,
      fontWeight: '600',
    },
    hint: {
      fontSize: 12,
      color: colors.text.muted,
      lineHeight: 18,
      marginBottom: 14,
    },
    labelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text.secondary,
      marginBottom: 6,
      marginTop: 8,
    },
    input: {
      backgroundColor: isDark ? colors.background.input : '#F9FAFB',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border.default,
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 14,
      color: colors.text.primary,
      marginBottom: 6,
    },
    readOnlyToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 14,
      padding: 12,
      backgroundColor: isDark ? colors.background.cardSubtle : '#F9FAFB',
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.border.default,
    },
    readOnlyToggleActive: {
      backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF',
      borderColor: '#3B82F6',
    },
    readOnlyIcon: {
      fontSize: 22,
      marginRight: 10,
    },
    readOnlyTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text.primary,
    },
    readOnlyTitleActive: {
      color: isDark ? '#93C5FD' : '#1E40AF',
    },
    readOnlyDesc: {
      fontSize: 11,
      color: colors.text.muted,
      marginTop: 2,
    },
    submitBtn: {
      backgroundColor: '#4F46E5',
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 10,
      marginBottom: 6,
    },
    submitBtnText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
  });
