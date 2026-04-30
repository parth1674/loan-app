import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InterestService {
  constructor(private prisma: PrismaService) {}

  private toLedgerDate(value: Date) {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private toNumber(value: unknown) {
    return Number(value || 0);
  }

  async accrueDailyInterest(loanId: string, forDate: Date = new Date()) {
    const calculationDate = this.toLedgerDate(forDate);

    return this.prisma.$transaction(async (tx) => {
      const loan = await tx.loan.findUnique({
        where: { id: loanId },
      });

      if (!loan || !['ACTIVE', 'OVERDUE'].includes(loan.status)) return null;

      const loanStartDate = this.toLedgerDate(loan.startDate);

      // Interest starts from the next day after loan disbursement.
      if (calculationDate <= loanStartDate) return null;

      if (
        loan.lastAccruedAt &&
        this.toLedgerDate(loan.lastAccruedAt).getTime() >=
          calculationDate.getTime()
      ) {
        return null;
      }

      const principal = new Decimal(loan.principal);
      const annualRate = new Decimal(loan.annualRatePct);

      if (principal.lessThanOrEqualTo(0) || annualRate.lessThanOrEqualTo(0)) {
        return null;
      }

      const dailyInterest = principal.mul(annualRate).div(100).div(365);
      const newInterestAccrued = new Decimal(loan.interestAccrued).add(
        dailyInterest,
      );
      const newOutstanding = principal.add(newInterestAccrued);

      try {
        await tx.loanLedger.create({
          data: {
            loanId: loan.id,
            date: calculationDate,
            interestAmount: dailyInterest.toNumber(),
            principalAmount: principal.toNumber(),
            outstandingAfter: newOutstanding.toNumber(),
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          return null;
        }

        throw error;
      }

      return tx.loan.update({
        where: { id: loan.id },
        data: {
          interestAccrued: newInterestAccrued,
          outstanding: newOutstanding,
          lastAccruedAt: calculationDate,
        },
      });
    });
  }

  async accrueDailyInterestForAll(forDate: Date = new Date()) {
    const calculationDate = this.toLedgerDate(forDate);
    const loans = await this.prisma.loan.findMany({
      where: {
        status: { in: ['ACTIVE', 'OVERDUE'] },
        startDate: { lt: calculationDate },
        OR: [{ lastAccruedAt: null }, { lastAccruedAt: { lt: calculationDate } }],
      },
      select: { id: true },
    });

    let appliedCount = 0;

    for (const loan of loans) {
      const updated = await this.accrueDailyInterest(loan.id, calculationDate);
      if (updated) appliedCount++;
    }

    return {
      message: 'Daily interest accrual completed',
      calculationDate,
      eligibleLoans: loans.length,
      appliedCount,
    };
  }

  async getUserInterestSummary(userId: string) {
    const loans = await this.prisma.loan.findMany({
      where: {
        userId,
        status: { in: ['ACTIVE', 'OVERDUE'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    const lastCalculatedAt = loans.reduce<Date | null>((latest, loan) => {
      if (!loan.lastAccruedAt) return latest;
      if (!latest || loan.lastAccruedAt > latest) return loan.lastAccruedAt;
      return latest;
    }, null);

    const loanSummaries = loans.map((loan) => {
      const principal = this.toNumber(loan.principal);
      const annualRate = this.toNumber(loan.annualRatePct);
      const dailyInterest =
        principal > 0 && annualRate > 0 ? (principal * annualRate) / 100 / 365 : 0;
      const interestAccrued = this.toNumber(loan.interestAccrued);

      return {
        loanId: loan.id,
        principal,
        outstanding: this.toNumber(loan.outstanding),
        annualRate,
        dailyRate: Number((annualRate / 365).toFixed(6)),
        dailyInterest: Number(dailyInterest.toFixed(2)),
        interestAccrued: Number(interestAccrued.toFixed(2)),
        interestPending: Number(interestAccrued.toFixed(2)),
        lastCalculatedAt: loan.lastAccruedAt,
      };
    });

    const totalDailyInterest = loanSummaries.reduce(
      (sum, loan) => sum + loan.dailyInterest,
      0,
    );
    const totalInterestAccrued = loanSummaries.reduce(
      (sum, loan) => sum + loan.interestAccrued,
      0,
    );

    return {
      totalDailyInterest: Number(totalDailyInterest.toFixed(2)),
      totalInterestAccrued: Number(totalInterestAccrued.toFixed(2)),
      interestPending: Number(totalInterestAccrued.toFixed(2)),
      lastCalculatedAt,
      loans: loanSummaries,
    };
  }

  async getLoanInterestHistory(loanId: string) {
    const history = await this.prisma.loanLedger.findMany({
      where: { loanId },
      orderBy: { date: 'asc' },
      select: {
        id: true,
        loanId: true,
        date: true,
        interestAmount: true,
        principalAmount: true,
        outstandingAfter: true,
      },
    });

    return {
      history: history.map((row) => ({
        id: row.id,
        loanId: row.loanId,
        calculationDate: row.date.toISOString().slice(0, 10),
        interestAmount: Number(row.interestAmount.toFixed(2)),
        principalAmount: Number(row.principalAmount.toFixed(2)),
        outstandingAfter: Number(row.outstandingAfter.toFixed(2)),
      })),
    };
  }
}
