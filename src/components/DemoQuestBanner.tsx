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

export interface DemoQuestBannerProps {
  isDark: boolean;
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

      {/* 展開之任務清單 */}
      {!isCollapsed && (
        <View style={styles.questsList}>
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
