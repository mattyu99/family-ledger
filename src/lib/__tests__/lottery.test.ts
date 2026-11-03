import { checkInvoiceWinning, parseInvoiceXmlToDraws, LotteryPeriodData } from '../lottery';

describe('統一發票開獎對獎邏輯測試 (lottery.ts)', () => {
  const mockDraws: Record<string, LotteryPeriodData> = {
    '2026-09': {
      periodKey: '2026-09',
      periodLabel: '115年 09-10月期',
      drawDate: '2026-11-25',
      superPrize: '12345678', // 特別獎 (1000萬)
      specialPrize: '87654321', // 特獎 (200萬)
      firstPrizes: ['11223344', '55667788', '99001122'], // 頭獎 (20萬)
      additionalSixPrizes: ['333', '777'], // 增開六獎 (200元)
    },
  };

  describe('完整獎級判定', () => {
    it('特別獎全中 8 碼應中一千萬 (superPrize)', () => {
      const res = checkInvoiceWinning('AB-12345678', '2026-09', mockDraws);
      expect(res.isDrawn).toBe(true);
      expect(res.isWon).toBe(true);
      expect(res.prizeAmount).toBe(10000000);
      expect(res.prizeName).toBe('特別獎');
      expect(res.matchedDigits).toBe('12345678');
    });

    it('特獎全中 8 碼應中兩百萬 (specialPrize)', () => {
      const res = checkInvoiceWinning('CD-87654321', '2026-09', mockDraws);
      expect(res.isDrawn).toBe(true);
      expect(res.isWon).toBe(true);
      expect(res.prizeAmount).toBe(2000000);
      expect(res.prizeName).toBe('特獎');
      expect(res.matchedDigits).toBe('87654321');
    });

    it('頭獎全中 8 碼應中二十萬', () => {
      const res = checkInvoiceWinning('EF-55667788', '2026-09', mockDraws);
      expect(res.isDrawn).toBe(true);
      expect(res.isWon).toBe(true);
      expect(res.prizeAmount).toBe(200000);
      expect(res.prizeName).toBe('頭獎');
    });

    it('頭獎末 7 碼相同應中二獎 (40,000元)', () => {
      const res = checkInvoiceWinning('GH-01223344', '2026-09', mockDraws);
      expect(res.isDrawn).toBe(true);
      expect(res.isWon).toBe(true);
      expect(res.prizeAmount).toBe(40000);
      expect(res.prizeName).toBe('二獎');
      expect(res.matchedDigits).toBe('1223344');
    });

    it('頭獎末 6 碼相同應中三獎 (10,000元)', () => {
      const res = checkInvoiceWinning('IJ-99223344', '2026-09', mockDraws);
      expect(res.isDrawn).toBe(true);
      expect(res.isWon).toBe(true);
      expect(res.prizeAmount).toBe(10000);
      expect(res.prizeName).toBe('三獎');
      expect(res.matchedDigits).toBe('223344');
    });

    it('頭獎末 5 碼相同應中四獎 (4,000元)', () => {
      const res = checkInvoiceWinning('KL-99923344', '2026-09', mockDraws);
      expect(res.isDrawn).toBe(true);
      expect(res.isWon).toBe(true);
      expect(res.prizeAmount).toBe(4000);
      expect(res.prizeName).toBe('四獎');
      expect(res.matchedDigits).toBe('23344');
    });

    it('頭獎末 4 碼相同應中五獎 (1,000元)', () => {
      const res = checkInvoiceWinning('MN-00003344', '2026-09', mockDraws);
      expect(res.isDrawn).toBe(true);
      expect(res.isWon).toBe(true);
      expect(res.prizeAmount).toBe(1000);
      expect(res.prizeName).toBe('五獎');
      expect(res.matchedDigits).toBe('3344');
    });

    it('頭獎末 3 碼相同應中六獎 (200元)', () => {
      const res = checkInvoiceWinning('OP-11111344', '2026-09', mockDraws);
      expect(res.isDrawn).toBe(true);
      expect(res.isWon).toBe(true);
      expect(res.prizeAmount).toBe(200);
      expect(res.prizeName).toBe('六獎');
      expect(res.matchedDigits).toBe('344');
    });

    it('符合增開六獎 3 碼應中 200 元', () => {
      const res = checkInvoiceWinning('QR-00000777', '2026-09', mockDraws);
      expect(res.isDrawn).toBe(true);
      expect(res.isWon).toBe(true);
      expect(res.prizeAmount).toBe(200);
      expect(res.prizeName).toBe('增開六獎');
      expect(res.matchedDigits).toBe('777');
    });

    it('完全未中號碼應判定未中獎', () => {
      const res = checkInvoiceWinning('ST-99999999', '2026-09', mockDraws);
      expect(res.isDrawn).toBe(true);
      expect(res.isWon).toBe(false);
      expect(res.prizeAmount).toBe(0);
    });
  });

  describe('邊界防呆與格式相容', () => {
    it('若該期尚未開獎，應標註尚未開獎且不可判定中獎', () => {
      const res = checkInvoiceWinning('AB-12345678', '2029-01', mockDraws);
      expect(res.isDrawn).toBe(false);
      expect(res.isWon).toBe(false);
      expect(res.prizeAmount).toBe(0);
      expect(res.winningNote).toBe('該期尚未開獎');
    });

    it('發票號碼不含連字號時，應自動擷取末 8 碼進行比對', () => {
      const res = checkInvoiceWinning('AB12345678', '2026-09', mockDraws);
      expect(res.isWon).toBe(true);
      expect(res.prizeAmount).toBe(10000000);
    });

    it('傳入空字串或少於 8 碼數字時，應安全回傳未開獎/未中獎狀態，絕不崩潰', () => {
      expect(checkInvoiceWinning('', '2026-09').isWon).toBe(false);
      expect(checkInvoiceWinning('AB-123', '2026-09', mockDraws).isWon).toBe(false);
      expect(checkInvoiceWinning(undefined, undefined).isWon).toBe(false);
    });
  });

  describe('官方 XML/RSS 解析', () => {
    it('應能正確解析財政部 XML 開獎字串', () => {
      const mockXml = `
        <rss>
          <channel>
            <item>
              <title><![CDATA[115年 07-08月]]></title>
              <pubDate>2026-09-25T13:30:00+08:00</pubDate>
              <description><![CDATA[
                特別獎:38039158
                特獎:08276859
                頭獎:32110911、84289408、13446901
                增開六獎:123
              ]]></description>
            </item>
          </channel>
        </rss>
      `;
      const parsed = parseInvoiceXmlToDraws(mockXml);
      expect(parsed['2026-08']).toBeDefined();
      expect(parsed['2026-08'].superPrize).toBe('38039158');
      expect(parsed['2026-08'].specialPrize).toBe('08276859');
      expect(parsed['2026-08'].firstPrizes).toEqual(['32110911', '84289408', '13446901']);
      expect(parsed['2026-08'].additionalSixPrizes).toEqual(['123']);
    });
  });
});

