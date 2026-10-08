import React from 'react';
import {
  View,
  Text as RNText,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Platform,
  TextProps,
} from 'react-native';
import { Profile, Transaction } from '../types/database';

const Text: React.FC<TextProps> = ({ allowFontScaling = false, maxFontSizeMultiplier = 1.08, ...rest }) => (
  <RNText
    allowFontScaling={allowFontScaling}
    maxFontSizeMultiplier={Math.min(maxFontSizeMultiplier ?? 1.08, 1.08)}
    {...rest}
  />
);

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface MonthOption {
  ym: string; // 'YYYY-MM'
  label: string; // 'YYYY 年 MM 月'
  count: number;
}

interface TransactionFilterModalProps {
  visible: boolean;
  type: 'month' | 'member' | null;
  onClose: () => void;
  selectedMonth: string; // 'all' or 'YYYY-MM'
  onSelectMonth: (month: string) => void;
  selectedMemberId: string; // 'all' or member.id
  onSelectMember: (memberId: string) => void;
  availableMonths: MonthOption[];
  members: Profile[];
  currentUser: Profile;
  transactions: Transaction[];
  getMemberById: (id?: string) => Profile | undefined;
}

export const TransactionFilterModal: React.FC<TransactionFilterModalProps> = ({
  visible,
  type,
  onClose,
  selectedMonth,
  onSelectMonth,
  selectedMemberId,
  onSelectMember,
  availableMonths,
  members,
  currentUser,
  transactions,
  getMemberById,
}) => {
  if (!visible || !type) return null;

  // 取得當前選定月份之中文標籤
  const selectedMonthObj = availableMonths.find(m => m.ym === selectedMonth);
  const selectedMonthLabel = selectedMonth === 'all'
    ? '全部月份'
    : (selectedMonthObj?.label || (selectedMonth.includes('-') ? `${selectedMonth.split('-')[0]} 年 ${parseInt(selectedMonth.split('-')[1], 10)} 月` : selectedMonth));

  // 依當前選取的月份設定範圍篩選交易明細（連動月份篩選範圍）
  const monthScopedTransactions = React.useMemo(() => {
    if (selectedMonth === 'all') return transactions;
    return transactions.filter(t => {
      if (!t.transacted_at) return false;
      const d = new Date(t.transacted_at);
      if (isNaN(d.getTime())) return false;
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return ym === selectedMonth;
    });
  }, [transactions, selectedMonth]);

  // 計算特定成員在當前月份設定範圍內的記帳筆數
  const getMemberTxCount = (memberId: string) => {
    const targetMember = members.find(m => m.id === memberId);
    return monthScopedTransactions.filter(t => {
      const payer = getMemberById(t.paid_by) || t.payer_profile;
      if (payer && payer.id === memberId) return true;
      if (t.paid_by === memberId) return true;
      if (targetMember && (payer?.display_name === targetMember.display_name || (t as any).payer_name === targetMember.display_name)) return true;
      return false;
    }).length;
  };

  const isMonth = type === 'month';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          {/* 頂部標題列 */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title} maxFontSizeMultiplier={1.15}>
                {isMonth ? '📅 選擇篩選月份' : '👤 選擇付款成員'}
              </Text>
              <Text style={styles.subtitle} maxFontSizeMultiplier={1.15}>
                {isMonth
                  ? '只顯示特定月份的記帳紀錄'
                  : `只顯示「${selectedMonthLabel}」特定家庭成員的記帳紀錄`}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText} maxFontSizeMultiplier={1.15}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            {isMonth ? (
              /* 月份選項列表 */
              <View style={styles.optionList}>
                {/* 全部月份 */}
                <TouchableOpacity
                  style={[styles.optionItem, selectedMonth === 'all' && styles.optionItemActive]}
                  onPress={() => {
                    onSelectMonth('all');
                    onClose();
                  }}
                >
                  <View style={styles.optionLeft}>
                    <View style={[styles.optionIconBox, selectedMonth === 'all' && styles.optionIconBoxActive]}>
                      <Text style={styles.optionIcon}>🗓️</Text>
                    </View>
                    <View>
                      <Text style={[styles.optionLabel, selectedMonth === 'all' && styles.optionLabelActive]}>
                        全部月份
                      </Text>
                      <Text style={styles.optionSublabel}>所有歷史收支紀錄</Text>
                    </View>
                  </View>
                  <View style={styles.optionRight}>
                    <Text style={styles.countBadge}>{transactions.length} 筆</Text>
                    {selectedMonth === 'all' && <Text style={styles.checkIcon}>✓</Text>}
                  </View>
                </TouchableOpacity>

                {/* 各月份列表 */}
                {availableMonths.map(m => {
                  const isSelected = selectedMonth === m.ym;
                  return (
                    <TouchableOpacity
                      key={m.ym}
                      style={[styles.optionItem, isSelected && styles.optionItemActive]}
                      onPress={() => {
                        onSelectMonth(m.ym);
                        onClose();
                      }}
                    >
                      <View style={styles.optionLeft}>
                        <View style={[styles.optionIconBox, isSelected && styles.optionIconBoxActive]}>
                          <Text style={styles.optionIcon}>📅</Text>
                        </View>
                        <View>
                          <Text style={[styles.optionLabel, isSelected && styles.optionLabelActive]}>
                            {m.label}
                          </Text>
                          <Text style={styles.optionSublabel}>{m.ym}</Text>
                        </View>
                      </View>
                      <View style={styles.optionRight}>
                        <Text style={styles.countBadge}>{m.count} 筆</Text>
                        {isSelected && <Text style={styles.checkIcon}>✓</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              /* 成員選項列表 */
              <View style={styles.optionList}>
                {/* 全部成員 */}
                <TouchableOpacity
                  style={[styles.optionItem, selectedMemberId === 'all' && styles.optionItemActive]}
                  onPress={() => {
                    onSelectMember('all');
                    onClose();
                  }}
                >
                  <View style={styles.optionLeft}>
                    <View style={[styles.optionIconBox, selectedMemberId === 'all' && styles.optionIconBoxActive]}>
                      <Text style={styles.optionIcon}>👨‍👩‍👧</Text>
                    </View>
                    <View>
                      <Text style={[styles.optionLabel, selectedMemberId === 'all' && styles.optionLabelActive]}>
                        全部成員
                      </Text>
                      <Text style={styles.optionSublabel}>
                        {selectedMonth === 'all' ? '全體家庭成員歷史紀錄' : `${selectedMonthLabel} 全體成員紀錄`}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.optionRight}>
                    <Text style={styles.countBadge}>{monthScopedTransactions.length} 筆</Text>
                    {selectedMemberId === 'all' && <Text style={styles.checkIcon}>✓</Text>}
                  </View>
                </TouchableOpacity>

                {/* 各成員列表 */}
                {members.map(member => {
                  const isSelected = selectedMemberId === member.id;
                  const isMe =
                    member.id === currentUser.id ||
                    (!!currentUser.display_name && currentUser.display_name === member.display_name);
                  const count = getMemberTxCount(member.id);

                  return (
                    <TouchableOpacity
                      key={member.id}
                      style={[styles.optionItem, isSelected && styles.optionItemActive]}
                      onPress={() => {
                        onSelectMember(member.id);
                        onClose();
                      }}
                    >
                      <View style={styles.optionLeft}>
                        <View style={[styles.optionIconBox, isSelected && styles.optionIconBoxActive]}>
                          <Text style={styles.optionIcon}>{member.avatar_url || '👤'}</Text>
                        </View>
                        <View>
                          <Text style={[styles.optionLabel, isSelected && styles.optionLabelActive]}>
                            {member.display_name}
                            {isMe ? ' (本機使用成員)' : ''}
                          </Text>
                          <Text style={styles.optionSublabel}>
                            {member.role === 'owner' ? '👑 帳本主人' : member.role === 'admin' ? '🛡️ 管理員' : '一般成員'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.optionRight}>
                        <Text style={styles.countBadge}>{count} 筆</Text>
                        {isSelected && <Text style={styles.checkIcon}>✓</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    paddingHorizontal: 16,
    maxHeight: Math.min(SCREEN_HEIGHT * 0.75, 600),
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  closeText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '700',
  },
  scrollArea: {
    width: '100%',
  },
  optionList: {
    paddingBottom: 10,
    gap: 8,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  optionItemActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  optionIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  optionIconBoxActive: {
    backgroundColor: '#E0E7FF',
    borderColor: '#818CF8',
  },
  optionIcon: {
    fontSize: 18,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  optionLabelActive: {
    color: '#4338CA',
    fontWeight: '700',
  },
  optionSublabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
  },
  optionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countBadge: {
    fontSize: 12,
    color: '#64748B',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  checkIcon: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4F46E5',
    marginLeft: 2,
  },
});
