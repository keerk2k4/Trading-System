import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsString, MaxLength, MinLength } from "class-validator";

export class CreateKycRequest {
  @ApiProperty({ format: "date", example: "1996-02-14" })
  @IsDateString()
  dateOfBirth!: string;

  @ApiProperty({ example: "PASSPORT" })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  documentType!: string;

  @ApiProperty({ example: "P1234567" })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  documentNumber!: string;
}
