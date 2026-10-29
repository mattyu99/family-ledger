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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLedger } from '../../context/LedgerContext';
import { useTheme } from '../../theme/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { supabase, SUPABASE_URL, isConfigured } from '../../lib/supabase';
import { getStorageServiceToken } from '../../lib/statementStorage';

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

const showConfirm = (title: string, message: string, onConfirm: () => void) => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: '取消', style: 'cancel' },
      { text: '確定', style: 'destructive', onPress: onConfirm },
    ]);
  }
};

export interface SwitchLedgerModalProps {
  visible: boolean;
  onClose: () => void;
  onOpenCreateLedger: () => void;
}

export const SwitchLedgerModal: React.FC<SwitchLedgerModalProps> = ({
  visible,
  onClose,
  onOpenCreateLedger,
}) => {
  const { isDark, colors } = useTheme();
  const styles = React.useMemo(() => getStyles(isDark, colors), [isDark, colors]);
  const {
    ledgers,
    currentLedger,
    currentUser,
    transactions,
    switchLedgerById,
    toggleLedgerReadOnly,
    updateAllowNewMembers,
    leaveLedgerById,
    leaveCurrentLedger,
    isGoogleAuthenticated,
    googleUserEmail,
    signInWithGoogle,
    claimGoogleIdentity,
    unreadLedgerMap,
    previewInvite,
    joinLedgerByCode,
  } = useLedger();

  const [ledgerUserMap, setLedgerUserMap] = useState<Record<string, { displayName: string; avatarUrl?: string }>>({});
  const [ledgerTxCountMap, setLedgerTxCountMap] = useState<Record<string, number>>({});
  const [authPinInput, setAuthPinInput] = useState('');
  const [switchCodeInput, setSwitchCodeInput] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let isCancelled = false;

    // 載入使用者稱謂資訊
    const loadLedgerUsers = async () => {
      const map: Record<string, { displayName: string; avatarUrl?: string }> = {};
      for (const l of ledgers) {
        if (l.userDisplayName) {
          map[l.id] = { displayName: l.userDisplayName, avatarUrl: l.userAvatar };
          continue;
        }
        try {
          const userStr = await AsyncStorage.getItem(`@family_ledger_current_user_${l.id}`);
          if (userStr) {
            const u = JSON.parse(userStr);
            if (u.display_name) {
              map[l.id] = { displayName: u.display_name, avatarUrl: u.avatar_url };
              continue;
            }
          }
          const membersStr = await AsyncStorage.getItem(`@family_ledger_members_${l.id}`);
          if (membersStr) {
            const mems = JSON.parse(membersStr);
            if (Array.isArray(mems) && mems.length > 0) {
              const adminMem = mems.find((m: any) => m.role === 'owner' || m.role === 'admin');
              if (adminMem && (l.userRole === 'owner' || l.userRole === 'admin')) {
                map[l.id] = { displayName: adminMem.display_name, avatarUrl: adminMem.avatar_url };
                continue;
              }
            }
          }
        } catch {}
      }
      if (!isCancelled) {
        setLedgerUserMap(map);
      }
    };
    loadLedgerUsers();

    // 1. 本機快取優先載入筆數 (0ms 秒顯)
    const loadCacheCounts = async () => {
      const initialMap: Record<string, number> = {};
      for (const l of ledgers) {
        if (l.id === currentLedger.id) {
          const validCurTxs = (transactions || []).filter(t => t && t.ledger_id === currentLedger.id);
          initialMap[l.id] = validCurTxs.length;
        } else {
          try {
            const cachedStr = await AsyncStorage.getItem(`@family_ledger_transactions_${l.id}`);
            if (cachedStr) {
              const parsed = JSON.parse(cachedStr);
              if (Array.isArray(parsed)) {
                // 嚴格僅採計真正隸屬於該帳本之交易，隔絕舊帳本污染
                const matched = parsed.filter((t: any) => t && t.ledger_id === l.id);
                initialMap[l.id] = matched.length;
              }
            }
          } catch {}
        }
      }
      if (!isCancelled) {
        setLedgerTxCountMap(prev => ({ ...prev, ...initialMap }));
      }
    };
    loadCacheCounts();

    // 2. 雲端非同步精確計數更新 (優先使用 SECURITY DEFINER RPC，服務權杖保底)
    const fetchCloudCounts = async () => {
      if (!isConfigured) return;
      const cloudMap: Record<string, number> = {};

      // A. 優先嘗試全體雲端帳本統計 RPC (SECURITY DEFINER，繞過 RLS 精確統計)
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('get_all_cloud_ledgers_summary');
        if (!rpcErr && rpcData?.ledgers && Array.isArray(rpcData.ledgers)) {
          for (const item of rpcData.ledgers) {
            if (item?.id && typeof item.tx_count === 'number') {
              cloudMap[item.id] = item.tx_count;
            }
          }
        }
      } catch {}

      // B. 雙軌服務權杖穿透保底 (針對 RPC 未覆蓋之帳本)
      const token = getStorageServiceToken();
      const headers = {
        apikey: token,
        Authorization: `Bearer ${token}`,
      };

      await Promise.all(
        ledgers.map(async (l) => {
          if (l.id === currentLedger.id) {
            cloudMap[l.id] = transactions.length;
            return;
          }
          if (typeof cloudMap[l.id] === 'number' && cloudMap[l.id] > 0) return;
          if (!l.id || l.id.startsWith('demo-')) return;
          try {
            const res = await fetch(
              `${SUPABASE_URL}/rest/v1/transactions?ledger_id=eq.${l.id}&select=id`,
              {
                method: 'GET',
                headers: {
                  ...headers,
                  Prefer: 'count=exact',
                  Range: '0-0',
                },
              }
            );
            const range = res.headers.get('content-range');
            if (range) {
              const total = range.split('/')[1];
              if (total && total !== '*' && !isNaN(parseInt(total, 10))) {
                cloudMap[l.id] = parseInt(total, 10);
              }
            }
          } catch {}
        })
      );

      // C. 防禦性狀態合併：雲端 0 筆絕不覆寫本地已存在的正整數真實筆數
      if (!isCancelled && Object.keys(cloudMap).length > 0) {
        setLedgerTxCountMap(prev => {
          const merged = { ...prev };
          for (const [lid, cnt] of Object.entries(cloudMap)) {
            // 防呆：若雲端回傳 0，但本地快取已持有真實大於 0 之筆數，保留本地快取
            if (cnt === 0 && (prev[lid] || 0) > 0) {
              continue;
            }
            merged[lid] = cnt;
          }
          // 當前帳本始終以記憶體中屬於該帳本的真實筆數為權威準則
          if (currentLedger?.id && Array.isArray(transactions)) {
            const validCurCount = transactions.filter(t => t && t.ledger_id === currentLedger.id).length;
            merged[currentLedger.id] = Math.max(merged[currentLedger.id] || 0, validCurCount);
          }
          return merged;
        });
      }
    };
    fetchCloudCounts();

    return () => {
      isCancelled = true;
    };
  }, [visible, ledgers, currentLedger.id, transactions.length]);

  const handleSwitchLedgerByCode = async () => {
    const cleanCode = switchCodeInput.trim();
    if (!cleanCode) {
      showAlert('請輸入邀請碼', '請輸入目標帳本的邀請碼或完整邀請連結');
      return;
    }
    setIsJoining(true);
    try {
      const preview = await previewInvite(cleanCode);
      if (!preview.success || !preview.ledgerId) {
        setIsJoining(false);
        showAlert('加入失敗', preview.message || '邀請碼無效');
        return;
      }
      const existing = preview.members?.find(
        m => m.display_name.trim().toLowerCase() === currentUser.display_name.trim().toLowerCase()
      );
      const res = await joinLedgerByCode(
        cleanCode,
        existing ? undefined : currentUser.display_name,
        existing ? undefined : currentUser.avatar_url,
        existing
      );
      if (res.success) {
        setSwitchCodeInput('');
        onClose();
        showAlert('加入成功', `已成功切換至「${preview.ledgerName || '家庭帳本'}」！`);
      } else {
        showAlert('加入失敗', res.message || '加入失敗');
      }
    } catch (err: any) {
      showAlert('加入失敗', err?.message || '發生錯誤');
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
            <Text style={styles.title}>🚪 加入或切換家庭公帳</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ maxHeight: 420 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {/* Google 帳號一鍵登入與公帳同步卡片 */}
            <TouchableOpacity
              style={[
                styles.googleCard,
                isGoogleAuthenticated ? styles.googleCardAuth : styles.googleCardUnauth,
              ]}
              activeOpacity={0.85}
              onPress={async () => {
                if (isGoogleAuthenticated) {
                  showAlert(
                    'Google 帳號狀態',
                    `目前已登入【${googleUserEmail || 'Google 帳號'}】\n所有家庭公帳均已自動同步解鎖！`
                  );
                } else {
                  const res = await signInWithGoogle();
                  if (!res.success && res.message) {
                    showAlert('提示', res.message);
                  }
                }
              }}
            >
              <View style={styles.googleCardContent}>
                <Text style={{ fontSize: 22 }}>{isGoogleAuthenticated ? '🛡️' : '🟢'}</Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.googleCardTitle,
                      { color: isGoogleAuthenticated ? '#15803D' : '#FFFFFF' },
                    ]}
                  >
                    {isGoogleAuthenticated ? 'Google 帳號已登入同步' : '使用 Google 帳號一鍵登入'}
                  </Text>
                  <Text
                    style={[
                      styles.googleCardDesc,
                      { color: isGoogleAuthenticated ? '#166534' : '#E0E7FF' },
                    ]}
                  >
                    {isGoogleAuthenticated
                      ? `已連線 ${googleUserEmail || ''}，名下公帳已同步`
                      : '一鍵登入即可解鎖並還原名下的家庭公帳'}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            {!isGoogleAuthenticated && (
              <View style={styles.pinVerifyCard}>
                <Text style={styles.pinVerifyTitle}>
                  🔑 手機未自動同步？請輸入瀏覽器顯示的 6 位數授權碼：
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <TextInput
                    style={styles.pinVerifyInput}
                    placeholder="例如 839102"
                    placeholderTextColor={isDark ? colors.text.muted : '#9CA3AF'}
                    value={authPinInput}
                    onChangeText={setAuthPinInput}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                  <TouchableOpacity
                    style={styles.pinVerifyBtn}
                    onPress={async () => {
                      if (!authPinInput.trim()) {
                        showAlert('提示', '請輸入瀏覽器顯示的 6 位數授權碼');
                        return;
                      }
                      const res = await claimGoogleIdentity(authPinInput.trim());
                      if (res.success) {
                        setAuthPinInput('');
                        onClose();
                        showAlert('同步成功！', `已成功還原為【${res.profile?.display_name}】！\n名下所有家庭公帳已同步載入。`);
                      } else {
                        showAlert('驗證失敗', res.message || '授權碼無效或已過期');
                      }
                    }}
                  >
                    <Text style={styles.pinVerifyBtnText}>驗證同步</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {ledgers.length >= 1 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.label}>📚 您已加入的帳本清單 (點擊可切換)</Text>
                {ledgers.map((l) => {
                  const isCurrent = l.id === currentLedger.id;
                  const isAdmin = l.userRole === 'owner' || l.userRole === 'admin';
                  const userInfo = ledgerUserMap[l.id];
                  const userDisplayName = l.userDisplayName || userInfo?.displayName || (isCurrent ? currentUser.display_name : '');
                  const userAvatar = l.userAvatar || userInfo?.avatarUrl || (isCurrent ? currentUser.avatar_url : '');
                  const txCount = ledgerTxCountMap[l.id];

                  return (
                    <View
                      key={l.id}
                      style={[
                        styles.ledgerItemCard,
                        isCurrent && styles.ledgerItemCardActive,
                      ]}
                    >
                      {/* 上半部：主點擊切換區（享有全卡片完整寬度） */}
                      <TouchableOpacity
                        style={styles.ledgerCardMain}
                        activeOpacity={isCurrent ? 1 : 0.7}
                        onPress={() => {
                          if (isCurrent) return;
                          showConfirm(
                            '切換家庭公帳',
                            `確定要切換至「${l.name}」嗎？${userDisplayName ? `\n\n切換後您在此帳本的稱謂為：${userAvatar ? `${userAvatar} ` : ''}${userDisplayName}` : ''}`,
                            async () => {
                              await switchLedgerById(l.id);
                              onClose();
                              showAlert('切換成功', `已切換至「${l.name}」！`);
                            }
                          );
                        }}
                      >
                        {/* 第一列：帳本名稱 + 使用中標籤 + 未讀動態 + 右上角獨立退出按鈕 */}
                        <View style={styles.ledgerHeaderRow}>
                          <View style={styles.ledgerTitleGroup}>
                            <Text
                              style={[
                                styles.ledgerTitleText,
                                isCurrent && { color: '#4F46E5' },
                              ]}
                              numberOfLines={1}
                            >
                              {l.name}
                            </Text>
                            {isCurrent && (
                              <View style={styles.currentBadge}>
                                <Text style={styles.currentBadgeText}>使用中 ✓</Text>
                              </View>
                            )}
                            {!isCurrent && (unreadLedgerMap[l.id] || 0) > 0 && (
                              <View style={styles.unreadBadge}>
                                <Text style={styles.unreadBadgeText}>
                                  🔴 {(unreadLedgerMap[l.id] || 0) > 1 ? `${unreadLedgerMap[l.id]} 筆` : '新記帳'}
                                </Text>
                              </View>
                            )}
                          </View>

                          <TouchableOpacity
                            style={styles.leaveMiniBtn}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            onPress={() => {
                              showConfirm(
                                '退出此帳本',
                                `確定要退出「${l.name}」嗎？退出後該帳本將從您的帳本清單中移除。`,
                                async () => {
                                  await leaveLedgerById(l.id);
                                  if (isCurrent) {
                                    onClose();
                                  }
                                }
                              );
                            }}
                          >
                            <Text style={styles.leaveMiniBtnText}>退出</Text>
                          </TouchableOpacity>
                        </View>

                        {/* 第二列：身分 + 稱謂 + 交易總筆數（全寬度單行呈現） */}
                        <View style={styles.ledgerSubRow}>
                          <View style={[styles.roleBadge, isAdmin ? styles.roleBadgeAdmin : styles.roleBadgeMember]}>
                            <Text style={[styles.roleBadgeText, isAdmin ? styles.roleBadgeTextAdmin : styles.roleBadgeTextMember]}>
                              {isAdmin ? '👑 管理員' : '👤 成員'}
                            </Text>
                          </View>

                          {userDisplayName ? (
                            <>
                              <Text style={styles.subRowBullet}>•</Text>
                              <Text style={styles.userTitleText} numberOfLines={1}>
                                {userAvatar ? `${userAvatar} ` : ''}{userDisplayName}
                              </Text>
                            </>
                          ) : null}

                          <Text style={styles.subRowBullet}>•</Text>
                          <Text style={styles.txCountText}>
                            📊 {typeof txCount === 'number' ? `${txCount} 筆交易` : '計算中...'}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      {/* 下半部：管理員獨立控制晶片工具列（平整雙晶片左右對稱） */}
                      {isAdmin ? (
                        <View style={styles.ledgerAdminFooter}>
                          {/* 門禁開關晶片 */}
                          <TouchableOpacity
                            style={[
                              styles.adminChip,
                              l.allow_new_members === false ? styles.adminChipLocked : styles.adminChipOpen,
                            ]}
                            onPress={async () => {
                              const nextVal = l.allow_new_members === false;
                              const res = await updateAllowNewMembers(nextVal, l.id);
                              if (res.success) {
                                showAlert(
                                  nextVal ? '🟢 門禁已開啟' : '🔒 門禁已上鎖',
                                  nextVal
                                    ? `「${l.name}」已開放新成員憑邀請碼加入！`
                                    : `「${l.name}」已關閉新成員加入通道，防範外流！`
                                );
                              } else {
                                showAlert('更新失敗', res.message || '無法更新門禁設定');
                              }
                            }}
                          >
                            <Text
                              style={[
                                styles.adminChipText,
                                l.allow_new_members === false ? styles.adminChipTextLocked : styles.adminChipTextOpen,
                              ]}
                            >
                              {l.allow_new_members === false ? '🔒 門禁：已上鎖' : '🟢 門禁：開放中'}
                            </Text>
                          </TouchableOpacity>

                          {/* 唯讀模式切換晶片 */}
                          <TouchableOpacity
                            style={[
                              styles.adminChip,
                              l.is_read_only ? styles.adminChipReadOnly : styles.adminChipNormal,
                            ]}
                            onPress={async () => {
                              const nextVal = !l.is_read_only;
                              await toggleLedgerReadOnly(l.id, nextVal);
                              showAlert(
                                nextVal ? '🔒 已開啟唯讀保護' : '🔓 已解除唯讀鎖定',
                                nextVal
                                  ? `「${l.name}」已設為唯讀模式，防止任何新增、修改或刪除。`
                                  : `「${l.name}」已恢復為一般編輯模式。`
                              );
                            }}
                          >
                            <Text
                              style={[
                                styles.adminChipText,
                                l.is_read_only ? styles.adminChipTextReadOnly : styles.adminChipTextNormal,
                              ]}
                            >
                              {l.is_read_only ? '🔒 唯讀模式' : '✏️ 自由記帳'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        /* 一般成員狀態提示條（若非特殊狀態則不佔用空間） */
                        (Boolean(l.is_read_only) || l.allow_new_members === false) && (
                          <View style={styles.memberStatusFooter}>
                            {Boolean(l.is_read_only) && (
                              <View style={styles.statusPill}>
                                <Text style={styles.statusPillText}>🔒 唯讀模式（僅供查閱）</Text>
                              </View>
                            )}
                            {l.allow_new_members === false && (
                              <View style={[styles.statusPill, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2' }]}>
                                <Text style={[styles.statusPillText, { color: '#DC2626' }]}>🔒 門禁已鎖（防護外流中）</Text>
                              </View>
                            )}
                          </View>
                        )
                      )}
                    </View>
                  );
                })}

                <View style={styles.orDividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>或輸入新邀請碼</Text>
                  <View style={styles.dividerLine} />
                </View>
              </View>
            )}

            <Text style={styles.hint}>
              若您想加入其他家庭帳本，請輸入家人提供的邀請碼或貼上完整 LINE 邀請連結：
            </Text>

            <Text style={styles.label}>邀請碼或完整邀請連結</Text>
            <TextInput
              style={styles.input}
              placeholder="例如：FAM-8823 或貼上連結"
              placeholderTextColor={isDark ? colors.text.muted : '#9CA3AF'}
              value={switchCodeInput}
              onChangeText={setSwitchCodeInput}
              autoCapitalize="characters"
            />

            <TouchableOpacity
              style={styles.submitBtn}
              disabled={isJoining}
              onPress={handleSwitchLedgerByCode}
            >
              <Text style={styles.submitBtnText}>
                {isJoining ? '正在驗證並加入...' : '確認加入並切換'}
              </Text>
            </TouchableOpacity>

            <View style={styles.orDividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>或</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={styles.createLedgerBtn}
              onPress={() => {
                onClose();
                onOpenCreateLedger();
              }}
            >
              <Text style={styles.createLedgerBtnText}>➕ 建立全新的家庭公帳</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.leaveCurrentBtn}
              onPress={() => {
                showConfirm(
                  '退出當前帳本',
                  '確定要退出當前帳本嗎？退出後將返回初始起始畫面。若只是想切換或加入其他帳本，請直接在上方選擇或輸入邀請碼。',
                  async () => {
                    onClose();
                    await leaveCurrentLedger();
                  }
                );
              }}
            >
              <Text style={styles.leaveCurrentBtnText}>🚪 退出當前帳本（返回初始歡迎畫面）</Text>
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
    googleCard: {
      borderWidth: 1.5,
      borderRadius: 12,
      padding: 10,
      marginBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    googleCardAuth: {
      backgroundColor: isDark ? 'rgba(34, 197, 94, 0.15)' : '#F0FDF4',
      borderColor: isDark ? '#22C55E' : '#86EFAC',
    },
    googleCardUnauth: {
      backgroundColor: '#4F46E5',
      borderColor: '#4338CA',
    },
    googleCardContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
      paddingRight: 6,
    },
    googleCardTitle: {
      fontSize: 13,
      fontWeight: '700',
    },
    googleCardDesc: {
      fontSize: 11,
      marginTop: 2,
    },
    pinVerifyCard: {
      marginBottom: 16,
      backgroundColor: isDark ? colors.background.cardSubtle : '#F9FAFB',
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    pinVerifyTitle: {
      fontSize: 13,
      color: colors.text.secondary,
      marginBottom: 8,
      fontWeight: '700',
    },
    pinVerifyInput: {
      flex: 1,
      backgroundColor: isDark ? colors.background.input : '#FFFFFF',
      borderWidth: 1.5,
      borderColor: colors.border.default,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 16,
      letterSpacing: 4,
      textAlign: 'center',
      fontWeight: '800',
      color: colors.text.primary,
    },
    pinVerifyBtn: {
      backgroundColor: '#10B981',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    pinVerifyBtnText: {
      color: '#FFFFFF',
      fontWeight: '800',
      fontSize: 13,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text.secondary,
      marginBottom: 8,
    },
    ledgerItemCard: {
      flexDirection: 'column',
      alignItems: 'stretch',
      backgroundColor: isDark ? colors.background.cardSubtle : '#F9FAFB',
      borderColor: colors.border.default,
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      marginBottom: 10,
    },
    ledgerItemCardActive: {
      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.2)' : '#EEF2FF',
      borderColor: '#4F46E5',
      borderWidth: 2,
    },
    ledgerCardMain: {
      width: '100%',
    },
    ledgerHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    ledgerTitleGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flex: 1,
      marginRight: 8,
    },
    ledgerTitleText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text.primary,
      flexShrink: 1,
    },
    currentBadge: {
      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.3)' : '#EEF2FF',
      borderColor: '#6366F1',
      borderWidth: 1,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 6,
    },
    currentBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: isDark ? '#A5B4FC' : '#4F46E5',
    },
    leaveMiniBtn: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2',
      borderRadius: 6,
    },
    leaveMiniBtnText: {
      fontSize: 11,
      color: '#EF4444',
      fontWeight: '700',
    },
    ledgerSubRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
    },
    roleBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    roleBadgeAdmin: {
      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
    },
    roleBadgeMember: {
      backgroundColor: isDark ? colors.background.card : '#F3F4F6',
    },
    roleBadgeText: {
      fontSize: 11,
      fontWeight: '700',
    },
    roleBadgeTextAdmin: {
      color: isDark ? '#FBBF24' : '#D97706',
    },
    roleBadgeTextMember: {
      color: colors.text.secondary,
    },
    subRowBullet: {
      fontSize: 10,
      color: colors.text.muted,
    },
    userTitleText: {
      fontSize: 12,
      color: colors.text.secondary,
      fontWeight: '600',
    },
    txCountText: {
      fontSize: 11,
      color: isDark ? '#94A3B8' : '#64748B',
      fontWeight: '600',
    },
    ledgerAdminFooter: {
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E5E7EB',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    adminChip: {
      flex: 1,
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    adminChipText: {
      fontSize: 12,
      fontWeight: '700',
    },
    adminChipOpen: {
      backgroundColor: isDark ? 'rgba(34, 197, 94, 0.15)' : '#DCFCE7',
      borderColor: isDark ? '#22C55E' : '#86EFAC',
    },
    adminChipTextOpen: {
      color: isDark ? '#4ADE80' : '#15803D',
    },
    adminChipLocked: {
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2',
      borderColor: isDark ? '#EF4444' : '#FCA5A5',
    },
    adminChipTextLocked: {
      color: isDark ? '#F87171' : '#DC2626',
    },
    adminChipNormal: {
      backgroundColor: isDark ? colors.background.card : '#F3F4F6',
      borderColor: colors.border.default,
    },
    adminChipTextNormal: {
      color: colors.text.secondary,
    },
    adminChipReadOnly: {
      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7',
      borderColor: isDark ? '#F59E0B' : '#FCD34D',
    },
    adminChipTextReadOnly: {
      color: isDark ? '#FBBF24' : '#B45309',
    },
    memberStatusFooter: {
      marginTop: 8,
      paddingTop: 6,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E5E7EB',
      flexDirection: 'row',
      gap: 6,
      flexWrap: 'wrap',
    },
    statusPill: {
      backgroundColor: isDark ? colors.background.card : '#F1F5F9',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    statusPillText: {
      fontSize: 10,
      color: colors.text.muted,
      fontWeight: '600',
    },
    unreadBadge: {
      backgroundColor: '#FEE2E2',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    unreadBadgeText: {
      fontSize: 10,
      color: '#DC2626',
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
    submitBtn: {
      backgroundColor: '#4F46E5',
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    submitBtnText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
    createLedgerBtn: {
      backgroundColor: isDark ? 'rgba(34, 197, 94, 0.15)' : '#F0FDF4',
      borderColor: isDark ? 'rgba(34, 197, 94, 0.4)' : '#BBF7D0',
      borderWidth: 1,
      borderRadius: 10,
      paddingVertical: 10,
      alignItems: 'center',
      marginBottom: 10,
    },
    createLedgerBtnText: {
      color: '#16A34A',
      fontSize: 13,
      fontWeight: '700',
    },
    leaveCurrentBtn: {
      backgroundColor: isDark ? colors.background.cardSubtle : '#F3F4F6',
      borderColor: colors.border.default,
      borderWidth: 1,
      borderRadius: 10,
      paddingVertical: 10,
      alignItems: 'center',
    },
    leaveCurrentBtnText: {
      color: colors.text.secondary,
      fontSize: 13,
      fontWeight: '600',
    },
  });
