import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import {
  fetchCloudLedgersSummary,
  deleteCloudLedger,
  batchPurgeGhostLedgers,
  CloudLedgerSummary,
  CloudDatabaseQuota,
} from '../lib/cloudLedgerService';

interface CloudLedgerManagerModalProps {
  visible: boolean;
  currentLedgerId: string;
  onClose: () => void;
  onLedgerDeleted?: (deletedId: string) => void;
}

export const CloudLedgerManagerModal: React.FC<CloudLedgerManagerModalProps> = ({
  visible,
  currentLedgerId,
  onClose,
  onLedgerDeleted,
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [operating, setOperating] = useState<boolean>(false);
  const [ledgers, setLedgers] = useState<CloudLedgerSummary[]>([]);
  const [quota, setQuota] = useState<CloudDatabaseQuota | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'active' | 'test' | 'ghost'>('all');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCloudLedgersSummary();
      setLedgers(data.ledgers);
      setQuota(data.quota);
    } catch (e) {
      console.warn('載入雲端帳本總管失敗:', e);
      Alert.alert('載入失敗', '無法讀取雲端資料庫帳本清單，請檢查網路連線。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible, loadData]);

  const filteredLedgers = useMemo(() => {
    if (filterType === 'active') return ledgers.filter(l => l.txCount > 0);
    if (filterType === 'test') return ledgers.filter(l => l.isTest);
    if (filterType === 'ghost') return ledgers.filter(l => l.isGhost);
    return ledgers;
  }, [ledgers, filterType]);

  const ghostLedgers = useMemo(() => ledgers.filter(l => l.isGhost), [ledgers]);

  const handleDeleteLedger = (ledger: CloudLedgerSummary) => {
    if (ledger.id === currentLedgerId) {
      Alert.alert('無法刪除', '此帳本為您當前正在使用的帳本，請先切換至其他帳本後再行刪除。');
      return;
    }

    const confirmMsg =
      `確定要徹底刪除【${ledger.name}】嗎？\n\n` +
      `• 成員人數：${ledger.memberCount} 人\n` +
      `• 交易筆數：${ledger.txCount} 筆\n` +
      `• 建立日期：${ledger.createdAt}\n\n` +
      `⚠️ 此動作將從雲端資料庫永久抹除此帳本及其所有明細，無法復原！`;

    Alert.alert('🗑️ 徹底刪除帳本確認', confirmMsg, [
      { text: '取消', style: 'cancel' },
      {
        text: '確定刪除',
        style: 'destructive',
        onPress: async () => {
          setOperating(true);
          try {
            const ok = await deleteCloudLedger(ledger.id);
            if (ok) {
              setLedgers(prev => prev.filter(l => l.id !== ledger.id));
              if (onLedgerDeleted) onLedgerDeleted(ledger.id);
              Alert.alert('已刪除', `已成功自雲端永久抹除【${ledger.name}】！`);
            } else {
              Alert.alert('刪除失敗', '雲端資料庫刪除回應異常，請稍後重試。');
            }
          } catch (e) {
            Alert.alert('刪除失敗', '網路連線異常，請重試。');
          } finally {
            setOperating(false);
          }
        },
      },
    ]);
  };

  const handleBatchPurgeGhosts = () => {
    if (ghostLedgers.length === 0) return;

    Alert.alert(
      '🧹 一鍵清理無用空帳本',
      `偵測到雲端資料庫共有 ${ghostLedgers.length} 本「0 成員且 0 交易」的幽靈空帳本。\n\n確定要一次全數清理嗎？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: `確定清除 (${ghostLedgers.length} 本)`,
          style: 'destructive',
          onPress: async () => {
            setOperating(true);
            try {
              const ids = ghostLedgers.map(g => g.id);
              const count = await batchPurgeGhostLedgers(ids);
              Alert.alert('清理完成', `已成功清除 ${count} 本無成員幽靈空帳本！`);
              loadData();
            } catch (e) {
              Alert.alert('清理失敗', '網路連線異常，請重試。');
            } finally {
              setOperating(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>👑 管理員特權 · 雲端空間總管</Text>
              </View>
              <Text style={styles.title} maxFontSizeMultiplier={1.2}>☁️ 雲端帳本總管</Text>
              <Text style={styles.subtitle} maxFontSizeMultiplier={1.1}>
                全資料庫帳本現況盤點、容量監控與無用帳本清理
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 容量指標看板 */}
          {quota && (
            <View style={styles.quotaCard}>
              <View style={styles.quotaRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.quotaTitle}>🗄️ PostgreSQL 資料庫用量</Text>
                  <Text style={styles.quotaSub}>
                    約 {quota.dbUsedMb} MB / {quota.dbMaxMb} MB (剩餘約 {quota.dbMaxMb - quota.dbUsedMb} MB · {100 - quota.dbUsedPercent}% 可用)
                  </Text>
                </View>
                <Text style={styles.quotaPercentText}>{quota.dbUsedPercent}%</Text>
              </View>
              <View style={styles.quotaBarTrack}>
                <View style={[styles.quotaBarFill, { width: `${quota.dbUsedPercent}%` }]} />
              </View>

              <View style={[styles.quotaRow, { marginTop: 10 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.quotaTitle}>📦 雲端電子帳單 Storage</Text>
                  <Text style={styles.quotaSub}>
                    約 {quota.storageUsedMb} MB / {quota.storageMaxMb} MB (剩餘約 {quota.storageMaxMb - 1} MB)
                  </Text>
                </View>
                <Text style={styles.quotaPercentText}>&lt; 0.1%</Text>
              </View>
              <View style={styles.quotaBarTrack}>
                <View style={[styles.quotaBarFill, { width: '1.5%', backgroundColor: '#10B981' }]} />
              </View>

              {/* 統計膠囊列 */}
              <View style={styles.statsPillRow}>
                <View style={styles.statsPill}>
                  <Text style={styles.statsPillNum}>{quota.totalLedgers}</Text>
                  <Text style={styles.statsPillLabel}>總帳本數</Text>
                </View>
                <View style={[styles.statsPill, { borderColor: '#86EFAC' }]}>
                  <Text style={[styles.statsPillNum, { color: '#16A34A' }]}>{quota.activeLedgers}</Text>
                  <Text style={styles.statsPillLabel}>🟢 活躍帳本</Text>
                </View>
                <View style={[styles.statsPill, { borderColor: '#FCA5A5' }]}>
                  <Text style={[styles.statsPillNum, { color: '#DC2626' }]}>{quota.ghostLedgers}</Text>
                  <Text style={styles.statsPillLabel}>🔴 空帳本</Text>
                </View>
              </View>
            </View>
          )}

          {/* 快捷清理與重新整理按鈕 */}
          <View style={styles.actionBar}>
            {ghostLedgers.length > 0 && (
              <TouchableOpacity
                style={styles.purgeBtn}
                onPress={handleBatchPurgeGhosts}
                disabled={operating || loading}
                activeOpacity={0.7}
              >
                <Text style={styles.purgeBtnText}>
                  🧹 一鍵清理 {ghostLedgers.length} 本空帳本
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.refreshBtn}
              onPress={loadData}
              disabled={loading || operating}
              activeOpacity={0.7}
            >
              <Text style={styles.refreshBtnText}>
                {loading ? '載入中...' : '🔄 重新整理'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 篩選切換列 */}
          <View style={styles.filterBar}>
            <TouchableOpacity
              style={[styles.filterChip, filterType === 'all' && styles.filterChipActive]}
              onPress={() => setFilterType('all')}
            >
              <Text style={[styles.filterChipText, filterType === 'all' && styles.filterChipTextActive]}>
                全部 ({ledgers.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterChip, filterType === 'active' && styles.filterChipActive]}
              onPress={() => setFilterType('active')}
            >
              <Text style={[styles.filterChipText, filterType === 'active' && styles.filterChipTextActive]}>
                🟢 活躍 ({ledgers.filter(l => l.txCount > 0).length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterChip, filterType === 'test' && styles.filterChipActive]}
              onPress={() => setFilterType('test')}
            >
              <Text style={[styles.filterChipText, filterType === 'test' && styles.filterChipTextActive]}>
                🟡 測試 ({ledgers.filter(l => l.isTest).length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterChip, filterType === 'ghost' && styles.filterChipActive]}
              onPress={() => setFilterType('ghost')}
            >
              <Text style={[styles.filterChipText, filterType === 'ghost' && styles.filterChipTextActive]}>
                🔴 空帳本 ({ghostLedgers.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* 帳本清單 */}
          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text style={styles.loadingText}>正在從雲端盤點全體帳本...</Text>
            </View>
          ) : (
            <ScrollView style={styles.listScroll} showsVerticalScrollIndicator={false}>
              {filteredLedgers.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyIcon}>✨</Text>
                  <Text style={styles.emptyText}>此分類下沒有帳本</Text>
                </View>
              ) : (
                filteredLedgers.map((l, index) => {
                  const isCurrent = l.id === currentLedgerId;
                  return (
                    <View key={l.id} style={[styles.ledgerCard, isCurrent && styles.ledgerCardCurrent]}>
                      <View style={styles.ledgerHeader}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                            <Text style={styles.ledgerName} numberOfLines={1}>
                              {index + 1}. 【{l.name}】
                            </Text>
                            {isCurrent && (
                              <View style={styles.badgeCurrent}>
                                <Text style={styles.badgeCurrentText}>使用中 ✓</Text>
                              </View>
                            )}
                            {l.txCount > 0 ? (
                              <View style={styles.badgeActive}>
                                <Text style={styles.badgeActiveText}>🟢 {l.txCount} 筆交易</Text>
                              </View>
                            ) : l.isGhost ? (
                              <View style={styles.badgeGhost}>
                                <Text style={styles.badgeGhostText}>🔴 無成員空帳本</Text>
                              </View>
                            ) : (
                              <View style={styles.badgeTest}>
                                <Text style={styles.badgeTestText}>🟡 測試帳本</Text>
                              </View>
                            )}
                          </View>

                          <Text style={styles.ledgerMeta}>
                            建立：{l.createdAt} · 邀請碼：{l.inviteCode || '無'} · ID: {l.id.slice(0, 8)}...
                          </Text>
                        </View>

                        {!isCurrent && (
                          <TouchableOpacity
                            style={styles.deleteBtn}
                            onPress={() => handleDeleteLedger(l)}
                            disabled={operating}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.deleteBtnText}>🗑️ 刪除</Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* 成員列表 */}
                      <View style={styles.memberBox}>
                        <Text style={styles.memberLabel}>
                          👥 成員 ({l.memberCount} 人)：
                        </Text>
                        {l.members.length === 0 ? (
                          <Text style={styles.memberEmpty}>無成員</Text>
                        ) : (
                          <View style={styles.memberChipsRow}>
                            {l.members.map((m, mIdx) => (
                              <View key={`${m.userId}_${mIdx}`} style={styles.memberChip}>
                                <Text style={styles.memberChipText}>
                                  {m.avatarUrl} {m.displayName}
                                  {m.role === 'owner' ? ' (👑)' : ''}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>

                      {/* 最新交易摘要 */}
                      {l.txCount > 0 && l.latestTxDate && (
                        <Text style={styles.txSummaryText}>
                          🕒 最新記帳活動：{l.latestTxDate}
                        </Text>
                      )}
                    </View>
                  );
                })
              )}
              <View style={{ height: 40 }} />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 18,
    paddingHorizontal: 16,
    maxHeight: '92%',
    minHeight: '75%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  headerBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B45309',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  closeBtn: {
    padding: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 999,
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  quotaCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quotaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quotaTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  quotaSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  quotaPercentText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2563EB',
  },
  quotaBarTrack: {
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 6,
  },
  quotaBarFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 999,
  },
  statsPillRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#EEF2F6',
  },
  statsPill: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statsPillNum: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  statsPillLabel: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 1,
  },
  actionBar: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  purgeBtn: {
    flex: 1,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  purgeBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#DC2626',
  },
  refreshBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  filterBar: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    marginBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  filterChipActive: {
    backgroundColor: '#1E293B',
  },
  filterChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  listScroll: {
    flex: 1,
  },
  loadingBox: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 12,
  },
  emptyBox: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    color: '#94A3B8',
  },
  ledgerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
  },
  ledgerCardCurrent: {
    borderColor: '#86EFAC',
    backgroundColor: '#F0FDF4',
  },
  ledgerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  ledgerName: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  ledgerMeta: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
  },
  badgeCurrent: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  badgeCurrentText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803D',
  },
  badgeActive: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeActiveText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  badgeTest: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeTestText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
  },
  badgeGhost: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeGhostText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#DC2626',
  },
  deleteBtn: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 8,
  },
  deleteBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#DC2626',
  },
  memberBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  memberLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 4,
  },
  memberEmpty: {
    fontSize: 11,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  memberChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  memberChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  memberChipText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '600',
  },
  txSummaryText: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 6,
  },
});
