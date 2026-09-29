import { Inject, Injectable, Optional } from "@nestjs/common";
import * as crypto from "crypto";

export const EMAIL_ENCRYPTION_KEY_TOKEN = "EMAIL_ENCRYPTION_KEY";

/**
 * Reversible AES-256-GCM encryption for PII (email) at rest.
 *
 * - Encrypt on write (UserRepository.create), decrypt on read (mapRowToUser).
 * - Domain layer keeps working with plaintext email; only the DB column
 *   holds ciphertext in the form `ivHex:authTagHex:dataHex`.
 * - Randomized 12-byte IV per row => same email encrypts differently each
 *   time, so UNIQUE / indexed plaintext lookup on the column is no longer
 *   possible (see migrations/011). Lookup stays by user_name / user_id.
 * - Key from EMAIL_ENCRYPTION_KEY env:
 *     - 64 hex chars => used directly as 32 bytes, or
 *     - base64 encoding 32 bytes => decoded, or
 *     - any other passphrase => SHA-256 derived to 32 bytes.
 *   Missing env falls back to a dev-only key so tests work without secrets.
 *   Set a strong EMAIL_ENCRYPTION_KEY in production.
 */
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit, recommended for GCM
const DEV_FALLBACK_PASSPHRASE = "dev-only-email-encryption-key-change-in-prod";

@Injectable()
export class EmailEncryptionService {
  private readonly key: Buffer;

  // @Optional() + explicit @Inject() is required: without it Nest reads the
  // `string | Buffer` design type as `Object` and tries to resolve an
  // `Object` provider at index [0], crashing boot with
  // "Nest can't resolve dependencies of the EmailEncryptionService (?)".
  constructor(
    @Optional()
    @Inject(EMAIL_ENCRYPTION_KEY_TOKEN)
    keyOverride?: string | Buffer,
  ) {
    this.key = EmailEncryptionService.resolveKey(
      keyOverride ?? process.env.EMAIL_ENCRYPTION_KEY,
    );
  }

  static resolveKey(input?: string | Buffer): Buffer {
    if (Buffer.isBuffer(input)) {
      if (input.length === 32) return input;
      return crypto.createHash("sha256").update(input).digest();
    }
    if (typeof input === "string" && input.length > 0) {
      const trimmed = input.trim();
      if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
        return Buffer.from(trimmed, "hex");
      }
      try {
        const asB64 = Buffer.from(trimmed, "base64");
        if (asB64.length === 32 && trimmed.length >= 40) return asB64;
      } catch {
        // fall through to passphrase derivation
      }
      return crypto.createHash("sha256").update(trimmed, "utf8").digest();
    }
    return crypto
      .createHash("sha256")
      .update(DEV_FALLBACK_PASSPHRASE, "utf8")
      .digest();
  }

  isEncrypted(value: string | null | undefined): boolean {
    if (typeof value !== "string" || value === "") return false;
    const parts = value.split(":");
    if (parts.length !== 3) return false;
    const [ivHex, tagHex, dataHex] = parts;
    return (
      /^[0-9a-fA-F]+$/.test(ivHex) &&
      /^[0-9a-fA-F]+$/.test(tagHex) &&
      /^[0-9a-fA-F]+$/.test(dataHex) &&
      ivHex.length === IV_LENGTH * 2 &&
      tagHex.length === 16 * 2
    );
  }

  encrypt(plaintext: string | null | undefined): string | null {
    if (plaintext === null || plaintext === undefined) return plaintext as any;
    if (plaintext === "") return "";
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
  }

  decrypt(ciphertext: string | null | undefined): string | null {
    if (ciphertext === null || ciphertext === undefined)
      return ciphertext as any;
    if (ciphertext === "") return "";
    // Backward compatibility: rows written before encryption are plaintext
    // (no iv:tag:data shape) and must keep reading during migration.
    if (!this.isEncrypted(ciphertext)) return ciphertext;
    try {
      const [ivHex, tagHex, dataHex] = ciphertext.split(":");
      const iv = Buffer.from(ivHex, "hex");
      const tag = Buffer.from(tagHex, "hex");
      const data = Buffer.from(dataHex, "hex");
      const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([
        decipher.update(data),
        decipher.final(),
      ]);
      return decrypted.toString("utf8");
    } catch {
      // Wrong key / corrupted row: fail closed would outage logins that do
      // not even need email; surface ciphertext is worse, so return as-is
      // and let callers treat it as opaque. Auth flow never depends on it.
      return ciphertext;
    }
  }
}
