import { test, expect, Page } from '@playwright/test';
import { env, MESSAGES } from './env';
import { registrationFor } from './api';

// Registration journey against the real auth service. Successful tests
// create a brand-new user with an @example.com address (never delivered).

async function fillRegistration(page: Page, overrides: Partial<ReturnType<typeof registrationFor>> = {}) {
  const data = { ...registrationFor(), ...overrides };
  await page.getByTestId('register-username').fill(data.username);
  await page.getByTestId('register-email').fill(data.email);
  await page.getByTestId('register-first-name').fill(data.firstName);
  await page.getByTestId('register-last-name').fill(data.lastName);
  await page.getByTestId('register-phone').fill(data.phone);
  await page.getByTestId('register-password').fill(data.password);
  await page.getByTestId('register-confirm-password').fill(data.password);
  return data;
}

test.describe('Registration journey', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register');
  });

  test('a new user is created and sent on to sign in', async ({ page }) => {
    const data = await fillRegistration(page);
    await page.getByTestId('register-submit').click();

    await expect(page.getByRole('heading', { name: 'Account created' })).toBeVisible();
    await expect(page.getByTestId('register-success')).toContainText(data.username);
    await page.getByTestId('register-continue').click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('a taken username is reported on the field', async ({ page }) => {
    await fillRegistration(page, { username: env.username });
    await page.getByTestId('register-submit').click();

    await expect(page.getByTestId('register-username-error')).toHaveText(MESSAGES['AUTH-409']);
  });
});
