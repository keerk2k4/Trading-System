import { ApiProperty } from "@nestjs/swagger";

export class ErrorResponse {
  @ApiProperty({ enum: ['AUTH-401', 'AUTH-409', 'VAL-422'] })
  errorCode!: string; // AUTH-401, AUTH-409, VAL-422

  @ApiProperty()
  message!: string;
}
