import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { TokenService } from "../services/TokenService";

@Injectable()
export class BearerGuard implements CanActivate {
  constructor(private tokenService: TokenService) {}

  private readBearerValue(input: unknown): string | null {
    if (typeof input !== "string") {
      return null;
    }

    const trimmed = input.trim();
    const match = /^Bearer\s+(.+)$/i.exec(trimmed);
    if (match?.[1]) {
      return match[1].trim();
    }

    return trimmed.length > 0 ? trimmed : null;
  }

  private readCookieToken(cookieHeader: unknown): string | null {
    if (typeof cookieHeader !== "string" || cookieHeader.trim().length === 0) {
      return null;
    }

    const tokenPair = cookieHeader
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("accessToken=") || part.startsWith("token="));

    if (!tokenPair) {
      return null;
    }

    const [, value] = tokenPair.split("=");
    return this.readBearerValue(decodeURIComponent(value ?? ""));
  }

  private extractToken(request: any): string | null {
    const authHeaderToken = this.readBearerValue(request?.headers?.authorization);
    if (authHeaderToken) {
      return authHeaderToken;
    }

    const xAccessToken = this.readBearerValue(request?.headers?.["x-access-token"]);
    if (xAccessToken) {
      return xAccessToken;
    }

    return this.readCookieToken(request?.headers?.cookie);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException({
        errorCode: "AUTH-401",
        message: "Unauthorised",
      });
    }

    const result = this.tokenService.verifyAccessToken(token);

    if (!result.valid) {
      throw new UnauthorizedException({
        errorCode: "AUTH-401",
        message: "Unauthorised",
      });
    }
    
    request.user = result.payload;
    return true;
  }
}
