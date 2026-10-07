import { DatabaseService } from "../database/database.service";
import { FieldEncryptionService } from "../services/FieldEncryptionService";
import { AdminUserRepository, MAX_ADMIN_RESULTS } from "./AdminUserRepository";

const USER_ID = "11111111-2222-4333-8444-555555555555";

describe("AdminUserRepository", () => {
  let database: { query: jest.Mock };
  let encryption: { decrypt: jest.Mock };
  let repository: AdminUserRepository;

  const row = {
    user_id: USER_ID,
    user_name: "alice.trader",
    first_name: "Alice",
    last_name: "Trader",
    email: "enc(email)",
    phone: "enc(phone)",
    kyc_status: "APPROVED",
  };

  beforeEach(() => {
    database = { query: jest.fn().mockResolvedValue({ rows: [row] }) };
    encryption = {
      decrypt: jest.fn((value: string | null) =>
        value === "enc(email)" ? "alice.trader@example.com" : value === "enc(phone)" ? "+91 98765 43210" : null,
      ),
    };
    repository = new AdminUserRepository(
      database as unknown as DatabaseService,
      encryption as unknown as FieldEncryptionService,
    );
  });

  it("returns customers with their contact details decrypted and then masked", async () => {
    const [customer] = await repository.searchCustomers("alice");

    expect(customer).toEqual({
      userId: USER_ID,
      username: "alice.trader",
      firstName: "Alice",
      lastName: "Trader",
      email: "a***@example.com",
      phone: "******3210",
      kycStatus: "APPROVED",
    });
  });

  it("searches username and names as a contains-match, leaving admins out, at most 50", async () => {
    await repository.searchCustomers("ali");

    const [sql, params] = database.query.mock.calls[0];
    expect(sql).toContain("u.user_name ILIKE $1");
    expect(sql).toContain("(u.first_name || ' ' || u.last_name) ILIKE $1");
    expect(sql).toContain("upper(r.role) = 'ADMIN'");
    expect(params).toEqual(["%ali%", MAX_ADMIN_RESULTS]);
  });

  it("matches % and _ typed by an admin literally rather than as wildcards", async () => {
    await repository.searchCustomers("50%_off\\");

    expect(database.query.mock.calls[0][1][0]).toBe("%50\\%\\_off\\\\%");
  });

  it("reports a customer who has not submitted KYC as NOT_SUBMITTED", async () => {
    database.query.mockResolvedValue({ rows: [{ ...row, kyc_status: null }] });

    const [customer] = await repository.searchCustomers("alice");

    expect(customer.kycStatus).toBe("NOT_SUBMITTED");
  });

  it("fetches customers by id in one query", async () => {
    await repository.findCustomersByIds([USER_ID]);

    const [sql, params] = database.query.mock.calls[0];
    expect(sql).toContain("u.user_id = ANY($1::uuid[])");
    expect(params).toEqual([[USER_ID]]);
  });

  it("runs no query for an empty id list", async () => {
    expect(await repository.findCustomersByIds([])).toEqual([]);
    expect(database.query).not.toHaveBeenCalled();
  });
});
