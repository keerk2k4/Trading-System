import { test, expect, Page } from '@playwright/test';
import { signIn } from './helpers';

// Funds journey against the real Trade REST API. The deposit is a small
// amount so the shared test account keeps enough cash for other journeys.
const balance = async (page: Page) => Number((await page.getByTestId('funds-balance').textContent())!.replace(/[^0-9.]/g, ''));

test.describe('Funds journey', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, '/login?returnUrl=%2Ffunds');
    await expect(page).toHaveURL(/\/funds$/);
    await expect(page.getByTestId('funds-balance')).not.toHaveText('—');
  });

  test('a deposit increases the balance shown', async ({ page }) => {
    const before = await balance(page);

    await page.getByTestId('funds-amount').fill('1.00');
    await page.getByTestId('funds-deposit').click();

    await expect(page.getByTestId('funds-success')).toBeVisible();
    await expect.poll(() => balance(page)).toBeCloseTo(before + 1, 2);
    // Stored on the server, so it survives a reload.
    await page.reload();
    await expect.poll(() => balance(page)).toBeCloseTo(before + 1, 2);
  });

  test('a withdrawal larger than the balance is blocked', async ({ page }) => {
    const before = await balance(page);

    await page.getByTestId('funds-amount').fill(String(Math.ceil(before) + 1000));
    await page.getByTestId('funds-withdraw').click();

    await expect(page.getByTestId('funds-error')).toHaveText('Withdrawal amount exceeds your available cash balance.');
    expect(await balance(page)).toBe(before);
  });
});
