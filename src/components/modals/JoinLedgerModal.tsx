import React, { useState, useEffect } from 'react';
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
  Image,
} from 'react-native';
import { useLedger } from '../../context/LedgerContext';
import { useTheme } from '../../theme/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { AvatarPicker } from '../AvatarPicker';
import { Profile } from '../../types/database';

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

const renderMemberAvatar = (avatar: string | undefined, textStyle?: any, size: number = 24) => {
  if (avatar && (avatar.startsWith('http://') || avatar.startsWith('https://'))) {
    return (
      <Image
        source={{ uri: avatar }}
        style={{ width: size, height: size, borderRadius: size / 2, marginRight: 6 }}
        resizeMode="cover"
      />
    );
  }
  return (
    <Text style={textStyle || { fontSize: 18, marginRight: 6 }}>
      {avatar || '👤'}
    </Text>
  );
};

export interface JoinLedgerModalProps {
  visible: boolean;
  onClose: () => void;
  initialCode?: string;
  onSuccess?: () => void;
}

export const JoinLedgerModal: React.FC<JoinLedgerModalProps> = ({
  visible,
  onClose,
  initialCode = '',
  onSuccess,
}) => {
  const { isDark, colors } = useTheme();
  const styles = React.useMemo(() => getStyles(isDark, colors), [isDark, colors]);
  const { previewInvite, joinLedgerByCode, linkGoogleAccount } = useLedger();

  const [joinCodeInput, setJoinCodeInput] = useState(initialCode);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewLedgerName, setPreviewLedgerName] = useState('');
  const [previewMembers, setPreviewMembers] = useState<Profile[]>([]);
  const [selectedClaimMember, setSelectedClaimMember] = useState<Profile | null>(null);
  const [adminPinInput, setAdminPinInput] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [isCreatingNewMember, setIsCreatingNewMember] = useState(false);
  const [joinNickname, setJoinNickname] = useState('');
  const [joinAvatar, setJoinAvatar] = useState('👩');

  useEffect(() => {
    if (visible) {
      if (initialCode) {
        setJoinCodeInput(initialCode);
        fetchInvitePreview(initialCode);
      } else {
        setJoinCodeInput('');
        setPreviewLedgerName('');
        setPreviewMembers([]);
        setSelectedClaimMember(null);
        setAdminPinInput('');
        setIsCreatingNewMember(false);
        setJoinNickname('');
      }
    }
  }, [visible, initialCode]);

  const fetchInvitePreview = async (code: string) => {
    const cleanCode = (code || '').trim();
    if (!cleanCode) return;
    setIsLoadingPreview(true);
    try {
      const res = await previewInvite(cleanCode);
      if (res && res.success) {
        setPreviewLedgerName(res.ledgerName || '家庭公帳');
        setPreviewMembers(res.members || []);
        if (res.members && res.members.length > 0) {
          setIsCreatingNewMember(false);
        } else {
          setIsCreatingNewMember(true);
        }
      } else {
        showAlert('代碼無效', res?.message || '找不到此邀請碼對應的帳本，請確認代碼是否正確。');
      }
    } catch (err: any) {
      showAlert('查詢失敗', err?.message || '查詢邀請碼時發生網路錯誤');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleClaimJoin = async () => {
    if (!selectedClaimMember) return;
    const isClaimingAdmin = selectedClaimMember.role === 'owner' || selectedClaimMember.role === 'admin';
    if (isClaimingAdmin && !adminPinInput.trim()) {
      showAlert(
        '請輸入管理員 PIN 碼',
        '此身分具備管理員特權，請輸入 4 位數安全 PIN 碼（預設 8888）。\n\n若您是一般家庭成員，請直接點選其他成員或建立新身分。'
      );
      return;
    }
    setIsJoining(true);
    try {
      const res = await joinLedgerByCode(
        joinCodeInput.trim(),
        undefined,
        undefined,
        selectedClaimMember,
        adminPinInput.trim()
      );
      if (res.success) {
        onClose();
        onSuccess?.();
        showAlert('加入成功！', `已成功以「${selectedClaimMember.display_name}」身分進入「${previewLedgerName || '家庭帳本'}」！`);
      } else {
        showAlert('驗證失敗', res.message || '加入帳本失敗，請確認代碼或 PIN 碼是否正確');
      }
    } catch (err: any) {
      showAlert('加入失敗', err?.message || '操作發生錯誤');
    } finally {
      setIsJoining(false);
    }
  };

  const handleCreateAndJoin = async () => {
    if (!joinCodeInput.trim()) {
      showAlert('請輸入邀請碼', '請輸入邀請碼或貼上邀請連結');
      return;
    }
    if (!joinNickname.trim()) {
      showAlert('請輸入暱稱', '請輸入您的暱稱或稱謂');
      return;
    }
    setIsJoining(true);
    try {
      const res = await joinLedgerByCode(joinCodeInput.trim(), joinNickname.trim(), joinAvatar);
      if (res.success) {
        onClose();
        onSuccess?.();
        showAlert('加入成功！', `已成功以「${joinNickname.trim()}」加入家庭帳本！`);
      } else {
        showAlert('加入失敗', res.message || '加入帳本失敗，請確認代碼');
      }
    } catch (err: any) {
      showAlert('加入失敗', err?.message || '操作發生錯誤');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={Keyboard.dismiss} />
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>🔗 加入家庭公帳</Text>
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
            {previewLedgerName ? (
              <View style={styles.invitePreviewHeader}>
                <View style={styles.invitePreviewIconBox}>
                  <Text style={{ fontSize: 24 }}>🏠</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.invitePreviewLedgerName} numberOfLines={1}>{previewLedgerName}</Text>
                  <Text style={styles.invitePreviewCodeText}>邀請碼：{joinCodeInput}</Text>
                </View>
                <TouchableOpacity
                  style={styles.changeCodeBtn}
                  onPress={() => {
                    setPreviewLedgerName('');
                    setPreviewMembers([]);
                    setIsCreatingNewMember(true);
                  }}
                >
                  <Text style={styles.changeCodeBtnText}>更換代碼</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.hint}>請輸入家人提供的 4~8 碼邀請代碼（例如 FAM-8823），或直接貼上 LINE 邀請網址：</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    placeholder="例如：FAM-8823 或貼上連結"
                    placeholderTextColor={isDark ? colors.text.muted : '#9CA3AF'}
                    value={joinCodeInput}
                    onChangeText={setJoinCodeInput}
                    autoCapitalize="characters"
                  />
                  <TouchableOpacity
                    style={styles.queryPreviewBtn}
                    disabled={isLoadingPreview || !joinCodeInput.trim()}
                    onPress={() => fetchInvitePreview(joinCodeInput)}
                  >
                    <Text style={styles.queryPreviewBtnText}>
                      {isLoadingPreview ? '查詢中...' : '查詢'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {isLoadingPreview && (
              <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: '#6366F1', fontWeight: '600' }}>🔍 正在載入帳本與成員資訊...</Text>
              </View>
            )}

            {!isLoadingPreview && previewMembers.length > 0 && !isCreatingNewMember && (
              <View style={{ marginTop: 4 }}>
                <Text style={styles.claimSectionTitle}>請問您是哪位家庭成員？</Text>
                <Text style={styles.claimSectionDesc}>
                  若是換手機、用電腦開啟、或家人已先建立名單，點選即可直接認領身分，不會重複建立成員！
                </Text>

                <ScrollView style={{ maxHeight: 200, marginVertical: 8 }} showsVerticalScrollIndicator={false}>
                  <View style={styles.claimGrid}>
                    {previewMembers.map(m => {
                      const isSelected = selectedClaimMember?.id === m.id;
                      const isMAdmin = m.role === 'owner' || m.role === 'admin';
                      return (
                        <TouchableOpacity
                          key={m.id}
                          style={[styles.claimMemberCard, isSelected && styles.claimMemberCardActive]}
                          onPress={() => {
                            setSelectedClaimMember(m);
                            setAdminPinInput('');
                          }}
                          activeOpacity={0.8}
                        >
                          {renderMemberAvatar(m.avatar_url, styles.claimMemberAvatar, 24)}
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[styles.claimMemberName, isSelected && styles.claimMemberNameActive]} numberOfLines={1}>
                              {m.display_name}
                            </Text>
                            <Text style={styles.claimMemberRoleText}>
                              {isMAdmin ? '👑 管理員 (需PIN碼)' : '👤 家庭成員'}
                            </Text>
                          </View>
                          {isSelected && (
                            <View style={styles.claimCheckedBadge}>
                              <Text style={styles.claimCheckedText}>✓ 我是此成員</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>

                {selectedClaimMember && (selectedClaimMember.role === 'owner' || selectedClaimMember.role === 'admin') && !selectedClaimMember.is_locked && (
                  <View style={styles.adminPinPromptBox}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                      <Text style={{ fontSize: 16, marginRight: 6 }}>🔐</Text>
                      <Text style={styles.adminPinPromptTitle}>管理員身分安全驗證</Text>
                    </View>
                    <Text style={styles.adminPinPromptDesc}>
                      「{selectedClaimMember.display_name}」具備管理員權限，請輸入 4 位數安全 PIN 碼（預設為 8888）：
                    </Text>
                    <TextInput
                      style={styles.adminPinInput}
                      placeholder="請輸入管理員 PIN 碼 (預設 8888)"
                      placeholderTextColor={isDark ? colors.text.muted : '#9CA3AF'}
                      value={adminPinInput}
                      onChangeText={setAdminPinInput}
                      keyboardType="number-pad"
                      maxLength={8}
                      secureTextEntry
                    />
                  </View>
                )}

                {selectedClaimMember && selectedClaimMember.is_locked && (
                  <View style={styles.googleLockedPromptBox}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                      <Text style={{ fontSize: 16, marginRight: 6 }}>🛡️</Text>
                      <Text style={styles.googleLockedPromptTitle}>Google 電子鎖安全保護中</Text>
                    </View>
                    <Text style={styles.googleLockedPromptDesc}>
                      「{selectedClaimMember.display_name}」已由 Google 帳號鎖定保護
                      {selectedClaimMember.auth_email ? ` (${selectedClaimMember.auth_email.replace(/(.{2})(.*)(@.*)/, '$1***$3')})` : ''}。
                      {'\n'}若您為本人，請直接點擊下方按鈕以 Google 帳號授權解鎖並認領進入：
                    </Text>
                    <TouchableOpacity
                      style={styles.googleDirectClaimBtn}
                      activeOpacity={0.8}
                      onPress={async () => {
                        onClose();
                        const res = await linkGoogleAccount(selectedClaimMember.id, 'claim');
                        if (!res.success && res.message) showAlert('提示', res.message);
                      }}
                    >
                      <Text style={styles.googleDirectClaimBtnText}>🔑 以 Google 帳號直接解鎖認領</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {!selectedClaimMember?.is_locked && (
                  <TouchableOpacity
                    style={[styles.submitBtn, (!selectedClaimMember || isJoining) && { opacity: 0.6 }]}
                    disabled={!selectedClaimMember || isJoining}
                    onPress={handleClaimJoin}
                  >
                    <Text style={styles.submitBtnText}>
                      {isJoining
                        ? '正在認領並進入...'
                        : selectedClaimMember
                        ? `🚀 以「${selectedClaimMember.display_name}」身分進入帳本`
                        : '請先點選上方的身分'}
                    </Text>
                  </TouchableOpacity>
                )}

                <View style={styles.orDividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>或</Text>
                  <View style={styles.dividerLine} />
                </View>

                <TouchableOpacity
                  style={styles.switchCreateMemberBtn}
                  onPress={() => {
                    setIsCreatingNewMember(true);
                    if (!joinNickname) setJoinNickname('');
                  }}
                >
                  <Text style={styles.switchCreateMemberBtnText}>➕ 我是新加入的家人（建立新稱謂）</Text>
                </TouchableOpacity>
              </View>
            )}

            {!isLoadingPreview && (isCreatingNewMember || previewMembers.length === 0) && (
              <View style={{ marginTop: 4 }}>
                {previewMembers.length > 0 && (
                  <TouchableOpacity
                    style={styles.backToClaimBtn}
                    onPress={() => setIsCreatingNewMember(false)}
                  >
                    <Text style={styles.backToClaimBtnText}>← 返回選擇現有家庭成員</Text>
                  </TouchableOpacity>
                )}

                <Text style={styles.label}>您的暱稱 / 稱謂</Text>
                <TextInput
                  style={styles.input}
                  placeholder="例如：媽媽、大寶、奶奶..."
                  placeholderTextColor={isDark ? colors.text.muted : '#9CA3AF'}
                  value={joinNickname}
                  onChangeText={setJoinNickname}
                />

                <Text style={styles.label}>選擇您的頭像</Text>
                <AvatarPicker
                  selectedAvatar={joinAvatar}
                  onSelectAvatar={setJoinAvatar}
                />

                <TouchableOpacity
                  style={styles.submitBtn}
                  disabled={isJoining}
                  onPress={handleCreateAndJoin}
                >
                  <Text style={styles.submitBtnText}>
                    {isJoining ? '正在建立並加入...' : '✨ 建立新身分並加入帳本'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
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
      marginBottom: 10,
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
      marginBottom: 10,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text.secondary,
      marginBottom: 6,
      marginTop: 4,
    },
    queryPreviewBtn: {
      backgroundColor: '#4F46E5',
      paddingHorizontal: 16,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
    },
    queryPreviewBtnText: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 14,
    },
    invitePreviewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.15)' : '#EEF2FF',
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: isDark ? '#6366F1' : '#C7D2FE',
      marginBottom: 12,
      gap: 10,
    },
    invitePreviewIconBox: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: isDark ? colors.background.card : '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    invitePreviewLedgerName: {
      fontSize: 15,
      fontWeight: '800',
      color: isDark ? '#A5B4FC' : '#4338CA',
    },
    invitePreviewCodeText: {
      fontSize: 12,
      color: colors.text.muted,
      marginTop: 2,
    },
    changeCodeBtn: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: isDark ? colors.background.card : '#FFFFFF',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    changeCodeBtnText: {
      fontSize: 12,
      color: colors.text.secondary,
      fontWeight: '600',
    },
    claimSectionTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text.primary,
      marginBottom: 4,
    },
    claimSectionDesc: {
      fontSize: 11,
      color: colors.text.muted,
      lineHeight: 16,
      marginBottom: 8,
    },
    claimGrid: {
      gap: 8,
    },
    claimMemberCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 10,
      backgroundColor: isDark ? colors.background.cardSubtle : '#F9FAFB',
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.border.default,
      gap: 8,
    },
    claimMemberCardActive: {
      borderColor: '#4F46E5',
      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.2)' : '#EEF2FF',
    },
    claimMemberAvatar: {
      fontSize: 20,
    },
    claimMemberName: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text.primary,
    },
    claimMemberNameActive: {
      color: isDark ? '#A5B4FC' : '#4F46E5',
    },
    claimMemberRoleText: {
      fontSize: 11,
      color: colors.text.muted,
      marginTop: 2,
    },
    claimCheckedBadge: {
      backgroundColor: '#4F46E5',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    claimCheckedText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '700',
    },
    adminPinPromptBox: {
      padding: 12,
      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(245, 158, 11, 0.35)' : '#FDE68A',
      marginVertical: 10,
    },
    adminPinPromptTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: isDark ? '#FCD34D' : '#92400E',
    },
    adminPinPromptDesc: {
      fontSize: 11,
      color: isDark ? '#FDE68A' : '#78350F',
      marginVertical: 6,
      lineHeight: 16,
    },
    adminPinInput: {
      backgroundColor: isDark ? colors.background.input : '#FFFFFF',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: isDark ? colors.border.default : '#F59E0B',
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 14,
      color: colors.text.primary,
    },
    googleLockedPromptBox: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5',
      borderRadius: 12,
      padding: 12,
      marginTop: 10,
      borderWidth: 1.5,
      borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
    },
    googleLockedPromptTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: isDark ? '#34D399' : '#065F46',
    },
    googleLockedPromptDesc: {
      fontSize: 12,
      color: isDark ? '#D1FAE5' : '#047857',
      lineHeight: 18,
      marginVertical: 6,
    },
    googleDirectClaimBtn: {
      backgroundColor: '#059669',
      borderRadius: 10,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    googleDirectClaimBtnText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
    },
    submitBtn: {
      backgroundColor: '#4F46E5',
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 10,
    },
    submitBtnText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
    orDividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 14,
      gap: 10,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border.default,
    },
    dividerText: {
      fontSize: 12,
      color: colors.text.muted,
      fontWeight: '600',
    },
    switchCreateMemberBtn: {
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: isDark ? colors.background.cardSubtle : '#F3F4F6',
      borderWidth: 1,
      borderColor: colors.border.default,
      alignItems: 'center',
    },
    switchCreateMemberBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    backToClaimBtn: {
      paddingVertical: 8,
      marginBottom: 10,
    },
    backToClaimBtnText: {
      fontSize: 13,
      color: isDark ? '#818CF8' : '#4F46E5',
      fontWeight: '600',
    },
  });

