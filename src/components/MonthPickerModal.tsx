import React, { useState, useMemo } from 'react';
import {
  View,
  Text as RNText,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextProps,
} from 'react-native';

const Text: React.FC<TextProps> = ({ allowFontScaling = false, maxFontSizeMultiplier = 1.08, ...rest }) => (
  <RNText
    allowFontScaling={allowFontScaling}
    maxFontSizeMultiplier={Math.min(maxFontSizeMultiplier ?? 1.08, 1.08)}
    {...rest}
  />
);

export interface MonthPickerModalProps {
  visible: boolean;
  onClose: () => void;
  selectedMonth: string; // 'all' or 'YYYY-MM'
  onSelectMonth: (month: string) => void;
  availableMonths?: { ym: string; count: number }[];
}

export const MonthPickerModal: React.FC<MonthPickerModalProps> = ({
  visible,
  onClose,
  selectedMonth,
  onSelectMonth,
  availableMonths = [],
}) => {
  const now = new Date();
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const lastMonthDate = new Date();
  lastMonthDate.setDate(1);
  lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const lastMonthYm = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

  // 年份切換器 (預設選中月份的年份或當前年份)
  const [pickerYear, setPickerYear] = useState<number>(() => {
    if (selectedMonth && selectedMonth !== 'all' && selectedMonth.includes('-')) {
      const y = parseInt(selectedMonth.split('-')[0], 10);
      if (!isNaN(y)) return y;
    }
    return now.getFullYear();
  });

  // 月份交易次數 Map
  const txCountMap = useMemo(() => {
    const map = new Map<string, number>();
    availableMonths.forEach(m => {
      map.set(m.ym, m.count);
    });
    return map;
  }, [availableMonths]);

  if (!visible) return null;

  const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.card}>
          {/* 頂部標題 */}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>📅 選擇統計月份</Text>
              <Text style={styles.subtitle}>自由選擇任意年份與月份查看財務分析</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 快捷選項 */}
          <View style={styles.quickRow}>
            <TouchableOpacity
              style={[styles.quickChip, selectedMonth === currentYm && styles.quickChipActive]}
              onPress={() => {
                onSelectMonth(currentYm);
                onClose();
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.quickChipText, selectedMonth === currentYm && styles.quickChipTextActive]}>
                📍 本月
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickChip, selectedMonth === lastMonthYm && styles.quickChipActive]}
              onPress={() => {
                onSelectMonth(lastMonthYm);
                onClose();
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.quickChipText, selectedMonth === lastMonthYm && styles.quickChipTextActive]}>
                📅 上月
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickChip, selectedMonth === 'all' && styles.quickChipActive]}
              onPress={() => {
                onSelectMonth('all');
                onClose();
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.quickChipText, selectedMonth === 'all' && styles.quickChipTextActive]}>
                🌐 全部歷史
              </Text>
            </TouchableOpacity>
          </View>

          {/* 年份切換控制列 */}
          <View style={styles.yearRow}>
            <TouchableOpacity
              style={styles.yearArrowBtn}
              onPress={() => setPickerYear(y => y - 1)}
              activeOpacity={0.7}
            >
              <Text style={styles.yearArrowText}>◀</Text>
            </TouchableOpacity>

            <Text style={styles.yearTitleText}>{pickerYear} 年</Text>

            <TouchableOpacity
              style={styles.yearArrowBtn}
              onPress={() => setPickerYear(y => y + 1)}
              activeOpacity={0.7}
            >
              <Text style={styles.yearArrowText}>▶</Text>
            </TouchableOpacity>
          </View>

          {/* 12 個月份網格 (4 列 x 3 行) */}
          <View style={styles.monthGrid}>
            {MONTHS.map(m => {
              const ym = `${pickerYear}-${String(m).padStart(2, '0')}`;
              const isSelected = selectedMonth === ym;
              const isCurrent = ym === currentYm;
              const txCount = txCountMap.get(ym) || 0;

              return (
                <TouchableOpacity
                  key={ym}
                  style={[
                    styles.monthGridItem,
                    isSelected && styles.monthGridItemActive,
                    isCurrent && !isSelected && styles.monthGridItemCurrent,
                  ]}
                  onPress={() => {
                    onSelectMonth(ym);
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.monthGridText,
                      isSelected && styles.monthGridTextActive,
                      isCurrent && !isSelected && styles.monthGridTextCurrent,
                    ]}
                  >
                    {m} 月
                  </Text>
                  {isCurrent && !isSelected && (
                    <Text style={styles.currentMonthBadgeText}>本月</Text>
                  )}
                  {txCount > 0 && !isSelected && (
                    <Text style={styles.txCountBadgeText}>{txCount}筆</Text>
                  )}
                  {isSelected && (
                    <Text style={styles.selectedCheckText}>✓</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 關閉按鈕 */}
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.cancelBtnText}>關閉</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
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
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
  },
  closeText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '700',
  },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  quickChip: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
  },
  quickChipActive: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1.5,
    borderColor: '#4F46E5',
  },
  quickChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  quickChipTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  yearRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  yearArrowBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  yearArrowText: {
    fontSize: 12,
    color: '#4F46E5',
    fontWeight: '700',
  },
  yearTitleText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  monthGridItem: {
    width: '23%',
    height: 52,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  monthGridItemActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  monthGridItemCurrent: {
    borderColor: '#6366F1',
    backgroundColor: '#EEF2FF',
  },
  monthGridText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  monthGridTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  monthGridTextCurrent: {
    color: '#4F46E5',
  },
  currentMonthBadgeText: {
    fontSize: 9,
    color: '#6366F1',
    fontWeight: '600',
    marginTop: 1,
  },
  txCountBadgeText: {
    fontSize: 9,
    color: '#94A3B8',
    fontWeight: '500',
    marginTop: 1,
  },
  selectedCheckText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '800',
    marginTop: 1,
  },
  cancelBtn: {
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
});
