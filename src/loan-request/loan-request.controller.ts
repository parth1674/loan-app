import {
  Controller,
  Post,
  Body,
  Req,
  Get,
  UseGuards,
  Param,
} from "@nestjs/common";
import { LoanRequestService } from "./loan-request.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "../auth/roles.guard";
import { CreateLoanRequestDto } from "../loan/dto/create-loan-request.dto";

@Controller("loan-request")
export class LoanRequestController {
  constructor(private readonly service: LoanRequestService) {}

  // ======================================================
  // CLIENT → APPLY FOR LOAN
  // ======================================================
  @UseGuards(JwtAuthGuard)
  @Post()
  async apply(
    @Req() req: any,
    @Body() body: CreateLoanRequestDto,
  ) {
    return this.service.createLoanRequest(req.user.id, body);
  }

  // ======================================================
  // CLIENT → VIEW MY LOAN REQUESTS
  // ======================================================
  @UseGuards(JwtAuthGuard)
  @Get("my")
  async myRequests(@Req() req: any) {
    return this.service.getMyRequests(req.user.id);
  }

  // ======================================================
  // ADMIN → VIEW ALL LOAN REQUESTS
  // ======================================================
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get("admin")
  async getAllRequests() {
    return this.service.getAllRequests();
  }

  // ======================================================
  // ADMIN → APPROVE LOAN REQUEST
  // ======================================================
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post(":id/approve")
  async approveRequest(
    @Param("id") id: string,
    @Body("adminNote") adminNote?: string,
  ) {
    return this.service.approveRequest(id, adminNote);
  }

  // ======================================================
  // ADMIN → REJECT LOAN REQUEST
  // ======================================================
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post(":id/reject")
  async rejectRequest(
    @Param("id") id: string,
    @Body("adminNote") adminNote?: string,
  ) {
    return this.service.rejectRequest(id, adminNote);
  }
}
