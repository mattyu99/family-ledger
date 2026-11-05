import {
  ParsedInvoiceData,
  formatInvoiceNumber,
  getInvoicePeriodKey,
  cleanBusinessName,
  inferCategoryFromIndustry,
} from './invoice';
import { supabase, isConfigured } from './supabase';

const decodeKey = (raw: string): string => {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (trimmed.startsWith('QVEu') || (trimmed.length > 50 && !trimmed.startsWith('AQ.'))) {
    try {
      if (typeof atob === 'function') {
        return atob(trimmed);
      }
      if (typeof (globalThis as any).Buffer !== 'undefined') {
        return (globalThis as any).Buffer.from(trimmed, 'base64').toString('utf-8');
      }
    } catch {
      return trimmed;
    }
  }
  return trimmed;
};

// 優先自環境變數讀取 Google Gemini API 金鑰（可選：若未設定則走雲端邊緣函式代理）
const RAW_GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const GEMINI_API_KEY = decodeKey(RAW_GEMINI_KEY);

/**
 * 檢查目前是否具備 Google AI 發票辨識能力
 * 只要已連接 Supabase 雲端 (可透過 Edge Function 代理) 或 本機已設定 API Key 即為可用
 */
export const isGeminiAIAvailable = (): boolean => {
  return isConfigured || Boolean(GEMINI_API_KEY && GEMINI_API_KEY.trim().length > 10);
};

export interface GeminiInvoiceResult {
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  totalAmount?: number | string | null;
  merchantName?: string | null;
  itemsSummary?: string | null;
  source?: string;
}

/**
 * 將 Gemini 辨識出的結構化 JSON 物件轉換為標準發票資料型別 (ParsedInvoiceData)
 */
export const transformGeminiResultToInvoice = (
  parsedAI: GeminiInvoiceResult
): ParsedInvoiceData | null => {
  if (!parsedAI) return null;

  const rawNum = (parsedAI.invoiceNumber || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const totalAmountNum =
    parsedAI.totalAmount !== null && parsedAI.totalAmount !== undefined
      ? parseInt(String(parsedAI.totalAmount).replace(/[^0-9]/g, ''), 10)
      : undefined;

  // 若未辨識出任何關鍵資訊 (號碼與金額皆為空)，視為無效結果
  if (!rawNum && (totalAmountNum === undefined || isNaN(totalAmountNum))) {
    return null;
  }

  // 日期處理與雙月期別歸類
  let invoiceDate = new Date().toISOString().split('T')[0];
  if (parsedAI.invoiceDate && /^\d{4}-\d{2}-\d{2}$/.test(parsedAI.invoiceDate)) {
    invoiceDate = parsedAI.invoiceDate;
  }
  const { periodKey, periodLabel } = getInvoicePeriodKey(invoiceDate);

  // 店家名稱清理與分類推導
  let merchantName: string | undefined = undefined;
  let defaultCategoryName: string | undefined = undefined;
  if (parsedAI.merchantName) {
    merchantName = cleanBusinessName(parsedAI.merchantName);
    defaultCategoryName = inferCategoryFromIndustry(undefined, merchantName);
  }

  const result: ParsedInvoiceData = {
    invoiceNumber: rawNum.length === 10 ? formatInvoiceNumber(rawNum) : rawNum,
    rawInvoiceNumber: rawNum,
    invoiceDate,
    periodKey,
    periodLabel,
    totalAmount: isNaN(totalAmountNum ?? NaN) ? undefined : totalAmountNum,
    merchantName,
    defaultCategoryName,
    itemsNote: parsedAI.itemsSummary || undefined,
    isQRCode: false,
    is1DBarcode: false,
  };

  return result;
};

/**
 * 透過 Google Gemini 視覺模型
 * 進行傳統長條發票、收據與手開發票之高精度光學文字與結構化欄位辨識
 * 
 * 優先順序：
 * 1. Supabase Edge Function 雲端代理 (金鑰完全封存在後端，前端零暴露)
 * 2. 本機直接呼叫 Google Gemini API (邊緣函式未部署或離線時之備援機制)
 */
export const recognizeInvoiceWithGemini = async (
  base64Data: string,
  mimeType = 'image/jpeg',
  timeoutMs = 12000
): Promise<ParsedInvoiceData | null> => {
  if (!isGeminiAIAvailable()) {
    console.warn('[GeminiInvoice] 尚未連接 Supabase 且未設定 Gemini API Key，略過 AI 辨識');
    return null;
  }

  // 清理 base64 字串中可能帶有的 data:image/...;base64, 前綴
  const cleanBase64 = base64Data.replace(/^data:image\/[a-zA-Z]+;base64,/, '').trim();
  if (!cleanBase64) return null;

  // 1. 若 Supabase 已配置，優先嘗試透過後端 Edge Function 代理辨識 (完全隱藏 Gemini API 金鑰)
  if (isConfigured) {
    try {
      const edgePromise = supabase.functions.invoke('gemini-ocr', {
        body: { base64Data: cleanBase64, mimeType },
      });
      const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { message: 'Edge Function 請求逾時' } }), 4000)
      );
      const { data: edgeData, error: edgeError } = await Promise.race([edgePromise, timeoutPromise]);

      if (!edgeError && edgeData) {
        const transformed = transformGeminiResultToInvoice(edgeData);
        if (transformed) {
          console.log('[GeminiInvoice] 成功透過 Supabase Edge Function 代理辨識發票 (雲端安全封存)');
          return transformed;
        }
      } else if (edgeError) {
        console.warn('[GeminiInvoice] Edge Function 呼叫回應:', edgeError.message);
      }
    } catch (edgeCatchErr) {
      console.warn('[GeminiInvoice] Edge Function 通道未連通，啟動備援連線:', edgeCatchErr);
    }
  }

  // 2. 若後端代理無法使用，且前端具備金鑰，自動降級至前端直接請求 Gemini API
  if (!GEMINI_API_KEY || GEMINI_API_KEY.trim().length < 10) {
    console.warn('[GeminiInvoice] 後端代理不可用且前端無備用 API Key');
    return null;
  }

  const prompt = `你是一個專業的台灣統一發票、傳統收銀機發票與收據光學辨識專家。請從這張發票或收據圖片中精確提取以下資訊，並只以乾淨的 JSON 格式回傳：
{
  "invoiceNumber": "發票號碼，必須為 2 碼大寫英文字軌 + 8 碼數字，例如 EE21608064，若發票上無字軌號碼則填 null",
  "invoiceDate": "開立日期，格式為 YYYY-MM-DD，若發票上標示為民國年（例如 115年10月14日）請自動轉換為西元年（如 2026-10-14），若完全無法辨識日期則填 null",
  "totalAmount": "總計、合計、實收金額或現盈，純整數數字，例如 440，若無則填 null",
  "merchantName": "店家名稱、開立單位或營業人名稱；若無明確店名但有地址（如 桃園市中壢區實踐路225之1號），可填入該地址，若皆無則填 null",
  "itemsSummary": "購買的商品品名、數量與單價/小計簡述，多項以頓號分隔，若無品項明細則填 null"
}`;

  // 優先使用 Google 最新支援的輕量視覺模型 gemini-3.5-flash-lite，遇例外自動依序回退備援
  const candidateModels = [
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.8-flash',
  ];

  for (const model of candidateModels) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY.trim()}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType,
                    data: cleanBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        }),
      });

      clearTimeout(timer);

      if (!response.ok) {
        const errJson = await response.json().catch(() => null);
        console.warn(`[GeminiInvoice] 模型 ${model} 請求失敗 (${response.status}):`, errJson?.error?.message);
        continue;
      }

      const json = await response.json();
      const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) continue;

      let parsedAI: GeminiInvoiceResult;
      try {
        parsedAI = JSON.parse(rawText);
      } catch {
        const match = rawText.match(/\{[\s\S]*\}/);
        if (match) {
          parsedAI = JSON.parse(match[0]);
        } else {
          continue;
        }
      }

      const transformed = transformGeminiResultToInvoice(parsedAI);
      if (transformed) {
        return transformed;
      }
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        console.warn(`[GeminiInvoice] 模型 ${model} 請求逾時`);
        continue;
      }
      console.warn(`[GeminiInvoice] 模型 ${model} 執行例外:`, err);
    }
  }

  return null;
};
