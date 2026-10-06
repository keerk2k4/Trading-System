import { DatabaseService } from "../database/database.service";
import { DATABASE_TIMEOUT_MS, HEALTH_CACHE_MS, HealthService } from "./health.service";

describe("HealthService", () => {
  let database: jest.Mocked<Pick<DatabaseService, "query">>;
  let service: HealthService;

  beforeEach(() => {
    database = { query: jest.fn() };
    service = new HealthService(database as unknown as DatabaseService);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("reports UP with a response time when SELECT 1 answers", async () => {
    database.query.mockResolvedValue({ rows: [{ "?column?": 1 }] });

    const result = await service.checkDatabase();

    expect(database.query).toHaveBeenCalledWith("SELECT 1");
    expect(result.status).toBe("UP");
    expect(result.responseMs).toEqual(expect.any(Number));
  });

  it("reports DOWN without the driver's error text when the query fails", async () => {
    database.query.mockRejectedValue(new Error("connect ECONNREFUSED db.internal:5432 user=auth_admin"));

    const result = await service.checkDatabase();

    expect(result).toEqual({ status: "DOWN", responseMs: null, detail: "Database query failed" });
  });

  it("reports DOWN when the database does not answer in time", async () => {
    jest.useFakeTimers();
    database.query.mockReturnValue(new Promise(() => undefined));

    const pending = service.checkDatabase();
    await jest.advanceTimersByTimeAsync(DATABASE_TIMEOUT_MS);

    await expect(pending).resolves.toEqual({
      status: "DOWN",
      responseMs: null,
      detail: `No response within ${DATABASE_TIMEOUT_MS / 1000} s`,
    });
  });

  it("reuses a recent result instead of querying again", async () => {
    database.query.mockResolvedValue({ rows: [] });

    await service.checkDatabase();
    await service.checkDatabase();

    expect(database.query).toHaveBeenCalledTimes(1);
  });

  it("queries again once the cached result is older than the cache window", async () => {
    jest.useFakeTimers();
    database.query.mockResolvedValue({ rows: [] });

    await service.checkDatabase();
    jest.advanceTimersByTime(HEALTH_CACHE_MS + 1);
    await service.checkDatabase();

    expect(database.query).toHaveBeenCalledTimes(2);
  });

  it("shares one query between callers that arrive while it is running", async () => {
    let answer!: (value: unknown) => void;
    database.query.mockReturnValue(new Promise((resolve) => (answer = resolve)));

    const first = service.checkDatabase();
    const second = service.checkDatabase();
    answer({ rows: [] });

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(database.query).toHaveBeenCalledTimes(1);
  });
});
