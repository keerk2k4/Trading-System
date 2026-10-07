import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { TokenService } from "../services/TokenService";

/** The only caller allowed on /internal routes, and what its token must say. */
export const INTERNAL_CALLER_SERVICE = "order-service";
export const INTERNAL_CALLER_SCOPE = "auth-internal";

/**
 * Guards service-to-service routes. Only a short-lived token minted by
 * order-service with the shared JWT secret passes; a customer's access token
 * is rejected, so no customer can call these routes to send themselves (or
 * anyone else) arbitrary email.
 */
@Injectable()
export class InternalServiceGuard implements CanActivate {
  constructor(private tokenService: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const header: unknown = request?.headers?.authorization;
    const match = typeof header === "string" ? /^Bearer\s+(.+)$/i.exec(header.trim()) : null;
    const token = match?.[1]?.trim();

    if (!token || !this.tokenService.verifyInternalServiceToken(token, INTERNAL_CALLER_SERVICE, INTERNAL_CALLER_SCOPE)) {
      throw new UnauthorizedException({ errorCode: "AUTH-401", message: "Unauthorised" });
    }
    return true;
  }
}
