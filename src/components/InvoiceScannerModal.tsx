import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text as RNText,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Dimensions,
  TextProps,
} from 'react-native';
import { CameraView, useCameraPermissions, scanFromURLAsync } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { parseTaiwanInvoiceQRCode, ParsedInvoiceData } from '../lib/invoice';
import { useLedger } from '../context/LedgerContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SCAN_FRAME_SIZE = Math.min(SCREEN_WIDTH * 0.72, 280);

const Text: React.FC<TextProps> = ({ allowFontScaling = false, maxFontSizeMultiplier = 1.08, ...rest }) => (
  <RNText
    allowFontScaling={allowFontScaling}
    maxFontSizeMultiplier={Math.min(maxFontSizeMultiplier ?? 1.08, 1.08)}
    {...rest}
  />
);

interface InvoiceScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScanSuccess: (data: ParsedInvoiceData) => void;
}

export const InvoiceScannerModal: React.FC<InvoiceScannerModalProps> = ({
  visible,
  onClose,
  onScanSuccess,
}) => {
  const { taxIdMerchantMap } = useLedger();
  const [permission, requestPermission] = useCameraPermissions();
  const [enableTorch, setEnableTorch] = useState<boolean>(false);
  const [scanned, setScanned] = useState<boolean>(false);
  const [processingImage, setProcessingImage] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 當彈窗開啟時重設掃描狀態
  useEffect(() => {
    if (visible) {
      setScanned(false);
      setErrorMessage(null);
      setProcessingImage(false);
      setEnableTorch(false);
    }
  }, [visible]);

  // 即時掃描處理
  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scanned || !data) return;
    const parsed = parseTaiwanInvoiceQRCode(data, taxIdMerchantMap);
    if (parsed && (parsed.invoiceNumber || parsed.items)) {
      setScanned(true);
      onScanSuccess(parsed);
      onClose();
    }
  };

  // 從手機相簿選取截圖進行辨識 (完美支援雲端發票無紙本情境)
  const handlePickImage = async () => {
    try {
      setProcessingImage(true);
      setErrorMessage(null);

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });

      if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) {
        setProcessingImage(false);
        return;
      }

      const imageUri = pickerResult.assets[0].uri;
      const barcodeResults = await scanFromURLAsync(imageUri, ['qr']);

      if (barcodeResults && barcodeResults.length > 0) {
        for (const b of barcodeResults) {
          const parsed = parseTaiwanInvoiceQRCode(b.data, taxIdMerchantMap);
          if (parsed && (parsed.invoiceNumber || parsed.items)) {
            setScanned(true);
            onScanSuccess(parsed);
            onClose();
            return;
          }
        }
      }

      setErrorMessage('在選取的圖片中未辨識到電子發票 QR Code，請確認發票條碼完整清晰');
    } catch (err: any) {
      console.warn('解析相簿圖片失敗:', err);
      setErrorMessage('解析圖片發生錯誤，請重試或直接使用鏡頭掃描');
    } finally {
      setProcessingImage(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        {/* 頂部操作列 */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.closeBtnText}>✕ 關閉</Text>
          </TouchableOpacity>
          <Text style={styles.topTitle}>📷 掃描發票</Text>
          <TouchableOpacity
            style={[styles.torchBtn, enableTorch && styles.torchBtnActive]}
            onPress={() => setEnableTorch(prev => !prev)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.torchBtnText}>{enableTorch ? '🔦 燈光開' : '💡 補光'}</Text>
          </TouchableOpacity>
        </View>

        {/* 相機預覽或權限請求畫面 */}
        {!permission?.granted ? (
          <View style={styles.permissionBox}>
            <Text style={styles.permissionIcon}>📷</Text>
            <Text style={styles.permissionTitle}>需要相機權限</Text>
            <Text style={styles.permissionDesc}>
              請允許開啟相機鏡頭，以便為您自動掃描並帶入電子發票資訊
            </Text>
            <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
              <Text style={styles.permissionBtnText}>開啟相機授權</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.permissionPhotoBtn} onPress={handlePickImage}>
              <Text style={styles.permissionPhotoBtnText}>🖼️ 改從相簿選取截圖</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.cameraWrapper}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              enableTorch={enableTorch}
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
              onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
            />

            {/* 掃描對焦輔助框 */}
            <View style={styles.overlay}>
              <View style={styles.unfocusedContainer} />
              <View style={styles.middleRow}>
                <View style={styles.unfocusedContainer} />
                <View style={styles.scanTargetBox}>
                  {/* 四個綠色轉角指示線 */}
                  <View style={[styles.corner, styles.cornerTL]} />
                  <View style={[styles.corner, styles.cornerTR]} />
                  <View style={[styles.corner, styles.cornerBL]} />
                  <View style={[styles.corner, styles.cornerBR]} />
                </View>
                <View style={styles.unfocusedContainer} />
              </View>
              <View style={styles.unfocusedContainer} />
            </View>
          </View>
        )}

        {/* 底部功能與操作指引 */}
        <View style={styles.bottomBar}>
          <Text style={styles.guideHint}>
            請將鏡頭對準發票【左側 QR Code】
          </Text>
          <Text style={styles.guideSub}>
            自動帶入號碼、金額、日期與店家 · 雙 QR Code 同時辨識商品明細
          </Text>

          {errorMessage && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{errorMessage}</Text>
            </View>
          )}

          <View style={styles.bottomActions}>
            <TouchableOpacity
              style={styles.photoPickerBtn}
              onPress={handlePickImage}
              disabled={processingImage}
              activeOpacity={0.7}
            >
              {processingImage ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Text style={styles.photoPickerBtnIcon}>🖼️</Text>
                  <Text style={styles.photoPickerBtnText}>從相簿選取截圖 (雲端發票)</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topBar: {
    height: Platform.OS === 'ios' ? 96 : 64,
    paddingTop: Platform.OS === 'ios' ? 44 : 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    zIndex: 10,
  },
  topTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
  },
  closeBtnText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  torchBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
  },
  torchBtnActive: {
    backgroundColor: '#F59E0B',
  },
  torchBtnText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  cameraWrapper: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'column',
  },
  unfocusedContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  middleRow: {
    flexDirection: 'row',
    height: SCAN_FRAME_SIZE,
  },
  scanTargetBox: {
    width: SCAN_FRAME_SIZE,
    height: SCAN_FRAME_SIZE,
    position: 'relative',
    backgroundColor: 'transparent',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#10B981',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  bottomBar: {
    paddingVertical: 20,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    alignItems: 'center',
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
  },
  guideHint: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 4,
  },
  guideSub: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 16,
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 12,
    width: '100%',
  },
  errorBannerText: {
    color: '#DC2626',
    fontSize: 12.5,
    textAlign: 'center',
    fontWeight: '600',
  },
  bottomActions: {
    width: '100%',
    alignItems: 'center',
  },
  photoPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    width: '100%',
    gap: 8,
  },
  photoPickerBtnIcon: {
    fontSize: 18,
  },
  photoPickerBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: '#0F172A',
  },
  permissionIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  permissionDesc: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  permissionBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  permissionBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  permissionPhotoBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
  },
  permissionPhotoBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
