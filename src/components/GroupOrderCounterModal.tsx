import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Platform,
  StatusBar,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useLedger } from '../context/LedgerContext';
import { LiveToastBanner } from './LiveToastBanner';
import { GroupOrderSummary, GroupOrderItem, MemberEarningSummary, VoteOptionSummary } from '../lib/groupOrder';

interface GroupOrderCounterModalProps {
  visible: boolean;
  summary: GroupOrderSummary;
  isOrganizer?: boolean;
  onClose: () => void;
  onToggleItem: (itemIndex: number) => void;
  onSettleOrder: (totalAmount: number, storeName: string) => void;
  onUpdateItemMember?: (lineIndex: number, newMemberName?: string) => void;
  onUpdateItem?: (
    lineIndex: number,
    updatedItem: {
      memberName: string;
      itemName: string;
      specs: string;
      price?: number;
    }
  ) => void;
  onDeleteItem?: (lineIndex: number) => void;
  onSettleAllowance?: (earnings: MemberEarningSummary[]) => void;
  onToggleVote?: (lineIndex: number, voterName: string) => void;
  onFinalizeVote?: (winningLineIndex: number) => void;
  onConvertToFoodOrder?: (winningTitle: string) => void;
  onUpdateVoteOption?: (lineIndex: number, newTitle: string) => void;
  onDeleteVoteOption?: (lineIndex: number) => void;
  onAddQuickItem?: () => void;
  onExtendDeadline?: (addMinutes: number) => void;
}

export const GroupOrderCounterModal: React.FC<GroupOrderCounterModalProps> = ({
  visible,
  summary,
  isOrganizer = false,
  onClose,
  onToggleItem,
  onSettleOrder,
  onUpdateItemMember,
  onUpdateItem,
  onDeleteItem,
  onSettleAllowance,
  onToggleVote,
  onFinalizeVote,
  onConvertToFoodOrder,
  onUpdateVoteOption,
  onDeleteVoteOption,
  onAddQuickItem,
  onExtendDeadline,
}) => {
  const { isDark } = useTheme();
  const { currentUser, members, liveToast, dismissLiveToast } = useLedger();
  const [pickingItem, setPickingItem] = useState<GroupOrderItem | null>(null);

  const isExpired = Boolean(summary.deadlineInfo?.isExpired || summary.deadlineInfo?.badgeColorType === 'expired');

  // 編輯投票方案名稱狀態
  const [editingVoteOption, setEditingVoteOption] = useState<VoteOptionSummary | null>(null);
  const [editVoteTitle, setEditVoteTitle] = useState<string>('');

  // 編輯單一餐點品項與金額狀態 (方案 1：全家皆可自由修改任何人的項目)
  const [editingItem, setEditingItem] = useState<GroupOrderItem | null>(null);
  const [editMember, setEditMember] = useState<string>('');
  const [editItemName, setEditItemName] = useState<string>('');
  const [editSpecs, setEditSpecs] = useState<string>('');
  const [editPriceStr, setEditPriceStr] = useState<string>('');

  const handleOpenEdit = (item: GroupOrderItem) => {
    setEditMember(item.memberName || currentUser?.display_name || members[0]?.display_name || '家人');
    setEditItemName(item.itemName || '');
    setEditSpecs(item.specs || '');
    setEditPriceStr(item.price > 0 ? String(item.price) : '');
    setEditingItem(item);
  };

  // 發起人長按方案卡片進行修改名稱或下架刪除 (支援已有人投票防呆)
  const handleVoteOptionLongPress = (opt: VoteOptionSummary, idx: number) => {
    if (opt.isDecided) {
      Alert.alert('已敲定方案', '此候選方案已拍板敲定為最終決策，無法再修改或下架刪除囉！');
      return;
    }

    if (!isOrganizer) {
      Alert.alert(
        '方案管理權限',
        '只有發起人可以修改或下架刪除此候選方案喔！若需調整，請聯繫發起人。'
      );
      return;
    }

    if (opt.voteCount === 0) {
      // 0 票：尚無人投票，完全自由修改或直接刪除
      Alert.alert(
        `管理方案 · ${opt.title}`,
        '目前尚無家人投票，您可以直接修改名稱或刪除此方案：',
        [
          { text: '取消', style: 'cancel' },
          {
            text: '✏️ 修改名稱',
            onPress: () => {
              setEditingVoteOption(opt);
              setEditVoteTitle(opt.title);
            },
          },
          {
            text: '🗑️ 刪除此方案',
            style: 'destructive',
            onPress: () => {
              (onDeleteVoteOption || onDeleteItem)?.(opt.lineIndex);
            },
          },
        ]
      );
    } else {
      // > 0 票：已有家人投票，嚴格防呆
      Alert.alert(
        `管理方案 · ${opt.title}`,
        `此方案已有 ${opt.voteCount} 位家人投票（${opt.voters.join('、')}）。`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '✏️ 修改名稱 (已鎖定)',
            onPress: () => {
              Alert.alert(
                '無法直接修改名稱',
                `為確保投票公平性，已有家人投過票的方案不可直接更改名稱。\n\n若店家有變動（例如公休），請點選「下架刪除」，方案移除後選票將會退回，家人可重新改投其他方案。`
              );
            },
          },
          {
            text: '🗑️ 下架刪除此方案',
            style: 'destructive',
            onPress: () => {
              Alert.alert(
                '確定下架刪除方案？',
                `「${opt.title}」已有 ${opt.voteCount} 位家人投票（${opt.voters.join('、')}）。\n\n刪除後將會移除該方案並退回這些選票，家人可重新改投其他方案，確定要下架嗎？`,
                [
                  { text: '取消', style: 'cancel' },
                  {
                    text: '確定下架',
                    style: 'destructive',
                    onPress: () => {
                      (onDeleteVoteOption || onDeleteItem)?.(opt.lineIndex);
                    },
                  },
                ]
              );
            },
          },
        ]
      );
    }
  };

  const isVote = summary.mode === 'vote';
  const isChore = summary.mode === 'chore';
  const isGrocery = summary.mode === 'grocery';
  const isParcel = summary.mode === 'parcel';
  const isShoppingLike = isGrocery || isParcel || isChore;
  const progressPercent = summary.totalCount > 0
    ? Math.round((summary.completedCount / summary.totalCount) * 100)
    : 0;

  // 投票代表身份切換 (預設為當前登入者或首位成員)
  const [activeVoter, setActiveVoter] = useState<string>(() => {
    const raw = currentUser?.display_name || members[0]?.display_name || '家人';
    return raw.replace(/\s*[\(（]我[\)）]\s*$/, '').trim() || raw;
  });
  const [isVoterPickerOpen, setIsVoterPickerOpen] = useState(false);

  // 確保彈窗開啟或成員載入時，投票身分即時同步至當前帳本之真實成員，杜絕開機未載入時的「爸爸 (我)」幽靈成員
  useEffect(() => {
    if (visible) {
      const validMembers = (members || [])
        .map(m => (m?.display_name || '').replace(/\s*[\(（]我[\)）]\s*$/, '').trim())
        .filter(Boolean);
      const myName = (currentUser?.display_name || '').replace(/\s*[\(（]我[\)）]\s*$/, '').trim();

      if (myName && validMembers.includes(myName)) {
        setActiveVoter(myName);
      } else if (validMembers.length > 0) {
        if (!activeVoter || !validMembers.includes(activeVoter)) {
          setActiveVoter(validMembers[0]);
        }
      }
    }
  }, [visible, currentUser?.display_name, members]);

  // 家事懸賞模式中，已有完成工作且有獎勵的成員清單
  const earnedMembers = (summary.memberEarnings || []).filter(e => e.totalAmount > 0 && e.completedCount > 0);
  const totalEarnedAmount = earnedMembers.reduce((sum, e) => sum + e.totalAmount, 0);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.safeArea, isDark && { backgroundColor: '#111827' }]}>
        <LiveToastBanner toast={liveToast} onDismiss={dismissLiveToast} />
        <View style={[styles.container, isDark && { backgroundColor: '#111827' }]}>
          {/* 頂部標題與關閉列 */}
          <View style={[styles.header, isDark && { borderBottomColor: '#374151' }]}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <View style={styles.titleRow}>
                <Text style={styles.storeIcon}>
                  {isVote ? '🗳️' : (isChore ? '🧹' : (isParcel ? '📦' : (isGrocery ? '🛒' : '🧋')))}
                </Text>
                <Text style={[styles.storeTitle, isDark && { color: '#F9FAFB' }]} numberOfLines={1}>
                  {summary.storeName &&
                  summary.storeName !== '點餐店家' &&
                  summary.storeName !== '採買賣場' &&
                  summary.storeName !== '網購包裹' &&
                  summary.storeName !== '家庭任務' &&
                  summary.storeName !== '家庭決策'
                    ? summary.storeName
                    : (isVote
                        ? '家庭投票決策'
                        : (isChore
                            ? '家庭家事分工'
                            : (isParcel ? '網購湊單／包裹' : (isGrocery ? '賣場採買' : '點餐開團'))))}
                </Text>
              </View>
              <Text style={[styles.storeSubtitle, isDark && { color: '#9CA3AF' }]} numberOfLines={1}>
                {isVote
                  ? (isOrganizer ? '家庭民主投票 · 長按方案可修改或下架' : '家庭民主投票 · 點擊「+1」投票表達意願')
                  : (isChore
                      ? '家庭家事與懸賞分工 · 做完可直接打勾劃線，點人名隨時換人'
                      : (isParcel
                          ? '網購湊單與包裹代領看板 · 買妥或領完可直接點擊劃線'
                          : (isGrocery
                              ? '賣場推車採買看板 · 放入推車可直接劃線核對'
                              : '櫃檯大字點餐看板 · 點完可直接點擊劃線核對')))}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {onAddQuickItem && (
                <TouchableOpacity
                  onPress={() => {
                    if (isExpired) {
                      if (isOrganizer) {
                        Alert.alert('已截止收單', '目前已超過截止時間。身為發起人，您可以點選下方的「+15分」順延截止時間，或點選下方進行拍板敲定！');
                      } else {
                        Alert.alert('已截止收單', '目前已超過截止時間，無法再追加提案囉！如需繼續參與，請聯繫發起人順延截止時間。');
                      }
                      return;
                    }
                    onAddQuickItem();
                  }}
                  style={[
                    styles.quickAddBtn,
                    isExpired && { opacity: 0.6, backgroundColor: isDark ? '#374151' : '#E5E7EB' },
                    isDark && !isExpired && { backgroundColor: '#1E3A8A' },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.quickAddBtnText,
                      isExpired && { color: isDark ? '#9CA3AF' : '#6B7280' },
                      isDark && !isExpired && { color: '#93C5FD' },
                    ]}
                  >
                    {isExpired
                      ? '🔒 已截止'
                      : (isVote
                          ? '＋ 提案'
                          : (isChore ? '＋ 任務' : (isGrocery ? '＋ 我要買' : (isParcel ? '＋ 包裹' : '＋ 追加'))))}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={onClose}
                style={[styles.headerCloseIconBtn, isDark && { backgroundColor: '#374151' }]}
                accessibilityLabel="關閉"
              >
                <Text style={[styles.headerCloseIconText, isDark && { color: '#D1D5DB' }]}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 統計大看板 */}
          <View style={[styles.summaryBoard, isDark && { backgroundColor: '#1F2937', borderColor: '#374151' }]}>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>
                {isVote ? '累計總票數' : (isChore ? '任務進度' : (isParcel ? '處理進度' : (isGrocery ? '採買進度' : '累計數量')))}
              </Text>
              <Text
                style={[
                  styles.summaryBigNumber,
                  { color: '#F59E0B' },
                  isVote && { fontSize: 18 },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {isVote ? (
                  `${summary.totalVotes || 0} 票 (${summary.totalCount} 候選)`
                ) : (
                  <>
                    {summary.completedCount}/{summary.totalCount}{' '}
                    <Text style={{ fontSize: 16 }}>
                      {isChore ? '項' : (isParcel ? '件' : (isGrocery ? '項' : '份'))}
                    </Text>
                    {isShoppingLike && <Text style={{ fontSize: 13, color: '#10B981', fontWeight: '700' }}> ({progressPercent}%)</Text>}
                  </>
                )}
              </Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>
                {isVote ? '目前領先方案' : (isChore ? '累計懸賞獎勵' : '預估總金額')}
              </Text>
              <Text
                style={[styles.summaryBigNumber, { color: '#10B981', fontSize: isVote ? 17 : 24 }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {isVote
                  ? (summary.leadingOption && summary.leadingOption.voteCount > 0
                      ? `🥇 ${summary.leadingOption.title} (${summary.leadingOption.voteCount}票)`
                      : '等待投票中')
                  : (isChore
                      ? `$${summary.totalAmount}`
                      : (summary.hasAmount
                          ? `$${summary.totalAmount}`
                          : (isParcel ? '免付/依結帳' : (isGrocery ? '依發票結算' : '隨喜'))))}
              </Text>
            </View>
          </View>

          {/* 截止時間提示與延長控制條 */}
          {summary.deadlineInfo?.hasDeadline && (
            <View
              style={[
                styles.deadlineBar,
                summary.deadlineInfo.badgeColorType === 'urgent' && styles.deadlineBarUrgent,
                summary.deadlineInfo.badgeColorType === 'expired' && styles.deadlineBarExpired,
                isDark && {
                  backgroundColor: summary.deadlineInfo.badgeColorType === 'expired'
                    ? '#1F2937'
                    : (summary.deadlineInfo.badgeColorType === 'urgent' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)'),
                  borderColor: summary.deadlineInfo.badgeColorType === 'expired'
                    ? '#374151'
                    : (summary.deadlineInfo.badgeColorType === 'urgent' ? '#EF4444' : '#3B82F6'),
                },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <Text style={{ fontSize: 16 }}>
                  {summary.deadlineInfo.badgeColorType === 'expired' ? '🔒' : (summary.deadlineInfo.badgeColorType === 'urgent' ? '🔥' : '⏰')}
                </Text>
                <Text
                  style={[
                    styles.deadlineBarText,
                    summary.deadlineInfo.badgeColorType === 'urgent' && styles.deadlineBarTextUrgent,
                    summary.deadlineInfo.badgeColorType === 'expired' && styles.deadlineBarTextExpired,
                    isDark && {
                      color: summary.deadlineInfo.badgeColorType === 'expired'
                        ? '#9CA3AF'
                        : (summary.deadlineInfo.badgeColorType === 'urgent' ? '#FCA5A5' : '#93C5FD'),
                    },
                  ]}
                  allowFontScaling={false}
                  maxFontSizeMultiplier={1.08}
                >
                  {summary.deadlineInfo.badgeText}
                </Text>
              </View>

              {isOrganizer && onExtendDeadline && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <TouchableOpacity
                    onPress={() => onExtendDeadline(15)}
                    style={[styles.extendDeadlineBtn, isDark && { backgroundColor: '#374151' }]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.extendDeadlineBtnText, isDark && { color: '#D1D5DB' }]}>+15分</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => onExtendDeadline(30)}
                    style={[styles.extendDeadlineBtn, isDark && { backgroundColor: '#374151' }]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.extendDeadlineBtnText, isDark && { color: '#D1D5DB' }]}>+30分</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* 投票身分切換條 */}
          {isVote && (
            <View style={[styles.voteIdentityBar, isDark && { backgroundColor: '#1F2937', borderColor: '#374151' }]}>
              <Text style={[styles.voteIdentityText, isDark && { color: '#9CA3AF' }]}>
                目前以身份投票：
              </Text>
              <TouchableOpacity
                onPress={() => setIsVoterPickerOpen(true)}
                style={[styles.voteIdentityBadge, isDark && { backgroundColor: '#1E3A8A', borderColor: '#3B82F6' }]}
              >
                <Text style={[styles.voteIdentityBadgeText, isDark && { color: '#93C5FD' }]}>
                  👤 {activeVoter}
                  {(currentUser?.display_name || '').replace(/\s*[\(（]我[\)）]\s*$/, '').trim() === activeVoter ? ' (我)' : ''} ▾
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 大字點餐/採買/包裹/投票清單 */}
          <ScrollView style={styles.listScroll} contentContainerStyle={styles.listContent}>
            {isVote ? (
              (!summary.voteOptions || summary.voteOptions.length === 0) ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyIcon}>🗳️</Text>
                  <Text style={[styles.emptyText, isDark && { color: '#9CA3AF' }]}>
                    目前還沒有提案任何候選方案，快點上方「＋ 現場追加」新增提案！
                  </Text>
                </View>
              ) : (
                <>
                  {isOrganizer && (
                    <View style={styles.organizerHintRow}>
                      <Text style={[styles.organizerHintText, isDark && { color: '#9CA3AF' }]}>
                        💡 發起人可長按方案卡片進行修改名稱（0票時）或下架刪除
                      </Text>
                    </View>
                  )}
                  {summary.voteOptions.map((opt, idx) => {
                    const isLeading = summary.leadingOption && opt.voteCount > 0 && opt.voteCount === summary.leadingOption.voteCount;
                    const hasVoted = opt.voters.includes(activeVoter);
                    return (
                      <TouchableOpacity
                        key={idx}
                        activeOpacity={0.85}
                        delayLongPress={350}
                        onLongPress={() => handleVoteOptionLongPress(opt, idx)}
                        style={[
                          styles.voteCard,
                          opt.isDecided && styles.voteCardDecided,
                          isDark && {
                            backgroundColor: opt.isDecided ? 'rgba(16, 185, 129, 0.15)' : '#1E293B',
                            borderColor: opt.isDecided ? '#10B981' : '#334155',
                          },
                        ]}
                      >
                        {/* 平滑進度條底色填充層 (YouTube / Twitter 投票風格，省去獨立一行進度條空間) */}
                        {opt.percentage > 0 && (
                          <View
                            style={[
                              styles.voteProgressFillBg,
                              {
                                width: `${opt.percentage}%`,
                                backgroundColor: opt.isDecided
                                  ? (isDark ? 'rgba(16, 185, 129, 0.25)' : 'rgba(209, 250, 229, 0.8)')
                                  : (isLeading
                                      ? (isDark ? 'rgba(245, 158, 11, 0.25)' : 'rgba(254, 243, 199, 0.85)')
                                      : (isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(239, 246, 255, 0.9)')),
                              },
                            ]}
                          />
                        )}

                        <View style={styles.voteCardTopRow}>
                          <View
                            style={[
                              styles.voteRankTag,
                              isLeading && { backgroundColor: '#FEF3C7' },
                              opt.isDecided && { backgroundColor: '#D1FAE5' },
                            ]}
                          >
                            <Text
                              style={[
                                styles.voteRankText,
                                isLeading && { color: '#D97706' },
                                opt.isDecided && { color: '#059669' },
                              ]}
                            >
                              {opt.isDecided ? '🏆 敲定' : (isLeading ? '🥇 領先' : `#${idx + 1}`)}
                            </Text>
                          </View>
                          <Text style={[styles.voteTitleText, isDark && { color: '#F9FAFB' }]} numberOfLines={2}>
                            {opt.title}
                          </Text>
                          <View style={styles.voteRightActionCol}>
                            <TouchableOpacity
                              activeOpacity={0.7}
                              onPress={() => {
                                if (isExpired) {
                                  if (isOrganizer) {
                                    Alert.alert('投票已截止', '投票已超過截止時間。身為發起人，您可以點選上方的「+15分」順延截止時間，或點選下方進行拍板敲定！');
                                  } else {
                                    Alert.alert('投票已截止', `投票已於 ${summary.deadlineInfo?.badgeText || '先前'} 截止，無法再投票囉！如需繼續參與，請聯繫發起人順延截止時間。`);
                                  }
                                  return;
                                }
                                onToggleVote?.(opt.lineIndex, activeVoter);
                              }}
                              style={[
                                styles.voteBtn,
                                hasVoted && styles.voteBtnActive,
                                isExpired && { opacity: 0.6, borderColor: '#9CA3AF' },
                                isDark && !hasVoted && { backgroundColor: '#374151', borderColor: '#4B5563' },
                              ]}
                            >
                              <Text style={[styles.voteBtnText, hasVoted && styles.voteBtnTextActive]}>
                                {hasVoted ? '✓ 已投' : (isExpired ? '🔒 +1' : '👍 +1')}
                              </Text>
                            </TouchableOpacity>
                            <Text style={[styles.compactVoteScoreBelowText, isDark && { color: '#9CA3AF' }]}>
                              {opt.voteCount}票 ({opt.percentage}%)
                            </Text>
                          </View>
                        </View>

                        {/* 投票人名單 (緊湊微型膠囊，尚無人投票時不佔任何高度) */}
                        {opt.voters.length > 0 && (
                          <View style={styles.compactVotersRow}>
                            {opt.voters.map((v, vIdx) => (
                              <View key={vIdx} style={[styles.compactVoterPill, isDark && { backgroundColor: '#374151' }]}>
                                <Text style={[styles.compactVoterPillText, isDark && { color: '#D1D5DB' }]}>👤 {v}</Text>
                              </View>
                            ))}
                          </View>
                        )}

                        {/* 子項目留言氣泡展示 (若有家人對該方案回覆) */}
                        {opt.replies && opt.replies.length > 0 && (
                          <View style={styles.voteRepliesWrapper}>
                            {opt.replies.map((reply, rIdx) => (
                              <View key={rIdx} style={[styles.voteReplyBubble, isDark && { backgroundColor: '#334155' }]}>
                                <Text style={[styles.voteReplyText, isDark && { color: '#E2E8F0' }]}>
                                  💬 <Text style={{ fontWeight: '700' }}>{reply.memberName}</Text>：{reply.text}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </>
              )
            ) : summary.items.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>{isParcel ? '📦' : (isGrocery ? '🛒' : '📝')}</Text>
                <Text style={[styles.emptyText, isDark && { color: '#9CA3AF' }]}>
                  {isParcel
                    ? '目前還沒有登記湊單或待領包裹，快點「＋加湊/代領」新增！'
                    : (isGrocery
                        ? '目前還沒有登記採買項目，快通知大家在卡片點「＋我要買」！'
                        : '目前還沒有家人登記點單，快通知大家在卡片點「＋我也要」報單！')}
                </Text>
              </View>
            ) : (
              summary.items.map((item: GroupOrderItem, idx: number) => {
                const isChecked = item.isDone;
                return (
                  <TouchableOpacity
                    key={idx}
                    activeOpacity={0.7}
                    onPress={() => onToggleItem(item.lineIndex)}
                    onLongPress={() => handleOpenEdit(item)}
                    style={[
                      styles.orderCard,
                      isChecked && styles.orderCardChecked,
                      isDark && {
                        backgroundColor: isChecked ? '#1F2937' : '#1E293B',
                        borderColor: isChecked ? '#374151' : '#334155',
                      },
                    ]}
                  >
                    {/* 左側勾選盒 */}
                    <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
                      {isChecked && <Text style={styles.checkIcon}>✓</Text>}
                    </View>

                    {/* 右側大字餐點/物品內容 */}
                    <View style={styles.cardContent}>
                      <View style={styles.cardHeaderRow}>
                        {!!item.memberName ? (
                          <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={(e) => {
                              e.stopPropagation?.();
                              setPickingItem(item);
                            }}
                            style={[
                              styles.memberBadge,
                              isGrocery && { backgroundColor: '#ECFDF5' },
                              isParcel && { backgroundColor: '#EFF6FF' },
                              isChore && { backgroundColor: '#FEF3C7', borderColor: '#FDE68A', borderWidth: 1 },
                            ]}
                          >
                            <Text
                              style={[
                                styles.memberBadgeText,
                                isGrocery && { color: '#059669' },
                                isParcel && { color: '#2563EB' },
                                isChore && { color: '#B45309' },
                              ]}
                            >
                              {item.memberName} ▾
                            </Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={(e) => {
                              e.stopPropagation?.();
                              const defaultMember = currentUser?.display_name || members[0]?.display_name || '家人';
                              onUpdateItemMember?.(item.lineIndex, defaultMember);
                            }}
                            style={[
                              styles.claimBtn,
                              isDark && { backgroundColor: 'rgba(245, 158, 11, 0.2)', borderColor: '#F59E0B' },
                            ]}
                          >
                            <Text style={styles.claimBtnText}>＋ ✋ 我認領</Text>
                          </TouchableOpacity>
                        )}
                        <Text
                          style={[
                            styles.itemNameText,
                            isChecked && styles.textStrike,
                            isDark && { color: isChecked ? '#6B7280' : '#F9FAFB' },
                          ]}
                        >
                          {item.itemName}
                        </Text>
                        {item.price > 0 && (
                          <Text style={[styles.priceTag, isChecked && styles.textStrike]}>
                            ${item.price}
                          </Text>
                        )}
                        {/* ✏️ 快捷修改品項與金額按鈕 */}
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            handleOpenEdit(item);
                          }}
                          style={[styles.itemEditBtn, isDark && { backgroundColor: '#374151', borderColor: '#4B5563' }]}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={styles.itemEditBtnText}>✏️</Text>
                        </TouchableOpacity>
                      </View>

                      {!!item.specs && (
                        <View style={styles.specsRow}>
                          <Text
                            style={[
                              styles.specsText,
                              isChecked && styles.textStrike,
                              isDark && { color: isChecked ? '#4B5563' : (isGrocery ? '#34D399' : '#FBBF24') },
                            ]}
                          >
                            👉 {item.specs}
                          </Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          {/* 底部動作列 */}
          <View style={[styles.footer, isDark && { backgroundColor: '#1F2937', borderTopColor: '#374151' }]}>
            {isVote ? (
              <View style={styles.voteFooterContent}>
                {summary.leadingOption && summary.leadingOption.voteCount > 0 ? (
                  <>
                    {!summary.leadingOption.isDecided ? (
                      <View style={styles.voteFooterRow}>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => {
                            Alert.alert(
                              '敲定拍板此方案',
                              `確定將「${summary.leadingOption?.title}」（獲得 ${summary.leadingOption?.voteCount} 票）敲定為最終決策嗎？`,
                              [
                                { text: '取消', style: 'cancel' },
                                {
                                  text: '確定拍板',
                                  onPress: () => {
                                    onFinalizeVote?.(summary.leadingOption!.lineIndex);
                                  },
                                },
                              ]
                            );
                          }}
                          style={[styles.voteFooterBtn, { backgroundColor: '#10B981' }]}
                        >
                          <Text style={styles.voteFooterBtnIcon}>🏆</Text>
                          <Text style={styles.voteFooterBtnText} numberOfLines={1}>
                            拍板最高票
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => {
                            Alert.alert(
                              '轉為點餐開團',
                              `確定將「${summary.leadingOption?.title}」直接轉為全家點餐開團，讓大家開始報單登記嗎？`,
                              [
                                { text: '取消', style: 'cancel' },
                                {
                                  text: '轉為點餐開團',
                                  onPress: () => {
                                    onClose();
                                    onConvertToFoodOrder?.(summary.leadingOption!.title);
                                  },
                                },
                              ]
                            );
                          }}
                          style={[styles.voteFooterBtn, { backgroundColor: '#2563EB' }]}
                        >
                          <Text style={styles.voteFooterBtnIcon}>🧋</Text>
                          <Text style={styles.voteFooterBtnText} numberOfLines={1}>
                            轉點餐開團
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => {
                          onClose();
                          onSettleOrder(0, summary.storeName);
                        }}
                        style={[styles.settleBtn, { backgroundColor: '#059669' }]}
                      >
                        <Text style={styles.settleBtnIcon}>✓</Text>
                        <Text style={styles.settleBtnText}>
                          決策已拍板（{summary.leadingOption.title}）！一鍵歸檔
                        </Text>
                      </TouchableOpacity>
                    )}
                  </>
                ) : (
                  <View style={[styles.voteWaitingBox, isDark && { backgroundColor: '#374151' }]}>
                    <Text style={[styles.voteWaitingText, isDark && { color: '#D1D5DB' }]}>
                      🗳️ 自由投票進行中 · 請點選上方候選「👍 +1」表達意願
                    </Text>
                  </View>
                )}
              </View>
            ) : isChore ? (
              <View style={styles.choreFooterContent}>
                {earnedMembers.length > 0 ? (
                  <>
                    <View style={styles.choreEarnedList}>
                      {earnedMembers.map((em, eIdx) => (
                        <View key={eIdx} style={[styles.choreEarnedRow, isDark && { borderBottomColor: '#374151' }]}>
                          <Text style={[styles.choreEarnedName, isDark && { color: '#F9FAFB' }]}>
                            👦 {em.memberName}：完成 {em.completedCount} 項
                          </Text>
                          <Text style={styles.choreEarnedAmount}>NT$ {em.totalAmount}</Text>
                        </View>
                      ))}
                    </View>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => {
                        Alert.alert(
                          '核發零用錢獎勵',
                          `確定為 ${earnedMembers.map(e => `${e.memberName} (NT$ ${e.totalAmount})`).join('、')} 建立零用錢記帳嗎？`,
                          [
                            { text: '取消', style: 'cancel' },
                            {
                              text: '確定發放',
                              onPress: () => {
                                onClose();
                                onSettleAllowance?.(earnedMembers);
                              },
                            },
                          ]
                        );
                      }}
                      style={[styles.settleBtn, { backgroundColor: '#F59E0B' }]}
                    >
                      <Text style={styles.settleBtnIcon}>💰</Text>
                      <Text style={styles.settleBtnText}>
                        {earnedMembers.length === 1
                          ? `核發零用錢給 ${earnedMembers[0].memberName} ($${totalEarnedAmount})`
                          : `一鍵全發零用錢 (共 $${totalEarnedAmount} / ${earnedMembers.length}人分流記帳)`}
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      onClose();
                      onSettleOrder(summary.totalAmount, summary.storeName);
                    }}
                    style={[styles.settleBtn, { backgroundColor: '#10B981' }]}
                  >
                    <Text style={styles.settleBtnIcon}>✓</Text>
                    <Text style={styles.settleBtnText}>任務全部完成！一鍵歸檔</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  onClose();
                  onSettleOrder(summary.totalAmount, summary.storeName);
                }}
                style={[
                  styles.settleBtn,
                  isGrocery && { backgroundColor: '#059669' },
                  isParcel && { backgroundColor: '#2563EB' },
                ]}
              >
                <Text style={styles.settleBtnIcon}>{isParcel ? '📦' : (isGrocery ? '🛒' : '💰')}</Text>
                <Text style={styles.settleBtnText}>
                  {isParcel
                    ? `結單／領齊了！前往辦妥與核對 ${summary.hasAmount ? `($${summary.totalAmount})` : ''}`
                    : (isGrocery
                        ? `結帳買齊了！前往辦妥與結算 ${summary.hasAmount ? `($${summary.totalAmount})` : ''}`
                        : `買好了！前往辦妥與結算 ${summary.hasAmount ? `($${summary.totalAmount})` : ''}`)}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>

      {/* 指派與換人彈窗選單 */}
      <Modal
        visible={pickingItem !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPickingItem(null)}
      >
        <TouchableOpacity
          style={styles.pickerBackdrop}
          activeOpacity={1}
          onPress={() => setPickingItem(null)}
        >
          <View style={[styles.pickerDialog, isDark && { backgroundColor: '#1F2937', borderColor: '#374151' }]}>
            <Text style={[styles.pickerTitle, isDark && { color: '#F9FAFB' }]} numberOfLines={1}>
              {isChore
                ? `🧹 指派負責人 · ${pickingItem?.itemName}`
                : isGrocery
                ? `🛒 登記採買人 · ${pickingItem?.itemName}`
                : isParcel
                ? `📦 包裹所屬人 · ${pickingItem?.itemName}`
                : `🧋 點餐人 · ${pickingItem?.itemName}`}
            </Text>
            <Text style={[styles.pickerSubtitle, isDark && { color: '#9CA3AF' }]}>
              {isChore
                ? '選擇此項目的認領成員（完成後獎勵將計入該成員）：'
                : isGrocery
                ? '選擇這是誰想買或由誰負責採買：'
                : isParcel
                ? '選擇此包裹是誰的或由誰代領：'
                : '選擇這份餐點是哪位家人的，也可以點下方按鈕直接修改餐點：'}
            </Text>

            <View style={styles.pickerMemberList}>
              {/* 快捷直達修改品項與金額 */}
              <TouchableOpacity
                onPress={() => {
                  const target = pickingItem;
                  setPickingItem(null);
                  if (target) {
                    handleOpenEdit(target);
                  }
                }}
                style={[
                  styles.pickerMemberItem,
                  { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE', borderWidth: 1, marginBottom: 10 },
                  isDark && { backgroundColor: '#1E3A8A', borderColor: '#3B82F6' },
                ]}
              >
                <Text style={[styles.pickerMemberText, { color: '#4F46E5', fontWeight: '700' }, isDark && { color: '#93C5FD' }]}>
                  {isChore
                    ? '✏️ 修改任務名稱或獎勵金額 ›'
                    : isGrocery
                    ? '✏️ 修改採買品名、規格或金額 ›'
                    : isParcel
                    ? '✏️ 修改包裹名稱、備註或金額 ›'
                    : '✏️ 修改此項餐點品名、規格、金額或刪除 ›'}
                </Text>
              </TouchableOpacity>

              {members.map((member: any) => {
                const isCurrent = pickingItem?.memberName === member.display_name;
                const roleSuffix = isCurrent
                  ? isChore
                    ? '（目前負責人）'
                    : isGrocery
                    ? '（目前登記人）'
                    : isParcel
                    ? '（目前所屬人）'
                    : '（目前點餐人）'
                  : '';
                return (
                  <TouchableOpacity
                    key={member.id}
                    onPress={() => {
                      if (pickingItem) {
                        onUpdateItemMember?.(pickingItem.lineIndex, member.display_name);
                      }
                      setPickingItem(null);
                    }}
                    style={[
                      styles.pickerMemberItem,
                      isCurrent && styles.pickerMemberItemActive,
                      isDark && { backgroundColor: isCurrent ? '#1E3A8A' : '#374151' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.pickerMemberText,
                        isCurrent && styles.pickerMemberTextActive,
                        isDark && { color: isCurrent ? '#93C5FD' : '#D1D5DB' },
                      ]}
                    >
                      👤 {member.display_name} {roleSuffix}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                onPress={() => {
                  if (pickingItem) {
                    onUpdateItemMember?.(pickingItem.lineIndex, '');
                  }
                  setPickingItem(null);
                }}
                style={[styles.pickerMemberItem, styles.pickerUnclaimItem]}
              >
                <Text style={styles.pickerUnclaimText}>
                  {isChore
                    ? '❌ 取消認領（退回未分配大家搶）'
                    : isGrocery
                    ? '👥 設為全家採買（公用）'
                    : isParcel
                    ? '👥 設為家庭共用包裹'
                    : '👥 設為全家共享（不綁特定人）'}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => setPickingItem(null)}
              style={[styles.pickerCloseBtn, isDark && { backgroundColor: '#374151' }]}
            >
              <Text style={[styles.pickerCloseBtnText, isDark && { color: '#9CA3AF' }]}>關閉</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 投票代表身份切換選單 */}
      <Modal
        visible={isVoterPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsVoterPickerOpen(false)}
      >
        <TouchableOpacity
          style={styles.pickerBackdrop}
          activeOpacity={1}
          onPress={() => setIsVoterPickerOpen(false)}
        >
          <View style={[styles.pickerDialog, isDark && { backgroundColor: '#1F2937', borderColor: '#374151' }]}>
            <Text style={[styles.pickerTitle, isDark && { color: '#F9FAFB' }]}>
              切換投票代表
            </Text>
            <Text style={[styles.pickerSubtitle, isDark && { color: '#9CA3AF' }]}>
              選擇代表哪位家庭成員投下選票（方便替家中孩童代投）：
            </Text>

            <View style={styles.pickerMemberList}>
              {members.map((member: any) => {
                const cleanName = (member?.display_name || '').replace(/\s*[\(（]我[\)）]\s*$/, '').trim();
                const isCurrent = activeVoter === cleanName;
                const isMe = (currentUser?.display_name || '').replace(/\s*[\(（]我[\)）]\s*$/, '').trim() === cleanName;
                return (
                  <TouchableOpacity
                    key={member.id}
                    onPress={() => {
                      setActiveVoter(cleanName);
                      setIsVoterPickerOpen(false);
                    }}
                    style={[
                      styles.pickerMemberItem,
                      isCurrent && styles.pickerMemberItemActive,
                      isDark && { backgroundColor: isCurrent ? '#1E3A8A' : '#374151' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.pickerMemberText,
                        isCurrent && styles.pickerMemberTextActive,
                        isDark && { color: isCurrent ? '#93C5FD' : '#D1D5DB' },
                      ]}
                    >
                      👤 {cleanName} {isMe ? '(我)' : ''} {isCurrent ? '（目前代表）' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              onPress={() => setIsVoterPickerOpen(false)}
              style={[styles.pickerCloseBtn, isDark && { backgroundColor: '#374151' }]}
            >
              <Text style={[styles.pickerCloseBtnText, isDark && { color: '#9CA3AF' }]}>關閉</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 修改餐點品項與金額彈窗 (方案 1：全家皆可自由修改任何人的項目) */}
      <Modal
        visible={editingItem !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingItem(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.editOverlay}
        >
          <TouchableOpacity
            style={styles.pickerBackdrop}
            activeOpacity={1}
            onPress={() => setEditingItem(null)}
          />
          <View style={[styles.editDialog, isDark && { backgroundColor: '#1F2937', borderColor: '#374151' }]}>
            {/* 標題列 */}
            <View style={styles.editHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.editTitle, isDark && { color: '#F9FAFB' }]} numberOfLines={1}>
                  ✏️ 修改點單 · {editingItem?.itemName}
                </Text>
                <Text style={[styles.editSubtitle, isDark && { color: '#9CA3AF' }]}>
                  修改餐點品名、規格或金額，儲存後全家即時同步
                </Text>
              </View>
              <TouchableOpacity onPress={() => setEditingItem(null)} style={styles.editCloseIconBtn}>
                <Text style={styles.editCloseIconText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.editBodyScroll} keyboardShouldPersistTaps="handled">
              {/* 1. 點餐人切換 */}
              <Text style={[styles.editLabel, isDark && { color: '#D1D5DB' }]}>
                點餐人／負責人：
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.memberScrollRow}>
                {members.map((member: any) => {
                  const isSelected = editMember === member.display_name;
                  return (
                    <TouchableOpacity
                      key={member.id}
                      onPress={() => setEditMember(member.display_name)}
                      style={[
                        styles.memberPill,
                        isSelected && styles.memberPillActive,
                        isDark && !isSelected && { backgroundColor: '#374151', borderColor: '#4B5563' },
                      ]}
                    >
                      <Text style={[styles.memberPillText, isSelected && styles.memberPillTextActive]}>
                        👤 {member.display_name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* 2. 餐點品名 */}
              <Text style={[styles.editLabel, isDark && { color: '#D1D5DB' }]}>
                餐點品項名稱：
              </Text>
              <TextInput
                style={[styles.editInput, isDark && styles.editInputDark]}
                value={editItemName}
                onChangeText={setEditItemName}
                placeholder="例如：蛋、波霸紅茶拿鐵、排骨便當"
                placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
              />

              {/* 3. 規格／備註 */}
              <Text style={[styles.editLabel, isDark && { color: '#D1D5DB' }]}>
                規格／甜度冰塊／備註：
              </Text>
              <TextInput
                style={[styles.editInput, isDark && styles.editInputDark]}
                value={editSpecs}
                onChangeText={setEditSpecs}
                placeholder="例如：微糖微冰、大杯、加辣"
                placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickTagsRow}>
                {['微糖微冰', '無糖微冰', '無糖少冰', '全糖正常冰', '大杯', '中杯', '熱飲', '加辣', '不要辣', '不要蔥', '加飯'].map((tag) => (
                  <TouchableOpacity
                    key={tag}
                    onPress={() => {
                      if (!editSpecs) setEditSpecs(tag);
                      else if (!editSpecs.includes(tag)) setEditSpecs(`${editSpecs}、${tag}`);
                    }}
                    style={[styles.quickTagBtn, isDark && { backgroundColor: '#374151', borderColor: '#4B5563' }]}
                  >
                    <Text style={[styles.quickTagBtnText, isDark && { color: '#D1D5DB' }]}>+{tag}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* 4. 金額 */}
              <Text style={[styles.editLabel, isDark && { color: '#D1D5DB' }]}>
                預估金額 (新台幣元)：
              </Text>
              <TextInput
                style={[styles.editInput, isDark && styles.editInputDark]}
                value={editPriceStr}
                onChangeText={setEditPriceStr}
                placeholder="例如：36、60 (未填則預設為 0)"
                keyboardType="numeric"
                placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
              />
            </ScrollView>

            {/* 底部按鈕：刪除此項 / 儲存修改 */}
            <View style={styles.editFooterRow}>
              <TouchableOpacity
                onPress={() => {
                  Alert.alert(
                    '刪除點單項目',
                    `確定要刪除「${editingItem?.memberName ? `${editingItem.memberName}：` : ''}${editingItem?.itemName}」嗎？`,
                    [
                      { text: '取消', style: 'cancel' },
                      {
                        text: '確定刪除',
                        style: 'destructive',
                        onPress: () => {
                          if (editingItem) {
                            onDeleteItem?.(editingItem.lineIndex);
                          }
                          setEditingItem(null);
                        },
                      },
                    ]
                  );
                }}
                style={styles.editDeleteBtn}
              >
                <Text style={styles.editDeleteBtnText}>🗑️ 刪除此項</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  const cleanName = editItemName.trim();
                  if (!cleanName) {
                    Alert.alert('請輸入品項名稱', '餐點品項名稱不能為空白喔！');
                    return;
                  }
                  const priceVal = parseInt(editPriceStr, 10);
                  const validPrice = !isNaN(priceVal) && priceVal > 0 ? priceVal : 0;

                  if (editingItem) {
                    onUpdateItem?.(editingItem.lineIndex, {
                      memberName: editMember,
                      itemName: cleanName,
                      specs: editSpecs.trim(),
                      price: validPrice,
                    });
                  }
                  setEditingItem(null);
                }}
                style={styles.editSaveBtn}
              >
                <Text style={styles.editSaveBtnText}>💾 儲存修改</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 修改投票方案名稱彈窗 (僅限發起人於無人投票時或防呆確認後修改) */}
      <Modal
        visible={editingVoteOption !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingVoteOption(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.editOverlay}
        >
          <TouchableOpacity
            style={styles.pickerBackdrop}
            activeOpacity={1}
            onPress={() => setEditingVoteOption(null)}
          />
          <View style={[styles.editDialog, isDark && { backgroundColor: '#1F2937', borderColor: '#374151' }]}>
            <View style={styles.editHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.editTitle, isDark && { color: '#F9FAFB' }]} numberOfLines={1}>
                  ✏️ 修改方案名稱
                </Text>
                <Text style={[styles.editSubtitle, isDark && { color: '#9CA3AF' }]}>
                  修正方案錯別字或調整店家名稱
                </Text>
              </View>
              <TouchableOpacity onPress={() => setEditingVoteOption(null)} style={styles.editCloseIconBtn}>
                <Text style={styles.editCloseIconText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={{ marginVertical: 18 }}>
              <Text style={[styles.editLabel, isDark && { color: '#D1D5DB' }]}>
                候選方案名稱 *：
              </Text>
              <TextInput
                style={[styles.editInput, isDark && styles.editInputDark]}
                value={editVoteTitle}
                onChangeText={setEditVoteTitle}
                placeholder="例如：阿婆壽司、麥當勞"
                placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                autoFocus
              />
            </View>

            <View style={styles.editFooterRow}>
              <TouchableOpacity
                onPress={() => setEditingVoteOption(null)}
                style={[styles.editDeleteBtn, { backgroundColor: isDark ? '#374151' : '#F3F4F6' }]}
              >
                <Text style={[styles.editDeleteBtnText, { color: isDark ? '#9CA3AF' : '#4B5563' }]}>取消</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  const cleanTitle = editVoteTitle.trim();
                  if (!cleanTitle) {
                    Alert.alert('請輸入方案名稱', '方案名稱不能為空白喔！');
                    return;
                  }
                  if (editingVoteOption) {
                    onUpdateVoteOption?.(editingVoteOption.lineIndex, cleanTitle);
                  }
                  setEditingVoteOption(null);
                }}
                style={styles.editSaveBtn}
              >
                <Text style={styles.editSaveBtnText}>💾 儲存修改</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Modal>
  );
};

const styles = StyleSheet.create({
  organizerHintRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  organizerHintText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 0,
  },
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 8 : 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  storeIcon: {
    fontSize: 24,
  },
  storeTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
  },
  storeSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  quickAddBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  quickAddBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#2563EB',
  },
  closeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
  },
  closeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },
  headerCloseIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCloseIconText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4B5563',
    lineHeight: 18,
  },
  summaryBoard: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  summaryCol: {
    flex: 1,
    alignItems: 'center',
  },
  divider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 8,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
    fontWeight: '600',
  },
  summaryBigNumber: {
    fontSize: 24,
    fontWeight: '900',
  },
  listScroll: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 22,
  },
  orderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  orderCardChecked: {
    opacity: 0.5,
    backgroundColor: '#F3F4F6',
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  checkboxChecked: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  checkIcon: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 16,
  },
  cardContent: {
    flex: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  memberBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  memberBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2563EB',
  },
  itemNameText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    flex: 1,
  },
  priceTag: {
    fontSize: 17,
    fontWeight: '800',
    color: '#059669',
  },
  specsRow: {
    marginTop: 6,
  },
  specsText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#D97706',
  },
  textStrike: {
    textDecorationLine: 'line-through',
  },
  footer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  settleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  settleBtnIcon: {
    fontSize: 20,
  },
  settleBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  claimBtn: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderStyle: 'dashed',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  claimBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#D97706',
  },
  choreFooterContent: {
    gap: 12,
  },
  choreEarnedList: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  choreEarnedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  choreEarnedName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },
  choreEarnedAmount: {
    fontSize: 14,
    fontWeight: '900',
    color: '#D97706',
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  pickerDialog: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 4,
  },
  pickerSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 16,
    lineHeight: 18,
  },
  pickerMemberList: {
    gap: 8,
    marginBottom: 16,
  },
  pickerMemberItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pickerMemberItemActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  pickerMemberText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#374151',
  },
  pickerMemberTextActive: {
    color: '#2563EB',
    fontWeight: '800',
  },
  pickerUnclaimItem: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  pickerUnclaimText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E11D48',
    textAlign: 'center',
  },
  pickerCloseBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  pickerCloseBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
  deadlineBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 8,
  },
  deadlineBarUrgent: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  deadlineBarExpired: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
  },
  deadlineBarText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#2563EB',
  },
  deadlineBarTextUrgent: {
    color: '#DC2626',
    fontWeight: '900',
  },
  deadlineBarTextExpired: {
    color: '#6B7280',
    fontWeight: '700',
  },
  extendDeadlineBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  extendDeadlineBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#374151',
  },
  voteIdentityBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 8,
  },
  voteIdentityText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
  },
  voteIdentityBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  voteIdentityBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2563EB',
  },
  voteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 10,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    gap: 6,
    position: 'relative',
    overflow: 'hidden',
  },
  voteProgressFillBg: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 14,
  },
  compactVoteScoreText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6B7280',
  },
  compactVotersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    alignItems: 'center',
    marginTop: 2,
  },
  compactVoterPill: {
    backgroundColor: 'rgba(243, 244, 246, 0.85)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: 'rgba(209, 213, 219, 0.6)',
  },
  compactVoterPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#4B5563',
  },
  voteRepliesWrapper: {
    marginTop: 4,
    gap: 4,
  },
  voteReplyBubble: {
    backgroundColor: 'rgba(241, 245, 249, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderLeftWidth: 2.5,
    borderLeftColor: '#3B82F6',
    alignSelf: 'flex-start',
  },
  voteReplyText: {
    fontSize: 11.5,
    color: '#475569',
  },
  voteCardDecided: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  voteCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  voteRankTag: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  voteRankText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#4B5563',
  },
  voteTitleText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    flex: 1,
  },
  voteRightActionCol: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
  },
  compactVoteScoreBelowText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'center',
  },
  voteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  voteBtnActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  voteBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#374151',
  },
  voteBtnTextActive: {
    color: '#2563EB',
    fontWeight: '900',
  },
  voteProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  voteProgressBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  voteProgressBarFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 4,
  },
  voteProgressText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    minWidth: 70,
    textAlign: 'right',
  },
  votersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  voterPill: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  voterPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
  },
  votersEmptyText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  voteFooterContent: {
    gap: 8,
  },
  voteFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  voteFooterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  voteFooterBtnIcon: {
    fontSize: 18,
  },
  voteFooterBtnText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  voteWaitingBox: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  voteWaitingText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4B5563',
    textAlign: 'center',
  },
  itemEditBtn: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemEditBtnText: {
    fontSize: 13,
  },
  editOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  editDialog: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  editHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  editTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  editSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  editCloseIconBtn: {
    padding: 6,
    marginLeft: 8,
  },
  editCloseIconText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  editBodyScroll: {
    maxHeight: 380,
  },
  editLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginTop: 10,
    marginBottom: 6,
  },
  memberScrollRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  memberPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 8,
  },
  memberPillActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  memberPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
  },
  memberPillTextActive: {
    color: '#2563EB',
  },
  editInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    marginBottom: 4,
  },
  editInputDark: {
    backgroundColor: '#374151',
    borderColor: '#4B5563',
    color: '#F9FAFB',
  },
  quickTagsRow: {
    flexDirection: 'row',
    marginBottom: 8,
    marginTop: 4,
  },
  quickTagBtn: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 6,
  },
  quickTagBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  editFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 14,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 12,
  },
  editDeleteBtn: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editDeleteBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#DC2626',
  },
  editSaveBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editSaveBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
