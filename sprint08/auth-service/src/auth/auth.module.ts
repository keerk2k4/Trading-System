import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuthController } from "./auth.controller";
import { TokenService } from "../services/TokenService";
import { PasswordService } from "../services/PasswordService";
import { RefreshTokenService } from "../services/RefreshTokenService";
import { TradeApiClient } from "../services/TradeApiClient";
import { UserRepository } from "../repositories/UserRepository";
import { ThrottleService } from "../services/ThrottleService";

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [TokenService, PasswordService, RefreshTokenService, TradeApiClient, UserRepository, ThrottleService],
  exports: [TokenService, PasswordService, RefreshTokenService, TradeApiClient, UserRepository, ThrottleService],
})
export class AuthModule {}