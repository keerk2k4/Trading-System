import { test, expect } from '@playwright/test';
import { ALL_STATUS_LABELS, PLACED_ORDER_LABELS } from './env';
import { isOrderHistoryGet, placeValidBuyOrder, signIn } from './helpers';

// Optional blotter journey. It places its own order rather than relying on
// one left behind by the place-order journey.
test.describe('Blotter journey', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, '/login?returnUrl=%2Forders%2Fnew');
    await expect(page).toHaveURL(/\/orders\/new$/);
  });

  test('lists orders with a worded status badge on every row', async ({ page }) => {
    await placeValidBuyOrder(page);
    await page.goto('/orders/history');

    const rows = page.getByTestId('order-row');
    await expect(rows.first()).toBeVisible();
    for (const label of await rows.getByTestId('order-status').allTextContents()) {
      expect(ALL_STATUS_LABELS).toContain(label.trim());
    }
  });

  test('a NEW order keeps the blotter re-reading order history until it settles', async ({ page }) => {
    const order = await placeValidBuyOrder(page);
    test.skip(order.status !== 'NEW', `Order came back ${order.status}, so there is nothing to poll for.`);

    await page.goto('/orders/history');
    const row = page.locator(`[data-testid="order-row"][data-order-id="${order.orderId}"]`);
    await expect(row).toBeVisible();

    // If the order is still NEW on screen, the blotter must re-read the list
    // by itself (it polls every 5 s) - no refresh pressed, no order re-posted.
    const shown = (await row.getByTestId('order-status').textContent())?.trim();
    if (shown === 'New') {
      await page.waitForRequest((req) => isOrderHistoryGet(req.url(), req.method()), { timeout: 10_000 });
    }
    expect(PLACED_ORDER_LABELS).toContain((await row.getByTestId('order-status').textContent())?.trim());
  });
});
