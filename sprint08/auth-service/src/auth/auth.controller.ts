import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
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
import { UserRepository } from "../repositories/UserRepository";

@Controller("auth")
export class AuthController {
  constructor(
    private tokenService: TokenService,
    private passwordService: PasswordService,
    private refreshTokenService: RefreshTokenService,
    private userRepository: UserRepository,
  ) {}

  /**
   * POST /auth/register
   * Boilerplate route - no implementation yet
   */
  @Post("register")
  async register(@Body() registerRequest: RegisterRequest, @Res() res: Response): Promise<void> {
    try {
      // TODO: Implement registration logic
      // 1. Validate accountId exists in Trade API
      // 2. Hash password
      // 3. Generate UUID
      // 4. Create user in users table
      // 5. Return UserResponse (no tokens)

      const error: ErrorResponse = {
        errorCode: "AUTH-401",
        message: "Registration not yet implemented",
      };
      res.status(501).json(error);
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
   * Authenticate user with username and password
   * Returns access token (15 minutes expiry)
   * No refresh token on login endpoint
   */
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginRequest: LoginRequest, @Res() res: Response): Promise<void> {
    try {
      // Find user by username
      const user = await this.userRepository.findByUsername(loginRequest.username);

      // For security: use dummy hash if user not found to prevent timing attacks
      let passwordValid = false;
      if (user) {
        passwordValid = await this.passwordService.verifyPassword(loginRequest.password, user.passwordHash);
      } else {
        // Consume same time as real password verification by hashing against dummy hash
        const dummyHash = await this.passwordService.getDummyHash();
        await this.passwordService.verifyPassword(loginRequest.password, dummyHash);
      }

      // Return same error for both unknown user and wrong password
      if (!user || !passwordValid) {
        const response: ErrorResponse = {
          errorCode: "AUTH-401",
          message: "Unauthorised",
        };
        res.status(401).json(response);
        return;
      }

      // TODO: Call Trade API to get accountId for this user
      // For now, assume userId maps to accountId (e.g., user 1 -> account 1)
      // This will be replaced with actual API call
      const accountId = 1; // Placeholder

      // Create access token
      const accessToken = this.tokenService.createAccessToken(user.userId, accountId, ["CUSTOMER"]);

      const response: TokenResponse = {
        accessToken,
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
   * Exchange refresh token for new token pair
   * Creates new access token and new refresh token
   * Revokes the old refresh token
   */
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() refreshRequest: RefreshRequest, @Res() res: Response): Promise<void> {
    try {
      // Validate refresh token
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

      // Revoke the presented refresh token
      const tokenHash = await this.refreshTokenService.hashRefreshToken(refreshRequest.refreshToken);
      await this.refreshTokenService.revokeRefreshToken(tokenHash);

      // Get user to extract data for new token
      const user = await this.userRepository.findByUserId(userId);

      if (!user) {
        const response: ErrorResponse = {
          errorCode: "AUTH-401",
          message: "Unauthorised",
        };
        res.status(401).json(response);
        return;
      }

      // TODO: Call Trade API to get accountId for this user
      const accountId = 1; // Placeholder

      // Create new access token
      const newAccessToken = this.tokenService.createAccessToken(user.userId, accountId, ["CUSTOMER"]);

      // Create new refresh token
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
   * Protected route - requires bearer token
   * Returns current authenticated user
   */
  @Get("me")
  @UseGuards(BearerGuard)
  @HttpCode(HttpStatus.OK)
  async getMe(@Request() req: any, @Res() res: Response): Promise<void> {
    try {
      const user = req.user;

      if (!user) {
        const response: ErrorResponse = {
          errorCode: "AUTH-401",
          message: "Unauthorised",
        };
        res.status(401).json(response);
        return;
      }

      const userResponse: UserResponse = {
        id: user.sub,
        username: "", // TODO: Extract from JWT or lookup by userId
        accountId: user.accountId,
        roles: user.roles,
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
