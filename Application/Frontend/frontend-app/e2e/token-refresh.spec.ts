import { test, expect, Page } from '@playwright/test';
import { env } from './env';
import { signIn } from './helpers';

/**
 * Token journeys for the in-memory access token + HttpOnly refresh cookie.
 *
 * Tokens are no longer in localStorage, so an expired access token cannot be
 * planted from the test. Instead the next Trade API calls are answered with
 * the 401 an expired token gets, and the real refresh path does the rest.
 * Every page load runs one bootstrap refresh (restoreSession) before the
 * routes load, which the refresh counts below include.
 */

const REFRESH_URL = `${env.authApi}/auth/refresh`;

function countRefreshes(page: Page): { count: number } {
  const counter = { count: 0 };
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url() === REFRESH_URL) {
      counter.count++;
    }
  });
  return counter;
}

// Answers the next `times` Trade API calls with 401, exactly what an expired
// access token receives. CORS headers are needed or the browser hides the 401.
async function expireNextTradeCalls(page: Page, times: number): Promise<void> {
  let remaining = times;
  const uiOrigin = new URL(page.url()).origin;
  await page.route(`${env.tradeApi}/api/v1/**`, (route) => {
    if (route.request().method() !== 'OPTIONS' && remaining > 0) {
      remaining--;
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': uiOrigin },
        body: JSON.stringify({ errorCode: 'AUTH-401', message: 'Unauthorised' })
      });
    }
    return route.continue();
  });
}

async function refreshCookie(page: Page) {
  const cookies = await page.context().cookies(`${env.authApi}/auth/refresh`);
  return cookies.find((c) => c.name === 'refresh_token');
}

test.describe('Token journeys (in-memory access token, HttpOnly refresh cookie)', () => {
  test('a reload keeps the user signed in through one silent refresh', async ({ page }) => {
    await signIn(page);
    await expect(page.getByTestId('dashboard-cash')).not.toHaveText('—');
    const refreshes = countRefreshes(page);

    await page.reload();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId('dashboard-cash')).not.toHaveText('—');
    expect(refreshes.count).toBe(1);
  });

  test('a 401 triggers a silent refresh and the request is retried', async ({ page }) => {
    await signIn(page);
    await expect(page.getByTestId('dashboard-cash')).not.toHaveText('—');
    const refreshes = countRefreshes(page);
    await expireNextTradeCalls(page, 1);

    await page.goto('/orders/history');
    await page.waitForLoadState('networkidle');

    // One bootstrap refresh plus one for the expired call.
    expect(refreshes.count).toBe(2);
    await expect(page).toHaveURL(/\/orders\/history$/);
    await expect(page.getByTestId('orders-refresh')).toBeVisible();
  });

  test('concurrent 401s share a single refresh call', async ({ page }) => {
    await signIn(page);
    await expect(page.getByTestId('dashboard-cash')).not.toHaveText('—');
    const refreshes = countRefreshes(page);
    // The dashboard loads its data in parallel, so its first calls fail together.
    await expireNextTradeCalls(page, 2);

    await page.reload();
    await page.waitForLoadState('networkidle');

    expect(refreshes.count, 'bootstrap refresh + one shared refresh').toBe(2);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId('dashboard-cash')).not.toHaveText('—');
  });

  test('without a valid refresh cookie a reload ends at /login', async ({ page }) => {
    await signIn(page);
    await expect(page.getByTestId('dashboard-cash')).not.toHaveText('—');

    await page.context().clearCookies();
    await page.goto('/orders/history');

    await page.waitForURL(/\/login/);
    expect(await page.evaluate(() => localStorage.getItem('current_user'))).toBeNull();
  });

  test('signing out revokes and removes the refresh cookie', async ({ page }) => {
    await signIn(page);
    await expect(page.getByTestId('dashboard-cash')).not.toHaveText('—');
    expect(await refreshCookie(page)).toBeDefined();

    const logout = page.waitForResponse((r) => r.url() === `${env.authApi}/auth/logout`);
    await page.getByTestId('nav-sign-out').click();
    expect((await logout).status()).toBe(204);

    expect(await refreshCookie(page)).toBeUndefined();
  });
});
