import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuthController } from "./auth.controller";
import { TokenService } from "../services/TokenService";
import { PasswordService } from "../services/PasswordService";
import { RefreshTokenService } from "../services/RefreshTokenService";
import { TradeApiClient } from "../services/TradeApiClient";
import { UserRepository } from "../repositories/UserRepository";

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [TokenService, PasswordService, RefreshTokenService, TradeApiClient, UserRepository],
  exports: [TokenService, PasswordService, RefreshTokenService, TradeApiClient, UserRepository],
})
export class AuthModule {}