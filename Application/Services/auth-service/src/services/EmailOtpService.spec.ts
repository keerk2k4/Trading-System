import { EmailOtpService } from "./EmailOtpService";

const EMAIL = "new.trader@example.com";

function requestCode(service: EmailOtpService, email = EMAIL): string {
  const result = service.requestOtp(email);
  if (!result.ok) {
    throw new Error("expected a code");
  }
  return result.otp;
}

function wrongCode(otp: string): string {
  return otp === "000000" ? "111111" : "000000";
}

describe("EmailOtpService", () => {
  let service: EmailOtpService;

  beforeEach(() => {
    service = new EmailOtpService();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("issues a 6-digit code", () => {
    expect(requestCode(service)).toMatch(/^\d{6}$/);
  });

  it("verifies the right code and issues a token bound to that email", () => {
    const otp = requestCode(service);

    const result = service.verifyOtp(EMAIL, otp);

    expect(result.ok).toBe(true);
    const token = (result as { verificationToken: string }).verificationToken;
    expect(service.isVerified(EMAIL, token)).toBe(true);
    expect(service.isVerified("NEW.Trader@Example.com ", token)).toBe(true);
    expect(service.isVerified("someone.else@example.com", token)).toBe(false);
    expect(service.isVerified(EMAIL, "not-the-token")).toBe(false);
    expect(service.isVerified(EMAIL, undefined)).toBe(false);
  });

  it("a code cannot be used twice", () => {
    const otp = requestCode(service);
    service.verifyOtp(EMAIL, otp);

    expect(service.verifyOtp(EMAIL, otp)).toEqual({ ok: false, reason: "NOT_REQUESTED" });
  });

  it("rejects a wrong code and counts down the remaining attempts", () => {
    const otp = requestCode(service);

    expect(service.verifyOtp(EMAIL, wrongCode(otp))).toEqual({ ok: false, reason: "INVALID", attemptsRemaining: 4 });
    expect(service.verifyOtp(EMAIL, wrongCode(otp))).toEqual({ ok: false, reason: "INVALID", attemptsRemaining: 3 });
  });

  it("burns the code after five wrong attempts, even if the right one follows", () => {
    const otp = requestCode(service);
    for (let i = 0; i < 4; i++) {
      service.verifyOtp(EMAIL, wrongCode(otp));
    }

    expect(service.verifyOtp(EMAIL, wrongCode(otp))).toEqual({ ok: false, reason: "TOO_MANY_ATTEMPTS" });
    expect(service.verifyOtp(EMAIL, otp)).toEqual({ ok: false, reason: "NOT_REQUESTED" });
  });

  it("rejects an expired code", () => {
    jest.useFakeTimers();
    const otp = requestCode(service);

    jest.advanceTimersByTime(10 * 60 * 1000 + 1);

    expect(service.verifyOtp(EMAIL, otp)).toEqual({ ok: false, reason: "EXPIRED" });
  });

  it("enforces a resend cooldown, then allows a new code that replaces the old one", () => {
    jest.useFakeTimers();
    const first = requestCode(service);

    const blocked = service.requestOtp(EMAIL);
    expect(blocked).toEqual({ ok: false, reason: "COOLDOWN", retryAfterSeconds: 60 });

    jest.advanceTimersByTime(60 * 1000);
    const second = requestCode(service);

    if (first !== second) {
      expect(service.verifyOtp(EMAIL, first)).toMatchObject({ ok: false, reason: "INVALID" });
    }
    expect(service.verifyOtp(EMAIL, second).ok).toBe(true);
  });

  it("cancelOtp lifts the cooldown", () => {
    requestCode(service);
    service.cancelOtp(EMAIL);

    expect(service.requestOtp(EMAIL).ok).toBe(true);
  });

  it("consume burns the verification token", () => {
    const result = service.verifyOtp(EMAIL, requestCode(service));
    const token = (result as { verificationToken: string }).verificationToken;

    service.consume(EMAIL);

    expect(service.isVerified(EMAIL, token)).toBe(false);
  });

  it("the verification token expires", () => {
    jest.useFakeTimers();
    const result = service.verifyOtp(EMAIL, requestCode(service));
    const token = (result as { verificationToken: string }).verificationToken;

    jest.advanceTimersByTime(30 * 60 * 1000 + 1);

    expect(service.isVerified(EMAIL, token)).toBe(false);
  });
});
