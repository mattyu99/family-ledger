import { Platform, Share } from 'react-native';
import { Transaction, PaymentAccount, RecurringRule, Profile, Category } from '../types/database';
import {
  StatementFile,
  loadCachedStatements,
  loadCachedRecurringStatements,
  formatFileSize,
} from './statementStorage';
import { showAlert, copyToClipboard } from './alert';

export interface AttachmentItem {
  id: string;
  type: 'receipt' | 'card_statement' | 'recurring_statement';
  title: string;
  subtitle: string;
  date: string;
  amountText?: string;
  originalName: string;
  url: string;
  size?: number;
  mimeType?: string;
  thumbnailUrl?: string;
  payerName?: string;
  categoryName?: string;
}

export interface AttachmentStats {
  receiptCount: number;
  cardStatementCount: number;
  recurringStatementCount: number;
  totalCount: number;
  totalEstimatedBytes: number;
  totalEstimatedFormatted: string;
  receipts: AttachmentItem[];
  cardStatements: AttachmentItem[];
  recurringStatements: AttachmentItem[];
  allItems: AttachmentItem[];
}

/**
 * 依據交易與已快取的電子帳單，彙整全體附件清單與容量統計
 */
export const collectAttachmentStats = (params: {
  ledgerName: string;
  transactions: Transaction[];
  cardStatements: StatementFile[];
  recurringStatements: StatementFile[];
  paymentAccounts?: PaymentAccount[];
  recurringRules?: RecurringRule[];
  members?: Profile[];
  categories?: Category[];
}): AttachmentStats => {
  const {
    transactions,
    cardStatements,
    recurringStatements,
    paymentAccounts = [],
    recurringRules = [],
    members = [],
    categories = [],
  } = params;

  const cardMap = new Map<string, PaymentAccount>();
  paymentAccounts.forEach(a => {
    if (a.id) cardMap.set(a.id, a);
  });

  const ruleMap = new Map<string, RecurringRule>();
  recurringRules.forEach(r => {
    if (r.id) ruleMap.set(r.id, r);
  });

  const memberMap = new Map<string, Profile>();
  members.forEach(m => {
    if (m.id) memberMap.set(m.id, m);
  });

  const categoryMap = new Map<string, Category>();
  categories.forEach(c => {
    if (c.id) categoryMap.set(c.id, c);
  });

  // 1. 交易收據照片
  const receipts: AttachmentItem[] = [];
  transactions.forEach(t => {
    if (!t.image_url || typeof t.image_url !== 'string' || !t.image_url.trim()) return;

    const dateStr = t.transacted_at ? t.transacted_at.slice(0, 10).replace(/-/g, '') : '未知日期';
    const cleanMerchant = (t.merchant || '未註記店家').replace(/[\\/:*?"<>|]/g, '_').slice(0, 15);
    const amountVal = Math.round(Number(t.amount || 0));
    const ext = t.image_url.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
    const originalName = `${dateStr}_${cleanMerchant}_${amountVal}元_收據.${ext}`;

    const payer = (t.paid_by && memberMap.get(t.paid_by)) || t.payer_profile;
    const cat = (t.category_id && categoryMap.get(t.category_id)) || t.category;

    receipts.push({
      id: `receipt_${t.id}`,
      type: 'receipt',
      title: t.merchant || (t.type === 'expense' ? '一般支出' : t.type === 'income' ? '收入記錄' : '記帳明細'),
      subtitle: t.note ? t.note : '收據發票照片',
      date: t.transacted_at ? t.transacted_at.slice(0, 10) : '未知日期',
      amountText: t.amount !== undefined ? `$${Number(t.amount).toLocaleString()}` : undefined,
      originalName,
      url: t.image_url,
      thumbnailUrl: t.image_url,
      size: 450 * 1024, // 估算平均一張壓縮收據約 450 KB
      mimeType: ext === 'png' ? 'image/png' : 'image/jpeg',
      payerName: payer?.display_name || undefined,
      categoryName: cat?.name || undefined,
    });
  });

  // 2. 信用卡電子帳單
  const cardItems: AttachmentItem[] = [];
  cardStatements.forEach(s => {
    if (!s.publicUrl) return;
    const card = cardMap.get(s.cardId);
    const cardName = card?.name || '信用卡';
    const ext = s.fileName.split('.').pop() || 'pdf';
    const originalName = s.originalName || `${s.cycleKey}_${cardName}_電子帳單.${ext}`;

    cardItems.push({
      id: `stmt_${s.path || s.fileName}`,
      type: 'card_statement',
      title: `${cardName} (${s.cycleKey})`,
      subtitle: s.originalName || `${s.cycleKey} 電子帳單`,
      date: s.cycleKey || (s.createdAt ? s.createdAt.slice(0, 10) : '未知'),
      originalName,
      url: s.publicUrl,
      size: s.size || 350 * 1024,
      mimeType: s.mimeType || 'application/pdf',
    });
  });

  // 3. 水電瓦斯固定帳單
  const recurringItems: AttachmentItem[] = [];
  recurringStatements.forEach(s => {
    if (!s.publicUrl) return;
    const rule = s.ruleId ? ruleMap.get(s.ruleId) : undefined;
    const ruleName = rule?.name || '固定帳單';
    const ext = s.fileName.split('.').pop() || 'pdf';
    const originalName = s.originalName || `${s.cycleKey}_${ruleName}_繳費單.${ext}`;

    recurringItems.push({
      id: `rec_${s.path || s.fileName}`,
      type: 'recurring_statement',
      title: `${ruleName} (${s.cycleKey})`,
      subtitle: s.originalName || `${s.cycleKey} 繳費單`,
      date: s.cycleKey || (s.createdAt ? s.createdAt.slice(0, 10) : '未知'),
      originalName,
      url: s.publicUrl,
      size: s.size || 250 * 1024,
      mimeType: s.mimeType || 'application/pdf',
    });
  });

  const allItems = [...receipts, ...cardItems, ...recurringItems];
  const totalEstimatedBytes = allItems.reduce((acc, it) => acc + (it.size || 0), 0);

  return {
    receiptCount: receipts.length,
    cardStatementCount: cardItems.length,
    recurringStatementCount: recurringItems.length,
    totalCount: allItems.length,
    totalEstimatedBytes,
    totalEstimatedFormatted: formatFileSize(totalEstimatedBytes),
    receipts,
    cardStatements: cardItems,
    recurringStatements: recurringItems,
    allItems,
  };
};

/**
 * 產生 HTML 互動式離線封存索引庫 (單一檔案，支援所有瀏覽器開啟與一鍵批次下載真實檔案)
 */
export const generateAttachmentArchiveHtml = (params: {
  ledgerName: string;
  stats: AttachmentStats;
  exportDateIso?: string;
}): string => {
  const { ledgerName, stats, exportDateIso = new Date().toISOString() } = params;
  const formattedDate = new Date(exportDateIso).toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const itemsJson = JSON.stringify(stats.allItems);

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>甜心記帳本 - ${ledgerName} - 附件離線封存庫</title>
  <style>
    :root {
      --bg: #0F172A;
      --card-bg: #1E293B;
      --card-subtle: #334155;
      --primary: #6366F1;
      --primary-hover: #4F46E5;
      --success: #10B981;
      --warning: #F59E0B;
      --text: #F8FAFC;
      --text-muted: #94A3B8;
      --border: #334155;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 20px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    header {
      background: linear-gradient(135deg, #1E293B 0%, #0F172A 100%);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    }
    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 16px;
    }
    .brand { display: flex; align-items: center; gap: 10px; font-size: 20px; font-weight: 700; color: #EC4899; }
    .export-date { font-size: 13px; color: var(--text-muted); }
    .ledger-title { font-size: 26px; font-weight: 800; margin-bottom: 8px; color: #FFFFFF; }
    .stats-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-top: 16px;
    }
    .stat-badge {
      background: var(--card-subtle);
      border-radius: 12px;
      padding: 12px 16px;
      border: 1px solid rgba(255,255,255,0.05);
    }
    .stat-label { font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
    .stat-value { font-size: 20px; font-weight: 800; color: #FFFFFF; }
    .action-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 24px;
      background: var(--card-bg);
      padding: 16px;
      border-radius: 14px;
      border: 1px solid var(--border);
      align-items: center;
    }
    .filter-group { display: flex; gap: 8px; flex-wrap: wrap; flex: 1; }
    .btn {
      padding: 10px 18px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      text-decoration: none;
    }
    .btn-filter {
      background: var(--card-subtle);
      color: var(--text-muted);
    }
    .btn-filter.active {
      background: var(--primary);
      color: #FFFFFF;
    }
    .btn-primary { background: #059669; color: #FFFFFF; }
    .btn-primary:hover { background: #047857; }
    .btn-zip { background: #6366F1; color: #FFFFFF; }
    .btn-zip:hover { background: #4F46E5; }
    .btn-secondary { background: var(--card-subtle); color: #FFFFFF; }
    .btn-secondary:hover { background: #475569; }
    .search-box {
      background: #0F172A;
      border: 1px solid var(--border);
      color: #FFFFFF;
      padding: 9px 14px;
      border-radius: 8px;
      font-size: 14px;
      min-width: 200px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 14px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      border-color: #6366F1;
    }
    .card-thumb-box {
      width: 100%;
      height: 180px;
      background: #0F172A;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      position: relative;
      cursor: pointer;
    }
    .card-thumb-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.3s;
    }
    .card-thumb-img:hover { transform: scale(1.05); }
    .card-pdf-icon {
      font-size: 54px;
      color: #EF4444;
    }
    .card-badge {
      position: absolute;
      top: 10px;
      left: 10px;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(4px);
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      color: #F8FAFC;
    }
    .card-body {
      padding: 16px;
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .card-header-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 6px;
    }
    .card-title {
      font-size: 16px;
      font-weight: 700;
      color: #FFFFFF;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      margin-right: 8px;
    }
    .card-amount {
      font-size: 17px;
      font-weight: 800;
      color: #38BDF8;
    }
    .card-subtitle {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .card-meta-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      color: var(--text-muted);
      margin-top: auto;
      padding-top: 10px;
      border-top: 1px solid rgba(255,255,255,0.06);
    }
    .card-actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    .card-actions .btn {
      flex: 1;
      justify-content: center;
      padding: 8px 12px;
      font-size: 13px;
    }
    /* Modal / Lightbox */
    .modal-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.85);
      backdrop-filter: blur(8px);
      z-index: 1000;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .modal-overlay.active { display: flex; }
    .lightbox-content {
      max-width: 90vw;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .lightbox-img {
      max-width: 100%;
      max-height: 80vh;
      border-radius: 8px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.6);
    }
    .progress-box {
      display: none;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 20px;
    }
    .progress-bar-bg {
      background: #0F172A;
      height: 12px;
      border-radius: 6px;
      overflow: hidden;
      margin-top: 8px;
    }
    .progress-bar-fill {
      background: linear-gradient(90deg, #10B981, #06B6D4);
      height: 100%;
      width: 0%;
      transition: width 0.2s;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-top">
        <div class="brand">
          <span>💖 甜心記帳本</span>
          <span style="font-size: 14px; background: rgba(236,72,153,0.2); padding: 3px 8px; border-radius: 6px;">全附件離線封存庫</span>
        </div>
        <div class="export-date">匯出於：${formattedDate}</div>
      </div>
      <div class="ledger-title">${ledgerName}</div>
      <p style="color: var(--text-muted); font-size: 14px;">
        本封存頁面完整收錄了此帳本的所有交易收據照片與電子帳單。您可直接離線檢閱，或點擊下方按鈕將全部實體檔案批次儲存至本機硬碟中。
      </p>
      <div class="stats-row">
        <div class="stat-badge">
          <div class="stat-label">📷 收據照片</div>
          <div class="stat-value" style="color: #38BDF8;">${stats.receiptCount} 張</div>
        </div>
        <div class="stat-badge">
          <div class="stat-label">💳 信用卡帳單</div>
          <div class="stat-value" style="color: #A855F7;">${stats.cardStatementCount} 份</div>
        </div>
        <div class="stat-badge">
          <div class="stat-label">⚡ 水電固定帳單</div>
          <div class="stat-value" style="color: #F59E0B;">${stats.recurringStatementCount} 份</div>
        </div>
        <div class="stat-badge">
          <div class="stat-label">📦 估算雲端容量</div>
          <div class="stat-value" style="color: #10B981;">${stats.totalEstimatedFormatted}</div>
        </div>
      </div>
    </header>

    <div id="progressBox" class="progress-box">
      <div style="display: flex; justify-content: space-between; font-size: 14px; font-weight: 600;">
        <span id="progressText">正在批次下載中...</span>
        <span id="progressPercent">0%</span>
      </div>
      <div class="progress-bar-bg">
        <div id="progressBarFill" class="progress-bar-fill"></div>
      </div>
    </div>

    <div class="action-bar">
      <div class="filter-group">
        <button class="btn btn-filter active" onclick="setFilter('all')">全部 (${stats.totalCount})</button>
        <button class="btn btn-filter" onclick="setFilter('receipt')">📷 收據 (${stats.receiptCount})</button>
        <button class="btn btn-filter" onclick="setFilter('card_statement')">💳 信用卡 (${stats.cardStatementCount})</button>
        <button class="btn btn-filter" onclick="setFilter('recurring_statement')">⚡ 水電固定 (${stats.recurringStatementCount})</button>
      </div>

      <input type="text" id="searchInput" class="search-box" placeholder="🔍 搜尋商家、卡片、檔名..." oninput="onSearchChange()">

      <button class="btn btn-primary" onclick="batchDownloadAll()">
        <span>📥 批次下載全部檔案</span>
      </button>

      <button class="btn btn-secondary" onclick="copyAllLinks()">
        <span>📋 複製 URL 清單</span>
      </button>
    </div>

    <div id="cardsGrid" class="grid"></div>
  </div>

  <!-- 圖片燈箱 -->
  <div id="lightboxModal" class="modal-overlay" onclick="closeLightbox()">
    <div class="lightbox-content" onclick="event.stopPropagation()">
      <img id="lightboxImg" class="lightbox-img" src="" alt="預覽">
      <div style="margin-top: 14px; display: flex; gap: 10px;">
        <a id="lightboxDownloadBtn" class="btn btn-primary" download target="_blank">💾 下載原圖</a>
        <button class="btn btn-secondary" onclick="closeLightbox()">關閉</button>
      </div>
    </div>
  </div>

  <script>
    const allItems = ${itemsJson};
    let currentFilter = 'all';
    let searchQuery = '';

    function renderCards() {
      const grid = document.getElementById('cardsGrid');
      const filtered = allItems.filter(item => {
        if (currentFilter !== 'all' && item.type !== currentFilter) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const matchTitle = (item.title || '').toLowerCase().includes(q);
          const matchSub = (item.subtitle || '').toLowerCase().includes(q);
          const matchName = (item.originalName || '').toLowerCase().includes(q);
          const matchCat = (item.categoryName || '').toLowerCase().includes(q);
          if (!matchTitle && !matchSub && !matchName && !matchCat) return false;
        }
        return true;
      });

      if (filtered.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted); font-size: 16px;">無符合條件的附件檔案</div>';
        return;
      }

      grid.innerHTML = filtered.map(item => {
        const isReceipt = item.type === 'receipt';
        const typeBadge = isReceipt ? '📷 發票收據' : item.type === 'card_statement' ? '💳 信用卡帳單' : '⚡ 固定繳費單';
        const thumbHtml = isReceipt
          ? '<img class="card-thumb-img" src="' + item.url + '" alt="' + item.title + '" loading="lazy" onclick="openLightbox(\\'' + item.url + '\\', \\'' + item.originalName + '\\')">'
          : '<div class="card-pdf-icon" onclick="window.open(\\'' + item.url + '\\', \\'_blank\\')">📄</div>';

        return \`
          <div class="card">
            <div class="card-thumb-box">
              <span class="card-badge">\${typeBadge}</span>
              \${thumbHtml}
            </div>
            <div class="card-body">
              <div class="card-header-row">
                <span class="card-title" title="\${item.title}">\${item.title}</span>
                \${item.amountText ? '<span class="card-amount">' + item.amountText + '</span>' : ''}
              </div>
              <div class="card-subtitle" title="\${item.subtitle}">\${item.subtitle}</div>
              <div class="card-meta-row">
                <span>📅 \${item.date}</span>
                <span>\${item.categoryName ? '🏷️ ' + item.categoryName : (item.size ? Math.round(item.size / 1024) + ' KB' : '')}</span>
              </div>
              <div class="card-actions">
                <a class="btn btn-secondary" href="\${item.url}" target="_blank">👁️ 檢視</a>
                <button class="btn btn-primary" onclick="downloadSingleFile(\\'' + item.url + '\\', \\'' + item.originalName + '\\')">💾 下載</button>
              </div>
            </div>
          </div>
        \`;
      }).join('');
    }

    function setFilter(filter) {
      currentFilter = filter;
      document.querySelectorAll('.btn-filter').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick').includes("'" + filter + "'"));
      });
      renderCards();
    }

    function onSearchChange() {
      searchQuery = document.getElementById('searchInput').value.trim();
      renderCards();
    }

    function openLightbox(url, name) {
      const modal = document.getElementById('lightboxModal');
      const img = document.getElementById('lightboxImg');
      const btn = document.getElementById('lightboxDownloadBtn');
      img.src = url;
      btn.href = url;
      btn.setAttribute('download', name);
      modal.classList.add('active');
    }

    function closeLightbox() {
      document.getElementById('lightboxModal').classList.remove('active');
    }

    async function downloadSingleFile(url, filename) {
      try {
        const resp = await fetch(url);
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      } catch (err) {
        // Fallback to opening in new window
        window.open(url, '_blank');
      }
    }

    async function batchDownloadAll() {
      const itemsToDownload = allItems.filter(item => {
        if (currentFilter !== 'all' && item.type !== currentFilter) return false;
        return true;
      });

      if (itemsToDownload.length === 0) {
        alert('目前無可下載之附件檔案');
        return;
      }

      if (!confirm('即將依序下載 ' + itemsToDownload.length + ' 個檔案至您的電腦下載資料夾。請在瀏覽器彈出「允許多個檔案下載」提示時點擊允許。確定要開始嗎？')) {
        return;
      }

      const pBox = document.getElementById('progressBox');
      const pText = document.getElementById('progressText');
      const pPercent = document.getElementById('progressPercent');
      const pBar = document.getElementById('progressBarFill');
      pBox.style.display = 'block';

      let successCount = 0;
      for (let i = 0; i < itemsToDownload.length; i++) {
        const item = itemsToDownload[i];
        pText.innerText = '正在下載 (' + (i + 1) + '/' + itemsToDownload.length + ')：' + item.originalName;
        const pct = Math.round(((i + 1) / itemsToDownload.length) * 100);
        pPercent.innerText = pct + '%';
        pBar.style.width = pct + '%';

        try {
          await downloadSingleFile(item.url, item.originalName);
          successCount++;
        } catch (e) {
          console.warn('下載失敗:', item.originalName, e);
        }

        // 短暫間隔 350ms，避免觸發瀏覽器安全阻擋
        await new Promise(r => setTimeout(r, 350));
      }

      pText.innerText = '🎉 批次下載完成！共成功儲存 ' + successCount + ' 份檔案。';
      setTimeout(() => { pBox.style.display = 'none'; }, 4000);
    }

    function copyAllLinks() {
      const links = allItems.map(item => item.originalName + '\\t' + item.url).join('\\n');
      navigator.clipboard.writeText(links).then(() => {
        alert('✅ 已複製全部 ' + allItems.length + ' 個附件的名稱與下載連結！可直接貼上至下載管理器。');
      }).catch(() => {
        prompt('請手動複製連結：', links);
      });
    }

    // 初始化載入卡片
    renderCards();
  </script>
</body>
</html>`;
};

/**
 * 匯出或分享附件離線索引庫 HTML 檔案
 */
export const exportAttachmentArchive = async (params: {
  ledgerName: string;
  stats: AttachmentStats;
}): Promise<boolean> => {
  const { ledgerName, stats } = params;
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `甜心記帳本_${ledgerName || '家庭公帳'}_附件離線封存庫_${dateStr}.html`;
  const htmlContent = generateAttachmentArchiveHtml({ ledgerName, stats });

  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined') {
      try {
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showAlert('下載成功', `已將附件離線封存庫「${filename}」下載至您的電腦！\n\n以任何瀏覽器開啟即可離線檢視並一鍵批次下載全部真實檔案。`);
        return true;
      } catch (err) {
        console.warn('下載 HTML 失敗:', err);
      }
    }
    return false;
  }

  // 原生行動裝置 (iOS / Android)
  try {
    await Share.share({
      title: filename,
      message: htmlContent,
    });
    return true;
  } catch (err) {
    copyToClipboard(
      htmlContent,
      '已將附件離線封存庫 HTML 內容複製到剪貼簿！可儲存為 .html 檔案後開啟。'
    );
    return true;
  }
};
