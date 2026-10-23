import fs from 'fs';
import path from 'path';

/**
 * 從財政部官方稅務入口網抓取統一發票最新中獎號碼 RSS XML 並轉為 JSON
 */
async function syncLottery() {
  const url = 'https://invoice.etax.nat.gov.tw/invoice.xml';
  console.log(`[Lottery Sync] 正在從財政部抓取最新發票開獎資料: ${url}...`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (FamilyLedger/1.0.7)',
      'Accept': 'application/xml, text/xml, */*',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP 請求失敗: ${response.status} ${response.statusText}`);
  }

  const xmlText = await response.text();
  const draws = {};
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemContent = match[1];
    const titleMatch = itemContent.match(/<title><!\[CDATA\[(\d+)年\s*(\d+)[~\-](\d+)月\]\]><\/title>/);
    if (!titleMatch) continue;

    const rocYear = parseInt(titleMatch[1], 10);
    const startMonth = titleMatch[2].padStart(2, '0');
    const endMonth = titleMatch[3].padStart(2, '0');
    const year = rocYear + 1911;
    const periodKey = `${year}-${endMonth}`;
    const periodLabel = `${rocYear}年 ${startMonth}-${endMonth}月期`;

    const pubDateMatch = itemContent.match(/<pubDate>([^<]+)<\/pubDate>/);
    let drawDate = '';
    if (pubDateMatch) {
      const pd = new Date(pubDateMatch[1]);
      if (!isNaN(pd.getTime())) {
        drawDate = pd.toISOString().split('T')[0];
      }
    }

    const superPrizeMatch = itemContent.match(/特別獎[：:]\s*([0-9]{8})/);
    const specialPrizeMatch = itemContent.match(/特獎[：:]\s*([0-9]{8})/);
    const firstPrizesMatch = itemContent.match(/頭獎[：:]\s*([0-9、, \t]+)/);
    const sixPrizesMatch = itemContent.match(/增開六獎[：:]\s*([0-9、, \t]+)/);

    const superPrize = superPrizeMatch ? superPrizeMatch[1] : '';
    const specialPrize = specialPrizeMatch ? specialPrizeMatch[1] : '';
    const firstPrizes = firstPrizesMatch
      ? firstPrizesMatch[1].split(/[、, \s]+/).filter(s => /^\d{8}$/.test(s))
      : [];
    const additionalSixPrizes = sixPrizesMatch
      ? sixPrizesMatch[1].split(/[、, \s]+/).filter(s => /^\d{3}$/.test(s))
      : [];

    draws[periodKey] = {
      periodKey,
      periodLabel,
      drawDate: drawDate || `${year}-${endMonth}-25`,
      superPrize,
      specialPrize,
      firstPrizes,
      additionalSixPrizes,
    };
  }

  const outDir = path.resolve(process.cwd(), 'public');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outPath = path.join(outDir, 'lottery_draws.json');
  fs.writeFileSync(outPath, JSON.stringify(draws, null, 2), 'utf-8');
  console.log(`[Lottery Sync] ✅ 已成功解析 ${Object.keys(draws).length} 期官方中獎號碼至 ${outPath}`);
  console.log(Object.keys(draws).map(k => `  • ${draws[k].periodLabel} (${draws[k].drawDate})`).join('\n'));
}

syncLottery().catch(err => {
  console.error('[Lottery Sync] ❌ 抓取失敗:', err);
  process.exit(1);
});

