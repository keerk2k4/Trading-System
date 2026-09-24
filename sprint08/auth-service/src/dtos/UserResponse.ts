import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class UserResponse {
  @ApiProperty({ format: 'uuid', description: 'UUID (sub claim)' })
  id!: string; // UUID (sub claim)
  @ApiProperty()
  username!: string;
  @ApiProperty()
  accountId!: number;
  @ApiProperty({ isArray: true, example: ['CUSTOMER'] })
  roles!: string[]; // ["CUSTOMER"] or ["ADMIN"]
  @ApiPropertyOptional({ format: 'date-time' })
  createdOn?: string; // ISO 8601 timestamp
}
