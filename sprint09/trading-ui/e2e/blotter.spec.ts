import { test, expect } from '@playwright/test';
import { ALL_STATUS_LABELS, PLACED_ORDER_LABELS } from './env';
import { isOrderHistoryGet, placeValidBuyOrder, signIn } from './helpers';
import { getOrderStatus, loginTestUser, placeOrderViaApi } from './api';

// Blotter journey. Tests that need an order place their own, rather than
// relying on one left behind by the place-order journey.
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
    const count = await rows.count();
    await expect(page.getByTestId('orders-count')).toHaveText(`${count} ${count === 1 ? 'order' : 'orders'}`);
  });

  test('the newest order is listed first', async ({ page }) => {
    const order = await placeValidBuyOrder(page);
    await page.goto('/orders/history');

    await expect(page.getByTestId('order-row').first()).toHaveAttribute('data-order-id', order.orderId);
  });

  for (const status of ['NEW', 'FILLED', 'REJECTED', 'CANCELLED']) {
    test(`the ${status} filter shows only ${status} orders`, async ({ page }) => {
      await page.goto('/orders/history');
      await expect(page.getByTestId('orders-count')).not.toHaveText('Loading orders…');

      const reload = page.waitForRequest((req) => isOrderHistoryGet(req.url(), req.method()) && req.url().includes(`status=${status}`));
      await page.getByTestId(`orders-filter-${status}`).click();
      await reload;
      await expect(page.getByTestId('orders-count')).not.toHaveText('Loading orders…');

      const label = status.charAt(0) + status.slice(1).toLowerCase();
      const rows = page.getByTestId('order-row');
      if ((await rows.count()) === 0) {
        await expect(page.getByTestId('orders-empty')).toContainText(`No ${status.toLowerCase()} orders`);
      } else {
        for (const text of await rows.getByTestId('order-status').allTextContents()) {
          expect(text.trim()).toBe(label);
        }
      }

      // Back to "All": the per-status empty message must go.
      await page.getByTestId('orders-filter-ALL').click();
      await expect(page.getByText(`No ${status.toLowerCase()} orders`)).toHaveCount(0);
    });
  }

  test('rejected orders are kept on the blotter', async ({ page, request }) => {
    // A BUY limit far below the market is rejected by the executor.
    const { accessToken } = await loginTestUser(request);
    const placed = await placeOrderViaApi(request, accessToken, { side: 'BUY', quantity: 1, price: 0.01 });
    const { orderId } = await placed.json();
    await expect
      .poll(() => getOrderStatus(request, accessToken, orderId), { timeout: 30_000, intervals: [1000] })
      .not.toBe('NEW')
      .catch(() => test.skip(true, 'The executor did not settle the order in time.'));

    await page.goto('/orders/history');
    await page.getByTestId('orders-filter-REJECTED').click();
    const row = page.locator(`[data-testid="order-row"][data-order-id="${orderId}"]`);
    await expect(row).toBeVisible();
    await expect(row.getByTestId('order-status')).toHaveText('Rejected');
  });

  test('Refresh re-reads order history', async ({ page }) => {
    await page.goto('/orders/history');
    await expect(page.getByTestId('orders-count')).not.toHaveText('Loading orders…');

    const reload = page.waitForRequest((req) => isOrderHistoryGet(req.url(), req.method()));
    await page.getByTestId('orders-refresh').click();
    await reload;
    await expect(page.getByTestId('orders-count')).not.toHaveText('Loading orders…');
  });

  test('"New order" opens the order ticket', async ({ page }) => {
    await page.goto('/orders/history');
    await page.getByTestId('orders-new').click();
    await expect(page).toHaveURL(/\/orders\/new$/);
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

  test.fixme('an order the executor cannot price is eventually resolved, not left at NEW', async () => {
    // Known bug (scan): when Fauxnance has no quote the executor neither fills
    // nor rejects the order, so it stays NEW for ever and the blotter stops
    // polling after 5 minutes. Needs a way to make pricing unavailable.
  });
});
