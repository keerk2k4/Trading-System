import { startMailSink } from './mail-sink';

// Starts the test inbox that receives the auth service's OTP emails. The
// auth service must send to it: SMTP_HOST=localhost SMTP_PORT=1025
// SMTP_SECURE=false, otherwise the OTP specs time out waiting for the code.
// Set E2E_MAIL_SINK=off when an external catcher already owns these ports
// and serves the same /messages API.
export default async function globalSetup(): Promise<(() => Promise<void>) | void> {
  if (process.env['E2E_MAIL_SINK'] === 'off') {
    return;
  }
  const smtpPort = Number(process.env['E2E_MAIL_SMTP_PORT'] || 1025);
  const httpPort = Number(new URL(process.env['E2E_MAIL_API'] || 'http://localhost:8025').port || 8025);
  return startMailSink(smtpPort, httpPort);
}
