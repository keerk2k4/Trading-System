import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { User } from "../entities/User";
import { FieldEncryptionService } from "../services/FieldEncryptionService";

// Name of the UNIQUE index on phone_lookup_hash (migration 018). Postgres
// reports it as `constraint` on a 23505 unique-violation error.
export const PHONE_UNIQUE_INDEX = "uq_auth_users_phone_lookup_hash";

// email and phone are stored AES-256-GCM encrypted (FieldEncryptionService):
// encrypted in create(), decrypted in mapRowToUser(). Never query by them;
// phone uniqueness goes through phone_lookup_hash instead.
@Injectable()
export class UserRepository {
  constructor(
    private databaseService: DatabaseService,
    private fieldEncryption: FieldEncryptionService,
  ) {}

  async findByUsername(userName: string): Promise<User | null> {
    const result = await this.databaseService.query("SELECT * FROM auth.users WHERE user_name = $1", [userName]);    
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToUser(result.rows[0]);
  }

  async findByUserId(userId: string): Promise<User | null> {
    const result = await this.databaseService.query("SELECT * FROM auth.users WHERE user_id = $1", [userId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToUser(result.rows[0]);
  }

  async create(user: Omit<User, "userId">): Promise<User> {
    const result = await this.databaseService.query(
      `INSERT INTO auth.users (user_name, password_hash, email, phone, phone_lookup_hash, first_name, last_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        user.userName,
        user.passwordHash,
        this.fieldEncryption.encrypt(user.email),
        this.fieldEncryption.encrypt(user.phone),
        this.phoneLookupHash(user.phone),
        user.firstName,
        user.lastName,
        user.status,
      ]
    );

    return this.mapRowToUser(result.rows[0]);
  }

  // True when another account already uses this phone number (compared by
  // lookup hash, so "+91 98765-43210" and "+919876543210" match).
  async isPhoneTaken(phone: string): Promise<boolean> {
    const hash = this.phoneLookupHash(phone);
    if (!hash) {
      return false;
    }
    const result = await this.databaseService.query(
      "SELECT 1 FROM auth.users WHERE phone_lookup_hash = $1 LIMIT 1",
      [hash],
    );
    return result.rows.length > 0;
  }

  // Digits only, so formatting and a leading "+" never make two equal numbers differ.
  phoneLookupHash(phone: string | null | undefined): string | null {
    const digits = (phone ?? "").replace(/\D/g, "");
    return digits ? this.fieldEncryption.lookupHash("phone", digits) : null;
  }

  async isUsernameTaken(userName: string): Promise<boolean> {
    const result = await this.databaseService.query("SELECT 1 FROM auth.users WHERE user_name = $1 LIMIT 1", [userName]);
    return result.rows.length > 0;
  }

  async assignRole(userId: string, role: string): Promise<void> {
    await this.databaseService.query(
      `INSERT INTO auth.user_roles (user_id, role)
       VALUES ($1, $2)
       ON CONFLICT (user_id, role) DO NOTHING`,
      [userId, role.toUpperCase()],
    );
  }

  async getRoles(userId: string): Promise<string[]> {
    const result = await this.databaseService.query(
      "SELECT role FROM auth.user_roles WHERE user_id = $1 ORDER BY role",
      [userId],
    );
    return result.rows.map((row: { role: string }) => row.role);
  }

  async updateStatus(userId: string, status: string): Promise<void> {
    await this.databaseService.query(
      "UPDATE auth.users SET status = $1 WHERE user_id = $2",
      [status, userId],
    );
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.databaseService.query(
      "UPDATE auth.users SET password_hash = $1 WHERE user_id = $2",
      [passwordHash, userId],
    );
  }

  async hasRole(userId: string, role: string): Promise<boolean> {
    const result = await this.databaseService.query(
      "SELECT 1 FROM auth.user_roles WHERE user_id = $1 AND role = $2 LIMIT 1",
      [userId, role.toUpperCase()],
    );
    return result.rows.length > 0;
  }

  private mapRowToUser(row: any): User {
    return {
      userId: row.user_id,
      userName: row.user_name,
      passwordHash: row.password_hash,
      email: this.fieldEncryption.decrypt(row.email) as string,
      phone: this.fieldEncryption.decrypt(row.phone) || null,
      firstName: row.first_name,
      lastName: row.last_name,
      status: row.status,
    };
  }

  async deleteById(userId: string): Promise<void> {
  await this.databaseService.query(
    `DELETE FROM auth.users WHERE user_id = $1`,
    [userId]
  );
  }
}
