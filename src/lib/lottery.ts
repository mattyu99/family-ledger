/**
 * 統一發票開獎號碼資料結構與自動對獎演算法模組
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface LotteryWinningPrize {
  isDrawn: boolean;           // 是否已開獎
  isWon: boolean;             // 是否中獎
  prizeName?: string;         // 獎項名稱 (例如 "特別獎", "六獎")
  prizeAmount: number;        // 中獎金額 (例如 200, 1000)
  matchedDigits?: string;     // 命中的號碼/末幾碼
  winningNote?: string;       // 說明
}

export interface LotteryPeriodData {
  periodKey: string;          // 例如 "2026-10" (代表 115年 9~10月期)
  periodLabel: string;        // "115年 09-10月期"
  drawDate: string;           // 開獎日期 "YYYY-MM-DD" (例如 "2026-11-25")
  superPrize: string;         // 特別獎 (1,000萬元，8位數字)
  specialPrize: string;       // 特獎 (200萬元，8位數字)
  firstPrizes: string[];      // 頭獎 (20萬元，通常3組8位數字)
  additionalSixPrizes?: string[]; // 增開六獎 (末3位數字，200元)
}

/**
 * 內建最新公開開獎號碼庫 (財政部官方歷史紀錄，供離線及即時本地極速對獎)
 */
export const OFFICIAL_LOTTERY_DRAWS: Record<string, LotteryPeriodData> = {
  // 115年 07-08月期 (2026-08)
  '2026-08': {
    periodKey: '2026-08',
    periodLabel: '115年 07-08月期',
    drawDate: '2026-09-25',
    superPrize: '89996565',
    specialPrize: '91098182',
    firstPrizes: ['54348835', '44991397', '06595111'],
    additionalSixPrizes: [],
  },
  // 115年 05-06月期 (2026-06)
  '2026-06': {
    periodKey: '2026-06',
    periodLabel: '115年 05-06月期',
    drawDate: '2026-07-25',
    superPrize: '38548029',
    specialPrize: '10138845',
    firstPrizes: ['24121106', '28589937', '83663333'],
    additionalSixPrizes: [],
  },
  // 115年 03-04月期 (2026-04)
  '2026-04': {
    periodKey: '2026-04',
    periodLabel: '115年 03-04月期',
    drawDate: '2026-05-25',
    superPrize: '19531471',
    specialPrize: '85941329',
    firstPrizes: ['07225810', '20231230', '83518781'],
    additionalSixPrizes: [],
  },
  // 115年 01-02月期 (2026-02)
  '2026-02': {
    periodKey: '2026-02',
    periodLabel: '115年 01-02月期',
    drawDate: '2026-03-25',
    superPrize: '87510041',
    specialPrize: '32220522',
    firstPrizes: ['21677046', '44662410', '31262513'],
    additionalSixPrizes: [],
  },
  // 114年 11-12月期 (2025-12)
  '2025-12': {
    periodKey: '2025-12',
    periodLabel: '114年 11-12月期',
    drawDate: '2026-01-25',
    superPrize: '97023797',
    specialPrize: '00507588',
    firstPrizes: ['92377231', '05232592', '78125249'],
    additionalSixPrizes: [],
  },
  // 114年 09-10月期 (2025-10)
  '2025-10': {
    periodKey: '2025-10',
    periodLabel: '114年 09-10月期',
    drawDate: '2025-11-25',
    superPrize: '25834483',
    specialPrize: '46587380',
    firstPrizes: ['41016094', '98081574', '07309261'],
    additionalSixPrizes: [],
  },
};

const LOTTERY_CACHE_KEY = '@family_ledger_lottery_draws';

// 動態運行時獎號快取 (啟動後自動與本地快取及雲端同步資料合併)
let dynamicLotteryDraws: Record<string, LotteryPeriodData> = { ...OFFICIAL_LOTTERY_DRAWS };

/**
 * 解析財政部 XML/RSS 字串為結構化開獎資料
 */
export const parseInvoiceXmlToDraws = (xmlText: string): Record<string, LotteryPeriodData> => {
  const result: Record<string, LotteryPeriodData> = {};
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

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

    result[periodKey] = {
      periodKey,
      periodLabel,
      drawDate: drawDate || `${year}-${endMonth}-25`,
      superPrize,
      specialPrize,
      firstPrizes,
      additionalSixPrizes,
    };
  }

  return result;
};

/**
 * 讀取本機快取的中獎號碼庫
 */
export const loadCachedLotteryDrawsAsync = async (): Promise<Record<string, LotteryPeriodData>> => {
  try {
    const raw = await AsyncStorage.getItem(LOTTERY_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        dynamicLotteryDraws = { ...OFFICIAL_LOTTERY_DRAWS, ...dynamicLotteryDraws, ...parsed };
      }
    }
  } catch (e) {
    console.warn('[Lottery] 讀取本地中獎號碼快取失敗:', e);
  }
  return dynamicLotteryDraws;
};

// 模組載入時立即自本機快取暖身
loadCachedLotteryDrawsAsync().catch(() => {});

const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs = 5000): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
};

/**
 * 全自動聯網同步中獎號碼庫：
 * 1. 優先從 GitHub Pages 靜態端點抓取 (無 CORS 限制，經 CDN 加速)
 * 2. 備援直連財政部 XML/RSS
 * 3. 取得後自動寫入本機 AsyncStorage，下次免聯網即可秒開對獎
 */
export const syncLotteryDrawsAsync = async (): Promise<Record<string, LotteryPeriodData>> => {
  let updated = false;

  // 1. 優先從 CDN / GitHub Pages 靜態端點拉取
  try {
    const remoteUrl = 'https://mattyu99.github.io/family-ledger/lottery_draws.json?t=' + Date.now();
    const res = await fetchWithTimeout(remoteUrl, {
      headers: { 'Accept': 'application/json' },
    }, 4000);
    if (res.ok) {
      const remoteDraws = await res.json();
      if (remoteDraws && typeof remoteDraws === 'object' && Object.keys(remoteDraws).length > 0) {
        dynamicLotteryDraws = { ...OFFICIAL_LOTTERY_DRAWS, ...dynamicLotteryDraws, ...remoteDraws };
        updated = true;
      }
    }
  } catch {}

  // 2. 備援直連財政部官方 XML/RSS (原生 App 與 Node 具備免 CORS 直連優勢)
  try {
    const xmlRes = await fetchWithTimeout('https://invoice.etax.nat.gov.tw/invoice.xml', {
      headers: { 'Accept': 'application/xml, text/xml, */*' },
    }, 4000);
    if (xmlRes.ok) {
      const xmlText = await xmlRes.text();
      const parsedDraws = parseInvoiceXmlToDraws(xmlText);
      if (Object.keys(parsedDraws).length > 0) {
        dynamicLotteryDraws = { ...OFFICIAL_LOTTERY_DRAWS, ...dynamicLotteryDraws, ...parsedDraws };
        updated = true;
      }
    }
  } catch {}

  // 若有獲取新數據，即刻持久化至本機快取
  if (updated) {
    try {
      await AsyncStorage.setItem(LOTTERY_CACHE_KEY, JSON.stringify(dynamicLotteryDraws));
    } catch {}
  }

  return dynamicLotteryDraws;
};

/**
 * 取得當前包含動態更新的所有官方開獎號碼庫
 */
export const getOfficialLotteryDraws = (): Record<string, LotteryPeriodData> => {
  return dynamicLotteryDraws;
};

/**
 * 檢查特定發票號碼在該期別是否中獎
 * @param invoiceNumber 發票號碼 (例如 "AB-12345678" 或 "12345678")
 * @param periodKey 期別代碼 (例如 "2026-08")
 * @param customDraws 自訂或遠端最新開獎數據 (選填)
 */
export const checkInvoiceWinning = (
  invoiceNumber: string | undefined,
  periodKey: string | undefined,
  customDraws?: Record<string, LotteryPeriodData>
): LotteryWinningPrize => {
  if (!invoiceNumber || !periodKey) {
    return { isDrawn: false, isWon: false, prizeAmount: 0 };
  }

  const draws = { ...dynamicLotteryDraws, ...(customDraws || {}) };
  const draw = draws[periodKey];

  // 若該期尚未開獎
  if (!draw) {
    return {
      isDrawn: false,
      isWon: false,
      prizeAmount: 0,
      winningNote: '該期尚未開獎',
    };
  }

  // 取得末 8 碼數字部分
  const digits = invoiceNumber.replace(/[^0-9]/g, '').slice(-8);
  if (digits.length !== 8) {
    return { isDrawn: true, isWon: false, prizeAmount: 0 };
  }

  // 1. 特別獎 (1,000 萬元)：8位數號碼與特別獎號碼相同
  if (draw.superPrize && digits === draw.superPrize) {
    return {
      isDrawn: true,
      isWon: true,
      prizeName: '特別獎',
      prizeAmount: 10000000,
      matchedDigits: digits,
      winningNote: '🎉 恭喜中特別獎 1,000 萬元！',
    };
  }

  // 2. 特獎 (200 萬元)：8位數號碼與特獎號碼相同
  if (draw.specialPrize && digits === draw.specialPrize) {
    return {
      isDrawn: true,
      isWon: true,
      prizeName: '特獎',
      prizeAmount: 2000000,
      matchedDigits: digits,
      winningNote: '🎉 恭喜中特獎 200 萬元！',
    };
  }

  // 3. 頭獎至六獎比對 (以各組頭獎號碼為基準)
  let bestPrize: LotteryWinningPrize = { isDrawn: true, isWon: false, prizeAmount: 0 };

  for (const fp of draw.firstPrizes || []) {
    if (!fp || fp.length !== 8) continue;

    if (digits === fp) {
      return {
        isDrawn: true,
        isWon: true,
        prizeName: '頭獎',
        prizeAmount: 200000,
        matchedDigits: digits,
        winningNote: '🎉 恭喜中頭獎 20 萬元！',
      };
    }

    // 二獎：末 7 位數相同 (4 萬元)
    if (digits.slice(-7) === fp.slice(-7) && bestPrize.prizeAmount < 40000) {
      bestPrize = {
        isDrawn: true,
        isWon: true,
        prizeName: '二獎',
        prizeAmount: 40000,
        matchedDigits: digits.slice(-7),
        winningNote: '🎉 恭喜中二獎 4 萬元！',
      };
    }

    // 三獎：末 6 位數相同 (1 萬元)
    if (digits.slice(-6) === fp.slice(-6) && bestPrize.prizeAmount < 10000) {
      bestPrize = {
        isDrawn: true,
        isWon: true,
        prizeName: '三獎',
        prizeAmount: 10000,
        matchedDigits: digits.slice(-6),
        winningNote: '🎉 恭喜中三獎 1 萬元！',
      };
    }

    // 四獎：末 5 位數相同 (4,000 元)
    if (digits.slice(-5) === fp.slice(-5) && bestPrize.prizeAmount < 4000) {
      bestPrize = {
        isDrawn: true,
        isWon: true,
        prizeName: '四獎',
        prizeAmount: 4000,
        matchedDigits: digits.slice(-5),
        winningNote: '🎉 恭喜中四獎 4,000 元！',
      };
    }

    // 五獎：末 4 位數相同 (1,000 元)
    if (digits.slice(-4) === fp.slice(-4) && bestPrize.prizeAmount < 1000) {
      bestPrize = {
        isDrawn: true,
        isWon: true,
        prizeName: '五獎',
        prizeAmount: 1000,
        matchedDigits: digits.slice(-4),
        winningNote: '🎉 恭喜中五獎 1,000 元！',
      };
    }

    // 六獎：末 3 位數相同 (200 元)
    if (digits.slice(-3) === fp.slice(-3) && bestPrize.prizeAmount < 200) {
      bestPrize = {
        isDrawn: true,
        isWon: true,
        prizeName: '六獎',
        prizeAmount: 200,
        matchedDigits: digits.slice(-3),
        winningNote: '🎉 恭喜中六獎 200 元！',
      };
    }
  }

  // 4. 增開六獎比對 (末 3 位數相同，200 元)
  if (bestPrize.prizeAmount < 200 && draw.additionalSixPrizes) {
    for (const six of draw.additionalSixPrizes) {
      if (six && digits.slice(-3) === six) {
        return {
          isDrawn: true,
          isWon: true,
          prizeName: '增開六獎',
          prizeAmount: 200,
          matchedDigits: digits.slice(-3),
          winningNote: '🎉 恭喜中增開六獎 200 元！',
        };
      }
    }
  }

  if (bestPrize.isWon) {
    return bestPrize;
  }

  return {
    isDrawn: true,
    isWon: false,
    prizeAmount: 0,
    winningNote: '很可惜，本張發票未中獎',
  };
};
