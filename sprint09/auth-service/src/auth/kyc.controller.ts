import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Response } from "express";
import { CreateKycRequest } from "../dtos/CreateKycRequest";
import { ErrorResponse } from "../dtos/ErrorResponse";
import { KycResponse } from "../dtos/KycResponse";
import { UpdateKycRequest, KycReviewStatus } from "../dtos/UpdateKycRequest";
import { BearerGuard } from "../guards/BearerGuard";
import { AuthenticatedUser, CurrentUser } from "../guards/CurrentUser";
import { KycRepository } from "../repositories/KycRepository";
import { UserRepository } from "../repositories/UserRepository";
import { TradeApiClient } from "../services/TradeApiClient";
import { NotificationService } from "../services/NotificationService";

@Controller("kyc")
@ApiTags("KYC")
export class KycController {
  constructor(
    private kycRepository: KycRepository,
    private userRepository: UserRepository,
    private tradeApiClient: TradeApiClient,
    private notificationService: NotificationService,
  ) {}

  @Post()
  @UseGuards(BearerGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Submit KYC details for the authenticated user" })
  @ApiResponse({ status: 201, description: "KYC submitted.", type: KycResponse })
  @ApiResponse({ status: 401, description: "Unauthorised", type: ErrorResponse })
  @ApiResponse({ status: 403, description: "Forbidden", type: ErrorResponse })
  @ApiResponse({ status: 409, description: "KYC already submitted", type: ErrorResponse })
  @ApiResponse({ status: 422, description: "Invalid input", type: ErrorResponse })
  async createKyc(
    @CurrentUser() claims: AuthenticatedUser,
    @Body() request: CreateKycRequest,
    @Res() res: Response,
  ): Promise<void> {
    try {
      if (!claims) {
        const response: ErrorResponse = { errorCode: "AUTH-401", message: "Unauthorised" };
        res.status(401).json(response);
        return;
      }

      const roles = claims.roles ?? [];
      const hasCustomerRole = roles.some((role) => role?.toUpperCase() === "CUSTOMER");
      const hasAdminRole = roles.some((role) => role?.toUpperCase() === "ADMIN");
      if (!hasCustomerRole || hasAdminRole) {
        const response: ErrorResponse = { errorCode: "AUTH-403", message: "Forbidden" };
        res.status(403).json(response);
        return;
      }

      const existing = await this.kycRepository.findByUserId(claims.sub);
      if (existing) {
        const response: ErrorResponse = {
          errorCode: "KYC-409",
          message: "KYC already submitted",
        };
        res.status(409).json(response);
        return;
      }

      const user = await this.userRepository.findByUserId(claims.sub);
      if (!user) {
        const response: ErrorResponse = { errorCode: "AUTH-401", message: "Unauthorised" };
        res.status(401).json(response);
        return;
      }

      const created = await this.kycRepository.createSubmission({
        userId: claims.sub,
        dateOfBirth: request.dateOfBirth,
        documentType: request.documentType,
        documentNumber: request.documentNumber,
      });

      const response: KycResponse = {
        id: created.id,
        userId: created.userId,
        status: created.status,
        dateOfBirth: created.dateOfBirth,
        documentType: created.documentType,
        documentNumber: created.documentNumber,
        submittedAt: created.submittedAt,
        reviewedAt: created.reviewedAt,
        reviewedBy: created.reviewedBy,
        rejectionReason: created.rejectionReason,
      };

      // Fire and forget: a mail outage must not fail the KYC submission.
      void this.notificationService.sendKycSubmitted(user.userId, user.email, user.userName);

      res.status(201).json(response);
    } catch (error) {
      console.error("Create KYC error:", error);
      const response: ErrorResponse = { errorCode: "VAL-422", message: "Invalid input" };
      res.status(422).json(response);
    }
  }

  @Patch()
  @UseGuards(BearerGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Review KYC status (admin only)" })
  @ApiResponse({ status: 200, description: "KYC reviewed.", type: KycResponse })
  @ApiResponse({ status: 401, description: "Unauthorised", type: ErrorResponse })
  @ApiResponse({ status: 403, description: "Forbidden", type: ErrorResponse })
  @ApiResponse({ status: 404, description: "KYC not found", type: ErrorResponse })
  @ApiResponse({ status: 422, description: "Invalid input", type: ErrorResponse })
  async reviewKyc(
    @CurrentUser() claims: AuthenticatedUser,
    @Body() request: UpdateKycRequest,
    @Res() res: Response,
  ): Promise<void> {
    try {
      if (!claims) {
        const response: ErrorResponse = { errorCode: "AUTH-401", message: "Unauthorised" };
        res.status(401).json(response);
        return;
      }

      const roles = claims.roles ?? [];
      const isAdmin = roles.some((role) => role?.toUpperCase() === "ADMIN");
      if (!isAdmin) {
        const response: ErrorResponse = { errorCode: "AUTH-403", message: "Forbidden" };
        res.status(403).json(response);
        return;
      }

      const kyc = await this.kycRepository.findByUserId(request.userId);
      if (!kyc) {
        const response: ErrorResponse = { errorCode: "KYC-404", message: "KYC record not found" };
        res.status(404).json(response);
        return;
      }

      if (kyc.status === "APPROVED") {
        const response: ErrorResponse = { errorCode: "KYC-409", message: "KYC already approved" };
        res.status(409).json(response);
        return;
      }

      const reviewed = await this.kycRepository.reviewSubmission({
        userId: request.userId,
        status: request.status,
        reviewedBy: claims.sub,
        rejectionReason: request.status === KycReviewStatus.REJECTED ? request.rejectionReason ?? null : null,
      });

      if (!reviewed) {
        const response: ErrorResponse = { errorCode: "KYC-404", message: "KYC record not found" };
        res.status(404).json(response);
        return;
      }

      let accountId: number | undefined;
      if (request.status === KycReviewStatus.APPROVED) {
        const account = await this.tradeApiClient.activateAccount(request.userId);
        accountId = account.accountId;
      }

      const response: KycResponse = {
        id: reviewed.id,
        userId: reviewed.userId,
        status: reviewed.status,
        dateOfBirth: reviewed.dateOfBirth,
        documentType: reviewed.documentType,
        documentNumber: reviewed.documentNumber,
        submittedAt: reviewed.submittedAt,
        reviewedAt: reviewed.reviewedAt,
        reviewedBy: reviewed.reviewedBy,
        rejectionReason: reviewed.rejectionReason,
        accountId,
      };

      void this.notifyApplicantOfReview(reviewed.userId, reviewed.status, reviewed.rejectionReason);

      res.status(200).json(response);
    } catch (error) {
      console.error("Review KYC error:", error);
      const response: ErrorResponse = { errorCode: "VAL-422", message: "Invalid input" };
      res.status(422).json(response);
    }
  }

  // Emails the applicant (not the reviewing admin) the review outcome.
  // Best-effort: any failure is logged and never affects the review response.
  private async notifyApplicantOfReview(
    userId: string,
    status: string,
    rejectionReason: string | null,
  ): Promise<void> {
    try {
      const applicant = await this.userRepository.findByUserId(userId);
      if (!applicant) {
        return;
      }

      if (status === KycReviewStatus.APPROVED) {
        await this.notificationService.sendKycApproved(applicant.userId, applicant.email, applicant.userName);
      } else if (status === KycReviewStatus.REJECTED) {
        await this.notificationService.sendKycRejected(
          applicant.userId,
          applicant.email,
          applicant.userName,
          rejectionReason,
        );
      }
    } catch (error) {
      console.error(`KYC review notification failed for user ${userId}:`, (error as Error)?.message);
    }
  }
}
