import { APIRequestContext } from '@playwright/test';
import type { CapturedMail } from './mail-sink';

// Reads the codes the auth service emails, from the test inbox started by
// global-setup.ts. The address can be overridden with E2E_MAIL_API.
const mailApi = () => process.env['E2E_MAIL_API'] || 'http://localhost:8025';

// Both OTP emails say "Your verification code is: 123456". Digits survive
// quoted-printable encoding, so the raw message can be searched directly.
const OTP_PATTERN = /verification code is:\s*(\d{6})/i;

/**
 * Waits for an email to `recipient` that arrived after `since` and returns
 * the 6-digit code in it. Polls, because the auth service sends the
 * forgot-password email in the background.
 */
export async function waitForOtp(
  request: APIRequestContext,
  recipient: string,
  since: number,
  timeoutMs = 10_000
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await request.get(`${mailApi()}/messages`, { params: { to: recipient } });
    if (res.ok()) {
      const mails = ((await res.json()) as CapturedMail[]).filter((mail) => mail.receivedAt >= since);
      for (const mail of mails.reverse()) {
        const match = OTP_PATTERN.exec(mail.raw);
        if (match) {
          return match[1];
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `No verification code emailed to ${recipient} within ${timeoutMs} ms. ` +
      'Is the auth service running with SMTP_HOST=localhost SMTP_PORT=1025 SMTP_SECURE=false?'
  );
}

/** All emails captured for `recipient` since `since` (raw MIME). */
export async function mailsTo(request: APIRequestContext, recipient: string, since: number): Promise<CapturedMail[]> {
  const res = await request.get(`${mailApi()}/messages`, { params: { to: recipient } });
  return ((await res.json()) as CapturedMail[]).filter((mail) => mail.receivedAt >= since);
}
