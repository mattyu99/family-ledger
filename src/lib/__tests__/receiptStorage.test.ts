import {
  MAX_RECEIPT_FILE_BYTES,
  isPdfReceipt,
  getReceiptExtension,
  resolveReceiptMimeType,
  extractReceiptFileName,
  uploadReceiptPhoto,
} from '../receiptStorage';
import { toHexUtf8 } from '../statementStorage';
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from '../supabase';
import {
  collectAttachmentStats,
  generateAttachmentArchiveHtml,
} from '../attachmentExport';
import { Transaction } from '../../types/database';

describe('📄 收據與 PDF 憑證儲存與附件匯出測試 (receiptStorage.test.ts)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('isPdfReceipt', () => {
    it('正確識別各類 PDF 憑證來源', () => {
      expect(isPdfReceipt('https://example.com/storage/receipt.pdf')).toBe(true);
      expect(isPdfReceipt('https://example.com/storage/receipt.pdf?token=abc#page=1')).toBe(true);
      expect(isPdfReceipt('data:application/pdf;base64,JVBERi0xLjQ=')).toBe(true);
      expect(isPdfReceipt('blob:http://localhost:8081/1234', 'application/pdf')).toBe(true);
      expect(isPdfReceipt('file:///tmp/cache/doc', undefined, '地價稅.PDF')).toBe(true);
    });

    it('對圖片與空白值回傳 false', () => {
      expect(isPdfReceipt('https://example.com/storage/receipt.jpg')).toBe(false);
      expect(isPdfReceipt('https://example.com/storage/receipt.png?w=400', 'image/png')).toBe(false);
      expect(isPdfReceipt('', '', '')).toBe(false);
      expect(isPdfReceipt(null, null, null)).toBe(false);
    });
  });

  describe('getReceiptExtension & resolveReceiptMimeType', () => {
    it('正確解析 pdf / png / webp / jpg 副檔名與 MIME 類型', () => {
      expect(getReceiptExtension('application/pdf', 'tax.pdf', 'content://1')).toBe('pdf');
      expect(resolveReceiptMimeType('application/pdf', 'tax.pdf')).toBe('application/pdf');

      expect(getReceiptExtension('image/png', 'shot.png')).toBe('png');
      expect(resolveReceiptMimeType(undefined, 'shot.png')).toBe('image/png');

      expect(getReceiptExtension('image/webp', undefined, 'https://a.com/x.webp')).toBe('webp');
      expect(resolveReceiptMimeType(undefined, undefined, 'https://a.com/x.webp')).toBe('image/webp');

      expect(getReceiptExtension('image/jpeg', 'photo.jpg')).toBe('jpg');
      expect(resolveReceiptMimeType(undefined, undefined, 'file:///photo')).toBe('image/jpeg');
    });
  });

  describe('extractReceiptFileName', () => {
    it('優先使用非佔位之傳入檔名', () => {
      expect(extractReceiptFileName('https://example.com/a.pdf', '115年地價稅單.pdf')).toBe('115年地價稅單.pdf');
      expect(extractReceiptFileName('https://example.com/a.jpg', 'receipt.jpg')).toBe('消費收據憑證.jpg');
    });

    it('能從 Hex 編碼路徑還原中文原始檔名', () => {
      const hex = toHexUtf8('地價稅繳款書');
      const url = `https://example.com/storage/v1/object/public/statements/led-1/receipts/1732700000000__${hex}.pdf?t=1`;
      expect(extractReceiptFileName(url)).toBe('地價稅繳款書.pdf');
    });

    it('異常路徑或純預設檔名時安全降級', () => {
      expect(extractReceiptFileName('https://example.com/plain.pdf')).toBe('消費收據憑證.pdf');
      expect(extractReceiptFileName('https://example.com/plain.jpg')).toBe('消費收據憑證.jpg');
    });
  });

  describe('uploadReceiptPhoto', () => {
    it('上傳 PDF 時保留 .pdf 副檔名與 application/pdf Content-Type', async () => {
      jest.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: { session: { access_token: 'user-jwt-token' } },
      } as any);

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => '',
      });
      (globalThis as any).fetch = fetchMock;

      const pdfBlob = new Blob(['%PDF-1.4 mock'], { type: 'application/pdf' });
      const resultUrl = await uploadReceiptPhoto({
        ledgerId: 'led-123',
        uri: 'blob:http://localhost/mock-pdf',
        mimeType: 'application/pdf',
        originalName: '115年地價稅.pdf',
        file: pdfBlob,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [requestUrl, requestInit] = fetchMock.mock.calls[0];
      expect(requestUrl).toMatch(new RegExp(`^${SUPABASE_URL}/storage/v1/object/statements/led-123/receipts/\\d+__[0-9a-f]+\\.pdf$`));
      expect(requestInit.headers.apikey).toBe(SUPABASE_ANON_KEY);
      expect(requestInit.headers.Authorization).toBe('Bearer user-jwt-token');
      expect(requestInit.headers['Content-Type']).toBe('application/pdf');
      expect(resultUrl).toMatch(/\.pdf$/);
    });

    it('超過 20 MB 上限時直接拋出明確錯誤', async () => {
      const fetchMock = jest.fn();
      (globalThis as any).fetch = fetchMock;

      await expect(
        uploadReceiptPhoto({
          ledgerId: 'led-123',
          uri: 'file:///huge.pdf',
          mimeType: 'application/pdf',
          originalName: 'huge.pdf',
          size: MAX_RECEIPT_FILE_BYTES + 1,
        })
      ).rejects.toThrow('20 MB');

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('collectAttachmentStats & generateAttachmentArchiveHtml', () => {
    it('同時收錄一般收支 PDF 憑證與 JPG 收據並正確區分格式', () => {
      const hex = toHexUtf8('房屋稅單');
      const mockTransactions: Transaction[] = [
        {
          id: 'tx-pdf',
          ledger_id: 'led-1',
          creator_id: 'u-1',
          category_id: 'cat-1',
          amount: 4200,
          type: 'expense',
          paid_by: 'u-1',
          merchant: '稅務局',
          note: '地價稅',
          image_url: `https://example.com/storage/led-1/receipts/1732700000__${hex}.pdf`,
          is_settled: false,
          transacted_at: '2026-11-24T10:00:00.000Z',
          created_at: '2026-11-24T10:00:00.000Z',
        },
        {
          id: 'tx-jpg',
          ledger_id: 'led-1',
          creator_id: 'u-1',
          category_id: 'cat-1',
          amount: 150,
          type: 'expense',
          paid_by: 'u-1',
          merchant: '全聯',
          note: '牛奶',
          image_url: 'https://example.com/storage/led-1/receipts/1732700001__aabbcc.jpg',
          is_settled: false,
          transacted_at: '2026-11-25T10:00:00.000Z',
          created_at: '2026-11-25T10:00:00.000Z',
        },
      ];

      const stats = collectAttachmentStats({
        ledgerName: '測試記帳本',
        transactions: mockTransactions,
        cardStatements: [],
        recurringStatements: [],
        paymentAccounts: [],
        recurringRules: [],
        members: [],
        categories: [],
      });

      expect(stats.receiptCount).toBe(2);
      const pdfItem = stats.receipts.find(r => r.id === 'receipt_tx-pdf');
      const jpgItem = stats.receipts.find(r => r.id === 'receipt_tx-jpg');

      expect(pdfItem?.mimeType).toBe('application/pdf');
      expect(pdfItem?.originalName).toBe('20261124_稅務局_4200元_憑證.pdf');
      expect(pdfItem?.thumbnailUrl).toBeUndefined();

      expect(jpgItem?.mimeType).toBe('image/jpeg');
      expect(jpgItem?.originalName).toBe('20261125_全聯_150元_收據.jpg');
      expect(jpgItem?.thumbnailUrl).toBe('https://example.com/storage/led-1/receipts/1732700001__aabbcc.jpg');

      const html = generateAttachmentArchiveHtml({
        ledgerName: '測試記帳本',
        stats,
      });

      expect(html).toContain('📄 收據 PDF');
      expect(html).toContain('📎 收據憑證 (2)');
      expect(html).toContain("const isImg = (item.mimeType || '').startsWith('image/')");
    });
  });
});
