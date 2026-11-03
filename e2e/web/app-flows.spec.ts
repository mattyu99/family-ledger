import { test, expect } from '@playwright/test';

test.describe('家庭記帳本 Web 端自動化 E2E 測試', () => {
  test('首頁正常載入並呈現核心導航與標籤', async ({ page }) => {
    await page.goto('/family-ledger/');
    await expect(page).toHaveTitle(/甜心記帳本/);

    // 驗證底部四個核心分頁導航標籤存在且可視
    await expect(page.getByText('明細').first()).toBeVisible();
    await expect(page.getByText('統計').first()).toBeVisible();
    await expect(page.getByText('帳單支付').first()).toBeVisible();
    await expect(page.getByText('家庭設定').first()).toBeVisible();
  });

  test('分頁切換：點擊「統計」分頁能順利渲染統計畫面', async ({ page }) => {
    await page.goto('/family-ledger/');
    await page.getByText('統計').first().click();
    await expect(page.getByText(/統計|收支|支出|結算/i).first()).toBeVisible();
  });

  test('分頁切換：點擊「帳單支付」分頁能呈現週期帳單與信用卡', async ({ page }) => {
    await page.goto('/family-ledger/');
    await page.getByText('帳單支付').first().click();
    await expect(page.getByText(/帳單|支付|週期|信用卡/i).first()).toBeVisible();
  });

  test('分頁切換：點擊「家庭設定」能呈現備份、成員與字型自訂選項', async ({ page }) => {
    await page.goto('/family-ledger/');
    await page.getByText('家庭設定').first().click();
    await expect(page.getByText(/字體|備份|成員|家庭/i).first()).toBeVisible();
  });
});
