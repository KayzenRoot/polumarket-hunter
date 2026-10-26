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

  test('falls back to polling when the SSE stream is offline', async ({ page }) => {
    await page.route('**/api/stream', (route) => route.abort());
    await page.goto('/');
    await expect(page.getByText('Stream offline', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Microstructure, measured.' })).toBeVisible();
    await expect(page.getByText('STREAM OFFLINE', { exact: true })).toBeVisible();
  });

  test('shows empty states instead of a blank dashboard', async ({ page }) => {
    const stateResponse = await page.request.get('/api/state');
    const body = (await stateResponse.json()) as {
      ok: true;
      data: Record<string, unknown>;
    };
    const empty = {
      ...body,
      data: {
        ...body.data,
        markets: [],
        trades: [],
        signals: [],
      },
    };
    await page.route('**/api/state', (route) => route.fulfill({ json: empty }));
    await page.route('**/api/stream', (route) => route.abort());
    await page.goto('/');
    await page.getByRole('button', { name: 'Markets' }).click();
    await expect(page.getByText('No markets yet')).toBeVisible();
    await page.getByRole('button', { name: 'Trades' }).click();
    await expect(page.getByText('No paper fills yet')).toBeVisible();
  });

  test('recovers from a render crash with the error boundary', async ({ page }) => {
    let first = true;
    await page.route('**/api/stream', (route) => route.abort());
    await page.route('**/api/state', async (route) => {
      if (first) {
        first = false;
        await route.fulfill({
          json: {
            ok: true,
            data: {
              health: {
                status: 'running',
                mode: 'paper',
                liveAuthorized: false,
                liveAllowed: false,
                liveBlockReason: 'paper mode',
                startedAt: 1_000_000,
                uptimeMs: 0,
                markets: 0,
                subscriptions: 0,
                books: 0,
                lastBookAt: null,
                provider: {
                  name: 'test',
                  connected: false,
                  lastMessageAt: null,
                  reconnectCount: 0,
                  error: null,
                },
                geoblock: {
                  status: 'UNKNOWN',
                  blocked: null,
                  country: null,
                  region: null,
                  checkedAt: 1_000_000,
                  reason: null,
                },
                killReason: null,
              },
              portfolio: null,
            },
          },
        });
        return;
      }
      await route.continue();
    });
    await page.goto('/');
    await expect(page.getByText('Dashboard crashed')).toBeVisible();
    await page.getByRole('button', { name: 'Reload dashboard' }).click();
    await expect(page.getByRole('heading', { name: 'Microstructure, measured.' })).toBeVisible();
  });
});
