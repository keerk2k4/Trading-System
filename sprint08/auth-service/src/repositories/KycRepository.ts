import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { Kyc } from "../entities/Kyc";

@Injectable()
export class KycRepository {
  constructor(private databaseService: DatabaseService) {}

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
      `INSERT INTO auth.kyc (user_id, status, date_of_birth, document_type, document_number)
       VALUES ($1, 'PENDING', $2::date, $3, $4)
       RETURNING *`,
      [input.userId, input.dateOfBirth, input.documentType, input.documentNumber],
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

  private mapRowToKyc(row: any): Kyc {
    return {
      id: row.id,
      userId: row.user_id,
      status: row.status,
      dateOfBirth: row.date_of_birth,
      documentType: row.document_type,
      documentNumber: row.document_number,
      submittedAt: row.submitted_at,
      reviewedAt: row.reviewed_at,
      reviewedBy: row.reviewed_by,
      rejectionReason: row.rejection_reason,
    };
  }
}
