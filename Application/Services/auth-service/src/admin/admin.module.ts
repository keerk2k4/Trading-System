import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { AdminUserRepository } from "../repositories/AdminUserRepository";
import { AdminUsersController } from "./admin-users.controller";

// AuthModule supplies BearerGuard (and the TokenService it verifies with) and
// FieldEncryptionService, which decrypts contact details before masking.
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [AdminUsersController],
  providers: [AdminUserRepository],
})
export class AdminModule {}
