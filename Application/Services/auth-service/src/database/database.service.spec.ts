import { Pool } from "pg";
import { existsSync, readFileSync } from "node:fs";
import { DatabaseService } from "./database.service";

jest.mock("pg", () => ({
  Pool: jest.fn(),
}));

// Mocked through Jest's module registry rather than jest.spyOn: spying on the
// real fs would also hand the fake readFileSync to Node's own module loader.
jest.mock("node:fs", () => ({
  ...jest.requireActual("node:fs"),
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

describe("DatabaseService", () => {
  const originalAuthDbUrl = process.env.AUTH_DB_URL;
  const originalDbUrl = process.env.DB_URL;
  let pool: {
    on: jest.Mock;
    query: jest.Mock;
    end: jest.Mock;
  };
  let service: DatabaseService;
  // Tests about queries and shutdown only need the service to start.
  const configureValidUrl = () => {
    process.env.AUTH_DB_URL = "postgresql://test-user:test-pass@db.test:5432/trading";
  };

  beforeEach(() => {
    delete process.env.AUTH_DB_URL;
    delete process.env.DB_URL;
    pool = {
      on: jest.fn().mockReturnThis(),
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      end: jest.fn().mockResolvedValue(undefined),
    };
    (Pool as unknown as jest.Mock).mockReset();
    (Pool as unknown as jest.Mock).mockImplementation(() => pool);
    jest.mocked(existsSync).mockReset().mockReturnValue(false);
    jest.mocked(readFileSync).mockReset().mockImplementation(() => Buffer.from(""));
    service = new DatabaseService();
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalAuthDbUrl === undefined) {
      delete process.env.AUTH_DB_URL;
    } else {
      process.env.AUTH_DB_URL = originalAuthDbUrl;
    }
    if (originalDbUrl === undefined) {
      delete process.env.DB_URL;
    } else {
      process.env.DB_URL = originalDbUrl;
    }
  });

  it("prefers AUTH_DB_URL and registers an error listener", async () => {
    const testDbUrl = "postgresql://test-user:test-pass@db.test:5432/trading";
    process.env.AUTH_DB_URL = testDbUrl;
    process.env.DB_URL = "postgresql://should-not-be-used/db";

    await service.onModuleInit();

    expect(Pool).toHaveBeenCalledWith({ connectionString: testDbUrl });
    expect(pool.on).toHaveBeenCalledWith("error", expect.any(Function));
    expect(service.getPool()).toBe(pool);
  });

  it("uses DB_URL when AUTH_DB_URL is not configured", async () => {
    const testDbUrl = "postgresql://test-user:test-pass@db.test:5432/trading";
    process.env.DB_URL = testDbUrl;

    await service.onModuleInit();

    expect(Pool).toHaveBeenCalledWith({ connectionString: testDbUrl });
  });

  it("falls back to .env when the inherited AUTH_DB_URL omits the password", async () => {
    process.env.AUTH_DB_URL = "postgresql://test-user@db.test:5432/trading";
    jest.mocked(existsSync).mockReturnValue(true);
    jest.mocked(readFileSync).mockReturnValue(Buffer.from("AUTH_DB_URL=postgresql://file-user:file-pass@db.test:5432/trading\n"));

    await service.onModuleInit();

    expect(Pool).toHaveBeenCalledWith({
      connectionString: "postgresql://file-user:file-pass@db.test:5432/trading",
    });
    expect(console.warn).toHaveBeenCalledWith(
      "AUTH_DB_URL/DB_URL from the process environment is malformed; falling back to .env value.",
    );
  });

  it("fails fast when no configured connection string includes a password", async () => {
    process.env.AUTH_DB_URL = "postgresql://test-user@db.test:5432/trading";

    await expect(service.onModuleInit()).rejects.toThrow(
      "AUTH_DB_URL/DB_URL must include a username and password in the PostgreSQL connection string.",
    );

    expect(Pool).not.toHaveBeenCalled();
  });

  it("delegates queries and preserves the caller's parameters", async () => {
    const result = { rows: [{ value: 1 }], rowCount: 1 };
    pool.query.mockResolvedValue(result);
    configureValidUrl();
    await service.onModuleInit();

    await expect(service.query("SELECT $1::int", [1])).resolves.toBe(result);

    expect(pool.query).toHaveBeenCalledWith("SELECT $1::int", [1]);
  });

  it("propagates query failures to the caller", async () => {
    const failure = new Error("database unavailable");
    pool.query.mockRejectedValue(failure);
    configureValidUrl();
    await service.onModuleInit();

    await expect(service.query("SELECT 1")).rejects.toBe(failure);
  });

  it("closes the initialized pool during shutdown", async () => {
    configureValidUrl();
    await service.onModuleInit();

    await service.onModuleDestroy();

    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it("does nothing when shutdown is requested before initialization", async () => {
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();

    expect(pool.end).not.toHaveBeenCalled();
  });
});
