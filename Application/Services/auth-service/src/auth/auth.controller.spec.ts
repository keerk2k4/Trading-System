import { AuthController } from "./auth.controller";
import { Role } from "../dtos/RegisterRequest";
import { LoginRequest } from "../dtos/LoginRequest";
import { RegisterRequest } from "../dtos/RegisterRequest";
import { TokenService } from "../services/TokenService";
import { PasswordService } from "../services/PasswordService";
import { RefreshTokenService } from "../services/RefreshTokenService";
import { TradeApiClient } from "../services/TradeApiClient";
import { UserRepository } from "../repositories/UserRepository";
import { ThrottleService } from "../services/ThrottleService";
import { User } from "../entities/User";
import { AccountProvisioningEventService } from "../services/AccountProvisioningEventService";

const USER_ID = "11111111-2222-4333-8444-555555555555";
const ACCOUNT_ID = 73;

const user: User = {
  userId: USER_ID,
  userName: "alice.trader",
  passwordHash: "stored-password-hash",
  email: "alice.trader@placeholder.local",
  phone: null,
  firstName: "Alice",
  lastName: "Trader",
  status: "ACTIVE",
};

const account = {
  accountId: ACCOUNT_ID,
  accountNumber: "ACC-73",
  availableBalance: "0.00",
  accountStatus: "ACTIVE",
};

const errorResponse = {
  errorCode: "AUTH-401",
  message: "Unauthorised",
};

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
    cookie: jest.fn(() => res),
    clearCookie: jest.fn(() => res),
  };
  return { res, state };
}

function registerRequest(overrides: Partial<RegisterRequest> = {}): RegisterRequest {
  return {
    username: "new.trader",
    email: "new.trader@example.com",
    firstName: "New",
    lastName: "Trader",
    phone: "+919900112233",
    password: "correct horse battery staple",
    ...overrides,
  };
}

function loginRequest(overrides: Partial<LoginRequest> = {}): LoginRequest {
  return {
    username: user.userName,
    password: "correct horse battery staple",
    ...overrides,
  };
}

describe("AuthController", () => {
  let controller: AuthController;
  let tokenService: any;
  let passwordService: any;
  let refreshTokenService: any;
  let tradeApiClient: any;
  let userRepository: any;
  let throttleService: any;
  let accountProvisioningEventService: any;
  let notificationService: any;
  let emailOtpService: any;

  beforeEach(() => {
    emailOtpService = {
      requestOtp: jest.fn(),
      cancelOtp: jest.fn(),
      verifyOtp: jest.fn(),
      isVerified: jest.fn().mockReturnValue(true),
      consume: jest.fn(),
      getSettings: jest.fn().mockReturnValue({ expiresInSeconds: 600, resendAfterSeconds: 60 }),
    };
    notificationService = {
      sendUserRegistered: jest.fn().mockResolvedValue(undefined),
      sendRegistrationOtp: jest.fn().mockResolvedValue(true),
      sendPasswordResetOtp: jest.fn().mockResolvedValue(true),
      sendPasswordChanged: jest.fn().mockResolvedValue(undefined),
    };
    tokenService = {
      createAccessToken: jest.fn(),
      getAccessTokenExpiry: jest.fn().mockReturnValue(900),
      getRefreshTokenExpiry: jest.fn().mockReturnValue(604800),
    };
    passwordService = {
      hashPassword: jest.fn(),
      verifyPassword: jest.fn(),
      getDummyHash: jest.fn(),
    };
    refreshTokenService = {
      generateRefreshToken: jest.fn(),
      hashRefreshToken: jest.fn(),
      storeRefreshToken: jest.fn(),
      revokeRefreshToken: jest.fn(),
      revokeAllRefreshTokensForUser: jest.fn(),
    };
    tradeApiClient = {
      createAccount: jest.fn(),
      getAccountByUserId: jest.fn(),
    };
    accountProvisioningEventService = {
      publishUserRegistered: jest.fn(),
    };
    userRepository = {
      isUsernameTaken: jest.fn(),
      create: jest.fn(),
      assignRole: jest.fn(),
      deleteById: jest.fn(),
      updatePassword: jest.fn().mockResolvedValue(undefined),
      findByUsername: jest.fn(),
      findByUserId: jest.fn(),
      getRoles: jest.fn().mockResolvedValue([Role.CUSTOMER]),
      hasRole: jest.fn().mockResolvedValue(false),
    };
    throttleService = {
      isThrottled: jest.fn().mockReturnValue(false),
      recordFailedAttempt: jest.fn(),
      resetThrottle: jest.fn(),
    };

    controller = new AuthController(
      tokenService,
      passwordService,
      refreshTokenService,
      tradeApiClient,
      userRepository,
      throttleService,
      accountProvisioningEventService,
      notificationService,
      emailOtpService,
    );
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("sendRegistrationOtp", () => {
    it("emails the code and returns its lifetime", async () => {
      emailOtpService.requestOtp.mockReturnValue({ ok: true, otp: "123456", expiresInSeconds: 600, resendAfterSeconds: 60 });
      const { res, state } = makeResponse();

      await controller.sendRegistrationOtp({ email: "new.trader@example.com" }, res);

      expect(notificationService.sendRegistrationOtp).toHaveBeenCalledWith("new.trader@example.com", "123456", 10);
      expect(state.status).toBe(200);
      expect(state.body).toEqual({
        message: "A verification code has been sent to your email.",
        expiresIn: 600,
        resendAfter: 60,
      });
      expect(JSON.stringify(state.body)).not.toContain("123456");
    });

    it("returns 429 during the resend cooldown without sending mail", async () => {
      emailOtpService.requestOtp.mockReturnValue({ ok: false, reason: "COOLDOWN", retryAfterSeconds: 42 });
      const { res, state } = makeResponse();

      await controller.sendRegistrationOtp({ email: "new.trader@example.com" }, res);

      expect(state.status).toBe(429);
      expect(state.body.errorCode).toBe("OTP-429");
      expect(notificationService.sendRegistrationOtp).not.toHaveBeenCalled();
    });

    it("returns 503 and cancels the code when the email cannot be sent", async () => {
      emailOtpService.requestOtp.mockReturnValue({ ok: true, otp: "123456", expiresInSeconds: 600, resendAfterSeconds: 60 });
      notificationService.sendRegistrationOtp.mockResolvedValue(false);
      const { res, state } = makeResponse();

      await controller.sendRegistrationOtp({ email: "new.trader@example.com" }, res);

      expect(state.status).toBe(503);
      expect(state.body.errorCode).toBe("OTP-503");
      expect(emailOtpService.cancelOtp).toHaveBeenCalledWith("new.trader@example.com");
    });
  });

  describe("verifyRegistrationOtp", () => {
    it("returns a verification token for the right code", async () => {
      emailOtpService.verifyOtp.mockReturnValue({ ok: true, verificationToken: "tok", expiresInSeconds: 1800 });
      const { res, state } = makeResponse();

      await controller.verifyRegistrationOtp({ email: "new.trader@example.com", otp: "123456" }, res);

      expect(state).toEqual({ status: 200, body: { verificationToken: "tok", expiresIn: 1800 } });
    });

    it.each([
      [{ ok: false, reason: "INVALID", attemptsRemaining: 2 }, 400, "OTP-400"],
      [{ ok: false, reason: "EXPIRED" }, 410, "OTP-410"],
      [{ ok: false, reason: "TOO_MANY_ATTEMPTS" }, 429, "OTP-429"],
      [{ ok: false, reason: "NOT_REQUESTED" }, 404, "OTP-404"],
    ])("maps %o to %i %s", async (result, status, errorCode) => {
      emailOtpService.verifyOtp.mockReturnValue(result);
      const { res, state } = makeResponse();

      await controller.verifyRegistrationOtp({ email: "new.trader@example.com", otp: "000000" }, res);

      expect(state.status).toBe(status);
      expect(state.body.errorCode).toBe(errorCode);
    });
  });

  describe("forgotPassword", () => {
    const GENERIC_BODY = {
      message: "If an account with that username exists, a verification code has been sent to its registered email address.",
      expiresIn: 600,
      resendAfter: 60,
    };

    it("emails a reset code to the registered address of a known user", async () => {
      userRepository.findByUsername.mockResolvedValue(user);
      emailOtpService.requestOtp.mockReturnValue({ ok: true, otp: "654321", expiresInSeconds: 600, resendAfterSeconds: 60 });
      const { res, state } = makeResponse();

      await controller.forgotPassword({ username: user.userName }, res);

      expect(emailOtpService.requestOtp).toHaveBeenCalledWith(`password-reset:${USER_ID}`);
      expect(notificationService.sendPasswordResetOtp).toHaveBeenCalledWith(USER_ID, user.email, user.userName, "654321", 10);
      expect(state).toEqual({ status: 200, body: GENERIC_BODY });
    });

    it("answers an unknown username exactly like a known one, without sending mail", async () => {
      userRepository.findByUsername.mockResolvedValue(null);
      const { res, state } = makeResponse();

      await controller.forgotPassword({ username: "nobody" }, res);

      expect(state).toEqual({ status: 200, body: GENERIC_BODY });
      expect(emailOtpService.requestOtp).not.toHaveBeenCalled();
      expect(notificationService.sendPasswordResetOtp).not.toHaveBeenCalled();
    });

    it("lifts the cooldown when the reset email could not be sent", async () => {
      userRepository.findByUsername.mockResolvedValue(user);
      emailOtpService.requestOtp.mockReturnValue({ ok: true, otp: "654321", expiresInSeconds: 600, resendAfterSeconds: 60 });
      notificationService.sendPasswordResetOtp.mockResolvedValue(false);
      const { res } = makeResponse();

      await controller.forgotPassword({ username: user.userName }, res);
      await new Promise((resolve) => setImmediate(resolve));

      expect(emailOtpService.cancelOtp).toHaveBeenCalledWith(`password-reset:${USER_ID}`);
    });
  });

  describe("verifyPasswordResetOtp", () => {
    it("checks the code under the user's reset key and returns a token", async () => {
      userRepository.findByUsername.mockResolvedValue(user);
      emailOtpService.verifyOtp.mockReturnValue({ ok: true, verificationToken: "reset-tok", expiresInSeconds: 1800 });
      const { res, state } = makeResponse();

      await controller.verifyPasswordResetOtp({ username: user.userName, otp: "654321" }, res);

      expect(emailOtpService.verifyOtp).toHaveBeenCalledWith(`password-reset:${USER_ID}`, "654321");
      expect(state).toEqual({ status: 200, body: { verificationToken: "reset-tok", expiresIn: 1800 } });
    });

    it("returns 404 for an unknown username", async () => {
      userRepository.findByUsername.mockResolvedValue(null);
      const { res, state } = makeResponse();

      await controller.verifyPasswordResetOtp({ username: "nobody", otp: "654321" }, res);

      expect(state.status).toBe(404);
      expect(state.body.errorCode).toBe("OTP-404");
    });

    it("returns 400 with remaining attempts for a wrong code", async () => {
      userRepository.findByUsername.mockResolvedValue(user);
      emailOtpService.verifyOtp.mockReturnValue({ ok: false, reason: "INVALID", attemptsRemaining: 1 });
      const { res, state } = makeResponse();

      await controller.verifyPasswordResetOtp({ username: user.userName, otp: "000000" }, res);

      expect(state).toEqual({
        status: 400,
        body: { errorCode: "OTP-400", message: "Incorrect verification code. 1 attempt remaining." },
      });
    });
  });

  describe("resetPassword", () => {
    const resetRequest = { username: "alice.trader", resetToken: "reset-tok", newPassword: "a brand new long password" };

    it("changes the password, burns the token, signs out every session and emails the user", async () => {
      userRepository.findByUsername.mockResolvedValue(user);
      passwordService.verifyPassword.mockResolvedValue(false);
      passwordService.hashPassword.mockResolvedValue("new-hash");
      const { res, state } = makeResponse();

      await controller.resetPassword(resetRequest, res);

      expect(emailOtpService.isVerified).toHaveBeenCalledWith(`password-reset:${USER_ID}`, "reset-tok");
      expect(userRepository.updatePassword).toHaveBeenCalledWith(USER_ID, "new-hash");
      expect(emailOtpService.consume).toHaveBeenCalledWith(`password-reset:${USER_ID}`);
      expect(refreshTokenService.revokeAllRefreshTokensForUser).toHaveBeenCalledWith(USER_ID);
      expect(throttleService.resetThrottle).toHaveBeenCalledWith(user.userName);
      expect(notificationService.sendPasswordChanged).toHaveBeenCalledWith(USER_ID, user.email, user.userName);
      expect(state).toEqual({
        status: 200,
        body: { message: "Your password has been changed. Sign in with your new password." },
      });
    });

    it("returns 403 and changes nothing for an invalid reset token", async () => {
      userRepository.findByUsername.mockResolvedValue(user);
      emailOtpService.isVerified.mockReturnValue(false);
      const { res, state } = makeResponse();

      await controller.resetPassword(resetRequest, res);

      expect(state.status).toBe(403);
      expect(state.body.errorCode).toBe("OTP-403");
      expect(userRepository.updatePassword).not.toHaveBeenCalled();
    });

    it("returns 403 for an unknown username", async () => {
      userRepository.findByUsername.mockResolvedValue(null);
      const { res, state } = makeResponse();

      await controller.resetPassword(resetRequest, res);

      expect(state.status).toBe(403);
      expect(userRepository.updatePassword).not.toHaveBeenCalled();
    });

    it("refuses to reuse the current password and keeps the token", async () => {
      userRepository.findByUsername.mockResolvedValue(user);
      passwordService.verifyPassword.mockResolvedValue(true);
      const { res, state } = makeResponse();

      await controller.resetPassword(resetRequest, res);

      expect(state).toEqual({
        status: 422,
        body: { errorCode: "VAL-422", message: "Your new password must be different from your current password." },
      });
      expect(userRepository.updatePassword).not.toHaveBeenCalled();
      expect(emailOtpService.consume).not.toHaveBeenCalled();
    });
  });

  describe("register", () => {
    it("returns 403 and creates nothing when the email has not been verified", async () => {
      emailOtpService.isVerified.mockReturnValue(false);
      const { res, state } = makeResponse();

      await controller.register(registerRequest({ emailVerificationToken: "bogus" }), res);

      expect(state).toEqual({
        status: 403,
        body: {
          errorCode: "OTP-403",
          message: "Email not verified. Verify the code sent to your email before registering.",
        },
      });
      expect(emailOtpService.isVerified).toHaveBeenCalledWith("new.trader@example.com", "bogus");
      expect(userRepository.isUsernameTaken).not.toHaveBeenCalled();
      expect(userRepository.create).not.toHaveBeenCalled();
    });

    it("consumes the verification token only after a successful registration", async () => {
      userRepository.isUsernameTaken.mockResolvedValue(false);
      passwordService.hashPassword.mockResolvedValue("hashed-password");
      userRepository.create.mockResolvedValue(user);
      accountProvisioningEventService.publishUserRegistered.mockResolvedValue(undefined);
      const { res, state } = makeResponse();

      await controller.register(registerRequest(), res);

      expect(state.status).toBe(201);
      expect(emailOtpService.consume).toHaveBeenCalledWith("new.trader@example.com");
    });

    it("keeps the verification token when the username is taken", async () => {
      userRepository.isUsernameTaken.mockResolvedValue(true);
      const { res } = makeResponse();

      await controller.register(registerRequest(), res);

      expect(emailOtpService.consume).not.toHaveBeenCalled();
    });

    it("creates auth user and publishes account provisioning event, ignoring self-declared roles", async () => {
      userRepository.isUsernameTaken.mockResolvedValue(false);
      passwordService.hashPassword.mockResolvedValue("hashed-password");
      userRepository.create.mockResolvedValue(user);
      accountProvisioningEventService.publishUserRegistered.mockResolvedValue(undefined);
      const { res, state } = makeResponse();

      await controller.register(registerRequest({ roles: [Role.ADMIN] }), res);

      expect(state).toEqual({
        status: 201,
        body: {
          id: USER_ID,
          username: user.userName,
          roles: [Role.CUSTOMER],
        },
      });
      expect(userRepository.isUsernameTaken).toHaveBeenCalledWith("new.trader");
      expect(passwordService.hashPassword).toHaveBeenCalledWith("correct horse battery staple");
      expect(userRepository.create).toHaveBeenCalledWith({
        userName: "new.trader",
        passwordHash: "hashed-password",
        email: "new.trader@example.com",
        phone: "+919900112233",
        firstName: "New",
        lastName: "Trader",
        status: "PENDING",
      });
      expect(userRepository.assignRole).toHaveBeenCalledWith(USER_ID, Role.CUSTOMER);
      expect(accountProvisioningEventService.publishUserRegistered).toHaveBeenCalledWith(USER_ID, user.userName);
      expect(tradeApiClient.createAccount).not.toHaveBeenCalled();
      expect(notificationService.sendUserRegistered).toHaveBeenCalledWith(
        USER_ID,
        "new.trader@example.com",
        user.userName,
      );
    });

    it("does not send a registration email when registration fails", async () => {
      userRepository.isUsernameTaken.mockResolvedValue(false);
      passwordService.hashPassword.mockResolvedValue("hashed-password");
      userRepository.create.mockResolvedValue(user);
      accountProvisioningEventService.publishUserRegistered.mockRejectedValue(new Error("kafka down"));
      const { res, state } = makeResponse();

      await controller.register(registerRequest(), res);

      expect(state.status).toBe(422);
      expect(userRepository.deleteById).toHaveBeenCalledWith(USER_ID);
      expect(notificationService.sendUserRegistered).not.toHaveBeenCalled();
    });

    it("defaults omitted roles to CUSTOMER", async () => {
      userRepository.isUsernameTaken.mockResolvedValue(false);
      passwordService.hashPassword.mockResolvedValue("hashed-password");
      userRepository.create.mockResolvedValue(user);
      accountProvisioningEventService.publishUserRegistered.mockResolvedValue(undefined);
      const { res, state } = makeResponse();

      await controller.register(registerRequest(), res);

      expect(state.status).toBe(201);
      expect(state.body.roles).toEqual([Role.CUSTOMER]);
    });

    it("returns 409 and does not hash or create anything for a taken username", async () => {
      userRepository.isUsernameTaken.mockResolvedValue(true);
      const { res, state } = makeResponse();

      await controller.register(registerRequest(), res);

      expect(state).toEqual({
        status: 409,
        body: {
          errorCode: "AUTH-409",
          message: "Username already registered",
        },
      });
      expect(passwordService.hashPassword).not.toHaveBeenCalled();
      expect(userRepository.create).not.toHaveBeenCalled();
      expect(tradeApiClient.createAccount).not.toHaveBeenCalled();
    });

    it("maps repository creation failures to 422", async () => {
      const createError = new Error("db unavailable");
      userRepository.isUsernameTaken.mockResolvedValue(false);
      passwordService.hashPassword.mockResolvedValue("hashed-password");
      userRepository.create.mockRejectedValue(createError);
      const { res, state } = makeResponse();

      await controller.register(registerRequest(), res);

      expect(state).toEqual({
        status: 422,
        body: {
          errorCode: "VAL-422",
          message: "Invalid input",
        },
      });
      expect(tradeApiClient.createAccount).not.toHaveBeenCalled();
    });

    it("deletes created user when event publishing fails", async () => {
      userRepository.isUsernameTaken.mockResolvedValue(false);
      passwordService.hashPassword.mockResolvedValue("hashed-password");
      userRepository.create.mockResolvedValue(user);
      accountProvisioningEventService.publishUserRegistered.mockRejectedValue(new Error("kafka unavailable"));
      const { res, state } = makeResponse();

      await controller.register(registerRequest(), res);

      expect(state).toEqual({
        status: 422,
        body: {
          errorCode: "VAL-422",
          message: "Invalid input",
        },
      });
      expect(userRepository.deleteById).toHaveBeenCalledWith(USER_ID);
      expect(tradeApiClient.createAccount).not.toHaveBeenCalled();
    });

    it("maps a hashing failure to 422 without attempting database creation", async () => {
      const hashError = new Error("hash failure");
      userRepository.isUsernameTaken.mockResolvedValue(false);
      passwordService.hashPassword.mockRejectedValue(hashError);
      const { res, state } = makeResponse();

      await controller.register(registerRequest(), res);

      expect(state).toEqual({
        status: 422,
        body: {
          errorCode: "VAL-422",
          message: "Invalid input",
        },
      });
      expect(userRepository.create).not.toHaveBeenCalled();
      expect(tradeApiClient.createAccount).not.toHaveBeenCalled();
    });
  });

  describe("login", () => {
    beforeEach(() => {
      userRepository.findByUsername.mockResolvedValue(user);
      userRepository.getRoles.mockResolvedValue([Role.CUSTOMER]);
      passwordService.verifyPassword.mockResolvedValue(true);
      tradeApiClient.getAccountByUserId.mockResolvedValue(account);
    });

    it("returns an access/refresh token pair for valid credentials", async () => {
      tokenService.createAccessToken.mockReturnValue("access-token");
      refreshTokenService.generateRefreshToken.mockReturnValue("refresh-token");
      refreshTokenService.hashRefreshToken.mockResolvedValue("hashed-refresh-token");
      refreshTokenService.storeRefreshToken.mockResolvedValue({ id: 1, expiresAt: new Date() });
      const { res, state } = makeResponse();

      await controller.login(loginRequest(), {} as any, res);

      expect(state).toEqual({
        status: 200,
        body: {
          accessToken: "access-token",
          refreshToken: "refresh-token",
          tokenType: "Bearer",
          expiresIn: 900,
        },
      });
      expect(res.cookie).toHaveBeenCalledWith("refresh_token", "refresh-token", {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/auth",
        maxAge: 604800 * 1000,
      });
      expect(userRepository.findByUsername).toHaveBeenCalledWith(user.userName);
      expect(passwordService.verifyPassword).toHaveBeenCalledWith(
        "correct horse battery staple",
        user.passwordHash,
      );
      expect(tradeApiClient.getAccountByUserId).toHaveBeenCalledWith(USER_ID);
      expect(tokenService.createAccessToken).toHaveBeenCalledWith(USER_ID, ACCOUNT_ID, [Role.CUSTOMER]);
      expect(refreshTokenService.hashRefreshToken).toHaveBeenCalledWith("refresh-token");
      expect(refreshTokenService.storeRefreshToken).toHaveBeenCalledWith(
        USER_ID,
        "hashed-refresh-token",
        "refresh-token",
      );
      expect(refreshTokenService.revokeAllRefreshTokensForUser).toHaveBeenCalledWith(USER_ID);
      expect(throttleService.resetThrottle).toHaveBeenCalledWith(user.userName);
    });

    it("returns 401 immediately for a throttled username", async () => {
      throttleService.isThrottled.mockReturnValue(true);
      const { res, state } = makeResponse();

      await controller.login(loginRequest(), {} as any, res);

      expect(state).toEqual({ status: 401, body: errorResponse });
      expect(userRepository.findByUsername).not.toHaveBeenCalled();
      expect(passwordService.verifyPassword).not.toHaveBeenCalled();
    });

    it("uses the dummy hash and records a failure for an unknown user", async () => {
      userRepository.findByUsername.mockResolvedValue(null);
      passwordService.getDummyHash.mockResolvedValue("dummy-hash");
      passwordService.verifyPassword.mockResolvedValue(false);
      const { res, state } = makeResponse();

      await controller.login(loginRequest(), {} as any, res);

      expect(state).toEqual({ status: 401, body: errorResponse });
      expect(passwordService.getDummyHash).toHaveBeenCalledTimes(1);
      expect(passwordService.verifyPassword).toHaveBeenCalledWith(
        "correct horse battery staple",
        "dummy-hash",
      );
      expect(throttleService.recordFailedAttempt).toHaveBeenCalledWith(user.userName);
      expect(tradeApiClient.getAccountByUserId).not.toHaveBeenCalled();
    });

    it("returns 401 and records a failure for a wrong password", async () => {
      passwordService.verifyPassword.mockResolvedValue(false);
      const { res, state } = makeResponse();

      await controller.login(loginRequest(), {} as any, res);

      expect(state).toEqual({ status: 401, body: errorResponse });
      expect(throttleService.recordFailedAttempt).toHaveBeenCalledWith(user.userName);
      expect(tradeApiClient.getAccountByUserId).not.toHaveBeenCalled();
      expect(tokenService.createAccessToken).not.toHaveBeenCalled();
    });

    it("returns 401 and records a failure when the user has no linked account", async () => {
      tradeApiClient.getAccountByUserId.mockResolvedValue(null);
      const { res, state } = makeResponse();

      await controller.login(loginRequest(), {} as any, res);

      expect(state).toEqual({ status: 401, body: errorResponse });
      expect(throttleService.recordFailedAttempt).toHaveBeenCalledWith(user.userName);
      expect(tokenService.createAccessToken).not.toHaveBeenCalled();
      expect(refreshTokenService.storeRefreshToken).not.toHaveBeenCalled();
    });

    it("rejects a suspended account without issuing or rotating tokens", async () => {
      tradeApiClient.getAccountByUserId.mockResolvedValue({
        ...account,
        accountStatus: "SUSPENDED",
      });
      const { res, state } = makeResponse();

      await controller.login(loginRequest(), {} as any, res);

      expect(state).toEqual({
        status: 403,
        body: {
          errorCode: "ACC-403",
          message: "You are blocked from using this service.",
        },
      });
      expect(tokenService.createAccessToken).not.toHaveBeenCalled();
      expect(refreshTokenService.revokeAllRefreshTokensForUser).not.toHaveBeenCalled();
      expect(refreshTokenService.generateRefreshToken).not.toHaveBeenCalled();
      expect(refreshTokenService.hashRefreshToken).not.toHaveBeenCalled();
      expect(refreshTokenService.storeRefreshToken).not.toHaveBeenCalled();
      expect(throttleService.resetThrottle).not.toHaveBeenCalled();
    });

    it("maps unexpected dependency errors to the uniform 401 response", async () => {
      const lookupError = new Error("database unavailable");
      userRepository.findByUsername.mockRejectedValue(lookupError);
      const { res, state } = makeResponse();

      await controller.login(loginRequest(), {} as any, res);

      expect(state).toEqual({ status: 401, body: errorResponse });
      expect(throttleService.recordFailedAttempt).not.toHaveBeenCalled();
    });
  });

  describe("admin register/login", () => {
    beforeEach(() => {
      userRepository.findByUsername.mockResolvedValue(user);
      passwordService.verifyPassword.mockResolvedValue(true);
      userRepository.getRoles.mockResolvedValue([Role.ADMIN]);
      userRepository.hasRole.mockResolvedValue(true);
    });

    it("registers an admin user", async () => {
      userRepository.isUsernameTaken.mockResolvedValue(false);
      passwordService.hashPassword.mockResolvedValue("hashed-password");
      userRepository.create.mockResolvedValue(user);
      const { res, state } = makeResponse();

      await controller.registerAdmin(registerRequest(), res);

      expect(state).toEqual({
        status: 201,
        body: {
          id: USER_ID,
          username: user.userName,
          accountId: 0,
          roles: [Role.ADMIN],
        },
      });
      expect(userRepository.assignRole).toHaveBeenCalledWith(USER_ID, Role.ADMIN);
      expect(tradeApiClient.createAccount).not.toHaveBeenCalled();
    });

    it("rolls back admin user creation if role assignment fails", async () => {
      userRepository.isUsernameTaken.mockResolvedValue(false);
      passwordService.hashPassword.mockResolvedValue("hashed-password");
      userRepository.create.mockResolvedValue(user);
      userRepository.assignRole.mockRejectedValue(new Error("role assign failed"));
      const { res, state } = makeResponse();

      await controller.registerAdmin(registerRequest(), res);

      expect(state).toEqual({
        status: 422,
        body: {
          errorCode: "VAL-422",
          message: "Invalid input",
        },
      });
      expect(userRepository.deleteById).toHaveBeenCalledWith(USER_ID);
    });

    it("logs in an admin and issues tokens without trading account lookup", async () => {
      tokenService.createAccessToken.mockReturnValue("admin-access-token");
      refreshTokenService.generateRefreshToken.mockReturnValue("admin-refresh-token");
      refreshTokenService.hashRefreshToken.mockResolvedValue("hashed-admin-refresh-token");
      const { res, state } = makeResponse();

      await controller.loginAdmin(loginRequest(), res);

      expect(state).toEqual({
        status: 200,
        body: {
          accessToken: "admin-access-token",
          refreshToken: "admin-refresh-token",
          tokenType: "Bearer",
          expiresIn: 900,
        },
      });
      expect(tradeApiClient.getAccountByUserId).not.toHaveBeenCalled();
      expect(userRepository.hasRole).toHaveBeenCalledWith(USER_ID, Role.ADMIN);
      expect(tokenService.createAccessToken).toHaveBeenCalledWith(USER_ID, 0, [Role.ADMIN]);
    });

    it("rejects admin login if user lacks ADMIN role", async () => {
      userRepository.hasRole.mockResolvedValue(false);
      const { res, state } = makeResponse();

      await controller.loginAdmin(loginRequest(), res);

      expect(state).toEqual({ status: 401, body: errorResponse });
      expect(refreshTokenService.storeRefreshToken).not.toHaveBeenCalled();
      expect(throttleService.recordFailedAttempt).toHaveBeenCalledWith(user.userName);
    });
  });

  describe("getMe", () => {
    it("returns 401 when the guard supplied no claims", async () => {
      const { res, state } = makeResponse();

      await controller.getMe(undefined, res);

      expect(state).toEqual({ status: 401, body: errorResponse });
      expect(userRepository.findByUserId).not.toHaveBeenCalled();
    });

    it("returns the profile from verified claims and the stored username", async () => {
      userRepository.findByUserId.mockResolvedValue(user);
      const claims = {
        sub: USER_ID,
        accountId: ACCOUNT_ID,
        roles: [Role.CUSTOMER],
        iat: 1,
        exp: 2,
        iss: "auth-service",
      };
      const { res, state } = makeResponse();

      await controller.getMe(claims, res);

      expect(state).toEqual({
        status: 200,
        body: {
          id: USER_ID,
          username: user.userName,
          accountId: ACCOUNT_ID,
          roles: [Role.CUSTOMER],
        },
      });
      expect(userRepository.findByUserId).toHaveBeenCalledWith(USER_ID);
    });

    it("preserves claims and returns an empty username when the user row is missing", async () => {
      userRepository.findByUserId.mockResolvedValue(null);
      const claims = {
        sub: USER_ID,
        accountId: ACCOUNT_ID,
        roles: [Role.CUSTOMER],
        iat: 1,
        exp: 2,
        iss: "auth-service",
      };
      const { res, state } = makeResponse();

      await controller.getMe(claims, res);

      // This documents the current fallback behavior for a token whose user
      // was removed between token issuance and the /me request.
      expect(state).toEqual({
        status: 200,
        body: {
          id: USER_ID,
          username: "",
          accountId: ACCOUNT_ID,
          roles: [Role.CUSTOMER],
        },
      });
    });

    it("maps a profile lookup failure to 401", async () => {
      const lookupError = new Error("database unavailable");
      userRepository.findByUserId.mockRejectedValue(lookupError);
      const { res, state } = makeResponse();

      await controller.getMe(
        {
          sub: USER_ID,
          accountId: ACCOUNT_ID,
          roles: [Role.CUSTOMER],
        },
        res,
      );

      expect(state).toEqual({ status: 401, body: errorResponse });
    });
  });

  describe("logout", () => {
    it("revokes the supplied refresh token and returns 204", async () => {
      refreshTokenService.revokeRefreshToken.mockResolvedValue(1);
      const { res, state } = makeResponse();
      (res as any).send = jest.fn(() => {
        state.body = undefined;
        return res;
      });

      await controller.logout({ refreshToken: "refresh-token" }, {} as any, res);

      expect(refreshTokenService.revokeRefreshToken).toHaveBeenCalledWith("refresh-token");
      expect(state.status).toBe(204);
      expect(res.clearCookie).toHaveBeenCalledWith("refresh_token", expect.objectContaining({ path: "/auth" }));
    });

    it("revokes the token from the HttpOnly cookie when the body is empty", async () => {
      refreshTokenService.revokeRefreshToken.mockResolvedValue(1);
      const { res, state } = makeResponse();
      (res as any).send = jest.fn(() => res);

      await controller.logout({}, { headers: { cookie: "refresh_token=cookie-token" } } as any, res);

      expect(refreshTokenService.revokeRefreshToken).toHaveBeenCalledWith("cookie-token");
      expect(state.status).toBe(204);
      expect(res.clearCookie).toHaveBeenCalled();
    });

    it("maps revocation failures to 422", async () => {
      refreshTokenService.revokeRefreshToken.mockRejectedValue(new Error("db down"));
      const { res, state } = makeResponse();
      (res as any).send = jest.fn(() => res);

      await controller.logout({ refreshToken: "refresh-token" }, {} as any, res);

      expect(state).toEqual({
        status: 422,
        body: {
          errorCode: "VAL-422",
          message: "Invalid input",
        },
      });
    });
  });
});
