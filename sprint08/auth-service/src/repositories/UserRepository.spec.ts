import { DatabaseService } from "../database/database.service";
import { User } from "../entities/User";
import { UserRepository } from "./UserRepository";

const USER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

const dbRow = {
  user_id: USER_ID,
  user_name: "alice.trader",
  password_hash: "stored-bcrypt-hash",
  email: "alice@example.test",
  phone: "+15555550123",
  first_name: "Alice",
  last_name: "Trader",
  status: "ACTIVE",
};

const expectedUser: User = {
  userId: USER_ID,
  userName: "alice.trader",
  passwordHash: "stored-bcrypt-hash",
  email: "alice@example.test",
  phone: "+15555550123",
  firstName: "Alice",
  lastName: "Trader",
  status: "ACTIVE",
};

describe("UserRepository", () => {
  let query: jest.Mock;
  let repository: UserRepository;

  beforeEach(() => {
    query = jest.fn();
    repository = new UserRepository({ query } as unknown as DatabaseService);
  });

  describe("findByUsername", () => {
    it("queries by username and maps a returned row to a User", async () => {
      query.mockResolvedValue({ rows: [dbRow], rowCount: 1 });

      await expect(repository.findByUsername("alice.trader")).resolves.toEqual(expectedUser);

      expect(query).toHaveBeenCalledWith(
        "SELECT * FROM auth.users WHERE user_name = $1",
        ["alice.trader"],
      );
    });

    it("returns null when no user matches the username", async () => {
      query.mockResolvedValue({ rows: [], rowCount: 0 });

      await expect(repository.findByUsername("missing-user")).resolves.toBeNull();
    });

    it("normalizes a falsy database phone value to null", async () => {
      query.mockResolvedValue({ rows: [{ ...dbRow, phone: "" }], rowCount: 1 });

      const user = await repository.findByUsername("alice.trader");

      expect(user?.phone).toBeNull();
    });
  });

  describe("findByUserId", () => {
    it("queries by UUID and maps the returned row", async () => {
      query.mockResolvedValue({ rows: [dbRow], rowCount: 1 });

      await expect(repository.findByUserId(USER_ID)).resolves.toEqual(expectedUser);

      expect(query).toHaveBeenCalledWith(
        "SELECT * FROM auth.users WHERE user_id = $1",
        [USER_ID],
      );
    });

    it("returns null when no user matches the UUID", async () => {
      query.mockResolvedValue({ rows: [], rowCount: 0 });

      await expect(repository.findByUserId("missing-user")).resolves.toBeNull();
    });
  });

  describe("create", () => {
    it("inserts all user fields in order and maps the returned row", async () => {
      query.mockResolvedValue({ rows: [dbRow], rowCount: 1 });
      const input: Omit<User, "userId"> = {
        userName: "alice.trader",
        passwordHash: "stored-bcrypt-hash",
        email: "alice@example.test",
        phone: null,
        firstName: "Alice",
        lastName: "Trader",
        status: "ACTIVE",
      };

      await expect(repository.create(input)).resolves.toEqual(expectedUser);

      expect(query).toHaveBeenCalledWith(
        `INSERT INTO auth.users (user_name, password_hash, email, phone, first_name, last_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
        [
          "alice.trader",
          "stored-bcrypt-hash",
          "alice@example.test",
          null,
          "Alice",
          "Trader",
          "ACTIVE",
        ],
      );
    });
  });

  describe("isUsernameTaken", () => {
    it("returns true when the existence query returns a row", async () => {
      query.mockResolvedValue({ rows: [{ "?column?": 1 }], rowCount: 1 });

      await expect(repository.isUsernameTaken("alice.trader")).resolves.toBe(true);
      expect(query).toHaveBeenCalledWith(
        "SELECT 1 FROM auth.users WHERE user_name = $1 LIMIT 1",
        ["alice.trader"],
      );
    });

    it("returns false when the existence query returns no rows", async () => {
      query.mockResolvedValue({ rows: [], rowCount: 0 });

      await expect(repository.isUsernameTaken("new-user")).resolves.toBe(false);
    });
  });

  describe("deleteById", () => {
    it("deletes by UUID and does not expose the database result", async () => {
      const deleteResult = { rowCount: 1, rows: [] };
      query.mockResolvedValue(deleteResult);

      await expect(repository.deleteById(USER_ID)).resolves.toBeUndefined();

      expect(query).toHaveBeenCalledWith(
        "DELETE FROM auth.users WHERE user_id = $1",
        [USER_ID],
      );
    });
  });

  it("propagates database errors instead of fabricating a user", async () => {
    const databaseError = new Error("database unavailable");
    query.mockRejectedValue(databaseError);

    await expect(repository.findByUserId(USER_ID)).rejects.toBe(databaseError);
  });
});
