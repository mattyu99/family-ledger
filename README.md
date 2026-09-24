# 👨‍👩‍👧 家庭共同記帳 APP (Family Ledger)

這是一套支援 **iOS、Android 手機與電腦瀏覽器（Web）** 的家庭共同記帳應用程式。具備**多人協同記帳、即時雲端同步、離線隨身記帳、代墊款平分結算**與**一鍵匯出 Excel 備份**功能。

---

## ✨ 核心特色與架構

1. **跨平台運行（React Native + Expo）**：一套程式碼同時支援 iPhone、Android 與電腦瀏覽器。
2. **雲端即時同步（Supabase PostgreSQL）**：
   - 具備 **RLS（Row Level Security）** 權限隔離，確保只有同帳本的家庭成員能看見彼此的帳目。
   - 支援 WebSocket 毫秒級即時同步，有人記帳時全家手機立即更新。
3. **離線優先（Local-First）**：
   - 在地下室賣場或無網路時依然可流暢記帳，資料先保存在手機本地快取，連網後自動同步至雲端。
4. **代墊與平分結算**：
   - 清楚統計各成員（例如爸爸、媽媽）的代墊付款比例。
   - 支援單筆消費「全家平分分攤」，自動計算代墊差額。
5. **資料完全掌控**：
   - 支援一鍵將整本帳目匯出為標準 **CSV / Excel** 格式，隨時可備份到自己的 Google Drive 或電腦。

---

## 📁 專案檔案結構

```text
family-ledger/
├── supabase_schema.sql       # 雲端資料庫建置腳本 (包含表格、RLS安全規則、即時推播)
├── App.tsx                   # 應用程式主畫面 (明細、統計圖表、家庭設定三頁籤)
├── src/
│   ├── types/database.ts     # TypeScript 資料庫型別定義
│   ├── lib/supabase.ts       # Supabase 客戶端連線與本地 AsyncStorage 快取
│   ├── context/LedgerContext.tsx # 全域記帳狀態管理 (新增、刪除、匯出、代墊計算)
│   └── components/
│       ├── TransactionItem.tsx   # 單筆記帳明細卡片 (圖示、金額、代墊人標籤)
│       └── AddTransactionModal.tsx # 新增記帳互動彈窗 (收支切換、類別選擇、平分切換)
├── package.json
└── README.md
```

---

## 🚀 啟動與測試步驟

此專案已在 WSL2 (`flex-test`) 環境下完成 Node.js 與相依套件安裝：

### 1. 啟動 Expo 開發伺服器

在 WSL2 終端機中執行：

```bash
cd /mnt/c/Users/tpimatyu/.gemini/antigravity/scratch/family-ledger
npx expo start
```

### 2. 檢視與測試畫面

啟動後終端機會顯示一個 **QR Code** 與操作選單：
- **電腦瀏覽器檢視**：在終端機直接按鍵盤上的 **`w`** 鍵，即可在電腦瀏覽器打開網頁版。
- **手機實機測試**：
  - **iPhone**：打開「相機」直接掃描終端機上的 QR Code（需先安裝 [Expo Go App](https://apps.apple.com/app/expo-go/id982107779)）。
  - **Android**：打開 [Expo Go App](https://play.google.com/store/apps/details?id=host.exp.exponent) 內的掃描器掃描 QR Code。

---

## ☁️ 連接至真實 Supabase 雲端資料庫（選用）

本系統預設自帶**本地示範與離線快取模式**，您可以立即點擊操作體驗。若要啟用真正的雲端多人同步：

1. 前往 [Supabase 官網](https://supabase.com) 註冊並免費建立一個專案。
2. 在 Supabase 後台左側點擊 **SQL Editor**，將本專案目錄下的 `supabase_schema.sql` 內容複製貼上並執行（一鍵自動建立所有資料表、RLS 安全機制與預設分類）。
3. 前往專案 **Settings -> API** 複製 `Project URL` 與 `anon public key`。
4. 在本專案根目錄建立 `.env` 檔案（或直接修改 `src/lib/supabase.ts`）：
   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
5. 重新啟動 App，頂部的狀態徽章將立即轉為 **🟢 雲端即時同步**！
