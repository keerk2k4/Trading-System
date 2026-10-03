import { test, expect, Page } from '@playwright/test';
import { env, MESSAGES } from './env';
import { recordRequests } from './helpers';
import { registrationFor, uniqueUsername } from './api';

// Registration journey against the real auth service. Successful tests
// create a brand-new user with an @example.com address (never delivered).

async function fillRegistration(page: Page, overrides: Partial<ReturnType<typeof registrationFor>> & { confirmPassword?: string } = {}) {
  const data = { ...registrationFor(), ...overrides };
  await page.getByTestId('register-username').fill(data.username);
  await page.getByTestId('register-email').fill(data.email);
  await page.getByTestId('register-first-name').fill(data.firstName);
  await page.getByTestId('register-last-name').fill(data.lastName);
  await page.getByTestId('register-phone').fill(data.phone);
  await page.getByTestId('register-password').fill(data.password);
  await page.getByTestId('register-confirm-password').fill(overrides.confirmPassword ?? data.password);
  return data;
}

const isRegisterPost = (url: string, method: string) => method === 'POST' && url === `${env.authApi}/auth/register`;

test.describe('Registration journey', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register');
  });

  test('an empty form shows every required-field error and sends nothing', async ({ page }) => {
    const posts = recordRequests(page, isRegisterPost);
    await page.getByTestId('register-submit').click();

    await expect(page.getByTestId('register-username-error')).toHaveText('Enter a username.');
    await expect(page.getByTestId('register-email-error')).toHaveText('Enter an email address.');
    await expect(page.getByTestId('register-first-name-error')).toHaveText('Enter your first name.');
    await expect(page.getByTestId('register-last-name-error')).toHaveText('Enter your last name.');
    await expect(page.getByTestId('register-phone-error')).toHaveText('Enter a phone number.');
    await expect(page.getByTestId('register-password-error')).toHaveText('Enter a password.');
    await expect(page.getByTestId('register-confirm-password-error')).toHaveText('Confirm your password.');
    await expect(page.getByTestId('register-username')).toBeFocused();
    expect(posts).toEqual([]);
  });

  test('a taken username is reported on the field (AUTH-409)', async ({ page }) => {
    await fillRegistration(page, { username: env.username });

    const responsePromise = page.waitForResponse((res) => isRegisterPost(res.url(), res.request().method()));
    await page.getByTestId('register-submit').click();
    const response = await responsePromise;

    expect(response.status()).toBe(409);
    expect((await response.json()).errorCode).toBe('AUTH-409');
    await expect(page.getByTestId('register-username-error')).toHaveText(MESSAGES['AUTH-409']);
    await expect(page.getByTestId('register-username')).toBeFocused();

    // Editing the username clears the server's verdict.
    await page.getByTestId('register-username').fill(uniqueUsername());
    await expect(page.getByTestId('register-username-error')).toHaveCount(0);
  });

  test('a new user is created and sent on to sign in', async ({ page }) => {
    const data = await fillRegistration(page);

    const responsePromise = page.waitForResponse((res) => isRegisterPost(res.url(), res.request().method()));
    await page.getByTestId('register-submit').click();
    const response = await responsePromise;

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.username).toBe(data.username);
    expect(body.roles).toEqual(['CUSTOMER']);
    // The response carries no tokens: registering does not sign you in.
    expect(body.accessToken).toBeUndefined();

    await expect(page.getByRole('heading', { name: 'Account created' })).toBeVisible();
    await expect(page.getByTestId('register-success')).toContainText(data.username);
    await page.getByTestId('register-continue').click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('the sign-in link goes back to sign-in', async ({ page }) => {
    await page.getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
