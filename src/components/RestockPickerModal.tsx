import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { Text } from './common/Text';
import { useTheme } from '../theme/ThemeContext';
import { PendingRestockItem } from '../lib/groupOrder';

interface RestockPickerModalProps {
  visible: boolean;
  pendingItems: PendingRestockItem[];
  onClose: () => void;
  onConfirm: (selectedItems: PendingRestockItem[]) => void;
}

export const RestockPickerModal: React.FC<RestockPickerModalProps> = ({
  visible,
  pendingItems = [],
  onClose,
  onConfirm,
}) => {
  const { isDark, colors } = useTheme();

  // 選取的品項名稱 Set (依 itemName 唯一標識)
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());

  // 每次打開彈窗時，預設全部勾選 (方便懶人一鍵全帶入)
  useEffect(() => {
    if (visible && pendingItems.length > 0) {
      setSelectedNames(new Set(pendingItems.map(it => it.itemName)));
    }
  }, [visible, pendingItems]);

  const allSelected = useMemo(() => {
    return pendingItems.length > 0 && selectedNames.size === pendingItems.length;
  }, [pendingItems, selectedNames]);

  const handleToggleItem = (itemName: string) => {
    setSelectedNames(prev => {
      const next = new Set(prev);
      if (next.has(itemName)) {
        next.delete(itemName);
      } else {
        next.add(itemName);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (allSelected) {
      setSelectedNames(new Set());
    } else {
      setSelectedNames(new Set(pendingItems.map(it => it.itemName)));
    }
  };

  const handleConfirm = () => {
    const selected = pendingItems.filter(it => selectedNames.has(it.itemName));
    if (selected.length > 0) {
      onConfirm(selected);
    }
    onClose();
  };

  const selectedCount = selectedNames.size;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, isDark && { backgroundColor: 'rgba(0,0,0,0.75)' }]}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={[styles.modalCard, isDark && { backgroundColor: colors.background.modal, borderTopWidth: 1, borderTopColor: colors.border.default }]}>
          <View style={styles.sheetHandleBarWrap}>
            <View style={[styles.sheetHandleBar, isDark && { backgroundColor: '#475569' }]} />
          </View>
          {/* 頂部標題列 */}
          <View style={[styles.header, isDark && { borderBottomColor: colors.border.default }]}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={[styles.headerTitle, isDark && styles.textLight]} maxFontSizeMultiplier={1.15}>
                🏠 挑選要帶入的缺貨品項
              </Text>
              <Text style={[styles.headerSubtitle, isDark && styles.textMuted]} maxFontSizeMultiplier={1.12}>
                已勾選 {selectedCount}/{pendingItems.length} 項 · 未勾選將保留於缺貨池
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleToggleSelectAll}
              style={[styles.selectAllBtn, isDark && styles.selectAllBtnDark]}
              activeOpacity={0.7}
            >
              <Text style={[styles.selectAllBtnText, isDark && styles.selectAllBtnTextDark]} maxFontSizeMultiplier={1.08} numberOfLines={1}>
                {allSelected ? '取消全選' : '全選'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 品項清單滾動區 */}
          <ScrollView
            style={styles.listScroll}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {pendingItems.map((item, index) => {
              const isChecked = selectedNames.has(item.itemName);
              return (
                <TouchableOpacity
                  key={`${item.memoId}_${index}_${item.itemName}`}
                  style={[
                    styles.itemRow,
                    isChecked && styles.itemRowChecked,
                    isDark && (isChecked ? styles.itemRowCheckedDark : styles.itemRowDark),
                  ]}
                  activeOpacity={0.75}
                  onPress={() => handleToggleItem(item.itemName)}
                >
                  <View
                    style={[
                      styles.checkbox,
                      isChecked && styles.checkboxChecked,
                      isDark && !isChecked && {
                        backgroundColor: colors.background.cardSubtle,
                        borderColor: colors.border.strong,
                      },
                    ]}
                  >
                    <Text style={[styles.checkboxCheck, isChecked && styles.checkboxCheckChecked]}>
                      {isChecked ? '✓' : ''}
                    </Text>
                  </View>
                  <View style={styles.itemInfo}>
                    <View style={styles.itemNameRow}>
                      <Text style={[styles.itemName, isDark && styles.textLight]} numberOfLines={1} maxFontSizeMultiplier={1.15}>
                        {item.itemName}
                      </Text>
                      {item.specs ? (
                        <Text style={[styles.itemSpecs, isDark && styles.textMuted]} maxFontSizeMultiplier={1.1}>
                          ({item.specs})
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.itemMetaRow}>
                      <Text style={[styles.itemOrigin, isDark && styles.textMuted]} maxFontSizeMultiplier={1.08}>
                        來源：{item.memoTitle || '家中缺貨隨手記'}
                      </Text>
                      {item.memberName ? (
                        <Text style={[styles.itemMember, isDark && styles.textMuted]} maxFontSizeMultiplier={1.08}>
                          · 記錄人：{item.memberName}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* 底部按鈕列 */}
          <View style={[styles.footer, isDark && { backgroundColor: colors.background.modal, borderTopColor: colors.border.default }]}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.cancelBtn, isDark && styles.cancelBtnDark]}
              activeOpacity={0.7}
            >
              <Text style={[styles.cancelBtnText, isDark && styles.textLight]} maxFontSizeMultiplier={1.1}>
                取消
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleConfirm}
              disabled={selectedCount === 0}
              style={[
                styles.confirmBtn,
                selectedCount === 0 && styles.confirmBtnDisabled,
              ]}
              activeOpacity={0.75}
            >
              <Text style={styles.confirmBtnText} maxFontSizeMultiplier={1.1}>
                {selectedCount === 0 ? '請至少勾選一項' : `帶入本次推車 (${selectedCount})`}
              </Text>
            </TouchableOpacity>
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
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheetHandleBarWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  sheetHandleBar: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
  },
  modalCard: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
    fontWeight: '500',
  },
  selectAllBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  selectAllBtnDark: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderColor: 'rgba(96, 165, 250, 0.45)',
  },
  selectAllBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#2563EB',
  },
  selectAllBtnTextDark: {
    color: '#93C5FD',
  },
  listScroll: {
    width: '100%',
    flexShrink: 1,
  },
  listContent: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  itemRowDark: {
    backgroundColor: '#0F172A',
    borderColor: '#1E293B',
  },
  itemRowChecked: {
    backgroundColor: '#FFFBEB',
    borderColor: '#F59E0B',
  },
  itemRowCheckedDark: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: '#F59E0B',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxChecked: {
    backgroundColor: '#F59E0B',
    borderColor: '#F59E0B',
  },
  checkboxCheck: {
    fontSize: 13,
    fontWeight: '900',
    color: 'transparent',
  },
  checkboxCheckChecked: {
    color: '#FFFFFF',
  },
  itemInfo: {
    flex: 1,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  itemName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  itemSpecs: {
    fontSize: 13,
    color: '#64748B',
  },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 2,
  },
  itemOrigin: {
    fontSize: 11.5,
    color: '#94A3B8',
  },
  itemMember: {
    fontSize: 11.5,
    color: '#94A3B8',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 30 : 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 10,
    backgroundColor: '#F8FAFC',
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  cancelBtnDark: {
    backgroundColor: '#334155',
  },
  cancelBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#475569',
  },
  confirmBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F59E0B',
  },
  confirmBtnDisabled: {
    backgroundColor: '#CBD5E1',
    opacity: 0.6,
  },
  confirmBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  textLight: {
    color: '#F8FAFC',
  },
  textMuted: {
    color: '#94A3B8',
  },
});
