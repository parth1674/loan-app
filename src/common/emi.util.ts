export function calculateEMI(
  principal: number,
  annualRate: number,
  termDays: number,
) {
  const months = Math.ceil(termDays / 30);

  if (annualRate === 0) {
    return principal / months;
  }

  const monthlyRate = annualRate / 12 / 100;

  const emi =
    (principal *
      monthlyRate *
      Math.pow(1 + monthlyRate, months)) /
    (Math.pow(1 + monthlyRate, months) - 1);

  return Number(emi.toFixed(2));
}