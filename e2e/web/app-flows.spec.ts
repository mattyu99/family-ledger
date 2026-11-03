import { test, expect, Page } from '@playwright/test';

// 注入已登入公帳本機快取輔助函式
async function injectActiveLedgerState(page: Page) {
  await page.addInitScript(() => {
    const mockLedger = {
      id: 'ab10fe7e-d0d8-4bc9-b338-24620d26d924',
      name: '幸福小窩家庭公帳',
      description: '全家人日常採買與生活開銷',
      currency: 'TWD',
      created_by: '11111111-1111-4000-8000-000000000001',
      created_at: new Date().toISOString(),
    };
    const mockUser = {
      id: '11111111-1111-4000-8000-000000000001',
      display_name: '爸爸 (測試)',
      avatar_url: '👨',
      role: 'admin',
      ledger_id: mockLedger.id,
    };
    const mockMembers = [
      mockUser,
      {
        id: '22222222-2222-4000-8000-000000000002',
        display_name: '媽媽 (測試)',
        avatar_url: '👩',
        role: 'member',
        ledger_id: mockLedger.id,
      },
    ];
    window.localStorage.setItem('@family_ledger_current', JSON.stringify(mockLedger));
    window.localStorage.setItem('@family_ledger_current_user', JSON.stringify(mockUser));
    window.localStorage.setItem(`@family_ledger_current_user_${mockLedger.id}`, JSON.stringify(mockUser));
    window.localStorage.setItem('@family_ledger_members', JSON.stringify(mockMembers));
    window.localStorage.setItem('@family_ledger_has_joined', 'true');
    window.localStorage.setItem('@family_ledger_invite_code', 'FAM-8823');
    window.localStorage.setItem('@family_ledger_transactions', JSON.stringify([]));
    window.localStorage.setItem('@family_ledger_categories', JSON.stringify([
      { id: '30000000-0000-4000-8000-000000000001', name: '餐飲伙食', icon: '🍲', color: '#EF4444', type: 'expense', sort_order: 1 },
      { id: '30000000-0000-4000-8000-000000000002', name: '生鮮超市', icon: '🛒', color: '#F59E0B', type: 'expense', sort_order: 2 },
    ]));
    window.localStorage.setItem('@family_ledger_payment_methods', JSON.stringify([
      { id: 'cash', name: '現金', icon: '💵', type: 'cash', is_active: true },
    ]));
  });
}

test.describe('家庭記帳本 Web 端：冷啟動訪客引導體驗', () => {
  test('冷啟動訪客引導畫面正常載入，能呈現建立帳本與加入選項', async ({ page }) => {
    await page.goto('/family-ledger/');
    await expect(page).toHaveTitle(/甜心記帳本/);

    // 驗證未加入帳本時的迎賓引導介面
    await expect(page.getByText('跨裝置即時同步').first()).toBeVisible();
    await expect(page.getByText(/建立新的家庭公帳|我是發起人/).first()).toBeVisible();
    await expect(page.getByText(/輸入邀請碼加入現有帳本|我是家人/).first()).toBeVisible();
    await expect(page.getByText(/Google 帳號/).first()).toBeVisible();

    // 點擊「我是發起人」開啟建立公帳彈窗
    await page.getByText(/建立新的家庭公帳|我是發起人/).first().click();
    await expect(page.getByText(/帳本名稱|建立新/i).first()).toBeVisible();
  });
});

test.describe('家庭記帳本 Web 端：核心分頁導航與操作流', () => {
  test.beforeEach(async ({ page }) => {
    await injectActiveLedgerState(page);
  });

  test('進入主畫面並呈現底部四個核心分頁導航', async ({ page }) => {
    await page.goto('/family-ledger/');
    await expect(page).toHaveTitle(/甜心記帳本/);

    // 驗證底部四個核心分頁標籤存在且可視
    await expect(page.getByText('明細', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('統計', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('帳單支付', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('家庭設定', { exact: true }).last()).toBeVisible();
  });

  test('記帳操作流程：點擊「＋」浮動按鈕，填寫金額與備註並成功儲存', async ({ page }) => {
    await page.goto('/family-ledger/');

    // 點擊記帳浮動按鈕 (FAB)
    await page.getByText('＋', { exact: true }).click();

    // 驗證記帳彈窗開啟並輸入金額
    const amountInput = page.getByPlaceholder('0').first();
    await expect(amountInput).toBeVisible();
    await amountInput.fill('168');

    // 輸入備註
    const noteInput = page.getByPlaceholder(/好市多牛肉|加滿油/).first();
    await expect(noteInput).toBeVisible();
    await noteInput.fill('自動化測試便當');

    // 點擊「儲存記帳」按鈕
    await page.getByText('儲存記帳', { exact: true }).click();

    // 驗證明細清單中成功出現該筆記帳紀錄與金額
    await expect(page.getByText('自動化測試便當').first()).toBeVisible();
    await expect(page.getByText(/168/).first()).toBeVisible();
  });

  test('分頁切換：點擊「統計」分頁能順利渲染統計畫面', async ({ page }) => {
    await page.goto('/family-ledger/');
    await page.getByText('統計', { exact: true }).last().click();
    await expect(page.getByText(/本月|統計|收支/i).first()).toBeVisible();
  });

  test('分頁切換：點擊「帳單支付」分頁能呈現帳單與資產概況', async ({ page }) => {
    await page.goto('/family-ledger/');
    await page.getByText('帳單支付', { exact: true }).last().click();
    await expect(page.getByText(/帳單與支付資產|定期扣款|分期攤提/).first()).toBeVisible();
  });

  test('分頁切換：點擊「家庭設定」能呈現公帳版本與設定選項', async ({ page }) => {
    await page.goto('/family-ledger/');
    await page.getByText('家庭設定', { exact: true }).last().click();
    await expect(page.getByText(/甜心記帳本|字體大小|家庭成員/).first()).toBeVisible();
  });
});
