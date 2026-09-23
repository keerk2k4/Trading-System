import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuthController } from "./auth.controller";
import { TokenService } from "../services/TokenService";
import { PasswordService } from "../services/PasswordService";
import { RefreshTokenService } from "../services/RefreshTokenService";
import { UserRepository } from "../repositories/UserRepository";

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [TokenService, PasswordService, RefreshTokenService, UserRepository],
  exports: [TokenService, PasswordService, RefreshTokenService, UserRepository],
})
export class AuthModule {}
