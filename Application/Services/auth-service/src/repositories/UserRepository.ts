import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { User } from "../entities/User";

@Injectable()
export class UserRepository {
  constructor(private databaseService: DatabaseService) {}

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
      `INSERT INTO auth.users (user_name, password_hash, email, phone, first_name, last_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [user.userName, user.passwordHash, user.email, user.phone, user.firstName, user.lastName, user.status]
    );

    return this.mapRowToUser(result.rows[0]);
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
      email: row.email,
      phone: row.phone || null,
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
