import http from 'http';
import fs from 'fs';
import path from 'path';

console.log('🚀 開始執行 Web Bundle 產出物完整性與服務端驗證...');

const DIST_DIR = path.resolve(process.cwd(), 'dist');

// 1. 檢驗 dist 目錄與 index.html
if (!fs.existsSync(DIST_DIR)) {
  console.error('❌ dist 目錄不存在，請先執行 npm run build:web');
  process.exit(1);
}

const indexPath = path.join(DIST_DIR, 'index.html');
if (!fs.existsSync(indexPath)) {
  console.error('❌ dist/index.html 不存在');
  process.exit(1);
}

const indexHtml = fs.readFileSync(indexPath, 'utf-8');
console.log('✅ dist/index.html 存在 (檔案大小: ' + indexHtml.length + ' bytes)');

// 2. 檢驗 index.html 中引用的 Metro Web Bundle
const scriptMatch = indexHtml.match(/src="([^"]+\.js)"/);
if (!scriptMatch) {
  console.error('❌ index.html 中未找到 Web JS bundle 引用標籤');
  process.exit(1);
}

const scriptUrl = scriptMatch[1];
console.log('📦 找到主要 JS Bundle 引用路徑: ' + scriptUrl);

let relScriptPath = scriptUrl.replace(/^\/family-ledger\//, '');
const scriptDiskPath = path.join(DIST_DIR, relScriptPath);

if (!fs.existsSync(scriptDiskPath)) {
  console.error('❌ 實體 JS bundle 檔案遺失: ' + scriptDiskPath);
  process.exit(1);
}

const scriptStats = fs.statSync(scriptDiskPath);
const bundleSizeMB = (scriptStats.size / (1024 * 1024)).toFixed(2);
console.log(`✅ 實體 JS Bundle 檔案完整存在 (${bundleSizeMB} MB)`);

if (scriptStats.size < 100 * 1024) {
  console.error('❌ Bundle 檔案異常過小，疑似編譯不完整');
  process.exit(1);
}

// 3. 測試靜態伺服器連線與 HTTP 響應
import('./serve-web.mjs').then(async () => {
  // 等待伺服器就緒
  await new Promise(r => setTimeout(r, 500));

  const testUrls = [
    'http://localhost:8081/family-ledger/',
    'http://localhost:8081/family-ledger/index.html',
    'http://localhost:8081' + scriptUrl,
    'http://localhost:8081/family-ledger/favicon.ico',
  ];

  let allOk = true;

  for (const url of testUrls) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.log(`✅ HTTP 200 OK: ${url} (${res.headers.get('content-type')})`);
      } else {
        console.error(`❌ HTTP 異常 (${res.status}): ${url}`);
        allOk = false;
      }
    } catch (e) {
      console.error(`❌ 連線失敗: ${url}`, e.message);
      allOk = false;
    }
  }

  if (allOk) {
    console.log('\n🎉 Web Bundle 產出物與本地端點服務驗證 100% 通過！');
    process.exit(0);
  } else {
    process.exit(1);
  }
}).catch(e => {
  console.error('❌ 啟動 Web 服務失敗:', e);
  process.exit(1);
});

