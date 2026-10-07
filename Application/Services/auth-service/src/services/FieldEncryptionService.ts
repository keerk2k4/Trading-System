import { Inject, Injectable, Optional } from "@nestjs/common";
import * as crypto from "crypto";

export const FIELD_ENCRYPTION_KEY_TOKEN = "FIELD_ENCRYPTION_KEY";

/**
 * Reversible AES-256-GCM encryption for any PII field stored at rest.
 *
 * Currently used for:
 * - auth.users.email, phone                              (UserRepository)
 * - auth.kyc.date_of_birth, document_type, document_number (KycRepository)
 *
 * Because ciphertext is randomized, uniqueness is enforced on a separate
 * lookup hash (see lookupHash): auth.users.phone_lookup_hash and
 * auth.kyc.document_lookup_hash, each with a UNIQUE index (migration 018).
 *
 * - Repositories encrypt on write and decrypt on read, so the rest of the
 *   service only ever sees plaintext; the DB column holds ciphertext in the
 *   form `ivHex:authTagHex:dataHex` (columns must be TEXT, see migration 017).
 * - Randomized 12-byte IV per value => the same plaintext encrypts
 *   differently each time, so an encrypted column cannot be searched,
 *   indexed or made UNIQUE. Look rows up by user_id / user_name instead.
 * - Key from FIELD_ENCRYPTION_KEY env (EMAIL_ENCRYPTION_KEY is still read as
 *   a fallback for existing deployments):
 *     - 64 hex chars => used directly as 32 bytes, or
 *     - base64 encoding 32 bytes => decoded, or
 *     - any other passphrase => SHA-256 derived to 32 bytes.
 *   Missing env falls back to a dev-only key so tests work without secrets.
 *   Set a strong key in production, and never change it without
 *   re-encrypting existing rows, or they can no longer be decrypted.
 */
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit, recommended for GCM
const DEV_FALLBACK_PASSPHRASE = "dev-only-email-encryption-key-change-in-prod";

@Injectable()
export class FieldEncryptionService {
  private readonly key: Buffer;
  // Separate from the encryption key so a leaked lookup hash says nothing
  // about the ciphertext key. FIELD_LOOKUP_KEY may set it explicitly;
  // otherwise it is derived from the encryption key.
  private readonly lookupKey: Buffer;

  // @Optional() + explicit @Inject() is required: without it Nest reads the
  // `string | Buffer` design type as `Object` and tries to resolve an
  // `Object` provider at index [0], crashing boot with
  // "Nest can't resolve dependencies of the FieldEncryptionService (?)".
  constructor(
    @Optional()
    @Inject(FIELD_ENCRYPTION_KEY_TOKEN)
    keyOverride?: string | Buffer,
  ) {
    this.key = FieldEncryptionService.resolveKey(
      keyOverride ?? process.env.FIELD_ENCRYPTION_KEY ?? process.env.EMAIL_ENCRYPTION_KEY,
    );
    this.lookupKey =
      !keyOverride && process.env.FIELD_LOOKUP_KEY
        ? FieldEncryptionService.resolveKey(process.env.FIELD_LOOKUP_KEY)
        : crypto.createHmac("sha256", this.key).update("field-lookup-hash-v1").digest();
  }

  /**
   * Deterministic, non-reversible fingerprint (HMAC-SHA256, hex) of already
   * normalized values. The same input always gives the same hash, so it can
   * be indexed UNIQUE and compared in SQL, unlike the randomized ciphertext.
   * Callers normalize first (case, spaces, punctuation) so equivalent values
   * collide. Never change the lookup key without recomputing every hash.
   */
  lookupHash(...parts: string[]): string {
    return crypto.createHmac("sha256", this.lookupKey).update(parts.join("\u001f"), "utf8").digest("hex");
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
      // Wrong key / corrupted row: failing closed would take down logins
      // that do not even need the field, so return it as-is and let
      // callers treat it as opaque. The auth flow never depends on it.
      return ciphertext;
    }
  }
}
