import { test, expect, Page } from '@playwright/test';
import { env, MESSAGES } from './env';
import { registerViaApi, registrationFor } from './api';
import { waitForOtp } from './mail';

// Registration journey against the real auth service. The email must be
// verified with an emailed one-time code first; the code is read from the
// test inbox (mail-sink.ts). Addresses are @example.com and never leave it.

async function fillRegistration(page: Page, overrides: Partial<ReturnType<typeof registrationFor>> = {}) {
  const data = { ...registrationFor(), ...overrides };
  await page.getByTestId('register-username').fill(data.username);
  await page.getByTestId('register-email').fill(data.email);
  await page.getByTestId('register-first-name').fill(data.firstName);
  await page.getByTestId('register-last-name').fill(data.lastName);
  await page.getByTestId('register-phone').fill(data.phone);
  await page.getByTestId('register-password').fill(data.password);
  await page.getByTestId('register-confirm-password').fill(data.password);
  return data;
}

/** Clicks "Send OTP" and returns the code that was emailed. */
async function sendOtp(page: Page, email: string): Promise<string> {
  const since = Date.now();
  await page.getByTestId('register-send-otp').click();
  await expect(page.getByTestId('register-otp')).toBeVisible();
  return waitForOtp(page.request, email, since);
}

async function verifyEmail(page: Page, email: string): Promise<void> {
  const otp = await sendOtp(page, email);
  await page.getByTestId('register-otp').fill(otp);
  await page.getByTestId('register-verify-otp').click();
  await expect(page.getByTestId('register-email-verified')).toHaveText('Email verified.');
}

test.describe('Registration journey', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register');
  });

  test('a new user verifies their email with the OTP and is created', async ({ page }) => {
    const data = await fillRegistration(page);
    await verifyEmail(page, data.email);
    await page.getByTestId('register-submit').click();

    await expect(page.getByRole('heading', { name: 'Account created' })).toBeVisible();
    await expect(page.getByTestId('register-success')).toContainText(data.username);
    await page.getByTestId('register-continue').click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('registration is refused until the email is verified', async ({ page }) => {
    await fillRegistration(page);
    await page.getByTestId('register-submit').click();

    await expect(page.getByTestId('register-error')).toContainText('Verify your email address before creating your account');
    await expect(page.getByRole('heading', { name: 'Account created' })).toHaveCount(0);
  });

  test('a wrong OTP is refused with the attempts left', async ({ page }) => {
    const data = await fillRegistration(page);
    const otp = await sendOtp(page, data.email);
    await page.getByTestId('register-otp').fill(otp === '000000' ? '111111' : '000000');
    await page.getByTestId('register-verify-otp').click();

    await expect(page.getByTestId('register-otp-error')).toHaveText('Incorrect verification code. 4 attempts remaining.');
    await expect(page.getByTestId('register-email-verified')).toHaveCount(0);
  });

  test('changing the email after verifying requires a new verification', async ({ page }) => {
    const data = await fillRegistration(page);
    await verifyEmail(page, data.email);
    await page.getByTestId('register-change-email').click();
    await page.getByTestId('register-email').fill(`other_${data.email}`);

    await expect(page.getByTestId('register-email-verified')).toHaveCount(0);
    await expect(page.getByTestId('register-send-otp')).toBeVisible();
  });

  test('a phone number already used by another account is reported on the field', async ({ page, request }) => {
    const existing = await registerViaApi(request);
    const data = await fillRegistration(page, { phone: existing.phone });
    await verifyEmail(page, data.email);
    await page.getByTestId('register-submit').click();

    await expect(page.getByTestId('register-phone-error')).toHaveText(
      'This phone number is already registered to another account.'
    );
    await expect(page.getByRole('heading', { name: 'Account created' })).toHaveCount(0);
  });

  test('a taken username is reported on the field', async ({ page }) => {
    const data = await fillRegistration(page, { username: env.username });
    await verifyEmail(page, data.email);
    await page.getByTestId('register-submit').click();

    await expect(page.getByTestId('register-username-error')).toHaveText(MESSAGES['AUTH-409']);
  });
});

test.describe('Registration API', () => {
  test('POST /auth/register without a verification token is refused with OTP-403', async ({ request }) => {
    const res = await request.post(`${env.authApi}/auth/register`, { data: registrationFor() });

    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({
      errorCode: 'OTP-403',
      message: 'Email not verified. Verify the code sent to your email before registering.'
    });
  });

  test('a verification token cannot be used for a different email', async ({ request }) => {
    const verified = registrationFor();
    const since = Date.now();
    await request.post(`${env.authApi}/auth/register/otp`, { data: { email: verified.email } });
    const otp = await waitForOtp(request, verified.email, since);
    const token = (await (await request.post(`${env.authApi}/auth/register/otp/verify`, {
      data: { email: verified.email, otp }
    })).json()).verificationToken;

    const other = registrationFor();
    const res = await request.post(`${env.authApi}/auth/register`, { data: { ...other, emailVerificationToken: token } });

    expect(res.status()).toBe(403);
  });

  test('requesting a second code within a minute is refused with OTP-429', async ({ request }) => {
    const { email } = registrationFor();
    expect((await request.post(`${env.authApi}/auth/register/otp`, { data: { email } })).status()).toBe(200);

    const again = await request.post(`${env.authApi}/auth/register/otp`, { data: { email } });

    expect(again.status()).toBe(429);
    expect((await again.json()).errorCode).toBe('OTP-429');
  });
});
