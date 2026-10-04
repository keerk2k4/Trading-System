import { test, expect } from '@playwright/test';
import { env, TRADING_ROUTES } from './env';
import { signIn } from './helpers';

// Session handling: route guards and keeping a session across a reload, all
// against the real auth service.
test.describe('Session journey', () => {
  for (const route of [...TRADING_ROUTES, '/kyc-submission']) {
    test(`signed out, ${route} redirects to sign-in with a return address`, async ({ page }) => {
      await page.goto(route);
      await page.waitForURL(/\/login/);
      const url = new URL(page.url());
      expect(url.pathname).toBe('/login');
      expect(url.searchParams.get('returnUrl')).toBe(route);
    });
  }

  test('an unknown address falls back to sign-in', async ({ page }) => {
    await page.goto('/no-such-page');
    await expect(page).toHaveURL(/\/login$/);
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

    // The access token lives in memory only, so read it off the wire. Each
    // page.goto reloads and silently refreshes it, so check the shape.
    const tradeCalls = api.filter((r) => r.url.startsWith(`${env.tradeApi}/`));
    expect(tradeCalls.length).toBeGreaterThan(0);
    for (const call of tradeCalls) {
      expect(call.auth, `${call.method} ${call.url}`).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    }

    const protectedAuthCalls = api.filter((r) => /\/(auth\/me|kyc)(\?|$)/.test(r.url) && r.url.startsWith(env.authApi));
    expect(protectedAuthCalls.length).toBeGreaterThan(0);
    for (const call of protectedAuthCalls) {
      expect(call.auth, `${call.method} ${call.url}`).toMatch(/^Bearer /);
    }

    // The public sign-in call never carries a token.
    const login = api.find((r) => r.url === `${env.authApi}/auth/login`);
    expect(login?.auth).toBeUndefined();

    // Nothing leaves the platform: no third-party or market-data host is called.
    const platform = [new URL(baseURL!).origin, new URL(env.authApi).origin, new URL(env.tradeApi).origin];
    const elsewhere = api.filter((r) => !r.url.startsWith('data:') && !platform.includes(new URL(r.url).origin));
    expect(elsewhere.map((r) => r.url)).toEqual([]);
  });

  test('the session survives a page reload', async ({ page }) => {
    await signIn(page);
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId('dashboard-welcome')).toHaveText(`Welcome back, ${env.username}`);
  });
});
