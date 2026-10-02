import { test, expect } from '@playwright/test';
import { env } from './env';
import { signIn } from './helpers';

// Sign-in journey against the real auth service. Each test gets a fresh
// browser context from Playwright, so every one starts signed out.
test.describe('Sign-in journey', () => {
  test('guard redirects a signed-out visitor to sign-in, carrying where they were going', async ({ page }) => {
    await page.goto('/orders/new');

    await expect(page).toHaveURL(/\/login\?returnUrl=%2Forders%2Fnew$/);
    await expect(page.getByTestId('login-username')).toBeVisible();
  });

  test('a refused sign-in shows an error and stays on sign-in', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-username').fill(env.username);
    await page.getByTestId('login-password').fill(`${env.password}-wrong`);

    const responsePromise = page.waitForResponse(`${env.authApi}/auth/login`);
    await page.getByTestId('login-submit').click();
    const response = await responsePromise;

    expect(response.status()).toBe(401);
    expect((await response.json()).errorCode).toBe('AUTH-401');
    await expect(page.getByTestId('login-error')).toContainText('Incorrect username or password');
    await expect(page).toHaveURL(/\/login$/);
    expect(await page.evaluate(() => localStorage.getItem('auth_token'))).toBeNull();
  });

  test('a successful sign-in establishes a session and opens the dashboard', async ({ page }) => {
    await signIn(page);

    await expect(page).toHaveURL(/\/dashboard$/);
    expect(await page.evaluate(() => localStorage.getItem('auth_token'))).toBeTruthy();
    await expect(page.getByTestId('nav-sign-out')).toBeVisible();
  });

  test('after signing in, the user arrives where they were going', async ({ page }) => {
    await page.goto('/orders/new');
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Forders%2Fnew$/);

    // Already on the redirected sign-in page, so sign in without navigating.
    await signIn(page, '');

    await expect(page).toHaveURL(/\/orders\/new$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Place order' })).toBeVisible();
  });
});
