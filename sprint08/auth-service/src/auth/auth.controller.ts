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
import { UserRepository } from "../repositories/UserRepository";
import { ThrottleService } from "../services/ThrottleService";

@Controller("auth")
export class AuthController {
  constructor(
    private tokenService: TokenService,
    private passwordService: PasswordService,
    private refreshTokenService: RefreshTokenService,
    private tradeApiClient: TradeApiClient,
    private userRepository: UserRepository,
    private throttleService: ThrottleService,
  ) { }

  @Post("register")
  @ApiTags("Auth")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Register a user" })
  @ApiResponse({ status: 201, description: "User created.", type: UserResponse })
  @ApiResponse({ status: 409, description: "The username is already taken.", type: ErrorResponse })
  @ApiResponse({ status: 422, description: "Invalid input", type: ErrorResponse })
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

      let accountId = 0;
      try {
        const account = await this.tradeApiClient.createAccount(user.userId);
        accountId = account.accountId;
      } catch (accountError) {
        await this.userRepository.deleteById(user.userId);
        throw accountError;
      }

      const response: UserResponse = {
        id: user.userId,
        username: user.userName,
        accountId: accountId,
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
      
      const account = await this.tradeApiClient.getAccountByUserId(user.userId);
      if (!account) {
        this.throttleService.recordFailedAttempt(loginRequest.username);

        const response: ErrorResponse = {
          errorCode: "AUTH-401",
          message: "Unauthorised",
        };
        res.status(401).json(response);
        return;
      }

      const accessToken = this.tokenService.createAccessToken(user.userId, account.accountId, ["CUSTOMER"]);

      
      await this.refreshTokenService.revokeAllRefreshTokensForUser(user.userId);
      const refreshToken = this.refreshTokenService.generateRefreshToken();
      const tokenHash = await this.refreshTokenService.hashRefreshToken(refreshToken);
      await this.refreshTokenService.storeRefreshToken(user.userId, tokenHash);
      
      this.throttleService.resetThrottle(loginRequest.username);

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

  @Post("refresh")
  @ApiTags("Auth")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Exchange a refresh token for a new token pair" })
  @ApiResponse({ status: 200, description: "A new token pair.", type: TokenResponse })
  @ApiResponse({ status: 401, description: "Unauthorised", type: ErrorResponse })
  @ApiResponse({ status: 422, description: "Invalid input", type: ErrorResponse })
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

      await this.refreshTokenService.revokeRefreshToken(refreshRequest.refreshToken);

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