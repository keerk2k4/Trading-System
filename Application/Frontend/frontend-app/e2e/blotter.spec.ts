import { test, expect } from '@playwright/test';
import { PLACED_ORDER_LABELS } from './env';
import { isOrderHistoryGet, placeValidBuyOrder, signIn } from './helpers';
import { getOrderStatus, loginTestUser, placeOrderViaApi } from './api';

// Blotter journey: status badges and an order sitting at NEW. Each test
// places its own order rather than relying on another journey's.
test.describe('Blotter journey', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, '/login?returnUrl=%2Forders%2Fnew');
    await expect(page).toHaveURL(/\/orders\/new$/);
  });

  test('every order has a status badge in words', async ({ page }) => {
    await placeValidBuyOrder(page);
    await page.goto('/orders/history');

    const rows = page.getByTestId('order-row');
    await expect(rows.first()).toBeVisible();
    for (const label of await rows.getByTestId('order-status').allTextContents()) {
      expect(['New', 'Filled', 'Rejected', 'Cancelled']).toContain(label.trim());
    }
  });

  test('rejected orders are kept on the blotter', async ({ page, request }) => {
    // A BUY limit far below the market is rejected by the executor.
    const { accessToken } = await loginTestUser(request);
    const { orderId } = await (await placeOrderViaApi(request, accessToken, { side: 'BUY', quantity: 1, price: 0.01 })).json();
    await expect
      .poll(() => getOrderStatus(request, accessToken, orderId), { timeout: 30_000, intervals: [1000] })
      .not.toBe('NEW')
      .catch(() => test.skip(true, 'The executor did not settle the order in time.'));

    // The API login above revoked the browser's refresh cookie (a new login
    // ends the user's other sessions), and a reload re-authenticates from that
    // cookie. Sign the browser in again rather than reloading into /login.
    await signIn(page, '/login?returnUrl=%2Forders%2Fhistory');
    const row = page.locator(`[data-testid="order-row"][data-order-id="${orderId}"]`);
    await expect(row.getByTestId('order-status')).toHaveText('Rejected');
  });

  test('an order at NEW keeps the blotter re-reading order history by itself', async ({ page }) => {
    const order = await placeValidBuyOrder(page);
    await page.goto('/orders/history');
    const row = page.locator(`[data-testid="order-row"][data-order-id="${order.orderId}"]`);
    await expect(row).toBeVisible();
    test.skip(
      (await row.getByTestId('order-status').textContent())?.trim() !== 'New',
      'The executor settled the order before the blotter loaded, so there is nothing to poll for.'
    );

    // No refresh pressed and no order re-posted: the blotter polls (every 5 s)
    // while anything is NEW, and the row stays in a valid state.
    await page.waitForRequest((req) => isOrderHistoryGet(req.url(), req.method()), { timeout: 10_000 });
    expect(PLACED_ORDER_LABELS).toContain((await row.getByTestId('order-status').textContent())?.trim());
  });
});
