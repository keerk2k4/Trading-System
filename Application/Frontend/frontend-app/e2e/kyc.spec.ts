import { test, expect } from '@playwright/test';
import { TRADING_ROUTES } from './env';
import { signIn } from './helpers';
import { createUser, rejectIfPending, reviewKyc, submitKyc, TestUser, uniqueDocumentNumber } from './api';

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
    await page.getByTestId('kyc-doc-number').fill(uniqueDocumentNumber());
    await page.getByTestId('kyc-submit').click();

    await expect(page.getByTestId('kyc-status')).toHaveText('Pending');
  });

  test("a document already used by another customer is refused with a clear message", async ({ page, request }) => {
    const documentNumber = uniqueDocumentNumber();
    const other = await createUser(request);
    await submitKyc(request, other.tokens.accessToken, documentNumber);

    await signInAsNewUser(page);
    await page.getByTestId('kyc-dob').fill('1990-01-15');
    await page.getByTestId('kyc-doc-type').selectOption('PASSPORT');
    // Different case and spacing: still the same document.
    await page.getByTestId('kyc-doc-number').fill(` ${documentNumber.toLowerCase()} `);
    await page.getByTestId('kyc-submit').click();

    await expect(page.getByTestId('kyc-error')).toHaveText(
      'This document is already registered to another account. Check the document type and number.'
    );
    await expect(page.getByTestId('kyc-status')).toHaveCount(0);
    await rejectIfPending(request, other.userId);
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

    await page.getByTestId('kyc-doc-number').fill(uniqueDocumentNumber());
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
