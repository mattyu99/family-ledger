import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { base64Data, mimeType = "image/jpeg" } = await req.json();
    if (!base64Data) {
      return new Response(JSON.stringify({ error: "Missing base64Data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 🔒 自雲端環境變數讀取 Google Gemini API Key（徹底不對 App 客戶端暴露）
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("EXPO_PUBLIC_GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "Server GEMINI_API_KEY secret not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanBase64 = base64Data.replace(/^data:image\/[a-zA-Z]+;base64,/, "").trim();

    const prompt = `你是一個專業的台灣統一發票與收據光學辨識專家。請從這張發票圖片中精確提取以下資訊，並只以乾淨的 JSON 格式回傳：
{
  "invoiceNumber": "發票號碼，必須為 2 碼大寫英文字軌 + 8 碼數字，例如 EF67886270，若發票上無字軌號碼則填 null",
  "invoiceDate": "開立日期，格式為 YYYY-MM-DD，若發票上標示為民國年（例如 115年9月26日）請自動轉換為西元年（如 2026-09-26），若完全無法辨識日期則填 null",
  "totalAmount": "總計、合計或實收金額，純整數數字，例如 4310，若無則填 null",
  "merchantName": "店家、開立單位或營業人名稱，例如 九族文化村，若無則填 null",
  "itemsSummary": "購買的商品品名、數量與單價/小計簡述，多項以頓號分隔，例如 門票 $4160、小客車 $150，若無則填 null"
}`;

    // 優先使用 gemini-2.5-flash 或 gemini-1.5-flash 模型進行視覺辨識
    const candidateModels = ["gemini-2.5-flash", "gemini-1.5-flash"];
    let lastError = null;

    for (const model of candidateModels) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY.trim()}`;
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
              responseMimeType: "application/json",
              temperature: 0.1,
            },
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.warn(`[gemini-ocr] 模型 ${model} 請求失敗 (${response.status}): ${errText}`);
          lastError = errText;
          continue;
        }

        const json = await response.json();
        const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) continue;

        let parsedAI: any;
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

        // 成功辨識，回傳乾淨結構化資料
        return new Response(JSON.stringify({
          success: true,
          model,
          source: "edge-function-proxy",
          ...parsedAI,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err: any) {
        lastError = err?.message;
      }
    }

    return new Response(JSON.stringify({
      error: `Gemini OCR 辨識失敗: ${lastError || "模型無法解析圖片"}`
    }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || "伺服器內部異常" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
