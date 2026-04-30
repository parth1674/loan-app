export interface AmortizationRow {
  month: number;
  emi: number;
  interest: number;
  principal: number;
  remainingBalance: number;
}

export function generateAmortizationSchedule(
  principal: number,
  annualRate: number,
  termDays: number,
  totalPaid: number
) {
  const months = Math.ceil(termDays / 30);
  const monthlyRate = annualRate / 12 / 100;

  let balance = principal;
  let remainingPaid = totalPaid;

  const schedule = [];

  const emi =
    annualRate === 0
      ? principal / months
      : (principal *
          monthlyRate *
          Math.pow(1 + monthlyRate, months)) /
        (Math.pow(1 + monthlyRate, months) - 1);

  for (let month = 1; month <= months; month++) {
    const interest = balance * monthlyRate;
    const principalComponent = emi - interest;

    balance -= principalComponent;
    if (balance < 0) balance = 0;

    let status = "PENDING";

    if (remainingPaid >= emi) {
      status = "PAID";
      remainingPaid -= emi;
    } else if (remainingPaid > 0) {
      status = "PARTIAL";
      remainingPaid = 0;
    }

    schedule.push({
      month,
      emi: Number(emi.toFixed(2)),
      interest: Number(interest.toFixed(2)),
      principal: Number(principalComponent.toFixed(2)),
      remainingBalance: Number(balance.toFixed(2)),
      status,
    });
  }

  return schedule;
}