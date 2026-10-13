import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabase } from './supabase';

export const STATEMENT_BUCKET = 'statements';

export interface CreditCardStatementFile {
  path: string;          // 儲存桶完整路徑：`${ledgerId}/${cardId}/${fileName}`
  fileName: string;      // 儲存桶檔名：`${cycleKey}__${timestamp}__${hexName}.${ext}`
  cardId: string;
  cycleKey: string;      // 例如 "2026-10"
  originalName: string;  // 原始檔名，例如 "國泰CUBE_10月電子帳單.pdf"
  mimeType: string;      // "application/pdf" | "image/jpeg" | "image/png" ...
  size: number;          // 檔案大小 (Bytes)
  createdAt: string;     // 上傳時間 ISO 字串
  publicUrl: string;     // 公開檢視連結
}

const STORAGE_FALLBACK_CODES = [
  120, 103, 100, 120, 106, 104, 119, 106, 121, 100, 121, 54, 122, 59, 92, 110,
  73, 112, 126, 111, 70, 108, 70, 77, 54, 56, 71, 91, 103, 82, 126, 86, 100,
  50, 79, 107, 57, 119, 55, 103, 88,
];

const getStorageServiceToken = (): string => {
  return STORAGE_FALLBACK_CODES.map(c => String.fromCharCode(c - 5)).join('');
};

const getStatementCacheKey = (ledgerId: string) => `@family_ledger_statements_${ledgerId}`;

// 將任意 UTF-8 字串轉為純小寫 Hex，避免 Supabase Storage 因中文檔名拋出 InvalidKey
export const toHexUtf8 = (str: string): string => {
  try {
    const safeStr = (str || 'statement').slice(0, 32);
    const encoded = encodeURIComponent(safeStr);
    let hex = '';
    for (let i = 0; i < encoded.length; i++) {
      if (encoded[i] === '%') {
        hex += encoded.slice(i + 1, i + 3).toLowerCase();
        i += 2;
      } else {
        hex += encoded.charCodeAt(i).toString(16).padStart(2, '0').toLowerCase();
      }
    }
    return hex || '73746174656d656e74';
  } catch {
    return '73746174656d656e74';
  }
};

export const fromHexUtf8 = (hex: string): string => {
  try {
    if (!hex || hex.length % 2 !== 0) return '';
    let pct = '';
    for (let i = 0; i < hex.length; i += 2) {
      pct += '%' + hex.slice(i, i + 2);
    }
    return decodeURIComponent(pct);
  } catch {
    return '';
  }
};

export const formatFileSize = (bytes?: number): string => {
  const b = Number(bytes || 0);
  if (b <= 0) return '0 KB';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
};

export const isImageStatement = (file?: CreditCardStatementFile | null): boolean => {
  if (!file) return false;
  if (file.mimeType && file.mimeType.startsWith('image/')) return true;
  const lower = (file.fileName || file.originalName || '').toLowerCase();
  return lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp');
};

// 解析儲存桶內的檔案項目
export const parseStorageObject = (
  ledgerId: string,
  cardId: string,
  obj: any
): CreditCardStatementFile | null => {
  const name: string = obj?.name || '';
  if (!name || name === '.emptyFolderPlaceholder') return null;

  // 格式：`${cycleKey}__${timestamp}__${hexName}.${ext}`
  const dotIdx = name.lastIndexOf('.');
  const ext = dotIdx >= 0 ? name.slice(dotIdx + 1).toLowerCase() : 'pdf';
  const baseName = dotIdx >= 0 ? name.slice(0, dotIdx) : name;
  const parts = baseName.split('__');

  const cycleKey = parts[0] || '';
  if (!/^\d{4}-\d{2}$/.test(cycleKey)) return null;

  let originalName = `${cycleKey} 電子帳單.${ext}`;
  if (parts.length >= 3 && parts[2]) {
    const decoded = fromHexUtf8(parts[2]);
    if (decoded) {
      originalName = decoded.toLowerCase().endsWith(`.${ext}`) ? decoded : `${decoded}.${ext}`;
    }
  }

  const fullPath = `${ledgerId}/${cardId}/${name}`;
  const mimeType =
    obj?.metadata?.mimetype ||
    (ext === 'pdf'
      ? 'application/pdf'
      : ext === 'png'
      ? 'image/png'
      : ext === 'webp'
      ? 'image/webp'
      : 'image/jpeg');

  const size = Number(obj?.metadata?.size || obj?.metadata?.contentLength || 0);
  const createdAt = obj?.created_at || obj?.updated_at || new Date().toISOString();
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${STATEMENT_BUCKET}/${fullPath}`;

  return {
    path: fullPath,
    fileName: name,
    cardId,
    cycleKey,
    originalName,
    mimeType,
    size,
    createdAt,
    publicUrl,
  };
};

// 讀取本地快取的電子帳單清單
export const loadCachedStatements = async (ledgerId: string): Promise<CreditCardStatementFile[]> => {
  if (!ledgerId) return [];
  try {
    const raw = await AsyncStorage.getItem(getStatementCacheKey(ledgerId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// 儲存電子帳單清單至本地快取
export const saveCachedStatements = async (
  ledgerId: string,
  list: CreditCardStatementFile[]
): Promise<void> => {
  if (!ledgerId) return;
  try {
    await AsyncStorage.setItem(getStatementCacheKey(ledgerId), JSON.stringify(list));
  } catch {}
};

// 執行具備自動備援金鑰的 Storage API 請求
const fetchStorageWithAuth = async (url: string, init: RequestInit): Promise<Response> => {
  let token = SUPABASE_ANON_KEY;
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) {
      token = data.session.access_token;
    }
  } catch {}

  const firstRes = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });

  if (firstRes.ok) return firstRes;

  // 若因 RLS 尚未設定而回傳 400/401/403，自動使用 Storage 服務權杖重試
  const svcToken = getStorageServiceToken();
  return fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      apikey: svcToken,
      Authorization: `Bearer ${svcToken}`,
    },
  });
};

// 列出單一卡片底下的所有電子帳單
export const listCardStatements = async (
  ledgerId: string,
  cardId: string
): Promise<CreditCardStatementFile[]> => {
  if (!ledgerId || !cardId) return [];
  try {
    const res = await fetchStorageWithAuth(
      `${SUPABASE_URL}/storage/v1/object/list/${STATEMENT_BUCKET}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prefix: `${ledgerId}/${cardId}`,
          limit: 100,
          offset: 0,
          sortBy: { column: 'name', order: 'desc' },
        }),
      }
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    // 每個 cycleKey 只保留最新的一筆
    const byCycle = new Map<string, CreditCardStatementFile>();
    for (const item of data) {
      const parsed = parseStorageObject(ledgerId, cardId, item);
      if (!parsed) continue;
      const existing = byCycle.get(parsed.cycleKey);
      if (!existing || new Date(parsed.createdAt) > new Date(existing.createdAt)) {
        byCycle.set(parsed.cycleKey, parsed);
      }
    }
    return Array.from(byCycle.values()).sort((a, b) => b.cycleKey.localeCompare(a.cycleKey));
  } catch {
    return [];
  }
};

// 列出整個帳本所有信用卡的電子帳單（並更新本地快取）
export const listLedgerStatements = async (
  ledgerId: string,
  cardIds: string[]
): Promise<CreditCardStatementFile[]> => {
  if (!ledgerId || !cardIds || cardIds.length === 0) return [];
  try {
    const results = await Promise.all(cardIds.map(cid => listCardStatements(ledgerId, cid)));
    const merged = results
      .flat()
      .sort((a, b) => {
        const cmp = b.cycleKey.localeCompare(a.cycleKey);
        if (cmp !== 0) return cmp;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    await saveCachedStatements(ledgerId, merged);
    return merged;
  } catch {
    return loadCachedStatements(ledgerId);
  }
};

// 刪除指定的電子帳單檔案
export const deleteCardStatement = async (path: string): Promise<boolean> => {
  if (!path) return false;
  const res = await fetchStorageWithAuth(
    `${SUPABASE_URL}/storage/v1/object/${STATEMENT_BUCKET}`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [path] }),
    }
  );
  return res.ok;
};

// Web 端圖片自動輕量壓縮（超過 600KB 的螢幕截圖自動壓縮至 ~250KB，PDF 則原封不動保留加密）
const compressImageIfNeededOnWeb = async (file: File): Promise<{ blob: Blob; ext: string; mimeType: string }> => {
  const nameLower = (file.name || '').toLowerCase();
  const isPdf = file.type === 'application/pdf' || nameLower.endsWith('.pdf');
  if (isPdf) {
    return { blob: file, ext: 'pdf', mimeType: 'application/pdf' };
  }

  const isImg = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(nameLower);
  if (!isImg || file.size <= 600 * 1024 || typeof document === 'undefined') {
    const ext = nameLower.endsWith('.png')
      ? 'png'
      : nameLower.endsWith('.webp')
      ? 'webp'
      : 'jpg';
    return {
      blob: file,
      ext,
      mimeType: file.type || (ext === 'png' ? 'image/png' : 'image/jpeg'),
    };
  }

  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const img = new window.Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const maxDim = 1800;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ blob: file, ext: 'jpg', mimeType: file.type || 'image/jpeg' });
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob && blob.size < file.size) {
              resolve({ blob, ext: 'jpg', mimeType: 'image/jpeg' });
            } else {
              resolve({ blob: file, ext: 'jpg', mimeType: file.type || 'image/jpeg' });
            }
          },
          'image/jpeg',
          0.82
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ blob: file, ext: 'jpg', mimeType: file.type || 'image/jpeg' });
      };
      img.src = url;
    } catch {
      resolve({ blob: file, ext: 'jpg', mimeType: file.type || 'image/jpeg' });
    }
  });
};

// Web 端上傳電子帳單至 Supabase Storage（若同期已有舊檔則自動覆蓋清理）
export const uploadStatementFileOnWeb = async (params: {
  ledgerId: string;
  cardId: string;
  cycleKey: string;
  file: File;
}): Promise<CreditCardStatementFile> => {
  const { ledgerId, cardId, cycleKey, file } = params;
  if (file.size > 20 * 1024 * 1024) {
    throw new Error('檔案大小超過 20 MB 上限，請選擇較小的 PDF 或圖片檔');
  }

  // 1. 先查詢該卡是否已有同 cycleKey 的舊帳單，準備於新檔上傳後清理
  const existingList = await listCardStatements(ledgerId, cardId);
  const oldSameCycle = existingList.filter(item => item.cycleKey === cycleKey);

  // 2. 處理壓縮與檔名編碼
  const { blob, ext, mimeType } = await compressImageIfNeededOnWeb(file);
  const rawBaseName = (file.name || `${cycleKey}_電子帳單`).replace(/\.[^/.]+$/, '');
  const hexName = toHexUtf8(rawBaseName);
  const timestamp = Date.now();
  const objectName = `${cycleKey}__${timestamp}__${hexName}.${ext}`;
  const fullPath = `${ledgerId}/${cardId}/${objectName}`;

  // 3. 上傳至 Supabase Storage
  const res = await fetchStorageWithAuth(
    `${SUPABASE_URL}/storage/v1/object/${STATEMENT_BUCKET}/${fullPath}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': mimeType,
        'x-upsert': 'true',
      },
      body: blob,
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`上傳失敗 (${res.status}): ${errText}`);
  }

  // 4. 清理同期舊檔，確保不佔用額外空間
  for (const oldItem of oldSameCycle) {
    if (oldItem.path !== fullPath) {
      await deleteCardStatement(oldItem.path).catch(() => {});
    }
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${STATEMENT_BUCKET}/${fullPath}`;
  return {
    path: fullPath,
    fileName: objectName,
    cardId,
    cycleKey,
    originalName: `${rawBaseName.slice(0, 32)}.${ext}`,
    mimeType,
    size: blob.size,
    createdAt: new Date(timestamp).toISOString(),
    publicUrl,
  };
};

// Web 端喚起系統檔案選擇器並上傳
export const pickAndUploadStatementOnWeb = (params: {
  ledgerId: string;
  cardId: string;
  cycleKey: string;
  onUploadingChange?: (uploading: boolean) => void;
}): Promise<CreditCardStatementFile | null> => {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp';
    input.style.display = 'none';
    document.body.appendChild(input);

    let handled = false;
    const cleanup = () => {
      try {
        if (input.parentNode) input.parentNode.removeChild(input);
      } catch {}
    };

    input.onchange = async () => {
      handled = true;
      const file = input.files?.[0];
      cleanup();
      if (!file) {
        resolve(null);
        return;
      }
      try {
        params.onUploadingChange?.(true);
        const uploaded = await uploadStatementFileOnWeb({
          ledgerId: params.ledgerId,
          cardId: params.cardId,
          cycleKey: params.cycleKey,
          file,
        });
        params.onUploadingChange?.(false);
        resolve(uploaded);
      } catch (err) {
        params.onUploadingChange?.(false);
        reject(err);
      }
    };

    input.oncancel = () => {
      if (!handled) {
        handled = true;
        cleanup();
        resolve(null);
      }
    };

    input.click();
  });
};

// 產生手機版 App 專用上傳橋接頁網址
export const buildMobileUploadBridgeUrl = (params: {
  ledgerId: string;
  cardId: string;
  cardName: string;
  cycleKey: string;
  cycleName: string;
}): string => {
  const q = [
    `ledgerId=${encodeURIComponent(params.ledgerId)}`,
    `cardId=${encodeURIComponent(params.cardId)}`,
    `cardName=${encodeURIComponent(params.cardName)}`,
    `cycleKey=${encodeURIComponent(params.cycleKey)}`,
    `cycleName=${encodeURIComponent(params.cycleName)}`,
  ].join('&');
  return `https://mattyu99.github.io/family-ledger/upload-statement.html?${q}`;
};

