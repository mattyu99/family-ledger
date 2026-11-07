import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Linking,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Profile } from '../types/database';
import { SWEETHOME_MEMBERS } from '../constants/sweethomeDemo';
import { showConfirm } from '../lib/alert';

export interface DemoQuestBannerProps {
  isDark: boolean;
  activeTab?: string;
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
  activeTab,
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
  const [prevActiveTab, setPrevActiveTab] = useState(activeTab);
  const [showCelebration, setShowCelebration] = useState(false);
  const [hasShownCelebration, setHasShownCelebration] = useState(false);
  const [showPhilosophyModal, setShowPhilosophyModal] = useState(false);

  // 切換至「統計 / 帳單支付 / 家庭設定」分頁時自動收合，避免佔據頁面空間
  if (activeTab !== prevActiveTab) {
    setPrevActiveTab(activeTab);
    if (activeTab && activeTab !== 'transactions') {
      setIsCollapsed(true);
    }
  }

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
            // 若 6 項任務皆已通關，預設自動折疊收合，避免畫面過長遮擋內容
            if (parsed.length >= 6) {
              setIsCollapsed(true);
            }
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
      desc: '台電電費即將扣款，點擊「確認記帳」自動入帳',
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
  const activeMemberObj =
    activeMembersList.find((m) => m.id === currentUser?.id) || activeMembersList[0];

  const handleOpenManual = () => {
    Linking.openURL('https://mattyu99.github.io/family-ledger/manual.html');
  };

  const handleConfirmReset = () => {
    showConfirm(
      '還原 SWEETHOME 初始狀態',
      '確定要重置示範資料嗎？您剛才在本機測試輸入的紀錄將被清除，並重新還原為乾淨的標準示範帳本。',
      async () => {
        await AsyncStorage.removeItem(STORAGE_KEY_QUESTS);
        setCompletedQuestIds([]);
        setHasShownCelebration(false);
        setIsCollapsed(false);
        onResetDemo();
      }
    );
  };

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      {/* 頂部精簡單行標題列 */}
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.headerLeft}
          activeOpacity={0.7}
          onPress={() => setIsCollapsed(!isCollapsed)}
        >
          <Text
            style={[styles.title, isDark && styles.textDark]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.15}
          >
            🎮 探索指南 ({completedCount}/6)
          </Text>
          {isCollapsed && activeMemberObj && (
            <View style={[styles.collapsedMemberPill, isDark && styles.collapsedMemberPillDark]}>
              <Text style={styles.collapsedMemberText} numberOfLines={1} maxFontSizeMultiplier={1.1}>
                {activeMemberObj.avatar_url || '👤'} {activeMemberObj.display_name.replace(/\s*\(.*?\)/, '')}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.headerRight}>
          {!isCollapsed && (
            <TouchableOpacity
              style={[styles.smallBtn, isDark && styles.smallBtnDark]}
              onPress={() => setShowPhilosophyModal(true)}
            >
              <Text style={[styles.smallBtnText, isDark && styles.smallBtnTextDark]} maxFontSizeMultiplier={1.1}>
                💡 理念
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.smallBtn, isDark && styles.smallBtnDark]}
            onPress={handleConfirmReset}
          >
            <Text style={[styles.smallBtnText, isDark && styles.smallBtnTextDark]} maxFontSizeMultiplier={1.1}>
              🔄 還原
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.smallBtn, isDark && styles.smallBtnDark]}
            onPress={() => setIsCollapsed(!isCollapsed)}
          >
            <Text style={[styles.smallBtnText, isDark && styles.smallBtnTextDark]} maxFontSizeMultiplier={1.1}>
              {isCollapsed ? '展開 ▼' : '收合 ▲'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 超薄進度條 */}
      <View
        style={[
          styles.progressTrack,
          isDark && styles.progressTrackDark,
          isCollapsed && { marginBottom: 0 },
        ]}
      >
        <View style={[styles.progressBar, { width: `${progressPercent}%` }]} />
      </View>

      {/* 展開之緊湊雙排佈局：單行成員切換 + 橫向滑動任務卡 */}
      {!isCollapsed && (
        <View style={styles.expandedContent}>
          {/* 👤 單行成員視角切換列（橫向捲動保護，絕不換行佔高度） */}
          <View style={[styles.switcherRow, isDark && styles.switcherRowDark]}>
            <Text
              style={[styles.switcherLabel, isDark && styles.textMutedDark]}
              maxFontSizeMultiplier={1.1}
            >
              👤 視角
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.memberChipsScroll}
            >
              {activeMembersList.map((m) => {
                const isCurrent =
                  currentUser?.id === m.id ||
                  (!currentUser?.id && m.id === activeMembersList[0]?.id);
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
                    <Text style={styles.memberChipAvatar} maxFontSizeMultiplier={1.1}>
                      {m.avatar_url || '👤'}
                    </Text>
                    <Text
                      style={[
                        styles.memberChipName,
                        isDark && styles.textDark,
                        isCurrent && styles.memberChipNameActive,
                      ]}
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.1}
                    >
                      {m.display_name}
                    </Text>
                    {isCurrent && (
                      <View style={styles.chipCurrentDot}>
                        <Text style={styles.chipCurrentDotText} maxFontSizeMultiplier={1}>
                          我
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* 🎯 橫向滑動任務卡片列（單排高度 ~64px，徹底釋放主畫面垂直空間） */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.questsHorizontalList}
          >
            {quests.map((q, idx) => {
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
                      <Text style={styles.questTag} maxFontSizeMultiplier={1.1}>
                        {q.tag}
                      </Text>
                      {isDone ? (
                        <Text style={styles.doneBadge} maxFontSizeMultiplier={1.1}>
                          ✅ 已完成
                        </Text>
                      ) : idx === 0 ? (
                        <Text
                          style={[styles.swipeHintText, isDark && styles.textMutedDark]}
                          maxFontSizeMultiplier={1}
                        >
                          左右滑動 ➔
                        </Text>
                      ) : null}
                    </View>
                    <Text
                      style={[styles.questTitle, isDark && styles.textDark]}
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.15}
                    >
                      {q.title}
                    </Text>
                    <Text
                      style={[styles.questDesc, isDark && styles.textMutedDark]}
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.1}
                    >
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
                      maxFontSizeMultiplier={1.1}
                    >
                      {isDone ? '再試' : `👉 ${q.actionText}`}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>

          {/* 底部單行理念與官方手冊捷徑 */}
          <View style={[styles.footerNoteRow, isDark && styles.footerNoteRowDark]}>
            <TouchableOpacity
              style={styles.footerPhilosophyBtn}
              activeOpacity={0.7}
              onPress={() => setShowPhilosophyModal(true)}
            >
              <Text
                style={[styles.footerNote, isDark && styles.textMutedDark]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.1}
              >
                💡 公私分明：公帳 0 秒同步・私帳 100% 獨立隱私 (點此詳情)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleOpenManual}>
              <Text style={styles.manualLink} maxFontSizeMultiplier={1.1}>
                📖 官方手冊
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 💡 公私分明核心理念與體驗說明彈窗 */}
      <Modal
        visible={showPhilosophyModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPhilosophyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.celebrationCard, isDark && styles.celebrationCardDark]}>
            <Text style={{ fontSize: 36, marginBottom: 8 }}>💡</Text>
            <Text style={[styles.celebrationTitle, isDark && styles.textDark]}>
              甜心記帳本「公私分明」核心理念
            </Text>
            <View style={[styles.philosophyModalBox, isDark && styles.philosophyModalBoxDark]}>
              <Text style={[styles.philosophyItemText, isDark && styles.philosophyItemTextDark]}>
                • <Text style={{ fontWeight: '700' }}>全家公帳 0 秒即時同步</Text>：全家人在各自手機記錄的每一筆開銷、共享採買清單、水電繳費狀態，全家隨時即時看見、協同管理！
              </Text>
              <Text style={[styles.philosophyItemText, isDark && styles.philosophyItemTextDark, { marginTop: 8 }]}>
                • <Text style={{ fontWeight: '700' }}>個人隱私嚴格保護</Text>：真實環境中每位家人各自用獨立手機，無法跨成員切換身分，個人私房信用卡與帳戶額度 100% 互不干擾、安全獨立！
              </Text>
              <Text style={[styles.philosophyItemText, isDark && styles.philosophyItemTextDark, { marginTop: 8 }]}>
                • <Text style={{ fontWeight: '700' }}>體驗版專屬視角切換</Text>：為了讓您在一支手機體驗全家 4 人互動，本示範沙盒特別開放頂部「👤 視角」一鍵切換智爸、瑩媽、洋洋與豆豆視角。
              </Text>
            </View>

            <TouchableOpacity
              style={styles.secondaryModalBtn}
              onPress={() => {
                setShowPhilosophyModal(false);
                handleOpenManual();
              }}
            >
              <Text style={styles.secondaryModalBtnText}>
                📖 翻閱官方使用者手冊 (14 大模組規格)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.primaryModalBtn}
              onPress={() => setShowPhilosophyModal(false)}
            >
              <Text style={styles.primaryModalBtnText}>我知道了</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
    marginHorizontal: 12,
    marginTop: 6,
    marginBottom: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: '#FAF5FF',
    borderWidth: 1,
    borderColor: '#E9D5FF',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  containerDark: {
    backgroundColor: '#261C3B',
    borderColor: '#4C1D95',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#1F2937',
    flexShrink: 1,
  },
  collapsedMemberPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#EDE9FE',
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  collapsedMemberPillDark: {
    backgroundColor: '#3B1F6E',
    borderColor: '#5B21B6',
  },
  collapsedMemberText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7C3AED',
  },
  textDark: {
    color: '#F9FAFB',
  },
  textMutedDark: {
    color: '#9CA3AF',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  smallBtn: {
    paddingHorizontal: 7,
    paddingVertical: 3.5,
    borderRadius: 7,
    backgroundColor: '#F3E8FF',
  },
  smallBtnDark: {
    backgroundColor: '#3B1F6E',
  },
  smallBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7E22CE',
  },
  smallBtnTextDark: {
    color: '#D8B4FE',
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#E9D5FF',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 7,
  },
  progressTrackDark: {
    backgroundColor: '#3B1F6E',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#9333EA',
    borderRadius: 2,
  },
  expandedContent: {
    gap: 6,
  },
  switcherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E9D5FF',
    gap: 6,
  },
  switcherRowDark: {
    backgroundColor: '#1E152D',
    borderColor: '#4C1D95',
  },
  switcherLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#6D28D9',
  },
  memberChipsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3.5,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: '#FAF5FF',
    borderWidth: 1,
    borderColor: '#E9D5FF',
    gap: 4,
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
    fontSize: 12,
  },
  memberChipName: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#374151',
  },
  memberChipNameActive: {
    color: '#FFFFFF',
  },
  chipCurrentDot: {
    paddingHorizontal: 4,
    paddingVertical: 0.5,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  chipCurrentDotText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  questsHorizontalList: {
    gap: 8,
    paddingRight: 4,
  },
  questCard: {
    width: 245,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderRadius: 11,
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
    paddingRight: 8,
  },
  questTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    marginBottom: 1,
  },
  questTag: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#8B5CF6',
  },
  swipeHintText: {
    fontSize: 9.5,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  doneBadge: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#10B981',
  },
  questTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#111827',
  },
  questDesc: {
    fontSize: 10.5,
    color: '#6B7280',
    marginTop: 1,
  },
  actionBtn: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
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
    fontSize: 11,
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
    justifyContent: 'space-between',
    gap: 8,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#F3E8FF',
  },
  footerNoteRowDark: {
    borderTopColor: '#3B1F6E',
  },
  footerPhilosophyBtn: {
    flex: 1,
  },
  footerNote: {
    fontSize: 11,
    color: '#6B7280',
  },
  manualLink: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9333EA',
    textDecorationLine: 'underline',
  },
  philosophyModalBox: {
    width: '100%',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    marginBottom: 16,
  },
  philosophyModalBoxDark: {
    backgroundColor: '#170E28',
    borderColor: '#3B1F6E',
  },
  philosophyItemText: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 19,
  },
  philosophyItemTextDark: {
    color: '#D1D5DB',
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

