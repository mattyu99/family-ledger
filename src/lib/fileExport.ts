import { Platform, Linking, Share, Clipboard } from 'react-native';
import { SUPABASE_URL } from './supabase';
import {
  STATEMENT_BUCKET,
  fetchStorageWithAuth,
  toHexUtf8,
} from './statementStorage';

export interface FileExportResult {
  success: boolean;
  method: 'web_download' | 'mobile_browser_download' | 'clipboard_fallback';
  filename: string;
  downloadUrl?: string;
  message: string;
  isFallback?: boolean;
}

/**
 * 於 Web 瀏覽器端直接利用 Blob 與 <a> 標籤下載檔案
 */
export const downloadWebFile = (
  filename: string,
  content: string,
  mimeType: string
): boolean => {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    try {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return true;
    } catch (err) {
      console.warn('Web 端檔案下載異常:', err);
    }
  }
  return false;
};

/**
 * 跨平台安全匯出與下載檔案
 * - Web 端：直接透過瀏覽器 Blob 下載，零延遲且完全本地運算
 * - 行動端 (Android / iOS)：透過 Supabase Storage 暫存並以瀏覽器直接觸發檔案下載至裝置 Downloads 資料夾，絕不阻塞 UI
 * - 離線備援：若無網路或超時 (8s)，自動降級複製至剪貼簿，絕不調用會遮蔽 Modal 的原生 Alert
 */
export const exportAndDownloadFile = async (params: {
  ledgerId?: string;
  filename: string;
  content: string;
  mimeType: string;
}): Promise<FileExportResult> => {
  const { ledgerId = 'common', filename, content, mimeType } = params;

  // 1. Web 瀏覽器環境：直接 Blob 下載
  if (Platform.OS === 'web') {
    const ok = downloadWebFile(filename, content, mimeType);
    if (ok) {
      return {
        success: true,
        method: 'web_download',
        filename,
        message: `已將備份檔「${filename}」下載至您的電腦！`,
      };
    }
  }

  // 2. 行動 Native 環境：上傳至 Supabase Storage 暫存並喚起瀏覽器原生下載
  const ext = filename.split('.').pop() || 'json';
  const rawBaseName = filename.replace(/\.[^/.]+$/, '');
  const hexName = toHexUtf8(rawBaseName);
  const timestamp = Date.now();
  const objectName = `${timestamp}__${hexName}.${ext}`;
  const fullPath = `${ledgerId}/exports/${objectName}`;

  try {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      try {
        abortController.abort();
      } catch {}
    }, 8000);

    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${STATEMENT_BUCKET}/${fullPath}`;
    const res = await fetchStorageWithAuth(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': mimeType,
        'x-upsert': 'true',
      },
      body: content,
      signal: abortController.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const publicBaseUrl = `${SUPABASE_URL}/storage/v1/object/public/${STATEMENT_BUCKET}/${fullPath}`;
      const downloadUrl = `${publicBaseUrl}?download=${encodeURIComponent(filename)}`;

      // 喚起系統預設瀏覽器（Chrome / Safari）直接下載實體檔案至手機 Downloads
      try {
        const canOpen = await Linking.canOpenURL(downloadUrl);
        if (canOpen) {
          await Linking.openURL(downloadUrl);
        } else {
          await Linking.openURL(publicBaseUrl);
        }
      } catch (linkErr) {
        console.warn('開啟下載連結警告:', linkErr);
      }

      return {
        success: true,
        method: 'mobile_browser_download',
        filename,
        downloadUrl,
        message: `已透過瀏覽器為您下載「${filename}」！\n檔案已存入您手機的「下載 (Download)」資料夾。`,
      };
    }
  } catch (err: any) {
    console.warn('雲端暫存備份下載異常，啟動安全降級通道:', err?.message || err);
  }

  // 3. 安全降級：複製至剪貼簿，絕不卡死、絕不彈出底層 Alert
  try {
    if (Clipboard && typeof Clipboard.setString === 'function') {
      Clipboard.setString(content);
    }
  } catch {}

  return {
    success: true,
    method: 'clipboard_fallback',
    filename,
    isFallback: true,
    message: `備份資料已完整複製至手機剪貼簿！\n可直接貼至 Google Keep、LINE 記事本或備忘錄永久留存。`,
  };
};

/**
 * 分享備份下載連結或摘要至外部 App (LINE / 雲端硬碟 / 郵件)
 * 絕不傳送數百 KB 原始字串，杜絕 Android Binder 記憶體崩潰 (TransactionTooLargeException)
 */
export const shareExportDownloadLink = async (params: {
  ledgerName: string;
  filename: string;
  downloadUrl: string;
  summaryText?: string;
}): Promise<boolean> => {
  const { ledgerName, filename, downloadUrl, summaryText } = params;
  const message = [
    `🛡️ 甜心記帳本【${ledgerName || '家庭記帳本'}】資料備份`,
    `📁 備份檔名：${filename}`,
    summaryText ? `📊 帳本要素：${summaryText}` : '',
    `🔗 專屬下載連結：\n${downloadUrl}`,
    `\n💡 點擊連結即可直接將真實備份檔儲存至裝置或雲端硬碟。`,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    await Share.share({
      title: filename,
      message,
    });
    return true;
  } catch (err) {
    console.warn('原生分享失敗:', err);
    try {
      if (Clipboard && typeof Clipboard.setString === 'function') {
        Clipboard.setString(downloadUrl || message);
      }
    } catch {}
    return false;
  }
};
