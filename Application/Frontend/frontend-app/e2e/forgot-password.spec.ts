import { test, expect, Page } from '@playwright/test';
import { env } from './env';
import { registerViaApi, registrationFor, waitUntilCanSignIn } from './api';
import { mailsTo, waitForOtp } from './mail';

// Forgot-password journey against the real auth service: username -> code
// emailed to the registered address (read from the test inbox) -> new
// password. Every test registers its own user, so the shared E2E user's
// password is never touched.

const NEW_PASSWORD = 'E2e-New-Password-456';
const CODE_SENT =
  'If an account with that username exists, a verification code has been sent to its registered email address.';

async function requestCode(page: Page, username: string): Promise<void> {
  await page.goto('/forgot-password');
  await page.getByTestId('forgot-username').fill(username);
  await page.getByTestId('forgot-send-code').click();
  await expect(page.getByTestId('forgot-code-sent')).toHaveText(CODE_SENT);
}

test.describe('Forgot password journey', () => {
  test('the sign-in page links to password reset', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-forgot-password-link').click();

    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  });

  test('a user resets their password with the emailed code and signs in with the new one', async ({ page, request }) => {
    const user = await registerViaApi(request);
    await waitUntilCanSignIn(request, user);

    const since = Date.now();
    await requestCode(page, user.username);
    const otp = await waitForOtp(request, user.email, since);

    await page.getByTestId('forgot-otp').fill(otp);
    await page.getByTestId('forgot-verify-code').click();
    await page.getByTestId('forgot-new-password').fill(NEW_PASSWORD);
    await page.getByTestId('forgot-confirm-password').fill(NEW_PASSWORD);
    await page.getByTestId('forgot-change-password').click();

    await expect(page.getByRole('heading', { name: 'Password changed' })).toBeVisible();
    await expect(page.getByTestId('forgot-success')).toBeVisible();

    // The "password changed" notice goes to the same registered address.
    await expect
      .poll(async () => (await mailsTo(request, user.email, since)).some((m) => m.raw.includes('Your password has been changed')))
      .toBe(true);

    // The old password no longer works; the new one does.
    const oldLogin = await request.post(`${env.authApi}/auth/login`, {
      data: { username: user.username, password: user.password }
    });
    expect(oldLogin.status()).toBe(401);

    await page.getByTestId('forgot-continue').click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByTestId('login-username').fill(user.username);
    await page.getByTestId('login-password').fill(NEW_PASSWORD);
    await page.getByTestId('login-submit').click();
    await page.waitForURL((url) => !/^\/login/.test(url.pathname));
  });

  test('a wrong code is refused with the attempts left', async ({ page, request }) => {
    const user = await registerViaApi(request);
    const since = Date.now();
    await requestCode(page, user.username);
    const otp = await waitForOtp(request, user.email, since);

    await page.getByTestId('forgot-otp').fill(otp === '000000' ? '111111' : '000000');
    await page.getByTestId('forgot-verify-code').click();

    await expect(page.getByTestId('forgot-otp-error')).toHaveText('Incorrect verification code. 4 attempts remaining.');
    await expect(page.getByTestId('forgot-new-password')).toHaveCount(0);
  });

  test('mismatched new passwords are caught before anything is sent', async ({ page, request }) => {
    const user = await registerViaApi(request);
    const since = Date.now();
    await requestCode(page, user.username);
    await page.getByTestId('forgot-otp').fill(await waitForOtp(request, user.email, since));
    await page.getByTestId('forgot-verify-code').click();

    await page.getByTestId('forgot-new-password').fill(NEW_PASSWORD);
    await page.getByTestId('forgot-confirm-password').fill('Something-Else-789');
    await page.getByTestId('forgot-change-password').click();

    await expect(page.getByTestId('forgot-confirm-password-error')).toHaveText('Passwords do not match.');
  });

  test('an unknown username gets the same answer and no email is sent', async ({ page, request }) => {
    const username = registrationFor().username;
    await requestCode(page, username);

    await page.waitForTimeout(1000);
    expect(await mailsTo(request, `${username}@example.com`, 0)).toHaveLength(0);
  });
});

test.describe('Password reset API', () => {
  test('POST /auth/reset-password with an invalid token is refused with OTP-403', async ({ request }) => {
    const user = await registerViaApi(request);

    const res = await request.post(`${env.authApi}/auth/reset-password`, {
      data: { username: user.username, resetToken: 'not-a-real-token', newPassword: NEW_PASSWORD }
    });

    expect(res.status()).toBe(403);
    expect((await res.json()).errorCode).toBe('OTP-403');
  });

  test('the new password must differ from the current one', async ({ request }) => {
    const user = await registerViaApi(request);
    const since = Date.now();
    await request.post(`${env.authApi}/auth/forgot-password`, { data: { username: user.username } });
    const otp = await waitForOtp(request, user.email, since);
    const { verificationToken } = await (
      await request.post(`${env.authApi}/auth/forgot-password/verify`, { data: { username: user.username, otp } })
    ).json();

    const res = await request.post(`${env.authApi}/auth/reset-password`, {
      data: { username: user.username, resetToken: verificationToken, newPassword: user.password }
    });

    expect(res.status()).toBe(422);
    expect((await res.json()).message).toBe('Your new password must be different from your current password.');
  });

  test('a reset token works only once', async ({ request }) => {
    const user = await registerViaApi(request);
    const since = Date.now();
    await request.post(`${env.authApi}/auth/forgot-password`, { data: { username: user.username } });
    const otp = await waitForOtp(request, user.email, since);
    const { verificationToken } = await (
      await request.post(`${env.authApi}/auth/forgot-password/verify`, { data: { username: user.username, otp } })
    ).json();
    const reset = (newPassword: string) =>
      request.post(`${env.authApi}/auth/reset-password`, {
        data: { username: user.username, resetToken: verificationToken, newPassword }
      });

    expect((await reset(NEW_PASSWORD)).status()).toBe(200);
    expect((await reset('E2e-Third-Password-789')).status()).toBe(403);
  });
});
