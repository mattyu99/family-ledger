import React, { useState, useEffect, useRef } from 'react';
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
import {
  parseTaiwanInvoiceQRCode,
  mergeParsedInvoiceData,
  ParsedInvoiceData,
} from '../lib/invoice';
import { useLedger } from '../context/LedgerContext';

// 安全動態載入原生相機與影像模組，避免舊版 APK 缺少二進位驅動時啟動黑屏
let CameraViewComponent: any = null;
let useCameraPermissionsHook: any = null;
let scanFromURLAsyncFn: any = null;
let isNativeCameraAvailable = false;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cameraPkg = require('expo-camera');
  if (cameraPkg?.CameraView && cameraPkg?.useCameraPermissions) {
    CameraViewComponent = cameraPkg.CameraView;
    useCameraPermissionsHook = cameraPkg.useCameraPermissions;
    scanFromURLAsyncFn = cameraPkg.scanFromURLAsync;
    isNativeCameraAvailable = true;
  }
} catch {
  isNativeCameraAvailable = false;
}

let ImagePickerModule: any = null;
let isImagePickerAvailable = false;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pickerPkg = require('expo-image-picker');
  if (pickerPkg?.launchImageLibraryAsync) {
    ImagePickerModule = pickerPkg;
    isImagePickerAvailable = true;
  }
} catch {
  isImagePickerAvailable = false;
}

const useCameraPermissionsSafe: () => [any, () => Promise<any>] =
  useCameraPermissionsHook ||
  (() => [null, async () => ({ granted: false })]);

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DUAL_FRAME_TOTAL_WIDTH = Math.min(SCREEN_WIDTH * 0.88, 330);
const DUAL_FRAME_GAP = 12;
const SINGLE_BOX_SIZE = Math.floor((DUAL_FRAME_TOTAL_WIDTH - DUAL_FRAME_GAP) / 2);
const DUAL_FRAME_HEIGHT = SINGLE_BOX_SIZE;

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

// 降級說明彈窗：當原生相機模組尚未存在於當前 APK 時展示，引導更新 APK 並提供替代操作
const FallbackScannerModal: React.FC<{ visible: boolean; onClose: () => void }> = ({
  visible,
  onClose,
}) => {
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
          <View style={{ width: 60 }} />
        </View>

        <View style={styles.fallbackContainer}>
          <View style={styles.fallbackCard}>
            <Text style={styles.fallbackIcon}>📦</Text>
            <Text style={styles.fallbackTitle}>需要安裝最新 App (APK)</Text>
            <Text style={styles.fallbackSubtitle}>相機硬體驅動需透過安裝檔更新</Text>

            <View style={styles.fallbackDivider} />

            <Text style={styles.fallbackDesc}>
              「發票雙 QR Code 智慧掃描」包含最新的相機硬體原生驅動。
              {'\n\n'}
              您目前手機安裝的 App 為較早版本，已透過雲端為您排程編譯最新版安裝檔 (APK)，安裝後即可啟用完整相機掃描！
            </Text>

            <View style={styles.fallbackTipBox}>
              <Text style={styles.fallbackTipTitle}>💡 免等安裝，現在即可使用：</Text>
              <Text style={styles.fallbackTipText}>
                在記帳頁面點擊「📋 貼上」按鈕，直接貼上電子發票或載具之 77 碼條碼文字，系統將自動解析號碼、金額與明細！
              </Text>
            </View>

            <TouchableOpacity style={styles.fallbackCloseActionBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.fallbackCloseActionBtnText}>我知道了，回記帳頁</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// 原生相機功能主體：僅在原生模組確定可用時掛載
const NativeCameraModalContent: React.FC<InvoiceScannerModalProps> = ({
  visible,
  onClose,
  onScanSuccess,
}) => {
  const { taxIdMerchantMap } = useLedger();
  const [permission, requestPermission] = useCameraPermissionsSafe();
  const [enableTorch, setEnableTorch] = useState<boolean>(false);
  const [scanned, setScanned] = useState<boolean>(false);
  const [processingImage, setProcessingImage] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 雙碼連續辨識與合併狀態
  const pendingLeftRef = useRef<ParsedInvoiceData | null>(null);
  const pendingRightRef = useRef<ParsedInvoiceData | null>(null);
  const autoFinishTimerRef = useRef<any>(null);
  const [waitingForRightCode, setWaitingForRightCode] = useState<boolean>(false);
  const [capturedStatus, setCapturedStatus] = useState<{ left: boolean; right: boolean }>({
    left: false,
    right: false,
  });
  const [statusMessage, setStatusMessage] = useState<string>('請將鏡頭對準發票【QR Code】');

  const finishWithResult = (finalData: ParsedInvoiceData) => {
    if (autoFinishTimerRef.current) {
      clearTimeout(autoFinishTimerRef.current);
      autoFinishTimerRef.current = null;
    }
    setScanned(true);
    onScanSuccess(finalData);
    onClose();
  };

  // 當彈窗開啟時重設掃描狀態
  useEffect(() => {
    if (visible) {
      setScanned(false);
      setErrorMessage(null);
      setProcessingImage(false);
      setEnableTorch(false);
      pendingLeftRef.current = null;
      pendingRightRef.current = null;
      setWaitingForRightCode(false);
      setCapturedStatus({ left: false, right: false });
      setStatusMessage('請將發票雙條碼對準下方「左碼」與「右碼」');
      if (autoFinishTimerRef.current) {
        clearTimeout(autoFinishTimerRef.current);
        autoFinishTimerRef.current = null;
      }
    } else {
      if (autoFinishTimerRef.current) {
        clearTimeout(autoFinishTimerRef.current);
        autoFinishTimerRef.current = null;
      }
    }
  }, [visible]);

  // 即時掃描處理 (支援單畫面雙碼無縫融合)
  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scanned || !data) return;
    const parsed = parseTaiwanInvoiceQRCode(data, taxIdMerchantMap);
    if (!parsed) return;

    // 情況 A：讀取到左側 QR Code (具發票號碼、金額與日期核心資訊)
    if (parsed.invoiceNumber) {
      setCapturedStatus(prev => ({ ...prev, left: true }));

      if (pendingRightRef.current) {
        // 先前同一畫面中已捕捉到右側溢位明細，雙碼瞬間合體！
        const merged = mergeParsedInvoiceData(parsed, pendingRightRef.current);
        finishWithResult(merged);
        return;
      }

      // 檢查發票是否有右側溢位品項 (總筆數 > 條碼所載筆數)
      const hasOverflow = Boolean(
        parsed.totalItemsCount &&
        parsed.recordedItemsCount &&
        parsed.totalItemsCount > parsed.recordedItemsCount
      );

      if (hasOverflow) {
        pendingLeftRef.current = parsed;
        setWaitingForRightCode(true);
        setStatusMessage(`✅ 已讀取左碼 (${parsed.invoiceNumber}) · 請對準右碼收齊明細...`);

        // 啟動 2 秒容錯倒數：若鏡頭未再抓到右側條碼，自動以現有品項與號碼金額完成帶入，絕不卡住使用者
        if (!autoFinishTimerRef.current) {
          autoFinishTimerRef.current = setTimeout(() => {
            if (pendingLeftRef.current && !scanned) {
              finishWithResult(pendingLeftRef.current);
            }
          }, 2000);
        }
      } else {
        // 品項已全數包含於左碼 (超商/一般消費 1~5 樣)，直接完成秒進！
        finishWithResult(parsed);
      }
      return;
    }

    // 情況 B：讀取到右側 QR Code (純溢位品項清單，無發票號碼)
    if (parsed.isRightQRCode || (parsed.items && parsed.items.length > 0)) {
      setCapturedStatus(prev => ({ ...prev, right: true }));

      if (pendingLeftRef.current) {
        // 左碼已在等待，右碼一出現立刻完成融合！
        const merged = mergeParsedInvoiceData(pendingLeftRef.current, parsed);
        finishWithResult(merged);
        return;
      }

      // 先抓到右碼，暫存品項並提示鏡頭移向左側
      pendingRightRef.current = parsed;
      setStatusMessage(`✅ 已捕捉右側明細 (${parsed.items?.length || 0}項) · 請對準左側條碼取得號碼與金額`);
    }
  };

  // 從手機相簿選取截圖進行辨識 (完美支援雲端發票無紙本情境，支援單截圖雙碼同時辨識)
  const handlePickImage = async () => {
    if (!ImagePickerModule || !scanFromURLAsyncFn) {
      setErrorMessage('當前版本尚未啟用圖片辨識，請使用相機掃描或「📋 貼上」按鈕');
      return;
    }

    try {
      setProcessingImage(true);
      setErrorMessage(null);

      const pickerResult = await ImagePickerModule.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });

      if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) {
        setProcessingImage(false);
        return;
      }

      const imageUri = pickerResult.assets[0].uri;
      const barcodeResults = await scanFromURLAsyncFn(imageUri, ['qr']);

      if (barcodeResults && barcodeResults.length > 0) {
        let leftParsed: ParsedInvoiceData | null = null;
        let rightParsed: ParsedInvoiceData | null = null;

        for (const b of barcodeResults) {
          const p = parseTaiwanInvoiceQRCode(b.data, taxIdMerchantMap);
          if (p) {
            if (p.invoiceNumber) {
              leftParsed = p;
            } else if (p.isRightQRCode || (p.items && p.items.length > 0)) {
              rightParsed = p;
            }
          }
        }

        // 若截圖中同時辨識出左碼與右碼，直接合體收齊！
        if (leftParsed && rightParsed) {
          const merged = mergeParsedInvoiceData(leftParsed, rightParsed);
          finishWithResult(merged);
          return;
        }
        if (leftParsed) {
          finishWithResult(leftParsed);
          return;
        }
        if (rightParsed) {
          finishWithResult(rightParsed);
          return;
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

  const CameraView = CameraViewComponent;

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
            {isImagePickerAvailable && (
              <TouchableOpacity style={styles.permissionPhotoBtn} onPress={handlePickImage}>
                <Text style={styles.permissionPhotoBtnText}>🖼️ 改從相簿選取截圖</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.cameraWrapper}>
            {CameraView && (
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                enableTorch={enableTorch}
                barcodeScannerSettings={{
                  barcodeTypes: ['qr'],
                }}
                onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
              />
            )}

            {/* 雙條碼並排對焦輔助框 */}
            <View style={styles.overlay}>
              <View style={styles.unfocusedContainer}>
                <View style={styles.frameHeaderHint}>
                  <Text style={styles.frameHeaderHintText}>
                    將發票雙條碼分別對準下方「左碼」與「右碼」
                  </Text>
                </View>
              </View>

              <View style={styles.middleRow}>
                <View style={styles.unfocusedSide} />

                <View style={styles.dualFrameContainer}>
                  {/* 左碼對焦框 (發票核心) */}
                  <View style={[styles.singleTargetBox, capturedStatus.left && styles.singleTargetBoxSuccess]}>
                    <View style={[styles.corner, styles.cornerTL, capturedStatus.left && styles.cornerSuccess]} />
                    <View style={[styles.corner, styles.cornerTR, capturedStatus.left && styles.cornerSuccess]} />
                    <View style={[styles.corner, styles.cornerBL, capturedStatus.left && styles.cornerSuccess]} />
                    <View style={[styles.corner, styles.cornerBR, capturedStatus.left && styles.cornerSuccess]} />
                    <View style={styles.targetBoxLabelContainer}>
                      <Text style={[styles.targetBoxLabel, capturedStatus.left && styles.targetBoxLabelSuccess]}>
                        {capturedStatus.left ? '✅ 左碼已就緒' : '左碼 (號碼金額)'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.dualFrameDivider} />

                  {/* 右碼對焦框 (溢位明細) */}
                  <View style={[styles.singleTargetBox, capturedStatus.right && styles.singleTargetBoxSuccess]}>
                    <View style={[styles.corner, styles.cornerTL, capturedStatus.right && styles.cornerSuccess]} />
                    <View style={[styles.corner, styles.cornerTR, capturedStatus.right && styles.cornerSuccess]} />
                    <View style={[styles.corner, styles.cornerBL, capturedStatus.right && styles.cornerSuccess]} />
                    <View style={[styles.corner, styles.cornerBR, capturedStatus.right && styles.cornerSuccess]} />
                    <View style={styles.targetBoxLabelContainer}>
                      <Text style={[styles.targetBoxLabel, capturedStatus.right && styles.targetBoxLabelSuccess]}>
                        {capturedStatus.right ? '✅ 右碼已就緒' : '右碼 (商品明細)'}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.unfocusedSide} />
              </View>

              <View style={styles.unfocusedContainer} />
            </View>
          </View>
        )}

        {/* 底部功能與操作指引 */}
        <View style={styles.bottomBar}>
          <Text style={[styles.guideHint, waitingForRightCode && styles.guideHintSuccess]}>
            {statusMessage}
          </Text>
          <Text style={styles.guideSub}>
            {waitingForRightCode
              ? '偵測到大賣場長明細：鏡頭稍移至右碼即可一網打盡，亦可點擊立即完成'
              : '自動帶入號碼、金額、日期與店家 · 支援單畫面雙碼無縫融合'}
          </Text>

          {waitingForRightCode && pendingLeftRef.current && (
            <TouchableOpacity
              style={styles.skipRightBtn}
              onPress={() => finishWithResult(pendingLeftRef.current!)}
              activeOpacity={0.8}
            >
              <Text style={styles.skipRightBtnText}>⚡ 立即完成帶入 (略過右碼)</Text>
            </TouchableOpacity>
          )}

          {errorMessage && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{errorMessage}</Text>
            </View>
          )}

          {isImagePickerAvailable && (
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
          )}
        </View>
      </View>
    </Modal>
  );
};

// 安全防禦 ErrorBoundary：若原生相機在執行階段拋出例外，自動降級顯示說明頁面，絕不黑屏
interface SafeCameraBoundaryProps {
  fallback: React.ReactNode;
  children: React.ReactNode;
}

interface SafeCameraBoundaryState {
  hasError: boolean;
}

class SafeCameraBoundary extends React.Component<SafeCameraBoundaryProps, SafeCameraBoundaryState> {
  override state: SafeCameraBoundaryState = { hasError: false };

  static getDerivedStateFromError(): SafeCameraBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown) {
    console.warn('[InvoiceScanner] 原生相機初始化失敗，切換至降級保護頁面:', error);
  }

  override render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// 對外導出的發票掃描彈窗組件
export const InvoiceScannerModal: React.FC<InvoiceScannerModalProps> = ({
  visible,
  onClose,
  onScanSuccess,
}) => {
  if (!visible) return null;

  // 若原生相機模組不可用（舊版 APK 未編譯相機驅動），直接顯示降級說明彈窗
  if (!isNativeCameraAvailable || !CameraViewComponent) {
    return <FallbackScannerModal visible={visible} onClose={onClose} />;
  }

  return (
    <SafeCameraBoundary fallback={<FallbackScannerModal visible={visible} onClose={onClose} />}>
      <NativeCameraModalContent visible={visible} onClose={onClose} onScanSuccess={onScanSuccess} />
    </SafeCameraBoundary>
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
    height: DUAL_FRAME_HEIGHT,
  },
  unfocusedSide: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  dualFrameContainer: {
    width: DUAL_FRAME_TOTAL_WIDTH,
    height: DUAL_FRAME_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  singleTargetBox: {
    width: SINGLE_BOX_SIZE,
    height: DUAL_FRAME_HEIGHT,
    position: 'relative',
    backgroundColor: 'transparent',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 6,
  },
  singleTargetBoxSuccess: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  dualFrameDivider: {
    width: DUAL_FRAME_GAP,
    height: DUAL_FRAME_HEIGHT,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  targetBoxLabelContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  targetBoxLabel: {
    fontSize: 10.5,
    color: '#E2E8F0',
    fontWeight: '600',
  },
  targetBoxLabelSuccess: {
    color: '#34D399',
    fontWeight: '800',
  },
  frameHeaderHint: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  frameHeaderHintText: {
    fontSize: 12,
    color: '#F8FAFC',
    fontWeight: '700',
  },
  corner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: '#10B981',
  },
  cornerSuccess: {
    borderColor: '#34D399',
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
  guideHintSuccess: {
    color: '#34D399',
    fontWeight: '800',
  },
  skipRightBtn: {
    backgroundColor: '#059669',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'center',
    marginTop: 4,
    marginBottom: 12,
  },
  skipRightBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
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
  fallbackContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  fallbackCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  fallbackIcon: {
    fontSize: 44,
    marginBottom: 12,
  },
  fallbackTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 6,
    textAlign: 'center',
  },
  fallbackSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#38BDF8',
    marginBottom: 16,
    textAlign: 'center',
  },
  fallbackDivider: {
    height: 1,
    backgroundColor: '#334155',
    width: '100%',
    marginBottom: 16,
  },
  fallbackDesc: {
    fontSize: 13.5,
    color: '#CBD5E1',
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 16,
  },
  fallbackTipBox: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    width: '100%',
    borderLeftWidth: 3,
    borderLeftColor: '#10B981',
    marginBottom: 20,
  },
  fallbackTipTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#34D399',
    marginBottom: 4,
  },
  fallbackTipText: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 18,
  },
  fallbackCloseActionBtn: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
  },
  fallbackCloseActionBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
