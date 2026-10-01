import { KycController } from "./kyc.controller";
import { KycRepository } from "../repositories/KycRepository";
import { UserRepository } from "../repositories/UserRepository";
import { TradeApiClient } from "../services/TradeApiClient";
import { NotificationService } from "../services/NotificationService";
import { KycReviewStatus } from "../dtos/UpdateKycRequest";

const USER_ID = "11111111-2222-4333-8444-555555555555";
const ADMIN_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function makeResponse() {
  const state: { status?: number; body?: any } = {};
  const res: any = {
    status: jest.fn((code: number) => {
      state.status = code;
      return res;
    }),
    json: jest.fn((body: any) => {
      state.body = body;
      return res;
    }),
  };
  return { res, state };
}

describe("KycController", () => {
  let controller: KycController;
  let kycRepository: jest.Mocked<KycRepository>;
  let userRepository: jest.Mocked<UserRepository>;
  let tradeApiClient: jest.Mocked<TradeApiClient>;
  let notificationService: jest.Mocked<NotificationService>;

  const applicant = {
    userId: USER_ID,
    userName: "alice.trader",
    email: "alice.trader@example.com",
  };

  // Review notifications run after the response is sent; let them settle.
  const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

  const kycRow = {
    id: 1,
    userId: USER_ID,
    status: "PENDING" as const,
    dateOfBirth: "1996-02-14",
    documentType: "PASSPORT",
    documentNumber: "P1234567",
    submittedAt: "2026-09-28T00:00:00.000Z",
    reviewedAt: null,
    reviewedBy: null,
    rejectionReason: null,
  };

  beforeEach(() => {
    kycRepository = {
      findByUserId: jest.fn(),
      createSubmission: jest.fn(),
      reviewSubmission: jest.fn(),
    } as unknown as jest.Mocked<KycRepository>;

    userRepository = {
      findByUserId: jest.fn(),
    } as unknown as jest.Mocked<UserRepository>;

    tradeApiClient = {
      createAccount: jest.fn(),
      activateAccount: jest.fn(),
    } as unknown as jest.Mocked<TradeApiClient>;

    notificationService = {
      sendKycSubmitted: jest.fn().mockResolvedValue(undefined),
      sendKycApproved: jest.fn().mockResolvedValue(undefined),
      sendKycRejected: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotificationService>;

    controller = new KycController(kycRepository, userRepository, tradeApiClient, notificationService);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("creates KYC for authenticated user", async () => {
    kycRepository.findByUserId.mockResolvedValue(null);
    userRepository.findByUserId.mockResolvedValue(applicant as any);
    kycRepository.createSubmission.mockResolvedValue(kycRow);
    const { res, state } = makeResponse();

    await controller.createKyc(
      { sub: USER_ID, roles: ["CUSTOMER"] } as any,
      { dateOfBirth: "1996-02-14", documentType: "PASSPORT", documentNumber: "P1234567" },
      res,
    );

    expect(state.status).toBe(201);
    expect(state.body.status).toBe("PENDING");
    expect(kycRepository.createSubmission).toHaveBeenCalledWith({
      userId: USER_ID,
      dateOfBirth: "1996-02-14",
      documentType: "PASSPORT",
      documentNumber: "P1234567",
    });
    expect(notificationService.sendKycSubmitted).toHaveBeenCalledWith(
      USER_ID,
      "alice.trader@example.com",
      "alice.trader",
    );
  });

  it("does not send a KYC-submitted email when KYC already exists", async () => {
    kycRepository.findByUserId.mockResolvedValue(kycRow);
    const { res } = makeResponse();

    await controller.createKyc(
      { sub: USER_ID, roles: ["CUSTOMER"] } as any,
      { dateOfBirth: "1996-02-14", documentType: "PASSPORT", documentNumber: "P1234567" },
      res,
    );

    expect(notificationService.sendKycSubmitted).not.toHaveBeenCalled();
  });

  it("rejects admin token for KYC submission", async () => {
    const { res, state } = makeResponse();

    await controller.createKyc(
      { sub: ADMIN_ID, roles: ["ADMIN"] } as any,
      { dateOfBirth: "1996-02-14", documentType: "PASSPORT", documentNumber: "P1234567" },
      res,
    );

    expect(state).toEqual({
      status: 403,
      body: {
        errorCode: "AUTH-403",
        message: "Forbidden",
      },
    });
    expect(kycRepository.createSubmission).not.toHaveBeenCalled();
  });

  it("returns 409 when KYC already exists", async () => {
    kycRepository.findByUserId.mockResolvedValue(kycRow);
    const { res, state } = makeResponse();

    await controller.createKyc(
      { sub: USER_ID, roles: ["CUSTOMER"] } as any,
      { dateOfBirth: "1996-02-14", documentType: "PASSPORT", documentNumber: "P1234567" },
      res,
    );

    expect(state).toEqual({
      status: 409,
      body: {
        errorCode: "KYC-409",
        message: "KYC already submitted",
      },
    });
  });

  it("rejects non-admin review requests", async () => {
    const { res, state } = makeResponse();

    await controller.reviewKyc(
      { sub: USER_ID, roles: ["CUSTOMER"] } as any,
      { userId: USER_ID, status: KycReviewStatus.APPROVED },
      res,
    );

    expect(state).toEqual({
      status: 403,
      body: {
        errorCode: "AUTH-403",
        message: "Forbidden",
      },
    });
    expect(kycRepository.reviewSubmission).not.toHaveBeenCalled();
  });

  it("approves KYC and activates pending trading account when reviewed by admin", async () => {
    kycRepository.findByUserId.mockResolvedValue(kycRow);
    kycRepository.reviewSubmission.mockResolvedValue({
      ...kycRow,
      status: "APPROVED",
      reviewedAt: "2026-09-28T01:00:00.000Z",
      reviewedBy: ADMIN_ID,
    });
    userRepository.findByUserId.mockResolvedValue(applicant as any);
    tradeApiClient.activateAccount.mockResolvedValue({
      accountId: 73,
      accountNumber: "ACC-73",
      availableBalance: "0.00",
      accountStatus: "ACTIVE",
    });
    const { res, state } = makeResponse();

    await controller.reviewKyc(
      { sub: ADMIN_ID, roles: ["ADMIN"] } as any,
      { userId: USER_ID, status: KycReviewStatus.APPROVED },
      res,
    );

    expect(state.status).toBe(200);
    expect(state.body.status).toBe("APPROVED");
    expect(state.body.accountId).toBe(73);
    expect(tradeApiClient.activateAccount).toHaveBeenCalledWith(USER_ID);

    await flushPromises();
    expect(userRepository.findByUserId).toHaveBeenCalledWith(USER_ID);
    expect(notificationService.sendKycApproved).toHaveBeenCalledWith(
      USER_ID,
      "alice.trader@example.com",
      "alice.trader",
    );
    expect(notificationService.sendKycRejected).not.toHaveBeenCalled();
  });

  it("still returns 200 when the approval email cannot be sent", async () => {
    kycRepository.findByUserId.mockResolvedValue(kycRow);
    kycRepository.reviewSubmission.mockResolvedValue({ ...kycRow, status: "APPROVED" });
    tradeApiClient.activateAccount.mockResolvedValue({
      accountId: 73,
      accountNumber: "ACC-73",
      availableBalance: "0.00",
      accountStatus: "ACTIVE",
    });
    userRepository.findByUserId.mockRejectedValue(new Error("db down"));
    const { res, state } = makeResponse();

    await controller.reviewKyc(
      { sub: ADMIN_ID, roles: ["ADMIN"] } as any,
      { userId: USER_ID, status: KycReviewStatus.APPROVED },
      res,
    );
    await flushPromises();

    expect(state.status).toBe(200);
    expect(notificationService.sendKycApproved).not.toHaveBeenCalled();
  });

  it("updates KYC to rejected without creating trading account", async () => {
    kycRepository.findByUserId.mockResolvedValue(kycRow);
    kycRepository.reviewSubmission.mockResolvedValue({
      ...kycRow,
      status: "REJECTED",
      reviewedAt: "2026-09-28T01:00:00.000Z",
      reviewedBy: ADMIN_ID,
      rejectionReason: "Document is unreadable",
    });
    userRepository.findByUserId.mockResolvedValue(applicant as any);
    const { res, state } = makeResponse();

    await controller.reviewKyc(
      { sub: ADMIN_ID, roles: ["ADMIN"] } as any,
      {
        userId: USER_ID,
        status: KycReviewStatus.REJECTED,
        rejectionReason: "Document is unreadable",
      },
      res,
    );

    expect(state.status).toBe(200);
    expect(state.body.status).toBe("REJECTED");
    expect(state.body.accountId).toBeUndefined();
    expect(tradeApiClient.activateAccount).not.toHaveBeenCalled();

    await flushPromises();
    expect(notificationService.sendKycRejected).toHaveBeenCalledWith(
      USER_ID,
      "alice.trader@example.com",
      "alice.trader",
      "Document is unreadable",
    );
    expect(notificationService.sendKycApproved).not.toHaveBeenCalled();
  });
});
