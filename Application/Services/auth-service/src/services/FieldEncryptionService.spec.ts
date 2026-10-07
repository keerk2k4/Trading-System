import { FieldEncryptionService } from "./FieldEncryptionService";

describe("FieldEncryptionService", () => {
  it("round-trips an email through encrypt/decrypt", () => {
    const service = new FieldEncryptionService("test-key-for-field-specs");
    const ciphertext = service.encrypt("alice@example.test") as string;

    expect(ciphertext).not.toBe("alice@example.test");
    expect(service.isEncrypted(ciphertext)).toBe(true);
    expect(service.decrypt(ciphertext)).toBe("alice@example.test");
  });

  it("uses a random IV so the same email encrypts differently each time", () => {
    const service = new FieldEncryptionService("test-key-for-field-specs");
    const first = service.encrypt("alice@example.test") as string;
    const second = service.encrypt("alice@example.test") as string;

    expect(first).not.toBe(second);
    expect(service.decrypt(first)).toBe("alice@example.test");
    expect(service.decrypt(second)).toBe("alice@example.test");
  });

  it("passes legacy plaintext rows through decrypt unchanged", () => {
    const service = new FieldEncryptionService("test-key-for-field-specs");

    expect(service.decrypt("alice@example.test")).toBe("alice@example.test");
    expect(service.isEncrypted("alice@example.test")).toBe(false);
  });

  it("preserves null and empty values", () => {
    const service = new FieldEncryptionService("test-key-for-field-specs");

    expect(service.encrypt(null)).toBeNull();
    expect(service.decrypt(null)).toBeNull();
    expect(service.encrypt("")).toBe("");
    expect(service.decrypt("")).toBe("");
  });

  it("supports a 64-char hex key", () => {
    const hexKey =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const service = new FieldEncryptionService(hexKey);
    const ciphertext = service.encrypt("bob@example.test") as string;

    expect(service.decrypt(ciphertext)).toBe("bob@example.test");
  });
});
