import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { Pool } from "pg";

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;

  async onModuleInit() {
    const connectionString =
      process.env.AUTH_DB_URL ||
      process.env.DB_URL;

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
}
