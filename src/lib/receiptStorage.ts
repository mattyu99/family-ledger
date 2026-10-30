import { Platform } from 'react-native';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabase } from './supabase';
import { STATEMENT_BUCKET, getStorageServiceToken, toHexUtf8 } from './statementStorage';

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
 * 將圖片上傳至 Supabase Storage，儲存於帳本收據專屬路徑
 * 具備 8 秒嚴格超時防呆、雙軌權杖穿透與 React Native / Web 自適應二進位傳輸通道
 * 若網路延遲或逾時，絕不阻塞 UI，安全降級回傳本機 URI
 */
export const uploadReceiptPhoto = async (params: {
  ledgerId: string;
  uri: string;
  base64?: string;
  mimeType?: string;
  originalName?: string;
}): Promise<string> => {
  const { ledgerId, uri, base64, mimeType = 'image/jpeg', originalName = 'receipt.jpg' } = params;

  if (!ledgerId || !uri) {
    return uri || '';
  }

  const timestamp = Date.now();
  const rawBaseName = originalName.replace(/\.[^/.]+$/, '');
  const hexName = toHexUtf8(rawBaseName || 'receipt');
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const objectName = `${timestamp}__${hexName}.${ext}`;
  const fullPath = `${ledgerId}/receipts/${objectName}`;

  // 8 秒逾時防禦控制器：杜絕 React Native 網路掛起 30 秒
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    try {
      abortController.abort();
    } catch {}
  }, 8000);

  try {
    let bodyData: any;
    let isFormData = false;

    if (base64 && base64.length > 50) {
      // 管道 1：若已有 base64（由 ImagePicker 快速產出），直接轉換為二進位 Uint8Array 秒傳
      bodyData = base64ToUint8Array(base64);
    } else if (Platform.OS === 'web') {
      // 管道 2：Web 瀏覽器環境，標準 Fetch Blob
      const resp = await fetch(uri, { signal: abortController.signal });
      bodyData = await resp.blob();
    } else {
      // 管道 3：React Native (Android/iOS)，使用原生 FormData 封裝避免 Blob 串流掛起
      const formData = new FormData();
      formData.append('file', {
        uri,
        name: objectName,
        type: mimeType,
      } as any);
      bodyData = formData;
      isFormData = true;
    }

    const svcToken = getStorageServiceToken();
    let authToken = svcToken;
    if (!authToken) {
      try {
        const { data } = await supabase.auth.getSession();
        authToken = data?.session?.access_token || SUPABASE_ANON_KEY;
      } catch {
        authToken = SUPABASE_ANON_KEY;
      }
    }

    const buildHeaders = (token: string) => {
      const h: Record<string, string> = {
        'x-upsert': 'true',
        apikey: token,
        Authorization: `Bearer ${token}`,
      };
      // FormData 傳送時嚴禁手動設定 Content-Type，由環境自動帶入 multipart boundary
      if (!isFormData) {
        h['Content-Type'] = mimeType;
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
      console.warn('收據照片雲端上傳未成功，降級保留本機 URI:', errText);
      return uri;
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${STATEMENT_BUCKET}/${fullPath}`;
    return publicUrl;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      console.warn('收據照片雲端上傳逾時 (8s 防禦觸發)，安全降級保留本機 URI');
    } else {
      console.warn('上傳收據發生例外，安全降級保留本機 URI:', err?.message || err);
    }
    return uri;
  } finally {
    clearTimeout(timeoutId);
  }
};
