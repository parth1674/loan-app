// src/loan/loan.helpers.ts
import { PaymentFrequency } from '@prisma/client';
import { addDays, addMonths } from 'date-fns';

export function getNextPaymentDate(from: Date, freq: PaymentFrequency): Date | null {
  if (!from) return null;
  switch (freq) {
    case PaymentFrequency.DAILY:
      return addDays(from, 1);
    case PaymentFrequency.WEEKLY:
      return addDays(from, 7);
    case PaymentFrequency.MONTHLY:
      return addMonths(from, 1);
    case PaymentFrequency.QUARTERLY:
      return addMonths(from, 3);
    case PaymentFrequency.HALF_YEARLY:
      return addMonths(from, 6);
    case PaymentFrequency.YEARLY:
      return addMonths(from, 12);
    case PaymentFrequency.FLEXIBLE:
      return null;
    default:
      return addMonths(from, 1);
  }
}
