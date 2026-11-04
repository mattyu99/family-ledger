import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Linking,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Profile } from '../types/database';
import { SWEETHOME_MEMBERS } from '../constants/sweethomeDemo';

export interface DemoQuestBannerProps {
  isDark: boolean;
  currentUser?: Profile;
  members?: Profile[];
  onSwitchMember?: (member: Profile) => void;
  onEditName: () => void;
  onAddExpense: () => void;
  onOpenLottery: () => void;
  onOpenBills: () => void;
  onOpenReconciliation: () => void;
  onOpenMemos: () => void;
  onCreateLedger: () => void;
  onResetDemo: () => void;
}

const STORAGE_KEY_QUESTS = '@sweethome_completed_quests';

interface QuestItem {
  id: string;
  tag: string;
  title: string;
  desc: string;
  actionText: string;
  action: () => void;
}

export const DemoQuestBanner: React.FC<DemoQuestBannerProps> = ({
  isDark,
  currentUser,
  members,
  onSwitchMember,
  onEditName,
  onAddExpense,
  onOpenLottery,
  onOpenBills,
  onOpenReconciliation,
  onOpenMemos,
  onCreateLedger,
  onResetDemo,
}) => {
  const [completedQuestIds, setCompletedQuestIds] = useState<string[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [hasShownCelebration, setHasShownCelebration] = useState(false);

  // 示範家庭成員名單（嚴格鎖定 4 位示範成員，支援改名連動，杜絕第 5 人）
  const activeMembersList = (() => {
    if (members && members.length > 0) {
      const filtered = SWEETHOME_MEMBERS.map(sm => {
        const found = members.find(m => m.id === sm.id);
        return found ? { ...sm, display_name: found.display_name, avatar_url: found.avatar_url || sm.avatar_url } : sm;
      });
      return filtered;
    }
    return SWEETHOME_MEMBERS;
  })();

  // 讀取已完成任務清單
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_QUESTS).then((val) => {
      if (val) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) {
            setCompletedQuestIds(parsed);
          }
        } catch {
          // ignore
        }
      }
    });
  }, []);

  const markQuestCompleted = async (questId: string) => {
    setCompletedQuestIds((prev) => {
      if (prev.includes(questId)) return prev;
      const updated = [...prev, questId];
      AsyncStorage.setItem(STORAGE_KEY_QUESTS, JSON.stringify(updated));
      if (updated.length === 6 && !hasShownCelebration) {
        setShowCelebration(true);
        setHasShownCelebration(true);
      }
      return updated;
    });
  };

  const handleQuestAction = (questId: string, actionFn: () => void) => {
    markQuestCompleted(questId);
    actionFn();
  };

  const quests: QuestItem[] = [
    {
      id: 'quest_name',
      tag: '✏️ 任務 1',
      title: '換成我的專屬暱稱',
      desc: '把「智爸」換成您平時的稱呼，3 秒建立代入感',
      actionText: '改名字',
      action: () => handleQuestAction('quest_name', onEditName),
    },
    {
      id: 'quest_expense',
      tag: '⚡ 任務 2',
      title: '試記一筆今日花費',
      desc: '輸入咖啡 85 元，體驗極速分類與滑順大算盤',
      actionText: '記一筆',
      action: () => handleQuestAction('quest_expense', onAddExpense),
    },
    {
      id: 'quest_lottery',
      tag: '🎉 任務 3',
      title: '查看中獎 200 元發票',
      desc: '已為您預備一張命中六獎的發票，體驗一鍵領獎',
      actionText: '去對獎',
      action: () => handleQuestAction('quest_lottery', onOpenLottery),
    },
    {
      id: 'quest_bill',
      tag: '⏰ 任務 4',
      title: '查看 3 天後電費帳單',
      desc: '台電電費即將扣款，點擊「確認繳費」自動入帳',
      actionText: '銷帳單',
      action: () => handleQuestAction('quest_bill', onOpenBills),
    },
    {
      id: 'quest_reconcile',
      tag: '💳 任務 5',
      title: '信用卡打勾對帳',
      desc: '國泰卡點擊未對帳消費，看金額即時扣減',
      actionText: '去對帳',
      action: () => handleQuestAction('quest_reconcile', onOpenReconciliation),
    },
    {
      id: 'quest_memo',
      tag: '📝 任務 6',
      title: '共享備忘錄打勾採買',
      desc: '在露營採買清單打勾劃掉「買鮮奶」',
      actionText: '看備忘',
      action: () => handleQuestAction('quest_memo', onOpenMemos),
    },
  ];

  const completedCount = completedQuestIds.length;
  const progressPercent = Math.round((completedCount / 6) * 100);

  const handleOpenManual = () => {
    Linking.openURL('https://mattyu99.github.io/family-ledger/manual.html');
  };

  const handleConfirmReset = () => {
    Alert.alert(
      '還原 SWEETHOME 初始狀態',
      '確定要重置示範資料嗎？您剛才在本機測試輸入的紀錄將被清除，並重新還原為乾淨的標準示範帳本。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '確定還原',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem(STORAGE_KEY_QUESTS);
            setCompletedQuestIds([]);
            setHasShownCelebration(false);
            onResetDemo();
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      {/* 頂部橫幅標題列 */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.badgeText}>🎮 示範試玩沙盒</Text>
          <Text style={[styles.title, isDark && styles.textDark]}>
            SWEETHOME 探索指南 ({completedCount}/6)
          </Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[styles.smallBtn, isDark && styles.smallBtnDark]}
            onPress={handleConfirmReset}
          >
            <Text style={[styles.smallBtnText, isDark && styles.smallBtnTextDark]}>
              🔄 還原初始
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.smallBtn, isDark && styles.smallBtnDark]}
            onPress={() => setIsCollapsed(!isCollapsed)}
          >
            <Text style={[styles.smallBtnText, isDark && styles.smallBtnTextDark]}>
              {isCollapsed ? '展開 ▼' : '收合 ▲'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 進度條 */}
      <View style={[styles.progressTrack, isDark && styles.progressTrackDark]}>
        <View style={[styles.progressBar, { width: `${progressPercent}%` }]} />
      </View>

      {/* 展開之任務清單與視角切換器 */}
      {!isCollapsed && (
        <View style={styles.questsList}>
          {/* 👤 體驗版專屬視角切換器 */}
          <View style={[styles.switcherCard, isDark && styles.switcherCardDark]}>
            <View style={styles.switcherHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.switcherHeaderTitle, isDark && styles.textDark]}>
                  👤 切換體驗成員視角
                </Text>
                <View style={styles.switcherExclusiveTag}>
                  <Text style={styles.switcherExclusiveTagText}>體驗版專屬</Text>
                </View>
              </View>
              <Text style={[styles.switcherCurrentLabel, isDark && styles.textMutedDark]}>
                目前：{currentUser?.display_name || activeMembersList[0]?.display_name}
              </Text>
            </View>

            {/* 成員膠囊清單 */}
            <View style={styles.memberChipsRow}>
              {activeMembersList.map((m) => {
                const isCurrent = currentUser?.id === m.id || (!currentUser?.id && m.id === activeMembersList[0]?.id);
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[
                      styles.memberChip,
                      isDark && styles.memberChipDark,
                      isCurrent && styles.memberChipActive,
                    ]}
                    activeOpacity={0.7}
                    onPress={() => {
                      if (isCurrent) return;
                      onSwitchMember?.(m);
                    }}
                  >
                    <Text style={styles.memberChipAvatar}>{m.avatar_url || '👤'}</Text>
                    <Text
                      style={[
                        styles.memberChipName,
                        isDark && styles.textDark,
                        isCurrent && styles.memberChipNameActive,
                      ]}
                      numberOfLines={1}
                    >
                      {m.display_name}
                    </Text>
                    {isCurrent && (
                      <View style={styles.chipCurrentDot}>
                        <Text style={styles.chipCurrentDotText}>我</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 💡 甜心記帳本「公私分明」核心哲學解說卡 */}
            <View style={[styles.philosophyBox, isDark && styles.philosophyBoxDark]}>
              <View style={styles.philosophyHeaderRow}>
                <Text style={{ fontSize: 13, marginRight: 4 }}>💡</Text>
                <Text style={[styles.philosophyTitle, isDark && styles.philosophyTitleDark]}>
                  甜心記帳本「公私分明」核心理念：
                </Text>
              </View>
              <Text style={[styles.philosophyItemText, isDark && styles.philosophyItemTextDark]}>
                • <Text style={{ fontWeight: '700' }}>全家公帳 0 秒即時同步</Text>：全家人在各自手機記錄的每一筆開銷、共享採買清單、水電繳費狀態，全家隨時即時看見、協同管理！
              </Text>
              <Text style={[styles.philosophyItemText, isDark && styles.philosophyItemTextDark, { marginTop: 4 }]}>
                • <Text style={{ fontWeight: '700' }}>個人隱私嚴格保護</Text>：真實環境中每位家人各自用獨立手機，無法跨成員切換身分，個人私房信用卡與帳戶額度 100% 互不干擾、安全獨立！
              </Text>
            </View>
          </View>

          {quests.map((q) => {
            const isDone = completedQuestIds.includes(q.id);
            return (
              <View
                key={q.id}
                style={[
                  styles.questCard,
                  isDark && styles.questCardDark,
                  isDone && styles.questCardDone,
                ]}
              >
                <View style={styles.questInfo}>
                  <View style={styles.questTagRow}>
                    <Text style={styles.questTag}>{q.tag}</Text>
                    {isDone && <Text style={styles.doneBadge}>✅ 已完成</Text>}
                  </View>
                  <Text style={[styles.questTitle, isDark && styles.textDark]}>
                    {q.title}
                  </Text>
                  <Text style={[styles.questDesc, isDark && styles.textMutedDark]}>
                    {q.desc}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    isDone ? styles.actionBtnDone : styles.actionBtnActive,
                  ]}
                  onPress={q.action}
                >
                  <Text
                    style={[
                      styles.actionBtnText,
                      isDone ? styles.actionBtnTextDone : styles.actionBtnTextActive,
                    ]}
                  >
                    {isDone ? '再次體驗' : `👉 ${q.actionText}`}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}

          {/* 任務底部小連結 (方案 A) */}
          <View style={styles.footerNoteRow}>
            <Text style={[styles.footerNote, isDark && styles.textMutedDark]}>
              💡 想了解 14 大模組深度規格？
            </Text>
            <TouchableOpacity onPress={handleOpenManual}>
              <Text style={styles.manualLink}>📖 翻閱官方使用者手冊</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 通關慶祝賀卡彈窗 */}
      <Modal
        visible={showCelebration}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCelebration(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.celebrationCard, isDark && styles.celebrationCardDark]}>
            <Text style={styles.celebrationEmoji}>🎉 🎊 🏆</Text>
            <Text style={[styles.celebrationTitle, isDark && styles.textDark]}>
              太棒了！您已通關全套體驗！
            </Text>
            <Text style={[styles.celebrationBody, isDark && styles.textMutedDark]}>
              您已經親自體驗了改名、極速記帳、發票對獎、水電銷帳、信用卡對帳與共享生活手帳。{'\n\n'}
              記帳不再是一個人孤軍奮戰，現在就為您的家人建立一個溫馨專屬的家庭記帳本吧！
            </Text>

            <TouchableOpacity
              style={styles.primaryModalBtn}
              onPress={() => {
                setShowCelebration(false);
                onCreateLedger();
              }}
            >
              <Text style={styles.primaryModalBtnText}>
                🚀 立即建立我的家庭專屬帳本
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryModalBtn}
              onPress={() => {
                setShowCelebration(false);
                handleOpenManual();
              }}
            >
              <Text style={styles.secondaryModalBtnText}>
                📖 閱讀官方完整使用手冊 (10 大章節)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.closeModalBtn}
              onPress={() => setShowCelebration(false)}
            >
              <Text style={[styles.closeModalText, isDark && styles.textMutedDark]}>
                稍後再說，繼續在示範帳本試玩
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 8,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FAF5FF',
    borderWidth: 1,
    borderColor: '#E9D5FF',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  containerDark: {
    backgroundColor: '#261C3B',
    borderColor: '#4C1D95',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerLeft: {
    flex: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9333EA',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1F2937',
    marginTop: 2,
  },
  textDark: {
    color: '#F9FAFB',
  },
  textMutedDark: {
    color: '#9CA3AF',
  },
  headerRight: {
    flexDirection: 'row',
    gap: 6,
  },
  smallBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#F3E8FF',
  },
  smallBtnDark: {
    backgroundColor: '#3B1F6E',
  },
  smallBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7E22CE',
  },
  smallBtnTextDark: {
    color: '#D8B4FE',
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#E9D5FF',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressTrackDark: {
    backgroundColor: '#3B1F6E',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#9333EA',
    borderRadius: 3,
  },
  questsList: {
    gap: 8,
    marginTop: 4,
  },
  switcherCard: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E9D5FF',
    marginBottom: 4,
  },
  switcherCardDark: {
    backgroundColor: '#1E152D',
    borderColor: '#4C1D95',
  },
  switcherHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    flexWrap: 'wrap',
    gap: 4,
  },
  switcherHeaderTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#111827',
  },
  switcherExclusiveTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#EDE9FE',
  },
  switcherExclusiveTagText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#7C3AED',
  },
  switcherCurrentLabel: {
    fontSize: 11.5,
    color: '#6B7280',
    fontWeight: '600',
  },
  memberChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: '#FAF5FF',
    borderWidth: 1,
    borderColor: '#E9D5FF',
    gap: 5,
  },
  memberChipDark: {
    backgroundColor: '#2D154D',
    borderColor: '#4C1D95',
  },
  memberChipActive: {
    backgroundColor: '#9333EA',
    borderColor: '#7E22CE',
  },
  memberChipAvatar: {
    fontSize: 14,
  },
  memberChipName: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#374151',
  },
  memberChipNameActive: {
    color: '#FFFFFF',
  },
  chipCurrentDot: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  chipCurrentDotText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  philosophyBox: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  philosophyBoxDark: {
    backgroundColor: '#170E28',
    borderColor: '#3B1F6E',
  },
  philosophyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  philosophyTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6D28D9',
  },
  philosophyTitleDark: {
    color: '#C4B5FD',
  },
  philosophyItemText: {
    fontSize: 11.5,
    color: '#4B5563',
    lineHeight: 16.5,
  },
  philosophyItemTextDark: {
    color: '#9CA3AF',
  },
  questCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F3E8FF',
  },
  questCardDark: {
    backgroundColor: '#1E152D',
    borderColor: '#371B5C',
  },
  questCardDone: {
    opacity: 0.85,
  },
  questInfo: {
    flex: 1,
    paddingRight: 10,
  },
  questTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  questTag: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8B5CF6',
  },
  doneBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10B981',
  },
  questTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#111827',
  },
  questDesc: {
    fontSize: 11.5,
    color: '#6B7280',
    marginTop: 2,
    lineHeight: 16,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnActive: {
    backgroundColor: '#9333EA',
  },
  actionBtnDone: {
    backgroundColor: '#F3E8FF',
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  actionBtnTextActive: {
    color: '#FFFFFF',
  },
  actionBtnTextDone: {
    color: '#7E22CE',
  },
  footerNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3E8FF',
  },
  footerNote: {
    fontSize: 12,
    color: '#6B7280',
  },
  manualLink: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9333EA',
    textDecorationLine: 'underline',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  celebrationCard: {
    width: '100%',
    maxWidth: 380,
    padding: 24,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  celebrationCardDark: {
    backgroundColor: '#1E152D',
  },
  celebrationEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  celebrationTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 10,
  },
  celebrationBody: {
    fontSize: 13.5,
    color: '#4B5563',
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  primaryModalBtn: {
    width: '100%',
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#9333EA',
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryModalBtnText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  secondaryModalBtn: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    marginBottom: 12,
  },
  secondaryModalBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#7E22CE',
  },
  closeModalBtn: {
    paddingVertical: 8,
  },
  closeModalText: {
    fontSize: 12.5,
    color: '#9CA3AF',
  },
});

