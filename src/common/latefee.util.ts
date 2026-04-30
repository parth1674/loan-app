export function calculateLateFee(missedEmis: number) {
  const lateFeePerEmi = 500;
  return missedEmis * lateFeePerEmi;
}