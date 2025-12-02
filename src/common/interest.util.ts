// src/common/interest.util.ts
export function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

// returns number of full days between two dates (fromDate exclusive -> toDate inclusive handling as used)
export function daysBetweenInclusive(start: Date, end: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  // floor difference to full days
  return Math.floor((end.getTime() - start.getTime()) / msPerDay);
}

/**
 * interestForPeriod(principal, annualRatePct, fromDate, toDate)
 * - fromDate inclusive, toDate exclusive (i.e. accrue up to now)
 * - iterates day-by-day to use correct denom (365/366) per-year as requested.
 */
export function interestForPeriod(principal: number, annualRatePct: number, fromDate: Date, toDate: Date) {
  if (!fromDate || !toDate) return 0;
  const start = new Date(fromDate);
  const end = new Date(toDate);
  if (end <= start) return 0;

  let total = 0;
  const cursor = new Date(start);
  while (cursor < end) {
    const denom = isLeapYear(cursor.getFullYear()) ? 366 : 365;
    total += (principal * (annualRatePct / 100)) / denom;
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.round(total * 100) / 100; // round to 2 decimals
}
