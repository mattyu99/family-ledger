import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';

function cropPngToTightSquare(inputPath) {
  const data = fs.readFileSync(inputPath);
  const png = PNG.sync.read(data);
  const w = png.width;
  const h = png.height;
  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (png.data[idx + 3] > 20) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  
  // 裁切緊湊主體 (上下左右僅保留 6px 微型安全邊界)
  const contentW = maxX - minX;
  const contentH = maxY - minY;
  const size = Math.max(contentW, contentH) + 12;
  const cx = Math.floor((minX + maxX) / 2);
  const cy = Math.floor((minY + maxY) / 2);
  
  const startX = cx - Math.floor(size / 2);
  const startY = cy - Math.floor(size / 2);
  
  const cropped = new PNG({ width: size, height: size });
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const srcX = startX + x;
      const srcY = startY + y;
      const destIdx = (y * size + x) * 4;
      if (srcX >= 0 && srcX < w && srcY >= 0 && srcY < h) {
        const srcIdx = (srcY * w + srcX) * 4;
        cropped.data[destIdx] = png.data[srcIdx];
        cropped.data[destIdx + 1] = png.data[srcIdx + 1];
        cropped.data[destIdx + 2] = png.data[srcIdx + 2];
        cropped.data[destIdx + 3] = png.data[srcIdx + 3];
      } else {
        cropped.data[destIdx + 3] = 0;
      }
    }
  }
  return PNG.sync.write(cropped).toString('base64');
}

const expenseB64 = fs.readFileSync('assets/shortcuts/shortcut_expense.png').toString('base64');
const scanB64 = fs.readFileSync('assets/shortcuts/shortcut_scan.png').toString('base64');
const incomeB64 = fs.readFileSync('assets/shortcuts/shortcut_income.png').toString('base64');
const memoB64 = fs.readFileSync('assets/shortcuts/shortcut_memo.png').toString('base64');

// 緊湊裁切版 (無空白)
const tightExpenseB64 = cropPngToTightSquare('assets/shortcuts/shortcut_expense.png');
const tightScanB64 = cropPngToTightSquare('assets/shortcuts/shortcut_scan.png');
const tightIncomeB64 = cropPngToTightSquare('assets/shortcuts/shortcut_income.png');
const tightMemoB64 = cropPngToTightSquare('assets/shortcuts/shortcut_memo.png');

const artifactPath = '/home/myu/.gemini/antigravity/brain/7d3234ba-d30f-41ef-b2f2-19bc32ba6ded/widget_preview.html';

const htmlContent = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>2x2 桌面小工具圖示改版設計方案比對</title>
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #090d16;
      color: #f1f5f9;
    }
    .widget-box {
      width: 175px;
      height: 175px;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 24px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
    }
    .btn-cell {
      background: #0f172a;
      border: 1px solid #475569;
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      position: relative;
      flex: 1;
      margin: 2.5px;
      transition: all 0.2s ease;
      cursor: pointer;
      overflow: hidden;
    }
    .btn-cell:active {
      transform: scale(0.95);
      background: #1e293b;
    }
  </style>
</head>
<body class="p-6">
  <div class="max-w-6xl mx-auto space-y-8">
    
    <!-- 頂部標題與說明 -->
    <div class="border-b border-slate-700/60 pb-5">
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pink-500/10 border border-pink-500/20 text-pink-400 text-xs font-semibold mb-3">
        🎨 2x2 桌面小工具視覺演繹提案（最新更新版）
      </div>
      <h1 class="text-2xl font-bold text-white tracking-tight">桌面小工具圖示設計方案即時對比</h1>
      <p class="text-slate-400 text-sm mt-1">實測證實原始圖檔竟自帶高達 <strong>55% 的透明空白</strong>！依據您的建議，將空白完全切除並往上微調，呈現大圖且文字不重疊的完美方案。</p>
    </div>

    <!-- 方案切換與橫向畫廊 -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

      <!-- ⭐ 最新推薦：您的新建議方案（去留白 + 上移 + 滿版大圖 + 底部文字不重疊） -->
      <div class="bg-gradient-to-b from-slate-900 to-indigo-950/70 rounded-2xl p-5 border-2 border-indigo-500/60 relative flex flex-col items-center shadow-xl shadow-indigo-500/10">
        <div class="absolute -top-3 right-4 bg-gradient-to-r from-pink-500 to-indigo-500 text-white text-[11px] font-black px-3 py-0.5 rounded-full shadow-lg">
          🌟 您的絕妙提議：去空白上移
        </div>
        <div class="w-full flex items-center justify-between mb-4">
          <span class="text-xs font-bold text-indigo-300 bg-indigo-500/20 px-2.5 py-0.5 rounded-full border border-indigo-500/30">最佳解 (去留白上移)</span>
          <span class="text-xs text-indigo-200/80 font-medium">46dp 實體大圖 + 底部文字</span>
        </div>

        <!-- Widget 模擬容器 -->
        <div class="widget-box ring-2 ring-indigo-500/30">
          <div class="text-[12px] font-bold text-slate-100 mb-2 truncate">甜心記帳本 🍟</div>
          <div class="grid grid-cols-2 grid-rows-2 flex-1">
            <div class="btn-cell pt-1 pb-1 justify-between">
              <img src="data:image/png;base64,${tightExpenseB64}" class="w-[45px] h-[45px] object-contain -mt-0.5 drop-shadow-md">
              <span class="text-[10px] font-bold text-slate-100 leading-none mb-0.5">記支出</span>
            </div>
            <div class="btn-cell pt-1 pb-1 justify-between">
              <img src="data:image/png;base64,${tightScanB64}" class="w-[45px] h-[45px] object-contain -mt-0.5 drop-shadow-md">
              <span class="text-[10px] font-bold text-slate-100 leading-none mb-0.5">掃發票</span>
            </div>
            <div class="btn-cell pt-1 pb-1 justify-between">
              <img src="data:image/png;base64,${tightIncomeB64}" class="w-[45px] h-[45px] object-contain -mt-0.5 drop-shadow-md">
              <span class="text-[10px] font-bold text-slate-100 leading-none mb-0.5">記收入</span>
            </div>
            <div class="btn-cell pt-1 pb-1 justify-between">
              <img src="data:image/png;base64,${tightMemoB64}" class="w-[45px] h-[45px] object-contain -mt-0.5 drop-shadow-md">
              <span class="text-[10px] font-bold text-slate-100 leading-none mb-0.5">隨手記</span>
            </div>
          </div>
        </div>

        <div class="mt-4 text-xs text-indigo-300 w-full bg-indigo-950/50 p-3 rounded-xl border border-indigo-500/30">
          <div class="font-bold text-indigo-200 mb-1">✨ 效果完美解答：</div>
          <p>切除 55% 虛空後，本體等同於原本 52dp 視覺面積！向上對齊後，底下的文字完全獨立、<strong>100% 互不遮擋</strong>，文字與圖案間也不再有尷尬空隙！</p>
        </div>
      </div>

      <!-- 方案 1：現行版 (圖 1 - 未裁切) -->
      <div class="bg-slate-900/80 rounded-2xl p-5 border border-slate-800 flex flex-col items-center opacity-85">
        <div class="w-full flex items-center justify-between mb-4">
          <span class="text-xs font-bold text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-full border border-rose-500/20">現行版 (圖 1)</span>
          <span class="text-xs text-slate-400">32dp (未裁空白)</span>
        </div>
        
        <!-- Widget 模擬容器 -->
        <div class="widget-box">
          <div class="text-[12px] font-bold text-slate-100 mb-2 truncate">甜心記帳本 🍟</div>
          <div class="grid grid-cols-2 grid-rows-2 flex-1">
            <div class="btn-cell">
              <img src="data:image/png;base64,${expenseB64}" class="w-[32px] h-[32px] object-contain">
              <span class="text-[10.5px] font-bold text-slate-200 mt-0.5">記支出</span>
            </div>
            <div class="btn-cell">
              <img src="data:image/png;base64,${scanB64}" class="w-[32px] h-[32px] object-contain">
              <span class="text-[10.5px] font-bold text-slate-200 mt-0.5">掃發票</span>
            </div>
            <div class="btn-cell">
              <img src="data:image/png;base64,${incomeB64}" class="w-[32px] h-[32px] object-contain">
              <span class="text-[10.5px] font-bold text-slate-200 mt-0.5">記收入</span>
            </div>
            <div class="btn-cell">
              <img src="data:image/png;base64,${memoB64}" class="w-[32px] h-[32px] object-contain">
              <span class="text-[10.5px] font-bold text-slate-200 mt-0.5">隨手記</span>
            </div>
          </div>
        </div>

        <div class="mt-4 text-xs text-slate-400 w-full bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
          <div class="font-bold text-slate-300 mb-1">現狀問題分析：</div>
          <p>因為圖檔周圍有 90~140px 的透明留白，被硬塞入 32dp 後物體本體僅剩 20dp，圖案與文字間隔著厚厚的一層透明空氣。</p>
        </div>
      </div>

      <!-- 方案 2：純放圖 (方向一) -->
      <div class="bg-slate-900/80 rounded-2xl p-5 border border-slate-800 flex flex-col items-center">
        <div class="w-full flex items-center justify-between mb-4">
          <span class="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">方向一 (純圖無字)</span>
          <span class="text-xs text-slate-400">52dp 滿版極簡</span>
        </div>

        <!-- Widget 模擬容器 -->
        <div class="widget-box">
          <div class="text-[12px] font-bold text-slate-100 mb-2 truncate">甜心記帳本 🍟</div>
          <div class="grid grid-cols-2 grid-rows-2 flex-1">
            <div class="btn-cell p-1">
              <img src="data:image/png;base64,${tightExpenseB64}" class="w-[50px] h-[50px] object-contain drop-shadow-md">
            </div>
            <div class="btn-cell p-1">
              <img src="data:image/png;base64,${tightScanB64}" class="w-[50px] h-[50px] object-contain drop-shadow-md">
            </div>
            <div class="btn-cell p-1">
              <img src="data:image/png;base64,${tightIncomeB64}" class="w-[50px] h-[50px] object-contain drop-shadow-md">
            </div>
            <div class="btn-cell p-1">
              <img src="data:image/png;base64,${tightMemoB64}" class="w-[50px] h-[50px] object-contain drop-shadow-md">
            </div>
          </div>
        </div>

        <div class="mt-4 text-xs text-slate-400 w-full bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
          <div class="font-bold text-slate-300 mb-1">優點與考量：</div>
          <p>極簡純淨，方格全被 3D 佔滿；缺點是沒有文字防呆，必須記住左上支出/左下收入的位置。</p>
        </div>
      </div>

      <!-- 方案 3：回歸經典原版 Emoji (圖 2) -->
      <div class="bg-slate-900/80 rounded-2xl p-5 border border-slate-800 flex flex-col items-center">
        <div class="w-full flex items-center justify-between mb-4">
          <span class="text-xs font-bold text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded-full border border-blue-500/20">原版 Emoji (圖 2)</span>
          <span class="text-xs text-slate-400">28sp Emoji + 文字</span>
        </div>

        <!-- Widget 模擬容器 -->
        <div class="widget-box">
          <div class="text-[12px] font-bold text-slate-100 mb-2 truncate">甜心記帳本 🍟</div>
          <div class="grid grid-cols-2 grid-rows-2 flex-1">
            <div class="btn-cell">
              <span class="text-[26px] leading-none mb-0.5">💸</span>
              <span class="text-[10.5px] font-bold text-slate-200">記支出</span>
            </div>
            <div class="btn-cell">
              <span class="text-[26px] leading-none mb-0.5">📷</span>
              <span class="text-[10.5px] font-bold text-slate-200">掃發票</span>
            </div>
            <div class="btn-cell">
              <span class="text-[26px] leading-none mb-0.5">💰</span>
              <span class="text-[10.5px] font-bold text-slate-200">記收入</span>
            </div>
            <div class="btn-cell">
              <span class="text-[26px] leading-none mb-0.5">📝</span>
              <span class="text-[10.5px] font-bold text-slate-200">隨手記</span>
            </div>
          </div>
        </div>

        <div class="mt-4 text-xs text-slate-400 w-full bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
          <div class="font-bold text-slate-300 mb-1">優點與考量：</div>
          <p>高彩度、高對比、零學習成本；但缺少 3D 黏土專屬的家庭精緻氛圍。</p>
        </div>
      </div>

    </div>

    <!-- 實測數據解密 -->
    <div class="bg-slate-900 p-5 rounded-2xl border border-slate-800 text-sm">
      <div class="font-bold text-slate-200 mb-3 text-base flex items-center gap-2">
        🔬 實際圖檔透明像素檢測數據 (512×512 畫布)
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-400">
        <div class="bg-slate-950 p-3 rounded-xl border border-slate-800/60">
          <div class="text-indigo-400 font-bold mb-1">🐷 記收入 (小豬存錢筒)</div>
          <p>頂部留白高達 <strong class="text-rose-400">141px (28%)</strong>，底部留白高達 <strong class="text-rose-400">143px (28%)</strong>！實體小豬高度只有 228px，這就是為什麼小豬看起來特別扁小、且跟文字間空了一大塊空氣！</p>
        </div>
        <div class="bg-slate-950 p-3 rounded-xl border border-slate-800/60">
          <div class="text-indigo-400 font-bold mb-1">👛 記支出 (粉紅錢包)</div>
          <p>頂部留白 <strong class="text-rose-400">89px (17%)</strong>，左右各留白 <strong class="text-rose-400">133px (26%)</strong>！實際寬度只有 244px，導致錢袋在 32dp 方框中縮小到只剩約 16dp 寬。</p>
        </div>
      </div>
      <p class="mt-3 text-xs text-emerald-400 font-medium">
        💡 只要將這些留白切除並向上貼齊，小工具就能在「維持 45~48dp 大圖示」的同時，「文字依然清清楚楚呆在底部」，兩全其美！
      </p>
    </div>

  </div>
</body>
</html>
`;

fs.writeFileSync(artifactPath, htmlContent, 'utf8');
console.log('Artifact updated at:', artifactPath);
