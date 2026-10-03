import { test, expect } from '@playwright/test';
import { env } from './env';
import { parseMoney, signIn } from './helpers';
import { bearer, getBalance, loginTestUser } from './api';

// Dashboard journey: what the trader sees must match what the Trade REST API
// says about their account.
test.describe('Dashboard journey', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('greets the trader and shows their account', async ({ page }) => {
    await expect(page.getByTestId('dashboard-welcome')).toHaveText(`Welcome back, ${env.username}`);
    await expect(page.getByTestId('dashboard-account-id')).toHaveText(env.accountId);
    await expect(page.getByTestId('dashboard-account-status')).toHaveText('Active');
    await expect(page.getByTestId('dashboard-kyc-status')).toHaveText('Approved');
    await expect(page.getByTestId('dashboard-error')).toHaveCount(0);
  });

  test('available cash matches the account balance', async ({ page, request }) => {
    await expect(page.getByTestId('dashboard-cash')).not.toHaveText('—');
    const { accessToken } = await loginTestUser(request);
    const balance = await getBalance(request, accessToken);

    expect(parseMoney(await page.getByTestId('dashboard-cash').textContent())).toBeCloseTo(balance, 2);
  });

  test('positions match the account positions', async ({ page, request }) => {
    const { accessToken } = await loginTestUser(request);
    const res = await request.get(`${env.tradeApi}/api/v1/accounts/me/positions`, { headers: bearer(accessToken) });
    const positions = (await res.json()) as { symbol: string; quantity: number }[];

    await expect(page.getByTestId('dashboard-position-count')).toContainText(`${positions.length} open`);
    if (positions.length === 0) {
      await expect(page.getByText('No open positions')).toBeVisible();
    } else {
      for (const position of positions) {
        await expect(page.locator(`[data-testid="position-row"][data-symbol="${position.symbol}"]`)).toBeVisible();
      }
    }
  });

  test('links lead to the order ticket and order history', async ({ page }) => {
    await page.getByRole('main').getByRole('link', { name: 'Place order' }).click();
    await expect(page).toHaveURL(/\/orders\/new$/);
    await page.goBack();
    await page.getByRole('main').getByRole('link', { name: 'Order history' }).click();
    await expect(page).toHaveURL(/\/orders\/history$/);
  });

  test('the side navigation reaches every trading screen', async ({ page }) => {
    for (const [testId, path] of [
      ['nav-watchlist', '/watchlist'],
      ['nav-funds', '/funds'],
      ['nav-orders-new', '/orders/new'],
      ['nav-orders-history', '/orders/history'],
      ['nav-dashboard', '/dashboard']
    ]) {
      await page.getByTestId(testId).click();
      await expect(page, testId).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByTestId(testId)).toHaveAttribute('aria-current', 'page');
    }
  });
});
