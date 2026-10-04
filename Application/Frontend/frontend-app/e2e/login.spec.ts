import { test, expect } from '@playwright/test';
import { env, MESSAGES } from './env';
import { recordRequests, signIn } from './helpers';
import { createUser } from './api';

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
    expect(await page.evaluate(() => localStorage.getItem('auth_token'))).toBeNull();
  });

  test('an unknown username gets exactly the same answer as a wrong password', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-username').fill(`nobody_${Date.now()}`);
    await page.getByTestId('login-password').fill('Whatever-123456');

    const responsePromise = page.waitForResponse(`${env.authApi}/auth/login`);
    await page.getByTestId('login-submit').click();
    const response = await responsePromise;

    expect(response.status()).toBe(401);
    expect((await response.json()).errorCode).toBe('AUTH-401');
    await expect(page.getByTestId('login-error')).toHaveText(MESSAGES.badLogin);
  });

  test('an empty form is rejected before anything is sent', async ({ page }) => {
    const loginPosts = recordRequests(page, (url, method) => method === 'POST' && url.endsWith('/auth/login'));
    await page.goto('/login');
    await page.getByTestId('login-submit').click();

    await expect(page.getByTestId('login-username-error')).toHaveText('Enter your username.');
    await expect(page.getByTestId('login-password-error')).toHaveText('Enter your password.');
    await expect(page.getByTestId('login-username')).toBeFocused();
    expect(loginPosts).toEqual([]);
  });

  test('the password can be shown and hidden', async ({ page }) => {
    await page.goto('/login');
    const password = page.getByTestId('login-password');
    await expect(password).toHaveAttribute('type', 'password');

    await page.getByTestId('login-toggle-password').click();
    await expect(password).toHaveAttribute('type', 'text');
    await page.getByTestId('login-toggle-password').click();
    await expect(password).toHaveAttribute('type', 'password');
  });

  test('a successful sign-in establishes a session and opens the dashboard', async ({ page }) => {
    await signIn(page);

    await expect(page).toHaveURL(/\/dashboard$/);
    // The session is the in-memory access token plus the HttpOnly refresh
    // cookie; nothing token-shaped is written to web storage.
    expect(await page.evaluate(() => localStorage.getItem('auth_token'))).toBeNull();
    const cookies = await page.context().cookies(`${env.authApi}/auth/refresh`);
    expect(cookies.find((c) => c.name === 'refresh_token')?.httpOnly).toBe(true);
    await expect(page.getByTestId('nav-sign-out')).toBeVisible();
    await expect(page.getByTestId('shell-username')).toHaveText(env.username);
    await expect(page.getByTestId('shell-role')).toHaveText(`Account ${env.accountId}`);
  });

  test('after signing in, the user arrives where they were going', async ({ page }) => {
    await page.goto('/orders/new');
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Forders%2Fnew$/);

    await signIn(page, '');

    await expect(page).toHaveURL(/\/orders\/new$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Place order' })).toBeVisible();
  });

  test('a return address keeps its query string', async ({ page }) => {
    await page.goto('/orders/new?symbol=AAPL');
    await signIn(page, '');

    await expect(page).toHaveURL(/\/orders\/new\?symbol=AAPL$/);
    await expect(page.getByTestId('order-symbol')).toHaveValue('AAPL');
  });

  for (const hostile of ['https://evil.example/phish', '//evil.example', '/\\evil.example']) {
    test(`an off-site return address (${hostile}) is ignored`, async ({ page }) => {
      await signIn(page, `/login?returnUrl=${encodeURIComponent(hostile)}`);

      // Lands on the in-app fallback, never on the other site.
      await expect(page).toHaveURL(/\/dashboard$/);
      expect(new URL(page.url()).hostname).not.toContain('evil');
    });
  }

  test('links lead to registration and the admin sign-in', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-register-link').click();
    await expect(page).toHaveURL(/\/register$/);

    await page.goto('/login');
    await page.getByTestId('login-admin-link').click();
    await expect(page).toHaveURL(/\/admin-login$/);
    await expect(page.getByRole('heading', { name: 'Admin sign in' })).toBeVisible();
  });

  test('a customer cannot sign in through the admin screen', async ({ page }) => {
    await page.goto('/admin-login');
    await page.getByTestId('login-username').fill(env.username);
    await page.getByTestId('login-password').fill(env.password);

    const responsePromise = page.waitForResponse(`${env.authApi}/auth/admin/login`);
    await page.getByTestId('login-submit').click();
    expect((await responsePromise).status()).toBe(401);

    await expect(page.getByTestId('login-error')).toHaveText(MESSAGES.badLogin);
    await expect(page).toHaveURL(/\/admin-login$/);
  });

  test('five failed attempts lock the username, even against the right password', async ({ page, request }) => {
    // A throw-away user, so the shared test user is never locked out.
    const user = await createUser(request);
    await page.goto('/login');
    await page.getByTestId('login-username').fill(user.username);
    for (let attempt = 0; attempt < 5; attempt++) {
      await page.getByTestId('login-password').fill(`wrong-password-${attempt}`);
      const refused = page.waitForResponse(`${env.authApi}/auth/login`);
      await page.getByTestId('login-submit').click();
      expect((await refused).status()).toBe(401);
    }

    await page.getByTestId('login-password').fill(user.password);
    const locked = page.waitForResponse(`${env.authApi}/auth/login`);
    await page.getByTestId('login-submit').click();

    expect((await locked).status()).toBe(401);
    await expect(page.getByTestId('login-error')).toHaveText(MESSAGES.badLogin);
    await expect(page).toHaveURL(/\/login$/);
  });
});
