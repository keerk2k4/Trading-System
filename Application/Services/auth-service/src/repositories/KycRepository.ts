import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { Kyc } from "../entities/Kyc";
import { FieldEncryptionService } from "../services/FieldEncryptionService";

// Name of the UNIQUE index on document_lookup_hash (migration 018). Postgres
// reports it as `constraint` on a 23505 unique-violation error.
export const DOCUMENT_UNIQUE_INDEX = "uq_auth_kyc_document_lookup_hash";

// date_of_birth, document_type and document_number are stored AES-256-GCM
// encrypted (FieldEncryptionService): encrypted on insert/update, decrypted
// in mapRowToKyc(). Never filter or sort by them in SQL. "One document per
// user" is enforced on document_lookup_hash, a fingerprint of type + number.
@Injectable()
export class KycRepository {
  constructor(
    private databaseService: DatabaseService,
    private fieldEncryption: FieldEncryptionService,
  ) {}

  async findByUserId(userId: string): Promise<Kyc | null> {
    const result = await this.databaseService.query(
      "SELECT * FROM auth.kyc WHERE user_id = $1",
      [userId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToKyc(result.rows[0]);
  }

  async createSubmission(input: {
    userId: string;
    dateOfBirth: string;
    documentType: string;
    documentNumber: string;
  }): Promise<Kyc> {
    const result = await this.databaseService.query(
      `INSERT INTO auth.kyc (user_id, status, date_of_birth, document_type, document_number, document_lookup_hash)
       VALUES ($1, 'PENDING', $2, $3, $4, $5)
       RETURNING *`,
      [
        input.userId,
        this.fieldEncryption.encrypt(input.dateOfBirth),
        this.fieldEncryption.encrypt(input.documentType),
        this.fieldEncryption.encrypt(input.documentNumber),
        this.documentLookupHash(input.documentType, input.documentNumber),
      ],
    );

    return this.mapRowToKyc(result.rows[0]);
  }

  async reviewSubmission(input: {
    userId: string;
    status: "APPROVED" | "REJECTED";
    reviewedBy: string;
    rejectionReason: string | null;
  }): Promise<Kyc | null> {
    const result = await this.databaseService.query(
      `UPDATE auth.kyc
       SET status = $2,
           reviewed_at = CURRENT_TIMESTAMP,
           reviewed_by = $3,
           rejection_reason = $4
       WHERE user_id = $1
       RETURNING *`,
      [input.userId, input.status, input.reviewedBy, input.rejectionReason],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToKyc(result.rows[0]);
  }

  async updateSubmissionByUserId(input: {
    userId: string;
    dateOfBirth: string;
    documentType: string;
    documentNumber: string;
  }): Promise<Kyc | null> {
    const result = await this.databaseService.query(
      `UPDATE auth.kyc
       SET date_of_birth = $2,
           document_type = $3,
           document_number = $4,
           document_lookup_hash = $5,
           status = 'PENDING',
           reviewed_at = NULL,
           reviewed_by = NULL,
           rejection_reason = NULL,
           submitted_at = CURRENT_TIMESTAMP
       WHERE user_id = $1
       RETURNING *`,
      [
        input.userId,
        this.fieldEncryption.encrypt(input.dateOfBirth),
        this.fieldEncryption.encrypt(input.documentType),
        this.fieldEncryption.encrypt(input.documentNumber),
        this.documentLookupHash(input.documentType, input.documentNumber),
      ],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToKyc(result.rows[0]);
  }

  async findAllPending(): Promise<Kyc[]> {
    const result = await this.databaseService.query(
      `SELECT *
       FROM auth.kyc
       WHERE status = 'PENDING'
       ORDER BY submitted_at ASC`,
    );

    return result.rows.map((row: any) => this.mapRowToKyc(row));
  }

  // True when a different user has already submitted this document type +
  // number. Pass the caller's own userId so re-saving their own KYC is allowed.
  async isDocumentTaken(documentType: string, documentNumber: string, excludeUserId: string): Promise<boolean> {
    const result = await this.databaseService.query(
      "SELECT 1 FROM auth.kyc WHERE document_lookup_hash = $1 AND user_id <> $2 LIMIT 1",
      [this.documentLookupHash(documentType, documentNumber), excludeUserId],
    );
    return result.rows.length > 0;
  }

  // Case, spaces and punctuation are ignored, so "p 123-4567" and "P1234567"
  // count as the same document; the type is part of the key, so the same
  // number on a different document type is allowed.
  documentLookupHash(documentType: string, documentNumber: string): string {
    const type = documentType.trim().toUpperCase();
    const number = documentNumber.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return this.fieldEncryption.lookupHash("kyc-document", type, number);
  }

  private mapRowToKyc(row: any): Kyc {
    return {
      id: row.id,
      userId: row.user_id,
      status: row.status,
      dateOfBirth: this.fieldEncryption.decrypt(row.date_of_birth) as string,
      documentType: this.fieldEncryption.decrypt(row.document_type) as string,
      documentNumber: this.fieldEncryption.decrypt(row.document_number) as string,
      submittedAt: row.submitted_at,
      reviewedAt: row.reviewed_at,
      reviewedBy: row.reviewed_by,
      rejectionReason: row.rejection_reason,
    };
  }
}
