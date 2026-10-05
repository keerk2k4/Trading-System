import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseDotenv } from "dotenv";
import { Pool } from "pg";

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;

  async onModuleInit() {
    const connectionString = this.resolveConnectionString();

    this.pool = new Pool({ connectionString });

    this.pool.on("error", (err) => {
      console.error("Unexpected error on idle client", err);
    });
    console.log("Database pool initialized successfully");
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
      console.log("Database pool closed");
    }
  }

  getPool(): Pool {
    return this.pool;
  }

  async query(text: string, params?: unknown[]): Promise<any> {
    return this.pool.query(text, params);
  }

  private resolveConnectionString(): string {
    const envCandidate = this.getFirstConfiguredConnectionString(process.env);
    const fileValues = this.readLocalEnvFile();
    const fileCandidate = this.getFirstConfiguredConnectionString(fileValues);

    if (this.hasUsablePassword(envCandidate)) {
      return envCandidate!;
    }

    if (envCandidate && fileCandidate && this.hasUsablePassword(fileCandidate)) {
      console.warn("AUTH_DB_URL/DB_URL from the process environment is malformed; falling back to .env value.");
      return fileCandidate;
    }

    if (this.hasUsablePassword(fileCandidate)) {
      return fileCandidate!;
    }

    const candidate = envCandidate || fileCandidate;
    if (!candidate) {
      throw new Error("AUTH_DB_URL or DB_URL must be configured for the auth service database.");
    }

    throw new Error("AUTH_DB_URL/DB_URL must include a username and password in the PostgreSQL connection string.");
  }

  private getFirstConfiguredConnectionString(values: Record<string, string | undefined>): string | undefined {
    return this.normalizeConnectionString(values.AUTH_DB_URL) || this.normalizeConnectionString(values.DB_URL);
  }

  private normalizeConnectionString(value?: string): string | undefined {
    if (!value) {
      return undefined;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1);
    }

    return trimmed;
  }

  private hasUsablePassword(connectionString?: string): boolean {
    if (!connectionString) {
      return false;
    }

    try {
      const parsed = new URL(connectionString);
      return Boolean(parsed.username) && parsed.password.length > 0;
    } catch {
      return false;
    }
  }

  private readLocalEnvFile(): Record<string, string | undefined> {
    const envPath = resolve(process.cwd(), ".env");
    if (!existsSync(envPath)) {
      return {};
    }

    try {
      return parseDotenv(readFileSync(envPath));
    } catch {
      return {};
    }
  }
}
