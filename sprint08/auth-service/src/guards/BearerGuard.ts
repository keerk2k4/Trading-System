import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { TokenService } from "../services/TokenService";

@Injectable()
export class BearerGuard implements CanActivate {
  constructor(private tokenService: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException({
        errorCode: "AUTH-401",
        message: "Unauthorised",
      });
    }
    
    const token = authHeader.substring(7); // Remove "Bearer " prefix

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
