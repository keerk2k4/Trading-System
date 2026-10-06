import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  Req,
  Res,
} from "@nestjs/common";
import { CookieOptions, Request as ExpressRequest, Response } from "express";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from "@nestjs/swagger";
import { RegisterRequest } from "../dtos/RegisterRequest";
import { LoginRequest } from "../dtos/LoginRequest";
import { RefreshRequest } from "../dtos/RefreshRequest";
import { UserResponse } from "../dtos/UserResponse";
import { TokenResponse } from "../dtos/TokenResponse";
import { ErrorResponse } from "../dtos/ErrorResponse";
import { BearerGuard } from "../guards/BearerGuard";
import { CurrentUser } from "../guards/CurrentUser";
import { TokenService } from "../services/TokenService";
import { PasswordService } from "../services/PasswordService";
import { RefreshTokenService } from "../services/RefreshTokenService";
import { TradeApiClient } from "../services/TradeApiClient";
import { PHONE_UNIQUE_INDEX, UserRepository } from "../repositories/UserRepository";
import { isUniqueViolation } from "../database/unique-violation";
import { ThrottleService } from "../services/ThrottleService";
import { AccountProvisioningEventService } from "../services/AccountProvisioningEventService";
import { NotificationService } from "../services/NotificationService";
import { EmailOtpService, OtpVerifyResult, passwordResetKey } from "../services/EmailOtpService";
import {
  ForgotPasswordRequest,
  MessageResponse,
  ResetPasswordRequest,
  VerifyPasswordResetOtpRequest,
} from "../dtos/PasswordResetRequests";
import { SendOtpRequest } from "../dtos/SendOtpRequest";
import { VerifyOtpRequest } from "../dtos/VerifyOtpRequest";
import { SendOtpResponse, VerifyOtpResponse } from "../dtos/OtpResponse";

// The refresh token travels in an HttpOnly cookie so page scripts (and any
// injected XSS payload) can never read it. Scoped to /auth so the browser
// only sends it to /auth/refresh and /auth/logout, never to /kyc or the
// Trade API. The body still carries it during the transition period.
export const REFRESH_COOKIE_NAME = "refresh_token";

const PHONE_TAKEN: ErrorResponse = {
  errorCode: "PHONE-409",
  message: "This phone number is already registered to another account.",
};
const REFRESH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "strict",
  path: "/auth",
};

function readCookie(req: ExpressRequest, name: string): string | undefined {
  const header = req.headers?.cookie;
  if (!header) {
    return undefined;
  }
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator !== -1 && part.slice(0, separator).trim() === name) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

@Controller("auth")
export class AuthController {
  constructor(
    private tokenService: TokenService,
    private passwordService: PasswordService,
    private refreshTokenService: RefreshTokenService,
    private tradeApiClient: TradeApiClient,
    private userRepository: UserRepository,
    private throttleService: ThrottleService,
    private accountProvisioningEventService: AccountProvisioningEventService,
    private notificationService: NotificationService,
    private emailOtpService: EmailOtpService,
  ) { }

  private setRefreshCookie(res: Response, refreshToken: string): void {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      ...REFRESH_COOKIE_OPTIONS,
      maxAge: this.tokenService.getRefreshTokenExpiry() * 1000,
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);
  }

  // The cookie wins; the body is the transition-period fallback for clients
  // that still send { refreshToken }.
  private presentedRefreshToken(req: ExpressRequest, body: RefreshRequest | undefined): string | undefined {
    return readCookie(req, REFRESH_COOKIE_NAME) ?? body?.refreshToken;
  }

  @Post("register/otp")
  @ApiTags("Auth")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Email a one-time code to verify the address before registering" })
  @ApiResponse({ status: 200, description: "Code sent.", type: SendOtpResponse })
  @ApiResponse({ status: 429, description: "A code was sent too recently.", type: ErrorResponse })
  @ApiResponse({ status: 503, description: "The email could not be sent.", type: ErrorResponse })
  async sendRegistrationOtp(@Body() sendOtpRequest: SendOtpRequest, @Res() res: Response): Promise<void> {
    try {
      const result = this.emailOtpService.requestOtp(sendOtpRequest.email);
      if (!result.ok) {
        const error: ErrorResponse = {
          errorCode: "OTP-429",
          message: `Please wait ${result.retryAfterSeconds} seconds before requesting a new code.`,
        };
        res.status(429).json(error);
        return;
      }

      const sent = await this.notificationService.sendRegistrationOtp(
        sendOtpRequest.email,
        result.otp,
        Math.round(result.expiresInSeconds / 60),
      );
      if (!sent) {
        this.emailOtpService.cancelOtp(sendOtpRequest.email);
        const error: ErrorResponse = {
          errorCode: "OTP-503",
          message: "We could not send the verification code. Check the email address and try again.",
        };
        res.status(503).json(error);
        return;
      }

      const response: SendOtpResponse = {
        message: "A verification code has been sent to your email.",
        expiresIn: result.expiresInSeconds,
        resendAfter: result.resendAfterSeconds,
      };
      res.status(200).json(response);
    } catch (error) {
      console.error("Send registration OTP error:", error);
      const response: ErrorResponse = {
        errorCode: "OTP-503",
        message: "We could not send the verification code. Please try again.",
      };
      res.status(503).json(response);
    }
  }

  @Post("register/otp/verify")
  @ApiTags("Auth")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Check the emailed code and receive an email verification token" })
  @ApiResponse({ status: 200, description: "Email verified.", type: VerifyOtpResponse })
  @ApiResponse({ status: 400, description: "The code is wrong.", type: ErrorResponse })
  @ApiResponse({ status: 404, description: "No code was requested for this email.", type: ErrorResponse })
  @ApiResponse({ status: 410, description: "The code has expired.", type: ErrorResponse })
  @ApiResponse({ status: 429, description: "Too many wrong attempts.", type: ErrorResponse })
  async verifyRegistrationOtp(@Body() verifyOtpRequest: VerifyOtpRequest, @Res() res: Response): Promise<void> {
    const result = this.emailOtpService.verifyOtp(verifyOtpRequest.email, verifyOtpRequest.otp);
    this.sendOtpVerifyResult(res, result);
  }

  @Post("forgot-password")
  @ApiTags("Auth")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Email a password reset code to the user's registered email address" })
  @ApiResponse({ status: 200, description: "Always returned, whether or not the username exists.", type: SendOtpResponse })
  async forgotPassword(@Body() forgotPasswordRequest: ForgotPasswordRequest, @Res() res: Response): Promise<void> {
    try {
      const user = await this.userRepository.findByUsername(forgotPasswordRequest.username);
      if (user) {
        const key = passwordResetKey(user.userId);
        const result = this.emailOtpService.requestOtp(key);
        if (result.ok) {
          // Not awaited, so an existing username does not answer measurably
          // slower than an unknown one. A failed send lifts the cooldown.
          void this.notificationService
            .sendPasswordResetOtp(user.userId, user.email, user.userName, result.otp, Math.round(result.expiresInSeconds / 60))
            .then((sent) => {
              if (!sent) {
                this.emailOtpService.cancelOtp(key);
              }
            });
        }
      }
    } catch (error) {
      console.error("Forgot password error:", error);
    }

    // Identical for known and unknown usernames, so the endpoint cannot be
    // used to discover which accounts exist.
    const settings = this.emailOtpService.getSettings();
    const response: SendOtpResponse = {
      message: "If an account with that username exists, a verification code has been sent to its registered email address.",
      expiresIn: settings.expiresInSeconds,
      resendAfter: settings.resendAfterSeconds,
    };
    res.status(200).json(response);
  }

  @Post("forgot-password/verify")
  @ApiTags("Auth")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Check the password reset code and receive a reset token" })
  @ApiResponse({ status: 200, description: "Code accepted.", type: VerifyOtpResponse })
  @ApiResponse({ status: 400, description: "The code is wrong.", type: ErrorResponse })
  @ApiResponse({ status: 404, description: "No code was requested.", type: ErrorResponse })
  @ApiResponse({ status: 410, description: "The code has expired.", type: ErrorResponse })
  @ApiResponse({ status: 429, description: "Too many wrong attempts.", type: ErrorResponse })
  async verifyPasswordResetOtp(@Body() request: VerifyPasswordResetOtpRequest, @Res() res: Response): Promise<void> {
    try {
      const user = await this.userRepository.findByUsername(request.username);
      const result: OtpVerifyResult = user
        ? this.emailOtpService.verifyOtp(passwordResetKey(user.userId), request.otp)
        : { ok: false, reason: "NOT_REQUESTED" };
      this.sendOtpVerifyResult(res, result);
    } catch (error) {
      console.error("Verify password reset OTP error:", error);
      const response: ErrorResponse = { errorCode: "OTP-503", message: "The code could not be verified. Please try again." };
      res.status(503).json(response);
    }
  }

  @Post("reset-password")
  @ApiTags("Auth")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Set a new password using a reset token" })
  @ApiResponse({ status: 200, description: "Password changed.", type: MessageResponse })
  @ApiResponse({ status: 403, description: "The reset token is missing, wrong or expired.", type: ErrorResponse })
  @ApiResponse({ status: 422, description: "Invalid input", type: ErrorResponse })
  async resetPassword(@Body() request: ResetPasswordRequest, @Res() res: Response): Promise<void> {
    try {
      const user = await this.userRepository.findByUsername(request.username);
      const key = user ? passwordResetKey(user.userId) : null;
      if (!user || !key || !this.emailOtpService.isVerified(key, request.resetToken)) {
        const error: ErrorResponse = {
          errorCode: "OTP-403",
          message: "Your password reset session is invalid or has expired. Request a new code.",
        };
        res.status(403).json(error);
        return;
      }

      if (await this.passwordService.verifyPassword(request.newPassword, user.passwordHash)) {
        const error: ErrorResponse = {
          errorCode: "VAL-422",
          message: "Your new password must be different from your current password.",
        };
        res.status(422).json(error);
        return;
      }

      const passwordHash = await this.passwordService.hashPassword(request.newPassword);
      await this.userRepository.updatePassword(user.userId, passwordHash);
      this.emailOtpService.consume(key);
      // Anyone holding an old session (possibly whoever learned the old password) is signed out.
      await this.refreshTokenService.revokeAllRefreshTokensForUser(user.userId);
      this.throttleService.resetThrottle(user.userName);

      void this.notificationService.sendPasswordChanged(user.userId, user.email, user.userName);

      const response: MessageResponse = { message: "Your password has been changed. Sign in with your new password." };
      res.status(200).json(response);
    } catch (error) {
      console.error("Reset password error:", error);
      const response: ErrorResponse = {
        errorCode: "VAL-422",
        message: "Your password could not be changed. Please try again.",
      };
      res.status(422).json(response);
    }
  }

  private sendOtpVerifyResult(res: Response, result: OtpVerifyResult): void {
    if (result.ok) {
      const response: VerifyOtpResponse = {
        verificationToken: result.verificationToken,
        expiresIn: result.expiresInSeconds,
      };
      res.status(200).json(response);
      return;
    }

    let status: number;
    let error: ErrorResponse;
    switch (result.reason) {
      case "INVALID":
        status = 400;
        error = {
          errorCode: "OTP-400",
          message: `Incorrect verification code. ${result.attemptsRemaining} attempt${result.attemptsRemaining === 1 ? "" : "s"} remaining.`,
        };
        break;
      case "EXPIRED":
        status = 410;
        error = { errorCode: "OTP-410", message: "The verification code has expired. Request a new code." };
        break;
      case "TOO_MANY_ATTEMPTS":
        status = 429;
        error = { errorCode: "OTP-429", message: "Too many incorrect attempts. Request a new code." };
        break;
      default:
        status = 404;
        error = { errorCode: "OTP-404", message: "No verification code has been requested. Request a code first." };
    }
    res.status(status).json(error);
  }

  @Post("register")
  @ApiTags("Auth")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Register a user" })
  @ApiResponse({ status: 201, description: "User created.", type: UserResponse })
  @ApiResponse({ status: 403, description: "The email address has not been verified.", type: ErrorResponse })
  @ApiResponse({ status: 409, description: "The username (AUTH-409) or phone number (PHONE-409) is already taken.", type: ErrorResponse })
  @ApiResponse({ status: 422, description: "Invalid input", type: ErrorResponse })
  async register(@Body() registerRequest: RegisterRequest, @Res() res: Response): Promise<void> {
    let createdUserId: string | null = null;
    try {
      // Checked first so an unverified caller learns nothing about which usernames exist.
      if (!this.emailOtpService.isVerified(registerRequest.email, registerRequest.emailVerificationToken)) {
        const error: ErrorResponse = {
          errorCode: "OTP-403",
          message: "Email not verified. Verify the code sent to your email before registering.",
        };
        res.status(403).json(error);
        return;
      }

      const alreadyTaken = await this.userRepository.isUsernameTaken(registerRequest.username);
      if (alreadyTaken) {
        const error: ErrorResponse = {
          errorCode: "AUTH-409",
          message: "Username already registered",
        };
        res.status(409).json(error);
        return;
      }

      if (await this.userRepository.isPhoneTaken(registerRequest.phone)) {
        res.status(409).json(PHONE_TAKEN);
        return;
      }

      const passwordHash = await this.passwordService.hashPassword(registerRequest.password);

      const user = await this.userRepository.create({
        userName: registerRequest.username,
        passwordHash,
        email: registerRequest.email,
        phone: registerRequest.phone,
        firstName: registerRequest.firstName,
        lastName: registerRequest.lastName,
        status: "PENDING",
      });
      createdUserId = user.userId;
      await this.userRepository.assignRole(user.userId, "CUSTOMER");
      await this.accountProvisioningEventService.publishUserRegistered(user.userId, user.userName);
      this.emailOtpService.consume(registerRequest.email);

      // Fire and forget: a mail outage must not fail or roll back registration.
      void this.notificationService.sendUserRegistered(user.userId, registerRequest.email, user.userName);

      const response: UserResponse = {
        id: user.userId,
        username: user.userName,
        // Public registration must never accept a caller-declared role.
        // Administrative role assignment belongs on a separately protected path.
        roles: ["CUSTOMER"],
      };

      res.status(201).json(response);
    } catch (error) {
      if (createdUserId) {
        await this.userRepository.deleteById(createdUserId);
      }
      if (isUniqueViolation(error, PHONE_UNIQUE_INDEX)) {
        res.status(409).json(PHONE_TAKEN);
        return;
      }
      console.error("Register error:", error);
      const response: ErrorResponse = {
        errorCode: "VAL-422",
        message: "Invalid input",
      };
      res.status(422).json(response);
    }
  }

  @Post("admin/register")
  @ApiTags("Auth")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Register an admin user" })
  @ApiResponse({ status: 201, description: "Admin user created.", type: UserResponse })
  @ApiResponse({ status: 409, description: "The username (AUTH-409) or phone number (PHONE-409) is already taken.", type: ErrorResponse })
  @ApiResponse({ status: 422, description: "Invalid input", type: ErrorResponse })
  async registerAdmin(@Body() registerRequest: RegisterRequest, @Res() res: Response): Promise<void> {
    let createdUserId: string | null = null;
    try {
      const alreadyTaken = await this.userRepository.isUsernameTaken(registerRequest.username);
      if (alreadyTaken) {
        const error: ErrorResponse = {
          errorCode: "AUTH-409",
          message: "Username already registered",
        };
        res.status(409).json(error);
        return;
      }

      if (await this.userRepository.isPhoneTaken(registerRequest.phone)) {
        res.status(409).json(PHONE_TAKEN);
        return;
      }

      const passwordHash = await this.passwordService.hashPassword(registerRequest.password);

      const user = await this.userRepository.create({
        userName: registerRequest.username,
        passwordHash,
        email: registerRequest.email,
        phone: registerRequest.phone,
        firstName: registerRequest.firstName,
        lastName: registerRequest.lastName,
        status: "ACTIVE",
      });
      createdUserId = user.userId;
      await this.userRepository.assignRole(user.userId, "ADMIN");

      const response: UserResponse = {
        id: user.userId,
        username: user.userName,
        accountId: 0,
        roles: ["ADMIN"],
      };

      res.status(201).json(response);
    } catch (error) {
      if (createdUserId) {
        await this.userRepository.deleteById(createdUserId);
      }
      if (isUniqueViolation(error, PHONE_UNIQUE_INDEX)) {
        res.status(409).json(PHONE_TAKEN);
        return;
      }
      console.error("Admin register error:", error);
      const response: ErrorResponse = {
        errorCode: "VAL-422",
        message: "Invalid input",
      };
      res.status(422).json(response);
    }
  }

  @Post("login")
  @ApiTags("Auth")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Log in and receive tokens" })
  @ApiResponse({ status: 200, description: "Authenticated.", type: TokenResponse })
  @ApiResponse({ status: 401, description: "Unauthorised", type: ErrorResponse })
  @ApiResponse({ status: 422, description: "Invalid input", type: ErrorResponse })
  async login(@Body() loginRequest: LoginRequest, @Request() req: any, @Res() res: Response): Promise<void> {
    try {
      if (this.throttleService.isThrottled(loginRequest.username)) {
        const response: ErrorResponse = {
          errorCode: "AUTH-401",
          message: "Unauthorised",
        };
        console.log("Login throttled for username:", loginRequest.username);
        res.status(401).json(response);
        return;
      }

      const user = await this.userRepository.findByUsername(loginRequest.username);

      let passwordValid = false;
      if (user) {
        passwordValid = await this.passwordService.verifyPassword(loginRequest.password, user.passwordHash);
      } else {
        const dummyHash = await this.passwordService.getDummyHash();
        await this.passwordService.verifyPassword(loginRequest.password, dummyHash);
      }

      if (!user || !passwordValid) {        
        this.throttleService.recordFailedAttempt(loginRequest.username);

        const response: ErrorResponse = {
          errorCode: "AUTH-401",
          message: "Unauthorised",
        };
        console.log("Failed login attempt for username:", loginRequest.username);
        res.status(401).json(response);
        return;
      }
      
      const account = await this.tradeApiClient.getAccountByUserId(user.userId);
      if (!account) {
        this.throttleService.recordFailedAttempt(loginRequest.username);

        const response: ErrorResponse = {
          errorCode: "AUTH-401",
          message: "Unauthorised",
        };
        console.log("Failed login attempt due to missing trading account for username:", loginRequest.username);
        res.status(401).json(response);
        return;
      }

      // Do not issue or rotate any credentials for a non-active trading account.
      if (account.accountStatus?.trim().toUpperCase() == "SUSPENDED") {
        const response: ErrorResponse = {
          errorCode: "ACC-403",
          message: "You are blocked from using this service.",
        };
        console.log("Login attempt blocked due to suspended trading account for username:", loginRequest.username);
        res.status(403).json(response);
        return;
      }

      const accessToken = this.tokenService.createAccessToken(user.userId, account.accountId, ["CUSTOMER"]);

      await this.refreshTokenService.revokeAllRefreshTokensForUser(user.userId);
      const refreshToken = this.refreshTokenService.generateRefreshToken();
      const tokenHash = await this.refreshTokenService.hashRefreshToken(refreshToken);
      await this.refreshTokenService.storeRefreshToken(user.userId, tokenHash, refreshToken);
      
      this.throttleService.resetThrottle(loginRequest.username);

      const response: TokenResponse = {
        accessToken,
        refreshToken,
        tokenType: "Bearer",
        expiresIn: this.tokenService.getAccessTokenExpiry(),
      };

      this.setRefreshCookie(res, refreshToken);
      res.status(200).json(response);
    } catch (error) {
      console.error("Login error:", error);
      const response: ErrorResponse = {
        errorCode: "AUTH-401",
        message: "Unauthorised",
      };
      console.log("Login failed for username:", loginRequest.username);
      res.status(401).json(response);
    }
  }

  @Post("admin/login")
  @ApiTags("Auth")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Admin log in and receive tokens" })
  @ApiResponse({ status: 200, description: "Authenticated.", type: TokenResponse })
  @ApiResponse({ status: 401, description: "Unauthorised", type: ErrorResponse })
  @ApiResponse({ status: 422, description: "Invalid input", type: ErrorResponse })
  async loginAdmin(@Body() loginRequest: LoginRequest, @Res() res: Response): Promise<void> {
    try {
      if (this.throttleService.isThrottled(loginRequest.username)) {
        const response: ErrorResponse = {
          errorCode: "AUTH-401",
          message: "Unauthorised",
        };
        res.status(401).json(response);
        return;
      }

      const user = await this.userRepository.findByUsername(loginRequest.username);

      let passwordValid = false;
      if (user) {
        passwordValid = await this.passwordService.verifyPassword(loginRequest.password, user.passwordHash);
      } else {
        const dummyHash = await this.passwordService.getDummyHash();
        await this.passwordService.verifyPassword(loginRequest.password, dummyHash);
      }

      if (!user || !passwordValid) {
        this.throttleService.recordFailedAttempt(loginRequest.username);

        const response: ErrorResponse = {
          errorCode: "AUTH-401",
          message: "Unauthorised",
        };
        res.status(401).json(response);
        return;
      }

      const isAdmin = await this.userRepository.hasRole(user.userId, "ADMIN");
      if (!isAdmin) {
        this.throttleService.recordFailedAttempt(loginRequest.username);

        const response: ErrorResponse = {
          errorCode: "AUTH-401",
          message: "Unauthorised",
        };
        res.status(401).json(response);
        return;
      }

      const roles = await this.userRepository.getRoles(user.userId);
      const accessToken = this.tokenService.createAccessToken(user.userId, 0, roles.length > 0 ? roles : ["ADMIN"]);

      await this.refreshTokenService.revokeAllRefreshTokensForUser(user.userId);
      const refreshToken = this.refreshTokenService.generateRefreshToken();
      const tokenHash = await this.refreshTokenService.hashRefreshToken(refreshToken);
      await this.refreshTokenService.storeRefreshToken(user.userId, tokenHash, refreshToken);

      this.throttleService.resetThrottle(loginRequest.username);

      const response: TokenResponse = {
        accessToken,
        refreshToken,
        tokenType: "Bearer",
        expiresIn: this.tokenService.getAccessTokenExpiry(),
      };

      this.setRefreshCookie(res, refreshToken);
      res.status(200).json(response);
    } catch (error) {
      console.error("Admin login error:", error);
      const response: ErrorResponse = {
        errorCode: "AUTH-401",
        message: "Unauthorised",
      };
      res.status(401).json(response);
    }
  }

  @Post("refresh")
  @ApiTags("Auth")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Exchange a refresh token for a new token pair" })
  @ApiResponse({ status: 200, description: "A new token pair.", type: TokenResponse })
  @ApiResponse({ status: 401, description: "Unauthorised", type: ErrorResponse })
  @ApiResponse({ status: 422, description: "Invalid input", type: ErrorResponse })
  async refresh(@Body() refreshRequest: RefreshRequest, @Req() req: ExpressRequest, @Res() res: Response): Promise<void> {
    const unauthorised = (): void => {
      // A refused refresh ends the session, so drop the cookie too.
      this.clearRefreshCookie(res);
      const response: ErrorResponse = {
        errorCode: "AUTH-401",
        message: "Unauthorised",
      };
      res.status(401).json(response);
    };

    try {
      const presentedToken = this.presentedRefreshToken(req, refreshRequest);
      if (!presentedToken) {
        unauthorised();
        return;
      }

      const validation = await this.refreshTokenService.validateRefreshToken(presentedToken);

      if (!validation.valid) {
        unauthorised();
        return;
      }

      const userId = validation.userId!;

      await this.refreshTokenService.revokeRefreshToken(presentedToken);

      const user = await this.userRepository.findByUserId(userId);
      if (!user) {
        unauthorised();
        return;
      }

      const roles = await this.userRepository.getRoles(user.userId);
      const effectiveRoles = roles.length > 0 ? roles : ["CUSTOMER"];

      let accountId = 0;
      if (!effectiveRoles.some((role) => role.toUpperCase() === "ADMIN")) {
        const account = await this.tradeApiClient.getAccountByUserId(user.userId);
        if (!account) {
          const response: ErrorResponse = {
            errorCode: "AUTH-401",
            message: "Unauthorised",
          };
          res.status(401).json(response);
          return;
        }
        accountId = account.accountId;
      }

      const newAccessToken = this.tokenService.createAccessToken(user.userId, accountId, effectiveRoles);

      const newRefreshToken = this.refreshTokenService.generateRefreshToken();
      const newTokenHash = await this.refreshTokenService.hashRefreshToken(newRefreshToken);
      await this.refreshTokenService.storeRefreshToken(user.userId, newTokenHash, newRefreshToken);

      const response: TokenResponse = {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        tokenType: "Bearer",
        expiresIn: this.tokenService.getAccessTokenExpiry(),
      };

      this.setRefreshCookie(res, newRefreshToken);
      res.status(200).json(response);
    } catch (error) {
      console.error("Refresh error:", error);
      const response: ErrorResponse = {
        errorCode: "AUTH-401",
        message: "Unauthorised",
      };
      res.status(401).json(response);
    }
  }

  @Post("logout")
  @ApiTags("Auth")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Log out and revoke the provided refresh token" })
  @ApiResponse({ status: 204, description: "Logged out." })
  @ApiResponse({ status: 422, description: "Invalid input", type: ErrorResponse })
  async logout(@Body() refreshRequest: RefreshRequest, @Req() req: ExpressRequest, @Res() res: Response): Promise<void> {
    try {
      const presentedToken = this.presentedRefreshToken(req, refreshRequest);
      if (presentedToken) {
        await this.refreshTokenService.revokeRefreshToken(presentedToken);
      }
      this.clearRefreshCookie(res);
      res.status(204).send();
    } catch (error) {
      console.error("Logout error:", error);
      const response: ErrorResponse = {
        errorCode: "VAL-422",
        message: "Invalid input",
      };
      res.status(422).json(response);
    }
  }

  @Get("me")
  @UseGuards(BearerGuard)
  @HttpCode(HttpStatus.OK)
  @ApiTags("Profile")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get the authenticated user" })
  @ApiResponse({ status: 200, description: "The authenticated user.", type: UserResponse })
  @ApiResponse({ status: 401, description: "Unauthorised", type: ErrorResponse })
  async getMe(@CurrentUser() claims: any, @Res() res: Response): Promise<void> {
    try {
      if (!claims) {
        const response: ErrorResponse = {
          errorCode: "AUTH-401",
          message: "Unauthorised",
        };
        res.status(401).json(response);
        return;
      }

      const user = await this.userRepository.findByUserId(claims.sub);

      const userResponse: UserResponse = {
        id: claims.sub,
        username: user?.userName ?? "",
        accountId: claims.accountId,
        roles: claims.roles,
      };

      res.status(200).json(userResponse);
    } catch (error) {
      console.error("Get user error:", error);
      const response: ErrorResponse = {
        errorCode: "AUTH-401",
        message: "Unauthorised",
      };
      res.status(401).json(response);
    }
  }
}