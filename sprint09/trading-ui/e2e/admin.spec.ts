import { test, expect } from '@playwright/test';
import { env, MESSAGES } from './env';
import { signIn, signInAsAdmin } from './helpers';
import { createUser, rejectIfPending, submitKyc } from './api';

// Admin KYC review against the real auth service. Each review test creates
// its own applicant, so the queue never depends on someone else's data.
test.describe('Admin journey', () => {
  test('an admin signs in to the admin overview', async ({ page }) => {
    await signInAsAdmin(page);

    await expect(page).toHaveURL(/\/admin\/dashboard$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Admin overview' })).toBeVisible();
    await expect(page.getByTestId('shell-role')).toHaveText('Administrator');
    await expect(page.getByTestId('nav-admin-kyc-review')).toBeVisible();
    await expect(page.getByTestId('nav-orders-new')).toHaveCount(0);
  });

  test('admin credentials are refused on the customer sign-in', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-username').fill(env.adminUsername);
    await page.getByTestId('login-password').fill(env.adminPassword);
    await page.getByTestId('login-submit').click();

    // An admin has no trading account, so the customer login refuses it.
    await expect(page.getByTestId('login-error')).toHaveText(MESSAGES.badLogin);
    await expect(page).toHaveURL(/\/login$/);
  });

  test('a signed-out visitor to an admin page is sent to the admin sign-in', async ({ page }) => {
    await page.goto('/admin/kyc-review');
    await expect(page).toHaveURL(/\/admin-login\?returnUrl=%2Fadmin%2Fkyc-review$/);
  });

  test('a customer cannot open admin pages', async ({ page }) => {
    await signIn(page);
    for (const route of ['/admin/dashboard', '/admin/kyc-review']) {
      await page.goto(route);
      await expect(page, route).toHaveURL(/\/dashboard$/);
    }
  });

  test.describe('reviewing an application', () => {
    let applicant: Awaited<ReturnType<typeof createUser>>;

    test.beforeEach(async ({ request }) => {
      applicant = await createUser(request);
      await submitKyc(request, applicant.tokens.accessToken);
    });

    test.afterEach(async ({ request }) => {
      await rejectIfPending(request, applicant.userId);
    });

    test('a new application shows in the queue and the overview count', async ({ page }) => {
      await signInAsAdmin(page);
      await expect(page.getByTestId('admin-pending-count')).not.toHaveText('—');
      expect(Number(await page.getByTestId('admin-pending-count').textContent())).toBeGreaterThanOrEqual(1);

      await page.getByTestId('admin-open-review').click();
      const submission = page.locator(`[data-testid="kyc-submission"][data-user-id="${applicant.userId}"]`);
      await expect(submission).toBeVisible();
      await expect(submission).toContainText('PASSPORT');
      await expect(submission).toContainText('Pending');
    });

    test('approving lets the customer trade', async ({ page, browser }) => {
      await signInAsAdmin(page);
      await page.goto('/admin/kyc-review');
      const submission = page.locator(`[data-testid="kyc-submission"][data-user-id="${applicant.userId}"]`);
      await submission.getByTestId('kyc-approve').click();

      await expect(page.getByTestId('kyc-review-status')).toContainText('approved');
      await expect(submission).toHaveCount(0);

      // The customer, in their own browser, can now reach the order ticket.
      const customer = await browser.newPage();
      await signIn(customer, '/login?returnUrl=%2Forders%2Fnew', { username: applicant.username, password: applicant.password });
      await expect(customer).toHaveURL(/\/orders\/new$/);
      await customer.close();
    });

    test('rejecting with a reason shows that reason to the customer', async ({ page, browser }) => {
      await signInAsAdmin(page);
      await page.goto('/admin/kyc-review');
      const submission = page.locator(`[data-testid="kyc-submission"][data-user-id="${applicant.userId}"]`);
      await submission.getByTestId('kyc-reason').fill('Passport has expired');
      await submission.getByTestId('kyc-reject').click();

      await expect(page.getByTestId('kyc-review-status')).toContainText('rejected');
      await expect(submission).toHaveCount(0);

      const customer = await browser.newPage();
      await signIn(customer, '/login', { username: applicant.username, password: applicant.password });
      await expect(customer).toHaveURL(/\/kyc-submission$/);
      await expect(customer.getByTestId('kyc-rejected')).toContainText('Passport has expired');
      await customer.close();
    });

    test('the queue can be refreshed', async ({ page }) => {
      await signInAsAdmin(page);
      await page.goto('/admin/kyc-review');
      const reload = page.waitForResponse((res) => res.url() === `${env.authApi}/kyc/pending` && res.ok());
      await page.getByTestId('kyc-review-refresh').click();
      await reload;
      await expect(page.locator(`[data-testid="kyc-submission"][data-user-id="${applicant.userId}"]`)).toBeVisible();
    });
  });
});
