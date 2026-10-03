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
    await expect(page.getByTestId('watchlist-switch').first()).toBeVisible();
  });

  test.afterEach(async ({ request }) => {
    const { accessToken } = await loginTestUser(request);
    await deleteTestWatchlists(request, accessToken);
  });

  test('the Default list is shown and cannot be deleted', async ({ page }) => {
    const defaultTab = page.getByTestId('watchlist-switch').filter({ hasText: 'Default' });
    await defaultTab.click();

    await expect(defaultTab).toHaveAttribute('aria-current', 'true');
    await expect(page.getByTestId('watchlist-delete')).toHaveCount(0);
  });

  test('a new list is created, selected and starts empty', async ({ page }) => {
    const name = listName();
    await createList(page, name);

    await expect(page.getByTestId('watchlist-switch').filter({ hasText: name })).toHaveAttribute('aria-current', 'true');
    await expect(page.getByTestId('watch-row')).toHaveCount(0);
    await expect(page.getByText('No stocks yet')).toBeVisible();

    // Stored on the server, so it survives a reload.
    await page.reload();
    await expect(page.getByTestId('watchlist-switch').filter({ hasText: name })).toBeVisible();
  });

  test('a list needs a name, and names must be unique', async ({ page }) => {
    await page.getByTestId('watchlist-new').click();
    await page.getByTestId('watchlist-create').click();
    await expect(page.getByRole('alert').filter({ hasText: 'Give the watchlist a name.' })).toBeVisible();

    await page.getByTestId('watchlist-name').fill('Default');
    await page.getByTestId('watchlist-create').click();
    await expect(page.getByRole('alert').filter({ hasText: 'A watchlist with that name already exists.' })).toBeVisible();
  });

  test('stocks are found by name or symbol, added and removed', async ({ page }) => {
    await createList(page, listName());

    await page.getByTestId('stock-search').fill('apple');
    const appleRow = page.getByTestId('search-row').filter({ hasText: 'AAPL' });
    await expect(appleRow).toBeVisible();
    await appleRow.getByTestId('add-stock').click();

    const watched = page.locator('[data-testid="watch-row"][data-symbol="AAPL"]');
    await expect(watched).toBeVisible();
    await expect(appleRow.getByTestId('already-added')).toBeVisible();

    await page.getByTestId('stock-search').fill('MSFT');
    await page.getByTestId('search-row').filter({ hasText: 'MSFT' }).getByTestId('add-stock').click();
    await expect(page.getByTestId('watch-row')).toHaveCount(2);

    await watched.getByTestId('remove-stock').click();
    await expect(watched).toHaveCount(0);
    await expect(page.getByTestId('watch-row')).toHaveCount(1);
  });

  test('a search with no match says so', async ({ page }) => {
    await page.getByTestId('stock-search').fill('zzzz-no-such-stock');
    await expect(page.getByText('No stocks match')).toBeVisible();
    await expect(page.getByTestId('search-row')).toHaveCount(0);
  });

  test('deleting asks for confirmation, and "Keep" cancels it', async ({ page }) => {
    const name = listName();
    await createList(page, name);
    const tab = page.getByTestId('watchlist-switch').filter({ hasText: name });

    await page.getByTestId('watchlist-delete').click();
    await page.getByRole('button', { name: 'Keep' }).click();
    await expect(tab).toBeVisible();

    await page.getByTestId('watchlist-delete').click();
    await page.getByTestId('watchlist-delete-confirm').click();
    await expect(tab).toHaveCount(0);
    await expect(page.getByTestId('watchlist-switch').filter({ hasText: 'Default' })).toHaveAttribute('aria-current', 'true');
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
