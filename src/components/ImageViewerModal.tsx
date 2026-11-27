import React from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  Platform,
  Linking,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { Text } from './common/Text';
import { isPdfReceipt, extractReceiptFileName } from '../lib/receiptStorage';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface ImageViewerModalProps {
  visible: boolean;
  imageUrl?: string | null;
  mimeType?: string;
  fileName?: string;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onDelete?: () => void;
}

export const ImageViewerModal: React.FC<ImageViewerModalProps> = ({
  visible,
  imageUrl,
  mimeType,
  fileName,
  title,
  subtitle,
  onClose,
  onDelete,
}) => {
  const { width: windowWidth } = useWindowDimensions();

  if (!imageUrl) return null;

  const isPdf = isPdfReceipt(imageUrl, mimeType, fileName);
  const displayFileName = extractReceiptFileName(imageUrl, fileName);
  const resolvedTitle = title || (isPdf ? '📄 消費收據 / PDF 憑證' : '🧾 消費收據 / 憑證照片');
  const isRemoteUrl = imageUrl.startsWith('http://') || imageUrl.startsWith('https://');
  const canOpenExternally =
    isRemoteUrl ||
    imageUrl.startsWith('blob:') ||
    imageUrl.startsWith('data:');
  const showWebIframe = Platform.OS === 'web' && canOpenExternally && windowWidth >= 768;
  const canOpenPdfNow = (Platform.OS === 'web' && canOpenExternally) || isRemoteUrl;

  const handleOpenPdfExternally = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(imageUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    Linking.openURL(imageUrl).catch(() => {
      Alert.alert('無法開啟檔案', '請確認裝置是否支援開啟 PDF 檔案');
    });
  };

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
            <Text style={styles.title} numberOfLines={1}>{resolvedTitle}</Text>
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
                <Text style={styles.deleteBtnText}>
                  {isPdf ? '🗑️ 移除憑證' : '🗑️ 移除照片'}
                </Text>
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

        {/* 圖片或 PDF 檢視區域 */}
        {isPdf ? (
          <View style={styles.pdfContainer}>
            {showWebIframe ? (
              <View style={styles.webPdfWrapper}>
                <View style={styles.webPdfFrameBox}>
                  {React.createElement('iframe', {
                    src: imageUrl,
                    title: displayFileName,
                    style: {
                      width: '100%',
                      height: '100%',
                      border: 'none',
                      borderRadius: 12,
                      backgroundColor: '#FFFFFF',
                    },
                  })}
                </View>
                <TouchableOpacity
                  style={styles.pdfPrimaryBtn}
                  onPress={handleOpenPdfExternally}
                  activeOpacity={0.85}
                >
                  <Text style={styles.pdfPrimaryBtnText} maxFontSizeMultiplier={1.15}>
                    📄 在新分頁開啟 / 下載 PDF
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.pdfCard}>
                <View style={styles.pdfCardIconBox}>
                  <Text style={styles.pdfCardIcon}>📄</Text>
                </View>
                <View style={styles.pdfTypeBadge}>
                  <Text style={styles.pdfTypeBadgeText}>PDF 文件憑證</Text>
                </View>
                <Text style={styles.pdfFileName} numberOfLines={2} maxFontSizeMultiplier={1.15}>
                  {displayFileName}
                </Text>
                <Text style={styles.pdfDescription} maxFontSizeMultiplier={1.15}>
                  {canOpenPdfNow
                    ? (Platform.OS === 'web'
                        ? '點擊下方按鈕可於新分頁直接閱讀、縮放、列印或下載保存此 PDF 憑證。'
                        : '可呼叫系統內建 PDF 檢視器或瀏覽器開啟閱讀、縮放、列印與分享。')
                    : '此 PDF 已選取待上傳，請先儲存記帳完成雲端同步，之後即可隨時點擊開啟閱讀或分享。'}
                </Text>
                {canOpenPdfNow ? (
                  <TouchableOpacity
                    style={styles.pdfPrimaryBtn}
                    onPress={handleOpenPdfExternally}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.pdfPrimaryBtnText} maxFontSizeMultiplier={1.15}>
                      {Platform.OS === 'web'
                        ? '📄 在新分頁開啟 / 下載 PDF'
                        : '📄 使用系統檢視器開啟 PDF'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.pendingLocalHintBox}>
                    <Text style={styles.pendingLocalHintText} maxFontSizeMultiplier={1.12}>
                      💡 點擊「儲存」後即完成雲端歸檔
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: imageUrl }}
              style={styles.image}
              resizeMode="contain"
            />
          </View>
        )}

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
  pdfContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  webPdfWrapper: {
    width: '100%',
    maxWidth: 720,
    flex: 1,
    alignItems: 'center',
    gap: 12,
  },
  webPdfFrameBox: {
    width: '100%',
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  pdfCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: 'rgba(30, 41, 59, 0.96)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
    paddingHorizontal: 22,
    paddingVertical: 26,
    alignItems: 'center',
  },
  pdfCardIconBox: {
    width: 68,
    height: 68,
    borderRadius: 18,
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  pdfCardIcon: {
    fontSize: 34,
  },
  pdfTypeBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.45)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 12,
  },
  pdfTypeBadgeText: {
    color: '#93C5FD',
    fontSize: 12,
    fontWeight: '700',
  },
  pdfFileName: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  pdfDescription: {
    color: '#CBD5E1',
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 18,
  },
  pdfPrimaryBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '700',
  },
  pendingLocalHintBox: {
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pendingLocalHintText: {
    color: '#FCD34D',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
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
