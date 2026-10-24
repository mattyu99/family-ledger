import {
  ParsedInvoiceData,
  formatInvoiceNumber,
  getInvoicePeriodKey,
  cleanBusinessName,
  inferCategoryFromIndustry,
} from './invoice';

// 優先自環境變數讀取 Google Gemini API 金鑰
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';

/**
 * 檢查目前是否已設定 Google AI 辨識金鑰
 */
export const isGeminiAIAvailable = (): boolean => {
  return Boolean(GEMINI_API_KEY && GEMINI_API_KEY.trim().length > 10);
};

export interface GeminiInvoiceResult {
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  totalAmount?: number | string | null;
  merchantName?: string | null;
  itemsSummary?: string | null;
}

/**
 * 透過 Google Gemini 視覺模型 (Gemini 3.5 Flash-Lite / Flash)
 * 進行傳統長條發票、收據與手開發票之高精度光學文字與結構化欄位辨識
 */
export const recognizeInvoiceWithGemini = async (
  base64Data: string,
  mimeType = 'image/jpeg',
  timeoutMs = 12000
): Promise<ParsedInvoiceData | null> => {
  if (!isGeminiAIAvailable()) {
    console.warn('[GeminiInvoice] 未設定 EXPO_PUBLIC_GEMINI_API_KEY，略過 AI 辨識');
    return null;
  }

  // 清理 base64 字串中可能帶有的 data:image/...;base64, 前綴
  const cleanBase64 = base64Data.replace(/^data:image\/[a-zA-Z]+;base64,/, '').trim();
  if (!cleanBase64) return null;

  const prompt = `你是一個專業的台灣統一發票與收據光學辨識專家。請從這張發票圖片中精確提取以下資訊，並只以乾淨的 JSON 格式回傳：
{
  "invoiceNumber": "發票號碼，必須為 2 碼大寫英文字軌 + 8 碼數字，例如 EF67886270，若發票上無字軌號碼則填 null",
  "invoiceDate": "開立日期，格式為 YYYY-MM-DD，若發票上標示為民國年（例如 115年9月26日）請自動轉換為西元年（如 2026-09-26），若完全無法辨識日期則填 null",
  "totalAmount": "總計、合計或實收金額，純整數數字，例如 4310，若無則填 null",
  "merchantName": "店家、開立單位或營業人名稱，例如 九族文化村，若無則填 null",
  "itemsSummary": "購買的商品品名、數量與單價/小計簡述，多項以頓號分隔，例如 門票 $4160、小客車 $150，若無則填 null"
}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // 優先使用輕量極速的 gemini-3.5-flash-lite，遇例外則自動回退至 gemini-3.5-flash
  const candidateModels = ['gemini-3.5-flash-lite', 'gemini-3.5-flash'];

  for (const model of candidateModels) {
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

      clearTimeout(timer);

      // 若未辨識出任何關鍵資訊 (號碼與金額皆為空)，視為無效結果
      const rawNum = (parsedAI.invoiceNumber || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      const totalAmountNum =
        parsedAI.totalAmount !== null && parsedAI.totalAmount !== undefined
          ? parseInt(String(parsedAI.totalAmount).replace(/[^0-9]/g, ''), 10)
          : undefined;

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
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.warn(`[GeminiInvoice] 模型 ${model} 請求逾時`);
        break;
      }
      console.warn(`[GeminiInvoice] 模型 ${model} 執行例外:`, err);
    }
  }

  clearTimeout(timer);
  return null;
};
