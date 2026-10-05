import { test, expect } from '@playwright/test';
import { TRADING_ROUTES } from './env';
import { signIn } from './helpers';
import { createUser, rejectIfPending, reviewKyc, submitKyc, TestUser } from './api';

// KYC journey for a brand-new customer. Every test registers its own user
// through the real auth service, and any submission left pending is
// rejected afterwards so the admin queue does not fill up with test users.
test.describe('KYC journey', () => {
  let user: TestUser & { tokens: { accessToken: string } };

  test.beforeEach(async ({ request }) => {
    user = await createUser(request);
  });

  test.afterEach(async ({ request }) => {
    await rejectIfPending(request, user.userId);
  });

  const signInAsNewUser = (page: Parameters<typeof signIn>[0]) =>
    signIn(page, '/login', { username: user.username, password: user.password });

  test('a new customer is asked to verify, and submitting puts the application into review', async ({ page }) => {
    await signInAsNewUser(page);
    await expect(page).toHaveURL(/\/kyc-submission/);

    await page.getByTestId('kyc-dob').fill('1990-01-15');
    await page.getByTestId('kyc-doc-type').selectOption('PASSPORT');
    await page.getByTestId('kyc-doc-number').fill('P1234567');
    await page.getByTestId('kyc-submit').click();

    await expect(page.getByTestId('kyc-status')).toHaveText('Pending');
  });

  test('every trading screen sends an unverified customer to verification', async ({ page }) => {
    await signInAsNewUser(page);
    for (const route of TRADING_ROUTES) {
      await page.goto(route);
      await expect(page, route).toHaveURL(new RegExp(`/kyc-submission\\?returnUrl=${encodeURIComponent(route)}$`));
    }
  });

  test('a rejected applicant sees the reason and can resubmit', async ({ page, request }) => {
    await submitKyc(request, user.tokens.accessToken);
    await reviewKyc(request, user.userId, false, 'Document number is unreadable');
    await signInAsNewUser(page);

    await expect(page.getByTestId('kyc-status')).toHaveText('Rejected');
    await expect(page.getByTestId('kyc-rejected')).toContainText('Document number is unreadable');

    await page.getByTestId('kyc-doc-number').fill('P7654321');
    await page.getByTestId('kyc-submit').click();
    await expect(page.getByTestId('kyc-status')).toHaveText('Pending');
    await expect(page.getByTestId('kyc-rejected')).toHaveCount(0);
  });

  test('once approved, the customer reaches the dashboard on the next sign-in', async ({ page, request }) => {
    await submitKyc(request, user.tokens.accessToken);
    await reviewKyc(request, user.userId, true);
    await signInAsNewUser(page);

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId('dashboard-kyc-status')).toHaveText('Approved');
  });
});
