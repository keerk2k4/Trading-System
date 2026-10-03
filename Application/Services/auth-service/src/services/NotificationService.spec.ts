import * as nodemailer from "nodemailer";
import { NotificationService } from "./NotificationService";

jest.mock("nodemailer");

const USER_ID = "11111111-2222-4333-8444-555555555555";

describe("NotificationService", () => {
  const originalEnv = process.env;
  let sendMail: jest.Mock;

  beforeEach(() => {
    process.env = { ...originalEnv };
    sendMail = jest.fn().mockResolvedValue({ messageId: "1" });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it("skips sending when SMTP_HOST is not configured", async () => {
    delete process.env.SMTP_HOST;
    const service = new NotificationService();

    await service.sendUserRegistered(USER_ID, "alice@example.com", "alice");

    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends the registration email through the configured SMTP server", async () => {
    process.env.SMTP_HOST = "mailpit";
    process.env.SMTP_PORT = "1025";
    process.env.MAIL_FROM = "Trading <no-reply@trading.local>";
    const service = new NotificationService();

    await service.sendUserRegistered(USER_ID, "alice@example.com", "alice");

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: "mailpit", port: 1025, secure: false }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Trading <no-reply@trading.local>",
        to: "alice@example.com",
        subject: "Welcome to the Enterprise Trading Platform",
      }),
    );
  });

  it("sends KYC submitted, approved and rejected emails", async () => {
    process.env.SMTP_HOST = "mailpit";
    const service = new NotificationService();

    await service.sendKycSubmitted(USER_ID, "alice@example.com", "alice");
    await service.sendKycApproved(USER_ID, "alice@example.com", "alice");
    await service.sendKycRejected(USER_ID, "alice@example.com", "alice", "Document is unreadable");

    const subjects = sendMail.mock.calls.map(([message]) => message.subject);
    expect(subjects).toEqual([
      "KYC submitted - awaiting approval",
      "KYC approved - your trading account is active",
      "KYC not approved",
    ]);
    expect(sendMail.mock.calls[2][0].text).toContain("Reason: Document is unreadable");
  });

  it("skips legacy placeholder addresses", async () => {
    process.env.SMTP_HOST = "mailpit";
    const service = new NotificationService();

    await service.sendKycApproved(USER_ID, "alice@placeholder.local", "alice");

    expect(sendMail).not.toHaveBeenCalled();
  });

  it("never throws when the SMTP server fails", async () => {
    process.env.SMTP_HOST = "mailpit";
    sendMail.mockRejectedValue(new Error("connection refused"));
    const service = new NotificationService();

    await expect(service.sendUserRegistered(USER_ID, "alice@example.com", "alice")).resolves.toBeUndefined();
  });
});
