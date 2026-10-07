import { ApiProperty } from "@nestjs/swagger";

/**
 * GET /auth/me/contact: the signed-in user's own contact details, for the
 * settings screen to show where alerts go. Read on demand and never part of
 * /auth/me, which the browser caches.
 */
export class ContactResponse {
  @ApiProperty({ format: "email" })
  email!: string;
  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;
}
