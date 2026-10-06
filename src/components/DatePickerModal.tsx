import React, { useState, useMemo } from 'react';
import {
  View,
  Text as RNText,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextProps,
  Dimensions,
} from 'react-native';

const Text: React.FC<TextProps> = ({ allowFontScaling = false, maxFontSizeMultiplier = 1.08, ...rest }) => (
  <RNText
    allowFontScaling={allowFontScaling}
    maxFontSizeMultiplier={Math.min(maxFontSizeMultiplier ?? 1.08, 1.08)}
    {...rest}
  />
);

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface DatePickerModalProps {
  visible: boolean;
  onClose: () => void;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export const DatePickerModal: React.FC<DatePickerModalProps> = ({
  visible,
  onClose,
  selectedDate,
  onSelectDate,
}) => {
  const initialDate = selectedDate || new Date();
  const [viewYear, setViewYear] = useState<number>(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(initialDate.getMonth()); // 0-11
  const [tempDate, setTempDate] = useState<Date>(initialDate);

  // 當彈窗開啟時同步目前選中日期
  React.useEffect(() => {
    if (visible) {
      const d = selectedDate || new Date();
      setTempDate(d);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [visible, selectedDate]);

  const today = useMemo(() => new Date(), []);
  const yesterday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  }, []);
  const dayBeforeYesterday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    return d;
  }, []);

  const isSameDay = (d1: Date, d2: Date) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  // 換月：上一月
  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(prev => prev - 1);
      setViewMonth(11);
    } else {
      setViewMonth(prev => prev - 1);
    }
  };

  // 換月：下一月
  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(prev => prev + 1);
      setViewMonth(0);
    } else {
      setViewMonth(prev => prev + 1);
    }
  };

  // 快捷切換
  const handleQuickSelect = (targetDate: Date) => {
    setTempDate(targetDate);
    setViewYear(targetDate.getFullYear());
    setViewMonth(targetDate.getMonth());
  };

  // 點擊日曆中的某一天
  const handleDayPress = (day: number) => {
    const newD = new Date(viewYear, viewMonth, day);
    setTempDate(newD);
  };

  // 確認選擇
  const handleConfirm = () => {
    onSelectDate(tempDate);
    onClose();
  };

  // 計算日曆網格資料
  const calendarCells = useMemo(() => {
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0(Sun) - 6(Sat)
    const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();

    const cells: {
      type: 'prev' | 'current' | 'next';
      day: number;
      date: Date;
    }[] = [];

    // 前一個月的填充空格
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      cells.push({
        type: 'prev',
        day: d,
        date: new Date(viewYear, viewMonth - 1, d),
      });
    }

    // 當前月份各天
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        type: 'current',
        day: d,
        date: new Date(viewYear, viewMonth, d),
      });
    }

    // 後一個月的填充空格（補齊 35 或 42 格）
    const totalCells = cells.length <= 35 ? 35 : 42;
    const remaining = totalCells - cells.length;
    for (let d = 1; d <= remaining; d++) {
      cells.push({
        type: 'next',
        day: d,
        date: new Date(viewYear, viewMonth + 1, d),
      });
    }

    return cells;
  }, [viewYear, viewMonth]);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.card}>
          {/* 頂部標題 */}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>📅 選擇記帳日期</Text>
              <Text style={styles.subtitle}>可補記過去任意消費或收入明細</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 快捷點選列 */}
          <View style={styles.quickRow}>
            <TouchableOpacity
              style={[styles.quickChip, isSameDay(tempDate, today) && styles.quickChipActive]}
              onPress={() => handleQuickSelect(today)}
              activeOpacity={0.7}
            >
              <Text style={[styles.quickChipText, isSameDay(tempDate, today) && styles.quickChipTextActive]}>
                📍 今天 ({today.getMonth() + 1}/{today.getDate()})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickChip, isSameDay(tempDate, yesterday) && styles.quickChipActive]}
              onPress={() => handleQuickSelect(yesterday)}
              activeOpacity={0.7}
            >
              <Text style={[styles.quickChipText, isSameDay(tempDate, yesterday) && styles.quickChipTextActive]}>
                昨天 ({yesterday.getMonth() + 1}/{yesterday.getDate()})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickChip, isSameDay(tempDate, dayBeforeYesterday) && styles.quickChipActive]}
              onPress={() => handleQuickSelect(dayBeforeYesterday)}
              activeOpacity={0.7}
            >
              <Text style={[styles.quickChipText, isSameDay(tempDate, dayBeforeYesterday) && styles.quickChipTextActive]}>
                前天 ({dayBeforeYesterday.getMonth() + 1}/{dayBeforeYesterday.getDate()})
              </Text>
            </TouchableOpacity>
          </View>

          {/* 年月切換列 */}
          <View style={styles.monthNavRow}>
            <TouchableOpacity onPress={handlePrevMonth} style={styles.navArrowBtn} activeOpacity={0.7}>
              <Text style={styles.navArrowText}>◀</Text>
            </TouchableOpacity>
            <View style={styles.navMonthLabelBox}>
              <Text style={styles.navMonthLabel}>
                {viewYear} 年 {viewMonth + 1} 月
              </Text>
            </View>
            <TouchableOpacity onPress={handleNextMonth} style={styles.navArrowBtn} activeOpacity={0.7}>
              <Text style={styles.navArrowText}>▶</Text>
            </TouchableOpacity>
          </View>

          {/* 星期表頭 */}
          <View style={styles.weekdayRow}>
            {WEEKDAYS.map((w, index) => (
              <View key={w} style={styles.weekdayCol}>
                <Text
                  style={[
                    styles.weekdayText,
                    (index === 0 || index === 6) && styles.weekdayTextWeekend,
                  ]}
                >
                  {w}
                </Text>
              </View>
            ))}
          </View>

          {/* 日期網格 */}
          <View style={styles.daysGrid}>
            {calendarCells.map((cell, idx) => {
              if (cell.type !== 'current') {
                return (
                  <View key={`other-${idx}`} style={styles.dayCell}>
                    <Text style={styles.otherMonthDayText}>{cell.day}</Text>
                  </View>
                );
              }

              const isSelected = isSameDay(cell.date, tempDate);
              const isTodayDate = isSameDay(cell.date, today);

              return (
                <TouchableOpacity
                  key={`cur-${cell.day}`}
                  style={[
                    styles.dayCell,
                    isSelected && styles.dayCellSelected,
                    isTodayDate && !isSelected && styles.dayCellToday,
                  ]}
                  onPress={() => handleDayPress(cell.day)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.dayText,
                      isSelected && styles.dayTextSelected,
                      isTodayDate && !isSelected && styles.dayTextToday,
                    ]}
                  >
                    {cell.day}
                  </Text>
                  {isTodayDate && !isSelected && <View style={styles.todayDot} />}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 底部目前選中提示與確認按鈕 */}
          <View style={styles.footerRow}>
            <View style={styles.selectedInfoBox}>
              <Text style={styles.selectedInfoLabel}>已選日期：</Text>
              <Text style={styles.selectedInfoValue}>
                {tempDate.getFullYear()}/{tempDate.getMonth() + 1}/{tempDate.getDate()}
                {isSameDay(tempDate, today) ? ' (今天)' : isSameDay(tempDate, yesterday) ? ' (昨天)' : ''}
              </Text>
            </View>
            <View style={styles.actionBtnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
                <Text style={styles.cancelBtnText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm} activeOpacity={0.8}>
                <Text style={styles.confirmBtnText}>確認設定</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1E293B',
  },
  subtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '700',
  },
  quickRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  quickChip: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  quickChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  quickChipTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    marginBottom: 10,
  },
  navArrowBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  navArrowText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '700',
  },
  navMonthLabelBox: {
    alignItems: 'center',
  },
  navMonthLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  weekdayRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 6,
    marginBottom: 4,
  },
  weekdayCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  weekdayTextWeekend: {
    color: '#EF4444',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    marginVertical: 1,
    position: 'relative',
  },
  dayCellSelected: {
    backgroundColor: '#4F46E5',
  },
  dayCellToday: {
    backgroundColor: '#EEF2FF',
  },
  dayText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  dayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  dayTextToday: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  otherMonthDayText: {
    fontSize: 12,
    color: '#CBD5E1',
  },
  todayDot: {
    position: 'absolute',
    bottom: 3,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4F46E5',
  },
  footerRow: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  selectedInfoLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  selectedInfoValue: {
    fontSize: 12,
    color: '#1E293B',
    fontWeight: '700',
  },
  actionBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  cancelBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  confirmBtn: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#4F46E5',
  },
  confirmBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
