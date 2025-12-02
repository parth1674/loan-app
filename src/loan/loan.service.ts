// src/loan/loan.service.ts

import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { interestForPeriod } from '../common/interest.util';
import { getNextPaymentDate } from './loan.helpers';
import {
  PaymentType,
  PaymentFrequency,
  LoanStatus,
} from '@prisma/client';

@Injectable()
export class LoanService {
  constructor(private prisma: PrismaService) { }

  // =========================================================================
  // CREATE LOAN (ADMIN)
  // =========================================================================
  async createLoan(
    userId: string,
    principal: number,
    annualRate: number,
    termDays: number,
    startDate?: Date,
    paymentFrequency?: PaymentFrequency,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new BadRequestException('User not found');

    const sDate = startDate ?? new Date();
    const dueDate = new Date(sDate);
    dueDate.setDate(dueDate.getDate() + termDays);

    const nextPaymentDate =
      paymentFrequency && paymentFrequency !== 'FLEXIBLE'
        ? getNextPaymentDate(sDate, paymentFrequency)
        : null;

    const loan = await this.prisma.loan.create({
      data: {
        userId,
        principal,
        annualRatePct: annualRate,
        termDays,
        startDate: sDate,
        dueDate,
        nextPaymentDate,
        outstanding: principal,
        interestAccrued: 0,
        paymentFrequency: paymentFrequency ?? 'FLEXIBLE',
      },
    });

    return {
      message: 'Loan created successfully',
      loan,
    };
  }

  // =========================================================================
  // ACCRUE INTEREST FOR A SPECIFIC LOAN
  // =========================================================================
  async accrueInterestForLoan(loanId: string, upto?: Date) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const loan = await tx.loan.findUnique({
        where: { id: loanId },
      });

      if (!loan) throw new BadRequestException('Loan not found');

      const lastDate = loan.lastAccruedAt ?? loan.startDate;
      const current = upto ?? new Date();

      const days = Math.floor(
        (current.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      const interest = interestForPeriod(
        Number(loan.outstanding),
        Number(loan.annualRatePct),
        new Date(lastDate),
        new Date(current)
      );

      const newOutstanding = Number(loan.outstanding) + interest;

      const newLoan = await tx.loan.update({
        where: { id: loanId },
        data: {
          interestAccrued: Number(loan.interestAccrued) + interest,
          outstanding: newOutstanding,
          lastAccruedAt: current,
        },
      });

      // Overdue logic
      const now = new Date();
      let statusUpdate: LoanStatus | null = null;

      if (newLoan.dueDate && now > new Date(newLoan.dueDate)) {
        statusUpdate = 'OVERDUE';
      } else if (
        newLoan.paymentFrequency !== 'FLEXIBLE' &&
        newLoan.nextPaymentDate &&
        now > new Date(newLoan.nextPaymentDate)
      ) {
        statusUpdate = 'OVERDUE';
      }

      if (statusUpdate) {
        await tx.loan.update({
          where: { id: loanId },
          data: { status: statusUpdate },
        });
      }

      return newLoan;
    });

    return {
      message: 'Interest accrued',
      loan: updated,
    };
  }

  // =========================================================================
  // ACCRUE INTEREST FOR ALL LOANS
  // =========================================================================
  async accrueAllLoans() {
    const loans = await this.prisma.loan.findMany({
      where: { status: 'ACTIVE' },
    });

    const results: any[] = [];

    for (const l of loans) {
      const r = await this.accrueInterestForLoan(l.id, new Date());
      results.push(r);
    }

    return results;
  }

  // =========================================================================
  // GET USER LOANS
  // =========================================================================
  async getUserLoans(userId: string) {
    return this.prisma.loan.findMany({
      where: { userId },
      include: { payments: true },
    });
  }

  // =========================================================================
  // RECORD PAYMENT
  // =========================================================================
  async payLoan(
    loanId: string,
    amount: number,
    type: PaymentType = PaymentType.EMI,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const freshLoan = await tx.loan.findUnique({
        where: { id: loanId },
      });

      if (!freshLoan) throw new BadRequestException('Loan not found');

      const newOutstanding = Number(freshLoan.outstanding) - amount;

      await tx.payment.create({
        data: { loanId, amount, type },
      });

      // Next payment date
      let nextPaymentDate =
        freshLoan.nextPaymentDate &&
          new Date(freshLoan.nextPaymentDate) > new Date()
          ? new Date(freshLoan.nextPaymentDate)
          : null;

      if (freshLoan.paymentFrequency !== 'FLEXIBLE') {
        const base =
          nextPaymentDate && new Date(nextPaymentDate) > new Date()
            ? new Date(nextPaymentDate)
            : new Date();

        const computed = getNextPaymentDate(
          base,
          freshLoan.paymentFrequency,
        );

        nextPaymentDate = computed;
      }

      const updatedLoan = await tx.loan.update({
        where: { id: loanId },
        data: {
          outstanding: Math.max(newOutstanding, 0),
          status: newOutstanding <= 0 ? 'CLOSED' : freshLoan.status,
          nextPaymentDate: nextPaymentDate,
        },
      });

      return {
        message: 'Payment recorded',
        paymentApplied: amount,
        interestAccrued: freshLoan.interestAccrued,
        updatedLoan,
      };
    });
  }

  // ===============================
  // USER DASHBOARD SUMMARY
  // ===============================
  async getDashboard(userId: string) {
    const loans = await this.prisma.loan.findMany({
      where: { userId },
      include: { payments: true },
    });

    if (!loans || loans.length === 0) {
      return {
        message: 'No loans found for this user',
        activeLoanCount: 0,
        totalOutstanding: 0,
        totalInterestAccrued: 0,
        nextPaymentDate: null,
        loans: [],
      };
    }

    // SAFER VARIABLES
    let totalOutstanding = 0;
    let totalInterest = 0;
    let nextPaymentDate: Date | null = null;

    for (const l of loans) {
      // prevent crash if values are null or undefined
      const outstanding = Number(l.outstanding ?? 0);
      const interest = Number(l.interestAccrued ?? 0);

      totalOutstanding += isNaN(outstanding) ? 0 : outstanding;
      totalInterest += isNaN(interest) ? 0 : interest;

      // next payment date check
      if (l.nextPaymentDate) {
        const parsed = new Date(l.nextPaymentDate);
        if (!isNaN(parsed.getTime())) {
          if (!nextPaymentDate || parsed < nextPaymentDate) {
            nextPaymentDate = parsed;
          }
        }
      }
    }

    return {
      message: 'Dashboard fetched successfully',
      activeLoanCount: loans.filter(l => l.status === 'ACTIVE').length,
      totalOutstanding,
      totalInterestAccrued: totalInterest,
      nextPaymentDate,
      loans,
    };
  }


  // ============= USER LOAN LIST =============
  async getUserLoanList(userId: string, query: any) {
    const {
      status,
      frequency,
      sort,
      page = 1,
      limit = 10,
    } = query;

    const where: any = {
      userId,
    };

    if (status) where.status = status;
    if (frequency) where.paymentFrequency = frequency;

    const skip = (page - 1) * limit;

    const orderBy: any = {};

    if (sort === 'createdAt_desc') orderBy.createdAt = 'desc';
    if (sort === 'createdAt_asc') orderBy.createdAt = 'asc';
    if (sort === 'outstanding_desc') orderBy.outstanding = 'desc';
    if (sort === 'outstanding_asc') orderBy.outstanding = 'asc';

    const loans = await this.prisma.loan.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy,
      include: { payments: true },
    });

    return {
      message: 'User loan list fetched',
      count: loans.length,
      loans,
    };
  }


  // ============= ADMIN LOAN LIST =============
  async getAdminLoanList(query: any) {
    const {
      userId,
      status,
      overdueOnly,
      minOutstanding,
      maxOutstanding,
      startDate,
      endDate,
      sort,
      page = 1,
      limit = 20,
    } = query;

    const where: any = {};

    if (userId) where.userId = userId;
    if (status) where.status = status;

    if (overdueOnly === 'true') where.status = 'OVERDUE';

    if (minOutstanding) where.outstanding = { gte: Number(minOutstanding) };
    if (maxOutstanding)
      where.outstanding = Object.assign(where.outstanding || {}, {
        lte: Number(maxOutstanding),
      });

    if (startDate)
      where.createdAt = { gte: new Date(startDate) };

    if (endDate)
      where.createdAt = Object.assign(where.createdAt || {}, {
        lte: new Date(endDate),
      });

    const skip = (page - 1) * limit;

    const orderBy: any = {};
    if (sort === 'createdAt_desc') orderBy.createdAt = 'desc';
    if (sort === 'createdAt_asc') orderBy.createdAt = 'asc';
    if (sort === 'outstanding_desc') orderBy.outstanding = 'desc';
    if (sort === 'outstanding_asc') orderBy.outstanding = 'asc';

    const loans = await this.prisma.loan.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy,
      include: { payments: true, user: true },
    });

    return {
      message: 'Admin loan list fetched',
      total: loans.length,
      loans,
    };
  }

  async getAdminSummary() {
    const totalUsers = await this.prisma.user.count();
    const pendingUsers = await this.prisma.user.count({ where: { status: "PENDING" } });
    const activeUsers = await this.prisma.user.count({ where: { status: "ACTIVE" } });

    const totalLoans = await this.prisma.loan.count();
    const activeLoans = await this.prisma.loan.count({ where: { status: "ACTIVE" } });
    const overdueLoans = await this.prisma.loan.count({ where: { status: "OVERDUE" } });

    const totalOutstanding = await this.prisma.loan.aggregate({
      _sum: { outstanding: true },
    });

    return {
      totalUsers,
      pendingUsers,
      activeUsers,

      totalLoans,
      activeLoans,
      overdueLoans,

      totalOutstanding: Number(totalOutstanding._sum.outstanding || 0),
    };
  }


}
