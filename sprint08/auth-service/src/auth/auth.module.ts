import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuthController } from "./auth.controller";
import { TokenService } from "../services/TokenService";
import { PasswordService } from "../services/PasswordService";
import { RefreshTokenService } from "../services/RefreshTokenService";
import { TradeApiClient } from "../services/TradeApiClient";
import { UserRepository } from "../repositories/UserRepository";
import { KycRepository } from "../repositories/KycRepository";
import { ThrottleService } from "../services/ThrottleService";
import { EmailEncryptionService } from "../services/EmailEncryptionService";
import { BearerGuard } from "../guards/BearerGuard";
import { KycController } from "./kyc.controller";

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController, KycController],
  providers: [
    TokenService,
    PasswordService,
    RefreshTokenService,
    TradeApiClient,
    UserRepository,
    KycRepository,
    ThrottleService,
    EmailEncryptionService,
    BearerGuard,
  ],
  exports: [
    TokenService,
    PasswordService,
    RefreshTokenService,
    TradeApiClient,
    UserRepository,
    KycRepository,
    ThrottleService,
    EmailEncryptionService,
    BearerGuard,
  ],
})
export class AuthModule {}