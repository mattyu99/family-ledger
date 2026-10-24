import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text as RNText,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextProps,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';

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
  selectedMonth: string; // 'all' or 'YYYY-MM' or 'YYYY'
  onSelectMonth: (month: string) => void;
  availableMonths?: { ym: string; count: number }[];
  availableYears?: { year: number; count: number }[];
}

export const MonthPickerModal: React.FC<MonthPickerModalProps> = ({
  visible,
  onClose,
  selectedMonth,
  onSelectMonth,
  availableMonths = [],
  availableYears = [],
}) => {
  const { isDark, colors } = useTheme();
  const now = new Date();
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const lastMonthDate = new Date();
  lastMonthDate.setDate(1);
  lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const lastMonthYm = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

  // 年份切換器 (預設選中月份的年份或當前年份)
  const [pickerYear, setPickerYear] = useState<number>(() => {
    if (selectedMonth && selectedMonth !== 'all') {
      if (selectedMonth.includes('-')) {
        const y = parseInt(selectedMonth.split('-')[0], 10);
        if (!isNaN(y)) return y;
      } else if (/^\d{4}$/.test(selectedMonth)) {
        const y = parseInt(selectedMonth, 10);
        if (!isNaN(y)) return y;
      }
    }
    return now.getFullYear();
  });

  // 當彈窗開啟或 selectedMonth 變更時，同步切換至對應年份
  useEffect(() => {
    if (visible && selectedMonth && selectedMonth !== 'all') {
      if (selectedMonth.includes('-')) {
        const y = parseInt(selectedMonth.split('-')[0], 10);
        if (!isNaN(y)) setPickerYear(y);
      } else if (/^\d{4}$/.test(selectedMonth)) {
        const y = parseInt(selectedMonth, 10);
        if (!isNaN(y)) setPickerYear(y);
      }
    }
  }, [visible, selectedMonth]);

  // 月份交易次數 Map
  const txCountMap = useMemo(() => {
    const map = new Map<string, number>();
    availableMonths.forEach(m => {
      map.set(m.ym, m.count);
    });
    return map;
  }, [availableMonths]);

  // 當前 pickerYear 之全年度交易筆數
  const yearCount = useMemo(() => {
    if (availableYears && availableYears.length > 0) {
      const found = availableYears.find(y => y.year === pickerYear);
      if (found) return found.count;
    }
    const prefix = `${pickerYear}-`;
    return availableMonths
      .filter(m => m.ym.startsWith(prefix))
      .reduce((sum, m) => sum + m.count, 0);
  }, [availableMonths, availableYears, pickerYear]);

  if (!visible) return null;

  const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.card, isDark && { backgroundColor: colors.background.modal, borderColor: colors.border.default, borderWidth: 1 }]}>
          {/* 頂部標題 */}
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.title, isDark && { color: colors.text.primary }]}>📅 選擇統計期間</Text>
              <Text style={[styles.subtitle, isDark && { color: colors.text.muted }]}>自由選擇全年度或任意月份查看財務分析</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, isDark && { backgroundColor: colors.background.cardSubtle }]}>
              <Text style={[styles.closeText, isDark && { color: colors.text.secondary }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 快捷選項 */}
          <View style={styles.quickRow}>
            <TouchableOpacity
              style={[
                styles.quickChip,
                isDark && { backgroundColor: colors.background.cardSubtle },
                selectedMonth === currentYm && styles.quickChipActive,
                isDark && selectedMonth === currentYm && { backgroundColor: 'rgba(99, 102, 241, 0.25)', borderColor: '#818CF8' },
              ]}
              onPress={() => {
                onSelectMonth(currentYm);
                onClose();
              }}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.quickChipText,
                isDark && { color: colors.text.secondary },
                selectedMonth === currentYm && styles.quickChipTextActive,
                isDark && selectedMonth === currentYm && { color: '#C7D2FE' },
              ]}>
                📍 本月
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.quickChip,
                isDark && { backgroundColor: colors.background.cardSubtle },
                selectedMonth === lastMonthYm && styles.quickChipActive,
                isDark && selectedMonth === lastMonthYm && { backgroundColor: 'rgba(99, 102, 241, 0.25)', borderColor: '#818CF8' },
              ]}
              onPress={() => {
                onSelectMonth(lastMonthYm);
                onClose();
              }}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.quickChipText,
                isDark && { color: colors.text.secondary },
                selectedMonth === lastMonthYm && styles.quickChipTextActive,
                isDark && selectedMonth === lastMonthYm && { color: '#C7D2FE' },
              ]}>
                📅 上月
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.quickChip,
                isDark && { backgroundColor: colors.background.cardSubtle },
                selectedMonth === String(now.getFullYear()) && styles.quickChipActive,
                isDark && selectedMonth === String(now.getFullYear()) && { backgroundColor: 'rgba(99, 102, 241, 0.25)', borderColor: '#818CF8' },
              ]}
              onPress={() => {
                onSelectMonth(String(now.getFullYear()));
                onClose();
              }}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.quickChipText,
                isDark && { color: colors.text.secondary },
                selectedMonth === String(now.getFullYear()) && styles.quickChipTextActive,
                isDark && selectedMonth === String(now.getFullYear()) && { color: '#C7D2FE' },
              ]}>
                🗓️ 今年
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.quickChip,
                isDark && { backgroundColor: colors.background.cardSubtle },
                selectedMonth === 'all' && styles.quickChipActive,
                isDark && selectedMonth === 'all' && { backgroundColor: 'rgba(99, 102, 241, 0.25)', borderColor: '#818CF8' },
              ]}
              onPress={() => {
                onSelectMonth('all');
                onClose();
              }}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.quickChipText,
                isDark && { color: colors.text.secondary },
                selectedMonth === 'all' && styles.quickChipTextActive,
                isDark && selectedMonth === 'all' && { color: '#C7D2FE' },
              ]}>
                🌐 全部
              </Text>
            </TouchableOpacity>
          </View>

          {/* 年份切換控制列 */}
          <View style={[styles.yearRow, isDark && { backgroundColor: colors.background.cardSubtle }]}>
            <TouchableOpacity
              style={[styles.yearArrowBtn, isDark && { backgroundColor: colors.background.card }]}
              onPress={() => setPickerYear(y => y - 1)}
              activeOpacity={0.7}
            >
              <Text style={[styles.yearArrowText, isDark && { color: '#A5B4FC' }]}>◀</Text>
            </TouchableOpacity>

            <Text style={[styles.yearTitleText, isDark && { color: colors.text.primary }]}>{pickerYear} 年</Text>

            <TouchableOpacity
              style={[styles.yearArrowBtn, isDark && { backgroundColor: colors.background.card }]}
              onPress={() => setPickerYear(y => y + 1)}
              activeOpacity={0.7}
            >
              <Text style={[styles.yearArrowText, isDark && { color: '#A5B4FC' }]}>▶</Text>
            </TouchableOpacity>
          </View>

          {/* 全年度統計選擇按鈕 */}
          <TouchableOpacity
            style={[
              styles.fullYearBtn,
              isDark && { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default },
              selectedMonth === String(pickerYear) && styles.fullYearBtnActive,
            ]}
            onPress={() => {
              onSelectMonth(String(pickerYear));
              onClose();
            }}
            activeOpacity={0.7}
          >
            <View style={styles.fullYearBtnLeft}>
              <Text
                style={[
                  styles.fullYearBtnText,
                  isDark && { color: colors.text.primary },
                  selectedMonth === String(pickerYear) && styles.fullYearBtnTextActive,
                ]}
              >
                🗓️ 查看 {pickerYear} 全年度統計
              </Text>
              <Text
                style={[
                  styles.fullYearCountText,
                  isDark && { color: colors.text.muted },
                  selectedMonth === String(pickerYear) && styles.fullYearCountTextActive,
                ]}
              >
                ({yearCount} 筆記帳)
              </Text>
            </View>
            {selectedMonth === String(pickerYear) ? (
              <View style={styles.fullYearActiveBadge}>
                <Text style={styles.fullYearActiveBadgeText}>✓ 目前選取</Text>
              </View>
            ) : (
              <Text style={[styles.fullYearArrowHint, isDark && { color: '#818CF8' }]}>選擇 ➔</Text>
            )}
          </TouchableOpacity>

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
                    isDark && { backgroundColor: colors.background.cardSubtle, borderColor: colors.border.default },
                    isSelected && styles.monthGridItemActive,
                    isCurrent && !isSelected && styles.monthGridItemCurrent,
                    isDark && isCurrent && !isSelected && { backgroundColor: 'rgba(99, 102, 241, 0.25)', borderColor: '#818CF8' },
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
                      isDark && { color: colors.text.primary },
                      isSelected && styles.monthGridTextActive,
                      isCurrent && !isSelected && styles.monthGridTextCurrent,
                      isDark && isCurrent && !isSelected && { color: '#A5B4FC' },
                    ]}
                  >
                    {m} 月
                  </Text>
                  {isCurrent && !isSelected && (
                    <Text style={[styles.currentMonthBadgeText, isDark && { color: '#A5B4FC' }]}>本月</Text>
                  )}
                  {txCount > 0 && !isSelected && (
                    <Text style={[styles.txCountBadgeText, isDark && { color: colors.text.muted }]}>{txCount}筆</Text>
                  )}
                  {isSelected && (
                    <Text style={styles.selectedCheckText}>✓</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 關閉按鈕 */}
          <TouchableOpacity style={[styles.cancelBtn, isDark && { backgroundColor: colors.background.cardSubtle }]} onPress={onClose} activeOpacity={0.8}>
            <Text style={[styles.cancelBtnText, isDark && { color: colors.text.secondary }]}>關閉</Text>
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
  fullYearBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  fullYearBtnActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4338CA',
  },
  fullYearBtnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  fullYearBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  fullYearBtnTextActive: {
    color: '#FFFFFF',
  },
  fullYearCountText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
  },
  fullYearCountTextActive: {
    color: '#E0E7FF',
  },
  fullYearActiveBadge: {
    backgroundColor: '#4338CA',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  fullYearActiveBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  fullYearArrowHint: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6366F1',
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
