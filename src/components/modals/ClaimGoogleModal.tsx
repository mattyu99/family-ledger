import React, { useState } from 'react';
import {
  Modal,
  View,
  Text as RNText,
  TextInput as RNTextInput,
  TouchableOpacity,
  ScrollView,
  Keyboard,
  StyleSheet,
  TextProps,
  TextInputProps,
} from 'react-native';
import { useLedger } from '../../context/LedgerContext';
import { useTheme } from '../../theme/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { showAlert } from '../../lib/alert';

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

export interface ClaimGoogleModalProps {
  visible: boolean;
  onClose: () => void;
}

export const ClaimGoogleModal: React.FC<ClaimGoogleModalProps> = ({ visible, onClose }) => {
  const { isDark, colors } = useTheme();
  const styles = React.useMemo(() => getStyles(isDark, colors), [isDark, colors]);
  const { linkGoogleAccount, claimGoogleIdentity } = useLedger();

  const [claimInput, setClaimInput] = useState('');
  const [isClaiming, setIsClaiming] = useState(false);

  const handleClaim = async () => {
    const trimmed = claimInput.trim();
    if (!trimmed) {
      showAlert('請輸入資訊', '請輸入綁定的 Google Email 或 6 位數認領驗證碼');
      return;
    }
    setIsClaiming(true);
    try {
      const res = await claimGoogleIdentity(trimmed);
      if (res.success) {
        setClaimInput('');
        onClose();
        showAlert(
          '身分認領成功',
          `已成功恢復為【${res.profile?.display_name || '受保護身分'}】！\n設備已完成登記並同步家庭公帳。`
        );
      } else {
        showAlert('認領失敗', res.message || '找不到對應身分或驗證碼無效');
      }
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.exportOverlay}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={Keyboard.dismiss} />
        <View style={styles.exportCard}>
          <View style={styles.modalHeaderRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.exportTitle}>🔑 以 Google 帳號認領身分</Text>
              <Text style={styles.formHint}>換新手機或重新安裝時，快速找回原先綁定的家庭身分</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ width: '100%' }}>
            <View style={styles.claimMethodCard}>
              <Text style={styles.claimMethodTitle}>方式一：線上 Google 授權 (推薦)</Text>
              <Text style={styles.claimMethodDesc}>
                點擊下方按鈕以瀏覽器登入 Google，驗證通過後將自動為此手機認領並同步您的專屬身分。
              </Text>
              <TouchableOpacity
                style={styles.claimGoogleOAuthBtn}
                onPress={async () => {
                  const res = await linkGoogleAccount(undefined, 'claim');
                  if (!res.success && res.message) showAlert('提示', res.message);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.claimGoogleOAuthBtnText}>🌐 開啟 Google 登入驗證</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.claimMethodDividerRow}>
              <View style={styles.claimMethodDividerLine} />
              <Text style={styles.claimMethodDividerText}>或輸入驗證資訊</Text>
              <View style={styles.claimMethodDividerLine} />
            </View>

            <View style={styles.claimMethodCard}>
              <Text style={styles.claimMethodTitle}>方式二：輸入綁定 Email 或 6 位數認領碼</Text>
              <Text style={styles.claimMethodDesc}>
                輸入您在舊手機已綁定的 Google 信箱，或是授權頁面顯示的 6 位數一次性認領碼：
              </Text>
              <TextInput
                style={styles.modalInput}
                placeholder="例如：dad@gmail.com 或 739201"
                placeholderTextColor={isDark ? colors.text.muted : '#9CA3AF'}
                value={claimInput}
                onChangeText={setClaimInput}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={styles.submitMemberBtn}
                disabled={isClaiming}
                onPress={handleClaim}
              >
                <Text style={styles.submitMemberBtnText}>
                  {isClaiming ? '正在驗證認領中...' : '🔍 確認認領此身分'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
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
      alignItems: 'flex-start',
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
      marginTop: 2,
    },
    claimMethodCard: {
      backgroundColor: isDark ? colors.background.cardSubtle : '#F9FAFB',
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: isDark ? colors.border.default : '#E5E7EB',
    },
    claimMethodTitle: {
      fontSize: 14,
      fontWeight: 'bold',
      color: isDark ? colors.text.primary : '#1F2937',
      marginBottom: 4,
    },
    claimMethodDesc: {
      fontSize: 12,
      color: isDark ? colors.text.muted : '#6B7280',
      lineHeight: 16,
      marginBottom: 12,
    },
    claimGoogleOAuthBtn: {
      backgroundColor: '#2563EB',
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
    },
    claimGoogleOAuthBtnText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: 'bold',
    },
    claimMethodDividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 14,
    },
    claimMethodDividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: isDark ? colors.border.default : '#E5E7EB',
    },
    claimMethodDividerText: {
      fontSize: 12,
      color: isDark ? colors.text.muted : '#9CA3AF',
      paddingHorizontal: 10,
    },
    modalInput: {
      backgroundColor: isDark ? colors.background.card : '#FFFFFF',
      borderWidth: 1,
      borderColor: isDark ? colors.border.default : '#E5E7EB',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: isDark ? colors.text.primary : '#1F2937',
      marginBottom: 12,
    },
    submitMemberBtn: {
      backgroundColor: '#10B981',
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
    },
    submitMemberBtnText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: 'bold',
    },
  });
