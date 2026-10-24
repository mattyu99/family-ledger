import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text as RNText,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput as RNTextInput,
  Dimensions,
  Platform,
  Switch,
  KeyboardAvoidingView,
  TextProps,
  TextInputProps,
} from 'react-native';
import { useLedger } from '../context/LedgerContext';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { getCategoryIcon } from '../lib/icons';

const Text: React.FC<TextProps> = ({ allowFontScaling = false, maxFontSizeMultiplier = 1.08, ...rest }) => (
  <RNText
    allowFontScaling={allowFontScaling}
    maxFontSizeMultiplier={Math.min(maxFontSizeMultiplier ?? 1.08, 1.08)}
    {...rest}
  />
);

const TextInput: React.FC<TextInputProps> = ({ allowFontScaling = false, maxFontSizeMultiplier = 1.08, ...rest }) => (
  <RNTextInput
    allowFontScaling={allowFontScaling}
    maxFontSizeMultiplier={Math.min(maxFontSizeMultiplier ?? 1.08, 1.08)}
    {...rest}
  />
);

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const PRESET_AMOUNTS = [30000, 40000, 50000, 60000, 80000];
const PRESET_THRESHOLDS = [70, 80, 90];

export interface BudgetManageModalProps {
  visible: boolean;
  onClose: () => void;
}

export const BudgetManageModal: React.FC<BudgetManageModalProps> = ({ visible, onClose }) => {
  const { currentBudget, updateBudget, categories } = useLedger();
  const { isDark, colors } = useTheme();
  const styles = useMemo(() => getStyles(isDark, colors), [isDark, colors]);

  const [isEnabled, setIsEnabled] = useState<boolean>(true);
  const [monthlyTotal, setMonthlyTotal] = useState<string>('40000');
  const [alertThreshold, setAlertThreshold] = useState<number>(80);
  const [categoryBudgets, setCategoryBudgets] = useState<Record<string, string>>({});
  const [showCategorySettings, setShowCategorySettings] = useState<boolean>(false);

  // 僅列出支出分類供設定分類預算
  const expenseCategories = useMemo(
    () => categories.filter(c => c.type === 'expense').sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [categories]
  );

  useEffect(() => {
    if (visible) {
      if (currentBudget) {
        setIsEnabled(currentBudget.is_enabled ?? true);
        setMonthlyTotal(currentBudget.monthly_total ? String(currentBudget.monthly_total) : '40000');
        setAlertThreshold(currentBudget.alert_threshold ?? 80);
        const mapped: Record<string, string> = {};
        if (currentBudget.category_budgets) {
          Object.entries(currentBudget.category_budgets).forEach(([catId, amt]) => {
            if (amt) mapped[catId] = String(amt);
          });
        }
        setCategoryBudgets(mapped);
      } else {
        setIsEnabled(true);
        setMonthlyTotal('40000');
        setAlertThreshold(80);
        setCategoryBudgets({});
      }
    }
  }, [visible, currentBudget]);

  // 計算所有已設定之分類預算合計
  const totalCategoryBudget = useMemo(() => {
    return Object.values(categoryBudgets).reduce((acc, str) => {
      const n = parseFloat(str);
      return acc + (isNaN(n) ? 0 : n);
    }, 0);
  }, [categoryBudgets]);

  const parsedTotal = parseFloat(monthlyTotal) || 0;
  const isCategoryOverTotal = parsedTotal > 0 && totalCategoryBudget > parsedTotal;

  const handleSave = async () => {
    const numericCatBudgets: Record<string, number> = {};
    Object.entries(categoryBudgets).forEach(([catId, val]) => {
      const num = parseFloat(val);
      if (!isNaN(num) && num > 0) {
        numericCatBudgets[catId] = num;
      }
    });

    await updateBudget({
      is_enabled: isEnabled,
      monthly_total: parsedTotal,
      alert_threshold: alertThreshold,
      category_budgets: numericCatBudgets,
    });
    onClose();
  };

  const updateCategoryAmount = (catId: string, val: string) => {
    setCategoryBudgets(prev => {
      const next = { ...prev };
      if (!val || val.trim() === '') {
        delete next[catId];
      } else {
        next[catId] = val.replace(/[^0-9]/g, '');
      }
      return next;
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>🎯 家庭預算與超支預警設定</Text>
              <Text style={styles.subtitle}>掌握每月支出上限，即時掌握剩餘可用額度</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* 啟用開關卡片 */}
            <View style={styles.switchRow}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={styles.switchLabel}>開啟本月預算控管</Text>
                <Text style={styles.switchDesc}>
                  啟用後將於首頁展示預算進度條、日均可用額度與超支警告
                </Text>
              </View>
              <Switch
                value={isEnabled}
                onValueChange={setIsEnabled}
                trackColor={{ false: '#CBD5E1', true: '#4F46E5' }}
                thumbColor="#FFFFFF"
              />
            </View>

            {isEnabled && (
              <>
                {/* 月度總預算設定 */}
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>💰 每月家庭總預算 (TWD)</Text>
                  <View style={styles.inputContainer}>
                    <Text style={styles.currencyPrefix}>NT$</Text>
                    <TextInput
                      style={styles.amountInput}
                      keyboardType="numeric"
                      value={monthlyTotal}
                      onChangeText={val => setMonthlyTotal(val.replace(/[^0-9]/g, ''))}
                      placeholder="例如：40000"
                      placeholderTextColor={colors.text.muted}
                    />
                  </View>

                  {/* 快速金額選擇膠囊 */}
                  <View style={styles.presetChipsRow}>
                    {PRESET_AMOUNTS.map(amt => {
                      const isSelected = parsedTotal === amt;
                      return (
                        <TouchableOpacity
                          key={amt}
                          style={[styles.presetChip, isSelected && styles.presetChipActive]}
                          onPress={() => setMonthlyTotal(String(amt))}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.presetChipText, isSelected && styles.presetChipTextActive]}>
                            ${(amt / 1000).toFixed(0)}k
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* 預警警戒門檻 */}
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>⚠️ 警戒提醒門檻 (達到比例亮起提醒)</Text>
                  <View style={styles.thresholdRow}>
                    {PRESET_THRESHOLDS.map(pct => {
                      const isSelected = alertThreshold === pct;
                      return (
                        <TouchableOpacity
                          key={pct}
                          style={[styles.thresholdChip, isSelected && styles.thresholdChipActive]}
                          onPress={() => setAlertThreshold(pct)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.thresholdChipText, isSelected && styles.thresholdChipTextActive]}>
                            達 {pct}% 警示
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* 個別支出分類預算展開區 */}
                <View style={styles.sectionCard}>
                  <TouchableOpacity
                    style={styles.categoryToggleHeader}
                    onPress={() => setShowCategorySettings(prev => !prev)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sectionTitle}>🏷️ 各分類預算上限 (選填)</Text>
                      <Text style={styles.sectionDesc}>
                        已設定 {Object.keys(categoryBudgets).length} 項分類
                        {totalCategoryBudget > 0 ? ` · 合計 NT$ ${totalCategoryBudget.toLocaleString()}` : ''}
                      </Text>
                    </View>
                    <Text style={styles.expandIconText}>{showCategorySettings ? '▲ 收起' : '▼ 展開'}</Text>
                  </TouchableOpacity>

                  {isCategoryOverTotal && (
                    <View style={styles.warningBox}>
                      <Text style={styles.warningText}>
                        ⚠️ 分類預算合計 (NT$ {totalCategoryBudget.toLocaleString()}) 已超過總預算 (NT$ {parsedTotal.toLocaleString()})
                      </Text>
                    </View>
                  )}

                  {showCategorySettings && (
                    <View style={styles.categoryList}>
                      {expenseCategories.map(cat => {
                        const val = categoryBudgets[cat.id] || '';
                        return (
                          <View key={cat.id} style={styles.categoryRow}>
                            <View style={styles.catLeft}>
                              <Text style={styles.catIcon}>{getCategoryIcon(cat.icon)}</Text>
                              <Text style={styles.catName} numberOfLines={1}>{cat.name}</Text>
                            </View>
                            <View style={styles.catInputWrap}>
                              <Text style={styles.catInputPrefix}>NT$</Text>
                              <TextInput
                                style={styles.catInput}
                                keyboardType="numeric"
                                placeholder="不限"
                                placeholderTextColor={colors.text.muted}
                                value={val}
                                onChangeText={text => updateCategoryAmount(cat.id, text)}
                              />
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              </>
            )}

            <View style={{ height: 24 }} />
          </ScrollView>

          {/* Footer Save Button */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
              <Text style={styles.saveBtnText}>💾 儲存預算設定</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const getStyles = (isDark: boolean, colors: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: isDark ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    backdrop: {
      flex: 1,
    },
    sheet: {
      backgroundColor: colors.background.modal,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: Math.round(SCREEN_HEIGHT * 0.9),
      paddingTop: 16,
      borderTopWidth: isDark ? 1 : 0,
      borderTopColor: colors.border.default,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.default,
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text.primary,
    },
    subtitle: {
      fontSize: 12,
      color: colors.text.muted,
      marginTop: 2,
    },
    closeBtn: {
      padding: 6,
    },
    closeText: {
      fontSize: 18,
      color: colors.text.muted,
      fontWeight: '600',
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 14,
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border.default,
      marginBottom: 12,
    },
    switchLabel: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text.primary,
    },
    switchDesc: {
      fontSize: 11.5,
      color: colors.text.muted,
      marginTop: 2,
      lineHeight: 16,
    },
    sectionCard: {
      backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border.default,
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text.primary,
      marginBottom: 8,
    },
    sectionDesc: {
      fontSize: 11.5,
      color: colors.text.muted,
      marginTop: 2,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? colors.background.input : '#FFFFFF',
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.border.default,
      paddingHorizontal: 14,
      marginBottom: 10,
    },
    currencyPrefix: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text.muted,
      marginRight: 6,
    },
    amountInput: {
      flex: 1,
      paddingVertical: 10,
      fontSize: 18,
      fontWeight: '800',
      color: colors.text.primary,
    },
    presetChipsRow: {
      flexDirection: 'row',
      gap: 6,
    },
    presetChip: {
      flex: 1,
      paddingVertical: 7,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
      borderWidth: 1,
      borderColor: colors.border.default,
      alignItems: 'center',
    },
    presetChipActive: {
      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.25)' : '#EEF2FF',
      borderColor: isDark ? '#818CF8' : '#4F46E5',
    },
    presetChipText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    presetChipTextActive: {
      color: isDark ? '#818CF8' : '#4F46E5',
      fontWeight: '700',
    },
    thresholdRow: {
      flexDirection: 'row',
      gap: 8,
    },
    thresholdChip: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
      borderWidth: 1,
      borderColor: colors.border.default,
      alignItems: 'center',
    },
    thresholdChipActive: {
      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
      borderColor: isDark ? '#FBBF24' : '#F59E0B',
    },
    thresholdChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    thresholdChipTextActive: {
      color: isDark ? '#FBBF24' : '#D97706',
      fontWeight: '700',
    },
    categoryToggleHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    expandIconText: {
      fontSize: 12,
      fontWeight: '700',
      color: isDark ? '#818CF8' : '#4F46E5',
    },
    warningBox: {
      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7',
      padding: 8,
      borderRadius: 8,
      marginTop: 8,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(245, 158, 11, 0.35)' : '#FDE68A',
    },
    warningText: {
      fontSize: 11,
      color: isDark ? '#FBBF24' : '#B45309',
      fontWeight: '600',
    },
    categoryList: {
      marginTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border.default,
      paddingTop: 8,
      gap: 8,
    },
    categoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    catLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flex: 1,
    },
    catIcon: {
      fontSize: 16,
    },
    catName: {
      fontSize: 12.5,
      fontWeight: '600',
      color: colors.text.primary,
      flex: 1,
    },
    catInputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? colors.background.input : '#FFFFFF',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border.default,
      paddingHorizontal: 8,
      width: 110,
    },
    catInputPrefix: {
      fontSize: 11,
      color: colors.text.muted,
      marginRight: 2,
    },
    catInput: {
      flex: 1,
      paddingVertical: 4,
      fontSize: 13,
      fontWeight: '700',
      color: colors.text.primary,
      textAlign: 'right',
    },
    footer: {
      flexDirection: 'row',
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border.default,
      gap: 10,
    },
    cancelBtn: {
      flex: 1,
      paddingVertical: 11,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border.default,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text.muted,
    },
    saveBtn: {
      flex: 2,
      backgroundColor: '#4F46E5',
      paddingVertical: 11,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveBtnText: {
      fontSize: 13.5,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
