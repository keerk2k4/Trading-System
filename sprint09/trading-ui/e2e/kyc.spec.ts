import { test, expect } from '@playwright/test';
import { TRADING_ROUTES } from './env';
import { recordRequests, signIn } from './helpers';
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

  test('a new customer lands on verification after signing in', async ({ page }) => {
    await signInAsNewUser(page);

    await expect(page).toHaveURL(/\/kyc-submission$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Identity verification' })).toBeVisible();
    await expect(page.getByTestId('kyc-status')).toHaveCount(0);
    await expect(page.getByTestId('kyc-submit')).toHaveText('Submit for review');
  });

  test('every trading screen sends an unverified customer to verification', async ({ page }) => {
    await signInAsNewUser(page);
    for (const route of TRADING_ROUTES) {
      await page.goto(route);
      await expect(page, route).toHaveURL(new RegExp(`/kyc-submission\\?returnUrl=${encodeURIComponent(route)}$`));
    }
  });

  test('all three fields are required and nothing is sent while any is empty', async ({ page }) => {
    await signInAsNewUser(page);
    const posts = recordRequests(page, (url, method) => ['POST', 'PUT'].includes(method) && url.endsWith('/kyc'));
    await page.getByTestId('kyc-submit').click();

    await expect(page.getByTestId('dob-error')).toHaveText('Enter your date of birth.');
    await expect(page.getByTestId('docType-error')).toHaveText('Choose a document type.');
    await expect(page.getByTestId('docNum-error')).toHaveText('Enter the document number.');
    expect(posts).toEqual([]);
  });

  test('submitting puts the application into review', async ({ page }) => {
    await signInAsNewUser(page);
    await page.getByTestId('kyc-dob').fill('1990-01-15');
    await page.getByTestId('kyc-doc-type').selectOption('PASSPORT');
    await page.getByTestId('kyc-doc-number').fill('P1234567');
    await page.getByTestId('kyc-submit').click();

    await expect(page.getByTestId('kyc-status')).toHaveText('Pending');
    await expect(page.getByTestId('kyc-info')).toBeVisible();
    await expect(page.getByTestId('kyc-submit')).toHaveText('Update submission');

    // Still not allowed to trade while the review is pending.
    await page.getByTestId('kyc-go-dashboard').click();
    await expect(page).toHaveURL(/\/kyc-submission/);
  });

  test('a pending application can be edited and the change is kept', async ({ page, request }) => {
    await submitKyc(request, user.tokens.accessToken);
    await signInAsNewUser(page);

    await expect(page.getByTestId('kyc-info')).toContainText('You already have a submitted KYC.');
    await page.getByTestId('kyc-doc-type').selectOption('DRIVER_LICENSE');
    await page.getByTestId('kyc-doc-number').fill('DL-998877');
    await page.getByTestId('kyc-submit').click();
    await expect(page.getByTestId('kyc-info')).toContainText('Your KYC details were updated.');

    await page.reload();
    await expect(page.getByTestId('kyc-doc-type')).toHaveValue('DRIVER_LICENSE');
    await expect(page.getByTestId('kyc-doc-number')).toHaveValue('DL-998877');
    await expect(page.getByTestId('kyc-status')).toHaveText('Pending');
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
    await expect(page.getByTestId('dashboard-account-status')).toHaveText('Active');
  });
});
