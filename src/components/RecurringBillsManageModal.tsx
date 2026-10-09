import React, { useState, useMemo } from 'react';
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
  Alert,
  TextProps,
  TextInputProps,
  Switch,
  KeyboardAvoidingView,
} from 'react-native';
import { RecurringRule, RecurringFrequency, RecurringAmountType, PaymentMethod, PaymentAccount, Profile, Category } from '../types/database';
import { useLedger } from '../context/LedgerContext';
import {
  isBillDueInMonth,
  getCurrentPeriodKey,
  isBillPaidForCurrentPeriod,
  getBillPeriodLabel,
  getFrequencyBadgeText,
  getBillDueDate,
  DEFAULT_RECURRING_PRESETS,
} from '../lib/recurring';
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

const showAlert = (title: string, message: string, onOk?: () => void) => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.alert(`${title}\n\n${message}`);
      if (onOk) onOk();
    }
  } else {
    Alert.alert(title, message, [{ text: '確定', onPress: onOk }]);
  }
};

const showConfirm = (title: string, message: string, onConfirm: () => void) => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: '取消', style: 'cancel' },
      { text: '確定', style: 'destructive', onPress: onConfirm },
    ]);
  }
};

export interface RecurringBillsManageModalProps {
  visible: boolean;
  onClose: () => void;
  initialTab?: 'pending' | 'rules';
}

export const RecurringBillsManageModal: React.FC<RecurringBillsManageModalProps> = ({
  visible,
  onClose,
  initialTab = 'pending',
}) => {
  const {
    recurringRules,
    addRecurringRule,
    updateRecurringRule,
    deleteRecurringRule,
    recordRecurringBill,
    skipRecurringBill,
    restoreDefaultRecurringRules,
    categories,
    members,
    currentUser,
    paymentAccounts,
    paymentMethods,
    getAccountById,
    getMemberById,
    getCategoryById,
    getPaymentMethodById,
  } = useLedger();

  const [activeTab, setActiveTab] = useState<'pending' | 'rules'>(initialTab);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // 輸入金額彈窗狀態 (用於浮動金額或自訂金額入帳)
  const [amountModalVisible, setAmountModalVisible] = useState<boolean>(false);
  const [targetRuleForAmount, setTargetRuleForAmount] = useState<RecurringRule | null>(null);
  const [inputAmount, setInputAmount] = useState<string>('');
  const [inputNote, setInputNote] = useState<string>('');
  const [inputPaidBy, setInputPaidBy] = useState<string>('');
  const [inputPaymentMethod, setInputPaymentMethod] = useState<PaymentMethod>('credit_card');
  const [inputAccountId, setInputAccountId] = useState<string | undefined>(undefined);

  // 規則編輯/新增彈窗狀態
  const [ruleModalVisible, setRuleModalVisible] = useState<boolean>(false);
  const [editingRule, setEditingRule] = useState<RecurringRule | null>(null);
  const [formName, setFormName] = useState<string>('');
  const [formMerchant, setFormMerchant] = useState<string>('');
  const [formCategoryId, setFormCategoryId] = useState<string>('');
  const [formAmountType, setFormAmountType] = useState<RecurringAmountType>('variable');
  const [formDefaultAmount, setFormDefaultAmount] = useState<string>('');
  const [formFrequency, setFormFrequency] = useState<RecurringFrequency>('bimonthly');
  const [formBimonthlyStartMonth, setFormBimonthlyStartMonth] = useState<1 | 2>(2);
  const [formDueDay, setFormDueDay] = useState<number>(15);
  const [formPaidBy, setFormPaidBy] = useState<string>('');
  const [formPaymentMethod, setFormPaymentMethod] = useState<PaymentMethod>('credit_card');
  const [formAccountId, setFormAccountId] = useState<string | undefined>(undefined);
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [formNote, setFormNote] = useState<string>('');

  // 常用範本選擇彈窗
  const [presetModalVisible, setPresetModalVisible] = useState<boolean>(false);

  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth() + 1; // 1 ~ 12

  // 當前月份的應繳週期項目分析
  const { pendingBills, settledBills } = useMemo(() => {
    const pending: RecurringRule[] = [];
    const settled: RecurringRule[] = [];

    recurringRules.forEach(rule => {
      if (!rule.is_active) return;
      // 判定當月是否為出帳繳納月份
      if (!isBillDueInMonth(rule, year, month)) return;

      const isPaid = isBillPaidForCurrentPeriod(rule, selectedDate);
      if (isPaid) {
        settled.push(rule);
      } else {
        pending.push(rule);
      }
    });

    // 依扣款日排序
    pending.sort((a, b) => (a.due_day || 1) - (b.due_day || 1));
    settled.sort((a, b) => (a.due_day || 1) - (b.due_day || 1));

    return { pendingBills: pending, settledBills: settled };
  }, [recurringRules, year, month, selectedDate]);

  // 切換月份
  const handlePrevMonth = () => {
    setSelectedDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setSelectedDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleResetToCurrentMonth = () => {
    setSelectedDate(new Date());
  };

  // 開啟金額輸入視窗
  const handleOpenAmountModal = (rule: RecurringRule) => {
    setTargetRuleForAmount(rule);
    const defaultVal = rule.default_amount > 0 ? String(rule.default_amount) : '';
    setInputAmount(defaultVal);
    setInputPaidBy(rule.paid_by || currentUser.id);
    setInputPaymentMethod(rule.payment_method);
    setInputAccountId(rule.account_id);
    const periodLabel = getBillPeriodLabel(rule, selectedDate);
    setInputNote(`[${rule.name}] ${periodLabel}`);
    setAmountModalVisible(true);
  };

  // 送出金額並入帳
  const handleConfirmAmountAndRecord = async () => {
    if (!targetRuleForAmount) return;
    const amountNum = parseFloat(inputAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      showAlert('請輸入金額', '請填寫正確且大於 0 的帳單金額');
      return;
    }

    try {
      // 檢查若使用者修改了付款人或管道，使用自訂備註入帳
      const success = await recordRecurringBill(
        targetRuleForAmount.id,
        amountNum,
        new Date(year, month - 1, Math.min(targetRuleForAmount.due_day, 28), 12, 0, 0).toISOString(),
        inputNote
      );

      if (success) {
        setAmountModalVisible(false);
        setTargetRuleForAmount(null);
        showAlert('記帳成功', `已成功將「${targetRuleForAmount.name}」NT$ ${amountNum.toLocaleString()} 寫入收支明細！`);
      }
    } catch (e: any) {
      showAlert('記帳失敗', e?.message || '發生未知錯誤');
    }
  };

  // 固定金額快速一鍵確認入帳
  const handleQuickRecordFixed = async (rule: RecurringRule) => {
    showConfirm(
      '確認記帳',
      `確定將「${rule.name}」固定金額 NT$ ${rule.default_amount.toLocaleString()} 寫入收支明細？`,
      async () => {
        try {
          const success = await recordRecurringBill(
            rule.id,
            rule.default_amount,
            new Date(year, month - 1, Math.min(rule.due_day, 28), 12, 0, 0).toISOString()
          );
          if (success) {
            showAlert('記帳成功', `已成功記錄「${rule.name}」！`);
          }
        } catch (e: any) {
          showAlert('記帳失敗', e?.message || '發生未知錯誤');
        }
      }
    );
  };

  // 略過本期
  const handleSkipBill = (rule: RecurringRule) => {
    const periodLabel = getBillPeriodLabel(rule, selectedDate);
    showConfirm(
      '略過本期帳單',
      `確定略過「${rule.name}」在 ${periodLabel} 的帳單？\n(略過後本期將不再提示，亦不會寫入收支紀錄)`,
      async () => {
        const periodKey = getCurrentPeriodKey(rule, selectedDate);
        await skipRecurringBill(rule.id, periodKey);
        showAlert('已略過', `已標記「${rule.name}」本期略過。`);
      }
    );
  };

  // 開啟新增/編輯規則
  const handleOpenRuleModal = (rule?: RecurringRule) => {
    if (rule) {
      setEditingRule(rule);
      setFormName(rule.name);
      setFormMerchant(rule.merchant || '');
      setFormCategoryId(rule.category_id);
      setFormAmountType(rule.amount_type);
      setFormDefaultAmount(rule.default_amount > 0 ? String(rule.default_amount) : '');
      setFormFrequency(rule.frequency);
      setFormBimonthlyStartMonth(rule.bimonthly_start_month || 2);
      setFormDueDay(rule.due_day || 15);
      setFormPaidBy(rule.paid_by || currentUser.id);
      setFormPaymentMethod(rule.payment_method);
      setFormAccountId(rule.account_id);
      setFormIsActive(rule.is_active);
      setFormNote(rule.note || '');
    } else {
      setEditingRule(null);
      setFormName('');
      setFormMerchant('');
      const utilityCat = categories.find(c => c.name.includes('水電') || c.name.includes('居家')) || categories[0];
      setFormCategoryId(utilityCat?.id || '');
      setFormAmountType('variable');
      setFormDefaultAmount('');
      setFormFrequency('bimonthly');
      setFormBimonthlyStartMonth(2);
      setFormDueDay(15);
      setFormPaidBy(currentUser.id);
      setFormPaymentMethod('credit_card');
      const firstCard = paymentAccounts.find(a => a.type === 'credit_card');
      setFormAccountId(firstCard?.id);
      setFormIsActive(true);
      setFormNote('');
    }
    setRuleModalVisible(true);
  };

  // 儲存規則
  const handleSaveRule = async () => {
    if (!formName.trim()) {
      showAlert('請輸入名稱', '請為週期項目設定名稱（例如：台電電費、自來水費）');
      return;
    }

    const defaultAmt = parseFloat(formDefaultAmount) || 0;
    if (formAmountType === 'fixed' && defaultAmt <= 0) {
      showAlert('請輸入固定金額', '固定金額項目請輸入大於 0 的金額數值');
      return;
    }

    const categoryId = formCategoryId || categories[0]?.id || '';
    const paidBy = formPaidBy || currentUser.id;

    if (editingRule) {
      await updateRecurringRule(editingRule.id, {
        name: formName.trim(),
        merchant: formMerchant.trim() || undefined,
        category_id: categoryId,
        amount_type: formAmountType,
        default_amount: defaultAmt,
        frequency: formFrequency,
        bimonthly_start_month: formFrequency === 'bimonthly' ? formBimonthlyStartMonth : undefined,
        due_day: Math.min(Math.max(1, formDueDay), 31),
        paid_by: paidBy,
        payment_method: formPaymentMethod,
        account_id: formPaymentMethod === 'credit_card' ? formAccountId : undefined,
        is_active: formIsActive,
        note: formNote.trim() || undefined,
      });
      showAlert('更新成功', `已更新「${formName.trim()}」設定。`);
    } else {
      await addRecurringRule({
        name: formName.trim(),
        merchant: formMerchant.trim() || undefined,
        category_id: categoryId,
        amount_type: formAmountType,
        default_amount: defaultAmt,
        frequency: formFrequency,
        bimonthly_start_month: formFrequency === 'bimonthly' ? formBimonthlyStartMonth : undefined,
        due_day: Math.min(Math.max(1, formDueDay), 31),
        paid_by: paidBy,
        payment_method: formPaymentMethod,
        account_id: formPaymentMethod === 'credit_card' ? formAccountId : undefined,
        is_active: formIsActive,
        note: formNote.trim() || undefined,
      });
      showAlert('新增成功', `已建立週期扣款規則「${formName.trim()}」！`);
    }

    setRuleModalVisible(false);
  };

  // 刪除規則
  const handleDeleteRule = (rule: RecurringRule) => {
    showConfirm(
      '刪除規則',
      `確定刪除週期規則「${rule.name}」？\n(過去已入帳的明細不會被刪除)`,
      async () => {
        await deleteRecurringRule(rule.id);
        showAlert('已刪除', `已刪除「${rule.name}」規則。`);
      }
    );
  };

  // 從預設範本快速導入規則
  const handleApplyPreset = (preset: typeof DEFAULT_RECURRING_PRESETS[0]) => {
    const utilityCat = categories.find(c => c.name.includes('水電') || c.name.includes('居家')) || categories[0];
    const defaultCard = paymentAccounts.find(a => a.type === 'credit_card');

    setEditingRule(null);
    setFormName(preset.name);
    setFormMerchant(preset.merchant || '');
    setFormCategoryId(utilityCat?.id || '');
    setFormAmountType(preset.amount_type);
    setFormDefaultAmount(preset.default_amount > 0 ? String(preset.default_amount) : '');
    setFormFrequency(preset.frequency);
    setFormBimonthlyStartMonth((preset as any).bimonthly_start_month || 2);
    setFormDueDay(preset.due_day);
    setFormPaidBy(currentUser.id);
    setFormPaymentMethod(preset.payment_method);
    setFormAccountId(preset.payment_method === 'credit_card' ? defaultCard?.id : undefined);
    setFormIsActive(true);
    setFormNote('');
    setPresetModalVisible(false);
    setRuleModalVisible(true);
  };

  // 計算到期天數狀態標籤
  const getDueStatusBadge = (rule: RecurringRule) => {
    const today = new Date();
    const dueDate = getBillDueDate(rule, selectedDate);
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;

    if (!isCurrentMonth) {
      return {
        text: `預計 ${rule.due_day} 號扣款`,
        bg: '#F3F4F6',
        color: '#4B5563',
      };
    }

    const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).getTime();
    const diffDays = Math.round((dueDateOnly - todayDateOnly) / (1000 * 3600 * 24));

    if (diffDays < 0) {
      return {
        text: `已逾扣款日 (${Math.abs(diffDays)} 天前)`,
        bg: '#FEE2E2',
        color: '#DC2626',
      };
    } else if (diffDays === 0) {
      return {
        text: '⚠️ 今天扣繳',
        bg: '#FEF3C7',
        color: '#D97706',
      };
    } else if (diffDays <= 3) {
      return {
        text: `即將扣款 (剩 ${diffDays} 天)`,
        bg: '#FEF3C7',
        color: '#B45309',
      };
    } else {
      return {
        text: `本月 ${rule.due_day} 號扣款 (剩 ${diffDays} 天)`,
        bg: '#EFF6FF',
        color: '#2563EB',
      };
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitle}>🗓️ 週期扣款與固定帳單</Text>
              <Text style={styles.headerSubtitle}>水電、瓦斯、電信費手動確認入帳</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Tab 切換器 */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'pending' && styles.tabItemActive]}
              onPress={() => setActiveTab('pending')}
            >
              <Text style={[styles.tabText, activeTab === 'pending' && styles.tabTextActive]}>
                📋 待繳核對清單
              </Text>
              {pendingBills.length > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{pendingBills.length}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'rules' && styles.tabItemActive]}
              onPress={() => setActiveTab('rules')}
            >
              <Text style={[styles.tabText, activeTab === 'rules' && styles.tabTextActive]}>
                ⚙️ 規則設定 ({recurringRules.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tab 1: 待繳清單 */}
          {activeTab === 'pending' && (
            <View style={styles.tabContent}>
              {/* 月份切換列 */}
              <View style={styles.monthSelectorRow}>
                <TouchableOpacity style={styles.monthNavButton} onPress={handlePrevMonth}>
                  <Text style={styles.monthNavText}>‹ 上個月</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.currentMonthBadge} onPress={handleResetToCurrentMonth}>
                  <Text style={styles.currentMonthText}>
                    📅 {year} 年 {month} 月
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.monthNavButton} onPress={handleNextMonth}>
                  <Text style={styles.monthNavText}>下個月 ›</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                {/* 待確認清單區塊 */}
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>
                    🔔 本期待確認記帳 ({pendingBills.length})
                  </Text>
                  <Text style={styles.sectionHint}>點選確認後立即寫入收支明細</Text>
                </View>

                {pendingBills.length === 0 ? (
                  <View style={styles.emptyStateBox}>
                    <Text style={styles.emptyStateIcon}>🎉</Text>
                    <Text style={styles.emptyStateTitle}>太棒了！本期無待繳帳單</Text>
                    <Text style={styles.emptyStateSubtitle}>
                      {year} 年 {month} 月所有週期項目皆已入帳，或當月無雙月繳帳單。
                    </Text>
                    {recurringRules.length === 0 && (
                      <TouchableOpacity
                        style={styles.addRuleQuickButton}
                        onPress={() => setPresetModalVisible(true)}
                      >
                        <Text style={styles.addRuleQuickButtonText}>+ 快速導入常用週期範本</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  pendingBills.map(rule => {
                    const dueBadge = getDueStatusBadge(rule);
                    const cat = getCategoryById(rule.category_id);
                    const payer = getMemberById(rule.paid_by);
                    const card = rule.account_id ? getAccountById(rule.account_id) : undefined;
                    const isFixed = rule.amount_type === 'fixed';
                    const periodLabel = getBillPeriodLabel(rule, selectedDate);

                    return (
                      <View key={rule.id} style={styles.billCard}>
                        {/* 狀態與週期徽章列 */}
                        <View style={styles.cardHeaderRow}>
                          <View style={[styles.dueBadge, { backgroundColor: dueBadge.bg }]}>
                            <Text style={[styles.dueBadgeText, { color: dueBadge.color }]}>
                              {dueBadge.text}
                            </Text>
                          </View>
                          <Text style={styles.periodLabelText}>{periodLabel}</Text>
                        </View>

                        {/* 主資訊 */}
                        <View style={styles.cardMainRow}>
                          <View style={styles.catIconContainer}>
                            <Text style={styles.catIconEmoji}>{getCategoryIcon(cat?.icon)}</Text>
                          </View>
                          <View style={styles.cardInfoContainer}>
                            <Text style={styles.billNameText}>{rule.name}</Text>
                            <View style={styles.tagsRow}>
                              <Text style={styles.tagFreqText}>{getFrequencyBadgeText(rule)}</Text>
                              {payer && (
                                <Text style={styles.tagMemberText}>
                                  {payer.avatar_url || '👤'} {payer.display_name}
                                </Text>
                              )}
                              {card ? (
                                <Text style={styles.tagCardText}>
                                  💳 {card.name} {card.last_four_digits ? `(${card.last_four_digits})` : ''}
                                </Text>
                              ) : rule.payment_method === 'transfer' ? (
                                <Text style={styles.tagCardText}>🏦 銀行自動轉帳</Text>
                              ) : null}
                            </View>
                          </View>

                          {/* 金額顯示 */}
                          <View style={styles.cardAmountContainer}>
                            {isFixed ? (
                              <>
                                <Text style={styles.fixedAmountText}>
                                  ${rule.default_amount.toLocaleString()}
                                </Text>
                                <Text style={styles.amountSubText}>固定金額</Text>
                              </>
                            ) : (
                              <>
                                <Text style={styles.variableAmountTag}>浮動金額</Text>
                                {rule.default_amount > 0 && (
                                  <Text style={styles.variableEstimateText}>
                                    預估 ${rule.default_amount.toLocaleString()}
                                  </Text>
                                )}
                              </>
                            )}
                          </View>
                        </View>

                        {/* 動作按鈕列 */}
                        <View style={styles.cardActionRow}>
                          <TouchableOpacity
                            style={styles.skipButton}
                            onPress={() => handleSkipBill(rule)}
                          >
                            <Text style={styles.skipButtonText}>略過本期</Text>
                          </TouchableOpacity>

                          {isFixed ? (
                            <TouchableOpacity
                              style={styles.recordPrimaryButton}
                              onPress={() => handleQuickRecordFixed(rule)}
                            >
                              <Text style={styles.recordPrimaryButtonText}>
                                ✅ 確認記帳 (NT$ {rule.default_amount.toLocaleString()})
                              </Text>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity
                              style={styles.recordVariableButton}
                              onPress={() => handleOpenAmountModal(rule)}
                            >
                              <Text style={styles.recordVariableButtonText}>
                                ⚡ 輸入金額並入帳
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}

                {/* 本期已入帳/略過清單 */}
                {settledBills.length > 0 && (
                  <View style={styles.settledSection}>
                    <View style={styles.sectionHeaderRow}>
                      <Text style={styles.settledSectionTitle}>
                        ✅ 本期已完成記帳 / 已略過 ({settledBills.length})
                      </Text>
                    </View>

                    {settledBills.map(rule => {
                      const cat = getCategoryById(rule.category_id);
                      return (
                        <View key={rule.id} style={styles.settledCard}>
                          <Text style={styles.settledIcon}>{getCategoryIcon(cat?.icon)}</Text>
                          <View style={styles.settledInfo}>
                            <Text style={styles.settledName}>{rule.name}</Text>
                            <Text style={styles.settledFreq}>{getFrequencyBadgeText(rule)}</Text>
                          </View>
                          <View style={styles.settledBadge}>
                            <Text style={styles.settledBadgeText}>已完成</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}

                <View style={{ height: 32 }} />
              </ScrollView>
            </View>
          )}

          {/* Tab 2: 規則設定 */}
          {activeTab === 'rules' && (
            <View style={styles.tabContent}>
              {/* 工具列 */}
              <View style={styles.rulesActionToolbar}>
                <TouchableOpacity
                  style={styles.addCustomRuleButton}
                  onPress={() => handleOpenRuleModal()}
                >
                  <Text style={styles.addCustomRuleButtonText}>+ 新增規則</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.importPresetButton}
                  onPress={() => setPresetModalVisible(true)}
                >
                  <Text style={styles.importPresetButtonText}>📋 常用範本</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                {recurringRules.length === 0 ? (
                  <View style={styles.emptyStateBox}>
                    <Text style={styles.emptyStateIcon}>💡</Text>
                    <Text style={styles.emptyStateTitle}>尚未設定週期扣款規則</Text>
                    <Text style={styles.emptyStateSubtitle}>
                      設定水費、電費、手機費或房租管理費，每月到期自動產生待繳核對清單！
                    </Text>
                    <TouchableOpacity
                      style={styles.addRuleQuickButton}
                      onPress={() => setPresetModalVisible(true)}
                    >
                      <Text style={styles.addRuleQuickButtonText}>📋 一鍵導入常用範本</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  recurringRules.map(rule => {
                    const cat = getCategoryById(rule.category_id);
                    const payer = getMemberById(rule.paid_by);
                    const card = rule.account_id ? getAccountById(rule.account_id) : undefined;
                    const isFixed = rule.amount_type === 'fixed';

                    return (
                      <View
                        key={rule.id}
                        style={[styles.ruleCard, !rule.is_active && styles.ruleCardInactive]}
                      >
                        <View style={styles.ruleCardTopRow}>
                          <View style={styles.ruleCardHeaderLeft}>
                            <Text style={styles.ruleIcon}>{getCategoryIcon(cat?.icon)}</Text>
                            <View>
                              <Text style={styles.ruleNameText}>{rule.name}</Text>
                              <Text style={styles.ruleFrequencyText}>
                                {getFrequencyBadgeText(rule)}
                              </Text>
                            </View>
                          </View>

                          {/* 啟用開關 */}
                          <View style={styles.ruleSwitchContainer}>
                            <Text style={styles.ruleSwitchLabel}>
                              {rule.is_active ? '啟用中' : '已停用'}
                            </Text>
                            <Switch
                              value={rule.is_active}
                              onValueChange={val => {
                                updateRecurringRule(rule.id, { is_active: val });
                              }}
                              trackColor={{ false: '#E5E7EB', true: '#93C5FD' }}
                              thumbColor={rule.is_active ? '#2563EB' : '#9CA3AF'}
                            />
                          </View>
                        </View>

                        {/* 規則屬性細節 */}
                        <View style={styles.ruleDetailsGrid}>
                          <View style={styles.ruleDetailItem}>
                            <Text style={styles.ruleDetailLabel}>金額模式：</Text>
                            <Text style={styles.ruleDetailValue}>
                              {isFixed ? `固定 NT$ ${rule.default_amount.toLocaleString()}` : `浮動 (參考 $${rule.default_amount.toLocaleString()})`}
                            </Text>
                          </View>

                          <View style={styles.ruleDetailItem}>
                            <Text style={styles.ruleDetailLabel}>扣繳出資人：</Text>
                            <Text style={styles.ruleDetailValue}>
                              {payer ? `${payer.avatar_url || '👤'} ${payer.display_name}` : '未指定'}
                            </Text>
                          </View>

                          <View style={styles.ruleDetailItem}>
                            <Text style={styles.ruleDetailLabel}>扣繳方式：</Text>
                            <Text style={styles.ruleDetailValue}>
                              {card ? `💳 ${card.name}` : rule.payment_method === 'transfer' ? '🏦 帳戶轉帳' : '💵 現金/其他'}
                            </Text>
                          </View>

                          {rule.frequency === 'bimonthly' && (
                            <View style={styles.ruleDetailItem}>
                              <Text style={styles.ruleDetailLabel}>出帳月份：</Text>
                              <Text style={styles.ruleDetailValue}>
                                {rule.bimonthly_start_month === 1 ? '單數月 (1, 3, 5, 7, 9, 11月)' : '雙數月 (2, 4, 6, 8, 10, 12月)'}
                              </Text>
                            </View>
                          )}
                        </View>

                        {/* 底部按鈕 */}
                        <View style={styles.ruleCardButtonsRow}>
                          <TouchableOpacity
                            style={styles.ruleEditBtn}
                            onPress={() => handleOpenRuleModal(rule)}
                          >
                            <Text style={styles.ruleEditBtnText}>✏️ 編輯設定</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.ruleDeleteBtn}
                            onPress={() => handleDeleteRule(rule)}
                          >
                            <Text style={styles.ruleDeleteBtnText}>🗑️ 刪除</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}

                <View style={{ height: 32 }} />
              </ScrollView>
            </View>
          )}

          {/* 浮動金額填寫入帳 Modal */}
          <Modal
            visible={amountModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setAmountModalVisible(false)}
          >
            <View style={styles.subModalOverlay}>
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.subModalContainer}
              >
                <View style={styles.subModalHeader}>
                  <Text style={styles.subModalTitle}>
                    ⚡ 填寫當期帳單金額
                  </Text>
                  <TouchableOpacity onPress={() => setAmountModalVisible(false)}>
                    <Text style={styles.subModalClose}>✕</Text>
                  </TouchableOpacity>
                </View>

                {targetRuleForAmount && (
                  <ScrollView style={{ maxHeight: SCREEN_HEIGHT * 0.65 }}>
                    <Text style={styles.targetRuleName}>{targetRuleForAmount.name}</Text>
                    <Text style={styles.targetRulePeriod}>
                      帳單期別：{getBillPeriodLabel(targetRuleForAmount, selectedDate)}
                    </Text>

                    {/* 金額輸入 */}
                    <Text style={styles.formFieldLabel}>
                      當期應繳金額 (NT$) <Text style={{ color: '#EF4444' }}>*</Text>
                    </Text>
                    <View style={styles.amountInputRow}>
                      <Text style={styles.amountPrefix}>NT$</Text>
                      <TextInput
                        style={styles.amountTextInput}
                        keyboardType="numeric"
                        placeholder="請輸入本次帳單金額"
                        placeholderTextColor="#9CA3AF"
                        value={inputAmount}
                        onChangeText={setInputAmount}
                        autoFocus
                      />
                    </View>

                    {/* 備註說明 */}
                    <Text style={styles.formFieldLabel}>記帳備註說明</Text>
                    <TextInput
                      style={styles.noteTextInput}
                      placeholder="例如：[台電] 2026年 9~10月期"
                      placeholderTextColor="#9CA3AF"
                      value={inputNote}
                      onChangeText={setInputNote}
                    />

                    {/* 出資人選擇 */}
                    <Text style={styles.formFieldLabel}>出資付款人</Text>
                    <View style={styles.memberChipsRow}>
                      {members.map(m => {
                        const isSelected = inputPaidBy === m.id;
                        return (
                          <TouchableOpacity
                            key={m.id}
                            style={[styles.memberChip, isSelected && styles.memberChipActive]}
                            onPress={() => setInputPaidBy(m.id)}
                          >
                            <Text style={styles.memberChipEmoji}>{m.avatar_url || '👤'}</Text>
                            <Text style={[styles.memberChipText, isSelected && styles.memberChipTextActive]}>
                              {m.display_name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* 按鈕列 */}
                    <View style={styles.subModalButtonsRow}>
                      <TouchableOpacity
                        style={styles.subModalCancelBtn}
                        onPress={() => setAmountModalVisible(false)}
                      >
                        <Text style={styles.subModalCancelText}>取消</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.subModalConfirmBtn}
                        onPress={handleConfirmAmountAndRecord}
                      >
                        <Text style={styles.subModalConfirmText}>✅ 確認記帳</Text>
                      </TouchableOpacity>
                    </View>
                  </ScrollView>
                )}
              </KeyboardAvoidingView>
            </View>
          </Modal>

          {/* 新增/編輯規則 Modal */}
          <Modal
            visible={ruleModalVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setRuleModalVisible(false)}
          >
            <View style={styles.subModalOverlay}>
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={[styles.subModalContainer, { maxHeight: SCREEN_HEIGHT * 0.85 }]}
              >
                <View style={styles.subModalHeader}>
                  <Text style={styles.subModalTitle}>
                    {editingRule ? '✏️ 編輯週期規則' : '➕ 新增週期扣款規則'}
                  </Text>
                  <TouchableOpacity onPress={() => setRuleModalVisible(false)}>
                    <Text style={styles.subModalClose}>✕</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
                  {/* 規則名稱 */}
                  <Text style={styles.formFieldLabel}>
                    項目名稱 <Text style={{ color: '#EF4444' }}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.formTextInput}
                    placeholder="例如：台電電費、自來水費、手機月租"
                    placeholderTextColor="#9CA3AF"
                    value={formName}
                    onChangeText={setFormName}
                  />

                  {/* 收費對象/店家 */}
                  <Text style={styles.formFieldLabel}>付款機構/店家 (選填)</Text>
                  <TextInput
                    style={styles.formTextInput}
                    placeholder="例如：台灣電力公司、中華電信"
                    placeholderTextColor="#9CA3AF"
                    value={formMerchant}
                    onChangeText={setFormMerchant}
                  />

                  {/* 分類選擇 */}
                  <Text style={styles.formFieldLabel}>記帳支出分類</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catChipsScroll}>
                    {categories
                      .filter(c => c.type === 'expense')
                      .map(c => {
                        const isSelected = formCategoryId === c.id;
                        return (
                          <TouchableOpacity
                            key={c.id}
                            style={[styles.catChip, isSelected && styles.catChipActive]}
                            onPress={() => setFormCategoryId(c.id)}
                          >
                            <Text style={styles.catChipIcon}>{getCategoryIcon(c.icon)}</Text>
                            <Text style={[styles.catChipText, isSelected && styles.catChipTextActive]}>
                              {c.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                  </ScrollView>

                  {/* 金額模式選擇 */}
                  <Text style={styles.formFieldLabel}>金額類型</Text>
                  <View style={styles.toggleRow}>
                    <TouchableOpacity
                      style={[styles.toggleBtn, formAmountType === 'variable' && styles.toggleBtnActive]}
                      onPress={() => setFormAmountType('variable')}
                    >
                      <Text style={[styles.toggleBtnText, formAmountType === 'variable' && styles.toggleBtnTextActive]}>
                        ⚡ 浮動金額 (水電瓦斯)
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.toggleBtn, formAmountType === 'fixed' && styles.toggleBtnActive]}
                      onPress={() => setFormAmountType('fixed')}
                    >
                      <Text style={[styles.toggleBtnText, formAmountType === 'fixed' && styles.toggleBtnTextActive]}>
                        📌 固定金額 (通訊/管理費)
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* 金額輸入 */}
                  <Text style={styles.formFieldLabel}>
                    {formAmountType === 'fixed' ? '固定扣繳金額 (NT$)' : '預估參考金額 (NT$) (選填)'}
                  </Text>
                  <TextInput
                    style={styles.formTextInput}
                    keyboardType="numeric"
                    placeholder={formAmountType === 'fixed' ? '例如：599、2200' : '例如：1800 (僅供參考)'}
                    placeholderTextColor="#9CA3AF"
                    value={formDefaultAmount}
                    onChangeText={setFormDefaultAmount}
                  />

                  {/* 扣款週期頻率 */}
                  <Text style={styles.formFieldLabel}>扣繳週期頻率</Text>
                  <View style={styles.freqOptionsRow}>
                    <TouchableOpacity
                      style={[styles.freqOption, formFrequency === 'monthly' && styles.freqOptionActive]}
                      onPress={() => setFormFrequency('monthly')}
                    >
                      <Text style={[styles.freqOptionText, formFrequency === 'monthly' && styles.freqOptionTextActive]}>
                        每月繳
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.freqOption, formFrequency === 'bimonthly' && styles.freqOptionActive]}
                      onPress={() => setFormFrequency('bimonthly')}
                    >
                      <Text style={[styles.freqOptionText, formFrequency === 'bimonthly' && styles.freqOptionTextActive]}>
                        雙月繳
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.freqOption, formFrequency === 'quarterly' && styles.freqOptionActive]}
                      onPress={() => setFormFrequency('quarterly')}
                    >
                      <Text style={[styles.freqOptionText, formFrequency === 'quarterly' && styles.freqOptionTextActive]}>
                        每季繳
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.freqOption, formFrequency === 'yearly' && styles.freqOptionActive]}
                      onPress={() => setFormFrequency('yearly')}
                    >
                      <Text style={[styles.freqOptionText, formFrequency === 'yearly' && styles.freqOptionTextActive]}>
                        每年繳
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* 雙月繳之出帳月份設定 (用戶特定需求) */}
                  {formFrequency === 'bimonthly' && (
                    <View style={styles.bimonthlyBox}>
                      <Text style={styles.bimonthlyTitle}>📆 雙月出帳月份設定 (台灣水電瓦斯專屬)</Text>
                      <Text style={styles.bimonthlyDesc}>
                        請依您家帳單通知單上的出帳月份設定，當月才會跳出待繳提醒：
                      </Text>

                      <View style={styles.bimonthlyToggleRow}>
                        <TouchableOpacity
                          style={[styles.bimonthlyBtn, formBimonthlyStartMonth === 1 && styles.bimonthlyBtnActive]}
                          onPress={() => setFormBimonthlyStartMonth(1)}
                        >
                          <Text style={[styles.bimonthlyBtnText, formBimonthlyStartMonth === 1 && styles.bimonthlyBtnTextActive]}>
                            單數月出帳 (1, 3, 5, 7, 9, 11月)
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.bimonthlyBtn, formBimonthlyStartMonth === 2 && styles.bimonthlyBtnActive]}
                          onPress={() => setFormBimonthlyStartMonth(2)}
                        >
                          <Text style={[styles.bimonthlyBtnText, formBimonthlyStartMonth === 2 && styles.bimonthlyBtnTextActive]}>
                            雙數月出帳 (2, 4, 6, 8, 10, 12月)
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* 扣款日/帳單日 (1~31) */}
                  <Text style={styles.formFieldLabel}>每月扣款 / 帳單截止日 (1~31 號)</Text>
                  <View style={styles.daySelectorRow}>
                    <TouchableOpacity
                      style={styles.dayAdjustBtn}
                      onPress={() => setFormDueDay(prev => Math.max(1, prev - 1))}
                    >
                      <Text style={styles.dayAdjustBtnText}>-</Text>
                    </TouchableOpacity>
                    <View style={styles.dayDisplayBox}>
                      <Text style={styles.dayDisplayText}>{formDueDay} 號</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.dayAdjustBtn}
                      onPress={() => setFormDueDay(prev => Math.min(31, prev + 1))}
                    >
                      <Text style={styles.dayAdjustBtnText}>+</Text>
                    </TouchableOpacity>

                    {/* 常用日快捷 */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginLeft: 8 }}>
                      {[5, 10, 15, 20, 25].map(day => (
                        <TouchableOpacity
                          key={day}
                          style={[styles.dayQuickChip, formDueDay === day && styles.dayQuickChipActive]}
                          onPress={() => setFormDueDay(day)}
                        >
                          <Text style={[styles.dayQuickChipText, formDueDay === day && styles.dayQuickChipTextActive]}>
                            {day}號
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>

                  {/* 預設付款人 */}
                  <Text style={styles.formFieldLabel}>預設出資人</Text>
                  <View style={styles.memberChipsRow}>
                    {members.map(m => {
                      const isSelected = formPaidBy === m.id;
                      return (
                        <TouchableOpacity
                          key={m.id}
                          style={[styles.memberChip, isSelected && styles.memberChipActive]}
                          onPress={() => setFormPaidBy(m.id)}
                        >
                          <Text style={styles.memberChipEmoji}>{m.avatar_url || '👤'}</Text>
                          <Text style={[styles.memberChipText, isSelected && styles.memberChipTextActive]}>
                            {m.display_name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* 付款方式 */}
                  <Text style={styles.formFieldLabel}>扣繳付款方式</Text>
                  <View style={styles.methodToggleRow}>
                    <TouchableOpacity
                      style={[styles.methodToggleBtn, formPaymentMethod === 'credit_card' && styles.methodToggleBtnActive]}
                      onPress={() => setFormPaymentMethod('credit_card')}
                    >
                      <Text style={[styles.methodToggleBtnText, formPaymentMethod === 'credit_card' && styles.methodToggleBtnTextActive]}>
                        💳 信用卡扣繳
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.methodToggleBtn, formPaymentMethod === 'transfer' && styles.methodToggleBtnActive]}
                      onPress={() => setFormPaymentMethod('transfer')}
                    >
                      <Text style={[styles.methodToggleBtnText, formPaymentMethod === 'transfer' && styles.methodToggleBtnTextActive]}>
                        🏦 帳戶轉帳
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.methodToggleBtn, formPaymentMethod === 'cash' && styles.methodToggleBtnActive]}
                      onPress={() => setFormPaymentMethod('cash')}
                    >
                      <Text style={[styles.methodToggleBtnText, formPaymentMethod === 'cash' && styles.methodToggleBtnTextActive]}>
                        💵 超商/現金
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* 若選擇信用卡，提供卡片選擇 */}
                  {formPaymentMethod === 'credit_card' && (
                    <View style={styles.cardPickerContainer}>
                      <Text style={styles.formFieldLabel}>選擇自動扣繳信用卡</Text>
                      {paymentAccounts.filter(a => a.type === 'credit_card').length === 0 ? (
                        <Text style={styles.noCardHint}>
                          (尚未新增信用卡，入帳時將以一般信用卡記錄)
                        </Text>
                      ) : (
                        <View style={styles.cardChipsWrap}>
                          {paymentAccounts
                            .filter(a => a.type === 'credit_card')
                            .map(c => {
                              const isSelected = formAccountId === c.id;
                              return (
                                <TouchableOpacity
                                  key={c.id}
                                  style={[styles.cardChip, isSelected && styles.cardChipActive]}
                                  onPress={() => setFormAccountId(c.id)}
                                >
                                  <Text style={styles.cardChipText}>
                                    💳 {c.name} {c.last_four_digits ? `(•${c.last_four_digits})` : ''}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                        </View>
                      )}
                    </View>
                  )}

                  {/* 啟用開關 */}
                  <View style={styles.formSwitchRow}>
                    <Text style={styles.formSwitchLabel}>啟用此規則提醒</Text>
                    <Switch
                      value={formIsActive}
                      onValueChange={setFormIsActive}
                      trackColor={{ false: '#E5E7EB', true: '#93C5FD' }}
                      thumbColor={formIsActive ? '#2563EB' : '#9CA3AF'}
                    />
                  </View>

                  {/* 儲存/取消按鈕 */}
                  <View style={styles.subModalButtonsRow}>
                    <TouchableOpacity
                      style={styles.subModalCancelBtn}
                      onPress={() => setRuleModalVisible(false)}
                    >
                      <Text style={styles.subModalCancelText}>取消</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.subModalConfirmBtn}
                      onPress={handleSaveRule}
                    >
                      <Text style={styles.subModalConfirmText}>💾 儲存規則</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </KeyboardAvoidingView>
            </View>
          </Modal>

          {/* 常用範本快速導入 Modal */}
          <Modal
            visible={presetModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setPresetModalVisible(false)}
          >
            <View style={styles.subModalOverlay}>
              <View style={[styles.subModalContainer, { maxHeight: SCREEN_HEIGHT * 0.75 }]}>
                <View style={styles.subModalHeader}>
                  <Text style={styles.subModalTitle}>📋 常用週期扣款範本</Text>
                  <TouchableOpacity onPress={() => setPresetModalVisible(false)}>
                    <Text style={styles.subModalClose}>✕</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={styles.presetIntroText}>
                    點選範本即可快速代入設定，並支援自訂金額、出資人與卡片：
                  </Text>

                  {DEFAULT_RECURRING_PRESETS.map((preset, index) => {
                    const isBimonthly = preset.frequency === 'bimonthly';
                    const freqText = isBimonthly
                      ? (preset as any).bimonthly_start_month === 1
                        ? '雙月繳 (單數月出帳)'
                        : '雙月繳 (雙數月出帳)'
                      : '每月繳';

                    return (
                      <TouchableOpacity
                        key={index}
                        style={styles.presetItemCard}
                        onPress={() => handleApplyPreset(preset)}
                      >
                        <View style={styles.presetItemLeft}>
                          <Text style={styles.presetItemName}>{preset.name}</Text>
                          <Text style={styles.presetItemSub}>
                            {freqText} • {preset.due_day} 號扣款 • {preset.amount_type === 'fixed' ? `固定 $${preset.default_amount}` : `浮動 (預估 $${preset.default_amount})`}
                          </Text>
                        </View>
                        <View style={styles.presetApplyBtn}>
                          <Text style={styles.presetApplyBtnText}>+ 代入</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          </Modal>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.92,
    minHeight: SCREEN_HEIGHT * 0.6,
    flex: 1,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 12,
    gap: 12,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
  },
  tabItemActive: {
    backgroundColor: '#2563EB',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  tabBadge: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 6,
  },
  tabBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  tabContent: {
    flex: 1,
    paddingHorizontal: 16,
  },
  monthSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  monthNavButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  monthNavText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
  },
  currentMonthBadge: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
  },
  currentMonthText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E40AF',
  },
  scrollView: {
    flex: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  sectionHint: {
    fontSize: 12,
    color: '#64748B',
  },
  emptyStateBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyStateIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  emptyStateSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  addRuleQuickButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  addRuleQuickButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  billCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  dueBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  dueBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  periodLabelText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  cardMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  catIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  catIconEmoji: {
    fontSize: 22,
  },
  cardInfoContainer: {
    flex: 1,
  },
  billNameText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagFreqText: {
    fontSize: 11,
    color: '#475569',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagMemberText: {
    fontSize: 11,
    color: '#475569',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagCardText: {
    fontSize: 11,
    color: '#1D4ED8',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  cardAmountContainer: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  fixedAmountText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#DC2626',
  },
  amountSubText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  variableAmountTag: {
    fontSize: 13,
    fontWeight: '700',
    color: '#D97706',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  variableEstimateText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  cardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
  },
  skipButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  skipButtonText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  recordPrimaryButton: {
    flex: 1,
    backgroundColor: '#10B981',
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  recordPrimaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  recordVariableButton: {
    flex: 1,
    backgroundColor: '#2563EB',
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  recordVariableButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  settledSection: {
    marginTop: 16,
  },
  settledSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  settledCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  settledIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  settledInfo: {
    flex: 1,
  },
  settledName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  settledFreq: {
    fontSize: 11,
    color: '#94A3B8',
  },
  settledBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  settledBadgeText: {
    fontSize: 11,
    color: '#15803D',
    fontWeight: '600',
  },
  // 規則管理樣式
  rulesActionToolbar: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  addCustomRuleButton: {
    flex: 1,
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  addCustomRuleButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  importPresetButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
  },
  importPresetButtonText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '600',
  },
  ruleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  ruleCardInactive: {
    opacity: 0.6,
    backgroundColor: '#F8FAFC',
  },
  ruleCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  ruleCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ruleIcon: {
    fontSize: 24,
  },
  ruleNameText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  ruleFrequencyText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  ruleSwitchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ruleSwitchLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  ruleDetailsGrid: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    gap: 6,
  },
  ruleDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ruleDetailLabel: {
    fontSize: 12,
    color: '#64748B',
    width: 80,
  },
  ruleDetailValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
  },
  ruleCardButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  ruleEditBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
  },
  ruleEditBtnText: {
    fontSize: 12,
    color: '#2563EB',
    fontWeight: '600',
  },
  ruleDeleteBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
  },
  ruleDeleteBtnText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
  },
  // Sub Modal
  subModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  subModalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    maxHeight: SCREEN_HEIGHT * 0.8,
  },
  subModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  subModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  subModalClose: {
    fontSize: 18,
    color: '#64748B',
    fontWeight: '700',
    padding: 4,
  },
  targetRuleName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  targetRulePeriod: {
    fontSize: 13,
    color: '#2563EB',
    fontWeight: '600',
    marginBottom: 14,
  },
  formFieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
    marginTop: 10,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#3B82F6',
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: '#EFF6FF',
  },
  amountPrefix: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1D4ED8',
    marginRight: 8,
  },
  amountTextInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
    paddingVertical: 10,
  },
  noteTextInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
    color: '#1E293B',
  },
  formTextInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
    color: '#1E293B',
  },
  memberChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  memberChipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  memberChipEmoji: {
    fontSize: 14,
    marginRight: 6,
  },
  memberChipText: {
    fontSize: 13,
    color: '#475569',
  },
  memberChipTextActive: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  subModalButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  subModalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  subModalCancelText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
  subModalConfirmBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
  },
  subModalConfirmText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  catChipsScroll: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  catChipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  catChipIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  catChipText: {
    fontSize: 13,
    color: '#475569',
  },
  catChipTextActive: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  toggleBtnActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  toggleBtnText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  toggleBtnTextActive: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  freqOptionsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  freqOption: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  freqOptionActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  freqOptionText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  freqOptionTextActive: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  bimonthlyBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  bimonthlyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
    marginBottom: 4,
  },
  bimonthlyDesc: {
    fontSize: 11,
    color: '#15803D',
    lineHeight: 16,
    marginBottom: 8,
  },
  bimonthlyToggleRow: {
    flexDirection: 'column',
    gap: 6,
  },
  bimonthlyBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  bimonthlyBtnActive: {
    backgroundColor: '#16A34A',
    borderColor: '#15803D',
  },
  bimonthlyBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#166534',
    textAlign: 'center',
  },
  bimonthlyBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  daySelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dayAdjustBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  dayAdjustBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#334155',
  },
  dayDisplayBox: {
    paddingHorizontal: 14,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    marginHorizontal: 4,
  },
  dayDisplayText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  dayQuickChip: {
    paddingHorizontal: 8,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  dayQuickChipActive: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  dayQuickChipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  dayQuickChipTextActive: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  methodToggleRow: {
    flexDirection: 'row',
    gap: 6,
  },
  methodToggleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  methodToggleBtnActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  methodToggleBtnText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  methodToggleBtnTextActive: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  cardPickerContainer: {
    marginTop: 8,
  },
  noCardHint: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  cardChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  cardChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  cardChipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  cardChipText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  formSwitchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingVertical: 4,
  },
  formSwitchLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  presetIntroText: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 12,
    lineHeight: 18,
  },
  presetItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetItemLeft: {
    flex: 1,
  },
  presetItemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 2,
  },
  presetItemSub: {
    fontSize: 11,
    color: '#64748B',
  },
  presetApplyBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginLeft: 10,
  },
  presetApplyBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
