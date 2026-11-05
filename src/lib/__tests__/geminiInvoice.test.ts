import {
  transformGeminiResultToInvoice,
  isGeminiAIAvailable,
} from '../geminiInvoice';

describe('geminiInvoice', () => {
  it('correctly transforms AI response for traditional cash register receipt', () => {
    const aiResult = {
      invoiceNumber: 'EE21608064',
      invoiceDate: '2026-10-14',
      totalAmount: 440,
      merchantName: '桃園市中壢區實踐路225之1號',
      itemsSummary: null,
    };

    const transformed = transformGeminiResultToInvoice(aiResult);
    expect(transformed).not.toBeNull();
    expect(transformed?.invoiceNumber).toBe('EE-21608064');
    expect(transformed?.rawInvoiceNumber).toBe('EE21608064');
    expect(transformed?.totalAmount).toBe(440);
    expect(transformed?.invoiceDate).toBe('2026-10-14');
    expect(transformed?.merchantName).toBe('桃園市中壢區實踐路225之1號');
    expect(transformed?.periodKey).toBe('2026-10');
    expect(transformed?.periodLabel).toBe('115年 09-10月期');
  });

  it('handles formatted invoice number and string amount', () => {
    const aiResult = {
      invoiceNumber: 'EE-21608064',
      invoiceDate: '2026-10-14',
      totalAmount: '$440',
      merchantName: '美味小吃店',
      itemsSummary: '排骨飯 $120、紅茶 $30',
    };

    const transformed = transformGeminiResultToInvoice(aiResult);
    expect(transformed).not.toBeNull();
    expect(transformed?.invoiceNumber).toBe('EE-21608064');
    expect(transformed?.totalAmount).toBe(440);
    expect(transformed?.merchantName).toBe('美味小吃店');
    expect(transformed?.itemsNote).toBe('排骨飯 $120、紅茶 $30');
  });

  it('returns null if neither invoice number nor valid amount exists', () => {
    const emptyResult = {
      invoiceNumber: null,
      invoiceDate: null,
      totalAmount: null,
      merchantName: null,
      itemsSummary: null,
    };

    const transformed = transformGeminiResultToInvoice(emptyResult);
    expect(transformed).toBeNull();
  });

  it('confirms AI availability based on environment', () => {
    expect(typeof isGeminiAIAvailable()).toBe('boolean');
  });
});
