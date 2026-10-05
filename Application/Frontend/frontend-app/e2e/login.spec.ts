import { test, expect } from '@playwright/test';
import { env, MESSAGES } from './env';
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
    await expect(page.getByTestId('login-error')).toHaveText(MESSAGES.badLogin);
    await expect(page).toHaveURL(/\/login$/);
  });

  test('an unknown username gets exactly the same answer as a wrong password', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-username').fill(`nobody_${Date.now()}`);
    await page.getByTestId('login-password').fill('Whatever-123456');

    const responsePromise = page.waitForResponse(`${env.authApi}/auth/login`);
    await page.getByTestId('login-submit').click();
    const response = await responsePromise;

    // Same status, code and on-screen message, so the form cannot be used to
    // find out which usernames exist.
    expect(response.status()).toBe(401);
    expect((await response.json()).errorCode).toBe('AUTH-401');
    await expect(page.getByTestId('login-error')).toHaveText(MESSAGES.badLogin);
  });

  test('customer and admin credentials only work on their own sign-in screen', async ({ page }) => {
    // Admin credentials on the customer sign-in.
    await page.goto('/login');
    await page.getByTestId('login-username').fill(env.adminUsername);
    await page.getByTestId('login-password').fill(env.adminPassword);
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-error')).toHaveText(MESSAGES.badLogin);
    await expect(page).toHaveURL(/\/login$/);

    // Customer credentials on the admin sign-in.
    await page.goto('/admin-login');
    await page.getByTestId('login-username').fill(env.username);
    await page.getByTestId('login-password').fill(env.password);
    const responsePromise = page.waitForResponse(`${env.authApi}/auth/admin/login`);
    await page.getByTestId('login-submit').click();
    expect((await responsePromise).status()).toBe(401);
    await expect(page.getByTestId('login-error')).toHaveText(MESSAGES.badLogin);
    await expect(page).toHaveURL(/\/admin-login$/);
  });

  test('a successful sign-in establishes a session and opens the dashboard', async ({ page }) => {
    await signIn(page);

    await expect(page).toHaveURL(/\/dashboard$/);
    // The access token lives in memory only; nothing token-shaped is written
    // to web storage.
    expect(await page.evaluate(() => localStorage.getItem('auth_token'))).toBeNull();
    await expect(page.getByTestId('nav-sign-out')).toBeVisible();
  });

  test('after signing in, the user arrives where they were going', async ({ page }) => {
    await page.goto('/orders/new');
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Forders%2Fnew$/);

    await signIn(page, '');

    await expect(page).toHaveURL(/\/orders\/new$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Place order' })).toBeVisible();
  });

  test('an off-site return address is ignored', async ({ page }) => {
    await signIn(page, `/login?returnUrl=${encodeURIComponent('https://evil.example/phish')}`);

    // Lands on the in-app fallback, never on the other site.
    await expect(page).toHaveURL(/\/dashboard$/);
    expect(new URL(page.url()).hostname).not.toContain('evil');
  });
});
