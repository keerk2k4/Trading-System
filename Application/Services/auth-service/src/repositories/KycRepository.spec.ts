import { DatabaseService } from "../database/database.service";
import { FieldEncryptionService } from "../services/FieldEncryptionService";
import { KycRepository } from "./KycRepository";

const USER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("KycRepository", () => {
  let query: jest.Mock;
  let repository: KycRepository;
  const encryption = new FieldEncryptionService("test-key-for-kyc-repository");

  const rowWith = (dateOfBirth: string, documentNumber: string) => ({
    id: 1,
    user_id: USER_ID,
    status: "PENDING",
    date_of_birth: dateOfBirth,
    document_type: "PASSPORT",
    document_number: documentNumber,
    submitted_at: "2026-10-06T00:00:00.000Z",
    reviewed_at: null,
    reviewed_by: null,
    rejection_reason: null,
  });

  beforeEach(() => {
    query = jest.fn();
    repository = new KycRepository({ query } as unknown as DatabaseService, encryption);
  });

  function expectEncrypted(stored: string, plaintext: string): void {
    expect(stored).not.toContain(plaintext);
    expect(encryption.isEncrypted(stored)).toBe(true);
    expect(encryption.decrypt(stored)).toBe(plaintext);
  }

  it("stores date of birth, document type and number encrypted on submission, with a lookup hash", async () => {
    query.mockImplementation((_sql: string, params: string[]) =>
      Promise.resolve({ rows: [{ ...rowWith(params[1], params[3]), document_type: params[2] }] }),
    );

    const created = await repository.createSubmission({
      userId: USER_ID,
      dateOfBirth: "1996-02-14",
      documentType: "PASSPORT",
      documentNumber: "P1234567",
    });

    const [, params] = query.mock.calls[0];
    expectEncrypted(params[1], "1996-02-14");
    expectEncrypted(params[2], "PASSPORT");
    expectEncrypted(params[3], "P1234567");
    expect(params[4]).toBe(repository.documentLookupHash("PASSPORT", "P1234567"));
    // The caller gets the plaintext back.
    expect(created.dateOfBirth).toBe("1996-02-14");
    expect(created.documentType).toBe("PASSPORT");
    expect(created.documentNumber).toBe("P1234567");
  });

  describe("document lookup hash", () => {
    it("ignores case, spaces and punctuation, but depends on the document type", () => {
      const hash = repository.documentLookupHash("PASSPORT", "P1234567");

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(repository.documentLookupHash("passport", "p 123-4567")).toBe(hash);
      expect(repository.documentLookupHash("PAN", "P1234567")).not.toBe(hash);
      expect(repository.documentLookupHash("PASSPORT", "P1234568")).not.toBe(hash);
    });

    it("isDocumentTaken looks for another user's row by hash", async () => {
      query.mockResolvedValue({ rows: [{ "?column?": 1 }] });

      await expect(repository.isDocumentTaken("PASSPORT", "P1234567", USER_ID)).resolves.toBe(true);

      expect(query).toHaveBeenCalledWith(
        "SELECT 1 FROM auth.kyc WHERE document_lookup_hash = $1 AND user_id <> $2 LIMIT 1",
        [repository.documentLookupHash("PASSPORT", "P1234567"), USER_ID],
      );
    });

    it("isDocumentTaken is false when no other user has it", async () => {
      query.mockResolvedValue({ rows: [] });

      await expect(repository.isDocumentTaken("PASSPORT", "P1234567", USER_ID)).resolves.toBe(false);
    });
  });

  it("stores the fields encrypted on update", async () => {
    query.mockImplementation((_sql: string, params: string[]) =>
      Promise.resolve({ rows: [rowWith(params[1], params[3])] }),
    );

    const updated = await repository.updateSubmissionByUserId({
      userId: USER_ID,
      dateOfBirth: "1990-05-15",
      documentType: "AADHAR",
      documentNumber: "123412341234",
    });

    const [, params] = query.mock.calls[0];
    expectEncrypted(params[1], "1990-05-15");
    expectEncrypted(params[2], "AADHAR");
    expectEncrypted(params[3], "123412341234");
    expect(params[4]).toBe(repository.documentLookupHash("AADHAR", "123412341234"));
    expect(updated?.documentNumber).toBe("123412341234");
  });

  it("decrypts the fields when reading", async () => {
    query.mockResolvedValue({
      rows: [rowWith(encryption.encrypt("1996-02-14")!, encryption.encrypt("P1234567")!)],
    });

    const kyc = await repository.findByUserId(USER_ID);

    expect(kyc?.dateOfBirth).toBe("1996-02-14");
    expect(kyc?.documentNumber).toBe("P1234567");
  });

  it("still reads legacy plaintext rows", async () => {
    query.mockResolvedValue({ rows: [rowWith("1996-02-14", "P1234567")] });

    const [kyc] = await repository.findAllPending();

    expect(kyc.dateOfBirth).toBe("1996-02-14");
    expect(kyc.documentNumber).toBe("P1234567");
  });
});
