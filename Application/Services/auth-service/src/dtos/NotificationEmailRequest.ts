import { IsNotEmpty, IsString, IsUUID, MaxLength } from "class-validator";

/**
 * Body of POST /internal/notifications/email (order-service only).
 * Carries the user to notify, never an address: auth-service owns contact
 * details and resolves the recipient itself.
 */
export class NotificationEmailRequest {
  @IsUUID()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;
}
