// src/loan/loan.controller.ts

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { LoanService } from './loan.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { PayDto } from './dto/pay.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { InterestService } from '../interest/interest.service';

@Controller('loan')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LoanController {
  constructor(
    private loanService: LoanService,
    private interestService: InterestService,
  ) { }

  // ============================
  // ADMIN: CREATE LOAN FOR USER
  // ============================
  @Roles('ADMIN')
  @Post('create/:userId')
  async createLoan(
    @Param('userId') userId: string,
    @Body() dto: CreateLoanDto,
  ) {
    return this.loanService.createLoan(
      userId,
      dto.principal,
      dto.annualRate,
      dto.termDays,
      dto.startDate ? new Date(dto.startDate) : undefined,
      dto.paymentFrequency,
    );
  }

  // ==============================================
  // ADMIN: GET ALL LOANS OF USER (RAW LIST)
  // (OPTIONAL: you can limit this to ADMIN only)
  // ==============================================
  @Roles('ADMIN')
  @Get('user/:userId')
  async getLoans(@Param('userId') userId: string) {
    return this.loanService.getUserLoans(userId);
  }

  // ============================
  // CLIENT / ADMIN: MAKE PAYMENT
  // (CLIENT apna loan pay kare, ADMIN bhi kar sakta)
  // ============================
  @Roles('CLIENT', 'ADMIN')
  @Post('pay/:loanId')
  async payLoan(
    @Param('loanId') loanId: string,
    @Body() body: PayDto,
    @Req() req: any,
  ) {
    // NOTE: Agar ownership enforce karna ho to:
    // - yahan se loan fetch karo
    // - check karo loan.userId === req.user.id OR role === ADMIN
    // Abhi sirf role-check kar rahe hain, ownership baad me add kar sakte hain.
    return this.loanService.payLoan(loanId, body.amount, body.type as any);
  }

  // ============================
  // ADMIN: ACCRUE SINGLE LOAN
  // ============================
  @Roles('ADMIN')
  @Post('accrue/:loanId')
  async accrue(@Param('loanId') loanId: string) {
    return this.interestService.accrueDailyInterest(loanId);
  }

  // ============================
  // ADMIN: ACCRUE ALL LOANS
  // ============================
  @Roles('ADMIN')
  @Post('accrue-all')
  async accrueAll() {
    return this.interestService.accrueDailyInterestForAll();
  }

  // ============================================
  // CLIENT + ADMIN: USER DASHBOARD
  // - CLIENT sirf apna userId access kare
  // - ADMIN kisi ka bhi dekh sakta
  // ============================================
  @Roles('CLIENT', 'ADMIN')
  @Get('dashboard/:userId')
  getDashboard(
    @Param('userId') userId: string,
    @Req() req: any,
  ) {
    if (req.user.role === 'CLIENT' && req.user.id !== userId) {
      throw new ForbiddenException('Not allowed to view this dashboard');
    }
    return this.loanService.getDashboard(userId);
  }

  // ============================
  // ADMIN: MANUAL INTEREST ACCRUAL TEST
  // ============================
  @Roles('ADMIN')
  @Get('test-accrue')
  async runAccrual() {
    return this.interestService.accrueDailyInterestForAll();
  }

  // ======================================
  // CLIENT + ADMIN: USER LOANS LIST (WITH FILTERS)
  // - CLIENT sirf apna data
  // - ADMIN kisi ka bhi
  // ======================================
  @Roles('CLIENT', 'ADMIN')
  @Get('my-loans/:userId')
  getUserLoansList(
    @Param('userId') userId: string,
    @Query('status') status?: string,
    @Query('frequency') frequency?: string,
    @Query('sort') sort?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Req() req?: any,
  ) {
    if (req.user.role === 'CLIENT' && req.user.id !== userId) {
      throw new ForbiddenException('Not allowed to view other user loans');
    }

    return this.loanService.getUserLoanList(userId, {
      status,
      frequency,
      sort,
      page,
      limit,
    });
  }

  // ======================================
  // ADMIN: GLOBAL LOAN LIST (FILTER + PAGINATION)
  // ======================================
  @Roles('ADMIN')
  @Get('admin-list')
  getAllLoans(
    @Query('userId') userId?: string,
    @Query('status') status?: string,
    @Query('overdueOnly') overdueOnly?: string,
    @Query('minOutstanding') minOutstanding?: string,
    @Query('maxOutstanding') maxOutstanding?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('sort') sort?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.loanService.getAdminLoanList({
      userId,
      status,
      overdueOnly,
      minOutstanding,
      maxOutstanding,
      startDate,
      endDate,
      sort,
      page,
      limit,
    });
  }

  @Get('admin-summary')
  @UseGuards(JwtAuthGuard, RolesGuard) // applying guards at method level
  @Roles('ADMIN')
  getAdminSummary() {
    return this.loanService.getAdminSummary();
  }

  @Post('accrue-interest')
  @UseGuards(JwtAuthGuard)
  async forceAccrue() {
    return this.interestService.accrueDailyInterestForAll();
  }

  @Roles('CLIENT', 'ADMIN')
  @Get('interest/summary/:userId')
  getInterestSummary(
    @Param('userId') userId: string,
    @Req() req: any,
  ) {
    if (req.user.role === 'CLIENT' && req.user.id !== userId) {
      throw new ForbiddenException('Not allowed to view this interest summary');
    }

    return this.interestService.getUserInterestSummary(userId);
  }

  @Roles('CLIENT', 'ADMIN')
  @Get(':loanId/interest-history')
  async getInterestHistory(
    @Param('loanId') loanId: string,
    @Req() req: any,
  ) {
    if (req.user.role === 'CLIENT') {
      const loan = await this.loanService.getLoanAmounts(loanId);
      if ((loan as any).userId && (loan as any).userId !== req.user.id) {
        throw new ForbiddenException('Not allowed to view this interest history');
      }
    }

    return this.interestService.getLoanInterestHistory(loanId);
  }

  @Get(':id/schedule')
  async getSchedule(@Param('id') id: string) {
    return this.loanService.getAmortizationSchedule(id);
  }

  @Post("apply-late-fee")
  applyLateFeeManual() {
    return this.loanService.applyLateFees();
  }

  @Get("detect-npa")
  async detectAndMarkNPA() {
    await this.loanService.detectAndMarkNPA();
    return { message: "NPA detection done" };
  }

  @Get("risk/:loanId")
  async getLoanRisk(@Param("loanId") loanId: string) {
    return this.loanService.calculateLoanRiskScore(loanId);
  }
}
