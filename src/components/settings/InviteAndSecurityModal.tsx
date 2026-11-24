import React, { useState } from 'react';
import { View, TouchableOpacity, Switch, StyleSheet } from 'react-native';
import { Text } from '../common/Text';
import { useTheme } from '../../theme/ThemeContext';
import { showAlert, showConfirm, copyToClipboard } from '../../lib/alert';
import { SettingsSheetModal } from './SettingsSheetModal';

export interface InviteAndSecurityModalProps {
  visible: boolean;
  onClose: () => void;
  ledgerName: string;
  realIsOwner: boolean;
  isAdminMode: boolean;
  inviteCode: string;
  getInviteLink: () => string;
  regenerateInviteCode: () => Promise<string>;
  adminPin: string;
  allowNewMembers: boolean;
  updateAllowNewMembers: (val: boolean) => Promise<{ success: boolean; message?: string }>;
  onOpenEditLedgerModal: () => void;
  onOpenCustomCodeModal: () => void;
  onOpenChangePinModal: () => void;
}

export const InviteAndSecurityModal: React.FC<InviteAndSecurityModalProps> = ({
  visible,
  onClose,
  ledgerName,
  realIsOwner,
  isAdminMode,
  inviteCode,
  getInviteLink,
  regenerateInviteCode,
  adminPin,
  allowNewMembers,
  updateAllowNewMembers,
  onOpenEditLedgerModal,
  onOpenCustomCodeModal,
  onOpenChangePinModal,
}) => {
  const { colors, isDark } = useTheme();
  const [showPinClear, setShowPinClear] = useState(false);

  return (
    <SettingsSheetModal
      visible={visible}
      onClose={onClose}
      title="🔗 邀請碼、門禁鎖與安全碼"
      subtitle={`《${ledgerName || '家庭公帳'}》成員加入通道與管理員防護`}
    >
      {/* 角色提示頂部條 */}
      <View
        style={[
          styles.sectionCard,
          { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default },
        ]}
      >
        <View style={styles.inviteHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]} numberOfLines={1}>
            🔗 邀請家人共同記帳
          </Text>
          <View
            style={[
              styles.roleBadge,
              realIsOwner
                ? { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7' }
                : { backgroundColor: isDark ? '#334155' : '#E2E8F0' },
            ]}
          >
            <Text
              style={[
                styles.roleBadgeText,
                realIsOwner
                  ? { color: isDark ? '#FBBF24' : '#B45309' }
                  : { color: isDark ? '#CBD5E1' : '#475569' },
              ]}
            >
              {realIsOwner ? '👑 管理員' : '👤 一般成員'}
            </Text>
          </View>
        </View>

        <Text style={[styles.sectionDesc, { color: colors.text.secondary }]}>
          讓伴侶或家人加入這本公帳，資料即時雙向同步
        </Text>

        <View
          style={[
            styles.inviteCard,
            { backgroundColor: colors.background.modal, borderColor: colors.border.default },
          ]}
        >
          <Text style={[styles.inviteCardLabel, { color: colors.text.secondary }]}>
            本家庭專屬邀請碼
          </Text>
          <View style={styles.inviteCodeRow}>
            <Text style={[styles.inviteCodeLarge, { color: colors.text.primary }]}>
              {inviteCode}
            </Text>
            <TouchableOpacity
              style={styles.copyCodeMiniBtn}
              onPress={() => copyToClipboard(inviteCode, `邀請碼 ${inviteCode} 已複製！`)}
              activeOpacity={0.75}
            >
              <Text style={styles.copyCodeMiniBtnText}>複製代碼</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.copyLinkBtn}
            onPress={() =>
              copyToClipboard(
                getInviteLink(),
                '專屬邀請連結已複製！\n請直接貼到 LINE 聊天室傳送給家人，家人點開即可自動加入。'
              )
            }
            activeOpacity={0.8}
          >
            <Text style={styles.copyLinkBtnText}>
              📋 複製專屬邀請連結 (傳 LINE 給家人)
            </Text>
          </TouchableOpacity>

          {realIsOwner && (
            <View style={styles.ownerControlsRow}>
              <TouchableOpacity
                style={[
                  styles.ownerControlBtn,
                  { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default },
                ]}
                onPress={() => {
                  if (!isAdminMode) {
                    showAlert(
                      '日常模式受限',
                      '目前為日常檢視模式。如需修改帳本名稱，請先點擊首頁頂部的【🛡️ 日常模式】切換為管理員模式。'
                    );
                    return;
                  }
                  onOpenEditLedgerModal();
                }}
                activeOpacity={0.75}
              >
                <Text style={[styles.ownerControlBtnText, { color: colors.text.primary }]}>
                  ✏️ 帳本更名
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.ownerControlBtn,
                  { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default },
                ]}
                onPress={() => {
                  if (!isAdminMode) {
                    showAlert(
                      '日常模式受限',
                      '目前為日常檢視模式。如需重新產生邀請碼，請先點擊首頁頂部的【🛡️ 日常模式】切換為管理員模式。'
                    );
                    return;
                  }
                  showConfirm(
                    '重新產生邀請碼',
                    '重新產生後，舊代碼將會作廢。確定要產生全新的一組隨機邀請碼嗎？',
                    async () => {
                      const newCode = await regenerateInviteCode();
                      showAlert('已更新', `全新家庭邀請碼為：${newCode}`);
                    }
                  );
                }}
                activeOpacity={0.75}
              >
                <Text style={[styles.ownerControlBtnText, { color: colors.text.primary }]}>
                  🔄 重新產生
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.ownerControlBtn,
                  { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default },
                ]}
                onPress={() => {
                  if (!isAdminMode) {
                    showAlert(
                      '日常模式受限',
                      '目前為日常檢視模式。如需自訂邀請碼，請先點擊首頁頂部的【🛡️ 日常模式】切換為管理員模式。'
                    );
                    return;
                  }
                  onOpenCustomCodeModal();
                }}
                activeOpacity={0.75}
              >
                <Text style={[styles.ownerControlBtnText, { color: colors.text.primary }]}>
                  ✏️ 自訂代碼
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* 帳本應急救援安全碼 (僅 Owner 可見) */}
      {realIsOwner && (
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default, marginTop: 12 },
          ]}
        >
          <Text style={[styles.pinHeaderTitle, { color: colors.text.primary }]}>
            🚨 帳本應急救援安全碼
          </Text>
          <Text style={[styles.pinHeaderDesc, { color: colors.text.secondary }]}>
            僅於帳本發生異常、全體管理員皆不在線時供緊急救援使用。平時管理員請使用指紋/Face ID 或 Google 帳號管理。
          </Text>

          <View
            style={[
              styles.pinCardInner,
              { backgroundColor: colors.background.modal, borderColor: colors.border.default },
            ]}
          >
            <View>
              <Text style={[styles.pinCardLabel, { color: colors.text.secondary }]}>
                目前安全 PIN 碼
              </Text>
              <Text style={[styles.pinCardValue, { color: colors.text.primary }]}>
                {showPinClear ? adminPin : `${adminPin.slice(0, 1)}••${adminPin.slice(-1)}`}
              </Text>
              <Text style={[styles.pinCardHint, { color: colors.text.muted }]}>
                （共 {adminPin.length} 碼）
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <TouchableOpacity
                style={[
                  styles.togglePinBtn,
                  { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default },
                ]}
                onPress={() => setShowPinClear((prev) => !prev)}
                activeOpacity={0.75}
              >
                <Text style={[styles.togglePinBtnText, { color: colors.text.primary }]}>
                  {showPinClear ? '🙈 隱藏' : '👁️ 顯示'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.changePinBtn}
                onPress={() => {
                  if (!isAdminMode) {
                    showAlert(
                      '日常模式受限',
                      '目前為日常檢視模式。如需修改應急安全碼，請先點擊首頁頂部的【🛡️ 日常模式】切換為管理員模式。'
                    );
                    return;
                  }
                  onOpenChangePinModal();
                }}
                activeOpacity={0.75}
              >
                <Text style={styles.changePinBtnText}>✏️ 修改</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* 🔒 家庭門禁安全鎖 (允許新成員加入開關) */}
      <View
        style={[
          styles.sectionCard,
          { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default, marginTop: 12 },
        ]}
      >
        <View style={styles.gatekeeperHeaderRow}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
              <Text style={[styles.gatekeeperHeaderTitle, { color: colors.text.primary, flexShrink: 1 }]}>
                🔒 {ledgerName} 門禁安全鎖
              </Text>
              <View
                style={[
                  styles.gatekeeperBadge,
                  allowNewMembers ? styles.gatekeeperBadgeOpen : styles.gatekeeperBadgeLocked,
                ]}
              >
                <Text
                  style={[
                    styles.gatekeeperBadgeText,
                    allowNewMembers ? styles.gatekeeperBadgeTextOpen : styles.gatekeeperBadgeTextLocked,
                  ]}
                >
                  {allowNewMembers ? '🟢 開放加入中' : '🔒 門禁已上鎖'}
                </Text>
              </View>
            </View>
            <Text style={[styles.gatekeeperHeaderDesc, { color: colors.text.secondary }]}>
              {allowNewMembers
                ? '開放中：家人可憑邀請碼加入或認領身分。家人全數就位後建議關閉上鎖，防範邀請碼外流風險。'
                : '已上鎖：全面阻斷新成員加入並隱藏家庭名冊，現有已加入之家人日常記帳完全不受影響。'}
            </Text>
          </View>

          {realIsOwner ? (
            <Switch
              value={allowNewMembers}
              onValueChange={async (newVal) => {
                if (!isAdminMode) {
                  showAlert(
                    '日常檢視模式',
                    '目前為日常檢視模式，僅供瀏覽門禁狀態。\n如需調整門禁安全鎖，請先點擊首頁頂部的【🛡️ 日常模式】切換為管理員模式。'
                  );
                  return;
                }
                if (!newVal) {
                  showConfirm(
                    '上鎖家庭門禁',
                    '確定要關閉新成員加入通道嗎？\n\n上鎖後：\n• 任何持邀請碼的新訪客均無法加入或預覽此家庭\n• 絕不洩露家庭成員名冊\n• 現有已加入的家人不受任何影響\n\n您可隨時在此重新解鎖開啟！',
                    async () => {
                      const res = await updateAllowNewMembers(false);
                      if (res.success) {
                        showAlert('門禁已上鎖 🔒', '已成功關閉新成員加入通道，有效防範邀請碼外流！');
                      } else {
                        showAlert('更新失敗', res.message || '無法更新門禁設定');
                      }
                    }
                  );
                } else {
                  const res = await updateAllowNewMembers(true);
                  if (res.success) {
                    showAlert('門禁已開啟 🟢', '已開放新成員加入通道，家人現在可憑邀請碼加入！');
                  } else {
                    showAlert('更新失敗', res.message || '無法更新門禁設定');
                  }
                }
              }}
              trackColor={{ false: '#FECACA', true: '#BBF7D0' }}
              thumbColor={allowNewMembers ? '#16A34A' : '#DC2626'}
            />
          ) : (
            <View style={styles.gatekeeperReadonlyTag}>
              <Text style={styles.gatekeeperReadonlyTagText}>
                {allowNewMembers ? '開放中' : '已上鎖'}
              </Text>
            </View>
          )}
        </View>
      </View>
    </SettingsSheetModal>
  );
};

const styles = StyleSheet.create({
  sectionCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
  },
  inviteHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  sectionDesc: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    flexShrink: 0,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  inviteCard: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
  },
  inviteCardLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  inviteCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  inviteCodeLarge: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 3,
  },
  copyCodeMiniBtn: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  copyCodeMiniBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  copyLinkBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  copyLinkBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  ownerControlsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  ownerControlBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  ownerControlBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  pinHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  pinHeaderDesc: {
    fontSize: 11.5,
    lineHeight: 16,
    marginBottom: 10,
  },
  pinCardInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  pinCardLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  pinCardValue: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 2,
  },
  pinCardHint: {
    fontSize: 9,
  },
  togglePinBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  togglePinBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  changePinBtn: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  changePinBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  gatekeeperHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gatekeeperHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  gatekeeperBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  gatekeeperBadgeOpen: {
    backgroundColor: '#DCFCE7',
  },
  gatekeeperBadgeLocked: {
    backgroundColor: '#FEE2E2',
  },
  gatekeeperBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  gatekeeperBadgeTextOpen: {
    color: '#15803D',
  },
  gatekeeperBadgeTextLocked: {
    color: '#B91C1C',
  },
  gatekeeperHeaderDesc: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  gatekeeperReadonlyTag: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  gatekeeperReadonlyTagText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600',
  },
});
