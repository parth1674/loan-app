// src/interest/interest.cron.ts
import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { InterestService } from "../interest/interest.service";

@Injectable()
export class InterestCron {
  constructor(
    private prisma: PrismaService,
    private interestService: InterestService
  ) {}

  // 🔁 Runs every day at 12:00 AM
  @Cron("0 0 * * *")
  async handleDailyInterest() {
    console.log("⏰ Running daily interest job");

    const loans = await this.prisma.loan.findMany({
      where: { status: "ACTIVE" },
    });

    for (const loan of loans) {
      await this.interestService.accrueDailyInterest(
        loan.id,
        new Date()
      );
    }

    console.log(`✅ Interest applied to ${loans.length} loans`);
  }
}
