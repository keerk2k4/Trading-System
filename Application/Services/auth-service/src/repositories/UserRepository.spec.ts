import { DatabaseService } from "../database/database.service";
import { User } from "../entities/User";
import { UserRepository } from "./UserRepository";
import { FieldEncryptionService } from "../services/FieldEncryptionService";

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
  const encryption = new FieldEncryptionService("test-key-for-user-repository");

  beforeEach(() => {
    query = jest.fn();
    repository = new UserRepository({ query } as unknown as DatabaseService, encryption);
  });

  describe("phone encryption", () => {
    it("stores the phone encrypted, never in plaintext", async () => {
      query.mockResolvedValue({ rows: [dbRow], rowCount: 1 });

      await repository.create({ ...expectedUser, phone: "+919876543210" });

      const storedPhone = query.mock.calls[0][1][3] as string;
      expect(storedPhone).not.toContain("9876543210");
      expect(encryption.isEncrypted(storedPhone)).toBe(true);
      expect(encryption.decrypt(storedPhone)).toBe("+919876543210");
    });

    it("decrypts an encrypted phone when reading a user", async () => {
      query.mockResolvedValue({ rows: [{ ...dbRow, phone: encryption.encrypt("+919876543210") }], rowCount: 1 });

      const user = await repository.findByUserId(USER_ID);

      expect(user?.phone).toBe("+919876543210");
    });

    it("still reads a legacy plaintext phone", async () => {
      query.mockResolvedValue({ rows: [dbRow], rowCount: 1 });

      expect((await repository.findByUserId(USER_ID))?.phone).toBe("+15555550123");
    });
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

      expect(query).toHaveBeenCalledTimes(1);
      const [sql, params] = query.mock.calls[0];
      expect(sql).toBe(
        `INSERT INTO auth.users (user_name, password_hash, email, phone, phone_lookup_hash, first_name, last_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      );
      expect(params[0]).toBe("alice.trader");
      expect(params[1]).toBe("stored-bcrypt-hash");
      expect(encryption.decrypt(params[2])).toBe("alice@example.test");
      // No phone: no ciphertext and no lookup hash.
      expect(params.slice(3)).toEqual([null, null, "Alice", "Trader", "ACTIVE"]);
    });

    it("stores the email encrypted, never in plaintext", async () => {
      query.mockResolvedValue({ rows: [dbRow], rowCount: 1 });

      await repository.create({ ...expectedUser });

      const storedEmail = query.mock.calls[0][1][2] as string;
      expect(storedEmail).not.toContain("alice@example.test");
      expect(encryption.isEncrypted(storedEmail)).toBe(true);
    });

    it("reads an encrypted email back as plaintext", async () => {
      query.mockResolvedValue({ rows: [{ ...dbRow, email: encryption.encrypt("alice@example.test") }], rowCount: 1 });

      expect((await repository.findByUserId(USER_ID))?.email).toBe("alice@example.test");
    });
  });

  describe("phone lookup hash", () => {
    it("is stored alongside the encrypted phone", async () => {
      query.mockResolvedValue({ rows: [dbRow], rowCount: 1 });

      await repository.create({ ...expectedUser, phone: "+919876543210" });

      expect(query.mock.calls[0][1][4]).toBe(repository.phoneLookupHash("+919876543210"));
    });

    it("is the same for the same number in any format, and different for another number", () => {
      const hash = repository.phoneLookupHash("+919876543210");

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(repository.phoneLookupHash("919876543210")).toBe(hash);
      expect(repository.phoneLookupHash("+91 98765-43210")).toBe(hash);
      expect(repository.phoneLookupHash("+919876543211")).not.toBe(hash);
      expect(repository.phoneLookupHash(null)).toBeNull();
    });

    it("isPhoneTaken compares by lookup hash, never by the phone itself", async () => {
      query.mockResolvedValue({ rows: [{ "?column?": 1 }], rowCount: 1 });

      await expect(repository.isPhoneTaken("+91 98765 43210")).resolves.toBe(true);

      expect(query).toHaveBeenCalledWith("SELECT 1 FROM auth.users WHERE phone_lookup_hash = $1 LIMIT 1", [
        repository.phoneLookupHash("+919876543210"),
      ]);
    });

    it("isPhoneTaken is false when no row matches", async () => {
      query.mockResolvedValue({ rows: [], rowCount: 0 });

      await expect(repository.isPhoneTaken("+919876543210")).resolves.toBe(false);
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
