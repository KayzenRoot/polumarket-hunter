import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const VIEWS = [
  { label: 'Overview', heading: 'Microstructure, measured.' },
  { label: 'Markets', heading: 'Market microstructure' },
  { label: 'Trades', heading: 'Fills and realized PnL' },
  { label: 'Reports', heading: 'Session report' },
  { label: 'Risk', heading: 'Risk and compliance' },
] as const;

async function openView(page: Page, label: string, heading: string): Promise<void> {
  await page.goto('/');
  if (label !== 'Overview') {
    await page.getByRole('button', { name: label }).click();
  }
  await expect(page.getByRole('heading', { name: heading })).toBeVisible();
}

async function tabTo(page: Page, name: string): Promise<void> {
  for (let index = 0; index < 120; index += 1) {
    await page.keyboard.press('Tab');
    const activeName = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) {
        return null;
      }
      return active.getAttribute('aria-label') ?? active.textContent?.trim() ?? null;
    });
    if (activeName === name) {
      return;
    }
  }
  throw new Error(`could not reach ${name} with the keyboard`);
}

test.describe('accessibility audit', () => {
  test.describe.configure({ timeout: 60_000 });

  for (const view of VIEWS) {
    test(`${view.label} has no critical or serious axe violations`, async ({ page }) => {
      await openView(page, view.label, view.heading);
      const results = await new AxeBuilder({ page }).analyze();
      const blocking = results.violations.filter(
        (violation) => violation.impact === 'critical' || violation.impact === 'serious',
      );
      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    });
  }
});

test('keyboard reaches market detail and the kill switch', async ({ page }) => {
  await page.request.post('/api/control', { data: { action: 'reset-kill' } });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Microstructure, measured.' })).toBeVisible();

  await tabTo(page, 'Markets');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Market microstructure' })).toBeVisible();

  await tabTo(page, 'Will BTC close above $100k this month?');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Strategy decision', { exact: true })).toBeVisible();

  page.on('dialog', (dialog) => {
    void dialog.accept();
  });
  await tabTo(page, 'Kill');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Reset kill' })).toBeVisible({
    timeout: 10_000,
  });

  await page.getByRole('button', { name: 'Risk' }).click();
  await expect(page.getByText('KILL SWITCH ON')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Reset kill' }).click();
  await expect(page.getByText('ARMED')).toBeVisible({ timeout: 10_000 });
});

test.describe('mobile viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('dashboard is usable and does not overflow at 390px', async ({ page }, testInfo) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Microstructure, measured.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Markets' })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await page.getByRole('button', { name: 'Markets' }).click();
    await expect(page.getByRole('heading', { name: 'Market microstructure' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Will BTC close above $100k this month?' }),
    ).toBeVisible();

    const screenshot = await page.screenshot({ fullPage: true });
    await testInfo.attach('mobile-dashboard', { body: screenshot, contentType: 'image/png' });
  });
});
