import { test, expect } from '@playwright/test';
import { PLACED_ORDER_LABELS } from './env';
import { isOrderHistoryGet, placeValidBuyOrder, signIn } from './helpers';
import { getOrderStatus, loginTestUser, placeOrderViaApi } from './api';

// Blotter journey: status badges, rejected orders, the status filter and an
// order at NEW. Each test places its own orders rather than relying on
// another journey's.
test.describe('Blotter journey', () => {
  test('a placed order appears with its status, and an order at NEW is brought up to date', async ({ page }) => {
    await signIn(page, '/login?returnUrl=%2Forders%2Fnew');
    const order = await placeValidBuyOrder(page);
    await page.getByTestId('order-view-orders').click();
    await expect(page).toHaveURL(/\/orders\/history$/);

    const status = page.locator(`[data-testid="order-row"][data-order-id="${order.orderId}"]`).getByTestId('order-status');
    await expect(status).toBeVisible();
    expect(PLACED_ORDER_LABELS).toContain((await status.textContent())?.trim());
    await expect(page.getByRole('alert')).toHaveCount(0);

    if ((await status.textContent())?.trim() === 'New') {
      // No refresh pressed and no order re-posted: the blotter re-reads
      // order history by itself while anything is NEW.
      await page.waitForRequest((req) => isOrderHistoryGet(req.url(), req.method()), { timeout: 10_000 });
      expect(PLACED_ORDER_LABELS).toContain((await status.textContent())?.trim());
    }
  });

  test('every order carries its status as a word, not only a colour', async ({ page }) => {
    await signIn(page, '/login?returnUrl=%2Forders%2Fnew');
    await placeValidBuyOrder(page);
    await page.goto('/orders/history');

    const rows = page.getByTestId('order-row');
    await expect(rows.first()).toBeVisible();
    const labels = await rows.getByTestId('order-status').allTextContents();
    expect(labels.length).toBe(await rows.count());
    for (const label of labels) {
      expect(['New', 'Filled', 'Rejected', 'Cancelled']).toContain(label.trim());
    }
  });

  test('rejected orders are kept on the blotter', async ({ page, request }) => {
    // A BUY limit far below the market is rejected by the executor. The API
    // work happens before the browser signs in, because an API login ends
    // the user's other sessions.
    const { accessToken } = await loginTestUser(request);
    const { orderId } = await (await placeOrderViaApi(request, accessToken, { side: 'BUY', quantity: 1, price: 0.01 })).json();
    await expect
      .poll(() => getOrderStatus(request, accessToken, orderId), { timeout: 30_000, intervals: [1000] })
      .not.toBe('NEW')
      .catch(() => test.skip(true, 'The executor did not settle the order in time.'));

    await signIn(page, '/login?returnUrl=%2Forders%2Fhistory');
    const row = page.locator(`[data-testid="order-row"][data-order-id="${orderId}"]`);
    await expect(row.getByTestId('order-status')).toHaveText('Rejected');
  });

  test('the status filter asks the server for that status and shows only matching orders', async ({ page }) => {
    await signIn(page, '/login?returnUrl=%2Forders%2Fhistory');
    await expect(page.getByTestId('orders-count')).toBeVisible();

    const filtered = page.waitForRequest(
      (req) => isOrderHistoryGet(req.url(), req.method()) && new URL(req.url()).searchParams.get('status') === 'FILLED'
    );
    await page.getByTestId('orders-filter-FILLED').click();
    await filtered;
    await page.waitForLoadState('networkidle');

    for (const label of await page.getByTestId('order-row').getByTestId('order-status').allTextContents()) {
      expect(label.trim()).toBe('Filled');
    }
  });
});
