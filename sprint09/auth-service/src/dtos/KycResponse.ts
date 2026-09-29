import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class KycResponse {
  @ApiProperty()
  id!: number;

  @ApiProperty({ format: "uuid" })
  userId!: string;

  @ApiProperty({ enum: ["PENDING", "APPROVED", "REJECTED"] })
  status!: string;

  @ApiProperty({ format: "date" })
  dateOfBirth!: string;

  @ApiProperty()
  documentType!: string;

  @ApiProperty()
  documentNumber!: string;

  @ApiProperty({ format: "date-time" })
  submittedAt!: string;

  @ApiPropertyOptional({ format: "date-time" })
  reviewedAt?: string | null;

  @ApiPropertyOptional({ format: "uuid" })
  reviewedBy?: string | null;

  @ApiPropertyOptional()
  rejectionReason?: string | null;

  @ApiPropertyOptional({ description: "Present when KYC is approved and trading account is created." })
  accountId?: number;
}
