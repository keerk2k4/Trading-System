import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { User } from "../entities/User";

@Injectable()
export class UserRepository {
  constructor(private databaseService: DatabaseService) {}

  /**
   * Find a user by username.
   * @param userName - The username to search for
   * @returns The user or null if not found
   */
  async findByUsername(userName: string): Promise<User | null> {
    const result = await this.databaseService.query("SELECT * FROM auth.users WHERE user_name = $1", [userName]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToUser(result.rows[0]);
  }

  /**
   * Find a user by UUID.
   * @param userId - The user UUID
   * @returns The user or null if not found
   */
  async findByUserId(userId: string): Promise<User | null> {
    const result = await this.databaseService.query("SELECT * FROM auth.users WHERE user_id = $1", [userId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToUser(result.rows[0]);
  }

  /**
   * Create a new user in the database.
   * @param user - User data to insert
   * @returns The created user
   */
  async create(user: Omit<User, "userId">): Promise<User> {
    const result = await this.databaseService.query(
      `INSERT INTO auth.users (user_name, password_hash, email, phone, first_name, last_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [user.userName, user.passwordHash, user.email, user.phone, user.firstName, user.lastName, user.status]
    );

    return this.mapRowToUser(result.rows[0]);
  }

  /**
   * Check if a username is already taken.
   * @param userName - The username to check
   * @returns True if username exists, false otherwise
   */
  async isUsernameTaken(userName: string): Promise<boolean> {
    const result = await this.databaseService.query("SELECT 1 FROM auth.users WHERE user_name = $1 LIMIT 1", [userName]);
    return result.rows.length > 0;
  }

  /**
   * Map database row to User entity.
   * @param row - Database row
   * @returns User entity
   */
  private mapRowToUser(row: any): User {
    return {
      userId: row.user_id,
      userName: row.user_name,
      passwordHash: row.password_hash,
      email: row.email,
      phone: row.phone || null,
      firstName: row.first_name,
      lastName: row.last_name,
      status: row.status,
    };
  }
}
