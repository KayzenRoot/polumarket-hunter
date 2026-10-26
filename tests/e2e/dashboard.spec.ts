import { expect, test } from '@playwright/test';

test.describe('PolyHunter dashboard', () => {
  test('loads the paper terminal and navigates every surface', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/PolyHunter/);
    await expect(page.getByText('POLYHUNTER', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('PAPER', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Microstructure, measured.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Equity curve' })).toBeVisible();
    await expect(page.getByText('Risk engine', { exact: true })).toBeVisible();
    await expect(page.getByText('Will BTC close above $100k this month?').first()).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: 'Markets' }).click();
    await expect(page.getByRole('heading', { name: 'Market microstructure' })).toBeVisible();
    await page.getByRole('button', { name: 'Will BTC close above $100k this month?' }).click();
    await expect(page.getByText('Strategy decision', { exact: true })).toBeVisible();
    await expect(page.getByText('fee-free', { exact: true })).toBeVisible();
    await expect(page.getByText('Asks', { exact: true })).toBeVisible();
    await expect(page.getByText('Bids', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Trades' }).click();
    await expect(page.getByRole('heading', { name: 'Fills and realized PnL' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Filter trades by session' })).toBeVisible();
    await expect(page.getByText(/^session ses_/)).toBeVisible();

    await page.getByRole('button', { name: 'Reports' }).click();
    await expect(page.getByRole('heading', { name: 'Session report' })).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download CSV' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^session-.*\.csv$/);

    await page.getByRole('button', { name: 'Risk' }).click();
    await expect(page.getByRole('heading', { name: 'Risk and compliance' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Freshness and provider latency' }),
    ).toBeVisible();
    await expect(page.getByText('Age p50 / p95 / p99')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel all orders' })).toBeVisible();
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
    await page.getByRole('button', { name: 'Resume' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await expect(page.getByText('Why this is paper only')).toBeVisible();
    await expect(page.getByText(/No VPN, proxy, account-sharing/)).toBeVisible();
  });

  test('operates the kill switch and resets it', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Risk engine', { exact: true })).toBeVisible();

    page.on('dialog', (dialog) => {
      void dialog.accept();
    });
    await page.getByRole('button', { name: 'Kill' }).click();
    await expect(page.getByText('KILL SWITCH ON')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/operator kill switch/)).toBeVisible();

    await page.getByRole('button', { name: 'Reset kill' }).click();
    await expect(page.getByText('ARMED')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/operator kill switch/)).toHaveCount(0);
  });
});
