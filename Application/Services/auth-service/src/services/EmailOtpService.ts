import { Injectable } from "@nestjs/common";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";

interface OtpEntry {
  otpHash: Buffer;
  expiresAt: number;
  sentAt: number;
  attempts: number;
}

interface VerifiedEntry {
  tokenHash: Buffer;
  expiresAt: number;
}

export type OtpRequestResult =
  | { ok: true; otp: string; expiresInSeconds: number; resendAfterSeconds: number }
  | { ok: false; reason: "COOLDOWN"; retryAfterSeconds: number };

export type OtpVerifyResult =
  | { ok: true; verificationToken: string; expiresInSeconds: number }
  | { ok: false; reason: "NOT_REQUESTED" | "EXPIRED" | "TOO_MANY_ATTEMPTS" }
  | { ok: false; reason: "INVALID"; attemptsRemaining: number };

// OTP key for a password reset. Prefixed so it can never collide with a
// registration key (which is an email address).
export function passwordResetKey(userId: string): string {
  return `password-reset:${userId}`;
}

/**
 * One-time passcodes that prove a user controls an email address.
 *
 * Flow: requestOtp -> (code emailed) -> verifyOtp -> verificationToken ->
 * the follow-up request carries the token, which isVerified() checks and
 * consume() burns. Used by:
 * - registration: identifier = the email being registered;
 * - password reset: identifier = passwordResetKey(userId), so a reset code
 *   can never be mistaken for a registration code or vice versa.
 *
 * - Codes and tokens are stored only as SHA-256 hashes and compared in
 *   constant time; the plaintext never stays in memory after it is returned.
 * - In memory, like ThrottleService: a restart simply means the user asks
 *   for a new code. Swap for Redis/Postgres when running more than one replica.
 * - Keys are the lower-cased, trimmed identifier so "A@x.com" and "a@x.com" match.
 */
@Injectable()
export class EmailOtpService {
  private readonly OTP_LENGTH = 6;
  private readonly OTP_TTL_MS = 10 * 60 * 1000; // code valid for 10 minutes
  private readonly RESEND_COOLDOWN_MS = 60 * 1000; // one email per minute per address
  private readonly MAX_VERIFY_ATTEMPTS = 5; // then the code is burned
  private readonly VERIFIED_TTL_MS = 30 * 60 * 1000; // time to finish the form after verifying

  private otps = new Map<string, OtpEntry>();
  private verified = new Map<string, VerifiedEntry>();

  requestOtp(identifier: string): OtpRequestResult {
    const key = this.key(identifier);
    const now = Date.now();
    this.purgeExpired(now);

    const existing = this.otps.get(key);
    if (existing && now - existing.sentAt < this.RESEND_COOLDOWN_MS) {
      return {
        ok: false,
        reason: "COOLDOWN",
        retryAfterSeconds: Math.ceil((existing.sentAt + this.RESEND_COOLDOWN_MS - now) / 1000),
      };
    }

    const otp = randomInt(0, 10 ** this.OTP_LENGTH).toString().padStart(this.OTP_LENGTH, "0");
    this.otps.set(key, {
      otpHash: this.hash(otp),
      expiresAt: now + this.OTP_TTL_MS,
      sentAt: now,
      attempts: 0,
    });
    // A new code invalidates any earlier verification for this address.
    this.verified.delete(key);

    return {
      ok: true,
      otp,
      expiresInSeconds: this.OTP_TTL_MS / 1000,
      resendAfterSeconds: this.RESEND_COOLDOWN_MS / 1000,
    };
  }

  getSettings(): { expiresInSeconds: number; resendAfterSeconds: number } {
    return { expiresInSeconds: this.OTP_TTL_MS / 1000, resendAfterSeconds: this.RESEND_COOLDOWN_MS / 1000 };
  }

  // Lets the caller undo a request whose email could not be sent, so the
  // user is not stuck behind the resend cooldown for a code they never got.
  cancelOtp(identifier: string): void {
    this.otps.delete(this.key(identifier));
  }

  verifyOtp(identifier: string, otp: string): OtpVerifyResult {
    const key = this.key(identifier);
    const now = Date.now();
    const entry = this.otps.get(key);

    if (!entry) {
      return { ok: false, reason: "NOT_REQUESTED" };
    }
    if (now > entry.expiresAt) {
      this.otps.delete(key);
      return { ok: false, reason: "EXPIRED" };
    }
    if (entry.attempts >= this.MAX_VERIFY_ATTEMPTS) {
      this.otps.delete(key);
      return { ok: false, reason: "TOO_MANY_ATTEMPTS" };
    }

    if (!this.matches(entry.otpHash, otp.trim())) {
      entry.attempts++;
      const attemptsRemaining = this.MAX_VERIFY_ATTEMPTS - entry.attempts;
      if (attemptsRemaining <= 0) {
        this.otps.delete(key);
        return { ok: false, reason: "TOO_MANY_ATTEMPTS" };
      }
      return { ok: false, reason: "INVALID", attemptsRemaining };
    }

    this.otps.delete(key);
    const verificationToken = randomBytes(32).toString("base64url");
    this.verified.set(key, {
      tokenHash: this.hash(verificationToken),
      expiresAt: now + this.VERIFIED_TTL_MS,
    });
    return { ok: true, verificationToken, expiresInSeconds: this.VERIFIED_TTL_MS / 1000 };
  }

  // True when the token was issued by verifyOtp for exactly this email and
  // has not expired or been consumed. Does not burn the token.
  isVerified(identifier: string, verificationToken: string | undefined | null): boolean {
    if (!verificationToken) {
      return false;
    }
    const key = this.key(identifier);
    const entry = this.verified.get(key);
    if (!entry) {
      return false;
    }
    if (Date.now() > entry.expiresAt) {
      this.verified.delete(key);
      return false;
    }
    return this.matches(entry.tokenHash, verificationToken);
  }

  // Burns the token once registration has succeeded, so it cannot create a second account.
  consume(identifier: string): void {
    this.verified.delete(this.key(identifier));
  }

  private key(identifier: string): string {
    return identifier.trim().toLowerCase();
  }

  private hash(value: string): Buffer {
    return createHash("sha256").update(value).digest();
  }

  private matches(expectedHash: Buffer, candidate: string): boolean {
    return timingSafeEqual(expectedHash, this.hash(candidate));
  }

  private purgeExpired(now: number): void {
    for (const [key, entry] of this.otps) {
      if (now > entry.expiresAt) {
        this.otps.delete(key);
      }
    }
    for (const [key, entry] of this.verified) {
      if (now > entry.expiresAt) {
        this.verified.delete(key);
      }
    }
  }
}
