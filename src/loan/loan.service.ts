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
import { calculateEMI } from '../common/emi.util';
import { generateAmortizationSchedule } from '../common/amortization.util';

@Injectable()
export class LoanService {
  constructor(private prisma: PrismaService) { }

  private calculateDailyInterestAmount(loan: {
    principal: unknown;
    annualRatePct: unknown;
  }) {
    const principal = Number(loan.principal || 0);
    const annualRate = Number(loan.annualRatePct || 0);

    if (principal <= 0 || annualRate <= 0) return 0;

    return Number(((principal * annualRate) / 100 / 365).toFixed(2));
  }

  private attachInterestViewFields<T extends {
    principal: unknown;
    annualRatePct: unknown;
    interestAccrued?: unknown;
    lastAccruedAt?: Date | null;
  }>(loan: T) {
    const interestAccrued = Number(loan.interestAccrued || 0);

    return {
      ...loan,
      annualRate: Number(loan.annualRatePct || 0),
      dailyInterest: this.calculateDailyInterestAmount(loan),
      interestPending: Number(interestAccrued.toFixed(2)),
      lastInterestCalculatedAt: loan.lastAccruedAt ?? null,
    };
  }

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
        lastAccruedAt: null,
        status: 'ACTIVE',
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
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
    });

    if (!loan) throw new BadRequestException('Loan not found');

    const today = upto ? new Date(upto) : new Date();
    today.setHours(0, 0, 0, 0);

    if (loan.lastAccruedAt) {
      const last = new Date(loan.lastAccruedAt);
      last.setHours(0, 0, 0, 0);

      // 🔒 SAME DAY = NO DOUBLE ACCRUAL
      if (last.getTime() === today.getTime()) {
        return {
          message: 'Already accrued for today',
          loan,
        };
      }
    }

    const principal = Number(loan.principal);
    const rate = Number(loan.annualRatePct);

    if (principal <= 0 || rate <= 0) {
      return {
        message: 'Invalid principal or rate',
        loan,
      };
    }

    // ✅ DAILY SIMPLE INTEREST (ON PRINCIPAL ONLY)
    const dailyInterest = (principal * rate) / 100 / 365;

    const newInterestAccrued =
      Number(loan.interestAccrued || 0) + dailyInterest;

    const newOutstanding = principal + newInterestAccrued;

    const updatedLoan = await this.prisma.loan.update({
      where: { id: loanId },
      data: {
        interestAccrued: newInterestAccrued,
        outstanding: newOutstanding,
        lastAccruedAt: today,
      },
    });

    // OVERDUE CHECK (safe)
    const now = new Date();
    if (
      updatedLoan.dueDate &&
      now > new Date(updatedLoan.dueDate) &&
      updatedLoan.status === 'ACTIVE'
    ) {
      await this.prisma.loan.update({
        where: { id: loanId },
        data: { status: 'OVERDUE' },
      });
    }

    return {
      message: 'Interest accrued',
      loan: updatedLoan,
    };
  }


  // =========================================================================
  // ACCRUE INTEREST FOR ALL LOANS
  // =========================================================================
  async accrueAllLoans() {
    const loans = await this.prisma.loan.findMany({
      where: {
        status: { in: ['ACTIVE', 'OVERDUE'] },
      },
    });

    const today = new Date();

    for (const l of loans) {
      await this.accrueInterestForLoan(l.id, today);
    }
  }

  // ===============================
  // SMART LATE FEE ENGINE
  // ===============================
  async applyLateFees() {
    const loans = await this.prisma.loan.findMany({
      where: { status: { in: ["ACTIVE", "OVERDUE"] } },
    });

    const today = new Date();

    for (const loan of loans) {
      if (!loan.nextPaymentDate) continue;

      const dueDate = new Date(loan.nextPaymentDate);

      // Calculate delay days
      const diffMs = today.getTime() - dueDate.getTime();
      const delayDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (delayDays <= 0) continue; // not overdue

      // ✅ Grace Period (3 days)
      if (delayDays <= 3) continue;

      let lateFee = 0;

      if (delayDays > 3 && delayDays <= 30) {
        lateFee = 500;
      } else if (delayDays > 30 && delayDays <= 60) {
        lateFee = 1000;
      } else if (delayDays > 60) {
        lateFee = 2000;
      }

      // Prevent duplicate late fee on same cycle
      if (loan.lateFeeAccrued >= lateFee) continue;

      await this.prisma.loan.update({
        where: { id: loan.id },
        data: {
          lateFeeAccrued: lateFee,
          outstanding: Number(loan.outstanding) + (lateFee - Number(loan.lateFeeAccrued || 0)),
          status: "OVERDUE",
        },
      });
    }

    return { message: "Smart late fee applied" };
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
  // =========================================================================
  // RECORD PAYMENT (FIXED LOGIC)
  // =========================================================================
  async payLoan(
    loanId: string,
    amount: number,
    type: PaymentType = PaymentType.EMI,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const loan = await tx.loan.findUnique({
        where: { id: loanId },
      });

      if (!loan) throw new BadRequestException('Loan not found');

      let remainingPayment = amount;

      let currentInterest = Number(loan.interestAccrued);
      let currentPrincipal = Number(loan.principal);

      let interestPaid = 0;     // 🔥 NEW
      let principalPaid = 0;    // 🔥 NEW

      // 1️⃣ PAY INTEREST FIRST
      if (remainingPayment >= currentInterest) {
        interestPaid = currentInterest;
        remainingPayment -= currentInterest;
        currentInterest = 0;
      } else {
        interestPaid = remainingPayment;
        currentInterest -= remainingPayment;
        remainingPayment = 0;
      }

      // 2️⃣ THEN PAY PRINCIPAL
      if (remainingPayment > 0) {
        principalPaid = Math.min(currentPrincipal, remainingPayment);
        currentPrincipal -= principalPaid;
      }

      const newOutstanding = currentPrincipal + currentInterest;

      // 🔥 SAVE PAYMENT WITH SPLIT
      await tx.payment.create({
        data: {
          loanId,
          amount,
          type,
          interestPaid,
          principalPaid,
          // Remove interestPaid and principalPaid if not in schema
        },
      });

      const updatedLoan = await tx.loan.update({
        where: { id: loanId },
        data: {
          principal: currentPrincipal,
          interestAccrued: currentInterest,
          outstanding: newOutstanding,
          status: newOutstanding <= 0 ? 'CLOSED' : loan.status,
        },
      });

      return {
        message: 'Payment recorded',
        interestPaid,
        principalPaid,
        updatedLoan,
      };
    });
  }




  // ===============================
  // USER DASHBOARD SUMMARY
  // ===============================
  async getDashboard(userId: string) {
    const loans = await this.prisma.loan.findMany({
      where: {
        userId,
        status: { in: ["ACTIVE", "OVERDUE"] }, // 🔥 important
      },
      include: { payments: true },
      orderBy: { createdAt: "desc" },
    });

    // ===============================
    // BASE CASE
    // ===============================
    if (!loans || loans.length === 0) {
      return {
        message: "No loans found for this user",
        activeLoanCount: 0,
        totalOutstanding: 0,
        totalInterestAccrued: 0,
        totalPrincipal: 0,
        interestPending: 0,
        overdueAmount: 0,
        nextPaymentDate: null,
        nextEmiAmount: 0,
        loans: [],
        totalDailyInterest: 0,
        lastInterestCalculatedAt: null,
      };
    }

    // ===============================
    // VARIABLES
    // ===============================
    let totalOutstanding = 0;
    let totalInterest = 0;
    let totalPrincipal = 0;
    let overdueAmount = 0;
    let nextPaymentDate: Date | null = null;
    let nextEmiAmount = 0;
    let totalLateFees = 0;

    // ===============================
    // LOOP
    // ===============================
    for (const l of loans) {
      const outstanding = Number(l.outstanding ?? 0);
      const interest = Number(l.interestAccrued ?? 0);
      const principal = Number(l.principal ?? 0);

      totalOutstanding += isNaN(outstanding) ? 0 : outstanding;
      totalInterest += isNaN(interest) ? 0 : interest;
      totalPrincipal += isNaN(principal) ? 0 : principal;
      totalLateFees += Number(l.lateFeeAccrued ?? 0);

      if (l.status === "OVERDUE") {
        overdueAmount += outstanding;
      }

      if (l.nextPaymentDate) {
        const parsed = new Date(l.nextPaymentDate);
        if (!isNaN(parsed.getTime())) {
          if (!nextPaymentDate || parsed < nextPaymentDate) {
            nextPaymentDate = parsed;
          }
        }
      }

      if (l.status === "ACTIVE") {
        nextEmiAmount += calculateEMI(
          Number(l.principal),
          Number(l.annualRatePct),
          l.termDays
        );
      }
    }

    // ===============================
    // DERIVED VALUES
    // ===============================
    const interestPending = totalInterest;

    const activeLoanCount = loans.filter(
      (l) => l.status === "ACTIVE"
    ).length;

    // ===============================
    // RESPONSE (BACKWARD COMPATIBLE)
    // ===============================
    return {
      message: "Dashboard fetched successfully",

      // 🔁 old fields (frontend safe)
      activeLoanCount,
      totalOutstanding: Number(totalOutstanding.toFixed(2)),
      totalInterestAccrued: Number(totalInterest.toFixed(2)),
      nextPaymentDate,
      totalDailyInterest: Number(
        loans
          .reduce((sum, loan) => sum + this.calculateDailyInterestAmount(loan), 0)
          .toFixed(2),
      ),
      lastInterestCalculatedAt:
        loans.reduce<Date | null>((latest, loan) => {
          if (!loan.lastAccruedAt) return latest;
          if (!latest || loan.lastAccruedAt > latest) return loan.lastAccruedAt;
          return latest;
        }, null),
      loans: loans.map((loan) => this.attachInterestViewFields(loan)),

      // 🆕 new fields (for new cards)
      totalPrincipal: Number(totalPrincipal.toFixed(2)),
      interestPending: Number(interestPending.toFixed(2)),
      overdueAmount: Number(overdueAmount.toFixed(2)),
      nextEmiAmount: Number(nextEmiAmount.toFixed(2)),
      totalLateFees: Number(totalLateFees.toFixed(2)),
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
      loans: loans.map((loan) => this.attachInterestViewFields(loan)),
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

    for (const loan of loans) {
      const risk = await this.calculateLoanRiskScore(loan.id);
      (loan as any).riskScore = risk.riskScore;
    }

    return {
      message: 'Admin loan list fetched',
      total: loans.length,
      loans: loans.map((loan) => this.attachInterestViewFields(loan)),
    };
  }

  async getAdminSummary() {
    await this.detectAndMarkNPA(); // Ensure NPA status is up to date before generating summary 
    // await this.accrueAllLoans();
    // ===============================
    // USERS
    // ===============================
    const totalUsers = await this.prisma.user.count();
    const pendingUsers = await this.prisma.user.count({
      where: { status: "PENDING" },
    });
    const activeUsers = await this.prisma.user.count({
      where: { status: "ACTIVE" },
    });

    // ===============================
    // LOANS COUNT
    // ===============================
    const totalLoans = await this.prisma.loan.count();

    const activeLoans = await this.prisma.loan.count({
      where: { status: "ACTIVE" },
    });

    const overdueLoans = await this.prisma.loan.count({
      where: { status: "OVERDUE" },
    });

    const runningLoans = await this.prisma.loan.count({
      where: { status: { in: ["ACTIVE", "OVERDUE"] } },
    });

    // ===============================
    // AGGREGATES (ONLY ACTIVE + OVERDUE)
    // ===============================
    const principalAgg = await this.prisma.loan.aggregate({
      where: {
        status: { in: ["ACTIVE", "OVERDUE"] },
      },
      _sum: { principal: true },
    });

    const outstandingAgg = await this.prisma.loan.aggregate({
      where: {
        status: { in: ["ACTIVE", "OVERDUE"] },
      },
      _sum: { outstanding: true },
    });

    const interestAgg = await this.prisma.loan.aggregate({
      where: {
        status: { in: ["ACTIVE", "OVERDUE"] },
      },
      _sum: { interestAccrued: true },
    });

    // ===============================
    // PAYMENTS
    // ===============================
    const recoveredAgg = await this.prisma.payment.aggregate({
      _sum: { amount: true },
    });

    // ===============================
    // INTEREST EARNED (ACTUAL PAID)
    // ===============================
    const interestEarnedAgg = await this.prisma.payment.aggregate({
      _sum: { interestPaid: true },
    });

    const totalInterestEarned = Number(
      interestEarnedAgg._sum.interestPaid || 0
    );

    // ===============================
    // SAFE NUMBERS
    // ===============================
    const totalOutstanding = Number(outstandingAgg._sum.outstanding || 0);
    const totalPrincipalRaw = Number(principalAgg._sum.principal || 0);
    const totalInterest = Number(interestAgg._sum.interestAccrued || 0);

    // 🔐 principal can NEVER be more than outstanding
    const totalPrincipal = Math.min(totalPrincipalRaw, totalOutstanding);

    // 🔐 interest can NEVER be negative
    const interestPending = Math.max(
      totalOutstanding - totalPrincipal,
      0
    );

    const recoveredAmount = Number(recoveredAgg._sum.amount || 0);

    // ===============================
    // AVERAGE INTEREST RATE
    // ===============================
    const avgRateAgg = await this.prisma.loan.aggregate({
      where: {
        status: { in: ["ACTIVE", "OVERDUE"] },
      },
      _avg: { annualRatePct: true },
    });

    const avgInterestRate = Number(avgRateAgg._avg.annualRatePct || 0);

    const lateFeeAgg = await this.prisma.loan.aggregate({
      _sum: { lateFeeAccrued: true },
    });

    const totalLateFees = Number(lateFeeAgg._sum.lateFeeAccrued || 0);

    // ===============================
    // FINANCIAL METRICS
    // ===============================

    // Net Profit
    const netProfit = totalInterestEarned + totalLateFees;

    // Risk %
    const riskPercentage =
      totalOutstanding > 0
        ? (overdueLoans > 0
          ? (
            Number(
              (
                await this.prisma.loan.aggregate({
                  where: { status: "OVERDUE" },
                  _sum: { outstanding: true },
                })
              )._sum?.outstanding || 0
            ) / totalOutstanding
          ) * 100
          : 0)
        : 0;

    // Recovery %
    const recoveryPercentage =
      totalPrincipalRaw > 0
        ? (recoveredAmount / totalPrincipalRaw) * 100
        : 0;


    const npaCount = await this.prisma.loan.count({
      where: { isNPA: true },
    });

    const npaAgg = await this.prisma.loan.aggregate({
      where: { isNPA: true },
      _sum: { outstanding: true },
    });

    const totalNPAOutstanding = Number(npaAgg._sum.outstanding || 0);
    const npaAnalytics = await this.getNpaAnalytics();
    const runningLoansData = await this.prisma.loan.findMany({
      where: { status: { in: ["ACTIVE", "OVERDUE"] } },
    });

    let totalScore = 0;

    for (const loan of runningLoansData) {
      const scoreData = await this.calculateLoanRiskScore(loan.id);
      totalScore += scoreData.riskScore;
    }

    const portfolioRiskPercent =
      runningLoansData.length > 0
        ? Number((100 - totalScore / runningLoansData.length).toFixed(2))
        : 0;

    const totalDailyInterest = Number(
      runningLoansData
        .reduce((sum, loan) => sum + this.calculateDailyInterestAmount(loan), 0)
        .toFixed(2),
    );

    const lastInterestCalculatedAt = runningLoansData.reduce<Date | null>(
      (latest, loan) => {
        if (!loan.lastAccruedAt) return latest;
        if (!latest || loan.lastAccruedAt > latest) return loan.lastAccruedAt;
        return latest;
      },
      null,
    );


    // ===============================
    // FINAL RESPONSE
    // ===============================
    return {
      totalUsers,
      pendingUsers,
      activeUsers,

      totalLoans,
      activeLoans,
      overdueLoans,
      runningLoans,

      totalPrincipal,
      totalOutstanding,
      totalInterest,
      interestPending,
      totalDailyInterest,
      dailyInterestAccrued: totalDailyInterest,
      lastInterestCalculatedAt,

      recoveredAmount,
      totalInterestEarned,
      avgInterestRate,
      totalLateFees,
      netProfit,
      riskPercentage: Number(riskPercentage.toFixed(2)),
      recoveryPercentage: Number(recoveryPercentage.toFixed(2)),
      npaCount,
      totalNPAOutstanding: Number(totalNPAOutstanding.toFixed(2)),
      ...npaAnalytics,
      portfolioRiskPercent,
    };
  }



  async getLoanAmounts(loanId: string) {
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
    });

    if (!loan) throw new Error("Loan not found");

    return {
      userId: loan.userId,
      principal: loan.principal,
      interestAccrued: loan.interestAccrued,
      outstanding: loan.outstanding,
    };
  }

  // ===============================
  // GET AMORTIZATION SCHEDULE
  // ===============================
  async getAmortizationSchedule(loanId: string) {
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      include: { payments: true },
    });

    if (!loan) throw new BadRequestException('Loan not found');

    const totalPaid = loan.payments.reduce(
      (sum, p) => sum + Number(p.amount),
      0
    );

    const schedule = generateAmortizationSchedule(
      Number(loan.principal),
      Number(loan.annualRatePct),
      loan.termDays,
      totalPaid
    );

    return {
      loanId,
      totalPaid,
      schedule,
    };
  }

  // ===============================
  // AUTO NPA DETECTION
  // ===============================
  async detectAndMarkNPA() {
    const loans = await this.prisma.loan.findMany({
      where: {
        status: "OVERDUE",
        isNPA: false,
      },
    });

    const today = new Date();
    let markedCount = 0;

    for (const loan of loans) {
      if (!loan.dueDate) continue;

      const overdueDays = Math.floor(
        (today.getTime() - new Date(loan.dueDate).getTime()) /
        (1000 * 60 * 60 * 24)
      );

      if (overdueDays >= 90) {
        await this.prisma.loan.update({
          where: { id: loan.id },
          data: {
            isNPA: true,
            npaMarkedAt: today,
          },
        });

        markedCount++;
      }
    }

    return {
      message: "NPA detection completed",
      markedCount,
    };
  }

  async getNpaAnalytics() {
    const today = new Date();

    const npaLoans = await this.prisma.loan.findMany({
      where: { isNPA: true },
    });

    let substandard = 0;
    let doubtful = 0;
    let loss = 0;

    let substandardAmt = 0;
    let doubtfulAmt = 0;
    let lossAmt = 0;

    for (const loan of npaLoans) {
      if (!loan.npaMarkedAt) continue;

      const days = Math.floor(
        (today.getTime() - new Date(loan.npaMarkedAt).getTime()) /
        (1000 * 60 * 60 * 24)
      );

      const outstanding = Number(loan.outstanding);

      if (days >= 90 && days < 180) {
        substandard++;
        substandardAmt += outstanding;
      } else if (days >= 180 && days < 365) {
        doubtful++;
        doubtfulAmt += outstanding;
      } else if (days >= 365) {
        loss++;
        lossAmt += outstanding;
      }
    }

    const provision =
      substandardAmt * 0.15 +
      doubtfulAmt * 0.4 +
      lossAmt * 1;

    return {
      substandard,
      doubtful,
      loss,
      substandardAmt: Number(substandardAmt.toFixed(2)),
      doubtfulAmt: Number(doubtfulAmt.toFixed(2)),
      lossAmt: Number(lossAmt.toFixed(2)),
      totalProvision: Number(provision.toFixed(2)),
    };
  }

  async calculateLoanRiskScore(loanId: string) {
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      include: { payments: true },
    });

    if (!loan) throw new Error("Loan not found");

    let score = 100;
    const today = new Date();

    // Overdue logic
    if (loan.dueDate) {
      const overdueDays = Math.floor(
        (today.getTime() - new Date(loan.dueDate).getTime()) /
        (1000 * 60 * 60 * 24)
      );

      if (overdueDays > 0 && overdueDays < 30) score -= 10;
      else if (overdueDays >= 30 && overdueDays < 90) score -= 25;
      else if (overdueDays >= 90) score -= 50;
    }

    // NPA penalty
    if (loan.isNPA) score -= 70;

    // Late fee penalty
    if (Number(loan.lateFeeAccrued) > 0) score -= 5;

    // Outstanding ratio
    const principal = Number(loan.principal);
    const outstanding = Number(loan.outstanding);

    if (outstanding / (principal + 1) > 1.2) score -= 10;

    return {
      loanId,
      riskScore: Math.max(0, score),
    };
  }
}
