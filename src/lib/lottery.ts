/**
 * 統一發票開獎號碼資料結構與自動對獎演算法模組
 */

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
 * 內建最新公開開獎號碼庫 (供即時本地極速對獎)
 */
export const OFFICIAL_LOTTERY_DRAWS: Record<string, LotteryPeriodData> = {
  // 115年 07-08月期 (2026-08)
  '2026-08': {
    periodKey: '2026-08',
    periodLabel: '115年 07-08月期',
    drawDate: '2026-09-25',
    superPrize: '38032766',
    specialPrize: '45327106',
    firstPrizes: ['11252008', '47207604', '87019777'],
    additionalSixPrizes: [],
  },
  // 115年 05-06月期 (2026-06)
  '2026-06': {
    periodKey: '2026-06',
    periodLabel: '115年 05-06月期',
    drawDate: '2026-07-25',
    superPrize: '86396830',
    specialPrize: '53267964',
    firstPrizes: ['39635796', '98978859', '02610304'],
    additionalSixPrizes: [],
  },
  // 115年 03-04月期 (2026-04)
  '2026-04': {
    periodKey: '2026-04',
    periodLabel: '115年 03-04月期',
    drawDate: '2026-05-25',
    superPrize: '44140251',
    specialPrize: '14715309',
    firstPrizes: ['86562747', '79171152', '77925523'],
    additionalSixPrizes: [],
  },
  // 115年 01-02月期 (2026-02)
  '2026-02': {
    periodKey: '2026-02',
    periodLabel: '115年 01-02月期',
    drawDate: '2026-03-25',
    superPrize: '16620962',
    specialPrize: '50008017',
    firstPrizes: ['25722152', '60487048', '94720342'],
    additionalSixPrizes: [],
  },
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

  const draws = { ...OFFICIAL_LOTTERY_DRAWS, ...(customDraws || {}) };
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
    else if (digits.slice(-6) === fp.slice(-6) && bestPrize.prizeAmount < 10000) {
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
    else if (digits.slice(-5) === fp.slice(-5) && bestPrize.prizeAmount < 4000) {
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
    else if (digits.slice(-4) === fp.slice(-4) && bestPrize.prizeAmount < 1000) {
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
    else if (digits.slice(-3) === fp.slice(-3) && bestPrize.prizeAmount < 200) {
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

  // 4. 增開六獎比對 (若有增開末3碼)
  if (!bestPrize.isWon && draw.additionalSixPrizes?.length) {
    for (const add3 of draw.additionalSixPrizes) {
      if (add3 && digits.slice(-3) === add3) {
        return {
          isDrawn: true,
          isWon: true,
          prizeName: '增開六獎',
          prizeAmount: 200,
          matchedDigits: add3,
          winningNote: '🎉 恭喜中增開六獎 200 元！',
        };
      }
    }
  }

  return bestPrize;
};
