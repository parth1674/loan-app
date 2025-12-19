import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Decimal } from "@prisma/client/runtime/library";

@Injectable()
export class InterestService {
  constructor(private prisma: PrismaService) {}

  async accrueDailyInterest(loanId: string, forDate: Date = new Date()) {
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
    });

    if (!loan || loan.status !== "ACTIVE") return;

    // prevent duplicate interest for same day
    if (
      loan.lastAccruedAt &&
      loan.lastAccruedAt.toDateString() === forDate.toDateString()
    ) {
      return;
    }

    const principal = new Decimal(loan.principal);
    const annualRate = new Decimal(loan.annualRatePct);

    const dailyInterest = principal
      .mul(annualRate)
      .div(100)
      .div(365);

    const newInterestAccrued = new Decimal(loan.interestAccrued).add(
      dailyInterest
    );

    const newOutstanding = principal.add(newInterestAccrued);

    // 🔹 1️⃣ Ledger entry
    await this.prisma.loanLedger.create({
      data: {
        loanId: loan.id,
        date: forDate,
        interestAmount: dailyInterest.toNumber(),
        principalAmount: principal.toNumber(),
        outstandingAfter: newOutstanding.toNumber(),
      },
    });

    // 🔹 2️⃣ Update loan summary
    await this.prisma.loan.update({
      where: { id: loan.id },
      data: {
        interestAccrued: newInterestAccrued,
        outstanding: newOutstanding,
        lastAccruedAt: forDate,
      },
    });
  }
}
