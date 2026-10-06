import { Injectable } from "@nestjs/common";
import * as nodemailer from "nodemailer";
import { Transporter } from "nodemailer";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Sends user-facing email notifications over SMTP.
 *
 * - Configured from env: SMTP_HOST, SMTP_PORT (default 1025), SMTP_SECURE
 *   ("true" for implicit TLS), SMTP_USER / SMTP_PASS (optional), MAIL_FROM.
 * - When SMTP_HOST is unset, sending is disabled and each notification is
 *   skipped with a log line, so local runs and tests need no mail server.
 * - Every public method is best-effort: it never throws. A mail outage must
 *   not fail registration or KYC, so callers fire and forget.
 * - Never log the recipient address or message body; the address is PII.
 *   Log the user id only.
 */
@Injectable()
export class NotificationService {
  private readonly from = process.env.MAIL_FROM || "Enterprise Trading Platform <no-reply@trading.local>";
  private transporter: Transporter | null = null;

  constructor() {
    const host = process.env.SMTP_HOST;
    if (!host) {
      return;
    }

    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    this.transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 1025),
      secure: process.env.SMTP_SECURE === "true",
      auth: user ? { user, pass } : undefined,
    });
  }

  /**
   * Emails a registration one-time passcode. Unlike the other notifications
   * the caller needs to know the outcome, so this returns whether it was sent.
   *
   * Local development only: with no SMTP_HOST and NODE_ENV !== "production",
   * the code is printed to the console instead so the flow can be tested
   * without a mail server. In production a missing SMTP_HOST is a failure.
   */
  async sendRegistrationOtp(email: string, otp: string, expiresInMinutes: number): Promise<boolean> {
    if (!this.transporter && process.env.NODE_ENV !== "production" && this.hasDeliverableAddress(email)) {
      console.warn(`[DEV ONLY] SMTP_HOST not configured. Registration OTP: ${otp}`);
      return true;
    }

    // There is no user id before registration; "registration" stands in for it in logs.
    return this.send("registration", {
      to: email,
      subject: "Your Enterprise Trading Platform verification code",
      text:
        "Hello,\n\n" +
        `Your verification code is: ${otp}\n\n` +
        `It expires in ${expiresInMinutes} minutes. Enter it on the registration page to verify your email address.\n\n` +
        "If you did not try to create an account, you can ignore this email.\n\n" +
        "Enterprise Trading Platform",
    });
  }

  async sendUserRegistered(userId: string, email: string, username: string): Promise<void> {
    await this.send(userId, {
      to: email,
      subject: "Welcome to the Enterprise Trading Platform",
      text:
        `Hello ${username},\n\n` +
        "Your account has been registered successfully.\n\n" +
        "Next step: sign in and submit your KYC details. Trading is enabled once an " +
        "administrator approves your KYC.\n\n" +
        "Enterprise Trading Platform",
    });
  }

  async sendKycSubmitted(userId: string, email: string, username: string): Promise<void> {
    await this.send(userId, {
      to: email,
      subject: "KYC submitted - awaiting approval",
      text:
        `Hello ${username},\n\n` +
        "We have received your KYC details. They are now waiting for review by an administrator.\n\n" +
        "We will email you again as soon as a decision has been made.\n\n" +
        "Enterprise Trading Platform",
    });
  }

  async sendKycApproved(userId: string, email: string, username: string): Promise<void> {
    await this.send(userId, {
      to: email,
      subject: "KYC approved - your trading account is active",
      text:
        `Hello ${username},\n\n` +
        "Your KYC has been approved and your trading account is now active.\n\n" +
        "You can sign in and start placing orders.\n\n" +
        "Enterprise Trading Platform",
    });
  }

  async sendKycRejected(userId: string, email: string, username: string, reason: string | null): Promise<void> {
    await this.send(userId, {
      to: email,
      subject: "KYC not approved",
      text:
        `Hello ${username},\n\n` +
        "Unfortunately your KYC submission was not approved.\n\n" +
        (reason ? `Reason: ${reason}\n\n` : "") +
        "Please contact support if you have any questions.\n\n" +
        "Enterprise Trading Platform",
    });
  }

  // Resolves true only when the SMTP server accepted the message.
  private async send(userId: string, message: MailMessage): Promise<boolean> {
    if (!this.hasDeliverableAddress(message.to)) {
      console.log(`Notification skipped for user ${userId}: no deliverable email address`);
      return false;
    }

    if (!this.transporter) {
      console.log(`Notification skipped for user ${userId}: SMTP_HOST not configured ("${message.subject}")`);
      return false;
    }

    try {
      await this.transporter.sendMail({ from: this.from, ...message });
      console.log(`Notification sent to user ${userId}: "${message.subject}"`);
      return true;
    } catch (error) {
      console.error(`Notification failed for user ${userId}: "${message.subject}"`, (error as Error)?.message);
      return false;
    }
  }

  // Users registered before email capture carry a `<username>@placeholder.local`
  // address, which is not a real mailbox.
  private hasDeliverableAddress(email: string | null | undefined): email is string {
    return !!email && email.includes("@") && !email.toLowerCase().endsWith("@placeholder.local");
  }
}
