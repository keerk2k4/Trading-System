import { test, expect } from '@playwright/test';
import { env, MESSAGES, PLACED_ORDER_LABELS, PLACED_ORDER_STATUSES } from './env';
import { fillTicket, isOrderPost, placeValidBuyOrder, recordRequests, signIn, submitTicket } from './helpers';
import { getOrderStatus, loginTestUser, placeOrderViaApi } from './api';

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

  test.describe('rejection before submission', () => {
    const cases: { name: string; ticket: Parameters<typeof fillTicket>[1]; errorId: string; message: string }[] = [
      { name: 'a zero quantity', ticket: { quantity: '0' }, errorId: 'order-error-quantity', message: 'Quantity must be a whole number greater than 0.' },
      { name: 'a negative quantity', ticket: { quantity: '-3' }, errorId: 'order-error-quantity', message: 'Quantity must be a whole number greater than 0.' },
      { name: 'a fractional quantity', ticket: { quantity: '1.5' }, errorId: 'order-error-quantity', message: 'Quantity must be a whole number greater than 0.' },
      { name: 'a zero price', ticket: { price: '0' }, errorId: 'order-error-price', message: 'Price must be greater than 0.' },
      { name: 'a negative price', ticket: { price: '-1' }, errorId: 'order-error-price', message: 'Price must be greater than 0.' },
      { name: 'a price with three decimals', ticket: { price: '10.125' }, errorId: 'order-error-price', message: 'Price can have at most 2 decimal places.' },
      { name: 'a symbol over 10 characters', ticket: { symbol: 'ABCDEFGHIJK' }, errorId: 'order-error-symbol', message: 'Symbols are at most 10 characters.' }
    ];

    for (const { name, ticket, errorId, message } of cases) {
      test(`rejects ${name}`, async ({ page }) => {
        const orderPosts = recordRequests(page, isOrderPost);
        await fillTicket(page, { side: 'BUY', symbol: env.symbol, quantity: '1', price: '100.00', ...ticket });
        await page.getByTestId('order-submit').click();

        await expect(page.getByTestId(errorId)).toHaveText(message);
        await expect(page.getByTestId('order-result')).toHaveCount(0);
        expect(orderPosts).toEqual([]);
      });
    }

    test('an empty ticket shows every required-field error', async ({ page }) => {
      const orderPosts = recordRequests(page, isOrderPost);
      await page.getByTestId('order-submit').click();

      await expect(page.getByTestId('order-error-side')).toHaveText('Choose buy or sell.');
      await expect(page.getByTestId('order-error-symbol')).toHaveText('Enter a symbol.');
      await expect(page.getByTestId('order-error-quantity')).toHaveText('Enter a quantity.');
      await expect(page.getByTestId('order-error-price')).toHaveText('Enter a price.');
      expect(orderPosts).toEqual([]);
    });
  });

  test('the summary follows the ticket as it is filled in', async ({ page }) => {
    await fillTicket(page, { side: 'SELL', symbol: 'aapl', quantity: '3', price: '12.50' });

    await expect(page.getByTestId('order-summary-symbol')).toHaveText('AAPL');
    await expect(page.getByTestId('order-summary-side')).toHaveText('Sell');
    await expect(page.getByTestId('order-summary-quantity')).toHaveText('3');
    await expect(page.getByTestId('order-summary-price')).toHaveText('$12.50');
    await expect(page.getByTestId('order-estimate')).toHaveText('$37.50');
    await expect(page.getByTestId('order-submit')).toHaveText('Place sell order');
  });

  test('a link with ?symbol= fills in the symbol', async ({ page }) => {
    await page.goto('/orders/new?symbol=msft');
    await expect(page.getByTestId('order-symbol')).toHaveValue('MSFT');
    await expect(page.getByTestId('order-summary-symbol')).toHaveText('MSFT');
  });

  test('places a valid order and shows whatever status came back', async ({ page }) => {
    const order = await placeValidBuyOrder(page);

    // The executor may or may not have resolved it yet, so any of these is a pass.
    expect(PLACED_ORDER_STATUSES).toContain(order.status);
    await expect(page.getByTestId('order-result')).toBeVisible();
    await expect(page.getByTestId('order-id')).toHaveText(order.orderId);
    expect(PLACED_ORDER_LABELS).toContain((await page.getByTestId('order-status').textContent())?.trim());
  });

  test('"Place another order" brings back an empty ticket', async ({ page }) => {
    await placeValidBuyOrder(page);
    await page.getByTestId('order-place-another').click();

    await expect(page.getByTestId('order-result')).toHaveCount(0);
    await expect(page.getByTestId('order-symbol')).toHaveValue('');
    await expect(page.getByTestId('order-quantity')).toHaveValue('');
    await expect(page.getByTestId('order-error-side')).toHaveCount(0);
  });

  test('a placed order appears on the blotter, with NEW treated as working', async ({ page }) => {
    const order = await placeValidBuyOrder(page);
    await page.getByTestId('order-view-orders').click();
    await expect(page).toHaveURL(/\/orders\/history$/);

    const row = page.locator(`[data-testid="order-row"][data-order-id="${order.orderId}"]`);
    await expect(row).toBeVisible();
    expect(PLACED_ORDER_LABELS).toContain((await row.getByTestId('order-status').textContent())?.trim());

    // NEW is the normal working state: no error is shown, and the blotter
    // says so in words.
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByTestId('status-guide').locator('summary').click();
    await expect(page.getByTestId('status-guide')).toContainText(
      'Submitted and waiting for execution. This is the normal state.'
    );
  });

  test.describe('rejection by the Trade REST API', () => {
    test('an unknown instrument is refused with INS-404', async ({ page }) => {
      const response = await submitTicket(page, { symbol: 'ZZZQX' });

      expect(response.status()).toBe(404);
      expect((await response.json()).errorCode).toBe('INS-404');
      await expect(page.getByTestId('order-error')).toHaveText(MESSAGES['INS-404']);
      await expect(page.getByTestId('order-result')).toHaveCount(0);
    });

    test('a buy larger than the cash balance is refused with ORD-400', async ({ page }) => {
      const response = await submitTicket(page, { quantity: '1000000', price: '99999.99' });

      expect(response.status()).toBe(400);
      expect((await response.json()).errorCode).toBe('ORD-400');
      await expect(page.getByTestId('order-error')).toHaveText(MESSAGES['ORD-400']);
    });

    test('selling more than is held is refused with ORD-409', async ({ page }) => {
      const response = await submitTicket(page, { side: 'SELL', quantity: '999999', price: '1.00' });

      expect(response.status()).toBe(409);
      expect((await response.json()).errorCode).toBe('ORD-409');
      await expect(page.getByTestId('order-error')).toHaveText(MESSAGES['ORD-409']);
    });

    test('a corrected ticket can be resubmitted after a refusal', async ({ page }) => {
      await submitTicket(page, { symbol: 'ZZZQX' });
      await expect(page.getByTestId('order-error')).toBeVisible();

      const order = await placeValidBuyOrder(page);
      expect(PLACED_ORDER_STATUSES).toContain(order.status);
      await expect(page.getByTestId('order-result')).toBeVisible();
    });
  });

  test('a SELL within the holding is accepted', async ({ page, request }) => {
    // Buy one unit at a limit well above the market so the executor fills it,
    // then sell it. Needs the executor and market data to be running. The
    // cash check uses the limit price, so keep it affordable.
    const { accessToken } = await loginTestUser(request);
    const buy = await placeOrderViaApi(request, accessToken, { side: 'BUY', quantity: 1, price: 5000 });
    expect(buy.ok(), `BUY answered ${buy.status()} ${await buy.text()}`).toBe(true);
    const { orderId } = await buy.json();
    await expect
      .poll(() => getOrderStatus(request, accessToken, orderId), { timeout: 30_000, intervals: [1000] })
      .not.toBe('NEW')
      .catch(() => test.skip(true, 'The executor did not settle the BUY in time, so there is nothing to sell.'));
    test.skip((await getOrderStatus(request, accessToken, orderId)) !== 'FILLED', 'The BUY was not filled.');

    const response = await submitTicket(page, { side: 'SELL', quantity: '1', price: '1.00' });
    expect(response.ok(), `SELL answered ${response.status()}`).toBe(true);
    expect(PLACED_ORDER_STATUSES).toContain((await response.json()).status);
    await expect(page.getByTestId('order-result')).toBeVisible();
  });
});
