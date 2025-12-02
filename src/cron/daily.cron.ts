// src/cron/daily.cron.ts
import * as cron from 'node-cron';
import { LoanService } from '../loan/loan.service';

export function startDailyAccrual(loanService: LoanService) {
  // run every day at 00:05
  cron.schedule('5 0 * * *', async () => {
    try {
      console.log('[cron] daily accrual started');
      await loanService.accrueAllLoans();
      console.log('[cron] daily accrual finished');
    } catch (err) {
      console.error('[cron] daily accrual error', err);
    }
  });
}
