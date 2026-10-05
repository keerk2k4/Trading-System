import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcryptjs";

@Injectable()
export class PasswordService {
  /**
   * Hash a plaintext password using bcryptjs.
   * Uses cost factor of 12 for security.
   * @param password - The plaintext password to hash
   * @returns The hashed password
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  /**
   * Verify a plaintext password against its hash.
   * Provides constant-time comparison to prevent timing attacks.
   * @param password - The plaintext password to verify
   * @param hash - The stored password hash
   * @returns True if password matches, false otherwise
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate a dummy hash for failed logins (unknown user).
   * Used to maintain constant-time response for user enumeration protection.
   * @returns A dummy bcrypt hash
   */
  async getDummyHash(): Promise<string> {
    // Pre-computed bcryptjs hash of a random string with cost 12
    // Used during failed login to consume same time as real password verification
    return "$2b$12$LQv3c1yqBW1sQf8n3h9pUeQ8mK0W7Y4V1X2Z3A4B5C6D7E8F9G0H1";
  }
}
