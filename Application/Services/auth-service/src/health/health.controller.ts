import { Controller, Get, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Response } from "express";
import { ErrorResponse } from "../dtos/ErrorResponse";
import { BearerGuard } from "../guards/BearerGuard";
import { AuthenticatedUser, CurrentUser } from "../guards/CurrentUser";
import { HealthService } from "./health.service";

/**
 * Two views of the same check.
 *
 * GET /health is public and says only UP or DOWN, because load balancers,
 * Docker and uptime monitors call it without a token. GET /health/details
 * is for the admin dashboard: what is wrong, not just that something is.
 */
@Controller("health")
@ApiTags("Health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: "Service status for load balancers and monitors (public, status only)" })
  @ApiResponse({ status: 200, description: "The service and its database are up." })
  @ApiResponse({ status: 503, description: "The service is running but its database is not answering." })
  async getHealth(@Res() res: Response): Promise<void> {
    const database = await this.health.checkDatabase();
    res.status(database.status === "UP" ? 200 : 503).json({ status: database.status });
  }

  @Get("details")
  @UseGuards(BearerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Detailed service status (admin only)" })
  @ApiResponse({ status: 200, description: "Status of each component, including when one is down." })
  @ApiResponse({ status: 401, description: "Unauthorised", type: ErrorResponse })
  @ApiResponse({ status: 403, description: "Forbidden", type: ErrorResponse })
  async getDetails(@CurrentUser() claims: AuthenticatedUser, @Res() res: Response): Promise<void> {
    if (!claims) {
      const response: ErrorResponse = { errorCode: "AUTH-401", message: "Unauthorised" };
      res.status(401).json(response);
      return;
    }

    const roles = claims.roles ?? [];
    if (!roles.some((role) => role?.toUpperCase() === "ADMIN")) {
      const response: ErrorResponse = { errorCode: "AUTH-403", message: "Forbidden" };
      res.status(403).json(response);
      return;
    }

    // Always 200: this is a report for a person to read, and a DOWN
    // component is part of the report rather than a failed request.
    const database = await this.health.checkDatabase();
    res.status(200).json({
      status: database.status,
      checkedAt: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      components: { database },
    });
  }
}
