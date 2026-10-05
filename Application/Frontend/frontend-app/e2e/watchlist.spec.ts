import { test, expect, Page } from '@playwright/test';
import { signIn } from './helpers';
import { deleteTestWatchlists, loginTestUser } from './api';

// Watchlist journey against the real Trade REST API. Every list a test makes
// is named "E2E ..." and deleted afterwards.
const listName = () => `E2E ${Date.now()}`;

async function createList(page: Page, name: string): Promise<void> {
  await page.getByTestId('watchlist-new').click();
  await page.getByTestId('watchlist-name').fill(name);
  await page.getByTestId('watchlist-create').click();
  await expect(page.getByTestId('watchlist-switch').filter({ hasText: name })).toBeVisible();
}

test.describe('Watchlist journey', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, '/login?returnUrl=%2Fwatchlist');
    await expect(page).toHaveURL(/\/watchlist$/);
  });

  test.afterEach(async ({ request }) => {
    const { accessToken } = await loginTestUser(request);
    await deleteTestWatchlists(request, accessToken);
  });

  test('a new list is created and stocks are added and removed', async ({ page }) => {
    await createList(page, listName());

    await page.getByTestId('stock-search').fill('apple');
    await page.getByTestId('search-row').filter({ hasText: 'AAPL' }).getByTestId('add-stock').click();
    const watched = page.locator('[data-testid="watch-row"][data-symbol="AAPL"]');
    await expect(watched).toBeVisible();

    await watched.getByTestId('remove-stock').click();
    await expect(watched).toHaveCount(0);
  });

  test('a watched stock links to the order ticket with its symbol filled in', async ({ page }) => {
    await createList(page, listName());
    await page.getByTestId('stock-search').fill('NVDA');
    await page.getByTestId('search-row').filter({ hasText: 'NVDA' }).getByTestId('add-stock').click();

    await page.locator('[data-testid="watch-row"][data-symbol="NVDA"]').getByTestId('trade-stock').first().click();
    await expect(page).toHaveURL(/\/orders\/new\?symbol=NVDA$/);
    await expect(page.getByTestId('order-symbol')).toHaveValue('NVDA');
  });
});
