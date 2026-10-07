import { InternalNotificationController } from "./internal-notification.controller";
import { UserRepository } from "../repositories/UserRepository";
import { NotificationService } from "../services/NotificationService";
import { User } from "../entities/User";

function mockResponse(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("InternalNotificationController", () => {
  const USER_ID = "8f14e45f-ceea-4c1b-9d3b-1a2b3c4d5e6f";
  const user: User = {
    userId: USER_ID,
    userName: "priya",
    passwordHash: "hash",
    email: "priya@example.com",
    phone: null,
    firstName: "Priya",
    lastName: "Menon",
    status: "ACTIVE",
  };
  const request = { userId: USER_ID, subject: "Order filled: AAPL", message: "Your order for 5 AAPL (BUY) has been filled at 190.00." };

  let users: { findByUserId: jest.Mock };
  let notifications: { sendTradeNotification: jest.Mock };
  let controller: InternalNotificationController;

  beforeEach(() => {
    users = { findByUserId: jest.fn().mockResolvedValue(user) };
    notifications = { sendTradeNotification: jest.fn().mockResolvedValue(true) };
    controller = new InternalNotificationController(
      users as unknown as UserRepository,
      notifications as unknown as NotificationService,
    );
  });

  it("emails the user's address on file and answers 200", async () => {
    const res = mockResponse();
    await controller.sendEmail(request, res);

    expect(notifications.sendTradeNotification).toHaveBeenCalledWith(
      USER_ID,
      "priya@example.com",
      "priya",
      "Order filled: AAPL",
      request.message,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ sent: true });
  });

  it("answers 404 for an unknown user without sending", async () => {
    users.findByUserId.mockResolvedValue(null);
    const res = mockResponse();
    await controller.sendEmail(request, res);

    expect(notifications.sendTradeNotification).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "AUTH-404" }));
  });

  it("answers 502 when the mail server did not accept it", async () => {
    notifications.sendTradeNotification.mockResolvedValue(false);
    const res = mockResponse();
    await controller.sendEmail(request, res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "MAIL-502" }));
  });

  it("never puts the address in the response", async () => {
    const res = mockResponse();
    await controller.sendEmail(request, res);

    expect(JSON.stringify(res.json.mock.calls)).not.toContain("priya@example.com");
  });
});
