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
const MEMBER_PRESET_AMOUNTS = [5000, 10000, 15000, 20000];

export interface BudgetManageModalProps {
  visible: boolean;
  onClose: () => void;
  initialTab?: 'family' | 'members';
}

export const BudgetManageModal: React.FC<BudgetManageModalProps> = ({
  visible,
  onClose,
  initialTab = 'family',
}) => {
  const {
    currentBudget,
    updateBudget,
    categories,
    members,
    currentUser,
    isOwner,
    isBudgetWidgetVisibleOnDevice,
    setBudgetWidgetVisibleOnDevice,
  } = useLedger();

  const { isDark, colors } = useTheme();
  const styles = useMemo(() => getStyles(isDark, colors), [isDark, colors]);

  const [activeTab, setActiveTab] = useState<'family' | 'members'>('family');
  const [deviceVisible, setDeviceVisible] = useState<boolean>(true);

  // 家庭預算狀態
  const [isEnabled, setIsEnabled] = useState<boolean>(true);
  const [monthlyTotal, setMonthlyTotal] = useState<string>('40000');
  const [alertThreshold, setAlertThreshold] = useState<number>(80);
  const [categoryBudgets, setCategoryBudgets] = useState<Record<string, string>>({});
  const [showCategorySettings, setShowCategorySettings] = useState<boolean>(false);

  // 成員個人預算狀態
  const [memberBudgets, setMemberBudgets] = useState<Record<string, string>>({});

  // 僅列出支出分類供設定分類預算
  const expenseCategories = useMemo(
    () => categories.filter(c => c.type === 'expense').sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [categories]
  );

  useEffect(() => {
    if (visible) {
      setActiveTab(initialTab);
      setDeviceVisible(isBudgetWidgetVisibleOnDevice);

      if (currentBudget) {
        setIsEnabled(currentBudget.is_enabled ?? true);
        setMonthlyTotal(currentBudget.monthly_total ? String(currentBudget.monthly_total) : '40000');
        setAlertThreshold(currentBudget.alert_threshold ?? 80);

        const mappedCats: Record<string, string> = {};
        if (currentBudget.category_budgets) {
          Object.entries(currentBudget.category_budgets).forEach(([catId, amt]) => {
            if (amt) mappedCats[catId] = String(amt);
          });
        }
        setCategoryBudgets(mappedCats);

        const mappedMems: Record<string, string> = {};
        if (currentBudget.member_budgets) {
          Object.entries(currentBudget.member_budgets).forEach(([mId, amt]) => {
            if (amt !== undefined && amt > 0) mappedMems[mId] = String(amt);
          });
        }
        setMemberBudgets(mappedMems);
      } else {
        setIsEnabled(true);
        setMonthlyTotal('40000');
        setAlertThreshold(80);
        setCategoryBudgets({});
        setMemberBudgets({});
      }
    }
  }, [visible, currentBudget, initialTab, isBudgetWidgetVisibleOnDevice]);

  // 計算分類預算合計
  const totalCategoryBudget = useMemo(() => {
    return Object.values(categoryBudgets).reduce((acc, str) => {
      const n = parseFloat(str);
      return acc + (isNaN(n) ? 0 : n);
    }, 0);
  }, [categoryBudgets]);

  // 計算成員個別預算合計
  const totalMemberBudget = useMemo(() => {
    return Object.values(memberBudgets).reduce((acc, str) => {
      const n = parseFloat(str);
      return acc + (isNaN(n) ? 0 : n);
    }, 0);
  }, [memberBudgets]);

  const parsedTotal = parseFloat(monthlyTotal) || 0;
  const isCategoryOverTotal = parsedTotal > 0 && totalCategoryBudget > parsedTotal;

  // 判斷是否為當前本機成員
  const isLocalMember = (member: { id: string; display_name?: string }) => {
    if (!currentUser) return false;
    if (member.id === currentUser.id) return true;
    if (
      member.display_name &&
      currentUser.display_name &&
      member.display_name.trim().toLowerCase() === currentUser.display_name.trim().toLowerCase()
    ) {
      return true;
    }
    return false;
  };

  const handleSave = async () => {
    // 1. 公帳預算：僅管理員可異動
    const numericCatBudgets: Record<string, number> = isOwner
      ? {}
      : { ...(currentBudget?.category_budgets ?? {}) };

    if (isOwner) {
      Object.entries(categoryBudgets).forEach(([catId, val]) => {
        const num = parseFloat(val);
        if (!isNaN(num) && num > 0) {
          numericCatBudgets[catId] = num;
        }
      });
    }

    // 2. 成員個人額度：本機成員僅能自訂更新屬於自己的額度，其餘成員維持原值
    const numericMemberBudgets: Record<string, number> = {
      ...(currentBudget?.member_budgets ?? {}),
    };

    members.forEach(member => {
      const isMe = isLocalMember(member);
      if (isMe) {
        const val = memberBudgets[member.id];
        const num = parseFloat(val);
        if (!isNaN(num) && num > 0) {
          numericMemberBudgets[member.id] = num;
        } else {
          delete numericMemberBudgets[member.id];
        }
      }
    });

    const finalIsEnabled = isOwner ? isEnabled : (currentBudget?.is_enabled ?? true);
    const finalMonthlyTotal = isOwner ? parsedTotal : (currentBudget?.monthly_total ?? 40000);
    const finalAlertThreshold = isOwner ? alertThreshold : (currentBudget?.alert_threshold ?? 80);

    await updateBudget({
      is_enabled: finalIsEnabled,
      monthly_total: finalMonthlyTotal,
      alert_threshold: finalAlertThreshold,
      category_budgets: numericCatBudgets,
      member_budgets: numericMemberBudgets,
    });

    await setBudgetWidgetVisibleOnDevice(deviceVisible);
    onClose();
  };

  const updateCategoryAmount = (catId: string, val: string) => {
    if (!isOwner) return;
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

  const updateMemberAmount = (memberId: string, val: string) => {
    const targetMember = members.find(m => m.id === memberId);
    if (!targetMember || !isLocalMember(targetMember)) {
      return;
    }
    setMemberBudgets(prev => {
      const next = { ...prev };
      if (!val || val.trim() === '') {
        delete next[memberId];
      } else {
        next[memberId] = val.replace(/[^0-9]/g, '');
      }
      return next;
    });
  };

  const configuredMemberCount = Object.keys(memberBudgets).filter(k => Boolean(memberBudgets[k])).length;

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
              <Text style={styles.title}>🎯 預算控管與額度設定</Text>
              <Text style={styles.subtitle}>支援家庭公帳與成員個人雙重視角，自主掌控開銷</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 分頁切換鈕 */}
          <View style={styles.tabsRow}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'family' && styles.tabBtnActive]}
              onPress={() => setActiveTab('family')}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabBtnText, activeTab === 'family' && styles.tabBtnTextActive]}>
                🏠 家庭公帳總預算
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'members' && styles.tabBtnActive]}
              onPress={() => setActiveTab('members')}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabBtnText, activeTab === 'members' && styles.tabBtnTextActive]}>
                👤 成員個人額度{configuredMemberCount > 0 ? ` (${configuredMemberCount})` : ''}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* 📱 本機顯隱偏好（想看的人看，不想看的人關） */}
            <View style={styles.devicePrefCard}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <View style={styles.devicePrefTitleRow}>
                  <Text style={styles.devicePrefIcon}>📱</Text>
                  <Text style={styles.devicePrefTitle}>在此手機首頁顯示預算卡片</Text>
                </View>
                <Text style={styles.devicePrefDesc}>
                  僅影響您個人此裝置的畫面呈現。關閉後不影響其他家人檢視與預算數據同步。
                </Text>
              </View>
              <Switch
                value={deviceVisible}
                onValueChange={setDeviceVisible}
                trackColor={{ false: '#CBD5E1', true: '#10B981' }}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* TAB 1: 家庭公帳總預算 */}
            {activeTab === 'family' && (
              <>
                {!isOwner && (
                  <View style={styles.readOnlyBanner}>
                    <Text style={styles.readOnlyBannerIcon}>🔒</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.readOnlyBannerTitle}>僅帳本管理員可修改家庭公帳總預算</Text>
                      <Text style={styles.readOnlyBannerDesc}>
                        您目前為日常成員檢視模式，可瀏覽公帳月預算與分類額度，如需調整請由帳本管理員設定。
                      </Text>
                    </View>
                  </View>
                )}

                {/* 啟用開關卡片 */}
                <View style={styles.switchRow}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.switchLabel}>開啟公帳預算控管</Text>
                    <Text style={styles.switchDesc}>
                      啟用後將為全家計算本月支出進度、日均可用額度與超支警戒
                    </Text>
                  </View>
                  <Switch
                    value={isEnabled}
                    onValueChange={isOwner ? setIsEnabled : undefined}
                    disabled={!isOwner}
                    trackColor={{ false: '#CBD5E1', true: '#4F46E5' }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                {isEnabled && (
                  <>
                    {/* 月度總預算設定 */}
                    <View style={styles.sectionCard}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <Text style={styles.sectionTitle}>💰 每月家庭公帳總預算 (TWD)</Text>
                        {!isOwner && (
                          <View style={styles.lockBadge}>
                            <Text style={styles.lockBadgeText}>🔒 唯讀</Text>
                          </View>
                        )}
                      </View>
                      <View style={[styles.inputContainer, !isOwner && styles.inputContainerDisabled]}>
                        <Text style={styles.currencyPrefix}>NT$</Text>
                        <TextInput
                          style={[styles.amountInput, !isOwner && styles.amountInputDisabled]}
                          keyboardType="numeric"
                          value={monthlyTotal}
                          editable={isOwner}
                          onChangeText={val => setMonthlyTotal(val.replace(/[^0-9]/g, ''))}
                          placeholder="例如：40000"
                          placeholderTextColor={colors.text.muted}
                        />
                      </View>

                      {/* 快速金額選擇膠囊 */}
                      {isOwner && (
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
                      )}
                    </View>

                    {/* 預警警戒門檻 */}
                    <View style={styles.sectionCard}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <Text style={styles.sectionTitle}>⚠️ 警戒提醒門檻 (達標比例亮起提醒)</Text>
                        {!isOwner && (
                          <View style={styles.lockBadge}>
                            <Text style={styles.lockBadgeText}>🔒 唯讀</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.thresholdRow}>
                        {PRESET_THRESHOLDS.map(pct => {
                          const isSelected = alertThreshold === pct;
                          return (
                            <TouchableOpacity
                              key={pct}
                              style={[
                                styles.thresholdChip,
                                isSelected && styles.thresholdChipActive,
                                !isOwner && !isSelected && { opacity: 0.5 },
                              ]}
                              onPress={() => isOwner && setAlertThreshold(pct)}
                              disabled={!isOwner}
                              activeOpacity={isOwner ? 0.7 : 1}
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
                                <View style={[styles.catInputWrap, !isOwner && styles.catInputWrapDisabled]}>
                                  <Text style={styles.catInputPrefix}>NT$</Text>
                                  <TextInput
                                    style={[styles.catInput, !isOwner && styles.catInputDisabled]}
                                    keyboardType="numeric"
                                    placeholder={isOwner ? "不限" : "無"}
                                    placeholderTextColor={colors.text.muted}
                                    value={val}
                                    editable={isOwner}
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
              </>
            )}

            {/* TAB 2: 成員個人額度 */}
            {activeTab === 'members' && (
              <View style={styles.membersContainer}>
                {/* 說明提示卡片 */}
                <View style={styles.infoBanner}>
                  <Text style={styles.infoBannerIcon}>💡</Text>
                  <Text style={styles.infoBannerText}>
                    每位家庭成員僅能設定與修改屬於自己的個人每月開銷額度，其餘成員額度為唯讀檢視。當首頁上方篩選選取該成員時，看板將自動連動為其個人支出進度。
                  </Text>
                </View>

                {totalMemberBudget > 0 && (
                  <View style={styles.summaryBar}>
                    <Text style={styles.summaryBarLabel}>
                      已配置成員額度合計：
                    </Text>
                    <Text style={styles.summaryBarValue}>
                      NT$ {totalMemberBudget.toLocaleString()}
                    </Text>
                  </View>
                )}

                {/* 各成員列表 */}
                {members.map(member => {
                  const val = memberBudgets[member.id] || '';
                  const numVal = parseFloat(val) || 0;
                  const isMe = isLocalMember(member);

                  return (
                    <View key={member.id} style={styles.memberCard}>
                      <View style={styles.memberCardHeader}>
                        <View style={styles.memberInfoRow}>
                          <Text style={styles.memberAvatar}>{member.avatar_url || '👤'}</Text>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <Text style={styles.memberName}>{member.display_name}</Text>
                              {member.role === 'owner' && (
                                <View style={styles.roleTag}>
                                  <Text style={styles.roleTagText}>創建者</Text>
                                </View>
                              )}
                              {member.role === 'admin' && (
                                <View style={styles.roleTag}>
                                  <Text style={styles.roleTagText}>管理員</Text>
                                </View>
                              )}
                              {isMe ? (
                                <View style={styles.memberMyTag}>
                                  <Text style={styles.memberMyTagText}>👤 本機 (可設定)</Text>
                                </View>
                              ) : (
                                <View style={styles.lockBadge}>
                                  <Text style={styles.lockBadgeText}>🔒 唯讀</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.memberStatusText}>
                              {numVal > 0
                                ? `每月個人預算上限 NT$ ${numVal.toLocaleString()}`
                                : isMe
                                ? '未單獨限制個人額度'
                                : '未設定個人額度 (僅本人可設定)'}
                            </Text>
                          </View>
                        </View>

                        <View style={[styles.memberInputWrap, !isMe && styles.memberInputWrapDisabled]}>
                          <Text style={styles.memberInputPrefix}>NT$</Text>
                          <TextInput
                            style={[styles.memberInput, !isMe && styles.memberInputDisabled]}
                            keyboardType="numeric"
                            placeholder={isMe ? "自訂額度" : "未設定"}
                            placeholderTextColor={colors.text.muted}
                            value={val}
                            editable={isMe}
                            onChangeText={text => updateMemberAmount(member.id, text)}
                          />
                        </View>
                      </View>

                      {/* 快速金額選擇膠囊 (僅本機成員自身可操作) */}
                      {isMe && (
                        <View style={styles.memberPresetRow}>
                          {MEMBER_PRESET_AMOUNTS.map(amt => {
                            const isSelected = numVal === amt;
                            return (
                              <TouchableOpacity
                                key={amt}
                                style={[styles.memberPresetChip, isSelected && styles.memberPresetChipActive]}
                                onPress={() => updateMemberAmount(member.id, String(amt))}
                                activeOpacity={0.7}
                              >
                                <Text
                                  style={[
                                    styles.memberPresetChipText,
                                    isSelected && styles.memberPresetChipTextActive,
                                  ]}
                                >
                                  ${(amt / 1000).toFixed(0)}k
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                          {numVal > 0 && (
                            <TouchableOpacity
                              style={styles.memberClearChip}
                              onPress={() => updateMemberAmount(member.id, '')}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.memberClearChipText}>✕ 清除</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
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
    tabsRow: {
      flexDirection: 'row',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 8,
      gap: 10,
    },
    tabBtn: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: 10,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    tabBtnActive: {
      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.25)' : '#EEF2FF',
      borderColor: isDark ? '#818CF8' : '#4F46E5',
    },
    tabBtnText: {
      fontSize: 12.5,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    tabBtnTextActive: {
      color: isDark ? '#818CF8' : '#4F46E5',
      fontWeight: '700',
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 6,
    },
    devicePrefCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.08)' : '#F0FDF4',
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(16, 185, 129, 0.25)' : '#BBF7D0',
      marginBottom: 12,
    },
    devicePrefTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    devicePrefIcon: {
      fontSize: 14,
    },
    devicePrefTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: isDark ? '#34D399' : '#059669',
    },
    devicePrefDesc: {
      fontSize: 11,
      color: colors.text.muted,
      marginTop: 2,
      lineHeight: 15,
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
    membersContainer: {
      gap: 10,
    },
    infoBanner: {
      flexDirection: 'row',
      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.12)' : '#EEF2FF',
      borderRadius: 12,
      padding: 10,
      gap: 8,
      alignItems: 'flex-start',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(79, 70, 229, 0.25)' : '#C7D2FE',
    },
    infoBannerIcon: {
      fontSize: 14,
      marginTop: 1,
    },
    infoBannerText: {
      fontSize: 11.5,
      color: isDark ? '#A5B4FC' : '#4F46E5',
      lineHeight: 16,
      flex: 1,
    },
    summaryBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    summaryBarLabel: {
      fontSize: 12,
      color: colors.text.muted,
      fontWeight: '600',
    },
    summaryBarValue: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.text.primary,
    },
    memberCard: {
      backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    memberCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    memberInfoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
    },
    memberAvatar: {
      fontSize: 22,
    },
    memberName: {
      fontSize: 13.5,
      fontWeight: '700',
      color: colors.text.primary,
    },
    roleTag: {
      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.2)' : '#EEF2FF',
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 4,
    },
    roleTagText: {
      fontSize: 9.5,
      color: isDark ? '#A5B4FC' : '#4F46E5',
      fontWeight: '700',
    },
    memberStatusText: {
      fontSize: 10.5,
      color: colors.text.muted,
      marginTop: 2,
    },
    memberInputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? colors.background.input : '#FFFFFF',
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.border.default,
      paddingHorizontal: 8,
      width: 125,
    },
    memberInputPrefix: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text.muted,
      marginRight: 4,
    },
    memberInput: {
      flex: 1,
      paddingVertical: 6,
      fontSize: 14,
      fontWeight: '800',
      color: colors.text.primary,
      textAlign: 'right',
    },
    memberPresetRow: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border.default,
    },
    memberPresetChip: {
      flex: 1,
      paddingVertical: 5,
      borderRadius: 6,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF',
      borderWidth: 1,
      borderColor: colors.border.default,
      alignItems: 'center',
    },
    memberPresetChipActive: {
      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.25)' : '#EEF2FF',
      borderColor: isDark ? '#818CF8' : '#4F46E5',
    },
    memberPresetChipText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    memberPresetChipTextActive: {
      color: isDark ? '#818CF8' : '#4F46E5',
      fontWeight: '700',
    },
    memberClearChip: {
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 6,
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEE2E2',
      alignItems: 'center',
      justifyContent: 'center',
    },
    memberClearChipText: {
      fontSize: 10.5,
      color: '#DC2626',
      fontWeight: '700',
    },
    readOnlyBanner: {
      flexDirection: 'row',
      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : '#FEF3C7',
      borderRadius: 12,
      padding: 10,
      gap: 8,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(245, 158, 11, 0.25)' : '#FDE68A',
      marginBottom: 12,
    },
    readOnlyBannerIcon: {
      fontSize: 16,
    },
    readOnlyBannerTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: isDark ? '#FBBF24' : '#B45309',
    },
    readOnlyBannerDesc: {
      fontSize: 11,
      color: isDark ? '#FDE68A' : '#92400E',
      marginTop: 2,
      lineHeight: 15,
    },
    lockBadge: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    lockBadgeText: {
      fontSize: 9.5,
      color: colors.text.muted,
      fontWeight: '600',
    },
    inputContainerDisabled: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#F3F4F6',
      borderColor: colors.border.default,
    },
    amountInputDisabled: {
      color: colors.text.secondary,
    },
    catInputWrapDisabled: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#F3F4F6',
      borderColor: colors.border.default,
    },
    catInputDisabled: {
      color: colors.text.secondary,
    },
    memberInputWrapDisabled: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#F3F4F6',
      borderColor: colors.border.default,
    },
    memberInputDisabled: {
      color: colors.text.secondary,
    },
    memberMyTag: {
      backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#EFF6FF',
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: isDark ? '#60A5FA' : '#93C5FD',
    },
    memberMyTagText: {
      fontSize: 9.5,
      color: isDark ? '#93C5FD' : '#2563EB',
      fontWeight: '700',
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
