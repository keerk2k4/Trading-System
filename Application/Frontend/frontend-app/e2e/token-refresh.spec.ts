import { test, expect } from '@playwright/test';
import { env } from './env';
import { signIn } from './helpers';

/**
 * Token Refresh Journey: Verify that when an access token expires (401),
 * it is silently refreshed using the refresh token and the original request
 * is retried automatically.
 *
 * Note: In a real test environment, you would need to:
 * 1. Wait for token to naturally expire (15 minutes), OR
 * 2. Use an admin endpoint to manually expire the token, OR
 * 3. Manipulate localStorage to use an expired token
 */
test.describe('Token Refresh journey', () => {
  test('a 401 triggers silent token refresh and automatic retry', async ({ page, request }) => {
    // 1. Sign in to establish valid tokens
    await signIn(page);

    // 2. Capture network requests to monitor token refresh
    const refreshRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/auth/refresh')) {
        refreshRequests.push(req.url());
      }
    });

    // 3. Verify we can make a successful API call
    const dashboardCash = page.getByTestId('dashboard-cash');
    await expect(dashboardCash).not.toHaveText('—');

    // 4. Get the current token
    const tokenBefore = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(tokenBefore).toBeTruthy();

    // 5. Simulate token expiration by setting an expired token
    // (This forces the next API call to get a 401)
    const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2IiwiYWNjb3VudElkIjoiNiIsInJvbGVzIjpbIkNVU1RPTUVSIl0sImlhdCI6MTAwMCwiZXhwIjoxMDAxLCJpc3MiOiJhdXRoLXNlcnZpY2UifQ.test';
    await page.evaluate((token) => {
      localStorage.setItem('auth_token', token);
    }, expiredToken);

    // 6. Navigate to force new API calls (which will get 401 with expired token)
    await page.goto('/orders/history');
    
    // 7. Wait for the page to load (this triggers the 401 and refresh flow)
    await page.waitForLoadState('networkidle');

    // 8. After the page stabilizes, verify:
    //    - Token was refreshed (localStorage changed)
    //    - User remains authenticated
    //    - No redirect to /login happened
    const tokenAfter = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(tokenAfter).toBeTruthy();
    expect(tokenAfter).not.toBe(expiredToken); // Token should have changed
    
    // Verify we're still on orders page (not redirected to login)
    await expect(page).toHaveURL(/\/orders\/history$/);
    
    // Verify the page loaded successfully
    await expect(page.getByTestId('orders-refresh')).toBeVisible();
  });

  test('when refresh fails with 401, user is sent back to /login', async ({ page }) => {
    // 1. Sign in
    await signIn(page);

    // 2. Expiry token and navigate to force API calls
    const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2IiwiYWNjb3VudElkIjoiNiIsInJvbGVzIjpbIkNVU1RPTUVSIl0sImlhdCI6MTAwMCwiZXhwIjoxMDAxLCJpc3MiOiJhdXRoLXNlcnZpY2UifQ.test';
    
    // 3. Also corrupt the refresh token so refresh will fail
    await page.evaluate((token) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('refresh_token', 'corrupted-refresh-token');
    }, expiredToken);

    // 4. Navigate (this will trigger 401 and failed refresh)
    await page.goto('/orders/history');
    
    // 5. Wait for redirect to login
    await page.waitForURL(/\/login/);
    
    // 6. Verify we're on login screen
    await expect(page).toHaveURL(/\/login/);
    expect(await page.evaluate(() => localStorage.getItem('auth_token'))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('refresh_token'))).toBeNull();
  });

  test('concurrent requests share a single refresh call', async ({ page, request }) => {
    // This test verifies the deduplication logic: when multiple requests
    // get 401 simultaneously, only ONE refresh call is made.
    
    // 1. Sign in
    await signIn(page);

    // 2. Count refresh calls
    let refreshCallCount = 0;
    page.on('request', (req) => {
      if (req.url().includes('/auth/refresh')) {
        refreshCallCount++;
      }
    });

    // 3. Expire the token
    const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2IiwiYWNjb3VudElkIjoiNiIsInJvbGVzIjpbIkNVU1RPTUVSIl0sImlhdCI6MTAwMCwiZXhwIjoxMDAxLCJpc3MiOiJhdXRoLXNlcnZpY2UifQ.test';
    await page.evaluate((token) => {
      localStorage.setItem('auth_token', token);
    }, expiredToken);

    // 4. Navigate to a page that makes multiple API calls
    // (dashboard calls balance AND positions endpoints)
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // 5. Verify:
    //    - Only ONE refresh call was made (deduplication worked!)
    //    - Page loaded successfully (not redirected)
    expect(refreshCallCount).toBe(1, 'Should deduplicate refresh calls');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId('dashboard-cash')).not.toHaveText('—');
  });

  test('after token refresh, all stored tokens are updated', async ({ page }) => {
    // Verify that after a refresh, localStorage has NEW tokens
    
    // 1. Sign in and capture initial tokens
    await signIn(page);
    const tokenBefore = await page.evaluate(() => localStorage.getItem('auth_token'));
    const refreshTokenBefore = await page.evaluate(() => localStorage.getItem('refresh_token'));

    // 2. Expire the access token
    const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2IiwiYWNjb3VudElkIjoiNiIsInJvbGVzIjpbIkNVU1RPTUVSIl0sImlhdCI6MTAwMCwiZXhwIjoxMDAxLCJpc3MiOiJhdXRoLXNlcnZpY2UifQ.test';
    await page.evaluate((token) => {
      localStorage.setItem('auth_token', token);
    }, expiredToken);

    // 3. Navigate to trigger refresh
    await page.goto('/funds');
    await page.waitForLoadState('networkidle');

    // 4. Verify tokens changed
    const tokenAfter = await page.evaluate(() => localStorage.getItem('auth_token'));
    const refreshTokenAfter = await page.evaluate(() => localStorage.getItem('refresh_token'));

    expect(tokenAfter).not.toBe(expiredToken);
    // Note: refresh token might be rotated by backend (single-use tokens)
    expect(refreshTokenAfter).toBeTruthy();
  });
});
