import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { Pool } from "pg";

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool;

  async onModuleInit() {
    this.pool = new Pool({
      connectionString: process.env.DB_URL || "postgresql://postgres:postgres@localhost:5432/trading_system",
    });

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
}
