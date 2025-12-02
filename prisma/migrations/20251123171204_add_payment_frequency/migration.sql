-- CreateEnum
CREATE TYPE "PaymentFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'FLEXIBLE');

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "lastAccruedAt" TIMESTAMP(3),
ADD COLUMN     "nextPaymentDate" TIMESTAMP(3),
ADD COLUMN     "paymentFrequency" "PaymentFrequency" NOT NULL DEFAULT 'MONTHLY';
