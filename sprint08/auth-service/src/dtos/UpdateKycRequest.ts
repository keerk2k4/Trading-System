import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from "class-validator";

export enum KycReviewStatus {
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

export class UpdateKycRequest {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: KycReviewStatus, example: KycReviewStatus.APPROVED })
  @IsEnum(KycReviewStatus)
  status!: KycReviewStatus;

  @ApiPropertyOptional({ example: "Document is blurry" })
  @IsOptional()
  @ValidateIf((dto: UpdateKycRequest) => dto.status === KycReviewStatus.REJECTED)
  @IsString()
  @MaxLength(500)
  rejectionReason?: string;
}
