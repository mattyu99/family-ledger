import React, { useState, useMemo } from 'react';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import {
  View,
  Text as RNText,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextProps,
} from 'react-native';
import {
  CalendarSystem,
  solarToLunar,
  lunarToSolar,
  getLunarMonthsForYear,
  getLunarMonthDays,
  LUNAR_DAY_NAMES,
} from '../lib/lunar';

const Text: React.FC<TextProps> = ({ allowFontScaling = false, maxFontSizeMultiplier = 1.08, ...rest }) => (
  <RNText
    allowFontScaling={allowFontScaling}
    maxFontSizeMultiplier={Math.min(maxFontSizeMultiplier ?? 1.08, 1.08)}
    {...rest}
  />
);

export interface DatePickerModalProps {
  visible: boolean;
  onClose: () => void;
  selectedDate: Date;
  onSelectDate: (date: Date, calendarMode?: CalendarSystem) => void;
  initialCalendarMode?: CalendarSystem;
  initialMode?: CalendarSystem;
  title?: string;
  subtitle?: string;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export const DatePickerModal: React.FC<DatePickerModalProps> = ({
  visible,
  onClose,
  selectedDate,
  onSelectDate,
  initialCalendarMode,
  initialMode,
  title = '📅 選擇日期',
  subtitle = '支援國曆農曆雙曆對照與農曆直接指定換算',
}) => {
  const { isDark, colors } = useTheme();
  const styles = useMemo(() => getStyles(isDark, colors), [isDark, colors]);
  const effectiveInitialMode = initialMode || initialCalendarMode || 'solar';
  const initialDate = selectedDate || new Date();
  const [calendarMode, setCalendarMode] = useState<CalendarSystem>(effectiveInitialMode);
  const [viewYear, setViewYear] = useState<number>(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(initialDate.getMonth()); // 0-11
  const [tempDate, setTempDate] = useState<Date>(initialDate);

  // 農曆直接選取器狀態
  const initLunar = useMemo(() => solarToLunar(initialDate), [initialDate]);
  const [selLunarYear, setSelLunarYear] = useState<number>(initLunar.lunarYear);
  const [selLunarMonth, setSelLunarMonth] = useState<number>(initLunar.lunarMonth);
  const [selLunarIsLeap, setSelLunarIsLeap] = useState<boolean>(initLunar.isLeapMonth);
  const [selLunarDay, setSelLunarDay] = useState<number>(initLunar.lunarDay);

  // 同步國曆 Date 至農曆選取器狀態
  const syncLunarFromSolar = (d: Date) => {
    const l = solarToLunar(d);
    setSelLunarYear(l.lunarYear);
    setSelLunarMonth(l.lunarMonth);
    setSelLunarIsLeap(l.isLeapMonth);
    setSelLunarDay(l.lunarDay);
  };

  // 同步農曆選取器狀態至國曆 Date
  const applyLunarSelection = (y: number, m: number, d: number, isLeap: boolean) => {
    const maxD = getLunarMonthDays(y, m, isLeap);
    const clampedDay = Math.min(d, maxD);
    setSelLunarYear(y);
    setSelLunarMonth(m);
    setSelLunarIsLeap(isLeap);
    setSelLunarDay(clampedDay);

    const solarD = lunarToSolar(y, m, clampedDay, isLeap);
    setTempDate(solarD);
    setViewYear(solarD.getFullYear());
    setViewMonth(solarD.getMonth());
  };

  // 當彈窗開啟時同步目前選中日期
  React.useEffect(() => {
    if (visible) {
      const d = selectedDate || new Date();
      setTempDate(d);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
      setCalendarMode(effectiveInitialMode);
      syncLunarFromSolar(d);
    }
  }, [visible, selectedDate, effectiveInitialMode]);

  const today = useMemo(() => new Date(), []);
  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  }, []);
  const yesterday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
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
    syncLunarFromSolar(targetDate);
  };

  // 點擊日曆中的某一天
  const handleCellPress = (targetDate: Date) => {
    setTempDate(targetDate);
    setViewYear(targetDate.getFullYear());
    setViewMonth(targetDate.getMonth());
    syncLunarFromSolar(targetDate);
  };

  // 確認選擇
  const handleConfirm = () => {
    onSelectDate(tempDate, calendarMode);
    onClose();
  };

  // 計算日曆網格資料（含每格對應農曆資訊）
  const calendarCells = useMemo(() => {
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0(Sun) - 6(Sat)
    const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();

    const cells: {
      type: 'prev' | 'current' | 'next';
      day: number;
      date: Date;
      lunar: ReturnType<typeof solarToLunar>;
    }[] = [];

    // 前一個月的填充空格
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const dateObj = new Date(viewYear, viewMonth - 1, d);
      cells.push({
        type: 'prev',
        day: d,
        date: dateObj,
        lunar: solarToLunar(dateObj),
      });
    }

    // 當前月份各天
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(viewYear, viewMonth, d);
      cells.push({
        type: 'current',
        day: d,
        date: dateObj,
        lunar: solarToLunar(dateObj),
      });
    }

    // 後一個月的填充空格（補齊 35 或 42 格）
    const totalCells = cells.length <= 35 ? 35 : 42;
    const remaining = totalCells - cells.length;
    for (let d = 1; d <= remaining; d++) {
      const dateObj = new Date(viewYear, viewMonth + 1, d);
      cells.push({
        type: 'next',
        day: d,
        date: dateObj,
        lunar: solarToLunar(dateObj),
      });
    }

    return cells;
  }, [viewYear, viewMonth]);

  // 當前選中日期的完整農曆資訊
  const tempLunar = useMemo(() => solarToLunar(tempDate), [tempDate]);

  // 農曆直接選取器：該農曆年份的所有月份（含閏月）與當月天數
  const lunarMonthsList = useMemo(() => getLunarMonthsForYear(selLunarYear), [selLunarYear]);
  const currentLunarMonthDays = useMemo(
    () => getLunarMonthDays(selLunarYear, selLunarMonth, selLunarIsLeap),
    [selLunarYear, selLunarMonth, selLunarIsLeap]
  );

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.card}>
          {/* 頂部標題 */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 國曆月曆 vs 農曆指定 雙模式切換器 */}
          <View style={styles.modeSwitchRow}>
            <TouchableOpacity
              style={[styles.modeSwitchBtn, calendarMode === 'solar' && styles.modeSwitchBtnActiveSolar]}
              onPress={() => setCalendarMode('solar')}
              activeOpacity={0.8}
            >
              <Text style={[styles.modeSwitchText, calendarMode === 'solar' && styles.modeSwitchTextActiveSolar]}>
                🗓️ 國曆月曆 (含農曆)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeSwitchBtn, calendarMode === 'lunar' && styles.modeSwitchBtnActiveLunar]}
              onPress={() => {
                syncLunarFromSolar(tempDate);
                setCalendarMode('lunar');
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.modeSwitchText, calendarMode === 'lunar' && styles.modeSwitchTextActiveLunar]}>
                🏮 農曆直接指定
              </Text>
            </TouchableOpacity>
          </View>

          {calendarMode === 'solar' ? (
            <>
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
                  style={[styles.quickChip, isSameDay(tempDate, tomorrow) && styles.quickChipActive]}
                  onPress={() => handleQuickSelect(tomorrow)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.quickChipText, isSameDay(tempDate, tomorrow) && styles.quickChipTextActive]}>
                    明天 ({tomorrow.getMonth() + 1}/{tomorrow.getDate()})
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
              </View>

              {/* 年月切換列 */}
              <View style={styles.monthNavRow}>
                <TouchableOpacity onPress={() => setViewYear(y => y - 1)} style={styles.navYearBtn} activeOpacity={0.7}>
                  <Text style={styles.navYearText}>« 年</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handlePrevMonth} style={styles.navArrowBtn} activeOpacity={0.7}>
                  <Text style={styles.navArrowText}>◀</Text>
                </TouchableOpacity>
                <View style={styles.navMonthLabelBox}>
                  <Text style={styles.navMonthLabel}>
                    {viewYear} 年 {viewMonth + 1} 月
                  </Text>
                  <Text style={styles.navLunarSubLabel}>
                    農曆{tempLunar.yearGanZhi}{tempLunar.zodiac}年 · {tempLunar.monthStr}
                  </Text>
                </View>
                <TouchableOpacity onPress={handleNextMonth} style={styles.navArrowBtn} activeOpacity={0.7}>
                  <Text style={styles.navArrowText}>▶</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setViewYear(y => y + 1)} style={styles.navYearBtn} activeOpacity={0.7}>
                  <Text style={styles.navYearText}>年 »</Text>
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

              {/* 日期網格（國曆 + 農曆雙曆同框） */}
              <View style={styles.daysGrid}>
                {calendarCells.map((cell, idx) => {
                  const isCurrentMonth = cell.type === 'current';
                  const isSelected = isSameDay(cell.date, tempDate);
                  const isTodayDate = isSameDay(cell.date, today);
                  const isLunarHighlight = cell.lunar.isHighlight;

                  return (
                    <TouchableOpacity
                      key={`cell-${idx}`}
                      style={[
                        styles.dayCell,
                        isSelected && styles.dayCellSelected,
                        isTodayDate && !isSelected && styles.dayCellToday,
                      ]}
                      onPress={() => handleCellPress(cell.date)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          !isCurrentMonth && styles.otherMonthDayText,
                          isSelected && styles.dayTextSelected,
                          isTodayDate && !isSelected && styles.dayTextToday,
                        ]}
                      >
                        {cell.day}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.lunarCellText,
                          !isCurrentMonth && styles.otherMonthLunarText,
                          isLunarHighlight && isCurrentMonth && !isSelected && styles.lunarCellTextHighlight,
                          isSelected && styles.lunarCellTextSelected,
                        ]}
                      >
                        {cell.lunar.cellLabel}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          ) : (
            /* 農曆直接指定選取器 */
            <ScrollView style={styles.lunarPickerArea} showsVerticalScrollIndicator={false}>
              {/* 農曆年份選擇 */}
              <View style={styles.lunarYearNavRow}>
                <TouchableOpacity
                  style={styles.navArrowBtn}
                  onPress={() => {
                    const nextY = Math.max(1900, selLunarYear - 1);
                    applyLunarSelection(nextY, selLunarMonth, selLunarDay, false);
                  }}
                >
                  <Text style={styles.navArrowText}>◀</Text>
                </TouchableOpacity>
                <View style={styles.navMonthLabelBox}>
                  <Text style={styles.lunarYearTitle}>
                    🏮 農曆 {selLunarYear} 年 ({tempLunar.yearGanZhi}{tempLunar.zodiac}年)
                  </Text>
                  <Text style={styles.navLunarSubLabel}>點選下方農曆月份與日期，自動換算國曆</Text>
                </View>
                <TouchableOpacity
                  style={styles.navArrowBtn}
                  onPress={() => {
                    const nextY = Math.min(2100, selLunarYear + 1);
                    applyLunarSelection(nextY, selLunarMonth, selLunarDay, false);
                  }}
                >
                  <Text style={styles.navArrowText}>▶</Text>
                </TouchableOpacity>
              </View>

              {/* 農曆月份選擇網格 */}
              <Text style={styles.lunarSectionLabel}>選擇農曆月份</Text>
              <View style={styles.lunarMonthsGrid}>
                {lunarMonthsList.map((mItem) => {
                  const isSel = selLunarMonth === mItem.month && selLunarIsLeap === mItem.isLeap;
                  return (
                    <TouchableOpacity
                      key={`${mItem.month}-${mItem.isLeap ? 'leap' : 'norm'}`}
                      style={[styles.lunarMonthChip, isSel && styles.lunarMonthChipActive]}
                      onPress={() => applyLunarSelection(selLunarYear, mItem.month, selLunarDay, mItem.isLeap)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.lunarMonthChipText, isSel && styles.lunarMonthChipTextActive]}>
                        {mItem.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* 農曆日期選擇網格 (初一 ~ 廿九/三十) */}
              <View style={styles.lunarDayHeaderRow}>
                <Text style={styles.lunarSectionLabel}>
                  選擇農曆日期（本月共 {currentLunarMonthDays} 天）
                </Text>
                <View style={styles.lunarQuickDaysRow}>
                  {[
                    { d: 1, label: '初一' },
                    { d: 2, label: '初二' },
                    { d: 15, label: '十五' },
                    { d: 16, label: '十六' },
                  ].map((q) => (
                    <TouchableOpacity
                      key={q.d}
                      style={[
                        styles.lunarQuickMiniBtn,
                        selLunarDay === q.d && styles.lunarQuickMiniBtnActive,
                      ]}
                      onPress={() => applyLunarSelection(selLunarYear, selLunarMonth, q.d, selLunarIsLeap)}
                    >
                      <Text
                        style={[
                          styles.lunarQuickMiniText,
                          selLunarDay === q.d && styles.lunarQuickMiniTextActive,
                        ]}
                      >
                        {q.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.lunarDaysGrid}>
                {Array.from({ length: currentLunarMonthDays }, (_, i) => i + 1).map((dNum) => {
                  const isSel = selLunarDay === dNum;
                  const isSpecial = dNum === 1 || dNum === 15 || dNum === 2 || dNum === 16;
                  return (
                    <TouchableOpacity
                      key={dNum}
                      style={[
                        styles.lunarDayChip,
                        isSpecial && !isSel && styles.lunarDayChipSpecial,
                        isSel && styles.lunarDayChipActive,
                      ]}
                      onPress={() => applyLunarSelection(selLunarYear, selLunarMonth, dNum, selLunarIsLeap)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.lunarDayChipText,
                          isSpecial && !isSel && styles.lunarDayChipTextSpecial,
                          isSel && styles.lunarDayChipTextActive,
                        ]}
                      >
                        {LUNAR_DAY_NAMES[dNum - 1]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* 即時換算結果預覽卡片 */}
              <View style={styles.lunarConversionPreviewBox}>
                <Text style={styles.lunarConversionTitle}>
                  🏮 {tempLunar.fullLabel}
                </Text>
                <Text style={styles.lunarConversionSub}>
                  ➔ 對應國曆：{tempDate.getFullYear()} 年 {tempDate.getMonth() + 1} 月 {tempDate.getDate()} 日 (週{WEEKDAYS[tempDate.getDay()]})
                </Text>
              </View>
            </ScrollView>
          )}

          {/* 底部目前選中提示與確認按鈕 */}
          <View style={styles.footerRow}>
            <View style={styles.selectedInfoBox}>
              <Text style={styles.selectedInfoValue}>
                🗓️ {tempDate.getFullYear()}/{tempDate.getMonth() + 1}/{tempDate.getDate()} (週{WEEKDAYS[tempDate.getDay()]})
                {isSameDay(tempDate, today) ? ' · 今天' : ''}
              </Text>
              <Text style={styles.selectedLunarValue}>
                🏮 {tempLunar.fullLabel} ({tempLunar.yearGanZhi}{tempLunar.zodiac}年)
              </Text>
            </View>
            <View style={styles.actionBtnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
                <Text style={styles.cancelBtnText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmBtn,
                  calendarMode === 'lunar' && styles.confirmBtnLunar,
                ]}
                onPress={handleConfirm}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmBtnText}>
                  {calendarMode === 'lunar' ? '確認農曆' : '確認設定'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const getStyles = (isDark: boolean, colors: ThemeColors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.75)' : 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 14,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  card: {
    width: '100%',
    maxWidth: 410,
    backgroundColor: colors.background.modal,
    borderRadius: 24,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
    borderWidth: isDark ? 1 : 0,
    borderColor: isDark ? colors.border.default : 'transparent',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 2,
    fontWeight: '500',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: isDark ? colors.background.cardSubtle : '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 13,
    color: colors.text.muted,
    fontWeight: '700',
  },
  modeSwitchRow: {
    flexDirection: 'row',
    backgroundColor: isDark ? colors.background.cardSubtle : '#F1F5F9',
    borderRadius: 12,
    padding: 3,
    marginBottom: 10,
    gap: 4,
  },
  modeSwitchBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeSwitchBtnActiveSolar: {
    backgroundColor: isDark ? colors.background.card : '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  modeSwitchBtnActiveLunar: {
    backgroundColor: isDark ? 'rgba(234, 88, 12, 0.15)' : '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FB923C',
  },
  modeSwitchText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.muted,
  },
  modeSwitchTextActiveSolar: {
    color: isDark ? '#818CF8' : '#4F46E5',
    fontWeight: '800',
  },
  modeSwitchTextActiveLunar: {
    color: isDark ? '#FB923C' : '#C2410C',
    fontWeight: '800',
  },
  quickRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  quickChip: {
    flex: 1,
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickChipActive: {
    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF',
    borderColor: '#4F46E5',
  },
  quickChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  quickChipTextActive: {
    color: isDark ? '#818CF8' : '#4F46E5',
    fontWeight: '700',
  },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 6,
    backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
    borderRadius: 12,
    marginBottom: 8,
    gap: 4,
  },
  navYearBtn: {
    paddingHorizontal: 7,
    height: 30,
    borderRadius: 8,
    backgroundColor: isDark ? colors.background.card : '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E2E8F0',
  },
  navYearText: {
    fontSize: 10,
    color: colors.text.secondary,
    fontWeight: '700',
  },
  navArrowBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: isDark ? colors.background.card : '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E2E8F0',
  },
  navArrowText: {
    fontSize: 12,
    color: colors.text.primary,
    fontWeight: '700',
  },
  navMonthLabelBox: {
    flex: 1,
    alignItems: 'center',
  },
  navMonthLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text.primary,
  },
  navLunarSubLabel: {
    fontSize: 10,
    color: isDark ? '#FB923C' : '#9A3412',
    fontWeight: '600',
    marginTop: 1,
  },
  weekdayRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: isDark ? colors.border.default : '#F1F5F9',
    paddingBottom: 5,
    marginBottom: 4,
  },
  weekdayCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  weekdayTextWeekend: {
    color: '#EF4444',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    marginVertical: 1,
    position: 'relative',
  },
  dayCellSelected: {
    backgroundColor: '#4F46E5',
  },
  dayCellToday: {
    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(99, 102, 241, 0.4)' : '#C7D2FE',
  },
  dayText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
    lineHeight: 16,
  },
  dayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  dayTextToday: {
    color: isDark ? '#818CF8' : '#4F46E5',
    fontWeight: '800',
  },
  otherMonthDayText: {
    color: isDark ? '#475569' : '#CBD5E1',
    fontWeight: '500',
  },
  lunarCellText: {
    fontSize: 9,
    color: colors.text.muted,
    fontWeight: '500',
    marginTop: 1,
  },
  otherMonthLunarText: {
    color: isDark ? '#334155' : '#E2E8F0',
  },
  lunarCellTextHighlight: {
    color: '#EA580C',
    fontWeight: '700',
  },
  lunarCellTextSelected: {
    color: '#E0E7FF',
    fontWeight: '700',
  },
  // 農曆直接指定選取器樣式
  lunarPickerArea: {
    maxHeight: 340,
    marginBottom: 8,
  },
  lunarYearNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    paddingHorizontal: 8,
    backgroundColor: isDark ? 'rgba(234, 88, 12, 0.15)' : '#FFF7ED',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(234, 88, 12, 0.35)' : '#FED7AA',
    marginBottom: 10,
  },
  lunarYearTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: isDark ? '#FDBA74' : '#9A3412',
  },
  lunarSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.secondary,
    marginBottom: 6,
  },
  lunarMonthsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  lunarMonthChip: {
    width: '23%',
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lunarMonthChipActive: {
    backgroundColor: '#EA580C',
    borderColor: '#EA580C',
  },
  lunarMonthChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  lunarMonthChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  lunarDayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    flexWrap: 'wrap',
    gap: 4,
  },
  lunarQuickDaysRow: {
    flexDirection: 'row',
    gap: 4,
  },
  lunarQuickMiniBtn: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: isDark ? 'rgba(234, 88, 12, 0.15)' : '#FFF7ED',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(234, 88, 12, 0.35)' : '#FDBA74',
  },
  lunarQuickMiniBtnActive: {
    backgroundColor: '#EA580C',
    borderColor: '#EA580C',
  },
  lunarQuickMiniText: {
    fontSize: 10,
    fontWeight: '700',
    color: isDark ? '#FDBA74' : '#C2410C',
  },
  lunarQuickMiniTextActive: {
    color: '#FFFFFF',
  },
  lunarDaysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: 10,
  },
  lunarDayChip: {
    width: '18.4%',
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lunarDayChipSpecial: {
    backgroundColor: isDark ? 'rgba(234, 88, 12, 0.15)' : '#FFF7ED',
    borderColor: isDark ? 'rgba(234, 88, 12, 0.35)' : '#FED7AA',
  },
  lunarDayChipActive: {
    backgroundColor: '#EA580C',
    borderColor: '#EA580C',
  },
  lunarDayChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  lunarDayChipTextSpecial: {
    color: isDark ? '#FDBA74' : '#C2410C',
    fontWeight: '700',
  },
  lunarDayChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  lunarConversionPreviewBox: {
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FFFBEB',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(245, 158, 11, 0.35)' : '#FDE68A',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  lunarConversionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: isDark ? '#FBBF24' : '#92400E',
  },
  lunarConversionSub: {
    fontSize: 12,
    fontWeight: '700',
    color: isDark ? '#FCD34D' : '#B45309',
    marginTop: 2,
  },
  footerRow: {
    borderTopWidth: 1,
    borderTopColor: isDark ? colors.border.default : '#F1F5F9',
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedInfoBox: {
    flex: 1,
    marginRight: 8,
  },
  selectedInfoValue: {
    fontSize: 12,
    color: colors.text.primary,
    fontWeight: '800',
  },
  selectedLunarValue: {
    fontSize: 11,
    color: isDark ? '#FB923C' : '#C2410C',
    fontWeight: '600',
    marginTop: 2,
  },
  actionBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: isDark ? colors.background.cardSubtle : '#F1F5F9',
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  confirmBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#4F46E5',
  },
  confirmBtnLunar: {
    backgroundColor: '#EA580C',
  },
  confirmBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
