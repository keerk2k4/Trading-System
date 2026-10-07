import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { FieldEncryptionService } from "../services/FieldEncryptionService";
import { AdminUserResponse } from "../dtos/AdminUserResponse";
import { maskEmail, maskPhone } from "../admin/masking";

/** The most customers one lookup returns; a narrower search finds the rest. */
export const MAX_ADMIN_RESULTS = 50;

// Customers only: anyone holding the ADMIN role is left out of every query.
const SELECT_CUSTOMERS = `
  SELECT u.user_id, u.user_name, u.first_name, u.last_name, u.email, u.phone,
         k.status AS kyc_status
  FROM auth.users u
  LEFT JOIN auth.kyc k ON k.user_id = u.user_id
  WHERE NOT EXISTS (
    SELECT 1 FROM auth.user_roles r
    WHERE r.user_id = u.user_id AND upper(r.role) = 'ADMIN'
  )`;

/**
 * Read-only customer queries for the admin customer lookup.
 *
 * Email and phone are stored encrypted with random ciphertext, so they cannot
 * be searched in SQL; the search covers username and name, which are not.
 * Contact details are decrypted only to be masked before they leave here.
 */
@Injectable()
export class AdminUserRepository {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly fieldEncryption: FieldEncryptionService,
  ) {}

  /** Customers whose username, first name, last name or full name contains `text`. */
  async searchCustomers(text: string): Promise<AdminUserResponse[]> {
    const pattern = `%${escapeLike(text)}%`;
    const result = await this.databaseService.query(
      `${SELECT_CUSTOMERS}
         AND (u.user_name ILIKE $1 ESCAPE '\\'
              OR u.first_name ILIKE $1 ESCAPE '\\'
              OR u.last_name ILIKE $1 ESCAPE '\\'
              OR (u.first_name || ' ' || u.last_name) ILIKE $1 ESCAPE '\\')
       ORDER BY u.user_name
       LIMIT $2`,
      [pattern, MAX_ADMIN_RESULTS],
    );
    return result.rows.map((row: any) => this.toResponse(row));
  }

  /** Customers with these ids, for naming the accounts in the account list. */
  async findCustomersByIds(userIds: string[]): Promise<AdminUserResponse[]> {
    if (userIds.length === 0) {
      return [];
    }
    const result = await this.databaseService.query(
      `${SELECT_CUSTOMERS}
         AND u.user_id = ANY($1::uuid[])
       ORDER BY u.user_name`,
      [userIds],
    );
    return result.rows.map((row: any) => this.toResponse(row));
  }

  private toResponse(row: any): AdminUserResponse {
    return {
      userId: row.user_id,
      username: row.user_name,
      firstName: row.first_name ?? "",
      lastName: row.last_name ?? "",
      email: maskEmail(this.fieldEncryption.decrypt(row.email)),
      phone: maskPhone(this.fieldEncryption.decrypt(row.phone)),
      kycStatus: row.kyc_status ?? "NOT_SUBMITTED",
    };
  }
}

/** `%`, `_` and `\` typed by an admin are matched literally, not as wildcards. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}
