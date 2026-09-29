import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface AuthenticatedUser {
  sub: string;
  accountId: number;
  roles: string[];
  iat: number;
  exp: number;
  iss: string;
}

/**
 * Extracts the authenticated user from the request.
 * Must be used on a route protected by BearerGuard, which verifies the
 * JWT signature/expiry/issuer first and attaches the verified payload
 * to `request.user`. This decorator never reads claims from an unverified
 * token itself — it only returns what the guard already verified.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext): AuthenticatedUser | unknown => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user) return undefined;
    if (data) return user[data];
    return user;
  },
);
