import { test, expect } from '@playwright/test';
import { env, TRADING_ROUTES } from './env';
import { signIn } from './helpers';

// Session journey against the real auth service: what signing out really
// ends, and where a signed-in page sends the bearer token.
test.describe('Session journey', () => {
  test('signed out, every protected screen redirects to sign-in carrying its address', async ({ page }) => {
    for (const route of [...TRADING_ROUTES, '/kyc-submission']) {
      await page.goto(route);
      await page.waitForURL(/\/login/);
      const url = new URL(page.url());
      expect(url.pathname, route).toBe('/login');
      expect(url.searchParams.get('returnUrl'), route).toBe(route);
    }
  });

  test('after signing out, the dashboard reroutes to sign-in', async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByTestId('nav-sign-out').click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fdashboard$/);
    await expect(page.getByTestId('login-username')).toBeVisible();
  });

  test('the bearer token goes to every platform API call and nowhere else', async ({ page, baseURL }) => {
    const requests: { url: string; method: string; auth?: string }[] = [];
    page.on('request', (req) => {
      requests.push({ url: req.url(), method: req.method(), auth: req.headers()['authorization'] });
    });

    // Sign in, then visit the screens that call the Trade REST API and the
    // protected auth-service endpoints.
    await signIn(page);
    await expect(page.getByTestId('dashboard-cash')).not.toHaveText('—');
    for (const route of ['/orders/history', '/funds', '/watchlist']) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
    }
    const api = requests.filter((r) => r.method !== 'OPTIONS');

    const tradeCalls = api.filter((r) => r.url.startsWith(`${env.tradeApi}/`));
    expect(tradeCalls.length).toBeGreaterThan(0);
    for (const call of tradeCalls) {
      expect(call.auth, `${call.method} ${call.url}`).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    }

    // The public sign-in call never carries a token.
    const login = api.find((r) => r.url === `${env.authApi}/auth/login`);
    expect(login?.auth).toBeUndefined();

    // Nothing leaves the platform: no third-party or market-data host is called.
    const platform = [new URL(baseURL!).origin, new URL(env.authApi).origin, new URL(env.tradeApi).origin];
    const elsewhere = api.filter((r) => !r.url.startsWith('data:') && !platform.includes(new URL(r.url).origin));
    expect(elsewhere.map((r) => r.url)).toEqual([]);
  });
});
