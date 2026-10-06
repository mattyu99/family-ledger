# 💖 甜心記帳本 (Sweetheart Family Ledger) v1.0.2

一套基於 **React Native + Expo SDK 57** 與 **Supabase PostgreSQL Realtime** 打造的跨平台家庭共同記帳系統。  
支援 **Android 原生 App（APK）、電腦網頁版（Web）與手機瀏覽器（PWA）** 多端併行，具備**多人協同記帳、即時雙向同步、離線隨身記帳、4 位數安全防護、資料自主備份**與**雲端 OTA 熱更新**功能。

---

## 🌟 核心特色與架構

1. **多端併行運作（手機 APK + 電腦網頁 Web）**：
   - **外出隨手記**：手機安裝 Android APK 原生 App，外出買菜、加油、用餐秒開秒記。
   - **月末大螢幕對帳**：電腦瀏覽器開啟網頁版，大螢幕檢視收支統計與一鍵匯出 Excel。
   - **資料 100% 即時互通**：所有終端皆連線至同一組 Supabase 雲端資料庫，手機記帳電腦即刻跳出。
2. **一人一機身分架構（聚焦家庭共同公帳）**：
   - 每位家庭成員各自使用自己的手機進入帳本，首頁清晰標記 `📱 我 (本機)`。
   - 記帳時預設自動帶入本人身分，亦可自由切換「付款人」指定由誰代表支付。
   - **溫馨家庭公帳邏輯**：系統完全專注於全家收支透明掌控，不需繁複的內部借貸或 AA 平攤計算。
3. **完善的管理員權限與安全體系**：
   - **4 位數安全 PIN 碼**：預設為 `8888`，管理員可自由修改。新裝置認領管理員身分時須驗證此碼，防止他人冒充奪權。
   - **最後一位管理員防呆保護**：系統強制每本公帳至少保留一位管理員，禁止自己降級自己，亦無法將最後一位管理員降級。
   - **PIN 碼緊急救援恢復**：若在其他裝置遺失管理員權限，一般成員可憑 4 位數 PIN 碼一鍵即時升級/恢復為管理員。
   - **角色預覽模式（Preview Mode）**：管理員可一鍵切換至一般成員視角進行權限測試，頂部常駐提示橫幅且可一鍵安全退出。
4. **靈活的邀請碼與門牌機制**：
   - 帳本底層綁定全球唯一永久 ID（`ledger_id`），邀請碼為尋路門牌。
   - 支援「自訂邀請碼（如 `SWEETHOME`）」與「重新產生隨機邀請碼（舊碼自動作廢）」。
   - **資料庫級唯一性防撞**：全系統同一時間一組代碼只對應唯一帳本，絕不打架混淆。
   - 支援複製專屬邀請連結（含網址參數），LINE 傳送給家人點開即可自動帶入加入。
5. **OTA 無感熱更新（EAS Update）與版本資訊卡**：
   - 手機安裝一次 APK，日後前端介面更新**無需重新下載安裝 APK**，打開 App 自動在背景抓取最新介面。
   - 家庭分頁底部提供「應用程式版本資訊」卡片，清楚顯示版本號、Update ID、更新發布時間，並提供【🔄 檢查並載入最新版本】手動更新鈕。
6. **離線優先（Local-First）與極致效能**：
   - 無網路或賣場地下室仍可流暢記帳，連網後自動補推同步。
   - 採用當月快照與分批無感加載技術，累積數萬筆資料依然秒開。

---

## 📋 歷次功能演進與重大更新記錄 (Changelog)

### 🚀 v1.0.2 (當前最新版本)

#### 1. 🛡️ 企業級資料掌控與定期備份排程（方案 B）
* **UTF-8 BOM 防中文亂碼**：匯出 CSV 報表時自動注入 `\uFEFF` BOM，在 Windows Microsoft Excel、Google 試算表與 Apple Numbers 繁體中文 100% 正常顯示無亂碼。
* **JSON 完整結構化備份**：完整匯出帳本資訊、成員稱謂頭像、自訂分類顏色及全量歷史明細高精度封包。
* **一鍵存檔至個人雲端硬碟**：
  * 原生手機 App 串接系統分享面板（Share Sheet），支援直接存入 Google 雲端硬碟、iCloud Drive、檔案總管或 LINE 備忘錄。
  * 電腦 Web 版支援 Web Share API 及瀏覽器直接下載保存。
* **App 內週期備份排程與溫馨提醒（方案 B）**：
  * 支援 **每週 (7天)**、**每雙週 (14天)**、**每月 (30天)** 提醒頻率切換與自訂開關。
  * 即時追蹤上次備份時間戳記與相對時間（例如：`上次備份：2026/10/05 18:30 (剛剛)`）。
  * 到期自動於「明細」首頁頂部浮現溫馨提醒橫幅（附 `🚀 立即備份至雲端硬碟` 與 `✕ 稍後提醒` 按鈕）。
  * 無論分享、下載或複製，系統皆會自動更新上次備份時間並重設計時。

#### 2. ⚡ 極致效能架構（方案 A + 方案 C）
* **預設當月快照（方案 C）**：初次開啟預設專注當月明細與統計，告別全量歷史渲染的遲鈍感。
* **無感分批滾動載入（方案 A Lazy Loading）**：以 20 筆為單位無感分批加載，底層累積萬筆帳目依然秒開、60FPS 流暢滑動。
* **跨維度多條件篩選**：支援依「月份」（歷年任意月份）與「付款人」交叉篩選，頂部收支摘要即時動態連動。
* **跨裝置即時刪除同步**：加入刪除 ID 快取防護，徹底解決跨裝置 Realtime 快取競態與已刪明細復活問題。

#### 3. 📊 全新財務分析中心（Analytics Hub）
* **任意月份選擇器（MonthPickerModal）**：支援歷年跨年度左右快速翻閱與 12 個月份網格直覺挑選。
* **四大財務 KPI 總覽看板**：總支出、總收入、月結餘（附健康度色彩）及「日均支出」。
* **收支類別排行切換（支出 vs 收入）**：前三名金銀銅牌徽章、金額、百分比與動態彩色進度條。
* **家庭成員支出貢獻視覺化**：直觀掌握每位家庭成員支出總額與佔比。

#### 4. 📅 歷史補記與任意日期挑選器（DatePickerModal）
* **快捷快速標籤**：新增與編輯記帳時提供「今天」、「昨天」、「前天」一鍵快捷選取，忘記當天記帳次日秒補記。
* **歷年月曆彈窗**：點擊「🗓️ 更多...」開啟月曆視圖，支援翻閱任意年份月份挑選日期，已選自訂日期清楚標註。

#### 5. 🔔 多裝置即時動態泡泡通知（方案 A：LiveToastBanner）
* **跨裝置即時動態感知**：當其他家人在不同手機或網頁記帳、編輯或刪除帳目時，已開啟 App 的家人畫面上方會優雅滑出即時動態泡泡（例如：`🎉 媽媽 剛記了一筆！ 🛒 全聯生鮮超市 -NT$ 680`）。
* **溫馨不打擾設計**：無推播干擾，僅在 App 開啟中呈現，展示成員頭像、動作、類別與金額，點擊或 4 秒後自動滑出淡出。
* **內建即時模擬測試**：家庭分頁底部版本資訊卡新增「🔔 測試即時動態泡泡通知」按鈕，單機即可隨時體驗效果。

#### 6. 🤖 Supabase 永不休眠保活 ＋ LINE 群組每日收支日報（方案 2）
* **Supabase 永不休眠（Keep-Alive）**：透過 GitHub Actions 每天定時對 Supabase 進行外部 API 存取打卡，重設 7 天休眠計時器，徹底杜絕免費版資料庫因無人使用而被暫停（Paused）的風險。
* **LINE 原生高質感 Flex 卡片日報**：每天 21:30 定時運算當日收支與月度累計，以 LINE 官方 Flex Message 原生卡片推播至家庭 LINE 群組（或個人 LINE），版面自帶圓角卡片與嚴格對齊，手機閱讀絕對不折行、不破版。
* **智慧單一帳本自動鎖定**：即使資料庫有多本測試帳本，系統自動比對最近活躍記錄，每晚只發送剛好 1 則訊息，絕不重複騷擾洗版。

#### 7. 🎨 品牌視覺與移動端體驗重構
* **全域字型縮放防禦（Typography Defense）**：全 App 採用 `allowFontScaling={false}` 與 `maxFontSizeMultiplier={1.08}`，徹底根絕長輩機/大字體模式下金額文字被截斷、換行破版問題。
* **甜心記帳本專屬品牌視覺**：3D 黏土風（Claymorphism）小豬存錢筒與溫馨小屋高解析度 Adaptive App Icon。
* **分類趣味頭像庫（AvatarPicker）**：涵蓋家庭成員、萌寵、寶可夢三大群組豐富 Emoji 頭像。
* **精簡膠囊成員清單（Pill Chips）**：消除舊版成員卡片佔用巨大垂直空間的問題。
* **自訂分類管理**：管理員可自訂專屬消費與收入分類、挑選 Emoji 圖示與色票，支援離線快取與 UUID 自動映射。

#### 8. 🏪 店家 / 付款對象智慧自學習與快捷膠囊推薦
* **店家 / 付款對象選填欄位**：記帳時可選填消費店家或收款對象（如：全聯、好市多、麥當勞、中油、台電），讓明細列表一目了然，保留備註欄位的純粹性。
* **動態自學習記憶庫（recentMerchants）**：無論本機手動輸入或家人跨裝置記帳，系統自動動態學習新店家並於本機快取持久化，完全不需手動維護繁瑣名冊。
* **分類關聯推薦 ＋ 首字即時聯想過濾**：
  * 切換「餐飲伙食」、「生鮮超市」、「交通出行」等不同分類時，自動推薦該類型的台灣家庭熱門常用店家。
  * 輸入框支援首字/關鍵字即時比對，打一個字立刻篩選出膠囊標籤，1 鍵點選秒速代入。
* **明細列表與報表完整整合**：
  * 明細列表項目的分類名稱旁自動展示精緻的店家膠囊徽章。
  * CSV 報表匯出新增獨立「店家/對象」欄位、JSON 結構化備份完整收錄。
  * LINE Flex Message 每日收支日報自動渲染 `🍲 餐飲伙食 · 麥當勞` 清楚排版。
* **雲端平滑相容防護（Zero-Downtime Fallback）**：自動探測雲端 Supabase 是否已新增 `merchant` 欄位；若尚未執行 SQL 遷移，自動以 `[店家] 備註` 格式平滑封裝與雙向還原，跨版本零中斷。

---

### 📦 v1.0.1
* 支援自訂分類離線持久化與雲端 Supabase 同步相容映射。
* 強化管理員安全 PIN 碼驗證與邀請碼唯一性防護。
* 建立 EAS Update 遠端熱更新通道與環境變數隔離。

---

### 🚀 v1.0.0
* 初始版本上線，完成基礎記帳 CRUD、Supabase 雙向同步、離線快取與 CSV 基本匯出。

---

## 📁 專案檔案結構

```text
family-ledger/
├── App.tsx                     # 主畫面 (明細列表、統計圖表、家庭成員與設定、定期備份橫幅)
├── app.json                    # Expo 與 Android 原生配置 (套件名稱、圖示、版本 v1.0.2)
├── eas.json                    # Expo EAS Build 雲端打包與 EAS Update 頻道設定
├── package.json                # 專案相依性與 npm 快速建置腳本 (v1.0.2)
├── supabase_schema.sql         # Supabase PostgreSQL 完整腳本 (表格、RLS 安全策略、RPC)
├── src/
│   ├── types/database.ts       # TypeScript 資料庫型別定義
│   ├── lib/
│   │   ├── supabase.ts         # Supabase 連線客戶端與配置檢查
│   │   ├── uuid.ts             # 跨平台 UUID 生成工具
│   │   └── icons.ts            # 分類圖示對照輔助函式
│   ├── context/
│   │   └── LedgerContext.tsx   # 全域帳本狀態 (CRUD、定期備份設定、角色權限、快取)
│   └── components/
│       ├── TransactionItem.tsx # 單筆消費/收入卡片 (防爆字設計)
│       ├── AddTransactionModal.tsx  # 新增記帳彈窗 (收支切換、類別選擇、付款人指定、補記日期)
│       ├── EditTransactionModal.tsx # 編輯既有記帳明細彈窗 (支援修改日期、付款人)
│       ├── DatePickerModal.tsx # 補記歷史日期挑選器 (快速今天/昨天/前天 + 歷年月曆)
│       ├── LiveToastBanner.tsx # 跨裝置即時動態感知泡泡通知 (方案 A 動畫彈窗)
│       ├── AvatarPicker.tsx    # 分類趣味頭像挑選器 (家庭成員、萌寵、寶可夢)
│       └── MonthPickerModal.tsx# 歷年月份任意挑選彈窗 (年份切換 + 12個月網格)
├── .github/
│   └── workflows/
│       └── daily-report-keepalive.yml # GitHub Actions 每日定時防休眠與 LINE 日報排程
├── scripts/
│   └── daily-report.mjs          # 每日收支計算、Supabase 保活與 LINE Flex 卡片生成腳本
└── assets/                     # 甜心記帳本 3D 黏土風圖示、自適應啟動圖與 Favicon
```

---

## ☁️ 連接至真實 Supabase 雲端資料庫（選用）

本系統預設自帶**本地示範與離線快取模式**，即使不連接雲端亦可立即點擊操作體驗。若要啟用真正的雲端多人同步：

1. 前往 [Supabase 官網](https://supabase.com) 註冊並免費建立一個專案。
2. 在 Supabase 後台左側點擊 **SQL Editor**，將本專案目錄下的 `supabase_schema.sql` 內容複製貼上並執行（一鍵自動建立所有資料表、RLS 安全機制、RPC 儲存程序與預設分類）。
3. 前往專案 **Settings -> API** 複製 `Project URL` 與 `anon public key`。
4. 在本專案根目錄建立 `.env` 檔案（或直接修改 `src/lib/supabase.ts`）：
   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxxxxxxxxxxxxxxxxxx
   ```
5. 重新啟動 App 或重新整理網頁，頂部的狀態徽章將立即轉為 **🟢 雲端已同步**！

---

## 🤖 LINE 機器人每日收支日報 ＆ Supabase 永不休眠（Keep-Alive）指南

系統內建了全自動化的 **GitHub Actions 雲端守護排程**，每天台灣時間 **21:30 (UTC 13:30)** 自動喚醒執行，達成兩大核心效益：
1. **Supabase 永不休眠（Keep-Alive）**：向 Supabase 進行真實 API 存取打卡，重設 7 天休眠計時器，徹底杜絕免費版資料庫被暫停（Paused）的風險。
2. **LINE 原生高質感 Flex 卡片日報**：統計全家今日開銷、成員貢獻與本月進度，推播至家庭 LINE 共同群組（或個人），排版嚴格對齊、永不破版折行。

### 📋 快速串接 4 步驟指南

#### 步驟 1：建立免費 LINE 官方帳號並啟用 Messaging API
1. 前往 [LINE Developers Console](https://developers.line.biz/)，點擊「Create a LINE Official Account」建立官方帳號（名稱可取為「甜心記帳本小幫手」）。
2. 在 LINE 官方帳號管理後台點選 **設定 ➜ Messaging API ➜ 啟用 Messaging API**，選擇您的 Provider 並確認啟用。
3. 回到 LINE Developers 控制台進入該頻道 ➜ **Messaging API** 頁籤最下方 ➜ 點擊 **Issue** 複製 **Channel Access Token**。

#### 步驟 2：取得家庭群組 Group ID（30 秒免註冊工具）
1. 用電腦打開免註冊測試工具 [https://webhook.site](https://webhook.site)，點擊頂部 **Copy** 複製專屬網址。
2. 在 LINE Developers 的 **Messaging API** 頁籤中：
   * 找到 **Webhook URL** ➜ 貼上該網址並儲存。
   * 將 **Use webhook** 開關切換為**開啟（綠色）**。
3. 打開手機 LINE，將「甜心記帳本小幫手」邀請加入全家人的 **LINE 家庭群組**（若已在群組，在群組隨便發一句話如 `123`）。
4. 查看 Webhook.site 網頁，在接收到的內容中找到 `"groupId": "Cxxxxxxxx..."`，複製該 **`C` 開頭代碼**。

#### 步驟 3：設定 GitHub 倉庫 Secrets
前往您的 GitHub 專案：**Settings ➜ Secrets and variables ➜ Actions ➜ New repository secret**，填入以下密鑰：

| Secret 名稱 | 說明與填寫內容 | 必要性 |
| :--- | :--- | :--- |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 後台 **Project Settings ➜ API** 複製的 `service_role` (secret) 金鑰 | **強烈建議**（穿透 RLS 安全機制讀取帳本明細） |
| `LINE_CHANNEL_ACCESS_TOKEN` | 步驟 1 取得的 LINE Channel Access Token | 啟用 LINE 推播必填 |
| `LINE_TARGET_ID` | 步驟 2 取得的家庭群組 `Group ID`（`C...`）或個人 `User ID`（`U...`） | 啟用 LINE 推播必填 |
| `LEDGER_ID` | （選填）指定帳本 UUID。若不填系統會自動智慧鎖定最近活躍的單一主帳本 | 選填 |

#### 步驟 4：測試與驗證
* **GitHub 網頁手動觸發**：前往 GitHub 專案的 **Actions ➜ Supabase Keep-Alive & Daily Report ➜ Run workflow**，20 秒內 LINE 群組即可收到卡片！
* **本地終端機測試**：在本地 `.env` 填入上述變數後，執行：
  ```bash
  npm run report:daily
  ```

---

## 🚀 常用指令與運維操作

### 1. 本地開發與除錯
```bash
npx expo start        # 啟動開發伺服器
npx expo start --web  # 直接開啟網頁版除錯
npx tsc --noEmit      # 執行 TypeScript 靜態型別檢查
```

### 2. 部署電腦網頁版（GitHub Pages）
若修改了前端程式碼，發布至網頁版只需一行：
```bash
npm run deploy:web
```
發布後電腦重新整理頁面（[https://mattyu99.github.io/family-ledger/](https://mattyu99.github.io/family-ledger/)）即可體驗最新版。

### 3. 編譯 Android 原生 APK 安裝檔（EAS Build）
使用 Expo 官方免費雲端伺服器打包 APK（免裝本機 Android Studio）：
```bash
# 第一次使用前請先登入 Expo 帳號
npx eas-cli@latest login

# 啟動雲端打包 APK (產出直接可安裝的 .apk 檔)
npm run build:android
```
編譯完成後，終端機會直接顯示 **下載連結** 與 **QR Code**，手機掃碼即可下載安裝。

### 4. 推播手機 App 熱更新（EAS Update / OTA）
手機安裝過熱更新正式版 APK 後，未來修改介面**不需要重新打包 APK**，直接推播：
```bash
npm run update:android -- --message "版本更新備註"
```
家人手機下次打開 App 時就會自動無感套用最新畫面。

---

## 🏷️ 版本號更新規範（語意化版本 SemVer）

本系統遵循 `主版本 (Major) . 次版本 (Minor) . 修訂號 (Patch)` 格式：

* **修訂號 (Patch，例如 `1.0.1` ➜ `1.0.2`)**：用於修正 Bug、介面微調、效能優化與備份功能擴展。
* **次版本 (Minor，例如 `1.0.2` ➜ `1.1.0`)**：新增全新大功能模組（如自訂預算警示），原有功能相容。
* **主版本 (Major，例如 `1.x.x` ➜ `2.0.0`)**：重大架構改版或底層資料表重構。

### 如何前進版本號？
只要打開 **`app.json`** 與 **`package.json`**，將 `"version"` 修改為新版本號（如 `"1.0.2"`），App 介面卡片將**自動連動顯示**新版本號！

---

## 🛡️ 品質規範與最佳實踐

1. **溫馨家庭公帳共同分擔原則**：全系統完全以家庭公帳共同分擔支出為核心，無借貸討債負擔，不需繁複的內部平攤計算。
2. **極致防爆字排版**：所有文字元素皆具備 `allowFontScaling={false}` 與 `maxFontSizeMultiplier={1.08}`，確保跨廠牌手機排版整齊統一。
3. **管理員安全 PIN 碼**：預設 PIN 碼為 **`8888`**。建立帳本後，建議管理員前往【成員】頁面修改為專屬 PIN 碼，並妥善與另一位主要管理者共享。
4. **定期備份習慣**：善用內建的 7/14/30 天自動提醒，一鍵存檔備份至個人 Google 雲端硬碟或 iCloud，守護家庭核心資產歷史。
