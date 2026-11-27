import React from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { Text } from './common/Text';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';

export interface ReceiptSourceModalProps {
  visible: boolean;
  mode: 'receipt' | 'memo';
  hasExisting: boolean;
  existingIsPdf?: boolean;
  existingFileName?: string;
  onPickCamera?: () => void;
  onPickImageLibrary: () => void;
  onPickDocument: () => void;
  onRemove?: () => void;
  onClose: () => void;
}

/**
 * 跨平台憑證來源選單（取代 Android 僅支援 3 按鈕之原生 Alert 與 Web confirm）
 * 支援拍照、相簿選圖、選取 PDF / 檔案與移除既有憑證
 */
export const ReceiptSourceModal: React.FC<ReceiptSourceModalProps> = ({
  visible,
  mode,
  hasExisting,
  existingIsPdf = false,
  existingFileName,
  onPickCamera,
  onPickImageLibrary,
  onPickDocument,
  onRemove,
  onClose,
}) => {
  const { isDark, colors } = useTheme();
  const styles = React.useMemo(() => getStyles(isDark, colors), [isDark, colors]);

  const isWeb = Platform.OS === 'web';

  // Web 瀏覽器必須在同步點擊手勢內觸發 input.click()，不可延遲
  const triggerAction = (cb?: () => void) => {
    if (!cb) return;
    if (isWeb) {
      onClose();
      cb();
    } else {
      onClose();
      setTimeout(() => cb(), Platform.OS === 'ios' ? 280 : 80);
    }
  };

  const title = mode === 'memo' ? '📎 附加照片或 PDF 附件' : '📎 附加消費收據 / 保固憑證';
  const subtitle = mode === 'memo'
    ? '拍下菜單聯絡簿，或選取通知單 PDF 與圖片：'
    : '拍下紙本收據，或選取稅單、保固書 PDF 與圖片：';

  const currentAttachmentLabel = existingFileName?.trim()
    ? existingFileName.trim()
    : (existingIsPdf ? 'PDF 憑證' : '收據照片');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.sheetContainer}>
          <View style={styles.sheet}>
            <View style={styles.dragHandle} />

            <Text style={styles.title} maxFontSizeMultiplier={1.15}>
              {title}
            </Text>
            <Text style={styles.subtitle} maxFontSizeMultiplier={1.15}>
              {subtitle}
            </Text>

            {hasExisting && (
              <View style={styles.existingBadge}>
                <Text style={styles.existingBadgeText} numberOfLines={2} maxFontSizeMultiplier={1.12}>
                  目前憑證：{existingIsPdf ? '📄 ' : '🖼️ '}{currentAttachmentLabel}
                </Text>
              </View>
            )}

            <View style={styles.optionsList}>
              {!isWeb && !!onPickCamera && (
                <TouchableOpacity
                  style={styles.optionBtn}
                  onPress={() => triggerAction(onPickCamera)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.optionIconBox, styles.optionIconCamera]}>
                    <Text style={styles.optionIconText}>📸</Text>
                  </View>
                  <View style={styles.optionTextWrap}>
                    <Text style={styles.optionTitle} maxFontSizeMultiplier={1.15}>
                      {mode === 'memo' ? '立即拍照' : '拍照附收據'}
                    </Text>
                    <Text style={styles.optionSub} maxFontSizeMultiplier={1.12}>
                      開啟相機直接拍攝紙本憑證
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.optionBtn}
                onPress={() => triggerAction(onPickImageLibrary)}
                activeOpacity={0.75}
              >
                <View style={[styles.optionIconBox, styles.optionIconLibrary]}>
                  <Text style={styles.optionIconText}>🖼️</Text>
                </View>
                <View style={styles.optionTextWrap}>
                  <Text style={styles.optionTitle} maxFontSizeMultiplier={1.15}>
                    從相簿選擇圖片
                  </Text>
                  <Text style={styles.optionSub} maxFontSizeMultiplier={1.12}>
                    {isWeb ? '挑選電腦或手機中的照片圖片' : '挑選手機相簿中的照片或截圖'}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.optionBtn}
                onPress={() => triggerAction(onPickDocument)}
                activeOpacity={0.75}
              >
                <View style={[styles.optionIconBox, styles.optionIconPdf]}>
                  <Text style={styles.optionIconText}>📄</Text>
                </View>
                <View style={styles.optionTextWrap}>
                  <Text style={styles.optionTitle} maxFontSizeMultiplier={1.15}>
                    選擇 PDF / 檔案
                  </Text>
                  <Text style={styles.optionSub} maxFontSizeMultiplier={1.12}>
                    支援稅單、保固書 PDF 或圖片（上限 20MB）
                  </Text>
                </View>
              </TouchableOpacity>

              {hasExisting && !!onRemove && (
                <TouchableOpacity
                  style={[styles.optionBtn, styles.optionBtnRemove]}
                  onPress={() => {
                    onClose();
                    onRemove();
                  }}
                  activeOpacity={0.75}
                >
                  <View style={[styles.optionIconBox, styles.optionIconRemove]}>
                    <Text style={styles.optionIconText}>🗑️</Text>
                  </View>
                  <View style={styles.optionTextWrap}>
                    <Text style={[styles.optionTitle, styles.optionTitleRemove]} maxFontSizeMultiplier={1.15}>
                      移除目前憑證
                    </Text>
                    <Text style={[styles.optionSub, styles.optionSubRemove]} maxFontSizeMultiplier={1.12}>
                      清除此筆紀錄所附加的檔案或照片
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              activeOpacity={0.75}
            >
              <Text style={styles.cancelBtnText} maxFontSizeMultiplier={1.15}>
                取消
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const getStyles = (isDark: boolean, colors: ThemeColors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.72)' : 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheetContainer: {
    width: '100%',
    maxWidth: 480,
  },
  sheet: {
    backgroundColor: colors.background.modal,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 10,
    paddingHorizontal: 18,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
    borderTopWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0',
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.22)' : '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.text.secondary,
    marginBottom: 12,
  },
  existingBadge: {
    backgroundColor: isDark ? 'rgba(59, 130, 246, 0.16)' : '#EFF6FF',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(59, 130, 246, 0.35)' : '#BFDBFE',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  existingBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: isDark ? '#93C5FD' : '#1D4ED8',
  },
  optionsList: {
    gap: 10,
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F8FAFC',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  optionBtnRemove: {
    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2',
    borderColor: isDark ? 'rgba(239, 68, 68, 0.32)' : '#FECACA',
  },
  optionIconBox: {
    width: 40,
    height: 40,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIconCamera: {
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#D1FAE5',
  },
  optionIconLibrary: {
    backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#DBEAFE',
  },
  optionIconPdf: {
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
  },
  optionIconRemove: {
    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.22)' : '#FEE2E2',
  },
  optionIconText: {
    fontSize: 20,
  },
  optionTextWrap: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 2,
  },
  optionSub: {
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.text.secondary,
  },
  optionTitleRemove: {
    color: isDark ? '#FCA5A5' : '#DC2626',
  },
  optionSubRemove: {
    color: isDark ? 'rgba(252, 165, 165, 0.8)' : '#B91C1C',
  },
  cancelBtn: {
    marginTop: 14,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.secondary,
  },
});
