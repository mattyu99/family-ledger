---
name: playwright-ui-verify
description: >-
  Use this skill whenever verifying UI layout, styling, dark mode contrast, or
  elderly large-font (125%) rendering in the family-ledger Expo Web app. Builds
  the latest web bundle and runs a zero-AI-token Playwright headless Chromium
  script to capture mobile screenshots across themes and font sizes for visual
  inspection.
---

# Playwright 背景 UI 截圖驗收（省 Token 流程）

當完成任何 UI 元件、彈窗、配色或字體排版修改後，使用本流程在背景以無頭 Chromium 產出實機手機截圖並直接讀圖檢視，取代逐步點擊的高 Token 瀏覽器代理。

## 標準執行步驟

1. **型別、Lint 與打包最新 Web Bundle**（避開沙盒 `.expo` 寫入限制）：
   ```bash
   npx tsc --noEmit && EXPO_NO_TELEMETRY=1 npx expo lint && HOME=/tmp EXPO_NO_TELEMETRY=1 npx expo export -p web
   ```
   - 打包產物位於 `dist/`（已列於 `.gitignore`，不影響 git 狀態）。

2. **以單一 Node.js 腳本執行臨時伺服器＋Playwright 多情境截圖**（0 AI Token）：
   - 於腳本內啟動監聽 `127.0.0.1:0` 的臨時 HTTP 伺服器服務 `dist/`，並將 `/family-ledger` 路徑前綴對應至 `dist/`，截圖完成後立即 `server.close()`，不留常駐行程。
   - 預設以 `page.route` 攔截所有非 `127.0.0.1` 的外部請求（離線安全、不碰雲端 Supabase）。
   - 至少覆蓋以下視窗與設定組合（`deviceScaleFactor: 2`）：
     - `390×844` 標準字級（`standard`）＋ 淺色（`light`）
     - `390×844` 特大長輩字級（`extra_large`，125%）＋ 深色（`dark`）
     - 容易擠壓的畫面加測窄螢幕 `360×780`
   - 截圖一律輸出至當前對話的 `<appDataDir>/brain/<conversation-id>/scratch/`，絕不寫入專案工作目錄。

3. **狀態注入關鍵鍵名與避坑規範（`page.addInitScript`）**：
   - 主題與字級：
     - `@family_ledger_theme_mode`: `'light'` | `'dark'`
     - `@family_ledger_font_size_level`: `'standard'` | `'extra_large'`
   - 帳本與成員：
     - `@family_ledger_current`、`@family_ledger_current_user`、`@family_ledger_current_user_${ledgerId}`、`@family_ledger_members`、`@family_ledger_has_joined = 'true'`
   - 帳戶與交易（**重要避坑**）：
     - 所有模擬資料之 `id`、`ledger_id`、`account_id`、`category_id` **必須為合法 UUID v4 格式**（`LedgerContext` 會透過 `isValidUUID` 過濾非 UUID 資料）。
     - 卡片帳戶須同時寫入 `@family_ledger_payment_accounts` 與 `@family_ledger_payment_accounts_${ledgerId}`，歸屬與結帳日欄位為 `user_id`、`billing_cycle_date`。
     - 交易須同時寫入 `@family_ledger_transactions` 與 `@family_ledger_transactions_${ledgerId}`，付款人與時間欄位為 `paid_by`、`created_by`、`transacted_at`。
   - 刻意注入壓力測試資料：超長店家名稱、多張同銀行卡片合併、多個標籤（來源卡＋行動支付＋點數折抵）、含發票標籤之備註。

4. **讀圖視覺驗收清單（以 `read_file` 檢視截圖）**：
   - 文字無異常截斷成 `...`（特別是店家名稱、卡片名稱、備註、標題提示）。
   - 按鈕與切換列在 100% 與 125% 長輩字級下皆置中對齊、無孤字折行、無括號拆行。
   - 深色模式無硬編碼亮白／淺底刺眼塊，標籤文字對比清晰易讀。
   - 無內部中繼格式外洩（例如 `[🧾 ...]` 發票標籤、UUID 字串）。

## 何時改用 Chrome 遠端偵錯代理
- 僅當需要即時互動除錯，或使用者明確要求檢視其 WSL Chrome 已登入之真實測試帳本分頁時，才改用 `browser` 子代理。
