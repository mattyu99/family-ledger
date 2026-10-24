import React, { useState, useEffect, useCallback } from 'react';
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
import { Profile, MemberDevice } from '../../types/database';
import { AvatarPicker } from '../AvatarPicker';
import { MemberAvatar } from '../MemberAvatar';
import { showAlert, showConfirm } from '../../lib/alert';
import { getDevicePlatformIcon, formatDeviceRelativeTime } from '../../lib/device';

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

export interface EditMemberModalProps {
  visible: boolean;
  memberId: string | null;
  onClose: () => void;
  onOpenClaimGoogle: () => void;
  onOpenTransferDelete: (member: Profile) => void;
}

export const EditMemberModal: React.FC<EditMemberModalProps> = ({
  visible,
  memberId,
  onClose,
  onOpenClaimGoogle,
  onOpenTransferDelete,
}) => {
  const { isDark, colors } = useTheme();
  const styles = React.useMemo(() => getStyles(isDark, colors), [isDark, colors]);

  const {
    currentLedger,
    currentUser,
    members,
    memberDevices,
    currentDeviceId,
    isOwner,
    realIsOwner,
    isPreviewMode,
    isGoogleAuthenticated,
    getMemberById,
    transactions,
    updateMember,
    updateMemberRole,
    deleteMember,
    removeDevice,
    fetchMemberDevices,
    linkGoogleAccount,
    unlinkGoogleAccount,
    signOutGoogle,
    startMemberPreview,
    startCurrentMemberPreview,
    exitMemberPreview,
  } = useLedger();

  const [nameInput, setNameInput] = useState('');
  const [avatarInput, setAvatarInput] = useState('👨');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isLinkingGoogle, setIsLinkingGoogle] = useState(false);

  const targetMember = members.find(m => m.id === memberId);

  useEffect(() => {
    if (visible && targetMember) {
      setNameInput(targetMember.display_name || '');
      setAvatarInput(targetMember.avatar_url || '👨');
      if (currentLedger?.id) {
        fetchMemberDevices(currentLedger.id, targetMember.id).catch(() => {});
      }
    }
  }, [visible, targetMember?.id, currentLedger?.id]);

  const getDevicesForMember = useCallback((target: Profile): MemberDevice[] => {
    if (!target) return [];
    const targetName = (target.display_name || '').trim().toLowerCase();
    const isTargetCurrent =
      currentUser.id === target.id ||
      (!!currentUser.display_name && (currentUser.display_name || '').trim().toLowerCase() === targetName);

    return memberDevices.filter(d => {
      if (d.ledger_id && currentLedger?.id && d.ledger_id !== currentLedger.id) {
        return false;
      }
      if (d.member_id === target.id) return true;
      if (isTargetCurrent && d.device_id === currentDeviceId) return true;
      const devMember = getMemberById(d.member_id);
      if (devMember) {
        if (devMember.id === target.id) return true;
        if ((devMember.display_name || '').trim().toLowerCase() === targetName) return true;
      }
      return false;
    });
  }, [memberDevices, currentLedger?.id, currentUser, currentDeviceId, getMemberById]);

  if (!visible || !targetMember) return null;

  const isCurrent =
    targetMember.id === currentUser.id ||
    (!!targetMember && !!currentUser.display_name && targetMember.display_name === currentUser.display_name);
  const isCreator = currentLedger?.created_by === targetMember.id;
  const isMemberAdmin =
    targetMember.role === 'owner' ||
    targetMember.role === 'admin' ||
    currentLedger?.created_by === targetMember.id;
  const isLocked = Boolean(targetMember.is_locked);
  const isLockedByOther = isLocked && !isCurrent;
  const canModifyProfile = (isOwner || isCurrent) && !isLockedByOther;
  const targetMemberDevices = getDevicesForMember(targetMember);

  const handleSaveEditMember = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      showAlert('請輸入姓名', '成員名稱不能為空');
      return;
    }
    if (targetMember.is_locked && !isCurrent) {
      showAlert(
        '身分受保護',
        `「${targetMember.display_name}」已由 Google 帳號鎖定保護（${targetMember.auth_email || '受保護'}），無法由其他裝置直接修改其稱謂。`
      );
      return;
    }
    if (!isCurrent && !isOwner) {
      showAlert('權限不足', '只有本機成員或在管理員模式下才允許編輯此稱謂');
      return;
    }

    setIsSavingEdit(true);
    try {
      const success = await updateMember(targetMember.id, trimmed, avatarInput);
      if (success) {
        onClose();
        showAlert('修改成功！', `成員資料已更新為「${trimmed}」！\n全家裝置與歷史記帳皆已同步。`);
      } else {
        showAlert('修改失敗', '儲存時發生錯誤，請稍後重試');
      }
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleLinkGoogle = async (targetProfileId?: string) => {
    setIsLinkingGoogle(true);
    try {
      const res = await linkGoogleAccount(targetProfileId);
      if (!res.success && res.message) {
        showAlert('綁定提示', res.message);
      }
    } finally {
      setIsLinkingGoogle(false);
    }
  };

  const handleUnlinkGoogle = async (targetProfileId?: string) => {
    showConfirm(
      '解除 Google 帳號綁定',
      `確定要為【${currentUser.display_name}】解除 Google 帳號綁定嗎？\n\n解除後將恢復為訪客模式，身分稱謂不再受到電子鎖保護。`,
      async () => {
        const res = await unlinkGoogleAccount(targetProfileId);
        if (!res.success && res.message) {
          showAlert('解除失敗', res.message);
        }
      }
    );
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.exportOverlay}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={Keyboard.dismiss} />
        <View style={styles.exportCard}>
          <View style={styles.modalHeaderRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.exportTitle}>👤 成員資訊與設定</Text>
              <Text style={styles.formHint}>
                {isCurrent
                  ? '📱 這是您在本機登入的家庭身分'
                  : isCreator
                  ? '👑 此成員為帳本原始創建者'
                  : isMemberAdmin
                  ? '👑 此成員為共同管理員'
                  : '此成員為一般家庭成員'}
              </Text>
            </View>
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
            {/* Google 電子鎖身分安全防護 */}
            {isLockedByOther ? (
              <View style={styles.lockedMemberNoticeBox}>
                <Text style={styles.lockedMemberNoticeTitle}>🔒 此成員已受 Google 帳號綁定保護</Text>
                <Text style={styles.lockedMemberNoticeDesc}>
                  保護信箱：{targetMember.auth_email || '已加密保護'}
                  {'\n'}此身分稱謂已受原擁有者鎖定，無法由其他設備修改稱謂。若您是該擁有者換新手機，可透過 Google 帳號認領。
                </Text>
                <TouchableOpacity
                  style={[styles.authGoogleBindBtn, { marginTop: 10, backgroundColor: '#0284C7' }]}
                  onPress={() => {
                    onClose();
                    onOpenClaimGoogle();
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.authGoogleBindBtnText}>🔑 我是此稱謂擁有者，以 Google 帳號認領恢復</Text>
                </TouchableOpacity>
              </View>
            ) : isLocked && isCurrent ? (
              <View style={[styles.authBoundCard, { marginTop: 0, marginBottom: 14 }]}>
                <View style={styles.authBoundRow}>
                  <Text style={styles.authBoundIcon}>🛡️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.authBoundTitle}>
                      稱謂【{targetMember.display_name}】已成功受保護
                    </Text>
                    <Text style={styles.authBoundEmail}>
                      保護信箱：{targetMember.auth_email || currentUser.auth_email || 'Google 授權帳號'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.authBoundDesc}>
                  已啟動雙重身分電子鎖。其他未經此 Google 帳號授權的設備，無法修改您的稱謂或冒名認領。
                </Text>
                <View style={[styles.authBoundActionsRow, { flexDirection: 'column', gap: 8 }]}>
                  <TouchableOpacity
                    style={styles.authUnlinkBtn}
                    onPress={() => {
                      onClose();
                      handleUnlinkGoogle(targetMember.id);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.authUnlinkBtnText}>🔓 解除綁定 (解除此稱謂之電子鎖)</Text>
                  </TouchableOpacity>
                  {isGoogleAuthenticated && (
                    <TouchableOpacity
                      style={[styles.authUnlinkBtn, { backgroundColor: '#F3F4F6', borderColor: '#D1D5DB' }]}
                      onPress={() => {
                        onClose();
                        showConfirm(
                          '登出 Google 帳號',
                          '確定要登出 Google 帳號嗎？\n\n登出後此裝置將切換回訪客身分，但雲端資料與公帳身分均會保留，隨時可再次登入恢復。',
                          async () => {
                            await signOutGoogle();
                          }
                        );
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.authUnlinkBtnText, { color: '#4B5563' }]}>🚪 登出 Google 帳號 (重設本機為訪客)</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ) : isCurrent ? (
              <View style={[styles.authGuestCard, { marginTop: 0, marginBottom: 14 }]}>
                <View style={styles.authGuestRow}>
                  <Text style={styles.authGuestIcon}>⚠️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.authGuestTitle}>
                      目前為訪客模式（稱謂【{targetMember.display_name}】未受保護）
                    </Text>
                    <Text style={styles.authGuestDesc}>
                      若更換手機、清除快取或重新安裝，可能無法自動恢復此身分。建議立即綁定 Google 帳號！
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.authGoogleBindBtn}
                  disabled={isLinkingGoogle}
                  onPress={() => {
                    onClose();
                    handleLinkGoogle(targetMember.id);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.authGoogleBindBtnText}>
                    {isLinkingGoogle ? '⏳ 正在開啟授權...' : '🔗 立即綁定 Google 帳號 (推薦)'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.authClaimEntryBtn}
                  onPress={() => {
                    onClose();
                    onOpenClaimGoogle();
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.authClaimEntryBtnText}>🔑 換新手機？以 Google 帳號認領 / 恢復舊身分</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {canModifyProfile ? (
              <>
                <View style={styles.formLabelRow}>
                  <Text style={styles.formLabel}>成員暱稱 / 稱謂</Text>
                </View>
                <TextInput
                  style={styles.modalInput}
                  placeholder="例如：張三、爸爸、媽媽..."
                  placeholderTextColor={isDark ? colors.text.muted : '#9CA3AF'}
                  value={nameInput}
                  onChangeText={setNameInput}
                  autoFocus={false}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                <Text style={styles.formLabel}>選擇專屬頭像</Text>
                <AvatarPicker
                  selectedAvatar={avatarInput}
                  onSelectAvatar={setAvatarInput}
                />

                <TouchableOpacity
                  style={styles.submitMemberBtn}
                  disabled={isSavingEdit}
                  onPress={handleSaveEditMember}
                >
                  <Text style={styles.submitMemberBtnText}>
                    {isSavingEdit ? '正在儲存...' : '💾 儲存修改'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.memberReadOnlyCard}>
                <MemberAvatar avatar={targetMember?.avatar_url} size={36} style={styles.memberReadOnlyAvatar} />
                <Text style={styles.memberReadOnlyName}>{targetMember?.display_name}</Text>
                <Text style={styles.memberReadOnlyRole}>
                  {isCreator ? '👑 帳本原始創建者' : isMemberAdmin ? '👑 共同管理員' : '一般家庭成員'}
                </Text>
                <Text style={styles.memberReadOnlyHint}>
                  （僅該成員本人裝置或帳本管理員可修改暱稱與頭像）
                </Text>
              </View>
            )}

            {/* 連線裝置與設備管理 */}
            <View style={styles.modalMemberAdminSection}>
              <View style={styles.memberSectionDivider} />
              <View style={styles.deviceSectionHeaderRow}>
                <Text style={styles.formLabel}>
                  📱 連線中的裝置清單 ({targetMemberDevices.length})
                </Text>
                <TouchableOpacity
                  style={styles.deviceRefreshSmallBtn}
                  onPress={() => {
                    if (currentLedger?.id) {
                      fetchMemberDevices(currentLedger.id, targetMember.id).catch(() => {});
                    }
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.deviceRefreshSmallBtnText}>🔄 重新整理</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.modalSubHint}>
                {isCurrent
                  ? '以下為目前以您的身分連線此帳本的設備。若有舊手機或不再使用的設備，可點擊解除連線。'
                  : `以下為目前以「${targetMember.display_name}」身分連線此帳本的設備。管理員可協助解除已不再使用的設備。`}
              </Text>

              {targetMemberDevices.length === 0 ? (
                <View style={styles.deviceEmptyBox}>
                  <Text style={styles.deviceEmptyText}>暫無連線中的裝置記錄</Text>
                  <Text style={styles.deviceEmptySubText}>
                    （開啟 App 或登入此帳本時將自動為本機設備登記）
                  </Text>
                </View>
              ) : (
                <View style={styles.deviceListContainer}>
                  {targetMemberDevices.map(dev => {
                    const isThisDevice = dev.device_id === currentDeviceId;
                    return (
                      <View
                        key={dev.id || dev.device_id}
                        style={[
                          styles.deviceItemCard,
                          isThisDevice && styles.deviceItemCardCurrent,
                        ]}
                      >
                        <View style={styles.deviceItemIconBox}>
                          <Text style={styles.deviceItemIcon}>{getDevicePlatformIcon(dev.platform)}</Text>
                        </View>
                        <View style={styles.deviceItemInfo}>
                          <View style={styles.deviceItemTitleRow}>
                            <Text style={styles.deviceItemName} numberOfLines={1}>
                              {dev.device_name}
                            </Text>
                            {isThisDevice && (
                              <View style={styles.deviceThisBadge}>
                                <Text style={styles.deviceThisBadgeText}>本機</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.deviceItemMeta}>
                            版本 v{dev.app_version || '1.0'} · {formatDeviceRelativeTime(dev.last_active_at)}
                          </Text>
                        </View>
                        {canModifyProfile && (
                          <TouchableOpacity
                            style={styles.deviceUnbindBtn}
                            onPress={() => {
                              showConfirm(
                                '解除裝置連線',
                                `確定要將「${dev.device_name}」從「${targetMember.display_name}」的身分中解除連線嗎？\n\n${
                                  isThisDevice
                                    ? '※ 注意：這是您目前正在使用的裝置，解除後需重新選取成員身分。'
                                    : '解除後該裝置開啟時需重新登記成員。'
                                }`,
                                async () => {
                                  const ok = await removeDevice(dev.device_id);
                                  if (ok) {
                                    showAlert('解除成功', `已成功解除設備「${dev.device_name}」的連線！`);
                                  }
                                }
                              );
                            }}
                          >
                            <Text style={styles.deviceUnbindBtnText}>解除</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {/* 若在預覽模式中：在彈窗內提供大按鈕隨時結束預覽返回管理員 */}
            {isPreviewMode && (
              <View style={{ marginTop: 14 }}>
                <TouchableOpacity
                  style={[styles.modalPreviewBtn, { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }]}
                  onPress={() => {
                    onClose();
                    exitMemberPreview();
                    showAlert('已結束預覽', '已安全切回管理員身分！');
                  }}
                >
                  <Text style={[styles.modalPreviewBtnText, { color: '#B91C1C' }]}>
                    ✕ 結束預覽，返回管理員
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 將本機管理員自身模擬為一般成員視角 */}
            {realIsOwner && isCurrent && !isPreviewMode && (
              <View style={styles.modalMemberAdminSection}>
                <View style={styles.memberSectionDivider} />

                <Text style={styles.formLabel}>🧪 一般成員操作模擬 (體驗模式)</Text>
                <Text style={styles.modalSubHint}>
                  您可以將自己暫時模擬為「一般家庭成員」視角操作。在此模式下，所有管理員特權（成員管理、代碼更名、資料庫還原等）將全部隱藏或鎖定，完整模擬一般成員的介面體驗。
                </Text>
                <TouchableOpacity
                  style={styles.modalPreviewBtn}
                  onPress={() => {
                    onClose();
                    startCurrentMemberPreview();
                    showAlert(
                      '已進入一般成員模擬模式',
                      `目前已將「${currentUser.display_name}」模擬為一般成員視角！\n\n・全 App 介面已模擬為一般成員權限（管理特權全數隱藏）\n・您依然是「${currentUser.display_name}」，記帳時出資者仍為您本人\n・測試完畢後，點擊畫面頂部橫幅「結束模擬」即可立即恢復管理員。`
                    );
                  }}
                >
                  <Text style={styles.modalPreviewBtnText}>🧪 模擬為一般成員操作 (測試體驗)</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 角色預覽與測試視角：僅管理員且對象非自己時可使用 */}
            {realIsOwner && !isCurrent && (
              <View style={styles.modalMemberAdminSection}>
                <View style={styles.memberSectionDivider} />

                <Text style={styles.formLabel}>👀 測試與角色體驗</Text>
                <Text style={styles.modalSubHint}>
                  您可以暫時切換為「{targetMember.display_name}」的視角，測試各項功能對一般成員的影響。測試中隨時可在頂部橫幅一鍵切回管理員。
                </Text>
                <TouchableOpacity
                  style={styles.modalPreviewBtn}
                  onPress={() => {
                    onClose();
                    startMemberPreview(targetMember);
                    showAlert(
                      '已進入成員預覽模式',
                      `目前已切換為「${targetMember.display_name}」視角！\n\n・全 App 介面已模擬為一般成員權限\n・記帳時付款人將預設帶入「${targetMember.display_name}」\n・測試完畢後，點擊畫面頂部橫幅「結束預覽」即可瞬間切回管理員。`
                    );
                  }}
                >
                  <Text style={styles.modalPreviewBtnText}>👀 以此成員視角預覽 (測試功能)</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 共同管理員角色切換與刪除：僅管理員且對象非自己、非建立者時可調整 */}
            {isOwner && !isCurrent && !isCreator && (
              <View style={styles.modalMemberAdminSection}>
                <View style={styles.memberSectionDivider} />

                <Text style={styles.formLabel}>管理員權限設定</Text>
                <Text style={styles.modalSubHint}>
                  {isMemberAdmin
                    ? '該成員目前具備管理員權限，可協助管理帳本、編輯成員與邀請碼。'
                    : '設為共同管理員後，該成員也可以協助管理帳本與成員。'}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.modalRoleToggleBtn,
                    isMemberAdmin ? styles.modalRoleToggleBtnDemote : styles.modalRoleToggleBtnPromote,
                  ]}
                  onPress={() => {
                    if (isMemberAdmin) {
                      showConfirm(
                        '取消管理員權限',
                        `確定要將「${targetMember.display_name}」降為一般成員嗎？`,
                        async () => {
                          await updateMemberRole(targetMember.id, 'member');
                          onClose();
                          showAlert('更新成功', `已將「${targetMember.display_name}」降為一般成員。`);
                        }
                      );
                    } else {
                      showConfirm(
                        '設為共同管理員',
                        `確定要將「${targetMember.display_name}」設為這本帳本的共同管理員嗎？\n成為管理員後，該成員也可以刪除成員並管理家庭邀請碼。`,
                        async () => {
                          await updateMemberRole(targetMember.id, 'owner');
                          onClose();
                          showAlert('設定成功', `已將「${targetMember.display_name}」設為共同管理員！`);
                        }
                      );
                    }
                  }}
                >
                  <Text
                    style={[
                      styles.modalRoleToggleBtnText,
                      isMemberAdmin ? styles.modalRoleToggleBtnTextDemote : styles.modalRoleToggleBtnTextPromote,
                    ]}
                  >
                    {isMemberAdmin ? '⬇️ 降為一般成員' : '👑 設為共同管理員'}
                  </Text>
                </TouchableOpacity>

                {/* 刪除成員：身為管理員且對象非自己、非建立者、成員數 > 1 */}
                {members.length > 1 && (
                  <View style={{ marginTop: 14 }}>
                    <Text style={styles.formLabel}>移除家庭成員</Text>
                    <TouchableOpacity
                      style={styles.modalDeleteBtn}
                      onPress={() => {
                        onClose();
                        const paidTxs = transactions.filter(
                          t => (getMemberById(t.paid_by)?.id || t.paid_by) === targetMember.id
                        );
                        const paidTotal = paidTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0);
                        if (paidTotal > 0) {
                          onOpenTransferDelete(targetMember);
                        } else {
                          showConfirm(
                            '刪除成員',
                            `確定要將「${targetMember.display_name}」從家庭名冊移除嗎？`,
                            () => deleteMember(targetMember.id)
                          );
                        }
                      }}
                    >
                      <Text style={styles.modalDeleteBtnText}>🗑️ 移轉帳目並從家庭移除</Text>
                    </TouchableOpacity>
                  </View>
                )}
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
    lockedMemberNoticeBox: {
      backgroundColor: isDark ? '#1E293B' : '#F0F9FF',
      borderColor: '#0284C7',
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      marginBottom: 14,
    },
    lockedMemberNoticeTitle: {
      fontSize: 14,
      fontWeight: 'bold',
      color: '#0284C7',
      marginBottom: 4,
    },
    lockedMemberNoticeDesc: {
      fontSize: 12,
      color: isDark ? '#94A3B8' : '#334155',
      lineHeight: 18,
    },
    authGoogleBindBtn: {
      backgroundColor: '#2563EB',
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      alignItems: 'center',
    },
    authGoogleBindBtnText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: 'bold',
    },
    authBoundCard: {
      backgroundColor: isDark ? '#064E3B' : '#ECFDF5',
      borderColor: '#10B981',
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
    },
    authBoundRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
    authBoundIcon: {
      fontSize: 20,
    },
    authBoundTitle: {
      fontSize: 14,
      fontWeight: 'bold',
      color: '#065F46',
    },
    authBoundEmail: {
      fontSize: 12,
      color: '#047857',
    },
    authBoundDesc: {
      fontSize: 12,
      color: isDark ? '#A7F3D0' : '#047857',
      lineHeight: 16,
      marginBottom: 10,
    },
    authBoundActionsRow: {},
    authUnlinkBtn: {
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#EF4444',
      borderRadius: 8,
      paddingVertical: 8,
      alignItems: 'center',
    },
    authUnlinkBtnText: {
      color: '#DC2626',
      fontSize: 12,
      fontWeight: '600',
    },
    authGuestCard: {
      backgroundColor: isDark ? '#451A03' : '#FFFBEB',
      borderColor: '#F59E0B',
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
    },
    authGuestRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginBottom: 8,
    },
    authGuestIcon: {
      fontSize: 20,
    },
    authGuestTitle: {
      fontSize: 13,
      fontWeight: 'bold',
      color: '#92400E',
    },
    authGuestDesc: {
      fontSize: 12,
      color: '#B45309',
      lineHeight: 16,
    },
    authClaimEntryBtn: {
      marginTop: 8,
      paddingVertical: 6,
      alignItems: 'center',
    },
    authClaimEntryBtnText: {
      fontSize: 12,
      color: '#2563EB',
      fontWeight: '600',
      textDecorationLine: 'underline',
    },
    formLabelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 10,
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
      marginBottom: 12,
    },
    submitMemberBtn: {
      backgroundColor: '#2563EB',
      borderRadius: 12,
      paddingVertical: 13,
      alignItems: 'center',
      marginTop: 14,
    },
    submitMemberBtnText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: 'bold',
    },
    memberReadOnlyCard: {
      backgroundColor: isDark ? colors.background.cardSubtle : '#F9FAFB',
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      marginVertical: 10,
    },
    memberReadOnlyAvatar: {
      fontSize: 36,
      marginBottom: 8,
    },
    memberReadOnlyName: {
      fontSize: 16,
      fontWeight: 'bold',
      color: isDark ? colors.text.primary : '#1F2937',
    },
    memberReadOnlyRole: {
      fontSize: 13,
      color: isDark ? colors.text.muted : '#6B7280',
      marginTop: 4,
    },
    memberReadOnlyHint: {
      fontSize: 12,
      color: isDark ? colors.text.muted : '#9CA3AF',
      marginTop: 8,
    },
    modalMemberAdminSection: {
      marginTop: 14,
    },
    memberSectionDivider: {
      height: 1,
      backgroundColor: isDark ? colors.border.default : '#E5E7EB',
      marginBottom: 12,
    },
    deviceSectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    deviceRefreshSmallBtn: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      backgroundColor: isDark ? colors.background.cardSubtle : '#F3F4F6',
    },
    deviceRefreshSmallBtnText: {
      fontSize: 12,
      color: isDark ? colors.text.secondary : '#4B5563',
    },
    modalSubHint: {
      fontSize: 12,
      color: isDark ? colors.text.muted : '#6B7280',
      marginTop: 4,
      marginBottom: 10,
      lineHeight: 16,
    },
    deviceEmptyBox: {
      padding: 12,
      backgroundColor: isDark ? colors.background.cardSubtle : '#F9FAFB',
      borderRadius: 8,
      alignItems: 'center',
    },
    deviceEmptyText: {
      fontSize: 13,
      color: isDark ? colors.text.muted : '#6B7280',
    },
    deviceEmptySubText: {
      fontSize: 11,
      color: isDark ? colors.text.muted : '#9CA3AF',
      marginTop: 2,
    },
    deviceListContainer: {
      gap: 8,
    },
    deviceItemCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 10,
      backgroundColor: isDark ? colors.background.cardSubtle : '#F9FAFB',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? colors.border.default : '#E5E7EB',
    },
    deviceItemCardCurrent: {
      borderColor: '#2563EB',
      backgroundColor: isDark ? '#1E293B' : '#EFF6FF',
    },
    deviceItemIconBox: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? colors.background.card : '#FFFFFF',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 10,
    },
    deviceItemIcon: {
      fontSize: 16,
    },
    deviceItemInfo: {
      flex: 1,
      minWidth: 0,
    },
    deviceItemTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    deviceItemName: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? colors.text.primary : '#1F2937',
    },
    deviceThisBadge: {
      backgroundColor: '#2563EB',
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 4,
    },
    deviceThisBadgeText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: 'bold',
    },
    deviceItemMeta: {
      fontSize: 11,
      color: isDark ? colors.text.muted : '#9CA3AF',
      marginTop: 2,
    },
    deviceUnbindBtn: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: '#EF4444',
      marginLeft: 6,
    },
    deviceUnbindBtnText: {
      fontSize: 11,
      color: '#EF4444',
      fontWeight: '600',
    },
    modalPreviewBtn: {
      backgroundColor: '#EFF6FF',
      borderWidth: 1,
      borderColor: '#93C5FD',
      borderRadius: 10,
      paddingVertical: 10,
      alignItems: 'center',
    },
    modalPreviewBtnText: {
      color: '#1D4ED8',
      fontSize: 13,
      fontWeight: 'bold',
    },
    modalRoleToggleBtn: {
      paddingVertical: 10,
      borderRadius: 10,
      alignItems: 'center',
      borderWidth: 1,
    },
    modalRoleToggleBtnPromote: {
      backgroundColor: '#FEF3C7',
      borderColor: '#F59E0B',
    },
    modalRoleToggleBtnDemote: {
      backgroundColor: '#F3F4F6',
      borderColor: '#D1D5DB',
    },
    modalRoleToggleBtnText: {
      fontSize: 13,
      fontWeight: 'bold',
    },
    modalRoleToggleBtnTextPromote: {
      color: '#B45309',
    },
    modalRoleToggleBtnTextDemote: {
      color: '#4B5563',
    },
    modalDeleteBtn: {
      backgroundColor: '#FEE2E2',
      borderWidth: 1,
      borderColor: '#FCA5A5',
      borderRadius: 10,
      paddingVertical: 10,
      alignItems: 'center',
    },
    modalDeleteBtnText: {
      color: '#DC2626',
      fontSize: 13,
      fontWeight: 'bold',
    },
  });
