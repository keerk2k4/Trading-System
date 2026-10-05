import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  Res,
} from "@nestjs/common";
import { Response } from "express";
import { RegisterRequest } from "../dtos/RegisterRequest";
import { LoginRequest } from "../dtos/LoginRequest";
import { RefreshRequest } from "../dtos/RefreshRequest";
import { UserResponse } from "../dtos/UserResponse";
import { TokenResponse } from "../dtos/TokenResponse";
import { ErrorResponse } from "../dtos/ErrorResponse";
import { BearerGuard } from "../guards/BearerGuard";
import { TokenService } from "../services/TokenService";
import { PasswordService } from "../services/PasswordService";
import { RefreshTokenService } from "../services/RefreshTokenService";
import { TradeApiClient } from "../services/TradeApiClient";
import { UserRepository } from "../repositories/UserRepository";

@Controller("auth")
export class AuthController {
  constructor(
    private tokenService: TokenService,
    private passwordService: PasswordService,
    private refreshTokenService: RefreshTokenService,
    private tradeApiClient: TradeApiClient,
    private userRepository: UserRepository,
  ) {}

  /**
   * POST /auth/register
   *
   * 1. Reject if the username is already taken (AUTH-409).
   * 2. Hash the password.
   * 3. Create the user row in auth.users.
   * 4. Ask Trade REST API to create a brand new trading account for
   *    this user (balance 0, status ACTIVE), linked by the user's UUID.
   * 5. Return confirmation only -- no token, matching the contract.
   */
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() registerRequest: RegisterRequest, @Res() res: Response): Promise<void> {
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

      const passwordHash = await this.passwordService.hashPassword(registerRequest.password);

      const user = await this.userRepository.create({
        userName: registerRequest.username,
        passwordHash,
        email: `${registerRequest.username}@placeholder.local`,
        phone: null,
        firstName: "",
        lastName: "",
        status: "ACTIVE",
      });

      // Auto-create the trading account, per the team's chosen design --
      // this is a deliberate, documented tradeoff (see security review).
      await this.tradeApiClient.createAccount(user.userId);

      const response: UserResponse = {
        id: user.userId,
        username: user.userName,
        accountId: 0, // not returned by the contract's UserResponse shape at register time
        roles: registerRequest.roles ?? ["CUSTOMER"],
      };

      res.status(201).json(response);
    } catch (error) {
      console.error("Register error:", error);
      const response: ErrorResponse = {
        errorCode: "VAL-422",
        message: "Invalid input",
      };
      res.status(422).json(response);
    }
  }

  /**
   * POST /auth/login
   */
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginRequest: LoginRequest, @Res() res: Response): Promise<void> {
    try {
      const user = await this.userRepository.findByUsername(loginRequest.username);

      let passwordValid = false;
      if (user) {
        passwordValid = await this.passwordService.verifyPassword(loginRequest.password, user.passwordHash);
      } else {
        const dummyHash = await this.passwordService.getDummyHash();
        await this.passwordService.verifyPassword(loginRequest.password, dummyHash);
      }

      if (!user || !passwordValid) {
        const response: ErrorResponse = {
          errorCode: "AUTH-401",
          message: "Unauthorised",
        };
        res.status(401).json(response);
        return;
      }

      // Fetch the real, current account for this user from Trade API.
      const account = await this.tradeApiClient.getAccountByUserId(user.userId);
      if (!account) {
        const response: ErrorResponse = {
          errorCode: "AUTH-401",
          message: "Unauthorised",
        };
        res.status(401).json(response);
        return;
      }

      const accessToken = this.tokenService.createAccessToken(user.userId, account.accountId, ["CUSTOMER"]);

      const refreshToken = this.refreshTokenService.generateRefreshToken();
      const tokenHash = await this.refreshTokenService.hashRefreshToken(refreshToken);
      await this.refreshTokenService.storeRefreshToken(user.userId, tokenHash);

      const response: TokenResponse = {
        accessToken,
        refreshToken,
        tokenType: "Bearer",
        expiresIn: this.tokenService.getAccessTokenExpiry(),
      };

      res.status(200).json(response);
    } catch (error) {
      console.error("Login error:", error);
      const response: ErrorResponse = {
        errorCode: "AUTH-401",
        message: "Unauthorised",
      };
      res.status(401).json(response);
    }
  }

  /**
   * POST /auth/refresh
   */
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() refreshRequest: RefreshRequest, @Res() res: Response): Promise<void> {
    try {
      const validation = await this.refreshTokenService.validateRefreshToken(refreshRequest.refreshToken);

      if (!validation.valid) {
        const response: ErrorResponse = {
          errorCode: "AUTH-401",
          message: "Unauthorised",
        };
        res.status(401).json(response);
        return;
      }

      const userId = validation.userId!;

      const tokenHash = await this.refreshTokenService.hashRefreshToken(refreshRequest.refreshToken);
      await this.refreshTokenService.revokeRefreshToken(tokenHash);

      const user = await this.userRepository.findByUserId(userId);
      if (!user) {
        const response: ErrorResponse = {
          errorCode: "AUTH-401",
          message: "Unauthorised",
        };
        res.status(401).json(response);
        return;
      }

      const account = await this.tradeApiClient.getAccountByUserId(user.userId);
      if (!account) {
        const response: ErrorResponse = {
          errorCode: "AUTH-401",
          message: "Unauthorised",
        };
        res.status(401).json(response);
        return;
      }

      const newAccessToken = this.tokenService.createAccessToken(user.userId, account.accountId, ["CUSTOMER"]);

      const newRefreshToken = this.refreshTokenService.generateRefreshToken();
      const newTokenHash = await this.refreshTokenService.hashRefreshToken(newRefreshToken);
      await this.refreshTokenService.storeRefreshToken(user.userId, newTokenHash);

      const response: TokenResponse = {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        tokenType: "Bearer",
        expiresIn: this.tokenService.getAccessTokenExpiry(),
      };

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

  /**
   * GET /auth/me
   */
  @Get("me")
  @UseGuards(BearerGuard)
  @HttpCode(HttpStatus.OK)
  async getMe(@Request() req: any, @Res() res: Response): Promise<void> {
    try {
      const claims = req.user;

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