import React from 'react';
import {
  Modal,
  View,
  Text as RNText,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  Platform,
  TextProps,
} from 'react-native';

const Text: React.FC<TextProps> = ({ allowFontScaling = false, maxFontSizeMultiplier = 1.08, ...rest }) => (
  <RNText
    allowFontScaling={allowFontScaling}
    maxFontSizeMultiplier={Math.min(maxFontSizeMultiplier ?? 1.08, 1.08)}
    {...rest}
  />
);

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface ImageViewerModalProps {
  visible: boolean;
  imageUrl?: string | null;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onDelete?: () => void;
}

export const ImageViewerModal: React.FC<ImageViewerModalProps> = ({
  visible,
  imageUrl,
  title = '🧾 消費收據 / 憑證照片',
  subtitle,
  onClose,
  onDelete,
}) => {
  if (!imageUrl) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        {/* 頂部操作列 */}
        <View style={styles.header}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            {!!subtitle && (
              <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
            )}
          </View>
          <View style={styles.headerActions}>
            {!!onDelete && (
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={onDelete}
                activeOpacity={0.8}
              >
                <Text style={styles.deleteBtnText}>🗑️ 移除照片</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 圖片檢視區域 */}
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            resizeMode="contain"
          />
        </View>

        {/* 底部點擊任意外圍關閉提示 */}
        <TouchableOpacity
          style={styles.footerDismissArea}
          onPress={onClose}
          activeOpacity={1}
        >
          <Text style={styles.dismissHintText}>點擊任意處或右上角關閉</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 54 : 20,
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    zIndex: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  deleteBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  deleteBtnText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '700',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  imageContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  image: {
    width: SCREEN_WIDTH - 20,
    height: SCREEN_HEIGHT * 0.72,
  },
  footerDismissArea: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissHintText: {
    fontSize: 12,
    color: '#64748B',
  },
});
