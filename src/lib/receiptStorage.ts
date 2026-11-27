import { Platform } from 'react-native';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabase } from './supabase';
import { STATEMENT_BUCKET, toHexUtf8, fromHexUtf8 } from './statementStorage';

export const MAX_RECEIPT_FILE_BYTES = 20 * 1024 * 1024;

const stripQueryAndHash = (value: string): string => value.split('#')[0].split('?')[0].trim();

/**
 * 判斷憑證（URL、MIME 類型或檔名）是否為 PDF 文件
 */
export const isPdfReceipt = (
  url?: string | null,
  mimeType?: string | null,
  fileName?: string | null
): boolean => {
  if (mimeType && mimeType.toLowerCase().includes('pdf')) {
    return true;
  }
  if (url) {
    const cleanUrl = url.trim().toLowerCase();
    if (cleanUrl.startsWith('data:application/pdf')) {
      return true;
    }
    if (stripQueryAndHash(cleanUrl).endsWith('.pdf')) {
      return true;
    }
  }
  if (fileName && fileName.trim().toLowerCase().endsWith('.pdf')) {
    return true;
  }
  return false;
};

/**
 * 依據 MIME 類型、檔名或 URI 推導標準副檔名
 */
export const getReceiptExtension = (
  mimeType?: string | null,
  fileName?: string | null,
  uri?: string | null
): 'pdf' | 'png' | 'webp' | 'jpg' => {
  if (isPdfReceipt(uri, mimeType, fileName)) {
    return 'pdf';
  }
  const mimeLower = (mimeType || '').toLowerCase();
  const nameLower = (fileName || '').trim().toLowerCase();
  const uriLower = uri ? stripQueryAndHash(uri).toLowerCase() : '';

  if (mimeLower.includes('png') || nameLower.endsWith('.png') || uriLower.endsWith('.png')) {
    return 'png';
  }
  if (mimeLower.includes('webp') || nameLower.endsWith('.webp') || uriLower.endsWith('.webp')) {
    return 'webp';
  }
  return 'jpg';
};

/**
 * 解析標準 MIME 類型
 */
export const resolveReceiptMimeType = (
  mimeType?: string | null,
  fileName?: string | null,
  uri?: string | null
): string => {
  const ext = getReceiptExtension(mimeType, fileName, uri);
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
};

/**
 * 從雲端儲存路徑或預設備用名稱還原可讀檔名
 */
export const extractReceiptFileName = (
  url?: string | null,
  fallbackName?: string | null
): string => {
  const trimmedFallback = fallbackName?.trim();
  if (trimmedFallback && trimmedFallback !== 'receipt.jpg') {
    return trimmedFallback;
  }
  if (url) {
    const clean = stripQueryAndHash(url);
    const segment = clean.split('/').pop() || '';
    const match = segment.match(/^\d+__([0-9a-fA-F]+)\.([a-zA-Z0-9]+)$/);
    if (match) {
      const decoded = fromHexUtf8(match[1]);
      const ext = match[2].toLowerCase();
      if (decoded && decoded !== 'receipt') {
        return decoded.toLowerCase().endsWith(`.${ext}`) ? decoded : `${decoded}.${ext}`;
      }
    }
  }
  return isPdfReceipt(url, undefined, fallbackName) ? '消費收據憑證.pdf' : '消費收據憑證.jpg';
};

/**
 * 將 base64 字串解碼為 Uint8Array 位元組陣列，供 React Native 原生安全二進位上傳
 */
export const base64ToUint8Array = (base64: string): Uint8Array => {
  const cleaned = base64.replace(/^data:image\/[a-zA-Z]+;base64,/, '').trim();
  if (typeof atob === 'function') {
    try {
      const binary = atob(cleaned);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    } catch {}
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }
  let bufferLength = cleaned.length * 0.75;
  if (cleaned.endsWith('==')) bufferLength -= 2;
  else if (cleaned.endsWith('=')) bufferLength -= 1;
  const bytes = new Uint8Array(Math.max(0, Math.floor(bufferLength)));
  let p = 0;
  for (let i = 0; i < cleaned.length; i += 4) {
    const encoded1 = lookup[cleaned.charCodeAt(i)];
    const encoded2 = lookup[cleaned.charCodeAt(i + 1)];
    const encoded3 = lookup[cleaned.charCodeAt(i + 2)];
    const encoded4 = lookup[cleaned.charCodeAt(i + 3)];
    bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
    if (cleaned[i + 2] !== '=' && cleaned[i + 2] !== undefined) {
      bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    }
    if (cleaned[i + 3] !== '=' && cleaned[i + 3] !== undefined) {
      bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
    }
  }
  return bytes;
};

/**
 * 將收據圖片或 PDF 憑證上傳至 Supabase Storage，儲存於帳本收據專屬路徑
 * 具備嚴格超時防呆、檔案大小上限驗證（20 MB）、雙軌權杖穿透與 React Native / Web 自適應傳輸通道
 * 若網路延遲或逾時，絕不阻塞 UI，安全降級回傳本機 URI
 */
export const uploadReceiptPhoto = async (params: {
  ledgerId: string;
  uri: string;
  base64?: string;
  mimeType?: string;
  originalName?: string;
  file?: Blob | File | null;
  size?: number;
}): Promise<string> => {
  const { ledgerId, uri, base64, mimeType, originalName, file, size } = params;

  if (!ledgerId || !uri) {
    return uri || '';
  }

  const ext = getReceiptExtension(mimeType, originalName, uri);
  const effectiveMimeType = resolveReceiptMimeType(mimeType, originalName, uri);

  const declaredSize = typeof size === 'number'
    ? size
    : (file && typeof file.size === 'number' ? file.size : 0);
  if (declaredSize > MAX_RECEIPT_FILE_BYTES) {
    throw new Error('檔案大小超過 20 MB 上限，請選擇較小的 PDF 或圖片檔');
  }

  const timestamp = Date.now();
  const fallbackOriginal = ext === 'pdf' ? 'receipt.pdf' : 'receipt.jpg';
  const rawBaseName = (originalName || fallbackOriginal).replace(/\.[^/.]+$/, '');
  const hexName = toHexUtf8(rawBaseName || 'receipt');
  const objectName = `${timestamp}__${hexName}.${ext}`;
  const fullPath = `${ledgerId}/receipts/${objectName}`;

  const timeoutMs = ext === 'pdf' ? 25000 : 12000;
  // 逾時防禦控制器：杜絕 React Native 網路掛起
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    try {
      abortController.abort();
    } catch {}
  }, timeoutMs);

  let sizeLimitError: Error | null = null;

  try {
    let bodyData: any;
    let isFormData = false;

    if (file) {
      // 管道 1：Web 端已選取 File/Blob 時直接傳送
      bodyData = file;
    } else if (ext !== 'pdf' && base64 && base64.length > 50) {
      // 管道 2：若已有圖片 base64（由 ImagePicker 快速產出），直接轉換為二進位 Uint8Array 秒傳
      bodyData = base64ToUint8Array(base64);
    } else if (Platform.OS === 'web') {
      // 管道 3：Web 瀏覽器環境，標準 Fetch Blob
      const resp = await fetch(uri, { signal: abortController.signal });
      const fetchedBlob = await resp.blob();
      if (fetchedBlob.size > MAX_RECEIPT_FILE_BYTES) {
        sizeLimitError = new Error('檔案大小超過 20 MB 上限，請選擇較小的 PDF 或圖片檔');
        throw sizeLimitError;
      }
      bodyData = fetchedBlob;
    } else {
      // 管道 4：React Native (Android/iOS)，使用原生 FormData 封裝避免 Blob 串流掛起
      const formData = new FormData();
      formData.append('file', {
        uri,
        name: objectName,
        type: effectiveMimeType,
      } as any);
      bodyData = formData;
      isFormData = true;
    }

    let authToken = SUPABASE_ANON_KEY;
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.access_token) {
        authToken = data.session.access_token;
      }
    } catch {}

    const buildHeaders = (token: string) => {
      const h: Record<string, string> = {
        'x-upsert': 'true',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      };
      // FormData 傳送時嚴禁手動設定 Content-Type，由環境自動帶入 multipart boundary
      if (!isFormData) {
        h['Content-Type'] = effectiveMimeType;
      }
      return h;
    };

    let res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${STATEMENT_BUCKET}/${fullPath}`,
      {
        method: 'POST',
        headers: buildHeaders(authToken),
        body: bodyData,
        signal: abortController.signal,
      }
    );

    if (!res.ok) {
      // 備援：若服務權杖異常則退回使用者 session token 再次重試
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.access_token) {
          authToken = data.session.access_token;
          res = await fetch(
            `${SUPABASE_URL}/storage/v1/object/${STATEMENT_BUCKET}/${fullPath}`,
            {
              method: 'POST',
              headers: buildHeaders(authToken),
              body: bodyData,
              signal: abortController.signal,
            }
          );
        }
      } catch {}
    }

    if (!res.ok) {
      const errText = await res.text();
      console.warn('收據憑證雲端上傳未成功，降級保留本機 URI:', errText);
      return uri;
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${STATEMENT_BUCKET}/${fullPath}`;
    return publicUrl;
  } catch (err: any) {
    if (sizeLimitError) {
      throw sizeLimitError;
    }
    if (err?.name === 'AbortError') {
      console.warn(`收據憑證雲端上傳逾時 (${timeoutMs / 1000}s 防禦觸發)，安全降級保留本機 URI`);
    } else {
      console.warn('上傳收據憑證發生例外，安全降級保留本機 URI:', err?.message || err);
    }
    return uri;
  } finally {
    clearTimeout(timeoutId);
  }
};
