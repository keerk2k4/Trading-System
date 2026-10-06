import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export type HealthStatus = "UP" | "DOWN";

export interface DatabaseHealth {
  status: HealthStatus;
  responseMs: number | null;
  detail?: string;
}

/** A database that has not answered by then is reported DOWN. */
export const DATABASE_TIMEOUT_MS = 2000;
/** Results are reused for this long, so a flood of /health calls never reaches the database. */
export const HEALTH_CACHE_MS = 5000;

/**
 * Checks this service's own database with `SELECT 1`. Used by both health
 * routes: the public one reports only the status, the admin one the detail.
 */
@Injectable()
export class HealthService {
  private cached?: { result: DatabaseHealth; at: number };
  private inFlight?: Promise<DatabaseHealth>;

  constructor(private readonly database: DatabaseService) {}

  async checkDatabase(): Promise<DatabaseHealth> {
    if (this.cached && Date.now() - this.cached.at < HEALTH_CACHE_MS) {
      return this.cached.result;
    }
    // Callers arriving while a check is running share it rather than each
    // sending their own query.
    if (!this.inFlight) {
      this.inFlight = this.probeDatabase()
        .then((result) => {
          this.cached = { result, at: Date.now() };
          return result;
        })
        .finally(() => {
          this.inFlight = undefined;
        });
    }
    return this.inFlight;
  }

  private async probeDatabase(): Promise<DatabaseHealth> {
    const started = Date.now();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), DATABASE_TIMEOUT_MS);
    });

    try {
      const outcome = await Promise.race([this.database.query("SELECT 1"), timeout]);
      if (outcome === "timeout") {
        console.warn("Health check: database did not answer in time");
        return { status: "DOWN", responseMs: null, detail: `No response within ${DATABASE_TIMEOUT_MS / 1000} s` };
      }
      return { status: "UP", responseMs: Date.now() - started };
    } catch {
      // The driver's error can name hosts and users; it stays out of the response.
      console.warn("Health check: database query failed");
      return { status: "DOWN", responseMs: null, detail: "Database query failed" };
    } finally {
      clearTimeout(timer);
    }
  }
}
