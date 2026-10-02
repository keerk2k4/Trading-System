import { test, expect } from '@playwright/test';
import { env, PLACED_ORDER_LABELS, PLACED_ORDER_STATUSES } from './env';
import { isOrderPost, placeValidBuyOrder, signIn } from './helpers';

// Place-order journey against the real Trade REST API. Each test signs in on
// its own; nothing is shared with the sign-in journey or between tests.
test.describe('Place-order journey', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, '/login?returnUrl=%2Forders%2Fnew');
    await expect(page).toHaveURL(/\/orders\/new$/);
  });

  test('shows the account from the session, read-only', async ({ page }) => {
    const account = page.getByTestId('order-account');

    await expect(account).toHaveText(env.accountId);
    // Rendered as text, not as a form control the trader could change.
    expect(await account.evaluate((el) => el.tagName)).toBe('DD');
    await expect(page.getByLabel(/account/i)).toHaveCount(0);
  });

  test('rejects a zero quantity before anything is submitted', async ({ page }) => {
    const orderPosts: string[] = [];
    page.on('request', (req) => {
      if (isOrderPost(req.url(), req.method())) {
        orderPosts.push(req.url());
      }
    });

    await page.getByTestId('order-side-buy').click();
    await page.getByTestId('order-symbol').fill(env.symbol);
    await page.getByTestId('order-quantity').fill('0');
    await page.getByTestId('order-price').fill('100.00');
    await page.getByTestId('order-submit').click();

    await expect(page.getByTestId('order-error-quantity')).toHaveText(
      'Quantity must be a whole number greater than 0.'
    );
    await expect(page.getByTestId('order-quantity')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('order-result')).toHaveCount(0);
    await expect(page).toHaveURL(/\/orders\/new$/);
    expect(orderPosts).toEqual([]);
  });

  test('places a valid order and shows whatever status came back', async ({ page }) => {
    const order = await placeValidBuyOrder(page);

    // The executor may or may not have resolved it yet, so any of these is a pass.
    expect(PLACED_ORDER_STATUSES).toContain(order.status);
    await expect(page.getByTestId('order-result')).toBeVisible();
    await expect(page.getByTestId('order-id')).toHaveText(order.orderId);
    expect(PLACED_ORDER_LABELS).toContain((await page.getByTestId('order-status').textContent())?.trim());
  });

  test('a placed order appears on the blotter, with NEW treated as working', async ({ page }) => {
    const order = await placeValidBuyOrder(page);
    await page.getByTestId('order-view-orders').click();
    await expect(page).toHaveURL(/\/orders\/history$/);

    const row = page.locator(`[data-testid="order-row"][data-order-id="${order.orderId}"]`);
    await expect(row).toBeVisible();
    const status = (await row.getByTestId('order-status').textContent())?.trim();
    expect(PLACED_ORDER_LABELS).toContain(status);

    // NEW is the normal working state: no error is shown, and the blotter
    // says so in words.
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByTestId('status-guide').locator('summary').click();
    await expect(page.getByTestId('status-guide')).toContainText(
      'Submitted and waiting for execution. This is the normal state.'
    );
  });
});
