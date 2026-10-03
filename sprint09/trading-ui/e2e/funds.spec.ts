import { test, expect } from '@playwright/test';
import { env } from './env';
import { parseMoney, recordRequests, signIn } from './helpers';
import { getBalance, loginTestUser } from './api';

const isBalancePatch = (url: string, method: string) =>
  method === 'PATCH' && url === `${env.tradeApi}/api/v1/accounts/me/balance`;

// Funds journey against the real Trade REST API. Money tests deposit and then
// withdraw the same amount, so the account ends where it started.
test.describe('Funds journey', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, '/login?returnUrl=%2Ffunds');
    await expect(page).toHaveURL(/\/funds$/);
    await expect(page.getByTestId('funds-balance')).not.toHaveText('—');
  });

  test('shows the account and its current balance', async ({ page, request }) => {
    const { accessToken } = await loginTestUser(request);

    await expect(page.getByTestId('funds-account')).toHaveText(env.accountId);
    expect(parseMoney(await page.getByTestId('funds-balance').textContent())).toBeCloseTo(
      await getBalance(request, accessToken),
      2
    );
  });

  // One client-side rejection proves the form stops a bad amount before it
  // reaches the API; the individual amount rules belong in the unit tests.
  test('an invalid amount is rejected before anything is sent', async ({ page }) => {
    const patches = recordRequests(page, isBalancePatch);
    await page.getByTestId('funds-amount').fill('0');
    await page.getByTestId('funds-deposit').click();

    await expect(page.getByTestId('amount-error')).toHaveText('Amount must be greater than 0.');
    expect(patches).toEqual([]);
  });

  // Known bug (found by this test): previewBalance is a computed() that reads
  // form.controls.amount.value, which is not a signal, so it never re-runs
  // when an amount is typed and the preview never appears.
  test.fixme('previews the balance after a deposit', async ({ page }) => {
    const before = parseMoney(await page.getByTestId('funds-balance').textContent());
    await page.getByTestId('funds-amount').fill('25.50');

    expect(parseMoney(await page.getByTestId('funds-preview').textContent())).toBeCloseTo(before + 25.5, 2);
  });

  test('a deposit and a matching withdrawal leave the balance where it was', async ({ page, request }) => {
    const before = parseMoney(await page.getByTestId('funds-balance').textContent());

    await page.getByTestId('funds-amount').fill('10.00');
    await page.getByTestId('funds-deposit').click();
    await expect(page.getByTestId('funds-success')).toHaveText('Funds deposited successfully.');
    expect(parseMoney(await page.getByTestId('funds-balance').textContent())).toBeCloseTo(before + 10, 2);
    await expect(page.getByTestId('funds-amount')).toHaveValue('');

    await page.getByTestId('funds-amount').fill('10.00');
    await page.getByTestId('funds-withdraw').click();
    await expect(page.getByTestId('funds-success')).toHaveText('Funds withdrawn successfully.');
    expect(parseMoney(await page.getByTestId('funds-balance').textContent())).toBeCloseTo(before, 2);

    const { accessToken } = await loginTestUser(request);
    expect(await getBalance(request, accessToken)).toBeCloseTo(before, 2);
  });

  test.fixme('a deposit is applied by the server, not computed in the browser', async () => {
    // Known bug (scan): the page sends an absolute balance it computed from
    // the value it loaded, so a fill settling between page load and the
    // deposit is overwritten. Needs a deposit endpoint that takes an amount.
  });
});
