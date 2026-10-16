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
  Dimensions,
} from 'react-native';
import {
  fetchCloudLedgersSummary,
  CloudLedgerSummary,
  CloudDatabaseQuota,
} from '../lib/cloudLedgerService';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface CloudLedgerManagerModalProps {
  visible: boolean;
  currentLedgerId: string;
  knownLedgers?: any[];
  onClose: () => void;
  onLedgerDeleted?: (deletedId: string) => void;
}

export const CloudLedgerManagerModal: React.FC<CloudLedgerManagerModalProps> = ({
  visible,
  currentLedgerId,
  knownLedgers = [],
  onClose,
  onLedgerDeleted,
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [quotaExpanded, setQuotaExpanded] = useState<boolean>(true);
  const [ledgers, setLedgers] = useState<CloudLedgerSummary[]>([]);
  const [quota, setQuota] = useState<CloudDatabaseQuota | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'active' | 'test' | 'ghost'>('all');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCloudLedgersSummary(knownLedgers);
      setLedgers(data.ledgers);
      setQuota(data.quota);
    } catch (e) {
      console.warn('載入雲端帳本總管失敗:', e);
      Alert.alert('載入失敗', '無法讀取雲端資料庫帳本清單，請檢查網路連線。');
    } finally {
      setLoading(false);
    }
  }, [knownLedgers]);

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

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>👑 安全唯讀 · 雲端空間總管</Text>
              </View>
              <Text style={styles.title} maxFontSizeMultiplier={1.2}>☁️ 雲端帳本總管</Text>
              <Text style={styles.subtitle} maxFontSizeMultiplier={1.1}>
                全資料庫帳本現況盤點與 500 MB 容量監控
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 篩選切換列 (置頂固定，切換分類最便捷) */}
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

          {/* 帳本清單與捲動區域 */}
          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text style={styles.loadingText}>正在從雲端盤點全體帳本...</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.listScroll}
              contentContainerStyle={styles.listScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* 容量指標看板 (移入捲動區，隨滑動自然上推，支援一鍵收合) */}
              {quota && (
                <View style={styles.quotaCard}>
                  <TouchableOpacity
                    style={styles.quotaRow}
                    onPress={() => setQuotaExpanded(prev => !prev)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.quotaTitle}>🗄️ PostgreSQL 資料庫用量</Text>
                      <View style={styles.quotaMiniPercentBadge}>
                        <Text style={styles.quotaMiniPercentBadgeText}>{quota.dbUsedPercent}%</Text>
                      </View>
                    </View>
                    <View style={styles.quotaToggleBtn}>
                      <Text style={styles.quotaToggleBtnText}>
                        {quotaExpanded ? '收合 ▲' : '展開詳情 ▼'}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <Text style={styles.quotaSub}>
                    約 {quota.dbUsedMb} MB / {quota.dbMaxMb} MB (剩餘約 {quota.dbMaxMb - quota.dbUsedMb} MB · {100 - quota.dbUsedPercent}% 可用)
                  </Text>
                  <View style={styles.quotaBarTrack}>
                    <View style={[styles.quotaBarFill, { width: `${quota.dbUsedPercent}%` }]} />
                  </View>

                  {quotaExpanded && (
                    <>
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
                    </>
                  )}
                </View>
              )}

              {/* 重新整理按鈕 */}
              <View style={styles.actionBar}>
                <TouchableOpacity
                  style={styles.refreshBtn}
                  onPress={loadData}
                  disabled={loading}
                  activeOpacity={0.7}
                >
                  <Text style={styles.refreshBtnText}>
                    {loading ? '載入中...' : '🔄 重新整理雲端現況'}
                  </Text>
                </TouchableOpacity>
              </View>
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
    paddingTop: 16,
    paddingHorizontal: 16,
    height: Platform.OS === 'web' ? '92%' : Math.min(SCREEN_HEIGHT * 0.92, 840),
    maxHeight: '94%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  headerBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#B45309',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 1,
  },
  subtitle: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 15,
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
    padding: 10,
    marginTop: 8,
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
  quotaMiniPercentBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  quotaMiniPercentBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  quotaToggleBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quotaToggleBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
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
    marginTop: 8,
    marginBottom: 10,
  },
  refreshBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  refreshBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
  },
  filterBar: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
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
  listScrollContent: {
    paddingTop: 2,
    paddingBottom: 40,
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

