import React, { useEffect, useState } from 'react';
import {
  View,
  Text as RNText,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput as RNTextInput,
  Platform,
  TextProps,
  TextInputProps,
} from 'react-native';
import { usePrivacy } from '../context/PrivacyContext';
import { useTheme } from '../theme/ThemeContext';
import { useLedger } from '../context/LedgerContext';
import { showAlert } from '../lib/alert';

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

export const AppLockOverlay: React.FC = () => {
  const { isAppLocked, unlockApp, forceUnlockApp, capability } = usePrivacy();
  const { colors, isDark } = useTheme();
  const { adminPin } = useLedger();

  const [showPinInput, setShowPinInput] = useState(false);
  const [pinCode, setPinCode] = useState('');

  // 進入鎖定畫面時，自動延遲 300ms 主動喚起一次生物辨識 (體驗絲滑秒開)
  useEffect(() => {
    if (isAppLocked && !showPinInput) {
      const timer = setTimeout(() => {
        unlockApp();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isAppLocked, showPinInput, unlockApp]);

  if (!isAppLocked) return null;

  const handlePinUnlock = () => {
    const effectiveTargetPin = adminPin || '8888';
    if (pinCode.trim() === effectiveTargetPin) {
      setPinCode('');
      setShowPinInput(false);
      forceUnlockApp();
    } else {
      showAlert('PIN 碼錯誤', '輸入之管理員安全碼不相符，請重新輸入！');
      setPinCode('');
    }
  };

  return (
    <Modal visible={isAppLocked} transparent={false} animationType="fade">
      <View style={[styles.container, { backgroundColor: colors.background.root }]}>
        <View style={[styles.lockCard, { backgroundColor: colors.background.modal, borderColor: colors.border.default }]}>
          <View style={styles.iconCircle}>
            <Text style={styles.lockIcon}>🔐</Text>
          </View>

          <Text style={[styles.title, { color: colors.text.primary }]} allowFontScaling={false}>
            甜心記帳本
          </Text>
          <Text style={[styles.subtitle, { color: colors.text.secondary }]} allowFontScaling={false}>
            財務隱私全面安全防護中
          </Text>

          {!showPinInput ? (
            <View style={styles.actionContainer}>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.brand.primary }]}
                onPress={() => unlockApp()}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryBtnText} allowFontScaling={false}>
                  {`使用 ${capability.biometryType} 解鎖`}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: colors.border.default }]}
                onPress={() => setShowPinInput(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.secondaryBtnText, { color: colors.text.secondary }]} allowFontScaling={false}>
                  使用 PIN 碼備援解鎖
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.pinContainer}>
              <Text style={[styles.pinPrompt, { color: colors.text.secondary }]} allowFontScaling={false}>
                請輸入 4 碼管理員安全 PIN 碼：
              </Text>
              <TextInput
                style={[
                  styles.pinInput,
                  {
                    backgroundColor: colors.background.cardSubtle,
                    borderColor: colors.border.default,
                    color: colors.text.primary,
                  },
                ]}
                keyboardType="numeric"
                maxLength={8}
                secureTextEntry
                autoFocus
                value={pinCode}
                onChangeText={setPinCode}
                placeholder="預設 8888"
                placeholderTextColor={colors.text.muted}
              />

              <View style={styles.pinBtnRow}>
                <TouchableOpacity
                  style={[styles.pinActionBtn, { borderColor: colors.border.default }]}
                  onPress={() => {
                    setShowPinInput(false);
                    setPinCode('');
                  }}
                >
                  <Text style={[styles.pinActionBtnText, { color: colors.text.secondary }]}>返回</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.pinActionBtn, { backgroundColor: colors.brand.primary, borderColor: colors.brand.primary }]}
                  onPress={handlePinUnlock}
                >
                  <Text style={[styles.pinActionBtnText, { color: '#FFFFFF', fontWeight: '700' }]}>確認解鎖</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <Text style={[styles.tipNote, { color: colors.text.muted }]} allowFontScaling={false}>
            💡 守護全家人的資產與收支隱私，非本人無法檢視帳本數據
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  lockCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#FFF1F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  lockIcon: {
    fontSize: 36,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 28,
  },
  actionContainer: {
    width: '100%',
    gap: 12,
  },
  primaryBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F43F5E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtn: {
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  pinContainer: {
    width: '100%',
    alignItems: 'center',
  },
  pinPrompt: {
    fontSize: 13,
    marginBottom: 10,
  },
  pinInput: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 4,
    marginBottom: 16,
  },
  pinBtnRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
  },
  pinActionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinActionBtnText: {
    fontSize: 14,
  },
  tipNote: {
    fontSize: 11,
    marginTop: 24,
    textAlign: 'center',
    lineHeight: 16,
  },
});
