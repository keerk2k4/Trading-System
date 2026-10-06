import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

// AuthModule supplies BearerGuard (and the TokenService it verifies with) for
// the admin-only /health/details.
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
