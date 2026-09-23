import { IsString } from "class-validator";

export class RefreshRequest {
  @IsString()
  refreshToken!: string;
}
