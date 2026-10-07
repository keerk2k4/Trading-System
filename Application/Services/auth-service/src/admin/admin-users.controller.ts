import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Response } from "express";
import { AdminUserResponse } from "../dtos/AdminUserResponse";
import { ErrorResponse } from "../dtos/ErrorResponse";
import { BearerGuard } from "../guards/BearerGuard";
import { AuthenticatedUser, CurrentUser } from "../guards/CurrentUser";
import { AdminUserRepository, MAX_ADMIN_RESULTS } from "../repositories/AdminUserRepository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_QUERY = 2;
const MAX_QUERY = 100;

/**
 * Admin customer lookup. Either searches by name (`query`) or fetches the
 * customers behind a list of trading accounts (`ids`), never both. Customers
 * only: admins are never returned. Email and phone are masked.
 */
@Controller("admin/users")
@ApiTags("Admin")
export class AdminUsersController {
  constructor(private readonly users: AdminUserRepository) {}

  @Get()
  @UseGuards(BearerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Search customers by name or username, or fetch them by id (admin only)" })
  @ApiQuery({ name: "query", required: false, description: "2 to 100 characters of a username, first, last or full name" })
  @ApiQuery({ name: "ids", required: false, description: "Comma-separated user ids, at most 50" })
  @ApiResponse({ status: 200, description: "Matching customers, at most 50.", type: AdminUserResponse, isArray: true })
  @ApiResponse({ status: 401, description: "Unauthorised", type: ErrorResponse })
  @ApiResponse({ status: 403, description: "Forbidden", type: ErrorResponse })
  @ApiResponse({ status: 422, description: "Neither or both of query and ids, or a query of the wrong length", type: ErrorResponse })
  async findUsers(
    @CurrentUser() claims: AuthenticatedUser,
    @Query("query") query: string | undefined,
    @Query("ids") ids: string | string[] | undefined,
    @Res() res: Response,
  ): Promise<void> {
    try {
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

      const text = query?.trim() ?? "";
      const idList = parseIds(ids);
      const hasQuery = text.length > 0;
      const hasIds = ids !== undefined;
      if (hasQuery === hasIds || (hasQuery && (text.length < MIN_QUERY || text.length > MAX_QUERY))) {
        const response: ErrorResponse = { errorCode: "VAL-422", message: "Invalid input" };
        res.status(422).json(response);
        return;
      }

      const found = hasQuery
        ? await this.users.searchCustomers(text)
        : await this.users.findCustomersByIds(idList);
      res.status(200).json(found);
    } catch (error) {
      console.error("Admin user lookup error:", error instanceof Error ? error.message : error);
      const response: ErrorResponse = { errorCode: "VAL-422", message: "Invalid input" };
      res.status(422).json(response);
    }
  }
}

/**
 * Accepts `ids=a,b` or `ids=a&ids=b`. Anything that is not a user id is
 * dropped rather than sent to the database, and at most 50 are kept.
 */
function parseIds(ids: string | string[] | undefined): string[] {
  if (ids === undefined) {
    return [];
  }
  const values = Array.isArray(ids) ? ids : [ids];
  const unique = new Set(
    values
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter((value) => UUID.test(value)),
  );
  return [...unique].slice(0, MAX_ADMIN_RESULTS);
}
