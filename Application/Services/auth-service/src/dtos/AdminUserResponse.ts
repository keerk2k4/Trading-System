import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * A customer as the admin customer lookup shows them. Email and phone are
 * masked; the trading account (number, status, balance) comes from the Trade
 * REST API, matched on `userId`.
 */
export class AdminUserResponse {
  @ApiProperty({ format: "uuid" })
  userId!: string;

  @ApiProperty()
  username!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiPropertyOptional({ description: "Masked, e.g. a***@example.com", nullable: true })
  email!: string | null;

  @ApiPropertyOptional({ description: "Masked, e.g. ******3210", nullable: true })
  phone!: string | null;

  @ApiProperty({ enum: ["NOT_SUBMITTED", "PENDING", "APPROVED", "REJECTED"] })
  kycStatus!: string;
}
