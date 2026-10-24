import { Platform } from 'react-native';
import { SUPABASE_URL, supabase } from './supabase';
import { STATEMENT_BUCKET, getStorageServiceToken, toHexUtf8 } from './statementStorage';

/**
 * 將圖片上傳至 Supabase Storage，儲存於帳本收據專屬路徑
 * 路徑結構：`${ledgerId}/receipts/${timestamp}__${hexName}.${ext}`
 */
export const uploadReceiptPhoto = async (params: {
  ledgerId: string;
  uri: string;
  mimeType?: string;
  originalName?: string;
}): Promise<string> => {
  const { ledgerId, uri, mimeType = 'image/jpeg', originalName = 'receipt.jpg' } = params;

  if (!ledgerId || !uri) {
    throw new Error('缺少必要參數 ledgerId 或 uri');
  }

  const timestamp = Date.now();
  const rawBaseName = originalName.replace(/\.[^/.]+$/, '');
  const hexName = toHexUtf8(rawBaseName || 'receipt');
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const objectName = `${timestamp}__${hexName}.${ext}`;
  const fullPath = `${ledgerId}/receipts/${objectName}`;

  try {
    let bodyData: any;

    if (Platform.OS === 'web') {
      const resp = await fetch(uri);
      bodyData = await resp.blob();
    } else {
      const resp = await fetch(uri);
      bodyData = await resp.blob();
    }

    const svcToken = getStorageServiceToken();
    let authToken = svcToken;

    let res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${STATEMENT_BUCKET}/${fullPath}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': mimeType,
          'x-upsert': 'true',
          apikey: authToken,
          Authorization: `Bearer ${authToken}`,
        },
        body: bodyData,
      }
    );

    if (!res.ok) {
      // 備援：若服務權杖異常則退回使用者 session token
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.access_token) {
          authToken = data.session.access_token;
          res = await fetch(
            `${SUPABASE_URL}/storage/v1/object/${STATEMENT_BUCKET}/${fullPath}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': mimeType,
                'x-upsert': 'true',
                apikey: authToken,
                Authorization: `Bearer ${authToken}`,
              },
              body: bodyData,
            }
          );
        }
      } catch {}
    }

    if (!res.ok) {
      const errText = await res.text();
      console.warn('收據照片雲端上傳失敗，保留本機 URI:', errText);
      return uri; // 降級保留本機 URI
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${STATEMENT_BUCKET}/${fullPath}`;
    return publicUrl;
  } catch (err) {
    console.warn('上傳收據發生例外，降級保留本機 URI:', err);
    return uri;
  }
};
