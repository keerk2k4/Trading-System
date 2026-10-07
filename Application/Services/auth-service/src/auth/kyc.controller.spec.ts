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
      updateSubmissionByUserId: jest.fn(),
      findAllPending: jest.fn(),
      isDocumentTaken: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<KycRepository>;

    userRepository = {
      findByUserId: jest.fn(),
      updateStatus: jest.fn(),
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

  describe("duplicate document", () => {
    const DOCUMENT_TAKEN = {
      errorCode: "DOC-409",
      message: "This document is already registered to another account. Check the document type and number.",
    };
    const request = { dateOfBirth: "1996-02-14", documentType: "PASSPORT", documentNumber: "P1234567" };

    it("refuses a submission whose document another user already registered", async () => {
      kycRepository.findByUserId.mockResolvedValue(null);
      kycRepository.isDocumentTaken.mockResolvedValue(true);
      const { res, state } = makeResponse();

      await controller.createKyc({ sub: USER_ID, roles: ["CUSTOMER"] } as any, request, res);

      expect(state).toEqual({ status: 409, body: DOCUMENT_TAKEN });
      expect(kycRepository.isDocumentTaken).toHaveBeenCalledWith("PASSPORT", "P1234567", USER_ID);
      expect(kycRepository.createSubmission).not.toHaveBeenCalled();
    });

    it("refuses an update to a document another user already registered", async () => {
      kycRepository.isDocumentTaken.mockResolvedValue(true);
      const { res, state } = makeResponse();

      await controller.updateMyKyc({ sub: USER_ID, roles: ["CUSTOMER"] } as any, request, res);

      expect(state).toEqual({ status: 409, body: DOCUMENT_TAKEN });
      expect(kycRepository.updateSubmissionByUserId).not.toHaveBeenCalled();
    });

    it("maps a document unique-index violation (two submissions racing) to 409 DOC-409", async () => {
      kycRepository.findByUserId.mockResolvedValue(null);
      userRepository.findByUserId.mockResolvedValue(applicant as any);
      kycRepository.createSubmission.mockRejectedValue({ code: "23505", constraint: "uq_auth_kyc_document_lookup_hash" });
      const { res, state } = makeResponse();

      await controller.createKyc({ sub: USER_ID, roles: ["CUSTOMER"] } as any, request, res);

      expect(state).toEqual({ status: 409, body: DOCUMENT_TAKEN });
    });
  });

  describe("future date of birth", () => {
    const FUTURE_DOB_ERROR = {
      errorCode: "VAL-422",
      message: "Date of birth cannot be a future date. Select today or an earlier date.",
    };
    const nextYear = `${new Date().getUTCFullYear() + 1}-01-01`;

    it("refuses a KYC submission dated in the future and stores nothing", async () => {
      const { res, state } = makeResponse();

      await controller.createKyc(
        { sub: USER_ID, roles: ["CUSTOMER"] } as any,
        { dateOfBirth: nextYear, documentType: "PASSPORT", documentNumber: "P1234567" },
        res,
      );

      expect(state).toEqual({ status: 422, body: FUTURE_DOB_ERROR });
      expect(kycRepository.createSubmission).not.toHaveBeenCalled();
    });

    it("refuses a KYC update dated in the future and changes nothing", async () => {
      const { res, state } = makeResponse();

      await controller.updateMyKyc(
        { sub: USER_ID, roles: ["CUSTOMER"] } as any,
        { dateOfBirth: nextYear, documentType: "PASSPORT", documentNumber: "P1234567" },
        res,
      );

      expect(state).toEqual({ status: 422, body: FUTURE_DOB_ERROR });
      expect(kycRepository.updateSubmissionByUserId).not.toHaveBeenCalled();
    });

    it("accepts today's date", async () => {
      kycRepository.findByUserId.mockResolvedValue(null);
      userRepository.findByUserId.mockResolvedValue(applicant as any);
      kycRepository.createSubmission.mockResolvedValue(kycRow);
      const { res, state } = makeResponse();

      await controller.createKyc(
        { sub: USER_ID, roles: ["CUSTOMER"] } as any,
        { dateOfBirth: new Date().toISOString().slice(0, 10), documentType: "PASSPORT", documentNumber: "P1234567" },
        res,
      );

      expect(state.status).toBe(201);
    });
  });

  it("gets the current customer's submitted KYC", async () => {
    kycRepository.findByUserId.mockResolvedValue(kycRow);
    const { res, state } = makeResponse();

    await controller.getMyKyc({ sub: USER_ID, roles: ["CUSTOMER"] } as any, res);

    expect(state.status).toBe(200);
    expect(state.body.userId).toBe(USER_ID);
    expect(state.body.status).toBe("PENDING");
  });

  it("returns 404 when current user has no KYC", async () => {
    kycRepository.findByUserId.mockResolvedValue(null);
    const { res, state } = makeResponse();

    await controller.getMyKyc({ sub: USER_ID, roles: ["CUSTOMER"] } as any, res);

    expect(state).toEqual({
      status: 404,
      body: {
        errorCode: "KYC-404",
        message: "KYC record not found",
      },
    });
  });

  it("updates an existing KYC submission for the current customer", async () => {
    kycRepository.updateSubmissionByUserId.mockResolvedValue({
      ...kycRow,
      documentType: "AADHAR",
      documentNumber: "123412341234",
    });
    const { res, state } = makeResponse();

    await controller.updateMyKyc(
      { sub: USER_ID, roles: ["CUSTOMER"] } as any,
      { dateOfBirth: "1996-02-14", documentType: "AADHAR", documentNumber: "123412341234" },
      res,
    );

    expect(state.status).toBe(200);
    expect(state.body.documentType).toBe("AADHAR");
    expect(kycRepository.updateSubmissionByUserId).toHaveBeenCalledWith({
      userId: USER_ID,
      dateOfBirth: "1996-02-14",
      documentType: "AADHAR",
      documentNumber: "123412341234",
    });
  });

  it("returns 404 when updating KYC before first submission", async () => {
    kycRepository.updateSubmissionByUserId.mockResolvedValue(null);
    const { res, state } = makeResponse();

    await controller.updateMyKyc(
      { sub: USER_ID, roles: ["CUSTOMER"] } as any,
      { dateOfBirth: "1996-02-14", documentType: "PASSPORT", documentNumber: "P1234567" },
      res,
    );

    expect(state).toEqual({
      status: 404,
      body: {
        errorCode: "KYC-404",
        message: "KYC record not found",
      },
    });
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

  it("returns pending KYC submissions for an admin", async () => {
    kycRepository.findAllPending.mockResolvedValue([kycRow]);
    const { res, state } = makeResponse();

    await controller.getPendingKyc({ sub: ADMIN_ID, roles: ["ADMIN"] } as any, res);

    expect(state.status).toBe(200);
    expect(state.body).toHaveLength(1);
    expect(state.body[0].status).toBe("PENDING");
  });

  it("rejects non-admin pending KYC requests", async () => {
    const { res, state } = makeResponse();

    await controller.getPendingKyc({ sub: USER_ID, roles: ["CUSTOMER"] } as any, res);

    expect(state).toEqual({
      status: 403,
      body: {
        errorCode: "AUTH-403",
        message: "Forbidden",
      },
    });
    expect(kycRepository.findAllPending).not.toHaveBeenCalled();
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
