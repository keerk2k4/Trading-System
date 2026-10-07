import { Body, Controller, HttpCode, HttpStatus, Post, Res, UseGuards } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { Response } from "express";
import { NotificationEmailRequest } from "../dtos/NotificationEmailRequest";
import { ErrorResponse } from "../dtos/ErrorResponse";
import { InternalServiceGuard } from "../guards/InternalServiceGuard";
import { UserRepository } from "../repositories/UserRepository";
import { NotificationService } from "../services/NotificationService";

/**
 * Service-to-service routes, called by order-service only (InternalServiceGuard)
 * and kept out of the public API document and contract, like order-service's
 * own /internal routes.
 *
 * order-service owns notifications but not contact details: it names the user,
 * and the address is resolved and decrypted here, so it never leaves this
 * service.
 */
@ApiExcludeController()
@Controller("internal/notifications")
@UseGuards(InternalServiceGuard)
export class InternalNotificationController {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly notificationService: NotificationService,
  ) {}

  /** 200 when the mail server accepted the email, 404 for an unknown user, 502 when it could not be sent. */
  @Post("email")
  @HttpCode(HttpStatus.OK)
  async sendEmail(@Body() request: NotificationEmailRequest, @Res() res: Response): Promise<void> {
    const user = await this.userRepository.findByUserId(request.userId);
    if (!user) {
      const notFound: ErrorResponse = { errorCode: "AUTH-404", message: "User not found" };
      res.status(HttpStatus.NOT_FOUND).json(notFound);
      return;
    }

    const sent = await this.notificationService.sendTradeNotification(
      user.userId,
      user.email,
      user.userName,
      request.subject,
      request.message,
    );
    if (!sent) {
      const failed: ErrorResponse = { errorCode: "MAIL-502", message: "The email could not be sent" };
      res.status(HttpStatus.BAD_GATEWAY).json(failed);
      return;
    }
    res.status(HttpStatus.OK).json({ sent: true });
  }
}
