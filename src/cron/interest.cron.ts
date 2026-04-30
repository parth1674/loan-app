import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InterestService } from '../interest/interest.service';
import { LoanService } from '../loan/loan.service';

@Injectable()
export class InterestCron {
  private readonly logger = new Logger(InterestCron.name);

  constructor(
    private interestService: InterestService,
    private loanService: LoanService,
  ) {}

  // Runs every day at 00:05 server time.
  @Cron('5 0 * * *')
  async handleDailyInterest() {
    this.logger.log('Daily loan maintenance job started');

    try {
      const result = await this.interestService.accrueDailyInterestForAll(
        new Date(),
      );

      await this.loanService.applyLateFees();
      await this.loanService.detectAndMarkNPA();

      this.logger.log(
        `Daily loan maintenance job finished. Interest applied to ${result.appliedCount}/${result.eligibleLoans} eligible loans.`,
      );
    } catch (error) {
      this.logger.error('Daily loan maintenance job failed', error as Error);
    }
  }
}
